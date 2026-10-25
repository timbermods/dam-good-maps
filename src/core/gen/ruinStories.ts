// Ruins placed with meaning (D488 (2)): ruins that tell a story, found where the land offers it and
// never forced (D138's principles: an outcome read off the land, dropped when the land has no place
// for it, many realizations).
//
// - **A ruined dam** across the river's natural narrows: the narrows the checks' dam sites find
//   (analysis/damsites.ts, the same sites the map card and the Showcase's late-game project name), a
//   broken line of columns three or four deep from bank to bank and into the abutments, a gap where
//   the river's channel runs. Its columns rise about two levels over the crest a rebuilt dam would
//   have, the piers by the gap a level more, broken here and there.
// - **A drowned village**: a cluster of columns standing in a lake's shallows or on a flooded valley
//   floor, their tops rising out of the water, a few sunk under it.
//
// Ruins hold no water in the game (they carry no water obstacle, investigation/notes/
// navigation_ruins_entities.md; sim/model.ts reads none from them), so the river runs through the dam
// as before and D111 holds: the water is the settle the resources were planned on, unchanged. The
// game puts no check on objects in water and a beaver walks and scavenges in it, so these fields may
// stand in water (`params.story`); every other rule a ruin field keeps holds (a column on every tile
// of the field reached from its own level, fields of ten or more, nothing within the start's clear
// distance). Each field carries its story and a line in a player's words (`params.story.say`), which
// `ruinStories` reads back for the Showcase's beats. Their scrap counts toward the map's budget.

import * as portable from "../math/portable";
import type { BuildResult } from "../features/build";
import { featureId } from "../features/ids";
import type { Feature, RuinFieldFeature, RuinStory } from "../features/schema";
import { damSites } from "../analysis/damsites";
import { distanceFrom, N8, runsToTiles, tilesToRuns } from "../math/grid";
import { stream, type Rng } from "../math/rng";
import type { MapSpec } from "../spec/mapspec";
import { RUIN_HEIGHT_SHARES } from "./calibrated";
import { growBlob, punchHoles } from "./blobs";
import { lakeBeds } from "./extras";
import { compass } from "./names";

/** A column's scrap per storey (the game's yield, resources/baseline.ts `ruinColumns`). */
const SCRAP_PER_STOREY = 15;
/** The fewest columns in a piece: the checks' `ruins.fields` counts fields of ten or more. */
const PIECE = 10;
/** Water this deep, or a river's channel, is the gap: the river runs there. */
const GAP_DEPTH = 0.4;
/** A dam's narrows keep this far from the map's edge, where its story would be cut off. */
const EDGE = 8;
/** The dam and the village stand at least this far apart. */
const APART = 20;
/** The share of maps that offer a drowned village that show one. */
const VILLAGE_SHARE = 0.75;
/** A drowned village stands in water this deep (its shallows). */
const SHALLOW: readonly [number, number] = [0.3, 2.5];

export interface RuinStoriesInput {
  spec: MapSpec;
  /** The built ground (terrain, objects, the settled water), before the resources. */
  base: BuildResult;
  features: readonly Feature[];
  /** Tiles nothing of this may take (the badwater hollows, the rise's ruins and their margin). */
  keepOff: Uint8Array;
  /** The scrap the map's budget has left for them. */
  scrapLeft: number;
  /** Ruins keep this far from the start (straight tiles). */
  clear: number;
  attempt: number;
}

export interface RuinStoriesPlan {
  fields: RuinFieldFeature[];
  scrap: number;
  /** The fields' tiles and a ring round them: what the other resources keep off. */
  taken: number[];
}

/** Where a ruin field tells a story on a map: its kind, its line, and its middle. */
export interface PlacedStory extends RuinStory {
  x: number;
  y: number;
}

/** The stories a map's ruins tell (the fields with `params.story`), in the features' order: what
 *  the Showcase's mystery and late-game project beats read. */
export function ruinStories(features: readonly Feature[], W: number): PlacedStory[] {
  const out: PlacedStory[] = [];
  for (const f of features) {
    if (f.kind !== "ruinField" || !f.params.story) continue;
    const tiles = runsToTiles(f.params.area, W);
    let sx = 0;
    let sy = 0;
    for (const i of tiles) {
      sx += i % W;
      sy += Math.floor(i / W);
    }
    out.push({ ...f.params.story, x: Math.round(sx / Math.max(1, tiles.length)), y: Math.round(sy / Math.max(1, tiles.length)) });
  }
  return out;
}

