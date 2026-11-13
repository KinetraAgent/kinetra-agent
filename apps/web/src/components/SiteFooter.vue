<script setup lang="ts">
import { CHAIN_NAME, EXPLORER, CONTRACTS } from "../lib/chain";
import { GITHUB, X_URL } from "../lib/links";
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
        <a v-for="c in CONTRACTS" :key="c.name" :href="`${EXPLORER}/address/${c.proxy}`" target="_blank" rel="noopener">{{ c.name.replace("Kinetra", "") }}</a>
        <a :href="EXPLORER" target="_blank" rel="noopener">Explorer</a>
      </nav>
      <nav aria-label="Community">
        <p class="h mono">community</p>
        <a :href="X_URL" target="_blank" rel="noopener">X @KinetraAgent</a>
        <a :href="`${GITHUB}/issues`" target="_blank" rel="noopener">Issues</a>
      </nav>
    </div>
    <div class="wrap base mono">
      <span>© 2026 KINETRA</span>
      <span>built on {{ CHAIN_NAME }}</span>
    </div>
  </footer>
</template>

<style scoped>
.footer {
  background: var(--bg-deep);
  border-top: 1px solid var(--line);
  padding: 64px 0 32px;
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
  margin-top: 48px;
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
