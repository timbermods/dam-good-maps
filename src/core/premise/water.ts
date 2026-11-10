// Stage 1, water by number (docs/PREMISES.md §2.2): from a plan, the heights where water will be (beds, sills, lips,
// plunge pools, channel beds), its masks, the guard round it, each row of Blockages' tiles, and the water table (each
// body's level, each link's flow and depth). Nothing here reads land: stage 2 draws the relief round what this fixes.
// The `land` invariants (waterChecks.ts) run `flowThrough` on these heights alone.

import type { WaterModel } from "../sim/water";
import { waterTable, type WaterTable } from "./levels";
import { rasterBodies } from "./raster/bodies";
import { rasterChannels } from "./raster/channels";
import { emptyRaster, near4, type WaterRaster } from "./raster/field";
import { rasterFalls } from "./raster/falls";
import { dropPockets, guardWater, partWaters, surgeMouths } from "./raster/guard";
import type { PremisePlan } from "./types";

/** The start's footprint and the ground round it that stage 1 keeps level at its height: 5 × 5. */
const PAD = 2;
/** How far along its channel a row may move from where the plan puts it to span the channel, in tiles. */
const ROW_SHIFT = 3;

export interface Emitter {
  /** The source's id, the tile it stands on, its strength (blocks a second), whether it runs bad. */
  id: string;
  cell: number;
  strength: number;
  bad: boolean;
}

export interface StageWater {
  table: WaterTable;
  raster: WaterRaster;
  /** Each source on a tile of the water it stands in. */
  emitters: Emitter[];
}

/** Stage 1: the plan's water by number. Deterministic from the plan alone. */
export function waterByNumber(plan: PremisePlan): StageWater {
  const { W, H } = plan;
  const table = waterTable(plan);
  const r = emptyRaster(W, H);
  const { x: sx, y: sy, z: sz } = plan.frame.start;
  const pad = new Set<number>();
  for (let y = sy - PAD; y <= sy + PAD; y++) for (let x = sx - PAD; x <= sx + PAD; x++) if (x >= 0 && y >= 0 && x < W && y < H) pad.add(y * W + x);
  rasterBodies(plan, table, r);
  rasterChannels(plan, table, r);
  rasterFalls(plan, table, r, pad);
  for (const i of pad) {
    r.lake[i] = r.channel[i] = r.pool[i] = r.crest[i] = 0;
    r.surface[i] = NaN;
    r.heights[i] = sz;
    r.fixed[i] = 1;
  }
  partWaters(plan, r);
  dropPockets(plan, r);
  // (a lip keeps the tiles still on its crest, and its piers)
  plan.links.forEach((l, li) => {
    if (!l.fall) return;
    const piers = new Set(r.piers[l.id]);
    r.lips[l.id] = r.lips[l.id].filter((i) => r.crest[i] === li + 1 || piers.has(i));
    r.notches[l.id] = r.notches[l.id].filter((i) => r.crest[i] === li + 1);
  });
  surgeMouths(plan, r);
  guardWater(r);
  plan.links.forEach((l, li) => {
    if (l.rows.length) r.rows[l.id] = l.rows.map((s) => spanRow(plan, r, li, s));
  });
  return { table, raster: r, emitters: emittersOf(plan, r) };
}

/** Each source on the nearest tile of the water it stands in (its body's or its link's). */
function emittersOf(plan: PremisePlan, r: WaterRaster): Emitter[] {
  const { W, H } = r;
  return plan.sources.map((s) => {
    const body = plan.bodies.findIndex((b) => b.id === s.into);
    const link = plan.links.findIndex((l) => l.id === s.into);
    const mine = (i: number) => (body >= 0 ? r.lake[i] === body + 1 : link >= 0 && r.channel[i] === link + 1);
    let best = -1;
    let bd = Infinity;
    // (a ring at a time out from where the plan puts it)
    const cx = Math.min(W - 1, Math.max(0, Math.floor(s.at[0])));
    const cy = Math.min(H - 1, Math.max(0, Math.floor(s.at[1])));
    for (let rad = 0; rad < Math.max(W, H) && best < 0; rad++)
      for (let y = cy - rad; y <= cy + rad; y++)
        for (let x = cx - rad; x <= cx + rad; x++) {
          if (x < 0 || y < 0 || x >= W || y >= H || Math.max(Math.abs(x - cx), Math.abs(y - cy)) !== rad) continue;
          const i = y * W + x;
          if (!mine(i)) continue;
          const d = (x + 0.5 - s.at[0]) ** 2 + (y + 0.5 - s.at[1]) ** 2;
          if (d < bd) {
            bd = d;
            best = i;
          }
        }
    return { id: s.id, cell: best, strength: s.strength, bad: !!s.bad };
  });
}

