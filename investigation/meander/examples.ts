// The captured variant's actual water, in addition to the broad random sweep.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { snapshotMap } from '../../src/core/forces/force';
import { modelOf } from '../../src/core/forces/runs';
import { droughtStorage } from '../../src/core/sim/drought';
import { decode, CASES } from './maps';
import { river, plan, settle, DEFAULTS } from './meander';
export function examples() {
  const results = CASES.map(c => {
    const before = decode(readFileSync(`maps/${c.map}.json.gz`)), r = river(before), p = plan(before, { ...DEFAULTS, power: c.power, size: c.size, seed: 4 }, { path: r.path.slice(4, -4) });
    const m = snapshotMap(p.map), water = settle(m, p.retained), again = snapshotMap(p.map);
    settle(again, p.retained);
    assert.deepEqual(m, again, 'captured water deterministic');
    assert(water.settled || water.steadyTicks !== undefined);
    const first = r.path[0], end = r.path.at(-1)!, start = Math.round(first.y) * m.W + Math.round(first.x), queue = [start], seen = new Set(queue);
    for (let k = 0; k < queue.length; k++) {
      const i = queue[k], x = i % m.W, y = Math.floor(i / m.W);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const xx = x + dx, yy = y + dy, j = yy * m.W + xx;
        if (xx < 0 || yy < 0 || xx >= m.W || yy >= m.H || seen.has(j) || m.water.depth[j] <= .015)
          continue;
        seen.add(j);
        queue.push(j);
      }
    }
    assert(queue.some(i => { const x = i % m.W, y = Math.floor(i / m.W); return (x === 0 || x === m.W - 1 || y === 0 || y === m.H - 1) && Math.hypot(x - end.x, y - end.y) <= r.width * 2; }), 'captured river keeps its outlet');
    if (c.id === 'long')
      assert.equal(p.stats.oxbows, 1, 'captured oxbow');
    const pool = p.retained[0], drought = droughtStorage(modelOf(m), m.water.depth, 30);
    return { case: c.id, seed: 4, ...p.stats, waterTicks: water.ticks, sourceOutletConnected: true, oxbowTiles: pool?.tiles.length ?? 0, waterAtCutoff: pool?.depth.reduce((a, b) => a + b, 0) ?? 0, oxbowAfter30Days: pool?.tiles.reduce((n, i) => n + drought[i], 0) ?? 0 };
  });
  mkdirSync('checks', { recursive: true });
  writeFileSync('checks/examples.json', JSON.stringify(results, null, 2) + '\n');
  return results;
}
if (process.argv[2] === 'examples.ts')
  console.log(examples());
