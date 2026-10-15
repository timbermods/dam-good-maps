// The DGM Probe's Terrain 3D group's writer (PLAN §20 D127, D279, D481): the test maps for terrain above terrain
// that the game has not played as dev writes them now. T3–T6 (tools/terrain3d-maps.ts; played in September with
// seven-digit water tokens, written since with nine) and T7, the sink map, whose rule under a roof is from the
// game's code and not yet played. T1 and T2 hold no water and are the bytes the game played: they are not rewritten.
//
// The maps go to C:\dgm-probe\terrain3d-2 (DGM_PROBE_TERRAIN3D moves it), never C:\dgm-probe\terrain3d, which keeps
// the files runs terrain3d-20260927 and terrain3d-20260929 played. The runner calls this before it plans
// `--group "Terrain 3D"`; tools/probe-3d.ts runs it by hand.
//
// The cave edits (what players get from Foundations' stage 6, the Block tool and Erode, D483): official maps with
// caves imported, edited through the app's own core (MapSession, the operations the editor sends) and exported, so
// their water on every column and their soil on every run are the app's own:
// - hollows-edited, canyon-edited: three plain tiles raised by one (tools/import-hashes.ts makes the same edit);
// - pillars-roof-stroke: a Lower brush stroke on a cave's roof, cut to its lowest layer;
// - hollows-block-dig: a Block tool dig, 3 × 3, into a cave wall beside the cave's water;
// - erode-cave: a generated map (Highlands, seed 21, 128²) with an Erode cave worn into a cliff's foot;
// - hollows-unedited: the control, Hollows imported and exported unedited (its world byte for byte the file's).
// The official maps are not in the repository: they are read from DGM_OFFICIAL_MAPS, `.scratch/official` (here or in
// the main checkout) or investigation/raw/builtin; where they are missing the writer says so in one line and leaves
// those maps out.

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { strFromU8, unzipSync } from "fflate";
import { gen3d } from "../../investigation/terrain3d/proto/gen3d";
import { MapSession } from "../../src/core/doc/session";
import type { BlockSide } from "../../src/core/doc/blockTool";
import { ERODE_DEFAULTS } from "../../src/core/forces/erode";
import { keptForceParams } from "../../src/core/forces/keep";
import { geology } from "../../src/core/forces/random";
import { fullForceMapOf, planForce, type ForceRequest } from "../../src/core/forces/start";
import { normalizeImport } from "../../src/core/format/normalize";
import { readTimber } from "../../src/core/format/timber";
import { encodeWorld, GAME_VERSION } from "../../src/core/format/world";
import { generate } from "../../src/core/gen/generate";
import { makeSpec } from "../../src/core/spec/mapspec";
import { stackableTops, unsupportedVoxels } from "../../src/core/terrain/support";
import { build, checkPlacements, CLEARANCE, t3CaveWater, t4Soil, t5Plants, t6HeightsFrom, t7Sink, type Terrain3dMap } from "../terrain3d-maps";
import { repoFile, type BuiltMap, type GroupWriter } from "./group";

const MAKERS: (() => Terrain3dMap)[] = [t3CaveWater, t4Soil, t5Plants, () => t6HeightsFrom(gen3d), t7Sink];
const CHECKS = ["t3d-load", "t3d-support", "t3d-objects", "t3d-water", "t3d-soil", "t3d-plants", "t3d-shots"];

type Focus = { id: string; x: number; y: number; z: number; side?: boolean };
type Log = (line: string) => void;

/** Where the official maps are on this machine, or null. */
function officialDir(): string | null {
  const dirs = [process.env.DGM_OFFICIAL_MAPS ?? "", repoFile(".scratch", "official"), repoFile("investigation", "raw", "builtin")];
  try {
    const common = execFileSync("git", ["-C", repoFile(), "rev-parse", "--path-format=absolute", "--git-common-dir"], { encoding: "utf8" }).trim();
    dirs.splice(2, 0, join(dirname(common), ".scratch", "official"));
  } catch {
    // (not a git checkout: the other places only)
  }
  return dirs.find((d) => d && existsSync(d)) ?? null;
}