/** A link's channel tiles and its from-body's (the water a row of it holds back). */
interface RowSide {
  li: number;
  mine: number[];
  from: number;
  body: number[];
}

function rowSide(plan: PremisePlan, r: WaterRaster, li: number): RowSide {
  const from = plan.bodies.findIndex((b) => b.id === plan.links[li].from);
  const mine: number[] = [];
  const body: number[] = [];
  for (let i = 0; i < r.W * r.H; i++) {
    if (r.channel[i] === li + 1) mine.push(i);
    else if (from >= 0 && r.lake[i] === from + 1) body.push(i);
  }
  return { li, mine, from, body };
}

/** The tiles of a row of Blockages near `s` along link `li`: a band of its channel across, moved along it until it
 *  shuts the water off (no way round it through the channel or the body it leaves). */
function spanRow(plan: PremisePlan, r: WaterRaster, li: number, s: number): number[] {
  const side = rowSide(plan, r, li);
  let fallback: number[] = [];
  // (where another channel out of the same body took the link's head, its row stands at its first tiles of its own)
  let first = Infinity;
  for (const i of side.mine) first = Math.min(first, r.along[i]);
  s = Math.max(s, first + 0.5);
  for (let step = 0; step <= ROW_SHIFT * 4; step++) {
    // (0, then a quarter of a tile further each way by turns)
    const o = (step % 2 ? 1 : -1) * Math.ceil(step / 2) * 0.25;
    for (const band of [1, 1.45]) {
      const a = s + o - 0.5;
      const row = side.mine.filter((i) => r.along[i] >= a && r.along[i] < a + band).sort((p, q) => p - q);
      if (!row.length) continue;
      if (!fallback.length) fallback = row;
      if (spans(r, side, row)) return row;
    }
  }
  return fallback;
}

/** Whether a row shuts its channel: from the body the link leaves and its channel up to the row, no way past it
 *  through the channel. */
export function rowSpans(plan: PremisePlan, r: WaterRaster, li: number, row: number[]): boolean {
  return spans(r, rowSide(plan, r, li), row);
}

function spans(r: WaterRaster, side: RowSide, row: number[]): boolean {
  if (!row.length) return false;
  const { W, H } = r;
  const { li, from } = side;
  let a = Infinity;
  let b = -Infinity;
  for (const i of row) {
    a = Math.min(a, r.along[i]);
    b = Math.max(b, r.along[i]);
  }
  const inRow = new Set(row);
  const seen = new Set<number>(row);
  const queue: number[] = [];
  for (const i of side.mine) if (r.along[i] < a && !inRow.has(i)) queue.push(i);
  for (const i of side.body) queue.push(i);
  for (const i of queue) seen.add(i);
  const nb = new Int32Array(4);
  while (queue.length) {
    const c = queue.pop()!;
    near4(W, H, c, nb);
    for (const j of nb) {
      if (j < 0 || seen.has(j)) continue;
      const ours = r.channel[j] === li + 1;
      if (!ours && !(from >= 0 && r.lake[j] === from + 1)) continue;
      if (ours && r.along[j] > b) return false;
      seen.add(j);
      queue.push(j);
    }
  }
  return true;
}

/** The water model of stage 1's heights alone: its rows of Blockages shut (a level over their bed), and, when
 *  `shutNotches`, every notch and breach too (the levels the plan sets are the sills', the works still to do). */
export function stageModel(w: StageWater, opts: { shutNotches?: boolean } = {}): WaterModel {
  const r = w.raster;
  const floor = Float64Array.from(r.heights);
  for (const rows of Object.values(r.rows)) for (const row of rows) for (const i of row) floor[i] = r.heights[i] + 1;
  if (opts.shutNotches) {
    const nb = new Int32Array(4);
    for (const [id, tiles] of Object.entries(r.notches)) {
      const crest = crestOf(r, id);
      for (const i of tiles) {
        floor[i] = Math.max(floor[i], crest);
        // (and the crest's second row behind them)
        near4(r.W, r.H, i, nb);
        for (const j of nb) if (j >= 0 && r.crest[j] && r.heights[j] === crest - 1) floor[j] = Math.max(floor[j], crest);
      }
    }
  }
  return {
    W: r.W,
    H: r.H,
    floor,
    dam: null,
    emitters: w.emitters.filter((e) => e.cell >= 0).map((e) => ({ cells: [e.cell], strength: e.strength, contamination: e.bad ? 1 : 0 })),
  };
}

/** A fall's crest level as built: the commonest height of its lip. */
function crestOf(r: WaterRaster, id: string): number {
  const count = new Map<number, number>();
  for (const i of r.lips[id] ?? []) count.set(r.heights[i], (count.get(r.heights[i]) ?? 0) + 1);
  let best = 0;
  let n = -1;
  for (const [h, c] of count) if (c > n) [best, n] = [h, c];
  return best;
}
