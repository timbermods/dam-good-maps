// 3D forms grown on a finished map (D118, D123, D138, D488; investigation/terrain3d/DESIGN.md §5.2):
// the first three of 3D-b's processes, each a site finder that reads the land, its water and its
// start, and a carver built from the support rule (terrain/support.ts). Nothing is stamped: a form
// stands where the land offers its place, shaped by that place, and a map whose land offers none
// has none (failure is allowed, D138 (2)).
//
// - A spring cave feeding the river: where a river rises at a cliff's foot, its spring moves into
//   the rock behind it. A gallery 2–3 wide and 2–3 high runs into the cliff, wiggling, with a pool a
//   level below its mouth at the back, where the spring's row now stands; its water leaves by the
//   mouth into the river's head.
// - An overhang sheltering the start: where the start's level ground meets a cliff, the cliff's
//   foot is worn back 1–3 tiles along a stretch of its face, as soft rock under a harder cap, so the
//   upper cliff hangs over level ground beside the start (2–3 high, the rock above holding it).
// - An arch over a gorge: where a river runs between rims at one height a few tiles apart, the rock
//   spans the gorge at the rims' level, as the remnant of a roof the river wore through: the span is
//   filled between the rims and the support rule takes what nothing holds up, leaving a corbelled
//   arch, its crown 2 or more above the water.
//
// The surface is kept wherever a form can keep it: a cave and an overhang are worn below the top
// (the land seen from above does not change); only an arch's deck is new ground, over the gorge.
// Exact arithmetic only (num.ts): integers and comparisons.

import type { Rng } from "../math/rng";
import { plainMask, TERRAIN_LAYERS } from "../terrain/runs";
import { unsupportedVoxels } from "../terrain/support";

export const FORMS = ["spring-cave", "start-overhang", "gorge-arch"] as const;
export type FormId = (typeof FORMS)[number];

/** The outcome in a player's words (D138 (1)). */
export const FORM_TEXT: Record<FormId, string> = {
  "spring-cave": "A spring rises inside a cave and feeds the river.",
  "start-overhang": "An overhang shelters the start: the cliff beside it hangs over level ground.",
  "gorge-arch": "A natural arch spans a gorge, the river running under it.",
};

export interface FormsInput {
  W: number;
  H: number;
  /** The surface per tile (every tile one plain run: forms grow on a heightfield). */
  heights: Uint8Array;
  /** Settled water depth per tile, and its badwater share. */
  water: ArrayLike<number>;
  contamination: ArrayLike<number>;
  /** 1 where nothing may be worn or built: objects other than plants, the start's ground and its
   *  door's way. */
  keep: Uint8Array;
  /** 1 where a plant stands (it rides on top: worn below, it stays; under an arch's deck, it would
   *  be buried). */
  plants: Uint8Array;
  start: { x: number; y: number; z: number } | null;
  /** 1 within reach of a water source already on the map: a new spring's water never joins a river
   *  there, where it would stand in that source's flow (D171). */
  nearSource: Uint8Array;
  /** The rivers' courses, head to mouth (tile units). */
  rivers: readonly { id: string; path: readonly (readonly [number, number])[]; badwater: boolean }[];
  /** The highest the land may stand (16, or a tall map's top). */
  top: number;
  /** Verticality, 0–100 (D132): larger and more daring forms as it rises. */
  vt: number;
}

/** How many of each form a map looks for. */
export type FormsWanted = Partial<Record<FormId, number>>;

/** One form as grown. */
export interface FormPlan {
  id: FormId;
  /** A tile at its heart (a cave's mouth, the overhang's middle, the arch's crown), and a tile it is
   *  best seen from (the river the cave opens on, the start, the gorge along the river). */
  at: number;
  from: number;
  /** The tiles whose runs it changed. */
  tiles: number[];
  /** A cave's spring: the river it feeds, the tile its source stands on (the pool's floor), its
   *  stream's course (tiles from the spring out of the mouth to the river's water) and strength. */
  river?: string;
  spring?: number;
  course?: number[];
  flow?: number;
  /** Its measures, for the record. */
  note: string;
}

