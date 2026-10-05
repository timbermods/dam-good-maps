// The Rust forces' WebAssembly binding (PLAN §20 D381, #158): rust/forces, compiled with strict floating
// point and embedded in ./forcesWasm.ts by tools/rust/build.ts, so nothing is fetched and the core stays
// headless (Node, workers and every engine run the same module). A force is planned in one call: the map's
// metadata (its objects, the settings and where) goes in once in the job format (protocol.ts), its numeric
// arrays straight into the module's memory; the plan comes back as typed arrays and a flat list of numbers
// (`geometry`), read here into plain data and copied out before the plan is freed. The core keeps
// everything round it (the request, Keep, the build's last touches, the record, the operation and the
// showing); the TypeScript planners it replaced are tag `ts-forces-final`.
//
// Formats: rust/forces/src/lib.rs (`describe`, `output_views`).

import type { EntitySpec } from "../../format/entities";
import { FOOTPRINTS } from "../../format/footprints";
import { F } from "../../format/json";
import type { RetainedWater } from "../../sim/water";
import type { Metrics as CarveMetrics, Station as CarveStation } from "../carve/run";
import type { Oxbow } from "../carve/oxbow";
import type { CraterAnatomy } from "../craterize";
import type { EruptAnatomy } from "../erupt";
import { plainEntities, type FullForceMap, type ForceHead } from "../force";
import type { Basin, Hanging, Station as GlacierStation, Point } from "../glaciate/model";
import type { GlaciateMetrics } from "../glaciate/run";
import type { Fallen } from "../objects";
import type { FaultShape } from "../quake";
import { FORCES_WASM } from "./forcesWasm";
import { encode } from "./protocol";

interface Exports {
  memory: WebAssembly.Memory;
  water_alloc(len: number): number;
  water_dealloc(ptr: number, len: number): void;
  forces_create(ptr: number, len: number): number;
  forces_checkpoint(job: number): void;
  forces_descriptor(job: number): number;
  forces_plan(job: number): number;
  forces_free(job: number): void;
  forces_execute(ptr: number, len: number, outLen: number): number;
}

let module: Exports | null = null;

/** The instantiated module, compiled once per thread on first use. */
export function rustForces(): Exports {
  if (!module) {
    const text = atob(FORCES_WASM);
    const bytes = new Uint8Array(text.length);
    for (let k = 0; k < text.length; k++) bytes[k] = text.charCodeAt(k);
    module = new WebAssembly.Instance(new WebAssembly.Module(bytes), {}).exports as unknown as Exports;
  }
  return module;
}

/** The refusals the Rust gives, by code (rust/forces/src/lib.rs `FORCE_ERRORS`). */
const FORCE_ERRORS = [
  "",
  "Invalid impact settings",
  "Strike on the map",
  "Drag across the map to aim",
  "Invalid eruption settings",
  "Choose land on the map",
  "Draw a fissure on the land",
  "Draw a longer fissure",
  "Invalid quake settings",
  "Draw a fault on the land",
  "No room for objects to move",
  "Invalid carve settings",
  "Invalid character settings",
  "Choose a different end point",
  "A drawn path needs an aimed carve, on the map",
  "Choose a point on the land showing",
  "The end point is uphill of the start",
  "At the map floor: no ground left to carve",
  "a glacier's power is 0 to 100",
  "a glacier's size is 4 to 64 tiles, or null (it follows Power)",
  "a glacier's seed is a whole number from 0 to 4294967295",
  "the glacier's head is off the map",
  "an aimed glacier needs its end on the map",
  "only an aimed glacier follows a drawn path",
  "a glacier's path is up to 128 tiles on the map",
  "a glacier's path moves on from each of its tiles to the next",
  "No room to rise here",
  "Invalid Rift settings",
  "Draw the Rift on the map",
  "the Floor leaves no ground to drop here",
  "Invalid Deposit settings",
  "Draw Deposit on the map",
  "the working area leaves nothing to take sediment from",
  "the Floor leaves nothing to take sediment from",
  "the map leaves no room for sediment here",
];

