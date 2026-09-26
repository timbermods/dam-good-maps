// Placing things on the map (EDITOR_PLAN §4, roadmap M7): map objects (mine sites, relics,
// geothermal fields, unstable cores; thorn belts, weirs and plugs), resource areas (forests, berry
// patches and ruin fields, with what will grow and the ruins' calibrated clustering), and single
// entities in advanced mode. Each plans on the document's current map and returns the operations
// that apply it, or why it does not fit: an invalid placement is shown and refused, never placed
// (the game would delete it on load, or it would die).

import { BUILDERS } from "../features/setpieces";
import { badwaterMouth } from "../features/build";
import { mouthTiles } from "../features/raster/terrain";
import { entityTiles } from "../features/edits";
import { pathField, polygonMask } from "../features/geometry";
import { footprintAt, fitProblems, isLine, OBJECT_NAMES, objectTiles, type FitGround } from "../features/objects";
import { lakeWater } from "../features/setpieces/plugSpillway";
import type { Feature, ForestFeature, MapObjectFeature, MapObjectKind, Point, RuinFieldFeature } from "../features/schema";
import { FOOTPRINTS, worldBlocks, type Orientation } from "../format/footprints";
import { density, FOREST, RUIN_HEIGHT_SHARES, RUINS } from "../gen/calibrated";
import { growBlob, punchHoles } from "../gen/blobs";
import { guidFrom, hash32, tileHash01 } from "../math/hash";
import { distanceFrom, runsToTiles, tilesToRuns } from "../math/grid";
import { stream } from "../math/rng";
import { bandScale, EXTRA_BANDS } from "../validate/playability";
import type { EditOp } from "./ops";
import type { MapSession } from "./session";
import { planContextOf, replacePatch, type PlannedEdit } from "./tools";

const fail = (...errors: string[]): { ok: false; errors: string[] } => ({ ok: false, errors });

/** Resource features make room for what is placed by hand (they are placed after it, build step
 *  11): their entities do not count as taking a tile. */
function resourceOwners(s: MapSession): Set<string> {
  return new Set(s.features.filter((f) => f.kind === "forest" || f.kind === "berryPatch" || f.kind === "ruinField").map((f) => f.id));
}

/** The settled water depth per tile (an import's file water where the map shows it). */
export function waterDepth(s: MapSession): ArrayLike<number> {
  if (!s.showsStoredWater) return s.built.water;
  const { x: W, y: H } = s.size;
  const out = new Float64Array(W * H);
  const w = s.storedWater();
  for (let k = 0; k < w.tile.length; k++) if (w.depth[k] > out[w.tile[k]]) out[w.tile[k]] = w.depth[k];
  return out;
}

/** The map as objects see it: the ground, the water, the rivers, the tiles other objects take (the
 *  resources make room), the start's zone, caves and locks. `exclude` is a feature planned again. */
export function objectGround(s: MapSession, exclude: string | null = null): FitGround {
  const ctx = planContextOf(s, exclude);
  const { W, H } = ctx;
  const b = s.built;
  const skip = resourceOwners(s);
  if (exclude) skip.add(exclude);
  const occupied = new Uint8Array(W * H);
  for (const e of b.entities) {
    if (skip.has(e.owner)) continue;
    for (const [x, y] of entityTiles(e)) if (x >= 0 && y >= 0 && x < W && y < H) occupied[y * W + x] = 1;
  }
  // set pieces keep their bodies and channels clear
  for (const f of s.features) {
    if (f.kind !== "setPiece" || f.id === exclude) continue;
    for (const i of BUILDERS[f.params.kind]?.clears?.(f, W, H, s.features) ?? []) occupied[i] = 1;
  }
  return { W, H, heights: ctx.heights, water: waterDepth(s), channel: ctx.channel ?? null, occupied, start: ctx.start ?? null, columns: s.columns.size ? s.columns : null, locked: ctx.locked ?? null };
}

// ---------------------------------------------------------------------------------- map objects

