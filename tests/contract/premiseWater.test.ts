// The premise model's stage 1, water by number (docs/PREMISES.md §2.2, build step 2): the water table's arithmetic,
// the lip's stair of runs, and the `land` invariants (`flowThrough` on the rastered water alone) on a few seeds of each
// size and on the hand-built Four Lakes, with a broken raster failing each. Settling the water as the game plays it
// is premiseWater.heavy.test.ts's.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { firstWater, failing } from "../../src/core/premise/draw";
import { lipWidth, WATER, waterTable } from "../../src/core/premise/levels";
import { lakeStair } from "../../src/core/premise/premises/lakeStair";
import { lipStair } from "../../src/core/premise/raster/falls";
import { Rng } from "../../src/core/math/rng";
import type { PremisePlan } from "../../src/core/premise/types";
import { waterByNumber, type StageWater } from "../../src/core/premise/water";
import { makeSpec, type MapSpec } from "../../src/core/spec/mapspec";

const fixture = JSON.parse(readFileSync("tests/fixtures/four-lakes.plan.json", "utf8")) as PremisePlan;

const spec = (seed: number, side: number): MapSpec => {
  const s = makeSpec({ seed, size: { x: side, y: side }, theme: "any" });
  s.premise = "lakeStair";
  return s;
};

const fixtureSpec = (): MapSpec => {
  const s = spec(fixture.seed, fixture.W);
  s.settings.terrain.highestTerrain = fixture.top;
  return s;
};

const landFails = (s: MapSpec, plan: PremisePlan, water: StageWater) => failing(lakeStair.invariants, "land", { spec: s, plan, water }).map((f) => `${f.id}: ${f.reason}`);

describe("The water table (§2.2, stage 1)", () => {
  const t = waterTable(fixture);

  it("stands each lake 0.05 to 0.6 over its sill, and each dry body at its sill", () => {
    for (const b of fixture.bodies) {
      const r = t.bodies[b.id];
      if (r.dry) expect(r.level, b.id).toBe(b.sill);
      else if (b.kind === "lake") {
        expect(r.level - b.sill, b.id).toBeGreaterThanOrEqual(0.05);
        expect(r.level - b.sill, b.id).toBeLessThanOrEqual(0.6);
      }
    }
  });

  it("carries every source's water down the graph, none lost", () => {
    for (const b of fixture.bodies) {
      const r = t.bodies[b.id];
      let into = fixture.sources.filter((s) => s.into === b.id).reduce((a, s) => a + s.strength, 0);
      for (const l of fixture.links) if (l.to === b.id) into += t.links[l.id].flow;
      expect(r.inflow, b.id).toBeCloseTo(into, 6);
      // (less what a spring standing in an outlet adds: the badwater spring in the gorge)
      const out = r.outlets.reduce((a, id) => a + t.links[id].flow - fixture.sources.filter((s) => s.into === id).reduce((q, s) => q + s.strength, 0), 0);
      if (!r.dry) expect(out, b.id).toBeCloseTo(r.inflow, 6);
    }
    // (every block a second leaves by an exit: the gorge, the runs off the map)
    const total = fixture.sources.reduce((a, s) => a + s.strength, 0);
    const exits = new Set(fixture.exits.map((e) => e.id));
    const out = fixture.links.filter((l) => exits.has(l.to)).reduce((a, l) => a + t.links[l.id].flow, 0);
    expect(out).toBeCloseTo(total, 6);
  });

  it("sizes each stair fall's lip by its flow, 8 to 16 tiles", () => {
    for (const l of fixture.links) {
      if (!l.fall || l.path) continue;
      const w = t.links[l.id].width;
      expect(w, l.id).toBe(lipWidth(t.links[l.id].flow));
      expect(w).toBeGreaterThanOrEqual(WATER.lipLeast);
      expect(w).toBeLessThanOrEqual(16);
    }
  });

  it("shuts every link a row spans, and leaves the bodies only they feed dry", () => {
    for (const l of fixture.links) if (l.rows.length) expect(t.links[l.id].flow, l.id).toBe(0);
    expect(t.bodies.tarn0.dry).toBe(true);
    expect(t.bodies.tarn3.dry).toBe(true);
  });
});

