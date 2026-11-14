<script setup lang="ts">
import { Menu, Moon, Sun, X } from "lucide-vue-next";
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { live } from "../lib/chain";
import { GITHUB, X_URL } from "../lib/links";
import { introDone, scrollToId } from "../lib/motion";
import { shuffle } from "../lib/scramble";
import { theme, toggleTheme } from "../lib/theme";
import BrandIcon from "./BrandIcon.vue";
import RollingNumber from "./RollingNumber.vue";

const links = [
  { id: "arcade", label: "Execute" },
  { id: "toolkit", label: "Toolkit" },
  { id: "onchain", label: "Onchain" },
  { id: "roadmap", label: "Roadmap" },
];
const scrolled = ref(false);
const open = ref(false);
const entered = ref(false);
const inStory = ref(true);
const active = ref("");
const progress = ref(0);
// the last digits of the live block, ticking like a counter
const tick = computed(() => (live.block ? String(live.block % 1000n).padStart(3, "0") : "000"));

function onScroll() {
  scrolled.value = scrollY > 24;
  progress.value = scrollY / Math.max(document.documentElement.scrollHeight - innerHeight, 1);
  const first = document.getElementById("arcade");
  inStory.value = !!first && first.getBoundingClientRect().top > 64;
}

let spy: IntersectionObserver | undefined;
onMounted(() => {
  addEventListener("scroll", onScroll, { passive: true });
  onScroll();
  introDone.promise.then(() => (entered.value = true));
  spy = new IntersectionObserver(
    (entries) => {
      for (const e of entries) if (e.isIntersecting) active.value = e.target.id;
    },
    { rootMargin: "-45% 0px -50% 0px" },
  );
  for (const id of [...links.map((l) => l.id), "install"]) {
    const el = document.getElementById(id);
    if (el) spy.observe(el);
  }
});
onBeforeUnmount(() => {
  removeEventListener("scroll", onScroll);
  spy?.disconnect();
});

function go(id: string) {
  open.value = false;
  scrollToId(id);
}
</script>

<template>
  <header class="nav" :class="{ scrolled, open, entered }" :data-theme="inStory ? 'dark' : undefined">
    <div class="progress" :style="{ transform: `scaleX(${progress})` }" aria-hidden="true"></div>
    <div class="wrap bar">
      <a class="brand chip" href="#top" aria-label="KINETRA home" @click.prevent="go('top')">
        <img src="/logo-96.webp" width="24" height="24" alt="" />
        <span>KINETRA</span>
      </a>
      <nav class="links pill" aria-label="Sections">
        <a
          v-for="l in links"
          :key="l.id"
          :href="`#${l.id}`"
          :class="{ on: active === l.id }"
          @click.prevent="go(l.id)"
          @mouseenter="shuffle($event.target as HTMLElement, l.label)"
          >{{ l.label }}</a
        >
        <a :href="`${GITHUB}/tree/main/docs`" target="_blank" rel="noopener" @mouseenter="shuffle($event.target as HTMLElement, 'Docs')">Docs</a>
      </nav>
      <div class="end">
        <button class="icon-btn" type="button" :aria-label="`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`" @click="toggleTheme">
          <Sun v-if="theme === 'dark'" :size="18" :stroke-width="1.5" />
          <Moon v-else :size="18" :stroke-width="1.5" />
        </button>
        <a class="icon-btn hide-sm" :href="X_URL" target="_blank" rel="noopener" aria-label="KINETRA on X"><BrandIcon name="x" /></a>
        <a class="icon-btn hide-sm" :href="GITHUB" target="_blank" rel="noopener" aria-label="KINETRA on GitHub"><BrandIcon name="github" /></a>
        <button class="install chip mono" type="button" data-cursor="install" @click="go('install')">
          Install
          <span class="badge" :title="'Latest block, last three digits'"><RollingNumber :value="tick" /></span>
        </button>
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
  color: var(--text);
  opacity: 0;
  transform: translateY(-16px);
  transition:
    opacity 900ms var(--ease),
    transform 900ms var(--ease),
    background-color var(--mid) var(--ease);
}
.nav.entered {
  opacity: 1;
  transform: none;
}
.nav.open {
  background: color-mix(in srgb, var(--bg) 94%, transparent);
}
.progress {
  position: absolute;
  left: 0;
  right: 0;
  top: 0;
  height: 2px;
  background: linear-gradient(90deg, var(--blue), var(--accent));
  box-shadow: 0 0 10px var(--accent);
  transform-origin: 0 50%;
}
.bar {
  height: 72px;
  display: flex;
  align-items: center;
  gap: 24px;
}
.chip {
  display: flex;
  align-items: center;
  gap: 10px;
  height: 38px;
  padding: 0 12px;
  border: 1px solid var(--line);
  border-radius: 4px;
  background: color-mix(in srgb, var(--bg) 55%, transparent);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
}
.brand {
  font-weight: 600;
  font-size: 13px;
  letter-spacing: 0.16em;
}
/* the section links sit between two accent brackets */
.pill {
  position: relative;
  display: flex;
  gap: 2px;
  margin: 0 auto;
  padding: 4px 8px;
  border-block: 1px solid var(--line);
  background: color-mix(in srgb, var(--bg) 55%, transparent);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
}
.pill::before,
.pill::after,
.install::after {
  content: "";
  position: absolute;
  top: -1px;
  bottom: -1px;
  width: 2px;
  background: var(--accent);
  box-shadow: 0 0 10px var(--accent);
}
.pill::before {
  left: 0;
}
.pill::after,
.install::after {
  right: 0;
}
.links a,
.sheet a {
  position: relative;
  padding: 6px 12px;
  color: var(--text-2);
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  transition: color var(--fast) var(--ease);
}
.links a::after {
  content: "";
  position: absolute;
  left: 12px;
  right: 12px;
  bottom: 2px;
  height: 1px;
  background: var(--accent);
  transform: scaleX(0);
  transition: transform var(--slow) var(--ease);
}
.links a:hover,
.links a.on,
.sheet a:hover {
  color: var(--text);
}
.links a.on::after {
  transform: scaleX(1);
}
.end {
  display: flex;
  align-items: center;
  gap: 4px;
}
.icon-btn {
  width: 36px;
  height: 36px;
  display: grid;
  place-items: center;
  border: 0;
  border-radius: 4px;
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
  position: relative;
  margin-left: 8px;
  padding: 0 6px 0 14px;
  font-size: 11px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--text);
  cursor: pointer;
}
.badge {
  display: inline-flex;
  align-items: center;
  height: 24px;
  padding: 0 6px;
  border-radius: 2px;
  background: var(--accent);
  color: var(--accent-ink);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0;
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
  .end {
    margin-left: auto;
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
  .bar {
    height: 64px;
  }
}
</style>
