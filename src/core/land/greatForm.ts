// The great form (D493's list of landmarks in the colony's view, planning's ruling on #236 of 2026-11-20): an
// overhang worn into the foot of a tall cliff, 4–5 levels high along 12 or more tiles of its face, where the
// opening camera pulled back (analysis/opening.ts, `VISTA_ZOOM`) looks at that face from the colony: a shelter big
// enough to read as a dark mouth under the rock at the default zoom's widest, where the forms3d overhangs (2–3 high
// along 4–10 tiles) read as a thin line (the measure of 2026-11-20: none of 266 forms reached 400 px² of an 800 × 450
// frame).
//
// - **The site** (`greatSites`): a cliff 7 or more levels over level dry ground that runs out 3 tiles from its foot,
//   its face tiles joined (8 ways) at one foot level; in the landmark band (25–60 tiles from the start), the top in
//   the frame's upper half, the face turned toward the camera (`seenStretch`). Nothing is laid: a map whose land
//   offers no such cliff in its view has no great form, and keeps what it has.
// - **The shape** (`wearGreat`): the face's foot worn back 2–3 tiles (the game's support rule lets a ledge reach 3
//   out of a wall, terrain/support.ts), the mouth's height wandering 3–5 along the face (a walk, never a band), the
//   deepest and tallest toward its middle, its ends tapering into the face (a tile deep, 2–3 high), the lip hanging a
//   level lower here and there, the back a level lower than the front; the roof keeps 2 levels or more of rock, so
//   the land seen from above does not change.
// - **What it never touches**: the start's ground and its room (it stands 25+ tiles out, past Easy's 14), water (no
//   worn tile beside water, so none runs in under the rock), objects, plants and the other forms (the forms stage's
//   `keep`, `plants` and `used`). It only adds floor under the rock: every way the map had stays.
//
// Exact arithmetic only (num.ts): integers, comparisons and the camera's constants.

import { frameAt, openingCamera, VISTA_ZOOM, type OpeningStart } from "../analysis/opening";
import { sqrt } from "../math/portable";
import { plainMask } from "../terrain/runs";

/** The great form's measures (planning's ruling: a cliff 7+ high, 12+ tiles of its face, a mouth 4–5 high). */
export const GREAT = {
  /** The cliff over its foot, levels. */
  rise: 7,
  /** The face tiles the camera sees, at least. */
  length: 12,
  /** The level dry ground running out from the foot, tiles. */
  apron: 3,
  /** The landmark band (D493): tiles from the start's middle. */
  near: 25,
  far: 60,
  /** The face turned toward the camera: its outward direction against the look, at most this (cos of about 55°
   *  past head-on; a face along the look shows no mouth). */
  facing: -0.5,
  /** The mouth's height, levels, and how far it is worn back, tiles (the support rule's reach). */
  lowest: 3,
  tallest: 5,
  deepest: 3,
  /** The rock kept over the mouth, levels at least. */
  roof: 2,
  /** The stretch worn, tiles of face at most. */
  most: 22,
} as const;

const D4: readonly (readonly [number, number])[] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const MARGIN = 3;

/** One tile of a cliff's face: its tile, the way out to its foot (a unit grid step; `ways`, every way out to level
 *  ground at that foot, a corner's two), how far it stands over it. */
export interface FaceTile {
  i: number;
  n: readonly [number, number];
  ways: readonly (readonly [number, number])[];
  rise: number;
}

/** A cliff's face: face tiles joined 8 ways over level ground at one foot level `z`. */
export interface GreatSite {
  z: number;
  tiles: FaceTile[];
}

/** The cliffs 7+ over level dry ground on a map (`mask` null: every tile one plain run). `off`: tiles that may not be
 *  worn (objects, plants, the start's ground, other forms). Faces of `GREAT.length` tiles or more. */
