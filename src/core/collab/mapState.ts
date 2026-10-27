// The map as a collaboration record sees it: what the players made directly, as plain values. That is
// the ground, the fresh rock, the objects that are not a resource feature's (placed objects, sources,
// the start, map objects), the trees a force knocked down (from the operations) and the lakes the map
// keeps. A transaction captures it before and after an action; the difference is the action's literal
// patch (before and after values, never inverse arithmetic).
//
// The settled water, the soil, and which trees and bushes stand and live follow from the settled water
// (build step 11), which settles in the background: none of them is read here, so a capture costs the
// same as a single-player edit and is the same on a peer whose water has settled and on one whose has
// not. The footprints of the resource objects are kept apart (`derived`) only so an operation that
// removes or moves one can say which ground it touched.

import { componentsOf, type EntitySpec } from "../format/entities";
import { resourceOwners } from "../doc/placing";
import { entityTiles, plainEntities } from "../forces/force";
import { lavaOf } from "../forces/start";
import { murmur3 } from "../math/hash";
import type { RetainedWater } from "../sim/water";
import type { MapSession } from "../doc/session";
import { Mask } from "./mask";

export interface Pose {
  dx: number;
  dy: number;
}

/** The water the map keeps beyond what its ground settles: lakes a force or a fill sealed, and drained tiles. */
export interface StoredWater {
  retained: RetainedWater[];
  drained: number[];
}

export interface MapState {
  W: number;
  H: number;
  heights: Uint8Array;
  /** Fresh volcanic rock, a bit per level of each tile. */
  lava: Uint32Array;
  /** Plain copies of the objects players made directly (not a resource feature's), ascending by id. */
  entities: EntitySpec[];
  /** The tiles each resource object (a generated tree or bush) stands on, ascending by id: not part of the patch or the hash. */
  derived: [string, number[]][];
  /** Trees a force knocked down, with their pose, from the operations; ascending by id. */
  fallen: [string, Pose][];
  water: StoredWater;
}

/** One tile's change: [tile, height before, height after, rock before, rock after]. */
export type GroundChange = [number, number, number, number, number];
/** One object's (or tree pose's) change: [id, value before, value after]; null is absent. */
export type Change<T> = [string, T | null, T | null];

/** What an action changed, as literal values. */
export interface Patch {
  ground: GroundChange[];
  objects: Change<EntitySpec>[];
  fallen: Change<Pose>[];
  water: { before: StoredWater; after: StoredWater } | null;
}

export const emptyPatch = (): Patch => ({ ground: [], objects: [], fallen: [], water: null });
export const patchIsEmpty = (p: Patch): boolean => !p.ground.length && !p.objects.length && !p.fallen.length && !p.water;

/** A value as JSON with its keys in order, so equal values compare equal as text. */
export function stable(x: unknown): string {
  const sort = (v: unknown): unknown => {
    if (ArrayBuffer.isView(v)) return Array.from(v as unknown as ArrayLike<number>);
    if (Array.isArray(v)) return v.map(sort);
    if (v && typeof v === "object") return Object.fromEntries(Object.keys(v).sort().map((k) => [k, sort((v as Record<string, unknown>)[k])]));
    return v;
  };
  return JSON.stringify(sort(x));
}

const byId = <T extends { id: string }>(list: readonly T[]): T[] => list.slice().sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

/** The trees the forces knocked down, with the pose of the latest force that did, from the operations alone. */
export function felledPoses(s: MapSession): [string, Pose][] {
  const out = new Map<string, Pose>();
  for (const op of s.state.sculpts) if (op.op === "forceResult") for (const f of op.params.felled ?? []) out.set(f.id, { dx: f.dx, dy: f.dy });
  return [...out].sort((a, b) => (a[0] < b[0] ? -1 : 1));
}

/** The knocked-down trees that are still dead on the settled map (what a force starts from as `down`). */
export function fallenPoses(s: MapSession): Map<string, Pose> {
  const out = new Map(felledPoses(s));
  if (!out.size) return out;
  const dead = new Set(
    s.built.entities
      .filter((e) => (componentsOf(e) as { LivingNaturalResource?: { IsDead?: unknown } }).LivingNaturalResource?.IsDead === true)
      .map((e) => e.id),
  );
  for (const id of [...out.keys()]) if (!dead.has(id)) out.delete(id);
  return out;
}

/** The owners of the resource objects the build places against the settled water. */
function resourceFeatureOwners(s: MapSession): Set<string> {
  const owners = resourceOwners(s);
  for (const id of s.generatedResources()?.keys() ?? []) owners.add(id);
  return owners;
}

/** What the players made directly on the session's map as it stands, whatever its water is doing. */
export function captureState(s: MapSession): MapState {
  const b = s.built;
  const lava = lavaOf(s.state.sculpts, b.heights, b.W, b.H) ?? new Uint32Array(b.W * b.H);
  const owners = resourceFeatureOwners(s);
  const direct: EntitySpec[] = [];
  const derived: [string, number[]][] = [];
  for (const e of b.entities) {
    if (owners.has(e.owner)) derived.push([e.id, entityTiles(b.W, b.H, e)]);
    else direct.push(e);
  }
  derived.sort((p, q) => (p[0] < q[0] ? -1 : 1));
  return {
    W: b.W,
    H: b.H,
    heights: b.heights.slice(),
    lava: lava.slice(),
    entities: byId(plainEntities(direct)),
    derived,
    fallen: felledPoses(s),
    water: {
      retained: JSON.parse(stable(b.waterModel.retained ?? [])) as RetainedWater[],
      drained: [...(b.waterModel.drained ?? [])],
    },
  };
}

