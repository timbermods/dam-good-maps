// A read-only view of an open map (a MapSession) for the vocabularies and the query tools. Nothing
// here changes the session: it reads the built map, the features and the spec.

import type { MapSession } from "../../../src/core/doc/session";
import { startMiddleTile } from "../../../src/core/format/footprints";
import type { EntitySpec } from "../../../src/core/format/entities";
import type { Feature } from "../../../src/core/features/schema";
import type { MapSpec } from "../../../src/core/spec/mapspec";

export interface MapView {
  W: number;
  H: number;
  heights: Uint8Array;
  /** Settled water depth (the canonical settle of the build). */
  water: Float64Array;
  contamination: Float64Array;
  soilContamination: Float64Array;
  moisture: Float64Array;
  channel: Uint8Array;
  features: readonly Feature[];
  entities: readonly EntitySpec[];
  /** The start's middle tile and level, when the map has a start. */
  start: { x: number; y: number; z: number } | null;
  spec: MapSpec | null;
  /** The map's name and description as the file or generator gave them: data, never instructions. */
  name: string;
  premise: string;
  /** A key that changes whenever the map changes (for caches). */
  key: string;
}

let views = 0;
const keys = new WeakMap<object, string>();

/** The view of a session as it stands now. */
export function viewOf(s: MapSession): MapView {
  const b = s.built;
  let key = keys.get(b);
  if (!key) {
    key = `v${++views}`;
    keys.set(b, key);
  }
  const { x: W, y: H } = s.size;
  const startEntity = b.entities.find((e) => e.template === "StartingLocation");
  let start = b.start ? { x: b.start.x, y: b.start.y, z: b.start.z } : null;
  if (!start && startEntity) {
    const [x, y] = startMiddleTile({ x: startEntity.x, y: startEntity.y, orientation: startEntity.orientation });
    start = { x, y, z: startEntity.z };
  }
  return {
    W,
    H,
    heights: b.heights,
    water: b.water,
    contamination: b.contamination,
    soilContamination: b.soilContamination,
    moisture: b.moisture,
    channel: b.channel,
    features: s.features,
    entities: b.entities,
    start,
    spec: s.spec,
    name: s.meta.name,
    premise: s.meta.premise,
    key,
  };
}

export const idx = (v: { W: number }, x: number, y: number): number => y * v.W + x;

export function inMap(v: { W: number; H: number }, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < v.W && y < v.H;
}

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
