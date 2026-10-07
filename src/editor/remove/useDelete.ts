// Delete (D288): the objects on tiles and removing them, the ground too.

import { useRef } from "preact/hooks";
import type { EditOp } from "../../core/doc/ops";
import { footprintTiles, type Orientation } from "../../core/format/footprints";
import { DEAD, FLIPPED, YOUNG, ORIENTATION_NAMES } from "../../render3d/model";
import type { TileFacts as PageTileFacts, TileObject } from "../../core/doc/describeTile";
import { removeTakes, type RemoveKind } from "../../core/features/objects";
import { tilesToRuns } from "../../core/math/grid";
import { isSource } from "../sourceSpots";
import { ALL_KINDS } from "./kinds";
import type { Ed } from "../ed";

export interface DeleteSlice {
  pageTileFacts: () => PageTileFacts;
  coverAt: () => Map<number, number[]>;
  deleteOn: (tiles: number[], quiet?: boolean, kinds?: RemoveKind[], counted?: boolean) => boolean;
  deleteGround: (tiles: number[]) => boolean;
  deleteCalls: { current: { deleteHere: (tiles: number[]) => boolean; deleteSelection: () => void } };
}

export function useDelete(ed: Ed): DeleteSlice {
  const { api, info, mirror, renderer, setMessage, selection, feel, run, flashNote } = ed;

  // ------------------------------------------------------------------------------ Delete (D288)

  /** The map as the hover readout's facts (D347, B11): the core's `describeTile` says what is on a tile,
   *  from the page's own view of the ground, the water as it flows and the objects. */
  function pageTileFacts(): PageTileFacts {
    const m = mirror.current;
    const e = m.entities;
    const at = coverAt();
    return {
      W: info.W,
      H: info.H,
      height: (i) => m.heights[i],
      water: (i) => {
        const w = m.water;
        return w && w.surface[i] === w.surface[i] && w.depth[i] > 0.001 ? { depth: w.depth[i], contamination: w.contamination[i] } : null;
      },
      // (a held weather day's soil while one is on, Kyler, 2026-10-04: the readout reports the day shown)
      soil: (i) => {
        const soil = m.daySoil ?? m.soil;
        return soil ? (soil.contamination[i] > 0 ? "contaminated" : soil.moisture[i] > 0 ? "moist" : "dry") : null;
      },
      objects: (i) =>
        (at.get(i) ?? []).map((k): TileObject => {
          const template = e.templates[e.template[k]];
          const o: TileObject = { template };
          if (e.flags[k] & DEAD) o.dead = true;
          else if (e.flags[k] & YOUNG) o.young = true;
          if (isSource(template)) o.strength = Math.round(e.strength[k] * 100) / 100;
          return o;
        }),
    };
  }
  /** Each object's tiles (its footprint), made when first asked for after the objects change. */
  const coverAt = (): Map<number, number[]> => {
    const m = mirror.current;
    if (m.coverAt) return m.coverAt;
    const e = m.entities;
    const W = info.W;
    const out = new Map<number, number[]>();
    for (let k = 0; k < e.count; k++) {
      const template = e.templates[e.template[k]];
      for (const [x, y] of footprintTiles(template, { template, x: e.x[k], y: e.y[k], z: 0, orientation: ORIENTATION_NAMES[e.orientation[k]] as Orientation, flipped: (e.flags[k] & FLIPPED) !== 0 })) {
        if (x < 0 || y < 0 || x >= W || y >= info.H) continue;
        const i = y * W + x;
        const list = out.get(i);
        if (list) list.push(k);
        else out.set(i, [k]);
      }
    }
    m.coverAt = out;
    return out;
  };
  /** The corner tiles of the objects standing on these tiles that `kinds` names (D315, D323). */
  function objectsOn(tiles: readonly number[], kinds: RemoveKind[] = ALL_KINDS): number[] {
    const e = mirror.current.entities;
    const at = coverAt();
    const out = new Set<number>();
    for (const i of tiles)
      for (const k of at.get(i) ?? []) if (removeTakes(kinds, e.templates[e.template[k]])) out.add(e.y[k] * info.W + e.x[k]);
    return [...out];
  }
  /** Delete everything of `kinds` standing on these tiles (every kind, the start too, by default), as
   *  one step with its whuff. `quiet`: nothing there says nothing. */
  function deleteOn(tiles: number[], quiet = false, kinds: RemoveKind[] = ALL_KINDS, counted = false): boolean {
    const corners = objectsOn(tiles, kinds);
    // (the menu counted what is there, the objects under water too: the worker takes them all)
    if (!corners.length && !counted) {
      if (!quiet) setMessage({ kind: "info", text: kinds === ALL_KINDS ? "Nothing stands there to delete." : "Nothing of that kind stands there." });
      return false;
    }
    const W = info.W;
    const at = corners.length ? corners[0] : tiles[0];
    void run(
      () => api.removeAt(tiles, kinds),
      (u) => u.ok && feel("remove", at % W, Math.floor(at / W)),
    );
    return true;
  }
  /** Delete the ground itself, one level down (D323 item 1): the top block of each tile, or under
   *  water the bed's top block; one undo step. */
  function deleteGround(tiles: number[]): boolean {
    const h = mirror.current.heights;
    const cut = renderer.current?.slice ?? null;
    const low = tiles.filter((i) => h[i] > 0 && (cut === null || h[i] <= cut));
    if (!low.length) {
      flashNote("Nothing left to delete there");
      return false;
    }
    const W = info.W;
    let sx = 0;
    let sy = 0;
    for (const i of low) {
      sx += i % W;
      sy += Math.floor(i / W);
    }
    const mid: [number, number] = [Math.round(sx / low.length), Math.round(sy / low.length)];
    const ops: EditOp[] = [{ op: "sculpt", params: { mode: "lower", cells: tilesToRuns(low, W), amount: 1, exact: true } }];
    void run(
      () => api.applySelection(ops, low.length === 1 ? "Delete a level of ground" : `Delete a level of ground on ${low.length.toLocaleString("en-GB")} tiles`, low),
      (u) => u.ok && feel("lower", mid[0], mid[1], Math.max(1, Math.sqrt(low.length) / 2)),
    );
    return true;
  }
  /** What the Delete key does on these tiles (D323 item 1): what stands there goes, objects and sources
   *  first; only where there is nothing, the ground's top level. Never silent. */
  function deleteHere(tiles: number[]): boolean {
    if (objectsOn(tiles).length) return deleteOn(tiles, true);
    return deleteGround(tiles);
  }
  /** Select and Delete (D288, D323): everything standing inside the selection (under a cut, on the
   *  visible land), or where nothing stands, its ground one level. */
  function deleteSelection() {
    const h = mirror.current.heights;
    const cut = renderer.current?.slice ?? null;
    const tiles = selection.current.tiles().filter((i) => cut === null || h[i] <= cut);
    if (tiles.length) deleteHere(tiles);
  }
  const deleteCalls = useRef({ deleteHere, deleteSelection });
  deleteCalls.current = { deleteHere, deleteSelection };

  return { pageTileFacts, coverAt, deleteOn, deleteGround, deleteCalls };
}
