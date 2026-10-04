// Editing helpers (EDITOR_PLAN §4): moving a feature (the start, by the shelf and the start's
// handle), what an edit that reshapes the ground does to the objects standing there, and the plain
// names of features. The tools that drew rivers, lakes, landforms and set pieces are gone (EDITOR_PLAN
// §10); the build still replays the features old projects hold (D158).

import { polygonMask } from "../features/geometry";
import { BUILDERS } from "../features/setpieces";
import type { Feature, Point, SetPieceKind } from "../features/schema";
import type { Runs } from "../math/grid";
import { clone } from "../spec/mergepatch";
import { patchFeature, type EditOp, type OpParams } from "./ops";
import { entityTiles } from "../features/edits";
import { isLine, OBJECT_NAMES, objectTiles } from "../features/objects";
import type { MapSession } from "./session";
import { startClears } from "./start";

// (the editor imports the start's corner from here)
export { cornerFor } from "./start";

export type PlannedEdit<F extends Feature = Feature> =
  | { ok: true; ops: EditOp[]; feature: F; report: string[]; label: string; tiles: number[] }
  | { ok: false; errors: string[] };

const fail = (...errors: string[]): { ok: false; errors: string[] } => ({ ok: false, errors });

// ------------------------------------------------------------------ objects on reshaped ground

/** Templates that stand on the ground as objects (not plants, ruins, slopes, sources or the start):
 *  what an edit that reshapes the ground must move or clear. */
const GROUND_OBJECTS = new Set([
  "UndergroundRuins", "SmallRelic", "MediumRelic", "LargeRelic", "GeothermalField", "UnstableCore", "Thorns", "NaturalDam", "Blockage",
  "NaturalOverhang2x1", "NaturalOverhang3x1", "NaturalOverhang4x1", "ReservePile", "ReserveTank", "ReserveWarehouse", "AncientAquiferDrill",
]);

/** What an edit that reshapes the ground (a set piece, a lake, a landform, a river) does to the map
 *  objects standing there (EDITOR_PLAN §3; D87, decisions-pending #47): an object whose ground
 *  still holds it moves to the new ground (single objects stand on it, so they follow it), and one
 *  it no longer holds (uneven ground, a river's channel, the new feature's body) is cleared, and the
 *  report says which. `ops` are the edit's operations; `edited` the features they plan (left alone).
 *  Returns the operations that clear objects, and the report's lines. */
