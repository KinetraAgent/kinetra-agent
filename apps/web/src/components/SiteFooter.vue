<script setup lang="ts">
import { ref } from "vue";
import { CHAIN_NAME, EXPLORER, CONTRACTS } from "../lib/chain";
import { GITHUB, SITE, X_URL } from "../lib/links";
import { finePointer, reduced } from "../lib/motion";

// The wordmark leans toward the cursor: letters near it grow heavier and wider on the font's own axes.
const mark = ref<HTMLElement>();
function flex(e: PointerEvent) {
  if (!finePointer || reduced) return;
  for (const el of mark.value!.children as HTMLCollectionOf<HTMLElement>) {
    const r = el.getBoundingClientRect();
    const d = (e.clientX - (r.left + r.width / 2)) / innerWidth;
    const f = Math.exp(-(d * d) / 0.006);
    el.style.fontVariationSettings = `"wght" ${Math.round(200 + 600 * f)}, "wdth" ${Math.round(75 + 25 * f)}`;
  }
}
function rest() {
  for (const el of mark.value!.children as HTMLCollectionOf<HTMLElement>) el.style.fontVariationSettings = "";
}
</script>

<template>
  <footer class="footer">
    <div class="wrap grid">
      <div class="brand">
        <img src="/logo-96.webp" width="40" height="40" alt="" />
        <div>
          <p class="name">KINETRA</p>
          <p class="tag">From Intent to Execution.</p>
        </div>
      </div>
      <nav aria-label="Project">
        <p class="h mono">project</p>
        <a :href="GITHUB" target="_blank" rel="noopener">GitHub</a>
        <a :href="`${GITHUB}/tree/main/docs`" target="_blank" rel="noopener">Docs</a>
        <a :href="`${GITHUB}/releases`" target="_blank" rel="noopener">Releases</a>
      </nav>
      <nav aria-label="Onchain">
        <p class="h mono">onchain</p>
        <a v-for="c in CONTRACTS" :key="c.name" :href="`${EXPLORER}/address/${c.address}`" target="_blank" rel="noopener">{{ c.name.replace("Kinetra", "") }}</a>
        <a :href="EXPLORER" target="_blank" rel="noopener">Explorer</a>
      </nav>
      <nav aria-label="Community">
        <p class="h mono">community</p>
        <a :href="X_URL" target="_blank" rel="noopener">X @KinetraAgent</a>
        <a :href="`${GITHUB}/issues`" target="_blank" rel="noopener">Issues</a>
      </nav>
    </div>
    <div class="mark" ref="mark" aria-hidden="true" @pointermove="flex" @pointerleave="rest">
      <span v-for="(c, i) in 'KINETRA'" :key="i">{{ c }}</span>
    </div>
    <div class="wrap base mono">
      <span>© 2026 KINETRA</span>
      <span>{{ SITE.replace("https://", "") }} · built on {{ CHAIN_NAME }}</span>
    </div>
  </footer>
</template>

<style scoped>
.footer {
  position: relative;
  z-index: 1;
  overflow: hidden;
  background: linear-gradient(180deg, transparent, var(--bg-deep) 40%);
  border-top: 1px solid var(--line);
  padding: 64px 0 32px;
}
.mark {
  display: flex;
  justify-content: center;
  margin: 56px 0 -0.12em;
  font-size: 23vw;
  line-height: 0.8;
  font-weight: 200;
  font-variation-settings: "wght" 200, "wdth" 75;
  letter-spacing: -0.02em;
  color: transparent;
  -webkit-text-stroke: 1px color-mix(in srgb, var(--accent) 60%, transparent);
  background: linear-gradient(180deg, color-mix(in srgb, var(--accent) 22%, transparent), transparent 85%);
  -webkit-background-clip: text;
  background-clip: text;
  user-select: none;
}
.mark span {
  transition: font-variation-settings 500ms var(--ease);
}
.grid {
  display: grid;
  grid-template-columns: 2fr repeat(3, 1fr);
  gap: 32px;
}
.brand {
  display: flex;
  gap: 16px;
  align-items: center;
}
.brand p {
  margin: 0;
}
.name {
  font-weight: 600;
  letter-spacing: 0.12em;
}
.tag {
  color: var(--text-2);
  font-size: 14px;
}
nav {
  display: grid;
  gap: 8px;
  align-content: start;
}
.h {
  margin: 0 0 4px;
  font-size: 12px;
  color: var(--muted);
}
nav a {
  font-size: 14px;
  color: var(--text-2);
  transition: color var(--fast) var(--ease);
}
nav a:hover {
  color: var(--text);
}
.base {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  padding-top: 24px;
  border-top: 1px solid var(--line);
  font-size: 12px;
  color: var(--muted);
}
@media (max-width: 720px) {
  .grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .brand {
    grid-column: 1 / -1;
  }
}
</style>
