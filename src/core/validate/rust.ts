// The checks in Rust (PLAN §20 D381, D465; #207): rust/checks, compiled with strict floating point and embedded
// in ./checksWasm.ts by tools/rust/build.ts, so nothing is fetched and the core stays headless (Node, workers
// and every engine run the same module). The verdicts and the report are the same bytes as the TypeScript
// checks they replaced (tag `ts-checks-final`).
//
// One retained instance holds eight input buffers written straight into its memory: the map in typed arrays
// (the voxels; the settled depth and contamination and the water model's floor and dam; the map's own wet
// tiles; the thumbnail) and one small metadata block with what the checks read from the file's JSON, read here
// with the format's own helpers (`placementOf`, `specifiedStrength`, `growthOf`, the features' geometry). One
// call validates; the outputs are the report (JSON text), the analysis' layers (typed) and its other fields
// and the mechanics (JSON). The water stays the caller's: the given model and canonical settle, or one
// settled here as before.
//
// Format: rust/checks/src/input.rs (the inputs) and lib.rs (the outputs).

import { CHECKS_WASM } from "./checksWasm";
import { placementOf } from "../format/entities";
import { ORIENTATIONS } from "../format/footprints";
import { isObject, JsonFloat, num, type JsonObject, type JsonValue } from "../format/json";
import { storedWater } from "../format/world";
import type { TimberFile } from "../format/timber";
import type { Feature, MapObjectFeature } from "../features/schema";
import { objectTiles } from "../features/objects";
import { storedWetMask, type Mechanics } from "../analysis/mechanics";
import { growthOf } from "../analysis/wood";
import { isDelayed, specifiedStrength } from "../sim/model";
import { canonicalSettle, type CanonicalWater } from "../sim/prefill";
import { seenThroughRoofs, worldWaterModel } from "../sim/stackWater";
import type { WaterModel } from "../sim/water";
import { EXTRA_BANDS, type PlayabilityAnalysis } from "./playability";
import type { ValidationReport } from "./report";
import { REQUIRED, type ValidateOptions, type Validation } from "./checks";

/** The input buffers, in rust/checks/src/input.rs's order. */
export const INPUTS = 8;
const [META, VOXELS, DEPTH, CONTAMINATION, FLOOR, DAM, STORED_WET, THUMBNAIL] = [0, 1, 2, 3, 4, 5, 6, 7];
/** The output buffers, in rust/checks/src/lib.rs's order. */
export const OUTPUTS = 8;
const [OUT_REPORT, OUT_ANALYSIS, OUT_MOISTURE, OUT_SOIL_CONTAMINATION, OUT_REACH, OUT_START_DISTANCE, OUT_SCALARS, OUT_REFUSAL] = [0, 1, 2, 3, 4, 5, 6, 7];
/** `checks_run`'s answer: validated, refused with a one-line reason, or input that holds no map. */
export const STATUS = { ok: 0, refused: 1, badInput: 2 } as const;

/** The components the load needs (checks.ts `REQUIRED`), in order of first use: rust/checks/src/tables.rs
 *  `COMP_NAMES`, generated from the same table (tools/rust/checks-tables.ts). */
let compNames: string[] | null = null;
const NEED = ["MapSize", "TerrainMap", "WaterMapNew", "SoilMoistureSimulator", "SoilContaminationSimulator", "WaterEvaporationMap"];
const MD_KEYS = ["Width", "Height", "MapNameLocKey", "MapDescriptionLocKey", "MapDescription", "IsRecommended", "IsUnconventional", "IsDev"];

/** The metadata block: little-endian numbers, strings as UTF-16 code units (the Rust refuses a broken one). */
class Meta {
  private parts: number[] = [];
  u8(v: number): void {
    this.parts.push(v & 255);
  }
  bool(v: boolean): void {
    this.u8(v ? 1 : 0);
  }
  u32(v: number): void {
    this.parts.push(v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255);
  }
  f64(v: number): void {
    for (const x of new Uint8Array(new Float64Array([v]).buffer)) this.parts.push(x);
  }
  str(v: string): void {
    this.u32(v.length);
    for (let k = 0; k < v.length; k++) {
      const c = v.charCodeAt(k);
      this.parts.push(c & 255, c >>> 8);
    }
  }
  /** A setting that is absent (0), a string (1) or anything else (2, which the Rust refuses). */
  optStr(v: unknown): void {
    if (v === undefined || v === null) return this.u8(0);
    if (typeof v !== "string") return this.u8(2);
    this.u8(1);
    this.str(v);
  }
  f64s(v: ArrayLike<number>): void {
    this.u32(v.length);
    for (let k = 0; k < v.length; k++) this.f64(v[k]);
  }
  bytes(): Uint8Array {
    return Uint8Array.from(this.parts);
  }
}

