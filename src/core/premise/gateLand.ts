// Stage 2 of the wall with one gate (docs/PREMISES.md §5.1, §2.2): the land round stage 1's water. Land first, story
// second (planning, 2026-11-11): every landform here is one geology makes, shaped by noise and distance as the shared
// relief shapes the themes' and the lake stair's, and the premise's constraint (the valley held at the megadam's water
// but through the gap) is checked on that land and mended by the least change. Nothing is laid along a line.
//
// - The valley is the shared relief's (`raster/relief.ts` `reliefBetween`, the spur its only ridge): the lake's
//   meadows, the brooks' valleys, the uplands.
// - The range: across its spine (`GateNumbers.range`, read through a warp so no contour follows it) the ground falls from
//   the crest, which rises and falls along it from the gap's saddle to the peak, to its foot on each side: in a concave
//   flank (talus at the foot) on soft rock, and on hard rock (patches of noise, and the Veil's buttress) high to a cliff
//   near the foot; ridged noise draws spurs and gullies down both flanks.
// - The gap: the Gate's gorge is stage 1's channel cut through the range where its crest is lowest; its walls are the
//   range's own flanks.
// - The basin: a dry lake in a depression past the range: its floor falls in rings that wander (old shorelines, a
//   level apart) to a pan a level over the beds' floor, under hills of uneven height that rise with the distance from
//   the pan; the dry beds cut their own valleys through it to the outlet.
// - The check and the mend: flooded from the lake at the megadam's water, the valley must reach neither the map's edge
//   nor the basin but by the Low River's gorge or the Gate; where it does, the land where the water crosses is raised
//   by the least that closes it, a knoll on a saddle or one low swell across a stretch of the edge (`mendFlood`).
//
// Every tile stage 1 fixed keeps the shared relief's ground, and every other stands at least at its guard.

import { BED_FLOOR } from "../land/genome";
import { cleanPitsAndSpikes, mergeSmallRegions, readable } from "../land/levels";
import { erodeHard } from "../land/field";
import { drainage } from "../land/drainage";
import { fbm } from "../math/noise";
import { polyDist } from "../math/polyline";
import { distanceFrom } from "../math/grid";
import { smoothstep } from "../math/clamp";
import { atan2, hypot, pow, sqrt } from "../math/portable";
import { badwaterNiches, reliefBetween } from "./raster/relief";
import { layWorks } from "./ladder";
import type { PremiseLand } from "./map";
import { frameAt, openingCamera, VISTA_ZOOM } from "../analysis/opening";
import type { MapSpec } from "../spec/mapspec";
import { checkFrame } from "./frame";
import type { InvariantResult } from "./types";
import { seedOf } from "./raster/field";
import type { ReliefStyle } from "./style";
import type { Point, PremisePlan } from "./types";
import type { StageWater } from "./water";
import { CREST_VARIES, gateOf, onLocal, onMap, rangeAt, sideOf, spineLocal, turnOf, type GateNumbers } from "./premises/wallGate";
import { ruledLand } from "../validate/ruledLand";
import { wallFoot } from "./gateMeasures";

/** The range's shape across it: the spine read through a warp of `warp` tiles (noise `warpCell` across), its half-widths
 *  wandering by `width` of themselves, knobs of `knob` levels on the crest, spurs and gullies of `spur` of the width,
 *  its flank stepped in rises of two and three levels whose levels wander by `phase` (the Veil's buttress a cliff from
 *  `cliff` of the way down). The foot on the valley's side stands at the lake's sill + `foot`. */
export const RANGE_LAND = { warp: 6, warpCell: 17, width: 0.25, knob: 2, spur: 0.12, cliff: 0.75, foot: 3, hollow: 1.15, top: 0.12, topTiles: 1.2, least: 6, spurSide: 1.1 } as const;
/** The range's ribs and gullies: its flanks' contours come out and go in by `front` tiles toward the valley and `back`
 *  toward the basin at its foot, and by their share of the way down from the crest above it, by a noise along the
 *  range `cell` tiles across on each side; never by more than `most` of the flank's width, and not at all on the
 *  crest (whole within a few tiles of the spine, the crest's flat and the first ledges were drawn out into flats five
 *  and six tiles wide, 10 to 16 % of the range in flats at 192² and 256²). */
export const RANGE_RIB = { front: 4.5, back: 7, cell: [10, 15], most: 0.4 } as const;

/** The Veil's shoulders: on each side of the Veil's face the range's foot falls back into a re-entrant, `depth` tiles
 *  deep at its middle, `at` tiles past the lip's end, and `half` tiles to each side of that; each side's own depth and
 *  place. The face stood on one line for the lip's width and 8 tiles each side, the start's bench before it: 33 to 38
 *  tiles of straight foot at 128², over a quarter of the side, on 7 seeds of 12 (planning's verdict of 2026-11-14). */
export const VEIL_SHOULDER = { depth: [4.5, 6], at: [7, 10], half: 5 } as const;

/** A rib's shift of a flank's contours `d` tiles off the spine: none over the crest's own `top` tiles, whole at the
 *  flank's foot `half` tiles off, `by` tiles there (`RANGE_RIB`). */
function ribShift(d: number, top: number, half: number, by: number): number {
  const flank = Math.max(1, half - top);
  return Math.min(by, RANGE_RIB.most * flank) * Math.max(0, Math.min(1, (d - top) / flank));
}
/** The range's side valleys cut by flow (`erodeHard` on the band within `reach` of its half-width): `iterations`, the
 *  incision `k`, `diffusion`; a valley whose water leaves the band over `mouth` tiles of catchment or more spreads a fan
 *  of radius `fan` at its mouth. */
export const RANGE_FLOW = { reach: 1, iterations: 6, k: 0.008, diffusion: 0.04, mouth: 20, fan: 5, cut: 3 } as const;

/** The walls of the dry beds through the range: bands of `band` levels, ledges `ledge` tiles wide, out `reach` tiles. */
export const GORGE = { band: 3, ledge: [2, 3], reach: 18 } as const;

/** The scarp's cliff bands for a drop: one to three, each two levels or more (the last a level less, the talus's). */
function scarpBands(drop: number): number {
  return Math.max(1, Math.min(3, Math.floor((drop - 1) / 2)));
}

/** How far from the Gate's gorge through the range its walls stand at the gap's saddle at least. */
const GORGE_WALL = 3;

/** The scarp's profile: from the crest (`SCARP.dome` tiles of it) down cliff bands, each a cliff a tile wide, a ledge of
 *  `ledge(k)` tiles below it, to talus a level over the foot (two under a scarp of `SCARP.apron` levels or more: an
 *  apron) falling a level in `SCARP.talus` tiles. */
function scarpAt(x: number, crest: number, foot: number, ledge: (k: number) => number): number {
  const drop = crest - foot;
  if (drop <= 0.5) return foot;
  // (cliffs of two levels or more: shorter, rounded to whole levels, their ledges ran together into broad flats)
  const bands = scarpBands(drop);
  const tal = drop >= SCARP.apron ? 2 : 1;
  const c = (drop - tal) / bands;
  let at = SCARP.dome;
  let L = crest;
  for (let k = 0; k < bands; k++) {
    L -= c * smoothstep((x - at) / 1.0 + 0.5);
    at += 1 + ledge(k);
  }
  // (below the last cliff the talus: a level over the foot, down to it)
  const past = x - (at - ledge(bands - 1));
  return Math.max(foot, past > 0 ? Math.min(L, foot + tal * Math.max(0, 1 - past / (SCARP.talus * tal))) : L);
}

/** How near a spur's line a local point stands: 1 on it, 0 three tiles off or past its ends. */
function spurNear(sp: { path: Point[] }, u: number, v: number): number {
  let best = Infinity;
  for (let k = 0; k + 1 < sp.path.length; k++) {
    const a = sp.path[k];
    const b = sp.path[k + 1];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const l2 = dx * dx + dy * dy || 1;
    const t = ((u - a[0]) * dx + (v - a[1]) * dy) / l2;
    if (t < 0 || t > 1) continue;
    best = Math.min(best, hypot(u - a[0] - t * dx, v - a[1] - t * dy));
  }
  return Math.max(0, 1 - best / 3);
}

/** A spur on the back slope: a broad ridge from the crest, falling a level every `run` + `SCARP.spurRun` tiles along it
 *  and `SCARP.spurSide` a tile to each side. */
function backSpurAt(sp: { path: Point[] }, u: number, v: number, crest: number, run: number): number {
  let best = Infinity;
  let along = 0;
  let s = 0;
  for (let k = 0; k + 1 < sp.path.length; k++) {
    const a = sp.path[k];
    const b = sp.path[k + 1];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const l = hypot(dx, dy) || 1;
    const t = Math.max(0, Math.min(1, ((u - a[0]) * dx + (v - a[1]) * dy) / (l * l)));
    const dd = hypot(u - a[0] - t * dx, v - a[1] - t * dy);
    if (dd < best) [best, along] = [dd, s + t * l];
    s += l;
  }
  if (best > 6) return -Infinity;
  return crest - (along * 0.6 + Math.max(0, along - SCARP.dome)) / (run + SCARP.spurRun) - SCARP.spurSide * best;
}

/** The scarp and the back slope (planning's ruling of 2026-11-14, a tilted block): the back slope a level every `run`
 *  tiles; the crest `dome` tiles wide, broad knobs of `knob` levels `knobCell` across on it; `least` over the scarp's
 *  foot but at the saddles; the scarp's ledges `ledge` tiles wide by noise `ledgeCell` across, its talus `talus` tiles;
 *  a buttress carries the ledges `buttress` tiles out; a back spur falls `spurRun` tiles slower than the slope and
 *  `spurSide` a tile to its sides; a spur toward the valley is a ridge `spurTop` tiles to each side of its line at its
 *  crest, which falls from the range's along it (by its share of the way to the power `spurFall`) to the talus at its
 *  end, its flanks the scarp's own cliffs with ledges `spurLedge` tiles wide. */
export const SCARP = { playaFrom: 8, fade: 3, benches: 3, wander: 0.5, wanderCell: 14, run: [2.1, 2.6], dome: 0.5, knob: 0.8, knobCell: 14, least: 4, ledge: [1.6, 2.6], ledgeCell: 12, talus: 2, apron: 6, buttress: 1.5, spurRun: 2, spurSide: 0.6, spurTop: 1, spurLedge: 1.2, spurFall: 1.6 } as const;

/** A spur toward the valley at local (u, v): how far to the side of its line the point stands, and how far along the
 *  whole spur (its trunk and the branch past it: `off` tiles before this path, `total` in all) the nearest point is. */
function frontSpurAt(sp: { path: Point[] }, u: number, v: number, off: number, total: number): { side: number; q: number } {
  let best = Infinity;
  let along = 0;
  let s = 0;
  for (let k = 0; k + 1 < sp.path.length; k++) {
    const a = sp.path[k];
    const b = sp.path[k + 1];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const l = hypot(dx, dy) || 1;
    const t = Math.max(0, Math.min(1, ((u - a[0]) * dx + (v - a[1]) * dy) / (l * l)));
    const dd = hypot(u - a[0] - t * dx, v - a[1] - t * dy);
    if (dd < best) [best, along] = [dd, s + t * l];
    s += l;
  }
  return { side: best, q: Math.min(1, (off + along) / Math.max(1, total)) };
}

