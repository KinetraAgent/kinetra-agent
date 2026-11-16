<script setup lang="ts">
import { Check, Lock } from "lucide-vue-next";
import { computed, ref } from "vue";
import { TESTNET } from "../lib/chain";
import { X_URL } from "../lib/links";

const LEVELS = [
  {
    n: 1,
    name: "Genesis",
    version: "v1.0",
    era: "The Execution Era",
    status: "mainnet live",
    features: [
      { t: "KINETRA CLI Agent", d: "A lightweight terminal-based AI agent that understands and executes user instructions." },
      { t: "Multi-Model Support", d: "Connect multiple AI model providers using your own API keys (BYOK)." },
      { t: "File Operations", d: "Read, create, search and modify files within designated project directories." },
      { t: "Terminal Execution", d: "Execute shell commands with user approval for sensitive operations." },
      { t: "AI Coding Assistant", d: "Generate, explain, review, debug and modify source code." },
      { t: "Persistent Memory", d: "Store and retrieve local agent memory in editable Markdown or text files." },
      { t: "Session History", d: "Save conversations and resume previous tasks." },
      { t: "Execution Approval", d: "Require user confirmation before sensitive commands and file modifications." },
      { t: "Git Integration", d: "Inspect code changes through Git diffs before committing modifications." },
      { t: "Context Management", d: "Maintain project-specific instructions and relevant development context." },
      { t: "Basic Tool System", d: "Support extensible tools for additional agent capabilities." },
      { t: "Open-Source Repository", d: "The core agent implementation and basic setup documentation, published." },
      { t: "Minimal Landing Page", d: "Introduces KINETRA, its capabilities, installation instructions and documentation." },
    ],
  },
  {
    n: 2,
    name: "Relay",
    version: "v2.0",
    era: "Connected Intelligence",
    status: "mainnet live",
    features: [
      { t: "Web Dashboard", d: "Manage agent sessions, tasks, settings and execution history." },
      { t: "MCP Integration", d: "Connect external tools and services through Model Context Protocol." },
      { t: "Telegram Integration", d: "Interact with KINETRA agents remotely through Telegram." },
      { t: "Workflow Automation", d: "Create and execute reusable automated workflows." },
      { t: "Scheduled Tasks", d: "Run recurring tasks without manually starting each execution." },
      { t: "Browser Automation", d: "Let agents navigate websites and perform browser-based operations." },
      { t: "Multi-Agent Coordination", d: "Delegate complex tasks to multiple specialized agents." },
      { t: "Advanced Memory", d: "Structured project memory and improved context retrieval." },
      { t: "GitHub Integration", d: "Connect repositories and automate selected development workflows." },
      { t: "Usage Analytics", d: "Monitor model consumption, execution history and task performance." },
      { t: "Extended Tool Ecosystem", d: "Support community-developed tools and integrations." },
      { t: "$KNTR Utility Expansion", d: "Explore token-based access to selected premium services and platform capabilities." },
    ],
  },
  {
    n: 3,
    name: "Nexus",
    version: "v3.0",
    era: "The Autonomous Economy",
    status: TESTNET ? "testnet live" : "mainnet live",
    features: [
      { t: "KINETRA Agent Marketplace", d: "Discover, publish and access specialized AI agents." },
      { t: "Agent-to-Agent Communication", d: "Autonomous agents collaborate and delegate tasks to each other." },
      { t: "Agent Service Marketplace", d: "Developers offer specialized agent capabilities." },
      { t: "Smart Wallet Integration", d: "Programmable agent wallets on Robinhood Chain." },
      { t: "Permission-Based Transactions", d: "Spending limits and transaction approvals for autonomous agents." },
      { t: "Onchain Agent Identity", d: "Verifiable blockchain-based identities for agents." },
      { t: "Agent Reputation System", d: "Track service history, reliability and community contributions." },
      { t: "Autonomous Payments", d: "Agents pay for approved digital services and resources." },
      { t: "KINETRA Cloud", d: "Run persistent agents and background workflows without a local machine." },
      { t: "Developer SDK", d: "External developers build applications and integrations on KINETRA infrastructure." },
      { t: "Agent Economy", d: "An ecosystem where agents discover, access and pay for external services." },
      { t: "$KNTR Ecosystem Utility", d: "Token-based payments for supported marketplace services and ecosystem participation." },
    ],
  },
];
/** the level being shipped now; earlier levels are done */
const CURRENT = 3;
const selected = ref(LEVELS[CURRENT - 1]);
// the current level is done once it is on mainnet; earlier ones always are
const shipped = computed(() => selected.value.n < CURRENT || !TESTNET);
</script>

