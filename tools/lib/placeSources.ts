// Sources only at heads (D171, `water.source_in_flow`): the mend for the Real places. The survey's
// inflows lay sources where a river already runs; a source another source's water comes down to is
// removed and its strength given to the upstream source whose flow reaches it, the same water entering
// at the head instead. Objects only, never the land (D331): the map's heights are not read or changed.
//
// After the water settle the check's in-flow list is read (`sourcesInFlow`, src/core/analysis/sources.ts).
// A flagged source is merged only when all three hold (planning's ruling on the mend, #236):
//  1. it is not the downstream member of a row of sources along a map edge (`rowMember`: a row stays until the
//     check reads a connected row as one source);
//  2. an unflagged source whose water reaches it stands within HEAD_REACH tiles;
//  3. the settled depth on the water tiles below it stays within DEPTH_MARGIN of what it was.
// Every other flagged source stays exactly as it is, so a place leaves the faults only when none is left.

import { sourcesInFlow } from "../../src/core/analysis/sources";
import { maxStrength } from "../../src/core/data/parity";
import { spillLevels } from "../../src/core/sim/prefill";
import { buildPlace, decodeHeights, placeEntities, type PlaceData } from "../../src/core/places/place";
import type { MapObject } from "../../src/core/sim/model";
import type { EntitySpec } from "../../src/core/format/entities";

/** The most a water source gives (the game's 8 a second per emitting tile, one tile: src/core/data/parity.ts
 *  `maxStrength`, from parity-values.json `maxStrengthPerTile`). */
export const SOURCE_MAX = maxStrength("WaterSource");
/** How far upstream (tiles, either axis) the source that takes a merged strength stands: planning's ruling on the mend. */
export const HEAD_REACH = 20;
/** The most the settled depth below a merged source may change (tiles of water): planning's ruling on the mend. */
export const DEPTH_MARGIN = 0.25;
/** A row: a flagged source and a source reaching it both within ROW_EDGE tiles of the same map edge and within ROW_REACH
 *  tiles of each other, with water on every tile between (the survey's inflows laid across a river's width). */
export const ROW_EDGE = 4;
export const ROW_REACH = 8;

export interface Flagged {
  /** Index into `place.sources`. */
  index: number;
  /** The upstream sources (indices into `place.sources`) whose water reaches it. */
  by: number[];
}

export interface Merge {
  from: [number, number, number];
  to: [number, number, number];
  /** The depth change below the removed source: the largest, over the water tiles below it. */
  change: number;
}

export interface Left {
  at: [number, number];
  why: string;
}

export interface Mend {
  place: PlaceData;
  merges: Merge[];
  /** Flagged sources left as they are, with why. */
  left: Left[];
  /** The target sources' strengths after the merges: [x, y, before, after]. */
  targets: [number, number, number, number][];
}

const mapObject = (e: EntitySpec): MapObject => ({ template: e.template, x: e.x, y: e.y, z: e.z, orientation: e.orientation, flipped: e.flipped, components: { ...(e.before ?? {}), ...e.components } });

/** The place's sources that stand in another's flow, on its own settled water. */
export function flaggedSources(place: PlaceData) {
  const built = buildPlace(place);
  const objects = placeEntities(place, decodeHeights(place.heights)).map(mapObject);
  const r = sourcesInFlow(built.model, objects, built.settle.depth);
  const n = place.sources.length;
  const flagged: Flagged[] = r.inFlow.map((o, k) => ({ index: o, by: [...new Set((r.reachedBy?.[k] ?? []).filter((q) => q < n))] })).filter((f) => f.index < n);
  return { built, flagged };
}

const cheb = (a: readonly number[], b: readonly number[]) => Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]));

/** Whether source `s` is the downstream member of a row with one of the sources `by` (see ROW_EDGE). */
export function rowMember(place: PlaceData, depth: ArrayLike<number>, s: readonly number[], by: readonly number[]): boolean {
  const W = place.W;
  const edge = (p: readonly number[]) => [p[0] < ROW_EDGE ? "W" : "", p[0] >= W - ROW_EDGE ? "E" : "", p[1] < ROW_EDGE ? "N" : "", p[1] >= W - ROW_EDGE ? "S" : ""].filter(Boolean);
  for (const b of by) {
    const h = place.sources[b];
    const d = cheb(s, h);
    if (!edge(s).some((e) => edge(h).includes(e)) || d > ROW_REACH) continue;
    let wet = true;
    for (let t = 0; t <= d; t++) {
      const x = Math.round(s[0] + ((h[0] - s[0]) * t) / d);
      const y = Math.round(s[1] + ((h[1] - s[1]) * t) / d);
      if (!(depth[y * W + x] > 0)) wet = false;
    }
    if (wet) return true;
  }
  return false;
}

/** The water tiles below a point: where water from it runs down over water (either settle), by the spill levels.
 *  A superset of the check's own reach (a flat is counted both ways). */
function tilesBelow(place: PlaceData, spill: ArrayLike<number>, from: readonly number[], before: ArrayLike<number>, after: ArrayLike<number>): number[] {
  const { W, H } = place;
  const seen = new Uint8Array(W * H);
  const q = [from[1] * W + from[0]];
  seen[q[0]] = 1;
  for (let h = 0; h < q.length; h++) {
    const c = q[h];
    const x = c % W;
    const y = (c - x) / W;
    for (const [dx, dy] of [[0, -1], [-1, 0], [0, 1], [1, 0]]) {
      const xx = x + dx;
      const yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
      const n = yy * W + xx;
      if (seen[n] || !(before[n] > 0 || after[n] > 0) || spill[n] > spill[c]) continue;
      seen[n] = 1;
      q.push(n);
    }
  }
  return q;
}

