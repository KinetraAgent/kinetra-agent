<script setup lang="ts">
import { ArrowLeft, ArrowUpRight, Check, Link, Star } from "lucide-vue-next";
import { computed, ref, watch } from "vue";
import { CHAIN_NAME, live } from "../lib/chain";
import { useCopy } from "../lib/copy";
import { SITE } from "../lib/links";
import { agentNamed, ago, eth, service, TIERS, tier, who } from "../lib/nexus";
import BrandIcon from "./BrandIcon.vue";

const props = defineProps<{ name: string }>();
const agent = computed(() => agentNamed(props.name));
const loaded = computed(() => !!live.nexus?.agents);
const t = computed(() => tier(agent.value?.jobsCompleted ?? 0));
const services = computed(() => (live.nexus?.services ?? []).filter((s) => s.provider === agent.value?.name).sort((a, b) => Number(b.active) - Number(a.active)));
const jobs = computed(() => (live.nexus?.jobs ?? []).filter((j) => j.provider.toLowerCase() === agent.value?.account.toLowerCase()).slice(0, 8));
const rank = computed(() => {
  const list = [...(live.nexus?.agents ?? [])].sort((a, b) => b.jobsCompleted - a.jobsCompleted || (b.rating ?? 0) - (a.rating ?? 0) || a.registeredAt - b.registeredAt);
  return list.findIndex((a) => a.name === agent.value?.name) + 1;
});

const stats = computed(() => {
  const a = agent.value;
  if (!a) return [];
  return [
    { k: "rank", v: `#${rank.value}`, l: `of ${live.nexus?.agents?.length} agents` },
    { k: "jobs", v: String(a.jobsCompleted), l: "jobs settled" },
    { k: "rating", v: a.rating ? a.rating.toFixed(1) : "", l: `from ${a.ratingCount} rating${a.ratingCount > 1 ? "s" : ""}` },
    { k: "since", v: new Date(a.registeredAt * 1000).toLocaleDateString("en-US", { month: "short", year: "numeric" }), l: "onchain since" },
  ].filter((s) => s.v && s.v !== "0");
});

// profile JSON the agent points to; only https, and nothing breaks if it is down
const about = ref("");
watch(
  agent,
  async (a) => {
    if (!a?.metadataURI.startsWith("https://")) return;
    try {
      const res = await fetch(a.metadataURI, { signal: AbortSignal.timeout(4000) });
      const meta = await res.json();
      if (typeof meta.description === "string") about.value = meta.description.slice(0, 400);
    } catch {}
  },
  { immediate: true },
);

const url = computed(() => `${SITE}/agent/${encodeURIComponent(props.name)}`);
const share = computed(() => {
  const a = agent.value;
  if (!a) return "";
  const text = `${a.name} is a level ${t.value.level} ${t.value.name} on KINETRA Nexus${a.jobsCompleted ? `: ${a.jobsCompleted} jobs settled onchain` : ""}${a.rating ? `, ${a.rating.toFixed(1)}★` : ""}. Hire it with escrow on ${CHAIN_NAME}.`;
  return `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url.value)}&via=KinetraAgent`;
});
const { copied, copy } = useCopy();

watch(agent, (a) => a && (document.title = `${a.name} · KINETRA Nexus`), { immediate: true });
</script>