/** A spur's height at local (u, v): its crest line falling from the range's crest at the spine to the foot past the
 *  flank's end, and a level a tile or so to each side of it. */
function spurAt(sp: { path: Point[] }, u: number, v: number, spineV: number, crest: number, foot: number, half: number): number {
  let best = Infinity;
  let at: Point = sp.path[0];
  for (let k = 0; k + 1 < sp.path.length; k++) {
    const a = sp.path[k];
    const b = sp.path[k + 1];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const l2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((u - a[0]) * dx + (v - a[1]) * dy) / l2));
    const px = a[0] + t * dx;
    const py = a[1] + t * dy;
    const d = hypot(u - px, v - py);
    if (d < best) [best, at] = [d, [px, py]];
  }
  if (best > half) return -Infinity;
  const q = Math.min(1, Math.abs(at[1] - spineV) / (1.25 * half));
  const top = foot + 0.5 + (crest - foot - 0.5) * (1 - pow(q, 1.3));
  return top - RANGE_LAND.spurSide * best;
}
/** The basin's shape: the playa and its benches read through a warp of `warp` of its depth, lobed by `lobe`, its
 *  shorelines wandering by `ring` of its extent; past the benches hills rising `rise` a tile of its depth to the gap's
 *  saddle + 1, with `hills` levels of uneven height (under the range); the dry beds' valleys
 *  rising `bank` a tile from a level over the bed. */
export const BASIN_LAND = { warp: 0.2, lobe: 0.15, ring: 0.1, rise: 0.3, hills: 2.2, bank: 0.5, cap: 2, playa: [0.4, 0.5], bench: [4.5, 12], swell: 0.5, rim: 0.1 } as const;

/** How far from the stream its banks stand a level over its sill. */
const STREAM_BANK = 2.5;

/** The valley's uplands stand this far under the range's highest peak at the most (the shared relief's ceiling). */
export const UNDER_PEAK = 4;

export interface GateZones {
  /** 0 the valley, 1 the range (between its feet), 2 the basin, per tile. */
  zone: Uint8Array;
}

/** Each tile's zone in the gate's layout (by the plan's range, unwarped). */
export function gateZones(plan: PremisePlan, g: GateNumbers = gateOf(plan)!): GateZones {
  const { W, H } = plan;
  const T = turnOf(plan, g);
  const zone = new Uint8Array(W * H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const [u, v] = onLocal(T, [x + 0.5, y + 0.5]);
      zone[y * W + x] = sideOf(g.range, u, v);
    }
  return { zone };
}

/** The basin's beds (the Gate Bed and the Pass Bed): each tile's distance to the nearest of their channel tiles past the
 *  range's crest, and that bed's level there. */
export function basinBeds(plan: PremisePlan, w: StageWater): { dist: Float32Array; bed: Float32Array } {
  const g = gateOf(plan)!;
  const { W, H } = plan;
  const r = w.raster;
  const T = turnOf(plan, g);
  const li = (id: string) => plan.links.findIndex((l) => l.id === id) + 1;
  const [gate, leat] = [li(g.gate), li(g.leat)];
  const N = W * H;
  const dist = new Float32Array(N).fill(Infinity);
  const bed = new Float32Array(N).fill(NaN);
  const queue: number[] = [];
  for (let i = 0; i < N; i++) {
    if (r.channel[i] !== gate && r.channel[i] !== leat) continue;
    const [u, v] = onLocal(T, [(i % W) + 0.5, Math.floor(i / W) + 0.5]);
    if (v < rangeAt(g.range, u).v) continue;
    dist[i] = 0;
    bed[i] = r.heights[i];
    queue.push(i);
  }
  for (let k = 0; k < queue.length; k++) {
    const i = queue[k];
    const x = i % W;
    const y = (i - x) / W;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const j = yy * W + xx;
        const d = dist[i] + (dx && dy ? 1.4142 : 1);
        if (d < dist[j] - 1e-6) {
          dist[j] = d;
          bed[j] = bed[i];
          queue.push(j);
        }
      }
  }
  return { dist, bed };
}

/** The basin's landmarks (planning's verdict of 2026-11-14: the dry side has form): `mesas` flat-topped mesas, `mesaR`
 *  tiles across their half (× 0.75 + 0.25 × side ÷ 128), standing `mesaTop` levels over the floor behind a cliff with a
 *  level of talus `talus` tiles wide; and a rise, `riseR` tiles, two levels in two broad steps (the life stage lays its
 *  ruins where it does; the rise is a place for them). Each `off` tiles or more past a dry bed's valley floor, `apart` of
 *  the side from the next, `edge` tiles off the map's edge. */
export const BASIN_MARKS = { mesas: 2, mesaR: [4, 6.5], mesaTop: [3, 4], talus: 1.6, riseR: [6, 8.5], off: 2, apart: 0.2, edge: 5, lobe: 0.3 } as const;

interface BasinMark {
  kind: "mesa" | "rise";
  u: number;
  v: number;
  r: number;
  top: number;
}

/** Where the basin's landmarks stand: of the places on a grid four tiles apart on the basin's floor (past the range's
 *  back slope, off the beds' benches, the playa and the rim), those a noise ranks highest, each clear of the ones
 *  before it. */
function basinMarks(plan: PremisePlan, g: GateNumbers, bedD: Float32Array, seed: number): BasinMark[] {
  const T = turnOf(plan, g);
  const N = plan.W;
  const m = 0.75 + (0.25 * N) / 128;
  const [pu, pv] = onLocal(T, g.pan.at);
  const places: { u: number; v: number; rank: number; bed: number }[] = [];
  for (let v = 2; v < N; v += 4)
    for (let u = 2; u < N; u += 4) {
      const ra = rangeAt(g.range, u);
      const slope = Math.max(ra.back, (ra.crest - g.saddle - 1) * SCARP.run[1]);
      if (v < ra.v + Math.min(slope, ra.back + 4) + 4 || Math.min(u, N - u, N - v) < BASIN_MARKS.edge + BASIN_MARKS.mesaR[1] * m) continue;
      const [x, y] = onMap(T, [u, v]);
      const i = Math.floor(y) * N + Math.floor(x);
      if (!(bedD[i] >= 0)) continue;
      // (off the playa and its rings)
      const a = (u - pu) / (g.pan.long * BASIN_LAND.playa[0]);
      const b = (v - pv) / (g.pan.r * BASIN_LAND.playa[1]);
      if (sqrt(a * a + b * b) < 1.6) continue;
      places.push({ u, v, rank: fbm(seed, u, v, 23, 2), bed: bedD[i] });
    }
  places.sort((p, q) => q.rank - p.rank || p.u - q.u || p.v - q.v);
  const out: BasinMark[] = [];
  const kinds: BasinMark["kind"][] = [...Array.from({ length: BASIN_MARKS.mesas }, () => "mesa" as const), "rise"];
  for (const kind of kinds) {
    const k = out.length;
    const share = 0.5 + 0.5 * fbm(seed + 7 + k, 3.5 * k, 0.5, 1, 1);
    const r = kind === "mesa" ? (BASIN_MARKS.mesaR[0] + (BASIN_MARKS.mesaR[1] - BASIN_MARKS.mesaR[0]) * share) * m : (BASIN_MARKS.riseR[0] + (BASIN_MARKS.riseR[1] - BASIN_MARKS.riseR[0]) * share) * m;
    const reach = BASIN_LAND.bench[0] * m * 1.35 + BASIN_MARKS.off + r;
    const at = places.find((q) => q.bed >= reach && out.every((o) => hypot(o.u - q.u, o.v - q.v) >= BASIN_MARKS.apart * N));
    if (!at) continue;
    out.push({ kind, u: at.u, v: at.v, r, top: kind === "mesa" ? BASIN_MARKS.mesaTop[k % 2] : 2 });
  }
  return out;
}

/** The basin's ground at a tile (local u, v), unrounded (planning's rulings of 2026-11-12, a dried lake's floor is
 *  land a player can water, and of 2026-11-14, it has form). Its floor stands at the lake's sill, two levels over its
 *  pan, with broad low swells a level higher; the dry beds run through it in valleys of two benches that step down to
 *  them (a level over the bed out to `bench[0]` tiles, two out to `bench[1]`, both wandering), so the way a canal from
 *  the Gate would run is the land's own; the playa, the old lake's last floor, is a hollow at the pan's level where
 *  the beds meet, an oval `playa` of the plan's read through a warp along the range, a ring a level over it round it;
 *  toward the map's edge the ground rises `rise` a tile to hills under the gap's saddle + 1, out `rim` of the side
 *  (wandering); its landmarks stand on the floor. */
function basinAt(g: GateNumbers, pu: number, pv: number, x: number, y: number, u: number, v: number, s: { warp: number; lobe: number; ring: number; hill: number; bank: number; side: number; marks: BasinMark[] }, bedD: number, bedL: number): number {
  const { pan } = g;
  const N = s.side;
  const m = 0.75 + (0.25 * N) / 128;
  const wu = u + BASIN_LAND.warp * pan.r * fbm(s.warp, x, y, 0.8 * pan.r, 2);
  const wv = v + BASIN_LAND.warp * pan.r * fbm(s.warp + 1, x, y, 0.8 * pan.r, 2);
  // (across the basin as a share of its depth there, from the range's back foot to the map's far edge: the range's line
  // swings, and the playa lies along it, not along the map)
  const ra = rangeAt(g.range, wu);
  const r0 = rangeAt(g.range, pu);
  const [bf, bf0] = [ra.v + ra.back, r0.v + r0.back];
  const wv1 = bf0 + ((wv - bf) / Math.max(8, N - bf)) * (N - bf0);
  const a = (wu - pu) / (pan.long * BASIN_LAND.playa[0]);
  const b = (wv1 - pv) / (pan.r * BASIN_LAND.playa[1]);
  // (an oval, its outline lobed and its shorelines wandering by noise: a squarer norm ran its long sides along the grid)
  const q = sqrt(a * a + b * b) * (1 + BASIN_LAND.lobe * fbm(s.lobe, x, y, 0.6 * pan.r, 2)) + BASIN_LAND.ring * fbm(s.ring, x, y, 11, 2);
  const k = pan.shore / (pan.r * BASIN_LAND.playa[1]);
  const floor = pan.level + 2;
  // the floor and its swells
  let L: number = floor + (fbm(s.hill + 5, x, y, 21, 2) > BASIN_LAND.swell ? 1 : 0);
  // the rim: hills toward the map's edge, their tops uneven under the gap's saddle + 1
  {
    const e = Math.min(u, N - u, N - v);
    const rim = BASIN_LAND.rim * N * (1 + 0.6 * fbm(s.hill + 1, x, y, 27, 2));
    if (e < rim) {
      const cap = g.saddle + 1 + BASIN_LAND.cap * fbm(s.hill + 3, x, y, 6, 2);
      L = Math.max(L, Math.min(cap, floor + 0.6 + (rim - e) * BASIN_LAND.rise + BASIN_LAND.hills * (0.2 + fbm(s.hill, x, y, 17, 3))));
    }
  }
  // the landmarks
  for (const mk of s.marks) {
    const d = hypot(u - mk.u, v - mk.v) / (1 + BASIN_MARKS.lobe * fbm(s.lobe + 3, x, y, 9, 2));
    if (mk.kind === "mesa") {
      if (d <= mk.r) L = Math.max(L, floor + mk.top);
      else if (d <= mk.r + BASIN_MARKS.talus) L = Math.max(L, floor + 1);
    } else if (d <= mk.r) L = Math.max(L, floor + (d <= 0.55 * mk.r ? 2 : 1));
  }
  // the playa, a hollow
  if (q <= 1) L = pan.level;
  else if (q <= 1 + k) L = Math.min(L, pan.level + 1);
  // the dry beds' own valleys, through the floor and the hills to the outlet: two benches down to the bed
  // (their edges wander: the distance read through noise, so no level runs beside the bed at one width)
  if (bedD < Infinity) {
    const d = bedD * (1 + 0.35 * fbm(s.bank, x, y, 9, 2)) + 2.5 * fbm(s.bank + 1, x, y, 13, 2);
    const wide = 1 + 0.3 * fbm(s.bank + 2, x, y, 31, 2);
    if (d <= BASIN_LAND.bench[0] * m * wide) L = Math.min(L, bedL + 1);
    else if (d <= BASIN_LAND.bench[1] * m * wide) L = Math.min(L, bedL + 2);
    else L = Math.min(L, bedL + 3 + (d - BASIN_LAND.bench[1] * m * wide) * BASIN_LAND.bank);
  }
  return L;
}


