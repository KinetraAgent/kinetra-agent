import { spawn } from "node:child_process";
import { existsSync, openSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { HOME, type Mode } from "./store.ts";

// Workflows: Markdown prompts in .kinetra/workflows (project) or ~/.kinetra/workflows (global).
// A line with only --- splits a workflow into steps that run one after another in the same session.

const workflowDirs = (root: string) => [
  { scope: "project", dir: path.join(root, ".kinetra", "workflows") },
  { scope: "global", dir: path.join(HOME, "workflows") },
];

export const workflowSteps = (text: string) =>
  text
    .split(/^---[ \t]*$/m)
    .map((s) => s.trim())
    .filter(Boolean);

export async function listWorkflows(root: string) {
  const out: { name: string; scope: string; file: string; steps: number }[] = [];
  for (const { scope, dir } of workflowDirs(root)) {
    if (!existsSync(dir)) continue;
    for (const f of (await readdir(dir)).filter((f) => f.endsWith(".md")).sort()) {
      const name = f.slice(0, -3);
      if (out.some((w) => w.name === name)) continue; // project shadows global
      const file = path.join(dir, f);
      out.push({ name, scope, file, steps: workflowSteps(await readFile(file, "utf8")).length });
    }
  }
  return out;
}

/** Steps of a workflow; the project's copy wins over the global one. */
export async function loadWorkflow(root: string, name: string): Promise<string[]> {
  if (!/^[\w.-]+$/.test(name)) throw new Error(`invalid workflow name ${name}`);
  for (const { dir } of workflowDirs(root)) {
    const file = path.join(dir, `${name}.md`);
    if (existsSync(file)) {
      const steps = workflowSteps(await readFile(file, "utf8"));
      if (!steps.length) throw new Error(`${file} is empty`);
      return steps;
    }
  }
  throw new Error(`no workflow ${name}. Create .kinetra/workflows/${name}.md or ~/.kinetra/workflows/${name}.md`);
}

// Cron: minute hour day-of-month month day-of-week, with *, lists, ranges and /steps. Local time.

const FIELDS: [number, number][] = [
  [0, 59],
  [0, 23],
  [1, 31],
  [1, 12],
  [0, 7],
];

function fieldMatches(spec: string, value: number, [min, max]: [number, number]): boolean {
  return spec.split(",").some((part) => {
    const [range, stepText] = part.split("/");
    const step = stepText === undefined ? 1 : Number(stepText);
    let [lo, hi] = range === "*" ? [min, max] : range.split("-").map(Number);
    if (hi === undefined) hi = stepText === undefined ? lo : max;
    if (!range || ![lo, hi, step].every(Number.isInteger) || lo < min || hi > max || lo > hi || step < 1) {
      throw new Error(`bad cron field "${spec}"`);
    }
    return value >= lo && value <= hi && (value - lo) % step === 0;
  });
}

export function cronMatches(expr: string, d: Date): boolean {
  const f = expr.trim().split(/\s+/);
  if (f.length !== 5) throw new Error(`cron "${expr}" needs 5 fields: minute hour day month weekday`);
  const m = (i: number, v: number) => fieldMatches(f[i], v, FIELDS[i]);
  const dom = m(2, d.getDate());
  const dow = m(4, d.getDay()) || (d.getDay() === 0 && m(4, 7)); // 0 and 7 are both Sunday
  // classic cron: when both day fields are restricted, either one matching is enough
  const day = f[2] !== "*" && f[4] !== "*" ? dom || dow : dom && dow;
  return m(0, d.getMinutes()) && m(1, d.getHours()) && m(3, d.getMonth() + 1) && day;
}

// Schedules: run a workflow in a folder on a cron, while `kinetra schedule daemon` is running.

export interface Schedule {
  id: string;
  cron: string;
  workflow: string;
  cwd: string;
  mode: Mode;
}

const SCHEDULES = path.join(HOME, "schedules.json");
export const LOGS = path.join(HOME, "logs");

export async function loadSchedules(): Promise<Schedule[]> {
  return existsSync(SCHEDULES) ? JSON.parse(await readFile(SCHEDULES, "utf8")) : [];
}

export async function saveSchedules(list: Schedule[]) {
  await mkdir(HOME, { recursive: true });
  await writeFile(SCHEDULES, JSON.stringify(list, null, 2) + "\n", { mode: 0o600 });
}

/** Checks the schedules every minute and starts due workflows as `kinetra run`, logging to ~/.kinetra/logs/<id>.log. */
export async function runDaemon(cli: string, log: (msg: string) => void) {
  await mkdir(LOGS, { recursive: true });
  const running = new Set<string>();
  log(`watching ${SCHEDULES}`);
  while (true) {
    const now = new Date();
    for (const s of await loadSchedules().catch(() => [])) {
      try {
        if (!cronMatches(s.cron, now)) continue;
      } catch (e) {
        log(`${s.id}: ${(e as Error).message}`);
        continue;
      }
      if (running.has(s.id)) {
        log(`${s.id}: previous run still going, skipped`);
        continue;
      }
      const out = openSync(path.join(LOGS, `${s.id}.log`), "a");
      const child = spawn(process.execPath, [cli, "run", s.workflow, "--mode", s.mode], { cwd: s.cwd, stdio: ["ignore", out, out] });
      running.add(s.id);
      log(`${s.id}: started ${s.workflow} in ${s.cwd}`);
      child.on("error", (e) => log(`${s.id}: ${e.message}`));
      child.on("close", (code) => {
        running.delete(s.id);
        log(`${s.id}: finished with exit ${code}`);
      });
    }
    // wake just after the next minute starts
    await sleep(60_000 - (Date.now() % 60_000) + 500);
  }
}
