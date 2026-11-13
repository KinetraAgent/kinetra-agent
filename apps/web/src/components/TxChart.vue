<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { fmt } from "../lib/chain";
import { gsap, reduced } from "../lib/motion";

const props = defineProps<{ data: { date: string; count: number }[] }>();

const H = 240;
const PAD = { top: 16, right: 16, bottom: 28, left: 52 };
const box = ref<HTMLElement>();
const line = ref<SVGPathElement>();
const width = ref(640);
const active = ref<number | null>(null);
let ro: ResizeObserver | undefined;

const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });
const day = (d: string, opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" }) =>
  new Date(d + "T00:00:00Z").toLocaleDateString("en-US", { timeZone: "UTC", ...opts });

// a trend does not need a zero baseline; the bottom tick stays unlabeled so the axis never prints 0
const scale = computed(() => {
  const counts = props.data.map((d) => d.count);
  const lo = Math.min(...counts);
  const hi = Math.max(...counts);
  const step = niceStep((hi - lo) / 4 || hi / 4);
  const min = Math.floor((lo * 0.96) / step) * step;
  const max = Math.ceil((hi * 1.04) / step) * step;
  const ticks: number[] = [];
  for (let v = min + step; v <= max + step / 2; v += step) ticks.push(v);
  const x = (i: number) => PAD.left + (i / Math.max(props.data.length - 1, 1)) * (width.value - PAD.left - PAD.right);
  const y = (v: number) => PAD.top + (1 - (v - min) / (max - min)) * (H - PAD.top - PAD.bottom);
  return { x, y, ticks };
});

function niceStep(raw: number) {
  const pow = 10 ** Math.floor(Math.log10(raw));
  return [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? raw;
}

const points = computed(() => props.data.map((d, i) => [scale.value.x(i), scale.value.y(d.count)] as const));
const path = computed(() => points.value.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(""));
const area = computed(() => {
  const p = points.value;
  if (!p.length) return "";
  const base = H - PAD.bottom;
  return `${path.value}L${p[p.length - 1][0].toFixed(1)},${base}L${p[0][0].toFixed(1)},${base}Z`;
});
const xLabels = computed(() => {
  const n = props.data.length;
  const every = width.value < 480 ? 10 : 5;
  return props.data.map((d, i) => ({ i, label: day(d.date) })).filter(({ i }) => (n - 1 - i) % every === 0);
});

function pick(e: PointerEvent) {
  const rect = (e.currentTarget as SVGElement).getBoundingClientRect();
  const x = ((e.clientX - rect.left) / rect.width) * width.value;
  const t = (x - PAD.left) / (width.value - PAD.left - PAD.right);
  active.value = Math.min(Math.max(Math.round(t * (props.data.length - 1)), 0), props.data.length - 1);
}

function onKey(e: KeyboardEvent) {
  const last = props.data.length - 1;
  if (e.key === "ArrowLeft") active.value = Math.max((active.value ?? last) - 1, 0);
  else if (e.key === "ArrowRight") active.value = Math.min((active.value ?? last) + 1, last);
  else return;
  e.preventDefault();
}

const tip = computed(() => {
  if (active.value === null) return null;
  const d = props.data[active.value];
  const [x, y] = points.value[active.value];
  return { x, y, date: day(d.date, { weekday: "short", month: "short", day: "numeric" }), count: fmt(d.count), left: x > width.value * 0.7 };
});

onMounted(() => {
  ro = new ResizeObserver(([e]) => (width.value = Math.max(e.contentRect.width, 280)));
  ro.observe(box.value!);
  if (reduced || !line.value) return;
  const len = line.value.getTotalLength();
  gsap.fromTo(
    line.value,
    { strokeDasharray: len, strokeDashoffset: len },
    { strokeDashoffset: 0, duration: 1.2, ease: "power3.out", scrollTrigger: { trigger: box.value, start: "top 85%", once: true }, clearProps: "strokeDasharray,strokeDashoffset" },
  );
});
onBeforeUnmount(() => ro?.disconnect());
</script>

<template>
  <div ref="box" class="chart">
    <svg
      :viewBox="`0 0 ${width} ${H}`"
      :height="H"
      role="img"
      tabindex="0"
      aria-label="Daily transactions over the last 30 days. Use the arrow keys to read each day."
      @pointermove="pick"
      @pointerleave="active = null"
      @keydown="onKey"
      @blur="active = null"
    >
      <g class="grid">
        <g v-for="t in scale.ticks" :key="t">
          <line :x1="PAD.left" :x2="width - PAD.right" :y1="scale.y(t)" :y2="scale.y(t)" />
          <text :x="PAD.left - 10" :y="scale.y(t) + 4" text-anchor="end">{{ compact.format(t) }}</text>
        </g>
        <text v-for="l in xLabels" :key="l.i" :x="scale.x(l.i)" :y="H - 8" text-anchor="middle">{{ l.label }}</text>
      </g>
      <path class="area" :d="area" />
      <path ref="line" class="line" :d="path" />
      <g v-if="tip">
        <line class="cross" :x1="tip.x" :x2="tip.x" :y1="PAD.top" :y2="H - PAD.bottom" />
        <circle class="mark" :cx="tip.x" :cy="tip.y" r="5" />
      </g>
    </svg>
    <div v-if="tip" class="tip" :style="{ left: `${(tip.x / width) * 100}%`, top: `${tip.y}px` }" :class="{ left: tip.left }">
      <span class="mono date">{{ tip.date }}</span>
      <span class="mono">{{ tip.count }} txs</span>
    </div>
    <table class="sr">
      <caption>Daily transactions</caption>
      <tr v-for="d in data" :key="d.date">
        <td>{{ d.date }}</td>
        <td>{{ d.count }}</td>
      </tr>
    </table>
  </div>
</template>

<style scoped>
.chart {
  position: relative;
}
svg {
  display: block;
  width: 100%;
  overflow: visible;
  cursor: crosshair;
  touch-action: pan-y;
}
svg:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 4px;
}
.grid line {
  stroke: var(--line);
  stroke-width: 1;
}
.grid text {
  fill: var(--muted);
  font-family: var(--font-mono);
  font-size: 11px;
}
.line {
  fill: none;
  stroke: var(--accent);
  stroke-width: 2;
  stroke-linejoin: round;
  stroke-linecap: round;
}
.area {
  fill: var(--accent);
  opacity: 0.1;
}
.cross {
  stroke: var(--line-2);
  stroke-width: 1;
}
.mark {
  fill: var(--accent);
  stroke: var(--card);
  stroke-width: 2;
}
.tip {
  position: absolute;
  transform: translate(12px, -50%);
  display: grid;
  gap: 2px;
  padding: 8px 10px;
  border-radius: 8px;
  border: 1px solid var(--line-2);
  background: var(--raised);
  font-size: 12px;
  white-space: nowrap;
  pointer-events: none;
}
.tip.left {
  transform: translate(calc(-100% - 12px), -50%);
}
.date {
  color: var(--muted);
}
.sr {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
}
</style>