export interface ObjectRequest {
  kind: MapObjectKind;
  /** A single object: the south-west corner of its footprint, and its facing. */
  at?: [number, number];
  orientation?: Orientation;
  /** A weir or a plug across a river: the river and the place clicked on it (arc position). */
  river?: { id: string; at: number };
  /** A thorn belt, or a line drawn by hand: its tiles (y·W + x). */
  tiles?: number[];
  /** Share of a belt's tiles that get thorns, 0.1–1. */
  density?: number;
  /** An unstable core: its explosion radius (0–5) and the cycle its countdown starts. */
  core?: { radius: number; cycles: number };
}

/** The tiles of a line across a river's channel at arc position `at` (a slab one tile thick, so no
 *  water passes it side to side). */
export function acrossRiver(s: MapSession, riverId: string, at: number): number[] {
  const f = s.features.find((g) => g.id === riverId);
  if (!f || f.kind !== "river") return [];
  const { x: W, y: H } = s.size;
  const field = pathField(f.params.path, W, H);
  const out: number[] = [];
  for (let i = 0; i < W * H; i++) if (s.built.channel[i] && field.d[i] < f.params.width / 2 + 1 && Math.abs(field.s[i] - at) <= 0.5) out.push(i);
  return out;
}

/** Plan a map object (a new one, or the one with this id planned again). */
export function planObject(s: MapSession, req: ObjectRequest, id: string, origin: Feature["origin"] = "user"): PlannedEdit {
  const { x: W, y: H } = s.size;
  const existing = s.features.find((f): f is MapObjectFeature => f.id === id && f.kind === "mapObject") ?? null;
  if (existing && existing.params.kind !== req.kind) return fail("a map object keeps its kind");
  const g = objectGround(s, existing ? id : null);
  const name = OBJECT_NAMES[req.kind];
  const report: string[] = [];
  let feature: MapObjectFeature;
  if (!isLine(req.kind)) {
    if (!req.at) return fail(`click where the ${name.toLowerCase()} goes`);
    const o = req.orientation ?? "Cw0";
    const [x, y] = [Math.round(req.at[0]), Math.round(req.at[1])];
    const tiles = footprintAt(req.kind, x, y, o);
    const problems = fitProblems(req.kind, tiles, g);
    if (problems.length) return fail(`the ${name.toLowerCase()} does not fit there: ${problems.join("; ")}`);
    const core = req.kind === "unstableCore" ? { radius: Math.min(5, Math.max(0, Math.round(req.core?.radius ?? 2))), cycles: Math.min(99, Math.max(1, Math.round(req.core?.cycles ?? 5))) } : undefined;
    feature = { id, kind: "mapObject", origin: existing?.origin ?? origin, ...(existing?.role ? { role: existing.role } : {}), locked: existing?.locked ?? false, params: { kind: req.kind, placement: { x, y, orientation: o }, ...(core ? { core } : {}) } };
    report.push(...distanceNote(s, req.kind, tiles));
    if (core) report.push(`it explodes ${core.cycles > 1 ? `in cycle ${core.cycles}` : "in the first cycle"}, taking the ground ${core.radius + 1} tiles round it; it can't be removed`);
  } else {
    let tiles: number[];
    if (req.river) {
      if (req.kind === "thornBelt") return fail("draw a thorn belt on the land");
      tiles = acrossRiver(s, req.river.id, req.river.at);
      if (!tiles.length) return fail("click on a river's channel");
    } else tiles = (req.tiles ?? []).filter((i) => i >= 0 && i < W * H);
    // a belt is blotchy: a share of its tiles (the official belts fill 30–70% of their box)
    if (req.kind === "thornBelt" && req.density !== undefined && req.density < 1) {
      const seed = hash32(id, "belt");
      tiles = tiles.filter((i) => tileHash01(seed, i % W, Math.floor(i / W)) < req.density!);
    }
    const fits: number[] = [];
    const why = new Map<string, number>();
    for (const i of tiles) {
      const p = fitProblems(req.kind, [[i % W, Math.floor(i / W)]], g);
      if (!p.length) fits.push(i);
      else for (const w of p) why.set(w, (why.get(w) ?? 0) + 1);
    }
    if (!fits.length) return fail(`no tile there takes a ${name.toLowerCase()}: ${[...why.keys()].join("; ") || "draw it on the map"}`);
    // a weir or a plug across a river must close the whole channel, or the water goes round it
    if (req.river && fits.length < tiles.length) return fail(`the ${name.toLowerCase()} can't close the river there: ${[...why.keys()].join("; ")}`);
    if (fits.length < tiles.length) report.push(`${tiles.length - fits.length} tile${tiles.length - fits.length > 1 ? "s stay" : " stays"} free: ${[...why.entries()].map(([w, n]) => `${w} (${n})`).join("; ")}`);
    if (fits.length > 4096) return fail("that is too many tiles for one object line");
    feature = { id, kind: "mapObject", origin: existing?.origin ?? origin, ...(existing?.role ? { role: existing.role } : {}), locked: existing?.locked ?? false, params: { kind: req.kind, placement: { area: tilesToRuns(fits, W) } } };
    if (req.kind === "thornBelt") report.push(`${fits.length} thorns: they block walking and keep the soil under them dry; builders clear them, at a risk of injury`);
    else if (req.kind === "weir") report.push(`a weir of ${fits.length} natural dam tiles holds the water 0.65 above the river's bed upstream`);
    else report.push(`a plug of ${fits.length} blockage tiles closes the channel; demolishing it lets the water through`);
  }
  const tiles = objectTiles(feature, W, H).filter(([x, y]) => x >= 0 && y >= 0 && x < W && y < H).map(([x, y]) => y * W + x);
  const ops: EditOp[] = existing
    ? [{ op: "updateFeature", params: { id, patch: { params: replacePatch(existing.params, feature.params) as Record<string, unknown> } } }]
    : [{ op: "addFeature", params: { feature } }];
  return { ok: true, ops, feature, report, label: `${existing ? "Change" : "Add"} ${name.toLowerCase()}`, tiles };
}

