import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

process.env.KINETRA_HOME = mkdtempSync(path.join(tmpdir(), "kinetra-home-"));

const { cronMatches, workflowSteps } = await import("../src/automation.ts");
const { addNote, saveSession, usageReport } = await import("../src/store.ts");
const { chunks, parseAnswer } = await import("../src/telegram.ts");
const { decodeTool, encodeToolOf } = await import("../src/registry.ts");
const { readSSE } = await import("../src/providers.ts");
const { runTurn } = await import("../src/agent.ts");
const { BUILTIN_TOOLS, htmlToText, recall } = await import("../src/tools.ts");
const { closeMcp, loadMcpTools, mcpToolName } = await import("../src/mcp.ts");
const { startDashboard } = await import("../src/dashboard.ts");

test("cron fields: lists, ranges, steps, Sunday as 0 or 7, either day field", () => {
  const mon9 = new Date(2026, 10, 16, 9, 0); // Monday 16 Nov 2026 09:00
  assert.ok(cronMatches("0 9 * * 1-5", mon9));
  assert.ok(cronMatches("*/15 8-10 * * *", mon9));
  assert.ok(!cronMatches("*/15 8-10 * * *", new Date(2026, 10, 16, 9, 7)));
  assert.ok(cronMatches("0 9 * * 7", new Date(2026, 10, 15, 9, 0))); // Sunday
  assert.ok(cronMatches("0 9 1 * 1", mon9)); // day 1 or Monday
  assert.ok(!cronMatches("0 9 1 * *", mon9));
  assert.ok(cronMatches("0,30 9 16 11 *", mon9));
  for (const bad of ["* * * *", "60 * * * *", "a * * * *", "1,,2 * * * *", "*/0 * * * *", "5-1 * * * *"]) {
    assert.throws(() => cronMatches(bad, mon9), undefined, bad);
  }
});

test("memory notes group under topic headings", () => {
  let m = addNote("", "uses pnpm");
  assert.equal(m, "- uses pnpm");
  m = addNote(m, "tests run with node --test", "build");
  m = addNote(m, "tabs, not spaces", "style");
  m = addNote(m, "build with tsc", "build");
  assert.equal(m, "- uses pnpm\n\n## build\n- tests run with node --test\n- build with tsc\n\n## style\n- tabs, not spaces");
});

test("workflow steps split on --- lines only", () => {
  assert.deepEqual(workflowSteps("run tests\n---\nfix failures --- carefully\n---\n\n"), ["run tests", "fix failures --- carefully"]);
});

test("telegram splits long replies and reads approvals", () => {
  const parts = chunks("a".repeat(30) + "\n" + "b".repeat(30), 40);
  assert.deepEqual(parts, ["a".repeat(30), "b".repeat(30)]);
  assert.equal(chunks("x".repeat(90), 40).join(""), "x".repeat(90));
  assert.equal(parseAnswer(" Y "), "yes");
  assert.equal(parseAnswer("a"), "always");
  assert.equal(parseAnswer("sure"), "no");
});

test("registry calldata and Tool struct decoding", () => {
  assert.equal(
    encodeToolOf("read_file"),
    "0x4aceab44" + "20".padStart(64, "0") + "9".padStart(64, "0") + Buffer.from("read_file").toString("hex").padEnd(64, "0"),
  );
  const w = (hex: string) => hex.padStart(64, "0");
  const str = (s: string) => w(s.length.toString(16)) + Buffer.from(s).toString("hex").padEnd(64, "0");
  const author = "ab".repeat(20);
  const hash = "cd".repeat(32);
  const hex =
    "0x" + w("20") + w(author) + w("c0") + w("100") + hash + w("1") + w("5") + str("weather") + str("https://x.dev/weather.json");
  assert.deepEqual(decodeTool(hex), {
    author: "0x" + author,
    name: "weather",
    manifestURI: "https://x.dev/weather.json",
    manifestHash: "0x" + hash,
    verified: true,
  });
});

const sse = (events: object[]) =>
  new Response(events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join("") + "data: [DONE]\n\n").body!;

test("usage comes from the final SSE chunk and adds up per model and day", async () => {
  const reply = await readSSE(
    sse([{ choices: [{ delta: { content: "hi" }, finish_reason: "stop" }] }, { choices: [], usage: { prompt_tokens: 10, completion_tokens: 3 } }]),
    () => {},
  );
  assert.deepEqual(reply.usage, { input: 10, output: 3 });
  const session = (day: string, model: string, input: number) => ({
    id: day, cwd: "/p", title: "", provider: "p", model, createdAt: day, updatedAt: `${day}T10:00:00Z`,
    messages: [{ role: "tool" as const, callId: "1", name: "a", content: "", isError: true }],
    usage: { input, output: 1, requests: 2 },
  });
  const r = usageReport([session("2026-11-14", "m1", 5), session("2026-11-15", "m1", 7), session("2026-11-15", "m2", 100)]);
  assert.deepEqual(r.total, { sessions: 3, requests: 6, input: 112, output: 3, toolCalls: 3, toolErrors: 3 });
  assert.deepEqual(r.byDay.map(([d, x]) => [d, x.sessions]), [["2026-11-15", 2], ["2026-11-14", 1]]);
  assert.equal(r.byModel[0][0], "p/m2");
});

