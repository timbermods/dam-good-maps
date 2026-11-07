// 3D forms grown on a finished map (D118, D123, D138, D488; investigation/terrain3d/DESIGN.md §5.2):
// the first three of 3D-b's processes, each a site finder that reads the land, its water and its
// start, and a carver built from the support rule (terrain/support.ts). Nothing is stamped: a form
// stands where the land offers its place, shaped by that place, and a map whose land offers none
// has none (failure is allowed, D138 (2)).
//
// - A spring cave feeding the river: where a river rises at a cliff's foot, its spring moves into
//   the rock behind it. A gallery 2–3 wide and 2–3 high runs into the cliff, wiggling, with a pool a
//   level below its mouth at the back, where the spring's row now stands; its water leaves by the
//   mouth into the river's head. Worn, never a box: a rough arch of a mouth, a gallery whose width,
//   roof and walls wander, a domed chamber at its back.
// - An overhang sheltering the start: where the start's level ground meets a cliff, the cliff's
//   foot is worn back 1–3 tiles along a stretch of its face, as soft rock under a harder cap, so the
//   upper cliff hangs over level ground beside the start (2–3 high, the rock above holding it).
// - An arch over a gorge: where a river runs between rims at one height a few tiles apart, the rock
//   spans the gorge at the rims' level, as the remnant of a roof the river wore through: the span is
//   filled between the rims and the support rule takes what nothing holds up, leaving a corbelled
//   arch, its crown 2 or more above the water. Worn, never a plank: one spine row whole at the rims'
//   level, the rows beside it thinner, waisted and notched, its feet flared.
//
// - An arch worn through rock (D503): where a thin ridge, fin or headland of rock stands between low
//   ground or water on both sides, open beyond each side, a window is worn through it at the low
//   ground's level, 2–4 wide and 3 or more high under a roof of 1–2 levels, its underside curved and
//   worn; kept only where the game's camera sees through it to the land or water beyond, both ways
//   (analysis/seeThrough.ts). On Islands a sea arch through a headland, by a lake a lakeside arch, in
//   a canyon an arch in a fin: the land decides which.
// - An overhanging cliff (D503): where a cliff 4 or more high stands over level dry ground anywhere on
//   the map, its foot is worn back 2–3 tiles along a stretch of its face, as the start's overhang is.
//
// The surface is kept wherever a form can keep it: a cave, an overhang and an arch worn through rock
// are worn below the top (the land seen from above does not change); only a gorge arch's deck is new
// ground, over the gorge. An arch and an overhang are kept only where they read as one (D503): an
// arch open through, an overhang's roof two or more tiles deep.
// Exact arithmetic only (num.ts): integers and comparisons.

import { bestHeading, readsThrough, roofDepths, SEE_HEADINGS, seeThrough, shelters, underRock } from "../analysis/seeThrough";
import type { Rng } from "../math/rng";
import { plainMask, TERRAIN_LAYERS } from "../terrain/runs";
import { unsupportedVoxels } from "../terrain/support";

export const FORMS = ["spring-cave", "start-overhang", "gorge-arch", "rock-arch", "cliff-overhang"] as const;
export type FormId = (typeof FORMS)[number];

