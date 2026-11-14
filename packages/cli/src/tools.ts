import { execFile, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { loadMcpTools } from "./mcp.ts";
import { HOME, listSessions, loadContext, remember, type Config } from "./store.ts";

export interface ToolContext {
  root: string;
  signal?: AbortSignal;
  /** Runs a task in a sub-agent with a fresh context and returns its final answer. */
  delegate?(task: string, role?: string): Promise<string>;
}

export type Approval = "edit" | "exec" | null;

export interface Tool {
  name: string;
  description: string;
  parameters: { type: "object"; properties: Record<string, unknown>; required?: string[] };
  /** Which approval this call needs; null runs without asking. */
  approval?(args: any): Approval;
  /** Shown to the user before they approve. */
  preview?(args: any, ctx: ToolContext): Promise<string> | string;
  run(args: any, ctx: ToolContext): Promise<string> | string;
}

const SKIP_DIRS = new Set([".git", "node_modules", "dist", "build", ".next", ".turbo", "coverage", "artifacts", "cache"]);
const MAX_OUTPUT = 30_000;

// shortcut: lexical check only, symlinks inside the root can still point outside; add realpath if that matters
export function resolveInside(root: string, p = "."): string {
  const target = path.resolve(root, p);
  const rel = path.relative(root, target);
  if (rel === ".." || rel.startsWith(".." + path.sep) || path.isAbsolute(rel)) {
    throw new Error(`${p} is outside the project directory`);
  }
  return target;
}

const READ_ONLY = /^(ls|pwd|cat|head|tail|wc|echo|which|whoami|date|tree|git (status|diff|log|show))(\s|$)/;
/** Commands that cannot change anything run without asking. */
export const isReadOnlyCommand = (cmd = "") =>
  READ_ONLY.test(cmd.trim()) && !/[;&|`$<>(){}\n\\]|--output/.test(cmd);

const clip = (s: string, max = MAX_OUTPUT) => (s.length > max ? s.slice(0, max) + `\n… clipped ${s.length - max} chars` : s);

/** Changed region between two texts, as -/+ lines. */
export function diffPreview(before: string, after: string, max = 60): string {
  const a = before === "" ? [] : before.split("\n");
  const b = after.split("\n");
  let s = 0;
  while (s < a.length && s < b.length && a[s] === b[s]) s++;
  let e = 0;
  while (e < a.length - s && e < b.length - s && a[a.length - 1 - e] === b[b.length - 1 - e]) e++;
  const out = [
    `@@ line ${s + 1}`,
    ...a.slice(s, a.length - e).map((l) => "- " + l),
    ...b.slice(s, b.length - e).map((l) => "+ " + l),
  ];
  return out.length > max ? [...out.slice(0, max), `… ${out.length - max} more lines`].join("\n") : out.join("\n");
}

/** Applies an edit_file call, throwing when old_string is missing or ambiguous. */
export function applyEdit(text: string, oldString: string, newString: string, replaceAll = false): string {
  const count = oldString ? text.split(oldString).length - 1 : 0;
  if (count === 0) throw new Error("old_string not found; read the file and copy the exact text");
  if (count > 1 && !replaceAll) throw new Error(`old_string matches ${count} times; add surrounding context or set replace_all`);
  return replaceAll ? text.split(oldString).join(newString) : text.replace(oldString, () => newString);
}

/** `*`, `**` and `?` glob to a RegExp over forward-slash paths. */
export function globToRegExp(glob: string): RegExp {
  const src = glob
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*\/?/g, "\u0000")
    .replace(/\*/g, "[^/]*")
    .replace(/\?/g, "[^/]")
    .replace(/\u0000/g, "(?:.*/)?");
  return new RegExp(`^${src}$`);
}

async function* walk(dir: string, root: string): AsyncGenerator<string> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) yield* walk(path.join(dir, entry.name), root);
    } else if (entry.isFile()) yield path.join(dir, entry.name);
  }
}

const git = (args: string[], cwd: string) =>
  new Promise<string>((resolve) =>
    execFile("git", args, { cwd, maxBuffer: 20_000_000 }, (err, stdout, stderr) =>
      resolve(err && !stdout ? `git ${args[0]} failed: ${stderr || err.message}` : stdout),
    ),
  );

export const BUILTIN_TOOLS: Tool[] = [
  {
    name: "read_file",
    description: "Read a text file inside the project. Returns numbered lines.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Path relative to the project root" },
        offset: { type: "integer", description: "First line to read, 1-based" },
        limit: { type: "integer", description: "Number of lines, default 2000" },
      },
      required: ["path"],
    },
    async run({ path: p, offset = 1, limit = 2000 }, { root }) {
      const lines = (await readFile(resolveInside(root, p), "utf8")).split("\n");
      const start = Math.max(1, offset);
      const body = lines
        .slice(start - 1, start - 1 + limit)
        .map((l, i) => `${String(start + i).padStart(5)}  ${l}`)
        .join("\n");
      const rest = lines.length - (start - 1 + limit);
      return clip(rest > 0 ? `${body}\n… ${rest} more lines` : body);
    },
  },
  {
    name: "write_file",
    description: "Create a file or replace its whole content. Prefer edit_file for small changes.",
    parameters: {
      type: "object",
      properties: { path: { type: "string" }, content: { type: "string" } },
      required: ["path", "content"],
    },
    approval: () => "edit",
    async preview({ path: p, content }, { root }) {
      const target = resolveInside(root, p);
      return diffPreview(existsSync(target) ? await readFile(target, "utf8") : "", content);
    },
    async run({ path: p, content }, { root }) {
      const target = resolveInside(root, p);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, content);
      return `wrote ${p} (${content.split("\n").length} lines)`;
    },
  },
  {
    name: "edit_file",
    description: "Replace an exact, unique snippet of a file. Include enough context to make old_string unique.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string" },
        old_string: { type: "string" },
        new_string: { type: "string" },
        replace_all: { type: "boolean" },
      },
      required: ["path", "old_string", "new_string"],
    },
    approval: () => "edit",
    async preview({ path: p, old_string, new_string, replace_all }, { root }) {
      const text = await readFile(resolveInside(root, p), "utf8");
      return diffPreview(text, applyEdit(text, old_string, new_string, replace_all));
    },
    async run({ path: p, old_string, new_string, replace_all }, { root }) {
      const target = resolveInside(root, p);
      await writeFile(target, applyEdit(await readFile(target, "utf8"), old_string, new_string, replace_all));
      return `edited ${p}`;
    },
  },
  {
    name: "list_dir",
    description: "List files and folders. Folders end with /.",
    parameters: {
      type: "object",
      properties: { path: { type: "string" }, depth: { type: "integer", description: "1-3, default 1" } },
    },
    async run({ path: p = ".", depth = 1 }, { root }) {
      const out: string[] = [];
      const visit = async (dir: string, level: number) => {
        for (const e of (await readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
          if (out.length >= 500) return;
          const rel = path.relative(root, path.join(dir, e.name));
          out.push(e.isDirectory() ? rel + "/" : rel);
          if (e.isDirectory() && level < Math.min(depth, 3) && !SKIP_DIRS.has(e.name)) await visit(path.join(dir, e.name), level + 1);
        }
      };
      await visit(resolveInside(root, p), 1);
      return out.join("\n") || "(empty)";
    },
  },
  {
    name: "search_files",
    description: "Search file contents with a regular expression. Returns file:line: text.",
    parameters: {
      type: "object",
      properties: {
        pattern: { type: "string", description: "JavaScript regular expression" },
        path: { type: "string", description: "Folder to search, default project root" },
        glob: { type: "string", description: "Only files matching this glob, e.g. src/**/*.ts" },
        ignore_case: { type: "boolean" },
      },
      required: ["pattern"],
    },
    async run({ pattern, path: p = ".", glob, ignore_case }, { root }) {
      const re = new RegExp(pattern, ignore_case ? "i" : "");
      const only = glob ? globToRegExp(glob) : null;
      const hits: string[] = [];
      for await (const file of walk(resolveInside(root, p), root)) {
        const rel = path.relative(root, file).split(path.sep).join("/");
        if (only && !only.test(rel)) continue;
        if ((await stat(file)).size > 1_000_000) continue;
        const text = await readFile(file, "utf8");
        if (text.includes("\u0000")) continue; // binary
        text.split("\n").forEach((line, i) => {
          if (hits.length < 200 && re.test(line)) hits.push(`${rel}:${i + 1}: ${line.trim().slice(0, 200)}`);
        });
        if (hits.length >= 200) break;
      }
      return hits.join("\n") || "no matches";
    },
  },
  {
    name: "run_command",
    description: "Run a shell command in the project root and return its exit code and output.",
    parameters: {
      type: "object",
      properties: {
        command: { type: "string" },
        timeout_seconds: { type: "integer", description: "Default 120, max 600" },
      },
      required: ["command"],
    },
    approval: ({ command }) => (isReadOnlyCommand(command) ? null : "exec"),
    preview: ({ command }) => `$ ${command}`,
    run({ command, timeout_seconds = 120 }, { root, signal }) {
      return new Promise((resolve) => {
        const child = spawn(command, {
          cwd: root,
          shell: true,
          signal,
          timeout: Math.min(timeout_seconds, 600) * 1000,
        });
        let out = "";
        child.stdout.on("data", (d) => (out += d));
        child.stderr.on("data", (d) => (out += d));
        child.on("error", (e) => resolve(`failed: ${e.message}\n${clip(out)}`));
        child.on("close", (code, sig) => resolve(`exit ${code ?? sig}\n${clip(out.length > MAX_OUTPUT ? out.slice(-MAX_OUTPUT) : out)}`));
      });
    },
  },
  {
    name: "git_diff",
    description: "Show uncommitted git changes. Use before committing so the user can review them.",
    parameters: {
      type: "object",
      properties: { staged: { type: "boolean" }, path: { type: "string" } },
    },
    async run({ staged, path: p }, { root }) {
      const flags = ["diff", "--no-color", ...(staged ? ["--staged"] : [])];
      const scope = p ? ["--", resolveInside(root, p)] : [];
      const stat = await git([...flags, "--stat", ...scope], root);
      const diff = await git([...flags, ...scope], root);
      return diff.trim() ? clip(`${stat}\n${diff}`) : "no changes";
    },
  },
  {
    name: "remember",
    description:
      "Save a durable fact to memory: project scope for this codebase, global scope for the user's preferences. Memory is loaded in every future session.",
    parameters: {
      type: "object",
      properties: {
        note: { type: "string" },
        scope: { type: "string", enum: ["project", "global"] },
        topic: { type: "string", description: "Section to file it under, e.g. build, style, architecture" },
      },
      required: ["note"],
    },
    async run({ note, scope = "project", topic }, { root }) {
      return `saved to ${await remember(scope, root, note, topic)}`;
    },
  },
  {
    name: "recall",
    description:
      "Search memory and earlier sessions in this project for something the user or you said before. Use it when the user refers to past work or a decision you do not see in context.",
    parameters: {
      type: "object",
      properties: { query: { type: "string", description: "Words to look for" } },
      required: ["query"],
    },
    async run({ query }, { root }) {
      return recall(query, root);
    },
  },
  {
    name: "fetch_url",
    description: "Fetch a web page or API over HTTP GET and return it as text, HTML reduced to readable text.",
    parameters: {
      type: "object",
      properties: { url: { type: "string" } },
      required: ["url"],
    },
    // the URL itself can carry data out of the project
    approval: () => "exec",
    preview: ({ url }) => `GET ${url}`,
    async run({ url }, { signal }) {
      if (!/^https?:\/\//.test(url)) throw new Error("only http and https URLs");
      const res = await fetch(url, { signal: AbortSignal.any([AbortSignal.timeout(30_000), ...(signal ? [signal] : [])]) });
      const type = res.headers.get("content-type") ?? "";
      const body = await res.text();
      return clip(`HTTP ${res.status} ${type}\n${type.includes("html") ? htmlToText(body) : body}`);
    },
  },
  {
    name: "github",
    description:
      "Call the GitHub REST API, e.g. GET /repos/{repo}/pulls, POST /repos/{repo}/issues. {repo} is this project's origin remote. Uses GITHUB_TOKEN or the gh CLI login.",
    parameters: {
      type: "object",
      properties: {
        method: { type: "string", enum: ["GET", "POST", "PATCH", "PUT", "DELETE"] },
        path: { type: "string", description: "API path starting with /" },
        body: { type: "object", description: "JSON body for POST, PATCH and PUT" },
      },
      required: ["path"],
    },
    approval: ({ method = "GET" }) => (method === "GET" ? null : "exec"),
    preview: ({ method = "GET", path: p, body }) => `${method} ${p}${body ? "\n" + JSON.stringify(body, null, 2) : ""}`,
    async run({ method = "GET", path: p, body }, { root, signal }) {
      if (!p.startsWith("/") || p.startsWith("//")) throw new Error("path must start with /, e.g. /repos/{repo}/pulls");
      const target = p.includes("{repo}") ? p.replaceAll("{repo}", await githubRepo(root)) : p;
      const res = await fetch(`https://api.github.com${target}`, {
        method,
        signal,
        headers: {
          accept: "application/vnd.github+json",
          authorization: `Bearer ${await githubToken()}`,
          "x-github-api-version": "2022-11-28",
          ...(body ? { "content-type": "application/json" } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      const text = await res.text();
      if (!res.ok) throw new Error(`GitHub ${res.status}: ${text.slice(0, 1000)}`);
      return clip(text || `HTTP ${res.status}`);
    },
  },
  {
    name: "delegate",
    description:
      "Hand a self-contained subtask to a sub-agent with its own fresh context and the same tools, e.g. research across many files or a separate change. Give it everything it needs; it returns only its final answer. Optional role makes it a specialist, e.g. reviewer or test writer.",
    parameters: {
      type: "object",
      properties: { task: { type: "string" }, role: { type: "string" } },
      required: ["task"],
    },
    async run({ task, role }, { delegate }) {
      if (!delegate) throw new Error("sub-agents cannot delegate further");
      return delegate(task, role);
    },
  },
];

export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, "")
    .replace(/<(br|\/p|\/div|\/li|\/h\d|\/tr)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n\n")
    .trim();
}