/** A short text standing for the whole state: equal maps give equal text on every peer. */
export function stateHash(st: MapState): string {
  const text = new TextEncoder().encode(stable({ e: st.entities, f: st.fallen, w: st.water, W: st.W, H: st.H }));
  const parts = [new Uint8Array(st.heights.buffer, st.heights.byteOffset, st.heights.byteLength), new Uint8Array(st.lava.buffer, st.lava.byteOffset, st.lava.byteLength), text];
  const all = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    all.set(p, at);
    at += p.length;
  }
  return murmur3(all, 0x362).toString(16).padStart(8, "0");
}

interface Diff {
  patch: Patch;
  /** The tiles the action wrote: changed ground, the footprints of objects that changed, lakes that changed. */
  writes: Mask;
  /** Identity keys of what changed ("entity:<id>", "fallen:<id>", "lakes"). */
  keys: Set<string>;
}

function changes<T>(before: ReadonlyMap<string, T>, after: ReadonlyMap<string, T>, tilesOf: (v: T) => number[], prefix: string, writes: Mask, keys: Set<string>): Change<T>[] {
  const out: Change<T>[] = [];
  for (const id of [...new Set([...before.keys(), ...after.keys()])].sort()) {
    const x = before.get(id) ?? null;
    const y = after.get(id) ?? null;
    if (stable(x) === stable(y)) continue;
    out.push([id, x === null ? null : structuredClone(x), y === null ? null : structuredClone(y)]);
    keys.add(`${prefix}:${id}`);
    for (const v of [x, y]) if (v) for (const i of tilesOf(v)) if (i >= 0 && i < writes.N) writes.add(i);
  }
  return out;
}

/** The literal patch from `a` to `b`, with the tiles it wrote and the identity keys it changed. */
export function difference(a: MapState, b: MapState): Diff {
  const N = a.W * a.H;
  const writes = new Mask(N);
  const keys = new Set<string>();
  const patch = emptyPatch();
  for (let i = 0; i < N; i++)
    if (a.heights[i] !== b.heights[i] || a.lava[i] !== b.lava[i]) {
      patch.ground.push([i, a.heights[i], b.heights[i], a.lava[i], b.lava[i]]);
      writes.add(i);
    }
  patch.objects = changes(new Map(a.entities.map((e) => [e.id, e])), new Map(b.entities.map((e) => [e.id, e])), (e) => entityTiles(a.W, a.H, e), "entity", writes, keys);
  patch.fallen = changes(new Map(a.fallen), new Map(b.fallen), () => [], "fallen", writes, keys);
  if (stable(a.water) !== stable(b.water)) {
    patch.water = { before: structuredClone(a.water), after: structuredClone(b.water) };
    keys.add("lakes");
    // (only the lakes added, removed or changed, and the tiles drained or no longer drained: a lake or a
    // drained tile the action left as it was is not something it wrote)
    const lakes = (x: StoredWater, y: StoredWater) => {
      const there = new Set(y.retained.map((r) => stable(r)));
      for (const r of x.retained) if (!there.has(stable(r))) for (const i of r.tiles) writes.add(i);
    };
    lakes(a.water, b.water);
    lakes(b.water, a.water);
    const drainedA = new Set(a.water.drained);
    const drainedB = new Set(b.water.drained);
    for (const i of drainedA) if (!drainedB.has(i)) writes.add(i);
    for (const i of drainedB) if (!drainedA.has(i)) writes.add(i);
  }
  return { patch, writes, keys };
}

function merged<T>(list: readonly [string, T][], changed: Change<T>[], inverse: boolean): [string, T][] {
  const map = new Map(list);
  for (const [id, before, after] of changed) {
    const v = inverse ? before : after;
    if (v === null) map.delete(id);
    else map.set(id, structuredClone(v));
  }
  return [...map].sort((p, q) => (p[0] < q[0] ? -1 : 1));
}

/** Put a patch on a state (`inverse`: take it back), writing its literal values. */
export function applyPatch(st: MapState, p: Patch, inverse = false): void {
  for (const [i, hb, ha, lb, la] of p.ground) {
    st.heights[i] = inverse ? hb : ha;
    st.lava[i] = inverse ? lb : la;
  }
  st.entities = merged(st.entities.map((e) => [e.id, e] as [string, EntitySpec]), p.objects, inverse).map(([, e]) => e);
  st.fallen = merged(st.fallen, p.fallen, inverse);
  if (p.water) st.water = structuredClone(inverse ? p.water.before : p.water.after);
}

/** The patch that takes `p` back: its before and after values swapped (stored values, never arithmetic). */
export function invertPatch(p: Patch): Patch {
  const flip = <T>(list: Change<T>[]): Change<T>[] => list.map(([id, a, b]) => [id, b === null ? null : structuredClone(b), a === null ? null : structuredClone(a)]);
  return {
    ground: p.ground.map(([i, hb, ha, lb, la]) => [i, ha, hb, la, lb] as GroundChange),
    objects: flip(p.objects),
    fallen: flip(p.fallen),
    water: p.water ? { before: structuredClone(p.water.after), after: structuredClone(p.water.before) } : null,
  };
}

export function cloneState(st: MapState): MapState {
  return { ...st, heights: st.heights.slice(), lava: st.lava.slice(), entities: structuredClone(st.entities), derived: structuredClone(st.derived), fallen: structuredClone(st.fallen), water: structuredClone(st.water) };
}
