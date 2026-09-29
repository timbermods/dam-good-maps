import assert from "node:assert/strict";
import { checkSupport } from "../../terrain3d/proto/support";
import { HEADROOM, landAt, planErode, type ErodePlan } from "../core/erode";
import type { ErodeMap } from "../core/map";
import { LAYERS, Terrain } from "../core/terrain";
import { CASES } from "../demo/cases";
import { DETAIL_LABELS } from "../core/wash";

// The review did not include a recorded pointer path: use the pinned rim sweep at 100/100.
export const ROUND2 = [
  { ...CASES[0], power: 100, size: 100 },
  { ...CASES[1], power: 100, size: 100 },
  CASES[2],
  { ...CASES[0], id: "crater-click", points: [CASES[0].points[1]], power: 100, size: 100 },
];

export function shelterMetrics(before: Terrain, plan: ErodePlan) {
  const after = plan.final, { W, H, N } = after, floor = plan.focus?.z ?? 0;
  const neighbours = (i: number) => [i % W > 0 ? i - 1 : -1, i % W < W - 1 ? i + 1 : -1,
    i >= W ? i - W : -1, i < N - W ? i + W : -1].filter(j => j >= 0);
  const canStand = (i: number) => floor > 0 && after.at(i, floor - 1) &&
    Array.from({ length: HEADROOM }, (_, z) => !after.at(i, floor + z)).every(Boolean);
  const seen = new Set<number>(), q: number[] = [];
  for (let i = 0; i < N; i++) if (canStand(i) && before.surface(i) === floor) { seen.add(i); q.push(i); }
  for (let k = 0; k < q.length; k++) for (const j of neighbours(q[k]))
    if (!seen.has(j) && canStand(j)) { seen.add(j); q.push(j); }
  const buildable = q.filter(i => before.at(i, floor) && after.surface(i) > floor + HEADROOM);
  const buildSet = new Set(buildable);
  const footprints3x3 = buildable.filter(i => i % W < W - 2 && Math.floor(i / W) < H - 2 &&
    Array.from({ length: 9 }, (_, j) => i + j % 3 + Math.floor(j / 3) * W).every(j => buildSet.has(j))).length;
  // A floor stub is connected to ground but not to a wall, leg or roof. Flood the solid ABOVE
  // the entry plane across the whole map, independently of the planner's removal algorithm.
  const touched = new Set([...plan.removed].flatMap(v => [v % N, ...neighbours(v % N)]));
  const visited = new Uint8Array(N * LAYERS);
  let singleBlocks = 0, smallClusters = 0;
  for (const i of touched) for (let z = floor; z < LAYERS; z++) {
    const v = z * N + i;
    if (visited[v] || !after.at(i, z)) continue;
    const cells = [v]; visited[v] = 1;
    for (let k = 0; k < cells.length; k++) {
      const c = cells[k], cz = Math.floor(c / N), j = c % N;
      const ns = neighbours(j).map(n => cz * N + n);
      if (cz > floor) ns.push(c - N);
      if (cz + 1 < LAYERS) ns.push(c + N);
      for (const n of ns) if (!visited[n] && after.at(n % N, Math.floor(n / N))) { visited[n] = 1; cells.push(n); }
    }
    if (cells.length > 12) continue;
    const trial = after.clone();
    for (const c of cells) trial.set(c % N, Math.floor(c / N), false);
    if (checkSupport(W, H, trial.voxels(), LAYERS).unsupported.length) continue; // a necessary leg
    if (cells.length === 1) singleBlocks++;
    else smallClusters++;
  }
  return { floor, headroom: HEADROOM, buildableFloorTiles: buildable.length, footprints3x3,
    leftoverSingleBlocks: singleBlocks, leftoverSmallClusters: smallClusters };
}

