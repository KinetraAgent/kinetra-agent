<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { deployment, fmt, live, short } from "../lib/chain";
import { gsap, scrollToId } from "../lib/motion";
import { decoder } from "../lib/scramble";
import { band, CHAPTERS, chapterAt } from "../lib/story";
import Keycap from "./Keycap.vue";

const emit = defineEmits<{ go: [p: number]; approve: [] }>();

const root = ref<HTMLElement>();
const kin = ref<HTMLElement>();
const leftRows = ref<HTMLElement[]>([]);
const rightRows = ref<HTMLElement[]>([]);
const cardEls = ref<HTMLElement[]>([]);
const ring = ref<HTMLElement>();
const p = ref(0);
const active = computed(() => chapterAt(p.value));
const pressed = ref(false);

// what the agent did in the demo missions, rolling past like a counter
const LEFT = [
  "read  12 ms",
  "search  1 hit",
  "edit  +3 −1",
  "run  exit 0",
  "test  24 passed",
  "write  4 lines",
  "diff  2 files",
  "Y  approved",
  "list  3 files",
  "N  declined",
  "memory  3 notes",
  "commit  ready",
  "read  42 lines",
  "run  freed 500 MB",
];
// real blocks and real manifest hashes from the registry
const right = computed(() =>
  Array.from({ length: 14 }, (_, i) => {
    const t = live.tools[i % Math.max(live.tools.length, 1)];
    if (i % 3 === 0) return live.block ? `#${fmt(live.block - BigInt(i))}` : `block ${deployment.chainId}`;
    if (i % 3 === 1) return t ? short(t.manifestHash, 6, 4) : "0x…";
    return t ? `${t.name} ✓` : "tool ✓";
  }),
);

const cards = computed(() => [
  { big: "8", small: "model providers" },
  { big: "Y · N · A", small: "approval keys" },
  { big: String(live.tools.length), small: "tools registered onchain" },
  { big: "sha-256", small: "checked before install" },
  { big: live.block ? `#${fmt(live.block)}` : "live", small: "latest block" },
  { big: String(deployment.chainId), small: "robinhood chain id" },
  { big: "MIT", small: "open source" },
  { big: "v1.0", small: "genesis is live" },
]);
let lanes: { x: number; y: number; rx: number; ry: number; rz: number; spin: number }[] = [];
function layoutLanes() {
  lanes = cards.value.map((_, i) => {
    const a = i * 2.39996 + 0.6;
    const r = 0.16 + ((i * 7) % 5) * 0.045;
    return {
      x: Math.cos(a) * r * innerWidth,
      y: Math.sin(a) * r * innerHeight * 1.1,
      rx: ((i * 37) % 30) - 15,
      ry: ((i * 53) % 50) - 25,
      rz: ((i * 29) % 24) - 12,
      spin: i % 2 ? 40 : -40,
    };
  });
}

/** Cards fly out of depth and past the camera, in focus only near the screen plane. */
function flyCards(v: number) {
  cardEls.value.forEach((el, i) => {
    const q = (v - (0.69 + i * 0.011)) / 0.1;
    if (q <= 0 || q >= 1) {
      el.style.visibility = "hidden";
      return;
    }
    const L = lanes[i];
    const z = -2600 + q * 3500;
    const fade = Math.min(q / 0.12, 1) * Math.max(0, Math.min(1, 1 - (z - 600) / 250));
    el.style.visibility = "visible";
    el.style.opacity = String(fade);
    el.style.filter = `blur(${Math.min(Math.abs(z - 80) / 240, 9).toFixed(1)}px)`;
    el.style.transform = `translate3d(${L.x}px, ${L.y}px, ${z}px) rotateX(${L.rx}deg) rotateY(${L.ry + q * L.spin}deg) rotateZ(${L.rz}deg)`;
  });
}

/** Two drums of values: sharp in the middle, soft and dim toward the edges. */
let rolled = 0;
let shown = 0;
function roll(_t: number, dt: number) {
  const v = p.value;
  // the drums fade in after the last kinetic line leaves and out as the petals scatter
  const k = band(0.53, 0.57, 0.68, 0.72, v);
  if (!k && !shown) return;
  shown = k;
  rolled += dt / 1000;
  const rh = 46;
  const total = rh * LEFT.length;
  const half = Math.min(innerHeight * 0.36, 300);
  const drum = (rows: HTMLElement[], dir: number, side: number) =>
    rows.forEach((el, j) => {
      const off = (rolled * 28 + v * 1600) * dir;
      const y = ((((j * rh + off) % total) + total) % total) - total / 2;
      const d = Math.min(Math.abs(y) / half, 1);
      el.style.transform = `translate3d(${side * (1 - d * d) * 28}px, ${y}px, 0) scale(${1 - d * 0.12})`;
      el.style.opacity = String((1 - d * d) * 0.95 * k);
      el.style.filter = `blur(${(d * d * 7).toFixed(1)}px)`;
    });
  drum(leftRows.value, 1, 1);
  drum(rightRows.value, -1, -1);
}

