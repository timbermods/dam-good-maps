// The 1.0 map objects a generated map carries (PLAN §5.4–5.5, §7.7 step 5): mine sites
// (UndergroundRuins), relics, geothermal fields, thorn belts and, when the Advanced setting asks,
// unstable cores. Every theme's planner places them on its built ground, after the water settled
// and before the resources: on flat dry ground outside flood reach, each in its distance band from
// the start (validate/playability.ts `extras.placement` proves both), with a ring of level ground
// round it so a beaver can reach it (a mine's entrance, a relic's demolition, a field's engine).
//
// Thorn belts are the "thorn-barred valley" of PLAN §9.4: a blotchy belt across the way from the
// start to a relic or a geothermal field, never within 20 tiles of the start.
//
// Every map has at least one mine site (Kyler, 2026-09-25): they are placed first, by the rule the
// resource baseline shares with Real places (resources/baseline.ts `pickMineSite`): flat, dry 5×5
// ground with a level ring, away from water, in their band from the start (a third of the band
// beyond its start where there is room), on ground the colony walks to when there is any there.

import type { BuildResult } from "../features/build";
import { featureId } from "../features/ids";
import { footprintAt, fitProblems, OBJECT_NAMES, rotatedSize } from "../features/objects";
import type { Feature, MapObjectFeature, MapObjectKind } from "../features/schema";
import { polygonMask } from "../features/geometry";
import { FOOTPRINTS, ORIENTATIONS, slopeHighSide as slopeHighSideOf, type Orientation } from "../format/footprints";
import { landRegions, walkRegions } from "../analysis/regions";
import { distanceFrom, levelRegions, tilesToRuns } from "../math/grid";
import { DISTRICT_LAND, DISTRICT_RADIUS, DISTRICT_WATER } from "../features/setpieces/secondDistrict";
import { stream, type Rng } from "../math/rng";
import type { MapSpec } from "../spec/mapspec";
import { bandScale, EXTRA_BANDS, FLOOD_MARGIN, MINE_LO, minesWanted, WALK_BLOCKERS, WET } from "../validate/playability";
import { pickMineSite } from "../resources/baseline";
import { entityTiles } from "../features/edits";

export interface ExtrasInput {
  spec: MapSpec;
  /** The built ground: terrain, slopes, sources and the settled water (build step 10). */
  base: BuildResult;
  /** The planned features so far (reservoir sites, set pieces). */
  features: readonly Feature[];
  /** Tiles no object may take: the player's features, locks and keep-out regions (regeneration). */
  protect?: Uint8Array | null;
  /** More tiles to keep off (a dam site's band, badwater basins). */
  avoid?: Uint8Array | null;
  candidate: number;
  attempt: number;
  /** M9b: the first medium or large relic tries ground the start cannot walk to (D274). */
  relicHigh?: boolean;
}

/** How many of each object the settings ask for on this map (PLAN §5.4–5.5). */
export function extraCounts(spec: MapSpec, rng: Rng): Partial<Record<MapObjectKind, number>> {
  const s = spec.settings;
  const area = spec.size.x * spec.size.y;
  const out: Partial<Record<MapObjectKind, number>> = {};
  // at least two on every map (item 47); old share links with 0 or 1 decode to 2
  out.mineSite = Math.max(2, Math.min(4, s.resources.mineSites));
  if (s.resources.geothermal === "some") out.geothermal = 1 + (area >= 128 * 128 ? 1 : 0) + (area >= 192 * 192 ? 1 : 0);
  if (s.resources.relics === "some") {
    out.relicSmall = 1 + rng.int(0, 3);
    out.relicMedium = (area >= 128 * 128 ? 1 : 0) + rng.int(0, 2);
    out.relicLarge = area >= 192 * 192 ? 1 : 0;
  }
  if (s.hazards.thornBelts === "some") out.thornBelt = 1 + rng.int(0, 3);
  if (s.hazards.unstableCores === "on") out.unstableCore = 1 + rng.int(0, 4);
  return out;
}

/** The lakes' beds: the tiles inside a lake's outline under its sill, which no object takes. Land
 *  inside the outline at the sill or above, an island or its shore, is land like any other (D369 (2):
 *  it may hold a mine site or another object, every placement rule holding there; its water's margin
 *  is kept off as every water's is). */
