<script setup lang="ts">
import { Ban, CircleCheck, Coins, Rocket, RotateCcw, ShieldCheck, Wallet } from "lucide-vue-next";
import { isAddress, parseEther, type Hex } from "viem";
import { computed, ref } from "vue";
import { CHAIN_NAME, EXPLORER, live, short } from "../lib/chain";
import { createWallet } from "../lib/nexus";
import { connect, explain, wallet } from "../lib/wallet";
import InstallCommand from "./InstallCommand.vue";

// The simulator mirrors KinetraAgentWallet.spend; the form below deploys a wallet with the same limits.
const perTx = ref(0.01);
const perDay = ref(0.025);
const marketAllowed = ref(true);
const keyLive = ref(true);
const spent = ref(0);
const day = ref(1);
const log = ref<{ id: number; ok: boolean; what: string; why: string }[]>([]);
let logId = 0;

const ACTIONS = computed(() => {
  const [a, b] = (live.nexus?.services ?? []).filter((s) => s.asset === "ETH");
  return [
    { what: `Hire "${a?.title ?? "Code review"}"`, amount: 0.004, to: "market" },
    { what: `Hire "${b?.title ?? "Security sweep"}"`, amount: 0.02, to: "market" },
    { what: "Pay another wallet", amount: 0.002, to: "wallet" },
    { what: "Call a contract nobody allowed", amount: 0, to: "unknown" },
  ] as const;
});
const fmtEth = (n: number) => `${+n.toFixed(4)} ETH`;

function attempt(a: (typeof ACTIONS.value)[number]) {
  const withData = a.to !== "wallet";
  let why = "";
  if (!keyLive.value) why = "NotAgent: the owner revoked this key";
  else if (withData && !(a.to === "market" && marketAllowed.value)) why = "TargetNotAllowed: not on the wallet's allowlist";
  else if (a.amount > perTx.value) why = `OverTxLimit: ${fmtEth(a.amount)} > ${fmtEth(perTx.value)}`;
  else if (spent.value + a.amount > perDay.value + 1e-12) why = `OverDailyLimit: ${fmtEth(spent.value + a.amount)} > ${fmtEth(perDay.value)}`;
  if (!why) spent.value += a.amount;
  log.value = [{ id: ++logId, ok: !why, what: `${a.what}${a.amount ? ` · ${fmtEth(a.amount)}` : ""}`, why: why || "Spent: inside every limit" }, ...log.value].slice(0, 5);
}
function nextDay() {
  spent.value = 0;
  day.value++;
}
const budget = computed(() => Math.min(100, (spent.value / perDay.value) * 100));


const agent = ref("");
const days = ref(30);
const made = ref<Hex | null>(null);
const error = ref("");
const validAgent = computed(() => isAddress(agent.value));

async function deploy() {
  error.value = "";
  if (!wallet.account && !(await connect())) return (error.value = wallet.error);
  if (!validAgent.value) return (error.value = "Paste the agent key address, 0x followed by 40 hex characters");
  try {
    made.value = await createWallet(agent.value as Hex, parseEther(perTx.value.toFixed(6)), parseEther(perDay.value.toFixed(6)), days.value);
  } catch (e) {
    error.value = wallet.error || explain(e);
  }
}
</script>

