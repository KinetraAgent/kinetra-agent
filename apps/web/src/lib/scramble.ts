// Text that resolves out of glyph noise. Each character keeps its final width, so nothing reflows.
const GLYPHS = "▚▞◢◤░▒/\\<>_+=*#01KNTRX";
const glyph = () => GLYPHS[(Math.random() * GLYPHS.length) | 0];

/** Wraps every character of an element's text in spans, word by word so lines still break between words. */
function split(el: HTMLElement): HTMLElement[] {
  if (el.dataset.split) return [...el.querySelectorAll<HTMLElement>(".ch")];
  el.dataset.split = "1";
  const chars: HTMLElement[] = [];
  const walk = (node: Node) => {
    for (const child of [...node.childNodes]) {
      if (child.nodeType === Node.TEXT_NODE) {
        const frag = document.createDocumentFragment();
        for (const part of (child.textContent ?? "").split(/(\s+)/)) {
          if (!part) continue;
          if (/^\s+$/.test(part)) {
            frag.append(" ");
            continue;
          }
          const word = document.createElement("span");
          word.className = "word";
          for (const c of part) {
            const s = document.createElement("span");
            s.className = "ch";
            s.textContent = c;
            word.append(s);
            chars.push(s);
          }
          frag.append(word);
        }
        child.replaceWith(frag);
      } else if (child.nodeType === Node.ELEMENT_NODE) walk(child);
    }
  };
  walk(el);
  return chars;
}

/** Returns a setter: 0 hides the text, values in between show noise, 1 shows it all. Safe to scrub backwards. */
export function decoder(el: HTMLElement) {
  const chars = split(el);
  const n = chars.length;
  const order = chars.map((_, i) => (i / Math.max(n, 1)) * 0.72 + Math.random() * 0.2);
  let last = -1;
  return (p: number) => {
    if (p === last) return;
    last = p;
    for (let i = 0; i < n; i++) {
      const c = chars[i];
      const at = order[i];
      if (p >= at + 0.08 || p >= 1) {
        if (c.dataset.s !== "on") {
          c.dataset.s = "on";
          delete c.dataset.g;
        }
      } else if (p >= at) {
        c.dataset.s = "noise";
        c.dataset.g = glyph();
      } else if (c.dataset.s !== "off") {
        c.dataset.s = "off";
        delete c.dataset.g;
      }
    }
  };
}

/** Briefly scrambles a short label in place, then restores it. For hover. */
export function shuffle(el: HTMLElement, text = el.textContent ?? "") {
  if (el.dataset.busy) return;
  el.dataset.busy = "1";
  const start = performance.now();
  const tick = () => {
    const p = (performance.now() - start) / 360;
    el.textContent = [...text].map((c, i) => (c === " " || i < p * text.length ? c : glyph())).join("");
    if (p < 1) requestAnimationFrame(tick);
    else {
      el.textContent = text;
      delete el.dataset.busy;
    }
  };
  tick();
}