export interface Forms {
  /** The terrain with the forms: one mask per tile (terrain/runs.ts). */
  mask: Uint32Array;
  forms: FormPlan[];
  /** Forms looked for that found no place, with why. */
  missed: { id: FormId; why: string }[];
}

const D4: readonly (readonly [number, number])[] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
/** Tiles from the map's edge a form keeps (a cave open to the edge drains out of the map). */
const MARGIN = 3;

const bits = (lo: number, hi: number): number => plainMask(hi) & ~plainMask(lo);

/** Grow the forms wanted on a finished heightfield map. Each is checked against the support rule
 *  as it is carved, and kept only if nothing would fall; forms never touch one another. */
export function growForms(inp: FormsInput, want: FormsWanted, rng: Rng): Forms {
  const { W, H, heights } = inp;
  const N = W * H;
  const mask = new Uint32Array(N);
  for (let i = 0; i < N; i++) mask[i] = plainMask(heights[i]);
  const used = new Uint8Array(N);
  const forms: FormPlan[] = [];
  const missed: Forms["missed"] = [];
  const ctx: Ctx = { inp, mask, used, rng };
  for (const id of FORMS) {
    const n = want[id] ?? 0;
    let got = 0;
    let why = "no place";
    if (n > 0) {
      const grown = id === "spring-cave" ? springCaves(ctx, n) : id === "start-overhang" ? startOverhang(ctx) : gorgeArches(ctx, n);
      for (const f of grown.forms) {
        forms.push(f);
        got++;
      }
      why = grown.why;
    }
    for (let k = got; k < n; k++) missed.push({ id, why });
  }
  return { mask, forms, missed };
}

interface Ctx {
  inp: FormsInput;
  mask: Uint32Array;
  used: Uint8Array;
  rng: Rng;
  /** Tiles within reach of the map's objects (a cave's water keeps off them). */
  near?: Uint8Array;
}

/** `m` grown by `r` tiles (Chebyshev). */
function grown(m: Uint8Array, W: number, H: number, r: number): Uint8Array {
  const out = new Uint8Array(W * H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (!m[y * W + x]) continue;
      for (let yy = Math.max(0, y - r); yy <= Math.min(H - 1, y + r); yy++) for (let xx = Math.max(0, x - r); xx <= Math.min(W - 1, x + r); xx++) out[yy * W + xx] = 1;
    }
  return out;
}

const inside = (W: number, H: number, x: number, y: number, m = MARGIN) => x >= m && y >= m && x < W - m && y < H - m;

/** Apply a form's change and keep it only when nothing falls (the support rule); the tiles and a
 *  one-tile ring round them are then taken, so no two forms touch. */
function commit(c: Ctx, change: Map<number, number>): boolean {
  const { W, H } = c.inp;
  const before = new Map<number, number>();
  for (const [i, m] of change) {
    before.set(i, c.mask[i]);
    c.mask[i] = m;
  }
  const falls = unsupportedVoxels({ W, H, mask: c.mask });
  let fell = false;
  for (let k = 0; k < falls.length && !fell; k++) if (falls[k]) fell = true;
  if (fell) {
    for (const [i, m] of before) c.mask[i] = m;
    return false;
  }
  for (const i of change.keys()) {
    const x = i % W;
    const y = (i - x) / W;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx >= 0 && yy >= 0 && xx < W && yy < H) c.used[yy * W + xx] = 1;
      }
  }
  return true;
}

function shuffled<T>(items: readonly T[], rng: Rng): T[] {
  const out = items.slice();
  for (let k = out.length - 1; k > 0; k--) {
    const j = rng.int(0, k + 1);
    [out[k], out[j]] = [out[j], out[k]];
  }
  return out;
}

// ------------------------------------------------------------------------------------ spring cave

/** The cave's rock must stand this far over its ceiling (the roof's layers). */
const CAVE_ROOF = 1;
/** How far a cave's floor stands at least over the water it feeds. */
const CAVE_ABOVE = 0.5;
/** How far from a river's water a cliff's foot may stand for its cave to feed it. */
const CAVE_REACH = 4;

/** Where a cave's spring would feed a river: the river's water at `wet`, the bank between it and
 *  the cliff (`stream`, from the water to the cliff's foot), and the cliff's foot level `z`. */
