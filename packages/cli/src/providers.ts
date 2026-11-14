import Anthropic from "@anthropic-ai/sdk";
import type { Config } from "./store.ts";
import type { Tool } from "./tools.ts";

export interface ToolCall {
  id: string;
  name: string;
  /** raw JSON arguments as the model produced them */
  args: string;
}

export type Msg =
  | { role: "user"; content: string }
  | {
      role: "assistant";
      content: string;
      calls?: ToolCall[];
      /** Anthropic content blocks echoed back unchanged (keeps thinking blocks valid). */
      anthropic?: Anthropic.Beta.BetaContentBlockParam[];
    }
  | { role: "tool"; callId: string; name: string; content: string; isError?: boolean };

export interface Reply {
  text: string;
  calls: ToolCall[];
  stop: "done" | "tools" | "refusal" | "length";
  usage?: { input: number; output: number };
  anthropic?: Anthropic.Beta.BetaContentBlockParam[];
}

interface Preset {
  kind: "anthropic" | "openai";
  baseUrl?: string;
  env?: string;
  model: string;
}

/** BYOK presets. Any other OpenAI-compatible endpoint works through `<name>.baseUrl`. */
export const PROVIDERS: Record<string, Preset> = {
  anthropic: { kind: "anthropic", env: "ANTHROPIC_API_KEY", model: "claude-opus-5-5" },
  openai: { kind: "openai", baseUrl: "https://api.openai.com/v1", env: "OPENAI_API_KEY", model: "gpt-5" },
  openrouter: { kind: "openai", baseUrl: "https://openrouter.ai/api/v1", env: "OPENROUTER_API_KEY", model: "openrouter/auto" },
  gemini: {
    kind: "openai",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    env: "GEMINI_API_KEY",
    model: "gemini-2.5-pro",
  },
  groq: { kind: "openai", baseUrl: "https://api.groq.com/openai/v1", env: "GROQ_API_KEY", model: "openai/gpt-oss-120b" },
  deepseek: { kind: "openai", baseUrl: "https://api.deepseek.com/v1", env: "DEEPSEEK_API_KEY", model: "deepseek-chat" },
  xai: { kind: "openai", baseUrl: "https://api.x.ai/v1", env: "XAI_API_KEY", model: "grok-4" },
  ollama: { kind: "openai", baseUrl: "http://localhost:11434/v1", model: "qwen3" },
};

export interface Provider {
  name: string;
  kind: "anthropic" | "openai";
  model: string;
  baseUrl?: string;
  apiKey?: string;
}

/** Picks the requested provider, else the configured one, else the first preset with a key in the environment. */
export function resolveProvider(config: Config, want: { provider?: string; model?: string } = {}): Provider | null {
  const hasKey = (n: string) => !!(config.providers?.[n]?.apiKey || (PROVIDERS[n].env && process.env[PROVIDERS[n].env!]));
  const name = want.provider ?? config.provider ?? Object.keys(PROVIDERS).find(hasKey);
  if (!name) return null;

  const preset = PROVIDERS[name];
  const own = config.providers?.[name] ?? {};
  const baseUrl = own.baseUrl ?? preset?.baseUrl;
  if (!preset && !baseUrl) throw new Error(`unknown provider "${name}". Add one with: kinetra config set ${name}.baseUrl <url>`);
  const model = want.model ?? own.model ?? preset?.model;
  if (!model) throw new Error(`no model for ${name}. Set one with: kinetra config set ${name}.model <model>`);
  const apiKey = (preset?.env && process.env[preset.env]) || own.apiKey;
  if (!apiKey && preset?.env) {
    throw new Error(`no API key for ${name}. Export ${preset.env} or run: kinetra config set ${name}.apiKey <key>`);
  }
  return { name, kind: preset?.kind ?? "openai", model, baseUrl, apiKey };
}

export interface CompleteRequest {
  system: string;
  messages: Msg[];
  tools: Tool[];
  signal?: AbortSignal;
  onText(delta: string): void;
}

export const complete = (p: Provider, req: CompleteRequest) => (p.kind === "anthropic" ? anthropic(p, req) : openai(p, req));

const parseArgs = (args: string) => {
  try {
    return JSON.parse(args || "{}");
  } catch {
    return {};
  }
};

// Models that accept server-side refusal fallbacks
const FALLBACK_MODELS = new Set(["claude-fable-5-1", "claude-opus-5-5", "claude-opus-5", "claude-sonnet-5-5"]);

