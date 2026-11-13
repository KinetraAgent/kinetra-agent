import { execFileSync } from "node:child_process";
import os from "node:os";
import { complete, type Msg, type Provider, type ToolCall } from "./providers.ts";
import { loadContext, type Mode, type Session } from "./store.ts";
import type { Approval, Tool } from "./tools.ts";

const MAX_STEPS = 50;

export type Answer = "yes" | "no" | "always";

export interface AgentIO {
  text(delta: string): void;
  busy(on: boolean): void;
  toolStart(name: string, summary: string): void;
  toolEnd(name: string, result: string, isError: boolean): void;
  approve(name: string, kind: Exclude<Approval, null>, preview: string): Promise<Answer>;
  notice(msg: string): void;
}

export interface AgentState {
  root: string;
  session: Session;
  provider: Provider;
  mode: Mode;
  tools: Tool[];
  /** tools the user allowed for the rest of this session */
  allowed: Set<string>;
}

export async function systemPrompt(root: string): Promise<string> {
  const ctx = await loadContext(root);
  let branch = "";
  try {
    branch = execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd: root, stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
  } catch {}
  return [
    "You are KINETRA, an autonomous execution agent in the user's terminal. You turn the user's intent into finished work with your tools: reading and editing files, searching code, running commands and reviewing git changes.",
    `How to work:
- Stay inside the project directory. Read a file before editing it; use edit_file for small changes and write_file for new files.
- Verify your work with the project's tests or build when that is cheap and relevant.
- File changes and commands may need the user's approval. If one is declined, adapt or ask instead of retrying it.
- Before committing, call git_diff and summarize the changes.
- Save lasting facts about the project or the user's preferences with remember.
- Keep replies short. When you finish, say what changed and anything the user still has to do.`,
    `Environment: ${os.type()} ${os.release()}, shell ${process.env.SHELL ?? process.env.ComSpec ?? "sh"}, project ${root}${branch ? `, git branch ${branch}` : ""}, date ${new Date().toISOString().slice(0, 10)}`,
    ctx.instructions && `# Project instructions (KINETRA.md)\n${ctx.instructions}`,
    ctx.projectMemory && `# Project memory (.kinetra/memory.md)\n${ctx.projectMemory}`,
    ctx.globalMemory && `# What you remember about this user (~/.kinetra/memory.md)\n${ctx.globalMemory}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

// shortcut: drops old tool output by size only; upgrade to summarization when sessions outgrow it
export function trimHistory(messages: Msg[], budget = 400_000): Msg[] {
  let total = messages.reduce((n, m) => n + m.content.length, 0);
  return messages.map((m) => {
    if (total <= budget || m.role !== "tool" || m.content.length < 2000) return m;
    total -= m.content.length;
    return { ...m, content: "[older output removed to save context]" };
  });
}

const needsAsk = (s: AgentState, kind: Approval, name: string) =>
  !!kind && s.mode !== "auto" && !(s.mode === "edits" && kind === "edit") && !s.allowed.has(name);

const summarize = (args: any) => String(args?.command ?? args?.path ?? args?.pattern ?? args?.note ?? "").split("\n")[0].slice(0, 120);

async function runCall(s: AgentState, call: ToolCall, io: AgentIO, signal?: AbortSignal) {
  const fail = (content: string) => ({ content, isError: true });
  const tool = s.tools.find((t) => t.name === call.name);
  if (!tool) return fail(`unknown tool ${call.name}`);
  if (signal?.aborted) return fail("cancelled by the user");

  let args: any;
  try {
    args = JSON.parse(call.args || "{}");
  } catch {
    return fail("arguments were not valid JSON; send the call again");
  }
  const missing = (tool.parameters.required ?? []).filter((k) => args[k] === undefined);
  if (missing.length) return fail(`missing required argument: ${missing.join(", ")}`);

  const ctx = { root: s.root, signal };
  try {
    const kind = tool.approval?.(args) ?? null;
    if (kind && needsAsk(s, kind, tool.name)) {
      const answer = await io.approve(tool.name, kind, (await tool.preview?.(args, ctx)) ?? summarize(args));
      if (answer === "no") return fail("the user declined this action");
      if (answer === "always") s.allowed.add(tool.name);
    }
    io.toolStart(tool.name, summarize(args));
    const content = await tool.run(args, ctx);
    io.toolEnd(tool.name, content, false);
    return { content, isError: false };
  } catch (e) {
    const content = (e as Error).message;
    io.toolEnd(tool.name, content, true);
    return fail(content);
  }
}

/** Runs one user instruction to completion: model → tools → model … until the model answers. */
export async function runTurn(s: AgentState, input: string, io: AgentIO, signal?: AbortSignal) {
  const { session } = s;
  session.messages.push({ role: "user", content: input });
  session.title ||= input.slice(0, 80);
  const system = await systemPrompt(s.root);

  for (let step = 0; step < MAX_STEPS; step++) {
    io.busy(true);
    const reply = await complete(s.provider, {
      system,
      messages: s.provider.kind === "openai" ? trimHistory(session.messages) : session.messages,
      tools: s.tools,
      signal,
      onText: (d) => {
        io.busy(false);
        io.text(d);
      },
    }).finally(() => io.busy(false));

    if (reply.stop === "refusal" || reply.stop === "length") {
      // a cut-off turn may hold half-written tool calls: keep the text, never run them
      session.messages.push({ role: "assistant", content: reply.text || "(stopped)" });
      io.notice(reply.stop === "refusal" ? "The model declined this request." : "The reply hit the output limit.");
      return;
    }
    session.messages.push({ role: "assistant", content: reply.text, calls: reply.calls, anthropic: reply.anthropic });
    if (!reply.calls.length) return;

    // every call gets a result, even after Ctrl+C, so the history stays valid
    for (const call of reply.calls) {
      const r = await runCall(s, call, io, signal);
      session.messages.push({ role: "tool", callId: call.id, name: call.name, content: r.content, isError: r.isError });
    }
    if (signal?.aborted) return;
  }
  io.notice(`Paused after ${MAX_STEPS} steps. Say "continue" to keep going.`);
}