export type RustVerb = "craterize" | "erupt" | "quake" | "carve" | "glaciate" | "rift" | "deposit";

/** A force to plan: which, the map it starts from, its settings and where (each verb's intent), the
 *  ground it leaves alone (`keep`, null for none), and a carve's own options (its source's id, the
 *  placed source it unleashes and whether that is badwater). */
export interface RustJob {
  verb: RustVerb;
  map: FullForceMap;
  settings: object;
  intent: object;
  keep: Uint8Array | null;
  areaDepth?: Uint8Array | null;
  options?: { sourceId?: string; unleashed?: string | null; bad?: boolean };
}

/** The job as the Rust reads it (protocol.ts), its numeric arrays included: the identity check's
 *  fixtures and the native batch binary take it whole. */
export function jobBytes(job: RustJob): Uint8Array {
  const N = job.map.W * job.map.H;
  return encode({ ...jobMetadata(job), map: { ...job.map, _plainEntities: plainEntities(job.map.entities) }, keep: job.keep ?? new Uint8Array(N), ...(job.areaDepth ? { areaDepth: job.areaDepth } : {}) }, false);
}

function jobMetadata(job: RustJob): Record<string, unknown> {
  const options = job.verb === "carve" ? { ...(job.options?.sourceId !== undefined ? { sourceId: job.options.sourceId } : {}), ...(job.options?.unleashed ? { unleashed: job.options.unleashed } : {}), ...(job.options?.bad ? { bad: true } : {}) } : {};
  return { verb: job.verb, settings: job.settings, intent: job.intent, options, footprints: FOOTPRINTS };
}

/** A plan's map: the input map's own fields with its ground, rock, water, objects and fallen trees. */
export type RustMap = FullForceMap;

/** An impact as planned: its map before the core's last touches (`raw`), its anatomy, how strongly it
 *  acts (D361 (3)), what it did, the ground it left alone, and when each tile takes its level. */
export interface CraterRecords {
  raw: RustMap;
  anatomy: CraterAnatomy;
  strength: number;
  stats: { cut: number; raised: number; changed: number; erased: number; flattened: number };
  keep: Uint8Array;
  arrival: Float32Array;
}

/** An eruption as planned: as an impact's, with its flows and its heat on the land (RGBA a tile). */
export interface EruptRecords {
  raw: RustMap;
  anatomy: EruptAnatomy;
  strength: number;
  stats: { raised: number; changed: number; flattened: number; erased: number; hard: number };
  keep: Uint8Array;
  flows: Float32Array;
  heat: Uint8Array;
}

/** A quake as planned: its fault, what it did, when each tile moves, how far, and where each tile's
 *  ground came from. */
export interface QuakeRecords {
  raw: RustMap;
  fault: FaultShape;
  stats: { changed: number; raised: number; dropped: number; moved: number; toppled: number; channel: number; transported: number; fullOffset: number };
  arrival: Float32Array;
  dx: Int16Array;
  dy: Int16Array;
  source: Uint32Array;
}

/** A glacier as planned (glaciate/run.ts `GlaciatePlan`, less what the core gives it). */
export interface GlaciateRecords {
  raw: RustMap;
  path: GlacierStation[];
  reference: Point[];
  streamPath: Point[];
  arrival: Float32Array;
  mask: Uint8Array;
  floor: Uint8Array;
  nearest: Int32Array;
  stream: Uint8Array;
  fan: Uint8Array;
  retained: RetainedWater;
  basins: Basin[];
  hanging: Hanging[];
  metrics: GlaciateMetrics;
  finished: { style: string; visits: number; reached: number; floods?: number; floodTicks?: number };
  joins: { kind: "fall" | "spill" | "inflow"; from: number; length: number }[];
}

