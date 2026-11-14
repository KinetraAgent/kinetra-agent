<script setup lang="ts">
import { Award, CornerDownLeft, Lock, ShieldAlert } from "lucide-vue-next";
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref } from "vue";
import { BADGES, customMission, MISSIONS, type Mission } from "../lib/arcade";
import Keycap from "./Keycap.vue";

type Answer = "yes" | "no" | "always";
type Mode = "ask" | "edits" | "auto";
interface Line {
  id: number;
  type: "user" | "say" | "tool" | "out" | "warn" | "ask" | "done";
  text: string;
  arg?: string;
  diff?: string[];
  untrusted?: string;
  kind?: "edit" | "exec";
  answer?: Answer;
}

const STORE = "kinetra-arcade";
const saved = (() => {
  try {
    return JSON.parse(localStorage.getItem(STORE) ?? "{}");
  } catch {
    return {};
  }
})();

const root = ref<HTMLElement>();
const body = ref<HTMLElement>();
const lines = ref<Line[]>([]);
const mode = ref<Mode>("ask");
const running = ref(false);
const intent = ref("");
const pending = ref<{ resolve: (a: Answer) => void } | null>(null);
const pressed = ref("");
const badges = ref(new Set<string>(saved.badges ?? []));
const cleared = ref(new Set<string>(saved.cleared ?? []));
const toast = ref("");
const stats = reactive({ executed: 0, approved: 0, declined: 0, started: 0, elapsed: 0 });
let runId = 0;
let lineId = 0;
let ticker = 0;
let visible = false;

const unlockedCount = computed(() => badges.value.size);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function persist() {
  try {
    localStorage.setItem(STORE, JSON.stringify({ badges: [...badges.value], cleared: [...cleared.value] }));
  } catch {}
}

function unlock(id: string) {
  if (badges.value.has(id)) return;
  badges.value = new Set(badges.value).add(id);
  toast.value = BADGES.find((b) => b.id === id)!.title;
  setTimeout(() => (toast.value = ""), 2600);
  persist();
}

async function push(line: Omit<Line, "id">) {
  const l = reactive({ ...line, id: ++lineId }) as Line;
  lines.value.push(l);
  await nextTick();
  body.value?.scrollTo({ top: body.value.scrollHeight, behavior: "smooth" });
  return l;
}

async function type(text: string, kind: Line["type"], id: number) {
  const l = await push({ type: kind, text: "" });
  for (let i = 0; i < text.length && id === runId; i += 3) {
    l.text = text.slice(0, i + 3);
    await sleep(14);
  }
  l.text = text;
}

function ask(): Promise<Answer> {
  return new Promise((resolve) => (pending.value = { resolve }));
}

function answer(a: Answer) {
  if (!pending.value) return;
  pressed.value = a;
  setTimeout(() => (pressed.value = ""), 140);
  pending.value.resolve(a);
  pending.value = null;
}

async function play(m: Mission) {
  const id = ++runId;
  pending.value = null;
  running.value = true;
  lines.value = [];
  Object.assign(stats, { executed: 0, approved: 0, declined: 0, started: performance.now(), elapsed: 0 });
  clearInterval(ticker);
  ticker = window.setInterval(() => (stats.elapsed = performance.now() - stats.started), 100);
  const always = new Set<string>();

  await push({ type: "user", text: m.title });
  for (const step of m.steps) {
    await sleep(step.kind === "tool" ? 360 : 480);
    if (id !== runId) return;
    if (step.kind === "say") await type(step.text, "say", id);
    else if (step.kind === "done") await type(step.text, "done", id);
    else {
      const needs =
        step.approval && mode.value !== "auto" && !(mode.value === "edits" && step.approval === "edit") && !always.has(step.name);
      if (needs) {
        const line = await push({ type: "ask", text: step.name, arg: step.arg, diff: step.diff, untrusted: step.untrusted, kind: step.approval });
        line.answer = await ask();
        if (id !== runId) return;
        if (line.answer === "no") {
          stats.declined++;
          if (step.untrusted) unlock("guardian");
          await push({ type: "warn", text: step.declined ?? "declined, adapting the plan" });
          continue;
        }
        stats.approved++;
        unlock("first-key");
        if (step.approval === "edit") unlock("clean-diff");
        if (line.answer === "always") always.add(step.name);
      }
      await push({ type: "tool", text: step.name, arg: step.arg });
      await sleep(260);
      if (id !== runId) return;
      await push({ type: step.untrusted ? "warn" : "out", text: step.out });
      stats.executed++;
    }
  }
  clearInterval(ticker);
  stats.elapsed = performance.now() - stats.started;
  running.value = false;
  if (m.id === "custom") return;
  if (stats.elapsed < 20000) unlock("speedrun");
  cleared.value = new Set(cleared.value).add(m.id);
  persist();
  if (MISSIONS.every((x) => cleared.value.has(x.id))) unlock("full-clear");
}