interface CaveSite {
  river: string;
  wet: number;
  d: readonly [number, number];
  stream: number[];
  z: number;
  /** Where the gallery opens. */
  x: number;
  y: number;
}

function springCaves(c: Ctx, n: number): { forms: FormPlan[]; why: string } {
  const { inp, rng } = c;
  const { W, H, heights, water, keep } = inp;
  // (a cave's water keeps 3 tiles off the map's objects: a relic or a mine site by new water is out of
  // place, extras.placement)
  const near = grown(keep, W, H, 3);
  c.near = near;
  const sites: CaveSite[] = [];
  for (const r of inp.rivers) {
    if (r.badwater) continue;
    for (const [x, y] of pathTiles(r.path)) {
      if (!inside(W, H, x, y)) continue;
      const w = y * W + x;
      // (clean water only: a cave's stream that raises badwater spreads it)
      if (!(water[w] >= 0.1) || inp.nearSource[w] || !(inp.contamination[w] < 0.05)) continue;
      const surf = heights[w] + water[w];
      for (const d of D4) {
        // out from the water over dry bank, never down, to a cliff's foot
        const stream: number[] = [];
        // (the cave's floor stands half a level or more above the river's water, so the river never
        // backs into it, the cave's own water raising it a little)
        let last = Math.ceil(surf + CAVE_ABOVE);
        let at = -1;
        for (let k = 1; k <= CAVE_REACH; k++) {
          const xx = x + d[0] * k;
          const yy = y + d[1] * k;
          if (!inside(W, H, xx, yy)) break;
          const i = yy * W + xx;
          if (water[i] >= 0.1) {
            stream.length = 0;
            last = Math.ceil(heights[i] + water[i] + CAVE_ABOVE);
            continue;
          }
          if (heights[i] >= last + 3) {
            at = i;
            break;
          }
          if (heights[i] < last - (stream.length ? 0 : 1) || near[i] || inp.plants[i]) break;
          stream.push(i);
          last = heights[i];
        }
        if (at < 0) continue;
        const z = stream.length ? heights[stream[stream.length - 1]] : last;
        if (z < 2) continue;
        sites.push({ river: r.id, wet: w, d, stream, z, x: at % W, y: Math.floor(at / W) });
      }
    }
  }
  if (!sites.length) return { forms: [], why: "no cliff beside a river" };
  const forms: FormPlan[] = [];
  let why = "no cliff deep enough beside a river";
  const tried = new Set<string>();
  for (const s of shuffled(sites, rng)) {
    if (forms.length >= n) break;
    // (one cave a stretch of cliff)
    const key = `${s.x >> 3},${s.y >> 3}`;
    if (tried.has(key) || s.stream.some((i) => c.used[i])) continue;
    const flow = 0.3 + Math.round(rng.float() * 40) / 100;
    const g = gallery(c, s.x, s.y, s.d, s.z, flow);
    if (!g) continue;
    tried.add(key);
    // (worn where the rock holds it, else cut plain)
    const carve = (worn: boolean) => {
      const out = new Map<number, number>();
      for (const [i, floor] of g.floors) out.set(i, c.mask[i] & ~bits(floor, g.ceil) & ~(worn ? (g.wear.get(i) ?? 0) : 0));
      if (worn) for (const [i, w] of g.wear) if (!out.has(i)) out.set(i, c.mask[i] & ~w);
      return out;
    };
    let change = carve(true);
    if (!commit(c, change)) {
      change = carve(false);
      if (!commit(c, change)) {
        why = "a cave's roof would fall";
        continue;
      }
    }
    for (const i of s.stream) c.used[i] = 1;
    // its stream's course: from the spring at the back, out of the mouth, over the bank to the river
    const course = [...g.course, ...s.stream.slice().reverse(), s.wet];
    forms.push({ id: "spring-cave", at: g.course[g.course.length - 1], from: s.wet, tiles: [...change.keys()].sort((a, b) => a - b), river: s.river, spring: g.spring, course, flow, note: `a gallery ${g.length} long, ${g.width} wide and ${g.ceil - s.z} high at level ${s.z}, its pool at ${s.z - 1}, under ${g.roof} levels of rock, ${s.stream.length} tiles from the river` });
  }
  return { forms, why: forms.length ? "no other cliff beside a river" : why };
}