export function greatSites(h: ArrayLike<number>, water: ArrayLike<number>, W: number, H: number, mask: ArrayLike<number> | null = null, off: Uint8Array | null = null, opt: { rise?: number; apron?: number; wet?: boolean } = {}): GreatSite[] {
  const N = W * H;
  const RISE = opt.rise ?? GREAT.rise;
  const APRON = opt.apron ?? GREAT.apron;
  const wetOk = opt.wet ?? false;
  const isWet = (i: number) => water[i] > 0.01;
  // the level a foot stands at: dry ground's own, just over open water's (a shore's)
  const lev = (i: number) => (isWet(i) ? Math.ceil(h[i] + water[i]) : h[i]);
  // each tile's lowest foot (dry level ground running out `apron` tiles) and the way to it
  const footZ = new Int16Array(N).fill(-1);
  // (the ways out to that foot, one bit each)
  const way = new Int8Array(N);
  for (let y = MARGIN; y < H - MARGIN; y++)
    for (let x = MARGIN; x < W - MARGIN; x++) {
      const f = y * W + x;
      if ((off && off[f]) || isWet(f) || (mask && mask[f] !== plainMask(h[f]))) continue;
      for (let k = 0; k < 4; k++) {
        const [dx, dy] = D4[k];
        const bx = x + dx * APRON;
        const by = y + dy * APRON;
        if (bx < 0 || by < 0 || bx >= W || by >= H) continue;
        const b = f + dx + dy * W;
        const wet = isWet(b);
        if (wet && !wetOk) continue;
        const z = lev(b);
        if (h[f] - z < RISE || (footZ[f] >= 0 && z > footZ[f])) continue;
        let level = true;
        for (let s = 1; s <= APRON && level; s++) {
          const j = f + (dx + dy * W) * s;
          if (lev(j) !== z || isWet(j) !== wet) level = false;
        }
        if (!level) continue;
        if (footZ[f] !== z) way[f] = 0;
        footZ[f] = z;
        way[f] |= 1 << k;
      }
    }
  // joined 8 ways at one foot level
  const seen = new Uint8Array(N);
  const out: GreatSite[] = [];
  for (let s = 0; s < N; s++) {
    if (!way[s] || seen[s]) continue;
    const z = footZ[s];
    const q = [s];
    seen[s] = 1;
    for (let k = 0; k < q.length; k++) {
      const i = q[k];
      const x = i % W;
      const y = (i - x) / W;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const j = (y + dy) * W + x + dx;
          if ((dx || dy) && way[j] && !seen[j] && footZ[j] === z) {
            seen[j] = 1;
            q.push(j);
          }
        }
    }
    if (q.length < GREAT.length) continue;
    out.push({
      z,
      tiles: q.map((i) => {
        const ways = D4.filter((_, k) => way[i] & (1 << k));
        return { i, n: ways[0], ways, rise: h[i] - z };
      }),
    });
  }
  return out;
}

/** The face tiles of `site` the opening camera pulled back sees as a landmark from `start`: 25–60 tiles out, the
 *  top in the frame's upper half, the face turned toward the camera. */
export function seenStretch(site: GreatSite, start: OpeningStart, h: ArrayLike<number>, W: number, cam = openingCamera(start, VISTA_ZOOM)): FaceTile[] {
  const out: FaceTile[] = [];
  for (const t of site.tiles) {
    const x = t.i % W;
    const y = (t.i - x) / W;
    const dx = x - start.x;
    const dy = y - start.y;
    const d2 = dx * dx + dy * dy;
    if (d2 < GREAT.near * GREAT.near || d2 > GREAT.far * GREAT.far) continue;
    // (its way out most turned toward the camera)
    let n = t.ways[0];
    for (const w of t.ways) if (w[0] * cam.look[0] + w[1] * cam.look[1] < n[0] * cam.look[0] + n[1] * cam.look[1]) n = w;
    if (n[0] * cam.look[0] + n[1] * cam.look[1] > GREAT.facing) continue;
    const p = frameAt(cam, x + 0.5, y + 0.5, h[t.i]);
    if (!p || p.u < -1 || p.u > 1 || p.v < 0 || p.v > 1) continue;
    out.push(n === t.n ? t : { ...t, n });
  }
  return out;
}