export function lakeBeds(features: readonly Feature[], heights: ArrayLike<number>, W: number, H: number): Uint8Array {
  const N = W * H;
  const out = new Uint8Array(N);
  for (const f of features) {
    if (f.kind !== "lake") continue;
    const m = polygonMask(f.params.outline, W, H);
    const level = f.params.outlet.sill;
    for (let i = 0; i < N; i++) if (m[i] && heights[i] < level) out[i] = 1;
  }
  return out;
}

/** Placing order: the biggest footprints first, so they find room. */
const ORDER: MapObjectKind[] = ["mineSite", "relicLarge", "geothermal", "relicMedium", "relicSmall", "unstableCore"];

export function planExtras(inp: ExtrasInput): MapObjectFeature[] {
  const { spec, base: b } = inp;
  const { W, H } = b;
  const N = W * H;
  const seed = spec.seed;
  const rng = stream(seed, "objects", inp.candidate, inp.attempt);
  const counts = extraCounts(spec, rng);
  const out: MapObjectFeature[] = [];
  if (!b.start) return out;
  const sx = b.start.x;
  const sy = b.start.y;
  const startMask = new Uint8Array(N);
  for (let y = sy - 1; y <= sy + 1; y++) for (let x = sx - 1; x <= sx + 1; x++) if (x >= 0 && y >= 0 && x < W && y < H) startMask[y * W + x] = 1;
  const sd = distanceFrom(startMask, W, H);
  const h = b.heights;

  // tiles an object may not take: other objects and the start's zone (build.occupied), rivers, the
  // flood reach (water within the margin + 1, reservoir sites), the protected set-piece tiles, the
  // player's tiles and the map's border
  const blocked = new Uint8Array(N);
  const margin = FLOOD_MARGIN + 1;
  for (let i = 0; i < N; i++) {
    const x = i % W;
    const y = (i - x) / W;
    if (b.occupied[i] || b.channel[i] || b.cache.terrain.protect[i] || inp.protect?.[i] || inp.avoid?.[i] || x < 2 || y < 2 || x > W - 3 || y > H - 3) blocked[i] = 1;
    if (b.water[i] > WET)
      for (let dy = -margin; dy <= margin; dy++)
        for (let dx = -margin; dx <= margin; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx >= 0 && yy >= 0 && xx < W && yy < H) blocked[yy * W + xx] = 1;
        }
  }
  const beds = lakeBeds(inp.features, h, W, H);
  for (let i = 0; i < N; i++) if (beds[i]) blocked[i] = 1;
  // start's zone and a margin: nothing of this within 8 tiles
  for (let i = 0; i < N; i++) if (sd[i] < 8) blocked[i] = 1;

  const scale = bandScale(W, H);
  const id = (kind: MapObjectKind, k: number) => {
    const role = `mapObject/${kind}/${k}`;
    return { id: featureId(seed, "mapObject", role), role };
  };

  // the largest square of level, free tiles with its south-west corner at each tile
  const square = () => {
    const sq = new Int32Array(N);
    for (let y = H - 1; y >= 0; y--)
      for (let x = W - 1; x >= 0; x--) {
        const i = y * W + x;
        if (blocked[i]) continue;
        if (x === W - 1 || y === H - 1) {
          sq[i] = 1;
          continue;
        }
        const a = i + 1;
        const c = i + W;
        const d = i + W + 1;
        if (h[a] !== h[i] || h[c] !== h[i] || h[d] !== h[i]) sq[i] = 1;
        else sq[i] = 1 + Math.min(sq[a], sq[c], sq[d]);
      }
    return sq;
  };

  const placed: { kind: MapObjectKind; tiles: [number, number][] }[] = [];
  const take = (tiles: readonly (readonly [number, number])[], ring: number) => {
    for (const [x, y] of tiles)
      for (let dy = -ring; dy <= ring; dy++)
        for (let dx = -ring; dx <= ring; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx >= 0 && yy >= 0 && xx < W && yy < H) blocked[yy * W + xx] = 1;
        }
  };

  // where the colony walks from the start (its slopes, round the objects that block walking): a
  // mine site on that ground needs no player stairs
  const walkBlocked = new Uint8Array(N);
  const links: [number, number][] = [];
  for (const e of b.entities) {
    if (WALK_BLOCKERS.has(e.template)) for (const [x, y] of entityTiles(e)) if (x >= 0 && y >= 0 && x < W && y < H) walkBlocked[y * W + x] = 1;
    if (e.template !== "Slope") continue;
    const [dx, dy] = slopeHighSideOf(e.orientation);
    const hx = e.x + dx;
    const hy = e.y + dy;
    if (e.x >= 0 && e.y >= 0 && e.x < W && e.y < H && hx >= 0 && hy >= 0 && hx < W && hy < H) links.push([e.y * W + e.x, hy * W + hx]);
  }
  const regions = walkRegions(h, W, H, walkBlocked, links);
  const root = regions[sy * W + sx];
  // (and the land it reaches with a flight of stairs, never across water or up a cliff, item 47)
  const wetNow = new Uint8Array(N);
  for (let i = 0; i < N; i++) wetNow[i] = b.water[i] > WET ? 1 : 0;
  const land = landRegions(h, W, H, wetNow);
  const landRoot = land[sy * W + sx];

  for (const kind of ORDER) {
    const want = counts[kind] ?? 0;
    const band = EXTRA_BANDS[kind];
    // a little inside the validator's band, so rounding never puts an object on its edge
    const lo = (band.scaled ? band.lo * scale : band.lo) + 1;
    const hi = (band.scaled ? band.hi * scale : band.hi) - 1;
    if (kind === "mineSite") {
      // (the sites the colony must reach are a pair, item 47: a site is placed only where it leaves
      // the start's land room for the ones still to come, so the first never takes the ground the
      // second needs, D370's mine pair)
      const reachWant = Math.min(want, minesWanted(W, H));
      const side = FOOTPRINTS.UndergroundRuins.size[0] + 2;
      const leavesRoom = (tiles: [number, number][], still: number): boolean => {
        if (still <= 0 || !land || landRoot < 0) return true;
        const b2 = blocked.slice();
        for (const [x, y] of tiles)
          for (let dy = -3; dy <= 3; dy++)
            for (let dx = -3; dx <= 3; dx++) {
              const xx = x + dx;
              const yy = y + dy;
              if (xx >= 0 && yy >= 0 && xx < W && yy < H) b2[yy * W + xx] = 1;
            }
        // (a level square of the site's side, free, on the start's land, far enough out)
        const sq = new Int32Array(N);
        for (let y = H - 1; y >= 0; y--)
          for (let x = W - 1; x >= 0; x--) {
            const i = y * W + x;
            if (b2[i]) continue;
            if (x === W - 1 || y === H - 1) {
              sq[i] = 1;
              continue;
            }
            const a = i + 1;
            const c = i + W;
            const d = i + W + 1;
            sq[i] = h[a] !== h[i] || h[c] !== h[i] || h[d] !== h[i] ? 1 : 1 + Math.min(sq[a], sq[c], sq[d]);
          }
        let found = 0;
        const spots: number[] = [];
        for (let i = 0; i < N && found < still; i++) {
          if (sq[i] < side || land[i] !== landRoot || sd[i] < lo) continue;
          if (spots.some((t) => Math.max(Math.abs((t % W) - (i % W)), Math.abs(Math.floor(t / W) - Math.floor(i / W))) < side + 3)) continue;
          spots.push(i);
          found++;
        }
        return found >= still;
      };
      for (let k = 0; k < want; k++) {
        const fits = (tiles: [number, number][]) => !fitProblems(kind, tiles, { W, H, heights: h, water: b.water, channel: b.channel, occupied: b.occupied }).length && leavesRoom(tiles, reachWant - 1 - k);
        // (60+ tiles out, a third of that beyond where there is room; one the colony reaches from 30)
        const mineLo = MINE_LO * scale + 1;
        const spot = pickMineSite({ W, H, heights: h, blocked, startDist: sd, regions, root, land, landRoot }, rng, { lo: mineLo, hi, far: mineLo + (MINE_LO * scale) / 3, reachLo: lo }, fits);
        if (!spot) break;
        const { id: fid, role } = id(kind, k);
        out.push({ id: fid, kind: "mapObject", origin: "generated", role, locked: false, params: { kind, placement: { x: spot.x, y: spot.y, orientation: spot.orientation } } });
        placed.push({ kind, tiles: spot.tiles });
        take(spot.tiles, 3);
      }
      continue;
    }
    for (let k = 0; k < want; k++) {
      const orientation: Orientation = ORIENTATIONS[rng.int(0, 4)];
      const [a, c] = rotatedSize(kind, orientation);
      const side = Math.max(a, c) + 2;
      const sq = square();
      const cands: number[] = [];
      for (let y = 1; y + side <= H; y++)
        for (let x = 1; x + side <= W; x++) {
          const i = (y - 1) * W + (x - 1);
          if (sq[i] < side) continue;
          // the footprint's nearest tile to the start, roughly: its corner nearest the start
          const d = sd[y * W + x];
          if (d < lo - side || d > hi + side) continue;
          cands.push(y * W + x);
        }
      let done = false;
      // M9b ("a relic waits on a pinnacle", D274): on a map steered toward it, the first medium or
      // large relic tries ground the start cannot walk to, two levels or more above it, first
      const high = inp.relicHigh && k === 0 && (kind === "relicMedium" || kind === "relicLarge") ? cands.filter((i) => regions[i] !== root && h[i] >= h[sy * W + sx] + 2) : [];
      for (let tries = 0; tries < 40 && high.length && !done; tries++) {
        const pick = high[rng.int(0, high.length)];
        const x = pick % W;
        const y = (pick - x) / W;
        const tiles = footprintAt(kind, x, y, orientation);
        let d = Infinity;
        for (const [tx, ty] of tiles) d = Math.min(d, sd[ty * W + tx]);
        if (d < lo || d > hi) continue;
        if (fitProblems(kind, tiles, { W, H, heights: h, water: b.water, channel: b.channel, occupied: b.occupied }).length) continue;
        const { id: fid, role } = id(kind, k);
        out.push({ id: fid, kind: "mapObject", origin: "generated", role, locked: false, params: { kind, placement: { x, y, orientation } } });
        placed.push({ kind, tiles });
        take(tiles, 3);
        done = true;
      }
      for (let tries = 0; tries < 40 && cands.length && !done; tries++) {
        const pick = cands[rng.int(0, cands.length)];
        const x = pick % W;
        const y = (pick - x) / W;
        const tiles = footprintAt(kind, x, y, orientation);
        let d = Infinity;
        for (const [tx, ty] of tiles) d = Math.min(d, sd[ty * W + tx]);
        if (d < lo || d > hi) continue;
        if (fitProblems(kind, tiles, { W, H, heights: h, water: b.water, channel: b.channel, occupied: b.occupied }).length) continue;
        const { id: fid, role } = id(kind, k);
        const core = kind === "unstableCore" ? { radius: 2 + rng.int(0, 2), cycles: 5 + rng.int(0, 8) } : undefined;
        out.push({ id: fid, kind: "mapObject", origin: "generated", role, locked: false, params: { kind, placement: { x, y, orientation }, ...(core ? { core } : {}) } });
        placed.push({ kind, tiles });
        // cores keep clear of each other by their blast and more; the rest by a few tiles
        take(tiles, kind === "unstableCore" ? core!.radius + 4 : 3);
        done = true;
      }
    }
  }

  // thorn belts: across the way from the start to a relic or a geothermal field
  const beltsWant = counts.thornBelt ?? 0;
  const targets = placed.filter((p) => p.kind === "geothermal" || p.kind.startsWith("relic"));
  for (let k = 0, made = 0; made < beltsWant && k < beltsWant + 10; k++) {
    // in front of a relic or a field first; then anywhere on dry ground
    const tgt = targets.length && k < beltsWant + 3 ? targets[k % targets.length] : null;
    const belt = thornBelt(rng, tgt?.tiles ?? null, { W, H, h, sd, blocked, water: b.water });
    if (!belt) continue;
    const { id: fid, role } = id("thornBelt", made);
    out.push({ id: fid, kind: "mapObject", origin: "generated", role, locked: false, params: { kind: "thornBelt", placement: { area: tilesToRuns(belt, W) } } });
    take(belt.map((i) => [i % W, Math.floor(i / W)] as [number, number]), 1);
    made++;
  }
  return out;
}

