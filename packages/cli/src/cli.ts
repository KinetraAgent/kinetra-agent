#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import readline from "node:readline/promises";
import { parseArgs } from "node:util";
import { runTurn, type AgentIO, type AgentState, type Answer } from "./agent.ts";
import { cronMatches, listWorkflows, loadSchedules, loadWorkflow, LOGS, runDaemon, saveSchedules } from "./automation.ts";
import { startDashboard } from "./dashboard.ts";
import { closeMcp, MCP_PRESETS } from "./mcp.ts";
import { PROVIDERS, resolveProvider, type Provider } from "./providers.ts";
import { installTool } from "./registry.ts";
import {
  listSessions,
  loadConfig,
  loadContext,
  loadSession,
  memoryFile,
  MODES,
  newSessionId,
  saveConfig,
  saveSession,
  setConfigValue,
  type Config,
  type Mode,
  type Session,
  usageReport,
} from "./store.ts";
import { runTelegram } from "./telegram.ts";
import { loadTools } from "./tools.ts";
import { banner, c, colorDiff, Spinner } from "./ui.ts";

const VERSION: string = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version;

const HELP = `${c.bold("kinetra")} ${c.dim("v" + VERSION)}: the terminal agent that turns intent into execution

${c.bold("Usage")}
  kinetra                      start a session in this folder
  kinetra -p "task"            run one task, print the answer, exit
  kinetra -c                   continue the latest session in this folder
  kinetra -r <id>              resume a session by id
  kinetra sessions             list saved sessions
  kinetra init                 create KINETRA.md project instructions
  kinetra memory               show what KINETRA remembers
  kinetra tools [--json]       list available tools
  kinetra tools add <name>     install a community tool from KinetraToolRegistry
  kinetra config [set <key> <value> | get <key>]

${c.bold("Relay")}
  kinetra run <workflow> [text]   run .kinetra/workflows/<workflow>.md, steps split by ---
  kinetra workflows               list workflows for this folder
  kinetra schedule add "<cron>" <workflow>   run a workflow here on a cron
  kinetra schedule [list | rm <id> | daemon] the daemon runs due schedules
  kinetra mcp [list | add <name> [-- <command> [args]] | rm <name>]
                                  connect MCP servers; presets: ${Object.keys(MCP_PRESETS).join(", ")}
  kinetra telegram                answer allowed Telegram chats from this folder
  kinetra dashboard [--port n]    sessions, usage and automation at http://127.0.0.1:7777
  kinetra usage                   tokens, requests and tool calls by model and day

${c.bold("Options")}
  -m, --mode <ask|edits|auto>  ask: approve edits and commands (default)
                               edits: edits run, commands ask
                               auto: everything runs
  --provider <name>            ${Object.keys(PROVIDERS).join(", ")} or your own
  --model <id>                 model for this run

${c.bold("Config keys")}
  provider, mode, <provider>.apiKey, <provider>.model, <provider>.baseUrl,
  telegram.botToken, telegram.allow (comma-separated chat ids)
  e.g. kinetra config set openrouter.apiKey sk-or-...
       kinetra config set lmstudio.baseUrl http://localhost:1234/v1`;

const SLASH = `  /model [id]       show or switch model
  /provider [name]  show or switch provider
  /mode [mode]      ask | edits | auto
  /diff             git changes in this project
  /run <workflow>   run a workflow in this session
  /usage            tokens spent in this session
  /memory           show memory
  /tools            list tools
  /clear            start a fresh session
  /exit             quit`;

