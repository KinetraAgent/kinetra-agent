import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

process.env.KINETRA_HOME = mkdtempSync(path.join(tmpdir(), "kinetra-home-"));

const { applyEdit, diffPreview, globToRegExp, isReadOnlyCommand, resolveInside, BUILTIN_TOOLS } = await import("../src/tools.ts");
const { readSSE, toAnthropic, resolveProvider, complete, RETRY_DELAYS } = await import("../src/providers.ts");
const { runTurn, trimHistory } = await import("../src/agent.ts");

test("paths cannot leave the project", () => {
  assert.equal(resolveInside("/p", "src/a.ts"), "/p/src/a.ts");
  assert.throws(() => resolveInside("/p", "../etc/passwd"));
  assert.throws(() => resolveInside("/p", "/etc/passwd"));
  assert.equal(resolveInside("/p", "..foo"), "/p/..foo");
});

test("only side-effect-free commands skip approval", () => {
  for (const ok of ["ls -la", "git status", "git diff HEAD~1", "cat README.md"]) assert.ok(isReadOnlyCommand(ok), ok);
  for (const bad of ["rm -rf /", "ls; rm x", "cat a > b", "git push", "echo $(whoami)", "git diff --output=x", "npm test"]) {
    assert.ok(!isReadOnlyCommand(bad), bad);
  }
});

test("edits must match exactly once unless replace_all", () => {
  assert.equal(applyEdit("a b a", "b", "c"), "a c a");
  assert.throws(() => applyEdit("a b a", "a", "c"), /2 times/);
  assert.equal(applyEdit("a b a", "a", "c", true), "c b c");
  assert.throws(() => applyEdit("abc", "x", "y"), /not found/);
  assert.equal(applyEdit("x", "x", "$&$&"), "$&$&"); // no replacement patterns
});

test("diff preview shows only the changed region", () => {
  assert.equal(diffPreview("a\nb\nc", "a\nB\nc"), "@@ line 2\n- b\n+ B");
  assert.equal(diffPreview("", "new"), "@@ line 1\n+ new");
});

test("globs", () => {
  assert.ok(globToRegExp("src/**/*.ts").test("src/a/b/c.ts"));
  assert.ok(globToRegExp("src/**/*.ts").test("src/c.ts"));
  assert.ok(!globToRegExp("*.ts").test("src/c.ts"));
});

test("tool results of one turn share a single Anthropic user message", () => {
  const out = toAnthropic([
    { role: "user", content: "go" },
    { role: "assistant", content: "", calls: [{ id: "1", name: "a", args: "{}" }, { id: "2", name: "b", args: '{"x":1}' }] },
    { role: "tool", callId: "1", name: "a", content: "ok" },
    { role: "tool", callId: "2", name: "b", content: "bad", isError: true },
  ]);
  assert.equal(out.length, 3);
  assert.deepEqual(out[1].content, [
    { type: "tool_use", id: "1", name: "a", input: {} },
    { type: "tool_use", id: "2", name: "b", input: { x: 1 } },
  ]);
  assert.equal((out[2].content as any[]).length, 2);
  assert.equal((out[2].content as any[])[1].is_error, true);
});

const sse = (events: object[]) =>
  new Response(events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join("") + "data: [DONE]\n\n").body!;

test("SSE stream folds text and split tool-call arguments", async () => {
  let streamed = "";
  const reply = await readSSE(
    sse([
      { choices: [{ delta: { content: "Hel" } }] },
      { choices: [{ delta: { content: "lo" } }] },
      { choices: [{ delta: { tool_calls: [{ index: 0, id: "c1", function: { name: "read_file", arguments: '{"pa' } }] } }] },
      { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: 'th":"a"}' } }] }, finish_reason: "tool_calls" }] },
    ]),
    (d) => (streamed += d),
  );
  assert.equal(streamed, "Hello");
  assert.deepEqual(reply.calls, [{ id: "c1", name: "read_file", args: '{"path":"a"}' }]);
  assert.equal(reply.stop, "tools");
});