/** How far an object stands from the start, and where the generator puts its kind. */
function distanceNote(s: MapSession, kind: MapObjectKind, tiles: readonly (readonly [number, number])[]): string[] {
  const ctx = planContextOf(s);
  const band = EXTRA_BANDS[kind];
  if (!ctx.start || !band) return [];
  let d = Infinity;
  for (const [x, y] of tiles) d = Math.min(d, Math.sqrt((x - ctx.start.x) * (x - ctx.start.x) + (y - ctx.start.y) * (y - ctx.start.y)));
  const sc = band.scaled ? bandScale(ctx.W, ctx.H) : 1;
  const lo = Math.round(band.lo * sc);
  const hi = band.hi < Infinity ? Math.round(band.hi * sc) : null;
  return [`${Math.round(d)} tiles from the start (generated ones stand ${lo}${hi ? `–${hi}` : "+"} tiles out)`];
}

/** Move a map object by (dx, dy) tiles: planned again at its new place, and refused there when it
 *  does not fit. */
export function moveObject(s: MapSession, id: string, dx: number, dy: number): PlannedEdit {
  const f = s.features.find((g): g is MapObjectFeature => g.id === id && g.kind === "mapObject");
  if (!f) return fail("that object is gone");
  const { x: W, y: H } = s.size;
  const p = f.params;
  const req: ObjectRequest =
    "area" in p.placement
      ? {
          kind: p.kind,
          tiles: runsToTiles(p.placement.area, W)
            .map((i) => [(i % W) + dx, Math.floor(i / W) + dy])
            .filter(([x, y]) => x >= 0 && y >= 0 && x < W && y < H)
            .map(([x, y]) => y * W + x),
        }
      : { kind: p.kind, at: [p.placement.x + dx, p.placement.y + dy], orientation: p.placement.orientation, ...(p.core ? { core: p.core } : {}) };
  const r = planObject(s, req, id, f.origin);
  return r.ok ? { ...r, label: `Move ${OBJECT_NAMES[p.kind].toLowerCase()}` } : r;
}

// ------------------------------------------------------------------------------- resource areas

export interface AreaRequest {
  kind: "forest" | "berryPatch" | "ruinField";
  /** The drawn outline (a rectangle's corners, or points clicked). */
  outline: Point[];
  /** Share of tiles with a tree or bush, 0.1–1. */
  density: number;
  /** A forest's trees: one species, or "mixed". */
  species?: "Pine" | "Birch" | "Oak" | "mixed";
  /** A forest: trees only where they live ("alive"), or dead ones on dry ground too ("auto"). */
  life?: "alive" | "auto";
}

