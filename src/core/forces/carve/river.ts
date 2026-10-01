// A carved river's own shape, once the carve has cut its canyon (PLAN §20 D321, items 17 and 18).
//
// **River depth** (item 17): in Timberborn most rivers are one or two levels deep, which keeps them
// playable (water crops, building over, crossing). The carve's water never stands deeper than the
// setting: wherever the game's water would pool deeper over the ground the carve cut (a scour pit, the
// end of a canyon below the land it runs into), that bed is raised to one level less than the setting
// under the pool's spill level (the water flowing over its sill stands a little above it); the canyon's
// walls stay as tall as Power made them. Off leaves the river as deep as the
// carve made it; a dry canyon has no river to limit; a sealed oxbow keeps its own lake.
//
// **Banks** (item 18): flat land on each side of the river before the canyon's walls, from none (walls
// down to the water) to about ten tiles, wider on the inside of a bend and narrower on its outside,
// never a constant strip. The banks sit at the river's waterline: the bed lies the river's depth below
// them, running only downhill, so the river's normal surface stays just below the bank top and never
// spreads over them as a thin sheet (a low floor may still flood when the river refills, D307); the
// walls step back by the banks' width, as tall as before. Glaciate's broad valley floor is its own.
//
// Only the carve's own ground is raised (never above the land before it); new ground is only ever
// lowered, never below the Floor (floor.ts).

import * as portable from "../../math/portable";
import { hash32 } from "../../math/hash";
import { spillLevels } from "../../sim/prefill";
import { forceFloor } from "../floor";
import type { CarveRun } from "./run";
import { modelFor } from "./run";
import { oxbowBasin } from "./water";

/** The banks stand at least this many levels over the river's bed (and at that, with River depth Off). */
const BANK_DEPTH = 2;
/** How far past the banks the walls step back (tiles). */
const WALL_REACH = 14;

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/** Shape the finished carve's river on its map (heights only); the tiles it changed. */
export function shapeRiver(run: CarveRun): number[] {
  const s = run.settings;
  // (Unleash's river is a placed source's own water: a dry carve in its record, a river all the same)
  const river = !s.dry || run.unleashedId !== null;
  if (!river) return [];
  const depth = s.riverDepth ?? null;
  const banks = s.banks ?? 0;
  if (depth === null && !banks) return [];
  const m = run.map;
  const { W, H } = m;
  const h = m.heights;
  const before = h.slice();
  const floor = forceFloor(s);
  const exempt = new Uint8Array(W * H);
  for (const i of oxbowBasin(run)) exempt[i] = 1;
  for (let i = 0; i < exempt.length; i++) if (run.keep[i] || run.sediment[i] || run.character.rock[i]) exempt[i] = 1;
  /** Set a tile's level: the carve's own ground may rise back toward the land before it, other ground
   *  only goes down; never below the Floor. */
  const set = (i: number, level: number) => {
    if (exempt[i]) return;
    const carved = h[i] < run.original[i];
    let v = carved ? Math.min(run.original[i], level) : Math.min(h[i], level);
    v = Math.max(v, Math.min(h[i], floor));
    // (a river wider than its Power's own cuts no deeper, its banks included: D361 (3))
    if (run.strengthDepth !== null) v = Math.max(v, Math.min(h[i], run.original[i] - run.strengthDepth));
    h[i] = v;
  };
  if (depth !== null) {
    // the game's water pools up to its spill level, and a little over it where it flows on: the
    // carve's ground stays within `depth` - 1 of that level, so the water over it is never deeper than
    // `depth` (at 1, no pool at all: the river just flows)
    const spill = spillLevels(modelFor(m));
    for (let i = 0; i < h.length; i++)
      if (h[i] < run.original[i] && spill[i] - h[i] > depth - 1 + 0.01) set(i, Math.ceil(spill[i] - depth + 1 - 1e-6));
  }
  // the banks, from the bed as it now lies (a pool's raised bed too: its banks stand just above it)
  // (at least two levels: a river one level deep flows over its bed a little higher than that, and
  // would spread over banks laid at its surface as a standing sheet)
  if (banks > 0 && run.path.length > 1) shapeBanks(run, banks, Math.max(BANK_DEPTH, depth ?? BANK_DEPTH), set);
  const changed: number[] = [];
  for (let i = 0; i < h.length; i++) if (h[i] !== before[i]) changed.push(i);
  return changed;
}

/** The banks along the course: the channel at the waterline less the river's depth, flat banks at the
 *  waterline, the walls stepped back by the banks' width. */
