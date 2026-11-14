import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";
import { decoder } from "./scramble";

gsap.registerPlugin(ScrollTrigger);

export { gsap, ScrollTrigger };
export const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
export const finePointer = matchMedia("(hover: hover) and (pointer: fine)").matches;
let lenis: Lenis | null = null;

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
}
/** The hero scene has drawn its first frame. */
export const sceneReady = deferred();
/** The splash has opened; the page below may play its entrances. */
export const introDone = deferred();
/** 0 while the splash covers the page, 1 once the hero sits in its final layout. */
export const intro = { t: reduced ? 1 : 0 };
/** Smoothed scroll velocity in px per frame, shared by the marquee and the background. */
export const scroll = { velocity: 0 };

export function lockScroll(on: boolean) {
  document.documentElement.classList.toggle("locked", on);
  if (on) lenis?.stop();
  else lenis?.start();
}

export function initMotion() {
  if (!reduced) {
    lenis = new Lenis({ lerp: 0.1 });
    lenis.on("scroll", (l: Lenis) => {
      scroll.velocity = l.velocity;
      ScrollTrigger.update();
    });
    gsap.ticker.add((t) => lenis!.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);
    if (document.documentElement.classList.contains("locked")) lenis.stop();
  }

  // blocks rise out of depth, slightly tilted and out of focus, then settle
  for (const el of gsap.utils.toArray<HTMLElement>(".reveal")) {
    if (reduced) {
      gsap.set(el, { opacity: 1 });
      continue;
    }
    gsap.fromTo(
      el,
      { opacity: 0, y: 56, rotationX: -12, scale: 0.97, filter: "blur(10px)", transformPerspective: 1200, transformOrigin: "50% 0%" },
      {
        opacity: 1,
        y: 0,
        rotationX: 0,
        scale: 1,
        filter: "blur(0px)",
        duration: 1.1,
        ease: "expo.out",
        delay: Number(el.dataset.delay ?? 0) * 2,
        clearProps: "transform,filter",
        scrollTrigger: { trigger: el, start: "top 88%", once: true },
      },
    );
  }

  // section titles decode from glyph noise into words
  for (const el of gsap.utils.toArray<HTMLElement>(".h2, [data-decode]")) {
    const set = decoder(el);
    if (reduced) continue;
    set(0);
    const state = { p: 0 };
    gsap.to(state, {
      p: 1,
      duration: 1.4,
      ease: "power2.out",
      onUpdate: () => set(state.p),
      scrollTrigger: { trigger: el, start: "top 85%", once: true },
    });
  }

  // slow drift for decorative layers
  for (const el of gsap.utils.toArray<HTMLElement>("[data-speed]")) {
    if (reduced) break;
    gsap.to(el, {
      yPercent: Number(el.dataset.speed) * 100,
      ease: "none",
      scrollTrigger: { trigger: el.parentElement, start: "top bottom", end: "bottom top", scrub: true },
    });
  }

  if (finePointer && !reduced) pointerFx();
}

/** Cursor spotlight on every card, a tilt on tiles, a pull on buttons. One listener for the whole page. */
function pointerFx() {
  let tilted: HTMLElement | null = null;
  let pulled: HTMLElement | null = null;
  const release = (el: HTMLElement | null, props: gsap.TweenVars) => el && gsap.to(el, { ...props, duration: 0.8, ease: "elastic.out(1, 0.5)" });

  addEventListener(
    "pointermove",
    (e) => {
      const target = e.target as HTMLElement;
      const card = target.closest<HTMLElement>(".card");
      if (card) {
        const r = card.getBoundingClientRect();
        card.style.setProperty("--mx", `${e.clientX - r.left}px`);
        card.style.setProperty("--my", `${e.clientY - r.top}px`);
      }

      const tile = target.closest<HTMLElement>("[data-tilt]");
      if (tile !== tilted) release(tilted, { rotationX: 0, rotationY: 0 });
      tilted = tile;
      if (tile) {
        const r = tile.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width - 0.5;
        const y = (e.clientY - r.top) / r.height - 0.5;
        const max = Number(tile.dataset.tilt || 6);
        gsap.to(tile, { rotationY: x * max, rotationX: -y * max, transformPerspective: 900, duration: 0.5, ease: "power3.out" });
      }

      const mag = target.closest<HTMLElement>(".btn, [data-magnetic]");
      if (mag !== pulled) release(pulled, { x: 0, y: 0 });
      pulled = mag;
      if (mag) {
        const r = mag.getBoundingClientRect();
        gsap.to(mag, { x: (e.clientX - r.left - r.width / 2) * 0.25, y: (e.clientY - r.top - r.height / 2) * 0.35, duration: 0.4, ease: "power3.out" });
      }
    },
    { passive: true },
  );
}

export function scrollToY(y: number) {
  if (lenis) lenis.scrollTo(y, { duration: 1.6 });
  else scrollTo({ top: y, behavior: reduced ? "auto" : "smooth" });
}

export function scrollToId(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  if (lenis) lenis.scrollTo(el, { offset: -56 });
  else el.scrollIntoView({ behavior: reduced ? "auto" : "smooth" });
}