/** What a planned area shows: the tiles where plants live, where they would stand dead, and where
 *  nothing is placed (water, objects). */
export interface AreaPreview {
  alive: number[];
  dead: number[];
  bare: number[];
}

/** Plan a forest, a berry patch or ruin fields on a drawn area. Forests and bushes grow alive only
 *  where the soil stays moist (EDITOR_PLAN §1); ruins grow as the official maps' fields do (PLAN
 *  §9.7): blobs of one level, filling about 56% of their box with 5% holes, as many fields as the
 *  area holds at the calibrated field size. */
export function planArea(s: MapSession, req: AreaRequest, id: string, origin: Feature["origin"] = "user"): PlannedEdit & { preview?: AreaPreview } {
  const { x: W, y: H } = s.size;
  const b = s.built;
  const mask = polygonMask(req.outline, W, H);
  const area: number[] = [];
  for (let i = 0; i < W * H; i++) if (mask[i]) area.push(i);
  if (area.length < 4) return fail("draw the area at least 2 by 2 tiles");
  const g = objectGround(s);
  const water = g.water!;
  const moisture = b.moisture;
  const soil = b.soilContamination;
  // the resources placed before this one keep their tiles (berries, then forests, then ruin
  // fields, each in document order, build step 11)
  const occupied = (b.cache.occupiedBeforeResources ?? (g.occupied as Uint8Array)).slice();
  const kindOf = new Map(s.features.map((f) => [f.id, f.kind]));
  for (const e of b.entities) {
    const k = kindOf.get(e.owner);
    if (k === "berryPatch" || (k === "forest" && req.kind !== "berryPatch") || (k === "ruinField" && req.kind === "ruinField"))
      for (const [x, y] of entityTiles(e)) if (x >= 0 && y >= 0 && x < W && y < H) occupied[y * W + x] = 1;
  }
  g.occupied = occupied;
  const dens = Math.min(1, Math.max(0.1, Math.round(req.density * 100) / 100));
  const base = { id, origin, locked: false };
  if (req.kind === "forest" || req.kind === "berryPatch") {
    const preview: AreaPreview = { alive: [], dead: [], bare: [] };
    const sPlace = hash32(s.spec?.seed ?? 0, id, "place");
    const life = req.kind === "forest" ? (req.life ?? "alive") : "alive";
    for (const i of area) {
      const x = i % W;
      const y = (i - x) / W;
      if (dens < 1 && tileHash01(sPlace, x, y) >= dens) continue;
      if (water[i] > 0 || g.occupied?.[i] || g.channel?.[i]) {
        preview.bare.push(i);
        continue;
      }
      const moist = moisture[i] > 0 && !(soil[i] > 0);
      if (moist) preview.alive.push(i);
      else if (life === "auto") preview.dead.push(i);
      else preview.bare.push(i);
    }
    if (!preview.alive.length && !preview.dead.length) return fail(`nothing would grow there: ${req.kind === "forest" ? "trees" : "bushes"} live on moist ground, beside water`);
    let feature: Feature;
    const report: string[] = [];
    if (req.kind === "forest") {
      const speciesMix = !req.species || req.species === "mixed" ? { Pine: 0.47, Birch: 0.27, Oak: 0.2, Succulent: 0.06 } : { [req.species]: 1 };
      feature = { ...base, kind: "forest", params: { area: tilesToRuns(area, W), density: dens, speciesMix, life, youngShare: FOREST.youngShare } } as ForestFeature;
      report.push(`about ${preview.alive.length + preview.dead.length} trees: ${preview.alive.length} alive where the soil stays moist${life === "auto" ? `, ${preview.dead.length} dead on dry ground` : ""}`);
      if (life === "alive" && preview.bare.length) report.push(`${preview.bare.length} tiles of dry ground, water or objects stay bare`);
    } else {
      feature = { ...base, kind: "berryPatch", params: { area: tilesToRuns(area, W), density: dens, ripeShare: 0.5 } };
      report.push(`about ${preview.alive.length} blueberry bushes on moist ground`);
      if (preview.bare.length) report.push(`${preview.bare.length} tiles stay bare: bushes die on dry ground`);
    }
    return { ok: true, ops: [{ op: "addFeature", params: { feature } }], feature, report, label: `Add ${req.kind === "forest" ? "forest" : "berry patch"}`, tiles: area, preview };
  }
  // ruin fields: blobs on one level, dry and free, in fields of the calibrated size
  const allowed = new Uint8Array(W * H);
  let free = 0;
  for (const i of area) {
    if (water[i] > 0 || g.occupied?.[i] || g.channel?.[i] || g.columns?.has(i)) continue;
    const x = i % W;
    const y = (i - x) / W;
    if (g.start && Math.abs(x - g.start.x) <= g.start.radius && Math.abs(y - g.start.y) <= g.start.radius) continue;
    allowed[i] = 1;
    free++;
  }
  if (free < 12) return fail("a ruin field needs 12+ tiles of dry, free ground");
  const rng = stream(id, "ruins");
  const median = density("ruin_field_columns", W * H);
  const fields: number[][] = [];
  const left = allowed.slice();
  const want = Math.max(12, Math.round(free * dens));
  let placed = 0;
  for (let tries = 0; tries < 60 && placed < want; tries++) {
    const cands: number[] = [];
    for (const i of area) if (left[i]) cands.push(i);
    if (cands.length < 12) break;
    const seedTile = cands[rng.int(0, cands.length)];
    const size = Math.min(want - placed, Math.floor(median * rng.pick(RUINS.sizeFactors)));
    if (size < 10) break;
    const level = b.heights[seedTile];
    const same = new Uint8Array(W * H);
    for (const i of cands) if (b.heights[i] === level) same[i] = 1;
    let tiles = growBlob(rng, same, W, H, seedTile, Math.floor(size / (1 - RUINS.holeShare)), RUINS.compactness);
    if (tiles.length < 10) {
      left[seedTile] = 0;
      continue;
    }
    tiles = punchHoles(rng, tiles, W, RUINS.holeShare);
    // a field fills its box about as the official ones do (0.56 median): a blob squeezed along a
    // narrow ledge is no field
    let x0 = W;
    let y0 = H;
    let x1 = 0;
    let y1 = 0;
    for (const i of tiles) {
      const x = i % W;
      const y = (i - x) / W;
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    }
    // (more than 30% of its box, counted in whole numbers so the bound is exact)
    if (tiles.length < 10 || 10 * tiles.length <= 3 * (x1 - x0 + 1) * (y1 - y0 + 1)) {
      left[seedTile] = 0;
      continue;
    }
    fields.push(tiles);
    placed += tiles.length;
    // a one-tile moat keeps fields apart
    for (const i of tiles) {
      const x = i % W;
      const y = (i - x) / W;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (x + dx >= 0 && y + dy >= 0 && x + dx < W && y + dy < H) left[(y + dy) * W + x + dx] = 0;
    }
  }
  if (!fields.length) return fail("the ground there is too broken for a ruin field: fields stand on one level");
  const meanH = RUIN_HEIGHT_SHARES.reduce((a, v, k) => a + v * (k + 1), 0);
  const features: RuinFieldFeature[] = fields.map((tiles, k) => ({
    id: k === 0 ? id : guidFrom(id, "ruinField", k),
    kind: "ruinField",
    origin,
    locked: false,
    params: { area: tilesToRuns(tiles, W), scrapTarget: Math.round(tiles.length * 15 * meanH), heightMix: [...RUIN_HEIGHT_SHARES], centerBias: RUINS.centerBias },
  }));
  const cols = fields.reduce((a, t) => a + t.length, 0);
  const report = [`${fields.length} ruin field${fields.length > 1 ? "s" : ""} of ${fields.map((t) => t.length).join(", ")} columns: about ${Math.round(cols * 15 * meanH).toLocaleString("en-US")} scrap metal`];
  const preview: AreaPreview = { alive: fields.flat(), dead: [], bare: area.filter((i) => !allowed[i]) };
  return { ok: true, ops: features.map((feature) => ({ op: "addFeature", params: { feature } }) as EditOp), feature: features[0], report, label: fields.length > 1 ? "Add ruin fields" : "Add ruin field", tiles: preview.alive, preview };
}

