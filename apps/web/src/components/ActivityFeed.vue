<script setup lang="ts">
import { BadgeCheck, Handshake, PackageCheck, Store, UserPlus } from "lucide-vue-next";
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { live } from "../lib/chain";
import { activity, ago } from "../lib/nexus";

const props = withDefaults(defineProps<{ limit?: number }>(), { limit: 10 });
const ICONS = { join: UserPlus, list: Store, hire: Handshake, deliver: PackageCheck, settle: BadgeCheck };
const now = ref(Date.now() / 1000);
let timer = 0;
onMounted(() => (timer = window.setInterval(() => (now.value = Date.now() / 1000), 30_000)));
onBeforeUnmount(() => clearInterval(timer));

const items = computed(() => (live.nexus ? activity(props.limit) : []));
</script>

<template>
  <ol v-if="items.length" class="feed" aria-live="polite" aria-label="Nexus activity">
    <TransitionGroup name="feed">
      <li v-for="a in items" :key="a.key" :class="a.kind">
        <span class="ic"><component :is="ICONS[a.kind]" :size="15" :stroke-width="1.75" /></span>
        <span class="body">
          <a v-if="a.href" :href="a.href" class="t">{{ a.text }}</a>
          <span v-else class="t">{{ a.text }}</span>
          <span class="m mono">{{ a.meta }}</span>
        </span>
        <time class="when mono" :datetime="new Date(a.at * 1000).toISOString()">{{ ago(a.at, now) }}</time>
      </li>
    </TransitionGroup>
  </ol>
  <ol v-else class="feed" aria-hidden="true">
    <li v-for="i in 4" :key="i"><span class="ic"></span><span class="body"><span class="skeleton"></span><span class="skeleton short"></span></span></li>
  </ol>
</template>

<style scoped>
.feed {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 2px;
}
li {
  display: grid;
  grid-template-columns: 30px minmax(0, 1fr) auto;
  gap: 12px;
  align-items: center;
  padding: 10px 8px;
  border-radius: var(--r-ctl);
  transition: background-color var(--fast) var(--ease);
}
li:hover {
  background: var(--raised);
}
.ic {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  border: 1px solid var(--line-2);
  color: var(--muted);
}
.hire .ic {
  color: var(--accent);
  border-color: color-mix(in srgb, var(--accent) 40%, transparent);
}
.settle .ic,
.deliver .ic {
  color: var(--pos);
  border-color: color-mix(in srgb, var(--pos) 40%, transparent);
}
.body {
  display: grid;
  gap: 2px;
  min-width: 0;
}
.t {
  font-size: 14px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
a.t:hover {
  color: var(--accent);
}
.m {
  font-size: 11px;
  color: var(--muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.when {
  font-size: 11px;
  color: var(--muted);
  white-space: nowrap;
}
.skeleton {
  width: 70%;
}
.skeleton.short {
  width: 40%;
  height: 0.8em;
}
.feed-enter-active {
  transition:
    opacity var(--slow) var(--ease),
    transform var(--slow) var(--ease);
}
.feed-enter-from {
  opacity: 0;
  transform: translateX(-8px);
}
.feed-move {
  transition: transform var(--slow) var(--ease);
}
</style>