<template>
  <article class="card pane sim">
    <header class="pane-head">
      <div>
        <p class="label">Spend like an agent</p>
        <p class="simsub">KinetraAgentWallet checks every payment your agent signs. Set the rules, then try to break them.</p>
      </div>
      <span class="meta mono">day {{ day }} · spend(asset, to, amount, data)</span>
    </header>
    <div class="simgrid">
      <div class="rules">
        <label class="rule">
          <span class="rl">Per payment <b class="mono">{{ fmtEth(perTx) }}</b></span>
          <input v-model.number="perTx" type="range" min="0.001" max="0.03" step="0.001" />
        </label>
        <label class="rule">
          <span class="rl">Per UTC day <b class="mono">{{ fmtEth(perDay) }}</b></span>
          <input v-model.number="perDay" type="range" min="0.005" max="0.06" step="0.001" />
        </label>
        <div class="toggles">
          <button type="button" class="tog" :aria-pressed="marketAllowed" @click="marketAllowed = !marketAllowed">
            <ShieldCheck :size="16" :stroke-width="1.5" /> Market on allowlist
          </button>
          <button type="button" class="tog" :aria-pressed="keyLive" @click="keyLive = !keyLive">
            <Wallet :size="16" :stroke-width="1.5" /> Agent key active
          </button>
        </div>
        <div class="budget">
          <div class="bl mono">
            <span>spent today {{ fmtEth(spent) }}</span>
            <span>{{ fmtEth(Math.max(0, perDay - spent)) }} left</span>
          </div>
          <div class="bar" :class="{ full: budget >= 100 }"><span :style="{ width: `${budget}%` }"></span></div>
        </div>
      </div>
      <div class="acts">
        <button v-for="a in ACTIONS" :key="a.what" type="button" class="act" @click="attempt(a)">
          <Coins :size="16" :stroke-width="1.5" />
          <span>{{ a.what }}</span>
          <span class="mono amt">{{ a.amount ? fmtEth(a.amount) : "0 ETH" }}</span>
        </button>
        <button type="button" class="act ghost" @click="nextDay"><RotateCcw :size="16" :stroke-width="1.5" /> Next UTC day, limits reset</button>
      </div>
      <ol class="log mono" aria-live="polite">
        <li v-if="!log.length" class="hint">Each attempt runs the same checks as the contract, in the same order.</li>
        <li v-for="l in log" :key="l.id" :class="l.ok ? 'ok' : 'no'">
          <CircleCheck v-if="l.ok" :size="15" :stroke-width="1.5" />
          <Ban v-else :size="15" :stroke-width="1.5" />
          <span>
            <b>{{ l.what }}</b>
            <span>{{ l.why }}</span>
          </span>
        </li>
      </ol>
    </div>
    <form class="deploy" @submit.prevent="deploy">
      <div class="dhead">
        <p class="label">Deploy it for real</p>
        <p class="simsub">
          Same limits, a live KinetraAgentWallet on {{ CHAIN_NAME }}. Your connected wallet becomes the owner; the agent key is the address
          <code class="mono">kinetra wallet new</code> printed. The market is on its allowlist from block one.
        </p>
      </div>
      <label class="field">
        <span class="rl">Agent key address</span>
        <input v-model.trim="agent" class="mono" placeholder="0x… from kinetra wallet new" spellcheck="false" autocomplete="off" />
      </label>
      <div class="field">
        <span class="rl">Key expires after</span>
        <div class="seg" role="radiogroup" aria-label="Key lifetime">
          <button v-for="d in [7, 30, 90]" :key="d" type="button" role="radio" :aria-checked="days === d" :class="{ on: days === d }" @click="days = d">{{ d }} days</button>
        </div>
      </div>
      <button class="btn primary go" :disabled="!!wallet.busy || (!!wallet.account && !validAgent)" type="submit">
        <Rocket :size="16" :stroke-width="1.75" />
        {{ wallet.busy === "wallet" ? "Deploying…" : wallet.account ? `Deploy · ${fmtEth(perTx)} per payment · ${fmtEth(perDay)} a day` : "Connect wallet to deploy" }}
      </button>
      <p v-if="error" class="err mono" role="alert">{{ error }}</p>
      <div v-if="made" class="made">
        <p class="ok-line"><CircleCheck :size="16" :stroke-width="1.5" /> Wallet live at <a class="mono" :href="`${EXPLORER}/address/${made}`" target="_blank" rel="noopener">{{ short(made, 10, 8) }}</a></p>
        <p class="simsub">Fund it with ETH, then point your agent at it:</p>
        <InstallCommand :command="`kinetra wallet use ${made}`" />
      </div>
    </form>
  </article>
</template>