/** A number as a file stores it (analysis/wood.ts): a plain number, the parser's float, or the older
 *  {"Value": …} wrapper; null for anything else. */
function numberOf(v: JsonValue | undefined): number | null {
  if (isObject(v) && Object.keys(v).length === 1 && "Value" in v) v = v.Value;
  if (typeof v !== "number" && !(v instanceof JsonFloat)) return null;
  const n = num(v);
  return Number.isFinite(n) ? n : null;
}

/** A setting's number (NaN when it is not one, which the Rust refuses). */
const numeric = (v: unknown): number => (typeof v === "number" ? v : NaN);

function f64Bytes(a: ArrayLike<number> | null | undefined): Uint8Array {
  if (!a) return new Uint8Array(0);
  const f = a instanceof Float64Array ? a : Float64Array.from(a);
  return new Uint8Array(f.buffer, f.byteOffset, f.byteLength);
}

/** A map's input buffers, and the water the checks ran on. */
export interface ChecksInput {
  inputs: Uint8Array[];
  model: WaterModel | null;
  water: CanonicalWater | null;
}

/** The checks' input buffers for `validateMap(file, opts)`. */
export function checksInput(file: TimberFile, opts: ValidateOptions): ChecksInput {
  const w = file.world;
  const X = w.sizeX;
  const Y = w.sizeY;
  const N = X * Y;
  const m = new Meta();
  m.u32(0x434d4744);
  m.u32(2);
  m.u32(X);
  m.u32(Y);
  m.u32(w.layers);
  m.u8({ generate: 0, export: 1, import: 2 }[opts.profile] ?? 255);
  m.bool(opts.external ?? opts.profile === "import");
  m.bool(opts.editing === true);
  const loadOnly = !!opts.loadOnly;
  m.bool(loadOnly);
  m.str(w.gameVersion);
  m.str(file.versionTxt);
  // what checkFile reads of the singletons
  const s = w.singletons;
  let present = 0;
  NEED.forEach((k, i) => {
    if (k in s) present |= 1 << i;
  });
  m.u32(present);
  const mig = s.WaterSimulationMigrator;
  m.bool(isObject(mig) && mig.IsMigrated === true);
  if (NEED.some((k) => !(k in s))) for (let k = 0; k < 10; k++) m.f64(0);
  else {
    const len = (o: JsonValue | undefined, key: string) => (isObject(o) && isObject(o[key]) ? String((o[key] as JsonObject).Array).split(" ").length : -1);
    const slots = (o: JsonValue | undefined, key: string) => (isObject(o) && key in o ? num(o[key]) : 1);
    const wm = s.WaterMapNew as JsonObject;
    m.f64(num(wm.Levels));
    for (const v of [len(wm, "WaterColumns"), len(wm, "ColumnOutflows"), len(s.SoilMoistureSimulator, "MoistureLevels"), len(s.SoilContaminationSimulator, "ContaminationLevels"), len(s.SoilContaminationSimulator, "ContaminationCandidates"), len(s.WaterEvaporationMap, "EvaporationModifiers")]) m.f64(v);
    for (const v of [slots(s.SoilMoistureSimulator, "Size"), slots(s.SoilContaminationSimulator, "Size"), slots(s.WaterEvaporationMap, "Levels")]) m.f64(v);
  }
  const md = file.metadata;
  m.bool(!!md);
  if (md) {
    m.bool(MD_KEYS.every((k) => k in md));
    m.f64(typeof md.Width === "number" ? md.Width : NaN);
    m.f64(typeof md.Height === "number" ? md.Height : NaN);
  }
  m.bool(!!file.thumbnail);
  // the entities: placement and the component facts the checks read
  m.u32(w.entities.length);
  for (const e of w.entities) {
    m.str(String(e.Id));
    m.str(String(e.Template));
    const p = placementOf(e);
    m.bool(!!p);
    if (p) {
      m.f64(p.x);
      m.f64(p.y);
      m.f64(p.z);
      const o = (ORIENTATIONS as readonly unknown[]).indexOf(p.orientation);
      m.u8(o < 0 ? 4 : o);
      m.bool(p.flipped);
    }
    const comps = (p ? e.Components : isObject(e.Components) ? e.Components : {}) as JsonObject;
    m.f64(p ? specifiedStrength(comps) : 0);
    m.bool(p ? isDelayed(comps) : false);
    const lnr = comps.LivingNaturalResource;
    m.bool(isObject(lnr) && lnr.IsDead === true);
    m.bool(!!(lnr as JsonObject | undefined)?.IsDead);
    const y = comps["Yielder:Cuttable"];
    const logs = isObject(y) && isObject(y.Yield) && y.Yield.Good === "Log" ? numberOf(y.Yield.Amount) : null;
    m.bool(logs !== null);
    if (logs !== null) m.f64(logs);
    const g = p ? growthOf(comps) : null;
    m.bool(g !== null);
    if (g !== null) m.f64(g);
    let bits = 0;
    compNames ??= [...new Set(Object.values(REQUIRED).flat())];
    compNames.forEach((r, i) => {
      if (isObject(comps) && r in comps) bits |= 1 << i;
    });
    m.u32(bits);
  }
  const inputs: Uint8Array[] = new Array(INPUTS).fill(new Uint8Array(0));
  inputs[VOXELS] = w.voxels;
  if (file.thumbnail) inputs[THUMBNAIL] = file.thumbnail;
  let model: WaterModel | null = null;
  let water: CanonicalWater | null = null;
  if (!loadOnly) {
    // (a file with caves or overhangs settles in the stacked-column engine, D120; the water the
    // checks read is then the map seen through its roofs, each tile's highest wet column)
    model = opts.water?.model ?? worldWaterModel(w);
    water = opts.water?.settled ?? canonicalSettle(model);
    m.u32(model.emitters.length);
    for (const em of model.emitters) {
      m.f64s(em.cells);
      m.f64(em.strength);
      m.f64(em.contamination);
    }
    m.bool(water.settled);
    m.f64(water.ticks);
    m.bool(water.steadyTicks !== undefined);
    if (water.steadyTicks !== undefined) m.f64(water.steadyTicks);
    const spec = opts.spec ?? null;
    m.bool(!!spec);
    if (spec) {
      m.str(String(spec.designedFor));
      m.str(String(spec.theme));
      const st = spec.settings;
      m.bool(!!st);
      if (st) {
        const r = st.start.rules;
        m.bool(!!r);
        if (r) for (const v of [r.waterWithin, r.woodWithin20, r.bushesWithin20, r.badwaterWithin, r.ruinsWithin]) m.f64(numeric(v));
        m.f64(numeric(st.hazards.badwaterDistance));
        m.optStr(st.terrain.buildableLand);
        m.optStr(st.start.area);
        m.optStr(st.water.sources);
        m.optStr(st.water.droughtReserve);
        m.f64(numeric(st.resources.ruins));
        m.f64(numeric(st.resources.forestDensity));
        m.f64(numeric(st.resources.berryBushes));
        m.optStr(st.hazards.badwater ?? null);
      }
    }
    m.str(String(opts.designedFor ?? "normal"));
    m.str(String((file.metadata as { MapDescription?: unknown } | null)?.MapDescription ?? ""));
    const features: readonly Feature[] | null = opts.features ?? null;
    m.bool(!!features);
    if (features) {
      const lakes = features.filter((f) => f.kind === "lake");
      m.u32(lakes.length);
      for (const f of lakes) {
        m.f64s(f.params.outline.flat());
        m.bool(!!f.params.planned);
      }
      const basins = features.filter((f) => f.kind === "setPiece" && f.params.kind === "badwaterBasin" && f.params.plan.mode === "basin" && Array.isArray(f.params.plan.outlet));
      m.u32(basins.length);
      for (const f of basins) {
        const p = (f.params as unknown as { plan: { x: number; y: number; floor: number; outlet: number[]; outletLevels: number[]; outletWidth: number } }).plan;
        m.f64(p.x);
        m.f64(p.y);
        m.f64(p.floor);
        m.f64s(p.outlet);
        m.f64s(p.outletLevels);
        m.f64(p.outletWidth);
      }
      const extras = features.filter((f): f is MapObjectFeature => f.kind === "mapObject" && f.params.kind in EXTRA_BANDS);
      m.u32(extras.length);
      for (const f of extras) {
        m.str(f.params.kind);
        m.bool(f.origin === "generated");
        const t = objectTiles(f, X, Y);
        m.u32(t.length);
        for (const [x, y] of t) {
          m.f64(x);
          m.f64(y);
        }
        m.f64((f.params as { core?: { radius?: number } }).core?.radius ?? 2);
      }
    }
    // the map's own water as wet tiles, which the approximate-water rule compares the settle with (read only
    // when it is needed, so a file whose stored water cannot be read is refused only then)
    let stored: Uint8Array | null;
    let unreadable = false;
    if (opts.storedWet !== undefined) stored = opts.storedWet;
    else {
      try {
        stored = storedWetMask(storedWater(w.singletons, X, Y), N);
      } catch {
        stored = null;
        unreadable = true;
      }
    }
    m.u8(unreadable ? 2 : stored ? 1 : 0);
    if (stored) inputs[STORED_WET] = stored;
    m.bool(!!opts.mineCutAtOpen);
    if (opts.mineCutAtOpen) m.f64s([...opts.mineCutAtOpen]);
    inputs[FLOOR] = f64Bytes(model.floor);
    inputs[DAM] = f64Bytes(model.dam);
    const seen = water.stack?.stacked ? seenThroughRoofs(water.stack) : water;
    inputs[DEPTH] = f64Bytes(seen.depth);
    inputs[CONTAMINATION] = f64Bytes(seen.contamination);
  }
  inputs[META] = m.bytes();
  return { inputs, model, water };
}

