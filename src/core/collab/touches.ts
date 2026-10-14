// What an action touched: the ground and identities it wrote (W) and the ground and identities it
// read or reached (T), following INTEGRATION.md's table ("What built on the same ground means",
// investigation/collab-architecture). Two players' actions are built on the same ground when one's
// writes meet the other's touches. A later no-op stroke still touched the ground, and a later action
// of the same player counts too. Forces, feature operations and water operations read the whole map
// (drainage, geology, route choice and nearest safe start can read distant tiles): their touch is the
// whole map until the core's reads are audited and instrumented; no guessed radius.

import type { EditOp } from "../doc/ops";
import { brushBounds, markBrushTiles } from "../features/raster/brush";
import { entityTiles } from "../forces/force";
import { difference, type MapState, type Patch } from "./mapState";
import { Mask } from "./mask";

export interface Touches {
  /** Tiles directly written: the intended tiles of each operation and every tile that actually changed. */
  writes: Mask;
  /** Tiles touched: what was written plus what was read (halos, rims, neighbours), or the whole map. */
  touch: Mask;
  /** Identity keys: "entity:<id>" for each object created, moved, changed or removed; "lakes"; "feature-order". */
  keys: Set<string>;
  patch: Patch;
}

/** Writes, touches and identity keys of the operations a step applied (`ops`: the literal operations,
 *  a force's carry among them), between the states before and after. */
export function touchesOf(ops: readonly EditOp[], before: MapState, after: MapState): Touches {
  const d = difference(before, after);
  const { W, H } = before;
  const N = W * H;
  const keys = d.keys;
  const touch = new Mask(N);
  const intent = new Mask(N);
  const rect = (m: Mask, x0: number, y0: number, x1: number, y1: number) => {
    for (let y = Math.max(0, y0); y <= Math.min(H - 1, y1); y++) for (let x = Math.max(0, x0); x <= Math.min(W - 1, x1); x++) m.add(y * W + x);
  };
  const runs = (m: Mask, r: readonly (readonly number[])[]) => {
    for (const [y, x0, x1] of r) rect(m, x0, y, x1, y);
  };
  const entity = (id: string) => {
    keys.add(`entity:${id}`);
    for (const s of [before, after]) {
      const e = s.entities.find((g) => g.id === id);
      if (e) for (const i of entityTiles(W, H, e)) { touch.add(i); intent.add(i); }
      // (a resource object's ground is touched too, though its object is not part of the patch)
      for (const i of s.derived.find((g) => g[0] === id)?.[1] ?? []) { touch.add(i); intent.add(i); }
    }
  };
  const whole = () => {
    touch.union(new Mask(N, true));
  };
  for (const op of ops) {
    switch (op.op) {
      case "brush": {
        const marked = new Uint8Array(N);
        markBrushTiles(op.params, W, H, marked);
        const here = new Mask(N);
        for (let i = 0; i < N; i++) if (marked[i]) here.add(i);
        for (const r of op.params.rigid ?? []) rect(here, r[0], r[1], r[2], r[3]);
        for (const [x, y] of op.params.slopes ?? []) rect(here, x, y, x, y);
        intent.union(here);
        touch.union(here);
        // (the stroke's reach: ramped rims, neighbours and the pieces it levels with it)
        const b = brushBounds(op.params, W, H);
        if (b) rect(touch, b.x0 - 1, b.y0 - 1, b.x1 + 1, b.y1 + 1);
        break;
      }
      case "sculpt": {
        const here = new Mask(N);
        runs(here, op.params.cells);
        intent.union(here);
        touch.union(here);
        if (op.params.mode === "smooth" || op.params.mode === "naturalize") for (const i of here.tiles()) rect(touch, (i % W) - 1, Math.floor(i / W) - 1, (i % W) + 1, Math.floor(i / W) + 1);
        break;
      }
      case "placeEntity":
      case "moveEntity":
      case "setEntityProps":
        entity(op.params.id);
        break;
      case "deleteEntities":
        for (const id of op.params.entities) entity(id);
        break;
      case "paintObjects": {
        const here = new Mask(N);
        runs(here, op.params.area);
        intent.union(here);
        touch.union(here);
        break;
      }
      case "pinSlope":
      case "removeSlope":
        intent.add(op.params.y * W + op.params.x);
        rect(touch, op.params.x - 1, op.params.y - 1, op.params.x + 1, op.params.y + 1);
        break;
      case "forceResult":
        whole();
        // (the objects it removes, carries, fells or clears, and the sources it adds, each at the tiles it stood
        // on before and stands on after: a generated tree gone from the map is in `derived` of the state before)
        for (const id of [...op.params.removed, ...(op.params.moved ?? []).map((m) => m.id), ...(op.params.felled ?? []).map((f) => f.id), ...(op.params.cleared ?? []).map((c) => c.id)]) entity(id);
        for (const s of [...(op.params.source ? [op.params.source] : []), ...(op.params.sources ?? [])]) entity(s.id);
        if (op.params.replaces !== undefined) keys.add(`action:${op.params.replaces}`);
        if (op.params.lake) keys.add("lakes");
        break;
      case "removeUnfedWater":
      case "fillHollow":
        // (what a source feeds is read map-wide)
        whole();
        keys.add("lakes");
        break;
      case "addFeature":
      case "updateFeature":
      case "deleteFeature":
      case "reorderFeature":
        whole();
        keys.add("feature-order");
        break;
    }
  }
  // what actually changed is always both written and touched
  touch.union(d.writes);
  intent.union(d.writes);
  return { writes: intent, touch, keys, patch: d.patch };
}