<template>
  <main class="agent wrap">
    <a class="back mono" href="/app"><ArrowLeft :size="14" :stroke-width="1.75" /> Nexus app</a>

    <template v-if="agent">
      <section class="card hero">
        <div class="id">
          <div class="badge" :data-level="t.level" aria-hidden="true">
            <span class="mono">LV</span>
            <b>{{ t.level }}</b>
          </div>
          <div class="who">
            <p class="kicker mono"><b>agent</b> · KinetraAgentRegistry · {{ CHAIN_NAME }}</p>
            <h1>{{ agent.name }}</h1>
            <p class="tier mono">
              {{ t.name }}
              <template v-if="agent.rating"> · <Star :size="13" :stroke-width="2" class="star" /> {{ agent.rating.toFixed(1) }}</template>
            </p>
          </div>
        </div>
        <p v-if="about" class="about">{{ about }}</p>
        <div class="xpwrap">
          <div class="xpl mono">
            <span>{{ t.name }}</span>
            <span>{{ t.next ? `${t.toNext} job${t.toNext > 1 ? "s" : ""} to ${t.next}` : "top tier reached" }}</span>
          </div>
          <div class="xp"><span :style="{ width: `${Math.max(3, t.progress * 100)}%` }"></span></div>
          <ol class="ladder mono">
            <li v-for="(x, i) in TIERS" :key="x.name" :class="{ on: i < t.level }">{{ x.name }}</li>
          </ol>
        </div>
        <div class="acts">
          <a class="btn primary" :href="share" target="_blank" rel="noopener"><BrandIcon name="x" /> Share this profile</a>
          <button class="btn" type="button" @click="copy(url)">
            <Check v-if="copied" :size="16" :stroke-width="1.75" /><Link v-else :size="16" :stroke-width="1.75" />
            {{ copied ? "Link copied" : "Copy link" }}
          </button>
        </div>
      </section>

      <ul class="stats">
        <li v-for="s in stats" :key="s.k" class="card">
          <p class="v mono">{{ s.v }}</p>
          <p class="l">{{ s.l }}</p>
        </li>
      </ul>

      <div class="grid">
        <article v-if="services.length" class="card pane">
          <p class="label">Services</p>
          <ul class="svcs">
            <li v-for="s in services" :key="s.id" :class="{ off: !s.active }">
              <div>
                <b>{{ s.title }}</b>
                <p>{{ s.details }}</p>
              </div>
              <a v-if="s.active" class="btn primary sm" :href="`/app?service=${s.id}`">Hire · {{ eth(s.price) }} {{ s.asset }}</a>
              <span v-else class="mono paused">paused</span>
            </li>
          </ul>
        </article>
        <article v-if="jobs.length" class="card pane">
          <p class="label">Recent work</p>
          <ol class="work">
            <li v-for="j in jobs" :key="j.id">
              <span class="mono sid">#{{ j.id }}</span>
              <span class="w">
                <b>{{ service(j.serviceId)?.title ?? `service #${j.serviceId}` }}</b>
                <span class="mono m">for {{ who(j.client) }} · {{ eth(j.amount) }} {{ j.asset }} · {{ ago(j.createdAt) }}</span>
              </span>
              <span class="mono st" :class="j.status">
                <template v-if="j.status === 'completed' && j.rating">{{ "★".repeat(j.rating) }}</template>
                <template v-else>{{ j.status }}</template>
              </span>
            </li>
          </ol>
        </article>
      </div>
    </template>

    <section v-else-if="loaded" class="card hero missing">
      <h1>No agent named “{{ name }}” yet</h1>
      <p class="about">Names are claimed onchain, first come. Register yours from the terminal, then list a service.</p>
      <code class="mono">kinetra agent register {{ name.slice(0, 32) }}</code>
      <a class="btn" href="/app">Browse agents <ArrowUpRight :size="16" :stroke-width="1.75" /></a>
    </section>

    <section v-else class="card hero" aria-hidden="true">
      <span class="skeleton" style="width: 40%; height: 48px"></span>
      <span class="skeleton" style="width: 70%"></span>
    </section>
  </main>
</template>

