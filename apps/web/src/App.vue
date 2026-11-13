<script setup lang="ts">
import { nextTick, onMounted } from "vue";
import ArcadeSection from "./components/ArcadeSection.vue";
import HeroSection from "./components/HeroSection.vue";
import InstallSection from "./components/InstallSection.vue";
import NavBar from "./components/NavBar.vue";
import OnchainSection from "./components/OnchainSection.vue";
import RoadmapSection from "./components/RoadmapSection.vue";
import SiteFooter from "./components/SiteFooter.vue";
import ToolkitSection from "./components/ToolkitSection.vue";
import { startLive } from "./lib/chain";
import { initMotion } from "./lib/motion";

onMounted(async () => {
  startLive();
  await nextTick();
  initMotion();
});
</script>

<template>
  <NavBar />
  <main>
    <HeroSection />
    <ArcadeSection />
    <ToolkitSection />
    <OnchainSection />
    <RoadmapSection />
    <InstallSection />
  </main>
  <SiteFooter />
</template>
