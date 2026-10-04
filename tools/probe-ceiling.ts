// The DGM Probe's ceiling maps (PLAN §20 D244, step 1): maps made in the editor as a player would make
// them, with land raised to D172's tall maximum (22 levels, the top layer empty), for the probe batch that
// checks play near the top before the one ceiling is built. Each map is opened in the editor's own worker
// (src/worker/session.ts, the code the page runs) as a player opens a .timber, edited with its operations
// (the brushes, the forces' forceResult, the shelf's water source), given the fixes the export dialog
// offers, and exported by its export (the page's check, the canonical settle):
//
//   a. ceiling-volcano: a volcano erupted on the level-4 plain of a tall Highlands 128², its summit at
//      22, with the map's stream along its south-west foot and its river past its east flank;
//   b. ceiling-waterfall: on the same map, a mesa flattened to 22 beside the river, a notch at 21 across
//      it and a spring in the notch, pouring off the mesa's edge (a fall of 15 levels into the river);
//   c. ceiling-plateau-256: a tall Highlands 256² with a plateau raised to 22 by four Raise strokes.
//
// The raised ceiling is not built (D244 step 2). On this branch the build's integrity pass clips every
// edited tile above 16 back to 16 (a force's result included, although its ceiling on a tall map is
// already 22), the brushes stop at 16, and the operation schema refuses a brush level above 16. So the
// editing runs in a child process whose module loader raises exactly those limits to 22: MAX_TERRAIN in
// features/raster/terrain.ts, BRUSH_MAX_LEVEL in features/raster/brush.ts, and a brush's level and stop
// in doc/ops.schema.json. Nothing else changes, and src/ stays as it is.
//
// The starting maps are D172's tall maps, made as tools/probe-tall.ts makes them (a generated map with
// its high ground lifted 6 levels to 17–22; the 256² one then drops the plants that lift left on soil
// that kills them), with the tall note in their description (D172 (4), in the generator's words on
// feature/m9a): an imported map's export keeps its description. The high Verticality generator
// (feature/m9a) is not on this branch.
//
//   npx tsx tools/probe-ceiling.ts [--out C:\dgm-probe\ceiling] [--check]
//
// Writes start/<id>.start.timber (each map as opened), <id>.timber (as exported), work/<id>.editor.json
// (the editor's history and export check) and ceiling.json (for the probe's "Ceiling" group: counts, the
// land the editor raised above 16, the water the probe watches, both validators' export profile), and
// prints the editor's settled water. --check rebuilds into a temporary folder and fails when a file
// differs. New objects take deterministic ids (crypto.randomUUID is seeded in the editing process).

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { register } from "node:module";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { EditOp } from "../src/core/doc/ops";
import type { BrushParams } from "../src/core/features/raster/brush";
import type { JsonObject } from "../src/core/format/json";
import type { TimberFile } from "../src/core/format/timber";
import type { CanonicalWater } from "../src/core/sim/prefill";

const CEILING = 22;
const OWNER = "dgm-probe-ceiling";

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

/** The module loader of the editing process: the editor's limit of 16 raised to 22, and nothing else.
 *  Each pattern must match once, or the process stops (the code moved on: look again). */
const HOOK = `
const PATCHES = [
  ["/src/core/features/raster/terrain.ts", /\\bMAX_TERRAIN = 16\\b/g, "MAX_TERRAIN = 22"],
  ["/src/core/features/raster/brush.ts", /\\bBRUSH_MAX_LEVEL = 16\\b/g, "BRUSH_MAX_LEVEL = 22"],
  ["/src/core/doc/ops.schema.json", /("level": \\{ "type": "integer", "minimum": 0, "maximum": )16( \\},\\s*"seed")/g, "$122$2"],
  ["/src/core/doc/ops.schema.json", /("stop": \\{ "type": "integer", "minimum": 0, "maximum": )16( \\})/g, "$122$2"],
];
export async function load(url, context, nextLoad) {
  const r = await nextLoad(url, context);
  const path = decodeURIComponent(url.split("?")[0]);
  const mine = PATCHES.filter(([f]) => path.endsWith(f));
  if (!mine.length) return r;
  let src = typeof r.source === "string" ? r.source : new TextDecoder().decode(r.source);
  for (const [f, re, to] of mine) {
    const n = (src.match(re) ?? []).length;
    if (n !== 1) throw new Error("probe-ceiling: expected " + re + " once in " + f + ", found it " + n + " times");
    src = src.replace(re, to);
  }
  return { ...r, source: src };
}`;

