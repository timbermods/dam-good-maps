// The cross-engine determinism cases (PLAN §2.1, §20 D366; adopted from investigation/determinism).
// Every case runs the product's own core and returns full-state checkpoints: SHA-256 of the complete
// terrain, water depth and contamination, objects, fresh rock, fallen trees and the recorded operation
// (generation also hashes its spec, features, stored field and `.timber` bytes). Floating arrays are
// hashed as little-endian binary64, so signed zero and low bits count. `run.ts` runs the same cases in
// Chromium, Firefox, WebKit and Node and compares them checkpoint by checkpoint.

import { runStackFixture, stackFixtures } from "../rust/stack-fixtures";
import { generate } from "../../src/core/gen/generate";
import { makeSpec, THEMES } from "../../src/core/spec/mapspec";
import { applyBrush, BRUSH_TOOLS } from "../../src/core/features/raster/brush";
import { snapshotMap, type ForceMap, type FullForceMap } from "../../src/core/forces/force";
import { geology } from "../../src/core/forces/random";
import { fixture as forceFixture } from "../../tests/contract/forceFixtures";
import { CarvePlay } from "../../src/core/forces/carve/play";
import { CarveRun, DEFAULTS as CARVE } from "../../src/core/forces/carve/run";
import { CraterRun, EruptRun, QuakeRun, modelOf, type StagedRun } from "../../src/core/forces/runs";
import { CRATER_DEFAULTS } from "../../src/core/forces/craterize";
import { ERUPT_DEFAULTS } from "../../src/core/forces/erupt";
import { QUAKE_DEFAULTS, clickFault } from "../../src/core/forces/quake";
import { GlaciateRun } from "../../src/core/forces/glaciate/run";
import { GLACIATE_DEFAULTS } from "../../src/core/forces/glaciate/model";
import { DepositRun, DEPOSIT_DEFAULTS } from "../../src/core/forces/deposit";
import { RiftRun, RIFT_DEFAULTS } from "../../src/core/forces/rift";
import { keptForceParams } from "../../src/core/forces/keep";
import type { ForceRequest } from "../../src/core/forces/start";
import { VERBS } from "../../src/core/forces/op";
import * as nature from "../../src/core/forces/nature";
import { tree, waterSource } from "../../src/core/format/entities";
import { WaterSim } from "../../src/core/sim/water";
import { prefill } from "../../src/core/sim/prefill";
import { HazardRun } from "../../src/core/sim/weather";
import { MapSession } from "../../src/core/doc/session";
import { Rng } from "../../src/core/math/rng";
import { randomOp } from "../../tests/contract/randomOps";

/** A copy of a force's map with its rock beds (derived from its ground when it has none), fresh rock and fallen trees. */
function fullMap(m: ForceMap): FullForceMap {
  const r = snapshotMap(m);
  return { ...r, rockLayers: r.rockLayers ?? geology(r.heights), fallen: r.fallen ?? [], lava: r.lava ?? new Uint32Array(r.W * r.H) };
}

export interface Case {
  id: string;
  kind: "stacked-water" | "generate" | "brush" | "force" | "mixed" | "session" | "placement" | "weather" | "scheduling";
  n: number;
  [k: string]: any;
}
export interface Row {
  label: string;
  hash: string;
  components: Record<string, string>;
  schedule?: { calls: number[]; mapEqual: boolean; recordEqual: boolean; steps: unknown[] };
}

const enc = new TextEncoder();
const generations = new Map<string, ReturnType<typeof generate>>();
let last: Record<string, unknown> = {};

const json = (x: unknown) =>
  JSON.stringify(x, (_k, v) => {
    if (typeof v === "number" && !Number.isFinite(v)) throw Error("nonfinite JSON map/operation field");
    if (ArrayBuffer.isView(v)) return Array.from(v as unknown as ArrayLike<number>);
    return typeof v === "number" && Object.is(v, -0) ? { negativeZero: true } : v;
  });
const sha = async (b: Uint8Array) =>
  Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", b as BufferSource)), (v) => v.toString(16).padStart(2, "0")).join("");
