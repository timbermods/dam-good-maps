// The wall with one gate's maps (docs/PREMISES.md §5.1): plan, water, land, stage 3's start, the ladder, one build and
// its checks (`gateMap.ts`), on seeds 2 and 4 at 128² and seed 1 at 192² and 256². Every land invariant and every works
// invariant but the floors (a short rung is said) holds, every blocking check
// passes (the start's five numbers are the shared gate's: printed, as planning asks every map report to open), and the
// water settled on the land stands as the plan says: the lake 0.05 to 0.6 over its sill, the Still Pool at the lake's
// level, the Veil's curtain, the Gate and the leat dry past their bars, no stray water, nothing on the map's edge but
// the Low River. No water lies as a straight even reach of more than 40 tiles (`terrain.ruled_land`'s channels; planning,
// 2026-11-15: 128² seed 2 had one of 242). And the look's four measures hold (planning's verdict of 2026-11-14), and
// round 3's (planning's verdict on round 2): the crest by the gate, no flat on the range, the lake's arm bent, the
// dry valley from the gate, a trunk's straight reach and loop, the 192² tree, the ruin group on the rise.

import { describe, expect, it } from "vitest";
import { gateMap, startNumbers } from "../../src/core/premise/gateMap";
import { brookTree, drySide, dryValley, gateCrest, lakeCanal, lakeShape, wallFoot } from "../../src/core/premise/gateMeasures";
import { GATE_HEIGHT, rangeFlatShare } from "../../src/core/premise/gateLand";
import { armBend, gateOf, LAKE_BEND } from "../../src/core/premise/premises/wallGate";
import { MEGADAM_HOLDS, megadamHolds } from "../../src/core/premise/gateWorks";
import { makeSpec } from "../../src/core/spec/mapspec";
import { ruledLand, wetOf } from "../../src/core/validate/ruledLand";
import { readGateSettle } from "./gateSettle";

/** The longest straight even reach of water a Gate map may have, in tiles (planning, 2026-11-15). */
const LONGEST_REACH = 40;

