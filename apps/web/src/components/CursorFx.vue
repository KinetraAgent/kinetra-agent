<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import { finePointer, gsap, reduced } from "../lib/motion";

// A ring that trails the pointer, grows over anything clickable and names the action when one is given.
const on = finePointer && !reduced;
const ring = ref<HTMLElement>();
const dot = ref<HTMLElement>();
const label = ref("");
const hover = ref(false);
const down = ref(false);
const hidden = ref(true);
let moveRing: ((x: number, y: number) => void) | undefined;

function move(e: PointerEvent) {
  hidden.value = false;
  moveRing?.(e.clientX, e.clientY);
  const el = (e.target as HTMLElement).closest<HTMLElement>("a, button, [data-cursor], label, .card");
  const typing = !!(e.target as HTMLElement).closest("input, textarea");
  hover.value = !!el && !typing && !el.matches(".card");
  label.value = el?.dataset.cursor ?? "";
  dot.value!.style.transform = `translate3d(${e.clientX}px, ${e.clientY}px, 0)`;
  dot.value!.style.opacity = typing ? "0" : "1";
}
const press = () => (down.value = true);
const lift = () => (down.value = false);
const leave = () => (hidden.value = true);

onMounted(() => {
  if (!on) return;
  const x = gsap.quickTo(ring.value!, "x", { duration: 0.45, ease: "power3.out" });
  const y = gsap.quickTo(ring.value!, "y", { duration: 0.45, ease: "power3.out" });
  moveRing = (px, py) => (x(px), y(py));
  addEventListener("pointermove", move, { passive: true });
  addEventListener("pointerdown", press);
  addEventListener("pointerup", lift);
  document.documentElement.addEventListener("pointerleave", leave);
});
onBeforeUnmount(() => {
  removeEventListener("pointermove", move);
  removeEventListener("pointerdown", press);
  removeEventListener("pointerup", lift);
  document.documentElement.removeEventListener("pointerleave", leave);
});
</script>

<template>
  <div v-if="on" class="cursor" :class="{ hover, down, hidden, named: !!label }" aria-hidden="true">
    <div ref="ring" class="ring"><span>{{ label }}</span></div>
    <div ref="dot" class="dot"></div>
  </div>
</template>

<style scoped>
.cursor {
  position: fixed;
  inset: 0;
  z-index: 120;
  pointer-events: none;
  mix-blend-mode: difference;
  transition: opacity var(--mid) var(--ease);
}
.cursor.hidden {
  opacity: 0;
}
.ring,
.dot {
  position: absolute;
  left: 0;
  top: 0;
}
.ring {
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  margin: -18px 0 0 -18px;
  border: 1px solid rgb(255 255 255 / 0.7);
  border-radius: 50%;
  transition:
    width var(--slow) var(--ease),
    height var(--slow) var(--ease),
    margin var(--slow) var(--ease),
    background-color var(--mid) var(--ease),
    border-color var(--mid) var(--ease);
}
.ring span {
  font-family: var(--font-mono);
  font-size: 10px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: #000;
  opacity: 0;
  transition: opacity var(--fast) var(--ease);
}
.hover .ring {
  width: 64px;
  height: 64px;
  margin: -32px 0 0 -32px;
  border-color: transparent;
  background: rgb(255 255 255 / 0.9);
}
.named .ring {
  width: 84px;
  height: 84px;
  margin: -42px 0 0 -42px;
}
.named .ring span {
  opacity: 1;
}
.down .ring {
  width: 28px;
  height: 28px;
  margin: -14px 0 0 -14px;
}
.dot {
  width: 4px;
  height: 4px;
  margin: -2px 0 0 -2px;
  border-radius: 50%;
  background: #fff;
}
.hover .dot {
  opacity: 0 !important;
}
</style>
