<script setup lang="ts">
import { Check, Lock } from "lucide-vue-next";
import { ref } from "vue";

const LEVELS = [
  {
    n: 1,
    name: "Genesis",
    version: "v1.0",
    era: "The Execution Era",
    status: "testnet live",
    features: [
      "KINETRA CLI agent",
      "Multi-model support, bring your own key",
      "File operations",
      "Terminal execution with approval",
      "AI coding assistant",
      "Persistent Markdown memory",
      "Session history and resume",
      "Execution approval modes",
      "Git diff before commits",
      "Project context with KINETRA.md",
      "Extensible tool system",
      "Open-source repository",
      "Landing page and docs",
      "$KNTR launch with mainnet",
    ],
  },
  {
    n: 2,
    name: "Relay",
    version: "v2.0",
    era: "Connected Intelligence",
    status: "unlocks after Genesis",
    features: [
      "Web dashboard for sessions and history",
      "MCP integration",
      "Telegram control",
      "Reusable workflows",
      "Scheduled tasks",
      "Browser automation",
      "Multi-agent coordination",
      "Structured project memory",
      "GitHub integration",
      "Usage analytics",
      "Community tool ecosystem",
      "$KNTR access to premium services",
    ],
  },
  {
    n: 3,
    name: "Nexus",
    version: "v3.0",
    era: "The Autonomous Economy",
    status: "unlocks after Relay",
    features: [
      "Agent marketplace",
      "Agent-to-agent communication",
      "Agent service marketplace",
      "Smart agent wallets on Robinhood Chain",
      "Spending limits and transaction approvals",
      "Onchain agent identity",
      "Agent reputation",
      "Autonomous payments",
      "KINETRA Cloud for persistent agents",
      "Developer SDK",
      "Agent economy",
      "$KNTR payments across the ecosystem",
    ],
  },
];
const selected = ref(LEVELS[0]);
</script>

<template>
  <section id="roadmap" class="section roadmap">
    <div class="wrap">
      <div class="section-head reveal">
        <div>
          <p class="kicker mono"><b>04</b> roadmap</p>
          <h2 class="h2">Three levels. Genesis is in play.</h2>
        </div>
        <p class="lede">
          It starts with one agent on your machine and grows into a network of agents that work, trade and pay each other on Robinhood
          Chain.
        </p>
      </div>

      <div class="levels reveal">
        <div class="select" role="tablist" aria-label="Roadmap levels">
          <button
            v-for="l in LEVELS"
            :key="l.n"
            type="button"
            role="tab"
            class="level"
            :class="{ on: selected.n === l.n, current: l.n === 1 }"
            :aria-selected="selected.n === l.n"
            @click="selected = l"
          >
            <span class="lv mono">level {{ l.n }}</span>
            <span class="title">{{ l.name }} <span class="mono ver">{{ l.version }}</span></span>
            <span class="status mono">
              <span v-if="l.n === 1" class="dot"></span>
              <Lock v-else :size="14" :stroke-width="1.5" />
              {{ l.status }}
            </span>
          </button>
        </div>

        <div class="card detail" role="tabpanel">
          <header>
            <p class="era">{{ selected.name }}: {{ selected.era }}</p>
            <div v-if="selected.n === 1" class="track mono">
              <span class="done"><Check :size="14" :stroke-width="1.5" /> testnet</span>
              <span class="bar"><span></span></span>
              <span>V1.0 mainnet + $KNTR</span>
            </div>
          </header>
          <ul :key="selected.n" class="features">
            <li v-for="(f, i) in selected.features" :key="f" :style="{ '--i': i }">
              <span class="mono idx">{{ String(i + 1).padStart(2, "0") }}</span>
              {{ f }}
            </li>
          </ul>
        </div>
      </div>

      <div id="token" class="token card reveal">
        <div class="ticker">
          <p class="sym mono">$KNTR</p>
          <p class="desc">Launches with KINETRA V1.0 on Robinhood Chain. It grows into the currency agents use to pay for work.</p>
        </div>
        <ol class="utility">
          <li>
            <span class="mono">Genesis</span>
            <p>Token launch alongside the V1.0 mainnet release</p>
          </li>
          <li>
            <span class="mono">Relay</span>
            <p>Access to premium services and platform capabilities</p>
          </li>
          <li>
            <span class="mono">Nexus</span>
            <p>Payments for marketplace services and ecosystem participation</p>
          </li>
        </ol>
      </div>
    </div>
  </section>