// ------------------------------------------------------------------------------------------ the maps

type StartId = "highlands-128" | "highlands-256";

interface Plan {
  id: string;
  title: string;
  tests: string;
  start: StartId;
  /** The map in words, for its description (the tall note follows). */
  about: string;
  /** The tile the probe's extra poses look at. */
  focus: [number, number];
}

// a. the volcano: Erupt's defaults but for a peak and light flows, its Size set to keep it off the
// stream near the start (a larger one dams it and floods the start's berry bushes)
const VENT: [number, number] = [82, 44];
// b. the mesa: 11 × 11 at (108–118, 44–54), its notch from the middle to the west edge, above the river
const MESA = { x: 113, y: 49, half: 5, level: 22, strength: 1 };
// c. the plateau: Raise strokes swept over the bare slope of the south-east corner
const PLATEAU = { x0: 224, y0: 162, x1: 246, y1: 184, size: 8, strength: 10, rowStep: 3, strokes: 4 };

const PLANS: Plan[] = [
  {
    id: "ceiling-volcano",
    title: "Ceiling · Highlands 128², a volcano erupted on the level-4 plain, its summit at 22, beside the river",
    tests: "A volcano the editor erupted on low ground (level 4) up to the ceiling (22): its cone of fresh rock, its lava apron, a stream along its south-west foot and the river past its east flank, the map's springs and rivers above 16 from the start map.",
    start: "highlands-128",
    about: `a volcano erupted on its level-4 plain at (${VENT[0]}, ${VENT[1]}) in the Dam Good Maps editor, its summit at level 22, a stream along its south-west foot and the river past its east flank`,
    focus: VENT,
  },
  {
    id: "ceiling-waterfall",
    title: "Ceiling · Highlands 128², a mesa at 22 with a spring at 21 pouring off its edge into the river",
    tests: "High ground the editor made near the top (a precise Flatten to 22, a notch at 21 across it) and a spring placed in the notch: water standing and flowing at 21, a fall of 15 levels off the mesa's sheer wall, and the river below taking it.",
    start: "highlands-128",
    about: `a mesa flattened to level 22 at (${MESA.x - MESA.half}–${MESA.x + MESA.half}, ${MESA.y - MESA.half}–${MESA.y + MESA.half}) in the Dam Good Maps editor, a notch at 21 across it and a spring in the notch pouring off its west wall into the river`,
    focus: [MESA.x - MESA.half, MESA.y],
  },
  {
    id: "ceiling-plateau-256",
    title: "Ceiling · Highlands 256², a plateau raised to 22 in the south-east",
    tests: "Land the editor raised to the ceiling across a sizeable area of a 256² map (four Raise strokes pressing a plateau flat at 22), the succulents and pines standing on it carried up with it, beside the tall start map's own high ground.",
    start: "highlands-256",
    about: `a plateau raised to level 22 in the south-east with the Raise brush in the Dam Good Maps editor`,
    focus: [Math.round((PLATEAU.x0 + PLATEAU.x1) / 2), Math.round((PLATEAU.y0 + PLATEAU.y1) / 2)],
  },
];

const START_ABOUT: Record<StartId, string> = {
  "highlands-128": "Highlands (4242) 128², every tile at level 11–16 raised 6 levels to 17–22 (D172's tall-highlands-lift)",
  "highlands-256": "Highlands (7) 256², every tile at level 11–16 raised 6 levels to 17–22, the plants that change left on soil that kills them removed",
};

