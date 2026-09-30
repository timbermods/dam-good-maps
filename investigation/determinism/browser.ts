import { generate } from '../../src/core/gen/generate';
import { makeSpec, THEMES } from '../../src/core/spec/mapspec';
import { applyBrush, BRUSH_TOOLS } from '../../src/core/features/raster/brush';
import { fullMap, snapshotMap } from '../../src/core/forces/force';
import { CarveRun, DEFAULTS as CARVE } from '../../src/core/forces/carve/run';
import { carveParams } from '../../src/core/forces/carve/result';
import { CraterRun, EruptRun, QuakeRun, modelOf } from '../../src/core/forces/runs';
import { CRATER_DEFAULTS } from '../../src/core/forces/craterize';
import { ERUPT_DEFAULTS } from '../../src/core/forces/erupt';
import { QUAKE_DEFAULTS } from '../../src/core/forces/quake';
import { GlaciateRun } from '../../src/core/forces/glaciate/run';
import { GLACIATE_DEFAULTS } from '../../src/core/forces/glaciate/model';
import { forceParamsOf, pathRecord } from '../../src/core/forces/result';
import { forceMapOf } from '../../src/core/forces/carve/result';
import { tree, waterSource } from '../../src/core/format/entities';
import { WaterSim } from '../../src/core/sim/water';
import { prefill } from '../../src/core/sim/prefill';
import { MapSession } from '../../src/core/doc/session';
import { Rng } from '../../src/core/math/rng';
import * as nature from '../../src/core/forces/nature';
import { randomOp } from '../../tests/contract/randomOps';
import { clickFault } from '../../src/core/forces/quake';
import { badtideContamination } from '../../src/core/sim/weather';
// This policy is extracted from the actual worker forceParamsOf call, including the adoption diff.
import { recordSteps } from 'record-policy';
import { VERBS } from '../../src/core/forces/op';

