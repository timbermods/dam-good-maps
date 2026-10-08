// Pure Select planner extracted from the pinned worker; share at adoption.
import type {MapSession} from "./session";
import type {EditOp} from "./ops";
import {removeKindOf,removeTakes,type RemoveKind} from "../features/objects";
import {entityTiles} from "../features/edits";
import {objectsIn,ruinFieldTilesIn,submergedIn} from "./inArea";
import {rebuiltSlope} from "../features/ids";
import {placementOf} from "../format/entities";
import {runsToTiles,tilesToRuns,type Runs} from "../math/grid";
export function planRemoveAt(s:MapSession, tiles:readonly number[], kinds:readonly RemoveKind[], label?:string):{ops:EditOp[];label:string;removed:number[]} {

  const { x: W, y: H } = s.size;
  const want = new Set(tiles);
  const ids: string[] = [];
  const slopes: { x: number; y: number }[] = [];
  const startFeatures = new Set<string>();
  const removed: number[] = [];
  const counts = new Map<RemoveKind, number>();
  // (a ruin field the selection reaches gives up the tiles inside it, the columns the water hides too; the
  // columns outside keep their heights and places, D360 b)
  const fields = removeTakes(kinds, "RuinColumnH1") ? ruinFieldTilesIn(s, want) : new Map<string, number[]>();
  for (const e of s.built.entities) {
    if (e.raw && !placementOf(e.raw)) continue;
    if (!entityTiles(e).some(([tx, ty]) => tx >= 0 && ty >= 0 && tx < W && ty < H && want.has(ty * W + tx))) continue;
    const kind = removeKindOf(e.template);
    if (!kind || !removeTakes(kinds, e.template)) continue;
    if (kind === "ruins" && fields.has(e.owner)) {
      removed.push(e.y * W + e.x);
      counts.set(kind, (counts.get(kind) ?? 0) + 1);
      continue;
    }
    if (kind === "slopes" && (rebuiltSlope(e.owner) || e.owner.startsWith("pinned:"))) slopes.push({ x: e.x, y: e.y });
    else if (kind === "start" && s.features.some((f) => f.kind === "start" && f.id === e.owner)) startFeatures.add(e.owner);
    else ids.push(e.id);
    removed.push(e.y * W + e.x);
    counts.set(kind, (counts.get(kind) ?? 0) + 1);
  }
  // what the resource features hold under water there is deleted too (D345, B5), and nothing they would
  // plant on these tiles later stands again as the water drains or the ground dries: the features'
  // areas give up the tiles where nothing stands now
  for (const o of submergedIn(s, want)) {
    if (!removeTakes(kinds, o.template)) continue;
    removed.push(o.tile);
    const kind = removeKindOf(o.template)!;
    counts.set(kind, (counts.get(kind) ?? 0) + 1);
  }
  const trims = new Map<string, Set<number>>();
  for (const f of s.features) {
    // (not a ruin field: its columns' heights are assigned over its whole area, so giving tiles up would
    // change the ones that stand)
    if (f.kind !== "forest" && f.kind !== "berryPatch") continue;
    if (!removeTakes(kinds, f.kind === "forest" ? "Pine" : "BlueberryBush")) continue;
    const standing = new Set<number>();
    for (const e of s.built.entities) if (e.owner === f.id) for (const [tx, ty] of entityTiles(e)) standing.add(ty * W + tx);
    const gone = new Set<number>();
    for (const i of runsToTiles(f.params.area as Runs, W)) if (want.has(i) && !standing.has(i)) gone.add(i);
    if (gone.size) trims.set(f.id, gone);
  }
  if (!removed.length) throw Error("nothing to remove there");
  const ops: EditOp[] = [];
  if (ids.length) ops.push({ op: "deleteEntities", params: { entities: ids } });
  for (const [id, gone] of trims) {
    const f = s.features.find((g) => g.id === id);
    if (!f || !("area" in f.params)) continue;
    const keep = runsToTiles(f.params.area as Runs, W).filter((i) => !gone.has(i));
    // (a feature whose whole area was under water has nothing left: it goes)
    ops.push(keep.length ? { op: "updateFeature", params: { id, patch: { params: { area: tilesToRuns(keep, W) } } } } : { op: "deleteFeature", params: { id } });
  }
  for (const [id, gone] of fields) {
    const f = s.features.find((g) => g.id === id);
    if (!f || f.kind !== "ruinField") continue;
    const cleared = new Set<number>(f.params.cleared ? runsToTiles(f.params.cleared, W) : []);
    for (const i of gone) cleared.add(i);
    const left = runsToTiles(f.params.area, W).some((i) => !cleared.has(i));
    ops.push(left ? { op: "updateFeature", params: { id, patch: { params: { cleared: tilesToRuns([...cleared].sort((a, b) => a - b), W) } } } } : { op: "deleteFeature", params: { id } });
  }
  for (const p of slopes) ops.push({ op: "removeSlope", params: p });
  for (const id of startFeatures) ops.push({ op: "deleteFeature", params: { id } });
  const one: Record<RemoveKind, [string, string]> = { trees: ["a tree", "trees"], bushes: ["a bush", "bushes"], ruins: ["a ruin", "ruins"], sources: ["a source", "sources"], water: ["a water source", "water sources"], badwater: ["a badwater source", "badwater sources"], slopes: ["a slope", "slopes"], objects: ["an object", "objects"], start: ["the start", "the start"] };
  const auto = counts.size === 1 ? (() => { const [k, n] = [...counts][0]; return n === 1 ? `Remove ${one[k][0]}` : `Remove ${n} ${one[k][1]}`; })() : `Remove ${removed.length} objects`;
  return {ops,label:label??auto,removed};
}
