// A map's water as it opens against the water its sources keep (planning's rule for Real places, #236: a place opens
// with the water its sources keep; nothing shown that the first edit, or the game's first days, takes away). A map
// opens showing its file's own water; the first edit anywhere settles the whole map again from the file's water model
// by the game's rules, which is what settling that model with no edit gives. This compares the two: wet tiles, each
// body of water of `BODY` tiles or more kept or lost, and the start's checks on each water.
// Used by tools/places-water.ts (the measure over the places and generated maps).

import type { TimberFile } from "../../src/core/format/timber";
import { canonicalRun, type CanonicalWater } from "../../src/core/sim/prefill";
import { worldWaterModel } from "../../src/core/sim/stackWater";
import type { WaterModel } from "../../src/core/sim/water";
import { validateMap } from "../../src/core/validate/checks";
import type { CheckResult } from "../../src/core/validate/report";

/** A tile is wet above this depth (the trial's measure, and the editor's wet count). */
export const WET = 0.05;
/** A body of water this big or bigger counts (planning's 30 tiles). */
export const BODY = 30;
/** A body is lost when less than this share of its tiles stays wet. */
export const KEPT_SHARE = 0.5;

export const wetCount = (d: ArrayLike<number>): number => {
  let n = 0;
  for (let i = 0; i < d.length; i++) if (d[i] > WET) n++;
  return n;
};

/** The bodies of `BODY` wet tiles or more (4-neighbour), each as its tiles. */
export function bodies(d: ArrayLike<number>, W: number, H: number): Int32Array[] {
  const seen = new Uint8Array(W * H);
  const q = new Int32Array(W * H);
  const out: Int32Array[] = [];
  for (let s = 0; s < W * H; s++) {
    if (seen[s] || !(d[s] > WET)) continue;
    seen[s] = 1;
    q[0] = s;
    let tail = 1;
    for (let h = 0; h < tail; h++) {
      const c = q[h];
      const x = c % W;
      const y = (c - x) / W;
      const near = [x > 0 ? c - 1 : -1, x < W - 1 ? c + 1 : -1, y > 0 ? c - W : -1, y < H - 1 ? c + W : -1];
      for (const n of near) if (n >= 0 && !seen[n] && d[n] > WET) (seen[n] = 1), (q[tail++] = n);
    }
    if (tail >= BODY) out.push(q.slice(0, tail));
  }
  return out;
}

export interface WaterCompare {
  wetOpened: number;
  wetSettled: number;
  /** (settled − opened) / opened, or 0 when the map opens dry. */
  change: number;
  bodies: number;
  /** The bodies lost: their size and the tiles still wet. */
  lost: { size: number; wet: number; at: [number, number] }[];
}

export function compareWater(opened: ArrayLike<number>, settled: ArrayLike<number>, W: number, H: number): WaterCompare {
  const wetOpened = wetCount(opened);
  const wetSettled = wetCount(settled);
  const bs = bodies(opened, W, H);
  const lost: WaterCompare["lost"] = [];
  for (const b of bs) {
    let wet = 0;
    for (const i of b) if (settled[i] > WET) wet++;
    if (wet < KEPT_SHARE * b.length) lost.push({ size: b.length, wet, at: [b[0] % W, Math.floor(b[0] / W)] });
  }
  return { wetOpened, wetSettled, change: wetOpened ? (wetSettled - wetOpened) / wetOpened : 0, bodies: bs.length, lost };
}

/** A film (D(new), planning's rule on #236: a place's water runs in a bed to an exit or stands in a basin its feed
 *  holds; no films, no sheets): a body of water of `FILM_TILES` tiles or more, `FILM_DEPTH` deep or less on every tile,
 *  of which less than `FILM_BED_SHARE` lies in a bed. Named so one ruling moves them. */
export const FILM_TILES = 100;
export const FILM_DEPTH = 0.11;
export const FILM_BED_SHARE = 0.5;

/** Whether tile i's water lies in a bed: the ground rises on both sides across it (west and east, or south and north;
 *  the map's edge counts as neither). */
export function inBed(floor: ArrayLike<number>, W: number, H: number, i: number): boolean {
  const x = i % W;
  const y = (i - x) / W;
  const f = floor[i];
  const ew = x > 0 && x < W - 1 && floor[i - 1] > f && floor[i + 1] > f;
  const ns = y > 0 && y < H - 1 && floor[i - W] > f && floor[i + W] > f;
  return ew || ns;
}

export interface Film {
  tiles: Int32Array;
  at: [number, number];
  /** Of its tiles, those on floor 0 (a sheet the map's edge holds, D303). */
  floor0: number;
}

/** The films of a settled water (`FILM_*`), each as its tiles. */
export function films(depth: ArrayLike<number>, floor: ArrayLike<number>, W: number, H: number): Film[] {
  const out: Film[] = [];
  for (const b of bodies(depth, W, H)) {
    if (b.length < FILM_TILES) continue;
    let bed = 0;
    let thin = true;
    let floor0 = 0;
    for (const i of b) {
      if (depth[i] > FILM_DEPTH) {
        thin = false;
        break;
      }
      if (inBed(floor, W, H, i)) bed++;
      if (floor[i] === 0) floor0++;
    }
    if (thin && bed < FILM_BED_SHARE * b.length) out.push({ tiles: b, at: [b[0] % W, Math.floor(b[0] / W)], floor0 });
  }
  return out;
}

/** The file's water model settled with no edit, as the editor settles it after the first edit (the game's rules). */
export function settleFile(file: TimberFile): { model: WaterModel; water: CanonicalWater } {
  const model = worldWaterModel(file.world);
  const run = canonicalRun(model, {});
  let w = run.advance(Infinity);
  while (!w) w = run.advance(Infinity);
  return { model, water: w };
}

const counts = (c: CheckResult) => !c.ok && !c.advisory && c.applicable !== false && !c.approximate;

/** The start's checks (`start.*`) the map fails on the given water, by the generate profile (the places' faults'). */
export function startFails(file: TimberFile, model: WaterModel, water: CanonicalWater): string[] {
  const v = validateMap(file, { profile: "generate", designedFor: "normal", features: [], water: { model, settled: water } });
  return v.report.checks.filter((c) => c.id.startsWith("start.") && counts(c)).map((c) => c.id);
}