function binary(a: ArrayLike<number>, type: "u8" | "u32" | "f64"): Uint8Array {
  const n = type === "u8" ? 1 : type === "u32" ? 4 : 8;
  const b = new Uint8Array(a.length * n);
  const d = new DataView(b.buffer);
  for (let i = 0; i < a.length; i++) {
    if (!Number.isFinite(a[i])) throw Error(`nonfinite map value at ${i}`);
    if (n === 1) d.setUint8(i, a[i]);
    else if (n === 4) d.setUint32(i * 4, a[i], true);
    else d.setFloat64(i * 8, a[i], true);
  }
  return b;
}
async function digest(m: any, record: unknown = null, extra: Record<string, unknown> = {}) {
  const values: Record<string, any> = {
    dimensions: [m.W, m.H],
    terrain: m.heights,
    water: m.water?.depth ?? m.water,
    contamination: m.water?.contamination ?? m.contamination,
    objects: m.entities,
    lava: m.lava ?? [],
    rock: m.rockLayers ?? [],
    fallen: m.fallen ?? [],
    record,
    ...extra,
  };
  if (m.moisture) values.moisture = m.moisture;
  if (m.soilContamination) values.soilContamination = m.soilContamination;
  last = values;
  const components: Record<string, string> = {};
  for (const [key, value] of Object.entries(values)) {
    const type = key === "terrain" ? "u8" : key === "lava" ? "u32" : ["water", "contamination", "moisture", "soilContamination"].includes(key) ? "f64" : null;
    components[key] = await sha(type && value ? binary(value, type) : enc.encode(json(value ?? null)));
  }
  return { hash: await sha(enc.encode(json(components))), components };
}

/** A fixed test ground: a sloping valley with a channel, trees every four tiles, a clean and a
 *  badwater source. */
function fixture(n: number) {
  const heights = new Uint8Array(n * n);
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const d = Math.abs(x - n * 0.5) + Math.abs(y - n * 0.4);
      heights[y * n + x] = Math.max(2, Math.min(16, 15 - Math.floor(y / 24) - Math.floor(d / 18)));
      if (Math.abs(x - n / 3) < 3) heights[y * n + x] = Math.max(1, 7 - Math.floor(y / 32));
    }
  const entities: any[] = [];
  for (let y = 8; y < n - 8; y += 4)
    for (let x = 8; x < n - 8; x += 4) entities.push(tree({ id: `tree-${x}-${y}`, owner: "fixture", x, y, z: heights[y * n + x], species: "Pine", growth: 0.8 } as any));
  for (const [x, bad] of [[Math.floor(n / 3), false], [Math.floor(n * 0.7), true]] as const)
    entities.push(waterSource({ id: `source-${x}`, owner: "fixture", x, y: 5, z: heights[5 * n + x], strength: 1.5, bad } as any));
  const m = fullMap({ W: n, H: n, heights, entities, maxHeight: 21, water: { depth: new Float64Array(n * n), contamination: new Float64Array(n * n) } } as any);
  m.water = prefill(modelOf(m));
  return m;
}

function brush(n: number, tool: string, strength: number, size: number, k: number) {
  const rng = new Rng(147 + k);
  const dabs: number[] = [];
  let x = Math.floor(n * 0.48) * 4 + 1;
  let y = Math.floor(n * 0.38) * 4 + 3;
  for (let i = 0; i < 48; i++) {
    x += rng.int(-4, 5);
    y += rng.int(-4, 5);
    dabs.push(x, y);
  }
  const target = k % 3 === 1 && ["raise", "lower", "flatten"].includes(tool);
  return { tool, strength, size, seed: 927 + k, ...(!target ? { level: 9 } : {}), dabs, ...(k % 2 ? { shape: "square" } : {}), ...(target ? { target: tool === "lower" ? 3 : 15 } : {}) } as any;
}

const verbs = ["carve", "craterize", "erupt", "quake", "glaciate", "rift", "deposit"];

