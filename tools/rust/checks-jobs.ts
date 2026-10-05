// The Rust checks' byte fixtures (PLAN §20 D366, D381, D465): fixed validations on ground that never changes
// with the generator, the forces' studies (tests/contract/forceFixtures.ts) with their own water standing as the
// settled water, each validated as the product validates a map (a generation, the editor's export, an import,
// load only) and with the edits that reach the checks' rarer branches (an edge wall and its fix, no start, two
// starts, Sources: None, No badwater, Easy and Hard, water a steady state cannot show, objects the game would
// delete, planned lakes, a badwater basin and the extras' bands). tools/rust/check.ts runs them natively
// (checks-batch), in Node's WebAssembly and in each engine, and checks every result against
// tools/rust/checks-pins.json: the sha256s pinned when the TypeScript checks (tag `ts-checks-final`) gave the
// same reports and analysis, so a change to a check shows here.
//
//   npx tsx tools/rust/check.ts                                       checks them (CI's rust job)
//   npx tsx tools/rust/checks-jobs.ts > tools/rust/checks-pins.json   pins the current Rust (a deliberate change)

import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { blockObject, entityJson, fluidObject, slope, waterSource, type EntitySpec } from "../../src/core/format/entities";
import { mapMetadata, type TimberFile } from "../../src/core/format/timber";
import { emptySimulationSingletons, GAME_VERSION, LAYERS, voxelsFromHeights } from "../../src/core/format/world";
import type { Feature } from "../../src/core/features/schema";
import { mapObjects, waterModel } from "../../src/core/sim/model";
import type { CanonicalWater } from "../../src/core/sim/prefill";
import type { MapSpec } from "../../src/core/spec/mapspec";
import type { ValidateOptions } from "../../src/core/validate/checks";
import { checksInput, runChecks, type ChecksOutput } from "../../src/core/validate/rust";
import { fixture, type FixtureKind } from "../../tests/contract/forceFixtures";

/** One validation's input buffers, by name. */
export interface ChecksJob {
  name: string;
  inputs: Uint8Array[];
}

interface Ground {
  W: number;
  H: number;
  heights: Uint8Array;
  entities: EntitySpec[];
  depth: Float64Array;
  contamination: Float64Array;
}

function ground(kind: FixtureKind, n: number): Ground {
  const m = fixture(kind, n);
  return { W: m.W, H: m.H, heights: m.heights.slice(), entities: m.entities.slice(), depth: m.water.depth.slice(), contamination: m.water.contamination.slice() };
}

function fileOf(g: Ground): TimberFile {
  return {
    metadata: mapMetadata(g.W, g.H, "checks fixture"),
    thumbnail: null,
    versionTxt: GAME_VERSION + "\r\n",
    world: { gameVersion: GAME_VERSION, timestamp: "2026-10-05 00:00:00", sizeX: g.W, sizeY: g.H, layers: LAYERS, voxels: voxelsFromHeights(g.heights, g.W, g.H), singletons: emptySimulationSingletons(g.W, g.H), entities: g.entities.map(entityJson) },
    extraFiles: [],
  };
}

/** The ground's own water as the settled water, on the water model of its objects. */
function waterOf(g: Ground, file: TimberFile): NonNullable<ValidateOptions["water"]> {
  const model = waterModel(g.W, g.H, g.heights, mapObjects(file.world));
  const settled = { settled: true, ticks: 3072, depth: g.depth, contamination: g.contamination, sat: new Uint8Array(g.W * g.H) } as CanonicalWater;
  return { model, settled };
}

