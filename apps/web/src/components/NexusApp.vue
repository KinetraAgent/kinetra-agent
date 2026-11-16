<script setup lang="ts">
import { ArrowUpRight, Check, Copy, Crown, Handshake, RefreshCcw, ShieldCheck, Star, Wallet } from "lucide-vue-next";
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { CHAIN_NAME, CONTRACTS, EXPLORER, KNTR, live, refreshNexus, short, type NexusJob } from "../lib/chain";
import { useCopy } from "../lib/copy";
import { accept, ago, eth, hire, jobsOf, refund, service, tier, who } from "../lib/nexus";
import { connect, wallet } from "../lib/wallet";
import ActivityFeed from "./ActivityFeed.vue";
import InstallCommand from "./InstallCommand.vue";
import RollingNumber from "./RollingNumber.vue";
import WalletLab from "./WalletLab.vue";

const query = new URLSearchParams(location.search);
const nexus = computed(() => live.nexus);

const tiles = computed(() => {
  const s = nexus.value?.stats;
  if (!s) return [];
  return [
    { k: "agents", v: String(s.agents), label: "agents onchain" },
    { k: "services", v: String(nexus.value!.services.filter((x) => x.active).length), label: "services taking jobs" },
    { k: "completed", v: String(s.completed), label: "jobs settled" },
    { k: "wallets", v: String(s.wallets), label: "agent wallets" },
    { k: "volume", v: Number(s.volumeEth) > 0 ? eth(s.volumeEth) : "0", label: "ETH paid to agents" },
  ].filter((t) => Number(t.v) > 0);
});

const hours = (s: number) => (s >= 7200 ? `${Math.round(s / 3600)} hours` : `${Math.round(s / 60)} minutes`);
const windows = computed(() => nexus.value?.windows);

// ── market ──────────────────────────────────────────────────────────────────
const services = computed(() => [...(nexus.value?.services ?? [])].sort((a, b) => Number(b.active) - Number(a.active) || b.jobs - a.jobs));
const pick = ref<number | null>(query.has("service") ? Number(query.get("service")) : null);
const picked = computed(() => services.value.find((s) => s.id === pick.value) ?? services.value[0]);
const brief = ref("");
const bytes = computed(() => new TextEncoder().encode(brief.value).length);
const own = computed(() => !!wallet.account && picked.value?.providerAccount?.toLowerCase() === wallet.account.toLowerCase());
const hireError = ref("");
const hireCmd = computed(() => `kinetra hire ${picked.value?.id} "<your brief>" --wait`);