/** An official map's bytes, by a part of its file name (Hollows: `Hollows.timber` or
 *  `builtin_18_MapMetadataHollowsName.timber`); null when it is not on this machine. */
function official(name: string, id: string, log?: Log): { bytes: Uint8Array; file: string } | null {
  const dir = officialDir();
  const f = dir ? readdirSync(dir).find((f) => f.endsWith(".timber") && f.includes(name)) : undefined;
  if (!dir || !f) {
    log?.(`${id}: the official map ${name} is not on this machine (DGM_OFFICIAL_MAPS, .scratch/official, investigation/raw/builtin): left out`);
    return null;
  }
  return { bytes: new Uint8Array(readFileSync(join(dir, f))), file: `${name}.timber` };
}

/** A session's map as the app exports it, with what the game should do to it by our rules (the voxels its support
 *  rule deletes, the plants that do not fit), its water's shape, and the places the probe looks at: `focus` (the
 *  edit) and the first, middle and last of its water under a roof. */
function exported(s: MapSession, meta: { id: string; title: string; tests: string; focus: Focus[] }, log?: Log): BuiltMap {
  const { x: W, y: H } = s.size;
  const N = W * H;
  const bytes = s.exportTimber().bytes;
  const st = s.built.settle.stack;
  const terrain = s.terrain;
  const falls = unsupportedVoxels(terrain, stackableTops(W, H, s.built.entities));
  const dropped: number[] = [];
  const kept = terrain.mask.slice();
  for (let c = 0; c < falls.length; c++)
    if (falls[c]) {
      dropped.push(c);
      kept[c % N] &= ~(1 << Math.floor(c / N));
    }
  const plantsRemoved: { id: string; template: string; x: number; y: number; z: number; air: number }[] = [];
  for (const e of s.built.entities) {
    const need = CLEARANCE[e.template];
    if (need === undefined || e.x < 0 || e.y < 0 || e.x >= W || e.y >= H) continue;
    let air = 0;
    while (e.z + air < 23 && !(kept[e.y * W + e.x] & (1 << (e.z + air)))) air++;
    if (air < need) plantsRemoved.push({ id: e.id, template: e.template, x: e.x, y: e.y, z: e.z, air });
  }
  let wetColumns = 0;
  let roofedWetColumns = 0;
  let pressurised = 0;
  const roofedWet: [number, number, number][] = [];
  if (st)
    for (let c = 0; c < st.depth.length; c++) {
      if (st.depth[c] > 0.05) {
        wetColumns++;
        if (st.ceil[c] < 34) {
          roofedWetColumns++;
          roofedWet.push([c % W, Math.floor((c % N) / W), st.floor[c]]);
        }
      }
      if (st.overflow[c] > 0.001) pressurised++;
    }
  else {
    // (unedited: the file's own water, as stored; its roofed water from the cave water the editor shows)
    const cw = s.caveWater();
    for (let i = 0; i < N; i++) if (s.built.water[i] > 0.05) wetColumns++;
    if (cw)
      for (let i = 0; i < N; i++)
        if (cw[i]) {
          roofedWetColumns++;
          roofedWet.push([i % W, Math.floor(i / W), 31 - Math.clz32(cw[i] & -cw[i])]);
        }
  }
  const pick = roofedWet.length ? [roofedWet[0], roofedWet[roofedWet.length >> 1], roofedWet[roofedWet.length - 1]] : [];
  let maxHeight = 0;
  for (let i = 0; i < N; i++) maxHeight = Math.max(maxHeight, s.built.heights[i]);
  const settled = { settled: s.built.settle.settled, ticks: s.built.settle.ticks };
  log?.(
    `${meta.id}.timber: ${W}×${H}; ${s.columns.size} layered tiles; the rule deletes ${dropped.length} voxels; ${plantsRemoved.length} plants do not fit; ${wetColumns} wet columns (${roofedWetColumns} roofed, ${pressurised} pressurised); ${st ? `settled ${settled.settled} in ${settled.ticks} ticks` : "the file's own water"}`,
  );
  return {
    file: `${meta.id}.timber`,
    bytes,
    size: [W, H],
    entry: {
      id: meta.id,
      title: meta.title,
      tests: meta.tests,
      days: 1.2,
      snapshots: [1],
      checks: CHECKS,
      focus: [...meta.focus, ...pick.map(([x, y, z], k) => ({ id: `roofed-${k + 1}`, x, y, z, side: true }))],
      samples: [...meta.focus.map((f) => [f.x, f.y]), ...pick.map(([x, y]) => [x, y])],
      maxHeight,
      layeredTiles: s.columns.size,
      predicted: { dropped: dropped.length, droppedCells: dropped.slice(0, 500), plantsRemoved, wetColumns, roofedWetColumns, pressurised, settle: st ? settled : null },
    },
  };
}