function approve() {
  pressed.value = true;
  setTimeout(() => (pressed.value = false), 160);
  emit("approve");
  ring.value?.classList.remove("go");
  void ring.value?.offsetWidth;
  ring.value?.classList.add("go");
}

function onKey(e: KeyboardEvent) {
  if (e.key.toLowerCase() !== "y" || e.metaKey || e.ctrlKey || e.altKey) return;
  if ((e.target as HTMLElement).closest("input, textarea")) return;
  if (p.value > 0.58 && p.value < 0.69) approve();
}

/** Adds every overlay tween to the hero's scrubbed timeline. Positions are story progress. */
function attach(tl: gsap.core.Timeline) {
  for (const el of root.value!.querySelectorAll<HTMLElement>(".blk")) {
    const at = Number(el.dataset.in);
    const out = Number(el.dataset.out);
    tl.fromTo(el, { autoAlpha: 0, y: 28 }, { autoAlpha: 1, y: 0, duration: 0.025 }, at).to(
      el,
      { autoAlpha: 0, y: -36, filter: "blur(8px)", duration: 0.025 },
      out,
    );
    if (el.dataset.static !== undefined) continue;
    const set = decoder(el);
    const s = { p: 0 };
    set(0);
    tl.fromTo(s, { p: 0 }, { p: 1, duration: 0.05, onUpdate: () => set(s.p) }, at);
  }
  [...kin.value!.children].forEach((line, i) => {
    const at = 0.395 + i * 0.02;
    const set = decoder(line as HTMLElement);
    const s = { p: 0 };
    set(0);
    tl.fromTo(
      line,
      { x: () => innerWidth * 0.36, y: () => innerHeight * 0.3 },
      { x: () => -innerWidth * 1.05, y: () => -innerHeight * 0.5, duration: 0.085 },
      at,
    )
      .fromTo(s, { p: 0 }, { p: 1, duration: 0.03, onUpdate: () => set(s.p) }, at)
      .set(line, { autoAlpha: 1 }, at)
      .set(line, { autoAlpha: 0 }, at + 0.085);
  });
}

function update(v: number) {
  p.value = v;
  flyCards(v);
}

defineExpose({ attach, update });

onMounted(() => {
  layoutLanes();
  addEventListener("resize", layoutLanes);
  addEventListener("keydown", onKey);
  gsap.ticker.add(roll);
  flyCards(0);
});
onBeforeUnmount(() => {
  removeEventListener("resize", layoutLanes);
  removeEventListener("keydown", onKey);
  gsap.ticker.remove(roll);
});
</script>

<template>
  <div ref="root" class="story">
    <!-- plan: the orbits -->
    <p class="blk small tl" data-in="0.15" data-out="0.27">It starts with one line in your terminal.<br />No dashboard, no forms, no waiting.</p>
    <h2 class="blk big br display" data-in="0.17" data-out="0.28">You say what<br />you want done.</h2>

    <!-- act: the warp -->
    <h2 class="blk big mid display" data-in="0.31" data-out="0.385">It becomes<br />a plan.</h2>
    <p class="blk small under mono" data-in="0.32" data-out="0.385">read → search → edit → run → verify</p>

    <!-- execute: lines stream across, bottom right to top left -->
    <div ref="kin" class="kin display" aria-label="It reads your files, writes the code, runs the commands and stops at your key.">
      <p>It reads your files,</p>
      <p>writes the code,</p>
      <p>runs the commands</p>
      <p>and stops at <em>your key.</em></p>
    </div>

    <!-- approve: the bloom between two drums -->
    <div class="drum left mono" aria-hidden="true">
      <span v-for="(t, i) in LEFT" :key="i" ref="leftRows" class="row">{{ t }}</span>
    </div>
    <div class="drum right mono" aria-hidden="true">
      <span v-for="(t, i) in right" :key="i" ref="rightRows" class="row">{{ t }}</span>
    </div>
    <div ref="ring" class="ring" aria-hidden="true"></div>
    <div class="blk approve" data-in="0.585" data-out="0.685">
      <p>Every edit waits<br />for your key.</p>
      <p>Nothing lands<br />until you press Y.</p>
    </div>
    <div class="blk yk" data-in="0.6" data-out="0.685" data-static>
      <Keycap label="Y" tone="accent" :pressed="pressed" data-cursor="approve" @click="approve">Y <span>approve</span></Keycap>
      <span class="mono">press it</span>
    </div>

    <!-- proof: petals come loose, cards fly through -->
    <p class="blk small tl" data-in="0.7" data-out="0.83">Measured on Robinhood Chain,<br />not promised.</p>
    <h2 class="blk big br display" data-in="0.72" data-out="0.84">You hold the keys,<br />nothing runs without them.</h2>
    <div class="cards" aria-hidden="true">
      <div v-for="c in cards" :key="c.small" ref="cardEls" class="fc">
        <b class="display">{{ c.big }}</b>
        <span class="mono">{{ c.small }}</span>
      </div>
    </div>

    <!-- review: the iris -->
    <h2 class="blk huge tl display" data-in="0.87" data-out="0.955">Every change,<br />seen before<br />it lands.</h2>
    <p class="blk small br mono" data-in="0.89" data-out="0.955">git_diff runs before every commit.<br />Move your cursor. It is watching.</p>
    <p class="blk cue mono" data-in="0.93" data-out="0.98" data-static>scroll to execute ↓</p>

    <nav class="rail mono" :class="{ shown: p > 0.02 && p < 0.985 }" aria-label="Story chapters">
      <span class="fill" :style="{ transform: `scaleY(${p})` }"></span>
      <button v-for="(c, i) in CHAPTERS" :key="c.id" type="button" :class="{ on: i === active, past: i < active }" @click="emit('go', c.at)">
        <span class="i">{{ String(i + 1).padStart(2, "0") }}</span>
        <span class="l">{{ c.label }}</span>
      </button>
    </nav>
    <button class="skip mono" :class="{ shown: p > 0.02 && p < 0.95 }" type="button" @click="scrollToId('arcade')">skip the story ↓</button>
  </div>
