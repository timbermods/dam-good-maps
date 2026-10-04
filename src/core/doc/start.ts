// The start's helpers (EDITOR_PLAN §4): where the district center may stand, and the operations that
// move it, clear the generation's objects under it, carry it off ground a force or an edit broke
// (D257) and put it back for a Try another. The forces, Select, the shelf's start and the checks'
// fixes share them.

import * as portable from "../math/portable";
import type { BuildResult } from "../features/build";
import { inBench } from "../features/raster/terrain";
import { BUILDERS } from "../features/setpieces";
import { startEntranceTile, startMiddleTile, type Orientation } from "../format/footprints";
import type { StartFeature } from "../features/schema";
import { clone } from "../spec/mergepatch";
import type { EditOp } from "./ops";
import type { MapSession } from "./session";
import type { ForceResultParams } from "../forces/op";

/** Whether the start's district center can stand with its middle at (x, y) facing `o`: its 3×3 and
 *  the tile at its door dry and on the map, clear of rivers, pieces and objects. `flat` also asks
 *  for level ground (an imported map, which has no bench to level it). Returns why not, or null. */
export function startProblem(b: BuildResult, x: number, y: number, o: Orientation, flat: boolean, ignoreOwner: string | null, pieces: Uint8Array | null = null): string | null {
  const { W, H } = b;
  const corner = cornerFor(x, y, o);
  const [ex, ey] = startEntranceTile(corner[0], corner[1], o);
  const tiles: [number, number][] = [[ex, ey]];
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) tiles.push([x + dx, y + dy]);
  const level = b.heights[y * W + x];
  const objects = new Set<number>();
  for (const e of b.entities) {
    if (e.owner === ignoreOwner || e.template === "StartingLocation") continue;
    if (/^(Pine|Birch|Oak|Succulent|BlueberryBush|RuinColumnH\d)$/.test(e.template) && !e.raw) continue; // resources make room for the start
    objects.add(e.y * W + e.x);
  }
  for (const [tx, ty] of tiles) {
    if (tx < 1 || ty < 1 || tx > W - 2 || ty > H - 2) return "too close to the map edge";
    const i = ty * W + tx;
    if (b.channel[i]) return "in a river";
    if (b.water[i] > 0.05) return "under water";
    if (flat && b.heights[i] !== level) return "not on level ground";
    if (objects.has(i)) return "on an object";
    if (pieces?.[i]) return "on a set piece";
  }
  return null;
}

/** Tiles the set pieces of a document hold (their bodies and channels). */
export function pieceTiles(s: MapSession): Uint8Array {
  const { x: W, y: H } = s.size;
  const out = new Uint8Array(W * H);
  for (const f of s.features) {
    if (f.kind !== "setPiece") continue;
    const b = BUILDERS[f.params.kind];
    for (const i of b?.clears?.(f, W, H, s.features) ?? b?.area?.(f, W, H, s.features) ?? []) out[i] = 1;
  }
  return out;
}

/** The Coordinates of a StartingLocation whose middle is (x, y). */
export function cornerFor(x: number, y: number, o: Orientation): [number, number] {
  switch (o) {
    case "Cw0":
      return [x - 1, y - 1];
    case "Cw90":
      return [x - 1, y + 1];
    case "Cw180":
      return [x + 1, y + 1];
    case "Cw270":
      return [x + 1, y - 1];
  }
}

/** The operations that move the start to the nearest spot where it stands well (a fix for the
 *  start checks), or null when there is none within 24 tiles. `level`: only where its ground is
 *  level already, its bench's disc too (a start a force carries, D257: the force's land stays as it
 *  made it, D368 (9)). `allowed`: the tiles the start, its door and its bench may stand on (a working
 *  area's inside, the ground at or below the layer's cut). */
