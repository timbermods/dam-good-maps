// Relief and verticality (D132 (5); docs/m9-design.md §5): for any map with a start, generated,
// official or workshop, from its own surface, water and slopes:
// - relief range: the p5–p95 height spread;
// - levels used: levels covering 1% of the map or more;
// - land above 16: the share of tiles whose surface stands above level 16;
// - tallest fall: the largest surface drop between side-by-side wet tiles;
// - flat share and cliff share;
// - vertical reach: dry land the colony reaches on foot from the start (walking, with the map's
//   slopes) against dry land it reaches only with stairs; beside it, land a beaver could reach if
//   every one-level step had a slope (the land's own potential).
// The vertical-reach measure joins the batch tools (ROADMAP M9a). Ported from the design version 2
// prototype (investigation/generative/v2/vertical.ts).

import { walkDistance } from "./walk";
import { footprintTiles, FOOTPRINTS, slopeHighSide, type Orientation } from "../format/footprints";
import { WALK_BLOCKERS } from "../validate/playability";
import { footComponents } from "../land/levels";

export interface Obj {
  template: string;
  x: number;
  y: number;
  z?: number;
  orientation?: Orientation | string;
}

export function slopeLinks(objects: readonly Obj[], W: number, H: number): [number, number][] {
  const links: [number, number][] = [];
  for (const o of objects) {
    if (o.template !== "Slope") continue;
    const [dx, dy] = slopeHighSide(o.orientation as Orientation);
    const hx = o.x + dx;
    const hy = o.y + dy;
    if (o.x < 0 || o.y < 0 || o.x >= W || o.y >= H || hx < 0 || hy < 0 || hx >= W || hy >= H) continue;
    links.push([o.y * W + o.x, hy * W + hx]);
  }
  return links;
}

export function blockedOf(objects: readonly Obj[], W: number, H: number): Uint8Array {
  const blocked = new Uint8Array(W * H);
  for (const o of objects) {
    if (!WALK_BLOCKERS.has(o.template) || !FOOTPRINTS[o.template]) continue;
    for (const [x, y] of footprintTiles(o.template, o as never)) if (x >= 0 && y >= 0 && x < W && y < H) blocked[y * W + x] = 1;
  }
  return blocked;
}

/** Walking distance from the start over the whole map (no distance limit). */
export function reachWalk(h: Uint8Array, W: number, H: number, objects: readonly Obj[], start: { x: number; y: number }): Float64Array {
  return walkDistance(h, W, H, blockedOf(objects, W, H), slopeLinks(objects, W, H), start, 4 * (W + H));
}

/** Surface drops of 1.5 levels or more between side-by-side wet tiles (falls), per upper tile. */
export function fallsOf(h: ArrayLike<number>, D: ArrayLike<number>, W: number, H: number, min = 1.5): { i: number; drop: number }[] {
  const out: { i: number; drop: number }[] = [];
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (!(D[i] >= 0.1)) continue;
      let best = 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const j = yy * W + xx;
        if (!(D[j] >= 0.1)) continue;
        const d = h[i] + D[i] - (h[j] + D[j]);
        if (d > best) best = d;
      }
      if (best >= min) out.push({ i, drop: Math.round(best * 100) / 100 });
    }
  return out;
}

export interface Vertical {
  range: number;
  levels: number;
  maxHeight: number;
  above16: number;
  tallestFall: number;
  flatShare: number;
  cliffShare: number;
  /** Dry land reached on foot from the start, and only with stairs, as shares of all dry land. */
  onFoot: number;
  stairsOnly: number;
  /** Dry land joined to the start's ground by one-level steps (if every such step had a slope). */
  oneStep: number;
}

function pctLin(sorted: Uint8Array, p: number): number {
  // numpy-style linear interpolation, as analysis/metrics.ts
  const pos = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.min(sorted.length - 1, lo + 1);
  return sorted[lo] + (pos - lo) * (sorted[hi] - sorted[lo]);
}

export function vertical(h: Uint8Array, W: number, H: number, D: ArrayLike<number>, objects: readonly Obj[], start: { x: number; y: number } | null, walk: Float64Array | null = null): Vertical {
  const N = W * H;
  const sorted = h.slice().sort();
  const range = Math.trunc(pctLin(sorted, 95) - pctLin(sorted, 5));
  const count = new Map<number, number>();
  let maxHeight = 0;
  let above = 0;
  for (let i = 0; i < N; i++) {
    count.set(h[i], (count.get(h[i]) ?? 0) + 1);
    if (h[i] > maxHeight) maxHeight = h[i];
    if (h[i] > 16) above++;
  }
  let levels = 0;
  for (const n of count.values()) if (n >= 0.01 * N) levels++;
  let flat = 0;
  let cliff = 0;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const v = h[i];
      let isFlat = true;
      let isCliff = false;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const xx = Math.min(W - 1, Math.max(0, x + dx));
          const yy = Math.min(H - 1, Math.max(0, y + dy));
          const n = h[yy * W + xx];
          if (n !== v) isFlat = false;
          if ((!dx || !dy) && Math.abs(n - v) >= 2) isCliff = true;
        }
      if (isFlat) flat++;
      if (isCliff) cliff++;
    }
  const falls = fallsOf(h, D, W, H, 0.5);
  const tallestFall = falls.reduce((m, f) => Math.max(m, f.drop), 0);
  let onFoot = NaN;
  let stairsOnly = NaN;
  let oneStep = NaN;
  if (start) {
    const w = walk ?? reachWalk(h, W, H, objects, start);
    const wet = new Uint8Array(N);
    for (let i = 0; i < N; i++) wet[i] = D[i] > 0.05 ? 1 : 0;
    const fc = footComponents(h, W, H, wet);
    const root = fc.lab[start.y * W + start.x];
    let dry = 0;
    let foot = 0;
    let step = 0;
    for (let i = 0; i < N; i++) {
      if (wet[i]) continue;
      dry++;
      if (Number.isFinite(w[i])) foot++;
      if (root >= 0 && fc.lab[i] === root) step++;
    }
    onFoot = dry ? foot / dry : 0;
    stairsOnly = dry ? 1 - onFoot : 0;
    oneStep = dry ? step / dry : 0;
  }
  const r = (v: number) => Math.round(v * 1000) / 1000;
  return { range, levels, maxHeight, above16: r(above / N), tallestFall: Math.round(tallestFall * 100) / 100, flatShare: r(flat / N), cliffShare: r(cliff / N), onFoot: r(onFoot), stairsOnly: r(stairsOnly), oneStep: r(oneStep) };
}
