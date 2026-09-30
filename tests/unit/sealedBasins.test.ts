// Sealed basins' evaporation is not the water changing (PLAN §20 D222, #72 changed): a sealed
// oxbow lake that is only evaporating has settled, so the editor's quiet dot and `water.settles`
// say so; water still flowing (a filling basin, a lake drained by its river, a river still
// advancing) is still changing. The judgement never changes the water: the canonical settle stops
// on the tick its own test gives, so its water (and every file) is what it always was. The Python
// oracle (prototype/watersim.py) makes the same judgement on the same ticks.

import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { canonicalSettle, prefill } from "../../src/core/sim/prefill";
import { PREVIEW_CHECK, previewSettle } from "../../src/core/sim/preview";
import { sealedTiles, settle, SETTLE_DAYS, steadyApartFromSealed, TICKS_PER_DAY, waterSteady, WaterSim, type Emitter, type WaterModel } from "../../src/core/sim/water";

/** Python with numpy, for the oracle's side (CI has it; a machine without it skips). */
const PY = (() => {
  for (const exe of [process.env.PYTHON ?? "python", "python3"]) {
    const r = spawnSync(exe, ["-c", "import numpy"], { encoding: "utf8" });
    if (!r.error && r.status === 0) return exe;
  }
  return null;
})();

// A plateau at level 8: a spring-fed channel (rows 5–6) steps down to the east edge, where its water
// leaves the map; a basin at level 4 (rows 10–12, x 8–27), walled by the plateau and away from the
// edges, holds the water a carve kept when it sealed the bend (`RetainedWater`).
const W = 40;
const H = 16;
const spring: Emitter = { cells: [5 * W + 2, 6 * W + 2], strength: 2, contamination: 0 };
const basin: number[] = [];
for (let y = 10; y <= 12; y++) for (let x = 8; x <= 27; x++) basin.push(y * W + x);

function land(): Float64Array {
  const floor = new Float64Array(W * H).fill(8);
  for (let y = 5; y <= 6; y++) for (let x = 1; x < W; x++) floor[y * W + x] = 5 - Math.floor(x / 14);
  for (const i of basin) floor[i] = 4;
  return floor;
}

/** The map with its sealed lake `lake` deep, and more sources if given. */
function mapWith(lake: number, more: Emitter[] = [], floor = land()): WaterModel {
  return {
    W,
    H,
    floor,
    dam: null,
    emitters: [spring, ...more],
    retained: [{ tiles: basin, floor: basin.map((i) => floor[i]), depth: basin.map(() => lake), contamination: basin.map(() => 0) }],
  };
}

const sealed = sealedTiles(mapWith(2))!;
const TOL = 0.005;
const SHARE = 0.005;

describe("the judgement: only real flow is the water still changing", () => {
  // the settled water with the lake 2 deep, and the lake a check's evaporation lower
  const m = mapWith(2);
  const before = canonicalSettle(m).depth.slice();
  const vol = (d: Float64Array) => d.reduce((a, b) => a + b, 0);
  const judge = (model: WaterModel, now: Float64Array, prev = before) => steadyApartFromSealed(new WaterSim(model, { depth: now, contamination: new Float64Array(W * H) }), prev, vol(now), sealed, TOL, SHARE);
  const dried = () => {
    const d = before.slice();
    for (const i of basin) d[i] -= 0.009;
    return d;
  };

  it("a sealed lake only evaporating is steady, where the settle's own test is not", () => {
    const now = dried();
    let moved = 0;
    for (let i = 0; i < W * H; i++) if (Math.abs(now[i] - before[i]) > TOL) moved++;
    expect(moved).toBe(basin.length);
    expect(moved).toBeGreaterThan(SHARE * W * H);
    expect(judge(m, now)).toBe(true);
  });

  it("flow anywhere else still counts", () => {
    const now = dried();
    for (let x = 20; x < 30; x++) now[5 * W + x] += 0.05; // the river still rising
    expect(judge(m, now)).toBe(false);
  });

  it("a lake a running source feeds is not sealed: its water counts", () => {
    const fed = mapWith(2, [{ cells: [11 * W + 15], strength: 0.05, contamination: 0 }]);
    expect(judge(fed, dried())).toBe(false);
  });

  it("a lake joined to its river (wet ground between them) is not sealed: its water counts", () => {
    const now = dried();
    const prev = before.slice();
    for (const y of [7, 8, 9]) {
      now[y * W + 12] = 0.3;
      prev[y * W + 12] = 0.3;
    }
    expect(judge(m, now, prev)).toBe(false);
  });

  it("a lake reaching the map edge drains off it: its water counts", () => {
    const floor = land();
    for (let x = 0; x < 8; x++) floor[11 * W + x] = 4;
    const edge = mapWith(2, [], floor);
    const now = dried();
    const prev = before.slice();
    for (let x = 0; x < 8; x++) {
      now[11 * W + x] = 1.5;
      prev[11 * W + x] = 1.6;
    }
    expect(judge(edge, now, prev)).toBe(false);
  });

  it("water still running inside a sealed basin counts: its tiles that rose", () => {
    const now = before.slice();
    for (const i of basin) now[i] += i % W < 18 ? -0.06 : 0.05; // one end draining into the other
    expect(judge(m, now)).toBe(false);
  });
});