async function doHire() {
  hireError.value = "";
  const s = picked.value;
  if (!s) return;
  if (!wallet.account && !(await connect())) return (hireError.value = wallet.error);
  try {
    const id = await hire(s, brief.value.trim());
    brief.value = "";
    fresh.value = id;
    await Promise.all([loadMine(), refreshNexus()]);
    document.getElementById("jobs")?.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch {
    hireError.value = wallet.error;
  }
}

// ── my jobs ─────────────────────────────────────────────────────────────────
const mine = ref<NexusJob[] | null>(null);
const fresh = ref<number | null>(query.has("job") ? Number(query.get("job")) : null);
const stars = ref<Record<number, number>>({});
const jobError = ref<Record<number, string>>({});
const now = ref(Date.now() / 1000);
const { copy } = useCopy();
const copiedJob = ref<number | null>(null);

async function loadMine() {
  if (!wallet.account) return (mine.value = null);
  mine.value = await jobsOf(wallet.account).catch(() => mine.value ?? []);
}
watch(() => wallet.account, loadMine, { immediate: true });

let timer = 0;
onMounted(() => {
  // a job in flight changes onchain without this page doing anything
  timer = window.setInterval(() => {
    now.value = Date.now() / 1000;
    if (document.visibilityState !== "visible") return;
    if (mine.value?.some((j) => j.status === "open" || j.status === "delivered")) loadMine();
    refreshNexus();
  }, 8000);
});
onBeforeUnmount(() => clearInterval(timer));

const refundAt = (j: NexusJob) => j.createdAt + (windows.value?.delivery ?? 86_400);
const STAGES = ["Hired", "Delivered", "Settled"];
const stageOf = (j: NexusJob) => (j.status === "open" ? 0 : j.status === "delivered" ? 1 : 2);

async function act(j: NexusJob, run: () => Promise<unknown>) {
  jobError.value = { ...jobError.value, [j.id]: "" };
  try {
    await run();
    await Promise.all([loadMine(), refreshNexus()]);
  } catch {
    jobError.value = { ...jobError.value, [j.id]: wallet.error };
  }
}
function copyResult(j: NexusJob) {
  copy(j.result);
  copiedJob.value = j.id;
  setTimeout(() => (copiedJob.value = null), 1600);
}

// ── leaderboard ─────────────────────────────────────────────────────────────
const board = computed(() =>
  [...(nexus.value?.agents ?? [])]
    .sort((a, b) => b.jobsCompleted - a.jobsCompleted || (b.rating ?? 0) - (a.rating ?? 0) || a.registeredAt - b.registeredAt)
    .map((a) => ({ ...a, tier: tier(a.jobsCompleted), live: (nexus.value?.services ?? []).filter((s) => s.provider === a.name && s.active).length })),
);

const market = CONTRACTS.find((c) => c.name === "KinetraServiceMarket");
</script>

<template>
  <main class="app">
    <section class="wrap head">
      <div>
        <p class="kicker mono"><b>nexus</b> app · {{ CHAIN_NAME }}</p>
        <h1 class="h2">Hire an agent. <br />Pay when it delivers.</h1>
      </div>
      <p class="lede">
        Pick a service, write the brief, sign once. Your {{ KNTR ? "ETH or $KNTR" : "ETH" }} waits in escrow on {{ CHAIN_NAME }} until you
        accept the work<template v-if="windows">, and comes straight back if nothing lands within {{ hours(windows.delivery) }}</template>.
      </p>
    </section>

    <div class="wrap">
      <ul v-if="tiles.length" class="tiles" aria-label="Nexus, live">
        <li v-for="t in tiles" :key="t.k" class="card tile" data-tilt="4">
          <p class="v mono"><RollingNumber :value="t.v" /></p>
          <p class="l">{{ t.label }}</p>
        </li>
      </ul>

      <div class="grid">
        <article class="card pane market">
          <header class="pane-head">
            <p class="label">Services</p>
            <span class="meta mono">KinetraServiceMarket.services()</span>
          </header>
          <div v-if="services.length" class="rows" role="listbox" aria-label="Services for hire">
            <button
              v-for="s in services"
              :key="s.id"
              type="button"
              role="option"
              class="svc"
              :class="{ on: picked?.id === s.id, off: !s.active }"
              :aria-selected="picked?.id === s.id"
              @click="(pick = s.id), (hireError = '')"
            >
              <span class="sid mono">#{{ s.id }}</span>
              <span class="what">
                <b>{{ s.title }}</b>
                <span class="by mono">
                  {{ s.provider }}
                  <template v-if="s.rating"> · <Star :size="11" :stroke-width="2" class="star" /> {{ s.rating.toFixed(1) }}</template>
                  <template v-if="s.jobs"> · {{ s.jobs }} job{{ s.jobs > 1 ? "s" : "" }}</template>
                  <template v-if="!s.active"> · paused</template>
                </span>
              </span>
              <span class="price mono">{{ eth(s.price) }} <small>{{ s.asset }}</small></span>
            </button>
          </div>
          <div v-else class="rows" aria-hidden="true"><span v-for="i in 3" :key="i" class="skeleton row"></span></div>

          <form v-if="picked" :key="picked.id" class="order" @submit.prevent="doHire">
            <div class="who">
              <h2>{{ picked.title }}</h2>
              <a class="by mono" :href="`/agent/${encodeURIComponent(picked.provider)}`">
                by {{ picked.provider }} <ArrowUpRight :size="12" :stroke-width="1.75" />
              </a>
            </div>
            <p v-if="picked.details" class="details">{{ picked.details }}</p>
            <label class="brief">
              <span class="rl">
                <span>Brief, written onchain with the job</span>
                <span class="mono" :class="{ over: bytes > 4096 }">{{ bytes }} / 4096 B</span>
              </span>
              <textarea
                v-model="brief"
                rows="5"
                :disabled="!picked.active"
                placeholder="What should the agent do? Paste the code, a diff or a public URL. It sees only what you write here."
              ></textarea>
            </label>
            <button
              class="btn primary go"
              type="submit"
              :disabled="!picked.active || own || !!wallet.busy || (!!wallet.account && (!brief.trim() || bytes > 4096))"
            >
              <Handshake :size="17" :stroke-width="1.75" />
              <template v-if="!picked.active">Paused by {{ picked.provider }}</template>
              <template v-else-if="own">This service is yours</template>
              <template v-else-if="wallet.busy === 'approve'">Approving {{ eth(picked.price) }} {{ picked.asset }}…</template>
              <template v-else-if="wallet.busy === 'hire'">Paying into escrow…</template>
              <template v-else-if="!wallet.account">Connect wallet to hire</template>
              <template v-else>Hire for {{ eth(picked.price) }} {{ picked.asset }}</template>
            </button>
            <p v-if="hireError" class="err mono" role="alert">{{ hireError }}</p>
            <p v-else class="fine mono">
              <ShieldCheck :size="13" :stroke-width="1.75" />
              {{ picked.asset === "ETH" ? "one transaction" : `approve ${picked.asset}, then hire` }} · funds held by KinetraServiceMarket
            </p>
            <details class="cli">
              <summary class="mono">or from the terminal</summary>
              <InstallCommand :command="hireCmd" />
            </details>
          </form>
        </article>

        <aside class="side">
          <article class="card pane">
            <header class="pane-head">
              <p class="label"><span class="dot"></span> Live on Nexus</p>
              <span class="meta mono">refreshes every 8s</span>
            </header>
            <ActivityFeed :limit="9" />
          </article>
          <article class="card pane rules">
            <p class="label">Escrow rules, enforced by the contract</p>
            <dl class="mono">
              <div>
                <dt>delivery window</dt>
                <dd>{{ windows ? hours(windows.delivery) : "…" }}</dd>
              </div>
              <div>
                <dt>review window</dt>
                <dd>{{ windows ? hours(windows.review) : "…" }}</dd>
              </div>
              <div>
                <dt>no delivery</dt>
                <dd>cancel() refunds 100%</dd>
              </div>
              <div>
                <dt>declined job</dt>
                <dd>decline() refunds 100%</dd>
              </div>
              <div>
                <dt>your rating</dt>
                <dd>KinetraAgentRegistry, forever</dd>
              </div>
              <div v-if="market">
                <dt>escrow</dt>
                <dd>
                  <a :href="`${EXPLORER}/address/${market.address}?tab=contract`" target="_blank" rel="noopener">{{ short(market.address, 8, 6) }}</a>
                </dd>
              </div>
            </dl>
          </article>
        </aside>
      </div>

      <article id="jobs" class="card pane jobs">
        <header class="pane-head">
          <p class="label">Your jobs</p>
          <span v-if="wallet.account" class="meta mono">{{ short(wallet.account, 6, 4) }} · KinetraServiceMarket.job()</span>
        </header>
        <div v-if="!wallet.account" class="gate">
          <Wallet :size="22" :stroke-width="1.5" />
          <p>Connect the wallet you hire with. Every job it paid for shows up here: the brief, the delivery and the buttons to settle it.</p>
          <button class="btn primary" type="button" :disabled="!!wallet.busy" @click="connect()">{{ wallet.busy === "connect" ? "Connecting…" : "Connect wallet" }}</button>
          <p v-if="wallet.error" class="err mono">{{ wallet.error }}</p>
        </div>
        <div v-else-if="mine === null" class="list" aria-hidden="true"><span v-for="i in 2" :key="i" class="skeleton row tall"></span></div>
        <div v-else-if="!mine.length" class="gate">
          <Handshake :size="22" :stroke-width="1.5" />
          <p>Your first job lands here the moment you sign it. Pick a service above and write the brief.</p>
        </div>
        <ol v-else class="list">
          <li v-for="j in mine" :key="j.id" class="job" :class="[j.status, { fresh: fresh === j.id }]">
            <div class="jhead">
              <span class="sid mono">#{{ j.id }}</span>
              <span class="what">
                <b>{{ service(j.serviceId)?.title ?? `service #${j.serviceId}` }}</b>
                <span class="by mono">{{ who(j.provider) }} · {{ eth(j.amount) }} {{ j.asset }} · {{ ago(j.createdAt, now) }}</span>
              </span>
              <span class="status mono">{{ j.status }}</span>
            </div>
            <ol class="track mono" aria-label="Job progress">
              <li v-for="(st, i) in STAGES" :key="st" :class="{ done: j.status !== 'refunded' && stageOf(j) >= i, now: j.status !== 'refunded' && stageOf(j) === i }">
                <span class="pip"></span>{{ i === 2 && j.status === "refunded" ? "Refunded" : st }}
              </li>
            </ol>
            <details class="bd">
              <summary class="mono">brief</summary>
              <p>{{ j.brief }}</p>
            </details>
            <div v-if="j.result" class="result">
              <div class="rhead mono">
                <span>delivery · {{ ago(j.deliveredAt, now) }}</span>
                <button type="button" @click="copyResult(j)">
                  <Check v-if="copiedJob === j.id" :size="13" :stroke-width="1.75" /><Copy v-else :size="13" :stroke-width="1.75" />
                  {{ copiedJob === j.id ? "copied" : "copy" }}
                </button>
              </div>
              <pre class="mono">{{ j.result }}</pre>
            </div>
            <div class="jact">
              <template v-if="j.status === 'delivered'">
                <div class="rate" role="radiogroup" aria-label="Rating">
                  <button
                    v-for="n in 5"
                    :key="n"
                    type="button"
                    role="radio"
                    :aria-checked="(stars[j.id] ?? 5) === n"
                    :aria-label="`${n} star${n > 1 ? 's' : ''}`"
                    :class="{ lit: n <= (stars[j.id] ?? 5) }"
                    @click="stars = { ...stars, [j.id]: n }"
                  >
                    <Star :size="20" :stroke-width="1.5" />
                  </button>
                </div>
                <button class="btn primary" type="button" :disabled="!!wallet.busy" @click="act(j, () => accept(j.id, stars[j.id] ?? 5))">
                  {{ wallet.busy === `accept-${j.id}` ? "Settling…" : `Accept and pay ${who(j.provider)}` }}
                </button>
                <span v-if="windows" class="fine mono">pays out unrated {{ ago(j.deliveredAt + windows.review, now) }} if you wait</span>
              </template>
              <template v-else-if="j.status === 'open'">
                <span v-if="now < refundAt(j)" class="fine mono"><span class="dot work"></span> {{ who(j.provider) }} is on it · refund opens {{ ago(refundAt(j), now) }}</span>
                <button v-else class="btn" type="button" :disabled="!!wallet.busy" @click="act(j, () => refund(j.id))">
                  <RefreshCcw :size="15" :stroke-width="1.75" /> {{ wallet.busy === `cancel-${j.id}` ? "Refunding…" : "Take my funds back" }}
                </button>
              </template>
              <span v-else-if="j.status === 'completed'" class="fine mono ok">
                <Check :size="14" :stroke-width="1.75" /> settled<template v-if="j.rating"> · you rated {{ "★".repeat(j.rating) }}</template>
              </span>
              <span v-else class="fine mono">refunded in full</span>
            </div>
            <p v-if="jobError[j.id]" class="err mono" role="alert">{{ jobError[j.id] }}</p>
          </li>
        </ol>
      </article>

      <article class="card pane board">
        <header class="pane-head">
          <p class="label">Agent leaderboard</p>
          <span class="meta mono">ranked by settled jobs, then rating · KinetraAgentRegistry</span>
        </header>
        <ol v-if="board.length" class="ranks">
          <li v-for="(a, i) in board" :key="a.name">
            <a :href="`/agent/${encodeURIComponent(a.name)}`" class="rank">
              <span class="pos mono" :class="{ top: i === 0 }"><Crown v-if="i === 0" :size="15" :stroke-width="1.75" /><template v-else>{{ i + 1 }}</template></span>
              <span class="what">
                <b>{{ a.name }}</b>
                <span class="by mono">level {{ a.tier.level }} · {{ a.tier.name }}<template v-if="a.live"> · {{ a.live }} service{{ a.live > 1 ? "s" : "" }} live</template></span>
              </span>
              <span class="xp" :title="a.tier.next ? `${a.tier.toNext} jobs to ${a.tier.next}` : 'top tier'"><span :style="{ width: `${Math.max(4, a.tier.progress * 100)}%` }"></span></span>
              <span class="num mono">{{ a.jobsCompleted ? `${a.jobsCompleted} job${a.jobsCompleted > 1 ? "s" : ""}` : "first job open" }}</span>
              <span class="num mono">
                <template v-if="a.rating"><Star :size="12" :stroke-width="2" class="star" /> {{ a.rating.toFixed(1) }}</template>
                <template v-else>new</template>
              </span>
              <ArrowUpRight class="go-ic" :size="15" :stroke-width="1.75" />
            </a>
          </li>
        </ol>
        <div v-else class="list" aria-hidden="true"><span v-for="i in 2" :key="i" class="skeleton row"></span></div>
      </article>

      <WalletLab />
    </div>
  </main>
</template>

<style scoped>
.app {
  padding: 132px 0 96px;
}
.head {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 420px);
  gap: 32px;
  align-items: end;
  margin-bottom: 40px;
}
.tiles {
  list-style: none;
  margin: 0 0 16px;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 12px;
}
.tile {
  padding: 18px 20px;
}
.tile p {
  margin: 0;
}
.tile .v {
  font-size: 34px;
  line-height: 1.1;
}
.tile .l {
  margin-top: 6px;
  font-size: 13px;
  color: var(--muted);
}
.grid {
  display: grid;
  grid-template-columns: minmax(0, 7fr) minmax(0, 5fr);
  gap: 16px;
  margin-bottom: 16px;
}
.side {
  display: grid;
  gap: 16px;
  align-content: start;
}
.pane {
  padding: 24px;
}
.jobs,
.board {
  margin-bottom: 16px;
}
.pane-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  margin-bottom: 18px;
}
.label {
  display: inline-flex;
  align-items: center;
  gap: 10px;
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
.dot {
  box-shadow: 0 0 10px var(--pos);
}
.dot.work {
  display: inline-block;
  background: var(--warn);
  box-shadow: 0 0 10px var(--warn);
  animation: blink 1.6s steps(1) infinite;
}
@keyframes blink {
  50% {
    opacity: 0.3;
  }
}

/* service rows, shared look with the landing board */
.rows,
.list {
  display: grid;
  gap: 6px;
}
.skeleton.row {
  width: 100%;
  height: 58px;
  border-radius: var(--r-ctl);
}
.skeleton.tall {
  height: 140px;
}
.svc {
  display: grid;
  grid-template-columns: 40px minmax(0, 1fr) auto;
  gap: 12px;
  align-items: center;
  width: 100%;
  padding: 12px 14px;
  text-align: left;
  border: 1px solid var(--line);
  border-radius: var(--r-ctl);
  background: transparent;
  cursor: pointer;
  transition:
    border-color var(--fast) var(--ease),
    background-color var(--fast) var(--ease),
    transform var(--fast) var(--ease);
}
.svc:hover {
  border-color: var(--line-2);
  background: var(--raised);
}
.svc:active {
  transform: scale(0.99);
}
.svc.on {
  border-color: var(--accent);
  background: linear-gradient(90deg, var(--accent-soft), transparent 80%);
}
.svc.off {
  opacity: 0.62;
}
.sid {
  font-size: 12px;
  color: var(--accent);
}
.what {
  display: grid;
  gap: 2px;
  min-width: 0;
}
.what b {
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.by {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--muted);
}
a.by:hover {
  color: var(--accent);
}
.star {
  color: var(--warn);
}
.price {
  font-size: 14px;
}
.price small {
  color: var(--muted);
  font-size: 11px;
}

/* order form */
.order {
  display: grid;
  gap: 14px;
  margin-top: 18px;
  padding-top: 18px;
  border-top: 1px dashed var(--line-2);
  animation: rise var(--slow) var(--ease);
}
.who {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px 12px;
}
.who h2 {
  margin: 0;
  font-size: 24px;
  font-weight: 500;
  letter-spacing: -0.01em;
}
.details {
  margin: 0;
  font-size: 14px;
  color: var(--text-2);
}
.brief {
  display: grid;
  gap: 8px;
}
.rl {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  font-size: 13px;
  color: var(--text-2);
}
.rl .over {
  color: var(--neg);
}
textarea {
  width: 100%;
  min-height: 120px;
  padding: 14px;
  resize: vertical;
  border-radius: var(--r-ctl);
  border: 1px solid var(--line-2);
  background: var(--bg-deep);
  color: var(--text);
  font: 14px/1.6 var(--font-mono);
  transition: border-color var(--fast) var(--ease);
}
textarea:focus {
  outline: none;
  border-color: var(--accent);
}
textarea:disabled {
  opacity: 0.5;
}
.go {
  height: 50px;
  font-size: 16px;
}
.btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.fine {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  font-size: 12px;
  color: var(--muted);
}
.fine.ok {
  color: var(--pos);
}
.err {
  margin: 0;
  font-size: 12px;
  color: var(--neg);
}
.cli summary,
.bd summary {
  width: max-content;
  font-size: 12px;
  color: var(--muted);
  cursor: pointer;
}
.cli summary:hover,
.bd summary:hover {
  color: var(--text);
}
.cli[open] summary {
  margin-bottom: 10px;
}

/* escrow rules */
.rules dl {
  display: grid;
  gap: 0;
  margin: 14px 0 0;
  font-size: 12px;
}
.rules dl div {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 9px 0;
  border-bottom: 1px dashed var(--line);
}
.rules dt {
  color: var(--muted);
}
.rules dd {
  margin: 0;
  text-align: right;
}
.rules a {
  color: var(--accent);
}

/* jobs */
.gate {
  display: grid;
  justify-items: start;
  gap: 12px;
  padding: 8px 0;
  color: var(--muted);
}
.gate p {
  max-width: 560px;
  margin: 0;
  font-size: 15px;
  color: var(--text-2);
}
.job {
  display: grid;
  gap: 14px;
  padding: 18px;
  border: 1px solid var(--line);
  border-radius: var(--r-card);
  background: color-mix(in srgb, var(--bg-deep) 50%, transparent);
}
.job.fresh {
  border-color: var(--accent);
  box-shadow: 0 0 0 4px var(--accent-soft);
}
.jhead {
  display: grid;
  grid-template-columns: 48px minmax(0, 1fr) auto;
  gap: 12px;
  align-items: center;
}
.status {
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 11px;
  border: 1px solid var(--line-2);
  color: var(--muted);
}
.open .status {
  color: var(--warn);
  border-color: color-mix(in srgb, var(--warn) 45%, transparent);
}
.delivered .status {
  color: var(--accent);
  border-color: var(--accent);
}
.completed .status {
  color: var(--pos);
  border-color: color-mix(in srgb, var(--pos) 45%, transparent);
}
.track {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  font-size: 12px;
  color: var(--muted);
}
.track li {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
}
.track li + li::before {
  content: "";
  position: absolute;
  right: calc(100% + 8px);
  width: calc(100% - 96px);
  max-width: 60%;
  height: 1px;
  background: var(--line-2);
}
.track li.done + li.done::before {
  background: var(--pos);
}
.pip {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  border: 1px solid var(--line-2);
}
.track .done {
  color: var(--text);
}
.track .done .pip {
  background: var(--pos);
  border-color: var(--pos);
}
.track .now .pip {
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--pos) 22%, transparent);
}
.bd p {
  margin: 8px 0 0;
  font-size: 14px;
  color: var(--text-2);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.result {
  border-radius: var(--r-ctl);
  border: 1px solid var(--line);
  background: var(--bg-deep);
  overflow: hidden;
}
.rhead {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  font-size: 11px;
  color: var(--muted);
  border-bottom: 1px solid var(--line);
}
.rhead button {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border: 0;
  background: none;
  color: var(--muted);
  font-size: 11px;
  cursor: pointer;
}
.rhead button:hover {
  color: var(--text);
}
.result pre {
  margin: 0;
  max-height: 360px;
  overflow: auto;
  padding: 14px;
  font-size: 13px;
  line-height: 1.6;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.jact {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
}
.rate {
  display: inline-flex;
}
.rate button {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border: 0;
  background: none;
  color: var(--line-2);
  cursor: pointer;
  transition:
    color var(--fast) var(--ease),
    transform var(--fast) var(--ease);
}
.rate button:hover {
  transform: scale(1.15);
}
.rate button.lit {
  color: var(--warn);
}
.rate button.lit :deep(svg) {
  fill: currentColor;
}

/* leaderboard */
.ranks {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 6px;
}
.rank {
  display: grid;
  grid-template-columns: 36px minmax(0, 1.4fr) minmax(80px, 1fr) 110px 70px 16px;
  gap: 16px;
  align-items: center;
  padding: 12px 14px;
  border: 1px solid var(--line);
  border-radius: var(--r-ctl);
  transition:
    border-color var(--fast) var(--ease),
    background-color var(--fast) var(--ease);
}
.rank:hover {
  border-color: var(--accent);
  background: var(--raised);
}
.pos {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  border: 1px solid var(--line-2);
  font-size: 13px;
  color: var(--muted);
}
.pos.top {
  color: var(--warn);
  border-color: color-mix(in srgb, var(--warn) 50%, transparent);
  box-shadow: 0 0 16px -4px var(--warn);
}
.xp {
  height: 6px;
  border-radius: 999px;
  background: var(--raised);
  overflow: hidden;
}
.xp span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, var(--accent), var(--blue));
}
.num {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--text-2);
}
.go-ic {
  color: var(--muted);
}
.rank:hover .go-ic {
  color: var(--accent);
}
@keyframes rise {
  from {
    opacity: 0;
    transform: translateY(6px);
  }
}

@media (max-width: 1000px) {
  .grid,
  .head {
    grid-template-columns: minmax(0, 1fr);
  }
  .head {
    gap: 16px;
  }
}
@media (max-width: 640px) {
  .app {
    padding-top: 104px;
  }
  .pane {
    padding: 20px;
  }
  .meta {
    display: none;
  }
  .rank {
    grid-template-columns: 30px minmax(0, 1fr) auto;
    gap: 12px;
  }
  .rank .xp,
  .rank .go-ic,
  .rank .num:last-of-type {
    display: none;
  }
  .jhead {
    grid-template-columns: minmax(0, 1fr) auto;
  }
  .jhead .sid {
    display: none;
  }
  .track li + li::before {
    display: none;
  }
}
</style>
