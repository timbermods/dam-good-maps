// The host side of the port: what checks.ts read from the file's JSON, written into the checks' typed input
// buffers (src/input.rs), with the TypeScript's own format helpers (placementOf, specifiedStrength, growthOf…).
// Adopted, this is the adapter beside the Wasm: it replaces checks.ts's and playability.ts's own reads of the
// file, and the checks run in Rust. The water (model and canonical settle) stays the caller's, as in
// validateMap.

import { oracle } from "./oracle";

const { placementOf } = await import(oracle("src/core/format/entities.ts"));
const { isObject, num, JsonFloat } = await import(oracle("src/core/format/json.ts"));
const { ORIENTATIONS } = await import(oracle("src/core/format/footprints.ts"));
const { floorsOf: _floorsOf, storedWater, surfaceOf } = await import(oracle("src/core/format/world.ts"));
const { isDelayed, mapObjects, specifiedStrength, waterModel } = await import(oracle("src/core/sim/model.ts"));
const { canonicalSettle } = await import(oracle("src/core/sim/prefill.ts"));
const { storedWetMask } = await import(oracle("src/core/analysis/mechanics.ts"));
const { growthOf } = await import(oracle("src/core/analysis/wood.ts"));
const { EXTRA_BANDS } = await import(oracle("src/core/validate/playability.ts"));
const { objectTiles } = await import(oracle("src/core/features/objects.ts"));
const soil = await import(oracle("src/core/sim/soil.ts"));

export const INPUTS = 8;
const [META, VOXELS, DEPTH, CONTAMINATION, FLOOR, DAM, STORED_WET, THUMBNAIL] = [0, 1, 2, 3, 4, 5, 6, 7];
const COMP_NAMES = ["WaterSource", "WaterDepthStrengthModifier", "UnstableCore", "FixedStockpile", "RuinModels", "Yielder:Ruin"];
const NEED = ["MapSize", "TerrainMap", "WaterMapNew", "SoilMoistureSimulator", "SoilContaminationSimulator", "WaterEvaporationMap"];
const MD_KEYS = ["Width", "Height", "MapNameLocKey", "MapDescriptionLocKey", "MapDescription", "IsRecommended", "IsUnconventional", "IsDev"];

/** An input the port does not reproduce: the host runs the TypeScript for it. */
export class Refuse extends Error {}

class Meta {
  private parts: number[] = [];
  u8(v: number) {
    this.parts.push(v & 255);
  }
  bool(v: boolean) {
    this.u8(v ? 1 : 0);
  }
  u32(v: number) {
    if (!(v >= 0 && v < 2 ** 32 && Number.isInteger(v))) throw new Refuse(`u32 ${v}`);
    this.parts.push(v & 255, (v >>> 8) & 255, (v >>> 16) & 255, v >>> 24);
  }
  f64(v: number) {
    const b = new Uint8Array(new Float64Array([v]).buffer);
    for (const x of b) this.parts.push(x);
  }
  str(v: string) {
    if (!v.isWellFormed()) throw new Refuse("a string with a lone surrogate");
    const b = new TextEncoder().encode(v);
    this.u32(b.length);
    for (const x of b) this.parts.push(x);
  }
  optStr(v: unknown) {
    if (v === undefined || v === null) return this.bool(false);
    if (typeof v !== "string") throw new Refuse(`a setting that is not a string: ${JSON.stringify(v)}`);
    this.bool(true);
    this.str(v);
  }
  f64s(v: ArrayLike<number>) {
    this.u32(v.length);
    for (let k = 0; k < v.length; k++) this.f64(v[k]);
  }
  int(v: number) {
    if (!Number.isInteger(v) || Math.abs(v) > 1e9) throw new Refuse(`a coordinate that is not an integer: ${v}`);
    this.f64(v);
  }
  bytes(): Uint8Array {
    return Uint8Array.from(this.parts);
  }
}

/** wood.ts `numberOf`: a number as a file stores it, or null. */
function numberOf(v: any): number | null {
  if (isObject(v) && Object.keys(v).length === 1 && "Value" in v) v = v.Value;
  if (typeof v !== "number" && !(v instanceof JsonFloat)) return null;
  const n = num(v);
  return Number.isFinite(n) ? n : null;
}

function f64Bytes(a: ArrayLike<number> | null | undefined): Uint8Array {
  if (!a) return new Uint8Array(0);
  const f = a instanceof Float64Array ? a : Float64Array.from(a);
  return new Uint8Array(f.buffer, f.byteOffset, f.byteLength);
}

export interface Encoded {
  inputs: Uint8Array[];
  /** The water the checks ran on (the caller's, or the settle computed here as validateMap computes it). */
  model: any;
  water: any;
}

