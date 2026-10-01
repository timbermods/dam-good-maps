// The DGM Probe's tall maps (PLAN §20 D172): test maps for the probe batch that confirms maps above 16 load and keep
// their terrain, water and objects. Our own maps only: generated maps and one real place, changed deterministically and
// built with the steps the generator and Real places use (assemble.ts: the canonical water settle, soil moisture and
// contamination on it, the settled singletons, metadata and thumbnail).
//
// The runner writes these itself before it plans `--group "Tall maps"` (tools/probe-maps/group.ts);
// `tools/probe-tall.ts` runs the same writer by hand, with the Python validator's load checks too. The manifest,
// tall.json, holds what each map tests, its sha256, its counts above 16, the tiles and the focus the probe records, and
// our validator's load checks. terrain.max_height (the limit the batch tested) is reported: it failed above 16 until
// run 20260925-tall confirmed tall maps (D172 (1)), and passes up to 22 since. terrain.edge_wall (D151) is a principle
// about how maps are built, not loading: the stretched real place keeps its conversion's wall.
//
// Heights are the surface (the first air layer): a tile at 22 has solid voxels 0–21, and layer 22 (the file's 23rd)
// stays empty (FORMAT.md §4.3).

import { readFileSync } from "node:fs";
import { bush, tree, waterSource, type EntitySpec } from "../../src/core/format/entities";
import { FOOTPRINTS, startEntranceTile, worldBlocks } from "../../src/core/format/footprints";
import { num, type JsonObject } from "../../src/core/format/json";
import { writeTimber, type TimberFile } from "../../src/core/format/timber";
import { floorsOf, GAME_VERSION, LAYERS } from "../../src/core/format/world";
import { generate } from "../../src/core/gen/generate";
import { guidFrom } from "../../src/core/math/hash";
import { buildPlace, decodePlaceFile, encodeHeights, decodeHeights, validatePlace } from "../../src/core/places/place";
import { makeSpec, type ThemeId } from "../../src/core/spec/mapspec";
import { validateMap } from "../../src/core/validate/checks";
import { assembleFitting, drop, placement, TALL_MAX, tilesOf, type Built, type Draft } from "./assemble";
import { repoFile, type BuiltMap, type GroupWriter } from "./group";

const OWNER = "dgm-probe-tall";

// (the build steps, for tools that start from the tall maps: tools/probe-ceiling.ts)
export { assemble, assembleFitting, drop, TALL_MAX, type Built, type Draft } from "./assemble";

// ------------------------------------------------------------------------------------------ drafts

export function fromGenerated(theme: ThemeId, seed: number, size: number): Draft & { water: Float64Array } {
  const r = generate(makeSpec({ seed, theme, size: { x: size, y: size } }));
  if (!r.report.passed) throw new Error(`${theme} ${seed} ${size}² did not pass its checks`);
  const b = r.built;
  return { W: b.W, H: b.H, heights: b.heights.slice(), entities: b.entities.map((e) => ({ ...e, raw: undefined })), description: "", removed: {}, water: b.water };
}

// --------------------------------------------------------------------------------------- the changes

/** Every tile at level `from` or higher raised by `by`; objects standing wholly on raised ground go up
 *  with it, objects that straddle the new cliff are left for assembleFitting to remove. */
export function liftHighGround(d: Draft, from: number, by: number): void {
  const { W } = d;
  const lifted = (x: number, y: number) => d.heights[y * W + x] >= from;
  const next: EntitySpec[] = [];
  for (const e of d.entities) {
    const tiles = tilesOf(e).filter(([x, y]) => x >= 0 && y >= 0 && x < d.W && y < d.H);
    const n = tiles.filter(([x, y]) => lifted(x, y)).length;
    // a slope climbs to the tile on its high side: lift it only with its own tile
    if (n === 0) next.push(e);
    else if (n === tiles.length) next.push({ ...e, z: e.z + by });
    else d.removed[e.template] = (d.removed[e.template] ?? 0) + 1;
  }
  d.entities = next;
  for (let i = 0; i < d.heights.length; i++) if (d.heights[i] >= from) d.heights[i] += by;
}