const root = process.cwd();

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      port: { type: "string" },
      unverified: { type: "boolean" },
      print: { type: "string", short: "p" },
      continue: { type: "boolean", short: "c" },
      resume: { type: "string", short: "r" },
      mode: { type: "string", short: "m" },
      provider: { type: "string" },
      model: { type: "string" },
      json: { type: "boolean" },
      help: { type: "boolean", short: "h" },
      version: { type: "boolean", short: "v" },
    },
  });
  if (values.version) return console.log(VERSION);
  if (values.help || positionals[0] === "help") return console.log(HELP);

  const config = await loadConfig();
  const [cmd, ...rest] = positionals;
  switch (cmd) {
    case "config":
      return configCommand(config, rest);
    case "sessions":
      return sessionsCommand();
    case "init":
      return initCommand();
    case "memory":
      return memoryCommand();
    case "usage":
      return usageCommand();
    case "workflows":
      return workflowsCommand();
    case "schedule":
      return scheduleCommand(config, values.mode, rest);
    case "mcp":
      return mcpCommand(config, rest);
    case "dashboard": {
      const { url } = await startDashboard(root, Number(values.port ?? 7777), VERSION);
      return console.log(`dashboard on ${c.cyan(url)} ${c.dim("· Ctrl+C stops it")}`);
    }
    case "run":
    case "telegram":
      break;
    case "tools": {
      if (rest[0] === "add") {
        if (!rest[1]) throw new Error("usage: kinetra tools add <name> [--unverified]");
        const file = await installTool(rest[1], VERSION, !!values.unverified, (m) => console.log(c.dim(m)));
        return console.log(`installed ${c.cyan(rest[1])} to ${file}`);
      }
      const tools = await loadTools(console.error, config, VERSION);
      closeMcp();
      if (values.json) {
        const manifest = tools.map(({ name, description, parameters, approval }) => ({
          name,
          description,
          parameters,
          approval: approval?.({}) ?? "none",
        }));
        return console.log(JSON.stringify(manifest, null, 2));
      }
      return tools.forEach((t) => console.log(`${c.cyan(t.name.padEnd(14))} ${t.description}`));
    }
    case undefined:
      break;
    default:
      throw new Error(`unknown command ${cmd}. Try kinetra --help`);
  }

  const mode = (values.mode ?? config.mode ?? "ask") as Mode;
  if (!MODES.includes(mode)) throw new Error(`mode must be one of ${MODES.join(", ")}`);

  if (cmd === "run") {
    const [name, ...extra] = rest;
    if (!name) throw new Error("usage: kinetra run <workflow> [extra instructions]");
    const steps = await loadWorkflow(root, name);
    const provider = needProvider(config, values);
    const state: AgentState = { root, session: newSession(provider), provider, mode, tools: await loadTools(console.error, config, VERSION), allowed: new Set() };
    state.session.title = `workflow ${name}`;
    try {
      await runWorkflow(state, steps, extra.join(" "), printIO(state));
    } finally {
      process.stdout.write("\n");
      await saveSession(sessionOf(state));
      closeMcp();
    }
    return;
  }
  if (cmd === "telegram") {
    const token = process.env.TELEGRAM_BOT_TOKEN ?? config.telegram?.botToken;
    if (!token) throw new Error("no bot token. Create a bot with @BotFather, then: kinetra config set telegram.botToken <token>");
    const provider = needProvider(config, values);
    const tools = await loadTools(console.error, config, VERSION);
    console.log(c.dim(`project ${root} · ${provider.name}/${provider.model} · mode ${mode}`));
    return runTelegram(
      token,
      config.telegram?.allow ?? [],
      () => ({ root, session: newSession(provider), provider, mode, tools, allowed: new Set() }),
      (m) => console.log(`${c.dim(new Date().toISOString().slice(11, 19))} ${m}`),
    );
  }

  let session: Session | undefined;
  if (values.resume) session = await loadSession(values.resume);
  if (values.continue) session = (await listSessions(root))[0];

  const interactive = values.print === undefined;
  const rl = interactive ? readline.createInterface({ input: process.stdin, output: process.stdout }) : undefined;
  let provider = resolveProvider(config, { provider: values.provider ?? session?.provider, model: values.model ?? session?.model });
  if (!provider) {
    if (!rl) throw new Error("no model provider configured. Run kinetra once, or export ANTHROPIC_API_KEY / OPENAI_API_KEY");
    provider = await onboard(rl, config);
  }

  session ??= newSession(provider);
  const state: AgentState = { root, session, provider, mode, tools: await loadTools(console.error, config, VERSION), allowed: new Set() };

  if (!rl) {
    const task = values.print || (await readStdin());
    await runTurn(state, task, printIO(state));
    process.stdout.write("\n");
    closeMcp();
    return saveSession(sessionOf(state));
  }
  return repl(rl, state, config);
}