// ------------------------------------------------------------------------------------------- the carve

/** What the great form reads of a finished map (the forms stage's, gen/forms3d.ts `growOn`). */
export interface GreatInput {
  W: number;
  H: number;
  heights: ArrayLike<number>;
  /** Settled water depth per tile. */
  water: ArrayLike<number>;
  /** The terrain as it stands (the other forms in it): one mask per tile. */
  mask: Uint32Array;
  /** 1 where nothing may be worn: objects, plants, the start's ground, the other forms and a tile round them. */
  off: Uint8Array;
  /** 1 where a tree stands (its crown hides what is behind it from the camera). */
  trees: Uint8Array;
  start: OpeningStart;
}

/** The great form as worn: the terrain's changed tiles (their new masks), its heart, and its measures. */
export interface GreatPlan {
  change: Map<number, number>;
  at: number;
  tiles: number[];
  /** Face tiles worn, those whose mouths the camera sees, the mouth's least and most height in its middle, its depth. */
  length: number;
  seen: number;
  high: [number, number];
  deep: number;
  note: string;
}

const bits = (lo: number, hi: number): number => plainMask(hi) & ~plainMask(lo);
/** A tree's crown over its ground, levels (analysis/picture.ts `CROWN`). */
const CROWN = 3;

/** Whether the camera's eye sees the point (x, y, z): the line from the eye to it meets no rock (but the target
 *  tile's own column) and no tree's crown on the way (steps of a fifth of a tile). */
function sees(inp: GreatInput, eye: readonly [number, number, number], x: number, y: number, z: number, own: number): boolean {
  const { W, H, mask, heights, trees } = inp;
  const dx = x - eye[0];
  const dy = y - eye[1];
  const dz = z - eye[2];
  const len = sqrt(dx * dx + dy * dy + dz * dz);
  const steps = Math.ceil(len * 5);
  for (let s = 1; s < steps; s++) {
    const t = s / steps;
    const px = eye[0] + dx * t;
    const py = eye[1] + dy * t;
    const pz = eye[2] + dz * t;
    const tx = Math.floor(px);
    const ty = Math.floor(py);
    if (tx < 0 || ty < 0 || tx >= W || ty >= H) continue;
    const i = ty * W + tx;
    if (i === own) continue;
    const zi = Math.floor(pz);
    if (zi < 0) return false;
    if (zi < 32 && (mask[i] >>> zi) & 1) return false;
    if (trees[i] && pz >= heights[i] && pz < heights[i] + CROWN) return false;
  }
  return true;
}

/** The longest stretch of `seen` joined 8 ways, at most `GREAT.most` tiles round the tile nearest the frame's middle,
 *  in order along the face from one end. */
