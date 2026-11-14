// The grown pine's boughs as the game draws them (D135, D178, D496): its PineMature model's five whorls, each a shallow
// cone cut by its texture's alpha into a star of drooping boughs, read with tools/game-model-albedo.py --parts and the
// whorls' alpha edge measured over the model (docs/progress/3d-view.md, "The pine's boughs as the game draws them";
// numbers only, no mesh or texture of the game's). Ours is the star itself, as geometry: from each whorl's apex an
// inner cone out to the notches between the boughs, and each bough's tip a triangle from its two notches out and down
// to its point. Both looks build their close pine from it (entities3d.ts `Pine`, high/models.ts).

/** A whorl: its apex's height; its boughs' tips' reach from the trunk and height (the median of its tips on the game's
 *  alpha edge, by the model's middle); the notches' between them (the edge's nearest reach, its 5th percentile over the
 *  whorl's angles, on the whorl's cone); how many boughs. */
export interface Whorl {
  apex: number;
  tip: readonly [number, number];
  notch: readonly [number, number];
  boughs: number;
}

/** The game's five whorls, lowest first (PineMature: 135 triangles, 3.01 high; the whorls' cut cones from 1.29 up). The
 *  tips reach 0.43–0.55 in the lowest two (their median 0.50), so the crown is 1.0 across, as our earlier cones were. */
export const PINE_WHORLS: readonly Whorl[] = [
  { apex: 1.864, tip: [0.502, 1.373], notch: [0.31, 1.549], boughs: 12 },
  { apex: 2.208, tip: [0.497, 1.738], notch: [0.314, 1.873], boughs: 11 },
  { apex: 2.475, tip: [0.407, 2.11], notch: [0.23, 2.273], boughs: 10 },
  { apex: 2.775, tip: [0.278, 2.432], notch: [0.147, 2.585], boughs: 9 },
  // (its apex 3.009 in the game's, 9 mm over the 3.0 a pine's air allows at its tallest: core/terrain/clearance.ts
  // `PLANT_CLEARANCE`)
  { apex: 3.0, tip: [0.134, 2.751], notch: [0.065, 2.859], boughs: 7 },
];

/** Each bough's own reach, about its whorl's median (the game's tips range ±10 % about it). */
const REACH_SPREAD = 0.1;

/** A small hash, 0–1, stable for a variant, a whorl and a bough. */
function hash(a: number, b: number, c: number): number {
  const v = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453;
  return v - Math.floor(v);
}

/** One whorl's triangles, counter-clockwise seen from above and outside: `inner`, the cone from its apex to the notches,
 *  and `tips`, the boughs' points (positions, x y z per corner, nine to a triangle). `turn` turns the whorl about the
 *  trunk; `variant` varies each bough's reach. `scale` scales it across (1 the game's). */
export function whorlTriangles(w: Whorl, turn: number, variant = 0, scale = 1): { inner: number[]; tips: number[] } {
  const n = w.boughs;
  const step = (Math.PI * 2) / n;
  const at = (a: number, r: number, y: number) => [Math.cos(a) * r * scale, y, Math.sin(a) * r * scale];
  const inner: number[] = [];
  const tips: number[] = [];
  // (a triangle as given, or turned over where it faced down: each must face up and out)
  const push = (out: number[], a: number[], b: number[], c: number[]) => {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const ny = uz * vx - ux * vz;
    if (ny >= 0) out.push(...a, ...b, ...c);
    else out.push(...a, ...c, ...b);
  };
  const apex = [0, w.apex, 0];
  for (let i = 0; i < n; i++) {
    const a0 = turn + (i - 0.5) * step;
    const a1 = turn + (i + 0.5) * step;
    const left = at(a0, w.notch[0], w.notch[1]);
    const right = at(a1, w.notch[0], w.notch[1]);
    push(inner, apex, left, right);
    const reach = 1 + REACH_SPREAD * (2 * hash(variant, w.apex, i) - 1);
    // (the tip lower than its notches by the whorl's droop, further for a longer bough)
    const tip = at(turn + i * step, w.tip[0] * reach, w.notch[1] - (w.notch[1] - w.tip[1]) * reach);
    push(tips, left, tip, right);
  }
  return { inner, tips };
}

/** The shade of a whorl's inner cone and of its boughs' tips about the pine's colour: the game's vertex colours darken
 *  toward each apex and lighten toward the tips (the lowest whorl's from 0.13/0.23/0.10 at its apex to 0.17/0.27/0.15
 *  past its tips), its texture's grooves the same everywhere. */
export const WHORL_SHADE = { inner: 0.92, tips: 1.08 } as const;