// ------------------------------------------------------------------------------------------ the module

interface Exports {
  memory: WebAssembly.Memory;
  checks_input(kind: number, bytes: number): number;
  checks_run(): number;
  checks_output(kind: number): number;
  checks_output_len(kind: number): number;
}

let module: Exports | null = null;

/** The instantiated module, compiled once per thread on first use. */
function rustChecks(): Exports {
  if (!module) {
    const text = atob(CHECKS_WASM);
    const bytes = new Uint8Array(text.length);
    for (let k = 0; k < text.length; k++) bytes[k] = text.charCodeAt(k);
    module = new WebAssembly.Instance(new WebAssembly.Module(bytes), {}).exports as unknown as Exports;
  }
  return module;
}

/** The status and the output buffers of one validation. */
export interface ChecksOutput {
  status: number;
  out: Uint8Array[];
}

/** Runs the checks in Rust on a map's input buffers; the outputs, owned by JavaScript. */
export function runChecks(inputs: readonly Uint8Array[]): ChecksOutput {
  const x = rustChecks();
  for (let k = 0; k < INPUTS; k++) {
    const p = x.checks_input(k, inputs[k].length);
    // (a view taken after the call: the memory may have grown)
    new Uint8Array(x.memory.buffer, p, inputs[k].length).set(inputs[k]);
  }
  const status = x.checks_run();
  const out: Uint8Array[] = [];
  for (let k = 0; k < OUTPUTS; k++) {
    const n = x.checks_output_len(k);
    out.push(n ? new Uint8Array(x.memory.buffer, x.checks_output(k), n).slice() : new Uint8Array(0));
  }
  return { status, out };
}