const newSession = (provider: Provider): Session => ({
  id: newSessionId(),
  cwd: root,
  title: "",
  provider: provider.name,
  model: provider.model,
  createdAt: new Date().toISOString(),
  updatedAt: "",
  messages: [],
});

function needProvider(config: Config, values: { provider?: string; model?: string }) {
  const provider = resolveProvider(config, { provider: values.provider, model: values.model });
  if (!provider) throw new Error("no model provider configured. Run kinetra once, or export ANTHROPIC_API_KEY / OPENAI_API_KEY");
  return provider;
}

/** Runs each step as a turn in one session; extra text from the user goes with the first step. */
async function runWorkflow(s: AgentState, steps: string[], extra: string, io: AgentIO, signal?: AbortSignal) {
  for (const [i, step] of steps.entries()) {
    if (steps.length > 1) io.notice(`step ${i + 1}/${steps.length}`);
    await runTurn(s, i === 0 && extra ? `${step}\n\n${extra}` : step, io, signal);
    if (signal?.aborted) return;
  }
}

const sessionOf = (s: AgentState): Session => ({ ...s.session, provider: s.provider.name, model: s.provider.model });

async function readStdin() {
  let data = "";
  for await (const chunk of process.stdin) data += chunk;
  if (!data.trim()) throw new Error('nothing to do. Usage: kinetra -p "task"');
  return data;
}

async function onboard(rl: readline.Interface, config: Config): Promise<Provider> {
  console.log(`\n  ${c.bold("Connect a model.")} KINETRA runs on your own API key; it stays in ~/.kinetra/config.json.`);
  console.log(`  ${c.dim("providers:")} ${Object.keys(PROVIDERS).join(", ")}\n`);
  const name = (await rl.question(`  provider ${c.dim("(anthropic)")}: `)).trim() || "anthropic";
  let next = setConfigValue(config, "provider", name);
  if (PROVIDERS[name]?.env) {
    const key = (await rl.question(`  ${PROVIDERS[name].env}: `)).trim();
    if (!key) throw new Error(`no key given. Export ${PROVIDERS[name].env} and run kinetra again`);
    next = setConfigValue(next, `${name}.apiKey`, key);
  } else if (!PROVIDERS[name]) {
    next = setConfigValue(next, `${name}.baseUrl`, (await rl.question("  base URL (OpenAI-compatible): ")).trim());
    next = setConfigValue(next, `${name}.model`, (await rl.question("  model: ")).trim());
  }
  await saveConfig(next);
  Object.assign(config, next);
  return resolveProvider(config)!;
}

function printIO(s: AgentState): AgentIO {
  return {
    text: (d) => process.stdout.write(d),
    busy: () => {},
    toolStart: (name, summary) => console.error(c.dim(`⚡ ${name} ${summary}`)),
    toolEnd: (_name, result, isError) => isError && console.error(c.red(`  ✗ ${result.split("\n")[0]}`)),
    approve: async (name) => {
      console.error(c.yellow(`  ${name} needs approval; rerun with --mode ${s.mode === "ask" ? "edits or --mode auto" : "auto"} to allow it`));
      return "no";
    },
    notice: (msg) => console.error(c.yellow(msg)),
  };
}