/** A blotchy belt of 13–40 thorns (official belts fill 30–70% of their box): a band 2–3 tiles
 *  thick across the line from a target to the start, 5–8 tiles in front of the target; or, with no
 *  target, across a random stretch of dry ground. Every thorn keeps 22 tiles from the start. */
function thornBelt(
  rng: Rng,
  target: [number, number][] | null,
  g: { W: number; H: number; h: Uint8Array; sd: Float64Array; blocked: Uint8Array; water: Float64Array },
): number[] | null {
  const { W, H, sd, blocked } = g;
  let cx: number;
  let cy: number;
  let ux: number;
  let uy: number;
  if (target) {
    // the target's middle, and the way toward the start (down the distance field)
    let mx = 0;
    let my = 0;
    for (const [x, y] of target) {
      mx += x;
      my += y;
    }
    mx /= target.length;
    my /= target.length;
    let bx = Math.round(mx);
    let by = Math.round(my);
    const back = 5 + rng.int(0, 4);
    for (let s = 0; s < back; s++) {
      let best = -1;
      let bd = sd[by * W + bx];
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const xx = bx + dx;
        const yy = by + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        if (sd[yy * W + xx] < bd) {
          bd = sd[yy * W + xx];
          best = yy * W + xx;
        }
      }
      if (best < 0) break;
      bx = best % W;
      by = (best - bx) / W;
    }
    cx = bx;
    cy = by;
    const dx = mx - bx;
    const dy = my - by;
    const l = Math.sqrt(dx * dx + dy * dy) || 1;
    // across the way: perpendicular to it
    ux = -dy / l;
    uy = dx / l;
  } else {
    const free: number[] = [];
    for (let i = 0; i < W * H; i++) if (!blocked[i] && g.sd[i] > 30) free.push(i);
    if (!free.length) return null;
    const p = free[rng.int(0, free.length)];
    cx = p % W;
    cy = (p - cx) / W;
    const a = rng.int(0, 4);
    ux = [1, 0, 0.7071, 0.7071][a];
    uy = [0, 1, 0.7071, -0.7071][a];
  }
  const half = 4 + rng.int(0, 5); // 9–17 tiles across
  const thick = 1 + rng.int(0, 2); // 2–3 tiles deep
  const keep = rng.range(0.45, 0.7);
  const tiles: number[] = [];
  const seen = new Set<number>();
  for (let s = -half; s <= half; s++)
    for (let t = 0; t <= thick; t++) {
      // s runs along the belt, t across it
      const x = Math.round(cx + ux * s - uy * t);
      const y = Math.round(cy + uy * s + ux * t);
      if (x < 1 || y < 1 || x >= W - 1 || y >= H - 1) continue;
      const i = y * W + x;
      if (seen.has(i)) continue;
      seen.add(i);
      if (blocked[i] || sd[i] < 22 || g.water[i] > 0) continue;
      if (rng.float() > keep) continue;
      tiles.push(i);
    }
  if (tiles.length < 13) return null;
  return tiles.slice(0, 40).sort((a, b) => a - b);
}