/** The tiles a course passes, a tile apart, head to mouth. */
function pathTiles(path: readonly (readonly [number, number])[]): [number, number][] {
  const out: [number, number][] = [];
  for (let k = 0; k + 1 < path.length; k++) {
    const [ax, ay] = path[k];
    const [bx, by] = path[k + 1];
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(bx - ax), Math.abs(by - ay))));
    for (let s = 0; s < steps; s++) {
      const x = Math.round(ax + ((bx - ax) * s) / steps);
      const y = Math.round(ay + ((by - ay) * s) / steps);
      const prev = out[out.length - 1];
      if (!prev || prev[0] !== x || prev[1] !== y) out.push([x, y]);
    }
  }
  return out;
}

interface Gallery {
  /** Each tile's floor (its first free layer). */
  floors: Map<number, number>;
  tiles: number[];
  ceil: number;
  spring: number;
  /** The gallery's middle, from the spring at the back to the mouth. */
  course: number[];
  length: number;
  width: number;
  roof: number;
  /** Voxels worn away round the mouth and in the walls, by tile (bits). */
  wear: Map<number, number>;
}

/** A gallery from its mouth at (x, y) into the rock along `d`, its floor at the spring's level `z0`
 *  and a pool a level below at its back; null when the rock is not deep and high enough. */
function gallery(c: Ctx, x0: number, y0: number, d: readonly [number, number], z0: number, flow: number): Gallery | null {
  const { inp, mask, used, rng } = c;
  const { W, H, heights, keep } = inp;
  const p: [number, number] = [-d[1], d[0]];
  const width = flow > 16 ? 3 : rng.float() < 0.5 ? 2 : 3;
  // (a row of sources carries at most 8 a tile, across the pool)
  if (flow > 8 * width) return null;
  const across = width === 3 ? [-1, 0, 1] : rng.float() < 0.5 ? [0, 1] : [-1, 0];
  const high = rng.float() < 0.4 + inp.vt / 200 ? 3 : 2;
  const ceil = z0 + high;
  const most = 4 + rng.int(0, 4) + Math.floor(inp.vt / 30);
  // (no plant over a cave: its water under the plant's tile reads as the plant's from above)
  const ok = (i: number, x: number, y: number) => inside(W, H, x, y) && !keep[i] && !c.near?.[i] && !inp.plants[i] && !used[i] && mask[i] === plainMask(heights[i]) && heights[i] >= ceil + CAVE_ROOF;
  const sections: number[][] = [];
  let cx = x0;
  let cy = y0;
  let roof = 99;
  for (let k = 0; k < most; k++) {
    const sec: number[] = [];
    for (const o of across) {
      const x = cx + o * p[0];
      const y = cy + o * p[1];
      const i = y * W + x;
      if (!ok(i, x, y)) break;
      sec.push(i);
    }
    if (sec.length < across.length) break;
    sections.push(sec);
    for (const i of sec) roof = Math.min(roof, heights[i] - ceil);
    cx += d[0];
    cy += d[1];
    // (it wiggles: now and then a step sideways, the sections still overlapping)
    if (k >= 1 && rng.float() < 0.3) {
      const side = rng.float() < 0.5 ? 1 : -1;
      cx += side * p[0];
      cy += side * p[1];
    }
  }
  if (sections.length < 3) return null;
  // its walls: every tile beside the gallery but its mouth stands through its air, so its water
  // leaves by the mouth alone
  const inGallery = new Set(sections.flat());
  const mouth = new Set(sections[0]);
  let keepTo = sections.length;
  for (let k = 1; k < sections.length && keepTo === sections.length; k++)
    for (const i of sections[k]) {
      const x = i % W;
      const y = (i - x) / W;
      for (const [dx, dy] of D4) {
        const j = (y + dy) * W + x + dx;
        if (inGallery.has(j) || mouth.has(j)) continue;
        if (heights[j] < ceil || mask[j] !== plainMask(heights[j]) || used[j]) keepTo = Math.min(keepTo, k);
      }
    }
  sections.length = keepTo;
  if (sections.length < 3) return null;
  // the pool: the back two sections (one on a short gallery), a level below the mouth's floor
  const pool = sections.length >= 5 ? 2 : 1;
  const floors = new Map<number, number>();
  sections.forEach((sec, k) => {
    for (const i of sec) {
      const f = k >= sections.length - pool ? z0 - 1 : z0;
      floors.set(i, Math.min(floors.get(i) ?? 99, f));
    }
  });
  const mid = (sec: number[]) => sec[Math.floor((sec.length - 1) / 2)];
  const course = sections.map(mid).reverse();
  // worn, not cut: the mouth's jambs eaten back a tile to a varying height, its lintel a level higher
  // here and there where the rock above allows, and the walls notched inside; never at the floor, so
  // the water still leaves by the mouth alone (the support rule checks what is left)
  const wear = new Map<number, number>();
  const step = p[0] + p[1] * W;
  const rock = (i: number) => {
    const x = i % W;
    const y = (i - x) / W;
    return inside(W, H, x, y) && !keep[i] && !c.near?.[i] && !inp.plants[i] && !used[i] && !floors.has(i) && mask[i] === plainMask(heights[i]) && heights[i] >= ceil + 1;
  };
  const eat = (i: number, lo: number, hi: number) => {
    if (hi > lo) wear.set(i, (wear.get(i) ?? 0) | bits(lo, hi));
  };
  sections.forEach((sec, k) => {
    const sides = [sec[0] - step, sec[sec.length - 1] + step];
    if (k === 0) {
      for (const j of sides) if (rock(j) && rng.float() < 0.7) eat(j, z0 + 1, Math.min(ceil, z0 + 2 + rng.int(0, high)));
      for (const i of sec) if (heights[i] >= ceil + 2 && rng.float() < 0.5) eat(i, ceil, ceil + 1);
    } else if (k < sections.length - pool) for (const j of sides) if (rock(j) && rng.float() < 0.2) eat(j, z0 + 1, z0 + 2);
  });
  return { floors, tiles: [...floors.keys()], ceil, spring: course[0], course, length: sections.length, width, roof, wear };
}