/** A spec as the checks read it (the rules and the settings they use, nothing else). */
function spec(designedFor: "easy" | "normal" | "hard", set: { sources?: string; badwater?: string; area?: string; land?: string; reserve?: string } = {}): MapSpec {
  const rules = { easy: [12, 250, 40, 15, 10], normal: [20, 200, 30, 15, 10], hard: [28, 0, 30, 10, 10] }[designedFor];
  return {
    designedFor,
    theme: "riverValley",
    settings: {
      start: { rules: { waterWithin: rules[0], woodWithin20: rules[1], bushesWithin20: rules[2], badwaterWithin: rules[3], ruinsWithin: rules[4] }, area: set.area ?? "normal" },
      hazards: { badwaterDistance: 12, badwater: set.badwater ?? "normal" },
      terrain: { buildableLand: set.land ?? "normal" },
      water: { sources: set.sources ?? "normal", droughtReserve: set.reserve ?? "normal" },
      resources: { ruins: 100, forestDensity: 80, berryBushes: 120 },
    },
  } as unknown as MapSpec;
}

/** A map object feature (the extras' checks). */
function extra(id: string, kind: string, x: number, y: number, origin = "generated", core?: { radius: number; cycles: number }): Feature {
  return { id, kind: "mapObject", origin, locked: false, params: { kind, placement: { x, y, orientation: "Cw0" }, ...(core ? { core } : {}) } } as unknown as Feature;
}

function lake(id: string, outline: [number, number][], planned: boolean): Feature {
  return { id, kind: "lake", origin: "generated", locked: false, params: { outline, planned, floorDepth: 1, outlet: { at: outline[0], sill: 5, to: "edge" } } } as unknown as Feature;
}

function basin(id: string, x: number, y: number, floor: number, outlet: number[]): Feature {
  return {
    id,
    kind: "setPiece",
    origin: "generated",
    locked: false,
    params: { kind: "badwaterBasin", plan: { mode: "basin", x, y, floor, outlet, outletLevels: outlet.filter((_, k) => k % 2 === 0).map(() => floor), outletWidth: 1 } },
  } as unknown as Feature;
}

/** One fixture: a map and how it is validated. */
export interface ChecksCase {
  name: string;
  file: TimberFile;
  opts: ValidateOptions;
}

/** Every fixture's input buffers, in a fixed order. */
export function checksFixtures(): ChecksJob[] {
  return checksCases().map((c) => ({ name: c.name, inputs: checksInput(c.file, c.opts).inputs }));
}

