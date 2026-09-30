import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fullMap, snapshotMap, type FullForceMap } from '../../src/core/forces/force';
import { footprint, startProblem } from '../../src/core/forces/objects';
import { hash } from '../../src/core/forces/random';
import { droughtStorage } from '../../src/core/sim/drought';
import { modelOf } from '../../src/core/forces/runs';
import { river, plan, replay, reveal, settle, DEFAULTS, validate, type Settings, type Intent } from './meander';
import { decode, CASES } from './maps';
import {examples} from './examples';
export const digest = (m: FullForceMap) => { const h = createHash('sha256'); for (const a of [m.heights, m.lava, m.water.depth, m.water.contamination])
  h.update(Buffer.from(a.buffer, a.byteOffset, a.byteLength)); h.update(JSON.stringify([m.entities, m.rockLayers, m.fallen])); return h.digest('hex'); };
const mass = (m: FullForceMap) => m.heights.reduce((a, b) => a + b, 0);
const t0 = performance.now();
let gestures = 0, worstMs = 0, undoChecks = 0, arrivalChecks = 0, waterMaxTicks = 0, waterUnsettled = 0, carried = 0, oxbows = 0;
const results = [];
for (const c of CASES) {
  const m = decode(readFileSync(`maps/${c.map}.json.gz`)), r = river(m), initial = digest(m), volume = mass(m);
  for (const bends of ['auto', 'tight', 'broad'] as const)
    for (const power of [0, 45, 100])
      for (const size of [null, 4, 64])
        for (const floor of [1, 6, 22])
          for (const kind of ['click', 'path']) {
            const seed = gestures * 104729 + 17, s: Settings = { ...DEFAULTS, bends, power, size, floor, seed };
            const a = 4 + Math.floor(hash(seed, 1) * (r.path.length - 13)), b = Math.min(r.path.length - 5, a + 5 + Math.floor(hash(seed, 2) * 35));
            const intent: Intent = kind === 'click' ? { click: r.path[a] } : { path: r.path.slice(a, b + 1) };
            const started = performance.now(), p = plan(m, s, intent);
            worstMs = Math.max(worstMs, performance.now() - started);
            assert.equal(digest(m), initial, 'input immutable');
            assert.equal(mass(p.map), volume, 'whole-block material balance');
            assert.equal(p.stats.balance, 0);
            for (let i = 0; i < m.heights.length; i++) {
              assert(p.map.heights[i] >= Math.min(floor, m.heights[i]), 'Floor');
              assert(p.map.heights[i] <= m.maxHeight, 'ceiling');
            }
            const again = plan(m, s, intent);
            assert.equal(digest(p.map), digest(again.map), 'determinism');
            assert.deepEqual(p.operation, again.operation, 'operation deterministic');
            assert.equal(digest(replay(m, p.operation)), digest(p.map), 'literal replay');
            for (const progress of [0, .19, .51, .91, 1]) {
              const shown = reveal(p, progress);
              assert.equal(mass(shown), volume, 'staged material balance');
              assert.equal(digest(snapshotMap(m)), initial, 'undo snapshot exact');
              undoChecks++;
              if (progress < 1) {
                assert.deepEqual(shown.water, m.water, 'water unchanged before final land');
                for (let i = 0; i < m.heights.length; i++)
                  if (p.arrival[i] > progress)
                    assert.equal(shown.heights[i], m.heights[i], 'nothing ahead of arrival');
                arrivalChecks++;
              }
            }
            const entities = new Map(p.map.entities.map(e => [e.id, e]));
            for (const e of m.entities) {
              const after = entities.get(e.id);
              if (/Source|Seep/.test(e.template)) {
                assert(after, 'all sources survive');
                assert.deepEqual(after.components, e.components, 'source strength unchanged');
              }
              if (after && e.template !== 'StartingLocation') {
                assert.equal(after.z - e.z, p.map.heights[e.y * m.W + e.x] - m.heights[e.y * m.W + e.x], 'ground-relative rider');
                assert.equal(after.orientation, e.orientation, 'upright');
              }
            }
            assert.equal(startProblem(p.map), null, 'valid start after land');
            carried += Number(p.stats.startCarried);
            oxbows += p.stats.oxbows;
            for (const pool of p.retained) {
              assert(pool.tiles.every((i, k) => p.map.water.depth[i] === pool.depth[k]), 'oxbow keeps its actual water');
            }
            const wet = snapshotMap(p.map), water = settle(wet, p.retained);
            waterMaxTicks = Math.max(waterMaxTicks, water.ticks);
            if (!water.settled && water.steadyTicks === undefined)
              waterUnsettled++;
            for (const depth of wet.water.depth)
              assert(Number.isFinite(depth) && depth >= 0, 'finite settled water');
            assert(water.settled || water.steadyTicks !== undefined, 'shared water stopping test passes');
            assert.equal(startProblem(wet), null, 'start still dry after water');
            assert.equal(digest(snapshotMap(m)), initial, 'undo after water exact');
            undoChecks++;
            gestures++;
            if (gestures % 27 === 0)
              console.log(c.id, gestures, "checked");
          }
  const p = plan(m, { ...DEFAULTS, power: c.power, size: c.size, seed: 2 }, { path: r.path.slice(4, -4) }), wet = snapshotMap(p.map), water = settle(wet, p.retained);
  const second = snapshotMap(p.map);
  settle(second, p.retained);
  assert.equal(digest(wet), digest(second), 'water deterministic');
  // The untouched source and original outlet remain wet; the river has not lost its feed.
  assert(wet.water.depth[Math.round(r.path[0].y) * m.W + Math.round(r.path[0].x)] > .01, 'source still flows');
  const start = Math.round(r.path[0].y) * m.W + Math.round(r.path[0].x), end = r.path.at(-1)!, seen = new Set([start]), queue = [start];
  for (let k = 0; k < queue.length; k++) {
    const i = queue[k], x = i % m.W, y = Math.floor(i / m.W);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const xx = x + dx, yy = y + dy, j = yy * m.W + xx;
      if (xx < 0 || yy < 0 || xx >= m.W || yy >= m.H || seen.has(j) || wet.water.depth[j] <= .015)
        continue;
      seen.add(j);
      queue.push(j);
    }
  }
  assert(queue.some(i => { const x = i % m.W, y = Math.floor(i / m.W); return (x === 0 || x === m.W - 1 || y === 0 || y === m.H - 1) && Math.hypot(x - end.x, y - end.y) <= r.width * 2; }), 'same outlet reach remains connected to source');
  const lake = p.retained[0], drought = droughtStorage(modelOf(wet), wet.water.depth, 30);
  results.push({ case: c.id, ...p.stats, waterTicks: water.ticks, oxbowTiles: lake?.tiles.length ?? 0, oxbowWater: lake?.depth.reduce((a, b) => a + b, 0) ?? 0, oxbowWaterAfter30Days: lake?.tiles.reduce((n, i) => n + drought[i], 0) ?? 0 });
  console.log(c.id, gestures, 'gestures checked');
}
const m = decode(readFileSync('maps/young.json.gz'));
for (const invalid of [{ power: NaN }, { power: 101 }, { floor: 0 }, { floor: 23 }, { size: 2 }, { seed: -1 }])
  assert.throws(() => validate(m, { ...DEFAULTS, ...invalid }, { click: { x: 60, y: 60 } }));
const dry = Array.from(m.water.depth).findIndex(d => d === 0);
assert.throws(() => plan(m, DEFAULTS, { click: { x: dry % m.W, y: Math.floor(dry / m.W) } }), /river/);
mkdirSync('checks', { recursive: true });
examples();
const result = { gestures, settingsPerCase: 81, deterministicPairs: gestures, literalReplays: gestures, undoChecks, arrivalChecks, waterSettles: gestures, waterUnsettled, waterMaxTicks, carriedStarts: carried, oxbows, worstPlanMs: +worstMs.toFixed(1), materialError: 0, cases: results, totalSeconds: +((performance.now() - t0) / 1000).toFixed(2) };
writeFileSync('checks/core.json', JSON.stringify(result, null, 2) + '\n');
console.log(result);