export function moveStartNear(s: MapSession, fromX: number, fromY: number, level = false, allowed?: (i: number) => boolean): EditOp[] | null {
  const b = s.built;
  const { W, H } = b;
  const feat = s.features.find((f): f is StartFeature => f.kind === "start");
  const ent = b.entities.find((e) => e.template === "StartingLocation");
  if (!feat && !ent) return null;
  const o: Orientation = feat ? feat.params.orientation : ent!.orientation;
  const pieces = pieceTiles(s);
  for (let r = 1; r <= 24; r++) {
    const ring: [number, number][] = [];
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (Math.max(Math.abs(dx), Math.abs(dy)) === r) ring.push([fromX + dx, fromY + dy]);
    ring.sort((a, b2) => portable.pow(a[0] - fromX, 2) + portable.pow(a[1] - fromY, 2) - (portable.pow(b2[0] - fromX, 2) + portable.pow(b2[1] - fromY, 2)) || a[1] - b2[1] || a[0] - b2[0]);
    for (const [x, y] of ring) {
      if (x < 2 || y < 2 || x > W - 3 || y > H - 3) continue;
      if (feat) {
        const rr = feat.params.benchRadius;
        if (x - rr < 1 || y - rr < 1 || x + rr > W - 2 || y + rr > H - 2) continue;
        // the bench levels the ground: its disc must be dry and clear of rivers and pieces
        let ok = true;
        for (let yy = y - 2; yy <= y + 2 && ok; yy++) for (let xx = x - 2; xx <= x + 2 && ok; xx++) if (b.water[yy * W + xx] > 0.05 || b.channel[yy * W + xx]) ok = false;
        for (let yy = y - rr; yy <= y + rr && ok; yy++) for (let xx = x - rr; xx <= x + rr && ok; xx++) if (pieces[yy * W + xx]) ok = false;
        if (!ok || startProblem(b, x, y, o, level, feat.id, pieces)) continue;
        const benchLevel = Math.max(1, b.heights[y * W + x]);
        if ((level || allowed) && !benchFits(b, x, y, o, rr, level ? benchLevel : null, allowed)) continue;
        return [...startClears(s, x, y, o), { op: "updateFeature", params: { id: feat.id, patch: { params: { position: [x, y], benchLevel, bank: null } } } }];
      }
      if (startProblem(b, x, y, o, true, ent!.owner, pieces)) continue;
      if (allowed && !benchFits(b, x, y, o, 0, null, allowed)) continue;
      const [cx, cy] = cornerFor(x, y, o);
      return [{ op: "moveEntity", params: { id: ent!.id, x: cx, y: cy } }];
    }
  }
  return null;
}

/** Try another replaces the force before it (D220), and so the start carry in its step too (D257):
 *  the operations that put the start back where it stood before that force, when the latest step is
 *  that force (`forceSeq`) and it carried the start. The objects the carry cleared go with the force
 *  it replaces (the carry lists them with the force's own, worker `carryStart`). `original` is the
 *  map the force started from (a start that is only an object goes back to its place there). */
export function startCarriedBack(s: MapSession, forceSeq: number, original: readonly { id: string; template: string; x: number; y: number }[]): EditOp[] {
  const step = s.lastStepOps();
  if (step[0]?.seq !== forceSeq) return [];
  const out: EditOp[] = [];
  for (const o of step.slice(1)) {
    if (o.op === "updateFeature" && o.undo?.before?.kind === "start" && !o.orphaned) {
      out.push({ op: "updateFeature", params: { id: o.params.id, patch: { params: clone(o.undo.before.params) as unknown as Record<string, unknown> } } });
    } else if (o.op === "moveEntity") {
      const was = original.find((e) => e.id === o.params.id && e.template === "StartingLocation");
      if (was) out.push({ op: "moveEntity", params: { id: was.id, x: was.x, y: was.y } });
    }
  }
  return out;
}

/** Whether a start at (x, y) and its bench (a disc of radius `r`) stand on allowed ground, the bench's
 *  tiles already at `level` (null: any level), so laying it changes no ground. */
function benchFits(b: BuildResult, x: number, y: number, o: Orientation, r: number, level: number | null, allowed?: (i: number) => boolean): boolean {
  const { W, H } = b;
  const [cx, cy] = cornerFor(x, y, o);
  const [ex, ey] = startEntranceTile(cx, cy, o);
  if (allowed && !allowed(ey * W + ex)) return false;
  const reach = Math.max(1, r);
  for (let yy = y - reach; yy <= y + reach; yy++)
    for (let xx = x - reach; xx <= x + reach; xx++) {
      if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
      const i = yy * W + xx;
      const foot = Math.abs(xx - x) <= 1 && Math.abs(yy - y) <= 1;
      const disc = (xx - x) * (xx - x) + (yy - y) * (yy - y) <= r * r;
      if (!foot && !disc) continue;
      if (allowed && !allowed(i)) return false;
      if (level !== null && disc && !b.channel[i] && b.heights[i] !== level) return false;
    }
  return true;
}

/** The generation's trees, bushes and ruin columns under a start moved to (x, y) (its footprint and
 *  its entrance), removed in the step that puts the start there: without the removal the build
 *  would only keep them aside while the start stands on them, and moving it on would bring them
 *  back (D368 (10): only the player places objects). Empty for a map that keeps no generation's
 *  record. */
