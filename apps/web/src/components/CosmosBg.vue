<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import { reduced, scroll } from "../lib/motion";
import { theme } from "../lib/theme";

// Dust that drifts behind every section. It trails into streaks when you scroll fast, deeper motes faster.
const canvas = ref<HTMLCanvasElement>();
let frame = 0;
let ctx: CanvasRenderingContext2D;
let w = 0;
let h = 0;
let mx = 0;
let my = 0;
const motes = Array.from({ length: matchMedia("(max-width: 900px)").matches ? 60 : 130 }, () => ({
  x: Math.random(),
  y: Math.random(),
  z: 0.15 + Math.random() * 0.85,
}));

function size() {
  const dpr = Math.min(devicePixelRatio, 2);
  w = innerWidth;
  h = innerHeight;
  canvas.value!.width = w * dpr;
  canvas.value!.height = h * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function draw() {
  frame = requestAnimationFrame(draw);
  // the story paints its own sky; nothing to draw until the first section reaches the viewport
  const first = document.getElementById("arcade");
  ctx.clearRect(0, 0, w, h);
  if (first && first.getBoundingClientRect().top > h) return;
  const v = Math.max(Math.min(scroll.velocity, 80), -80);
  const ink = theme.value === "dark" ? "190,225,255" : "30,60,120";
  ctx.lineCap = "round";
  for (const m of motes) {
    m.y -= (v * m.z * 0.6 + 0.08 * m.z) / h;
    if (m.y < -0.05) m.y += 1.1;
    if (m.y > 1.05) m.y -= 1.1;
    const x = m.x * w + mx * m.z * 20;
    const y = m.y * h + my * m.z * 14;
    const a = (theme.value === "dark" ? 0.55 : 0.3) * m.z;
    ctx.strokeStyle = `rgba(${ink},${a})`;
    ctx.lineWidth = 0.6 + m.z * 1.6;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, y + v * m.z * 1.4 + 0.01);
    ctx.stroke();
  }
}
const point = (e: PointerEvent) => {
  mx = (e.clientX / w) * 2 - 1;
  my = (e.clientY / h) * 2 - 1;
};

onMounted(() => {
  if (reduced) return;
  ctx = canvas.value!.getContext("2d")!;
  size();
  addEventListener("resize", size);
  addEventListener("pointermove", point, { passive: true });
  frame = requestAnimationFrame(draw);
});
onBeforeUnmount(() => {
  cancelAnimationFrame(frame);
  removeEventListener("resize", size);
  removeEventListener("pointermove", point);
});
</script>

<template>
  <div class="cosmos" aria-hidden="true">
    <canvas ref="canvas"></canvas>
  </div>
</template>

<style scoped>
.cosmos {
  position: fixed;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  background:
    radial-gradient(60vw 50vh at 85% 0%, color-mix(in srgb, var(--blue) 10%, transparent), transparent 70%),
    radial-gradient(50vw 50vh at 0% 100%, color-mix(in srgb, var(--accent) 7%, transparent), transparent 70%);
}
canvas {
  width: 100%;
  height: 100%;
}
</style>
