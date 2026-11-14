import { spawn, type ChildProcess } from "node:child_process";
import type { Config } from "./store.ts";
import type { Tool } from "./tools.ts";

export type McpServer = NonNullable<Config["mcpServers"]>[string];

/** Ready-made servers for `kinetra mcp add <name>` without a command. */
export const MCP_PRESETS: Record<string, McpServer> = {
  browser: { command: "npx", args: ["-y", "@playwright/mcp@latest", "--headless"] },
  github: { command: "npx", args: ["-y", "@modelcontextprotocol/server-github"] },
  fetch: { command: "uvx", args: ["mcp-server-fetch"] },
};

const children = new Set<ChildProcess>();
process.on("exit", () => children.forEach((c) => c.kill()));

/** Stops every MCP server this process started. */
export function closeMcp() {
  children.forEach((c) => c.kill());
  children.clear();
}

/** A JSON-RPC 2.0 connection over newline-delimited stdio, the MCP stdio transport. */
class Connection {
  private id = 0;
  private pending = new Map<number, { resolve(v: any): void; reject(e: Error): void }>();
  private stderr = "";
  private child: ChildProcess;

  constructor(child: ChildProcess) {
    this.child = child;
    let buf = "";
    child.stdout!.setEncoding("utf8").on("data", (d: string) => {
      buf += d;
      let nl: number;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (line) this.receive(line);
      }
    });
    child.stderr!.setEncoding("utf8").on("data", (d: string) => (this.stderr = (this.stderr + d).slice(-2000)));
    const fail = (why: string) => {
      for (const p of this.pending.values()) p.reject(new Error(`${why}${this.stderr ? `: ${this.stderr.trim()}` : ""}`));
      this.pending.clear();
    };
    child.on("error", (e) => fail(e.message));
    child.on("exit", (code) => fail(`server exited with ${code}`));
  }

  private receive(line: string) {
    let msg: any;
    try {
      msg = JSON.parse(line);
    } catch {
      return; // servers may log to stdout
    }
    if (msg.method) {
      // server-to-client requests: answer ping, refuse the rest
      if (msg.id !== undefined) {
        this.send(msg.method === "ping" ? { id: msg.id, result: {} } : { id: msg.id, error: { code: -32601, message: "not supported" } });
      }
      return;
    }
    const p = this.pending.get(msg.id);
    if (!p) return;
    this.pending.delete(msg.id);
    if (msg.error) p.reject(new Error(msg.error.message ?? JSON.stringify(msg.error)));
    else p.resolve(msg.result);
  }

  private send(msg: object) {
    this.child.stdin!.write(JSON.stringify({ jsonrpc: "2.0", ...msg }) + "\n");
  }

  request(method: string, params: object, timeoutMs: number, signal?: AbortSignal): Promise<any> {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      const done = () => {
        clearTimeout(timer);
        signal?.removeEventListener("abort", abort);
        this.pending.delete(id);
      };
      const abort = () => {
        done();
        this.send({ method: "notifications/cancelled", params: { requestId: id } });
        reject(new Error("cancelled by the user"));
      };
      const timer = setTimeout(() => {
        done();
        reject(new Error(`${method} timed out after ${timeoutMs / 1000}s`));
      }, timeoutMs);
      signal?.addEventListener("abort", abort);
      this.pending.set(id, {
        resolve: (v) => (done(), resolve(v)),
        reject: (e) => (done(), reject(e)),
      });
      this.send({ id, method, params });
    });
  }

  notify(method: string) {
    this.send({ method });
  }
}

/** MCP tool name → KINETRA tool name: `<server>__<tool>`, limited to what model APIs accept. */
export const mcpToolName = (server: string, tool: string) => `${server}__${tool}`.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64);

/** Text of a tools/call result; images and other blocks are named, not inlined. */
export function mcpText(result: any): string {
  const parts = (result?.content ?? []).map((b: any) =>
    b.type === "text" ? b.text : b.type === "resource" ? (b.resource?.text ?? b.resource?.uri) : `[${b.type}]`,
  );
  if (result?.structuredContent && !parts.length) parts.push(JSON.stringify(result.structuredContent));
  return parts.join("\n") || "(no output)";
}

async function connect(name: string, server: McpServer, version: string): Promise<Tool[]> {
  const child = spawn(server.command, server.args ?? [], {
    env: { ...process.env, ...server.env },
    stdio: ["pipe", "pipe", "pipe"],
    shell: process.platform === "win32", // npx is npx.cmd there
  });
  children.add(child);
  const rpc = new Connection(child);
  await rpc.request(
    "initialize",
    { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "kinetra", version } },
    // first run of an npx server downloads it
    120_000,
  );
  rpc.notify("notifications/initialized");

  const listed: any[] = [];
  let cursor: string | undefined;
  do {
    const page = await rpc.request("tools/list", cursor ? { cursor } : {}, 30_000);
    listed.push(...(page.tools ?? []));
    cursor = page.nextCursor;
  } while (cursor);

  return listed.map((t) => ({
    name: mcpToolName(name, t.name),
    description: `[${name}] ${t.description ?? t.name}`.slice(0, 1024),
    parameters: { ...t.inputSchema, type: "object", properties: t.inputSchema?.properties ?? {} },
    // a server can do anything its process can: ask unless it says the tool is read-only
    approval: () => (t.annotations?.readOnlyHint ? null : "exec"),
    preview: (args) => `${name}.${t.name} ${JSON.stringify(args)}`.slice(0, 2000),
    async run(args, { signal }) {
      const result = await rpc.request("tools/call", { name: t.name, arguments: args }, 600_000, signal);
      const text = mcpText(result);
      if (result?.isError) throw new Error(text);
      return text;
    },
  }));
}

/** Starts every configured server; one that fails is skipped with a warning. */
export async function loadMcpTools(servers: Config["mcpServers"] = {}, version: string, onWarn: (msg: string) => void): Promise<Tool[]> {
  const loaded = await Promise.all(
    Object.entries(servers).map(([name, server]) =>
      connect(name, server, version).catch((e) => {
        onWarn(`skipped MCP server ${name}: ${(e as Error).message}`);
        return [];
      }),
    ),
  );
  return loaded.flat();
}