/** Memory lines and past messages in this project that contain any query word, best matches first. */
export async function recall(query: string, root: string): Promise<string> {
  const words = query.toLowerCase().split(/\W+/).filter((w) => w.length > 1);
  if (!words.length) return "query has no words";
  const score = (text: string) => words.filter((w) => text.toLowerCase().includes(w)).length;
  const hits: { score: number; text: string }[] = [];
  const ctx = await loadContext(root);
  for (const [where, text] of [["project memory", ctx.projectMemory], ["global memory", ctx.globalMemory]]) {
    for (const line of text.split("\n")) if (score(line)) hits.push({ score: score(line) + 1, text: `${where}: ${line.trim()}` });
  }
  for (const s of await listSessions(root)) {
    for (const m of s.messages) {
      if (m.role === "tool" || !m.content) continue;
      const n = score(m.content);
      if (n) hits.push({ score: n, text: `session ${s.id} (${s.updatedAt.slice(0, 10)}) ${m.role}: ${m.content.slice(0, 400)}` });
    }
  }
  hits.sort((a, b) => b.score - a.score);
  return hits.slice(0, 30).map((h) => h.text).join("\n") || "nothing found";
}

const capture = (cmd: string, args: string[], cwd?: string) =>
  new Promise<string>((resolve, reject) =>
    execFile(cmd, args, { cwd }, (err, stdout) => (err ? reject(err) : resolve(stdout.trim()))),
  );