const WATER_TESTS = "The game must load it with no issue and every voxel kept; its water at the load and after a day against the stacked engine's from the file's water, and its soil on every run.";

/** hollows-edited, canyon-edited: an official cave map imported, edited once (its first three plain tiles in a row
 *  below level 15, raised by one: tools/import-hashes.ts makes the same edit) and exported: the whole map's water is
 *  then the stacked engine's canonical settle, under its roofs too, and its soil is per run. */
function plainEdit(name: string, log?: Log): BuiltMap | null {
  const id = `${name.toLowerCase()}-edited`;
  const m = official(name, id, log);
  if (!m) return null;
  const s = MapSession.importMap(m.bytes, m.file);
  const { x: W, y: H } = s.size;
  const h = s.built.heights;
  const caves = s.columns;
  let at = -1;
  for (let i = 0; i + 2 < W * H && at < 0; i++) if (i % W < W - 2 && [i, i + 1, i + 2].every((j) => !caves.has(j) && h[j] > 0 && h[j] < 15)) at = i;
  const ex = at % W;
  const ey = Math.floor(at / W);
  const z = h[at] + 1;
  const r = at < 0 ? { ok: false, errors: ["no plain tiles to edit"] } : s.apply({ op: "sculpt", params: { mode: "raise", cells: [[ey, ex, ex + 2]], amount: 1 } });
  if (!r.ok) throw new Error(`${id}: ${r.errors[0]}`);
  if (!s.built.settle.stack) throw new Error(`${id}: the edited map has no water on stacked columns`);
  return exported(s, { id, title: `${name}, edited · an imported map's caves with simulated water`, tests: `The official map ${name} imported, three tiles raised by one at (${ex}, ${ey}) and exported: its water on every column, under its roofs too, is the stacked engine's canonical settle, and its soil is per run top. ${WATER_TESTS}`, focus: [{ id: "edit", x: ex + 1, y: ey, z }] }, log);
}

/** pillars-roof-stroke: a Lower brush stroke (3 × 3 tiles, Area) on a cave's roof, as the editor sends it: the roof
 *  is cut down to its lowest layer and the cave under it kept (D280 (3)). The roof nearest water in a cave whose
 *  stroke the session takes. */
