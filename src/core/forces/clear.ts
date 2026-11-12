// Forces can clear sources (PLAN §20 D474, amending D257's "no force changes shelf objects except by
// riding the ground" for sources only): every force takes a Sources choice, Ride (its sources move with
// the ground) or Clear (the default, also for an operation without the choice). Clear takes a water or
// badwater source or seep only where the force destroys its ground (the force audit's S2,
// docs/progress/force-audit.md): buried 3 levels or more, cut 2 or more away, or, where the force moves
// the ground whole, in the crush zone where the ground tears (a Quake's fault, a Rift's walls); a multi-tile one if any of
// its tiles is, or if the force moved its tiles by different amounts (it rides only as one level piece, D249).
// One that only rides an intact block, or sits under a thin apron, rides as under Ride.
// The sources a force places itself always stay (Carve's river, Glaciate's meltwater, an unleashed
// source); every other object keeps riding the ground. Carve takes what it cuts away itself under Clear
// (in Rust: `removed`, as its head arrives; the rest ride its cut), Glaciate everything its ice reaches
// (its trough, the queue's item 10, brings it to this rule); the other forces' sources ride in Rust and
// Clear takes them here.
//
// No pop: a cleared source goes at the step its showing first changes one of its tiles, never all at
// the end; the force's operation keeps each one's id and that step (`cleared`).

import type { EntitySpec } from "../format/entities";
import { EMITTERS, objectTile } from "../sim/model";
import { footprint } from "./objects";

/** The Sources choice: Ride or Clear. */
export type SourcesRule = "ride" | "clear";
export const SOURCES_RULES: readonly SourcesRule[] = ["ride", "clear"];
/** A force's choice when it says none: Clear (start.ts `planForce` writes it into the request). */
export const SOURCES_DEFAULT: SourcesRule = "clear";
/** Whether a force with this choice clears its sources (none given: Clear). */
export const clears = (rule: SourcesRule | undefined): boolean => rule !== "ride";

/** What Clear takes and Ride keeps: water and badwater sources and seeps (aquifers stay as they are). */
export const CLEARABLE: ReadonlySet<string> = new Set(["WaterSource", "BadwaterSource", "WaterSeep", "BadwaterSeep"]);

/** The level a source or seep that rides stands at once its tile's ground went from `before` to `after` (D474), from
 *  level `z`. Where a force moves the column whole (`whole`: a Quake's block, a Rift's floor) it moves with it, as
 *  much as the ground moved, a cave in the column too. Where a force builds or cuts the ground, one on the surface (or
 *  above it) moves with its ground; one under a roof (a cave's, below its tile's ground) stays in its cave while the
 *  ground above is only raised or thinned, and stands on the new ground once a cut reaches its level. No force but
 *  Erode changes a cave's tile (start.ts keeps caves and the ground holding their roofs); with Erode's voxels (`mask`,
 *  bit z set where voxel z is solid) it stands on the floor of the opening it is in. Never below level 0, never in
 *  rock. Rust's carve and glacier (lib.rs `ridden_level`) do the same. */
export function riddenLevel(z: number, before: number, after: number, mask?: number, whole = false): number {
  if (whole) return Math.max(0, z + after - before);
  if (z >= before) return after + (z - before);
  if (mask === undefined) return Math.max(0, Math.min(z, after));
  const solid = (k: number) => k >= 0 && k < 32 && ((mask >>> k) & 1) === 1;
  const stands = (k: number) => (k === 0 || solid(k - 1)) && !solid(k);
  const at = Math.max(0, Math.min(31, Math.round(z)));
  for (let k = at; k >= 0; k--) if (stands(k)) return k === at ? z : k;
  for (let k = at + 1; k <= 31; k++) if (stands(k)) return k;
  return after;
}

/** A water object's seat (D290): the level its footprint's ground is cut down to, the lowest of its tiles, so no
 *  water is dammed (doc/placing.ts `levelFootprint` cuts a placed source's spring pool to it). */
export function seatLevel(heights: ArrayLike<number>, tiles: readonly number[]): number {
  let low = Infinity;
  for (const i of tiles) low = Math.min(low, heights[i]);
  return low;
}