function force(m: any, verb: string, power: number, size: number | null, seed: number, mode: number, maturity = false) {
  const n = m.W;
  const x = Math.floor(n * 0.48);
  const y = Math.floor(n * 0.38);
  const origin = y * n + x;
  const end = Math.floor(n * 0.82) * n + Math.floor(n * 0.65);
  const path =
    verb === "quake" && mode === 2
      ? clickFault(m.heights, n, n, { x, y }, power, seed)
      : [{ x: x - 22.25, y: y - 8.5 }, { x: x + 2.5, y: y + 3.75 }, { x: x + 27.75, y: y - 6.25 }];
  const ground = { W: n, H: n, heights: m.heights, at: origin };
  let run: StagedRun & { planAll(): unknown };
  let settings: any;
  let intent: any;
  const areaDepth = (verb === "rift" || verb === "deposit") && mode ? new Uint8Array(n*n).fill(2) : null;
  if (verb === "carve") {
    settings = nature.carveNature({ ...CARVE, mode: mode ? "aim" : "unleash", power, width: size === null ? null : Math.min(24, size / 4), seed, dry: mode === 2 } as any, ground);
    intent = { origin, ...(mode ? { end } : {}) };
    if (maturity) {settings={...settings,maturity:"mature"};if(mode)intent={origin:20*n+35,end:52*n+35,via:[24*n+35,36*n+35,48*n+35]};}
    const play = maturity ? new CarvePlay(new CarveRun(m, settings, intent, {sourceId:`carve-source-${seed}`})) : null;
    const carve = play?.run ?? new CarveRun(m, settings, intent, { sourceId: `carve-source-${seed}` });
    for (let i = 0; !carve.done && i < 3000; i++) carve.step();
    if (!carve.done) throw Error("carve exceeded 3000 steps");
    // (its record as the editor keeps it: forces/keep.ts)
    const request = { verb: "carve", settings, origin: maturity ? [intent.origin%n, Math.floor(intent.origin/n)] : [x,y], ...(mode ? { end: maturity ? [intent.end%n,Math.floor(intent.end/n)] : [end % n, Math.floor(end / n)] } : {}), ...(maturity && intent.via ? {via:intent.via.map((v:number)=>[v%n,Math.floor(v/n)])} : {}), cut: null } as ForceRequest;
    const kept = keptForceParams({ before: m, request, carve, staged: null });
    const frames: {stage:number;map:FullForceMap}[]=[];if(play){play.plan();for(const stage of [1,Math.floor(play.total/2),play.total]){play.showTo(stage);frames.push({stage,map:fullMap(snapshotMap(play.map))});}}
    return { map: fullMap(carve.map as any), record: kept.ok ? kept.params : null, frames };
  }
  if (verb === "craterize") {
    settings = nature.craterNature({ ...CRATER_DEFAULTS, mode: mode ? "aim" : "strike", power, size, seed, rays: true } as any, ground);
    intent = { origin, ...(mode ? { end } : {}) };
    run = new CraterRun(m, settings, intent);
  } else if (verb === "erupt") {
    settings = nature.eruptNature({ ...ERUPT_DEFAULTS, mode: mode ? "fissure" : "vent", power, size, seed } as any, ground);
    intent = { origin, ...(mode ? { path } : {}) };
    run = new EruptRun(m, settings, intent);
  } else if (verb === "deposit") {
    settings = { ...DEPOSIT_DEFAULTS, power, size, seed };
    intent = { path: mode ? path : [{ x, y }] };
    run = new DepositRun(m, settings, intent, null, areaDepth);
  } else if (verb === "rift") {
    settings = { ...RIFT_DEFAULTS, power, size, seed };
    intent = { path: mode ? path : [{ x, y }] };
    run = new RiftRun(m, settings, intent, null, areaDepth);
  } else if (verb === "quake") {
    settings = nature.quakeNature({ ...QUAKE_DEFAULTS, mode: mode ? "slide" : "lift", power, seed } as any, ground);
    intent = { path, side: seed % 2 ? 1 : -1 };
    run = new QuakeRun(m, settings, intent);
  } else {
    settings = nature.glaciateNature({ ...GLACIATE_DEFAULTS, mode: mode ? "aim" : "flow", power, size: size === null ? null : Math.min(64, size), seed } as any, ground);
    intent = { origin, ...(mode ? { end } : {}) };
    run = new GlaciateRun(m, settings, intent) as any;
  }
  run.planAll();
  const frames: { stage: number; map: FullForceMap }[] = [];
  if (verb === "rift" || verb === "deposit") {
    while (!run.done) { run.step(); if ([1, Math.floor(run.total/2), run.total].includes(run.shown)) frames.push({ stage: run.shown, map: snapshotMap(run.map) }); }
  }
  // (its record as the editor keeps it, from the request it would have sent: forces/keep.ts)
  const request = (
    (verb === "quake" || verb === "rift" || verb === "deposit")
      ? { verb, settings, path: intent.path, ...(verb === "quake" ? {side: intent.side} : {}), cut: null }
      : { verb, settings, origin: [x, y], ...(intent.end ? { end: [end % n, Math.floor(end / n)] } : {}), ...(intent.path ? { path } : {}), cut: null }
  ) as ForceRequest;
  const kept = keptForceParams({ before: m, request, carve: null, staged: run });
  return { map: run.final(), record: kept.ok ? kept.params : null, frames };
}