function replIO(rl: readline.Interface): AgentIO {
  const spinner = new Spinner();
  let lineStart = true;
  const out = (s: string) => {
    if (!s) return;
    process.stdout.write(s);
    lineStart = s.endsWith("\n");
  };
  const line = (s: string) => out((lineStart ? "" : "\n") + s + "\n");
  return {
    text: out,
    busy: (on) => (on ? spinner.start() : spinner.stop()),
    toolStart: (name, summary) => line(c.cyan(`  ⚡ ${name}`) + c.dim(` ${summary}`)),
    toolEnd: (_name, result, isError) => {
      const first = result.split("\n")[0].slice(0, 100);
      line(isError ? c.red(`    ✗ ${first}`) : c.dim(`    ↳ ${first}`));
    },
    async approve(name, kind, preview) {
      line(`\n  ${c.yellow("◆")} ${c.bold(name)} ${c.dim(kind === "edit" ? "wants to change a file" : "wants to run")}`);
      line(colorDiff(preview).replace(/^/gm, "    "));
      const a = (await rl.question(`  allow? ${c.dim("[y]es [n]o [a]lways this session")} `)).trim().toLowerCase();
      lineStart = true;
      return (a === "a" ? "always" : a === "y" || a === "yes" ? "yes" : "no") as Answer;
    },
    notice: (msg) => line(c.yellow(`  ${msg}`)),
  };
}

async function repl(rl: readline.Interface, s: AgentState, config: Config) {
  console.log(banner(VERSION, s.provider.name, s.provider.model, s.mode));
  const ctx = await loadContext(root);
  if (!ctx.instructions) console.log(c.dim("  tip: kinetra init adds KINETRA.md with instructions for this project\n"));
  if (s.session.messages.length) console.log(c.dim(`  resumed "${s.session.title}" (${s.session.messages.length} messages)\n`));

  const io = replIO(rl);
  let turn: AbortController | undefined;
  rl.on("SIGINT", () => {
    if (turn) return turn.abort();
    rl.close();
    process.exit(0);
  });

  while (true) {
    const input = (await rl.question(c.cyan("› "))).trim();
    if (!input) continue;
    if (input.startsWith("/")) {
      if (input.startsWith("/run ")) {
        turn = new AbortController();
        try {
          await runWorkflow(s, await loadWorkflow(root, input.slice(5).trim()), "", io, turn.signal);
        } catch (e) {
          console.log(turn.signal.aborted ? c.yellow("\n  interrupted\n") : c.red(`\n  ${(e as Error).message}\n`));
        } finally {
          turn = undefined;
          await saveSession(sessionOf(s));
        }
        continue;
      }
      if (await slash(input, s, config)) continue;
      return rl.close();
    }
    turn = new AbortController();
    const started = Date.now();
    const before = s.session.messages.length;
    try {
      await runTurn(s, input, io, turn.signal);
      const actions = s.session.messages.slice(before).filter((m) => m.role === "tool").length;
      console.log(c.dim(`\n  ✓ ${actions ? `${actions} action${actions > 1 ? "s" : ""} · ` : ""}${((Date.now() - started) / 1000).toFixed(1)}s\n`));
    } catch (e) {
      console.log(turn.signal.aborted ? c.yellow("\n  interrupted\n") : c.red(`\n  ${(e as Error).message}\n`));
    } finally {
      turn = undefined;
      await saveSession(sessionOf(s));
    }
  }
}

/** Returns false when the REPL should exit. */
async function slash(input: string, s: AgentState, config: Config): Promise<boolean> {
  const [cmd, arg] = input.slice(1).split(/\s+/, 2);
  switch (cmd) {
    case "exit":
    case "quit":
      return false;
    case "help":
      console.log(SLASH);
      break;
    case "model":
      if (arg) {
        s.provider = { ...s.provider, model: arg };
        await saveConfig(Object.assign(config, setConfigValue(config, `${s.provider.name}.model`, arg)));
      }
      console.log(`  model ${c.cyan(s.provider.model)}`);
      break;
    case "provider":
      if (arg) {
        s.provider = resolveProvider(config, { provider: arg })!;
        await saveConfig(Object.assign(config, setConfigValue(config, "provider", arg)));
      }
      console.log(`  provider ${c.cyan(s.provider.name)} ${c.dim(s.provider.model)}`);
      break;
    case "mode":
      if (arg && !MODES.includes(arg as Mode)) console.log(c.red(`  mode must be one of ${MODES.join(", ")}`));
      else if (arg) s.mode = arg as Mode;
      console.log(`  mode ${c.cyan(s.mode)}`);
      break;
    case "diff":
      try {
        const diff = execFileSync("git", ["diff", "--stat", "--patch"], { cwd: root, encoding: "utf8" });
        console.log(diff.trim() ? colorDiff(diff.replace(/^\+(?!\+\+)/gm, "+ ").replace(/^-(?!--)/gm, "- ")) : c.dim("  no changes"));
      } catch {
        console.log(c.red("  not a git repository"));
      }
      break;
    case "memory":
      await memoryCommand();
      break;
    case "usage": {
      const u = s.session.usage;
      console.log(u ? `  ${fmt(u.input)} in · ${fmt(u.output)} out · ${u.requests} requests` : c.dim("  no usage yet"));
      break;
    }
    case "tools":
      s.tools.forEach((t) => console.log(`  ${c.cyan(t.name.padEnd(14))} ${c.dim(t.description)}`));
      break;
    case "clear":
      s.session = { ...s.session, id: newSessionId(), title: "", createdAt: new Date().toISOString(), messages: [] };
      s.allowed.clear();
      console.log(c.dim("  fresh session"));
      break;
    default:
      console.log(SLASH);
  }
  return true;
}