export function raiseAll(d: Draft, by: number): void {
  for (let i = 0; i < d.heights.length; i++) d.heights[i] += by;
  d.entities = d.entities.map((e) => ({ ...e, z: e.z + by }));
}

/** Moves the StartingLocation to the flat 3×3 at the map's highest level nearest its old place, with its
 *  entrance tile at the same level and no water within two tiles; objects in its way are removed. */
function startOnTop(d: Draft, water: Float64Array): { x: number; y: number; z: number } {
  const { W, H, heights } = d;
  let top = 0;
  for (const h of heights) top = Math.max(top, h);
  const start = d.entities.find((e) => e.template === "StartingLocation");
  if (!start) throw new Error("no start");
  const at = (x: number, y: number) => (x >= 0 && y >= 0 && x < W && y < H ? heights[y * W + x] : -1);
  const dry = (x: number, y: number) => {
    for (let dy = -2; dy <= 4; dy++) for (let dx = -2; dx <= 4; dx++) if (x + dx >= 0 && y + dy >= 0 && x + dx < W && y + dy < H && water[(y + dy) * W + x + dx] > 0) return false;
    return true;
  };
  let best: [number, number] | null = null;
  let bestD = Infinity;
  for (let y = 2; y < H - 4; y++)
    for (let x = 2; x < W - 4; x++) {
      let flat = true;
      for (let dy = 0; dy < 3 && flat; dy++) for (let dx = 0; dx < 3 && flat; dx++) if (at(x + dx, y + dy) !== top) flat = false;
      const [ex, ey] = startEntranceTile(x, y, "Cw0");
      if (!flat || at(ex, ey) !== top || !dry(x, y)) continue;
      const dist = (x - start.x) ** 2 + (y - start.y) ** 2;
      if (dist < bestD) (bestD = dist), (best = [x, y]);
    }
  if (!best) throw new Error(`no flat 3×3 at level ${top} for the start`);
  const moved: EntitySpec = { ...start, x: best[0], y: best[1], z: top, orientation: "Cw0" };
  const cells = new Set(worldBlocks(FOOTPRINTS.StartingLocation, placement(moved)).map((b) => `${b.x},${b.y}`));
  const [ex, ey] = startEntranceTile(moved.x, moved.y, "Cw0");
  cells.add(`${ex},${ey}`);
  drop(d, (e) => e === start || !tilesOf(e).some(([x, y]) => cells.has(`${x},${y}`)));
  d.entities = d.entities.map((e) => (e === start ? moved : e));
  return { x: moved.x, y: moved.y, z: top };
}

interface Summit {
  cx: number;
  cy: number;
  /** The lake's source (on its floor) and the spring on the level-22 rim. */
  lakeSource: [number, number, number];
  topSpring: [number, number, number];
  lake: [number, number][];
  channel: [number, number][];
}

/**
 * A stepped massif rising to 22, with a summit lake: a 7×7 basin with its floor at 19 and a rim at 22 three
 * tiles wide, a source on the lake's floor, a notch at 21 on the east side and a groove one level below each
 * ring down the east face, so the lake stands at about 21 and runs out down the steps. A second spring sits
 * on the rim at 22, beside the lake. Trees and a bush stand on the rim. Built on the dry high ground whose
 * centre is chosen by `findSummit`; objects on raised tiles are removed.
 */
