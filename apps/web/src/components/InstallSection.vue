<script setup lang="ts">
import { computed, ref } from "vue";
import { live } from "../lib/chain";
import { GITHUB, INSTALL_SH } from "../lib/links";
import BrandIcon from "./BrandIcon.vue";
import InstallCommand from "./InstallCommand.vue";

const tab = ref<"unix" | "npm">("unix");
const npmCmd = computed(() => `npm install -g ${live.release?.uri ?? `${GITHUB}/releases/latest/download/kinetra-cli.tgz`}`);
const STEPS = [
  { cmd: "export ANTHROPIC_API_KEY=sk-ant-…", text: "Connect a model. Any of the eight providers works, or KINETRA asks on first run" },
  { cmd: "kinetra init", text: "Optional. Write the rules for this project into KINETRA.md" },
  { cmd: "kinetra", text: "Start a session in your project and say what you want done" },
];
</script>

<template>
  <section id="install" class="section install">
    <div class="wrap grid">
      <div class="reveal">
        <p class="kicker mono"><b>05</b> install</p>
        <h2 class="h2">One line to your first execution</h2>
        <p class="lede">Needs Node.js 22 or newer. The script verifies the package against Robinhood Chain before it installs.</p>
        <a class="repo card" :href="GITHUB" target="_blank" rel="noopener">
          <BrandIcon name="github" />
          <span>
            <span class="r">KinetraAgent/kinetra-agent</span>
            <span class="mono m">MIT · TypeScript · CLI, contracts and site in one repo</span>
          </span>
        </a>
      </div>

      <div class="card panel reveal" data-delay="0.05">
        <div class="seg" role="tablist" aria-label="Install method">
          <button type="button" role="tab" :aria-selected="tab === 'unix'" :class="{ on: tab === 'unix' }" @click="tab = 'unix'">macOS · Linux</button>
          <button type="button" role="tab" :aria-selected="tab === 'npm'" :class="{ on: tab === 'npm' }" @click="tab = 'npm'">Windows · npm</button>
        </div>
        <InstallCommand :command="tab === 'unix' ? INSTALL_SH : npmCmd" />
        <ol>
          <li v-for="(s, i) in STEPS" :key="s.cmd">
            <span class="n mono">{{ i + 2 }}</span>
            <div>
              <code class="mono">{{ s.cmd }}</code>
              <p>{{ s.text }}</p>
            </div>
          </li>
        </ol>
      </div>
    </div>
  </section>
</template>

<style scoped>
.install {
  background: var(--bg);
  border-top: 1px solid var(--line);
}
.grid {
  display: grid;
  grid-template-columns: minmax(0, 5fr) minmax(0, 7fr);
  gap: 48px;
  align-items: center;
}
.h2 {
  margin-bottom: 16px;
}
.repo {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-top: 32px;
  padding: 16px 20px;
  transition: border-color var(--fast) var(--ease);
}
.repo:hover {
  border-color: var(--accent);
}
.repo > span {
  display: grid;
  gap: 2px;
}
.r {
  font-weight: 500;
}
.m {
  font-size: 12px;
  color: var(--muted);
}
.panel {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 20px;
  padding: 24px;
}
.seg {
  justify-self: start;
}
ol {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 16px;
}
li {
  display: grid;
  grid-template-columns: 32px 1fr;
  gap: 12px;
}
.n {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: var(--r-key);
  border: 1px solid var(--line-2);
  border-bottom: 3px solid var(--key-edge);
  background: var(--key);
  font-size: 12px;
  color: var(--accent);
}
code {
  font-size: 13px;
  color: var(--text);
}
li p {
  margin: 4px 0 0;
  font-size: 14px;
  color: var(--text-2);
}
@media (max-width: 900px) {
  .grid {
    grid-template-columns: minmax(0, 1fr);
    gap: 32px;
  }
}
</style>