// --------------------------------------------------------------------------------- start overhang

function startOverhang(c: Ctx): { forms: FormPlan[]; why: string } {
  const { inp, mask, used, rng } = c;
  const { W, H, heights, water, keep } = inp;
  const st = inp.start;
  if (!st) return { forms: [], why: "no start" };
  const z = st.z;
  const N = W * H;
  const R = 8 + Math.floor(inp.vt / 25);
  const near = (x: number, y: number) => Math.max(Math.abs(x - st.x), Math.abs(y - st.y)) <= R;
  const wetBy = (i: number) => {
    const x = i % W;
    const y = (i - x) / W;
    if (water[i] > 0.01) return true;
    for (const [dx, dy] of D4) {
      const xx = x + dx;
      const yy = y + dy;
      if (xx >= 0 && yy >= 0 && xx < W && yy < H && water[yy * W + xx] > 0.01) return true;
    }
    return false;
  };
  // the start's level ground: dry tiles at its floor joined to its 3×3
  const foot = new Uint8Array(N);
  const q: number[] = [];
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      const i = (st.y + dy) * W + st.x + dx;
      foot[i] = 1;
      q.push(i);
    }
  for (let k = 0; k < q.length; k++) {
    const i = q[k];
    const x = i % W;
    const y = (i - x) / W;
    for (const [dx, dy] of D4) {
      const xx = x + dx;
      const yy = y + dy;
      if (!inside(W, H, xx, yy, 1) || !near(xx, yy)) continue;
      const j = yy * W + xx;
      if (foot[j] || heights[j] !== z || water[j] > 0.01) continue;
      foot[j] = 1;
      q.push(j);
    }
  }
  // the cliff's face: tiles beside that ground 3 or more above it (2 high under a layer of rock)
  const face: { i: number; n: readonly [number, number]; d: number }[] = [];
  for (const f of q) {
    const x = f % W;
    const y = (f - x) / W;
    for (const n of D4) {
      const xx = x + n[0];
      const yy = y + n[1];
      if (!inside(W, H, xx, yy)) continue;
      const i = yy * W + xx;
      if (foot[i] || keep[i] || inp.plants[i] || used[i] || heights[i] < z + 3 || mask[i] !== plainMask(heights[i]) || wetBy(i)) continue;
      if (face.some((e) => e.i === i)) continue;
      face.push({ i, n, d: Math.max(Math.abs(xx - st.x), Math.abs(yy - st.y)) });
    }
  }
  if (face.length < 4) return { forms: [], why: "no cliff beside the start" };
  // one stretch of the face, from the tile nearest the start along its neighbours
  face.sort((a, b) => a.d - b.d || a.i - b.i);
  const byTile = new Map(face.map((e) => [e.i, e]));
  const most = 6 + rng.int(0, 5) + Math.floor(inp.vt / 20);
  const seedK = rng.int(0, Math.min(3, face.length));
  const stretch = [face[seedK]];
  const inStretch = new Set([face[seedK].i]);
  for (let k = 0; k < stretch.length && stretch.length < most; k++) {
    const i = stretch[k].i;
    const x = i % W;
    const y = (i - x) / W;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const j = (y + dy) * W + x + dx;
        const e = byTile.get(j);
        if (e && !inStretch.has(j) && stretch.length < most) {
          inStretch.add(j);
          stretch.push(e);
        }
      }
  }
  if (stretch.length < 3) return { forms: [], why: "the cliff beside the start is too short" };
  // worn back 1–3 tiles, the depth wandering along the face; 2 or 3 high where the rock allows. Where
  // the rock would not hold it (a thin cliff), it is worn less deep, down to a tile
  const deepest = inp.vt >= 30 ? 3 : 2;
  const depths: number[] = [];
  let depth = 1 + rng.int(0, 2);
  for (let k = 0; k < stretch.length; k++) {
    if (rng.float() < 0.45) depth = Math.max(1, Math.min(deepest, depth + (rng.float() < 0.5 ? -1 : 1)));
    depths.push(depth);
  }
  for (let most = deepest; most >= 1; most--) {
    const change = new Map<number, number>();
    let floorTiles = 0;
    let high = 0;
    stretch.forEach((e, q) => {
      const x = e.i % W;
      const y = (e.i - x) / W;
      for (let k = 0; k < Math.min(most, depths[q]); k++) {
        const xx = x + e.n[0] * k;
        const yy = y + e.n[1] * k;
        if (!inside(W, H, xx, yy)) break;
        const i = yy * W + xx;
        if (foot[i] || keep[i] || inp.plants[i] || used[i] || change.has(i) || mask[i] !== plainMask(heights[i]) || wetBy(i)) break;
        const a = Math.min(3, heights[i] - z - 1);
        if (a < 2) break;
        change.set(i, mask[i] & ~bits(z, z + a));
        floorTiles++;
        high = Math.max(high, a);
      }
    });
    if (floorTiles < 4) return { forms: [], why: "the cliff beside the start is too thin" };
    if (!commit(c, change)) continue;
    const tiles = [...change.keys()].sort((a, b) => a - b);
    return { forms: [{ id: "start-overhang", at: stretch[Math.floor(stretch.length / 2)].i, from: st.y * W + st.x, tiles, note: `${floorTiles} tiles of ground under the rock at level ${z}, up to ${high} high and ${Math.min(most, deepest)} deep, along ${stretch.length} tiles of the cliff` }], why: "" };
  }
  return { forms: [], why: "the overhang would fall" };
}