// ------------------------------------------------------------------------------------- entities

/** Why the game would not keep an object placed at (x, y) on the current map (its loader's rules,
 *  validate/checks.ts `entities.placement`), or null when it would. `ignore` is the entity being
 *  moved. Resources make room (they are placed after it). */
export function entityProblem(s: MapSession, p: { template: string; x: number; y: number; orientation: Orientation; flipped?: boolean }, ignore: string | null = null): string | null {
  const fp = FOOTPRINTS[p.template];
  if (!fp) return `${p.template} can't be placed`;
  const { x: W, y: H } = s.size;
  const b = s.built;
  if (p.x < 0 || p.y < 0 || p.x >= W || p.y >= H) return "it is off the map";
  const z = b.heights[p.y * W + p.x];
  const skip = resourceOwners(s);
  // a resource's own entity moves after the resources are placed: they do not make room for it
  const moved = ignore ? b.entities.find((e) => e.id === ignore) : undefined;
  if (moved && skip.has(moved.owner)) skip.clear();
  const taken = new Map<number, string>();
  for (const e of b.entities) {
    if (e.id === ignore || skip.has(e.owner)) continue;
    for (const [tx, ty] of entityTiles(e)) if (tx >= 0 && ty >= 0 && tx < W && ty < H) taken.set(ty * W + tx, e.template);
  }
  for (const blk of worldBlocks(fp, { template: p.template, x: p.x, y: p.y, z, orientation: p.orientation, flipped: !!p.flipped })) {
    if (blk.x < 0 || blk.y < 0 || blk.x >= W || blk.y >= H || blk.z >= 33) return "it does not fit on the map";
    const i = blk.y * W + blk.x;
    if (s.columns.has(i)) return "there is a cave or overhang there";
    const top = b.heights[i];
    if (blk.z < top) return "it would stand inside the ground: the ground under it is not level";
    if ((blk.below === "ground" || blk.below === "groundOrStackable") && blk.z > top) return "it would float: the ground under it is not level";
    const other = taken.get(i);
    if (other) {
      if (other === "StartingLocation") return "the district center stands there";
      const name = other === "UndergroundRuins" ? "mine site" : other.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
      return `${/^[aeiou]/.test(name) ? "an" : "a"} ${name} stands there`;
    }
  }
  return null;
}