function summit(d: Draft, cx: number, cy: number): Summit {
  const { W, H } = d;
  const base = d.heights.slice();
  const top = TALL_MAX;
  const r0 = 6;
  const lakeFloor = top - 3;
  const notch = top - 1;
  const target = new Uint8Array(W * H);
  const channel: [number, number][] = [];
  const lake: [number, number][] = [];
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const dd = Math.max(Math.abs(x - cx), Math.abs(y - cy));
      const ring = dd <= r0 ? top : top - (dd - r0);
      const b0 = base[y * W + x];
      let level = Math.max(b0, Math.min(top, ring));
      if (dd <= 3) {
        level = lakeFloor;
        lake.push([x, y]);
      } else if (y === cy && x > cx && dd <= r0) {
        level = notch;
        channel.push([x, y]);
      } else if (y === cy && x > cx && ring > b0) {
        // the groove: one level below its ring, down to the ground the massif stands on
        level = Math.max(b0, ring - 1);
        channel.push([x, y]);
      }
      target[y * W + x] = level;
    }
  const changed = (x: number, y: number) => target[y * W + x] !== base[y * W + x];
  drop(d, (e) => !tilesOf(e).some(([x, y]) => x >= 0 && y >= 0 && x < W && y < H && changed(x, y)));
  d.heights = target;
  const id = (k: string) => guidFrom(OWNER, "summit", k);
  const lakeSource: [number, number, number] = [cx, cy, lakeFloor];
  const topSpring: [number, number, number] = [cx, cy + 4, top];
  d.entities.push(waterSource({ id: id("lake source"), owner: OWNER, x: cx, y: cy, z: lakeFloor, strength: 1.5 }));
  d.entities.push(waterSource({ id: id("top spring"), owner: OWNER, x: topSpring[0], y: topSpring[1], z: top, strength: 0.5 }));
  const trees: [number, number, "Pine" | "Birch" | "Oak"][] = [[cx - 5, cy - 5, "Pine"], [cx + 5, cy - 5, "Birch"], [cx - 5, cy + 5, "Oak"], [cx + 5, cy + 5, "Pine"], [cx - 5, cy, "Birch"]];
  for (const [x, y, species] of trees) d.entities.push(tree({ id: id(`tree ${x} ${y}`), owner: OWNER, x, y, z: top, species }));
  d.entities.push(bush({ id: id("bush"), owner: OWNER, x: cx, y: cy - 5, z: top, ripe: true }));
  return { cx, cy, lakeSource, topSpring, lake, channel };
}

/** The centre with the most dry ground at the map's highest level within the massif's reach, away from
 *  the start, the water and every object that is not a plant or a ruin. */
function findSummit(d: Draft, water: Float64Array, reach = 13): [number, number] {
  const { W, H, heights } = d;
  let high = 0;
  for (const h of heights) high = Math.max(high, h);
  const blocked = new Uint8Array(W * H);
  for (const e of d.entities) {
    if (/^(Pine|Birch|Oak|Succulent|BlueberryBush|RuinColumnH\d|Thorns)$/.test(e.template)) continue;
    for (const [x, y] of tilesOf(e)) if (x >= 0 && y >= 0 && x < W && y < H) blocked[y * W + x] = 1;
  }
  for (let i = 0; i < W * H; i++) if (water[i] > 0) blocked[i] = 1;
  let best: [number, number] | null = null;
  let bestScore = -1;
  for (let cy = reach + 2; cy < H - reach - 2; cy++)
    for (let cx = reach + 2; cx < W - reach - 2; cx++) {
      let ok = true;
      let score = 0;
      for (let y = cy - reach - 2; y <= cy + reach + 2 && ok; y++)
        for (let x = cx - reach - 2; x <= cx + reach + 2 && ok; x++) {
          if (blocked[y * W + x]) ok = false;
          else if (heights[y * W + x] === high) score++;
        }
      if (ok && score > bestScore) (bestScore = score), (best = [cx, cy]);
    }
  if (!best) throw new Error("no dry high ground for the summit");
  return best;
}

// ------------------------------------------------------------------------------------------ the maps

export interface TallMap {
  id: string;
  title: string;
  tests: string;
  built: Built;
  removed: Record<string, number>;
  /** The tile the probe's extra poses look at. */
  focus: [number, number];
  /** Tiles whose water the probe samples through the day: moving water above 16, then standing water. */
  flowTiles: [number, number][];
  poolTiles: [number, number][];
  extra?: Record<string, unknown>;
}

const DESCRIPTION = "DGM Probe tall-map test (not for play). The in-game map editor only edits terrain up to level 16.";