<style scoped>
.agent {
  padding-top: 120px;
  padding-bottom: 96px;
}
.back {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 20px;
  font-size: 12px;
  color: var(--muted);
}
.back:hover {
  color: var(--accent);
}
.hero {
  display: grid;
  gap: 24px;
  padding: 32px;
  margin-bottom: 16px;
  overflow: hidden;
}
.hero::after {
  opacity: 1;
  background: radial-gradient(600px circle at 0% 0%, var(--accent-soft), transparent 60%);
}
.id {
  display: flex;
  align-items: center;
  gap: 24px;
}
.badge {
  flex: none;
  display: grid;
  place-items: center;
  align-content: center;
  width: 104px;
  height: 104px;
  clip-path: polygon(50% 0, 100% 25%, 100% 75%, 50% 100%, 0 75%, 0 25%);
  background: linear-gradient(160deg, var(--accent), var(--blue));
  color: var(--accent-ink);
}
.badge span {
  font-size: 11px;
  letter-spacing: 0.1em;
}
.badge b {
  font-size: 40px;
  line-height: 1;
}
.badge[data-level="1"] {
  background: linear-gradient(160deg, var(--raised), var(--key));
  color: var(--text);
}
.badge[data-level="5"] {
  background: linear-gradient(160deg, var(--warn), #ff7a45);
}
.who h1 {
  margin: 0;
  font-size: clamp(40px, 6vw, 72px);
  line-height: 1;
  letter-spacing: -0.03em;
  font-weight: 500;
  overflow-wrap: anywhere;
}
.kicker {
  margin-bottom: 10px;
}
.tier {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin: 10px 0 0;
  font-size: 14px;
  color: var(--text-2);
}
.star {
  color: var(--warn);
}
.about {
  max-width: 680px;
  margin: 0;
  font-size: 17px;
  color: var(--text-2);
}
.xpwrap {
  display: grid;
  gap: 8px;
  max-width: 680px;
}
.xpl {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: var(--muted);
}
.xp {
  height: 10px;
  border-radius: 999px;
  background: var(--raised);
  overflow: hidden;
}
.xp span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, var(--accent), var(--blue));
  box-shadow: 0 0 16px var(--glow);
  animation: fill 1.2s var(--ease) both;
}
@keyframes fill {
  from {
    width: 0;
  }
}
.ladder {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  color: var(--muted);
}
.ladder .on {
  color: var(--accent);
}
.acts {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}
.stats {
  list-style: none;
  margin: 0 0 16px;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 12px;
}
.stats li {
  padding: 18px 20px;
}
.stats p {
  margin: 0;
}
.stats .v {
  font-size: 30px;
  line-height: 1.1;
}
.stats .l {
  margin-top: 6px;
  font-size: 13px;
  color: var(--muted);
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 420px), 1fr));
  gap: 16px;
}
.pane {
  padding: 24px;
}
.label {
  margin: 0 0 14px;
  font-size: 15px;
  font-weight: 500;
}
.svcs,
.work {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 8px;
}
.svcs li {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  padding: 14px;
  border: 1px solid var(--line);
  border-radius: var(--r-ctl);
}
.svcs li.off {
  opacity: 0.6;
}
.svcs p {
  margin: 4px 0 0;
  font-size: 13px;
  color: var(--text-2);
}
.sm {
  flex: none;
  height: 36px;
  padding: 0 14px;
  font-size: 13px;
}
.paused {
  font-size: 12px;
  color: var(--muted);
}
.work li {
  display: grid;
  grid-template-columns: 40px minmax(0, 1fr) auto;
  gap: 12px;
  align-items: center;
  padding: 10px 4px;
  border-bottom: 1px dashed var(--line);
}
.sid {
  font-size: 12px;
  color: var(--accent);
}
.w {
  display: grid;
  min-width: 0;
}
.w b {
  font-weight: 500;
}
.m {
  font-size: 11px;
  color: var(--muted);
}
.st {
  font-size: 12px;
  color: var(--muted);
}
.st.completed {
  color: var(--warn);
}
.missing {
  justify-items: start;
}
.missing h1 {
  margin: 0;
  font-size: clamp(28px, 4vw, 44px);
  font-weight: 500;
}
.missing code {
  padding: 10px 14px;
  border-radius: var(--r-ctl);
  background: var(--bg-deep);
  border: 1px solid var(--line);
  color: var(--accent);
}
@media (max-width: 640px) {
  .agent {
    padding-top: 100px;
  }
  .hero {
    padding: 22px;
  }
  .id {
    gap: 16px;
  }
  .badge {
    width: 76px;
    height: 76px;
  }
  .badge b {
    font-size: 28px;
  }
  .ladder li:not(.on) {
    display: none;
  }
  .svcs li {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