export function round2Checks(load: (id: string) => ErodeMap) {
  const cases = ROUND2.map(c => {
    const m = load(c.map), before = Terrain.fromHeights(m.W, m.H, m.heights);
    const input = { terrain: before, rock: m.rock, keep: m.keep };
    const p = planErode(input, { points: c.points }, c);
    const dropped = checkSupport(m.W, m.H, p.final.voxels(), LAYERS).unsupported.length;
    const metrics = shelterMetrics(before, p);
    assert.equal(dropped, 0, `${c.id}: dropped voxels`);
    assert.ok(metrics.buildableFloorTiles > 0, `${c.id}: no accessible building clearance`);
    assert.equal(metrics.leftoverSingleBlocks, 0, `${c.id}: single blocks`);
    assert.equal(metrics.leftoverSmallClusters, 0, `${c.id}: small debris clusters`);
    for (let b = 0; b < p.buckets; b++) assert.equal(
      checkSupport(m.W, m.H, landAt(before, p, b).voxels(), LAYERS).unsupported.length, 0, `${c.id}: bucket ${b}`);
    const low = planErode(input, { points: c.points }, { ...c, power: 10 });
    assert.equal(checkSupport(m.W, m.H, low.final.voxels(), LAYERS).unsupported.length, 0);
    assert.ok(p.worn > low.worn, `${c.id}: Power should remove more rock at the same Size`);
    if (c.id.startsWith("crater")) {
      assert.ok(metrics.footprints3x3 > 0, `${c.id}: no 3×3 building site`);
      assert.ok(metrics.buildableFloorTiles > shelterMetrics(before, low).buildableFloorTiles);
    }
    const row = { case: c.id, power: c.power, size: c.size, droppedOnLoad: dropped, ...metrics,
      worn: p.worn, held: p.held, lowPowerWorn: low.worn, result: "PASS" };
    console.log(JSON.stringify(row));
    return row;
  });
  const W = 28, H = 28;
  const rock = new Array(LAYERS).fill(0);
  const steps = [1, 2, 3].map(rise => {
    const t = Terrain.fromHeights(W, H, Array.from({ length: W * H }, (_, i) => i % W < 14 ? 3 : 3 + rise));
    const p = planErode({ terrain: t, rock }, { points: [{ x: 14.5, y: 14.5, z: 3.5 }] }, { power: 100, size: 100, seed: 1 });
    assert.ok(p.worn > 0, `step ${rise}: force refused`);
    assert.equal(checkSupport(W, H, p.final.voxels(), LAYERS).unsupported.length, 0);
    return { rise, worn: p.worn, droppedOnLoad: 0, result: "PASS" };
  });
  const wall = Terrain.fromHeights(W, H, Array.from({ length: W * H }, (_, i) => i % W < 14 ? 3 : 14));
  const short = planErode({ terrain: wall, rock }, { points: [{ x: 14.5, y: 14.5, z: 3.5 }] }, { power: 10, size: 100, seed: 1 });
  assert.equal(short.held, 0, "short overhang must need no columns");
  assert.ok(short.final.multiRun() > 0);
  assert.equal(checkSupport(W, H, short.final.voxels(), LAYERS).unsupported.length, 0);
  return { cases, steppedCliffs: steps, shortOverhang: "PASS: no columns", animationBuckets: "PASS" };
}

export function drainageMetrics(before: Terrain, p: ErodePlan) {
  assert.ok(p.wash, "flat land must make a wash");
  const { W, H, N } = before, after = p.final;
  const height = Uint8Array.from({ length: N }, (_, i) => after.run0Top(i));
  const runs = p.wash.runs ?? [p.wash];
  const seen = new Uint8Array(N), q = [...new Set(runs.map(run => run.outlet))];
  for (const i of q) seen[i] = 1;
  for (let k = 0; k < q.length; k++) {
    const i = q[k], x = i % W, y = Math.floor(i / W);
    for (const j of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, y > 0 ? i - W : -1, y < H - 1 ? i + W : -1])
      if (j >= 0 && !seen[j] && height[j] >= height[i]) { seen[j] = 1; q.push(j); }
  }
  const changed = Array.from({ length: N }, (_, i) => i).filter(i => height[i] < before.run0Top(i));
  const undrained = changed.filter(i => !seen[i]).length;
  let rises = 0;
  for (const run of runs) for (let k = 1; k < run.path.length; k++) if (height[run.path[k]] > height[run.path[k - 1]]) rises++;
  const dropped = checkSupport(W, H, after.voxels(), LAYERS).unsupported.length;
  assert.ok(changed.length > 0, "flat land did nothing");
  assert.equal(undrained, 0, "carved bed contains trapped floor tiles");
  assert.equal(rises, 0, "trunk bed rises downstream");
  assert.equal(dropped, 0, "wash loses support");
  for (const run of runs) {
    const end = run.outlet;
    assert.ok(run.outletKind === "water" || end % W === 0 || end % W === W - 1 || end < W || end >= N - W);
  }
  return { droppedOnLoad: dropped, undrainedBedTiles: undrained, downstreamRises: rises,
    bedTiles: changed.length, worn: p.worn, outlet: p.wash.outletKind, details: p.details };
}