export function planRuinStories(o: RuinStoriesInput): RuinStoriesPlan {
  const b = o.base;
  const out: RuinStoriesPlan = { fields: [], scrap: 0, taken: [] };
  if (!b.start || o.scrapLeft <= 0) return out;
  const { W, H } = b;
  const N = W * H;
  const startMask = new Uint8Array(N);
  for (let y = b.start.y - 1; y <= b.start.y + 1; y++) for (let x = b.start.x - 1; x <= b.start.x + 1; x++) if (x >= 0 && y >= 0 && x < W && y < H) startMask[y * W + x] = 1;
  const sd = distanceFrom(startMask, W, H);
  const used = new Uint8Array(N);
  for (let i = 0; i < N; i++) used[i] = o.keepOff[i];
  // (no more than half the map's scrap goes to its stories: the rest stays the map's own fields)
  let left = Math.floor(0.5 * o.scrapLeft);
  const ctx: Ctx = { b, W, H, N, sd, used, clear: o.clear + 4 };
  const add = (kind: RuinStory["kind"], plan: StoryPlan | null) => {
    if (!plan || plan.scrap > left) return;
    const role = `ruinField/story/${kind}`;
    const id = featureId(o.spec.seed, "ruinField", role);
    // the storeys in the area's tile order (index order)
    const order = plan.tiles.map((t, k) => [t, plan.storeys[k]] as const).sort((a, c) => a[0] - c[0]);
    out.fields.push({
      id,
      kind: "ruinField",
      origin: "generated",
      role,
      locked: false,
      params: {
        area: tilesToRuns(plan.tiles, W),
        scrapTarget: plan.scrap,
        heightMix: [...RUIN_HEIGHT_SHARES],
        centerBias: 0,
        layout: { tallness: 0 },
        storeys: order.map(([, s]) => s),
        story: { kind, say: plan.say },
      },
    });
    out.scrap += plan.scrap;
    left -= plan.scrap;
    // (the field and a ring of two: other resources and the next story keep off it)
    for (const i of plan.tiles) {
      const x = i % W;
      const y = (i - x) / W;
      for (let dy = -2; dy <= 2; dy++)
        for (let dx = -2; dx <= 2; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
          const j = yy * W + xx;
          if (!used[j]) out.taken.push(j);
          used[j] = 1;
        }
    }
  };
  add("dam", ruinedDam(ctx, stream(o.spec.seed, "ruin-story", "dam", o.attempt)));
  // (a village stands apart from the dam: two stories, not one muddle)
  for (const f of out.fields)
    for (const i of runsToTiles(f.params.area, W)) {
      const x = i % W;
      const y = (i - x) / W;
      for (let dy = -APART; dy <= APART; dy++)
        for (let dx = -APART; dx <= APART; dx++) if (x + dx >= 0 && y + dy >= 0 && x + dx < W && y + dy < H && dx * dx + dy * dy <= APART * APART) used[(y + dy) * W + x + dx] = 1;
    }
  // (a village on three maps in four where the land offers one: a lake basin's maps don't all tell it)
  const vr = stream(o.spec.seed, "ruin-story", "village", o.attempt);
  if (vr.float() < VILLAGE_SHARE) add("village", drownedVillage(ctx, o.features, vr, o.spec.theme === "islands"));
  return out;
}

interface Ctx {
  b: BuildResult;
  W: number;
  H: number;
  N: number;
  /** Straight distance from the start's 3×3. */
  sd: Float64Array;
  /** Tiles taken or kept off. */
  used: Uint8Array;
  /** Ruins keep this far from the start. */
  clear: number;
}

interface StoryPlan {
  tiles: number[];
  storeys: number[];
  scrap: number;
  say: string;
}

/** Whether a column may stand on tile i: on the map, free, off a river's channel, off badwater, out
 *  of the start's clear distance. */
function standable(c: Ctx, i: number): boolean {
  const { b } = c;
  return !c.used[i] && !b.occupied[i] && !b.channel[i] && !(b.water[i] > 0 && b.contamination[i] >= 0.05) && c.sd[i] >= c.clear;
}

/** Whether a beaver can scavenge tile i's column: a free tile of the same level beside it (the
 *  checks' `ruins.access`; ruins do not block walking, and water never does). */
function reachable(c: Ctx, i: number): boolean {
  const { W, H, b } = c;
  const x = i % W;
  const y = (i - x) / W;
  for (const [dx, dy] of N8) {
    const xx = x + dx;
    const yy = y + dy;
    if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
    const j = yy * W + xx;
    if (b.heights[j] === b.heights[i] && !b.occupied[j]) return true;
  }
  return false;
}

/** The tiles' 8-connected pieces of PIECE or more (smaller ones are left out: the checks count
 *  columns in fields of ten or more). */