function roofStroke(log?: Log): BuiltMap | null {
  const id = "pillars-roof-stroke";
  const m = official("Pillars", id, log);
  if (!m) return null;
  const s = MapSession.importMap(m.bytes, m.file);
  const { x: W, y: H } = s.size;
  const t = s.terrain;
  const wet = s.caveWater();
  // a 3 × 3 block of roof whose top is at least two above its cave's ceiling (so Lower cuts something), the
  // nearest such to water under a roof first
  const roofs: { x: number; y: number; d: number }[] = [];
  for (let y = 2; y < H - 4; y++)
    for (let x = 2; x < W - 4; x++) {
      let ok = true;
      for (let dy = 0; dy < 3 && ok; dy++)
        for (let dx = 0; dx < 3 && ok; dx++) {
          const i = (y + dy) * W + x + dx;
          const r = s.columns.has(i) ? t.runs(i) : null;
          if (!r || r.length < 4 || r[r.length - 1] - r[r.length - 2] < 2) ok = false;
        }
      if (!ok) continue;
      let d = 99;
      for (let dy = -8; dy <= 10; dy++)
        for (let dx = -8; dx <= 10; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx >= 0 && yy >= 0 && xx < W && yy < H && wet && wet[yy * W + xx]) d = Math.min(d, Math.max(Math.abs(dx), Math.abs(dy)));
        }
      roofs.push({ x, y, d });
    }
  roofs.sort((a, b) => a.d - b.d || a.y - b.y || a.x - b.x);
  const tile = (x: number, y: number) => [4 * x + 2, 4 * y + 2];
  let why = "";
  for (const r of roofs.slice(0, 40)) {
    const i = (r.y + 1) * W + r.x + 1;
    const before = t.runs(i);
    const u = s.apply({ op: "brush", params: { tool: "lower", size: 1, strength: 5, shape: "area", target: 0, dabs: [...tile(r.x, r.y), ...tile(r.x + 2, r.y + 2)] } });
    if (!u.ok) {
      why ||= u.errors[0];
      continue;
    }
    const after = s.terrain.runs(i);
    if (after.slice(0, -1).join() !== before.slice(0, -1).join() || after[after.length - 1] >= before[before.length - 1]) throw new Error(`${id}: the stroke did not cut the roof alone at (${r.x + 1}, ${r.y + 1}): runs ${before.join(",")} → ${after.join(",")}`);
    log?.(`${id}: roof at (${r.x}, ${r.y}) to (${r.x + 2}, ${r.y + 2}), runs ${before.join(",")} → ${after.join(",")}, ${r.d} tiles from water`);
    return exported(s, { id, title: "Pillars, a cave's roof lowered with a brush stroke", tests: `The official map Pillars imported, a Lower stroke (Area, 3 × 3) on a cave's roof at (${r.x}, ${r.y}) cutting it to its lowest layer (runs ${before.join(",")} → ${after.join(",")}), exported. ${WATER_TESTS}`, focus: [{ id: "roof", x: r.x + 1, y: r.y + 1, z: after[after.length - 1] }, { id: "under", x: r.x + 1, y: r.y + 1, z: after[after.length - 3], side: true }] }, log);
  }
  throw new Error(`${id}: no roof stroke was taken (${Math.min(40, roofs.length)} roofs tried${why ? `; the first refused: ${why}` : ""})`);
}

/** hollows-block-dig: the Block tool removing a 3 × 3 face from a cave's wall, beside the cave's own water, as a
 *  click on the wall's face from inside the cave sends it. */
function blockDig(log?: Log): BuiltMap | null {
  const id = "hollows-block-dig";
  const m = official("Hollows", id, log);
  if (!m) return null;
  const s = MapSession.importMap(m.bytes, m.file);
  const { x: W, y: H } = s.size;
  const t = s.terrain;
  const cw = s.caveWater();
  if (!cw) throw new Error(`${id}: Hollows holds no water under its roofs`);
  const dirs: [number, number, BlockSide][] = [[1, 0, "+x"], [-1, 0, "-x"], [0, 1, "+y"], [0, -1, "-y"]];
  let tried = 0;
  for (let y = 8; y < H - 8; y++)
    for (let x = 8; x < W - 8; x++) {
      const i = y * W + x;
      // a wall block whose face looks at a cave's water: the block at (x, y, z) solid, the cell beyond its face
      // (dx, dy) water under a roof at the same layer, its floor below
      for (const [dx, dy, side] of dirs) {
        const j = (y + dy) * W + x + dx;
        const water = cw[j];
        if (!water) continue;
        const z = 31 - Math.clz32(water & -water);
        if (!t.solid(i, z) || !t.solid(i, z + 1)) continue;
        if (++tried > 400) throw new Error(`${id}: no dig the session takes among 400 wall faces`);
        const params = { mode: "remove" as const, side, at: [[x, y, z]] as [number, number, number][], size: 3 };
        if (s.blockFalls(params).reason !== null) continue;
        const before = t.runs(i);
        const u = s.apply({ op: "blocks", params });
        if (!u.ok) continue;
        log?.(`${id}: dug the wall at (${x}, ${y}) layer ${z}, its face ${side} toward the cave's water at (${x + dx}, ${y + dy}); runs ${before.join(",")} → ${s.terrain.runs(i).join(",")}`);
        return exported(s, { id, title: "Hollows, a Block tool dig into a cave wall", tests: `The official map Hollows imported, a 3 × 3 Remove with the Block tool into a cave's wall at (${x}, ${y}) layer ${z} (its ${side} face, beside the cave's water), exported: the cave's water flows into the hollow. ${WATER_TESTS}`, focus: [{ id: "dig", x, y, z, side: true }] }, log);
      }
    }
  throw new Error(`${id}: no cave wall beside water found`);
}

