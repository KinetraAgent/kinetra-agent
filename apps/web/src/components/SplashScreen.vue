<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { CHAIN_NAME, fmt, live, short } from "../lib/chain";
import { gsap, intro, introDone, lockScroll, reduced, sceneReady } from "../lib/motion";
import Keycap from "./Keycap.vue";

// A dark field with a keyhole cut in it. The live hero shows through the hole; entering scales the hole past
// the screen edges, so the splash never cuts away to the page, it opens onto it.

const root = ref<HTMLElement>();
const canvas = ref<HTMLCanvasElement>();
const ui = ref<HTMLElement>();
const gone = ref(false);
const ready = ref(false);
const pct = ref(0);
const pressed = ref(false);
const coarse = matchMedia("(pointer: coarse)").matches;

const boot = computed(() => [
  ["model router", "8 providers"],
  ["tool registry", `${live.tools.length} tools`],
  ["chain", live.block ? `block #${fmt(live.block)}` : CHAIN_NAME],
  ["release", live.release ? `sha256 ${short(live.release.checksum, 6, 4)} ✓` : "verifying"],
  ["approval", "asks before it acts"],
]);

const state = { open: 0, warp: 0, mx: 0, my: 0, tx: 0, ty: 0 };
let ceiling = 24;
let queued = false;
let opening = false;
let frame = 0;
let ctx: CanvasRenderingContext2D;
let w = 0;
let h = 0;
const stars = Array.from({ length: 280 }, () => ({ x: Math.random(), y: Math.random(), z: 0.2 + Math.random() * 0.8, t: Math.random() * 6.3 }));