function highlandsLift(): TallMap {
  const d = fromGenerated("highlands", 4242, 128);
  d.description = `${DESCRIPTION} Highlands (4242) 128²: every tile at level 11–16 raised 6 levels to 17–22; the rest as generated.`;
  liftHighGround(d, 11, 6);
  const built = assembleFitting(d);
  const { flow, pool } = waterTiles(built);
  return {
    id: "tall-highlands-lift",
    title: "Tall · Highlands 128², the high ground lifted to 17–22",
    tests: "Terrain lifted to 17–22 in parts beside unchanged ground (a 7-level cliff where 10 meets 17); the generator's streams and springs on the high ground now above 16; plants and ruins above 16.",
    built,
    removed: d.removed,
    focus: focusOf(built, flow, pool),
    flowTiles: flow,
    poolTiles: pool,
  };
}

function lakeBasinStart(): TallMap {
  const d = fromGenerated("lakeBasin", 4242, 96);
  d.description = `${DESCRIPTION} Lake Basin (4242) 96²: every column raised 6 levels (terrain up to 22), and the start moved onto the level-22 plateau.`;
  const water = d.water;
  raiseAll(d, 6);
  const start = startOnTop(d, water);
  const built = assembleFitting(d);
  const { flow, pool } = waterTiles(built);
  return {
    id: "tall-lakebasin-start22",
    title: "Tall · Lake Basin 96² raised 6, the start at level 22",
    tests: "The start at the game's highest level (22) and every kind of object the generator places, raised 6 (above 16 where it stood at 11 or higher); rivers and springs from the edges above 16.",
    built,
    removed: d.removed,
    focus: [start.x + 1, start.y + 1],
    flowTiles: flow,
    poolTiles: pool,
  };
}

function canyonSummit(): TallMap {
  const d = fromGenerated("canyon", 4242, 128);
  const [cx, cy] = findSummit(d, d.water);
  d.description = `${DESCRIPTION} Canyon (4242) 128² with a stepped massif rising to 22 at (${cx}, ${cy}): a summit lake (floor 19) fed by a spring, running out through a notch at 21 down a stepped groove, and a spring on the level-22 rim.`;
  const s = summit(d, cx, cy);
  const built = assembleFitting(d);
  const moving = waterTiles(built);
  const flow = s.channel.filter(([x, y]) => built.settle.depth[y * built.file.world.sizeX + x] > 0.02).slice(0, 8);
  const pool = [s.lake[Math.floor(s.lake.length / 2)], s.lake[0], s.lake[s.lake.length - 1]];
  return {
    id: "tall-canyon-summit-lake",
    title: "Tall · Canyon 128² with a summit lake at 19–21 and springs at 19 and 22",
    tests: "Water standing above 16 (a lake 2 deep on a floor at 19) and flowing above 16 (out through a notch at 21 and down a stepped groove), a source at 19 and a spring on the level-22 rim; trees and a bush at 22.",
    built,
    removed: d.removed,
    focus: [cx, cy],
    flowTiles: flow.length ? flow : moving.flow,
    poolTiles: pool,
    extra: { lakeSource: s.lakeSource, topSpring: s.topSpring },
  };
}

/** Near Yosemite Valley (the Real places data), its relief stretched from 16 to 22 levels. */
function yosemiteStretched(): TallMap {
  const path = repoFile("public", "real-places", "data", "near-yosemite-valley.json.gz");
  const p = decodePlaceFile(new Uint8Array(readFileSync(path)));
  const h = decodeHeights(p.heights);
  let max = 0;
  for (const v of h) max = Math.max(max, v);
  const scale = TALL_MAX / max;
  const tall = h.map((v) => Math.round(v * scale));
  const built = buildPlace({ ...p, name: `${p.name} (tall test)`, heights: encodeHeights(tall) });
  built.file.metadata = { ...built.file.metadata!, MapDescription: `${DESCRIPTION} ${p.name}, from the Real places data, its relief stretched from ${max} to ${TALL_MAX} levels (every height × ${scale.toFixed(3)}, rounded).\n\n${String(built.file.metadata!.MapDescription)}` };
  const validation = validatePlace(built);
  if (validation.report.checks.some((c) => !c.ok && c.class === "load")) throw new Error("the tall Yosemite fails a load check");
  const { flow, pool } = waterTiles(built);
  return {
    id: "tall-yosemite",
    title: "Tall · Near Yosemite Valley 96², relief stretched to 22",
    tests: `A real place through the Real places build (buildPlace: the canonical settle, soil, validation) with its heights × ${scale.toFixed(3)}: valley walls up to 22, its start, plants and ruins on the stretched ground.`,
    built,
    removed: {},
    focus: focusOf(built, flow, pool),
    flowTiles: flow,
    poolTiles: pool,
    extra: { place: p.id, stretchedFrom: max },
  };
}