export function startClears(s: MapSession, x: number, y: number, o: Orientation): EditOp[] {
  const kept = s.generatedResources();
  if (!kept) return [];
  const { W } = s.built;
  const under = new Set<number>();
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) under.add((y + dy) * W + x + dx);
  const [cx, cy] = cornerFor(x, y, o);
  const door = startEntranceTile(cx, cy, o);
  under.add(door[1] * W + door[0]);
  const ids = s.built.entities.filter((e) => kept.has(e.owner) && under.has(e.y * W + e.x)).map((e) => e.id);
  return ids.length ? [{ op: "deleteEntities", params: { entities: ids } }] : [];
}

/** Whether an edit that changed the tiles `changed` broke the start's own ground (D257): it stood on
 *  some of them, and now it is off level ground, in a river, on an object or off the map there. */
export function startBrokenBy(s: MapSession, changed: ReadonlySet<number>): boolean {
  const b = s.built;
  const { W } = b;
  const feat = s.features.find((f): f is StartFeature => f.kind === "start");
  const ent = b.entities.find((e) => e.template === "StartingLocation");
  if (!feat && !ent) return false;
  const o: Orientation = feat ? feat.params.orientation : ent!.orientation;
  const [x, y] = feat ? feat.params.position : startMiddleTile({ x: ent!.x, y: ent!.y, orientation: o });
  const corner = cornerFor(x, y, o);
  const door = startEntranceTile(corner[0], corner[1], o);
  const tiles = [door[1] * W + door[0]];
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) tiles.push((y + dy) * W + x + dx);
  if (!tiles.some((i) => changed.has(i))) return false;
  const why = startProblem(b, x, y, o, true, feat ? feat.id : ent!.owner, pieceTiles(s));
  return why !== null && why !== "under water";
}

/** Where the map's start stands (its middle), or null without one. */
export function startMiddle(s: MapSession): [number, number] | null {
  const feat = s.features.find((f): f is StartFeature => f.kind === "start");
  if (feat) return [feat.params.position[0], feat.params.position[1]];
  const e = s.built.entities.find((g) => g.template === "StartingLocation");
  return e ? startMiddleTile({ x: e.x, y: e.y, orientation: e.orientation }) : null;
}

/** A force that broke the start's own ground carries the start to the nearest level ground where it
 *  stands well, in the same step (D257: a force is bound only by nature; the editor keeps one start,
 *  on level ground). Worked out on the session's map with the force applied. The force's land stays
 *  as it made it (D368 (9)): the start goes only where its bench's ground is level already, and the
 *  ground its old bench held is listed with the force's own, at the level it shows. It stays inside a
 *  working area and at or below the layer's cut (`inside`, `cut`: D254, D207). The objects cleared
 *  for it go with the force's own (`removed`), so a Try another that replaces the force brings them
 *  back. The force's operation and the carry's others, or null when the start still stands well or
 *  has nowhere to go. */
export function startCarry(s: MapSession, params: ForceResultParams, limits: { inside?: Uint8Array | null; cut?: number | null } = {}): { params: ForceResultParams; ops: EditOp[] } | null {
  if (!startBrokenBy(s, new Set(params.tiles))) return null;
  const at = startMiddle(s);
  if (!at) return null;
  const b = s.built;
  const inside = limits.inside ?? null;
  const cut = limits.cut ?? null;
  const allowed = inside || cut !== null ? (i: number) => (!inside || inside[i] > 0) && (cut === null || b.heights[i] <= cut) : undefined;
  const ops = moveStartNear(s, at[0], at[1], true, allowed);
  if (!ops) return null;
  const cleared = ops.flatMap((o) => (o.op === "deleteEntities" ? o.params.entities : []));
  const removed = [...params.removed, ...cleared.filter((id) => !params.removed.includes(id))];
  // (the old bench's ground, at the level the force left it: the bench moves away with the start)
  const feat = s.features.find((f): f is StartFeature => f.kind === "start");
  const own = new Map(params.tiles.map((i, k) => [i, params.heights[k]]));
  if (feat)
    for (let y = 0; y < b.H; y++)
      for (let x = 0; x < b.W; x++) {
        const i = y * b.W + x;
        if (!own.has(i) && inBench(feat, x, y)) own.set(i, b.heights[i]);
      }
  const tiles = [...own.keys()].sort((p, q) => p - q);
  return { params: { ...params, removed, tiles, heights: tiles.map((i) => own.get(i)!) }, ops: ops.filter((o) => o.op !== "deleteEntities") };
}
