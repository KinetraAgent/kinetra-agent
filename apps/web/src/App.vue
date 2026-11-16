<script setup lang="ts">
import { computed, defineAsyncComponent, nextTick, onMounted } from "vue";
import ArcadeSection from "./components/ArcadeSection.vue";
import CosmosBg from "./components/CosmosBg.vue";
import CursorFx from "./components/CursorFx.vue";
import HeroSection from "./components/HeroSection.vue";
import InstallSection from "./components/InstallSection.vue";
import MarqueeBand from "./components/MarqueeBand.vue";
import NexusSection from "./components/NexusSection.vue";
import NavBar from "./components/NavBar.vue";
import OnchainSection from "./components/OnchainSection.vue";
import RoadmapSection from "./components/RoadmapSection.vue";
import SiteFooter from "./components/SiteFooter.vue";
import SplashScreen from "./components/SplashScreen.vue";
import ToolkitSection from "./components/ToolkitSection.vue";
import { deployment, fmt, live, short, startLive } from "./lib/chain";
import { initMotion, introDone, scrollToId } from "./lib/motion";
import { activity, ago } from "./lib/nexus";

// One bundle, a few pages; nginx serves index.html for every path. Pages besides home load on demand.
const NexusApp = defineAsyncComponent(() => import("./components/NexusApp.vue"));
const AgentPage = defineAsyncComponent(() => import("./components/AgentPage.vue"));
const DocsPage = defineAsyncComponent(() => import("./components/DocsPage.vue"));
const path = location.pathname.replace(/\/+$/, "");
const page = path === "/app" ? "app" : path.startsWith("/agent/") ? "agent" : path === "/docs" ? "docs" : "home";
const agentName = page === "agent" ? decodeURIComponent(path.slice("/agent/".length)) : "";

const VERBS = ["From intent", "to execution", "read", "write", "run", "approve"];
const chain = computed(() => [
  live.block ? `block #${fmt(live.block)}` : `chain ${deployment.chainId}`,
  live.release ? `release v${live.release.version}` : "release",
  live.release ? `sha256 ${short(live.release.checksum, 6, 4)}` : "sha256",
  `${live.tools.length} tools onchain`,
  live.nexus?.stats.agents ? `${live.nexus.stats.agents} agents on Nexus` : "Nexus v3.0 live",
  // the latest market events ride the ticker
  ...activity(4).map((a) => `${a.text} · ${ago(a.at)}`),
  "$KNTR with mainnet",
]);

onMounted(async () => {
  startLive();
  // pages without the splash have nothing to wait for
  if (page !== "home") introDone.resolve();
  await nextTick();
  initMotion();
  // links like /#nexus from other pages land on their section once the intro is done
  if (page === "home" && location.hash) introDone.promise.then(() => setTimeout(() => scrollToId(location.hash.slice(1)), 300));
});
</script>

<template>
  <SplashScreen v-if="page === 'home'" />
  <CosmosBg />
  <CursorFx />
  <NavBar :page="page" />
  <NexusApp v-if="page === 'app'" />
  <AgentPage v-else-if="page === 'agent'" :name="agentName" />
  <DocsPage v-else-if="page === 'docs'" />
  <main v-else>
    <HeroSection />
    <!-- the story ends in black; this fades it into the page -->
    <div class="seam">
      <MarqueeBand :items="VERBS" />
    </div>
    <ArcadeSection />
    <ToolkitSection />
    <NexusSection />
    <MarqueeBand :items="chain" reverse />
    <OnchainSection />
    <RoadmapSection />
    <InstallSection />
  </main>
  <SiteFooter />
</template>

<style scoped>
.seam {
  position: relative;
  padding: 18vh 0 0;
  background: linear-gradient(180deg, #000, transparent);
}
.seam :deep(.band) {
  border-color: transparent;
}
</style>