/** A carve as planned, step by step: the objects when it starts (its sources placed), each step's
 *  changes (tiles and levels, interleaved; step 0 is none), metrics, head and course length, the objects
 *  it carried or took and when, and its end: its map, its source group, its oxbows, the map just before
 *  an oxbow's mouths closed (`closure`) and the lake that keeps its water (`retained`). `changes` are its
 *  steps as shown (the last step's spread behind the head, D368 (9)), `goneSpread` when what stood there
 *  goes as shown. */
export interface CarveRecords {
  raw: RustMap;
  map: RustMap;
  total: number;
  strengthDepth: number | null;
  metrics: CarveMetrics;
  removedAt: [string, number][];
  goneSpread: [string, number][];
  group: { id: string; tile: number; strength: number }[];
  oxbows: Oxbow[];
  oxbowBasin: number[];
  unleashedId: string | null;
  badwater: boolean;
  retained: RetainedWater | null;
  closure: RustMap | null;
  path: CarveStation[];
  heads: ForceHead[];
  lengths: Uint32Array;
  changes: Int32Array[];
  rawChanges: Int32Array[];
  stepMetrics: CarveMetrics[];
  stepObjectChanges: { step: number; id: string; x: number; y: number; z: number }[];
  initialEntities: EntitySpec[];
  /** For the contract tests (never in the operation): the river's hard rock cores it splits round, the
   *  map's rock under it (1 a core's tile), the sediment it laid in each tile (an oxbow's mouth bars), and
   *  a drawn path's curve (null without one). */
  knobs: { x: number; y: number; radius: number }[];
  rock: Uint8Array;
  sediment: Uint8Array;
  curve: { x: number[]; y: number[]; s: number[] } | null;
}

/** What the Rust plans, by verb (records.ts), with `raw`: its map before the core's last touches. */
export interface RiftRecords { raw: RustMap; fault: FaultShape; arrival: Float32Array; stats: { changed: number; drop: number; held: number; stepped: number; sheer: number; width: number }; }

export interface DepositRecords { raw: RustMap; arrival: Float32Array; channel: Uint8Array; channelStages: Uint8Array[]; mouth: Point; direction: Point; reach: number; width: number; placement: "fan" | "slope" | "sheet" | "delta" | "hollow"; branches: Point[][]; stats: { changed: number; eroded: number; deposited: number; balance: number; maximumCut: number; maximumDeposit: number; channels: number; wet: number; buried: number; carried: number; donorRadius: number }; }

export type RustPlan =
  | ({ verb: "deposit" } & DepositRecords)
  | ({ verb: "rift" } & RiftRecords)
  | ({ verb: "craterize" } & CraterRecords)
  | ({ verb: "erupt" } & EruptRecords)
  | ({ verb: "quake" } & QuakeRecords)
  | ({ verb: "glaciate" } & GlaciateRecords)
  | ({ verb: "carve" } & CarveRecords);