function runCustom() {
  const text = intent.value.trim();
  if (!text || running.value) return;
  intent.value = "";
  play(customMission(text.slice(0, 120)));
}

function onKey(e: KeyboardEvent) {
  if (!visible || e.metaKey || e.ctrlKey || e.altKey) return;
  if ((e.target as HTMLElement).closest("input, textarea")) return;
  const k = e.key.toLowerCase();
  if (pending.value && (k === "y" || k === "n" || k === "a")) {
    e.preventDefault();
    answer(k === "y" ? "yes" : k === "n" ? "no" : "always");
  } else if (!running.value && ["1", "2", "3"].includes(k)) {
    play(MISSIONS[Number(k) - 1]);
  }
}

let io: IntersectionObserver;
onMounted(() => {
  addEventListener("keydown", onKey);
  io = new IntersectionObserver(
    ([e]) => {
      visible = e.isIntersecting;
      // attract mode: the first time the arcade is on screen, mission 1 plays up to its first approval
      if (visible && !lines.value.length && !running.value) play(MISSIONS[0]);
    },
    { threshold: 0.3 },
  );
  io.observe(root.value!);
});
onBeforeUnmount(() => {
  runId++;
  clearInterval(ticker);
  removeEventListener("keydown", onKey);
  io.disconnect();
});

const seconds = computed(() => (stats.elapsed / 1000).toFixed(1));
</script>

<template>
  <section id="arcade" ref="root" class="section arcade">
    <div class="wrap">
      <div class="section-head reveal" data-n="01">
        <div>
          <p class="kicker mono"><b>01</b> execution arcade</p>
          <h2 class="h2">Give it an intent. <br />You hold the keys.</h2>
        </div>
        <p class="lede">
          Pick a mission and watch KINETRA plan it, read the code and propose changes. Nothing that edits or runs happens until you
          press <kbd class="mono">Y</kbd>.
        </p>
      </div>

      <div class="grid reveal">
        <div class="term card" :class="{ awaiting: !!pending }">
          <div class="term-bar mono">
            <span class="path">kinetra · ~/acme-app</span>
            <div class="modes" role="radiogroup" aria-label="Approval mode">
              <button
                v-for="m in ['ask', 'edits', 'auto'] as Mode[]"
                :key="m"
                type="button"
                role="radio"
                :aria-checked="mode === m"
                :class="{ on: mode === m }"
                :disabled="running"
                @click="mode = m"
              >
                {{ m }}
              </button>
            </div>
          </div>

          <div ref="body" class="term-body mono" data-lenis-prevent aria-live="polite">
            <div v-if="!lines.length" class="idle">
              <p class="logo">◢◤ K I N E T R A <span>v1.0.0-testnet.1</span></p>
              <p class="faint">from intent to execution</p>
              <p><span class="accent">●</span> anthropic/claude-opus-5-5 · mode {{ mode }} · /help</p>
              <p class="faint">› pick a mission on the right, press 1, 2 or 3, or type your own intent below</p>
            </div>
            <template v-for="l in lines" :key="l.id">
              <p v-if="l.type === 'user'" class="user"><span class="accent">›</span> {{ l.text }}</p>
              <p v-else-if="l.type === 'say'" class="say">{{ l.text }}</p>
              <p v-else-if="l.type === 'tool'" class="tool">
                <span class="accent">⚡ {{ l.text }}</span> <span class="faint">{{ l.arg }}</span>
              </p>
              <p v-else-if="l.type === 'out'" class="out">↳ {{ l.text }}</p>
              <p v-else-if="l.type === 'warn'" class="warn">↳ {{ l.text }}</p>
              <p v-else-if="l.type === 'done'" class="done">✓ {{ l.text }}</p>
              <div v-else class="ask" :class="{ risky: l.untrusted, answered: l.answer }">
                <p class="ask-head">
                  <ShieldAlert v-if="l.untrusted" :size="16" :stroke-width="1.5" />
                  <span class="name">{{ l.text }}</span>
                  <span class="faint">{{ l.kind === "edit" ? "wants to change a file" : "wants to run" }}</span>
                </p>
                <p v-if="l.untrusted" class="source">{{ l.untrusted }}</p>
                <pre v-if="l.diff" class="diff"><span v-for="(d, i) in l.diff" :key="i" :class="d[0] === '+' ? 'add' : d[0] === '-' ? 'del' : 'ctx'">{{ d }}