/** Under Ride (planning's ruling of 2026-11-11), a multi-tile source or seep (a badwater source's 3 × 3, a seep's
 *  2 × 2) on ground a force moved unevenly keeps riding, its seat levelled to the lowest of its tiles as D290 levels a
 *  placed one: `after`'s heights are cut there and the source stands on the seat. Measured on the land the operation
 *  keeps, a working area's feather applied (`ease`, keep.ts `featherForce`), and cut only where that land lets the cut
 *  stand: a seat across the area's edge (a kept tile, `keep`, or one the feather holds above it), or on Erode's voxels
 *  (a tile not one plain run), is held as it was before the force (its ground, voxels and rock), the source on its old
 *  seat, so no force leaves a source the game refuses (planning's ruling of 2026-11-11). One under a roof (a cave's),
 *  one cut off by the map's edge, or one whose tiles all moved alike rides as it is. `before` holds the objects where
 *  they stood; `whole`: the force moves the ground whole (a Quake, a Rift). Rust's Carve does the same as its cut
 *  reaches one (lib.rs `level_seat`). The tiles changed. */
export function levelSeats(before: { W: number; H: number; heights: ArrayLike<number>; entities: readonly EntitySpec[]; masks?: Uint32Array; lava?: Uint32Array }, after: { W: number; H: number; heights: Uint8Array; entities: EntitySpec[]; masks?: Uint32Array; lava?: Uint32Array }, whole: boolean, keep: ArrayLike<number> | null = null, ease: ArrayLike<number> | null = null): number[] {
  const was = new Map(before.entities.map((e) => [e.id, e]));
  const kept = (i: number) => (ease ? Math.max(before.heights[i] - ease[i], Math.min(before.heights[i] + ease[i], after.heights[i])) : after.heights[i]);
  const masks = after.masks;
  const cut: number[] = [];
  for (const e of after.entities) {
    if (!CLEARABLE.has(e.template)) continue;
    const b = was.get(e.id);
    if (!b) continue;
    const tiles = footprint(after, e);
    const from = footprint(before, b);
    if (tiles.length < 2 || tiles.length !== from.length) continue;
    const anchor = b.y * before.W + b.x;
    if (b.z < before.heights[anchor]) continue;
    const dz = (k: number) => kept(tiles[k]) - before.heights[from[k]];
    if (tiles.every((_, k) => dz(k) === dz(0))) continue;
    let low = Infinity;
    for (const i of tiles) low = Math.min(low, kept(i));
    // (the other forces leave the voxels as they were: a tile is plain if they are one run to its height before or
    // after; on Erode's openings there is no level seat to cut)
    const voxels = !!masks && tiles.some((i, k) => masks[i] !== plainRun(after.heights[i]) && masks[i] !== plainRun(before.heights[from[k]]));
    // (the cut stands only where the operation keeps it: never on a kept tile, never past the feather; a seat across
    // the working area's edge, or on voxels, is held as it was instead, as the area holds the rest of it)
    if (voxels || tiles.some((i) => low !== kept(i) && ((keep !== null && keep[i] !== 0) || (ease !== null && low < before.heights[i] - ease[i])))) {
      if (!tiles.every((i, k) => i === from[k])) continue;
      for (const i of tiles) {
        const was = masks ? (before.masks?.[i] ?? plainRun(before.heights[i])) : 0;
        if (after.heights[i] === before.heights[i] && (!masks || masks[i] === was)) continue;
        if (masks) masks[i] = was;
        if (after.lava && before.lava) after.lava[i] = before.lava[i];
        after.heights[i] = before.heights[i];
        cut.push(i);
      }
      e.z = b.z;
      continue;
    }
    for (const i of tiles)
      if (after.heights[i] !== low) {
        if (masks && masks[i] === plainRun(after.heights[i])) masks[i] = plainRun(low);
        after.heights[i] = low;
        cut.push(i);
      }
    e.z = riddenLevel(b.z, before.heights[anchor], low, undefined, whole);
  }
  return cut;
}

/** A tile's voxels as one plain run from level 0 to its height (terrain/runs.ts' mask). */
const plainRun = (h: number): number => (h >= 32 ? 0xffffffff : (1 << h) - 1) >>> 0;

/** The tiles whose ground a force's result changes, its working area's feather applied (`ease`: how
 *  many levels each tile may move, D254; null for none), as its operation keeps them (keep.ts
 *  `featherForce`): the showing and the operation clear from the same tiles. */
