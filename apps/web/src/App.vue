<script setup lang="ts">
import { computed, nextTick, onMounted } from "vue";
import ArcadeSection from "./components/ArcadeSection.vue";
import CosmosBg from "./components/CosmosBg.vue";
import CursorFx from "./components/CursorFx.vue";
import HeroSection from "./components/HeroSection.vue";
import InstallSection from "./components/InstallSection.vue";
import MarqueeBand from "./components/MarqueeBand.vue";
import NavBar from "./components/NavBar.vue";
import OnchainSection from "./components/OnchainSection.vue";
import RoadmapSection from "./components/RoadmapSection.vue";
import SiteFooter from "./components/SiteFooter.vue";
import SplashScreen from "./components/SplashScreen.vue";
import ToolkitSection from "./components/ToolkitSection.vue";
import { deployment, fmt, live, short, startLive } from "./lib/chain";
import { initMotion } from "./lib/motion";

const VERBS = ["From intent", "to execution", "read", "write", "run", "approve"];
const chain = computed(() => [
  live.block ? `block #${fmt(live.block)}` : `chain ${deployment.chainId}`,
  live.release ? `release v${live.release.version}` : "release",
  live.release ? `sha256 ${short(live.release.checksum, 6, 4)}` : "sha256",
  `${live.tools.length} tools onchain`,
  "$KNTR with mainnet",
]);

onMounted(async () => {
  startLive();
  await nextTick();
  initMotion();
});
</script>

<template>
  <SplashScreen />
  <CosmosBg />
  <CursorFx />
  <NavBar />
  <main>
    <HeroSection />
    <!-- the story ends in black; this fades it into the page -->
    <div class="seam">
      <MarqueeBand :items="VERBS" />
    </div>
    <ArcadeSection />
    <ToolkitSection />
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