function water(m: any, ticks = 24) {
  const sim = new WaterSim(modelOf(m), m.water).run(ticks);
  m.water = { depth: sim.D.slice(), contamination: sim.C.slice() };
  return sim.out;
}

/** The case list. The short list (`smoke`, every push, about 7 minutes on a desktop) keeps every theme,
 *  brush and force setting at 128², with one generation seed and short sequences; at 256², Any, each
 *  force at Power 55 (a click and a drag), short mixed and placement sequences and the weather. The
 *  full list (nightly) runs every setting at both sizes, three seeds and long sequences. */
export function cases(smoke = false): Case[] {
  if ([...VERBS].sort().join(",") !== [...verbs].sort().join(",")) throw Error("Update the determinism cases for the current force list");
  const out: Case[] = ["cave-valley", "lake-cave"].map(name => ({ id: `stacked-water/${name}`, kind: "stacked-water", n: 0, name }));
  for (const n of [128, 256]) {
    const grid = !smoke || n === 128;
    for (const theme of grid ? THEMES : ["any"]) for (const seed of smoke ? [1] : [1, 37, 20260930]) out.push({ id: `generate/${n}/${theme}/${seed}`, kind: "generate", n, theme, seed });
    if (grid) for (const tool of BRUSH_TOOLS) for (const strength of [1, 5, 10]) for (const size of [0.5, 6.25, 24]) out.push({ id: `brush/${n}/${tool}/${strength}/${size}`, kind: "brush", n, tool, strength, size });
    for (const verb of verbs.filter(v => v !== "rift" && v !== "deposit"))
      for (const power of grid ? [10, 55, 100] : [55])
        for (const size of grid ? [null, 12, 48] : [null]) for (const mode of [0, 1]) out.push({ id: `force/${n}/${verb}/${power}/${size}/${mode}`, kind: "force", n, verb, power, size, mode });
    out.push({ id: `mixed/${n}`, kind: "mixed", n, count: smoke ? (n === 128 ? 12 : 6) : 120 });
    out.push({ id: `session/${n}`, kind: "session", n, count: smoke ? 8 : 80 });
  }
  for (const n of [128, 256]) {
    const grid = !smoke || n === 128;
    if (grid) for (const tool of BRUSH_TOOLS) for (const variant of [1, 2]) out.push({ id: `variants/${n}/${tool}/${variant}`, kind: "brush", n, tool, strength: 5, size: 6.25, variant });
    for (const verb of ["carve", "quake"]) for (const power of grid ? [10, 55, 100] : [55]) out.push({ id: `gesture/${n}/${verb}/${power}`, kind: "force", n, verb, power, size: null, mode: 2 });
    out.push({ id: `placement/${n}`, kind: "placement", n, count: smoke ? (n === 128 ? 24 : 8) : 120 });
    out.push({ id: `weather/${n}`, kind: "weather", n, count: 90 });
    out.push({ id: `scheduling/${n}`, kind: "scheduling", n });
    for (const reserve of ["scarce", "plenty"]) if (grid) out.push({ id: `reserve/${n}/${reserve}`, kind: "generate", n, theme: "riverValley", seed: 37, reserve });
  }
  for (const verb of ["rift", "deposit"]) for (const power of [0, 100]) for (const mode of [0, 1]) out.push({ id: `force/64/${verb}/${power}/${mode}`, kind: "force", n: 64, verb, power, size: 22, mode });
  for (const power of [0,100]) for (const mode of [0,1]) out.push({id:`force/maturity/64/${power}/${mode}`,kind:"force",n:64,verb:"carve",power,size:24,mode});
  return out;
}

