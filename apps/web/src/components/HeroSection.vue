<script setup lang="ts">
import { ArrowDown } from "lucide-vue-next";
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { CHAIN_NAME, deployment, fmt, live } from "../lib/chain";
import { INSTALL_SH } from "../lib/links";
import { gsap, introDone, reduced, scrollToId, scrollToY } from "../lib/motion";
import { decoder } from "../lib/scramble";
import type { KinetraSphere } from "../lib/sphere";
import InstallCommand from "./InstallCommand.vue";
import RollingNumber from "./RollingNumber.vue";
import StoryOverlay from "./StoryOverlay.vue";

const section = ref<HTMLElement>();
const canvas = ref<HTMLCanvasElement>();
const copy = ref<HTMLElement>();
const title = ref<HTMLElement>();
const panel = ref<HTMLElement>();
const sky = ref<HTMLElement>();
const beam = ref<SVGElement>();
const sunrise = ref<HTMLElement>();
const veil = ref<HTMLElement>();
const story = ref<InstanceType<typeof StoryOverlay>>();
let sphere: KinetraSphere | undefined;
let ctx: gsap.Context | undefined;
let resize: ResizeObserver | undefined;
let seen: IntersectionObserver | undefined;
let trigger: ScrollTrigger | undefined;
let stepper = 0;
let alive = true;

// the flow every request walks through, cycled on the live card
const STEPS = ["intent", "plan", "approve", "execute"];
const step = ref(2);
const hash = computed(() => {
  const h = live.release?.checksum.slice(2) ?? "";
  return h ? [h.slice(0, 4), h.slice(4, 8), h.slice(8, 12), h.slice(-4)].join(" · ") : "";
});

onMounted(() => {
  // three.js loads in its own chunk so the copy paints first
  import("../lib/sphere").then(({ KinetraSphere }) => {
    if (!alive) return;
    sphere = new KinetraSphere(canvas.value!, reduced);
    resize = new ResizeObserver(([e]) => sphere?.resize(e.contentRect.width, e.contentRect.height));
    resize.observe(canvas.value!);
    // render only while the hero is on screen
    seen = new IntersectionObserver(([e]) => (e.isIntersecting ? sphere?.start() : sphere?.stop()));
    seen.observe(section.value!);
  });

  ctx = gsap.context(() => {
    gsap.set([copy.value!.children, panel.value], { opacity: 0 });
    if (reduced) return;
    gsap.set(sky.value!, { "--c1": "#02040c", "--c2": "#0b1d55" });
    const tl = gsap.timeline({
      defaults: { ease: "none" },
      scrollTrigger: {
        trigger: section.value,
        start: "top top",
        end: "+=760%",
        pin: true,
        scrub: true,
        invalidateOnRefresh: true,
        onUpdate: (s) => {
          if (sphere) sphere.progress = s.progress;
          story.value?.update(s.progress);
        },
      },
    });
    trigger = tl.scrollTrigger;
    tl.to(copy.value!, { opacity: 0, y: -64, filter: "blur(8px)", duration: 0.05 }, 0)
      .to(panel.value!.parentElement!, { opacity: 0, y: 32, duration: 0.04 }, 0)
      .to(beam.value!, { opacity: 0.55, duration: 0.1 }, 0.1)
      .to(beam.value!, { opacity: 0, duration: 0.06 }, 0.27);
    // the sky changes with each chapter: night blue, haze, gold, black, slate, black, teal, black
    const SKY: [number, string, string][] = [
      [0.16, "#141b2b", "#2a3550"],
      [0.33, "#2a1a06", "#5a3a0c"],
      [0.43, "#010102", "#060504"],
      [0.56, "#04060b", "#141c2c"],
      [0.72, "#020305", "#0a0e16"],
      [0.86, "#08110f", "#16211e"],
      [0.97, "#000000", "#000000"],
    ];
    let prev = 0.02;
    for (const [at, c1, c2] of SKY) {
      tl.to(sky.value!, { "--c1": c1, "--c2": c2, duration: at - prev - 0.02 }, prev + 0.02);
      prev = at;
    }
    tl.fromTo(sunrise.value!, { opacity: 0, yPercent: 30 }, { opacity: 1, yPercent: 0, duration: 0.06 }, 0.47)
      .to(sunrise.value!, { opacity: 0.35, duration: 0.08 }, 0.56)
      .to(sunrise.value!, { opacity: 0, duration: 0.05 }, 0.68)
      .fromTo(veil.value!, { opacity: 0 }, { opacity: 1, duration: 0.025 }, 0.975);
    story.value!.attach(tl);
    tl.set({}, {}, 1);
  });

  introDone.promise.then(() => {
    if (!alive) return;
    const set = decoder(title.value!);
    const s = { p: reduced ? 1 : 0 };
    set(s.p);
    gsap.to(s, { p: 1, duration: 1.8, ease: "power2.out", onUpdate: () => set(s.p) });
    gsap.fromTo(
      copy.value!.children,
      { opacity: 0, y: 28, filter: "blur(8px)" },
      { opacity: 1, y: 0, filter: "blur(0px)", duration: 1.2, ease: "expo.out", stagger: 0.09, clearProps: "filter" },
    );
    gsap.fromTo(panel.value!, { opacity: 0, x: 48 }, { opacity: 1, x: 0, duration: 1.4, ease: "expo.out", delay: 0.35 });
  });
  stepper = window.setInterval(() => (step.value = (step.value + 1) % STEPS.length), 1600);
});

