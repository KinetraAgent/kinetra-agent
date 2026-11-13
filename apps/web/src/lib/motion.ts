import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";

gsap.registerPlugin(ScrollTrigger);

export { gsap, ScrollTrigger };
export const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
let lenis: Lenis | null = null;

export function initMotion() {
  if (!reduced) {
    lenis = new Lenis({ lerp: 0.12 });
    lenis.on("scroll", ScrollTrigger.update);
    gsap.ticker.add((t) => lenis!.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);
  }
  // one short entrance per block
  for (const el of gsap.utils.toArray<HTMLElement>(".reveal")) {
    gsap.to(el, {
      opacity: 1,
      y: 0,
      duration: 0.5,
      ease: "power3.out",
      delay: Number(el.dataset.delay ?? 0),
      scrollTrigger: { trigger: el, start: "top 90%", once: true },
    });
  }
}

export function scrollToId(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  if (lenis) lenis.scrollTo(el, { offset: -56 });
  else el.scrollIntoView({ behavior: reduced ? "auto" : "smooth" });
}