/** D172 (4)'s note, in the generator's words (gen/pack.ts on feature/m9a). */
const tallNote = (top: number) => `The land rises to level ${top}: the game's map editor edits only up to level 16.`;
const describe = (p: Plan) => `DGM Probe ceiling test (not for play; PLAN §20 D244). ${START_ABOUT[p.start]}, then ${p.about}. ${tallNote(CEILING)}`;

// ------------------------------------------------------------------------------------------ editing

/** The editing process: the editor's worker with its limit raised to 22 (see HOOK). */
async function editAll(dir: string): Promise<void> {
  register("data:text/javascript," + encodeURIComponent(HOOK), import.meta.url);
  const { guidFrom } = await import("../src/core/math/hash");
  let uuids = 0;
  let prefix = "";
  Object.defineProperty(globalThis.crypto, "randomUUID", { value: () => guidFrom(OWNER, prefix, String(++uuids)), configurable: true });
  const ed = await import("../src/worker/session");
  const { MAX_TERRAIN } = await import("../src/core/features/build");
  const { BRUSH_MAX_LEVEL } = await import("../src/core/features/raster/brush");
  const { ERUPT_DEFAULTS } = await import("../src/core/forces/erupt");
  const schema = (await import("../src/core/doc/ops.schema.json", { with: { type: "json" } })).default as { $defs: { brush: { properties: Record<string, { maximum?: number }> } } };
  const limits = [MAX_TERRAIN as number, BRUSH_MAX_LEVEL as number, schema.$defs.brush.properties.level.maximum, schema.$defs.brush.properties.stop.maximum];
  if (limits.some((v) => v !== CEILING)) throw new Error(`the editor's limits are ${limits.join(", ")}, not ${CEILING}: the loader did not take`);

  const q = (x: number, y: number) => [4 * x + 2, 4 * y + 2];
  const stroke = (params: BrushParams, label: string) => {
    const r = ed.apply({ op: "brush", params } as EditOp, "user", label);
    if (!r.ok) throw new Error(`${label}: ${r.errors.join("; ")}`);
  };
  const force = (req: import("../src/worker/session").ForceRequest) => {
    const st = ed.forceStart(req);
    if (!st.ok) throw new Error(`${req.verb}: ${st.errors.join("; ")}`);
    for (let k = 0; k < 4000; k++) if (ed.forceAdvance(4)?.done) break;
    const kept = ed.forceStop();
    if (!kept.kept) throw new Error(`${req.verb} was not kept: ${kept.errors.join("; ")}`);
  };

  const edits: Record<string, () => void> = {
    "ceiling-volcano": () => force({ verb: "erupt", settings: { ...ERUPT_DEFAULTS, power: 62, shape: "steep", summit: "peak", flows: "light", size: 34, seed: 1 }, origin: VENT, cut: null }),
    "ceiling-waterfall": () => {
      const { x, y, half, level, strength } = MESA;
      // a precise square Flatten held on the middle: the page's hold builds 16 levels a dab at most, so twice
      for (let k = 0; k < 2; k++) stroke({ tool: "flatten", size: half + 0.5, strength: 5, level, shape: "square", precise: true, levels: [16], dabs: q(x, y) }, `Flatten to ${level}`);
      // the notch: a precise 3 × 3 Flatten a level lower, clicked from the middle to the west wall
      const dabs: number[] = [];
      for (let k = 0; k <= half; k++) dabs.push(...q(x - k, y));
      stroke({ tool: "flatten", size: 2, strength: 5, level: level - 1, shape: "square", precise: true, levels: dabs.filter((_, i) => i % 2 === 0).map(() => 1), dabs }, `Flatten to ${level - 1}`);
      // the spring at the notch's head (the shelf's Water source, its strength in the options)
      const r = ed.applyTool({ tool: "entity", template: "WaterSource", x: x + 1, y, orientation: "Cw0", components: { WaterSource: { SpecifiedStrength: strength, CurrentStrength: strength } } }, guidFrom(OWNER, "ceiling-waterfall", "spring"));
      if (!r.ok) throw new Error(`the spring: ${r.errors.join("; ")}`);
    },
    "ceiling-plateau-256": () => {
      const p = PLATEAU;
      for (let s = 0; s < p.strokes; s++) {
        // one held sweep, row by row, back and forth
        const dabs: number[] = [];
        for (let y = p.y0, k = 0; y <= p.y1; y += p.rowStep, k++)
          for (let i = 0; i <= p.x1 - p.x0; i++) dabs.push(...q(k % 2 ? p.x1 - i : p.x0 + i, y));
        stroke({ tool: "raise", size: p.size, strength: p.strength, dabs }, "Raise");
      }
    },
  };

  for (const p of PLANS) {
    const t0 = Date.now();
    prefix = p.id;
    uuids = 0;
    ed.openTimber(new Uint8Array(readFileSync(join(dir, "start", `${p.id}.start.timber`))), `${p.id}.timber`);
    edits[p.id]();
    // the export dialog: its one-click fixes for what blocks the export, as a player clicks them
    const fixes: string[] = [];
    for (let round = 0; round < 4; round++) {
      const c = (await ed.backgroundCheck())!.check;
      const fixable = c.blocking.filter((b) => b.fix?.length);
      if (!fixable.length) break;
      for (const b of fixable) {
        const label = b.fix![0].label || b.message;
        const r = ed.applyAll(b.fix!.map(({ label: _l, ...op }) => op as EditOp), label);
        if (!r.ok) throw new Error(`${p.id}: the fix "${label}" failed: ${r.errors.join("; ")}`);
        fixes.push(`${label} (${b.message})`);
      }
    }
    const c = (await ed.backgroundCheck())!.check;
    const exported = await ed.exportTimber(true);
    if (!exported.ok) throw new Error(`${p.id}: the export was refused: ${exported.errors.join("; ")}`);
    writeFileSync(join(dir, `${p.id}.timber`), exported.bytes);
    const item = (i: { id: string; message: string }) => `${i.id}: ${i.message}`;
    const log = {
      history: ed.sessionInfo().history.filter((h) => h.applied).map((h) => h.label),
      fixes,
      check: { blocking: c.blocking.map(item), warnings: c.warnings.map(item), advisory: c.advisory.map(item), existing: c.existing.map(item) },
      fileName: exported.fileName,
      seconds: (Date.now() - t0) / 1000,
    };
    writeFileSync(join(dir, "work", `${p.id}.editor.json`), JSON.stringify(log, null, 1));
    console.log(`edited ${p.id}: ${log.history.join(", ")}${fixes.length ? `; fixes: ${fixes.join("; ")}` : ""}; the page's export check: ${c.blocking.length} blocking, ${c.warnings.length} warnings (${log.seconds.toFixed(1)} s)`);
    ed.closeSession();
  }
}

