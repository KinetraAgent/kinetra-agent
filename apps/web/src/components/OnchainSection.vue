<script setup lang="ts">
import { BadgeCheck, Check, Copy, ExternalLink } from "lucide-vue-next";
import { computed, ref } from "vue";
import { CHAIN_NAME, CONTRACTS, EXPLORER, fmt, live, short } from "../lib/chain";
import { useCopy } from "../lib/copy";
import RollingNumber from "./RollingNumber.vue";
import TxChart from "./TxChart.vue";

const { copy } = useCopy();
const copiedAddr = ref("");
function copyAddr(a: string) {
  copy(a);
  copiedAddr.value = a;
  setTimeout(() => (copiedAddr.value = ""), 1600);
}

const latestDay = computed(() => live.txDays.at(-1));
const change = computed(() => {
  const [prev, cur] = live.txDays.slice(-2);
  if (!prev || !cur) return null;
  const pct = ((cur.count - prev.count) / prev.count) * 100;
  return { pct: `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`, up: pct >= 0, vs: new Date(prev.date + "T00:00:00Z").toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric" }) };
});
const published = computed(() =>
  live.release ? new Date(live.release.publishedAt * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "",
);
const tarball = computed(() => live.release?.uri.split("/").pop() ?? "");
</script>

<template>
  <section id="onchain" class="section onchain">
    <div class="wrap">
      <div class="section-head reveal" data-n="03">
        <div>
          <p class="kicker mono"><b>03</b> onchain · {{ CHAIN_NAME }}</p>
          <h2 class="h2">Every release, notarized on Robinhood Chain</h2>
        </div>
        <p class="lede">
          The installer hashes the package it downloads and compares it with the checksum stored in KinetraReleaseRegistry. If they
          differ, nothing installs.
        </p>
      </div>

      <div class="grid">
        <article class="card pane chart-pane reveal" data-tilt="2">
          <header class="pane-head">
            <div>
              <p class="label">Daily transactions on {{ CHAIN_NAME }}</p>
              <p v-if="latestDay" class="figure mono">{{ fmt(latestDay.count) }}</p>
              <p v-else class="figure"><span class="skeleton wide"></span></p>
              <p v-if="change" class="change mono" :class="{ up: change.up }">{{ change.pct }} vs {{ change.vs }}</p>
            </div>
            <span class="meta mono">last 30 days · Blockscout</span>
          </header>
          <TxChart v-if="live.txDays.length > 1" :data="live.txDays" />
          <div v-else class="chart-wait" aria-hidden="true"></div>
        </article>

        <article class="card pane verify reveal" data-delay="0.05" data-tilt="3">
          <p class="label">How an install is verified</p>
          <ol>
            <li>
              <span class="n mono">1</span>
              <div>
                <p>Download the package</p>
                <p class="mono sub">{{ tarball || "kinetra-cli.tgz" }}</p>
              </div>
            </li>
            <li>
              <span class="n mono">2</span>
              <div>
                <p>Hash it locally</p>
                <p class="mono sub">sha256(package)</p>
              </div>
            </li>
            <li>
              <span class="n mono">3</span>
              <div>
                <p>Read the notarized checksum</p>
                <p class="mono sub">KinetraReleaseRegistry.latest()</p>
                <p v-if="live.release" class="mono sub ink">v{{ live.release.version }} · {{ short(live.release.checksum, 10, 8) }}</p>
              </div>
            </li>
            <li>
              <span class="n mono">4</span>
              <div>
                <p>Match, then install</p>
                <p class="mono sub">mismatch stops the install</p>
              </div>
            </li>
          </ol>
          <p v-if="published" class="meta mono">notarized {{ published }}<template v-if="live.releaseCount"> · {{ live.releaseCount }} release{{ live.releaseCount > 1 ? "s" : "" }} onchain</template></p>
        </article>
      </div>

      <div class="card contracts reveal">
        <header class="pane-head">
          <p class="label">Smart contracts</p>
          <span class="meta mono">
            <span class="dot"></span>
            <template v-if="live.block">block #<RollingNumber :value="fmt(live.block)" /></template>
            <span v-else class="skeleton"></span>
          </span>
        </header>
        <div class="table" role="table" aria-label="KINETRA smart contracts">
          <div class="tr th mono" role="row">
            <span role="columnheader">Contract</span>
            <span role="columnheader">Proxy address</span>
            <span role="columnheader">Implementation</span>
            <span role="columnheader">Pattern</span>
            <span role="columnheader">Source</span>
          </div>
          <div v-for="c in CONTRACTS" :key="c.name" class="tr" role="row">
            <div role="cell" class="name">
              <p>{{ c.name }}</p>
              <p class="sub">{{ c.role }}</p>
            </div>
            <div role="cell" class="addr mono">
              <a :href="`${EXPLORER}/address/${c.proxy}`" target="_blank" rel="noopener">{{ short(c.proxy, 8, 6) }} <ExternalLink :size="14" :stroke-width="1.5" /></a>
              <button type="button" :aria-label="`Copy ${c.name} address`" @click="copyAddr(c.proxy)">
                <Check v-if="copiedAddr === c.proxy" :size="14" :stroke-width="1.5" />
                <Copy v-else :size="14" :stroke-width="1.5" />
              </button>
            </div>
            <div role="cell" class="addr mono">
              <a :href="`${EXPLORER}/address/${c.implementation}?tab=contract`" target="_blank" rel="noopener">{{ short(c.implementation, 8, 6) }} <ExternalLink :size="14" :stroke-width="1.5" /></a>
            </div>
            <div role="cell" class="mono pattern">UUPS · ERC-1967</div>
            <div role="cell" class="mono">
              <a v-if="c.verified" class="ok" :href="`${EXPLORER}/address/${c.implementation}?tab=contract`" target="_blank" rel="noopener"><BadgeCheck :size="16" :stroke-width="1.5" /> verified</a>
              <span v-else class="sub">verifying</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.onchain {
  border-top: 1px solid var(--line);
}
.grid {
  display: grid;
  grid-template-columns: minmax(0, 7fr) minmax(0, 5fr);
  gap: 16px;
  margin-bottom: 16px;
}
.pane {
  padding: 24px;
}
.pane-head {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  margin-bottom: 16px;
}
.label {
  margin: 0;
  font-size: 14px;
  font-weight: 500;
  color: var(--text-2);
}
.figure {
  margin: 8px 0 4px;
  font-size: 32px;
  line-height: 1;
  font-weight: 500;
}
.skeleton.wide {
  width: 160px;
  height: 32px;
}
.change {
  margin: 0;
  font-size: 12px;
  color: var(--neg);
}
.change.up {
  color: var(--pos);
}
.meta .dot {
  box-shadow: 0 0 10px var(--pos);
  animation: blink 2.5s steps(1) infinite;
}
@keyframes blink {
  50% {
    opacity: 0.35;
  }
}
.meta {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--muted);
  white-space: nowrap;
}
.chart-wait {
  height: 240px;
  border-radius: 8px;
  background: var(--raised);
}
.verify {
  display: flex;
  flex-direction: column;
  gap: 20px;
}
ol {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 16px;
}
ol li {
  display: grid;
  grid-template-columns: 32px 1fr;
  gap: 12px;
  align-items: start;
}
ol p {
  margin: 0;
}
.n {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: var(--r-key);
  border: 1px solid var(--line-2);
  border-bottom-width: 3px;
  border-bottom-color: var(--key-edge);
  background: var(--key);
  font-size: 12px;
  color: var(--accent);
}
.sub {
  font-size: 12px;
  color: var(--muted);
}
.ink {
  color: var(--text);
}
.contracts {
  padding: 24px;
}
.tr:not(.th) {
  transition: background-color var(--fast) var(--ease);
}
.tr:not(.th):hover {
  background: linear-gradient(90deg, var(--accent-soft), transparent 70%);
}
.tr {
  display: grid;
  grid-template-columns: minmax(0, 2.4fr) minmax(0, 1.3fr) minmax(0, 1.2fr) minmax(0, 0.9fr) minmax(0, 0.7fr);
  gap: 16px;
  align-items: center;
  padding: 16px 0;
  border-top: 1px solid var(--line);
  font-size: 13px;
}
.th {
  padding: 8px 0;
  font-size: 12px;
  color: var(--muted);
}
.name p {
  margin: 0;
}
.name p:first-child {
  font-weight: 500;
  font-size: 15px;
}
.name .sub {
  margin-top: 4px;
  font-family: var(--font-sans);
  font-size: 13px;
}
.addr {
  display: flex;
  align-items: center;
  gap: 4px;
}
.addr a,
.ok {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  transition: color var(--fast) var(--ease);
}
.addr a:hover {
  color: var(--accent);
}
.addr button {
  width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  transition:
    color var(--fast) var(--ease),
    background-color var(--fast) var(--ease);
}
.addr button:hover {
  color: var(--text);
  background: var(--raised);
}
.pattern {
  color: var(--text-2);
}
.ok {
  color: var(--pos);
}

@media (max-width: 1000px) {
  .grid {
    grid-template-columns: minmax(0, 1fr);
  }
  .th {
    display: none;
  }
  .tr {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .name {
    grid-column: 1 / -1;
  }
}
@media (max-width: 560px) {
  .pane,
  .contracts {
    padding: 20px;
  }
  .tr {
    grid-template-columns: minmax(0, 1fr);
    gap: 8px;
  }
}
</style>
