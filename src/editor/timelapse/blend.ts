// The time-lapse's ending (D505): the water the replay still has flowing, and the soil as the history began, eased
// into the finished map's own over the closing glide, so the video never snaps to the map's settled water and
// greening on its last frames. Only drawn: the map's own water and soil are what the last frame shows.

import { WET, type SoilView, type WaterView } from "../../render3d/model";

/** The water between `a` (t = 0) and `b` (t = 1): each column (a tile and the floor it stands on) its depth and
 *  badwater share mixed, a column only one side has growing from or drying to nothing. Outflows are `b`'s from the
 *  halfway mark (`a`'s before), zero where that side has none for a column. */
export function blendWater(a: WaterView, b: WaterView, t: number): WaterView {
  if (t <= 0) return a;
  if (t >= 1) return b;
  const key = (w: WaterView, k: number) => `${w.tile[k]}:${w.floor[k]}`;
  const inB = new Map<string, number>();
  for (let k = 0; k < b.count; k++) inB.set(key(b, k), k);
  type Col = { tile: number; floor: number; depth: number; cont: number; from: WaterView | null; at: number };
  const cols: Col[] = [];
  const late = t >= 0.5;
  for (let k = 0; k < a.count; k++) {
    const j = inB.get(key(a, k));
    const db = j === undefined ? 0 : b.depth[j];
    const depth = a.depth[k] * (1 - t) + db * t;
    // (badwater mixed by the water each side carries: a dry side lends none)
    const cont = depth > 0 ? (a.depth[k] * (1 - t) * a.contamination[k] + (j === undefined ? 0 : db * t * b.contamination[j])) / depth : 0;
    const side = late ? (j === undefined ? null : b) : a;
    cols.push({ tile: a.tile[k], floor: a.floor[k], depth, cont, from: side, at: side === b ? j! : k });
    if (j !== undefined) inB.delete(key(a, k));
  }
  for (const j of inB.values()) cols.push({ tile: b.tile[j], floor: b.floor[j], depth: b.depth[j] * t, cont: b.contamination[j], from: late ? b : null, at: j });
  const kept = cols.filter((c) => c.depth > WET).sort((p, q) => p.tile - q.tile || p.floor - q.floor);
  const n = kept.length;
  const w: WaterView = { count: n, tile: new Int32Array(n), floor: new Float32Array(n), depth: new Float32Array(n), contamination: new Float32Array(n) };
  const flows = a.outflow || b.outflow ? new Float32Array(n * 4) : null;
  kept.forEach((c, k) => {
    w.tile[k] = c.tile;
    w.floor[k] = c.floor;
    w.depth[k] = c.depth;
    w.contamination[k] = c.cont;
    const o = c.from?.outflow;
    if (flows && o) for (let d = 0; d < 4; d++) flows[k * 4 + d] = o[c.at * 4 + d];
  });
  if (flows) w.outflow = flows;
  return w;
}

const mixBytes = (a: Uint8Array, b: Uint8Array, t: number): Uint8Array => {
  const out = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) out[i] = Math.round(a[i] * (1 - t) + b[i] * t);
  return out;
};

/** The soil between `a` (t = 0) and `b` (t = 1), tile by tile; `b`'s runs under the tops from the halfway mark
 *  (`a`'s before), mixed too where both have the same runs. `b` whole where the two are not the same map's. */
export function blendSoil(a: SoilView, b: SoilView, t: number): SoilView {
  if (t <= 0) return a;
  if (t >= 1 || a.moisture.length !== b.moisture.length) return b;
  const out: SoilView = { moisture: mixBytes(a.moisture, b.moisture, t), contamination: mixBytes(a.contamination, b.contamination, t) };
  const ra = a.runs;
  const rb = b.runs;
  if (ra && rb && ra.tile.length === rb.tile.length && ra.tile.every((v, k) => v === rb.tile[k] && ra.level[k] === rb.level[k])) {
    out.runs = { tile: rb.tile, level: rb.level, moisture: mixBytes(ra.moisture, rb.moisture, t), contamination: mixBytes(ra.contamination, rb.contamination, t) };
  } else if (t >= 0.5 ? rb : ra) out.runs = t >= 0.5 ? rb : ra;
  return out;
}

/** How far the ending has eased into the finished map at frame `f`: 0 until `from`, 1 from `to`, smooth between. */
export function easeIn(f: number, from: number, to: number): number {
  if (f <= from) return 0;
  if (f >= to) return 1;
  const x = (f - from) / (to - from);
  return x * x * (3 - 2 * x);
}