/** Candidate sites for a second district (PLAN §9.8), best first: tiles 60–120 tiles from the start's
 *  middle, dry and free, on level ground of 600+ tiles, with pumpable clean water within 16
 *  tiles; the best have the most moist free land round them (for its grove and berries) and stand
 *  nearest 85 tiles out. At most `n`, 24+ tiles apart. */
export function districtCandidates(b: BuildResult, features: readonly Feature[], avoid: Uint8Array | null, n: number, band: { lo: number; hi: number; mid: number } = { lo: 60, hi: 120, mid: 85 }, ok: ((i: number) => boolean) | null = null): [number, number][] {
  const { W, H } = b;
  const N = W * H;
  if (!b.start) return [];
  const h = b.heights;
  const regions = levelRegions(h, W, H);
  // distance to pumpable water for a site at each level: clean, 0.3+ deep, its surface 0–2 below
  const pump: (Float64Array | null)[] = [];
  const pumpFor = (lv: number) => {
    if (pump[lv] !== undefined) return pump[lv];
    const m = new Uint8Array(N);
    let any = false;
    for (let i = 0; i < N; i++) {
      const s = h[i] + b.water[i];
      if (b.water[i] >= 0.3 && b.contamination[i] < 0.05 && s <= lv + 0.01 && s >= lv - 2) {
        m[i] = 1;
        any = true;
      }
    }
    pump[lv] = any ? distanceFrom(m, W, H) : null;
    return pump[lv];
  };
  const lakes = lakeBeds(features, b.heights, W, H);
  const moist = new Uint8Array(N);
  for (let i = 0; i < N; i++) moist[i] = b.moisture[i] > 0 && !(b.water[i] > 0) && !b.occupied[i] ? 1 : 0;
  const scored: [number, number][] = [];
  const r = DISTRICT_RADIUS;
  for (let y = r; y < H - r; y += 2)
    for (let x = r; x < W - r; x += 2) {
      const i = y * W + x;
      // (60–120 tiles from the start's middle, as the site's plan measures it, or the band asked)
      const e = Math.sqrt((x - b.start.x) * (x - b.start.x) + (y - b.start.y) * (y - b.start.y));
      if (e < band.lo || e > band.hi || b.water[i] > 0.05 || b.occupied[i] || b.channel[i] || lakes[i] || avoid?.[i] || b.cache.terrain.protect[i]) continue;
      if (regions.size[regions.labels[i]] < DISTRICT_LAND || (ok && !ok(i))) continue;
      const p = pumpFor(h[i]);
      if (!p || p[i] > DISTRICT_WATER - 1) continue;
      let m = 0;
      for (let yy = y - 12; yy <= y + 12; yy += 2) for (let xx = x - 12; xx <= x + 12; xx += 2) if (xx >= 0 && yy >= 0 && xx < W && yy < H && moist[yy * W + xx]) m++;
      scored.push([m - Math.abs(e - band.mid) * 0.5, i]);
    }
  scored.sort((a, c) => c[0] - a[0] || a[1] - c[1]);
  const out: [number, number][] = [];
  for (const [, i] of scored) {
    const x = i % W;
    const y = (i - x) / W;
    if (out.some(([ox, oy]) => (ox - x) * (ox - x) + (oy - y) * (oy - y) < 24 * 24)) continue;
    out.push([x, y]);
    if (out.length >= n) break;
  }
  return out;
}