const round6 = (v: number) => Math.round(v * 1e6) / 1e6;

/** `place` with each source of `moves` ([from, to] indices) removed and its strength added to the target's. */
function merged(place: PlaceData, moves: [number, number][]): PlaceData {
  const gone = new Set(moves.map(([f]) => f));
  const add = new Map<number, number>();
  for (const [f, t] of moves) add.set(t, (add.get(t) ?? 0) + place.sources[f][2]);
  return { ...place, sources: place.sources.flatMap((s, i): [number, number, number][] => (gone.has(i) ? [] : [[s[0], s[1], round6(s[2] + (add.get(i) ?? 0))]])) };
}

/** The largest change in settled depth below the removed source `from` between two settles. */
function changeBelow(place: PlaceData, spill: ArrayLike<number>, from: readonly number[], before: ArrayLike<number>, after: ArrayLike<number>): number {
  let worst = 0;
  for (const c of tilesBelow(place, spill, from, before, after)) worst = Math.max(worst, Math.abs(after[c] - before[c]));
  return worst;
}

/** Mend the place's sources by the three rules above. Each candidate is tried alone first (settled, the depth below it
 *  measured), then the accepted ones together; a candidate that fails together is dropped and the rest tried again. */
export function mendSources(place: PlaceData): Mend {
  const first = flaggedSources(place);
  const before = first.built.settle.depth;
  const spill = spillLevels(first.built.model);
  const flaggedIdx = new Set(first.flagged.map((f) => f.index));
  const left: Left[] = [];
  const cand: { f: Flagged; to: number }[] = [];
  const at = (i: number): [number, number] => [place.sources[i][0], place.sources[i][1]];
  for (const f of first.flagged) {
    const s = place.sources[f.index];
    if (rowMember(place, before, s, f.by)) {
      left.push({ at: at(f.index), why: "downstream member of a row" });
      continue;
    }
    const heads = f.by.filter((q) => !flaggedIdx.has(q) && cheb(place.sources[q], s) <= HEAD_REACH);
    if (!heads.length) {
      left.push({ at: at(f.index), why: f.by.some((q) => !flaggedIdx.has(q)) ? `no head within ${HEAD_REACH} tiles` : "no unflagged source upstream" });
      continue;
    }
    const to = heads.reduce((a, b) => (cheb(place.sources[a], s) <= cheb(place.sources[b], s) ? a : b));
    cand.push({ f, to });
  }
  const accepted: { f: Flagged; to: number; change: number }[] = [];
  for (const c of cand) {
    const s = place.sources[c.f.index];
    if (place.sources[c.to][2] + s[2] > SOURCE_MAX + 1e-9) {
      left.push({ at: at(c.f.index), why: `merged strength would pass the game's ${SOURCE_MAX}` });
      continue;
    }
    const after = buildPlace(merged(place, [[c.f.index, c.to]])).settle.depth;
    const change = changeBelow(place, spill, s, before, after);
    if (change > DEPTH_MARGIN) left.push({ at: at(c.f.index), why: `the depth below would change by ${change.toFixed(2)}` });
    else accepted.push({ ...c, change });
  }
  // together: each accepted source's change below it, on the settle of them all
  let set = accepted;
  for (;;) {
    if (!set.length) return { place, merges: [], left, targets: [] };
    const out = merged(place, set.map((c): [number, number] => [c.f.index, c.to]));
    const built = buildPlace(out);
    const worse = set.filter((c) => changeBelow(place, spill, place.sources[c.f.index], before, built.settle.depth) > DEPTH_MARGIN);
    if (worse.length) {
      const drop = worse.reduce((a, b) => (a.change >= b.change ? a : b));
      left.push({ at: at(drop.f.index), why: "the depth below would change too far with the others merged" });
      set = set.filter((c) => c !== drop);
      continue;
    }
    // (the sources that stand in flow afterwards must be ones that stood there before)
    const now = flaggedSources(out).flagged.map((f) => out.sources[f.index]);
    const stays = new Set(left.map((l) => `${l.at[0]},${l.at[1]}`));
    const fresh = now.filter((s) => !stays.has(`${s[0]},${s[1]}`));
    if (fresh.length) {
      // a merge that puts another source in a flow is not one: drop the candidate whose head is nearest the fresh one
      const f = fresh[0];
      const drop = set.reduce((a, b) => (cheb(place.sources[a.to], f) <= cheb(place.sources[b.to], f) ? a : b));
      left.push({ at: at(drop.f.index), why: "merging it puts another source in a flow" });
      set = set.filter((c) => c !== drop);
      continue;
    }
    const targets = new Map<number, [number, number, number, number]>();
    for (const c of set) {
      const t = targets.get(c.to) ?? [place.sources[c.to][0], place.sources[c.to][1], place.sources[c.to][2], place.sources[c.to][2]];
      t[3] = round6(t[3] + place.sources[c.f.index][2]);
      targets.set(c.to, t);
    }
    return { place: out, merges: set.map((c) => ({ from: place.sources[c.f.index], to: place.sources[c.to], change: c.change })), left, targets: [...targets.values()] };
  }
}