function pieces(tiles: readonly number[], W: number): number[][] {
  const set = new Set(tiles);
  const seen = new Set<number>();
  const out: number[][] = [];
  for (const s of tiles) {
    if (seen.has(s)) continue;
    const q = [s];
    seen.add(s);
    for (let k = 0; k < q.length; k++) {
      const x = q[k] % W;
      for (const [dx, dy] of N8) {
        if (x + dx < 0 || x + dx >= W) continue;
        const j = q[k] + dx + dy * W;
        if (set.has(j) && !seen.has(j)) {
          seen.add(j);
          q.push(j);
        }
      }
    }
    if (q.length >= PIECE) out.push(q);
  }
  return out;
}

function scrapOf(storeys: readonly number[]): number {
  let s = 0;
  for (const v of storeys) s += SCRAP_PER_STOREY * v;
  return s;
}

const clampStorey = (v: number) => Math.max(1, Math.min(8, Math.round(v)));

/** Thousands with a comma, to the hundred ("1,200"). */
function hundreds(v: number): string {
  return String(Math.round(v / 100) * 100).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function ruinedDam(c: Ctx, rng: Rng): StoryPlan | null {
  const { b, W, H, N } = c;
  const h = b.heights;
  const d = b.water;
  const clean = new Uint8Array(N);
  const surface = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    // (the river's narrows: clean water in its channels, where the sites are sampled)
    clean[i] = b.channel[i] && d[i] > 0.05 && b.contamination[i] < 0.05 ? 1 : 0;
    surface[i] = h[i] + d[i];
  }
  // the natural narrows: dam sites of 16 tiles or fewer out of the start's clear distance whose
  // reservoir is worth rebuilding them for (600 water at 128², by area), the more they would hold
  // and the shorter the better
  const worth = (600 * N) / 16384;
  const sites = damSites(h, clean, surface, W, H, null)
    .filter((s) => s.length <= 16 && s.volume >= worth && c.sd[s.y * W + s.x] >= c.clear + 4 && Math.min(s.x, s.y, W - 1 - s.x, H - 1 - s.y) >= EDGE)
    .map((s) => ({ s, score: s.volume / (1 + 0.15 * Math.max(0, s.length - 8)) }))
    .sort((a, z) => z.score - a.score || a.s.y * W + a.s.x - (z.s.y * W + z.s.x));
  for (const { s } of sites.slice(0, 8)) {
    const [dy, dx] = s.dir;
    const cIdx = s.y * W + s.x;
    const crest = h[cIdx] + s.height;
    // the dam's line, end to end (as the dam-site kernel draws it: on until the ground reaches the
    // crest on each side), and one more tile into each bank where the ground stands at the crest
    const line: [number, number][] = [[s.x, s.y]];
    let ok = true;
    for (const sgn of [-1, 1]) {
      for (let k = 1; ; k++) {
        const x = s.x + sgn * k * dx;
        const y = s.y + sgn * k * dy;
        if (x < 0 || y < 0 || x >= W || y >= H || k > 10) {
          ok = false;
          break;
        }
        if (h[y * W + x] >= crest) {
          // (and on into the bank while its ground stands at the crest or a level over: the dam's
          // abutments, where its ruins stand longest)
          for (let e = 0; e < 5; e++) {
            const ex = s.x + sgn * (k + e) * dx;
            const ey = s.y + sgn * (k + e) * dy;
            if (ex < 0 || ey < 0 || ex >= W || ey >= H || h[ey * W + ex] > crest + 1) break;
            if (sgn < 0) line.unshift([ex, ey]);
            else line.push([ex, ey]);
          }
          break;
        }
        if (sgn < 0) line.unshift([x, y]);
        else line.push([x, y]);
      }
      if (!ok) break;
    }
    if (!ok) continue;
    const gapAt = line.map(([x, y]) => b.channel[y * W + x] === 1 || d[y * W + x] >= GAP_DEPTH);
    const first = gapAt.indexOf(true);
    const last = gapAt.lastIndexOf(true);
    // (it crosses the river: banks on both sides of the gap)
    if (first < 1 || last > line.length - 2) continue;
    // three or four deep, as a dam's base is: the line, a row on each side of it, and a ragged fourth
    // behind
    const [px, py] = [-dy, dx];
    const back = rng.float() < 0.5 ? 1 : -1;
    const cand: { i: number; k: number; row: number }[] = [];
    const seen = new Set<number>();
    line.forEach(([x, y], k) => {
      if (k >= first && k <= last) return;
      for (const row of [0, back, -back, 2 * back]) {
        if (row === 2 * back && rng.float() > 0.4) continue;
        const xx = x + row * px;
        const yy = y + row * py;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const i = yy * W + xx;
        if (seen.has(i) || h[i] > crest + 1 || d[i] >= GAP_DEPTH || !standable(c, i) || !reachable(c, i)) continue;
        seen.add(i);
        cand.push({ i, k, row });
      }
    });
    // broken here and there
    const breaks = 0.1 + 0.1 * rng.float();
    const kept = cand.filter(() => rng.float() >= breaks);
    const ps = pieces(
      kept.map((t) => t.i),
      W,
    );
    const inPiece = new Set(ps.flat());
    const final = kept.filter((t) => inPiece.has(t.i));
    if (!final.some((t) => t.k < first) || !final.some((t) => t.k > last)) continue;
    // a column rises about two levels over the crest, the piers either side of the gap a level more,
    // less where it broke, a stump where it fell
    const storeys = final.map((t) => {
      if (rng.float() < 0.12) return 1;
      const jitter = [0, 0, 0, -1, -1, -2, 1][rng.int(0, 7)];
      const pier = t.k === first - 1 || t.k === last + 1 ? 1 : 0;
      const s0 = crest + 2 + pier - h[t.i] + jitter;
      return clampStorey(t.row === 2 * back ? s0 / 2 : s0);
    });
    const dist = Math.round(portable.sqrt((s.x - b.start!.x) * (s.x - b.start!.x) + (s.y - b.start!.y) * (s.y - b.start!.y)));
    return {
      tiles: final.map((t) => t.i),
      storeys,
      scrap: scrapOf(storeys),
      say: `A ruined dam lies across the narrows ${dist} tiles ${compass(b.start!.x, b.start!.y, s.x, s.y)} of the start, the river running through its gap: rebuilt, it would hold ${hundreds(s.volume)} water.`,
    };
  }
  return null;
}

