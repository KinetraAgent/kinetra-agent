#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import readline from "node:readline/promises";
import { parseArgs } from "node:util";
import { runTurn, type AgentIO, type AgentState, type Answer } from "./agent.ts";
import { PROVIDERS, resolveProvider, type Provider } from "./providers.ts";
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
} from "./store.ts";
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
  kinetra config [set <key> <value> | get <key>]

${c.bold("Options")}
  -m, --mode <ask|edits|auto>  ask: approve edits and commands (default)
                               edits: edits run, commands ask
                               auto: everything runs
  --provider <name>            ${Object.keys(PROVIDERS).join(", ")} or your own
  --model <id>                 model for this run

${c.bold("Config keys")}
  provider, mode, <provider>.apiKey, <provider>.model, <provider>.baseUrl
  e.g. kinetra config set openrouter.apiKey sk-or-...
       kinetra config set lmstudio.baseUrl http://localhost:1234/v1`;

const SLASH = `  /model [id]       show or switch model
  /provider [name]  show or switch provider
  /mode [mode]      ask | edits | auto
  /diff             git changes in this project
  /memory           show memory
  /tools            list tools
  /clear            start a fresh session
  /exit             quit`;

const root = process.cwd();

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
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
    case "tools": {
      const tools = await loadTools();
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

  session ??= {
    id: newSessionId(),
    cwd: root,
    title: "",
    provider: provider.name,
    model: provider.model,
    createdAt: new Date().toISOString(),
    updatedAt: "",
    messages: [],
  };
  const state: AgentState = { root, session, provider, mode, tools: await loadTools(), allowed: new Set() };

  if (!rl) {
    const task = values.print || (await readStdin());
    await runTurn(state, task, printIO(state));
    process.stdout.write("\n");
    return saveSession(sessionOf(state));
  }
  return repl(rl, state, config);
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
  const masked = JSON.stringify(config, (k, v) => (k === "apiKey" && v ? v.slice(0, 6) + "…" : v), 2);
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

async function memoryCommand() {
  const ctx = await loadContext(root);
  console.log(`${c.bold("project")} ${c.dim(memoryFile("project", root))}\n${ctx.projectMemory || c.dim("(empty)")}\n`);
  console.log(`${c.bold("global")} ${c.dim(memoryFile("global", root))}\n${ctx.globalMemory || c.dim("(empty)")}`);
}

main().catch((e) => {
  console.error(c.red(`kinetra: ${e.message}`));
  process.exit(1);
});