async function anthropic(p: Provider, req: CompleteRequest): Promise<Reply> {
  const client = new Anthropic({ apiKey: p.apiKey, ...(p.baseUrl ? { baseURL: p.baseUrl } : {}) });
  const stream = client.beta.messages.stream(
    {
      model: p.model,
      max_tokens: 64000,
      cache_control: { type: "ephemeral" },
      system: req.system,
      tools: req.tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters })),
      messages: toAnthropic(req.messages),
      ...(FALLBACK_MODELS.has(p.model) ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
    },
    { signal: req.signal },
  );
  stream.on("text", req.onText);
  const msg = await stream.finalMessage();

  const calls = msg.content.flatMap((b) => (b.type === "tool_use" ? [{ id: b.id, name: b.name, args: JSON.stringify(b.input) }] : []));
  const text = msg.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  const stop =
    msg.stop_reason === "refusal" ? "refusal" : msg.stop_reason === "max_tokens" ? "length" : calls.length ? "tools" : "done";
  const u = msg.usage;
  const usage = {
    input: u.input_tokens + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0),
    output: u.output_tokens,
  };
  return { text, calls, stop, usage, anthropic: msg.content as Anthropic.Beta.BetaContentBlockParam[] };
}

export function toAnthropic(messages: Msg[]): Anthropic.Beta.BetaMessageParam[] {
  const out: Anthropic.Beta.BetaMessageParam[] = [];
  for (const m of messages) {
    if (m.role === "user") out.push({ role: "user", content: m.content });
    else if (m.role === "assistant") {
      const blocks: Anthropic.Beta.BetaContentBlockParam[] = m.anthropic ?? [
        ...(m.content ? [{ type: "text" as const, text: m.content }] : []),
        ...(m.calls ?? []).map((c) => ({ type: "tool_use" as const, id: c.id, name: c.name, input: parseArgs(c.args) })),
      ];
      out.push({ role: "assistant", content: blocks.length ? blocks : "(no output)" });
    } else {
      const block: Anthropic.Beta.BetaToolResultBlockParam = {
        type: "tool_result",
        tool_use_id: m.callId,
        content: m.content,
        ...(m.isError ? { is_error: true } : {}),
      };
      // all results of one assistant turn go back in a single user message
      const last = out.at(-1);
      if (last?.role === "user" && Array.isArray(last.content) && last.content.every((b) => b.type === "tool_result")) {
        last.content.push(block);
      } else out.push({ role: "user", content: [block] });
    }
  }
  return out;
}

export function toOpenAI(messages: Msg[]) {
  return messages.map((m) =>
    m.role === "user"
      ? { role: "user", content: m.content }
      : m.role === "assistant"
        ? {
            role: "assistant",
            content: m.content || null,
            ...(m.calls?.length
              ? { tool_calls: m.calls.map((c) => ({ id: c.id, type: "function", function: { name: c.name, arguments: c.args || "{}" } })) }
              : {}),
          }
        : { role: "tool", tool_call_id: m.callId, content: m.content },
  );
}

async function openai(p: Provider, req: CompleteRequest): Promise<Reply> {
  const res = await fetch(`${p.baseUrl}/chat/completions`, {
    method: "POST",
    signal: req.signal,
    headers: { "content-type": "application/json", ...(p.apiKey ? { authorization: `Bearer ${p.apiKey}` } : {}) },
    body: JSON.stringify({
      model: p.model,
      stream: true,
      stream_options: { include_usage: true },
      messages: [{ role: "system", content: req.system }, ...toOpenAI(req.messages)],
      tools: req.tools.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.parameters } })),
    }),
  });
  if (!res.ok || !res.body) throw new Error(`${p.name} ${res.status}: ${(await res.text()).slice(0, 500)}`);
  return readSSE(res.body, req.onText);
}

/** Folds an OpenAI chat-completions SSE stream into one reply. */
export async function readSSE(body: ReadableStream<Uint8Array>, onText: (d: string) => void): Promise<Reply> {
  let text = "";
  let finish = "";
  let buf = "";
  let usage: Reply["usage"];
  const calls: ToolCall[] = [];
  const decoder = new TextDecoder();
  for await (const bytes of body) {
    buf += decoder.decode(bytes, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line.startsWith("data:") || line === "data: [DONE]") continue;
      const event = JSON.parse(line.slice(5));
      if (event.error) throw new Error(event.error.message ?? JSON.stringify(event.error));
      // include_usage sends the totals in a last chunk with no choices
      if (event.usage) usage = { input: event.usage.prompt_tokens ?? 0, output: event.usage.completion_tokens ?? 0 };
      const choice = event.choices?.[0];
      if (!choice) continue;
      if (choice.delta?.content) {
        text += choice.delta.content;
        onText(choice.delta.content);
      }
      for (const tc of choice.delta?.tool_calls ?? []) {
        const call = (calls[tc.index ?? calls.length] ??= { id: "", name: "", args: "" });
        if (tc.id) call.id = tc.id;
        if (tc.function?.name) call.name ||= tc.function.name;
        if (tc.function?.arguments) call.args += tc.function.arguments;
      }
      if (choice.finish_reason) finish = choice.finish_reason;
    }
  }
  const done = calls.filter(Boolean).map((c, i) => ({ ...c, id: c.id || `call_${i}_${Date.now().toString(36)}` }));
  const stop = finish === "length" ? "length" : finish === "content_filter" ? "refusal" : done.length ? "tools" : "done";
  return { text, calls: done, stop, usage };
}
