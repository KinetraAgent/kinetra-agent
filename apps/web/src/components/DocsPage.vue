<script setup lang="ts">
import { Marked } from "marked";
import { onBeforeUnmount, onMounted, ref } from "vue";
import contracts from "../../../../docs/contracts.md?raw";
import start from "../../../../docs/getting-started.md?raw";
import tools from "../../../../docs/tools.md?raw";

// The guides in docs/, rendered on the site so nobody needs the repo to read them.

const DOCS = [
  { id: "getting-started", title: "Getting started", md: start },
  { id: "tools", title: "Tools", md: tools },
  { id: "contracts", title: "Contracts", md: contracts },
];

// GitHub-style heading ids, so links like getting-started.md#relay-v20 keep working
const slug = (text: string) =>
  text
    .toLowerCase()
    .replace(/<[^>]+>/g, "")
    .replace(/[^\w\- ]/g, "")
    .replace(/ /g, "-");

const toc: { id: string; text: string; depth: number }[] = [];
const marked = new Marked({
  renderer: {
    heading({ tokens, depth, text }) {
      const id = slug(text);
      if (depth <= 3) toc.push({ id, text: text.replace(/`/g, ""), depth });
      return `<h${depth} id="${id}">${this.parser.parseInline(tokens)}</h${depth}>\n`;
    },
    link({ href, tokens }) {
      const label = this.parser.parseInline(tokens);
      const doc = href.match(/^([\w-]+)\.md(#.*)?$/);
      if (doc) return `<a href="${doc[2] ?? `#${doc[1]}`}">${label}</a>`;
      if (/^https?:\/\//.test(href)) return `<a href="${href}" target="_blank" rel="noopener">${label}</a>`;
      // repo-relative paths have no page on the site
      return label;
    },
  },
});
// each doc parses once; the headings it renders become its toc entries
const docs = DOCS.map((d) => {
  const before = toc.length;
  const html = marked.parse(d.md.replace(/^# .*\n/, ""), { async: false }) as string;
  return { ...d, html, items: toc.splice(before).filter((t) => t.depth === 2) };
});

const active = ref("getting-started");
let spy: IntersectionObserver | undefined;
onMounted(() => {
  document.title = "Docs · KINETRA";
  spy = new IntersectionObserver((entries) => entries.forEach((e) => e.isIntersecting && (active.value = e.target.id)), { rootMargin: "-20% 0px -70% 0px" });
  document.querySelectorAll(".doc h2[id], .doc[id]").forEach((el) => spy!.observe(el));
  if (location.hash) document.getElementById(decodeURIComponent(location.hash.slice(1)))?.scrollIntoView();
});
onBeforeUnmount(() => spy?.disconnect());
</script>

<template>
  <main class="docs wrap">
    <aside class="toc mono" aria-label="Docs">
      <nav>
        <template v-for="s in docs" :key="s.id">
          <a :href="`#${s.id}`" class="top" :class="{ on: active === s.id }">{{ s.title }}</a>
          <a v-for="t in s.items" :key="t.id" :href="`#${t.id}`" :class="{ on: active === t.id }">{{ t.text }}</a>
        </template>
      </nav>
    </aside>
    <div class="body">
      <p class="kicker mono"><b>docs</b> · kinetra cli, nexus and contracts</p>
      <!-- our own markdown from docs/, nothing user-supplied -->
      <article v-for="d in docs" :id="d.id" :key="d.id" class="doc">
        <h1>{{ d.title }}</h1>
        <div class="md" v-html="d.html"></div>
      </article>
    </div>
  </main>
</template>

<style scoped>
.docs {
  display: grid;
  grid-template-columns: 240px minmax(0, 1fr);
  gap: 48px;
  padding-top: 120px;
  padding-bottom: 96px;
}
.toc nav {
  position: sticky;
  top: 96px;
  display: grid;
  gap: 2px;
  max-height: calc(100vh - 120px);
  overflow-y: auto;
  font-size: 12px;
}
.toc a {
  padding: 5px 10px;
  border-left: 1px solid var(--line);
  color: var(--muted);
  transition:
    color var(--fast) var(--ease),
    border-color var(--fast) var(--ease);
}
.toc a.top {
  margin-top: 14px;
  color: var(--text);
  font-weight: 500;
}
.toc a.top:first-child {
  margin-top: 0;
}
.toc a:hover,
.toc a.on {
  color: var(--accent);
  border-color: var(--accent);
}
.doc {
  padding-bottom: 48px;
  margin-bottom: 48px;
  border-bottom: 1px solid var(--line);
  scroll-margin-top: 96px;
}
.doc h1 {
  margin: 0 0 24px;
  font-size: clamp(36px, 5vw, 56px);
  line-height: 1;
  letter-spacing: -0.03em;
  font-weight: 500;
}
.md {
  max-width: 760px;
  font-size: 16px;
  line-height: 1.7;
  color: var(--text-2);
}
.md :deep(h2) {
  margin: 40px 0 12px;
  font-size: 26px;
  font-weight: 500;
  color: var(--text);
  scroll-margin-top: 96px;
}
.md :deep(h3) {
  margin: 28px 0 8px;
  font-size: 19px;
  font-weight: 500;
  color: var(--text);
  scroll-margin-top: 96px;
}
.md :deep(a) {
  color: var(--accent);
  text-decoration: underline;
  text-underline-offset: 3px;
  text-decoration-color: color-mix(in srgb, var(--accent) 40%, transparent);
}
.md :deep(code) {
  font-family: var(--font-mono);
  font-size: 0.86em;
  padding: 2px 6px;
  border-radius: 5px;
  background: var(--raised);
  color: var(--text);
}
.md :deep(pre) {
  margin: 16px 0;
  padding: 16px 18px;
  overflow-x: auto;
  border-radius: var(--r-ctl);
  border: 1px solid var(--line);
  background: var(--bg-deep);
}
.md :deep(pre code) {
  padding: 0;
  background: none;
  font-size: 13px;
  line-height: 1.7;
}
.md :deep(table) {
  width: 100%;
  margin: 16px 0;
  border-collapse: collapse;
  font-size: 14px;
  display: block;
  overflow-x: auto;
}
.md :deep(th),
.md :deep(td) {
  padding: 8px 12px;
  border-bottom: 1px solid var(--line);
  text-align: left;
  vertical-align: top;
}
.md :deep(th) {
  color: var(--text);
  font-weight: 500;
}
.md :deep(li) {
  margin: 4px 0;
}
.md :deep(strong) {
  color: var(--text);
  font-weight: 500;
}
@media (max-width: 900px) {
  .docs {
    grid-template-columns: minmax(0, 1fr);
    padding-top: 100px;
  }
  .toc {
    display: none;
  }
}
</style>
