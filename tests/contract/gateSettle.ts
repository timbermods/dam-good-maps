// The wall with one gate's stage 1 water settled as the game plays it (docs/PREMISES.md §5.1): what the heavy test and
// its sweep read. The ground stage 1 did not draw stands over every water (`gateSettleModel`), so the settle judges
// the water's own beds: the lake at its sill, the Still Pool at the lake's level, the Veil's one curtain, the Gate and
// the leat dry past their bars (over their last step: the basin's seeps' thread runs down their floor reach), nothing
// on the basin's side but the cleft and the seeps, nothing leaving but by the Low River and the seeps' notch.

import { BED_FLOOR } from "../../src/core/land/genome";
import type { PremisePlan } from "../../src/core/premise/types";
import type { StageWater } from "../../src/core/premise/water";
import { gateSettleModel } from "../../src/core/premise/gateWater";
import { canonicalSettle } from "../../src/core/sim/prefill";
import { curtains } from "./fallCurtain";

const WET = 0.05;
/** How far under its height the Veil's curtain may drop: round 8's Veil measured 6.5 for 7 in the game, its lake standing
 *  half a level over its sill (the valley's 17 to 18 over the Low River's lip, 16 at most); the lake stair's landmark
 *  asks 0.3 (§4.4 `stair.settled`). */
export const VEIL_SHORT = 0.5;

export interface GateSettled {
  ms: number;
  /** Each wet body's settled level (the median of its water tiles), with its sill and the table's level. */
  levels: { id: string; sill: number; table: number; level: number }[];
  /** The Veil's curtain: the fall judge's note, whether it holds, and its tiles pouring. */
  veil: { ok: boolean; note: string; pouring: number };
  /** Wet tiles on the Gate and the leat past their first row, off the planned water, and on the map's edge but the
   *  Low River's. */
  gateWet: number;
  leatWet: number;
  stray: number;
  edge: number;
  /** The flow out over the edge (the Low River's, and the seeps' by the notch), and the sources' total. */
  out: number;
  sources: number;
}

/** Settle a gate plan's stage 1 water and read it. */
export function settleGate(plan: PremisePlan, w: StageWater): GateSettled {
  const m = gateSettleModel(w, Math.max(plan.sky ?? plan.top, plan.top) + 2);
  const t0 = performance.now();
  const s = canonicalSettle(m);
  return readGateSettle(plan, w, m.floor, s, performance.now() - t0);
}

/** Read a settle of a gate plan's water on any ground (stage 1's alone, or a built map's land: `floor`). */
export function readGateSettle(plan: PremisePlan, w: StageWater, floor: ArrayLike<number>, s: { depth: ArrayLike<number>; out?: ArrayLike<number> | null }, ms = 0, niches: Record<string, [number, number]> = {}): GateSettled {
  // (the permanent badwater spring's niche, 3 × 3 beside the gorge, is planned water)
  const niche = new Set<number>();
  for (const [x, y] of Object.values(niches)) for (let dy = 0; dy < 3; dy++) for (let dx = 0; dx < 3; dx++) niche.add((y + dy) * w.raster.W + x + dx);
  const r = w.raster;
  const N = r.W * r.H;
  const levels: GateSettled["levels"] = [];
  for (const [k, b] of plan.bodies.entries()) {
    const lv: number[] = [];
    for (let i = 0; i < N; i++) if (r.lake[i] === k + 1 && !r.crest[i] && !r.pool[i] && s.depth[i] > WET) lv.push(floor[i] + s.depth[i]);
    lv.sort((p, q) => p - q);
    levels.push({ id: b.id, sill: b.sill, table: w.table.bodies[b.id].level, level: lv.length ? lv[lv.length >> 1] : NaN });
  }
  const li = (id: string) => plan.links.findIndex((l) => l.id === id);
  const g = (plan as unknown as { gate: { gate: string; leat: string; low: string; veil: string; seeps?: unknown[] } }).gate;
  // (the basin's seeps' thread runs down the beds' floor reach to the notch: the beds are judged over their last step)
  const seeps = (g.seeps?.length ?? 0) > 0;
  const head = (id: string) => {
    const row = r.rows[id]?.[0] ?? [];
    return row.length ? Math.max(...row.map((i) => r.along[i])) : 0;
  };
  let gateWet = 0;
  let leatWet = 0;
  let stray = 0;
  let edge = 0;
  let out = 0;
  const [gk, lk, ok] = [li(g.gate) + 1, li(g.leat) + 1, li(g.low) + 1];
  const [gh, lh] = [head(g.gate), head(g.leat)];
  const step = [-r.W, -1, r.W, 1];
  for (let i = 0; i < N; i++) {
    if (s.depth[i] <= WET) continue;
    const x = i % r.W;
    const y = (i - x) / r.W;
    const thread = seeps && r.heights[i] <= BED_FLOOR;
    if (r.channel[i] === gk && r.along[i] > gh && !thread) gateWet++;
    if (r.channel[i] === lk && r.along[i] > lh && !thread) leatWet++;
    if (!r.lake[i] && !r.channel[i] && !r.pool[i] && !niche.has(i)) stray++;
    const onEdge = x === 0 || y === 0 || x === r.W - 1 || y === r.H - 1;
    const notch = seeps && (r.channel[i] === gk || r.channel[i] === lk);
    if (onEdge && r.channel[i] !== ok && !notch) edge++;
    if (onEdge && (r.channel[i] === ok || notch) && s.out)
      for (let d = 0; d < 4; d++) {
        const j = i + step[d];
        const off = j < 0 || j >= N || (d === 1 && x === 0) || (d === 3 && x === r.W - 1);
        if (off) out += s.out[4 * i + d];
      }
  }
  // the Veil, judged in a window round its lip, other crests walls
  const veil = plan.links[li(g.veil)];
  const near = new Uint8Array(N);
  for (const i of r.lips[veil.id] ?? []) {
    const x = i % r.W;
    const y = (i - x) / r.W;
    for (let dy = -8; dy <= 8; dy++)
      for (let dx = -8; dx <= 8; dx++) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx >= 0 && yy >= 0 && xx < r.W && yy < r.H) near[yy * r.W + xx] = 1;
      }
  }
  for (let i = 0; i < N; i++) if (r.crest[i] && r.crest[i] !== li(g.veil) + 1) near[i] = 0;
  const depth = Float64Array.from(s.depth, (d, i) => (near[i] ? d : 0));
  const ground = Float64Array.from(floor, (h, i) => (near[i] ? h : 99));
  const c = curtains({ W: r.W, H: r.H, before: ground, beforeDepth: new Float64Array(N), after: ground, depth, need: veil.fall!.height - VEIL_SHORT });
  let pouring = 0;
  for (let i = 0; i < N; i++) if (c.id && c.id[i] >= 0) pouring++;
  const sources = plan.sources.reduce((t, x) => t + x.strength, 0);
  return { ms, levels, veil: { ok: c.ok, note: c.note, pouring }, gateWet, leatWet, stray, edge, out, sources };
}
