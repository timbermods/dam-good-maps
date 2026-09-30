import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { CASES, decode } from "./maps";
import { DEFAULTS, plan, replay, settle } from "./deposit";
import { hash } from "../../src/core/forces/random";
import { snapshotMap } from "../../src/core/forces/force";
import { startProblem } from "../../src/core/forces/objects";

const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const began = performance.now();
let count = 0, settled = 0, minimumChanged = Infinity, minimumVolume = Infinity, minimumRaised = Infinity, worstMs = 0;
const placements: Record<string, number> = {};
const results = [];
const waterChecks: { m: ReturnType<typeof decode>; s: typeof DEFAULTS; click: { x: number; y: number } }[] = [];
for (const c of CASES) {
  const m = decode(new Uint8Array(readFileSync(`maps/${c.map}.json.gz`))), original = digest(m);
  let low = Infinity, peak = 0;
  for (let i = 0; i < m.heights.length; i++) if (m.heights[i] > m.heights[peak]) peak = i;
  const boundaries = [{ x: 0, y: 0 }, { x: 127, y: 0 }, { x: 0, y: 127 }, { x: 127, y: 127 },
    { x: 0, y: 64 }, { x: 127, y: 64 }, { x: 64, y: 0 }, { x: 64, y: 127 }, { x: peak % 128, y: Math.floor(peak / 128) }];
  for (let k = 0; k < 256 + boundaries.length; k++) {
    const seed = 300 + k + CASES.indexOf(c) * 104729;
    const click = boundaries[k - 256] ?? { x: hash(seed, 1) * 127, y: hash(seed, 2) * 127 };
    const s = { ...DEFAULTS, power: [0, 1, 35, 100][k % 4], size: [null, 4, 22, 64][Math.floor(k / 4) % 4],
      channels: (["auto", "few", "many"] as const)[k % 3], seed };
    const t = performance.now(), p = plan(m, s, { click }); worstMs = Math.max(worstMs, performance.now() - t);
    const added = p.operation.tiles.filter(i => p.map.heights[i] > m.heights[i]);
    assert(p.stats.changed >= 16 && p.stats.deposited >= 48 && added.length >= 8,
      `visible apron: ${c.id} ${seed} ${JSON.stringify({ ...p.stats, raised: added.length })}`);
    let balance = 0;
    for (let i = 0; i < m.heights.length; i++) {
      balance += p.map.heights[i] - m.heights[i];
      assert(p.map.heights[i] >= Math.min(s.floor, m.heights[i]) && p.map.heights[i] <= m.maxHeight);
    }
    assert.equal(balance, 0); assert.equal(p.stats.balance, 0);
    assert.equal(digest(plan(m, s, { click }).operation), digest(p.operation), "deterministic click");
    assert.equal(digest(replay(m, p.operation)), digest(p.map), "literal click replay");
    assert.equal(digest(m), original, "input unchanged"); assert.equal(digest(snapshotMap(m)), original, "byte-exact undo snapshot");
    // Stratified water checks plus every boundary/peak; the full setting sweep also settles
    // every gesture. A random sample is evidence, not a proof over all possible future maps.
    if (k % 16 === 0 || k >= 256) {
      waterChecks.push({ m, s, click });
    }
    minimumChanged = Math.min(minimumChanged, p.stats.changed); minimumVolume = Math.min(minimumVolume, p.stats.deposited);
    minimumRaised = Math.min(minimumRaised, added.length); low = Math.min(low, p.stats.changed);
    placements[p.placement] = (placements[p.placement] ?? 0) + 1; count++;
  }
  results.push({ case: c.id, clicks: 256 + boundaries.length, minimumChanged: low }); console.log(c.id, "clicks checked");
}
for (const { m, s, click } of waterChecks) {
  const p = plan(m, s, { click }), water = settle(p);
  assert(water.settled || water.steady, "click water converges");
  assert.equal(startProblem(p.map), null, "valid start after click settlement"); settled++;
}
const result = { randomClicks: count - 27, boundaryAndPeakClicks: 27, noops: 0, floor: 1,
  powers: [0, 1, 35, 100], sizes: ["Auto", 4, 22, 64], channels: ["Auto", "Few", "Many"],
  minimumChanged, minimumVolume, minimumRaised, waterSettlements: settled, placements, cases: results,
  worstPlanMs: +worstMs.toFixed(1), totalSeconds: +((performance.now() - began) / 1000).toFixed(2) };
writeFileSync("checks/clicks.json", JSON.stringify(result, null, 2) + "\n"); console.log(result);