async function configCommand(config: Config, [action, key, value]: string[]) {
  const masked = JSON.stringify(config, (k, v) => ((k === "apiKey" || k === "botToken") && v ? v.slice(0, 6) + "…" : v), 2);
  if (!action || action === "list") return console.log(masked);
  if (action === "get") return console.log(key.split(".").reduce<any>((o, k) => o?.[k], config) ?? "");
  if (action === "set" && key && value !== undefined) {
    await saveConfig(setConfigValue(config, key, value));
    return console.log(`${key} saved`);
  }
  throw new Error("usage: kinetra config [list | get <key> | set <key> <value>]");
}

async function sessionsCommand() {
  const sessions = (await listSessions()).slice(0, 20);
  if (!sessions.length) return console.log("no sessions yet");
  for (const s of sessions) {
    console.log(`${c.cyan(s.id)}  ${s.updatedAt.slice(0, 16).replace("T", " ")}  ${c.dim(s.cwd)}\n  ${s.title}`);
  }
}

function initCommand() {
  if (existsSync("KINETRA.md")) return console.log("KINETRA.md already exists");
  writeFileSync(
    "KINETRA.md",
    `# Project instructions for KINETRA

## What this project is
<!-- one or two lines -->

## Commands
- build:
- test:

## Rules
- <!-- conventions KINETRA must follow here -->
`,
  );
  console.log("created KINETRA.md; KINETRA reads it at the start of every turn");
}

const fmt = (n: number) => Intl.NumberFormat("en", { notation: "compact" }).format(n);

async function usageCommand() {
  const { total, byModel, byDay } = usageReport(await listSessions());
  if (!total.sessions) return console.log("no sessions yet");
  const row = (label: string, r: typeof total) =>
    `${label.padEnd(40)} ${String(r.sessions).padStart(8)} ${String(r.requests).padStart(9)} ${fmt(r.input).padStart(9)} ${fmt(r.output).padStart(9)} ${String(r.toolCalls).padStart(7)}`;
  console.log(c.dim(`${"".padEnd(40)} ${"sessions".padStart(8)} ${"requests".padStart(9)} ${"input".padStart(9)} ${"output".padStart(9)} ${"tools".padStart(7)}`));
  console.log(c.bold(row("total", total)));
  console.log(c.bold("\nby model"));
  byModel.forEach(([m, r]) => console.log(row(m.slice(0, 40), r)));
  console.log(c.bold("\nlast 14 days"));
  byDay.slice(0, 14).forEach(([d, r]) => console.log(row(d, r)));
}

async function workflowsCommand() {
  const list = await listWorkflows(root);
  if (!list.length) return console.log("no workflows. Create .kinetra/workflows/<name>.md; split steps with a line of ---");
  for (const w of list) console.log(`${c.cyan(w.name.padEnd(20))} ${w.steps} step${w.steps > 1 ? "s" : ""} ${c.dim(`${w.scope} · ${w.file}`)}`);
}

