<script setup lang="ts">
import { BadgeCheck, Check, CirclePause, CirclePlay, Copy, ExternalLink, X } from "lucide-vue-next";
import { computed, ref } from "vue";
import { live, short } from "../lib/chain";
import { useCopy } from "../lib/copy";
import Keycap from "./Keycap.vue";

// mirrors packages/cli/src/providers.ts
const PROVIDERS = [
  { name: "anthropic", model: "claude-opus-5-5", key: "ANTHROPIC_API_KEY" },
  { name: "openai", model: "gpt-5", key: "OPENAI_API_KEY" },
  { name: "openrouter", model: "openrouter/auto", key: "OPENROUTER_API_KEY" },
  { name: "gemini", model: "gemini-2.5-pro", key: "GEMINI_API_KEY" },
  { name: "groq", model: "openai/gpt-oss-120b", key: "GROQ_API_KEY" },
  { name: "deepseek", model: "deepseek-chat", key: "DEEPSEEK_API_KEY" },
  { name: "xai", model: "grok-4", key: "XAI_API_KEY" },
  { name: "ollama", model: "qwen3", key: "" },
];
const provider = ref(PROVIDERS[0]);

type Mode = "ask" | "edits" | "auto";
const mode = ref<Mode>("ask");
const ACTIONS = [
  { tool: "read_file", arg: "src/app.ts", kind: null },
  { tool: "run_command", arg: "git status", kind: null },
  { tool: "edit_file", arg: "src/app.ts", kind: "edit" },
  { tool: "write_file", arg: "src/new.ts", kind: "edit" },
  { tool: "run_command", arg: "npm test", kind: "exec" },
] as const;
const asks = (kind: (typeof ACTIONS)[number]["kind"]) => !!kind && mode.value !== "auto" && !(mode.value === "edits" && kind === "edit");

