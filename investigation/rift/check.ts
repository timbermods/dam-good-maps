import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { snapshotMap, type FullForceMap } from "../../src/core/forces/force";
import { footprint, startProblem } from "../../src/core/forces/objects";
import { hash } from "../../src/core/forces/random";
import { CASES, decode } from "./maps";
import { DEFAULTS, plan, reveal, replay, settle, validate, type Settings, type Intent } from "./rift";
const digest = (m: FullForceMap) => {
  const h = createHash("sha256");
  for (const a of [m.heights, m.water.depth, m.water.contamination, m.lava]) h.update(Buffer.from(a.buffer, a.byteOffset, a.byteLength));
  h.update(JSON.stringify([m.W, m.H, m.maxHeight, m.entities, m.rockLayers, m.fallen])); return h.digest("hex");
};
const cases = CASES.map(c => ({ c, m: decode(new Uint8Array(readFileSync(`maps/${c.map}.json.gz`))) }));
const t0 = performance.now();
let count = 0, worstMs = 0, replayChecks = 0, arrivalChecks = 0, carriedStarts = 0;
const settings: Settings[] = [];
for (const walls of ["auto", "sheer", "stepped"] as const)
  for (const power of [0, 1, 35, 70, 100])
    for (const size of [null, 4, 22, 64])
      for (const floor of [1, 3, 12, 22]) settings.push({ ...DEFAULTS, walls, power, size, floor });
for (const { c, m } of cases) {
  const original = digest(m);
  for (let k = 0; k < settings.length; k++) for (const kind of ["click", "path"] as const) {
    const seed = CASES.indexOf(c) * 104729 + k * 2 + (kind === "click" ? 1 : 2);
    const intent: Intent = kind === "click" ?
      { click: { x: hash(seed, 1) * 127, y: hash(seed, 2) * 127 } } :
      { path: Array.from({ length: 8 }, (_, j) => ({ x: hash(seed, j + 10) * 127, y: hash(seed, j + 30) * 127 })) };
    const s = { ...settings[k], seed }, start = performance.now(), p = plan(m, s, intent);
    worstMs = Math.max(worstMs, performance.now() - start);
    for (let i = 0; i < m.heights.length; i++) {
      assert(p.map.heights[i] >= 0 && p.map.heights[i] <= m.maxHeight, "physical bounds");
      assert(p.map.heights[i] <= m.heights[i], "a Rift only drops");
      assert(p.map.heights[i] >= Math.min(m.heights[i], s.floor), "shared Floor");
    }
    assert.equal(digest(m), original, "input unchanged");
    const second = plan(m, s, intent);
    assert.equal(digest(p.map), digest(second.map), "seeded determinism");
    assert.deepEqual(p.operation, second.operation);
    assert.deepEqual(p.arrival, second.arrival);
    assert.equal(digest(replay(m, p.operation)), digest(p.map), "literal replay"); replayChecks++;
    // A history step restores every byte, including water and entity components, at any stage.
    const undo = snapshotMap(m);
    for (const progress of [0, .2, .6, .95, 1]) {
      const shown = reveal(p, progress);
      assert.equal(digest(snapshotMap(undo)), original, "undo byte identity");
      if (progress < 1) {
        assert.deepEqual(shown.water, m.water, "water unchanged before final land");
        for (let i = 0; i < shown.heights.length; i++) if (p.arrival[i] > progress) assert.equal(shown.heights[i], m.heights[i], "land before arrival");
        const shownEntities = new Map(shown.entities.map(e => [e.id, e]));
        for (const e of m.entities) if (footprint(m, e).every(i => p.arrival[i] > progress))
          assert.deepEqual(shownEntities.get(e.id), e, "object before arrival");
        arrivalChecks++;
      }
    }
    const finalEntities = new Map(p.map.entities.map(e => [e.id, e]));
    for (const old of m.entities) {
      const e = finalEntities.get(old.id)!;
      assert(e, "all objects survive"); assert.equal(e.orientation, old.orientation, "upright objects");
      if (e.template !== "StartingLocation") {
        const i = old.y * m.W + old.x;
        assert.equal(e.z - old.z, p.map.heights[i] - m.heights[i], "objects/sources ride ground");
        assert.equal(e.x, old.x); assert.equal(e.y, old.y);
      }
    }
    assert.equal(startProblem(p.map), null, "start on dry level ground");
    if (p.stats.startCarried) carriedStarts++;
    count++;
  }
  console.log(c.id, "random checks", count);
}
const waterCases = [];
for (const { c, m } of cases) {
  const p = plan(m, { ...DEFAULTS, power: c.power, size: c.size }, c.intent), final = snapshotMap(p.map);
  const t = performance.now(); settle(final); const settleMs = performance.now() - t;
  const second = snapshotMap(p.map); settle(second);
  assert.equal(digest(final), digest(second), "water deterministic");
  const captured = p.operation.tiles.filter(i => m.water.depth[i] <= .05 && final.water.depth[i] > .1).length;
  for (const d of final.water.depth) assert(Number.isFinite(d) && d >= 0);
  if (c.id === "river") assert(captured > 20, "river captures new dropped land");
  waterCases.push({ case: c.id, changed: p.stats.changed, drop: p.stats.drop, capturedNewWetTiles: captured, settleMs: +settleMs.toFixed(1) });
}
// A level-zero river cannot be captured beside Floor 1; it must not be raised or invented.
const canyon = decode(new Uint8Array(readFileSync("maps/canyon.json.gz")));
const zero = plan(canyon, { ...DEFAULTS, power: 100, size: 26 }, { path: [{ x: 8, y: 48 }, { x: 91, y: 65 }] });
for (let i = 0; i < canyon.heights.length; i++) if (canyon.heights[i] === 0) assert.equal(zero.map.heights[i], 0);
// Force through the start, and sources, in addition to the random sweep.
for (const { m } of cases) for (const e of m.entities.filter(e => e.template === "StartingLocation" || /Source|Seep/.test(e.template)).slice(0, 6)) {
  const p = plan(m, { ...DEFAULTS, power: 100, size: 32 }, { path: [{ x: Math.max(0, e.x - 20), y: e.y }, { x: Math.min(127, e.x + 20), y: e.y }] });
  assert.equal(startProblem(p.map), null); if (p.stats.startCarried) carriedStarts++;
}
for (const invalid of [{ power: NaN }, { power: 101 }, { floor: 0 }, { floor: 23 }, { size: 2 }, { seed: -1 }])
  assert.throws(() => validate(cases[0].m, { ...DEFAULTS, ...invalid }, CASES[0].intent));
mkdirSync("checks", { recursive: true });
const result = { randomGestures: count, settingsPerCase: settings.length, deterministicPairs: count, literalReplayChecks: replayChecks,
  undoSnapshots: count * 5, arrivalSnapshots: arrivalChecks, carriedStarts, worstPlanMs: +worstMs.toFixed(1), waterCases, totalSeconds: +((performance.now() - t0) / 1000).toFixed(2) };
writeFileSync("checks/core.json", JSON.stringify(result, null, 2) + "\n"); console.log(result);