/** The valley's uplands read through a warp (planning's ruling of 2026-11-12, the corners): the shared relief's plates
 *  meet in runs along the grid and square corners; away from the water and the start, each tile takes the ground a
 *  few tiles off by noise (`VALLEY_WARP`), so their edges wander. Stage 1's ground, the water's meadows and the start's
 *  ground keep the shared relief's. */
function valleyWarp(plan: PremisePlan, w: StageWater, h: Uint8Array): Uint8Array {
  const { W, H } = plan;
  const r = w.raster;
  const N = W * H;
  const water = new Uint8Array(N);
  for (let i = 0; i < N; i++) if (r.fixed[i] || r.lake[i] || r.channel[i] || r.pool[i]) water[i] = 1;
  const near = distanceFrom(water, W, H);
  const s = plan.frame.start;
  const sx = seedOf(plan, "gate", "vwarp");
  const out = Uint8Array.from(h);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (near[i] < VALLEY_WARP.clear || Math.max(Math.abs(x - s.x), Math.abs(y - s.y)) < VALLEY_WARP.start) continue;
      const k = Math.min(1, (near[i] - VALLEY_WARP.clear) / 4);
      const xx = Math.max(0, Math.min(W - 1, Math.round(x + k * VALLEY_WARP.amp * fbm(sx, x, y, VALLEY_WARP.cell, 2))));
      const yy = Math.max(0, Math.min(H - 1, Math.round(y + k * VALLEY_WARP.amp * fbm(sx + 1, x, y, VALLEY_WARP.cell, 2))));
      const j = yy * W + xx;
      if (!water[j]) out[i] = h[j];
    }
  return out;
}
const VALLEY_WARP = { amp: 3.5, cell: 9, clear: 6, start: 18 } as const;

/** The range's frame at a tile: the local point, read through the range's warp (`wu`, `wv`), the range there, which side
 *  of its spine, its half-width there, whether it is the Veil's buttress or the start's bench, and `t`, the share of the
 *  half-width it stands from the spine (under 1: the range's band). */
function rangeFrame(plan: PremisePlan, g: GateNumbers, w: StageWater) {
  const T = turnOf(plan, g);
  const R = g.range;
  const spine = spineLocal(R);
  const S = (name: string) => seedOf(plan, "gate", name);
  const [sWu, sWv, sHw, sSp, sRib] = [S("wu"), S("wv"), S("hw"), S("spur"), S("rib")];
  // (the Veil's shoulders, each side's own: four numbers of one seed)
  const sSh = S("shoulder");
  const part = (k: number, of: readonly [number, number]) => of[0] + ((of[1] - of[0]) * (((sSh >>> (8 * k)) & 255) + 0.5)) / 256;
  const shoulders = [0, 1].map((k) => ({ depth: part(2 * k, VEIL_SHOULDER.depth), at: part(2 * k + 1, VEIL_SHOULDER.at) }));
  void w;
  const veil = plan.links.find((l) => l.id === g.veil)!;
  const lipU = veil.fall!.lip.map((p) => onLocal(T, [p[0] + 0.5, p[1] + 0.5])[0]);
  const [lu0, lu1] = [Math.min(...lipU) - 0.5, Math.max(...lipU) + 0.5];
  const lm = (lu0 + lu1) / 2;
  return (x: number, y: number) => {
    const [u, v] = onLocal(T, [x + 0.5, y + 0.5]);
    // the spine read through a warp, so the range's contours wander and its foot never follows a line (calm before the
    // Veil, whose face stands where the plan put it: warped there, the range stood as towers on the start's bench)
    const calm = smoothstep((Math.abs(u - lm) - (lu1 - lu0) / 2 - 4) / 12);
    const warp = RANGE_LAND.warp * (0.25 + 0.75 * calm);
    const wu = u + warp * fbm(sWu, x, y, RANGE_LAND.warpCell, 3);
    const wv = v + warp * fbm(sWv, x, y, RANGE_LAND.warpCell, 3);
    const ra = rangeAt(R, wu);
    const front = wv < ra.v;
    // (the scarp toward the valley as wide as the plan's front; the back slope as far as the crest's height takes it at a
    // level every `SCARP.run` tiles, down to the basin's hills (the gap's saddle + 1): planning's ruling of 2026-11-14,
    // a tilted block; past it the slope's terraces fade into the basin's own)
    const run = SCARP.run[0] + (SCARP.run[1] - SCARP.run[0]) * (0.5 + 0.5 * fbm(sSp, x, y, 16, 2));
    // (ribs and gullies down both flanks, planning's verdict of 2026-11-14: the ledges and the foot come out on a rib
    // and go in up a gully, by `RANGE_RIB` tiles, a rib every `cell` tiles or so along the range; none at the Veil)
    const rib = calm * fbm(sRib + (front ? 0 : 1), wu, front ? 0.5 : 7.5, front ? RANGE_RIB.cell[0] : RANGE_RIB.cell[1], 2);
    const sh = shoulders[wu < lm ? 0 : 1];
    const shoulder = front ? sh.depth * Math.max(0, 1 - Math.abs(Math.abs(wu - lm) - (lu1 - lu0) / 2 - sh.at) / VEIL_SHOULDER.half) : 0;
    const half = (front ? ra.front * (1 + RANGE_LAND.width * fbm(sHw, x, y, 14, 2)) - shoulder : Math.max(ra.back, (ra.crest - g.saddle - 1) * run)) + Math.max(0, (front ? RANGE_RIB.front : RANGE_RIB.back) * rib);
    const atVeil = front && u > lu0 - 1 && u < lu1 + 1 ? 1 : 0;
    const d = polyDist(wu, wv, spine);
    const t = d / half;
    // (and none of it before the Veil's face, on the start's bench)
    const bench = front && v < g.face - 1 && Math.abs(u - lm) < (lu1 - lu0) / 2 + 8;
    // (the distance from the spine unwarped too: the back slope's contours wander by its height's noise, not by a warp,
    // which stretched its terraces to five and six tiles where it pulled)
    const d0 = polyDist(u, v, spine);
    return { u, v, wu, wv, ra, front, half, atVeil, t, bench, d, run, d0, rib };
  };
}