/** One case's checkpoints. */
export async function runCase(c: Case, progress: (s: string) => void = () => {}): Promise<Row[]> {
  const rows: Row[] = [];
  if (c.kind === "stacked-water") {
    const f = stackFixtures.find(f => f.name === c.name);
    if (!f) throw Error("Water fixture is unknown.");
    const r = runStackFixture(f);
    const components: Record<string,string> = { info: await sha(binary(r.info, "f64")) };
    for (const [id, bytes] of r.fields.entries()) components["field"+id] = await sha(bytes);
    for (const [id, expected] of Object.entries(f.fields)) if (components["field"+id] !== expected) throw Error(f.name+" differs from #71 field "+id);
    return [{ label: c.id, hash: await sha(enc.encode(json(components))), components }];
  }
  const add = async (label: string, m: any, record?: any, extra?: any) => void rows.push({ label, ...(await digest(m, record, extra)) });
  if (c.kind === "scheduling") {
    // a force's record must not depend on how fast it was planned (D366): the same run under a
    // clock that never moves and one that jumps 100 ms a call
    const m = fixture(c.n);
    const settings = { ...CRATER_DEFAULTS, power: 55, size: 48, seed: 701 } as any;
    const origin = Math.floor(c.n * 0.38) * c.n + Math.floor(c.n * 0.48);
    const records: unknown[] = [];
    const maps: string[] = [];
    const calls: number[] = [];
    const original = Object.getOwnPropertyDescriptor(performance, "now");
    try {
      for (const slow of [false, true]) {
        let clock = 0;
        Object.defineProperty(performance, "now", { configurable: true, value: () => (clock += slow ? 100 : 0) });
        const run = new CraterRun(m, settings, { origin } as any);
        while (!run.done) run.step();
        const after = run.final()!;
        const kept = keptForceParams({ before: m, request: { verb: "craterize", settings, origin: [origin % c.n, Math.floor(origin / c.n)], cut: null }, carve: null, staged: run });
        const record = kept.ok ? kept.params : null;
        maps.push((await digest(after)).hash);
        records.push(record);
        calls.push(run.steps);
        await add(`${c.id}/${slow ? "slow" : "fast"}`, after, record);
      }
    } finally {
      if (original) Object.defineProperty(performance, "now", original);
      else delete (performance as any).now;
    }
    if (maps[0] !== maps[1]) throw Error("the planning schedule changes the final map");
    rows[0].schedule = { calls, mapEqual: maps[0] === maps[1], recordEqual: json(records[0]) === json(records[1]), steps: records.map((r: any) => r?.steps) };
  } else if (c.kind === "weather") {
    const m = fixture(c.n);
    // (the editor's badtide, core/sim/weather.ts `HazardRun`, a day of 60 ticks)
    const run = new HazardRun(modelOf(m), m.water, "badtide", 1.5, 60);
    const sim = run.sim;
    for (let k = 0; k < c.count; k++) {
      const contamination = run.step(1)!;
      m.water = { depth: sim.D.slice(), contamination: sim.C.slice() };
      await add(`${c.id}/${k}`, m, { contamination }, { momentum: await sha(binary(sim.out, "f64")) });
    }
  } else if (c.kind === "generate") {
    const spec = makeSpec({ seed: c.seed, theme: c.theme, size: { x: c.n, y: c.n } });
    if (c.reserve) spec.settings.water.droughtReserve = c.reserve;
    const r = generate(spec);
    generations.set(`${c.n}/${c.theme}/${c.seed}`, r);
    await add(c.id, r.built, { spec: r.spec, features: r.features, field: r.field, attempts: r.attempts, failures: r.failures }, { timber: await sha(r.bytes), passed: r.report.passed });
  } else if (c.kind === "session" || c.kind === "placement") {
    const r = generations.get(`${c.n}/any/1`) ?? generate(makeSpec({ seed: 1, theme: "any", size: { x: c.n, y: c.n } }));
    const s = MapSession.fromGenerated(r);
    const rng = new Rng(63200 + c.n);
    for (let k = 0; k < c.count; k++) {
      const p = brush(c.n, BRUSH_TOOLS[k % 5], [1, 5, 10][k % 3], [2.5, 6.25, 18][k % 3], k);
      const op = c.kind === "placement" ? randomOp(s, rng) : { op: "brush", params: p };
      const result = op ? s.apply(op as any) : { ok: false, errors: ["no target"] };
      if (c.kind === "session" && !result.ok) throw Error(json(result.errors));
      await add(`${c.id}/${k}`, s.built, { op, accepted: result.ok, errors: result.errors });
      if (k % 10 === 9) progress(`${c.id}: ${k + 1}/${c.count}`);
      if (k % 20 === 19) {
        s.undo();
        await add(`${c.id}/${k}/undo`, s.built);
        s.redo();
        await add(`${c.id}/${k}/redo`, s.built);
      }
    }
    const opened = MapSession.open(s.document);
    await add(`${c.id}/reopen`, opened.built, null, { project: await sha(enc.encode(json(s.document))) });
    if ((await digest(s.built)).hash !== (await digest(opened.built)).hash) throw Error("the session reopens differently");
  } else {
    let m: any = c.id.includes("/maturity/") ? forceFixture(c.mode?"river":"plain",c.n) : fixture(c.n);
    const steps = c.kind === "mixed" ? c.count : 1;
    for (let k = 0; k < steps; k++) {
      let record: any;
      if (c.kind === "brush" || (c.kind === "mixed" && k % 3 !== 2)) {
        record = brush(c.n, c.tool ?? BRUSH_TOOLS[k % 5], c.strength ?? [1, 5, 10][k % 3], c.size ?? [2.5, 6.25, 18][k % 3], c.variant ?? k);
        applyBrush(record, m.heights, c.n, c.n);
      } else {
        try {
          const f = force(m, c.verb ?? verbs[Math.floor(k / 3) % 5], c.power ?? [10, 55, 100][Math.floor(k / 3) % 3], c.kind === "mixed" ? [null, 12, 48][Math.floor(k / 3) % 3] : c.size, 701 + k, c.mode ?? k % 2, c.id.includes("/maturity/"));
          m = f.map;
          record = f.record;
          if ("frames" in f && f.frames) for (const frame of f.frames) await add(`${c.id}/${k}/playback/${frame.stage}`, frame.map, record);
        } catch (e) {
          if (c.kind !== "mixed" || !String((e as Error).message).includes("uphill")) throw e;
          record = { rejected: (e as Error).message, seed: 701 + k };
        }
      }
      await add(`${c.id}/${k}/plan`, m, record);
      const momentum = water(m);
      await add(`${c.id}/${k}/water`, m, record, { momentum: await sha(binary(momentum, "f64")) });
    }
  }
  return rows;
}

/** The last checkpoint's raw values, to see what differs. */
export function dump() {
  return Object.fromEntries(Object.entries(last).map(([k, v]) => [k, ArrayBuffer.isView(v) ? Array.from(v as unknown as ArrayLike<number>) : v]));
}
