<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import { gsap, reduced, scroll } from "../lib/motion";

// A band of words that runs with your scroll: faster when you scroll faster, reversing when you scroll up,
// leaning into the direction of travel.
const props = defineProps<{ items: string[]; reverse?: boolean }>();
const band = ref<HTMLElement>();
const track = ref<HTMLElement>();
let x = 0;
let skew = 0;
let dir = 1;
let visible = false;
let io: IntersectionObserver | undefined;

function tick(_t: number, dt: number) {
  if (!visible || !track.value) return;
  const v = scroll.velocity;
  if (Math.abs(v) > 0.3) dir = Math.sign(v);
  x -= (0.7 + Math.min(Math.abs(v), 60) * 0.35) * dir * (props.reverse ? -1 : 1) * (dt / 16.7);
  const half = track.value.scrollWidth / 2;
  if (x <= -half) x += half;
  if (x > 0) x -= half;
  skew += (Math.max(Math.min(v * 0.25, 10), -10) - skew) * 0.1;
  track.value.style.transform = `translate3d(${x}px, 0, 0) skewX(${-skew}deg)`;
}

onMounted(() => {
  if (reduced) return;
  io = new IntersectionObserver(([e]) => (visible = e.isIntersecting));
  io.observe(band.value!);
  gsap.ticker.add(tick);
});
onBeforeUnmount(() => {
  io?.disconnect();
  gsap.ticker.remove(tick);
});
</script>

<template>
  <div ref="band" class="band" :aria-label="items.join(', ')" role="marquee">
    <div ref="track" class="track" aria-hidden="true">
      <template v-for="copy in 2" :key="copy">
        <span v-for="(t, i) in items" :key="`${copy}-${i}`" class="item">
          <span :class="i % 2 ? 'outline' : 'solid'">{{ t }}</span>
          <span class="sep">◢◤</span>
        </span>
      </template>
    </div>
  </div>
</template>

<style scoped>
.band {
  position: relative;
  overflow: hidden;
  padding: 28px 0;
  border-block: 1px solid var(--line);
  user-select: none;
}
.track {
  display: flex;
  width: max-content;
  will-change: transform;
}
.item {
  display: inline-flex;
  align-items: center;
  gap: 40px;
  padding-right: 40px;
  font-size: clamp(40px, 7vw, 96px);
  line-height: 1;
  font-stretch: 75%;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: -0.01em;
  white-space: nowrap;
}
.solid {
  color: var(--text);
}
.outline {
  color: transparent;
  -webkit-text-stroke: 1px color-mix(in srgb, var(--text) 55%, transparent);
}
.sep {
  font-family: var(--font-mono);
  font-size: 0.32em;
  color: var(--accent);
  letter-spacing: -0.2em;
}
</style>