/** Water above 16 in a built map: moving tiles (the settle's outflow) and standing ones, spread apart. */
export function waterTiles(b: Built): { flow: [number, number][]; pool: [number, number][] } {
  const W = b.file.world.sizeX;
  const { depth, out } = b.settle;
  const moving: [number, number, number][] = [];
  const standing: [number, number, number][] = [];
  for (let i = 0; i < depth.length; i++) {
    if (b.heights[i] < 17 || depth[i] <= 0.02) continue;
    const o = out ? out[4 * i] + out[4 * i + 1] + out[4 * i + 2] + out[4 * i + 3] : 0;
    (o > 0.01 ? moving : standing).push([i % W, Math.floor(i / W), o > 0.01 ? o : depth[i]]);
  }
  const spread = (list: [number, number, number][], n: number) => {
    const sorted = [...list].sort((a, c) => c[2] - a[2] || a[1] - c[1] || a[0] - c[0]);
    const pick: [number, number][] = [];
    for (const [x, y] of sorted) {
      if (pick.every(([px, py]) => Math.max(Math.abs(px - x), Math.abs(py - y)) >= 4)) pick.push([x, y]);
      if (pick.length >= n) break;
    }
    return pick;
  };
  return { flow: spread(moving, 8), pool: spread(standing, 4) };
}

/** Where the extra poses look: moving water above 16, else standing water, else the steepest wall
 *  inside the map (the largest drop to a neighbour, away from the edges). */
function focusOf(b: Built, flow: [number, number][], pool: [number, number][]): [number, number] {
  if (flow.length) return flow[0];
  if (pool.length) return pool[0];
  const W = b.file.world.sizeX, H = b.file.world.sizeY, h = b.heights;
  let best: [number, number] = [W >> 1, H >> 1];
  let drop = -1;
  for (let y = 8; y < H - 8; y++)
    for (let x = 8; x < W - 8; x++) {
      const i = y * W + x;
      if (h[i] <= 16) continue;
      const d = Math.max(h[i] - h[i - 1], h[i] - h[i + 1], h[i] - h[i - W], h[i] - h[i + W]);
      if (d > drop) (drop = d), (best = [x, y]);
    }
  return best;
}

// ------------------------------------------------------------------------------------------ report

interface Counts {
  maxHeight: number;
  tilesAbove16: number;
  tilesAt22: number;
  wetTiles: number;
  wetAbove16: number;
  objects: number;
  objectsAbove16: number;
  plantsAbove16: number;
  sourcesAbove16: { template: string; x: number; y: number; z: number; strength: number }[];
  start: { x: number; y: number; z: number } | null;
  singleFloor: boolean;
  topLayerEmpty: boolean;
}

function counts(b: Built): Counts {
  const w = b.file.world;
  const n = w.sizeX * w.sizeY;
  let max = 0, above = 0, at22 = 0, wet = 0, wetAbove = 0;
  for (let i = 0; i < n; i++) {
    const h = b.heights[i];
    max = Math.max(max, h);
    if (h > 16) above++;
    if (h === TALL_MAX) at22++;
    if (b.settle.depth[i] > 0.05) {
      wet++;
      if (h > 16) wetAbove++;
    }
  }
  const ents = w.entities.map((e) => {
    const c = e.Components as JsonObject;
    const co = (c.BlockObject as JsonObject).Coordinates as JsonObject;
    const ws = (c.WaterSource ?? null) as JsonObject | null;
    return { template: String(e.Template), x: num(co.X), y: num(co.Y), z: num(co.Z), strength: ws ? num(ws.SpecifiedStrength) : 0 };
  });
  const start = ents.find((e) => e.template === "StartingLocation");
  let top = 0;
  for (let i = 0; i < n; i++) if (w.voxels[(LAYERS - 1) * n + i]) top++;
  const floors = floorsOf(w);
  return {
    maxHeight: max,
    tilesAbove16: above,
    tilesAt22: at22,
    wetTiles: wet,
    wetAbove16: wetAbove,
    objects: ents.filter((e) => e.template !== "StartingLocation").length,
    objectsAbove16: ents.filter((e) => e.template !== "StartingLocation" && e.z > 16).length,
    plantsAbove16: ents.filter((e) => /^(Pine|Birch|Oak|Succulent|BlueberryBush)$/.test(e.template) && e.z > 16).length,
    sourcesAbove16: ents.filter((e) => /Source$/.test(e.template) && e.z > 16).map((e) => ({ template: e.template, x: e.x, y: e.y, z: e.z, strength: e.strength })),
    start: start ? { x: start.x, y: start.y, z: start.z } : null,
    singleFloor: floors.every((f) => f <= 1),
    topLayerEmpty: top === 0,
  };
}