/** Plans a force in Rust; throws its refusal (one plain reason). */
export function planInRust<V extends RustVerb>(job: RustJob & { verb: V }): Extract<RustPlan, { verb: V }> {
  const x = rustForces();
  const m = job.map;
  const N = m.W * m.H;
  const plain = plainEntities(m.entities);
  const metadata = encode(
    {
      ...jobMetadata(job),
      map: { ...m, _plainEntities: plain, _rockLength: m.rockLayers.length, heights: [], lava: [], rockLayers: [], water: { depth: [], contamination: [] } },
      keep: [],
    },
    false,
  );
  const p = x.water_alloc(metadata.length);
  new Uint8Array(x.memory.buffer, p, metadata.length).set(metadata);
  let task = 0;
  try {
    task = x.forces_create(p, metadata.length);
  } finally {
    x.water_dealloc(p, metadata.length);
  }
  try {
    const descriptor = x.forces_descriptor(task);
    // (memory can grow in any call: views are made fresh after each)
    const view = <T>(slot: number, Type: { new (b: ArrayBuffer, at: number, n: number): T }): T => {
      const d = new Uint32Array(x.memory.buffer, descriptor, 136);
      return new Type(x.memory.buffer, d[slot * 2], d[slot * 2 + 1]);
    };
    for (const a of [m.heights, m.lava, m.water.depth, m.water.contamination]) if (a.length !== N) throw new Error("a force's map must be W × H");
    view(0, Uint8Array).set(m.heights);
    view(1, Uint32Array).set(m.lava);
    view(2, Float64Array).set(m.water.depth);
    view(3, Float64Array).set(m.water.contamination);
    view(4, Float64Array).set(m.rockLayers);
    if (job.keep) view(5, Uint8Array).set(job.keep);
    if (job.areaDepth) view(67, Uint8Array).set(job.areaDepth);
    x.forces_checkpoint(task);
    const error = x.forces_plan(task);
    if (error) throw new Error(FORCE_ERRORS[error] ?? `the Rust forces refused (${error})`);
    return readPlan(job, plain, view) as Extract<RustPlan, { verb: V }>;
  } finally {
    x.forces_free(task);
  }
}

/** Runs a whole job (jobBytes) and returns its packed result (the identity check's, in Node's Wasm). */
export function executeInRust(job: Uint8Array): Uint8Array {
  const x = rustForces();
  const p = x.water_alloc(job.length);
  new Uint8Array(x.memory.buffer, p, job.length).set(job);
  const lenPtr = x.water_alloc(4);
  try {
    const out = x.forces_execute(p, job.length, lenPtr);
    const len = new DataView(x.memory.buffer).getUint32(lenPtr, true);
    const bytes = new Uint8Array(x.memory.buffer, out, len).slice();
    x.water_dealloc(out, len);
    return bytes;
  } finally {
    x.water_dealloc(lenPtr, 4);
    x.water_dealloc(p, job.length);
  }
}

type View = <T>(slot: number, Type: { new (b: ArrayBuffer, at: number, n: number): T }) => T;

const REASONS = ["", "power spent", "destination", "map edge", "lake"];
const EVENTS: ForceHead["event"][] = ["surge", "waterfall", "rapids", "split", "oxbow", "breakthrough", "rock", "" as ForceHead["event"]];
const CARVE_METRICS = ["cut", "deposited", "exported", "suspended", "bankCuts", "bendCuts", "steps", "stable", "distance", "splits", "waterfalls", "rapids", "oxbows"];

function named(a: ArrayLike<number>, names: readonly string[]): Record<string, number> {
  const o: Record<string, number> = {};
  for (let k = 0; k < names.length; k++) o[names[k]] = a[k];
  return o;
}
function carveMetrics(a: ArrayLike<number>) {
  const o: Record<string, unknown> = named(a, CARVE_METRICS);
  o.stable = !!a[7];
  if (a.length === 14) o.reason = REASONS[a[13]];
  return o as unknown as CarveMetrics;
}

