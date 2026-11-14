import { setTimeout as sleep } from "node:timers/promises";
import { runTurn, type AgentIO, type AgentState, type Answer } from "./agent.ts";
import { saveSession } from "./store.ts";

/** Splits text into Telegram-sized messages, on line breaks where possible. */
export function chunks(text: string, max = 4000): string[] {
  const out: string[] = [];
  let rest = text;
  while (rest.length > max) {
    const cut = rest.lastIndexOf("\n", max) > max / 2 ? rest.lastIndexOf("\n", max) : max;
    out.push(rest.slice(0, cut));
    rest = rest.slice(cut).replace(/^\n/, "");
  }
  if (rest) out.push(rest);
  return out;
}

export const parseAnswer = (text: string): Answer => {
  const a = text.trim().toLowerCase();
  return a === "a" || a === "always" ? "always" : a === "y" || a === "yes" ? "yes" : "no";
};

interface Chat {
  state: AgentState;
  busy: boolean;
  abort?: AbortController;
  /** set while a tool waits for the user's y/n/a */
  answer?: (text: string) => void;
}

/** Long-polls the bot and runs each message from an allowed chat as a turn in that chat's session. */
export async function runTelegram(token: string, allow: number[], newState: () => AgentState, log: (msg: string) => void) {
  const call = async (method: string, body: object) => {
    const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(70_000),
    });
    const json: any = await res.json();
    if (!json.ok) throw new Error(`telegram ${method}: ${json.description}`);
    return json.result;
  };
  const send = async (chatId: number, text: string) => {
    for (const part of chunks(text)) await call("sendMessage", { chat_id: chatId, text: part }).catch((e) => log(e.message));
  };

  const chats = new Map<number, Chat>();
  const handle = (chatId: number, text: string) => {
    let chat = chats.get(chatId);
    if (!chat) chats.set(chatId, (chat = { state: newState(), busy: false }));
    if (chat.answer) return chat.answer(text);
    if (text === "/stop") {
      chat.abort?.abort();
      return send(chatId, chat.busy ? "Stopping." : "Nothing is running.");
    }
    if (chat.busy) return send(chatId, "Still working on the last task. /stop cancels it.");
    if (text === "/new" || text === "/start") {
      chat.state = newState();
      return send(chatId, `Fresh session in ${chat.state.root}, mode ${chat.state.mode}. Send a task.`);
    }

    const c = chat;
    const abort = (c.abort = new AbortController());
    abort.signal.addEventListener("abort", () => c.answer?.("n"));
    c.busy = true;
    let reply = "";
    const io: AgentIO = {
      text: (d) => (reply += d),
      busy: (on) => on && call("sendChatAction", { chat_id: chatId, action: "typing" }).catch(() => {}),
      toolStart: (name, summary) => send(chatId, `⚡ ${name} ${summary}`),
      toolEnd: (_name, result, isError) => isError && send(chatId, `✗ ${result.split("\n")[0].slice(0, 300)}`),
      approve: (name, kind, preview) =>
        new Promise((resolve) => {
          c.answer = (answer) => {
            c.answer = undefined;
            resolve(parseAnswer(answer));
          };
          send(chatId, `${name} ${kind === "edit" ? "wants to change a file" : "wants to run"}:\n\n${preview.slice(0, 3000)}\n\nReply y, n, or a to allow it for this session.`);
        }),
      notice: (msg) => send(chatId, msg),
    };
    runTurn(c.state, text, io, abort.signal)
      .then(
        () => send(chatId, reply.trim() || "Done."),
        (e) => send(chatId, abort.signal.aborted ? "Stopped." : `Error: ${(e as Error).message}`),
      )
      .finally(() => {
        c.busy = false;
        c.answer = undefined;
        return saveSession(c.state.session);
      });
  };

  const me = await call("getMe", {});
  log(`@${me.username} is listening for chats ${allow.join(", ") || "(none allowed yet)"}`);
  let offset = 0;
  while (true) {
    let updates: any[];
    try {
      updates = await call("getUpdates", { offset, timeout: 50, allowed_updates: ["message"] });
    } catch (e) {
      log((e as Error).message);
      await sleep(5000);
      continue;
    }
    for (const u of updates) {
      offset = u.update_id + 1;
      const text = u.message?.text?.trim();
      const chatId: number | undefined = u.message?.chat?.id;
      if (!text || chatId === undefined) continue;
      if (!allow.includes(chatId)) {
        log(`refused chat ${chatId}`);
        await send(chatId, `This KINETRA agent is private. The owner can allow this chat with:\nkinetra config set telegram.allow ${chatId}`);
        continue;
      }
      handle(chatId, text);
    }
  }
}