/** Planned operations that make no feature (an entity placed by hand). */
export type PlannedOps = { ok: true; ops: EditOp[]; report: string[]; label: string; tiles: number[] } | { ok: false; errors: string[] };

export interface EntityRequest {
  template: string;
  x: number;
  y: number;
  orientation: Orientation;
  flipped?: boolean;
  /** Components that differ from the template's defaults (an unstable core's radius). */
  components?: Record<string, unknown>;
}

/** Plan an entity placed by hand (advanced mode): the loader's rules first. */
export function planEntity(s: MapSession, req: EntityRequest, id: string): PlannedOps {
  if (!FOOTPRINTS[req.template]) return fail(`${req.template} can't be placed`);
  const why = entityProblem(s, req);
  if (why) return fail(`it can't stand there: ${why}`);
  const { x: W } = s.size;
  const tiles = worldBlocks(FOOTPRINTS[req.template], { ...req, z: 0, flipped: !!req.flipped }).map((b) => b.y * W + b.x);
  const op: EditOp = { op: "placeEntity", params: { id, template: req.template, x: req.x, y: req.y, orientation: req.orientation, ...(req.flipped ? { flipped: true } : {}), ...(req.components ? { components: req.components } : {}) } };
  const name = req.template.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
  return { ok: true, ops: [op], report: [`a ${name} at (${req.x}, ${req.y})`], label: `Place ${name}`, tiles: [...new Set(tiles)] };
}

// ------------------------------------------------------------------------------ badwater rivers

/** Turn a river's water to badwater, or back (EDITOR_PLAN §4: a toggle, with its warnings). Its
 *  mouth on the map edge gets BadwaterSources, 3×3 each, so the mouth must be 3+ tiles wide and
 *  level there. */
