import { existsSync } from "node:fs";
import { appendFile, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
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
}

export async function loadConfig(): Promise<Config> {
  return existsSync(CONFIG) ? JSON.parse(await readFile(CONFIG, "utf8")) : {};
}

export async function saveConfig(config: Config) {
  await mkdir(HOME, { recursive: true });
  // holds API keys: owner-only
  await writeFile(CONFIG, JSON.stringify(config, null, 2) + "\n", { mode: 0o600 });
}

/** `provider`, `model`, `mode` or `<provider>.<apiKey|baseUrl|model>` */
export function setConfigValue(config: Config, key: string, value: string): Config {
  const [head, field] = key.split(".");
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
}

export const newSessionId = () => new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14) + "-" + Math.random().toString(36).slice(2, 6);

export async function saveSession(s: Session) {
  await mkdir(SESSIONS, { recursive: true });
  await writeFile(path.join(SESSIONS, `${s.id}.json`), JSON.stringify({ ...s, updatedAt: new Date().toISOString() }), {
    mode: 0o600,
  });
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

export async function remember(scope: "project" | "global", root: string, note: string) {
  const file = memoryFile(scope, root);
  await mkdir(path.dirname(file), { recursive: true });
  await appendFile(file, `- ${note.replace(/\n+/g, " ").trim()}\n`);
  return file;
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
