import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import type { Msg } from "./providers.ts";

export const HOME = process.env.KINETRA_HOME ?? path.join(homedir(), ".kinetra");
const CONFIG = path.join(HOME, "config.json");
const SESSIONS = path.join(HOME, "sessions");

export type Mode = "ask" | "edits" | "auto";
export const MODES: Mode[] = ["ask", "edits", "auto"];

export interface Config {
  provider?: string;
  model?: string;
  mode?: Mode;
  providers?: Record<string, { apiKey?: string; baseUrl?: string; model?: string }>;
  /** MCP servers started over stdio, by name */
  mcpServers?: Record<string, { command: string; args?: string[]; env?: Record<string, string> }>;
  telegram?: { botToken?: string; allow?: number[] };
}

export async function loadConfig(): Promise<Config> {
  return existsSync(CONFIG) ? JSON.parse(await readFile(CONFIG, "utf8")) : {};
}

export async function saveConfig(config: Config) {
  await mkdir(HOME, { recursive: true });
  // holds API keys: owner-only
  await writeFile(CONFIG, JSON.stringify(config, null, 2) + "\n", { mode: 0o600 });
}

/** `provider`, `model`, `mode`, `telegram.<botToken|allow>` or `<provider>.<apiKey|baseUrl|model>` */
export function setConfigValue(config: Config, key: string, value: string): Config {
  const [head, field] = key.split(".");
  if (head === "telegram") {
    if (field === "botToken") return { ...config, telegram: { ...config.telegram, botToken: value } };
    if (field !== "allow") throw new Error(`unknown key ${key}`);
    const allow = value.split(",").filter(Boolean).map(Number);
    if (allow.some((id) => !Number.isSafeInteger(id))) throw new Error("telegram.allow is a comma-separated list of chat ids");
    return { ...config, telegram: { ...config.telegram, allow } };
  }
  if (!field) {
    if (!["provider", "model", "mode"].includes(head)) throw new Error(`unknown key ${key}`);
    if (head === "mode" && !MODES.includes(value as Mode)) throw new Error(`mode must be one of ${MODES.join(", ")}`);
    return { ...config, [head]: value };
  }
  if (!["apiKey", "baseUrl", "model"].includes(field)) throw new Error(`unknown key ${key}`);
  const providers = { ...config.providers, [head]: { ...config.providers?.[head], [field]: value } };
  return { ...config, providers };
}

export interface Session {
  id: string;
  cwd: string;
  title: string;
  provider: string;
  model: string;
  createdAt: string;
  updatedAt: string;
  messages: Msg[];
  /** tokens and model requests spent in this session */
  usage?: Usage;
}

export interface Usage {
  input: number;
  output: number;
  requests: number;
}

export function addUsage(s: Session, u: { input: number; output: number }) {
  s.usage ??= { input: 0, output: 0, requests: 0 };
  s.usage.input += u.input;
  s.usage.output += u.output;
  s.usage.requests++;
}

/** Totals per day and per provider/model, newest day first. */
export function usageReport(sessions: Session[]) {
  const total = { sessions: 0, requests: 0, input: 0, output: 0, toolCalls: 0, toolErrors: 0 };
  const byDay = new Map<string, typeof total>();
  const byModel = new Map<string, typeof total>();
  const bump = (map: Map<string, typeof total>, key: string, s: Session, calls: number, errors: number) => {
    const row = map.get(key) ?? { sessions: 0, requests: 0, input: 0, output: 0, toolCalls: 0, toolErrors: 0 };
    row.sessions++;
    row.requests += s.usage?.requests ?? 0;
    row.input += s.usage?.input ?? 0;
    row.output += s.usage?.output ?? 0;
    row.toolCalls += calls;
    row.toolErrors += errors;
    map.set(key, row);
  };
  for (const s of sessions) {
    const tools = s.messages.filter((m) => m.role === "tool");
    const errors = tools.filter((m) => m.role === "tool" && m.isError).length;
    bump(byDay, (s.updatedAt || s.createdAt).slice(0, 10), s, tools.length, errors);
    bump(byModel, `${s.provider}/${s.model}`, s, tools.length, errors);
  }
  for (const row of byModel.values()) for (const k of Object.keys(total) as (keyof typeof total)[]) total[k] += row[k];
  return {
    total,
    byDay: [...byDay].sort(([a], [b]) => b.localeCompare(a)),
    byModel: [...byModel].sort(([, a], [, b]) => b.input + b.output - (a.input + a.output)),
  };
}

export const newSessionId = () => new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14) + "-" + Math.random().toString(36).slice(2, 6);

export async function saveSession(s: Session) {
  await mkdir(SESSIONS, { recursive: true });
  await writeFile(path.join(SESSIONS, `${s.id}.json`), JSON.stringify({ ...s, updatedAt: new Date().toISOString() }), {
    mode: 0o600,
  });
}

export async function deleteSession(id: string) {
  await rm(path.join(SESSIONS, `${path.basename(id)}.json`), { force: true });
}

export async function loadSession(id: string): Promise<Session> {
  const file = path.join(SESSIONS, `${path.basename(id)}.json`);
  if (!existsSync(file)) throw new Error(`no session ${id}`);
  return JSON.parse(await readFile(file, "utf8"));
}

/** Newest first. */
export async function listSessions(cwd?: string): Promise<Session[]> {
  if (!existsSync(SESSIONS)) return [];
  const files = (await readdir(SESSIONS)).filter((f) => f.endsWith(".json")).sort().reverse();
  const sessions = await Promise.all(files.map(async (f) => JSON.parse(await readFile(path.join(SESSIONS, f), "utf8"))));
  return cwd ? sessions.filter((s) => s.cwd === cwd) : sessions;
}

export const memoryFile = (scope: "project" | "global", root: string) =>
  scope === "global" ? path.join(HOME, "memory.md") : path.join(root, ".kinetra", "memory.md");

/** Appends a note, under a `## topic` heading when one is given, so memory stays grouped by subject. */
export async function remember(scope: "project" | "global", root: string, note: string, topic?: string) {
  const file = memoryFile(scope, root);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, addNote(await readIf(file), note, topic) + "\n");
  return file;
}

export function addNote(text: string, note: string, topic?: string): string {
  const line = `- ${note.replace(/\n+/g, " ").trim()}`;
  const heading = topic && `## ${topic.replace(/\n+/g, " ").trim()}`;
  if (!heading) return text ? `${text}\n${line}` : line;
  const lines = text ? text.split("\n") : [];
  const at = lines.indexOf(heading);
  if (at < 0) return [...lines, ...(lines.length ? [""] : []), heading, line].join("\n");
  let end = at + 1;
  while (end < lines.length && !lines[end].startsWith("## ")) end++;
  while (end > at + 1 && !lines[end - 1].trim()) end--;
  lines.splice(end, 0, line);
  return lines.join("\n");
}

const readIf = async (file: string) => (existsSync(file) ? (await readFile(file, "utf8")).trim() : "");

/** KINETRA.md project instructions plus both memory files, for the system prompt. */
export async function loadContext(root: string) {
  return {
    instructions: await readIf(path.join(root, "KINETRA.md")),
    globalMemory: await readIf(memoryFile("global", root)),
    projectMemory: await readIf(memoryFile("project", root)),
  };
}