describe("The wall with one gate's maps", () => {
  for (const [side, seed] of [[128, 2], [128, 4], [192, 1], [256, 1]])
    it(`build, pass their checks and settle as planned: seed ${seed} at ${side}²`, () => {
      const spec = makeSpec({ seed, size: { x: side, y: side }, theme: "any", premise: "any" });
      const r = gateMap(spec);
      if ("reason" in r) throw new Error(r.reason);
      expect(r.landFails).toEqual([]);
      // (the works stand on the land and do what they say; a rung short of its floor is said, as the lake stair's are)
      // (a rung short of its floor, and the map's shares short of a quarter, are said, not refused)
      expect(r.worksFails.filter((f) => f.id !== "works.paid" && f.id !== "map.shares")).toEqual([]);
      console.log(`  works: ${r.ladder.works.map((w) => `${w.id} ${w.reservoir || w.green}${w.paid ? "" : " (short)"}`).join(", ")}; first: ${r.card.first}`);
      expect(r.frame.reason).toBeNull();
      const m = r.map!;
      const five = startNumbers(m);
      console.log(`seed ${seed} at ${side}²: ${Object.entries(five).map(([id, c]) => `${id} ${c.value} (${c.limit})`).join(", ")}`);
      expect(m.report.checks.filter((c) => !c.ok && c.severity === "error").map((c) => `${c.id}: ${c.message}`)).toEqual([]);
      const s = readGateSettle(r.plan, r.water, m.built.heights, m.built.settle, 0, r.land.niches);
      const at = (id: string) => s.levels.find((l) => l.id === id)!;
      expect(at("lake").level - at("lake").sill).toBeGreaterThanOrEqual(0.05);
      expect(at("lake").level - at("lake").sill).toBeLessThanOrEqual(0.6);
      // (the Still Pool is the plunge pool's backwater since planning's ruling of 2026-11-12)
      expect(Math.abs(at("kettle").level - at("door").level)).toBeLessThanOrEqual(0.25);
      expect(s.veil.ok, s.veil.note).toBe(true);
      expect([s.gateWet, s.leatWet, s.stray, s.edge]).toEqual([0, 0, 0, 0]);
      // (its water wanders with the land: the lake's coves, the plunge pool's lip off its lobe, the brooks kinked)
      const reach = ruledLand(m.built.heights, wetOf(m.built.settle.depth), m.built.W, m.built.H).channel;
      expect(reach?.tiles ?? 0, `a straight reach of ${reach?.tiles} tiles at ${reach?.x},${reach?.y}`).toBeLessThanOrEqual(LONGEST_REACH);
      // (the look, planning's verdict of 2026-11-14 (`gateMeasures.ts`): a range, not a band: its foot never straight for
      // more than a quarter of the side; no canal lake: a third of its shore along the range at most, its width
      // two-fold or more; the brooks no stripes: none beside another for more than 30 tiles, three orders at 256²; and
      // the dry side has land a canal from the Gate can water: a third or more of it within three levels under the
      // lake's sill, 44 to 57 % as measured)
      const foot = wallFoot(r.plan, m.built.heights, r.water);
      expect(foot.run, `the range's foot straight for ${foot.run.toFixed(0)} tiles from ${foot.at}`).toBeLessThanOrEqual(side / 4);
      expect(lakeCanal(lakeShape(r.plan, r.water))).toBeNull();
      const tree = brookTree(r.plan);
      expect(tree.beside).toBeLessThanOrEqual(30);
      if (side >= 256) expect(tree.orders).toBeGreaterThanOrEqual(3);
      expect(drySide(r.plan, m.built.heights).share).toBeGreaterThanOrEqual(1 / 3);
      // (round 3: the crest within 12 tiles of the gap 6 levels or more over the lake's sill, 8 at 256², and 3 or more
      // all along the range; no flat wider than four tiles on it; the lake's main arm bent 0.5 rad over 40 % of it)
      const crest = gateCrest(r.plan, r.water, m.built.heights);
      expect(crest.gate, `the crest ${crest.gate} over the lake by the gate`).toBeGreaterThanOrEqual(side >= GATE_HEIGHT.large ? GATE_HEIGHT.overLarge : GATE_HEIGHT.over);
      expect(crest.least).toBeGreaterThanOrEqual(3);
      expect(rangeFlatShare(r.plan, r.water, m.built.heights)).toBe(0);
      const g = gateOf(r.plan)!;
      expect(armBend(r.plan.bodies.find((b) => b.id === g.lake)!.arms[0])).toBeGreaterThanOrEqual(LAKE_BEND.least);
      // (the Gate Bed's valley 3 deep at the gate, shallowing across the basin)
      const valley = dryValley(r.plan, r.water, m.built.heights);
      expect(valley[0]).toBeGreaterThanOrEqual(3);
      expect(valley[valley.length - 1]).toBeLessThan(valley[0]);
      // (at 192², five brooks gather in three ranks: twig, branch, trunk)
      if (side === 192) expect(tree.ranks).toBeGreaterThanOrEqual(3);
      // (one ruin group on the rise's top)
      expect(m.features.some((f) => f.kind === "ruinField" && f.role === "ruinField/rise")).toBe(true);
      // (the card says what the megadam buys, in days of drought on the settled map: more than the lake alone)
      // (the megadam is two walls, and the card names both places)
      expect(r.card.dam).toMatch(/two walls, across .* in the spur and across .* in the range/);
      const days = r.card.dam?.match(/for (\d+) days of drought; without them, for (\d+)\./);
      expect(days, r.card.dam ?? "no dam words").toBeTruthy();
      expect(Number(days![1])).toBeGreaterThan(Number(days![2]));
    });
});

// `megadam.holds` (#1067): a map whose valley at the megadam's water leaves the map round its walls is drawn again
// (`gateMap.ts`); `megadamHolds` says so, and on a map the mode keeps gives the days the card says.
describe("megadam.holds", () => {
  const spec = makeSpec({ seed: 2, size: { x: 128, y: 128 }, theme: "any", premise: "any" });
  const r = gateMap(spec);
  if ("reason" in r) throw new Error(r.reason);
  const m = r.map!.built.waterModel;
  it("holds on a map the mode keeps, the days its card says", () => {
    const d = megadamHolds(r.plan, r.water, r.ladder, m);
    expect("reason" in d ? d.reason : null).toBeNull();
    if (!("reason" in d)) expect(r.card.dam).toContain(`for ${d.dammed} days of drought; without them, for ${d.lake}.`);
  });
  it("refuses a valley whose ground round the walls is cut to the floor (hand-broken)", () => {
    const site = new Set(r.ladder.works.find((w) => w.id === "megadam")!.tiles);
    const floor = Float64Array.from(m.floor, (f, i) => (site.has(i) ? f : Math.min(f, 1)));
    expect(megadamHolds(r.plan, r.water, r.ladder, { ...m, floor })).toEqual({ reason: MEGADAM_HOLDS });
  });
});
