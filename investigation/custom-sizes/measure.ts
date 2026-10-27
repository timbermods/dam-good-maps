// One cold reading per shape/operation. No schema bypass or product edits.
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { generate } from '../../src/core/gen/generate';
import { makeSpec } from '../../src/core/spec/mapspec';
import { canonicalSettle } from '../../src/core/sim/prefill';
import { waterModel, mapObjects } from '../../src/core/sim/model';
import { entityJson, tree, bush, waterSource, startingLocation, type EntitySpec } from '../../src/core/format/entities';
import { plainEntities, type FullForceMap } from '../../src/core/forces/force';
import { geology } from '../../src/core/forces/random';
import { CarveRun, DEFAULTS } from '../../src/core/forces/carve/run';
import { CarvePlay } from '../../src/core/forces/carve/play';
import { CraterRun, EruptRun, QuakeRun } from '../../src/core/forces/runs';
import { CRATER_DEFAULTS } from '../../src/core/forces/craterize';
import { ERUPT_DEFAULTS } from '../../src/core/forces/erupt';
import { QUAKE_DEFAULTS } from '../../src/core/forces/quake';
import { GlaciateRun } from '../../src/core/forces/glaciate/run';
import { GLACIATE_DEFAULTS } from '../../src/core/forces/glaciate/model';
import { RiftRun, RIFT_DEFAULTS } from '../../src/core/forces/rift';
import { DepositRun, DEPOSIT_DEFAULTS } from '../../src/core/forces/deposit';

// Rectangular version of tests/contract/forceFixtures.ts's river study.
export function fixture(W: number, H: number): FullForceMap {
  const N = W * H, rx = Math.floor(W * .55);
  const heights = new Uint8Array(N), depth = new Float64Array(N);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, d = Math.abs(x - rx);
    heights[i] = d <= 3 ? 6 : d <= 6 ? 8 : 9;
    if (d <= 3) depth[i] = .65;
  }
  const at = (x: number, y: number, id: string) => ({x, y, z: heights[y * W + x], id, owner: 'custom-sizes-study'});
  const entities: EntitySpec[] = [startingLocation({...at(9, 10, 'start'), orientation: 'Cw0'})];
  for (let dx = -3; dx <= 3; dx++) entities.push(waterSource({...at(rx + dx, H - 1, 'source-' + dx), strength: .8}));
  for (let y = 5; y < H - 5; y += 3) for (let x = 5; x < W - 5; x += 3) {
    if ((x < 15 && y < 17) || Math.abs(x - rx) < 7) continue;
    if ((x * 7 + y * 11) % 17 < 9) entities.push(tree({...at(x, y, `tree-${x}-${y}`), species: (x + y) % 2 ? 'Pine' : 'Birch'}));
    else if ((x + y) % 7 === 0) entities.push(bush({...at(x, y, `bush-${x}-${y}`), ripe: true}));
  }
  return {W, H, heights, entities: plainEntities(entities), water: {depth, contamination: new Float64Array(N)}, maxHeight: 22, rockLayers: geology(heights), fallen: [], lava: new Uint32Array(N)};
}

const operations = ['generation', 'water', 'carve', 'craterize', 'erupt', 'quake', 'glaciate', 'rift', 'deposit'];
const shapes = [[512, 512], [128, 512], [64, 512], [512, 256]];
const [op, w, h] = process.argv.slice(2);
if (fileURLToPath(import.meta.url) !== process.argv[1]) {
  // Importing the fixture does not run the measurements.
} else if (!op) {
  mkdirSync('investigation/custom-sizes/local', {recursive: true});
  const rows = existsSync('investigation/custom-sizes/local/readings.json') ? JSON.parse(readFileSync('investigation/custom-sizes/local/readings.json', 'utf8')) : [];
  for (const [W, H] of shapes) for (const operation of operations) {
    if (rows.some((r: {W: number; H: number; operation: string}) => r.W === W && r.H === H && r.operation === operation)) continue;
    const child = spawnSync(process.execPath, ['--import', 'tsx', fileURLToPath(import.meta.url), operation, String(W), String(H)], {
      encoding: 'utf8', env: {...process.env, UV_THREADPOOL_SIZE: '4', CARGO_BUILD_JOBS: '4'}, maxBuffer: 1024 * 1024,
    });
    if (child.status !== 0) throw new Error(`${W}x${H} ${operation}: ${child.stderr}`);
    const row = JSON.parse(child.stdout.trim()); rows.push(row);
    console.log(JSON.stringify(row));
    writeFileSync('investigation/custom-sizes/local/readings.json', JSON.stringify(rows, null, 2) + '\n');
  }
} else {
  const W = Number(w), H = Number(h);
  // Setup outside timed region; process peak includes it and imported Wasm text.
  const map = op === 'generation' ? null : fixture(W, H);
  const spec = makeSpec({seed: 1, theme: 'riverValley', size: {x: W, y: H}});
  const model = map && op === 'water' ? waterModel(W, H, map.heights, mapObjects({entities: map.entities.map(entityJson)})) : null;
  const xy = (fx: number, fy: number) => ({x: Math.floor(W * fx), y: Math.floor(H * fy)});
  const p = xy(.3, .75), q = xy(.7, .25), origin = p.y * W + p.x, end = q.y * W + q.x;
  const path = [p, xy(.5, .5), q];
  const baselineMiB = process.memoryUsage().rss / 1048576;
  let result: unknown, error: string | undefined, steps: number | undefined;
  const t = performance.now();
  try {
    if (op === 'generation') result = generate(spec);
    else if (op === 'water') {
      const r = canonicalSettle(model!); result = {settled: r.settled, ticks: r.ticks};
    } else if (op === 'carve') {
      const r = new CarveRun(map!, {...DEFAULTS, mode: 'aim', defyGravity: true, seed: 1}, {origin, end}, {sourceId: 'study-carve'});
      const play = new CarvePlay(r); play.plan();
      while (!play.done) play.advance(1);
      steps = play.total; result = play.map;
    } else {
      const r = op === 'craterize' ? new CraterRun(map!, {...CRATER_DEFAULTS, seed: 1}, {origin})
        : op === 'erupt' ? new EruptRun(map!, ERUPT_DEFAULTS, {origin})
        : op === 'quake' ? new QuakeRun(map!, QUAKE_DEFAULTS, {path, side: 1})
        : op === 'glaciate' ? new GlaciateRun(map!, {...GLACIATE_DEFAULTS, mode: 'aim'}, {origin, end})
        : op === 'rift' ? new RiftRun(map!, RIFT_DEFAULTS, {path})
        : new DepositRun(map!, DEPOSIT_DEFAULTS, {path});
      r.finishAll(); steps = r.total; result = r.map;
    }
  } catch (e) { error = e instanceof Error ? e.message : String(e); }
  const ms = performance.now() - t;
  console.log(JSON.stringify({W, H, operation: op, ms, peakMiB: process.resourceUsage().maxRSS / 1024, baselineMiB, error, steps,
    ...(op === 'water' ? {water: result} : {}), ...(map ? {entities: map.entities.length} : {}), node: process.version}));
}