function drownedVillage(c: Ctx, features: readonly Feature[], rng: Rng, sea: boolean): StoryPlan | null {
  const { b, W, H, N } = c;
  const d = b.water;
  const shallow = new Uint8Array(N);
  for (let i = 0; i < N; i++) shallow[i] = d[i] >= SHALLOW[0] && d[i] <= SHALLOW[1] && standable(c, i) ? 1 : 0;
  // the shallows' 4-connected stretches of 30 tiles or more
  const label = new Int32Array(N).fill(-1);
  const regions: number[][] = [];
  for (let s = 0; s < N; s++) {
    if (!shallow[s] || label[s] >= 0) continue;
    const q = [s];
    label[s] = regions.length;
    for (let k = 0; k < q.length; k++) {
      const i = q[k];
      const x = i % W;
      for (const j of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, i - W, i + W]) {
        if (j < 0 || j >= N || !shallow[j] || label[j] >= 0) continue;
        label[j] = regions.length;
        q.push(j);
      }
    }
    regions.push(q);
  }
  const big = regions.filter((r) => r.length >= 30);
  if (!big.length) return null;
  const lakes = lakeBeds(features, b.heights, W, H);
  for (let tries = 0; tries < 3 && big.length; tries++) {
    const region = big.splice(rng.weighted(big.map((r) => portable.sqrt(r.length))), 1)[0];
    const allowed = new Uint8Array(N);
    for (const i of region) allowed[i] = 1;
    // its heart: the tile with the most shallows round it
    let seed = region[0];
    let most = -1;
    for (const i of region) {
      const x = i % W;
      const y = (i - x) / W;
      let n = 0;
      for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) if (x + dx >= 0 && y + dy >= 0 && x + dx < W && y + dy < H && allowed[(y + dy) * W + x + dx]) n++;
      if (n > most) {
        most = n;
        seed = i;
      }
    }
    const want = Math.min(Math.floor(0.6 * region.length), 14 + rng.int(0, 15));
    let tiles = growBlob(rng, allowed, W, H, seed, Math.floor(want / 0.88), 1.5);
    tiles = punchHoles(rng, tiles, W, 0.12).filter((i) => reachable(c, i));
    tiles = pieces(tiles, W).flat();
    if (tiles.length < 12) continue;
    // their tops rise out of the water, a few sunk under it
    const storeys = tiles.map((i) => (rng.float() < 0.15 ? clampStorey(Math.floor(d[i])) : clampStorey(Math.ceil(d[i]) + 1 + rng.int(0, 3))));
    let sx = 0;
    let sy = 0;
    let inLake = 0;
    for (const i of tiles) {
      sx += i % W;
      sy += Math.floor(i / W);
      if (lakes[i]) inLake++;
    }
    const mx = Math.round(sx / tiles.length);
    const my = Math.round(sy / tiles.length);
    const dist = Math.round(portable.sqrt((mx - b.start!.x) * (mx - b.start!.x) + (my - b.start!.y) * (my - b.start!.y)));
    const where = 2 * inLake >= tiles.length ? "in a lake's shallows" : sea ? "in the shallows off the shore" : "on the flooded valley floor";
    return {
      tiles,
      storeys,
      scrap: scrapOf(storeys),
      say: `A drowned village stands ${where} ${dist} tiles ${compass(b.start!.x, b.start!.y, mx, my)} of the start, its ruins rising out of the water.`,
    };
  }
  return null;
}
