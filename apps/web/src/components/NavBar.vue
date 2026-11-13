<script setup lang="ts">
import { Menu, Moon, Sun, X } from "lucide-vue-next";
import { onBeforeUnmount, onMounted, ref } from "vue";
import { GITHUB, X_URL } from "../lib/links";
import { scrollToId } from "../lib/motion";
import { theme, toggleTheme } from "../lib/theme";
import BrandIcon from "./BrandIcon.vue";

const links = [
  { id: "arcade", label: "Execute" },
  { id: "toolkit", label: "Toolkit" },
  { id: "onchain", label: "Onchain" },
  { id: "roadmap", label: "Roadmap" },
];
const scrolled = ref(false);
const open = ref(false);
const onScroll = () => (scrolled.value = scrollY > 24);
onMounted(() => addEventListener("scroll", onScroll, { passive: true }));
onBeforeUnmount(() => removeEventListener("scroll", onScroll));

function go(id: string) {
  open.value = false;
  scrollToId(id);
}
</script>

<template>
  <header class="nav" :class="{ scrolled, open }">
    <div class="wrap bar">
      <a class="brand" href="#top" aria-label="KINETRA home" @click.prevent="go('top')">
        <img src="/logo-96.webp" width="28" height="28" alt="" />
        <span>KINETRA</span>
      </a>
      <nav class="links" aria-label="Sections">
        <a v-for="l in links" :key="l.id" :href="`#${l.id}`" @click.prevent="go(l.id)">{{ l.label }}</a>
        <a :href="`${GITHUB}/tree/main/docs`" target="_blank" rel="noopener">Docs</a>
      </nav>
      <div class="end">
        <button class="icon-btn" type="button" :aria-label="`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`" @click="toggleTheme">
          <Sun v-if="theme === 'dark'" :size="18" :stroke-width="1.5" />
          <Moon v-else :size="18" :stroke-width="1.5" />
        </button>
        <a class="icon-btn hide-sm" :href="X_URL" target="_blank" rel="noopener" aria-label="KINETRA on X"><BrandIcon name="x" /></a>
        <a class="icon-btn hide-sm" :href="GITHUB" target="_blank" rel="noopener" aria-label="KINETRA on GitHub"><BrandIcon name="github" /></a>
        <button class="btn primary install" type="button" @click="go('install')">Install</button>
        <button class="icon-btn menu" type="button" :aria-expanded="open" aria-label="Menu" @click="open = !open">
          <X v-if="open" :size="18" :stroke-width="1.5" />
          <Menu v-else :size="18" :stroke-width="1.5" />
        </button>
      </div>
    </div>
    <nav v-if="open" class="sheet wrap" aria-label="Sections">
      <a v-for="l in links" :key="l.id" :href="`#${l.id}`" @click.prevent="go(l.id)">{{ l.label }}</a>
      <a :href="`${GITHUB}/tree/main/docs`" target="_blank" rel="noopener">Docs</a>
      <a :href="X_URL" target="_blank" rel="noopener">X @KinetraAgent</a>
      <a :href="GITHUB" target="_blank" rel="noopener">GitHub</a>
    </nav>
  </header>
</template>

<style scoped>
.nav {
  position: fixed;
  inset: 0 0 auto;
  z-index: 50;
  border-bottom: 1px solid transparent;
  transition:
    background-color var(--mid) var(--ease),
    border-color var(--mid) var(--ease);
}
.nav.scrolled,
.nav.open {
  background: color-mix(in srgb, var(--bg) 92%, transparent);
  border-bottom-color: var(--line);
}
.bar {
  height: 64px;
  display: flex;
  align-items: center;
  gap: 32px;
}
.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  font-weight: 600;
  font-size: 16px;
  letter-spacing: 0.12em;
}
.links {
  display: flex;
  gap: 4px;
  margin-right: auto;
}
.links a,
.sheet a {
  padding: 6px 12px;
  border-radius: 8px;
  color: var(--text-2);
  font-size: 14px;
  transition:
    color var(--fast) var(--ease),
    background-color var(--fast) var(--ease);
}
.links a:hover,
.sheet a:hover {
  color: var(--text);
  background: var(--raised);
}
.end {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-left: auto;
}
.icon-btn {
  width: 36px;
  height: 36px;
  display: grid;
  place-items: center;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--text-2);
  cursor: pointer;
  transition:
    color var(--fast) var(--ease),
    background-color var(--fast) var(--ease);
}
.icon-btn:hover {
  color: var(--text);
  background: var(--raised);
}
.install {
  height: 36px;
  padding: 0 16px;
  font-size: 14px;
  margin-left: 8px;
}
.menu {
  display: none;
}
.sheet {
  display: none;
  padding-bottom: 16px;
}
@media (max-width: 900px) {
  .links {
    display: none;
  }
  .menu {
    display: grid;
  }
  .sheet {
    display: grid;
    gap: 2px;
  }
}
@media (max-width: 560px) {
  .hide-sm {
    display: none;
  }
}
</style>