/** The plan read out of the module's memory, every array copied. */
function readPlan(job: RustJob, plain: EntitySpec[], view: View): RustPlan {
  const m = job.map;
  // the objects' ids: the map's own by slot, then the ones the force named
  const ids = m.entities.map((e) => e.id);
  {
    const offsets = view(27, Uint32Array);
    const bytes = view(28, Uint8Array);
    const decoder = new TextDecoder();
    while (ids.length < offsets.length - 1) ids.push(decoder.decode(bytes.subarray(offsets[ids.length], offsets[ids.length + 1])));
  }
  const entity = (slot: number, x: number, y: number, z: number, flags: number, strength: number, kind: number): EntitySpec => {
    let e: EntitySpec;
    if (kind) {
      // a source the force placed (1: a carve's, 2: a glacier's, 3: one already as plain JSON)
      const f = (n: number) => (kind === 2 || kind === 3 ? n : F(n));
      e = {
        id: ids[slot],
        owner: kind === 2 ? "glaciate" : "placed",
        x,
        y,
        z,
        orientation: "Cw0",
        flipped: false,
        template: "WaterSource",
        before: { WaterSource: { SpecifiedStrength: f(strength), CurrentStrength: f(strength) } },
        components: { TimeActivatedComponent: { IsEnabled: false, CyclesUntilCountdownActivation: 5, DaysUntilActivation: f(10), DaysPassed: f(0) } },
      };
    } else {
      const original = (flags & 8 ? plain : m.entities)[slot];
      if (!original) throw new Error(`the Rust forces named an object it was not given (${slot})`);
      e = { ...original, x, y, z };
    }
    if (flags & 1) e.components = { ...(e.components ?? {}), LivingNaturalResource: { IsDead: true } };
    if (flags & 2) delete e.raw;
    return e;
  };
  const entityRows = (a: ArrayLike<number>) => {
    const out: EntitySpec[] = [];
    for (let k = 0; k < a.length; k += 7) out.push(entity(a[k], a[k + 1], a[k + 2], a[k + 3], a[k + 4], a[k + 5], a[k + 6]));
    return out;
  };
  const fallenRows = (a: ArrayLike<number>) => {
    const out: Fallen[] = [];
    for (let k = 0; k < a.length; k += 7) {
      const id = ids[a[k]];
      const original = m.fallen.find((f) => f.id === id);
      out.push({ ...structuredClone(original ?? {}), id, x: a[k + 1], y: a[k + 2], z: a[k + 3], dx: a[k + 4], dy: a[k + 5], length: a[k + 6] });
    }
    return out;
  };
  const mapOf = (slots: [number, number, number, number, number, number, number]): RustMap => ({
    ...m,
    heights: view(slots[0], Uint8Array).slice(),
    lava: view(slots[1], Uint32Array).slice(),
    water: { depth: view(slots[2], Float64Array).slice(), contamination: view(slots[3], Float64Array).slice() },
    rockLayers: Array.from(view(slots[4], Float64Array)),
    entities: entityRows(view(slots[5], Float64Array)),
    fallen: fallenRows(view(slots[6], Float64Array)),
  });
  const raw = mapOf([32, 33, 34, 35, 36, 37, 38]);
  // the final map: its objects by slot, in their order
  const finalMap = (): RustMap => {
    const order = view(23, Uint32Array);
    const ox = view(19, Float64Array);
    const oy = view(20, Float64Array);
    const oz = view(21, Float64Array);
    const flags = view(22, Uint32Array);
    const strength = view(29, Float64Array);
    const kind = view(30, Uint8Array);
    const entities = Array.from(order, (i) => entity(i, ox[i], oy[i], oz[i], flags[i], strength[i], kind[i]));
    return {
      ...m,
      heights: view(0, Uint8Array).slice(),
      lava: view(1, Uint32Array).slice(),
      water: { depth: view(2, Float64Array).slice(), contamination: view(3, Float64Array).slice() },
      rockLayers: Array.from(view(4, Float64Array)),
      entities,
      fallen: fallenRows(view(24, Float64Array)),
    };
  };

  const g = view(18, Float64Array).slice();
  let at = 0;
  const n = () => g[at++];
  const point = () => ({ x: n(), y: n() });
  const counted = <T>(count: number, read: () => T): T[] => Array.from({ length: count }, read);
  let plan: RustPlan;
  switch (job.verb) {
    case "deposit": {
      const mouth=point(), direction=point(), reach=n(), width=n(), placement=(["fan","slope","sheet","delta","hollow"] as const)[n()], count=n();
      const branches=counted(count,()=>counted(n(),point));
      const stages=view(25,Uint8Array).slice(); const N=raw.W*raw.H;
      plan={verb:"deposit",raw,mouth,direction,reach,width,placement,branches,arrival:view(10,Float32Array).slice(),channel:view(11,Uint8Array).slice(),channelStages:[0,1,2].map(k=>stages.slice(k*N,(k+1)*N)),stats:named(view(12,Float64Array),["changed","eroded","deposited","balance","maximumCut","maximumDeposit","channels","wet","buried","carried","donorRadius"]) as DepositRecords["stats"]};
      break;
    }
    case "craterize": {
      const anatomy = named(counted(15, n), ["x", "y", "W", "H", "edgeInset", "radius", "a", "b", "angle", "glance", "diameter", "depth", "rim", "datum", "floor"]) as unknown as CraterRecords["anatomy"];
      anatomy.centre = (["auto", "bowl", "peak", "ring", "flat"] as const)[n()];
      const rays = n();
      const strength = n();
      anatomy.rays = counted(rays, () => {
        const r = named(counted(8, n), ["dx", "dy", "start", "length", "width", "bend", "phase", "seed"]) as unknown as CraterRecords["anatomy"]["rays"][number];
        r.pits = counted(n(), () => ({ x: n(), y: n(), r: n() }));
        return r;
      });
      plan = { verb: "craterize", raw, anatomy, strength, stats: named(view(12, Float64Array), ["cut", "raised", "changed", "erased", "flattened"]) as CraterRecords["stats"], keep: view(11, Uint8Array).slice(), arrival: view(10, Float32Array).slice() };
      break;
    }
    case "erupt": {
      const anatomy = { x: n(), y: n(), datum: n(), radius: n(), height: n(), summit: (["auto", "peak", "crater", "caldera"] as const)[n()], phase: n(), length: n(), scale: n(), ceiling: n() } as EruptRecords["anatomy"];
      const vents = n();
      const segments = n();
      const lobes = n();
      const strength = n();
      const asked = n();
      const askedAt = point();
      if (asked) anatomy.asked = askedAt;
      anatomy.vents = counted(vents, point);
      anatomy.segments = counted(segments, () => ({ a: point(), b: point(), length: n(), along: n() }));
      anatomy.lobes = counted(lobes, () => {
        const length = n();
        const strength = n();
        const points = n();
        return { length, strength, points: counted(points, () => ({ ...point(), width: n() })) };
      });
      plan = { verb: "erupt", raw, anatomy, strength, stats: named(view(12, Float64Array), ["raised", "changed", "flattened", "erased", "hard"]) as EruptRecords["stats"], keep: view(11, Uint8Array).slice(), flows: view(10, Float32Array).slice(), heat: view(13, Uint8Array).slice() };
      break;
    }
    case "rift":
    case "quake": {
      const fault = { length: n(), reach: n(), lift: n(), slide: n(), heading: point() } as QuakeRecords["fault"];
      n(); // (its stages: the core's QuakeRun counts them)
      const points = n();
      const segments = n();
      const directions = n();
      fault.points = counted(points, point);
      fault.segments = counted(segments, () => ({ a: point(), b: point(), dx: n(), dy: n(), length: n(), along: n() }));
      fault.directions = counted(directions, point);
      if (job.verb === "rift") {
        plan = { verb: "rift", raw, fault, arrival: view(10, Float32Array).slice(), stats: named(view(12, Float64Array), ["changed", "drop", "held", "stepped", "sheer", "width"]) as RiftRecords["stats"] };
        break;
      }
      plan = {
        verb: "quake",
        raw,
        fault,
        stats: named(view(12, Float64Array), ["changed", "raised", "dropped", "moved", "toppled", "channel", "transported", "fullOffset"]) as QuakeRecords["stats"],
        arrival: view(10, Float32Array).slice(),
        dx: view(13, Int16Array).slice(),
        dy: view(14, Int16Array).slice(),
        source: view(15, Uint32Array).slice(),
      };
      break;
    }
    case "glaciate": {
      n(); // (its steps: the core's GlaciateRun counts them)
      const np = n();
      const nr = n();
      const ns = n();
      const path = counted(np, () => ({ x: n(), y: n(), s: n(), r: n(), floor: n(), outlet: n() }));
      const reference = counted(nr, point);
      const streamPath = counted(ns, point);
      const nt = n();
      const nb = n();
      const nh = n();
      const nj = n();
      const course = n();
      const skip = n();
      const finished: GlaciateRecords["finished"] = { style: ["visits", "bends", "meander", "round 4"][course] + (skip || course === 3 ? "" : ", benches by water"), visits: n(), reached: n(), floods: n(), floodTicks: n() };
      if (course === 3) {
        delete finished.floods;
        delete finished.floodTicks;
      }
      const retained: RetainedWater = { tiles: [], floor: [], depth: [], contamination: [] };
      for (let i = 0; i < nt; i++) {
        (retained.tiles as number[]).push(n());
        (retained.floor as number[]).push(n());
        (retained.depth as number[]).push(n());
        (retained.contamination as number[]).push(n());
      }
      const basins = counted(nb, () => {
        const floor = n();
        const outlet = n();
        const depth = n();
        const fed = !!n();
        const size = n();
        return { floor, outlet, depth, fed, tiles: counted(size, n) };
      });
      const hanging = counted(nh, () => {
        const mouth = n();
        const landing = n();
        const source = n();
        const catchment = n();
        const drop = n();
        const s = n();
        const wet = !!n();
        const joinLength = n();
        const size = n();
        return { mouth, lip: mouth, landing, source: Number.isNaN(source) ? null : source, catchment, drop, s, wet, joinLength, channel: counted(size, n) };
      });
      const joins = counted(nj, () => ({ kind: (["fall", "spill", "inflow"] as const)[n()], from: n(), length: n() }));
      plan = {
        verb: "glaciate",
        raw,
        path,
        reference,
        streamPath,
        retained,
        basins,
        hanging,
        finished,
        joins,
        arrival: view(10, Float32Array).slice(),
        mask: view(11, Uint8Array).slice(),
        floor: view(13, Uint8Array).slice(),
        nearest: view(14, Int32Array).slice(),
        stream: view(15, Uint8Array).slice(),
        fan: view(25, Uint8Array).slice(),
        metrics: named(view(12, Float64Array), ["cut", "deposited", "carriedAway", "treesRemoved", "objectsRemoved", "cleanAbsorbed", "badSwept", "maxPoolJoin", "length", "valleyLength", "centreline", "valley", "outwash", "requestedWidth"]) as unknown as GlaciateRecords["metrics"],
      };
      break;
    }
    case "carve": {
      const total = n();
      const strengthDepth = n();
      const reason = REASONS[n()];
      const removedCount = n();
      const spreadCount = n();
      const groupCount = n();
      const hasClosure = n();
      const no = n();
      const ne = n();
      const nb = n();
      const unleashed = n();
      const badwater = !!n();
      const hasRetained = n();
      const retainedCount = n();
      if (ne !== 0) throw new Error("the Rust forces' retired edge slot must be empty");
      const removedAt = counted(removedCount, () => [ids[n()], n()] as [string, number]);
      const goneSpread = counted(spreadCount, () => [ids[n()], n()] as [string, number]);
      const group = counted(groupCount, () => ({ id: ids[n()], tile: n(), strength: n() }));
      const oxbows = counted(no, () => {
        const start = n();
        const end = n();
        const step = n();
        const floor = n();
        const neckCount = n();
        const poolCount = n();
        const bars = counted(2, () => ({ x: n(), y: n(), dx: n(), dy: n(), width: n(), level: n() })) as CarveRecords["oxbows"][number]["bars"];
        const neck = counted(neckCount, point);
        const pool = counted(poolCount, () => {
          const x = n();
          const y = n();
          const bed = n();
          const width = n();
          const dx = n();
          const dy = n();
          const bend = n();
          const lanes = counted(n(), () => ({ x: n(), y: n(), width: n() }));
          return { x, y, bed, width, dx, dy, bend, lanes };
        });
        return { start, end, step, floor, bars, neck, pool };
      });
      const oxbowBasin = counted(nb, n);
      let retained: RetainedWater | null = null;
      if (hasRetained) {
        retained = { tiles: [], floor: [], depth: [], contamination: [] };
        for (let i = 0; i < retainedCount; i++) {
          (retained.tiles as number[]).push(n());
          (retained.floor as number[]).push(n());
          (retained.depth as number[]).push(n());
          (retained.contamination as number[]).push(n());
        }
      }
      const offsets = (slot: number) => view(slot, Uint32Array).slice();
      const slices = <T>(a: { subarray(s: number, e: number): T }, o: Uint32Array): T[] => Array.from({ length: o.length - 1 }, (_, i) => a.subarray(o[i], o[i + 1]));
      const heads = slices(view(13, Float64Array).slice(), offsets(25)).map((a): ForceHead => {
        const h: ForceHead = { x: a[0], y: a[1], z: a[2], dx: a[3], dy: a[4], width: a[5], event: EVENTS[a[6]], cut: a[7] };
        if (a[8]) h.lanes = Array.from({ length: a[8] }, (_, i) => ({ x: a[9 + i * 3], y: a[10 + i * 3], width: a[11 + i * 3] }));
        return h;
      });
      const path = slices(view(14, Float64Array).slice(), offsets(26)).map((a) => ({ x: a[0], y: a[1], bed: a[2], width: a[3], dx: a[4], dy: a[5], bend: a[6], lanes: Array.from({ length: a[7] }, (_, i) => ({ x: a[8 + i * 3], y: a[9 + i * 3], width: a[10 + i * 3] })) }));
      const stepMetricsAll = view(41, Float64Array).slice();
      const stepMetrics = Array.from({ length: stepMetricsAll.length / 14 }, (_, i) => carveMetrics(stepMetricsAll.subarray(i * 14, i * 14 + 14)));
      const soc = view(54, Float64Array).slice();
      const stepObjectChanges = Array.from({ length: soc.length / 5 }, (_, i) => ({ step: soc[i * 5], id: ids[soc[i * 5 + 1]], x: soc[i * 5 + 2], y: soc[i * 5 + 3], z: soc[i * 5 + 4] }));
      plan = {
        verb: "carve",
        raw,
        map: finalMap(),
        total,
        strengthDepth: Number.isNaN(strengthDepth) ? null : strengthDepth,
        metrics: { ...carveMetrics(view(12, Float64Array)), reason },
        removedAt,
        goneSpread,
        group,
        oxbows,
        oxbowBasin,
        unleashedId: Number.isNaN(unleashed) ? null : ids[unleashed],
        badwater,
        retained,
        closure: hasClosure ? mapOf([46, 47, 48, 49, 50, 51, 52]) : null,
        path,
        heads,
        lengths: view(15, Uint32Array).slice(),
        changes: slices(view(11, Int32Array).slice(), offsets(10)),
        rawChanges: slices(view(40, Int32Array).slice(), offsets(39)),
        stepMetrics,
        stepObjectChanges,
        initialEntities: entityRows(view(45, Float64Array)),
        knobs: Array.from({ length: view(63, Float64Array).length / 3 }, (_, i) => {
          const k = view(63, Float64Array);
          return { x: k[i * 3], y: k[i * 3 + 1], radius: k[i * 3 + 2] };
        }),
        rock: view(64, Uint8Array).slice(),
        sediment: view(65, Uint8Array).slice(),
        curve: (() => {
          const c = view(66, Float64Array);
          if (!c.length) return null;
          const at = (o: number) => Array.from({ length: c.length / 3 }, (_, i) => c[i * 3 + o]);
          return { x: at(0), y: at(1), s: at(2) };
        })(),
      };
      break;
    }
  }
  if (at !== g.length) throw new Error(`the Rust ${job.verb}'s geometry was not all read (${at} of ${g.length})`);
  return plan;
}