/** The box round a mask's tiles, `margin` tiles out, inside the map. */
function bandBox(mask: Uint8Array, W: number, H: number, margin: number): { x: number; y: number; w: number; h: number } {
  let [x0, y0, x1, y1] = [W, H, -1, -1];
  for (let i = 0; i < mask.length; i++)
    if (mask[i]) {
      const x = i % W;
      const y = (i - x) / W;
      [x0, y0, x1, y1] = [Math.min(x0, x), Math.min(y0, y), Math.max(x1, x), Math.max(y1, y)];
    }
  if (x1 < 0) return { x: 0, y: 0, w: 1, h: 1 };
  x0 = Math.max(0, x0 - margin);
  y0 = Math.max(0, y0 - margin);
  x1 = Math.min(W - 1, x1 + margin);
  y1 = Math.min(H - 1, y1 + margin);
  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/** The range's band (`rangeFrame`'s `t` under 1, off the start's bench): where the range's own ground stands. */
export function rangeBand(plan: PremisePlan, w: StageWater): Uint8Array {
  // (read a few times a plan, by the column pass and the checks: kept for its stage 1 water and plan)
  const kept = bands.get(w);
  if (kept && kept.plan === plan) return kept.band;
  const band = rangeBandOf(plan, w);
  bands.set(w, { plan, band });
  return band;
}
const bands = new WeakMap<StageWater, { plan: PremisePlan; band: Uint8Array; frame?: Uint8Array; foots?: Float64Array }>();

/** The range's frame band (`rangeFrame`'s `t` under 1, off the bench) and each tile's foot level, as the relief last made
 *  them for this water and plan (null before it has): what `rangeBand` keeps of the frame is the ground over its foot. */
export function rangeBandParts(plan: PremisePlan, w: StageWater): { frame: Uint8Array; foots: Float64Array } | null {
  const kept = bands.get(w);
  return kept && kept.plan === plan && kept.frame && kept.foots ? { frame: kept.frame, foots: kept.foots } : null;
}

function rangeBandOf(plan: PremisePlan, w: StageWater): Uint8Array {
  const g = gateOf(plan)!;
  const { W, H } = plan;
  const at = rangeFrame(plan, g, w);
  const band = new Uint8Array(W * H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const a = at(x, y);
      band[y * W + x] = a.t < RANGE_FLOW.reach && !a.bench ? 1 : 0;
    }
  return band;
}

/** Stage 2 of a gate plan: the whole map's ground round stage 1's water. */
export function gateRelief(plan: PremisePlan, w: StageWater, style?: ReliefStyle, notes: string[] = []): Uint8Array {
  const g = gateOf(plan);
  if (!g) return reliefBetween(plan, w, style);
  const { W, H } = plan;
  const N = W * H;
  const r = w.raster;
  // the valley: the shared relief, the spur its only ridge, its uplands under the range's peak by `UNDER_PEAK` (its own
  // ceiling, `top` and `sky`: a style's uplands rose over the range, and the range is the map's great feature)
  // (and no higher than the valley's highest water + 2 and the gap's saddle + 2: the range stands clearly over the land on
  // both sides, planning's ruling of 2026-11-12)
  const valleyTop = Math.max(...plan.bodies.filter((b) => b.id !== g.pool).map((b) => b.sill));
  const ceiling = Math.min(plan.top, g.crest - UNDER_PEAK, Math.max(g.saddle, valleyTop) + 2);
  const h0 = valleyWarp(plan, w, reliefBetween({ ...plan, top: ceiling, sky: ceiling, ridges: plan.ridges.filter((x) => x.id === g.spur) }, w, style));
  const T = turnOf(plan, g);
  const R = g.range;
  const spine = spineLocal(R);
  const S = (name: string) => seedOf(plan, "gate", name);
  const sCr = S("crest");
  const sHard = S("hard");
  const sLedge = S("ledge");
  const at = rangeFrame(plan, g, w);
  const { dist: bedD, bed: bedL } = basinBeds(plan, w);
  const bs = { warp: S("bwarp"), lobe: S("blobe"), ring: S("bring"), hill: S("bhill"), bank: S("bbank"), side: W, marks: basinMarks(plan, g, bedD, S("marks")) };
  const veil = plan.links.find((l) => l.id === g.veil)!;
  const lipU = veil.fall!.lip.map((p) => onLocal(T, [p[0] + 0.5, p[1] + 0.5])[0]);
  const [lu0, lu1] = [Math.min(...lipU) - 0.5, Math.max(...lipU) + 0.5];
  const lm = (lu0 + lu1) / 2;
  const valleyFoot = g.sill + RANGE_LAND.foot;
  const [pu0, pv0] = onLocal(T, g.pan.at);
  const skyTop = Math.max(plan.top, plan.sky ?? plan.top);
  // (the range's two saddles along it: the gap where the Gate crosses, the Pass where the leat does)
  const gp = plan.links.find((l) => l.id === g.gate)!.path!;
  const gapU = onLocal(T, gp[Math.round(g.slot.to / 2)])[0];
  const passU = onLocal(T, [(g.passSpan[0][0] + g.passSpan[1][0]) / 2, (g.passSpan[0][1] + g.passSpan[1][1]) / 2])[0];
  const f = new Float64Array(N);
  // (the range's band, where its own ground stands, and each tile's foot level: the base the valleys cut to)
  const band = new Uint8Array(N);
  const foots = new Float64Array(N);
  const spurs = g.spurs ?? [];
  // (each spur's box, six tiles out: a tile past it is never near it)
  const boxes = spurs.map((sp) => {
    const us = sp.path.map((p) => p[0]);
    const vs = sp.path.map((p) => p[1]);
    return [Math.min(...us) - 6, Math.min(...vs) - 6, Math.max(...us) + 6, Math.max(...vs) + 6];
  });
  // (a spur's branches run on from its trunk's end: each path's tiles before it and the whole spur's length)
  const lenOf = (path: Point[]) => path.reduce((sum, q, k) => (k ? sum + hypot(q[0] - path[k - 1][0], q[1] - path[k - 1][1]) : 0), 0);
  const spurOff = spurs.map(() => 0);
  const spurAll = spurs.map((sp) => lenOf(sp.path));
  for (let k = 0; k < spurs.length; k++) {
    if (!spurs[k].trunk) continue;
    let far = 0;
    for (let j = k + 1; j < spurs.length && !spurs[j].trunk; j++) {
      spurOff[j] = spurAll[k];
      far = Math.max(far, spurAll[j]);
      spurAll[j] += spurAll[k];
    }
    spurAll[k] += far;
  }
  const nearBox = (k: number, u: number, v: number) => u >= boxes[k][0] && u <= boxes[k][2] && v >= boxes[k][1] && v <= boxes[k][3];
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const { u, v, wu, wv, ra, front, half, atVeil, t, bench, d, run, d0, rib } = at(x, y);
      const basin = front ? -Infinity : basinAt(g, pu0, pv0, x, y, u, v, bs, bedD[i], bedL[i]);
      // (toward the valley the range rises from the valley's own land where it stands over the foot: from the foot under
      // an upland's plate, the plate ran on into the range as a shelf)
      const foot = front ? Math.max(valleyFoot, h0[i]) : basin;
      foots[i] = foot;
      band[i] = t < 1 && !bench ? 1 : 0;
      // (the back slope runs on past the band, down to the basin's own ground: its terraces fade into the pan)
      if (!band[i] && (front || bench || t > SCARP.fade)) {
        f[i] = front ? h0[i] : basin;
        continue;
      }
      // the crest: the plan's, broad knobs on it (a dome, not a spike), at least `SCARP.least` over the scarp's foot but at
      // the gap and the Pass, its two saddles
      const saddle = Math.abs(wu - gapU) < g.slot.width / 2 + 8 || Math.abs(wu - passU) < 8;
      const knob = SCARP.knob * fbm(sCr, x, y, SCARP.knobCell, 2);
      const crest = Math.min(skyTop, Math.max(saddle ? -Infinity : Math.max(valleyFoot, h0[i]) + SCARP.least, ra.crest + knob));
      let L: number;
      if (front && atVeil) {
        // the Veil's buttress: hard to a cliff near its foot, its face the lip the fall pours from
        const tt = Math.max(0, t);
        const firm = tt < RANGE_LAND.cliff ? 1 - 0.4 * tt : ((1 - 0.4 * RANGE_LAND.cliff) * (1 - tt)) / (1 - RANGE_LAND.cliff);
        L = foot + Math.max(0, crest - foot) * firm;
      } else if (front) {
        // the scarp: two or three cliff bands of two or three levels, ledges two to four wide between them, wandering
        // with broad noise; a spur toward the valley a buttress that carries the ledges out; talus at the foot
        let x0 = d - ribShift(d, SCARP.dome + 1, half, RANGE_RIB.front * rib);
        for (let k = 0; k < spurs.length; k++) if (spurs[k].side === 0 && nearBox(k, wu, wv)) x0 = Math.min(x0, d - SCARP.buttress * spurNear(spurs[k], wu, wv));
        // (its ledges as wide as the scarp's room allows: the plan's front, from the spine to the valley's ground)
        const bands = scarpBands(crest - foot);
        const room = Math.max(0, (half - SCARP.dome - bands - SCARP.talus) / bands);
        L = scarpAt(Math.max(0, x0), crest, foot, (k) => Math.min(room, SCARP.ledge[0] + (SCARP.ledge[1] - SCARP.ledge[0]) * (0.5 + 0.5 * fbm(sLedge + k, x, y, SCARP.ledgeCell, 2))));
        // (a spur toward the valley: a ridge leaving the scarp, its crest falling along it to the talus at its end)
        for (let k = 0; k < spurs.length; k++) {
          if (spurs[k].side !== 0 || !nearBox(k, wu, wv)) continue;
          const sa = frontSpurAt(spurs[k], wu, wv, spurOff[k], spurAll[k]);
          if (sa.side > 6) continue;
          const top = foot + 1 + Math.max(0, crest - foot - 1) * (1 - pow(sa.q, SCARP.spurFall));
          L = Math.max(L, scarpAt(Math.max(0, sa.side - SCARP.spurTop), top, foot, () => SCARP.spurLedge));
        }
      } else {
        // the back slope: a level every `run` tiles from a crest `SCARP.dome` tiles wide, nested contours down to the
        // basin's own ground; a spur toward the basin a broad ridge falling slower than the slope round it
        // (past the band, down to the basin's benches, at twice the pace: the slope's terraces fade into the pan)
        const dr = Math.max(0, d0 - ribShift(d0, SCARP.dome + run, half, RANGE_RIB.back * rib));
        const inBand = Math.min(dr, half);
        L = crest - Math.max(0, inBand - SCARP.dome) / run - Math.max(0, dr - half) / (run / 2) + SCARP.wander * fbm(sLedge + 9, x, y, SCARP.wanderCell, 2);
        for (let k = 0; k < spurs.length; k++) if (spurs[k].side === 2 && nearBox(k, wu, wv)) L = Math.max(L, backSpurAt(spurs[k], wu, wv, crest, run));
        // (under the slope the basin keeps its benches, not its hills: capped hills under it stood as flat-topped knolls
        // across the slope)
        L = Math.max(L, Math.min(basin, g.pan.level + SCARP.benches));
        // (and never over the dry lake's playa, but within `SCARP.playaFrom` tiles of the spine: where the playa reached
        // the crest, its floor ran through to the valley)
        if (basin <= g.pan.level + 1 && d0 >= SCARP.playaFrom) L = basin;
      }
      f[i] = L;
    }
  // (stage 1's ground beside a dry bed in the range, its wadi strips, is the range's own: the gorge's walls are its
  // flanks, and a wadi strip a level over the bed through the range let the valley out at the megadam's water)
  const { zone } = gateZones(plan, g);
  const keep = new Uint8Array(N);
  for (let i = 0; i < N; i++) keep[i] = r.fixed[i] && !(zone[i] === 1 && !r.lake[i] && !r.channel[i] && !r.pool[i] && !r.crest[i]) ? 1 : 0;
  // the side valleys, cut by flow (planning's ruling of 2026-11-13): stream-power incision and diffusion on the range's
  // band (`land/field.ts` `erodeHard`), its foot the base level, the Veil's buttress and the gorge's walls hard
  {
    // (no ground the shaping left undefined, the start's bench under the range's reach: the valley's own there)
    for (let i = 0; i < N; i++) if (!Number.isFinite(f[i])) f[i] = h0[i];
    const hard = new Float64Array(N);
    for (let i = 0; i < N; i++) hard[i] = !band[i] ? 1 : r.fixed[i] || r.crest[i] ? 1 : 0.15 + 0.35 * Math.max(0, fbm(sHard, i % W, Math.floor(i / W), 11, 2));
    const veilAt = new Uint8Array(N);
    for (const i of r.lips[g.veil] ?? []) veilAt[i] = 1;
    const nearVeil = distanceFrom(veilAt, W, H);
    for (let i = 0; i < N; i++) if (nearVeil[i] < 10) hard[i] = 1;
    // (on the band's box and `RANGE_FLOW.iterations` + 2 tiles round it, the furthest the diffusion carries anything in;
    // the whole map took a second at 256²)
    const box = bandBox(band, W, H, RANGE_FLOW.iterations + 2);
    const sub = (a: ArrayLike<number>) => {
      const o = new Float64Array(box.w * box.h);
      for (let y = 0; y < box.h; y++) for (let x = 0; x < box.w; x++) o[y * box.w + x] = a[(y + box.y) * W + x + box.x];
      return o;
    };
    const at = (k: number) => (Math.floor(k / box.w) + box.y) * W + (k % box.w) + box.x;
    const eSub = erodeHard(sub(f), sub(hard), box.w, box.h, RANGE_FLOW.iterations, RANGE_FLOW.k, RANGE_FLOW.diffusion, (k) => !band[at(k)]);
    const e = Float64Array.from(f);
    for (let k = 0; k < eSub.length; k++) e[at(k)] = eSub[k];
    // (a canyon cuts `RANGE_FLOW.cut` levels into the block at most: cut to the basin's floor, one ran through the range
    // under the gap's saddle and the dry lake reached the valley)
    for (let i = 0; i < N; i++) if (band[i] && hard[i] < 1) f[i] = Math.max(foots[i], f[i] - RANGE_FLOW.cut, e[i]);
    // fans at the side valleys' mouths, on both sides: where a valley's water leaves the range, a low cone a level over the
    // foot, out `RANGE_FLOW.fan` tiles
    const dSub = drainage(sub(f), box.w, box.h, { outlet: (k) => !band[at(k)], epsilon: 1e-6 });
    const fan = new Float64Array(N).fill(-Infinity);
    for (let k = 0; k < box.w * box.h; k++) {
      const i = at(k);
      const rk = dSub.rcv[k];
      const rc = rk < 0 ? -1 : at(rk);
      const area = dSub.area[k];
      if (!band[i] || rc < 0 || band[rc] || area < RANGE_FLOW.mouth) continue;
      const x0 = i % W;
      const y0 = Math.floor(i / W);
      const R2 = RANGE_FLOW.fan;
      for (let y = Math.max(0, y0 - R2); y <= Math.min(H - 1, y0 + R2); y++)
        for (let x = Math.max(0, x0 - R2); x <= Math.min(W - 1, x0 + R2); x++) {
          const j = y * W + x;
          if (band[j]) continue;
          const dd = hypot(x - x0, y - y0);
          if (dd > R2) continue;
          fan[j] = Math.max(fan[j], foots[i] + 1 - dd / R2);
        }
    }
    for (let i = 0; i < N; i++) if (fan[i] > f[i] && !r.fixed[i] && !r.lake[i] && !r.channel[i] && !r.pool[i]) f[i] = fan[i];
  }
  // the Gate's gorge's walls through the range stand at the gap's saddle at least (laid to `basin.bowl` and `gate.lowest`
  // as they are, so no plan is made and then refused): where the scarp and the back slope fall low at the gap, the
  // gorge's wadi strips and the slope beside them, under the lake's sill + 1, let the dry lake's floor through to the
  // valley
  {
    const gi = plan.links.findIndex((l) => l.id === g.gate) + 1;
    const gorge = new Uint8Array(N);
    for (let i = 0; i < N; i++) if (r.channel[i] === gi && zone[i] === 1) gorge[i] = 1;
    const dg = distanceFrom(gorge, W, H);
    for (let i = 0; i < N; i++) if (zone[i] === 1 && !gorge[i] && dg[i] <= GORGE_WALL && !r.lake[i] && !r.channel[i] && !r.pool[i]) f[i] = Math.max(f[i], g.saddle);
  }
  const h = new Uint8Array(N);
  const top = Math.max(plan.top, plan.sky ?? plan.top);
  for (let i = 0; i < N; i++) h[i] = keep[i] ? h0[i] : Math.max(r.heights[i], Math.max(BED_FLOOR + 1, Math.min(top, Math.round(f[i]))));
  // no pits, spikes or slivers (the build's own rules), stage 1's ground kept; in the range and the basin no spike, wall
  // or trench one or two tiles wide standing two levels or more out of the land round it (the themes' rule at high
  // Verticality, `readable`: a hard face cut by a gully stood as towers beside the start)
  const rd = Uint8Array.from(h);
  readable(rd, W, H);
  for (let i = 0; i < N; i++) if (!keep[i] && zone[i] !== 0) h[i] = rd[i];
  mergeSmallRegions(h, W, H, 4, keep);
  cleanPitsAndSpikes(h, W, H, keep);
  for (let i = 0; i < N; i++) if (!keep[i] && h[i] < r.heights[i]) h[i] = r.heights[i];
  // (the stream's banks stand a level over its sill: it falls a single level to the lake over its cascade, and the lake's
  // meadow, a level over the lake, stood at the stream's own sill beside it, so the stream ran out over the meadow)
  const si = plan.bodies.findIndex((b) => b.id === "stream") + 1;
  if (si > 0) {
    const sill = plan.bodies[si - 1].sill;
    const on = new Uint8Array(N);
    for (let i = 0; i < N; i++) if (r.lake[i] === si) on[i] = 1;
    const d = distanceFrom(on, W, H);
    for (let i = 0; i < N; i++) if (!keep[i] && !r.lake[i] && !r.channel[i] && !r.pool[i] && !r.crest[i] && d[i] <= STREAM_BANK && h[i] < sill + 1) h[i] = sill + 1;
  }
  const mends = mendFlood(plan, w, h);
  if (mends) notes.push(`The valley held at the megadam's water by ${mends} rise${mends === 1 ? "" : "s"} where it spilled`);
  // (the band as `rangeBand` reads it, kept for the column pass and the checks: the range's own ground in it, where its
  // whole level stands over its foot once the gorge's walls are raised and the valley mended, laid to `range.flat` as
  // it is, so the valley's plates at the scarp's foot are not read as the range's flats)
  bands.set(w, { plan, band: Uint8Array.from(band, (b, i) => (b && h[i] > foots[i] + 0.25 ? 1 : 0)), frame: band, foots });

  return h;
}