/** erode-cave: a generated map (Highlands, seed 21, 128², what the generator makes now) with Erode clicked at a
 *  cliff's foot, as the editor plans and keeps a force (core/forces/start.ts planForce, keep.ts keptForceParams,
 *  one forceResult operation): a cave worn under the cliff. The foot nearest the map's water, away from the start. */
function erodeCave(log?: Log): BuiltMap {
  const id = "erode-cave";
  const r = generate(makeSpec({ seed: 21, theme: "highlands", size: { x: 128, y: 128 } }));
  if (!r.report.passed) throw new Error(`${id}: Highlands seed 21 at 128² did not pass its checks`);
  const s = MapSession.fromGenerated(r);
  const { x: W, y: H } = s.size;
  const h = s.built.heights;
  const wet = s.built.water;
  const start = s.built.entities.find((e) => e.template === "StartingLocation");
  const feet: { i: number; d: number }[] = [];
  for (let y = 4; y < H - 4; y++)
    for (let x = 4; x < W - 4; x++) {
      const i = y * W + x;
      if (wet[i] > 0.01 || (start && Math.abs(start.x - x) + Math.abs(start.y - y) < 16)) continue;
      if (![i - 1, i + 1, i - W, i + W].some((j) => h[j] - h[i] >= 5)) continue;
      let d = 99;
      for (let dy = -6; dy <= 6; dy++) for (let dx = -6; dx <= 6; dx++) if (wet[(y + dy) * W + x + dx] > 0.05) d = Math.min(d, Math.max(Math.abs(dx), Math.abs(dy)));
      feet.push({ i, d });
    }
  feet.sort((a, b) => a.d - b.d || a.i - b.i);
  for (const f of feet.slice(0, 20)) {
    const x = f.i % W;
    const y = Math.floor(f.i / W);
    const base = fullForceMapOf(s.built, { rockLayers: geology(s.openedHeights), lava: null, down: new Map(), usedIds: s.usedEntityIds() });
    const request: ForceRequest = { verb: "erode", settings: { ...ERODE_DEFAULTS, power: 60, seed: 3 }, path: [{ x, y }], cut: null };
    let n = 0;
    const plan = planForce({ base, request, caves: [...s.columns.keys()], state: s.terrainState(), newId: () => `00000000-0000-4000-8000-${(++n).toString(16).padStart(12, "0")}` });
    if (!plan.ok || !plan.staged) continue;
    plan.staged.finishAll();
    const kept = keptForceParams({ before: plan.before, request: plan.request, carve: null, staged: plan.staged, standing: new Set(s.built.entities.map((e) => e.id)) });
    if (!kept.ok) continue;
    const u = s.applyAll([{ op: "forceResult", params: kept.params }], "user");
    if (!u.ok) continue;
    if (!s.columns.size) {
      s.undo();
      continue;
    }
    const zs = h[f.i];
    log?.(`${id}: Erode (Power 60, seed 3) at the cliff's foot (${x}, ${y}), ${f.d} tiles from water: ${s.columns.size} layered tiles`);
    return exported(s, { id, title: "A generated map with an Erode cave", tests: `Highlands seed 21 at 128², generated, Erode (Power 60) clicked at the foot of a cliff at (${x}, ${y}), kept and exported: a cave worn under the cliff, with nothing the game drops. ${WATER_TESTS}`, focus: [{ id: "erode", x, y, z: zs, side: true }] }, log);
  }
  throw new Error(`${id}: Erode wore no cave at any of ${Math.min(20, feet.length)} cliff feet`);
}