export function changedGround(before: ArrayLike<number>, after: ArrayLike<number>, ease: ArrayLike<number> | null): (i: number) => boolean {
  return ease ? (i) => Math.max(before[i] - ease[i], Math.min(before[i] + ease[i], after[i])) !== before[i] : (i) => after[i] !== before[i];
}

/** How a force moves its ground, for what Clear takes (`destroyedGround`): `reshape` builds or cuts it
 *  (Carve, Craterize, Erupt, Glaciate, Deposit, Erode, Roll); `rigid` drops it whole between walls (a Rift);
 *  `fault` lifts or carries it whole beside a fault (a Quake), `path` the crack as it ran (the fault's points,
 *  `QuakePlan.fault.points`). */
export type GroundMotion = { kind: "reshape" } | { kind: "rigid" } | { kind: "fault"; path: readonly { x: number; y: number }[] };

/** A force's motion by its verb, settings and drawn path. */
export function motionOf(verb: string, path?: readonly { x: number; y: number }[]): GroundMotion {
  if (verb === "quake" && path?.length) return { kind: "fault", path };
  return verb === "rift" || verb === "quake" ? { kind: "rigid" } : { kind: "reshape" };
}

/** The most a thin apron raises a source's ground and it rides on top (levels): 3 or more buries it. */
export const BURIED = 3;
/** The least a cut lowers a source's ground to take it away (levels). */
export const CUT = 2;
/** A Rift's crush zone: where the ground it drops whole tears, the levels its 3 × 3 tiles' moves differ by: its sheer wall,
 *  the faces of its stepped side's benches, and the sides of the notch it cuts out to lower ground. */
export const TORN = 2;
/** A Quake's crush zone: the tiles this near its crack (the force audit's 2 to 3 tiles along the trace). */
export const FAULT_CRUSH = 2.5;

/** The tiles whose ground a force destroys (D474, the force audit's S2): of those it changes (`changedGround`,
 *  the working area's feather applied), the ones it buries `BURIED` levels or more or cuts `CUT` or more away;
 *  for a force that moves ground whole, only its crush zone: a Quake's, `FAULT_CRUSH` tiles of its crack
 *  (its stepped scarp's benches ride), or where the moves of a Rift's 3 × 3 tiles differ by `TORN` levels or more
 *  (its walls). */
export function destroyedGround(W: number, H: number, before: ArrayLike<number>, after: ArrayLike<number>, ease: ArrayLike<number> | null, motion: GroundMotion): Destroyed {
  const changed = changedGround(before, after, ease);
  const dz = groundMoved(before, after, ease);
  if (motion.kind === "reshape")
    return withMoved((i) => {
      const d = dz(i);
      return d >= BURIED || d <= -CUT;
    }, dz);
  if (motion.kind === "fault") {
    const pts = motion.path;
    return withMoved((i) => {
      if (!changed(i)) return false;
      const x = i % W;
      const y = (i - x) / W;
      for (let k = 0; k < pts.length; k++) {
        const a = pts[k];
        const b = pts[Math.min(k + 1, pts.length - 1)];
        const lx = b.x - a.x;
        const ly = b.y - a.y;
        const l2 = lx * lx + ly * ly;
        const t = l2 ? Math.max(0, Math.min(1, ((x - a.x) * lx + (y - a.y) * ly) / l2)) : 0;
        const ex = x - a.x - lx * t;
        const ey = y - a.y - ly * t;
        if (ex * ex + ey * ey <= FAULT_CRUSH * FAULT_CRUSH) return true;
      }
      return false;
    }, dz);
  }
  return withMoved((i) => {
    if (!changed(i)) return false;
    const x = i % W;
    const y = (i - x) / W;
    let lo = Infinity;
    let hi = -Infinity;
    for (let v = Math.max(0, y - 1); v <= Math.min(H - 1, y + 1); v++)
      for (let u = Math.max(0, x - 1); u <= Math.min(W - 1, x + 1); u++) {
        const d = dz(v * W + u);
        if (d < lo) lo = d;
        if (d > hi) hi = d;
      }
    return hi - lo >= TORN;
  }, dz);
}

