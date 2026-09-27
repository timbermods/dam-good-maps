// The stacked water model of a map (D120): its water columns (sim/columns.ts) and its emitters, from
// the terrain's voxel masks and the map objects, by the rules sim/model.ts applies to a heightfield
// (which emitters run at map start, seeps' depth limits, the strength cap), with each emitter's
// strength going into the column that holds its cell (`UpdateWaterSourcesTask`).
//
// Level 1 of the fast path (investigation/terrain3d/DESIGN.md §3.1): a map whose every tile is one
// open column is a heightfield's water, and `openFieldModel` gives the heightfield engine's model
// for it (sim/water.ts), which is StackSim's "port" mode bit for bit at the heightfield engine's
// speed. The game's rules ("game" mode) reach water.ts only at the wiring step (D286 (3)); until
// then an open field in game mode runs StackSim, whose per-tile fast path (level 2) covers every
// one of its tiles.

import { EMITTERS, MAX_STRENGTH_PER_TILE, SEEP_OFF, SEEP_ON, isDelayed, objectTile, specifiedStrength, type MapObject } from "./model";
import { isOpenField, slotAt, waterColumns, type VoxelMasks } from "./columns";
import type { StackEmitter, StackModel } from "./stack";
import type { Emitter, WaterModel } from "./water";

/** The stacked water model of a map. An emitter whose cell is inside terrain gets no column: its
 *  tiles still wall off the map edge beside them, and it emits nothing. */
export function stackModel(t: VoxelMasks, objects: readonly MapObject[]): StackModel {
  const cols = waterColumns(t, objects);
  const { W, H, N } = cols;
  const emitters: StackEmitter[] = [];
  for (const o of objects) {
    const rule = EMITTERS[o.template];
    if (!rule) continue;
    const ec: number[] = [];
    const tiles: number[] = [];
    for (const [lx, ly] of rule.tiles) {
      const [x, y] = objectTile(o, lx, ly);
      if (x < 0 || x >= W || y < 0 || y >= H) continue;
      const i = y * W + x;
      tiles.push(i);
      const s = slotAt(cols, i, o.z);
      if (s >= 0) ec.push(s * N + i);
    }
    if (!tiles.length) continue;
    let strength = rule.runs && !isDelayed(o.components) ? specifiedStrength(o.components) : 0;
    if (strength > MAX_STRENGTH_PER_TILE * rule.tiles.length) strength = MAX_STRENGTH_PER_TILE * rule.tiles.length;
    if (!(strength > 0) || !ec.length) strength = 0;
    const e: StackEmitter = { cols: ec, tiles, strength, contamination: rule.contamination };
    if (rule.seep && ec.length) e.depthLimit = { anchor: ec[0], off: SEEP_OFF, on: SEEP_ON };
    emitters.push(e);
  }
  return { cols, emitters };
}

/** The heightfield engine's model of a map whose every tile is one open column (level 1 of the fast
 *  path), or null when the map is not one: a tile with more than one column or a roof, a direction
 *  limiter, or an emitter with a tile that has no column at its cell. Partial obstacles count where
 *  StackSim's "port" mode reads them, on the target's floor. */
export function openFieldModel(m: StackModel): WaterModel | null {
  const wc = m.cols;
  if (!isOpenField(wc) || wc.dirLimit) return null;
  const { W, H, N } = wc;
  const floor = new Float64Array(N);
  for (let i = 0; i < N; i++) floor[i] = wc.floor[i];
  let dam: Float64Array | null = null;
  if (wc.heightLimit)
    for (const [key, v] of wc.heightLimit) {
      const i = key % N;
      if ((key - i) / N !== wc.floor[i]) continue;
      (dam ??= new Float64Array(N).fill(-1))[i] = v;
    }
  const emitters: Emitter[] = [];
  for (const e of m.emitters) {
    if (e.cols.length !== e.tiles.length || e.cols.some((c, k) => c !== e.tiles[k])) return null;
    const out: Emitter = { cells: e.tiles.slice(), strength: e.strength, contamination: e.contamination };
    if (e.depthLimit) out.depthLimit = { ...e.depthLimit };
    emitters.push(out);
  }
  return { W, H, floor, dam, emitters };
}