/** The outcome in a player's words (D138 (1)). */
export const FORM_TEXT: Record<FormId, string> = {
  "spring-cave": "A spring rises inside a cave and feeds the river.",
  "start-overhang": "An overhang shelters the start: the cliff beside it hangs over level ground.",
  "gorge-arch": "A natural arch spans a gorge, the river running under it.",
  "rock-arch": "A natural arch is worn through the rock, the land beyond seen under it.",
  "cliff-overhang": "A cliff overhangs the ground at its foot, a shelter under the rock.",
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
  /** An arch worn through rock: over water or dry ground. */
  over?: "water" | "land";
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
      const grown = id === "spring-cave" ? springCaves(ctx, n) : id === "start-overhang" ? startOverhang(ctx) : id === "gorge-arch" ? gorgeArches(ctx, n) : id === "rock-arch" ? rockArches(ctx, n) : cliffOverhangs(ctx, n);
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

/** Apply a form's change and keep it only when nothing falls (the support rule) and, when asked,
 *  when it reads as what it is (`reads`, on the terrain with it); the tiles and a one-tile ring
 *  round them are then taken, so no two forms touch. */
function commit(c: Ctx, change: Map<number, number>, reads?: () => boolean): boolean {
  const { W, H } = c.inp;
  const before = new Map<number, number>();
  for (const [i, m] of change) {
    before.set(i, c.mask[i]);
    c.mask[i] = m;
  }
  const falls = unsupportedVoxels({ W, H, mask: c.mask });
  let fell = false;
  for (let k = 0; k < falls.length && !fell; k++) if (falls[k]) fell = true;
  if (fell || (reads && !reads())) {
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
      for (const [i, floor] of g.floors) out.set(i, c.mask[i] & ~bits(floor, worn ? (g.fills.get(i) ?? g.ceil) : g.ceil) & ~(worn ? (g.wear.get(i) ?? 0) : 0));
      if (worn) for (const [i, w] of g.wear) if (!out.has(i)) out.set(i, c.mask[i] & ~w);
      return out;
    };
    let change = carve(true);
    if (!commit(c, change)) {
      // (without the corners left in, else cut plain)
      g.fills.clear();
      change = carve(true);
      if (!commit(c, change)) {
        change = carve(false);
        if (!commit(c, change)) {
          why = "a cave's roof would fall";
          continue;
        }
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
  /** Voxels worn away round the mouth, in the roof and in the walls, by tile (bits). */
  wear: Map<number, number>;
  /** Gallery tiles whose roof comes a layer lower when worn (a corner left in): their ceiling. */
  fills: Map<number, number>;
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
  const mid = (sec: number[]) => sec[Math.floor((sec.length - 1) / 2)];
  // its course runs down the gallery's middle, the bulges below aside
  const course = sections.map(mid).reverse();
  const step = p[0] + p[1] * W;
  // never a box: inside, the gallery bulges a tile to one side here and there, so its width wanders
  // along its length (not at the mouth, whose outline the wear below shapes). A bulge is taken only
  // where its own neighbours all stand through the gallery's air, so its water still leaves by the
  // mouth alone
  const galleryTiles = new Set(sections.flat());
  const holds = (j: number) => {
    const x = j % W;
    const y = (j - x) / W;
    if (!ok(j, x, y)) return false;
    for (const [dx, dy] of D4) {
      const n = (y + dy) * W + x + dx;
      if (galleryTiles.has(n)) continue;
      if (heights[n] < ceil || mask[n] !== plainMask(heights[n]) || used[n] || keep[n]) return false;
    }
    return true;
  };
  for (let k = 1; k < sections.length; k++) {
    if (rng.float() >= 0.4) continue;
    const sec = sections[k];
    const left = rng.float() < 0.5;
    const j = left ? sec[0] - step : sec[sec.length - 1] + step;
    if (!holds(j)) continue;
    if (left) sec.unshift(j);
    else sec.push(j);
    galleryTiles.add(j);
  }
  // the pool: the back two sections (one on a short gallery), a level below the mouth's floor
  const pool = sections.length >= 5 ? 2 : 1;
  const floors = new Map<number, number>();
  sections.forEach((sec, k) => {
    for (const i of sec) {
      const f = k >= sections.length - pool ? z0 - 1 : z0;
      floors.set(i, Math.min(floors.get(i) ?? 99, f));
    }
  });
  // worn, not cut (the support rule checks what is left): the mouth a rough arch, its middle a level
  // higher where the rock above allows and a corner left in, its jambs eaten back a tile (two at
  // times) to varying heights; inside, the roof a level higher here and there, mostly down its
  // middle, a corner left in, the walls notched at varying heights; the back chamber domed and worn
  // wider. Never at the floor, so the water still leaves by the mouth alone
  const wear = new Map<number, number>();
  const fills = new Map<number, number>();
  const eat = (i: number, lo: number, hi: number) => {
    if (hi > lo) wear.set(i, (wear.get(i) ?? 0) | bits(lo, hi));
  };
  // (a wall tile that may be eaten from z0 + 1 to `hi`: rock that is no part of the gallery, standing
  // over the notch, whose own neighbours stand as high, so a notch never opens a window out of the
  // cliff; at the mouth, open to the face)
  const rock = (i: number, hi: number, open: boolean) => {
    const x = i % W;
    const y = (i - x) / W;
    if (!(inside(W, H, x, y) && !keep[i] && !c.near?.[i] && !inp.plants[i] && !used[i] && !floors.has(i) && mask[i] === plainMask(heights[i]) && heights[i] >= hi + CAVE_ROOF)) return false;
    if (open) return true;
    for (const [dx, dy] of D4) {
      const n = (y + dy) * W + x + dx;
      if (!floors.has(n) && heights[n] < hi) return false;
    }
    return true;
  };
  // (a gallery tile's roof raised a level: its rock still stands CAVE_ROOF over it, and every
  // neighbour outside the gallery holds that layer; the mouth's own face is open)
  const face = -d[0] - d[1] * W;
  const raise = (i: number, mouth: boolean, by = 1) => {
    if (heights[i] < ceil + by + CAVE_ROOF) return false;
    const x = i % W;
    const y = (i - x) / W;
    for (const [dx, dy] of D4) {
      const n = (y + dy) * W + x + dx;
      if (floors.has(n) || (mouth && n === i + face)) continue;
      if (heights[n] < ceil + by) return false;
    }
    eat(i, ceil, ceil + by);
    return true;
  };
  // (a corner left in: the layer under the roof kept on a side tile, where the gallery is 3 high)
  const corner = (sec: number[]) => {
    if (high >= 3 && sec.length >= 3) fills.set(rng.float() < 0.5 ? sec[0] : sec[sec.length - 1], ceil - 1);
  };
  const jamb = (j: number, open: boolean) => {
    const hi = Math.min(ceil, z0 + 2 + rng.int(0, high));
    if (!rock(j, hi, open)) return 0;
    eat(j, z0 + 1, hi);
    return hi;
  };
  sections.forEach((sec, k) => {
    const sides = [sec[0] - step, sec[sec.length - 1] + step];
    const middle = sec.length >= 3 ? sec.slice(1, -1) : [sec[rng.int(0, sec.length)]];
    if (k === 0) {
      // (the mouth opens wider and higher than the gallery behind it: its middle up a level, two
      // where the rock is thick, the next section's middle up a level too)
      const tall = rng.float() < 0.6;
      for (const i of middle) if (!(tall && raise(i, true, 2))) raise(i, true);
      // (one shoulder up a level, so the arch leans)
      if (sec.length >= 3 && rng.float() < 0.4) raise(rng.float() < 0.5 ? sec[0] : sec[sec.length - 1], true);
      if (rng.float() < 0.6) corner(sec);
      sides.forEach((j, s) => {
        if (rng.float() >= 0.85) return;
        const hi = jamb(j, true);
        // (now and then flared a second tile out, lower)
        const j2 = j + (s ? step : -step);
        if (hi >= z0 + 3 && rng.float() < 0.45 && rock(j2, z0 + 2, true)) eat(j2, z0 + 1, z0 + 2);
      });
    } else if (k >= sections.length - pool) {
      for (const i of middle) if (rng.float() < 0.7) raise(i, false);
      for (const j of sides) if (rng.float() < 0.55) jamb(j, false);
    } else {
      for (const i of middle) if (rng.float() < (k === 1 ? 0.75 : 0.4)) raise(i, false);
      if (rng.float() < 0.3) corner(sec);
      for (const j of sides) if (rng.float() < 0.35) jamb(j, false);
    }
  });
  // (a corner never under a raised roof, and only beside a wall still standing at its layer, which
  // holds it: nothing hangs from the roof)
  for (const i of [...fills.keys()]) {
    const x = i % W;
    const y = (i - x) / W;
    const held = D4.some(([dx, dy]) => {
      const n = (y + dy) * W + x + dx;
      return !floors.has(n) && heights[n] >= ceil && !((wear.get(n) ?? 0) & (1 << (ceil - 1)));
    });
    if (!held || (wear.get(i) ?? 0) & bits(ceil, ceil + 1)) fills.delete(i);
  }
  return { floors, tiles: [...floors.keys()], ceil, fills, spring: course[0], course, length: sections.length, width, roof, wear };
}

// --------------------------------------------------------------------------------- start overhang

function startOverhang(c: Ctx): { forms: FormPlan[]; why: string } {
  const { inp } = c;
  const { W, H, heights, water } = inp;
  const st = inp.start;
  if (!st) return { forms: [], why: "no start" };
  const z = st.z;
  const N = W * H;
  const R = 8 + Math.floor(inp.vt / 25);
  const near = (x: number, y: number) => Math.max(Math.abs(x - st.x), Math.abs(y - st.y)) <= R;
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
  const got = wearBack(c, foot, q, z, st.x, st.y, 3, { short: "no cliff beside the start", tooShort: "the cliff beside the start is too short", thin: "the cliff beside the start is too thin", fell: "the overhang would fall" });
  if (typeof got === "string") return { forms: [], why: got };
  return { forms: [{ id: "start-overhang", at: got.at, from: st.y * W + st.x, tiles: got.tiles, note: got.note }], why: "" };
}

/** Overhanging cliffs anywhere on the map (D503): where a cliff 4 or more high stands over level dry
 *  ground that runs out from its foot, its foot worn back as the start's overhang is; and where a
 *  shore's cliff stands 3 or more over open water (a sea's, a lake's), a notch worn back at the
 *  waterline, its floor just over the water: a sea cave's ledge on Islands, a lakeside overhang. */
function cliffOverhangs(c: Ctx, n: number): { forms: FormPlan[]; why: string } {
  const { inp, mask, used, rng } = c;
  const { W, H, heights, water, keep, plants } = inp;
  const N = W * H;
  const wet = (i: number) => water[i] > 0.01;
  // the level an overhang's floor stands at beside tile i: dry ground's own, just over open water's
  const level = (i: number) => (wet(i) ? Math.ceil(heights[i] + water[i]) : heights[i]);
  // a tile with level ground or open water running two tiles out from a cliff's foot
  const sites: number[] = [];
  for (let y = MARGIN + 2; y < H - MARGIN - 2; y++)
    for (let x = MARGIN + 2; x < W - MARGIN - 2; x++) {
      const i = y * W + x;
      if (keep[i] || used[i]) continue;
      const z = level(i);
      const rise = wet(i) ? 3 : 4;
      for (const [dx, dy] of D4) {
        const j = i + dx + dy * W;
        if (wet(j) || heights[j] < z + rise || mask[j] !== plainMask(heights[j]) || keep[j] || plants[j] || used[j]) continue;
        const b1 = i - dx - dy * W;
        const b2 = b1 - dx - dy * W;
        if (wet(b1) !== wet(i) || wet(b2) !== wet(i) || level(b1) !== z || level(b2) !== z) continue;
        sites.push(i);
        break;
      }
    }
  if (!sites.length) return { forms: [], why: "no cliff over level ground or water" };
  const forms: FormPlan[] = [];
  let why = "no cliff over level ground or water";
  const tried = new Set<string>();
  let tries = 0;
  for (const s of shuffled(sites, rng)) {
    if (forms.length >= n || tries >= CLIFF_TRIES) break;
    const sx = s % W;
    const sy = (s - sx) / W;
    // (one a stretch of cliff)
    const key = `${sx >> 3},${sy >> 3}`;
    if (tried.has(key) || used[s]) continue;
    tried.add(key);
    tries++;
    const z = level(s);
    const shore = wet(s);
    // its level ground (or its water): tiles at its level joined to it, within 6
    const foot = new Uint8Array(N);
    const q = [s];
    foot[s] = 1;
    for (let k = 0; k < q.length; k++) {
      const i = q[k];
      const x = i % W;
      const y = (i - x) / W;
      for (const [dx, dy] of D4) {
        const xx = x + dx;
        const yy = y + dy;
        if (!inside(W, H, xx, yy, 1) || Math.max(Math.abs(xx - sx), Math.abs(yy - sy)) > 6) continue;
        const j = yy * W + xx;
        if (foot[j] || wet(j) !== shore || level(j) !== z || keep[j] || used[j]) continue;
        foot[j] = 1;
        q.push(j);
      }
    }
    if (q.length < 8) continue;
    const got = wearBack(c, foot, q, z, sx, sy, shore ? 3 : 4, { short: "no cliff over level ground or water", tooShort: "the cliff is too short", thin: "the cliff is too thin", fell: "the overhang would fall" }, shore);
    if (typeof got === "string") {
      why = got;
      continue;
    }
    // (best seen from the level ground or the water in front of it, a few tiles out)
    const ax = got.at % W;
    const ay = (got.at - ax) / W;
    const fx = Math.max(0, Math.min(W - 1, sx + Math.sign(sx - ax) * 8));
    const fy = Math.max(0, Math.min(H - 1, sy + Math.sign(sy - ay) * 8));
    forms.push({ id: "cliff-overhang", at: got.at, from: fy * W + fx, tiles: got.tiles, over: shore ? "water" : "land", note: `${got.note}${shore ? ", over the water" : ""}` });
  }
  return { forms, why: forms.length ? "no other cliff over level ground or water" : why };
}

/** How many places an overhanging cliff is tried at, at most. */
const CLIFF_TRIES = 12;

/** A stretch of the cliff beside level ground `foot` (at floor `z`) worn back 2–3 tiles, from the face
 *  tile nearest (cx, cy) along its neighbours (the face `rise` or more over the ground); kept only
 *  where nothing falls and its roof reads as a shelter, two or more tiles deep (D503). At a `shore`,
 *  `foot` is the water and `z` the level just over it. */
function wearBack(c: Ctx, foot: Uint8Array, q: readonly number[], z: number, cx: number, cy: number, rise: number, why: { short: string; tooShort: string; thin: string; fell: string }, shore = false): { at: number; tiles: number[]; note: string } | string {
  const { inp, mask, used, rng } = c;
  const { W, H, heights, water, keep } = inp;
  // (no water beside the rock worn, so none runs in under it; at a shore's notch, whose floor stands
  // over the water, only its own tile dry)
  const wetBy = (i: number) => {
    const x = i % W;
    const y = (i - x) / W;
    if (water[i] > 0.01) return true;
    if (shore) return false;
    for (const [dx, dy] of D4) {
      const xx = x + dx;
      const yy = y + dy;
      if (xx >= 0 && yy >= 0 && xx < W && yy < H && water[yy * W + xx] > 0.01) return true;
    }
    return false;
  };
  // the cliff's face: tiles beside that ground `rise` or more above it (2 high under a layer of rock)
  const face: { i: number; n: readonly [number, number]; d: number }[] = [];
  for (const f of q) {
    const x = f % W;
    const y = (f - x) / W;
    for (const n of D4) {
      const xx = x + n[0];
      const yy = y + n[1];
      if (!inside(W, H, xx, yy)) continue;
      const i = yy * W + xx;
      if (foot[i] || keep[i] || inp.plants[i] || used[i] || heights[i] < z + rise || mask[i] !== plainMask(heights[i]) || wetBy(i)) continue;
      if (face.some((e) => e.i === i)) continue;
      face.push({ i, n, d: Math.max(Math.abs(xx - cx), Math.abs(yy - cy)) });
    }
  }
  if (face.length < 4) return why.short;
  // one stretch of the face, from the tile nearest (cx, cy) along its neighbours
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
  // (a shelter's middle stands two deep between its tapered ends: four tiles of face at least)
  if (stretch.length < 4) return why.tooShort;
  // worn back 2–3 tiles, the depth wandering along the face; 2 or 3 high where the rock allows. Where
  // the rock would not hold it (a thin cliff), it is worn less deep, down to two: a roof a tile deep
  // reads as a ridge's lip, not a shelter (D503)
  const deepest = inp.vt >= 30 ? 3 : 2;
  const depths: number[] = [];
  let depth = 1 + rng.int(0, 2);
  for (let k = 0; k < stretch.length; k++) {
    if (rng.float() < 0.45) depth = Math.max(1, Math.min(deepest, depth + (rng.float() < 0.5 ? -1 : 1)));
    depths.push(Math.max(2, depth));
  }
  // worn as rock wears, not cut (a box's flat face reads as a doorway): its ends taper into the face,
  // a tile deep, two beside them; the opening's height wanders along the face (2 or 3); the roof comes
  // down a level toward the back; and here and there the lip hangs a level lower than the hollow behind
  const ends = stretch.map((e) => {
    const x = e.i % W;
    const y = (e.i - x) / W;
    let n = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && inStretch.has((y + dy) * W + x + dx)) n++;
    return n <= 1;
  });
  stretch.forEach((e, q) => {
    if (ends[q]) depths[q] = 1;
    else if (stretch.some((o, r) => ends[r] && Math.max(Math.abs((o.i % W) - (e.i % W)), Math.abs(Math.floor(o.i / W) - Math.floor(e.i / W))) <= 1)) depths[q] = Math.min(depths[q], 2);
  });
  const tall: number[] = [];
  let up = 2 + rng.int(0, 2);
  for (let k = 0; k < stretch.length; k++) {
    if (rng.float() < 0.4) up = 5 - up;
    tall.push(up);
  }
  const lips = stretch.map(() => rng.float() < 0.3);
  const backs = stretch.map(() => rng.float() < 0.5);
  let thin = false;
  for (let most = deepest; most >= 2; most--) {
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
        const room = Math.min(3, heights[i] - z - 1);
        if (room < 2) break;
        // (the lip a level under the hollow behind it; the back a level under the front)
        const d = Math.min(most, depths[q]);
        const lower = (k === 0 && d > 1 && lips[q]) || (k > 0 && k === d - 1 && (k >= 2 || backs[q]));
        const a = Math.max(2, Math.min(room, tall[q] - (lower ? 1 : 0)));
        change.set(i, mask[i] & ~bits(z, z + a));
        floorTiles++;
        high = Math.max(high, a);
      }
    });
    if (floorTiles < 4) {
      thin = true;
      continue;
    }
    // (kept where nothing falls and its roof reads as a shelter: three or more tiles two deep)
    if (!commit(c, change, () => shelters(roofDepths(mask, W, H, change.keys())))) continue;
    const tiles = [...change.keys()].sort((a, b) => a - b);
    return { at: stretch[Math.floor(stretch.length / 2)].i, tiles, note: `${floorTiles} tiles of ground under the rock at level ${z}, up to ${high} high and ${Math.min(most, deepest)} deep, along ${stretch.length} tiles of the cliff` };
  }
  return thin ? why.thin : why.fell;
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
  const free = (i: number) => !keep[i] && !plants[i] && !used[i] && mask[i] === plainMask(heights[i]);
  // the deck 2–3 wide along the river, so it reads as an arch from the gorge, not a plank; one row,
  // its spine, runs whole at the rims' level, the others worn
  const wide = 2 + rng.int(0, 2);
  const spine = wide === 3 ? 1 : rng.int(0, 2);
  interface Cell {
    i: number;
    o: number;
    k: number;
  }
  const band: Cell[] = [];
  for (let o = 0; o < wide; o++)
    for (let k = s.lo; k <= s.hi; k++) {
      const x = s.x + k * s.across[0] + o * along[0];
      const y = s.y + k * s.across[1] + o * along[1];
      if (!inside(W, H, x, y)) return null;
      const i = y * W + x;
      if (!free(i)) return null;
      // (only the gap's own tiles: a row whose ground there rises to the rim is rim already)
      if (heights[i] < s.rim) band.push({ i, o, k });
    }
  if (band.length < 3 || !band.some((e) => e.o === spine)) return null;
  const topLayer = s.rim - 1;
  const N = W * H;
  const surfOf = (i: number) => Math.ceil(heights[i] + (inp.water[i] > 0 ? inp.water[i] : 0));
  // its feet stand 2 or more over the water under every row of it, not only the middle one
  let wet = s.water;
  for (const e of band) wet = Math.max(wet, surfOf(e.i));
  const feet = wet + ARCH_CLEAR;
  if (feet > topLayer) return null;
  // its feet flare: a buttress a row out on either face, by each rim, now and then, lower than the
  // deck, where the gorge's floor there is free and its water no higher than the rest
  for (const o of [-1, wide])
    for (const k of [s.lo, s.lo + 1, s.hi - 1, s.hi]) {
      if (rng.float() >= 0.55) continue;
      const x = s.x + k * s.across[0] + o * along[0];
      const y = s.y + k * s.across[1] + o * along[1];
      if (!inside(W, H, x, y)) continue;
      const i = y * W + x;
      if (free(i) && heights[i] < s.rim && surfOf(i) <= wet && !band.some((e) => e.i === i)) band.push({ i, o, k });
    }
  // the deck worn from above off the spine: its faces waisted toward the crown, a level or two lower,
  // through where that leaves nothing, and a level off here and there elsewhere; the buttresses
  // stand 1–2 under the rims
  const span = Math.max(1, s.hi - s.lo);
  const top = band.map((e) => {
    if (e.o === spine) return s.rim;
    if (e.o < 0 || e.o >= wide) return s.rim - 1 - rng.int(0, 2);
    const t = (e.k - s.lo) / span;
    if (Math.abs(t - 0.5) < 0.22 && rng.float() < 0.65) return s.rim - 1 - rng.int(0, 2);
    return rng.float() < 0.2 ? s.rim - 1 : s.rim;
  });
  // an arch's curve: its underside low at the feet and high at the crown, (1 − (2t − 1)²) across the
  // span, worn a level higher or lower here and there; a crown 2 layers thick where the gorge leaves
  // room (one where it does not), sometimes 3, and thicker only where a thinner one would not stand.
  // Each face's curve is its own: its crown off the spine's by a tile and its underside up to a level
  // higher, so the arch thins toward its faces and no two rows are alike
  const shift = new Map<number, number>();
  const thin = new Map<number, number>();
  for (let o = -1; o <= wide; o++) {
    shift.set(o, o === spine ? 0 : rng.int(-1, 2));
    thin.set(o, o === spine ? 0 : rng.int(0, 2));
  }
  const wear = band.map(() => (rng.float() < 0.25 ? (rng.float() < 0.5 ? -1 : 1) : 0));
  const first = topLayer - 1 - (rng.float() < 0.35 ? 1 : 0);
  for (let crown = Math.max(feet, first); crown >= feet; crown--) {
    const kept = new Map<number, number>();
    band.forEach((e, q) => {
      const t = Math.max(0, Math.min(1, (e.k - shift.get(e.o)! - s.lo) / span));
      const lift = 1 - (2 * t - 1) * (2 * t - 1);
      const under = Math.max(feet, Math.min(crown, feet + Math.round((crown - feet) * lift) + wear[q]) + thin.get(e.o)!);
      kept.set(e.i, mask[e.i] | bits(Math.max(under, heights[e.i]), Math.max(top[q], heights[e.i])));
    });
    // the rule's own shape: what nothing holds up is not there
    const trial = mask.slice();
    for (const [i, m] of kept) trial[i] = m;
    const falls = unsupportedVoxels({ W, H, mask: trial });
    for (const e of band) {
      let m = kept.get(e.i)!;
      for (let z = feet; z < s.rim; z++) if (falls[z * N + e.i]) m &= ~(1 << z);
      kept.set(e.i, m);
    }
    // the spine closes over the gap at the rims' level
    if (!band.every((e) => e.o !== spine || kept.get(e.i)! & (1 << topLayer))) continue;
    for (const [i, m] of kept) if (m === mask[i]) kept.delete(i);
    // (kept where nothing falls and the game's camera sees through under it, both ways along the gorge,
    // to the river beyond: an arch, not a grotto closed at the back, D503)
    const wetAt = (i: number, z: number) => inp.water[i] > 0.01 && z >= heights[i] && z < heights[i] + inp.water[i];
    let seen: ReturnType<typeof seeThrough> | null = null;
    const reads = () => {
      seen = seeThrough({ W, H, mask, wet: wetAt }, underRock(mask, N, kept.keys()));
      return readsThrough(seen, [along[0] ? 0 : 2]);
    };
    if (!commit(c, kept, reads)) return null;
    const s2 = seen! as ReturnType<typeof seeThrough>;
    // the crown: the spine's middle, and the air under it
    const row = band.filter((e) => e.o === spine);
    const mid = row[Math.floor((row.length - 1) / 2)].i;
    const under = lowestSolidAbove(kept.get(mid)!, heights[mid]);
    const mx = mid % W;
    const my = Math.floor(mid / W);
    // (best seen from the end of the gorge its sightlines come from most)
    const fwd = along[0] ? s2.ways[0][0] + s2.ways[1][0] : s2.ways[0][2] + s2.ways[1][2];
    const back = along[0] ? s2.ways[0][4] + s2.ways[1][4] : s2.ways[0][6] + s2.ways[1][6];
    const sgn = fwd >= back ? -1 : 1;
    const fx = Math.max(0, Math.min(W - 1, mx + sgn * along[0] * 12));
    const fy = Math.max(0, Math.min(H - 1, my + sgn * along[1] * 12));
    return { id: "gorge-arch", at: mid, from: fy * W + fx, tiles: [...kept.keys()].sort((a, b) => a - b), note: `a span ${s.hi - s.lo + 1} across and ${wide} wide at level ${s.rim}, ${under - wet} levels of air over the water at its crown` };
  }
  return null;
}