test("delegate runs a sub-agent in a fresh context and bills the parent", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "kinetra-proj-"));
  const usage = { choices: [], usage: { prompt_tokens: 1, completion_tokens: 1 } };
  const replies = [
    [{ choices: [{ delta: { tool_calls: [{ index: 0, id: "d1", function: { name: "delegate", arguments: '{"task":"count files","role":"researcher"}' } }] }, finish_reason: "tool_calls" }] }, usage],
    [{ choices: [{ delta: { content: "3 files" }, finish_reason: "stop" }] }, usage],
    [{ choices: [{ delta: { content: "the sub-agent says 3" }, finish_reason: "stop" }] }, usage],
  ];
  const sent: any[] = [];
  globalThis.fetch = (async (_url: string, init: RequestInit) => {
    sent.push(JSON.parse(init.body as string));
    return new Response(sse(replies.shift()!));
  }) as typeof fetch;
  const state = {
    root, mode: "ask" as const, tools: BUILTIN_TOOLS, allowed: new Set<string>(),
    provider: { name: "fake", kind: "openai" as const, model: "m", baseUrl: "http://fake" },
    session: { id: "t", cwd: root, title: "", provider: "fake", model: "m", createdAt: "", updatedAt: "", messages: [] as any[] },
  };
  let text = "";
  const io = { text: (d: string) => (text += d), busy() {}, toolStart() {}, toolEnd() {}, notice() {}, approve: async () => "yes" as const };
  await runTurn(state, "how many files?", io);

  // the sub-agent saw only its own task, without the delegate tool
  assert.equal(sent[1].messages.length, 2);
  assert.match(sent[1].messages[1].content, /researcher[\s\S]*count files/);
  assert.ok(!sent[1].tools.some((t: any) => t.function.name === "delegate"));
  assert.equal(state.session.messages[2].content, "3 files");
  assert.equal(text, "the sub-agent says 3");
  assert.deepEqual(state.session.usage, { input: 3, output: 3, requests: 3 });
});

test("recall finds memory and earlier sessions of this project", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "kinetra-proj-"));
  await saveSession({
    id: "20261101000000-abcd", cwd: root, title: "db", provider: "p", model: "m", createdAt: "", updatedAt: "2026-11-01T00:00:00Z",
    messages: [{ role: "user", content: "we picked Postgres over SQLite for the queue" }],
  });
  assert.match(await recall("postgres queue", root), /session 20261101000000-abcd .*Postgres/);
  assert.equal(await recall("kubernetes", root), "nothing found");
});

test("html is reduced to readable text", () => {
  assert.equal(htmlToText("<style>x{}</style><h1>Hi &amp; bye</h1><p>one<br>two</p><script>evil()</script>"), "Hi & bye\none\ntwo");
});

test("MCP tools are listed, named per server and called over stdio", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "kinetra-mcp-"));
  const server = path.join(dir, "server.mjs");
  writeFileSync(
    server,
    `import readline from "node:readline";
const send = (m) => process.stdout.write(JSON.stringify({ jsonrpc: "2.0", ...m }) + "\\n");
readline.createInterface({ input: process.stdin }).on("line", (line) => {
  const m = JSON.parse(line);
  if (m.method === "initialize") send({ id: m.id, result: { protocolVersion: "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "t", version: "1" } } });
  if (m.method === "tools/list") send({ id: m.id, result: { tools: [
    { name: "echo", description: "Echo", inputSchema: { type: "object", properties: { text: { type: "string" } } }, annotations: { readOnlyHint: true } },
    { name: "boom", inputSchema: { type: "object" } },
  ] } });
  if (m.method === "tools/call" && m.params.name === "echo") send({ id: m.id, result: { content: [{ type: "text", text: "echo " + m.params.arguments.text }] } });
  if (m.method === "tools/call" && m.params.name === "boom") send({ id: m.id, result: { content: [{ type: "text", text: "it broke" }], isError: true } });
});`,
  );
  const warnings: string[] = [];
  const tools = await loadMcpTools(
    { t: { command: process.execPath, args: [server] }, missing: { command: "/no/such/binary" } },
    "test",
    (m) => warnings.push(m),
  );
  try {
    assert.deepEqual(tools.map((t) => t.name), ["t__echo", "t__boom"]);
    assert.equal(tools[0].approval!({}), null);
    assert.equal(tools[1].approval!({}), "exec");
    assert.equal(await tools[0].run({ text: "gm" }, { root: dir }), "echo gm");
    await assert.rejects(async () => tools[1].run({}, { root: dir }), /it broke/);
    assert.match(warnings.join(), /skipped MCP server missing/);
    assert.equal(mcpToolName("my.server", "a b"), "my_server__a_b");
  } finally {
    closeMcp();
  }
});

test("dashboard refuses foreign hosts and header-less writes", async () => {
  const { request } = await import("node:http");
  const { url, close } = await startDashboard(mkdtempSync(path.join(tmpdir(), "kinetra-proj-")), 47_777, "test");
  const call = (method: string, p: string, headers: Record<string, string> = {}) =>
    new Promise<number>((resolve, reject) => {
      const req = request(`${url}${p}`, { method, headers }, (res) => (res.resume(), resolve(res.statusCode!)));
      req.on("error", reject).end();
    });
  assert.equal(await call("GET", "/api/state"), 200);
  assert.equal(await call("GET", "/api/state", { host: "evil.example:47777" }), 403);
  assert.equal(await call("DELETE", "/api/sessions/x"), 403);
  assert.equal(await call("DELETE", "/api/sessions/x", { "x-kinetra": "1" }), 200);
  close();
});