/** Where ruins stand on a natural rise (PLAN §9.4 as M9a builds it: found on the land, never
 *  raised; stairs-only heights are rewards): a disc of `radius` on level, dry, free ground the
 *  colony does not walk to from the start (no derived slope joins it), beside ground it does walk
 *  on one or two levels below, so one flight of player stairs reaches it; 30–80% of the way from
 *  the start to the farthest ground, the nearest first to the middle of that band. Each spot comes
 *  with its level and its rise over the ground beside it (2 where it can, else 1). */
export function riseSpots(b: BuildResult, features: readonly Feature[], avoid: Uint8Array | null, radius: number, n: number, minDist = 0, top = 16): [number, number, number, number][] {
  const { W, H } = b;
  const N = W * H;
  if (!b.start) return [];
  const startMask = new Uint8Array(N);
  for (let y = b.start.y - 1; y <= b.start.y + 1; y++) for (let x = b.start.x - 1; x <= b.start.x + 1; x++) if (x >= 0 && y >= 0 && x < W && y < H) startMask[y * W + x] = 1;
  const sd = distanceFrom(startMask, W, H);
  let far = 0;
  for (let i = 0; i < N; i++) if (sd[i] > far && Number.isFinite(sd[i])) far = sd[i];
  const links: [number, number][] = [];
  for (const s of b.slopes) {
    const [dx, dy] = slopeHighSideOf(s.orientation);
    const hx = s.x + dx;
    const hy = s.y + dy;
    if (hx >= 0 && hy >= 0 && hx < W && hy < H) links.push([s.y * W + s.x, hy * W + hx]);
  }
  const labels = walkRegions(b.heights, W, H, null, links);
  const root = labels[b.start.y * W + b.start.x];
  const lakes = lakeBeds(features, b.heights, W, H);
  const h = b.heights;
  const bad = (i: number) => labels[i] === root || b.water[i] > 0 || b.occupied[i] || b.channel[i] || lakes[i] || avoid?.[i] || b.cache.terrain.protect[i];
  const R = radius;
  const mid = 0.525 * far;
  const scored: [number, number, number][] = [];
  for (let y = R + 1; y < H - R - 1; y++)
    for (let x = R + 1; x < W - R - 1; x++) {
      const i = y * W + x;
      const lv = h[i];
      if (lv < 2 || lv > top || sd[i] < 0.3 * far || sd[i] > 0.8 * far || sd[i] < minDist + R || bad(i)) continue;
      let ok = true;
      let stair = 0;
      for (let yy = y - R - 1; yy <= y + R + 1 && ok; yy++)
        for (let xx = x - R - 1; xx <= x + R + 1 && ok; xx++) {
          const d2 = (xx - x) * (xx - x) + (yy - y) * (yy - y);
          const j = yy * W + xx;
          if (d2 <= R * R + R) {
            if (bad(j) || h[j] !== lv) ok = false;
          } else if (stair < 2 && labels[j] === root && (h[j] === lv - 2 || h[j] === lv - 1) && !(b.water[j] > 0)) {
            // a tile the colony walks on, beside the disc (4-neighbour of a disc tile), a level or
            // two below
            for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
              const ax = xx + dx;
              const ay = yy + dy;
              if ((ax - x) * (ax - x) + (ay - y) * (ay - y) <= R * R + R) stair = Math.max(stair, lv - h[j]);
            }
          }
        }
      // a rise of two first (a rise of one reads as a step), then the middle of the band
      if (ok && stair) scored.push([(stair === 2 ? 0 : 1000) + Math.abs(sd[i] - mid), i, stair]);
    }
  scored.sort((a, c) => a[0] - c[0] || a[1] - c[1]);
  const out: [number, number, number, number][] = [];
  for (const [, i, rise] of scored) {
    const x = i % W;
    const y = (i - x) / W;
    if (out.some(([ox, oy]) => (ox - x) * (ox - x) + (oy - y) * (oy - y) < 16 * 16)) continue;
    out.push([x, y, h[i], rise]);
    if (out.length >= n) break;
  }
  return out;
}