function shapeBanks(run: CarveRun, banks: number, depth: number, set: (i: number, level: number) => void): void {
  const m = run.map;
  const { W, H } = m;
  const h = m.heights;
  const path = run.path;
  const n = path.length;
  // the river's bed along its course, never rising downstream: the carved ground at each station's
  // middle (a bend's scour beside it is the bank's to fill)
  const bed = new Float64Array(n);
  for (let k = 0; k < n; k++) {
    const st = path[k];
    bed[k] = Math.min(k ? bed[k - 1] : Infinity, h[clamp(Math.round(st.y), 0, H - 1) * W + clamp(Math.round(st.x), 0, W - 1)]);
  }
  // each tile's nearest point of the course (its station, its distance, its side), within reach
  const N = W * H;
  const dist = new Float32Array(N).fill(Infinity);
  const near = new Int32Array(N).fill(-1);
  const side = new Int8Array(N);
  const reach = banks * 1.8 + WALL_REACH;
  for (let k = 0; k + 1 < n; k++) {
    const a = path[k];
    const b = path[k + 1];
    const R = a.width * 0.72 + reach;
    for (let y = Math.max(0, Math.floor(Math.min(a.y, b.y) - R)); y <= Math.min(H - 1, Math.ceil(Math.max(a.y, b.y) + R)); y++)
      for (let x = Math.max(0, Math.floor(Math.min(a.x, b.x) - R)); x <= Math.min(W - 1, Math.ceil(Math.max(a.x, b.x) + R)); x++) {
        const i = y * W + x;
        const ex = b.x - a.x;
        const ey = b.y - a.y;
        const l2 = ex * ex + ey * ey;
        const raw = l2 ? ((x - a.x) * ex + (y - a.y) * ey) / l2 : 0;
        // (nothing behind the river's head or past its end: the banks run along it, never round it)
        if ((k === 0 && raw < 0) || (k === n - 2 && raw > 1)) continue;
        const t = clamp(raw, 0, 1);
        const px = a.x + ex * t;
        const py = a.y + ey * t;
        const d = portable.hypot(x - px, y - py);
        if (d >= dist[i]) continue;
        dist[i] = d;
        near[i] = t > 0.5 ? k + 1 : k;
        side[i] = (a.dx * (y - a.y) - a.dy * (x - a.x)) >= 0 ? 1 : -1;
      }
  }
  // the banks' width at each station and side: wider inside a bend, narrower outside, and varying
  // along the course (a slow seeded swell), never a constant strip
  const seed = hash32(run.seed, run.intent.origin, 18);
  const swell = (k: number, sd: number) => {
    const u = k / 9;
    const j = Math.floor(u);
    const f = u - j;
    const r = (q: number) => (hash32(seed, q, sd) % 1000) / 1000;
    const e = f * f * (3 - 2 * f);
    return 0.75 + 0.5 * (r(j) * (1 - e) + r(j + 1) * e);
  };
  const width = (k: number, sd: number) => {
    const st = path[k];
    // positive bend turns left: its inside is the left (side 1)
    const inside = st.bend * sd > 0;
    const lean = 1 + 0.75 * Math.abs(st.bend) * (inside ? 1 : -1);
    return clamp(banks * lean * swell(k, sd), 0, banks * 1.8);
  };
  // its own sources' row stands in the river, never on a bank: the ground under it and a tile round it
  // is the channel's (a small pool at the head the row fills)
  const head = new Uint8Array(N);
  for (const g of run.group) {
    const gx = g.tile % W;
    const gy = (g.tile - gx) / W;
    for (let y = Math.max(0, gy - 1); y <= Math.min(H - 1, gy + 1); y++) for (let x = Math.max(0, gx - 1); x <= Math.min(W - 1, gx + 1); x++) head[y * W + x] = 1;
  }
  const order: number[] = [];
  for (let i = 0; i < N; i++) if (near[i] >= 0) order.push(i);
  // the walls step back first (each read from the carve's own profile, nearer the river), then the
  // banks and the channel are laid
  const carved = h.slice();
  for (const i of order) {
    const k = near[i];
    const st = path[k];
    const r = st.width * 0.72;
    const bw = width(k, side[i]);
    const d = dist[i];
    const L = bed[k] + depth;
    if (d <= r || head[i]) set(i, L - depth);
    else if (d <= r + bw) set(i, L);
    else if (d <= r + bw + WALL_REACH) {
      // the wall as the carve made it, bw tiles nearer the river
      const x = i % W;
      const y = (i - x) / W;
      const f = (d - bw) / d;
      const sx = clamp(Math.round(st.x + (x - st.x) * f), 0, W - 1);
      const sy = clamp(Math.round(st.y + (y - st.y) * f), 0, H - 1);
      const wall = Math.max(L, carved[sy * W + sx]);
      // (the carve's own ground below the banks' level there is theirs too: no puddle beside them)
      if (wall < h[i] || h[i] < L) set(i, wall);
    }
  }
}