const enc = new TextEncoder();
const generations = new Map<string, ReturnType<typeof generate>>();
let last: Record<string, unknown> = {};
let stopLabel: string | null = null;
const json = (x: unknown) => JSON.stringify(x, (_k, v) => {
  if (typeof v === 'number' && !Number.isFinite(v)) throw Error('nonfinite JSON map/operation field');
  return typeof v === 'number' && Object.is(v, -0) ? { negativeZero: true } : v;
});
const sha = async (b: Uint8Array) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', b as BufferSource)), v => v.toString(16).padStart(2, '0')).join('');
function binary(a: ArrayLike<number>, type: 'u8' | 'u32' | 'f64'): Uint8Array {
  const n = type === 'u8' ? 1 : type === 'u32' ? 4 : 8;
  const b = new Uint8Array(a.length * n), d = new DataView(b.buffer);
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
    dimensions: [m.W, m.H], terrain: m.heights, water: m.water?.depth ?? m.water,
    contamination: m.water?.contamination ?? m.contamination,
    objects: m.entities, lava: m.lava ?? [], rock: m.rockLayers ?? [], fallen: m.fallen ?? [], record, ...extra,
  };
  if (m.moisture) values.moisture = m.moisture;
  if (m.soilContamination) values.soilContamination = m.soilContamination;
  last = values;
  const components: Record<string, string> = {};
  for (const [key, value] of Object.entries(values)) {
    const type = key === 'terrain' ? 'u8' : key === 'lava' ? 'u32' : ['water', 'contamination', 'moisture', 'soilContamination'].includes(key) ? 'f64' : null;
    components[key] = await sha(type ? binary(value, type) : enc.encode(json(value)));
  }
  return { hash: await sha(enc.encode(json(components))), components };
}
function fixture(n: number) {
  const heights = new Uint8Array(n * n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const d = Math.abs(x - n * 0.5) + Math.abs(y - n * 0.4);
    heights[y * n + x] = Math.max(2, Math.min(16, 15 - Math.floor(y / 24) - Math.floor(d / 18)));
    if (Math.abs(x - n / 3) < 3) heights[y * n + x] = Math.max(1, 7 - Math.floor(y / 32));
  }
  const entities: any[] = [];
  for (let y = 8; y < n - 8; y += 4) for (let x = 8; x < n - 8; x += 4)
    entities.push(tree({ id: `tree-${x}-${y}`, owner: 'fixture', x, y, z: heights[y * n + x], species: 'Pine', growth: 0.8 }));
  for (const [x, bad] of [[Math.floor(n / 3), false], [Math.floor(n * .7), true]] as const)
    entities.push(waterSource({ id: `source-${x}`, owner: 'fixture', x, y: 5, z: heights[5 * n + x], strength: 1.5, bad }));
  const m = fullMap({ W: n, H: n, heights, entities, maxHeight: 21, water: { depth: new Float64Array(n * n), contamination: new Float64Array(n * n) } });
  m.water = prefill(modelOf(m));
  return m;
}
function brush(n: number, tool: string, strength: number, size: number, k: number) {
  const rng = new Rng(147 + k), dabs: number[] = [];
  let x = Math.floor(n * .48) * 4 + 1, y = Math.floor(n * .38) * 4 + 3;
  for (let i = 0; i < 48; i++) { x += rng.int(-4, 5); y += rng.int(-4, 5); dabs.push(x, y); }
  const target = k % 3 === 1 && ['raise', 'lower', 'flatten'].includes(tool);
  return { tool, strength, size, seed: 927 + k, ...(!target ? { level: 9 } : {}), dabs, ...(k % 2 ? { shape: 'square' } : {}), ...(target ? { target: tool === 'lower' ? 3 : 15 } : {}) } as any;
}
function force(m: any, verb: string, power: number, size: number | null, seed: number, mode: number) {
  const n = m.W, x = Math.floor(n * .48), y = Math.floor(n * .38), origin = y * n + x, end = Math.floor(n * .82) * n + Math.floor(n * .65);
  const path = verb === 'quake' && mode === 2 ? clickFault(m.heights, n, n, { x, y }, power, seed) : [{ x: x - 22.25, y: y - 8.5 }, { x: x + 2.5, y: y + 3.75 }, { x: x + 27.75, y: y - 6.25 }];
  const ground = { W: n, H: n, heights: m.heights, at: origin };
  let run: any, settings: any, intent: any;
  if (verb === 'carve') {
    settings = nature.carveNature({ ...CARVE, mode: mode ? 'aim' : 'unleash', power, width: size === null ? null : Math.min(24, size / 4), seed, dry: mode === 2 }, ground);
    intent = { origin, ...(mode ? { end } : {}) };
    run = new CarveRun(m, settings, intent, { sourceId: `carve-source-${seed}` });
    for (let i = 0; !run.done && i < 3000; i++) run.step();
    if (!run.done) throw Error('carve exceeded 3000 steps');
    return { map: fullMap(run.map), record: carveParams(m, run, { settings, origin: [x, y], ...(mode ? { end: [end % n, Math.floor(end / n)] as [number, number] } : {}), cut: null }) };
  }
  if (verb === 'craterize') {
    settings = nature.craterNature({ ...CRATER_DEFAULTS, mode: mode ? 'aim' : 'strike', power, size, seed, rays: true }, ground);
    intent = { origin, ...(mode ? { end } : {}) }; run = new CraterRun(m, settings, intent);
  } else if (verb === 'erupt') {
    settings = nature.eruptNature({ ...ERUPT_DEFAULTS, mode: mode ? 'fissure' : 'vent', power, size, seed }, ground);
    intent = { origin, ...(mode ? { path } : {}) }; run = new EruptRun(m, settings, intent);
  } else if (verb === 'quake') {
    settings = nature.quakeNature({ ...QUAKE_DEFAULTS, mode: mode ? 'slide' : 'lift', power, seed }, ground);
    intent = { path, side: seed % 2 ? 1 : -1 }; run = new QuakeRun(m, settings, intent);
  } else {
    settings = nature.glaciateNature({ ...GLACIATE_DEFAULTS, mode: mode ? 'aim' : 'flow', power, size: size === null ? null : Math.min(64, size), seed }, ground);
    intent = { origin, ...(mode ? { end } : {}) }; run = new GlaciateRun(m, settings, intent);
  }
  run.planAll();
  const after = run.final();
  const where = verb === 'quake' ? { path: pathRecord(path), side: intent.side } : { origin: [x, y], ...(intent.end ? { end: [end % n, Math.floor(end / n)] } : {}), ...(intent.path ? { path: pathRecord(path) } : {}) };
  return { map: after, record: forceParamsOf(m, after, { verb: verb as any, settings, where: where as any, cut: null, steps: 1, reason: 'done' }) };
}
function water(m: any, ticks = 24) { const sim = new WaterSim(modelOf(m), m.water).run(ticks); m.water = { depth: sim.D.slice(), contamination: sim.C.slice() }; return sim.out; }
const verbs = ['carve', 'craterize', 'erupt', 'quake', 'glaciate'];
if ([...VERBS].sort().join(',') !== [...verbs].sort().join(',')) throw Error('Update determinism fixtures for the current force list');
export function cases(smoke = false, extraOnly = false) {
  const out: any[] = [];
  for (const n of [128, 256]) {
    for (const theme of THEMES) for (const seed of smoke ? [1] : [1, 37, 20260930]) out.push({ id: `generate/${n}/${theme}/${seed}`, kind: 'generate', n, theme, seed });
    for (const tool of BRUSH_TOOLS) for (const strength of [1, 5, 10]) for (const size of [0.5, 6.25, 24]) out.push({ id: `brush/${n}/${tool}/${strength}/${size}`, kind: 'brush', n, tool, strength, size });
    for (const verb of verbs) for (const power of [10, 55, 100]) for (const size of [null, 12, 48]) for (const mode of [0, 1]) out.push({ id: `force/${n}/${verb}/${power}/${size}/${mode}`, kind: 'force', n, verb, power, size, mode });
    out.push({ id: `mixed/${n}`, kind: 'mixed', n, count: smoke ? 12 : 120 });
    out.push({ id: `session/${n}`, kind: 'session', n, count: smoke ? 8 : 80 });
  }
  const extras: any[] = [];
  for (const n of [128, 256]) {
    for (const tool of BRUSH_TOOLS) for (const variant of [1, 2]) extras.push({ id: `variants/${n}/${tool}/${variant}`, kind: 'brush', n, tool, strength: 5, size: 6.25, variant });
    for (const verb of ['carve', 'quake']) for (const power of [10, 55, 100]) extras.push({ id: `gesture/${n}/${verb}/${power}`, kind: 'force', n, verb, power, size: null, mode: 2 });
    extras.push({ id: `placement/${n}`, kind: 'placement', n, count: smoke ? 24 : 120 });
    extras.push({ id: `weather/${n}`, kind: 'weather', n, count: 90 });
    extras.push({ id: `scheduling/${n}`, kind: 'scheduling', n });
    for (const reserve of ['scarce', 'plenty']) extras.push({ id: `reserve/${n}/${reserve}`, kind: 'generate', n, theme: 'riverValley', seed: 37, reserve });
  }
  return extraOnly ? extras : [...out, ...extras];
}
export async function runCase(c: any) {
  const rows: any[] = [];
  async function add(label: string, m: any, record?: any, extra?: any) { rows.push({ label, ...await digest(m, record, extra) }); if (label === stopLabel) throw Error('checkpoint captured'); }
  if (c.kind === 'scheduling') {
    const m = fixture(c.n), settings = { ...CRATER_DEFAULTS, power: 55, size: 48, seed: 701 };
    const origin = Math.floor(c.n * .38) * c.n + Math.floor(c.n * .48);
    const records: any[] = [], maps: string[] = [], calls: number[] = [];
    const original = Object.getOwnPropertyDescriptor(performance, 'now');
    try {
      for (const slow of [false, true]) {
        let clock = 0;
        Object.defineProperty(performance, 'now', { configurable: true, value: () => { clock += slow ? 100 : 0; return clock; } });
        const run = new CraterRun(m, settings, { origin });
        while (!run.done) run.step();
        const after = run.final()!, record = forceParamsOf(m, after, { verb: 'craterize', settings, where: { origin: [origin % c.n, Math.floor(origin / c.n)] }, cut: null, steps: recordSteps(run), reason: 'done' });
        maps.push((await digest(after)).hash); records.push(record); calls.push(run.steps);
        await add(`${c.id}/${slow ? 'slow' : 'fast'}`, after, record);
      }
      if (maps[0] !== maps[1]) throw Error('planning schedule changes final map');
      // Report this separately from cross-engine mismatches: it reproduces even in one engine.
      rows[0].schedule = { calls, mapEqual: maps[0] === maps[1], recordEqual: json(records[0]) === json(records[1]), steps: records.map(r => r?.steps) };
    } finally { if (original) Object.defineProperty(performance, 'now', original); else delete (performance as any).now; }
  } else if (c.kind === 'weather') {
    const m = fixture(c.n), model = modelOf(m), sim = new WaterSim(model, m.water);
    const cleanEmitters = model.emitters.filter(e => e.contamination === 0);
    for (let k = 0; k < c.count; k++) {
      const contamination = badtideContamination(k / 60, 1.5);
      for (const emitter of cleanEmitters) emitter.contamination = contamination;
      sim.run(1); m.water = { depth: sim.D.slice(), contamination: sim.C.slice() };
      await add(`${c.id}/${k}`, m, { contamination }, { momentum: await sha(binary(sim.out, 'f64')) });
    }
  } else if (c.kind === 'generate') {
    const spec = makeSpec({ seed: c.seed, theme: c.theme, size: { x: c.n, y: c.n } });
    if (c.reserve) spec.settings.water.droughtReserve = c.reserve;
    const r = generate(spec);
    generations.set(`${c.n}/${c.theme}/${c.seed}`, r);
    await add(c.id, r.built, { spec: r.spec, features: r.features, field: r.field, attempts: r.attempts, failures: r.failures }, { timber: await sha(r.bytes), passed: r.report.passed });
  } else if (c.kind === 'session' || c.kind === 'placement') {
    const r = generations.get(`${c.n}/any/1`) ?? generate(makeSpec({ seed: 1, theme: 'any', size: { x: c.n, y: c.n } }));
    const s = MapSession.fromGenerated(r);
    const rng = new Rng(63200 + c.n);
    for (let k = 0; k < c.count; k++) {
      const p = brush(c.n, BRUSH_TOOLS[k % 5], [1, 5, 10][k % 3], [2.5, 6.25, 18][k % 3], k);
      const op = c.kind === 'placement' ? randomOp(s, rng) : { op: 'brush', params: p };
      const result = op ? s.apply(op as any) : { ok: false, errors: ['no target'] };
      if (c.kind === 'session' && !result.ok) throw Error(json(result.errors));
      await add(`${c.id}/${k}`, s.built, { op, accepted: result.ok, errors: result.errors });
      if (k % 10 === 9) console.info(`DETERMINISM_PROGRESS ${c.id}: ${k + 1}/${c.count}`);
      if (k % 20 === 19) { s.undo(); await add(`${c.id}/${k}/undo`, s.built); s.redo(); await add(`${c.id}/${k}/redo`, s.built); }
    }
    const opened = MapSession.open(s.document); await add(`${c.id}/reopen`, opened.built, null, { project: await sha(enc.encode(json(s.document))) });
    if ((await digest(s.built)).hash !== (await digest(opened.built)).hash) throw Error('session reopen differs');
  } else {
    let m = fixture(c.n);
    const steps = c.kind === 'mixed' ? c.count : 1;
    for (let k = 0; k < steps; k++) {
      let record: any;
      if (c.kind === 'brush' || c.kind === 'mixed' && k % 3 !== 2) {
        record = brush(c.n, c.tool ?? BRUSH_TOOLS[k % 5], c.strength ?? [1, 5, 10][k % 3], c.size ?? [2.5, 6.25, 18][k % 3], c.variant ?? k);
        applyBrush(record, m.heights, c.n, c.n);
      } else {
        try {
          const f = force(m, c.verb ?? verbs[Math.floor(k / 3) % 5], c.power ?? [10, 55, 100][Math.floor(k / 3) % 3], c.kind === 'mixed' ? [null, 12, 48][Math.floor(k / 3) % 3] : c.size, 701 + k, c.mode ?? k % 2);
          m = f.map; record = f.record;
        } catch (e) {
          if (c.kind !== 'mixed' || !String((e as Error).message).includes('uphill')) throw e;
          record = { rejected: (e as Error).message, seed: 701 + k };
        }
      }
      await add(`${c.id}/${k}/plan`, m, record);
      const momentum = water(m); await add(`${c.id}/${k}/water`, m, record, { momentum: await sha(binary(momentum, 'f64')) });
    }
  }
  return rows;
}
export function dump() { return Object.fromEntries(Object.entries(last).map(([k, v]) => [k, ArrayBuffer.isView(v) ? Array.from(v as any) : v])); }
export async function diagnose(c: any, label: string) {
  stopLabel = label;
  try { await runCase(c); throw Error('checkpoint was not reached'); }
  catch (e) { if ((e as Error).message !== 'checkpoint captured') throw e; return dump(); }
  finally { stopLabel = null; }
}
Object.assign(window, { determinism: { cases, runCase, dump, diagnose } });