export function objectsOnNewGround(s: MapSession, ops: readonly EditOp[], edited: ReadonlySet<string>): { ops: EditOp[]; report: string[]; refuse?: string } {
  const { x: W, y: H } = s.size;
  const N = W * H;
  // the features after the edit
  let feats: Feature[] = clone(s.features as Feature[]);
  let touched = false;
  for (const op of ops) {
    if (op.op === "addFeature") {
      const i = op.params.index;
      if (i === undefined || i >= feats.length) feats.push(clone(op.params.feature));
      else feats.splice(i, 0, clone(op.params.feature));
      touched = true;
    } else if (op.op === "updateFeature") {
      feats = feats.map((f) => (f.id === op.params.id ? patchFeature(f, op.params.patch) : f));
      touched = true;
    } else if (op.op === "deleteFeature") {
      feats = feats.filter((f) => f.id !== op.params.id);
      touched = true;
    }
  }
  if (!touched) return { ops: [], report: [] };
  const before = s.built;
  const after = s.terrainWith(feats);
  const changed = new Uint8Array(N);
  let any = false;
  for (let i = 0; i < N; i++)
    if (before.heights[i] !== after.heights[i] || (after.channel[i] && !before.channel[i])) {
      changed[i] = 1;
      any = true;
    }
  // the bodies of the features the edit plans: a set piece's, a lake's basin, a river's channel
  const body = new Uint8Array(N);
  for (const f of feats) {
    if (!edited.has(f.id)) continue;
    if (f.kind === "setPiece") for (const i of BUILDERS[f.params.kind]?.clears?.(f, W, H, feats) ?? BUILDERS[f.params.kind]?.area?.(f, W, H, feats) ?? []) body[i] = 1;
    else if (f.kind === "lake") polygonMask(f.params.outline, W, H).forEach((v, i) => v && (body[i] = 1));
    else if (f.kind === "river") for (let i = 0; i < N; i++) if (after.channel[i]) body[i] = 1;
  }
  if (!any) for (let i = 0; i < N && !any; i++) if (body[i]) any = true;
  if (!any) return { ops: [], report: [] };
  const out: EditOp[] = [];
  const report: string[] = [];
  const hit = (tiles: readonly (readonly [number, number])[]) => tiles.some(([x, y]) => x >= 0 && y >= 0 && x < W && y < H && (changed[y * W + x] || body[y * W + x]));
  // map object features: their objects stand on the ground wherever it is, so they move with it
  const objectIds = new Set<string>();
  for (const f of feats) {
    if (f.kind !== "mapObject") continue;
    objectIds.add(f.id);
    if (edited.has(f.id)) continue;
    const tiles = objectTiles(f, W, H);
    if (!hit(tiles)) continue;
    const kind = f.params.kind;
    const name = OBJECT_NAMES[kind].toLowerCase();
    let why = "";
    let level = -1;
    for (const [x, y] of tiles) {
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const i = y * W + x;
      if (body[i] && kind !== "weir" && kind !== "plug") why = "the new feature covers its ground";
      else if (after.channel[i] && kind !== "weir" && kind !== "plug") why = "a river runs through its ground";
      else if (!isLine(kind)) {
        if (level < 0) level = after.heights[i];
        else if (after.heights[i] !== level) why = "its ground is no longer level";
      }
      if (why) break;
    }
    if (why) {
      out.push({ op: "deleteFeature", params: { id: f.id } });
      report.push(`clears the ${name}: ${why}`);
    } else if (tiles.some(([x, y]) => x >= 0 && y >= 0 && x < W && y < H && before.heights[y * W + x] !== after.heights[y * W + x])) {
      report.push(`the ${name} moves to the new ground`);
    }
  }
  // another feature's water or badwater source (a river's spring, a lake's, a badwater hollow's):
  // it belongs to that feature and can be neither moved nor cleared with the ground, so an edit
  // that reshapes the ground under it is refused
  for (const e of before.entities) {
    if ((e.template !== "WaterSource" && e.template !== "BadwaterSource") || edited.has(e.owner)) continue;
    const tiles = entityTiles(e);
    if (!hit(tiles)) continue;
    if (tiles.some(([x, y]) => x < 0 || y < 0 || x >= W || y >= H || after.heights[y * W + x] !== before.heights[y * W + x] || body[y * W + x])) {
      const what = e.template === "BadwaterSource" ? "a badwater spring" : "a water source";
      return { ops: [], report: [], refuse: `it would reshape the ground under ${what} at (${e.x}, ${e.y}): place it farther from it` };
    }
  }
  // the imported map's own objects and objects placed by hand: the loader keeps them only on
  // ground at their level
  const gone: string[] = [];
  for (const e of after.entities) {
    if (!GROUND_OBJECTS.has(e.template) || objectIds.has(e.owner)) continue;
    const tiles = entityTiles(e);
    if (!hit(tiles)) continue;
    if (tiles.some(([x, y]) => x < 0 || y < 0 || x >= W || y >= H || after.heights[y * W + x] !== e.z || body[y * W + x])) gone.push(e.id);
  }
  if (gone.length) {
    const have = new Set(before.entities.map((e) => e.id));
    const ids = gone.filter((id) => have.has(id));
    if (ids.length) {
      out.push({ op: "deleteEntities", params: { entities: ids } });
      report.push(`clears ${ids.length === 1 ? "an object" : `${ids.length} objects`} left without level ground`);
    }
  }
  return { ops: out, report };
}

/** A planned edit with the objects on the ground it reshapes moved or cleared (see
 *  `objectsOnNewGround`). */