/** The tiles the valley's water reaches at the megadam's level from the lake, the Gate's channel and the Low River's
 *  gorge shut; the first tile where it leaves the valley (the map's edge or past the range's crest), with the way it
 *  came; and, with `all`, every flooded tile on the map's edge. */
function floodAt(plan: PremisePlan, w: StageWater, h: ArrayLike<number>, all = false): { leak: number; from: Int32Array; edge: number[] } {
  const g = gateOf(plan)!;
  const { W, H } = plan;
  const r = w.raster;
  const T = turnOf(plan, g);
  const lake = plan.bodies.findIndex((b) => b.id === g.lake) + 1;
  const shut = new Set([plan.links.findIndex((l) => l.id === g.low) + 1, plan.links.findIndex((l) => l.id === g.gate) + 1]);
  const lowIx = plan.links.findIndex((l) => l.id === g.low) + 1;
  const from = new Int32Array(W * H).fill(-2);
  const queue: number[] = [];
  const edge: number[] = [];
  let leak = -1;
  for (let i = 0; i < W * H; i++) if (r.lake[i] === lake) (from[i] = -1), queue.push(i);
  for (let k = 0; k < queue.length; k++) {
    const i = queue[k];
    const x = i % W;
    const y = (i - x) / W;
    const onEdge = x === 0 || y === 0 || x === W - 1 || y === H - 1;
    const [u, v] = onLocal(T, [x + 0.5, y + 0.5]);
    if (onEdge || v > rangeAt(g.range, u).v) {
      if (leak < 0) leak = i;
      if (!all) break;
      if (onEdge) edge.push(i);
      continue;
    }
    for (const j of [i - 1, i + 1, i - W, i + W]) {
      if (j < 0 || j >= W * H || (j === i - 1 && x === 0) || (j === i + 1 && x === W - 1)) continue;
      if (from[j] !== -2 || shut.has(r.channel[j]) || h[j] > g.megadam) continue;
      // (the gorge's own fall, the Low River's lip, is the megadam's)
      if (r.crest[j] === lowIx) continue;
      from[j] = i;
      queue.push(j);
    }
  }
  return { leak, from, edge };
}

/** The flood check and its least mend (planning: "where water would cross the range anywhere but the gap, raise that
 *  saddle by the least that closes it, with the relief's own shape"): while the valley at the megadam's water spills,
 *  the ground it spills over is raised a level or two over that water, never on stage 1's ground: across the range, a
 *  knoll of ragged outline on the saddle it crossed; at the map's edge, one swell across the whole stretch the valley
 *  reaches the edge by (a low divide, its outline wandering, its crest set in from the edge), not a bead a tile. The
 *  mends made. */
export function mendFlood(plan: PremisePlan, w: StageWater, h: Uint8Array, most = 16, skip?: Uint8Array): number {
  const g = gateOf(plan)!;
  const { W, H } = plan;
  const r = w.raster;
  const s = seedOf(plan, "gate", "mend");
  const raise = (x0: number, y0: number, x1: number, y1: number, d: (x: number, y: number) => number) => {
    for (let y = Math.max(0, Math.floor(y0)); y <= Math.min(H - 1, Math.ceil(y1)); y++)
      for (let x = Math.max(0, Math.floor(x0)); x <= Math.min(W - 1, Math.ceil(x1)); x++) {
        const i = y * W + x;
        if (r.fixed[i] || skip?.[i]) continue;
        const q = d(x, y) * (1 + 0.3 * fbm(s, x, y, 5, 2));
        if (q >= 1) continue;
        const want = g.megadam + 1 + Math.round(1.6 * (1 - q * q));
        if (h[i] < want) h[i] = want;
      }
  };
  let mends = 0;
  for (; mends < most; mends++) {
    const { leak, from, edge } = floodAt(plan, w, h, true);
    if (leak < 0) break;
    if (edge.length) {
      // the longest stretch of the edge the flood reaches (tiles along one side, gaps of three or less joined)
      const side = (i: number) => {
        const x = i % W;
        const y = (i - x) / W;
        return y === 0 ? 0 : y === H - 1 ? 1 : x === 0 ? 2 : 3;
      };
      const along = (i: number) => (side(i) < 2 ? i % W : Math.floor(i / W));
      let best: number[] = [];
      for (let sd = 0; sd < 4; sd++) {
        const ts = edge.filter((i) => side(i) === sd).sort((p, q) => along(p) - along(q));
        let run: number[] = [];
        for (const i of ts) {
          if (run.length && along(i) - along(run[run.length - 1]) > 3) {
            if (run.length > best.length) best = run;
            run = [];
          }
          run.push(i);
        }
        if (run.length > best.length) best = run;
      }
      const sd = side(best[0]);
      const a0 = along(best[0]);
      const a1 = along(best[best.length - 1]);
      const half = (a1 - a0) / 2 + 4;
      const deep = Math.max(5, Math.min(14, (a1 - a0) / 3 + 3));
      const mid = (a0 + a1) / 2;
      // (the swell in the edge's own frame: along it and in from it)
      const toEdge = (x: number, y: number): [number, number] => (sd === 0 ? [x - mid, y] : sd === 1 ? [x - mid, H - 1 - y] : sd === 2 ? [y - mid, x] : [y - mid, W - 1 - x]);
      const [x0, y0, x1, y1] = sd < 2 ? [mid - half, sd === 0 ? 0 : H - 1 - deep * 1.4, mid + half, sd === 0 ? deep * 1.4 : H - 1] : [sd === 2 ? 0 : W - 1 - deep * 1.4, mid - half, sd === 2 ? deep * 1.4 : W - 1, mid + half];
      raise(x0, y0, x1, y1, (x, y) => {
        const [p, q] = toEdge(x, y);
        return hypot(p / half, (q - deep * 0.45) / (deep * 0.7));
      });
      continue;
    }
    // across the range: a knoll on the saddle, a few tiles back along the way the water came
    let at = leak;
    let back = 0;
    for (let i = leak; i >= 0 && back < 3; i = from[i]) {
      if (!r.fixed[i] && !skip?.[i]) at = i;
      back++;
    }
    const ax = at % W;
    const ay = (at - ax) / W;
    const rad = 4 + (mends % 3);
    raise(ax - rad - 2, ay - rad - 2, ax + rad + 2, ay + rad + 2, (x, y) => hypot(x - ax, y - ay) / rad);
  }
  return mends;
}

/** A gate plan's land as `map.ts` `premiseLand` makes the lake stair's: its relief (stage 2), the permanent badwater's
 *  niche cut into it and the works' own ground (`layWorks`), for `premiseMap`. */