/** The checks' input buffers for `validateMap(file, opts)`. */
export function encode(file: any, opts: any): Encoded {
  const w = file.world;
  const X = w.sizeX;
  const Y = w.sizeY;
  const N = X * Y;
  const m = new Meta();
  m.u32(0x434d4744);
  m.u32(1);
  m.u32(X);
  m.u32(Y);
  m.u32(w.layers);
  m.u8({ generate: 0, export: 1, import: 2 }[opts.profile as string] ?? 255);
  m.bool(opts.external ?? opts.profile === "import");
  m.bool(opts.editing === true);
  const loadOnly = !!opts.loadOnly;
  m.bool(loadOnly);
  m.str(w.gameVersion);
  m.str(file.versionTxt);
  // checkFile's reads of the singletons
  const s = w.singletons;
  let present = 0;
  NEED.forEach((k, i) => {
    if (k in s) present |= 1 << i;
  });
  m.u32(present);
  const mig = s.WaterSimulationMigrator;
  m.bool(isObject(mig) && mig.IsMigrated === true);
  const missing = NEED.some((k) => !(k in s));
  const len = (o: any, key: string) => (isObject(o) && isObject(o[key]) ? String(o[key].Array).split(" ").length : -1);
  const slots = (o: any, key: string) => (isObject(o) && key in o ? num(o[key]) : 1);
  if (missing) {
    m.f64(0);
    for (let k = 0; k < 9; k++) m.f64(0);
  } else {
    const wm = s.WaterMapNew;
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
    m.str(String(md.Width));
    m.str(String(md.Height));
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
      m.int(p.x);
      m.int(p.y);
      m.int(p.z);
      const o = (ORIENTATIONS as readonly unknown[]).indexOf(p.orientation);
      m.u8(o < 0 ? 4 : o);
      m.bool(p.flipped);
    }
    const comps = (p ? e.Components : isObject(e.Components) ? e.Components : {}) as any;
    m.f64(p ? specifiedStrength(comps) : 0);
    m.bool(p ? isDelayed(comps) : false);
    const lnr = comps.LivingNaturalResource;
    m.bool(!!lnr && lnr.IsDead === true);
    m.bool(!!lnr?.IsDead);
    const y = comps["Yielder:Cuttable"];
    const logs = isObject(y) && isObject(y.Yield) && y.Yield.Good === "Log" ? numberOf(y.Yield.Amount) : null;
    m.bool(logs !== null);
    if (logs !== null) m.f64(logs);
    const g = p ? growthOf(comps) : null;
    m.bool(g !== null);
    if (g !== null) m.f64(g);
    let bits = 0;
    COMP_NAMES.forEach((r, i) => {
      if (isObject(comps) && r in comps) bits |= 1 << i;
    });
    m.u32(bits);
  }
  const inputs: Uint8Array[] = new Array(INPUTS).fill(new Uint8Array(0));
  inputs[VOXELS] = w.voxels;
  if (file.thumbnail) inputs[THUMBNAIL] = file.thumbnail;
  let model: any = null;
  let water: any = null;
  if (!loadOnly) {
    const objects = mapObjects(w);
    model = opts.water?.model ?? waterModel(X, Y, surfaceOf(w), objects);
    water = opts.water?.settled ?? canonicalSettle(model, opts.waterRules ? { rules: opts.waterRules } : {});
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
    m.str(String(file.metadata?.MapDescription ?? ""));
    const features = opts.features ?? null;
    m.bool(!!features);
    if (features) {
      const lakes = features.filter((f: any) => f.kind === "lake");
      m.u32(lakes.length);
      for (const f of lakes) {
        m.f64s(f.params.outline.flat());
        m.bool(!!f.params.planned);
      }
      const basins = features.filter((f: any) => f.kind === "setPiece" && f.params.kind === "badwaterBasin" && f.params.plan.mode === "basin" && Array.isArray(f.params.plan.outlet));
      m.u32(basins.length);
      for (const f of basins) {
        const p = f.params.plan;
        m.f64(p.x);
        m.f64(p.y);
        m.f64(p.floor);
        m.f64s(p.outlet);
        m.f64s(p.outletLevels);
        m.f64(p.outletWidth);
      }
      const extras = features.filter((f: any) => f.kind === "mapObject" && f.params.kind in EXTRA_BANDS);
      m.u32(extras.length);
      for (const f of extras) {
        m.str(f.params.kind);
        m.bool(f.origin === "generated");
        const t = objectTiles(f, X, Y);
        m.u32(t.length);
        for (const [x, y] of t) {
          m.int(x);
          m.int(y);
        }
        m.f64(f.params.core?.radius ?? 2);
      }
    }
    // the map's own water as wet tiles, which the approximate-water rule compares the settle with
    let stored: Uint8Array | null;
    if (opts.storedWet !== undefined) stored = opts.storedWet;
    else {
      try {
        stored = storedWetMask(storedWater(w.singletons, X, Y), N);
      } catch {
        throw new Refuse("the file's stored water cannot be read");
      }
    }
    m.bool(!!stored);
    if (stored) inputs[STORED_WET] = stored;
    m.bool(!!opts.mineCutAtOpen);
    if (opts.mineCutAtOpen) m.f64s([...opts.mineCutAtOpen]);
    const rules = opts.soilRules ?? soil.SOIL_MODE.mode ?? soil.DEFAULT_SOIL_RULES;
    m.bool(rules !== "game");
    inputs[FLOOR] = f64Bytes(model.floor);
    inputs[DAM] = f64Bytes(model.dam);
    inputs[DEPTH] = f64Bytes(water.depth);
    inputs[CONTAMINATION] = f64Bytes(water.contamination);
  }
  inputs[META] = m.bytes();
  return { inputs, model, water };
}

function numeric(v: unknown): number {
  if (typeof v !== "number") throw new Refuse(`a setting that is not a number: ${JSON.stringify(v)}`);
  return v;
}

/** The input buffers as one file, for the native batch (src/main.rs). */
export function dumpInputs(inputs: Uint8Array[]): Uint8Array {
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

export interface Outputs {
  status: number;
  out: Uint8Array[];
}

/** A native output file. */
export function readOutputs(b: Uint8Array): Outputs {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  if (String.fromCharCode(...b.subarray(0, 4)) !== "DGMO") throw new Error("not an output");
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
