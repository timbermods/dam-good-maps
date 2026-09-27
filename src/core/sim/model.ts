// The water model of a map: the floor of every water column, partial obstacles, and every emitter
// with the tiles it emits into, all from the map's objects by their footprints (PLAN §11.5: every
// emitter and blocker is handled through the footprint transform, whatever its orientation).
// prototype/playability.py `water_model` is the same rule set; validation compares the two.
//
// What runs at map start, in temperate weather (notes/water_and_soil.md Q1, Q6):
// - WaterSource (1×1) and BadwaterSource (3×3, S/9 per tile, badwater): on, unless delayed
//   (TimeActivatedComponent.IsEnabled);
// - WaterSeep / BadwaterSeep (2×2): on, but off while the water at their anchor is over 0.8 deep,
//   back on below 0.72;
// - Aquifer: off (it needs a powered drill, and every drill starts unpowered);
// - BadtideDrain: off (it only runs in badtide). Its back wall is a full water obstacle.
// Blockage is a full obstacle (the column floor rises by one); NaturalDam a 0.65 partial obstacle.
// Every emitter tile walls off the map edge beside it, also when the emitter is off.

import { isObject, num, type JsonObject } from "../format/json";
import { FOOTPRINTS, rotate, type Placement } from "../format/footprints";
import { placementOf } from "../format/entities";
import type { WorldModel } from "../format/world";
import type { Emitter, WaterModel } from "./water";

export interface MapObject extends Placement {
  components: JsonObject;
}

interface EmitterRule {
  /** Local tiles the strength is spread over. */
  tiles: [number, number][];
  contamination: number;
  /** false: the emitter is off at map start whatever its strength. */
  runs: boolean;
  seep?: boolean;
}

const SQUARE = (n: number): [number, number][] => {
  const out: [number, number][] = [];
  for (let x = 0; x < n; x++) for (let y = 0; y < n; y++) out.push([x, y]);
  return out;
};

export const EMITTERS: Record<string, EmitterRule> = {
  WaterSource: { tiles: [[0, 0]], contamination: 0, runs: true },
  BadwaterSource: { tiles: SQUARE(3), contamination: 1, runs: true },
  WaterSeep: { tiles: SQUARE(2), contamination: 0, runs: true, seep: true },
  BadwaterSeep: { tiles: SQUARE(2), contamination: 1, runs: true, seep: true },
  Aquifer: { tiles: [[1, 1]], contamination: 0, runs: false },
  BadtideDrain: { tiles: [[0, 1]], contamination: 1, runs: false },
};

/** Max strength per emitting tile (the game clamps CurrentStrength to 8 × tiles). */
export const MAX_STRENGTH_PER_TILE = 8;
export const SEEP_OFF = 0.8;
export const SEEP_ON = 0.72;
export const NATURAL_DAM_HEIGHT = 0.65;

/** A local tile of a placed object in world tiles (Coordinates + R(F(local)), FORMAT.md §4.4). */
export function objectTile(p: Placement, lx: number, ly: number): [number, number] {
  const fp = FOOTPRINTS[p.template];
  const x = p.flipped && fp?.flippable ? fp.size[0] - 1 - lx : lx;
  const [dx, dy] = rotate(p.orientation, x, ly);
  return [p.x + dx, p.y + dy];
}

export function isDelayed(components: JsonObject): boolean {
  const ta = components.TimeActivatedComponent;
  return isObject(ta) && ta.IsEnabled === true;
}

export function specifiedStrength(components: JsonObject): number {
  const ws = components.WaterSource;
  return isObject(ws) ? num(ws.SpecifiedStrength ?? 0) : 0;
}

export function waterModel(W: number, H: number, surface: Uint8Array, objects: readonly MapObject[]): WaterModel {
  const N = W * H;
  const floor = new Float64Array(N);
  for (let i = 0; i < N; i++) floor[i] = surface[i];
  let dam: Float64Array | null = null;
  const emitters: Emitter[] = [];
  const inside = (x: number, y: number) => x >= 0 && x < W && y >= 0 && y < H;
  for (const o of objects) {
    const rule = EMITTERS[o.template];
    if (rule) {
      const cells: number[] = [];
      for (const [lx, ly] of rule.tiles) {
        const [x, y] = objectTile(o, lx, ly);
        if (inside(x, y)) cells.push(y * W + x);
      }
      if (cells.length) {
        let strength = rule.runs && !isDelayed(o.components) ? specifiedStrength(o.components) : 0;
        const specified = strength;
        if (strength > MAX_STRENGTH_PER_TILE * rule.tiles.length) strength = MAX_STRENGTH_PER_TILE * rule.tiles.length;
        if (!(strength > 0)) strength = 0;
        const e: Emitter = { cells, strength, contamination: rule.contamination };
        if (strength > 0 && specified > strength) e.specified = specified;
        if (rule.seep) e.depthLimit = { anchor: cells[0], off: SEEP_OFF, on: SEEP_ON };
        emitters.push(e);
      }
    }
    if (o.template === "Blockage" || o.template === "BadtideDrain") {
      const [x, y] = objectTile(o, 0, 0);
      if (inside(x, y) && floor[y * W + x] < o.z + 1) floor[y * W + x] = o.z + 1;
    } else if (o.template === "NaturalDam") {
      const [x, y] = objectTile(o, 0, 0);
      if (inside(x, y)) {
        if (!dam) dam = new Float64Array(N).fill(-1);
        dam[y * W + x] = NATURAL_DAM_HEIGHT;
      }
    }
  }
  return { W, H, floor, dam, emitters };
}

/** Map objects of a world.json, in file order (entities without a BlockObject are skipped). */
export function mapObjects(world: Pick<WorldModel, "entities">): MapObject[] {
  const out: MapObject[] = [];
  for (const e of world.entities) {
    const p = placementOf(e);
    if (!p) continue;
    out.push({ ...p, components: e.Components as JsonObject });
  }
  return out;
}

export function waterModelFromWorld(world: WorldModel, surface: Uint8Array): WaterModel {
  return waterModel(world.sizeX, world.sizeY, surface, mapObjects(world));
}

/** Tiles where soil moisture and contamination cannot go (Thorns: BlockFullMoisture and a soil
 *  barrier), or null when the map has none. */
export function moistureBarrier(W: number, H: number, objects: readonly MapObject[]): Uint8Array | null {
  let out: Uint8Array | null = null;
  for (const o of objects) {
    if (o.template !== "Thorns") continue;
    const [x, y] = objectTile(o, 0, 0);
    if (x < 0 || x >= W || y < 0 || y >= H) continue;
    if (!out) out = new Uint8Array(W * H);
    out[y * W + x] = 1;
  }
  return out;
}