/** How many levels each tile's ground a force moved, its working area's feather applied (`ease`). */
export function groundMoved(before: ArrayLike<number>, after: ArrayLike<number>, ease: ArrayLike<number> | null): (i: number) => number {
  return (i) => (ease ? Math.max(before[i] - ease[i], Math.min(before[i] + ease[i], after[i])) : after[i]) - before[i];
}

/** The tiles whose ground a force destroyed (`destroyedGround`), with how far it moved each (`moved`): a
 *  multi-tile source rides only as one level piece (D249), so `clearable` takes one whose tiles moved apart. */
export type Destroyed = ((i: number) => boolean) & { moved?: (i: number) => number };

function withMoved(f: (i: number) => boolean, moved: (i: number) => number): Destroyed {
  return Object.assign(f, { moved });
}

/** A source a force cleared, and the step of its showing that took it: the frame whose `shown` is
 *  `step` is the first without it. */
export interface ClearedSource {
  id: string;
  step: number;
}

/** The sources Clear takes from the map `before` (its objects at their places then): those with a
 *  tile in their footprint whose ground the force destroyed (`changed`: `destroyedGround`), and a multi-tile one (a
 *  badwater source's 3 × 3, a seep's 2 × 2) whose tiles the force moved by different amounts: it rides only as one
 *  level piece (D249), and on torn ground it would stand inside the ground or over air, a map the game refuses. Save
 *  the ones `stays` names (the force's own, and those it took itself). */
export function clearable(before: { W: number; H: number; entities: readonly EntitySpec[] }, changed: Destroyed, stays: (id: string) => boolean): EntitySpec[] {
  const moved = changed.moved;
  return before.entities.filter((e) => {
    if (!CLEARABLE.has(e.template) || stays(e.id)) return false;
    const tiles = footprint(before, e);
    if (tiles.some(changed)) return true;
    return !!moved && tiles.length > 1 && tiles.some((i) => moved(i) !== moved(tiles[0]));
  });
}

/** A force's showing, clearing its sources step by step: each goes at the first step whose land
 *  differs from the land it started on at one of its tiles, and stays gone. */
export class SourceClearing {
  /** Each source cleared so far, in the order they went. */
  readonly record: ClearedSource[] = [];
  private readonly gone = new Set<string>();
  private pending: { id: string; tiles: number[] }[];

  constructor(
    private readonly ground: ArrayLike<number>,
    before: { W: number; H: number },
    sources: readonly EntitySpec[],
  ) {
    this.pending = sources.map((e) => ({ id: e.id, tiles: footprint(before, e) }));
  }

  /** The frame shown at `step`, its land `heights`: the sources it reaches now recorded at `step`
   *  (every one still standing, at its `last` step), and its objects `entities` without every source
   *  cleared so far. */
  show(heights: ArrayLike<number>, entities: EntitySpec[], step: number, last = false): EntitySpec[] {
    if (this.pending.length) {
      const left: typeof this.pending = [];
      for (const p of this.pending)
        if (last || p.tiles.some((i) => heights[i] !== this.ground[i])) {
          this.record.push({ id: p.id, step });
          this.gone.add(p.id);
        } else left.push(p);
      this.pending = left;
    }
    return this.gone.size && entities.some((e) => this.gone.has(e.id)) ? entities.filter((e) => !this.gone.has(e.id)) : entities;
  }
}

/** Each source's and seep's emitter in a water model made from `entities` (features/build.ts `modelOf`,
 *  the same order: one emitter for each object with a tile on the map), by id: a force's own water
 *  stops a source's emitter at the step it leaves the land shown, so its water drains as the game's
 *  would; a source that rides keeps running. */
export function emittersById(W: number, H: number, entities: readonly EntitySpec[]): Map<string, number> {
  const out = new Map<string, number>();
  let k = 0;
  for (const e of entities) {
    const rule = EMITTERS[e.template];
    if (!rule) continue;
    const on = rule.tiles.some(([lx, ly]) => {
      const [x, y] = objectTile(e as Parameters<typeof objectTile>[0], lx, ly);
      return x >= 0 && y >= 0 && x < W && y < H;
    });
    if (!on) continue;
    if (CLEARABLE.has(e.template)) out.set(e.id, k);
    k++;
  }
  return out;
}
