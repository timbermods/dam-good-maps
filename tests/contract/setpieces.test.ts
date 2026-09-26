// Set-piece range tests (ROADMAP M5 acceptance, PLAN §9.10): a 20-wide waterfall fits on 96², 128²
// and 256²; on 48² it is reduced to 19, with a report; drops above 15 are reduced; the lip's width
// is measured as PLAN §9.2 defines it. Also the other builders' reductions, and that every piece
// builds, drains and validates on a generated map.

import { describe, expect, it } from "vitest";
import { MapSession } from "../../src/core/doc/session";
import { planContextOf, planPiece } from "../../src/core/doc/tools";
import { buildMap } from "../../src/core/features/build";
import { flowBudget, planSetPiece, type PlanRecord } from "../../src/core/features/setpieces";
import { lipTiles, measureLip, type StandalonePlan } from "../../src/core/features/setpieces/waterfall";
import type { RiverFeature, SetPieceFeature } from "../../src/core/features/schema";
import { generate } from "../../src/core/gen/generate";
import { makeSpec } from "../../src/core/spec/mapspec";

function session(side: number, seed: number): MapSession {
  const r = generate(makeSpec({ seed, size: { x: side, y: side } }));
  return MapSession.fromGenerated(r);
}

/** A standalone fall facing north: the first lip on a coarse grid, from the north edge down to
 *  `southOf` (the north third by default), where the builder can place it without moving it. */
function northFall(s: MapSession, request: PlanRecord, southOf?: number): { ops: Parameters<MapSession["applyAll"]>[0]; feature: SetPieceFeature } {
  const { x: W, y: H } = s.size;
  for (let y = H - 10; y >= (southOf ?? Math.floor((2 * H) / 3)); y -= 3)
    for (let dx = 0; dx <= W / 2; dx += 4)
      for (const x of dx ? [Math.floor(W / 2) + dx, Math.floor(W / 2) - dx] : [Math.floor(W / 2)]) {
        const r = planPiece(s, "waterfall", { mode: "standalone", facing: "north", ...request, lip: [x, y] }, `11111111-2222-4333-8444-${String(x * 1000 + y).padStart(12, "0")}`);
        if (r.ok && !r.report.some((l: string) => l.startsWith("moved"))) return { ops: r.ops, feature: r.feature as SetPieceFeature };
      }
  throw new Error("no place for the fall");
}

describe("a 20-wide standalone waterfall fits on 96², 128² and 256²", () => {
  // (seeds whose land lets the fall's water settle within the check's 4 days: on 128² seed 4 at
  // generator 0.7.0 it fills a closed hollow for longer, as maps may, D152)
  it.each([
    [96, 3],
    [128, 5],
    [256, 5],
  ])("%i² (seed %i): width 20 kept, the whole lip carries water, the map validates", (side, seed) => {
    const s = session(side, seed);
    const { ops, feature } = northFall(s, { width: 20, drop: 6, flow: "steady" });
    const plan = feature.params.plan as unknown as StandalonePlan;
    expect(plan.width).toBe(20);
    expect(feature.params.report.join(" ")).not.toMatch(/Width .* reduced/);
    expect(plan.flow).toBe(2);
    expect(plan.drop).toBe(6);
    const res = s.applyAll(ops, "user", "Add waterfall");
    expect(res.errors).toEqual([]);
    // the incremental rebuild equals a full one
    const full = s.fullBuild();
    expect(Buffer.from(s.built.heights).equals(Buffer.from(full.heights))).toBe(true);
    // PLAN §9.2: every lip tile wet (depth > 0.001) with a drop of at least 1.5; about 0.3·S/W deep
    const m = measureLip(feature, side, s.built.heights, s.built.water)!;
    expect(m.width).toBe(20);
    expect(m.drop).toBeGreaterThanOrEqual(1.5);
    expect(m.depth).toBeGreaterThan(0.8 * ((0.3 * 2) / 20));
    expect(m.depth).toBeLessThan(1.25 * ((0.3 * 2) / 20));
    // the fall's water drains, and the edit made no load problem
    const v = s.validate("export");
    const failing = v.report.checks.filter((c) => !c.ok && !c.advisory).map((c) => `${c.id}: ${c.message}`);
    expect(failing.filter((c) => /^(file|terrain|entities|slopes|start\.(count|flat|entrance|clear))/.test(c))).toEqual([]);
    expect(v.report.checks.find((c) => c.id === "water.outflow")?.ok).toBe(true);
    expect(v.report.checks.find((c) => c.id === "water.settles")?.ok).toBe(true);
  });
});