/** Every fixture, in a fixed order. */
export function checksCases(): ChecksCase[] {
  const jobs: ChecksCase[] = [];
  const add = (name: string, g: Ground, opts: (file: TimberFile) => ValidateOptions) => {
    const file = fileOf(g);
    jobs.push({ name, file, opts: opts(file) });
  };
  const id = (k: number) => `00000000-0000-4000-8000-${String(k).padStart(12, "0")}`;

  for (const kind of ["river", "slide", "lake", "plain"] as const) {
    const g = ground(kind, 48);
    const features: Feature[] = kind === "lake" ? [lake("lake-1", [[20, 28], [32, 28], [32, 40], [20, 40]], true)] : [];
    add(`${kind} 48²: generate`, g, (f) => ({ profile: "generate", spec: spec("normal"), features, water: waterOf(g, f) }));
    add(`${kind} 48²: the editor's export`, g, (f) => ({ profile: "export", external: false, editing: true, mineCutAtOpen: new Set<number>(), spec: spec("normal"), designedFor: "normal", features, water: waterOf(g, f) }));
    add(`${kind} 48²: an import at Hard`, g, (f) => ({ profile: "import", designedFor: "hard", water: waterOf(g, f) }));
    add(`${kind} 48²: load only`, g, () => ({ profile: "import", loadOnly: true }));
  }
  {
    const g = ground("river", 96);
    add("river 96²: generate", g, (f) => ({ profile: "generate", spec: spec("normal"), features: [], water: waterOf(g, f) }));
  }

  // a wall along the north edge: a principle in a generation, a warning with "Lower the wall" in the editor
  {
    const g = ground("plain", 48);
    for (let y = 0; y < 2; y++) for (let x = 0; x < g.W; x++) g.heights[y * g.W + x] += 4;
    add("wall: generate", g, (f) => ({ profile: "generate", spec: spec("normal"), features: [], water: waterOf(g, f) }));
    add("wall: the editor's export", g, (f) => ({ profile: "export", external: false, editing: true, spec: spec("normal"), features: [], water: waterOf(g, f) }));
  }
  // no start, and two starts
  {
    const g = ground("river", 48);
    g.entities = g.entities.filter((e) => e.template !== "StartingLocation");
    add("no start", g, (f) => ({ profile: "generate", spec: spec("normal"), features: [], water: waterOf(g, f) }));
    const h = ground("river", 48);
    const start = h.entities.find((e) => e.template === "StartingLocation")!;
    h.entities.push({ ...start, id: id(1), x: start.x + 20, y: start.y + 20, z: h.heights[(start.y + 21) * h.W + start.x + 21] });
    add("two starts", h, (f) => ({ profile: "generate", spec: spec("normal"), features: [], water: waterOf(h, f) }));
  }
  // Sources: None without its sources; No badwater; Easy; Hard with scarce reserves and a large start
  {
    const g = ground("river", 48);
    g.entities = g.entities.filter((e) => e.template !== "WaterSource");
    add("Sources: None", g, (f) => ({ profile: "generate", spec: spec("normal", { sources: "none" }), features: [], water: waterOf(g, f) }));
    const r = ground("river", 48);
    add("No badwater", r, (f) => ({ profile: "generate", spec: spec("normal", { badwater: "off" }), features: [], water: waterOf(r, f) }));
    add("Easy", r, (f) => ({ profile: "generate", spec: spec("easy", { land: "generous", area: "small" }), features: [], water: waterOf(r, f) }));
    add("Hard", r, (f) => ({ profile: "generate", spec: spec("hard", { reserve: "scarce", area: "large", land: "tight" }), features: [], water: waterOf(r, f) }));
  }
  // water a steady state cannot show: a source that turns on later carries most of it, and the settle
  // floods the start where the map's own water keeps it dry
  {
    const g = ground("lake", 48);
    const start = g.entities.find((e) => e.template === "StartingLocation")!;
    g.entities.push(waterSource({ id: id(2), owner: "fixture", x: 30, y: 6, z: g.heights[6 * 48 + 30], strength: 9, timed: { enabled: true, cycles: 1, days: 3 } }));
    for (let y = start.y - 1; y <= start.y + 3; y++) for (let x = start.x - 1; x <= start.x + 3; x++) g.depth[y * 48 + x] = 0.4;
    add("approximate water", g, (f) => ({ profile: "import", designedFor: "normal", storedWet: new Uint8Array(48 * 48), water: waterOf(g, f) }));
  }
  // objects the game would delete, an unknown template, a component missing, a slope that joins nothing,
  // a badwater source and seep, an aquifer
  {
    const g = ground("slide", 48);
    const at = (x: number, y: number) => ({ owner: "fixture", x, y, z: g.heights[y * 48 + x] });
    g.entities.push(blockObject({ id: id(3), ...at(40, 40), template: "Mangrove", orientation: "Cw0" }));
    g.entities.push({ ...blockObject({ id: id(4), ...at(42, 6), template: "RuinColumnH3", orientation: "Cw0" }) });
    g.entities.push(slope({ id: id(5), ...at(20, 20), orientation: "Cw90" }));
    g.entities.push(blockObject({ id: id(6), ...at(6, 40), template: "Blockage", orientation: "Cw0" }));
    g.entities.push({ ...blockObject({ id: id(7), ...at(6, 40), template: "Blockage", orientation: "Cw0" }), z: g.heights[40 * 48 + 6] + 3 });
    g.entities.push(waterSource({ id: id(8), ...at(44, 44), strength: 2, bad: true }));
    g.entities.push(fluidObject({ id: id(9), ...at(3, 44), template: "BadwaterSeep", strength: 1 }));
    g.entities.push(fluidObject({ id: id(10), ...at(44, 3), template: "Aquifer", strength: 3 }));
    add("objects the game deletes", g, (f) => ({ profile: "generate", spec: spec("normal"), features: [], water: waterOf(g, f) }));
    add("objects the game deletes: load only", g, () => ({ profile: "export", loadOnly: true }));
  }
  // planned lakes, a badwater basin, and the extras in and out of their bands
  {
    const g = ground("plain", 48);
    const features = [
      lake("lake-2", [[30, 30], [44, 30], [44, 44], [30, 44]], true),
      lake("lake-3", [[2, 30], [8, 30], [8, 36], [2, 36]], false),
      basin("basin-1", 36, 6, 7, [37, 9, 37, 10, 37, 11]),
      basin("basin-2", 2, 2, 9, [3, 5]),
      extra("relic-1", "relicSmall", 30, 12),
      extra("relic-2", "relicLarge", 20, 20),
      extra("geo-1", "geothermal", 33, 33),
      extra("mine-1", "mineSite", 46, 46),
      extra("mine-2", "mineSite", 40, 20, "user"),
      extra("core-1", "unstableCore", 40, 4, "generated", { radius: 3, cycles: 5 }),
      extra("core-2", "unstableCore", 43, 5, "generated", { radius: 3, cycles: 5 }),
      extra("thorns-1", "thornBelt", 10, 8),
    ];
    add("lakes, a basin and the extras", g, (f) => ({ profile: "generate", spec: spec("normal"), features, water: waterOf(g, f) }));
    add("lakes, a basin and the extras: the editor's export", g, (f) => ({ profile: "export", external: false, editing: true, mineCutAtOpen: new Set([46 * 48 + 46]), spec: spec("normal"), features, water: waterOf(g, f) }));
  }
  return jobs;
}