describe("the canonical settle: steady apart from a drying lake, and its water unchanged", () => {
  it("an evaporating sealed lake: the water has settled (`water.settles`), on the same ticks and bytes as ever", () => {
    const m = mapWith(2);
    const c = canonicalSettle(m);
    // its own test never passes (the lake's 60 tiles drop by about 0.009 a check) …
    expect(c.settled).toBe(false);
    // (it runs to the settle's limit, 6 game days since D358)
    expect(c.ticks).toBe(SETTLE_DAYS * TICKS_PER_DAY);
    // … but the flow settled early, and that is what counts
    expect(c.steadyTicks).toBeDefined();
    expect(c.steadyTicks!).toBeLessThanOrEqual(TICKS_PER_DAY);
    expect(waterSteady(c)).toBe(true);
    // the same run without the judgement: the same ticks and exactly the same water
    const sim = new WaterSim(m, prefill(m));
    const plain = settle(sim);
    expect(plain).toEqual({ settled: false, ticks: c.ticks });
    expect(Array.from(sim.D)).toEqual(Array.from(c.depth));
    expect(Array.from(sim.C)).toEqual(Array.from(c.contamination));
    // and the lake is still there, lower: nothing refilled it
    for (const i of basin) {
      expect(c.depth[i]).toBeLessThan(2);
      expect(c.depth[i]).toBeGreaterThan(1.5);
    }
  });

  it("a basin a source is filling is still changing", () => {
    const c = canonicalSettle(mapWith(2, [{ cells: [11 * W + 15], strength: 0.05, contamination: 0 }]));
    expect(c.settled).toBe(false);
    expect(c.steadyTicks).toBeUndefined();
    expect(waterSteady(c)).toBe(false);
  });

  it("a sealed lake opened to its river drains into it: still changing while it does", () => {
    const floor = land();
    for (const y of [7, 8, 9]) floor[y * W + 12] = 4; // a cut from the lake to the channel
    const m = mapWith(2, [], floor);
    const sim = new WaterSim(m, prefill(m));
    const r = settle(sim, { maxDays: (2 * 128) / TICKS_PER_DAY, sealed: sealedTiles(m) });
    expect(r.settled).toBe(false);
    expect(r.steadyTicks).toBeUndefined();
  });

  it("a river still advancing is still changing, sealed lake or not", () => {
    const m = mapWith(2);
    const lakeOnly = new Float64Array(W * H);
    for (const i of basin) lakeOnly[i] = 2;
    const r = settle(new WaterSim(m, { depth: lakeOnly, contamination: new Float64Array(W * H) }), { maxDays: 128 / TICKS_PER_DAY, sealed: sealedTiles(m) });
    expect(r.settled).toBe(false);
    expect(r.steadyTicks).toBeUndefined();
  });

  it("a map without sealed basins settles exactly as before", () => {
    const m: WaterModel = { W, H, floor: land(), dam: null, emitters: [spring] };
    expect(sealedTiles(m)).toBeUndefined();
    const c = canonicalSettle(m);
    const sim = new WaterSim(m, prefill(m));
    expect(c).toMatchObject(settle(sim));
    expect(c.steadyTicks).toBeUndefined();
  });

  it("the editor's preview stops once only the lake still changes", () => {
    // a shallow lake: its evaporation alone moves the map's volume by over 0.2% a check
    const m = mapWith(1);
    const settled = canonicalSettle(m);
    const p = previewSettle({ model: m, water: settled }, m);
    expect(p.settled).toBe(false);
    expect(p.steadyTicks).toBe(PREVIEW_CHECK);
    expect(p.ticks).toBe(PREVIEW_CHECK);
  });
});