export function withObjectsOnNewGround<F extends Feature>(s: MapSession, r: PlannedEdit<F>, edited: string): PlannedEdit<F> {
  if (!r.ok) return r;
  const extra = objectsOnNewGround(s, r.ops, new Set([edited]));
  if (extra.refuse) return fail(extra.refuse);
  if (!extra.ops.length && !extra.report.length) return r;
  return { ...r, ops: [...r.ops, ...extra.ops], report: [...r.report, ...extra.report] };
}

/** A set piece's name, as the player sees it. */
export function pieceName(kind: SetPieceKind): string {
  return (
    { waterfall: "waterfall", damSite: "dam site", gorge: "gorge", terracedCliffs: "terraced cliffs", badwaterBasin: "badwater spring", plugSpillway: "plugged spillway", obstaclePayoff: "obstacle", secondDistrict: "second district site" } as Record<
      SetPieceKind,
      string
    >
  )[kind];
}

// --------------------------------------------------------------------------------------- moving

/** The `updateFeature` patch that moves a feature by (dx, dy) tiles without planning it again. A
 *  river keeps the ends that sit on the map edge on that edge (its sealed mouth stays a mouth); the
 *  start's bench takes the ground level at its new place. It no longer runs to a river's bank (the
 *  water rule, D153: the colony walks to the water over the map's own slopes), and a
 *  bank a project saved before kept is dropped. */
export function movePatch(f: Feature, dx: number, dy: number, W: number, H: number, heights: Uint8Array): OpParams["updateFeature"]["patch"] {
  const shift = (p: Point): Point => [p[0] + dx, p[1] + dy];
  const onEdge = (v: number, max: number) => v <= 0 || v >= max;
  switch (f.kind) {
    case "forest":
    case "berryPatch":
    case "ruinField":
      return { params: { area: f.params.area.map(([y, a, b]) => [y + dy, a + dx, b + dx]) as Runs } };
    case "start": {
      const [x, y] = shift(f.params.position);
      const benchLevel = Math.max(1, heights[y * W + x]);
      return { params: { position: [x, y], benchLevel, bank: null } };
    }
    case "landform":
      return { params: { outline: (f.params.outline ?? []).map(shift) } };
    case "lake":
      return { params: { outline: f.params.outline.map(shift), outlet: { at: shift(f.params.outlet.at) } } };
    case "river":
      return { params: { path: f.params.path.map(([x, y]) => [onEdge(x, W - 1) ? x : x + dx, onEdge(y, H - 1) ? y : y + dy]) } };
    default:
      return {};
  }
}

/** Move a feature by (dx, dy) tiles (the start, by the shelf and its handle). */
export function moveEdit(s: MapSession, id: string, dx: number, dy: number): PlannedEdit {
  return withObjectsOnNewGround(s, movePlan(s, id, dx, dy), id);
}

function movePlan(s: MapSession, id: string, dx: number, dy: number): PlannedEdit {
  const f = s.features.find((g) => g.id === id);
  if (!f) return fail("that feature is gone");
  const { x: W, y: H } = s.size;
  const label = `Move ${kindName(f)}`;
  const patch = movePatch(f, dx, dy, W, H, s.built.heights);
  const moved = { ...f, params: { ...f.params, ...(patch.params as object) } } as Feature;
  // (the start takes its clear ground: the generation's trees and bushes there go, D368 (10))
  const clears = moved.kind === "start" ? startClears(s, moved.params.position[0], moved.params.position[1], moved.params.orientation) : [];
  return { ok: true, ops: [...clears, { op: "updateFeature", params: { id, patch } }], feature: moved, report: [], label, tiles: [] };
}

/** A feature's name, as the player sees it. */
export function kindName(f: Feature): string {
  switch (f.kind) {
    case "setPiece":
      return pieceName(f.params.kind);
    case "landform":
      return f.params.kind === "terraces" ? "terraces" : f.params.kind;
    case "berryPatch":
      return "berry patch";
    case "ruinField":
      return "ruin field";
    case "mapObject":
      return "map object";
    default:
      return f.kind;
  }
}