function goTo(p: number) {
  if (trigger) scrollToY(trigger.start + (trigger.end - trigger.start) * p);
}

onBeforeUnmount(() => {
  alive = false;
  clearInterval(stepper);
  ctx?.revert();
  resize?.disconnect();
  seen?.disconnect();
  sphere?.dispose();
});
</script>

<template>
  <section id="top" ref="section" class="hero" data-theme="dark">
    <div class="stage">
      <div ref="sky" class="sky"></div>
      <svg ref="beam" class="beam" viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <defs>
          <linearGradient id="beam-g" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stop-color="#2f6bff" stop-opacity="0" />
            <stop offset="0.42" stop-color="#3d7bff" stop-opacity="0.95" />
            <stop offset="0.75" stop-color="#22e1f5" stop-opacity="0.35" />
            <stop offset="1" stop-color="#22e1f5" stop-opacity="0" />
          </linearGradient>
          <filter id="beam-wide" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="42" /></filter>
          <filter id="beam-thin" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="7" /></filter>
        </defs>
        <path d="M-160 40 C 320 180, 640 460, 860 760 S 1120 1120, 1200 1180" stroke="url(#beam-g)" stroke-width="190" fill="none" filter="url(#beam-wide)" />
        <path d="M-160 40 C 320 180, 640 460, 860 760 S 1120 1120, 1200 1180" stroke="url(#beam-g)" stroke-width="18" fill="none" filter="url(#beam-thin)" opacity="0.6" />
      </svg>
      <div ref="sunrise" class="sunrise" aria-hidden="true"></div>
      <canvas ref="canvas" class="gl" role="img" aria-label="The KINETRA mark, a sphere of five ribbons. Drag it to spin, scroll to step inside."></canvas>
    </div>

    <div class="wrap layout">
      <div ref="copy" class="copy">
        <p class="status mono"><span class="dot"></span>Genesis is live on {{ CHAIN_NAME }}</p>
        <h1 ref="title">From Intent <br />to <em>Execution.</em></h1>
        <p class="sub">
          KINETRA is an AI agent for your terminal. Say what you want done. It reads your files, writes the code, runs the
          commands and shows you every change before it lands.
        </p>
        <div class="actions">
          <InstallCommand :command="INSTALL_SH" />
          <button class="split" type="button" data-magnetic @click="scrollToId('arcade')">
            <span class="lbl">Play the execution demo</span>
            <span class="arr"><ArrowDown :size="16" :stroke-width="1.75" /></span>
          </button>
        </div>
      </div>
    </div>

    <div class="live-wrap wrap">
      <aside ref="panel" class="live mono" aria-label="Live from the chain">
        <header>
          <span>Latest release{{ live.release ? ` · v${live.release.version}` : "" }}</span>
          <span class="on"><span class="dot"></span>live</span>
        </header>
        <p class="hash">
          <template v-if="hash">sha256 {{ hash }}</template><span v-else class="skeleton"></span>
          <span class="blk">#<RollingNumber v-if="live.block" :value="fmt(live.block)" /><span v-else>…</span></span>
        </p>
        <div class="flow">
          <span class="n">step {{ step + 1 }} / 4</span>
          <ol class="track" :style="{ '--s': step }">
            <li v-for="(s, i) in STEPS" :key="s" :class="{ done: i <= step }"><span>{{ s }}</span></li>
          </ol>
        </div>
        <p class="meta">chain {{ deployment.chainId }} · 8 model providers · asks before it acts</p>
      </aside>
    </div>

    <StoryOverlay v-if="!reduced" ref="story" @go="goTo" @approve="sphere?.kick()" />
    <div ref="veil" class="veil" aria-hidden="true"></div>
  </section>