// ------------------------------------------------------------------------------------------ building

async function buildAll(dir: string): Promise<{ failures: number }> {
  const tall = await import("./probe-maps/tall");
  const { writeTimber, readTimber } = await import("../src/core/format/timber");
  const { validateMap } = await import("../src/core/validate/checks");
  for (const d of [dir, join(dir, "start"), join(dir, "work")]) mkdirSync(d, { recursive: true });

  // the starting maps (the generator and the tall change, unpatched)
  const starts = new Map<StartId, (description: string) => TimberFile>();
  starts.set("highlands-128", (description) => {
    const d = tall.fromGenerated("highlands", 4242, 128);
    d.description = description;
    tall.liftHighGround(d, 11, 6);
    return tall.assembleFitting(d).file;
  });
  starts.set("highlands-256", (description) => {
    const d = tall.fromGenerated("highlands", 7, 256);
    d.description = description;
    tall.liftHighGround(d, 11, 6);
    let b = tall.assembleFitting(d);
    // the lift leaves some plants on soil that dries or floods: drop them, as assembleFitting drops objects
    for (let round = 0; round < 3; round++) {
      const doomed = validateMap(b.file, { profile: "export" }).report.checks.find((c) => c.id === "plants.survive" && !c.ok);
      if (!doomed) break;
      const ids = new Set(doomed.where?.entities ?? []);
      tall.drop(d, (e) => !ids.has(e.id));
      b = tall.assemble(d);
    }
    return b.file;
  });
  const startInfo: Record<string, { typescript: ValidatorResult; python: ValidatorResult }> = {};
  for (const p of PLANS) {
    const t0 = Date.now();
    const file = starts.get(p.start)!(describe(p));
    const path = join(dir, "start", `${p.id}.start.timber`);
    writeFileSync(path, writeTimber(file));
    startInfo[p.id] = { typescript: tsExport(validateMap, file), python: pyExport(path) };
    console.log(`start ${p.id}: TypeScript ${verdict(startInfo[p.id].typescript)}; Python ${verdict(startInfo[p.id].python)} (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  }

  // the edits, in the editing process
  const child = spawnSync(process.execPath, [...process.execArgv, fileURLToPath(import.meta.url), "--edit", "--out", dir], { stdio: "inherit" });
  if (child.status !== 0) throw new Error(`the editing process failed (exit ${child.status})`);

  // each exported map: its counts, both validators, the editor's water
  const entries: Record<string, unknown>[] = [];
  let failures = 0;
  for (const p of PLANS) {
    const t0 = Date.now();
    const path = join(dir, `${p.id}.timber`);
    const bytes = new Uint8Array(readFileSync(path));
    const file = readTimber(bytes);
    const before = readTimber(new Uint8Array(readFileSync(join(dir, "start", `${p.id}.start.timber`))));
    const log = JSON.parse(readFileSync(join(dir, "work", `${p.id}.editor.json`), "utf8")) as { history: string[]; fixes: string[]; check: Record<string, string[]> };
    const m = await measure(file, before);
    const ts = tsExport(validateMap, file);
    const py = pyExport(path);
    const md = file.metadata ?? {};
    const description = typeof md.MapDescription === "string" ? md.MapDescription : "";
    const noted = description.includes(tallNote(m.counts.maxHeight));
    const ok = ts.passed && py.passed && m.counts.singleFloor && m.counts.topLayerEmpty && m.counts.maxHeight === CEILING && m.raised.length > 0 && noted && m.water.storedMatches;
    if (!ok) failures++;
    console.log(
      `${ok ? "ok  " : "FAIL"} ${p.id} (${file.world.sizeX}²): max ${m.counts.maxHeight}; the editor raised ${m.raised.length} tiles above 16 (${m.raisedAt22} at 22), ${m.objectsOnRaised} objects stand on them; ${m.counts.tilesAbove16} tiles above 16 in all; ` +
        `TypeScript ${verdict(ts)}; Python ${verdict(py)}; the page's check ${log.check.blocking.length} blocking, ${log.check.warnings.length} warnings; tall note ${noted ? "in the description" : "MISSING"} (${((Date.now() - t0) / 1000).toFixed(1)} s)`,
    );
    console.log(`     the editor's water: ${m.water.text}`);
    entries.push({
      id: p.id,
      title: p.title,
      tests: p.tests,
      file: `${p.id}.timber`,
      bytes: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      size: [file.world.sizeX, file.world.sizeY],
      ...m.counts,
      raised: m.raised,
      raisedAt22: m.raisedAt22,
      objectsOnRaised: m.objectsOnRaised,
      focus: p.focus,
      flowTiles: m.water.flow.map((t) => [t.x, t.y]),
      poolTiles: m.water.pool.map((t) => [t.x, t.y]),
      water: { volume: m.water.volume, wetTiles: m.water.wet, wetAbove16: m.water.wetAbove16, movingAbove16: m.water.movingAbove16, watched: [...m.water.flow, ...m.water.pool] },
      edits: log.history,
      fixes: log.fixes,
      pageCheck: log.check,
      description,
      validators: { typescript: ts, python: py },
      start: startInfo[p.id] ? { ...m.counts.start, validators: startInfo[p.id] } : m.counts.start,
    });
  }
  writeFileSync(join(dir, "ceiling.json"), JSON.stringify({ format: 1, tool: "tools/probe-ceiling.ts", decision: "PLAN §20 D244", ceiling: CEILING, maps: entries }, null, 1));
  console.log(`wrote ${entries.length} maps and ceiling.json to ${dir}`);
  return { failures };
}