function size() {
  const dpr = Math.min(devicePixelRatio, 2);
  w = innerWidth;
  h = innerHeight;
  canvas.value!.width = w * dpr;
  canvas.value!.height = h * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

/** Circle on top, flared slot below, as one outline; (cx, cy) is the circle's centre. */
const NECK = Math.atan2(Math.sqrt(0.36 ** 2 - 0.18 ** 2), 0.18);
function keyhole(cx: number, cy: number, s: number) {
  ctx.beginPath();
  ctx.arc(cx, cy, s * 0.36, NECK, Math.PI - NECK, true);
  ctx.lineTo(cx - s * 0.3, cy + s * 1.0);
  ctx.lineTo(cx + s * 0.3, cy + s * 1.0);
  ctx.closePath();
}

function draw(now: number) {
  frame = requestAnimationFrame(draw);
  const t = now / 1000;
  state.mx += (state.tx - state.mx) * 0.06;
  state.my += (state.ty - state.my) * 0.06;
  pct.value = Math.min(pct.value + (ceiling - pct.value) * 0.05 + 0.08, ceiling);
  if (pct.value >= 99.5 && !ready.value) {
    pct.value = 100;
    ready.value = true;
    if (queued || reduced) enter();
  }

  const { open, warp } = state;
  ctx.globalCompositeOperation = "source-over";
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#020309";
  ctx.fillRect(0, 0, w, h);

  const cx = w / 2 + state.mx * 14;
  for (const s of stars) {
    const k = 1 + warp * warp * s.z * 7;
    const k0 = 1 + Math.max(warp - 0.06, 0) ** 2 * s.z * 7;
    const sx = cx + (s.x * w - cx + state.mx * s.z * 24) * k;
    const sy = h / 2 + (s.y * h - h / 2 + state.my * s.z * 18) * k;
    const a = (0.25 + 0.75 * s.z) * (0.6 + 0.4 * Math.sin(t * (0.8 + s.z) + s.t));
    if (warp > 0.02) {
      ctx.strokeStyle = `rgba(190,225,255,${a})`;
      ctx.lineWidth = s.z * 1.6;
      ctx.beginPath();
      ctx.moveTo(cx + (s.x * w - cx) * k0, h / 2 + (s.y * h - h / 2) * k0);
      ctx.lineTo(sx, sy);
      ctx.stroke();
    } else {
      ctx.fillStyle = `rgba(200,225,255,${a * 0.8})`;
      ctx.fillRect(sx, sy, s.z * 1.8, s.z * 1.8);
    }
  }

  const s0 = Math.min(w, h) * 0.22;
  const s = s0 * (1 + 0.012 * Math.sin(t * 1.6)) + open ** 2.4 * Math.hypot(w, h) * 1.7;
  const cy = h / 2 - s0 * 0.3 * (1 - open) + state.my * 10 * (1 - open);
  ctx.globalCompositeOperation = "destination-out";
  ctx.shadowColor = "#000";
  ctx.shadowBlur = Math.min(10 + s * 0.06, 60);
  keyhole(cx, cy, s);
  ctx.fill();

  // rim light
  ctx.globalCompositeOperation = "source-over";
  ctx.shadowColor = "rgba(34,225,245,0.9)";
  ctx.shadowBlur = 28;
  ctx.strokeStyle = `rgba(120,240,255,${0.35 * (1 - open) * (0.75 + 0.25 * Math.sin(t * 2))})`;
  ctx.lineWidth = 1.2;
  keyhole(cx, cy, s);
  ctx.stroke();
  ctx.shadowBlur = 0;
}

function enter() {
  if (opening) return;
  if (!ready.value) {
    queued = true;
    return;
  }
  opening = true;
  pressed.value = true;
  const stage = document.querySelector("#top .stage");
  const tl = gsap.timeline({
    onComplete: () => {
      cancelAnimationFrame(frame);
      gone.value = true;
      lockScroll(false);
    },
  });
  if (reduced) {
    intro.t = 1;
    tl.to(root.value!, { opacity: 0, duration: 0.4 }).add(() => introDone.resolve(), 0);
    return;
  }
  tl.to(ui.value!.children, { opacity: 0, y: -14, filter: "blur(6px)", stagger: 0.04, duration: 0.45, ease: "power2.in" }, 0.1)
    .to(state, { open: 1, duration: 1.8, ease: "expo.inOut" }, 0.2)
    .to(state, { warp: 1, duration: 1.3, ease: "power2.in" }, 0.25)
    .to(intro, { t: 1, duration: 2.4, ease: "expo.inOut" }, 0.5)
    .to(stage, { scale: 1, duration: 2.4, ease: "expo.out" }, 0.9)
    .add(() => introDone.resolve(), 1.25);
}

function onKey(e: KeyboardEvent) {
  if (gone.value || e.metaKey || e.ctrlKey || e.altKey) return;
  if (["y", "enter", " ", "escape"].includes(e.key.toLowerCase())) {
    e.preventDefault();
    enter();
  }
}
function onPoint(e: PointerEvent) {
  state.tx = (e.clientX / innerWidth) * 2 - 1;
  state.ty = (e.clientY / innerHeight) * 2 - 1;
}

onMounted(() => {
  history.scrollRestoration = "manual";
  scrollTo(0, 0);
  lockScroll(true);
  ctx = canvas.value!.getContext("2d")!;
  size();
  gsap.set("#top .stage", { scale: reduced ? 1 : 1.2 });
  addEventListener("resize", size);
  addEventListener("keydown", onKey);
  addEventListener("pointermove", onPoint, { passive: true });
  frame = requestAnimationFrame(draw);

  // the counter follows real loading: fonts, then the first rendered frame of the scene
  const timeout = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
  document.fonts.ready.then(() => (ceiling = Math.max(ceiling, 55)));
  Promise.race([sceneReady.promise, timeout(8000)]).then(() => (ceiling = Math.max(ceiling, 88)));
  Promise.all([document.fonts.ready, Promise.race([sceneReady.promise, timeout(8000)]), timeout(1400)]).then(() => (ceiling = 100));
});

onBeforeUnmount(() => {
  cancelAnimationFrame(frame);
  removeEventListener("resize", size);
  removeEventListener("keydown", onKey);
  removeEventListener("pointermove", onPoint);
});
</script>

<template>
  <div v-if="!gone" ref="root" class="splash" data-theme="dark" role="dialog" aria-modal="true" aria-label="KINETRA" @click="enter" @wheel.passive="enter" @touchmove.passive="enter">
    <canvas ref="canvas" class="field" aria-hidden="true"></canvas>
    <div ref="ui" class="ui">
      <header class="top">
        <span class="brand"><img src="/logo-96.webp" width="24" height="24" alt="" />KINETRA</span>
        <span class="mono meta">v1.0.0-testnet.1 · {{ CHAIN_NAME }}</span>
      </header>

      <ol class="boot mono" aria-live="polite">
        <li class="cmd"><span class="ac">›</span> kinetra --boot</li>
        <li v-for="([k, v], i) in boot" :key="k" :class="{ on: pct > 14 + i * 16 }">
          <span class="k">{{ k }}</span><span class="dots"></span><span class="v">{{ v }}</span>
        </li>
      </ol>

      <div class="prompt" :class="{ ready }">
        <template v-if="ready">
          <span class="mono q">allow entry?</span>
          <Keycap label="Y" tone="accent" :pressed="pressed" data-cursor="enter" @click.stop="enter">Y <span>enter</span></Keycap>
          <span class="mono hint">{{ coarse ? "or tap anywhere" : "or click the keyhole" }}</span>
        </template>
        <span v-else class="mono q">opening a session</span>
      </div>

      <p class="count" aria-hidden="true"><b>{{ String(Math.round(pct)).padStart(3, "0") }}</b><span>%</span></p>
    </div>
  </div>
</template>

<style scoped>
.splash {
  position: fixed;
  inset: 0;
  z-index: 100;
  cursor: pointer;
  color: var(--text);
}
.field {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}
.ui {
  position: absolute;
  inset: 0;
  pointer-events: none;
  --pad: clamp(20px, 3.4vw, 48px);
}
.ui > * {
  position: absolute;
}
.top {
  top: var(--pad);
  left: var(--pad);
  right: var(--pad);
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  font-weight: 600;
  letter-spacing: 0.14em;
  font-size: 14px;
}
.meta {
  font-size: 11px;
  color: var(--muted);
}
.boot {
  left: var(--pad);
  bottom: var(--pad);
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 4px;
  width: min(380px, calc(100vw - 2 * var(--pad)));
  font-size: 11px;
  color: var(--muted);
}
.boot li {
  display: flex;
  gap: 8px;
  opacity: 0;
  transform: translateX(-6px);
  transition:
    opacity var(--slow) var(--ease),
    transform var(--slow) var(--ease);
}
.boot li.cmd,
.boot li.on {
  opacity: 1;
  transform: none;
}
.boot .cmd {
  color: var(--text);
  margin-bottom: 4px;
}
.ac {
  color: var(--accent);
}
.dots {
  flex: 1;
  border-bottom: 1px dotted rgb(255 255 255 / 0.15);
  margin-bottom: 4px;
}
.v {
  color: var(--text-2);
}
.prompt {
  left: 50%;
  bottom: calc(50% - min(100vw, 100vh) * 0.22 * 0.7 - 72px);
  display: flex;
  align-items: center;
  gap: 12px;
  transform: translateX(-50%);
  white-space: nowrap;
  font-size: 12px;
  color: var(--muted);
  pointer-events: auto;
}
.prompt .q {
  color: var(--text-2);
}
.prompt :deep(.keycap) {
  box-shadow:
    0 0 0 6px rgb(34 225 245 / 0.08),
    0 0 28px rgb(34 225 245 / 0.45);
}
.prompt :deep(.keycap span) {
  opacity: 0.8;
}
.count {
  right: var(--pad);
  bottom: calc(var(--pad) - 10px);
  margin: 0;
  display: flex;
  align-items: flex-start;
  gap: 4px;
  font-stretch: 75%;
  font-weight: 500;
  line-height: 0.85;
  font-variant-numeric: tabular-nums;
}
.count b {
  font-size: clamp(64px, 11vw, 160px);
  font-weight: 500;
  letter-spacing: -0.02em;
}
.count span {
  font-size: 18px;
  color: var(--accent);
  margin-top: 8px;
}
@media (max-width: 720px) {
  .meta {
    display: none;
  }
  .boot {
    bottom: calc(var(--pad) + 110px);
  }
  .hint {
    display: none;
  }
}
</style>
