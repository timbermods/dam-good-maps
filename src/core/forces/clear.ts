// Forces can clear sources (PLAN §20 D474, amending D257's "no force changes shelf objects except by
// riding the ground" for sources only): every force takes a Sources choice, Ride (its sources move with
// the ground) or Clear (the default, also for an operation without the choice). Clear takes a water or
// badwater source or seep only where the force destroys its ground (the force audit's S2,
// docs/progress/force-audit.md): buried 3 levels or more, cut 2 or more away, or, where the force moves
// the ground whole, in the crush zone where the ground tears (a Quake's fault, a Rift's walls); a multi-tile one if any of
// its tiles is. One that only rides an intact block, or sits under a thin apron, rides as under Ride.
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
export function destroyedGround(W: number, H: number, before: ArrayLike<number>, after: ArrayLike<number>, ease: ArrayLike<number> | null, motion: GroundMotion): (i: number) => boolean {
  const changed = changedGround(before, after, ease);
  const dz = (i: number) => (ease ? Math.max(before[i] - ease[i], Math.min(before[i] + ease[i], after[i])) : after[i]) - before[i];
  if (motion.kind === "reshape")
    return (i) => {
      const d = dz(i);
      return d >= BURIED || d <= -CUT;
    };
  if (motion.kind === "fault") {
    const pts = motion.path;
    return (i) => {
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
    };
  }
  return (i) => {
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
  };
}

/** A source a force cleared, and the step of its showing that took it: the frame whose `shown` is
 *  `step` is the first without it. */
export interface ClearedSource {
  id: string;
  step: number;
}

/** The sources Clear takes from the map `before` (its objects at their places then): those with a
 *  tile in their footprint whose ground the force destroyed (`changed`: `destroyedGround`), save the ones `stays` names (the force's
 *  own, and those it took itself). */
export function clearable(before: { W: number; H: number; entities: readonly EntitySpec[] }, changed: (i: number) => boolean, stays: (id: string) => boolean): EntitySpec[] {
  return before.entities.filter((e) => CLEARABLE.has(e.template) && !stays(e.id) && footprint(before, e).some(changed));
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