test("providers resolve from config and environment", () => {
  delete process.env.ANTHROPIC_API_KEY;
  assert.equal(resolveProvider({}), null);
  const p = resolveProvider({ providers: { lm: { baseUrl: "http://x/v1", model: "m" } } }, { provider: "lm" })!;
  assert.deepEqual([p.kind, p.baseUrl, p.model], ["openai", "http://x/v1", "m"]);
  assert.throws(() => resolveProvider({ provider: "openai" }), /OPENAI_API_KEY/);
});

test("old tool output is trimmed first", () => {
  const big = "x".repeat(5000);
  const out = trimHistory(
    [
      { role: "tool", callId: "1", name: "a", content: big },
      { role: "tool", callId: "2", name: "a", content: big },
    ],
    6000,
  );
  assert.match(out[0].content, /removed/);
  assert.equal(out[1].content, big);
});

test("agent loop: tool call needs approval, runs, then answers", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "kinetra-proj-"));
  const replies = [
    [{ choices: [{ delta: { tool_calls: [{ index: 0, id: "c1", function: { name: "write_file", arguments: JSON.stringify({ path: "hi.txt", content: "gm" }) } }] }, finish_reason: "tool_calls" }] }],
    [{ choices: [{ delta: { content: "done" }, finish_reason: "stop" }] }],
  ];
  const sent: any[] = [];
  globalThis.fetch = (async (_url: string, init: RequestInit) => {
    sent.push(JSON.parse(init.body as string));
    return new Response(sse(replies.shift()!));
  }) as typeof fetch;

  const approvals: string[] = [];
  const state = {
    root,
    mode: "ask" as const,
    tools: BUILTIN_TOOLS,
    allowed: new Set<string>(),
    provider: { name: "fake", kind: "openai" as const, model: "m", baseUrl: "http://fake" },
    session: { id: "t", cwd: root, title: "", provider: "fake", model: "m", createdAt: "", updatedAt: "", messages: [] },
  };
  let text = "";
  await runTurn(state, "say gm", {
    text: (d) => (text += d),
    busy: () => {},
    toolStart: () => {},
    toolEnd: () => {},
    notice: () => {},
    approve: async (name, kind, preview) => {
      approvals.push(`${name}:${kind}:${preview}`);
      return "yes";
    },
  });

  assert.equal(readFileSync(path.join(root, "hi.txt"), "utf8"), "gm");
  assert.deepEqual(approvals, ["write_file:edit:@@ line 1\n+ gm"]);
  assert.equal(text, "done");
  assert.equal(sent[1].messages.at(-1).role, "tool");
  assert.equal(state.session.messages.length, 4);
});

test("OpenAI-compatible calls retry overloaded and rate-limited responses", async () => {
  const statuses = [503, 429, 200];
  const seen: number[] = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    const status = statuses.shift()!;
    seen.push(status);
    if (status !== 200) return new Response("busy", { status });
    return new Response('data: {"choices":[{"delta":{"content":"ok"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n');
  }) as typeof fetch;
  RETRY_DELAYS.splice(0, RETRY_DELAYS.length, 1, 1, 1);
  try {
    const reply = await complete(
      { name: "test", kind: "openai", model: "m", baseUrl: "http://model.test" },
      { system: "", messages: [{ role: "user", content: "hi" }], tools: [], onText: () => {} },
    );
    assert.equal(reply.text, "ok");
    assert.deepEqual(seen, [503, 429, 200]);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("Gemini thought signatures ride along with their tool calls", async () => {
  const sig = { google: { thought_signature: "abc" } };
  const body = new Response(
    `data: ${JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, id: "c1", extra_content: sig, function: { name: "read_file", arguments: "{}" } }] }, finish_reason: "tool_calls" }] })}\n\n`,
  ).body!;
  const reply = await readSSE(body, () => {});
  assert.deepEqual(reply.calls[0].extra, sig);
  const { toOpenAI } = await import("../src/providers.ts");
  const [msg] = toOpenAI([{ role: "assistant", content: "", calls: reply.calls }]) as any[];
  assert.deepEqual(msg.tool_calls[0].extra_content, sig);
});