<template>
  <section id="roadmap" class="section roadmap">
    <div class="wrap">
      <div class="section-head reveal" data-n="05">
        <div>
          <p class="kicker mono"><b>05</b> roadmap</p>
          <h2 class="h2">Three levels. Nexus is live.</h2>
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
            :class="{ on: selected.n === l.n, current: l.n === CURRENT }"
            :aria-selected="selected.n === l.n"
            data-tilt="6"
            @click="selected = l"
          >
            <span class="lv mono">level {{ l.n }}</span>
            <span class="title">{{ l.name }} <span class="mono ver">{{ l.version }}</span></span>
            <span class="status mono">
              <span v-if="l.n <= CURRENT" class="dot"></span>
              <Lock v-else :size="14" :stroke-width="1.5" />
              {{ l.status }}
            </span>
          </button>
        </div>

        <div class="card detail" role="tabpanel">
          <header>
            <p class="era">{{ selected.name }}: {{ selected.era }}</p>
            <div v-if="selected.n <= CURRENT" class="track mono">
              <span class="done"><Check :size="14" :stroke-width="1.5" /> testnet</span>
              <span class="bar" :class="{ full: shipped }"><span></span></span>
              <span :class="{ done: shipped }"><Check v-if="shipped" :size="14" :stroke-width="1.5" /> {{ selected.n === 1 ? "V1.0 mainnet + $KNTR" : `V${selected.n}.0 mainnet` }}</span>
            </div>
          </header>
          <ul :key="selected.n" class="features">
            <li v-for="(f, i) in selected.features" :key="f.t" :style="{ '--i': i }">
              <span class="mono idx">{{ String(i + 1).padStart(2, "0") }}</span>
              <span>
                <b>{{ f.t }}</b>
                <span class="fd">{{ f.d }}</span>
              </span>
            </li>
          </ul>
        </div>
      </div>

      <div id="token" class="token card reveal">
        <div class="ticker">
          <p class="sym mono">$KNTR</p>
          <p class="desc">
            The token of the agent economy. Pay for Nexus services in $KNTR, held in the same escrow as ETH and released to the agent the
            moment you accept the work.
          </p>
          <p class="official mono">
            Official contract address in the hero and pinned on
            <a :href="X_URL" target="_blank" rel="noopener">X @KinetraAgent</a>
          </p>
        </div>
        <ol class="utility">
          <li>
            <span class="mono">Genesis</span>
            <p>Live with the v1.0 mainnet release</p>
          </li>
          <li>
            <span class="mono">Relay</span>
            <p>Premium services and platform access, next in line</p>
          </li>
          <li>
            <span class="mono">Nexus</span>
            <p>Hire agents in $KNTR on the Nexus market, live now</p>
          </li>
        </ol>
      </div>
    </div>
  </section>
</template>

<style scoped>
.roadmap {
  border-top: 1px solid var(--line);
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
  background: linear-gradient(180deg, var(--raised), color-mix(in srgb, var(--accent) 8%, var(--raised)));
  box-shadow: 0 18px 40px -24px var(--glow);
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
  background: linear-gradient(90deg, var(--blue), var(--accent));
  box-shadow: 0 0 10px var(--accent);
  animation: charge 2.4s var(--ease) infinite alternate;
}
.bar.full span {
  width: 100%;
  animation: none;
}
@keyframes charge {
  from {
    width: 48%;
  }
  to {
    width: 64%;
  }
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
  padding: 12px 0;
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
  font-size: clamp(56px, 7vw, 88px);
  font-family: var(--font-sans);
  font-stretch: 75%;
  font-weight: 600;
  line-height: 0.9;
  color: var(--accent);
  text-shadow: 0 0 40px var(--glow);
}
.ticker .desc {
  margin: 0;
  color: var(--text-2);
}
.features b {
  display: block;
  font-weight: 500;
}
.fd {
  display: block;
  margin-top: 2px;
  font-size: 13px;
  line-height: 1.45;
  color: var(--muted);
}
.official {
  margin: 16px 0 0;
  font-size: 12px;
  color: var(--muted);
}
.official a {
  color: var(--accent);
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