// ------------------------------------------------------------------------------------------ measures

interface Watched {
  x: number;
  y: number;
  /** The level of the ground under it. */
  ground: number;
  depth: number;
  /** Outflow, water a tick (the settle's momentum, 4 ways summed). */
  flow: number;
  /** Tiles to the nearest tile the editor changed. */
  away: number;
}

async function measure(file: TimberFile, before: TimberFile) {
  const { surfaceOf, storedWater, floorsOf, LAYERS } = await import("../src/core/format/world");
  const { mapObjects, waterModel } = await import("../src/core/sim/model");
  const { canonicalSettle } = await import("../src/core/sim/prefill");
  const { num } = await import("../src/core/format/json");
  const w = file.world;
  const W = w.sizeX, H = w.sizeY, N = W * H;
  const h = surfaceOf(w);
  const h0 = surfaceOf(before.world);
  // the land the editor raised above 16, and the tiles it changed at all
  const changed = new Uint8Array(N);
  const raised: [number, number][] = [];
  let raisedAt22 = 0;
  for (let i = 0; i < N; i++) {
    if (h[i] === h0[i]) continue;
    changed[i] = 1;
    if (h[i] > 16 && h[i] > h0[i]) {
      raised.push([i % W, Math.floor(i / W)]);
      if (h[i] === CEILING) raisedAt22++;
    }
  }
  const onRaised = new Set(raised.map(([x, y]) => y * W + x));
  const ents = w.entities.flatMap((e) => {
    const c = e.Components as JsonObject;
    const bo = (c.BlockObject ?? null) as JsonObject | null;
    if (!bo) return [];
    const co = bo.Coordinates as JsonObject;
    const ws = (c.WaterSource ?? null) as JsonObject | null;
    return [{ template: String(e.Template), x: num(co.X), y: num(co.Y), z: num(co.Z), strength: ws ? num(ws.SpecifiedStrength) : 0 }];
  });
  const start = ents.find((e) => e.template === "StartingLocation");
  let top = 0;
  for (let i = 0; i < N; i++) if (w.voxels[(LAYERS - 1) * N + i]) top++;
  let maxHeight = 0, above = 0, at22 = 0;
  for (let i = 0; i < N; i++) {
    maxHeight = Math.max(maxHeight, h[i]);
    if (h[i] > 16) above++;
    if (h[i] === CEILING) at22++;
  }
  // the editor's water: the file stores the canonical settle; settled again here for its flows (and to
  // confirm the file holds exactly that settle)
  const model = waterModel(W, H, h, mapObjects(w));
  const settle: CanonicalWater = canonicalSettle(model);
  const stored = storedWater(w.singletons, W, H);
  const depth = new Float64Array(N);
  for (let k = 0; k < stored.tile.length; k++) if (stored.floor[k] < 0 || Math.abs(stored.floor[k] - h[stored.tile[k]]) < 0.01) depth[stored.tile[k]] = stored.depth[k];
  let storedDiff = 0, volume = 0, wet = 0, wetAbove16 = 0, movingAbove16 = 0;
  const flowOf = (i: number) => (settle.out ? settle.out[4 * i] + settle.out[4 * i + 1] + settle.out[4 * i + 2] + settle.out[4 * i + 3] : 0);
  for (let i = 0; i < N; i++) {
    storedDiff = Math.max(storedDiff, Math.abs(settle.depth[i] - depth[i]));
    volume += settle.depth[i];
    if (settle.depth[i] > 0.05) {
      wet++;
      if (h[i] > 16) wetAbove16++;
    }
    if (h[i] > 16 && settle.depth[i] > 0.02 && flowOf(i) > 0.01) movingAbove16++;
  }
  // how far each tile is from the editor's changes (4-neighbour steps, up to 48)
  const away = new Int16Array(N).fill(-1);
  const queue: number[] = [];
  for (let i = 0; i < N; i++) if (changed[i]) (away[i] = 0), queue.push(i);
  for (let k = 0; k < queue.length; k++) {
    const i = queue[k];
    if (away[i] >= 48) continue;
    const x = i % W, y = (i - x) / W;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const j = ny * W + nx;
      if (away[j] < 0) (away[j] = away[i] + 1), queue.push(j);
    }
  }
  // the water the probe watches, spread three tiles apart: flowing water near the edits, a few tiles from
  // each distance (0–2, 3–6 and 7–12 tiles from them: the water they touch, then the water beside them),
  // then the nearest flowing water above 16, then the nearest water at all (a map whose edits are dry
  // land); standing water likewise
  const cand: Watched[] = [];
  for (let i = 0; i < N; i++)
    if (away[i] >= 0 && settle.depth[i] > 0.02) cand.push({ x: i % W, y: Math.floor(i / W), ground: h[i], depth: settle.depth[i], flow: flowOf(i), away: away[i] });
  cand.sort((a, b) => a.away - b.away || b.flow - a.flow || a.y - b.y || a.x - b.x);
  const pick = (list: Watched[], quotas: [(t: Watched) => boolean, number][], total: number) => {
    const out: Watched[] = [];
    for (const [take, n] of [...quotas, [() => true, total] as [(t: Watched) => boolean, number]]) {
      let k = 0;
      for (const t of list) {
        if (k >= n || out.length >= total) break;
        if (!take(t) || out.includes(t) || out.some((o) => Math.max(Math.abs(o.x - t.x), Math.abs(o.y - t.y)) < 3)) continue;
        out.push(t);
        k++;
      }
    }
    return out;
  };
  const near = (lo: number, hi: number) => (t: Watched) => t.away >= lo && t.away <= hi;
  const flow = pick(cand.filter((t) => t.flow > 0.01), [[near(0, 2), 4], [near(3, 6), 3], [near(7, 12), 2], [(t) => t.ground > 16, 2]], 10);
  const pool = pick(cand.filter((t) => t.flow <= 0.01 && t.depth > 0.05), [[near(0, 12), 3]], 4);
  const f3 = (v: number) => v.toFixed(3);
  const text =
    `${volume.toFixed(0)} water on ${wet} wet tiles, ${wetAbove16} of them above 16 (${movingAbove16} flowing); the file holds the editor's settle ${storedDiff < 1e-4 ? "exactly" : `to within ${storedDiff.toFixed(4)}`}. ` +
    `Flowing near the edits: ${flow.map((t) => `(${t.x}, ${t.y}) on ${t.ground}, ${f3(t.depth)} deep, flow ${f3(t.flow)}, ${t.away} from the edits`).join("; ") || "none"}. ` +
    `Standing: ${pool.map((t) => `(${t.x}, ${t.y}) surface ${(t.ground + t.depth).toFixed(2)}, ${f3(t.depth)} deep`).join("; ") || "none"}. ` +
    `On the land the editor raised above 16: ${raised.filter(([x, y]) => settle.depth[y * W + x] > 0.05).length} wet tiles.`;
  return {
    counts: {
      maxHeight,
      tilesAbove16: above,
      tilesAt22: at22,
      wetTiles: wet,
      wetAbove16,
      objects: ents.filter((e) => e.template !== "StartingLocation").length,
      objectsAbove16: ents.filter((e) => e.template !== "StartingLocation" && e.z > 16).length,
      plantsAbove16: ents.filter((e) => /^(Pine|Birch|Oak|Succulent|BlueberryBush)$/.test(e.template) && e.z > 16).length,
      sourcesAbove16: ents.filter((e) => /Source$/.test(e.template) && e.z > 16).map((e) => ({ template: e.template, x: e.x, y: e.y, z: e.z, strength: e.strength })),
      start: start ? { x: start.x, y: start.y, z: start.z } : null,
      singleFloor: floorsOf(w).every((n) => n <= 1),
      topLayerEmpty: top === 0,
    },
    raised,
    raisedAt22,
    objectsOnRaised: ents.filter((e) => e.template !== "StartingLocation" && onRaised.has(e.y * W + e.x)).length,
    water: { volume: Math.round(volume), wet, wetAbove16, movingAbove16, storedMatches: storedDiff < 1e-3, flow, pool, text },
  };
}

