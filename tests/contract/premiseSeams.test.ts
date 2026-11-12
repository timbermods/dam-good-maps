// The premise stages' seams (docs/PREMISES.md §2.2 "Seams"): each optional, so a premise that gives none (the lake
// stair) is built byte for byte as before (premiseMap.test.ts keeps its pinned sha256). One test a seam, on small
// fixtures: a width per channel point (`Link.halves`, `raster/channels.ts` `halfAt`); a backwater (`Body.backwater`:
// `levels.ts` `route` gives its link no share, `waterChecks.ts` `levelsOf` reads it at its sill); a premise's own stage 1
// and stage 2 (`PremiseDef.water`, `PremiseDef.land`) and the `ground` invariants (`StageContext.heights`); a wet link into
// a dry link's bed (`Link.joins`: `route` gives the bed `wetFrom`, `raster/channels.ts` lays it wet from there down).

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { firstWater } from "../../src/core/premise/draw";
import { generatePremise } from "../../src/core/premise/generate";
import { waterTable } from "../../src/core/premise/levels";
import { premiseLand } from "../../src/core/premise/map";
import { lakeStair } from "../../src/core/premise/premises/lakeStair";
import { halfAt } from "../../src/core/premise/raster/channels";
import type { Body, Invariant, Link, PremiseDef, PremisePlan } from "../../src/core/premise/types";
import { pathLength } from "../../src/core/premise/geom";
import { levelsOf } from "../../src/core/premise/waterChecks";
import { waterByNumber } from "../../src/core/premise/water";
import { writeTimber } from "../../src/core/format/timber";
import { makeSpec } from "../../src/core/spec/mapspec";

const fixture = JSON.parse(readFileSync("tests/fixtures/four-lakes.plan.json", "utf8")) as PremisePlan;

describe("a width per channel point (`Link.halves`)", () => {
  const base: Link = { id: "b", from: "a", to: "c", kind: "brook", path: [[0, 0], [10, 0], [20, 0]], half: 1, wet: true, gates: [], rows: [] };

  it("reads the width between the points, straight; absent, the one `half` the whole way", () => {
    const l: Link = { ...base, halves: [0.5, 2, 1] };
    expect(halfAt(l, 0)).toBe(0.5);
    expect(halfAt(l, 5)).toBeCloseTo(1.25, 9);
    expect(halfAt(l, 10)).toBe(2);
    expect(halfAt(l, 15)).toBeCloseTo(1.5, 9);
    expect(halfAt(l, 30)).toBe(1);
    for (const s of [0, 5, 15, 30]) expect(halfAt(base, s)).toBe(1);
    // (a list that does not match the path is not read)
    expect(halfAt({ ...base, halves: [0.5, 2] }, 5)).toBe(1);
  });

  it("lays a narrower bed where the widths say so, on stage 1's raster", () => {
    const plan: PremisePlan = JSON.parse(JSON.stringify(fixture));
    const brook = plan.links.find((l) => l.id === "birchBrook")!;
    const before = waterByNumber(plan).raster;
    const li = plan.links.indexOf(brook) + 1;
    const count = (r: typeof before) => r.channel.reduce((n, c) => n + (c === li ? 1 : 0), 0);
    brook.halves = brook.path!.map((_, k) => (k % 2 ? 0.5 : brook.half ?? 1));
    const after = waterByNumber(plan).raster;
    expect(count(after)).toBeLessThan(count(before));
  });
});

describe("a backwater (`Body.backwater`)", () => {
  // a side pool beside Mill Lake (lake1, sill 9) joined by a one-wide inlet, as the Gate's Still Pool
  const withPool = (back: boolean): PremisePlan => {
    const plan: PremisePlan = JSON.parse(JSON.stringify(fixture));
    const pool: Body = { id: "side", kind: "kettle", sill: 9, arms: [[[84, 86, 2.2], [81, 84, 2]]], meadow: 4, deep: 1, dry: false, region: "low", ...(back ? { backwater: true } : {}) };
    plan.bodies.push(pool);
    plan.links.push({ id: "sideInlet", from: "lake1", to: "side", kind: "channel", path: [[91, 91], [86, 87.5]], half: 0.5, bed: [9, 9], wet: true, gates: [], rows: [] });
    return plan;
  };

  it("takes no share of its feeder's flow, stands at the feeder's level and keeps its link wet", () => {
    const plain = waterTable(fixture);
    const was = waterTable(withPool(false));
    const t = waterTable(withPool(true));
    expect(was.links.sideInlet.flow).toBeGreaterThan(0);
    expect(t.links.sideInlet.flow).toBe(0);
    expect(t.links.sideInlet.wet).toBe(true);
    expect(t.bodies.side.dry).toBe(false);
    expect(t.bodies.side.level).toBeCloseTo(t.bodies.lake1.level, 9);
    // (the rest of the river as if it were not there)
    for (const id of Object.keys(plain.links)) expect(t.links[id].flow).toBeCloseTo(plain.links[id].flow, 9);
  });

  it("is read at its sill by `water.levels`, not at its rim as a pond a work fills", () => {
    const want = (plan: PremisePlan) => levelsOf(plan, waterByNumber(plan)).find((b) => b.id === "side")!.want;
    expect(want(withPool(false))).toBe(10);
    expect(want(withPool(true))).toBe(9);
  });
});