const text = (b: Uint8Array): string => new TextDecoder().decode(b);
const f64s = (b: Uint8Array): Float64Array => new Float64Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));

/** The outputs as validateMap's Validation. A refused map throws its one-line reason. */
export function validationOf(o: ChecksOutput, input: ChecksInput): Validation {
  if (o.status !== STATUS.ok) throw new Error(o.status === STATUS.refused ? text(o.out[OUT_REFUSAL]) : `The checks could not read the map: ${text(o.out[OUT_REFUSAL])}`);
  const report = JSON.parse(text(o.out[OUT_REPORT])) as ValidationReport;
  if (!o.out[OUT_ANALYSIS].length) return { report, analysis: null, model: null, water: null, mechanics: null };
  const doc = JSON.parse(text(o.out[OUT_ANALYSIS])) as { analysis: Omit<PlayabilityAnalysis, "moisture" | "soilContamination" | "reach" | "startDistance" | "waterDistance">; mechanics: Mechanics };
  const analysis: PlayabilityAnalysis = {
    moisture: f64s(o.out[OUT_MOISTURE]),
    soilContamination: f64s(o.out[OUT_SOIL_CONTAMINATION]),
    reach: o.out[OUT_REACH].slice(),
    startDistance: o.out[OUT_START_DISTANCE].length ? f64s(o.out[OUT_START_DISTANCE]) : null,
    waterDistance: f64s(o.out[OUT_SCALARS])[0],
    ...doc.analysis,
  };
  return { report, analysis, model: input.model, water: input.water, mechanics: doc.mechanics };
}

/** `validateMap` in Rust. */
export function validateInRust(file: TimberFile, opts: ValidateOptions): Validation {
  const input = checksInput(file, opts);
  return validationOf(runChecks(input.inputs), input);
}