export function bottomCheck(before: Terrain, p: ErodePlan) {
  let lost = 0;
  for (let i = 0; i < before.N; i++) if (before.at(i, 0) && !p.final.at(i, 0)) lost++;
  assert.equal(lost, 0, "Erode removed the map's bottom layer");
  assert.ok([...p.removed].every(v => v >= before.N), "an animation bucket removes bottom terrain");
  return lost;
}

export function washChecks(load: (id: string) => ErodeMap) {
  const m = load("wash"), before = Terrain.fromHeights(m.W, m.H, m.heights);
  const input = { terrain: before, rock: m.rock, keep: m.keep, water: m.water };
  const cases = CASES.filter(c => c.map === "wash").map(c => {
    const p = planErode(input, { points: c.points }, c);
    const metrics = drainageMetrics(before, p);
    // Count debris above the lowest new bed, excluding walls/legs with the same independent
    // connected-component measurement used for shelters.
    const floor = Math.min(...p.wash!.bedTiles.map(i => p.final.run0Top(i)));
    const debris = shelterMetrics(before, { ...p, focus: { ...p.focus!, z: floor } });
    let roofedBuildable = 0;
    for (let level = 1; level < LAYERS - HEADROOM; level++) {
      const seen = new Set<number>(), q: number[] = [];
      const open = (i: number) => p.final.at(i, level - 1) &&
        Array.from({ length: HEADROOM }, (_, z) => !p.final.at(i, level + z)).every(Boolean);
      for (let i = 0; i < before.N; i++) if (p.final.surface(i) === level) { q.push(i); seen.add(i); }
      for (let k = 0; k < q.length; k++) {
        const i = q[k], x = i % m.W, y = Math.floor(i / m.W);
        if (p.final.surface(i) > level + HEADROOM && before.at(i, level)) roofedBuildable++;
        for (const j of [x > 0 ? i - 1 : -1, x < m.W - 1 ? i + 1 : -1, y > 0 ? i - m.W : -1, y < m.H - 1 ? i + m.W : -1])
          if (j >= 0 && !seen.has(j) && open(j)) { seen.add(j); q.push(j); }
      }
    }
    assert.equal(debris.leftoverSingleBlocks, 0);
    assert.equal(debris.leftoverSmallClusters, 0);
    for (let b = 0; b < p.buckets; b++) assert.equal(checkSupport(m.W, m.H, landAt(before, p, b).voxels(), LAYERS).unsupported.length, 0);
    const row = { case: c.id, power: c.power, size: c.size, ...metrics,
      buildableFloorTiles: roofedBuildable, leftoverSingleBlocks: debris.leftoverSingleBlocks,
      leftoverSmallClusters: debris.leftoverSmallClusters, result: "PASS" };
    console.log(JSON.stringify(row)); return row;
  });
  assert.ok(cases[1].worn > cases[0].worn * 3, "giant wash should be clearly larger");
  const c = CASES.find(c => c.id === "wash-giant")!;
  let variants = 0;
  for (const value of [0, 100]) for (let seed = 1; seed <= 4; seed++) {
    const details = Object.fromEntries(Object.keys(DETAIL_LABELS).map(key => [key, value]));
    const settings = { power: 100, size: 100, seed, details };
    const p = planErode(input, { points: c.points }, settings);
    drainageMetrics(before, p);
    assert.deepEqual(p.details, details, "pins must survive a new seed");
    variants++;
  }
  const click = planErode(input, { points: [c.points[0]] }, { power: 30, size: 30, seed: 5 });
  drainageMetrics(before, click);
  const reroll = planErode(input, { points: c.points }, { power: 100, size: 100, seed: 8 });
  assert.notDeepEqual(reroll.details, cases[1].details, "Auto must reroll");
  return { cases, pinVariants: variants, click: "PASS", autoReroll: "PASS", drainage: "PASS" };
}