describe("a premise's own stages (`PremiseDef.water`, `PremiseDef.land`) and the `ground` invariants", () => {
  it("runs a premise's own stage 1 and stage 2 where it gives them, and judges its ground; the lake stair's bytes as before", () => {
    const spec = makeSpec({ seed: 1, size: { x: 128, y: 128 }, theme: "any", premise: "lakeStair" });
    let water = 0;
    let land = 0;
    let ground = 0;
    const onGround: Invariant = {
      id: "seam.ground",
      at: "ground",
      test(ctx) {
        ground++;
        return ctx.heights && ctx.heights.length === ctx.plan.W * ctx.plan.H ? { ok: true } : { ok: false, reason: "no ground" };
      },
    };
    const def: PremiseDef = {
      ...lakeStair,
      invariants: [...lakeStair.invariants, onGround],
      water: (plan) => (water++, waterByNumber(plan)),
      land: (plan, w, style, bench, reach) => (land++, premiseLand(plan, w, style, bench, reach)),
    };
    expect("reason" in firstWater(def, spec)).toBe(false);
    expect(water).toBeGreaterThan(0);
    const own = generatePremise(spec, {}, def);
    const plain = generatePremise(spec);
    if ("reason" in own || "reason" in plain) throw new Error("no lake stair map");
    expect(land).toBeGreaterThan(0);
    expect(ground).toBeGreaterThan(0);
    const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
    expect(sha(writeTimber(own.result.file))).toBe(sha(writeTimber(plain.result.file)));
  });
});

describe("a wet link into a dry link's bed (`Link.joins`)", () => {
  // Four Lakes' south run (wet, from tarn 4) joining the dry bypass where it passes, instead of leaving by the edge
  const joined = (): { plan: PremisePlan; at: number } => {
    const plan: PremisePlan = JSON.parse(JSON.stringify(fixture));
    const bypass = plan.links.find((l) => l.id === "bypass")!;
    const run = plan.links.find((l) => l.id === "southRun")!;
    const at = pathLength(bypass.path!.slice(0, 15));
    run.joins = { link: "bypass", at };
    return { plan, at };
  };

  it("carries the joining water down the dry bed from the join, the rest of the table as it was", () => {
    const plain = waterTable(fixture);
    const { plan, at } = joined();
    const t = waterTable(plan);
    expect(plain.links.bypass.wet).toBe(false);
    expect(t.links.bypass.wet).toBe(true);
    expect(t.links.bypass.wetFrom).toBe(at);
    expect(t.links.bypass.flow).toBeCloseTo(t.links.southRun.flow, 9);
    expect(t.links.southRun.flow).toBeGreaterThan(0);
    for (const id of Object.keys(plain.links)) if (id !== "bypass") expect(t.links[id].flow).toBeCloseTo(plain.links[id].flow, 9);
    expect(plain.links.bypass.wetFrom).toBeUndefined();
  });

  it("lays the bed wet from the join down (no wadi there), its wadi above as before", () => {
    const { plan, at } = joined();
    const before = waterByNumber(fixture).raster;
    const after = waterByNumber(plan).raster;
    const li = plan.links.findIndex((l) => l.id === "bypass") + 1;
    // (the wadi's strips: fixed ground beside the bed, out of every water)
    const strip = (r: typeof before, i: number) => r.fixed[i] && !r.channel[i] && !r.lake[i] && !r.pool[i];
    const nearBed = (r: typeof before, i: number, below: boolean) => {
      const x = i % r.W;
      for (let dy = -2; dy <= 2; dy++)
        for (let dx = -2; dx <= 2; dx++) {
          const j = i + dy * r.W + dx;
          if (x + dx < 0 || x + dx >= r.W || j < 0 || j >= r.W * r.H || r.channel[j] !== li) continue;
          if (below ? r.along[j] > at + 3 : r.along[j] < at - 3) return true;
        }
      return false;
    };
    let gone = 0;
    let goneAbove = 0;
    for (let i = 0; i < before.W * before.H; i++) {
      if (!strip(before, i) || strip(after, i)) continue;
      if (nearBed(before, i, true)) gone++;
      if (nearBed(before, i, false) && !nearBed(before, i, true)) goneAbove++;
    }
    expect(gone).toBeGreaterThan(0);
    expect(goneAbove).toBe(0);
  });
});