// ------------------------------------------------------------------------------------------ validators

interface ValidatorResult {
  passed: boolean;
  /** Failed checks (not advisory). */
  failed: string[];
  advisory: string[];
}

const verdict = (v: ValidatorResult) => (v.passed ? `export profile passes${v.advisory.length ? ` (advice: ${v.advisory.join("; ")})` : ""}` : `FAILS ${v.failed.join(" | ")}`);

function tsExport(validateMap: typeof import("../src/core/validate/checks").validateMap, file: TimberFile): ValidatorResult {
  const v = validateMap(file, { profile: "export" });
  const bad = v.report.checks.filter((c) => !c.ok && !c.advisory && c.applicable !== false);
  return { passed: bad.length === 0, failed: bad.map((c) => `${c.id}: ${c.message}`), advisory: v.report.checks.filter((c) => !c.ok && c.advisory).map((c) => `${c.id}: ${c.message}`) };
}

function pyExport(path: string): ValidatorResult {
  const r = spawnSync(process.env.PYTHON ?? "python", ["prototype/validate.py", path, "--profile", "export", "--json"], { encoding: "utf8", maxBuffer: 64 << 20 });
  const line = (r.stdout ?? "").split(/\r?\n/).find((l) => l.startsWith("{"));
  if (!line) return { passed: false, failed: [`the Python validator did not run: ${(r.stderr ?? "").slice(-400)}`], advisory: [] };
  const rep = JSON.parse(line) as { passed: boolean; checks: { id: string; ok: boolean; advisory: boolean; detail: string }[] };
  return { passed: rep.passed, failed: rep.checks.filter((c) => !c.ok && !c.advisory).map((c) => `${c.id}: ${c.detail}`), advisory: rep.checks.filter((c) => !c.ok && c.advisory).map((c) => `${c.id}: ${c.detail}`) };
}

// ------------------------------------------------------------------------------------------ main

async function main(): Promise<void> {
  const out = arg("out", process.env.DGM_PROBE_CEILING ?? "C:\\dgm-probe\\ceiling");
  if (process.argv.includes("--edit")) return editAll(out);
  if (!process.argv.includes("--check")) {
    const { failures } = await buildAll(out);
    if (failures) {
      console.error(`${failures} map(s) failed`);
      process.exitCode = 1;
    }
    return;
  }
  // --check: a fresh build beside the files, compared byte for byte
  const fresh = join(out, `check-${process.pid}`);
  try {
    await buildAll(fresh);
    let differ = 0;
    for (const p of PLANS)
      for (const f of [`${p.id}.timber`, join("start", `${p.id}.start.timber`)]) {
        const a = join(out, f), b = join(fresh, f);
        const same = existsSync(a) && createHash("sha256").update(readFileSync(a)).digest("hex") === createHash("sha256").update(readFileSync(b)).digest("hex");
        if (!same) differ++;
        console.log(`${same ? "same   " : "DIFFERS"} ${a}`);
      }
    if (differ) process.exitCode = 1;
  } finally {
    rmSync(fresh, { recursive: true, force: true });
  }
}

await main();
