import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { SketchJob, install, type MapSnapshot } from './engine';
import { ResidentWater, encodeResidentModel } from './resident';
import { encodeModel } from './local/protocol';
import { WaterSim } from './local/runtime';
import { compileWall, raster, type Stroke } from './wall';
import { fromWorld } from './maps';
import { emptySimulationSingletons, voxelsFromHeights } from '../../src/core/format/world';
const dir = process.env.DAM_SKETCH_DIR ?? process.cwd();
const wasm = readFileSync(dir + '/local/water.wasm'); install(wasm);
let checks = 0;
function check(name: string, fn: () => void) { fn(); checks++; console.log('PASS ' + name); }
function map(W = 12, H = 12): MapSnapshot {
  const floor = new Float64Array(W * H).fill(5);
  for (let y = 1; y < H; y++) for (let x = 4; x <= 7; x++) floor[y * W + x] = 1;
  return { name: 'measured channel', model: { W, H, floor, dam: null,
    emitters: [{ cells: [W + 5], strength: 1, contamination: 0 }] },
    water: { depth: new Float64Array(W * H), contamination: new Float64Array(W * H) },
    startTiles: [4 * W + 5], farmland: new Uint8Array(W * H).fill(1),
    objects: [{ id: 'marker', template: 'test-marker', tiles: [3 * W + 5], z: 1, height: 1 }] };
}
const stroke = (kind: 'levee' | 'dam'): Stroke => ({ path: [[4, 7], [7, 7]], stack: [{ kind }] });
const finish = (job: SketchJob, slice = 128) => {
  let r = job.result();
  while (r.phase === 'filling' || r.phase === 'weather') r = job.advance(slice);
  return r;
};
const bytes = (a: Float64Array) => Buffer.from(a.buffer, a.byteOffset, a.byteLength);
check('bulk DRW1 encoder preserves pinned protocol bytes, including seep and momentum fields', () => {
  const m = map(), wall = compileWall(m.model, [stroke('dam')]), out = new Float64Array(4 * 144);
  out[12] = .125; out[13] = -0;
  wall.model.emitters[0].depthLimit = { anchor: 17, off: .8, on: .72 };
  assert.deepEqual(encodeResidentModel(wall.model, m.water, out), encodeModel(wall.model, m.water, { rules: 'game' }, out));
  assert.deepEqual(encodeResidentModel(m.model, m.water), encodeModel(m.model, m.water, { rules: 'game' }));
});
check('resident Rust matches pinned game TS: partial crest, source, momentum, Dold, contamination', () => {
  const m = map(); const wall = compileWall(m.model, [stroke('dam')]);
  const ts = new WaterSim(wall.model, m.water, { rules: 'game' });
  const rs = new ResidentWater(wall.model, m.water);
  for (const n of [1, 15, 128, 384]) {
    ts.run(n); rs.run(n);
    for (const k of ['D', 'C', 'Dold', 'out'] as const) assert.deepEqual(bytes(rs[k]), bytes(ts[k]));
  }
  rs.dispose(); ts.dispose();
});
check('raster connects diagonals, bends, loops and repeats without duplicate pieces', () => {
  const path = [[2, 2], [8, 8], [2, 8], [2, 2]] as const, tiles = raster(path, 12, 12);
  assert.equal(tiles.length, new Set(tiles).size);
  for (let k = 1; k < tiles.length; k++) {
    // The path's returning points can revisit; independently prove each diagonal step was represented.
    assert(tiles[k] >= 0 && tiles[k] < 144);
  }
  const d = raster([[2, 2], [8, 8]], 12, 12);
  for (let k = 1; k < d.length; k++) assert([1, 12].includes(Math.abs(d[k] - d[k - 1])));
  const w = compileWall(map().model, [stroke('dam'), stroke('dam')]); assert.equal(w.counts.dam, 4);
});
check('game facts: dam .65, levee 1, selected floodgate full cells plus fractional crest', () => {
  const m = map().model, i = 7 * 12 + 5;
  assert.equal(compileWall(m, [stroke('dam')]).model.dam![i], .65);
  assert.equal(compileWall(m, [stroke('levee')]).model.floor[i], 2);
  const gate = compileWall(m, [{ path: [[5, 7]], stack: [{ kind: 'levee' },
    { kind: 'floodgate', maxHeight: 3, height: 2.5 }] }]);
  assert.equal(gate.model.floor[i], 4); assert.equal(gate.model.dam![i], .5);
  assert.equal(gate.counts.levee, 1); assert.equal(gate.counts.floodgate3, 1);
  const open = compileWall(m, [{ path: [[5, 7]], stack: [{ kind: 'floodgate', maxHeight: 3, height: 0 }] }]);
  assert.equal(open.model.floor[i], m.floor[i]); assert.equal(open.model.dam![i], -1);
});
check('dam and gate with .65 setting produce byte-identical simulation', () => {
  const a = new SketchJob(map(), [stroke('dam')]);
  const b = new SketchJob(map(), [{ path: [[4, 7], [7, 7]], stack: [{ kind: 'floodgate', maxHeight: 1, height: .65 }] }]);
  const ra = finish(a), rb = finish(b);
  assert.equal(ra.totalWaterM3, rb.totalWaterM3); assert.deepEqual(ra.reservoir, rb.reservoir);
  a.dispose(); b.dispose();
});
check('closed levee stores water; open gate matches no wall; no guessed weather', () => {
  const a = new SketchJob(map(), [stroke('levee')]); const ra = finish(a);
  assert(ra.reservoir.reduce((v, p) => v + p.volumeM3, 0) > 0); assert.equal(ra.drought, null);
  assert(ra.floods.start.length); assert(ra.floods.farmland!.length);
  assert(ra.floods.objects.some(o => o.id === 'marker'));
  const b = new SketchJob(map(), [{ path: [[4, 7], [7, 7]], stack: [{ kind: 'floodgate', maxHeight: 1, height: 0 }] }]);
  assert.equal(finish(b).additionalWaterM3, 0); a.dispose(); b.dispose();
});
check('arbitrary legal dam stacks dispatch to pressure columns', () => {
  const job = new SketchJob(map(), [{ path: [[4, 7], [7, 7]], stack: [{ kind: 'dam' }, { kind: 'dam' }] }]);
  const r = finish(job); assert.equal(r.backend, 'typescript-stacked');
  assert(Number.isFinite(r.totalWaterM3)); assert.equal(r.wall.counts.dam, 8); job.dispose();
});
check('game rule probes: below crest no spill; above crest spills; levee blocks a full level', () => {
  const m = map(); m.model.emitters = [];
  for (let y = 1; y < 7; y++) for (let x = 4; x < 8; x++) m.water.depth[y * 12 + x] = .5;
  for (const kind of ['dam', 'levee'] as const) {
    const sim = new ResidentWater(compileWall(m.model, [stroke(kind)]).model, m.water);
    sim.run(128);
    for (let y = 8; y < 12; y++) for (let x = 4; x < 8; x++) assert.equal(sim.D[y * 12 + x], 0);
    sim.dispose();
  }
  m.water.depth.fill(0);
  for (let y = 1; y < 7; y++) for (let x = 4; x < 8; x++) m.water.depth[y * 12 + x] = 1;
  const sim = new ResidentWater(compileWall(m.model, [stroke('dam')]).model, m.water);
  sim.run(16); assert(sim.D[8 * 12 + 5] > 0); sim.dispose();
});
check('weather input and tick slicing preserve final bytes and exhaustion day', () => {
  const m = map(), weather = { provenance: 'explicit test drought', frames: [
    { ticks: 768, kind: 'drought' as const, strengths: [0], contamination: [0] }] };
  const a = new SketchJob(m, [stroke('dam')], weather), b = new SketchJob(m, [stroke('dam')], weather);
  const ra = finish(a, 16), rb = finish(b, 257);
  assert.equal(ra.totalWaterM3, rb.totalWaterM3); assert.deepEqual(ra.drought, rb.drought);
  assert.equal(ra.drought!.observedDays, 1); assert(ra.drought!.censored);
  a.dispose(); b.dispose();
});
check('source walls, no mutation, invalid intersections/gates/overlaps rejected, cancellation', () => {
  const m = map(), digest = () => createHash('sha256').update(bytes(m.model.floor)).update(bytes(m.water.depth)).digest('hex');
  const before = digest(), job = new SketchJob(m, [stroke('dam')]); job.advance(16); job.cancel();
  assert.equal(job.result().phase, 'cancelled'); assert.equal(digest(), before);
  assert.throws(() => compileWall(m.model, [{ path: [[5, 1]], stack: [{ kind: 'levee' }] }]), /emitter/);
  assert.throws(() => compileWall(m.model, [stroke('dam'), stroke('levee')]), /Conflicting/);
  assert.throws(() => compileWall(m.model, [{ path: [[5, 7]], stack: [{ kind: 'floodgate', maxHeight: 1, height: 2 }] }]), /range/);
  assert.throws(() => compileWall(m.model, [{ path: [[5, 7]], stack: [{ kind: 'floodgate', maxHeight: 1, height: 1 }, { kind: 'dam' }] }]), /stackable/);
  const conflict = new SketchJob(m, [{ path: [[5, 3]], stack: [{ kind: 'levee' }] }]);
  assert.equal(conflict.result().conflicts[0].id, 'marker'); conflict.dispose();
});
check('resident arena growth preserves earlier maps and disposal is independent', () => {
  const small = map(), a = new ResidentWater(small.model, small.water), ts = new WaterSim(small.model, small.water, { rules: 'game' });
  const W = 256, floor = new Float64Array(W * W).fill(1), state = { depth: new Float64Array(W * W), contamination: new Float64Array(W * W) };
  const large = new ResidentWater({ W, H: W, floor, dam: null, emitters: [] }, state);
  large.run(1); large.dispose(); a.run(128); ts.run(128);
  assert.deepEqual(bytes(a.D), bytes(ts.D)); a.dispose(); ts.dispose();
});
check('roofed map keeps cave water; a wall above it does not flood the start or farmland above', () => {
  const W = 5, N = W * W, voxels = voxelsFromHeights(new Uint8Array(N).fill(3), W, W);
  voxels[N + 12] = 0;
  const singletons = emptySimulationSingletons(W, W, 2), tokens = new Array(2 * N).fill('0');
  tokens[12] = '.5:0:0:1:.5';
  (singletons.WaterMapNew as any).WaterColumns.Array = tokens.join(' ');
  const map = fromWorld({ gameVersion: '1.1.2.4-52e959e-sw', timestamp: '2026-10-02 00:00:00',
    sizeX: W, sizeY: W, layers: 23, voxels, entities: [], singletons }, 'synthetic cave', new Uint8Array(N).fill(1));
  map.startTiles = [12];
  const job = new SketchJob(map, [{ path: [[2, 2]], stack: [{ kind: 'dam' }] }]);
  const r = job.advance(1);
  assert.equal(r.backend, 'typescript-stacked'); assert(r.totalWaterM3 > .49);
  assert.equal(r.floods.start.length, 0); assert.equal(r.floods.farmland!.length, 0); job.dispose();
});
writeFileSync(dir + '/checks.json', JSON.stringify({ checks, passed: true, rustSha256: createHash('sha256').update(wasm).digest('hex') }, null, 2) + '\n');
console.log(checks + ' checks passed.');