// mirrors isReadOnlyCommand in packages/cli/src/tools.ts
const READ_ONLY = /^(ls|pwd|cat|head|tail|wc|echo|which|whoami|date|tree|git (status|diff|log|show))(\s|$)/;
const readOnly = (cmd: string) => READ_ONLY.test(cmd.trim()) && !/[;&|`$<>(){}\n\\]|--output/.test(cmd);
const command = ref("git diff HEAD~1");
const PRESETS = ["git status", "npm install", "ls; rm -rf ~", "cat .env > /tmp/x"];

const diffView = ref<"diff" | "result">("diff");

const MEMORY_KEY = "kinetra-memory";
const memory = ref<string[]>(
  (() => {
    try {
      return JSON.parse(localStorage.getItem(MEMORY_KEY) ?? "null") ?? DEFAULT_MEMORY;
    } catch {
      return DEFAULT_MEMORY;
    }
  })(),
);
const note = ref("");
function saveMemory() {
  try {
    localStorage.setItem(MEMORY_KEY, JSON.stringify(memory.value));
  } catch {}
}
function remember() {
  const text = note.value.trim();
  if (!text) return;
  memory.value = [...memory.value, text].slice(-7);
  note.value = "";
  saveMemory();
}
function forget(i: number) {
  memory.value = memory.value.filter((_, j) => j !== i);
  if (!memory.value.length) memory.value = [...DEFAULT_MEMORY];
  saveMemory();
}

const contextTab = ref<"KINETRA.md" | "environment">("KINETRA.md");

const SESSIONS = [
  { id: "20261114093012-a1b2", title: "Fix the failing date test", when: "09:30", msgs: 14 },
  { id: "20261113211544-k9x4", title: "Add a dark mode toggle", when: "yesterday", msgs: 22 },
  { id: "20261112160207-p3m8", title: "Write release notes from git log", when: "2 days ago", msgs: 9 },
  { id: "20261110104855-z7q1", title: "Migrate tests to node:test", when: "4 days ago", msgs: 37 },
];
const session = ref(SESSIONS[0]);
const { copied, copy } = useCopy();
const resumeCmd = computed(() => `kinetra -r ${session.value.id}`);

const tools = computed(() => live.tools);
</script>

<script lang="ts">
const DEFAULT_MEMORY = ["uses pnpm, never npm", "tests sit next to source as *.test.ts", "prefers small commits with plain messages"];
</script>

<template>
  <section id="toolkit" class="section toolkit">
    <div class="wrap">
      <div class="section-head reveal">
        <div>
          <p class="kicker mono"><b>02</b> genesis toolkit · v1.0</p>
          <h2 class="h2">Everything it needs to do real work</h2>
        </div>
        <p class="lede">
          One lightweight CLI. Your model, your keys, your files. Every piece below is in the open-source build you install today.
        </p>
      </div>

      <div class="tiles">
        <article class="card tile s7 reveal">
          <div>
            <h3>Bring your own model</h3>
            <p class="desc">Eight providers built in, plus any OpenAI-compatible endpoint. Keys stay on your machine.</p>
          </div>
          <div class="providers">
            <Keycap
              v-for="p in PROVIDERS"
              :key="p.name"
              :label="p.name"
              :pressed="provider.name === p.name"
              :tone="provider.name === p.name ? 'accent' : undefined"
              @click="provider = p"
              @mouseenter="provider = p"
            />
          </div>
          <div class="screen fill">
            <p><span class="ink">$</span> kinetra --provider {{ provider.name }}</p>
            <p class="ac">◢◤ K I N E T R A <span class="mute">v1.0.0-testnet.1</span></p>
            <p>
              <span class="ac">●</span> {{ provider.name }}/{{ provider.model }}
              <span class="mute">· {{ provider.key ? `key from ${provider.key}` : "local, no key needed" }}</span>
            </p>
            <p class="mute">› /provider and /model switch mid-session, the history stays</p>
            <p class="mute">› keys live in ~/.kinetra/config.json, readable only by you</p>
          </div>
        </article>

        <article class="card tile s5 reveal" data-delay="0.05">
          <div class="row">
            <h3>Execution approval</h3>
            <div class="seg" role="radiogroup" aria-label="Approval mode">
              <button v-for="m in ['ask', 'edits', 'auto'] as Mode[]" :key="m" type="button" role="radio" :aria-checked="mode === m" :class="{ on: mode === m }" @click="mode = m">
                {{ m }}
              </button>
            </div>
          </div>
          <p class="desc">Pick how much runs on its own. Sensitive actions wait for your key.</p>
          <ul class="rows">
            <li v-for="a in ACTIONS" :key="a.tool + a.arg">
              <span class="mono"><span class="ink">{{ a.tool }}</span> {{ a.arg }}</span>
              <span class="state mono" :class="{ asks: asks(a.kind) }">
                <CirclePause v-if="asks(a.kind)" :size="16" :stroke-width="1.5" />
                <CirclePlay v-else :size="16" :stroke-width="1.5" />
                {{ asks(a.kind) ? "asks" : "runs" }}
              </span>
            </li>
          </ul>
        </article>

        <article class="card tile s5 reveal">
          <div>
            <h3>Terminal execution, guarded</h3>
            <p class="desc">Read-only commands with no shell operators run straight away. Anything else asks first. Try one.</p>
          </div>
          <label class="cmd mono">
            <span class="ink">$</span>
            <input v-model="command" spellcheck="false" aria-label="Command to check" maxlength="80" />
          </label>
          <p class="verdict mono" :class="readOnly(command) ? 'ok' : 'hold'">
            <CirclePlay v-if="readOnly(command)" :size="16" :stroke-width="1.5" />
            <CirclePause v-else :size="16" :stroke-width="1.5" />
            {{ command.trim() ? (readOnly(command) ? "runs without asking" : "asks before running") : "type a command" }}
          </p>
          <div class="presets">
            <button v-for="p in PRESETS" :key="p" type="button" class="chip mono" @click="command = p">{{ p }}</button>
          </div>
        </article>

        <article class="card tile s7 reveal" data-delay="0.05">
          <div class="row">
            <div>
              <h3>Writes code, shows the diff</h3>
              <p class="desc">Generate, explain, review and fix code. Every edit is previewed, and git_diff runs before a commit.</p>
            </div>
            <div class="seg" role="radiogroup" aria-label="View">
              <button v-for="v in ['diff', 'result'] as const" :key="v" type="button" role="radio" :aria-checked="diffView === v" :class="{ on: diffView === v }" @click="diffView = v">
                {{ v }}
              </button>
            </div>
          </div>
          <div class="screen diff">
            <template v-if="diffView === 'diff'">
              <p class="mute">src/date.ts | 3 ++-</p>
              <p class="mute">@@ -4,3 +4,4 @@ export function formatDate(d: Date) {</p>
              <p class="del">- return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;</p>
              <p class="add">+ const pad = (n: number) => String(n).padStart(2, "0");</p>
              <p class="add">+ return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;</p>
              <p>&nbsp; }</p>
            </template>
            <template v-else>
              <p><span class="ink">$</span> npm test</p>
              <p class="add">✓ formatDate pads month and day</p>
              <p class="add">✓ 24 passed in 1.8s</p>
              <p class="mute">ready to commit: fix(date): zero-pad month and day</p>
            </template>
          </div>
        </article>

        <article class="card tile s5 reveal">
          <div>
            <h3>Memory you can edit</h3>
            <p class="desc">Plain Markdown in .kinetra/memory.md. Add a note, KINETRA reads it next session.</p>
          </div>
          <ul class="memory mono">
            <li v-for="(m, i) in memory" :key="m + i">
              <span>- {{ m }}</span>
              <button type="button" :aria-label="`Forget ${m}`" @click="forget(i)"><X :size="14" :stroke-width="1.5" /></button>
            </li>
          </ul>
          <form class="cmd mono" @submit.prevent="remember">
            <span class="ink">+</span>
            <input v-model="note" placeholder="remember…" maxlength="80" aria-label="New memory" />
            <Keycap label="Enter" :disabled="!note.trim()">↵</Keycap>
          </form>
        </article>

        <article class="card tile s7 reveal" data-delay="0.05">
          <div class="row">
            <div>
              <h3>Context it keeps</h3>
              <p class="desc">Project rules from KINETRA.md, your environment and memory load into every turn.</p>
            </div>
            <div class="seg" role="radiogroup" aria-label="Context">
              <button v-for="t in ['KINETRA.md', 'environment'] as const" :key="t" type="button" role="radio" :aria-checked="contextTab === t" :class="{ on: contextTab === t }" @click="contextTab = t">
                {{ t }}
              </button>
            </div>
          </div>
          <div class="screen">
            <template v-if="contextTab === 'KINETRA.md'">
              <p class="ink"># Project instructions for KINETRA</p>
              <p>## Commands</p>
              <p>- build: pnpm build</p>
              <p>- test: pnpm test</p>
              <p>## Rules</p>
              <p>- never touch migrations/ without asking</p>
            </template>
            <template v-else>
              <p>os <span class="ink">Darwin 25.1</span></p>
              <p>shell <span class="ink">/bin/zsh</span></p>
              <p>project <span class="ink">~/code/acme-app</span></p>
              <p>git branch <span class="ink">feat/dark-mode</span></p>
              <p>loaded <span class="ink">KINETRA.md · 3 memory notes · 8 tools</span></p>
            </template>
          </div>
        </article>

        <article class="card tile s5 reveal">
          <div>
            <h3>Sessions that resume</h3>
            <p class="desc">Every conversation is saved. Pick up any task where you left it.</p>
          </div>
          <ul class="sessions">
            <li v-for="s in SESSIONS" :key="s.id">
              <button type="button" :class="{ on: session.id === s.id }" @click="session = s">
                <span>{{ s.title }}</span>
                <span class="mono mute">{{ s.when }} · {{ s.msgs }} msgs</span>
              </button>
            </li>
          </ul>
          <button type="button" class="cmd mono copyable" @click="copy(resumeCmd)">
            <span class="ink">$</span>
            <span class="grow">{{ resumeCmd }}</span>
            <Check v-if="copied" :size="14" :stroke-width="1.5" />
            <Copy v-else :size="14" :stroke-width="1.5" />
          </button>
        </article>

        <article class="card tile s7 reveal" data-delay="0.05">
          <div class="row">
            <div>
              <h3>Tools, registered onchain</h3>
              <p class="desc">Built-in tools are listed in KinetraToolRegistry with the sha256 of their manifest. Add your own in ~/.kinetra/tools.</p>
            </div>
            <a class="meta" href="#onchain">{{ tools.length }} registered</a>
          </div>
          <ul class="tools mono">
            <li v-for="t in tools" :key="t.name">
              <span class="ink">{{ t.name }}</span>
              <span class="mute hash">{{ short(t.manifestHash, 10, 6) }}</span>
              <span v-if="t.verified" class="ok"><BadgeCheck :size="14" :stroke-width="1.5" /> verified</span>
              <a :href="t.manifestURI" target="_blank" rel="noopener" :aria-label="`${t.name} manifest`"><ExternalLink :size="14" :stroke-width="1.5" /></a>
            </li>
          </ul>
        </article>
      </div>
    </div>
  </section>
</template>

<style scoped>
.toolkit {
  background: var(--bg);
  padding-top: 32px;
}
.tiles {
  display: grid;
  grid-template-columns: repeat(12, minmax(0, 1fr));
  gap: 16px;
}
.s5 {
  grid-column: span 5;
}
.s7 {
  grid-column: span 7;
}
.row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}
.row h3 + .desc {
  margin-top: 8px;
}
.tile > div > h3 + .desc {
  margin-top: 8px;
}
.ink {
  color: var(--text);
}
.ac {
  color: var(--accent);
}
.mute {
  color: var(--muted);
}
.add {
  color: var(--pos);
}
.del {
  color: var(--neg);
}
.fill {
  flex: 1;
}
.providers {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.rows,
.sessions,
.memory,
.tools {
  list-style: none;
  margin: 0;
  padding: 0;
}
.rows li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  height: 40px;
  border-top: 1px solid var(--line);
  font-size: 12px;
  color: var(--muted);
}
.state {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--pos);
  transition: color var(--fast) var(--ease);
}
.state.asks {
  color: var(--warn);
}
.cmd {
  display: flex;
  align-items: center;
  gap: 10px;
  height: 44px;
  padding: 0 6px 0 14px;
  border-radius: var(--r-ctl);
  border: 1px solid var(--line-2);
  background: var(--bg-deep);
  font-size: 13px;
  color: var(--muted);
  transition: border-color var(--fast) var(--ease);
}
.cmd:focus-within,
.cmd:hover {
  border-color: var(--accent);
}
.cmd input {
  flex: 1;
  min-width: 0;
  height: 100%;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--text);
  font: inherit;
}
.copyable {
  width: 100%;
  cursor: pointer;
  text-align: left;
  padding-right: 14px;
}
.grow {
  flex: 1;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.verdict {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  font-size: 13px;
}
.verdict.ok {
  color: var(--pos);
}
.verdict.hold {
  color: var(--warn);
}
.presets {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.chip {
  height: 28px;
  padding: 0 10px;
  border-radius: 6px;
  border: 1px solid var(--line);
  background: var(--raised);
  color: var(--text-2);
  font-size: 12px;
  cursor: pointer;
  transition:
    color var(--fast) var(--ease),
    border-color var(--fast) var(--ease);
}
.chip:hover {
  color: var(--text);
  border-color: var(--line-2);
}
.diff p {
  padding: 0 8px;
  margin: 0 -8px;
  border-radius: 4px;
  transition: background-color var(--fast) var(--ease);
}
.diff p:hover {
  background: var(--raised);
}
.memory li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-height: 32px;
  font-size: 12px;
  color: var(--text-2);
}
.memory button {
  width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  opacity: 0;
  transition:
    opacity var(--fast) var(--ease),
    color var(--fast) var(--ease);
}
.memory li:hover button,
.memory button:focus-visible {
  opacity: 1;
}
.memory button:hover {
  color: var(--neg);
}
.sessions {
  display: grid;
  gap: 2px;
}
.sessions button {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  width: 100%;
  height: 36px;
  padding: 0 10px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  font-size: 14px;
  text-align: left;
  cursor: pointer;
  transition: background-color var(--fast) var(--ease);
}
.sessions button span:first-child {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sessions button span:last-child {
  flex: none;
  font-size: 12px;
}
.sessions button:hover,
.sessions button.on {
  background: var(--raised);
}
.sessions button.on {
  box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.06);
}
.tools li {
  display: grid;
  grid-template-columns: 120px minmax(0, 1fr) auto 28px;
  align-items: center;
  gap: 12px;
  height: 36px;
  border-top: 1px solid var(--line);
  font-size: 12px;
}
.hash {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ok {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--pos);
}
.tools a {
  display: grid;
  place-items: center;
  height: 28px;
  border-radius: 6px;
  color: var(--muted);
  transition: color var(--fast) var(--ease);
}
.tools a:hover {
  color: var(--accent);
}
a.meta:hover {
  color: var(--accent);
}

@media (max-width: 1000px) {
  .s5,
  .s7 {
    grid-column: span 6;
  }
}
@media (max-width: 720px) {
  .s5,
  .s7 {
    grid-column: 1 / -1;
  }
  .row {
    flex-direction: column;
  }
  .tools li {
    grid-template-columns: 110px minmax(0, 1fr) 28px;
  }
  .tools .ok {
    display: none;
  }
}
</style>