</template>

<style scoped>
.story {
  position: absolute;
  inset: 0;
  pointer-events: none;
  overflow: hidden;
  --pad: clamp(20px, 4vw, 56px);
}
.blk {
  position: absolute;
  margin: 0;
  visibility: hidden;
}
.small {
  font-family: var(--font-sans);
  font-size: 13px;
  line-height: 1.5;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--text);
}
.small.mono {
  font-family: var(--font-mono);
  text-transform: none;
  letter-spacing: 0;
  color: var(--text-2);
}
.big {
  font-size: clamp(40px, 6vw, 84px);
  line-height: 0.92;
  font-weight: 500;
  color: #f4f7fb;
}
.huge {
  font-size: clamp(52px, 9vw, 140px);
  line-height: 0.88;
  font-weight: 500;
  color: var(--accent);
  text-shadow: 0 0 60px rgb(34 225 245 / 0.35);
}
.tl {
  top: calc(var(--pad) + 72px);
  left: var(--pad);
}
.br {
  right: var(--pad);
  bottom: var(--pad);
  text-align: right;
}
.mid {
  left: 0;
  right: 0;
  top: 38%;
  text-align: center;
  color: #fff6e6;
  text-shadow: 0 0 40px rgb(255 190 90 / 0.5);
}
.under {
  left: 0;
  right: 0;
  top: calc(38% + clamp(100px, 13vw, 180px));
  text-align: center;
  color: rgb(255 240 210 / 0.8);
}

.kin {
  position: absolute;
  inset: 0;
}
.kin p {
  position: absolute;
  left: 50%;
  top: 50%;
  margin: 0;
  white-space: nowrap;
  font-size: clamp(44px, 7vw, 104px);
  line-height: 1;
  font-weight: 500;
  color: #eef2f8;
  visibility: hidden;
}
.kin em {
  font-style: normal;
  color: var(--accent);
}

.drum {
  position: absolute;
  top: 50%;
  display: grid;
  font-size: clamp(14px, 1.3vw, 19px);
  color: #e8eef7;
}
.drum.left {
  left: max(var(--pad), 8vw);
  justify-items: end;
}
.drum.right {
  right: max(var(--pad), 8vw);
  justify-items: start;
}
.row {
  grid-area: 1 / 1;
  white-space: pre;
  opacity: 0;
  will-change: transform, opacity, filter;
}
.approve {
  left: 0;
  right: 0;
  bottom: calc(var(--pad) + 8px);
  display: flex;
  justify-content: center;
  gap: 64px;
  font-size: 13px;
  line-height: 1.45;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--accent);
}
.approve p {
  margin: 0;
  width: 220px;
}
.approve p:first-child {
  text-align: right;
}
.yk {
  left: calc(50% + 150px);
  bottom: calc(var(--pad) + 80px);
  display: flex;
  align-items: center;
  gap: 12px;
  pointer-events: auto;
  font-size: 12px;
  color: var(--muted);
}
.yk :deep(.keycap span) {
  opacity: 0.8;
}
.ring {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 120px;
  height: 120px;
  margin: -60px 0 0 -60px;
  border-radius: 50%;
  border: 1px solid var(--accent);
  box-shadow:
    0 0 30px var(--accent),
    inset 0 0 30px var(--accent);
  opacity: 0;
}
.ring.go {
  animation: burst 900ms var(--ease) forwards;
}
@keyframes burst {
  from {
    opacity: 0.9;
    transform: scale(0.2);
  }
  to {
    opacity: 0;
    transform: scale(9);
  }
}