/** Whether a rise found by riseSpots still stands as found on this build (after the start moved):
 *  out of the colony's walk, with its walk a flight of `rise` below it beside the disc. */
export function riseStands(b: BuildResult, x: number, y: number, radius: number, top: number, rise: number): boolean {
  const { W, H } = b;
  if (!b.start) return false;
  const links: [number, number][] = [];
  for (const s of b.slopes) {
    const [dx, dy] = slopeHighSideOf(s.orientation);
    const hx = s.x + dx;
    const hy = s.y + dy;
    if (hx >= 0 && hy >= 0 && hx < W && hy < H) links.push([s.y * W + s.x, hy * W + hx]);
  }
  const labels = walkRegions(b.heights, W, H, null, links);
  const root = labels[b.start.y * W + b.start.x];
  const R2 = radius * radius + radius;
  let stair = false;
  for (let yy = y - radius - 1; yy <= y + radius + 1; yy++)
    for (let xx = x - radius - 1; xx <= x + radius + 1; xx++) {
      if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
      const j = yy * W + xx;
      const d2 = (xx - x) * (xx - x) + (yy - y) * (yy - y);
      if (d2 <= R2) {
        if (labels[j] === root || b.heights[j] !== top) return false;
        continue;
      }
      if (labels[j] !== root || b.heights[j] !== top - rise) continue;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if ((xx + dx - x) * (xx + dx - x) + (yy + dy - y) * (yy + dy - y) <= R2) stair = true;
    }
  return stair;
}