describe.skipIf(!PY)("the Python oracle makes the same judgement", () => {
  it("the same pre-fill with the kept lake, the same ticks, the same steady check, the same water", () => {
    // the evaporating lake through the whole canonical settle; the filling basin over a day (the
    // Python simulation takes a few seconds a game day here)
    const cases: { m: WaterModel; days: number | null }[] = [
      { m: mapWith(2), days: null },
      { m: mapWith(2, [{ cells: [11 * W + 15], strength: 0.05, contamination: 0 }]), days: 1 },
    ];
    const input = JSON.stringify(cases.map(({ m, days }) => ({ W, H, floor: Array.from(m.floor), emitters: m.emitters, retained: m.retained, days })));
    const script = [
      "import json, sys",
      "sys.path.insert(0, 'prototype')",
      "import numpy as np",
      "from watersim import WaterSim, canonical_settle, prefill",
      "out = []",
      "for m in json.load(sys.stdin):",
      "    floor = np.array(m['floor'], float).reshape(m['H'], m['W'])",
      "    srcs = [{'tiles': [divmod(i, m['W']) for i in e['cells']], 'strength': e['strength'], 'contamination': e['contamination']} for e in m['emitters']]",
      "    p, c = prefill(floor, srcs, None, m['retained'])",
      "    if m['days'] is None:",
      "        sim, settled = canonical_settle(floor, srcs, None, m['retained'])",
      "    else:",
      "        sim = WaterSim(floor, srcs, depth=p, contamination=c)",
      "        settled = sim.settle(max_days=m['days'], sealed=sorted(m['retained'][0]['tiles']))",
      "    out.append({'prefill': p.ravel().tolist(), 'settled': bool(settled), 'ticks': sim.ticks, 'steady': sim.steady_ticks, 'depth': sim.D.ravel().tolist()})",
      "print(json.dumps(out))",
    ].join("\n");
    const r = spawnSync(PY!, ["-B", "-c", script], { input, encoding: "utf8", maxBuffer: 64 << 20 });
    expect(r.status, r.stderr).toBe(0);
    const py = JSON.parse(r.stdout) as { prefill: number[]; settled: boolean; ticks: number; steady: number | null; depth: number[] }[];
    cases.forEach(({ m, days }, k) => {
      const sim = new WaterSim(m, prefill(m));
      const c = days === null ? canonicalSettle(m) : { ...settle(sim, { maxDays: days, sealed: sealedTiles(m) }), depth: sim.D };
      expect(Array.from(prefill(m).depth)).toEqual(py[k].prefill);
      expect(py[k].settled).toBe(c.settled);
      expect(py[k].ticks).toBe(c.ticks);
      expect(py[k].steady ?? undefined).toBe(c.steadyTicks);
      let worst = 0;
      for (let i = 0; i < W * H; i++) worst = Math.max(worst, Math.abs(py[k].depth[i] - c.depth[i]));
      expect(worst).toBeLessThan(1e-6);
    });
    // the lake settles only by the judgement; the filling basin never does
    expect(py.map((p) => [p.settled, p.steady !== null])).toEqual([
      [false, true],
      [false, false],
    ]);
  });
});