function stretchOf(seen: readonly FaceTile[], W: number, mid: (i: number) => number): FaceTile[] {
  const by = new Map(seen.map((t) => [t.i, t]));
  const nb = (i: number) => {
    const x = i % W;
    const y = (i - x) / W;
    const out: number[] = [];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && by.has((y + dy) * W + x + dx)) out.push((y + dy) * W + x + dx);
    return out;
  };
  const bfs = (from: number, allowed: Set<number> | null): Map<number, number> => {
    const d = new Map([[from, 0]]);
    const q = [from];
    for (let k = 0; k < q.length; k++)
      for (const j of nb(q[k]))
        if (!d.has(j) && (!allowed || allowed.has(j))) {
          d.set(j, d.get(q[k])! + 1);
          q.push(j);
        }
    return d;
  };
  // the largest joined part
  let part: number[] = [];
  const done = new Set<number>();
  for (const t of seen) {
    if (done.has(t.i)) continue;
    const d = bfs(t.i, null);
    for (const i of d.keys()) done.add(i);
    if (d.size > part.length) part = [...d.keys()];
  }
  // round the tile nearest the frame's middle, at most `most` tiles
  const centre = part.reduce((a, b) => (mid(b) < mid(a) || (mid(b) === mid(a) && b < a) ? b : a), part[0]);
  const fromC = bfs(centre, new Set(part));
  const kept = new Set([...fromC.entries()].sort((a, b) => a[1] - b[1] || a[0] - b[0]).slice(0, GREAT.most).map(([i]) => i));
  // along the face: from its farthest end
  const a = bfs(centre, kept);
  const end = [...a.entries()].reduce((p, c) => (c[1] > p[1] || (c[1] === p[1] && c[0] < p[0]) ? c : p))[0];
  const along = bfs(end, kept);
  return [...along.entries()].sort((p, c) => p[1] - c[1] || p[0] - c[0]).map(([i]) => by.get(i)!);
}

/** Wear the great form into the best site the opening view offers, or say why there is none. `rng`: its own stream;
 *  `falls`: the rock of a terrain the game's support rule deletes (by cell, z · N + tile: terrain/support.ts
 *  `unsupportedVoxels`); `reads`: whether the worn tiles' roof reads as
 *  a shelter (analysis/seeThrough.ts `shelters`). */
