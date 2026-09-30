import test from 'node:test';
import assert from 'node:assert/strict';
import { summarize } from './metrics.mjs';
import { readFileSync } from 'node:fs';
const budgets = JSON.parse(readFileSync(new URL('./budgets.json', import.meta.url)));
test('reports every local and absolute hitch, including unattributed pauses', () => {
  const deltas = [16, 16, 16, 16, 40, 16, 16, 16, 16, 200, 16, 16, 16];
  let t = 0;
  const frames = deltas.map(dt => ({ at: t += dt, dt }));
  const result = summarize({ frames, calls: [{ name: 'meshWater', start: frames[4].at - 38, end: frames[4].at - 2 }], tasks: [], rendered: [], errors: [], discontinuities: [] }, budgets);
  assert.deepEqual(result.hitches.map(f => f.dt), [40, 200]);
  assert.equal(result.hitches[0].sources[0].name, 'meshWater');
  assert.equal(result.hitches[0].unattributed, true); // A temporal overlap is not causal proof.
  assert.equal(result.hitches[1].unattributed, true);
});
test('retains snapshot overhead separately while counting real interaction stalls', () => {
  const result = summarize({ frames: [{ at: 200, dt: 200, instrumentation: 'byte-snapshot-after-idle' }, { at: 216, dt: 16 },
    { at: 416, dt: 200 }, { at: 432, dt: 16 }], calls: [], rendered: [], errors: [], discontinuities: [],
    tasks: [{ start: 0, duration: 180, instrumentation: 'byte-snapshot-after-idle' }, { start: 300, duration: 100 }] }, budgets);
  assert.deepEqual(result.hitches.map(f => f.dt), [200]);
  assert.equal(result.longTasks.length, 1); assert.equal(result.instrumentation.frames.length, 1);
  assert.equal(result.instrumentation.tasks.length, 1);
});