// ------------------------------------------------------------------------------- arch worn through rock

/** The least air under an arch worn through rock over dry ground (over water, `ARCH_CLEAR` over it). */
const ROCK_OPEN = 3;
/** How many places an arch worn through rock is tried at, at most (each a support pass and the
 *  sightlines through it). */
const ROCK_TRIES = 24;
/** How far apart two arches worn through rock stand at least (tiles). */
const ROCK_APART = 20;

/** A window through a thin wall of rock: from the low tile at (x, y) along `a`, rock `T` thick to the
 *  low tile beyond, `w` lines wide along the wall (`p`). */
interface RockSite {
  x: number;
  y: number;
  a: readonly [number, number];
  p: readonly [number, number];
  w: number;
  /** Each line's thickness, its mouths' floors and the water's surface at them (rounded up). */
  lines: { T: number; fa: number; fb: number }[];
  /** The opening's floor at its highest, the water's surface over it (0 when dry), the rock's least top. */
  floor: number;
  water: number;
  rock: number;
  score: number;
}

/** Arches worn through rock (D503): a ridge, a fin or a headland 1–4 tiles thick between low ground or
 *  water on both sides, open beyond each, worn through at the low ground's level; kept only where the
 *  game's camera sees through it both ways (analysis/seeThrough.ts `readsThrough`). The surface is kept. */