describe("on 48² a 20-wide fall is reduced to 19, with a report", () => {
  it("plans 19 wide and says so, and the 19 lip tiles carry water", () => {
    const r = generate(makeSpec({ seed: 1, size: { x: 48, y: 48 } }), { maxAttempts: 1 });
    const s = MapSession.fromGenerated(r);
    // 48² is small: the fall goes wherever it fits clear of the river and the start
    const { ops, feature } = northFall(s, { width: 20, drop: 5, flow: "steady" }, 6);
    const plan = feature.params.plan as unknown as StandalonePlan;
    expect(plan.width).toBe(19);
    expect(feature.params.report).toContain("Width 20 reduced to 19, the largest this map allows (40% of the map side along the lip)");
    // the flow is reduced to the map's whole budget (1.15 blocks/s at 48²), and it says so
    expect(plan.flow).toBe(flowBudget(48, 48));
    expect(feature.params.report.join(" ")).toMatch(/flow 2 reduced to 1\.15, the map's whole flow budget/);
    expect(s.applyAll(ops).errors).toEqual([]);
    expect(measureLip(feature, 48, s.built.heights, s.built.water)!.width).toBe(19);
  });

  it("the limits the builder publishes follow PLAN §9.10", () => {
    const ctx = { W: 48, H: 48, seed: 1, features: [], heights: new Uint8Array(48 * 48).fill(2) };
    const widths = [48, 96, 128, 192, 256].map((side) => planSetPiece("waterfall", { mode: "standalone", lip: [side / 2, side / 2], facing: "north", width: 200, drop: 6 }, { ...ctx, W: side, H: side, heights: new Uint8Array(side * side).fill(2) }, { id: "11111111-2222-4333-8444-555555555555", origin: "user" }));
    expect(widths.map((w) => (w.ok ? (w.feature.params.plan as unknown as StandalonePlan).width : 0))).toEqual([19, 38, 51, 76, 102]);
    expect([48, 96, 128, 192, 256].map((side) => flowBudget(side, side))).toEqual([1.15, 3.03, 3.6, 4.42, 7.21]);
  });
});

describe("drops above 15 are reduced", () => {
  const W = 64;
  const ctx = { W, H: W, seed: 1, features: [], heights: new Uint8Array(W * W).fill(2) };
  it.each([16, 18, 22])("a standalone fall asked to drop %i drops 15, with a report", (drop) => {
    const r = planSetPiece("waterfall", { mode: "standalone", lip: [32, 30], facing: "north", width: 8, drop }, ctx, { id: "11111111-2222-4333-8444-555555555555", origin: "user" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const p = r.feature.params.plan as unknown as StandalonePlan;
    expect(p.drop).toBe(15);
    expect(p.lipLevel).toBe(15);
    expect(r.feature.params.report[0]).toBe(`Drop ${drop} reduced to 15, the largest the game's terrain allows (level 16 is the in-game editor's limit)`);
    // it builds: the lip at 15, banks at 16, the plunge pool at 0, and a 15-level surface drop
    const built = buildMap({ W, H: W, seed: 1, features: [r.feature] });
    const lip = lipTiles(p);
    for (const [x, y] of lip) expect(built.heights[y * W + x]).toBe(15);
    const m = measureLip(r.feature, W, built.heights, built.water)!;
    expect(m.width).toBe(8);
    expect(m.drop).toBeGreaterThan(14);
  });
  it("a drop beyond the hard bound (22, the game's terrain) is rejected", () => {
    const r = planSetPiece("waterfall", { mode: "standalone", lip: [32, 30], facing: "north", width: 8, drop: 23 }, ctx, { id: "11111111-2222-4333-8444-555555555555", origin: "user" });
    expect(r.ok).toBe(false);
  });
  it("an on-river fall asked to drop 16 drops at most what its river's bed allows downstream", () => {
    // a river and a place along it whose bed has room below it (generator 0.7.0: main rivers often
    // cut to level 0, and the land's own falls take their stretch of a river)
    const s = session(96, 4);
    const plan = (river: RiverFeature, at: number) => planPiece(s, "waterfall", { mode: "on-river", river: river.id, at, drop: 16 }, "11111111-2222-4333-8444-555555555555");
    const places = s.features.filter((f): f is RiverFeature => f.kind === "river").flatMap((f) => [30, 40, 50, 60, 70].map((at) => ({ river: f, at })));
    const place = places.find((p) => plan(p.river, p.at).ok)!;
    expect(place).toBeDefined();
    const river = place.river;
    const r = plan(river, place.at);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const drop = Number(r.feature.params.plan.drop);
    expect(drop).toBeLessThanOrEqual(15);
    expect(r.feature.params.report[0]).toMatch(/^Drop 16 reduced to \d+/);
    expect(s.applyAll(r.ops).errors).toEqual([]);
    const after = s.features.find((f): f is RiverFeature => f.id === river.id)!;
    const bed = after.params.bedProfile;
    expect(bed.start - bed.steps.reduce((a, st) => a + st.drop, 0)).toBeGreaterThanOrEqual(0);
  });
});

describe("the lip's width is measured as PLAN §9.2 defines it", () => {
  const W = 64;
  const ctx = { W, H: W, seed: 1, features: [], heights: new Uint8Array(W * W).fill(2) };
  const fall = (flow: number, width: number) => {
    const r = planSetPiece("waterfall", { mode: "standalone", lip: [32, 28], facing: "east", width, drop: 5, flow, exactFlow: true }, ctx, { id: "11111111-2222-4333-8444-555555555555", origin: "user" });
    if (!r.ok) throw new Error(r.errors.join("; "));
    return { f: r.feature, b: buildMap({ W, H: W, seed: 1, features: [r.feature] }) };
  };
  it("counts the lip tiles with water (depth > 0.001) and a drop of 1.5 or more to the tile below", () => {
    const { f, b } = fall(2, 12);
    const p = f.params.plan as unknown as StandalonePlan;
    let count = 0;
    for (const [x, y] of lipTiles(p)) {
      const i = y * W + x;
      const j = i + 1; // facing east: the tile below the lip is x + 1
      if (b.water[i] > 0.001 && b.heights[i] + b.water[i] - (b.heights[j] + b.water[j]) >= 1.5) count++;
    }
    expect(measureLip(f, W, b.heights, b.water)!.width).toBe(count);
    expect(count).toBe(12);
  });
  it("the sheet is about 0.3·S/W deep: 0.03 at S = 2 and 0.12 at S = 8 on a 20-wide lip", () => {
    for (const [flow, want] of [
      [2, 0.03],
      [8, 0.12],
    ]) {
      const { f, b } = fall(flow, 20);
      const m = measureLip(f, W, b.heights, b.water)!;
      expect(m.width).toBe(20);
      expect(Math.abs(m.depth - want)).toBeLessThan(0.1 * want);
    }
  });
  it("a lip with no water under it measures 0", () => {
    const { f, b } = fall(2, 12);
    expect(measureLip(f, W, b.heights, new Float64Array(W * W))!.width).toBe(0);
  });
});

describe("the other builders reduce to their ranges and report it", () => {
  const s = session(128, 4);
  const river = s.features.find((f): f is RiverFeature => f.kind === "river")!;
  it("dam site: a crest above 4 is reduced to 4", () => {
    const r = planPiece(s, "damSite", { river: river.id, at: 40, crest: 7 }, "11111111-2222-4333-8444-000000000001");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.feature.params.plan.crest).toBe(4);
      expect(r.report[0]).toMatch(/^Crest 7 reduced to 4/);
    }
  });
  it("gorge: width, length and wall height to 3–9, 6–40 and 2+", () => {
    // (below the start's reach on this map: a gorge's walls may not cover the start's area)
    const r = planPiece(s, "gorge", { river: river.id, from: 110, length: 60, width: 12, wallHeight: 1, access: "stairs" }, "11111111-2222-4333-8444-000000000002");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const p = r.feature.params.plan;
    expect([p.width, Number(p.to) - Number(p.from), p.wallHeight]).toEqual([9, 40, 2]);
    expect(r.report.slice(0, 3)).toEqual([
      "Length 60 reduced to 40, the largest a gorge has (PLAN §9.9)",
      "Width 12 reduced to 9, the largest a gorge has (PLAN §9.9)",
      "Wall height 1 raised to 2, the smallest fits under level 16 here",
    ]);
  });
  it("terraced cliffs: 3–6 bands, 6–12 deep", () => {
    const ctx = planContextOf(s);
    const r = planSetPiece("terracedCliffs", { at: [20, 110], facing: "south", bands: 9, depth: 3, width: 12 }, ctx, { id: "11111111-2222-4333-8444-000000000003", origin: "user" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.feature.params.report.slice(0, 2)).toEqual(["Bands 9 reduced to 6, the largest terraced cliffs have (PLAN §9.3)", "Band depth 3 raised to 6, the smallest terraced cliffs have (PLAN §9.3)"]);
    expect(r.feature.params.plan.depth).toBe(6);
    // and never above level 16
    const p = r.feature.params.plan;
    expect(Number(p.base) + Number(p.bands)).toBeLessThanOrEqual(16);
  });
  it("badwater basin: strength 1–3", () => {
    const ctx = planContextOf(s);
    const r = planSetPiece("badwaterBasin", { mode: "basin", at: [110, 110], strength: 5 }, ctx, { id: "11111111-2222-4333-8444-000000000004", origin: "user" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.feature.params.plan.strength).toBe(3);
  });
});