async function scheduleCommand(config: Config, mode: string | undefined, [action = "list", ...args]: string[]) {
  const list = await loadSchedules();
  if (action === "list") {
    if (!list.length) return console.log('no schedules. kinetra schedule add "0 9 * * 1-5" <workflow>');
    return list.forEach((s) => console.log(`${c.cyan(s.id)}  ${s.cron.padEnd(16)} ${s.workflow.padEnd(16)} ${s.mode.padEnd(6)} ${c.dim(s.cwd)}`));
  }
  if (action === "add") {
    const [cron, workflow] = args;
    if (!cron || !workflow) throw new Error('usage: kinetra schedule add "<min hour day month weekday>" <workflow> [--mode edits]');
    cronMatches(cron, new Date()); // throws on a bad expression
    await loadWorkflow(root, workflow);
    const m = (mode ?? config.mode ?? "ask") as Mode;
    if (!MODES.includes(m)) throw new Error(`mode must be one of ${MODES.join(", ")}`);
    const id = `${workflow}-${Math.random().toString(36).slice(2, 6)}`;
    await saveSchedules([...list, { id, cron, workflow, cwd: root, mode: m }]);
    console.log(`scheduled ${c.cyan(id)}: ${workflow} at "${cron}" in ${root}, mode ${m}`);
    if (m === "ask") console.log(c.yellow("  nobody is there to approve: edits and commands will be declined. Use --mode edits or --mode auto"));
    return console.log(c.dim("  schedules run while kinetra schedule daemon is running"));
  }
  if (action === "rm") {
    if (!list.some((s) => s.id === args[0])) throw new Error(`no schedule ${args[0]}`);
    await saveSchedules(list.filter((s) => s.id !== args[0]));
    return console.log(`removed ${args[0]}`);
  }
  if (action === "daemon") {
    console.log(c.dim(`logs in ${LOGS}`));
    return runDaemon(process.argv[1], (m) => console.log(`${c.dim(new Date().toISOString().slice(0, 19).replace("T", " "))} ${m}`));
  }
  throw new Error("usage: kinetra schedule [list | add <cron> <workflow> | rm <id> | daemon]");
}

async function mcpCommand(config: Config, [action = "list", name, ...rest]: string[]) {
  const servers = config.mcpServers ?? {};
  if (action === "list") {
    if (!Object.keys(servers).length) return console.log(`no MCP servers. kinetra mcp add <${Object.keys(MCP_PRESETS).join("|")}>`);
    return Object.entries(servers).forEach(([n, s]) => console.log(`${c.cyan(n.padEnd(14))} ${[s.command, ...(s.args ?? [])].join(" ")}`));
  }
  if (action === "add") {
    if (!name || !/^[\w-]{1,32}$/.test(name)) throw new Error("usage: kinetra mcp add <name> [-- <command> [args]]");
    const [command, ...args] = rest;
    const server = command ? { command, args } : MCP_PRESETS[name];
    if (!server) throw new Error(`no preset ${name}. Give the command: kinetra mcp add ${name} -- <command> [args]`);
    await saveConfig({ ...config, mcpServers: { ...servers, [name]: server } });
    return console.log(`added ${c.cyan(name)}: ${[server.command, ...(server.args ?? [])].join(" ")}${name === "github" && !command ? c.dim("\n  set GITHUB_PERSONAL_ACCESS_TOKEN in your environment") : ""}`);
  }
  if (action === "rm") {
    if (!servers[name]) throw new Error(`no MCP server ${name}`);
    const { [name]: _, ...keep } = servers;
    await saveConfig({ ...config, mcpServers: keep });
    return console.log(`removed ${name}`);
  }
  throw new Error("usage: kinetra mcp [list | add <name> [-- <command> [args]] | rm <name>]");
}

async function memoryCommand() {
  const ctx = await loadContext(root);
  console.log(`${c.bold("project")} ${c.dim(memoryFile("project", root))}\n${ctx.projectMemory || c.dim("(empty)")}\n`);
  console.log(`${c.bold("global")} ${c.dim(memoryFile("global", root))}\n${ctx.globalMemory || c.dim("(empty)")}`);
}

main().catch((e) => {
  console.error(c.red(`kinetra: ${e.message}`));
  process.exit(1);
});