/** hollows-unedited: the control. Hollows imported and exported with no edit: its world is the file's, byte for byte
 *  (only the version stamp moves, as normalizeImport says), so its water is the file's own. */
function unedited(log?: Log): BuiltMap | null {
  const id = "hollows-unedited";
  const m = official("Hollows", id, log);
  if (!m) return null;
  const s = MapSession.importMap(m.bytes, m.file);
  const out = exported(s, { id, title: "Hollows, imported and exported unedited (the control)", tests: `The official map Hollows imported and exported with no edit: its world is the file's byte for byte (the version stamp aside), its water the file's own. The control for the edited maps. ${WATER_TESTS}`, focus: [] }, log);
  const file = readTimber(m.bytes);
  normalizeImport(file);
  const world = strFromU8(unzipSync(out.bytes)["world.json"]).replace(/^﻿/, "");
  if (world !== encodeWorld(file.world)) throw new Error(`${id}: the unedited export's world is not the file's`);
  return out;
}

const EDITS: ((log?: Log) => BuiltMap | null)[] = [(l) => plainEdit("Hollows", l), (l) => plainEdit("Canyon", l), roofStroke, blockDig, erodeCave, unedited];

export const TERRAIN3D_WRITER: GroupWriter = {
  group: "Terrain 3D",
  ids: ["t3-cave-water", "t4-soil", "t5-plants", "t6-heights", "t7-sink", "hollows-edited", "canyon-edited", "pillars-roof-stroke", "hollows-block-dig", "erode-cave", "hollows-unedited"],
  tool: "tools/probe-3d.ts",
  folder: "terrain3d-2",
  env: "DGM_PROBE_TERRAIN3D",
  manifest: "terrain3d.json",
  build(log) {
    const maps: BuiltMap[] = [];
    for (const make of MAKERS) {
      const m = make();
      const problems = checkPlacements(m);
      if (problems.length) throw new Error(`${m.id}: ${problems.slice(0, 5).join("; ")}`);
      const b = build(m);
      const s = m.scene;
      log?.(
        `${m.id}.timber: up to ${b.maxHeight}, ${b.layeredTiles} layered tiles; the rule deletes ${b.dropped.length} voxels; ${b.plantsRemoved.length} plants do not fit; ${b.wetColumns} wet columns (${b.roofedWetColumns} roofed, ${b.pressurised} pressurised)${b.settled ? `; settled ${b.settled.settled} in ${b.settled.ticks} ticks` : ""}`,
      );
      maps.push({
        file: `${m.id}.timber`,
        bytes: b.bytes,
        size: [s.W, s.H],
        entry: {
          id: m.id,
          title: m.title,
          tests: m.tests,
          days: m.days,
          snapshots: m.snapshots,
          checks: m.checks,
          focus: m.focus,
          samples: m.samples,
          maxHeight: b.maxHeight,
          layeredTiles: b.layeredTiles,
          predicted: { dropped: b.dropped.length, droppedCells: b.dropped.slice(0, 500), plantsRemoved: b.plantsRemoved, wetColumns: b.wetColumns, roofedWetColumns: b.roofedWetColumns, pressurised: b.pressurised, settled: b.settled },
        },
      });
    }
    for (const make of EDITS) {
      const b = make(log);
      if (b) maps.push(b);
    }
    return { maps, manifest: { format: 2, tool: "tools/probe-3d.ts", gameVersion: GAME_VERSION } };
  },
};