</span></pre>
                <pre v-else class="diff"><span class="ctx">$ {{ l.arg }}</span></pre>
                <div v-if="!l.answer" class="keys">
                  <span class="faint">allow?</span>
                  <Keycap label="Y" tone="accent" :pressed="pressed === 'yes'" data-cursor="allow" @click="answer('yes')">Y <span>yes</span></Keycap>
                  <Keycap label="N" tone="neg" :pressed="pressed === 'no'" data-cursor="deny" @click="answer('no')">N <span>no</span></Keycap>
                  <Keycap label="A" :pressed="pressed === 'always'" data-cursor="always" @click="answer('always')">A <span>always</span></Keycap>
                </div>
                <p v-else class="faint">{{ l.answer === "no" ? "declined" : l.answer === "always" ? "allowed for this session" : "allowed" }}</p>
              </div>
            </template>
          </div>

          <form class="term-input mono" @submit.prevent="runCustom">
            <span class="accent">›</span>
            <input v-model="intent" :disabled="running" maxlength="120" placeholder="Type your own intent" aria-label="Your intent" />
            <Keycap label="Enter" :disabled="running || !intent.trim()"><CornerDownLeft :size="14" :stroke-width="1.5" /></Keycap>
          </form>
          <transition name="toast">
            <div v-if="toast" class="toast mono"><Award :size="16" :stroke-width="1.5" /> badge unlocked · {{ toast }}</div>
          </transition>
        </div>

        <aside class="side">
          <div class="card block">
            <p class="label">Missions</p>
            <button
              v-for="(m, i) in MISSIONS"
              :key="m.id"
              type="button"
              data-cursor="play"
              class="mission"
              :class="{ done: cleared.has(m.id) }"
              :disabled="running"
              @click="play(m)"
            >
              <Keycap :label="String(i + 1)" as="span" />
              <span>{{ m.title }}</span>
              <span v-if="cleared.has(m.id)" class="mono faint">cleared</span>
            </button>
          </div>

          <div class="card block">
            <p class="label">Run</p>
            <div v-if="stats.started" class="chips mono">
              <span v-if="running" class="live"><span class="dot"></span>running</span>
              <span>{{ seconds }}s</span>
              <span v-if="stats.executed">{{ stats.executed }} executed</span>
              <span v-if="stats.approved">{{ stats.approved }} approved</span>
              <span v-if="stats.declined">{{ stats.declined }} declined</span>
            </div>
            <div v-else class="legend">
              <span><Keycap label="Y" as="span" /> approve</span>
              <span><Keycap label="N" as="span" /> decline</span>
              <span><Keycap label="A" as="span" /> always</span>
            </div>
          </div>

          <div class="card block">
            <p class="label">
              Badges <span class="mono faint">{{ unlockedCount ? `${unlockedCount} of ${BADGES.length}` : `${BADGES.length} to unlock` }}</span>
            </p>
            <ul class="badges">
              <li v-for="b in BADGES" :key="b.id" :class="{ got: badges.has(b.id) }">
                <Award v-if="badges.has(b.id)" :size="16" :stroke-width="1.5" />
                <Lock v-else :size="16" :stroke-width="1.5" />
                <span>{{ b.title }}</span>
                <span class="faint">{{ b.hint }}</span>
              </li>
            </ul>
          </div>
        </aside>
      </div>
    </div>
  </section>