export function gateLand(plan: PremisePlan, water: StageWater, style?: ReliefStyle): PremiseLand {
  const notes: string[] = [];
  const heights = gateRelief(plan, water, style, notes);
  const niches = badwaterNiches(plan, water, heights, notes);
  // (the niche is cut beside the Low River's gorge past the spur; where it opens a way out at the megadam's water, the
  // check and its mend run again, the niche kept)
  const skip = new Uint8Array(plan.W * plan.H);
  for (const [nx, ny] of Object.values(niches))
    for (let y = Math.max(0, ny - 4); y <= Math.min(plan.H - 1, ny + 4); y++) for (let x = Math.max(0, nx - 4); x <= Math.min(plan.W - 1, nx + 4); x++) skip[y * plan.W + x] = 1;
  const more = mendFlood(plan, water, heights, 16, skip);
  if (more) notes.push(`The valley held round the badwater's niche by ${more} more rise${more === 1 ? "" : "s"}`);
  const laid = layWorks(plan, water, heights);
  // no columns (planning's ruling of 2026-11-14): after the mends and the works' ground, a piece of one level under
  // `COLUMN.size` tiles standing two or more over every neighbour is lowered into them (`range.columns`'s ground)
  {
    const own = columnGround(plan, water);
    for (let pass = 0; pass < 4; pass++) if (!lowerColumns(heights, plan.W, plan.H, own)) break;
  }
  return { water, heights, niches, laid, notes };
}

// ------------------------------------------------------------------------------------------------- the land's invariants

/** What a land invariant reads: stage 1's water and stage 2's ground. `StageContext` has no ground yet (§5.1 "As built
 *  (water)", its seams, says the edit), so these run by `gateLandFailures`, not with the def's `land` invariants. */
export interface GateLandContext {
  spec: MapSpec;
  plan: PremisePlan;
  water: StageWater;
  heights: Uint8Array;
}

export interface GateLandInvariant {
  id: string;
  test(ctx: GateLandContext): InvariantResult;
}

const OK: InvariantResult = { ok: true };
const fail = (reason: string): InvariantResult => ({ ok: false, reason });

/** The crest's ground along the range: at each tile of u (local, the gorge's tiles and the map's last two at each end
 *  aside), the highest dry ground within the range's band there. */
export function crestLine(plan: PremisePlan, water: StageWater, heights: ArrayLike<number>): number[] {
  const g = gateOf(plan)!;
  const { W, H } = plan;
  const r = water.raster;
  const T = turnOf(plan, g);
  const gate = plan.links.findIndex((l) => l.id === g.gate) + 1;
  const best = new Array<number>(W).fill(-1);
  const gorge = new Uint8Array(W);
  for (let i = 0; i < W * H; i++) {
    const [u, v] = onLocal(T, [(i % W) + 0.5, Math.floor(i / W) + 0.5]);
    const k = Math.floor(u);
    if (k < 0 || k >= W) continue;
    if (r.channel[i] === gate && sideOf(g.range, u, v) === 1) gorge[k] = 1;
    if (sideOf(g.range, u, v) !== 1 || r.lake[i] || r.channel[i] || r.pool[i]) continue;
    if (heights[i] > best[k]) best[k] = heights[i];
  }
  const out: number[] = [];
  for (let k = 2; k < W - 2; k++) if (!gorge[k] && best[k] >= 0) out.push(best[k]);
  return out;
}

/** `range.crest` (planning's ruling: a crest that rises and falls by four levels or more with peaks and saddles; no
 *  flat-topped slab): along the range its crest's ground varies by `CREST_VARIES` levels or more, and no run of it
 *  longer than `SLAB` of the map's side stands at one level. */
const rangeCrest: GateLandInvariant = {
  id: "range.crest",
  test({ plan, water, heights }) {
    const c = crestLine(plan, water, heights);
    if (!c.length) return fail("The range has no crest");
    const hi = Math.max(...c);
    const lo = Math.min(...c);
    if (hi - lo < CREST_VARIES) return fail(`The range's crest varies by ${hi - lo} levels (${CREST_VARIES} or more)`);
    let run = 1;
    const most = Math.round(SLAB * plan.W);
    for (let k = 1; k < c.length; k++) {
      run = c[k] === c[k - 1] ? run + 1 : 1;
      if (run > most) return fail(`The range's crest stands at ${c[k]} for ${run} tiles: a flat-topped slab (${most} at most)`);
    }
    return OK;
  },
};
const SLAB = 0.25;

/** The lowest crossing from the valley to the basin, the Gate's channel shut: the least, over every way across the
 *  range's crest, of the highest ground on it (a priority flood from the valley's water). */
export function lowestCrossing(plan: PremisePlan, water: StageWater, heights: ArrayLike<number>, shutGate = true): number {
  const g = gateOf(plan)!;
  const { W, H } = plan;
  const r = water.raster;
  const T = turnOf(plan, g);
  const gate = plan.links.findIndex((l) => l.id === g.gate) + 1;
  const lake = plan.bodies.findIndex((b) => b.id === g.lake) + 1;
  const N = W * H;
  const best = new Float64Array(N).fill(Infinity);
  // (a bucket queue by level: levels are small integers)
  const buckets: number[][] = [];
  const push = (i: number, l: number) => {
    best[i] = l;
    (buckets[l] ??= []).push(i);
  };
  for (let i = 0; i < N; i++) if (r.lake[i] === lake) push(i, heights[i]);
  const past = (i: number) => {
    const [u, v] = onLocal(T, [(i % W) + 0.5, Math.floor(i / W) + 0.5]);
    return v > rangeAt(g.range, u).v + rangeAt(g.range, u).back;
  };
  for (let l = 0; l < buckets.length; l++)
    for (let k = 0; k < (buckets[l]?.length ?? 0); k++) {
      const i = buckets[l][k];
      if (best[i] < l) continue;
      if (past(i)) return l;
      const x = i % W;
      for (const j of [i - 1, i + 1, i - W, i + W]) {
        if (j < 0 || j >= N || (j === i - 1 && x === 0) || (j === i + 1 && x === W - 1)) continue;
        if (shutGate && r.channel[j] === gate) continue;
        const nl = Math.max(l, heights[j]);
        if (nl < best[j]) push(j, nl);
      }
    }
  return Infinity;
}

/** `gate.lowest` (planning's ruling: the gap is the one low way through, where the range's lowest saddle is): the
 *  lowest crossing of the range runs through the Gate's gorge, and with the Gate shut the lowest other crossing stands
 *  at the gap's saddle or over it. */
const gateLowest: GateLandInvariant = {
  id: "gate.lowest",
  test({ plan, water, heights }) {
    const g = gateOf(plan)!;
    const open = lowestCrossing(plan, water, heights, false);
    const other = lowestCrossing(plan, water, heights, true);
    if (!(other > open)) return fail(`The lowest way across the range (${other}) is not the Gate's gorge (${open})`);
    if (other < g.saddle) return fail(`Away from the Gate the range is crossed at ${other}, under the gap's saddle (${g.saddle})`);
    return OK;
  },
};

/** `wall.camera`, its land half (§5.1: from the opening camera at the vista's zoom the range crosses the frame): its
 *  high ground (within two levels of its crest there) spans 60 % or more of the frame's width. */
const wallCamera: GateLandInvariant = {
  id: "wall.camera",
  test({ plan, heights }) {
    const g = gateOf(plan)!;
    const { W, H } = plan;
    const T = turnOf(plan, g);
    const cam = openingCamera(plan.frame.start, VISTA_ZOOM);
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = 0; i < W * H; i++) {
      const [u, v] = onLocal(T, [(i % W) + 0.5, Math.floor(i / W) + 0.5]);
      if (sideOf(g.range, u, v) !== 1 || heights[i] < rangeAt(g.range, u).crest - 2) continue;
      const p = frameAt(cam, (i % W) + 0.5, Math.floor(i / W) + 0.5, heights[i]);
      if (!p || Math.abs(p.v) > 1 || Math.abs(p.u) > 1) continue;
      lo = Math.min(lo, p.u);
      hi = Math.max(hi, p.u);
    }
    const span = hi > lo ? (hi - lo) / 2 : 0;
    return span >= CREST_SPAN ? OK : fail(`From the opening camera the range spans ${Math.round(100 * span)} % of the frame's width (${100 * CREST_SPAN} % or more)`);
  },
};
const CREST_SPAN = 0.6;

/** `basin.bowl`, its land half (planning's ruling: a dry lake in a natural depression, lower than the valley's lake):
 *  the pan's ground at most a level over its own level and under the lake's sill, the old lake's floor (the basin's
 *  ground joined to the pan at the sill + 1 or under, the beds' channels aside) `FLOOR_LEAST` of the map or more, and
 *  nowhere joined to the valley's side of the range's crest. */
const basinBowl: GateLandInvariant = {
  id: "basin.bowl",
  test({ plan, water, heights }) {
    const g = gateOf(plan)!;
    const { W, H } = plan;
    const r = water.raster;
    const px = Math.floor(g.pan.at[0]);
    const py = Math.floor(g.pan.at[1]);
    const T = turnOf(plan, g);
    const pr = Math.max(3, Math.floor(g.pan.r * 0.9));
    let pan = 0;
    let high = 0;
    for (let y = py - pr; y <= py + pr; y++)
      for (let x = px - pr; x <= px + pr; x++) {
        const i = y * W + x;
        if (x < 0 || y < 0 || x >= W || y >= H || r.fixed[i] || (x - px) * (x - px) + (y - py) * (y - py) > pr * pr) continue;
        pan++;
        if (heights[i] > g.pan.level + 1) high++;
      }
    if (!pan || high > pan / 3) return fail(`The basin's pan stands over ${g.pan.level + 1} on ${high} of its ${pan} middle tiles`);
    // the old lake's floor: the ground at the sill + 1 or under joined to the pan (the beds' own channels aside, which
    // the Gate's gorge joins to the valley), the range's crest a wall it stops at
    const top = g.sill + 1;
    const li = (id: string) => plan.links.findIndex((l) => l.id === id) + 1;
    const beds = new Set([li(g.gate), li(g.leat)]);
    const seen = new Uint8Array(W * H);
    // (from the pan's lowest free tile)
    let p0 = -1;
    for (let y = Math.max(0, py - pr); y <= Math.min(H - 1, py + pr); y++)
      for (let x = Math.max(0, px - pr); x <= Math.min(W - 1, px + pr); x++) {
        const i = y * W + x;
        if (!r.fixed[i] && (p0 < 0 || heights[i] < heights[p0])) p0 = i;
      }
    if (p0 < 0 || heights[p0] > top) return fail("The basin's pan has no ground at the lake's sill + 1 or under");
    const queue = [p0];
    seen[queue[0]] = 1;
    let n = 0;
    for (let k = 0; k < queue.length; k++) {
      const i = queue[k];
      n++;
      const x = i % W;
      const y = (i - x) / W;
      for (const j of [i - 1, i + 1, i - W, i + W]) {
        if (j < 0 || j >= W * H || seen[j] || (j === i - 1 && x === 0) || (j === i + 1 && x === W - 1) || heights[j] > top || beds.has(r.channel[j])) continue;
        const [u, v] = onLocal(T, [(j % W) + 0.5, Math.floor(j / W) + 0.5]);
        if (v < rangeAt(g.range, u).v) return fail(`The basin's floor at ${top} or under reaches the valley at ${j % W}, ${Math.floor(j / W)}`);
        seen[j] = 1;
        queue.push(j);
      }
    }
    if (n < FLOOR_LEAST * W * H) return fail(`The dry lake's floor is ${n} tiles (${Math.round(FLOOR_LEAST * W * H)} or more)`);
      return OK;
  },
};
const FLOOR_LEAST = 0.025;