async function githubToken() {
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || (await capture("gh", ["auth", "token"]).catch(() => ""));
  if (!token) throw new Error("no GitHub token. Export GITHUB_TOKEN or run gh auth login");
  return token;
}

/** owner/repo of the origin remote. */
export async function githubRepo(root: string) {
  const url = await capture("git", ["remote", "get-url", "origin"], root).catch(() => "");
  const m = url.match(/github\.com[:/]([^/]+\/[^/]+?)(\.git)?$/);
  if (!m) throw new Error("this project has no GitHub origin remote; use /repos/<owner>/<repo>/… instead");
  return m[1];
}

/** Built-in tools, the user's own tools in ~/.kinetra/tools/*.mjs and the tools of configured MCP servers. */
export async function loadTools(onWarn: (msg: string) => void = console.error, config: Config = {}, version = ""): Promise<Tool[]> {
  const tools = [...BUILTIN_TOOLS];
  const dir = path.join(HOME, "tools");
  for (const tool of await loadMcpTools(config.mcpServers, version, onWarn)) {
    if (tools.some((t) => t.name === tool.name)) onWarn(`skipped MCP tool ${tool.name}: name taken`);
    else tools.push(tool);
  }
  if (!existsSync(dir)) return tools;
  for (const file of (await readdir(dir)).filter((f) => /\.m?js$/.test(f))) {
    try {
      const tool: Tool = (await import(pathToFileURL(path.join(dir, file)).href)).default;
      if (!tool?.name || typeof tool.run !== "function") throw new Error("default export must be { name, description, parameters, run }");
      if (!/^[a-zA-Z0-9_-]{1,64}$/.test(tool.name)) throw new Error(`invalid name ${tool.name}`);
      if (tools.some((t) => t.name === tool.name)) throw new Error(`${tool.name} already exists`);
      // extensions ask before every call unless they declare otherwise
      tools.push({ approval: () => "exec", ...tool, parameters: tool.parameters ?? { type: "object", properties: {} } });
    } catch (e) {
      onWarn(`skipped tool ${file}: ${(e as Error).message}`);
    }
  }
  return tools;
}