function rockArches(c: Ctx, n: number): { forms: FormPlan[]; why: string } {
  const { inp, mask, used, rng } = c;
  const { W, H, heights, water, keep, plants } = inp;
  const surf = (i: number) => heights[i] + (water[i] > 0.01 ? water[i] : 0);
  const thickest = 4 + (inp.vt >= 50 ? 1 : 0);
  const free = (i: number) => !keep[i] && !used[i] && mask[i] === plainMask(heights[i]);
  // one line through the wall from the low tile at (x, y) along a: its thickness and its mouths
  const line = (x: number, y: number, a: readonly [number, number]): { T: number; fa: number; fb: number; sa: number; sb: number; top: number } | null => {
    if (!inside(W, H, x, y, MARGIN + 3)) return null;
    const A = y * W + x;
    if (used[A] || mask[A] !== plainMask(heights[A])) return null;
    const fa = heights[A];
    const sa = surf(A);
    let T = 0;
    let top = 99;
    for (let k = 1; k <= thickest + 1; k++) {
      const xx = x + a[0] * k;
      const yy = y + a[1] * k;
      if (!inside(W, H, xx, yy, MARGIN + 3)) return null;
      const i = yy * W + xx;
      if (heights[i] >= Math.max(Math.ceil(sa) + ARCH_CLEAR, fa + ROCK_OPEN) + 1) {
        if (!free(i)) return null;
        T++;
        top = Math.min(top, heights[i]);
        continue;
      }
      break;
    }
    if (T < 1 || T > thickest) return null;
    const B = (y + a[1] * (T + 1)) * W + x + a[0] * (T + 1);
    const fb = heights[B];
    const sb = surf(B);
    if (Math.abs(fa - fb) > 2 || top < Math.max(Math.ceil(sb) + ARCH_CLEAR, fb + ROCK_OPEN) + 1) return null;
    return { T, fa, fb, sa, sb, top };
  };
  // a jamb: the wall's rock beside a window's line, standing tall enough to hold its roof
  const jamb = (x: number, y: number, a: readonly [number, number], T: number) => {
    const A = y * W + x;
    if (!inside(W, H, x, y, MARGIN)) return false;
    for (let k = 1; k <= T; k++) {
      const i = A + (a[0] + a[1] * W) * k;
      if (heights[i] < heights[A] + ROCK_OPEN + 2 || mask[i] !== plainMask(heights[i]) || used[i]) return false;
    }
    return true;
  };
  const widest = 3 + (inp.vt >= 50 ? 1 : 0);
  // open beyond a mouth: the next three tiles out no higher than the opening's floor and a level
  const open = (x: number, y: number, d: readonly [number, number], lim: number) => {
    for (let k = 1; k <= 3; k++) {
      const xx = x + d[0] * k;
      const yy = y + d[1] * k;
      if (!inside(W, H, xx, yy, 1)) return false;
      if (surf(yy * W + xx) > lim) return false;
    }
    return true;
  };
  const sites: RockSite[] = [];
  for (const a of [[1, 0], [0, 1]] as const) {
    const p: readonly [number, number] = [a[1], a[0]];
    for (let y = MARGIN + 3; y < H - MARGIN - 3; y++)
      for (let x = MARGIN + 3; x < W - MARGIN - 3; x++) {
        const first = line(x, y, a);
        if (!first) continue;
        // its lines: as many as the window is wide (2–3, 4 at Verticality 50 and above), the rock beside
        // it standing on both sides as its jambs, which hold its roof
        const lines = [first];
        while (lines.length < widest) {
          const l = line(x + p[0] * lines.length, y + p[1] * lines.length, a);
          if (!l) break;
          lines.push(l);
        }
        while (lines.length >= 2 && !(jamb(x - p[0], y - p[1], a, lines[0].T) && jamb(x + p[0] * lines.length, y + p[1] * lines.length, a, lines[lines.length - 1].T))) lines.pop();
        if (lines.length < 2) continue;
        const floor = Math.max(...lines.map((l) => Math.max(l.fa, l.fb)));
        const wet = Math.max(...lines.map((l) => Math.max(l.sa > l.fa ? l.sa : 0, l.sb > l.fb ? l.sb : 0)));
        const rock = Math.min(...lines.map((l) => l.top));
        const lim = Math.max(floor, Math.ceil(wet)) + 1;
        const mid = lines[Math.floor(lines.length / 2)];
        const mx = x + p[0] * Math.floor(lines.length / 2);
        const my = y + p[1] * Math.floor(lines.length / 2);
        if (!open(mx, my, [-a[0], -a[1]], lim) || !open(mx + a[0] * (mid.T + 1), my + a[1] * (mid.T + 1), a, lim)) continue;
        // (a plant rides on a dry arch's rock; over water under the roof it would read as standing in it)
        const tiles: number[] = [];
        lines.forEach((l, j) => {
          for (let k = 1; k <= l.T; k++) tiles.push((y + p[1] * j + a[1] * k) * W + x + p[0] * j + a[0] * k);
        });
        if (wet > 0 && tiles.some((i) => plants[i])) continue;
        const thick = Math.max(...lines.map((l) => l.T));
        // (the tallest and thinnest first: they read best)
        sites.push({ x, y, a, p, w: lines.length, lines: lines.map((l) => ({ T: l.T, fa: l.fa, fb: l.fb })), floor, water: Math.ceil(wet), rock, score: rock - Math.max(floor, Math.ceil(wet)) - thick });
      }
  }
  if (!sites.length) return { forms: [], why: "no thin rock between open ground" };
  const order = shuffled(sites, rng).sort((p, q) => q.score - p.score);
  const forms: FormPlan[] = [];
  let why = "no window through the rock reads";
  const tried = new Set<string>();
  let tries = 0;
  for (const s of order) {
    if (forms.length >= n || tries >= ROCK_TRIES) break;
    const key = `${s.x >> 2},${s.y >> 2}`;
    // (arches stand apart: one a stretch of land)
    if (tried.has(key) || forms.some((f) => Math.max(Math.abs((f.at % W) - s.x), Math.abs(Math.floor(f.at / W) - s.y)) < ROCK_APART)) continue;
    let clash = false;
    s.lines.forEach((l, j) => {
      for (let k = 0; k <= l.T + 1; k++) if (used[(s.y + s.p[1] * j + s.a[1] * k) * W + s.x + s.p[0] * j + s.a[0] * k]) clash = true;
    });
    if (clash) continue;
    tried.add(key);
    tries++;
    const plan = rockArch(c, s);
    if (plan) forms.push(plan);
  }
  return { forms, why: forms.length ? "no other window through the rock reads" : why };
}