// ------------------------------------------------------------------------------------ gorge arch

/** The air an arch keeps over the water under it. */
const ARCH_CLEAR = 2;

function gorgeArches(c: Ctx, n: number): { forms: FormPlan[]; why: string } {
  const { inp, rng } = c;
  const { W, H } = inp;
  // the widest gap an arch spans grows with Verticality (the support rule spans 6 a layer)
  const widest = 6 + Math.floor(inp.vt / 6);
  const sites: Site[] = [];
  for (const r of inp.rivers) {
    const path = r.path;
    for (let k = 0; k + 1 < path.length; k++) {
      const [ax, ay] = path[k];
      const [bx, by] = path[k + 1];
      const steps = Math.max(1, Math.ceil(Math.max(Math.abs(bx - ax), Math.abs(by - ay))));
      for (let s = 0; s < steps; s += 2) {
        const x = Math.round(ax + ((bx - ax) * s) / steps);
        const y = Math.round(ay + ((by - ay) * s) / steps);
        if (!inside(W, H, x, y, MARGIN + 2)) continue;
        // across the river's run: along x when it runs mostly along y
        const across: [number, number] = Math.abs(by - ay) >= Math.abs(bx - ax) ? [1, 0] : [0, 1];
        const site = archSite(c, x, y, across, widest);
        if (site) sites.push(site);
      }
    }
  }
  if (!sites.length) return { forms: [], why: "no gorge narrow enough" };
  // the most dramatic first (the deepest under the crown), the rest by the map's own draw
  const order = shuffled(sites, rng).sort((a, b) => b.clear - a.clear);
  const forms: FormPlan[] = [];
  let why = "no gorge narrow enough";
  for (const s of order) {
    if (forms.length >= n) break;
    const plan = arch(c, s);
    if (plan) forms.push(plan);
    else why = "no arch stands over a gorge";
  }
  return { forms, why: forms.length ? "no other gorge narrow enough" : why };
}

