import assert from 'node:assert/strict';
import { Worker } from 'node:worker_threads';
import { writeFileSync } from 'node:fs';
import { WaterSim, type WaterModel } from '../../src/core/sim/water';
import { installParallelWater, uninstallParallelWater, parallelWaterThreads, parallelWaterStats, withoutParallelWater } from '../../src/core/sim/parallel';
const evidence: object[] = [];
const bytes = (a: ArrayBufferView) => Buffer.from(a.buffer, a.byteOffset, a.byteLength);
function equal(a: WaterSim, b: WaterSim) {
  for (const key of ['D', 'C', 'out', 'Dold'] as const) assert.equal(bytes(a[key]).equals(bytes(b[key])), true, `${key} differs`);
  assert.equal(bytes(a.saturation()).equals(bytes(b.saturation())), true, 'saturation differs');
}
function fixture(W: number, H: number, seep = false): { model: WaterModel; initial: { depth: Float64Array; contamination: Float64Array } } {
  const N = W * H;
  return { model: { W, H, floor: Float64Array.from({ length: N }, (_, i) => (i % 11) / 8), dam: Float64Array.from({ length: N }, (_, i) => i % 19 === 0 ? .65 : -1), emitters: [{ cells: [Math.min(N - 1, 2 * W + 1), Math.min(N - 1, 6 * W + 1)], strength: 1.5, contamination: .4, ...(seep ? { depthLimit: { anchor: Math.min(N - 1, 2 * W + 1), off: .9, on: .6 } } : {}) }] }, initial: { depth: Float64Array.from({ length: N }, (_, i) => i % 7 === 0 ? 0 : .3 + (i % 5) / 4), contamination: Float64Array.from({ length: N }, (_, i) => (i % 5) / 5) } };
}
async function pool(T: number) {
  if (T < 2) return;
  assert(installParallelWater({ threads: T, spawn: () => { const w = new Worker(new URL('./helper.mjs', import.meta.url)); return { postMessage: m => w.postMessage(m), terminate: () => void w.terminate() }; } }));
  while (parallelWaterThreads() < T) await new Promise(r => setTimeout(r, 10));
}
async function parity() {
  let cases = 0, threaded = 0;
  for (let T = 1; T <= 16; T++) {
    await pool(T);
    try {
      // Four-row strips; non-divisible height; short/tall rectangles; product threshold; a seep fallback.
      for (const [W, H, seep] of [[1, 4*T+1, 0], [7, 4*T, 0], [9, 4*T+3, 0], [257, 257, 0], [513, 17, 0], [512, 512, 0], [17, 129, 0], [9, 4*T+3, 1]]) {
        const { model, initial } = fixture(W, H, !!seep);
        const a = new WaterSim(model, initial), b = new WaterSim(structuredClone(model), initial);
        const start = parallelWaterStats.runs;
        try {
          for (const scale of [1, 0, .35, 1]) {
            a.run(3, scale); withoutParallelWater(() => b.run(3, scale)); equal(a, b);
            a.F[W + 1] += .25; b.F[W + 1] += .25;
            a.emitters[0].strength *= .9; b.emitters[0].strength *= .9;
          }
          cases++;
          if (parallelWaterStats.runs > start) threaded++;
        } finally { a.dispose(); b.dispose(); }
      }
    } finally { uninstallParallelWater(); }
  }
  evidence.push({ test: 'shape/thread/weather/floor parity', cases, threaded });
}
async function edited() {
  await pool(2);
  const { model, initial } = fixture(3, 9);
  const a = new WaterSim(model, initial), b = new WaterSim(structuredClone(model), initial);
  try {
    a.run(1); withoutParallelWater(() => b.run(1)); equal(a,b);
    a.D[13] = b.D[13] = 3;
    a.C[13] = b.C[13] = .9;
    a.out[52] = b.out[52] = .4;
    a.run(1); withoutParallelWater(() => b.run(1));
    const identical = bytes(a.D).equals(bytes(b.D));
    evidence.push({ test: 'water edit between threaded slices', identical, threaded: parallelWaterStats.runs, singleDepth: b.D[13], threadedDepth: a.D[13] });
    assert.equal(identical, process.env.MERGE_REVIEW_EXPECT_BUGS !== '1', 'F1 expected regression state');
  } finally { uninstallParallelWater(); a.dispose(); b.dispose(); }
}
async function dispatchFailure() {
  let stopped = 0;
  const ready = { postMessage(m: any) { if (m.kind === 'hello') Atomics.store(new Int32Array(m.ctl),m.index,1); else throw new Error('port closed'); }, terminate() { stopped++; } };
  assert(installParallelWater({ threads: 2, helpers: [ready], spawn: () => { throw Error('blocked'); } }));
  const { model, initial } = fixture(3,9);
  const a = new WaterSim(model,initial), b = new WaterSim(structuredClone(model),initial);
  let threw = false;
  try { try { a.run(1); } catch { threw = true; } withoutParallelWater(() => b.run(1));
    evidence.push({ test: 'helper dispatch throws', threw, stopped });
    assert.equal(threw, process.env.MERGE_REVIEW_EXPECT_BUGS === '1', 'F2 expected regression state');
    if (!threw) equal(a,b);
  } finally { uninstallParallelWater(); a.dispose(); b.dispose(); }
}
await parity(); await edited(); await dispatchFailure();
writeFileSync(new URL('./local/water.json',import.meta.url), JSON.stringify(evidence,null,2)+'\n');
console.log(JSON.stringify(evidence));
