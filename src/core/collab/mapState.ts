// The map as a collaboration record sees it: the ground, the fresh rock, the objects, the trees
// lying down and the water the map keeps (lakes, drained tiles), as plain values. A transaction
// captures it before and after an action; the difference is the action's literal patch (before and
// after values, never inverse arithmetic). The settled water itself is derived and left out: every
// peer settles the same map to the same water.

import { componentsOf, type EntitySpec } from "../format/entities";
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
  /** Plain copies of the objects, ascending by id. */
  entities: EntitySpec[];
  /** Trees lying down (dead, felled by a force), ascending by id. */
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

/** The trees a force knocked down that are still dead, with the pose of the latest force that did
 *  (what a force starts from as `down`). */
export function fallenPoses(s: MapSession): Map<string, Pose> {
  const out = new Map<string, Pose>();
  for (const op of s.state.sculpts) if (op.op === "forceResult") for (const f of op.params.felled ?? []) out.set(f.id, { dx: f.dx, dy: f.dy });
  if (!out.size) return out;
  const dead = new Set(
    s.built.entities
      .filter((e) => (componentsOf(e) as { LivingNaturalResource?: { IsDead?: unknown } }).LivingNaturalResource?.IsDead === true)
      .map((e) => e.id),
  );
  for (const id of [...out.keys()]) if (!dead.has(id)) out.delete(id);
  return out;
}

/** The session's map as it stands (the settled water is not read, so a map with its water still
 *  settling captures the same as one whose water has settled). */
export function captureState(s: MapSession): MapState {
  const b = s.built;
  const lava = lavaOf(s.state.sculpts, b.heights, b.W, b.H) ?? new Uint32Array(b.W * b.H);
  return {
    W: b.W,
    H: b.H,
    heights: b.heights.slice(),
    lava: lava.slice(),
    entities: byId(plainEntities(b.entities)),
    fallen: [...fallenPoses(s)].sort((a, b) => (a[0] < b[0] ? -1 : 1)),
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
    for (const w of [a.water, b.water]) {
      for (const r of w.retained) for (const i of r.tiles) writes.add(i);
      for (const i of w.drained) writes.add(i);
    }
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

export function cloneState(st: MapState): MapState {
  return { ...st, heights: st.heights.slice(), lava: st.lava.slice(), entities: structuredClone(st.entities), fallen: structuredClone(st.fallen), water: structuredClone(st.water) };
}