/** A validation's status and outputs, packed: the status, then each output's u32 length and bytes. */
export function packOutputs(o: ChecksOutput): Uint8Array {
  const total = 4 + o.out.reduce((a, b) => a + 4 + b.length, 0);
  const out = new Uint8Array(total);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, o.status, true);
  let at = 4;
  for (const b of o.out) {
    dv.setUint32(at, b.length, true);
    out.set(b, at + 4);
    at += 4 + b.length;
  }
  return out;
}

/** The input buffers as checks-batch reads one job: "DGMI", their count, then each one's u32 length and bytes. */
export function dumpInputs(inputs: readonly Uint8Array[]): Uint8Array {
  const total = 8 + inputs.reduce((a, b) => a + 4 + b.length, 0);
  const out = new Uint8Array(total);
  const dv = new DataView(out.buffer);
  out.set([68, 71, 77, 73], 0);
  dv.setUint32(4, inputs.length, true);
  let at = 8;
  for (const b of inputs) {
    dv.setUint32(at, b.length, true);
    out.set(b, at + 4);
    at += 4 + b.length;
  }
  return out;
}

/** checks-batch's result for one job ("DGMO", the status, the outputs' count, each one's u32 length and bytes). */
export function readOutputs(b: Uint8Array): ChecksOutput {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  if (String.fromCharCode(...b.subarray(0, 4)) !== "DGMO") throw new Error("not a checks-batch result");
  const status = dv.getUint32(4, true);
  const count = dv.getUint32(8, true);
  const out: Uint8Array[] = [];
  let at = 12;
  for (let k = 0; k < count; k++) {
    const n = dv.getUint32(at, true);
    out.push(b.slice(at + 4, at + 4 + n));
    at += 4 + n;
  }
  return { status, out };
}

export const sha256 = (b: Uint8Array): string => createHash("sha256").update(b).digest("hex");

// pins: every fixture's sha256 in the current Rust
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const pins: Record<string, string> = {};
  for (const j of checksFixtures()) pins[j.name] = sha256(packOutputs(runChecks(j.inputs)));
  console.log(JSON.stringify(pins, null, 2));
}
