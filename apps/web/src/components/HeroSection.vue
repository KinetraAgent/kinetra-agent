<script setup lang="ts">
import { ArrowDown } from "lucide-vue-next";
import { onBeforeUnmount, onMounted, ref } from "vue";
import { CHAIN_NAME, deployment, fmt, live, short } from "../lib/chain";
import { INSTALL_SH } from "../lib/links";
import { gsap, reduced, scrollToId } from "../lib/motion";
import type { KinetraSphere } from "../lib/sphere";
import InstallCommand from "./InstallCommand.vue";

const section = ref<HTMLElement>();
const canvas = ref<HTMLCanvasElement>();
const copy = ref<HTMLElement>();
const panel = ref<HTMLElement>();
const veil = ref<HTMLElement>();
let sphere: KinetraSphere | undefined;
let ctx: gsap.Context | undefined;
let resize: ResizeObserver | undefined;
let seen: IntersectionObserver | undefined;

let alive = true;

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
    gsap.from([copy.value!.children, panel.value], { opacity: 0, y: 12, duration: 0.6, ease: "power3.out", stagger: 0.05 });
    if (reduced) return;
    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: section.value,
        start: "top top",
        end: "+=140%",
        pin: true,
        scrub: true,
        onUpdate: (s) => sphere && (sphere.progress = s.progress),
      },
    });
    tl.to(copy.value!, { opacity: 0, y: -48, ease: "none", duration: 0.3 }, 0)
      .to(panel.value!, { opacity: 0, y: 24, ease: "none", duration: 0.25 }, 0)
      .to(veil.value!, { opacity: 1, ease: "none", duration: 0.18 }, 0.82);
  });
});

onBeforeUnmount(() => {
  alive = false;
  ctx?.revert();
  resize?.disconnect();
  seen?.disconnect();
  sphere?.dispose();
});
</script>

<template>
  <section id="top" ref="section" class="hero">
    <canvas ref="canvas" class="gl" role="img" aria-label="The KINETRA mark, a sphere of five ribbons. Drag it to spin."></canvas>
    <div class="wrap layout">
      <div ref="copy" class="copy">
        <p class="status mono"><span class="dot"></span>Genesis is live on {{ CHAIN_NAME }}</p>
        <h1>From Intent <br />to Execution.</h1>
        <p class="sub">
          KINETRA is an AI agent for your terminal. Say what you want done. It reads your files, writes the code, runs the
          commands and shows you every change before it lands.
        </p>
        <div class="actions">
          <InstallCommand :command="INSTALL_SH" />
          <button class="btn" type="button" @click="scrollToId('arcade')">
            Play the execution demo <ArrowDown :size="16" :stroke-width="1.5" />
          </button>
        </div>
      </div>
    </div>
    <dl ref="panel" class="panel wrap mono">
      <div>
        <dt>chain id {{ deployment.chainId }}</dt>
        <dd>{{ CHAIN_NAME }}</dd>
      </div>
      <div>
        <dt>block</dt>
        <dd>
          <template v-if="live.block">#{{ fmt(live.block) }}</template><span v-else class="skeleton"></span>
        </dd>
      </div>
      <div>
        <dt>release{{ live.release ? ` v${live.release.version}` : "" }}</dt>
        <dd v-if="live.release">sha256 {{ short(live.release.checksum, 6, 4) }}</dd>
        <dd v-else><span class="skeleton"></span></dd>
      </div>
      <div>
        <dt>models</dt>
        <dd>8 providers · your own keys</dd>
      </div>
      <div>
        <dt>approval</dt>
        <dd>asks before it acts</dd>
      </div>
    </dl>
    <div ref="veil" class="veil" aria-hidden="true"></div>
  </section>
</template>

<style scoped>
.hero {
  position: relative;
  height: 100svh;
  min-height: 640px;
  overflow: hidden;
  background: var(--bg-deep);
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
  max-width: 560px;
  padding-bottom: 48px;
  pointer-events: auto;
}
.status {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 24px;
  font-size: 12px;
  color: var(--text-2);
}
h1 {
  margin: 0;
  font-size: clamp(44px, 7vw, 88px);
  line-height: 1;
  font-weight: 500;
  letter-spacing: -0.03em;
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
.actions .btn {
  justify-self: start;
}
.panel {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 24px;
  margin: 0 auto;
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  font-size: 12px;
}
.panel > div {
  padding: 12px 16px;
  border-top: 1px solid var(--line-2);
}
.panel > div + div {
  border-left: 1px solid var(--line);
}
dt {
  color: var(--muted);
  margin-bottom: 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
dd {
  margin: 0;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.veil {
  position: absolute;
  inset: 0;
  background: var(--bg);
  opacity: 0;
  pointer-events: none;
}

@media (max-width: 1100px) {
  .panel {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
  .panel > div:nth-child(n + 4) {
    display: none;
  }
}
@media (max-width: 900px) {
  .layout {
    align-items: flex-end;
    padding-bottom: 112px;
  }
  .copy {
    padding-bottom: 0;
  }
  .sub {
    font-size: 16px;
    margin: 16px 0 24px;
  }
  .panel {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    bottom: 16px;
  }
  .panel > div:nth-child(n + 3) {
    display: none;
  }
}
</style>