interface Site {
  /** The gap's tiles along the crossing (from one rim to the other), at the river's tile. */
  x: number;
  y: number;
  across: [number, number];
  /** The gap: offsets from (x, y) along `across` of the last tile below the rim on each side. */
  lo: number;
  hi: number;
  /** The rims' level: the deck's top. */
  rim: number;
  /** The highest water surface under it, rounded up to a whole layer. */
  water: number;
  clear: number;
}

/** Where a crossing at (x, y) along `across` meets rims at one height a few tiles apart. */
function archSite(c: Ctx, x: number, y: number, across: [number, number], widest: number): Site | null {
  const { inp, mask, used } = c;
  const { W, heights, water, keep, plants, top } = inp;
  const i0 = y * W + x;
  if (!(water[i0] >= 0.1) || used[i0]) return null;
  const surf = (i: number) => heights[i] + (water[i] > 0 ? water[i] : 0);
  // the rims: the highest ground within reach on each side, each side's own
  const reach = Math.ceil(widest / 2) + 2;
  const rimOf = (sgn: number) => {
    let best = 0;
    for (let k = 1; k <= reach; k++) {
      const j = (y + sgn * k * across[1]) * W + x + sgn * k * across[0];
      if (!inside(inp.W, inp.H, x + sgn * k * across[0], y + sgn * k * across[1])) break;
      best = Math.max(best, heights[j]);
    }
    return best;
  };
  const rim = Math.min(rimOf(1), rimOf(-1), top);
  // the gap below the rims' level, and the water in it
  let lo = 0;
  let hi = 0;
  let w = 0;
  const open = (k: number) => {
    const xx = x + k * across[0];
    const yy = y + k * across[1];
    if (!inside(inp.W, inp.H, xx, yy)) return null;
    return yy * W + xx;
  };
  for (let k = 0; ; k--) {
    const j = open(k);
    if (j === null || k < -reach) return null;
    if (heights[j] >= rim) break;
    lo = k;
  }
  for (let k = 0; ; k++) {
    const j = open(k);
    if (j === null || k > reach) return null;
    if (heights[j] >= rim) break;
    hi = k;
  }
  const gap = hi - lo + 1;
  if (gap < 3 || gap > widest) return null;
  for (let k = lo; k <= hi; k++) {
    const j = open(k)!;
    if (keep[j] || plants[j] || used[j] || mask[j] !== plainMask(heights[j])) return null;
    w = Math.max(w, Math.ceil(surf(j)));
  }
  // the rims stand dry and plain, and the arch keeps its air over the water
  for (const k of [lo - 1, hi + 1]) {
    const j = open(k)!;
    if (water[j] > 0.01 || mask[j] !== plainMask(heights[j])) return null;
  }
  const clear = rim - 1 - w;
  if (clear < ARCH_CLEAR + 1) return null;
  return { x, y, across, lo, hi, rim, water: w, clear };
}

