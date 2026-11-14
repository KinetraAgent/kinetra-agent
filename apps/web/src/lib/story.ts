// One scroll, one scene. Every layer reads its state from the same progress value (0 to 1 over the pinned hero).

export const CHAPTERS = [
  { id: "hero", label: "Intent", at: 0 },
  { id: "rings", label: "Plan", at: 0.205 },
  { id: "warp", label: "Act", at: 0.335 },
  { id: "embers", label: "Execute", at: 0.445 },
  { id: "bloom", label: "Approve", at: 0.6 },
  { id: "scatter", label: "Proof", at: 0.735 },
  { id: "iris", label: "Review", at: 0.885 },
] as const;

// particle shape index over progress: 0 mark, 1 orbits, 2 warp, 3 embers, 4 bloom, 5 scatter, 6 iris
const STAGES: [number, number][] = [
  [0, 0],
  [0.07, 0],
  [0.19, 1],
  [0.27, 1],
  [0.33, 2],
  [0.39, 2],
  [0.44, 3],
  [0.52, 3],
  [0.6, 4],
  [0.68, 4],
  [0.74, 5],
  [0.8, 5],
  [0.88, 6],
  [1, 6],
];

export function stageAt(p: number) {
  for (let i = 1; i < STAGES.length; i++) {
    const [p1, s1] = STAGES[i];
    if (p <= p1) {
      const [p0, s0] = STAGES[i - 1];
      return s0 + (s1 - s0) * ((p - p0) / (p1 - p0 || 1));
    }
  }
  return STAGES[STAGES.length - 1][1];
}

export const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
  return t * t * (3 - 2 * t);
};

/** Rises over [a, b], holds, falls over [c, d]. */
export const band = (a: number, b: number, c: number, d: number, x: number) => smooth(a, b, x) * (1 - smooth(c, d, x));

export function chapterAt(p: number) {
  let i = 0;
  while (i + 1 < CHAPTERS.length && p >= CHAPTERS[i + 1].at - 0.02) i++;
  return i;
}