interface ValidatorResult {
  passed: boolean;
  /** Failed checks other than terrain.max_height (the limit under test). */
  failed: string[];
  maxHeight: string;
}

function tsLoadChecks(file: TimberFile): ValidatorResult {
  const v = validateMap(file, { profile: "export", loadOnly: true });
  const bad = v.report.checks.filter((c) => !c.ok && c.id !== "terrain.max_height" && c.id !== "terrain.edge_wall").map((c) => `${c.id}: ${c.message}`);
  const mh = v.report.checks.find((c) => c.id === "terrain.max_height");
  return { passed: bad.length === 0, failed: bad, maxHeight: mh ? `${mh.ok ? "ok" : "fails, as expected"}: ${mh.message}` : "not reported" };
}

// ------------------------------------------------------------------------------------------ the writer

export const TALL_MAKERS = [highlandsLift, lakeBasinStart, canyonSummit, yosemiteStretched];

/** One tall map as the probe gets it, with its manifest entry (our validator's load checks included). */
export function buildTall(make: () => TallMap): BuiltMap & { built: Built; ok: boolean } {
  const m = make();
  const bytes = writeTimber(m.built.file);
  const c = counts(m.built);
  const ts = tsLoadChecks(m.built.file);
  const ok = ts.passed && c.singleFloor && c.topLayerEmpty && c.maxHeight > 16 && c.maxHeight <= TALL_MAX;
  return {
    file: `${m.id}.timber`,
    bytes,
    size: [m.built.file.world.sizeX, m.built.file.world.sizeY],
    built: m.built,
    ok,
    entry: { id: m.id, title: m.title, tests: m.tests, ...c, removed: m.removed, focus: m.focus, flowTiles: m.flowTiles, poolTiles: m.poolTiles, ...(m.extra ?? {}), validators: { typescript: ts } },
  };
}

export const TALL_WRITER: GroupWriter = {
  group: "Tall maps",
  ids: ["tall-highlands-lift", "tall-lakebasin-start22", "tall-canyon-summit-lake", "tall-yosemite"],
  tool: "tools/probe-tall.ts",
  folder: "tall",
  env: "DGM_PROBE_TALL",
  manifest: "tall.json",
  build(log) {
    const maps: BuiltMap[] = [];
    for (const make of TALL_MAKERS) {
      const t0 = Date.now();
      const m = buildTall(make);
      const c = m.entry as unknown as Counts & { removed: Record<string, number>; validators: { typescript: ValidatorResult } };
      if (!m.ok) throw new Error(`${m.file}: not a tall map our load checks allow (max ${c.maxHeight}; ${c.validators.typescript.failed.join("; ") || "one floor per tile and the top layer empty required"})`);
      log?.(`${m.file}: max ${c.maxHeight}, ${c.tilesAbove16} tiles above 16 (${c.tilesAt22} at 22), ${c.wetAbove16} wet above 16, ${c.objectsAbove16} objects above 16, ${c.sourcesAbove16.length} sources above 16, start ${c.start ? `z ${c.start.z}` : "none"}; removed ${JSON.stringify(c.removed)} (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
      maps.push(m);
    }
    return { maps, manifest: { format: 1, tool: "tools/probe-tall.ts", gameVersion: GAME_VERSION } };
  },
};