</template>

<style scoped>
.hero {
  position: relative;
  height: 100svh;
  min-height: 640px;
  overflow: hidden;
  background: #02040c;
  color: var(--text);
}
.stage {
  position: absolute;
  inset: 0;
  transform-origin: 50% 50%;
}
.sky {
  position: absolute;
  inset: 0;
  --c1: #02040c;
  --c2: #0b1d55;
  background:
    radial-gradient(130% 85% at 50% 108%, var(--c2), transparent 70%),
    linear-gradient(180deg, var(--c1), color-mix(in srgb, var(--c1) 60%, var(--c2)));
}
.beam {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  mix-blend-mode: screen;
  opacity: 0.9;
  will-change: transform, opacity;
  pointer-events: none;
}
.sunrise {
  position: absolute;
  left: -20%;
  right: -20%;
  bottom: -55vh;
  height: 110vh;
  border-radius: 50%;
  background: radial-gradient(closest-side, rgb(205 225 255 / 0.85), rgb(120 160 230 / 0.35) 45%, transparent 100%);
  filter: blur(20px);
  opacity: 0;
  pointer-events: none;
}
.gl {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  touch-action: pan-y;
}
.layout {
  position: relative;
  height: 100%;
  display: flex;
  align-items: center;
  pointer-events: none;
}
.copy {
  max-width: 580px;
  padding-bottom: 72px;
  pointer-events: auto;
}
.status {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 24px;
  padding: 6px 12px 6px 10px;
  border: 1px solid var(--line-2);
  border-radius: 999px;
  background: rgb(255 255 255 / 0.04);
  font-size: 12px;
  color: var(--text-2);
}
h1 {
  margin: 0;
  font-size: clamp(48px, 7.4vw, 104px);
  line-height: 0.96;
  font-weight: 500;
  letter-spacing: -0.035em;
}
h1 em {
  font-style: normal;
  color: var(--accent);
  text-shadow: 0 0 40px rgb(34 225 245 / 0.35);
}
.sub {
  margin: 24px 0 32px;
  font-size: 18px;
  line-height: 1.6;
  color: var(--text-2);
  max-width: 34rem;
}
.actions {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 12px;
  max-width: 480px;
}
.split {
  justify-self: start;
  display: inline-flex;
  align-items: stretch;
  height: 44px;
  padding: 0;
  border: 0;
  background: none;
  cursor: pointer;
  font-size: 13px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
.split .lbl {
  display: grid;
  place-items: center;
  padding: 0 18px;
  background: #f2f5fa;
  color: #05070d;
  font-weight: 600;
  transition: background-color var(--fast) var(--ease);
}
.split .arr {
  display: grid;
  place-items: center;
  width: 44px;
  margin-left: 3px;
  background: var(--accent);
  color: var(--accent-ink);
  transition: transform var(--mid) var(--ease);
}
.split:hover .lbl {
  background: #fff;
}
.split:hover .arr {
  transform: translateY(3px);
}

.live-wrap {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 28px;
  margin: 0 auto;
  display: flex;
  justify-content: flex-end;
  pointer-events: none;
}
.live {
  width: min(440px, 100%);
  padding: 16px 18px 14px 20px;
  border: 1px solid rgb(255 255 255 / 0.08);
  border-left: 2px solid var(--accent);
  border-radius: 4px;
  background: linear-gradient(180deg, rgb(14 26 60 / 0.55), rgb(6 10 26 / 0.55));
  backdrop-filter: blur(14px) saturate(140%);
  -webkit-backdrop-filter: blur(14px) saturate(140%);
  box-shadow: -12px 0 40px -18px rgb(34 225 245 / 0.6);
  font-size: 11px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--text-2);
  pointer-events: auto;
}
.live header {
  display: flex;
  justify-content: space-between;
  color: var(--text);
  font-weight: 500;
}
.live .on {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--accent);
}
.live .on .dot {
  background: var(--accent);
  box-shadow: 0 0 10px var(--accent);
}
.hash {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  margin: 8px 0 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid rgb(255 255 255 / 0.08);
  text-transform: none;
  color: var(--muted);
}
.blk {
  display: inline-flex;
  color: var(--text-2);
}
.flow {
  display: grid;
  grid-template-columns: auto 1fr;
  align-items: center;
  gap: 14px;
}
.flow .n {
  color: var(--text);
  white-space: nowrap;
}
.track {
  --s: 0;
  position: relative;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  margin: 0;
  padding: 0;
  list-style: none;
}
.track::before,
.track::after {
  content: "";
  position: absolute;
  left: 4px;
  right: 4px;
  top: 4px;
  height: 1px;
  background: rgb(255 255 255 / 0.14);
}
.track::after {
  right: auto;
  width: calc((100% - 8px) * var(--s) / 3);
  background: var(--accent);
  box-shadow: 0 0 8px var(--accent);
  transition: width 600ms var(--ease);
}
.track li {
  position: relative;
  padding-top: 14px;
  font-size: 9px;
  color: var(--muted);
  transition: color var(--mid) var(--ease);
}
.track li::before {
  content: "";
  position: absolute;
  left: 0;
  top: 0;
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: #0b1430;
  border: 1px solid rgb(255 255 255 / 0.25);
  z-index: 1;
  transition:
    background-color var(--mid) var(--ease),
    box-shadow var(--mid) var(--ease);
}
.track li:last-child {
  text-align: right;
}
.track li:last-child::before {
  left: auto;
  right: 0;
}
.track li.done {
  color: var(--text);
}
.track li.done::before {
  background: var(--accent);
  border-color: var(--accent);
  box-shadow: 0 0 10px var(--accent);
}
.meta {
  margin: 12px 0 0;
  color: var(--muted);
}
.veil {
  position: absolute;
  inset: 0;
  background: #000;
  opacity: 0;
  pointer-events: none;
}

@media (max-width: 900px) {
  .layout {
    align-items: flex-end;
    padding-bottom: 170px;
  }
  .copy {
    padding-bottom: 0;
  }
  .sub {
    font-size: 16px;
    margin: 16px 0 24px;
  }
  .live-wrap {
    bottom: 16px;
  }
  .live {
    width: 100%;
  }
}
@media (max-width: 560px) {
  .layout {
    padding-bottom: 104px;
  }
  .sub {
    font-size: 15px;
  }
  .live .flow,
  .live .meta {
    display: none;
  }
  .hash {
    margin-bottom: 0;
    padding-bottom: 0;
    border: 0;
  }
}
</style>