export function wearGreat(inp: GreatInput, rng: { int(lo: number, hi: number): number; float(): number }, falls: (mask: Uint32Array) => Uint8Array, reads: (mask: Uint32Array, tiles: Iterable<number>) => boolean): GreatPlan | string {
  const { W, H, heights, water, mask, off, start } = inp;
  const cam = openingCamera(start, VISTA_ZOOM);
  const sites = greatSites(heights, water, W, H, mask, off);
  if (!sites.length) return "no cliff 7 or more over level dry ground";
  const wet = (i: number) => water[i] > 0.01;
  const wetBy = (i: number) => {
    const x = i % W;
    const y = (i - x) / W;
    if (wet(i)) return true;
    for (const [dx, dy] of D4) {
      const xx = x + dx;
      const yy = y + dy;
      if (xx >= 0 && yy >= 0 && xx < W && yy < H && wet(yy * W + xx)) return true;
    }
    return false;
  };
  const across = (i: number) => {
    const x = i % W;
    const p = frameAt(cam, x + 0.5, (i - x) / W + 0.5, heights[i]);
    return p ? Math.abs(p.u) : 9;
  };
  // the sites the view looks at, the longest seen first
  const cands = sites
    .map((s) => ({ s, seen: seenStretch(s, start, heights, W, cam) }))
    .filter((c) => c.seen.length >= GREAT.length)
    .sort((a, b) => b.seen.length - a.seen.length || a.s.tiles[0].i - b.s.tiles[0].i);
  if (!cands.length) return "no tall cliff faces the opening view in the landmark band";
  let why = "no tall cliff's foot is seen from the opening view";
  for (const { s, seen } of cands.slice(0, 4)) {
    const z = s.z;
    const stretch = stretchOf(seen, W, across);
    if (stretch.length < GREAT.length) continue;
    // (the mouths the camera sees: the face's foot, a level and a half up, nothing in front)
    const seenN = stretch.filter((t) => {
      const x = t.i % W;
      const y = (t.i - x) / W;
      return sees(inp, cam.eye, x + 0.5 + t.n[0] * 0.55, y + 0.5 + t.n[1] * 0.55, z + 1.5, t.i);
    }).length;
    if (seenN < GREAT.length - 4) {
      why = `the cliff's foot is hidden from the opening view (${seenN} of ${stretch.length} tiles seen)`;
      continue;
    }
    // the mouth's height and depth along the face: walks, never one band; the ends tapering into the face
    const L = stretch.length;
    const highs: number[] = [];
    const deeps: number[] = [];
    let a = GREAT.tallest - rng.int(0, 2);
    let d = GREAT.deepest - rng.int(0, 2);
    for (let k = 0; k < L; k++) {
      if (rng.float() < 0.35) a = a === GREAT.tallest ? GREAT.tallest - 1 : GREAT.tallest;
      if (rng.float() < 0.4) d = d === GREAT.deepest ? GREAT.deepest - 1 : GREAT.deepest;
      const end = Math.min(k, L - 1 - k);
      // (a rib: here and there the mouth comes down a level for a tile)
      const rib = end >= 3 && rng.float() < 0.12 ? 1 : 0;
      highs.push(end === 0 ? 2 : end === 1 ? GREAT.lowest : Math.min(end === 2 ? GREAT.tallest - 1 : a, a) - rib);
      deeps.push(end === 0 ? 1 : end === 1 ? 2 : d);
    }
    const backs = stretch.map(() => rng.float() < 0.5);
    for (let most = GREAT.deepest; most >= 2; most--) {
      const change = new Map<number, number>();
      let worn = 0;
      let high = 0;
      let low = 99;
      stretch.forEach((t, q) => {
        const x = t.i % W;
        const y = (t.i - x) / W;
        const dq = Math.min(most, deeps[q]);
        for (let k = 0; k < dq; k++) {
          const xx = x - t.n[0] * k;
          const yy = y - t.n[1] * k;
          if (xx < MARGIN || yy < MARGIN || xx >= W - MARGIN || yy >= H - MARGIN) break;
          const i = yy * W + xx;
          if (off[i] || wetBy(i) || mask[i] !== plainMask(heights[i])) break;
          const room = heights[i] - z - GREAT.roof;
          // (the back a level under the front, here and there)
          const lower = k > 0 && k === dq - 1 && backs[q];
          const ah = Math.min(room, highs[q] - (lower ? 1 : 0));
          if (ah < 2) break;
          change.set(i, (change.get(i) ?? mask[i]) & ~bits(z, z + ah));
          if (k === 0) {
            worn++;
            high = Math.max(high, ah);
            if (Math.min(q, L - 1 - q) >= 2) low = Math.min(low, ah);
          }
        }
      });
      if (worn < GREAT.length) {
        why = "the cliff is too thin to wear back";
        continue;
      }
      // (rock that nothing holds falls, as the game's support rule takes it: a corner where two stretches of the face
      // meet, a ledge left hanging; the land seen from above never changes, so where the top would go, none is worn)
      const next = mask.slice();
      for (const [i, m] of change) next[i] = m;
      let fell = false;
      for (let pass = 0; pass < 6; pass++) {
        const u = falls(next);
        let any = false;
        for (let c = 0; c < u.length && !fell; c++) {
          if (!u[c]) continue;
          const i = c % (W * H);
          const zc = (c - i) / (W * H);
          if (zc >= heights[i] - GREAT.roof) fell = true;
          else {
            next[i] &= ~(1 << zc);
            change.set(i, next[i]);
            any = true;
          }
        }
        if (fell || !any) break;
      }
      if (fell || falls(next).some((v) => v === 1)) {
        why = "the rock would fall";
        continue;
      }
      if (!reads(next, change.keys())) {
        why = "its roof would not read as a shelter";
        continue;
      }
      const tiles = [...change.keys()].sort((p, c) => p - c);
      const lo = low === 99 ? high : low;
      return { change, at: stretch[Math.floor(L / 2)].i, tiles, length: worn, seen: seenN, high: [lo, high], deep: most, note: `${worn} tiles of a cliff ${Math.min(...stretch.map((t) => t.rise))}+ high worn back up to ${most} deep, its mouth ${lo}–${high} high at level ${z}, ${seenN} seen from the opening view` };
    }
  }
  return why;
}