/** The window at a site: worn through from mouth to mouth, its underside curved across its width
 *  (high in the middle, low at the jambs) and worn a level here and there, under a roof of two levels
 *  where the rock has them, one where it does not; null when nothing it leaves stands and reads. */
function rockArch(c: Ctx, s: RockSite): FormPlan | null {
  const { inp, mask, rng } = c;
  const { W, H } = inp;
  const N = W * H;
  const base = Math.max(s.floor + ROCK_OPEN, s.water + ARCH_CLEAR);
  // the opening as tall as the rock allows under two levels of roof (one where it has no more), up to
  // 6 high, more as Verticality rises
  const tallest = Math.min(s.rock - 2, Math.max(s.floor, s.water) + 6 + Math.floor(inp.vt / 25));
  const roofs = tallest >= base ? [tallest, tallest - 1, base].filter((u, k, all) => u >= base && all.indexOf(u) === k) : s.rock - 1 >= base ? [s.rock - 1] : [];
  if (!roofs.length) return null;
  const wear = new Map<number, number>();
  const cellsOf = (u: number): Map<number, number> => {
    const change = new Map<number, number>();
    s.lines.forEach((l, j) => {
      // (the underside curved across the width: the jambs a level lower, the middle as tall)
      const edge = s.w >= 3 && (j === 0 || j === s.w - 1);
      for (let k = 1; k <= l.T; k++) {
        const x = s.x + s.p[0] * j + s.a[0] * k;
        const y = s.y + s.p[1] * j + s.a[1] * k;
        const i = y * W + x;
        // the floor runs from mouth to mouth between theirs
        const f = Math.round(l.fa + ((l.fb - l.fa) * k) / (l.T + 1));
        let w = wear.get(i);
        if (w === undefined) {
          w = rng.float() < 0.25 ? (rng.float() < 0.5 ? -1 : 1) : 0;
          wear.set(i, w);
        }
        const under = Math.max(f + ROCK_OPEN, s.water + ARCH_CLEAR, Math.min(s.rock - 1, u - (edge ? 1 : 0) + w));
        change.set(i, mask[i] & ~bits(f, under));
      }
    });
    return change;
  };
  // the water a trial reads under the new roof: up to the mouths' surface, from the window's floor
  const wetAt = (i: number, z: number): boolean => {
    const h = inp.heights[i];
    const w = inp.water[i];
    if (w > 0.01 && z >= h && z < h + w) return true;
    if (s.water > 0 && cellTiles.has(i)) return z >= cellFloor.get(i)! && z < s.water - 0.5;
    return false;
  };
  const cellTiles = new Set<number>();
  const cellFloor = new Map<number, number>();
  for (const u of roofs) {
    const change = cellsOf(u);
    cellTiles.clear();
    cellFloor.clear();
    for (const [i, m] of change) {
      cellTiles.add(i);
      cellFloor.set(i, m & 1 ? bottomTop(m) : 0);
    }
    let seen: ReturnType<typeof seeThrough> | null = null;
    const reads = () => {
      seen = seeThrough({ W, H, mask, wet: wetAt }, underRock(mask, N, change.keys()));
      return readsThrough(seen, [s.a[0] ? 0 : 2]);
    };
    if (!commit(c, change, reads)) continue;
    const s2 = seen! as ReturnType<typeof seeThrough>;
    // its heart: the middle line's middle; best seen from the side its sightlines come from most
    const mid = s.lines[Math.floor(s.w / 2)];
    const k = Math.max(1, Math.round(mid.T / 2));
    const at = (s.y + s.p[1] * Math.floor(s.w / 2) + s.a[1] * k) * W + s.x + s.p[0] * Math.floor(s.w / 2) + s.a[0] * k;
    const [hx, hy] = SEE_HEADINGS[bestHeading(s2)];
    const ax = at % W;
    const ay = (at - ax) / W;
    const fx = Math.max(0, Math.min(W - 1, Math.round(ax - hx * 12)));
    const fy = Math.max(0, Math.min(H - 1, Math.round(ay - hy * 12)));
    const thick = Math.max(...s.lines.map((l) => l.T));
    const over = s.water > 0 ? "water" : "land";
    return { id: "rock-arch", at, from: fy * W + fx, tiles: [...change.keys()].sort((a, b) => a - b), over, note: `a window ${s.w} wide worn through rock ${thick} thick at level ${s.floor}, ${u - Math.max(s.floor, s.water)} high over the ${over === "water" ? "water" : "ground"} under ${s.rock - u} levels of rock; seen through to ${s2.beyond[1]} tiles at 45°` };
  }
  return null;
}

/** The top of a mask's run from z = 0. */
function bottomTop(m: number): number {
  let z = 0;
  while (z < TERRAIN_LAYERS && m & (1 << z)) z++;
  return z;
}

/** The first solid layer at or above `from` in a mask (the underside over air). */
function lowestSolidAbove(m: number, from: number): number {
  for (let z = from; z < TERRAIN_LAYERS; z++) if (m & (1 << z)) return z;
  return TERRAIN_LAYERS;
}