</template>

<style scoped>
.roadmap {
  background: var(--bg-deep);
}
.levels {
  display: grid;
  grid-template-columns: minmax(0, 4fr) minmax(0, 8fr);
  gap: 16px;
}
.select {
  display: grid;
  gap: 8px;
  align-content: start;
}
.level {
  display: grid;
  gap: 4px;
  padding: 16px 20px;
  border-radius: var(--r-card);
  border: 1px solid var(--line);
  border-bottom-width: 3px;
  background: var(--card);
  text-align: left;
  cursor: pointer;
  transition:
    border-color var(--fast) var(--ease),
    background-color var(--fast) var(--ease),
    transform 90ms var(--ease);
}
.level:hover {
  border-color: var(--line-2);
}
.level:active {
  transform: translateY(2px);
}
.level.on {
  border-color: var(--line-2);
  border-bottom-color: var(--accent);
  background: var(--raised);
}
.lv,
.status {
  font-size: 12px;
  color: var(--muted);
}
.title {
  font-size: 22px;
  font-weight: 500;
}
.ver {
  font-size: 13px;
  color: var(--muted);
}
.status {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.current .status {
  color: var(--pos);
}
.detail {
  padding: 24px;
}
.detail header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 16px;
  margin-bottom: 16px;
}
.era {
  margin: 0;
  font-size: 18px;
  font-weight: 500;
}
.track {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 12px;
  color: var(--muted);
}
.track .done {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--pos);
}
.bar {
  width: 96px;
  height: 4px;
  border-radius: 2px;
  background: var(--raised);
  overflow: hidden;
}
.bar span {
  display: block;
  width: 60%;
  height: 100%;
  background: var(--accent);
}
.features {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  column-gap: 24px;
}
.features li {
  display: flex;
  gap: 12px;
  align-items: baseline;
  padding: 10px 0;
  border-top: 1px solid var(--line);
  font-size: 14px;
  animation: rise var(--slow) var(--ease) both;
  animation-delay: calc(min(var(--i), 6) * 40ms);
}
.idx {
  font-size: 12px;
  color: var(--muted);
}
@keyframes rise {
  from {
    opacity: 0;
    transform: translateY(6px);
  }
}
.token {
  display: grid;
  grid-template-columns: minmax(0, 4fr) minmax(0, 8fr);
  gap: 32px;
  margin-top: 16px;
  padding: 32px;
}
.sym {
  margin: 0 0 12px;
  font-size: 40px;
  line-height: 1;
  color: var(--accent);
}
.ticker .desc {
  margin: 0;
  color: var(--text-2);
}
.utility {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
}
.utility li {
  padding-top: 12px;
  border-top: 1px solid var(--line-2);
}
.utility span {
  font-size: 12px;
  color: var(--muted);
}
.utility p {
  margin: 8px 0 0;
  font-size: 14px;
}

@media (max-width: 900px) {
  .levels,
  .token {
    grid-template-columns: minmax(0, 1fr);
  }
  .select {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
  .title {
    font-size: 18px;
  }
}
@media (max-width: 560px) {
  .select {
    grid-template-columns: minmax(0, 1fr);
  }
  .features,
  .utility {
    grid-template-columns: minmax(0, 1fr);
  }
  .token {
    padding: 24px;
  }
}
</style>