/** The arch at a site: its span filled between the rims from its lowest layer to the deck, and
 *  what the support rule would take taken away; null when no deck closes over the gap. */
function arch(c: Ctx, s: Site): FormPlan | null {
  const { inp, mask, used, rng } = c;
  const { W, H, heights, keep, plants } = inp;
  const along: [number, number] = [s.across[1], s.across[0]];
  // the deck 2–3 wide along the river, so it reads as an arch from the gorge, not a plank
  const wide = 2 + rng.int(0, 2);
  const band: number[] = [];
  for (let o = 0; o < wide; o++)
    for (let k = s.lo; k <= s.hi; k++) {
      const x = s.x + k * s.across[0] + o * along[0];
      const y = s.y + k * s.across[1] + o * along[1];
      if (!inside(W, H, x, y)) return null;
      const i = y * W + x;
      if (keep[i] || plants[i] || used[i] || mask[i] !== plainMask(heights[i])) return null;
      // (only the gap's own tiles: a row whose ground there rises to the rim is rim already)
      if (heights[i] < s.rim) band.push(i);
    }
  if (band.length < 3) return null;
  const topLayer = s.rim - 1;
  const N = W * H;
  // its feet stand 2 or more over the water under every row of it, not only the middle one
  let wet = s.water;
  for (const i of band) wet = Math.max(wet, Math.ceil(heights[i] + (inp.water[i] > 0 ? inp.water[i] : 0)));
  const feet = wet + ARCH_CLEAR;
  if (feet > topLayer) return null;
  // an arch's curve: its underside low at the feet and high at the crown, (1 − (2t − 1)²) across the
  // span, worn a level higher or lower here and there; a crown 2 layers thick where the gorge leaves
  // room (one where it does not), sometimes 3, and thicker only where a thinner one would not stand
  const span = Math.max(1, s.hi - s.lo);
  const wear = band.map(() => (rng.float() < 0.25 ? (rng.float() < 0.5 ? -1 : 1) : 0));
  const first = topLayer - 1 - (rng.float() < 0.35 ? 1 : 0);
  for (let crown = Math.max(feet, first); crown >= feet; crown--) {
    const kept = new Map<number, number>();
    band.forEach((i, q) => {
      const k = s.across[0] ? (i % W) - s.x : Math.floor(i / W) - s.y;
      const t = (k - s.lo) / span;
      const lift = 1 - (2 * t - 1) * (2 * t - 1);
      const under = Math.max(feet, Math.min(crown, feet + Math.round((crown - feet) * lift) + wear[q]));
      kept.set(i, mask[i] | bits(Math.max(under, heights[i]), s.rim));
    });
    // the rule's own shape: what nothing holds up is not there
    const trial = mask.slice();
    for (const [i, m] of kept) trial[i] = m;
    const falls = unsupportedVoxels({ W, H, mask: trial });
    for (const i of band) {
      let m = kept.get(i)!;
      for (let z = feet; z < s.rim; z++) if (falls[z * N + i]) m &= ~(1 << z);
      kept.set(i, m);
    }
    if (!band.every((i) => kept.get(i)! & (1 << topLayer))) continue;
    if (!commit(c, kept)) return null;
    // the crown: the band's middle, and the air under it
    const mid = band[Math.floor((s.hi - s.lo) / 2)];
    const under = lowestSolidAbove(kept.get(mid)!, heights[mid]);
    const mx = mid % W;
    const my = Math.floor(mid / W);
    const fx = Math.max(0, Math.min(W - 1, mx + along[0] * 12));
    const fy = Math.max(0, Math.min(H - 1, my + along[1] * 12));
    return { id: "gorge-arch", at: mid, from: fy * W + fx, tiles: band.slice().sort((a, b) => a - b), note: `a span ${s.hi - s.lo + 1} across and ${wide} wide at level ${s.rim}, ${under - wet} levels of air over the water at its crown` };
  }
  return null;
}

/** The first solid layer at or above `from` in a mask (the underside over air). */
function lowestSolidAbove(m: number, from: number): number {
  for (let z = from; z < TERRAIN_LAYERS; z++) if (m & (1 << z)) return z;
  return TERRAIN_LAYERS;
}