<style scoped>
.pane {
  padding: 24px;
}
.pane-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  margin-bottom: 18px;
}
.label {
  margin: 0;
  font-size: 15px;
  font-weight: 500;
}
.meta {
  font-size: 12px;
  color: var(--muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
@keyframes rise {
  from {
    opacity: 0;
    transform: translateY(6px);
  }
}
/* simulator */
.sim {
  margin-bottom: 16px;
}
.simsub {
  margin: 4px 0 0;
  font-size: 14px;
  color: var(--text-2);
}
.simgrid {
  display: grid;
  grid-template-columns: minmax(0, 4fr) minmax(0, 4fr) minmax(0, 5fr);
  gap: 20px;
}
.rules {
  display: grid;
  gap: 16px;
  align-content: start;
}
.rule {
  display: grid;
  gap: 8px;
}
.rl {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
  color: var(--text-2);
}
.rl b {
  color: var(--text);
  font-weight: 500;
}
input[type="range"] {
  width: 100%;
  accent-color: var(--accent);
  cursor: pointer;
}
.toggles {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.tog {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  font-size: 13px;
  border: 1px solid var(--line-2);
  border-radius: 999px;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  transition:
    color var(--fast) var(--ease),
    border-color var(--fast) var(--ease),
    background-color var(--fast) var(--ease);
}
.tog[aria-pressed="true"] {
  color: var(--accent);
  border-color: var(--accent);
  background: var(--accent-soft);
}
.budget {
  display: grid;
  gap: 6px;
}
.bl {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  color: var(--muted);
}
.bar {
  height: 8px;
  border-radius: 999px;
  background: var(--raised);
  overflow: hidden;
}
.bar span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, var(--accent), var(--blue));
  transition: width var(--slow) var(--ease);
}
.bar.full span {
  background: var(--warn);
}
.acts {
  display: grid;
  gap: 8px;
  align-content: start;
}
.act {
  display: grid;
  grid-template-columns: 18px minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  padding: 11px 14px;
  font-size: 14px;
  text-align: left;
  border: 1px solid var(--line-2);
  border-bottom-width: 3px;
  border-bottom-color: var(--key-edge);
  border-radius: var(--r-ctl);
  background: var(--key);
  cursor: pointer;
  transition:
    border-color var(--fast) var(--ease),
    transform var(--fast) var(--ease);
}
.act span:nth-child(2) {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.act:hover {
  border-color: var(--accent);
}
.act:active {
  transform: translateY(2px);
  border-bottom-width: 1px;
}
.act.ghost {
  grid-template-columns: 18px 1fr;
  background: transparent;
  color: var(--muted);
}
.amt {
  font-size: 12px;
  color: var(--muted);
}
.log {
  list-style: none;
  margin: 0;
  padding: 14px;
  display: grid;
  gap: 10px;
  align-content: start;
  min-height: 220px;
  border-radius: var(--r-ctl);
  background: var(--bg-deep);
  border: 1px solid var(--line);
  font-size: 12px;
}
.log li {
  display: grid;
  grid-template-columns: 16px minmax(0, 1fr);
  gap: 10px;
  animation: rise var(--mid) var(--ease);
}
.log li span {
  display: grid;
  gap: 2px;
}
.log b {
  font-weight: 500;
  color: var(--text);
}
.log .ok {
  color: var(--pos);
}
.log .no {
  color: var(--neg);
}
.log .hint {
  display: block;
  color: var(--muted);
}


/* deploy */
.deploy {
  display: grid;
  grid-template-columns: minmax(0, 5fr) minmax(0, 4fr) auto;
  gap: 16px 20px;
  align-items: end;
  margin-top: 20px;
  padding-top: 20px;
  border-top: 1px dashed var(--line-2);
}
.dhead {
  grid-column: 1 / -1;
}
.dhead code {
  font-size: 12px;
  color: var(--accent);
}
.field {
  display: grid;
  gap: 8px;
}
.field input {
  height: 44px;
  padding: 0 14px;
  border-radius: var(--r-ctl);
  border: 1px solid var(--line-2);
  background: var(--bg-deep);
  color: var(--text);
  font-size: 13px;
  transition: border-color var(--fast) var(--ease);
}
.field input:focus {
  outline: none;
  border-color: var(--accent);
}
.field .seg button {
  height: 36px;
}
.go {
  white-space: nowrap;
}
.go:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.err {
  grid-column: 1 / -1;
  margin: 0;
  font-size: 12px;
  color: var(--neg);
}
.made {
  grid-column: 1 / -1;
  display: grid;
  gap: 8px;
  animation: rise var(--slow) var(--ease);
}
.ok-line {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  color: var(--pos);
}
.ok-line a {
  color: var(--text);
  text-decoration: underline;
  text-decoration-color: var(--line-2);
  text-underline-offset: 3px;
}

@media (max-width: 1100px) {
  .simgrid {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  }
  .log {
    grid-column: 1 / -1;
    min-height: 0;
  }
  .deploy {
    grid-template-columns: minmax(0, 1fr) auto;
  }
  .go {
    grid-column: 1 / -1;
  }
}
@media (max-width: 640px) {
  .pane {
    padding: 20px;
  }
  .simgrid,
  .deploy {
    grid-template-columns: minmax(0, 1fr);
  }
  .go {
    white-space: normal;
    height: auto;
    min-height: 44px;
    padding: 10px 16px;
  }
  .meta {
    display: none;
  }
}
</style>