export { OBJECT_NAMES };

/** Item 47's second district close to the start, behind a small obstacle (the forces-preview
 *  feedback; PLAN §20 D325: the second district site and the obstacle with a payoff combined, no new
 *  builder): how far out a close site stands (the session's default, decisions-pending), against the
 *  second district's own 60–120. */
export const CLOSE_DISTRICT = { lo: 40, hi: 70, mid: 55 } as const;
/** The most tiles of debris the obstacle takes: more is no small obstacle. */
export const BEHIND_CUT = 6;

/** The fewest tiles whose debris would cut the colony's walk from the start to (x, y) (item 47's
 *  small obstacle): a vertex cut of the walk (4 neighbours on one level, and the map's slopes)
 *  nearest the site, found by augmenting paths from the site; null when it takes more than `max`
 *  tiles, or the walk does not reach the site. Only dry, free ground may take debris, clear of the
 *  start's 5×5 and the site's disc. */
export function neckCut(b: BuildResult, x: number, y: number, max: number, keepClear: number): number[] | null {
  const { W, H } = b;
  const N = W * H;
  if (!b.start) return null;
  const h = b.heights;
  const blocked = new Uint8Array(N);
  const links: [number, number][] = [];
  for (const e of b.entities) {
    if (WALK_BLOCKERS.has(e.template)) for (const [tx, ty] of entityTiles(e)) if (tx >= 0 && ty >= 0 && tx < W && ty < H) blocked[ty * W + tx] = 1;
    if (e.template !== "Slope") continue;
    const [dx, dy] = slopeHighSideOf(e.orientation);
    const hx = e.x + dx;
    const hy = e.y + dy;
    if (e.x >= 0 && e.y >= 0 && e.x < W && e.y < H && hx >= 0 && hy >= 0 && hx < W && hy < H) links.push([e.y * W + e.x, hy * W + hx]);
  }
  const adj = new Map<number, number[]>();
  for (const [a, c] of links) {
    (adj.get(a) ?? adj.set(a, []).get(a)!).push(c);
    (adj.get(c) ?? adj.set(c, []).get(c)!).push(a);
  }
  const sx = b.start.x;
  const sy = b.start.y;
  // a tile may take debris (unit capacity) or not (never cut)
  const cuttable = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    const tx = i % W;
    const ty = (i - tx) / W;
    if (blocked[i] || b.water[i] > WET || b.occupied[i] || b.channel[i]) continue;
    if (Math.max(Math.abs(tx - sx), Math.abs(ty - sy)) <= 2) continue;
    if ((tx - x) * (tx - x) + (ty - y) * (ty - y) <= keepClear * keepClear) continue;
    cuttable[i] = 1;
  }
  const neighbours = (i: number, out: number[]) => {
    out.length = 0;
    const tx = i % W;
    const ty = (i - tx) / W;
    const lv = h[i];
    if (tx > 0 && h[i - 1] === lv && !blocked[i - 1]) out.push(i - 1);
    if (tx < W - 1 && h[i + 1] === lv && !blocked[i + 1]) out.push(i + 1);
    if (ty > 0 && h[i - W] === lv && !blocked[i - W]) out.push(i - W);
    if (ty < H - 1 && h[i + W] === lv && !blocked[i + W]) out.push(i + W);
    for (const n of adj.get(i) ?? []) if (!blocked[n]) out.push(n);
    return out;
  };
  // flow through each tile (0 or 1 on a cuttable one), and along each move between tiles
  const through = new Uint8Array(N);
  const along = new Map<number, number>();
  const key = (a: number, c: number) => a * N + c;
  const src = y * W + x;
  const isSink = (i: number) => Math.abs((i % W) - sx) <= 1 && Math.abs(Math.floor(i / W) - sy) <= 1;
  // residual search over split tiles: 2i is a tile's way in, 2i + 1 its way out
  const prev = new Int32Array(2 * N);
  const nb: number[] = [];
  let flow = 0;
  for (;;) {
    prev.fill(-2);
    const q = [2 * src + 1];
    prev[2 * src + 1] = -1;
    let end = -1;
    for (let k = 0; k < q.length && end < 0; k++) {
      const u = q[k];
      const i = u >> 1;
      if (u & 1) {
        // out of tile i: to the ways in of its neighbours (unbounded), and back into its own way
        // in when flow passes through it
        for (const n of neighbours(i, nb)) {
          const v = 2 * n;
          if (prev[v] !== -2) continue;
          prev[v] = u;
          q.push(v);
        }
        if ((!cuttable[i] || through[i]) && prev[2 * i] === -2) {
          prev[2 * i] = u;
          q.push(2 * i);
        }
      } else {
        if (isSink(i)) {
          end = u;
          break;
        }
        // in to tile i: through it when it has room, and back along a move that carries flow in
        if ((!cuttable[i] || !through[i]) && prev[u + 1] === -2) {
          prev[u + 1] = u;
          q.push(u + 1);
        }
        for (const n of neighbours(i, nb)) {
          if (!((along.get(key(n, i)) ?? 0) > 0)) continue;
          const v = 2 * n + 1;
          if (prev[v] !== -2) continue;
          prev[v] = u;
          q.push(v);
        }
      }
    }
    if (end < 0) break;
    flow++;
    if (flow > max) return null;
    for (let v = end; prev[v] !== -1; v = prev[v]) {
      const u = prev[v];
      const a = u >> 1;
      const c = v >> 1;
      if (a === c) through[a] = u & 1 ? 0 : 1;
      else if (u & 1) along.set(key(a, c), (along.get(key(a, c)) ?? 0) + 1);
      else along.set(key(c, a), (along.get(key(c, a)) ?? 0) - 1);
    }
  }
  if (!flow) return null;
  // the cut nearest the site: the tiles reached on the site's side whose way out is not
  const cut: number[] = [];
  for (let i = 0; i < N; i++) if (cuttable[i] && through[i] && prev[2 * i] !== -2 && prev[2 * i + 1] === -2) cut.push(i);
  return cut.length === flow ? cut.sort((a, c) => a - c) : null;
}