</template>

<style scoped>
.arcade {
  padding-top: 72px;
}
kbd {
  padding: 1px 6px;
  border: 1px solid var(--line-2);
  border-bottom-width: 2px;
  border-radius: 4px;
  font-size: 13px;
  color: var(--text);
}
.grid {
  display: grid;
  grid-template-columns: minmax(0, 1.65fr) minmax(0, 1fr);
  gap: 16px;
}
.term {
  position: relative;
  display: flex;
  flex-direction: column;
  height: 600px;
  overflow: hidden;
  border-radius: var(--r-panel);
  background:
    radial-gradient(120% 60% at 50% 0%, var(--accent-soft), transparent 60%),
    color-mix(in srgb, var(--bg-deep) 92%, transparent);
  box-shadow:
    0 40px 80px -40px rgb(0 0 0 / 0.6),
    inset 0 1px 0 var(--card-hi);
  transition:
    border-color var(--slow) var(--ease),
    box-shadow var(--slow) var(--ease);
}
/* scanline sheen that sweeps the screen now and then */
.term::after {
  opacity: 1;
  z-index: 3;
  background: linear-gradient(180deg, transparent 0%, var(--accent-soft) 50%, transparent 100%);
  background-size: 100% 220px;
  background-repeat: no-repeat;
  animation: sweep 7s linear infinite;
}
@keyframes sweep {
  from {
    background-position: 0 -220px;
  }
  to {
    background-position: 0 calc(100% + 220px);
  }
}
/* waiting on the visitor: the frame lights up in the accent */
.term.awaiting {
  border-color: color-mix(in srgb, var(--accent) 55%, transparent);
  box-shadow:
    0 0 0 1px color-mix(in srgb, var(--accent) 30%, transparent),
    0 0 60px -10px var(--glow),
    0 40px 80px -40px rgb(0 0 0 / 0.6);
}
.term-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  height: 48px;
  padding: 0 12px 0 20px;
  border-bottom: 1px solid var(--line);
  font-size: 12px;
  color: var(--muted);
}
.modes {
  display: flex;
  gap: 2px;
  padding: 2px;
  border-radius: 8px;
  background: var(--raised);
}
.modes button {
  height: 28px;
  padding: 0 10px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--text-2);
  font: inherit;
  cursor: pointer;
  transition:
    color var(--fast) var(--ease),
    background-color var(--fast) var(--ease);
}
.modes button.on {
  background: var(--card);
  color: var(--text);
  box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.08);
}
.modes button:disabled {
  cursor: not-allowed;
}
.term-body {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
  font-size: 13px;
  line-height: 1.7;
  overscroll-behavior: contain;
}
.term-body p {
  margin: 0 0 4px;
}
.idle .logo {
  color: var(--accent);
  letter-spacing: 0.04em;
}
.idle .logo span,
.faint {
  color: var(--muted);
}
.accent {
  color: var(--accent);
}
.user {
  margin-top: 4px !important;
  color: var(--text);
  font-weight: 500;
}
.say {
  color: var(--text);
  margin: 8px 0 !important;
}
.out {
  color: var(--text-2);
  padding-left: 20px;
}
.warn {
  color: var(--warn);
  padding-left: 20px;
}
.done {
  color: var(--pos);
  margin-top: 8px !important;
}
.ask {
  margin: 8px 0 12px;
  padding: 12px 16px;
  border-radius: 12px;
  border: 1px solid var(--line-2);
  background: var(--card);
}
.ask.risky {
  border-color: color-mix(in srgb, var(--warn) 50%, transparent);
}
.ask.answered {
  opacity: 0.7;
}
.ask-head {
  display: flex;
  align-items: center;
  gap: 8px;
}
.ask.risky .ask-head {
  color: var(--warn);
}
.name {
  font-weight: 600;
  color: var(--text);
}
.source {
  color: var(--warn);
  font-size: 12px;
}
.diff {
  margin: 8px 0;
  padding: 8px 12px;
  border-radius: 8px;
  background: var(--bg-deep);
  font: inherit;
  font-size: 12px;
  white-space: pre-wrap;
  word-break: break-word;
}
.add {
  color: var(--pos);
}
.del {
  color: var(--neg);
}
.ctx {
  color: var(--text-2);
}
.keys {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}
.keys :deep(.keycap span) {
  color: inherit;
  opacity: 0.8;
}
.term-input {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 8px 8px 20px;
  border-top: 1px solid var(--line);
}
.term-input input {
  flex: 1;
  min-width: 0;
  height: 36px;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--text);
  font: inherit;
  font-size: 13px;
}
.term-input input::placeholder {
  color: var(--muted);
}
.toast {
  position: absolute;
  top: 60px;
  right: 16px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 10px;
  border: 1px solid var(--line-2);
  background: var(--raised);
  color: var(--accent);
  font-size: 12px;
}
.toast-enter-active,
.toast-leave-active {
  transition:
    opacity var(--mid) var(--ease),
    transform var(--mid) var(--ease);
}
.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}
.side {
  display: grid;
  gap: 16px;
  align-content: start;
}
.block {
  padding: 20px;
}
.label {
  display: flex;
  justify-content: space-between;
  margin: 0 0 12px;
  font-size: 14px;
  font-weight: 500;
}
.mission {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  min-height: 48px;
  padding: 8px;
  margin: 0 -8px;
  width: calc(100% + 16px);
  border: 0;
  border-radius: 10px;
  background: transparent;
  text-align: left;
  font-size: 15px;
  cursor: pointer;
  transition: background-color var(--fast) var(--ease);
}
.mission > span:nth-child(2) {
  flex: 1;
}
.mission:hover:not(:disabled) {
  background: var(--raised);
}
.mission:disabled {
  cursor: progress;
  opacity: 0.6;
}
.mission.done :deep(.keycap) {
  color: var(--accent);
}
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  font-size: 12px;
}
.chips > span {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 28px;
  padding: 0 10px;
  border-radius: 6px;
  background: var(--raised);
  color: var(--text-2);
}
.chips .live {
  color: var(--text);
}
.legend {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  font-size: 13px;
  color: var(--text-2);
}
.legend span {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.badges {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 8px;
}
.badges li {
  display: grid;
  grid-template-columns: 16px auto 1fr;
  align-items: center;
  gap: 10px;
  font-size: 13px;
  color: var(--muted);
}
.badges li .faint {
  text-align: right;
  font-size: 12px;
}
.badges li.got {
  color: var(--text);
}
.badges li.got svg {
  color: var(--accent);
}

@media (max-width: 1000px) {
  .grid {
    grid-template-columns: minmax(0, 1fr);
  }
  .side {
    order: -1;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .side .block:first-child {
    grid-column: 1 / -1;
  }
  .term {
    height: 520px;
  }
}
@media (max-width: 560px) {
  .side {
    grid-template-columns: minmax(0, 1fr);
  }
  .badges li {
    grid-template-columns: 16px 1fr;
  }
  .badges li .faint {
    display: none;
  }
  .term-body {
    padding: 16px;
    font-size: 12px;
  }
}
</style>