describe("A lip's stair of runs (§4.3)", () => {
  it("runs one to three tiles each way by turns, within a tile of its line, never all alike", () => {
    const rng = new Rng(7);
    for (let k = 0; k < 400; k++) {
      const a = rng.range(0, Math.PI * 2);
      const len = rng.range(8, 16);
      const P0: [number, number] = [50, 50];
      const P1: [number, number] = [50 + len * Math.cos(a), 50 + len * Math.sin(a)];
      const st = lipStair(P0, P1, [-Math.sin(a), Math.cos(a)], new Rng(k));
      const m = st.c1 - st.c0 + 1;
      const b = 1 - st.a;
      const span = P1[st.a] - P0[st.a];
      const ideal = (c: number) => P0[b] + ((P1[b] - P0[b]) * (c + 0.5 - P0[st.a])) / span;
      const runs: number[] = [];
      const steps: number[] = [];
      let run = 1;
      for (let c = 1; c < m; c++) {
        const v = Math.abs(st.t[c] - st.t[c - 1]);
        expect(v).toBeLessThanOrEqual(3);
        if (v === 0) run++;
        else {
          runs.push(run);
          steps.push(v);
          run = 1;
        }
        expect(Math.abs(st.t[c] - ideal(st.c0 + c))).toBeLessThanOrEqual(1.5);
      }
      runs.push(run);
      // (near square to the grid a lip is one straight run with a step where its line asks for one)
      if (m > 1 && Math.abs(ideal(st.c1) - ideal(st.c0)) / (m - 1) >= 1 / 3) for (const r of runs.slice(1, -1)) expect(r).toBeLessThanOrEqual(3);
      const slope = Math.abs(Math.tan(a));
      // (unequal: the runs one way or the other are not all one length)
      if (slope > 0.4 && slope < 2.5 && runs.length >= 4) expect(new Set(runs).size + new Set(steps).size, `angle ${a.toFixed(2)}`).toBeGreaterThan(2);
    }
  });

  it("keeps the landmark's lip across the look within 15°", () => {
    for (const side of [128, 192, 256])
      for (const seed of [1, 2, 3]) {
        const r = firstWater(lakeStair, spec(seed, side));
        if ("reason" in r) throw new Error(r.reason);
        const lm = r.plan.links.find((l) => l.id === r.plan.frame.landmark)!;
        const tiles = r.water.raster.lips[lm.id];
        const W = r.plan.W;
        // (the lip tiles' own line: their principal axis)
        const xs = tiles.map((i) => i % W);
        const ys = tiles.map((i) => Math.floor(i / W));
        const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
        const my = ys.reduce((a, b) => a + b, 0) / ys.length;
        let sxx = 0;
        let syy = 0;
        let sxy = 0;
        for (let k = 0; k < xs.length; k++) {
          sxx += (xs[k] - mx) ** 2;
          syy += (ys[k] - my) ** 2;
          sxy += (xs[k] - mx) * (ys[k] - my);
        }
        const built = 0.5 * Math.atan2(2 * sxy, sxx - syy);
        const [p, q] = lm.fall!.lip;
        const planned = Math.atan2(q[1] - p[1], q[0] - p[0]);
        let d = Math.abs(built - planned) % Math.PI;
        if (d > Math.PI / 2) d = Math.PI - d;
        expect((d * 180) / Math.PI, `seed ${seed} at ${side}²`).toBeLessThanOrEqual(15);
      }
  });
});

describe("The land invariants of stage 1 (§7 step 2)", () => {
  it("hold on the first water of seeds 1 to 4 at each size, within two re-draws", () => {
    for (const side of [128, 192, 256])
      for (let seed = 1; seed <= 4; seed++) {
        const s = spec(seed, side);
        const r = firstWater(lakeStair, s);
        if ("reason" in r) throw new Error(r.reason);
        expect(r.attempt, `seed ${seed} at ${side}²: ${r.failed.map((f) => f.id).join(", ")}`).toBeLessThanOrEqual(2);
        expect(landFails(s, r.plan, r.water)).toEqual([]);
      }
  });

  it("hold on the hand-built Four Lakes", () => {
    expect(landFails(fixtureSpec(), fixture, waterByNumber(fixture))).toEqual([]);
  });

  it("is deterministic: the same plan, the same bytes", () => {
    const a = waterByNumber(fixture).raster;
    const b = waterByNumber(fixture).raster;
    expect(Buffer.from(a.heights).equals(Buffer.from(b.heights))).toBe(true);
    expect(Buffer.from(a.lake).equals(Buffer.from(b.lake))).toBe(true);
    expect(Buffer.from(a.channel).equals(Buffer.from(b.channel))).toBe(true);
  });

  it("fail where the guard is broken, a row is gone, a sill is cut or a lip is lowered", () => {
    const s = fixtureSpec();
    const ids = (w: StageWater) => failing(lakeStair.invariants, "land", { spec: s, plan: fixture, water: w }).map((f) => f.id);
    const W = fixture.W;
    // a gap in the guard beside the top lake, to the bare ground beyond
    {
      const w = waterByNumber(fixture);
      const r = w.raster;
      const k = fixture.bodies.findIndex((b) => b.id === "lake3") + 1;
      let gap = -1;
      for (let i = W; i < W * (fixture.H - 1) && gap < 0; i++)
        if (!r.lake[i] && !r.channel[i] && r.heights[i] > 0 && r.lake[i - W] === k && r.heights[i + W] === 0 && !r.lake[i + W] && !r.channel[i + W]) gap = i;
      expect(gap).toBeGreaterThan(0);
      r.heights[gap] = 0;
      expect(ids(w)).toContain("water.exits");
    }
    // the springs' leat row gone: the basin it shuts fills
    {
      const w = waterByNumber(fixture);
      w.raster.rows.westLeat = [];
      expect(ids(w)).toContain("water.rows");
    }
    // a stair fall's crest cut a level: its lake stands a level low
    {
      const w = waterByNumber(fixture);
      const r = w.raster;
      for (const i of r.lips.fall2) r.heights[i] -= 1;
      const k = fixture.links.findIndex((l) => l.id === "fall2") + 1;
      for (let i = 0; i < W * fixture.H; i++) if (r.crest[i] === k) r.heights[i] = Math.min(r.heights[i], fixture.links[k - 1].fall!.crest - 1);
      expect(ids(w)).toContain("water.levels");
    }
    // a lip a tile short of its width
    {
      const w = waterByNumber(fixture);
      w.raster.lips.fall3 = w.raster.lips.fall3.slice(0, w.table.links.fall3.width - 1);
      expect(ids(w)).toContain("water.falls");
    }
  });
});