.cards {
  position: absolute;
  inset: 0;
  perspective: 1000px;
  transform-style: preserve-3d;
}
.fc {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 260px;
  margin: -46px 0 0 -130px;
  padding: 16px 18px;
  display: grid;
  gap: 6px;
  border: 1px solid rgb(255 255 255 / 0.08);
  border-left: 3px solid var(--accent);
  border-radius: 4px;
  background: linear-gradient(135deg, rgb(28 34 46 / 0.92), rgb(10 13 20 / 0.92));
  box-shadow:
    -14px 0 40px -20px var(--accent),
    0 30px 60px -20px rgb(0 0 0 / 0.8);
  visibility: hidden;
  will-change: transform, opacity, filter;
}
.fc b {
  font-size: 40px;
  line-height: 1;
  font-weight: 500;
  color: #f4f7fb;
}
.fc span {
  font-size: 11px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--text-2);
}

.cue {
  left: 0;
  right: 0;
  bottom: var(--pad);
  text-align: center;
  font-size: 12px;
  color: var(--text-2);
}

.rail {
  position: absolute;
  right: 20px;
  top: 50%;
  display: grid;
  gap: 4px;
  transform: translate(12px, -50%);
  opacity: 0;
  pointer-events: none;
  transition:
    opacity var(--slow) var(--ease),
    transform var(--slow) var(--ease);
}
.rail.shown {
  opacity: 1;
  transform: translate(0, -50%);
  pointer-events: auto;
}
.rail::before,
.fill {
  content: "";
  position: absolute;
  right: 3px;
  top: 10px;
  bottom: 10px;
  width: 1px;
  background: rgb(255 255 255 / 0.12);
}
.fill {
  background: var(--accent);
  transform-origin: 50% 0;
  box-shadow: 0 0 8px var(--accent);
}
.rail button {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  height: 22px;
  padding: 0 16px 0 0;
  border: 0;
  background: none;
  font-size: 10px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: rgb(255 255 255 / 0.35);
  cursor: pointer;
  transition: color var(--fast) var(--ease);
}
.rail button::after {
  content: "";
  position: absolute;
  right: 0;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  border: 1px solid currentColor;
  background: #05070c;
  transition:
    background-color var(--fast) var(--ease),
    box-shadow var(--fast) var(--ease);
}
.rail .l {
  max-width: 0;
  overflow: hidden;
  opacity: 0;
  transition:
    max-width var(--slow) var(--ease),
    opacity var(--mid) var(--ease);
}
.rail:hover .l,
.rail button.on .l {
  max-width: 80px;
  opacity: 1;
}
.rail button:hover,
.rail button.past {
  color: rgb(255 255 255 / 0.65);
}
.rail button.on {
  color: var(--accent);
}
.rail button.on::after,
.rail button.past::after {
  background: currentColor;
}
.rail button.on::after {
  box-shadow: 0 0 10px var(--accent);
}
.skip {
  position: absolute;
  left: 50%;
  bottom: 16px;
  padding: 8px 12px;
  border: 0;
  background: none;
  font-size: 11px;
  color: rgb(255 255 255 / 0.4);
  cursor: pointer;
  transform: translate(-50%, 8px);
  opacity: 0;
  pointer-events: none;
  transition:
    opacity var(--slow) var(--ease),
    transform var(--slow) var(--ease),
    color var(--fast) var(--ease);
}
.skip.shown {
  opacity: 1;
  transform: translate(-50%, 0);
  pointer-events: auto;
}
.skip:hover {
  color: var(--text);
}

@media (max-width: 900px) {
  .rail {
    right: 10px;
  }
  .rail .l {
    display: none;
  }
  .drum.left {
    left: 12px;
  }
  /* the right drum stops short of the chapter rail */
  .drum.right {
    right: 44px;
  }
  .drum {
    font-size: 11px;
  }
  .approve {
    gap: 32px;
    bottom: calc(var(--pad) + 28px);
  }
  .approve p {
    width: 150px;
  }
  .yk {
    left: 50%;
    margin-left: -64px;
    bottom: calc(var(--pad) + 96px);
  }
  .fc {
    width: 200px;
    margin-left: -100px;
  }
  .fc b {
    font-size: 30px;
  }
}
</style>