/** `valley.enclosed`, its land half (§5.1): the valley's floor closed at the megadam's level all round but for the Low
 *  River's gorge: from the lake, over ground at or under the megadam's water, neither the map's edge nor the range's
 *  crest is reached but through the gorge (the megadam's slot) or the Gate (dammed with it). */
const valleyEnclosed: GateLandInvariant = {
  id: "valley.enclosed",
  test({ plan, water, heights }) {
    const g = gateOf(plan)!;
    const { leak } = floodAt(plan, water, heights);
    if (leak < 0) return OK;
    return fail(`At the megadam's water (${g.megadam}) the valley spills at ${leak % plan.W}, ${Math.floor(leak / plan.W)}`);
  },
};

/** `terrain.ruled_land` on stage 2's ground (planning: land first, nothing ruled): the shared look check's three numbers
 *  under its limits, day 1's planned water as the wet tiles. */
const ruled: GateLandInvariant = {
  id: "terrain.ruled_land",
  test({ plan, water, heights }) {
    const r = water.raster;
    const wet = new Uint8Array(plan.W * plan.H);
    for (let i = 0; i < wet.length; i++) {
      const l = r.channel[i] ? plan.links[r.channel[i] - 1] : null;
      if (r.lake[i] || r.pool[i] || r.crest[i] || (l && l.wet)) wet[i] = 1;
    }
    const m = ruledLand(heights, wet, plan.W, plan.H);
    return m.ok ? OK : fail(`Ruled land: ${(100 * m.straight).toFixed(1)} % straight, ${(100 * m.bands).toFixed(1)} % in bands, ${m.corners.toFixed(1)} corners per 1,000`);
  },
};

/** Day 1's planned water (stage 1): the bodies, the falls' pools and crests, the wet channels. */
function dayOneWet(plan: PremisePlan, water: StageWater): Uint8Array {
  const r = water.raster;
  const wet = new Uint8Array(plan.W * plan.H);
  for (let i = 0; i < wet.length; i++) {
    const l = r.channel[i] ? plan.links[r.channel[i] - 1] : null;
    if (r.lake[i] || r.pool[i] || r.crest[i] || (l && l.wet)) wet[i] = 1;
  }
  return wet;
}

/** The start's bench on day 1: the dry ground at the start's level joined to it without a step (4-connected), within
 *  `BENCH_REACH` tiles of it (the shared start checks read 20 tiles' walk: past it the valley's floor at that level ran
 *  on to the far brooks, and their shores counted as the bench's). */
export const BENCH_REACH = 20;
export function benchOf(plan: PremisePlan, water: StageWater, heights: ArrayLike<number>): Uint8Array {
  const { W, H } = plan;
  const wet = dayOneWet(plan, water);
  const s = plan.frame.start;
  const out = new Uint8Array(W * H);
  const i0 = s.y * W + s.x;
  if (heights[i0] !== s.z || wet[i0]) return out;
  out[i0] = 1;
  const queue = [i0];
  for (let k = 0; k < queue.length; k++) {
    const i = queue[k];
    const x = i % W;
    for (const j of [i - 1, i + 1, i - W, i + W]) {
      if (j < 0 || j >= W * H || (j === i - 1 && x === 0) || (j === i + 1 && x === W - 1) || out[j] || wet[j] || heights[j] !== s.z) continue;
      // (the start's own bench, as the shared start checks read it: within `BENCH_REACH` tiles of the start)
      if (Math.max(Math.abs((j % W) - s.x), Math.abs(Math.floor(j / W) - s.y)) > BENCH_REACH) continue;
      out[j] = 1;
      queue.push(j);
    }
  }
  return out;
}

/** `bench.shore` (planning's ruling of 2026-11-12: the bench touches water on one side only, never ringed): seen
 *  from the start, the bench's edge tiles beside day 1's water lie within an arc of `BENCH_ARC` degrees (a moat or a
 *  cross of channels round it spans the whole turn), and they are `BENCH_SHORE` of its edge or less. */
const benchShore: GateLandInvariant = {
  id: "bench.shore",
  test({ plan, water, heights }) {
    const { W, H } = plan;
    const bench = benchOf(plan, water, heights);
    const wet = dayOneWet(plan, water);
    const s = plan.frame.start;
    const n4 = (i: number) => {
      const x = i % W;
      return [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, i - W, i + W].filter((j) => j >= 0 && j < W * H);
    };
    let edge = 0;
    const angles: number[] = [];
    for (let i = 0; i < W * H; i++) {
      if (!bench[i]) continue;
      const ns = n4(i);
      if (ns.length === 4 && ns.every((j) => bench[j])) continue;
      edge++;
      if (ns.some((j) => wet[j])) angles.push(atan2((Math.floor(i / W) - s.y) as number, (i % W) - s.x));
    }
    if (!edge) return fail("The start has no bench");
    if (!angles.length) return OK;
    angles.sort((p, q) => p - q);
    let gap = angles[0] + 2 * PI - angles[angles.length - 1];
    for (let k = 1; k < angles.length; k++) gap = Math.max(gap, angles[k] - angles[k - 1]);
    const arc = ((2 * PI - gap) * 180) / PI;
    if (arc > BENCH_ARC) return fail(`Seen from the start, the water round its bench spans ${Math.round(arc)}° (${BENCH_ARC}° at most: one side only)`);
    const share = angles.length / edge;
    if (share > BENCH_SHORE) return fail(`${Math.round(100 * share)} % of the start's bench's edge is shore (${100 * BENCH_SHORE} % or less)`);
    return OK;
  },
};
const BENCH_ARC = 240;
const BENCH_SHORE = 0.4;
const PI = 3.141592653589793;

/** `basin.playa` (planning's ruling of 2026-11-12: the basin is land a player can water, a broad playa): of the basin's
 *  dry ground past the range, `PLAYA_SHARE` or more stands within two levels of its pan. */
const basinPlaya: GateLandInvariant = {
  id: "basin.playa",
  test({ plan, water, heights }) {
    const g = gateOf(plan)!;
    const { zone } = gateZones(plan, g);
    const wet = dayOneWet(plan, water);
    let all = 0;
    let floor = 0;
    for (let i = 0; i < zone.length; i++) {
      if (zone[i] !== 2 || wet[i]) continue;
      all++;
      if (heights[i] <= g.pan.level + 2) floor++;
    }
    const share = all ? floor / all : 0;
    return share >= PLAYA_SHARE ? OK : fail(`${Math.round(100 * share)} % of the basin stands within two levels of its pan (${100 * PLAYA_SHARE} % or more)`);
  },
};
export const PLAYA_SHARE = 0.55;

/** `frame.lip`, its land half (§5.1, the lake stair's stage 3 `checkFrame` on this land, with no level land of its
 *  own asked: the shared gate holds the start's room): the start's 5 × 5 dry and level with a level door, the Veil's
 *  lip and foot in the first frame, the frame's water shallow. */
const frameLip: GateLandInvariant = {
  id: "frame.lip",
  test({ plan, water, heights }) {
    const f = checkFrame(plan, water, Uint8Array.from(heights), { bench: 0, moist: 0, reach: 0 });
    return f.reason ? fail(f.reason) : OK;
  },
};

/** The gate's land invariants, judged on stage 2's ground. */
/** The share of the range's ground (its band, `rangeBand`, three tiles or more from stage 1's ground and water) in flats wider than
 *  four tiles: tiles of one level whose
 *  region holds a disc of radius 2 round them, and the tiles within two of such a disc's middle. */
export function rangeFlatShare(plan: PremisePlan, water: StageWater, heights: ArrayLike<number>, mask?: Uint8Array): number {
  const { W, H } = plan;
  const N = W * H;
  const r = water.raster;
  const band = rangeBand(plan, water);
  // (the range's own ground, its band: not stage 1's, nor within three tiles of its water, whose rims and banks the
  // guard sets)
  const planned = new Uint8Array(N);
  for (let i = 0; i < N; i++) if (r.fixed[i] || r.lake[i] || r.channel[i] || r.pool[i]) planned[i] = 1;
  const near = distanceFrom(planned, W, H);
  // (and over its feet: the valley's ground at the scarp's foot, the basin's benches at the back slope's, are theirs)
  const g = gateOf(plan)!;
  const { zone } = gateZones(plan, g);
  const feet = (i: number) => (zone[i] === 0 || zone[i] === 1 ? Math.min(heights[i] - (g.sill + RANGE_LAND.foot), heights[i] - g.pan.level - SCARP.benches) : heights[i] - g.pan.level - SCARP.benches);
  const on = (i: number) => band[i] === 1 && near[i] > 3 && feet(i) > 0;
  // (each tile's distance to the edge of its one-level region, a tile at a time)
  const d = new Int32Array(N).fill(-1);
  const queue: number[] = [];
  for (let i = 0; i < N; i++) {
    if (!on(i)) continue;
    const x = i % W;
    const y = (i - x) / W;
    // (the band's own edge an edge too: the land past the range's foot is the valley's or the basin's)
    const edge = x === 0 || y === 0 || x === W - 1 || y === H - 1 || [i - 1, i + 1, i - W, i + W].some((j) => heights[j] !== heights[i] || !on(j));
    if (edge) {
      d[i] = 0;
      queue.push(i);
    }
  }
  for (let k = 0; k < queue.length; k++) {
    const i = queue[k];
    const x = i % W;
    for (const j of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, i - W, i + W]) {
      if (j < 0 || j >= N || !on(j) || d[j] >= 0 || heights[j] !== heights[i]) continue;
      d[j] = d[i] + 1;
      queue.push(j);
    }
  }
  let all = 0;
  const flat = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    if (!on(i)) continue;
    all++;
    if (d[i] < 2) continue;
    const x = i % W;
    const y = (i - x) / W;
    for (let dy = -2; dy <= 2; dy++)
      for (let dx = -2; dx <= 2; dx++) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const j = yy * W + xx;
        if (on(j) && heights[j] === heights[i]) flat[j] = 1;
      }
  }
  let n = 0;
  for (let i = 0; i < N; i++) if (flat[i]) n++;
  if (mask) mask.set(flat);
  return all ? n / all : 0;
}

/** The range's side valleys on the land: where water off its band leaves it with `RANGE_CHECK.catchment` tiles of
 *  catchment or more (a smooth flank's runs gather a flank's length each, 6 to 15) falling `RANGE_CHECK.fall` levels or
 *  more to the mouth, mouths four tiles or more apart, counted by the side they open to (0 the valley's, 2 the basin's), and each
 *  mouth's tile. */