export function planRiverBadwater(s: MapSession, riverId: string, on: boolean): PlannedEdit {
  const f = s.features.find((g) => g.id === riverId);
  if (!f || f.kind !== "river") return fail("pick a river");
  if (f.params.badwater === on) return fail(on ? "the river is badwater already" : "the river is clean already");
  const report: string[] = [];
  if (on) {
    if (!("edge" in f.params.entry)) return fail("a badwater river starts at the map edge: this one starts at a spring or a lake");
    const { x: W, y: H } = s.size;
    const field = pathField(f.params.path, W, H);
    const mouth = mouthTiles(f, { W, H, pathField: () => field, narrows: () => [] });
    const { groups } = badwaterMouth(mouth, f.params.entry.edge, W, H, s.built.heights);
    if (!groups.length) return fail("the river's mouth is too narrow: badwater sources need 3 tiles of it");
    const h = s.built.heights;
    for (const [x, y] of groups) {
      const lv = h[y * W + x];
      for (let dy = 0; dy < 3; dy++) for (let dx = 0; dx < 3; dx++) if (h[(y + dy) * W + x + dx] !== lv) return fail("the river's bed at the map edge is not level for badwater sources (3 by 3)");
    }
    report.push("its water turns to badwater: beavers can't drink it");
    report.push("the soil along it gets contaminated, and the trees and bushes there die");
    // the start drinks from the water near it
    const st = planContextOf(s).start;
    if (st && field.d[st.y * W + st.x] <= 24) report.push("the start is beside this river: its beavers will need clean water from another river or a lake");
  } else report.push("its water runs clean again");
  const ops: EditOp[] = [{ op: "updateFeature", params: { id: riverId, patch: { params: { badwater: on } } } }];
  return { ok: true, ops, feature: f, report, label: on ? "Make the river badwater" : "Make the river clean", tiles: [] };
}

// ---------------------------------------------------------------------------------- spillways

/** The lake whose water is at or next to (x, y) (a click on its shore), or null. */
export function lakeAt(s: MapSession, x: number, y: number): string | null {
  const { x: W, y: H } = s.size;
  let best: string | null = null;
  let bd = Infinity;
  for (const f of s.features) {
    if (f.kind !== "lake" || f.params.planned) continue;
    const w = lakeWater(f, W, H);
    for (let yy = Math.max(0, y - 4); yy <= Math.min(H - 1, y + 4); yy++)
      for (let xx = Math.max(0, x - 4); xx <= Math.min(W - 1, x + 4); xx++) {
        if (!w[yy * W + xx]) continue;
        const d = (xx - x) * (xx - x) + (yy - y) * (yy - y);
        if (d < bd) {
          bd = d;
          best = f.id;
        }
      }
  }
  return best;
}

export { distanceFrom, runsToTiles };

// ------------------------------------------------------------------------------ hover preview

/** Where an object or an entity would stand, and why the game would refuse it there (null when it
 *  may): the editor paints the footprint green or red under the pointer before the click. */
export function footprintCheck(s: MapSession, req: ({ tool: "object" } & ObjectRequest) | ({ tool: "entity" } & EntityRequest)): { tiles: number[]; problem: string | null } {
  const { x: W, y: H } = s.size;
  const inMap = (t: readonly (readonly [number, number])[]) => t.filter(([x, y]) => x >= 0 && y >= 0 && x < W && y < H).map(([x, y]) => y * W + x);
  if (req.tool === "entity") {
    const fp = FOOTPRINTS[req.template];
    if (!fp) return { tiles: [], problem: `${req.template} can't be placed` };
    const tiles = inMap(worldBlocks(fp, { ...req, z: 0, flipped: !!req.flipped }).map((b) => [b.x, b.y] as const));
    return { tiles: [...new Set(tiles)], problem: entityProblem(s, req) };
  }
  if (isLine(req.kind) || !req.at) return { tiles: [], problem: null };
  const { tool: _t, ...r } = req;
  const tiles = inMap(footprintAt(req.kind, req.at[0], req.at[1], req.orientation ?? "Cw0"));
  const p = planObject(s, r, "hover");
  return { tiles, problem: p.ok ? null : p.errors[0] };
}