export function rangeValleys(plan: PremisePlan, water: StageWater, heights: ArrayLike<number>): { front: number; back: number; mouths: { i: number; side: number }[] } {
  const { W, H } = plan;
  const r = water.raster;
  const { zone } = gateZones(plan);
  const d = drainage(Float64Array.from(heights), W, H, { outlet: (i) => zone[i] !== 1 || !!r.lake[i] || !!r.channel[i] || !!r.pool[i], epsilon: 1e-6 });
  // (the highest ground each tile's water comes from: a valley falls from the range's high ground, a flat's runs from
  // nowhere higher)
  const top = Float64Array.from(heights);
  for (let q = d.order.length - 1; q >= 0; q--) {
    const i = d.order[q];
    const rc = d.rcv[i];
    if (rc >= 0 && zone[i] === 1 && !r.lake[i] && !r.channel[i] && !r.pool[i] && top[i] > top[rc]) top[rc] = top[i];
  }
  const cand: { i: number; side: number; a: number }[] = [];
  for (let i = 0; i < W * H; i++) {
    const rc = d.rcv[i];
    if (zone[i] !== 1 || r.lake[i] || r.channel[i] || r.pool[i] || rc < 0 || zone[rc] === 1 || d.area[i] < RANGE_CHECK.catchment || top[i] - heights[i] < RANGE_CHECK.fall) continue;
    cand.push({ i, side: zone[rc], a: d.area[i] });
  }
  cand.sort((p, q) => q.a - p.a);
  const mouths: { i: number; side: number }[] = [];
  for (const c of cand) if (mouths.every((m) => hypot((m.i % W) - (c.i % W), Math.floor(m.i / W) - Math.floor(c.i / W)) >= 4)) mouths.push({ i: c.i, side: c.side });
  return { front: mouths.filter((m) => m.side === 0).length, back: mouths.filter((m) => m.side === 2).length, mouths };
}

/** The pieces of one level under `COLUMN.size` tiles, among the tiles `own` marks, that stand `COLUMN.over` or more over
 *  every neighbour: each as its tiles and the highest neighbour's level. */
export function rangeColumns(h: ArrayLike<number>, W: number, H: number, own: ArrayLike<number>): { tiles: number[]; to: number }[] {
  const N = W * H;
  const seen = new Uint8Array(N);
  const out: { tiles: number[]; to: number }[] = [];
  for (let s = 0; s < N; s++) {
    if (!own[s] || seen[s]) continue;
    const tiles = [s];
    seen[s] = 1;
    let around = -Infinity;
    let small = true;
    for (let k = 0; k < tiles.length; k++) {
      const i = tiles[k];
      const x = i % W;
      for (const j of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, i - W, i + W]) {
        if (j < 0 || j >= N) continue;
        if (h[j] === h[s]) {
          if (!seen[j]) {
            seen[j] = 1;
            tiles.push(j);
            if (tiles.length >= COLUMN.size) small = false;
          }
        } else around = Math.max(around, h[j]);
      }
      if (!small) break;
    }
    if (small && around > -Infinity && h[s] - around >= COLUMN.over && tiles.every((i) => own[i])) out.push({ tiles, to: around });
  }
  return out;
}
export const COLUMN = { size: 6, over: 2, clear: 2 } as const;

/** The ground `range.columns` reads and the column pass lowers: the range's band, `COLUMN.clear` tiles or more from
 *  stage 1's ground and water (whose rims and banks the guard sets). */
function columnGround(plan: PremisePlan, water: StageWater): Uint8Array {
  const r = water.raster;
  const band = rangeBand(plan, water);
  const N = plan.W * plan.H;
  const planned = new Uint8Array(N);
  for (let i = 0; i < N; i++) if (r.fixed[i] || r.lake[i] || r.channel[i] || r.pool[i] || r.crest[i]) planned[i] = 1;
  const near = distanceFrom(planned, plan.W, plan.H);
  const own = new Uint8Array(N);
  for (let i = 0; i < N; i++) own[i] = band[i] && near[i] > COLUMN.clear ? 1 : 0;
  return own;
}

/** Lowers each column (`rangeColumns`) into the land round it; whether any was. */
function lowerColumns(h: Uint8Array, W: number, H: number, own: Uint8Array): boolean {
  const cols = rangeColumns(h, W, H, own);
  for (const c of cols) for (const i of c.tiles) h[i] = c.to;
  return cols.length > 0;
}

/** `range.columns` (planning's ruling of 2026-11-14): no piece of the range's ground under six tiles stands two or more
 *  over all its neighbours. */
const rangeColumnsCheck: GateLandInvariant = {
  id: "range.columns",
  test({ plan, water, heights }) {
    const own = columnGround(plan, water);
    const cols = rangeColumns(heights, plan.W, plan.H, own);
    return cols.length ? fail(`${cols.length} column${cols.length === 1 ? "" : "s"} of the range stand two or more over the land round them (at ${cols[0].tiles[0] % plan.W}, ${Math.floor(cols[0].tiles[0] / plan.W)})`) : OK;
  },
};

/** The range's crest over the valley's floor: the median of the crest line (`crestLine`) over the median of the valley's
 *  ground. */
export function rangeHeight(plan: PremisePlan, water: StageWater, heights: ArrayLike<number>): number {
  const cl = crestLine(plan, water, heights).sort((p, q) => p - q);
  const { zone } = gateZones(plan);
  const vv: number[] = [];
  for (let i = 0; i < zone.length; i++) if (zone[i] === 0) vv.push(heights[i]);
  vv.sort((p, q) => p - q);
  return cl.length && vv.length ? cl[cl.length >> 1] - vv[vv.length >> 1] : 0;
}

/** `range.flat` (planning's ruling of 2026-11-13): at most `RANGE_CHECK.flat` of the range's ground in flats wider than
 *  four tiles. */
const rangeFlat: GateLandInvariant = {
  id: "range.flat",
  test({ plan, water, heights }) {
    const share = rangeFlatShare(plan, water, heights);
    return share <= RANGE_CHECK.flat ? OK : fail(`${Math.round(100 * share)} % of the range stands in flats wider than four tiles (${100 * RANGE_CHECK.flat} % at most)`);
  },
};

/** `range.valleys` (planning's ruling of 2026-11-13): side valleys cut by flow reach the foot on both sides, at least
 *  `RANGE_CHECK.valleys` a side per 128 tiles of the map's side. */
const rangeValleysCheck: GateLandInvariant = {
  id: "range.valleys",
  test({ plan, water, heights }) {
    const v = rangeValleys(plan, water, heights);
    const least = Math.round((RANGE_CHECK.valleys * plan.W) / 128);
    return v.front >= least && v.back >= least ? OK : fail(`The range has ${v.front} side valleys toward the valley and ${v.back} toward the basin (${least} or more each)`);
  },
};

/** The longest straight run, along a row or a column, of faces over `GORGE_FACE.levels` levels on the range and the
 *  Gate's gorge (the band, and three tiles round the gorge's channel), the Veil's own drop excepted (`GORGE_FACE.veil`
 *  tiles round its lip, its cleft and its mouth) and the Gate's head (its bar and rows, laid straight); with where. */
export function gorgeFaces(plan: PremisePlan, water: StageWater, heights: ArrayLike<number>): { run: number; at: number } {
  const g = gateOf(plan)!;
  const { W, H } = plan;
  const N = W * H;
  const r = water.raster;
  const band = rangeBand(plan, water);
  const gi = plan.links.findIndex((l) => l.id === g.gate) + 1;
  const vi = plan.links.findIndex((l) => l.id === g.veil) + 1;
  const pi = plan.bodies.findIndex((b) => b.id === g.pool) + 1;
  const gate = new Uint8Array(N);
  const veil = new Uint8Array(N);
  const barEnd = Math.max(0, ...(plan.links[gi - 1]?.rows ?? [0])) + 2;
  for (let i = 0; i < N; i++) {
    if (r.channel[i] === gi) gate[i] = 1;
    if (r.channel[i] === vi || r.lake[i] === pi || r.pool[i] === vi || r.crest[i]) veil[i] = 1;
    // (and the Gate's head, its bar and rows of Blockages, laid straight on purpose)
    if (r.channel[i] === gi && r.along[i] <= barEnd) veil[i] = 1;
  }
  const nearGate = distanceFrom(gate, W, H);
  const nearVeil = distanceFrom(veil, W, H);
  const own = (i: number) => (band[i] === 1 || nearGate[i] <= 3) && nearVeil[i] > GORGE_FACE.veil;
  const face = (i: number, j: number) => own(i) && own(j) && Math.abs(heights[i] - heights[j]) > GORGE_FACE.levels;
  let run = 0;
  let at = -1;
  // (faces between rows, run along x; faces between columns, run along y)
  for (let y = 0; y + 1 < H; y++)
    for (let x = 0, n = 0; x < W; x++) {
      n = face(y * W + x, (y + 1) * W + x) ? n + 1 : 0;
      if (n > run) [run, at] = [n, y * W + x];
    }
  for (let x = 0; x + 1 < W; x++)
    for (let y = 0, n = 0; y < H; y++) {
      n = face(y * W + x, y * W + x + 1) ? n + 1 : 0;
      if (n > run) [run, at] = [n, y * W + x];
    }
  return { run, at };
}
export const GORGE_FACE = { levels: 3, run: 6, veil: 4 } as const;
/** The run planning asks (`GORGE_FACE.run`): no face over three levels straight for more than six tiles. */
export const GATE_FACE_RUN = GORGE_FACE.run;

/** `gorge.walls` (planning's ruling of 2026-11-14): no face over three levels runs straight for more than six tiles on
 *  the range and the Gate's gorge, the Veil's drop excepted. */
const gorgeWalls: GateLandInvariant = {
  id: "gorge.walls",
  test({ plan, water, heights }) {
    const f = gorgeFaces(plan, water, heights);
    return f.run <= GORGE_FACE.run ? OK : fail(`A face over ${GORGE_FACE.levels} levels runs straight for ${f.run} tiles at ${f.at % plan.W}, ${Math.floor(f.at / plan.W)} (${GORGE_FACE.run} at most)`);
  },
};

/** `range.straight` (planning's verdict of 2026-11-14: the wall crossed the map as a ruler line): the range's foot
 *  toward the valley (`gateMeasures.ts` `wallFoot`) never runs straight for more than `RANGE_CHECK.straight` of the
 *  map's side. */
const rangeStraight: GateLandInvariant = {
  id: "range.straight",
  test({ plan, water, heights }) {
    const f = wallFoot(plan, heights, water);
    const most = RANGE_CHECK.straight * plan.W;
    return f.run <= most ? OK : fail(`The range's foot runs straight for ${Math.round(f.run)} tiles from ${f.at} along it (${most} at most: a quarter of the map's side)`);
  },
};

export const RANGE_CHECK = { flat: 0.1, valleys: 2, catchment: 25, fall: 4, straight: 0.25 } as const;

export const GATE_LAND_CHECKS: GateLandInvariant[] = [rangeCrest, rangeFlat, rangeStraight, rangeValleysCheck, rangeColumnsCheck, gateLowest, wallCamera, basinBowl, basinPlaya, benchShore, valleyEnclosed, ruled, frameLip];

/** The land invariants a gate plan's ground fails, each with its one line. */
export function gateLandFailures(ctx: GateLandContext): { id: string; reason: string }[] {
  const out: { id: string; reason: string }[] = [];
  for (const inv of GATE_LAND_CHECKS) {
    const r = inv.test(ctx);
    if (!r.ok) out.push({ id: inv.id, reason: r.reason });
  }
  return out;
}
