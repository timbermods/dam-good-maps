// The generator's premise mode (docs/PREMISES.md §2.1, §2.2 stages 3, 4, 5 and 8; build steps 4 and 5): a share link
// with `p=lakeStair` opens a lake stair the generator made through its plan, water, relief, start and ladder, one
// settle and the checks, and a spec the premise rules out goes to the themes with the reason in one line (D471). The
// ladder's gains are the soil rule's reach, `soilReach`, which must equal `sim/moisture.ts` tile for tile.
//
// The pinned sha256 is the `.timber` of seed 1 at 128² as this step makes it: a step that changes premise maps on
// purpose updates it (D148).

import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decodeProject, encodeProject, generatedDocument } from "../../src/core/doc/document";
import { MapSession } from "../../src/core/doc/session";
import * as ed from "../../src/worker/session";
import { generate, type GenerateResult } from "../../src/core/gen/generate";
import { firstWater } from "../../src/core/premise/draw";
import { dayOneWater } from "../../src/core/premise/frame";
import { generatePremise } from "../../src/core/premise/generate";
import { droughtHold, startWaterGate } from "../../src/core/premise/hold";
import { moistFloor, soilReach, spectrumMiss } from "../../src/core/premise/ladder";
import { premiseLand } from "../../src/core/premise/map";
import { PREMISES } from "../../src/core/premise/premises";
import { waterByNumber } from "../../src/core/premise/water";
import { droughtStorageByDay } from "../../src/core/sim/drought";
import { moisture } from "../../src/core/sim/moisture";
import { TICKS_PER_DAY } from "../../src/core/sim/water";
import { HazardRun } from "../../src/core/sim/weather";
import { decodeSpecFragment, encodeSpecFragment, makeSpec, type MapSpec } from "../../src/core/spec/mapspec";

// (re-pinned since generator 0.10.16's ground with grade, D148: the map's own land is the same; its description names the
// generator's version, "Made with Dam Good Maps 0.10.16", gen/pack.ts; again for step 7's works; for step 9's style,
// theme Any taking Canyon's on seed 1; for step 8's works sited by moisture with step 9 merged; and for the look round's
// theme forms, rim runs and stands; and for the height round, the premise's preset at Verticality 70 with the uplands
// to Highest terrain 22, which drew seed 1 a six-level landmark; and for the works round's floors, the bypass's own
// course (seed 1's plan a seven-level landmark again) and the start's ground kept from the style, D148; and for generator
// 0.10.17's start floors, D515: the same plan and start, whose bench of 770 needs no building, and the version in its
// description; and for the start's fast wood turning only the part of an oak grove the share needs (D515, D148: the bytes
// moved with that change alone (its resources), and dev's changes merged in leave them as they were); and for the
// start's bench room, D515: the lake stair's frame keeps room for the bench, leaning it away from the lip and the bay,
// the start's lake giving up what it takes, its tails redrawn eight times and its channels kept off the bench (D453),
// so seed 1 draws another frame; the fast-wood change leaves that frame's bytes as they were; and for a curtain's notch
// on a lip with no run's middle near its middle taking an end of the lip: seed 1's fall2, a diagonal, moves its notch
// from a step's corner to the lip's end, the same plan, start and bench; and for generator 0.10.18's dead stands on the
// dry land, D516: the same plan, water, start and bench, its resources and the version in its description; and for
// generator 0.10.19's dry washes, D517: the same plan, water, start and bench, a wash and its hollow cut into its ground
// and their ramps, its resources and the version in its description; and for the washes run long with fords, D517: the
// same plan, water, start and bench, its dry land giving no line long enough for a wash, so its ground is uncut; and
// for the start's landing (D148, `lakeStair.ts` `LANDING`): the same plan, start, bench and card, a one-tile strip of
// the start's lake's shelf a level deeper from the shore by the start to the lake's floor; and for the landing found
// from the land, D148: along the shore's own line from where the start meets the lake to where its floor comes
// nearest the bank, then down the bed's fall; the same plan, start, bench and card; and for generator 0.10.20's contour
// edges, D518: its plates on a turned scatter and its bench-width steps bent, a new ground; and for D518's mends: its
// wash's banks in long treads, its dead stands in knots in their woods (a stand its ground holds short of 15 trees none),
// a third of their trees young, its rolling and rises reweighed and its bend kept off the start, a new ground, D148; and
// for the dead stands dense in their woods, each knot its own shape: its resources, D148)
const SHA = "07a2346104c47b10510c4c1f6fe9304d2ef7e512052e314cfb5c15c4d8d98348";

// (a Hard map whose start lake parts as it falls: the single analytic reading stood 0.32 over the run there, PR #1040;
// seed 5 for 7 since D518 with dev's ways out by a ramp's line (#1061), D148: seed 7's Hard lake stair holds no plan now
// (the start's water gone on day 14), and of Hard seeds 1-14, 4, 5, 10, 11 and 13 hold (dev: 4, 5, 7, 10, 11); seed 5's
// start lake parts into three pieces of 10 tiles or more by the drought's end)
const HARD_SEED = 5;

describe("The premise mode (§2.2, build step 4)", () => {
  const made = makeSpec({ seed: 1, size: { x: 128, y: 128 }, theme: "any", premise: "lakeStair" });
  const link = encodeSpecFragment(made);
  const opened = decodeSpecFragment(link)!;
  let made1: GenerateResult | undefined;
  const lakeStair = () => (made1 ??= generate(opened.spec));

  it("opens from a share link with p=lakeStair", () => {
    expect(link).toContain("p=lakeStair");
    expect(opened.problems).toEqual([]);
    expect(opened.spec.premise).toBe("lakeStair");
  });

  it("makes the lake stair, every blocking check passed, the start placed for the first frame", () => {
    const r = lakeStair();
    const p = r.info.premise!;
    expect(p.fellBack).toBeUndefined();
    expect(p.plan?.premise).toBe("lakeStair");
    // (theme Any resolves from the seed: seed 1 takes Canyon's style; the card names the premise, its landmark and the
    // ladder's first rung, build step 9)
    expect(p.theme).toBe("canyon");
    expect(p.card).toEqual({
      name: "Lake stair",
      style: "Canyon",
      landmark: "The Hanging Fall, a seven-level fall into Low Lake, the start's lake",
      first: "Mend the breach in the old weir at the Gate Gorge (one tile), so Low Lake keeps its water in a drought.",
      line: p.plan!.line,
    });
    expect(r.report.passed).toBe(true);
    // (step 6's plants and mine sites answer the start's wood and food and the mine pair: none waits for a later step)
    expect(p.later).toEqual([]);
    for (const id of ["start.food", "start.wood", "start.wood_floor", "resources.mine_site"]) expect(r.report.checks.find((c) => c.id === id)?.ok, id).toBe(true);
    // (the life by budget, §2.2 stage 6: living trees 450 to 700 per 10,000 tiles, berries about 185 to 230)
    expect(p.life!.livingPer10k).toBeGreaterThanOrEqual(450);
    expect(p.life!.livingPer10k).toBeLessThanOrEqual(700);
    expect(p.life!.bushesPer10k).toBeGreaterThanOrEqual(185);
    expect(p.life!.bushesPer10k).toBeLessThanOrEqual(230);
    expect(p.start!.shallow).toBeGreaterThanOrEqual(0.85);
    // (the ladder: every work has a site on the land or says why not; day 1 is not fully watered)
    const ladder = p.ladder!;
    expect(ladder.works.length).toBe(p.plan!.works.length);
    for (const w of ladder.works) expect(w.tiles.length > 0 || !!w.note).toBe(true);
    expect(ladder.works.filter((w) => w.green > 0 || w.reservoir > 0).length).toBeGreaterThan(ladder.works.length / 2);
    expect(ladder.day1.water + ladder.day1.moist).toBeLessThan(0.7);
    expect(createHash("sha256").update(r.bytes).digest("hex")).toBe(SHA);
  });

  it("keeps its card with its project: a reopened map, edited or not, shows the card it was made with (D508)", () => {
    const r = lakeStair();
    const card = r.info.premise!.card!;
    // (the generated map's project, as the page's Generate writes it: the card's five strings, nothing else of the plan)
    const bytes = encodeProject(generatedDocument(r));
    const doc = decodeProject(bytes);
    expect(doc.meta.card).toEqual(card);
    expect(Object.keys(doc.meta.card!).sort()).toEqual(["first", "landmark", "line", "name", "style"]);
    expect(encodeProject(doc)).toEqual(bytes);
    expect(MapSession.open(doc).meta.card).toEqual(card);
    // (the editor's session of the same map, edited by hand and saved: it reopens byte for byte, its card unchanged)
    const s = MapSession.fromGenerated(r, r.file);
    expect(s.meta.card).toEqual(card);
    expect(s.apply({ op: "setDescription", params: { text: "Our lake stair." } }).ok).toBe(true);
    const saved = s.project();
    const back = decodeProject(saved);
    expect(MapSession.replayMatchesStored(back)).toBe(true);
    expect(encodeProject(back)).toEqual(saved);
    const reopened = MapSession.open(back);
    expect(reopened.meta.card).toEqual(card);
    expect(reopened.project()).toEqual(saved);
    // (the page's view: the worker's info for the reopened project carries the card; a .timber opened as a file, a map
    // with no idea, carries none)
    expect(ed.openProject(saved).info.card).toEqual(card);
    expect(ed.openTimber(r.bytes, "lake-stair.timber").info.card).toBeNull();
  });

  it("holds day 1's moist ground to a floor that falls as the map grows (D519)", () => {
    // (30 % at 128², 25 % at 192², 20 % at 256², a straight line between, held at its ends)
    expect(moistFloor(96)).toBe(0.3);
    expect(moistFloor(128)).toBe(0.3);
    expect(moistFloor(160)).toBeCloseTo(0.275, 9);
    expect(moistFloor(192)).toBeCloseTo(0.25, 9);
    expect(moistFloor(224)).toBeCloseTo(0.225, 9);
    expect(moistFloor(256)).toBeCloseTo(0.2, 9);
    expect(moistFloor(320)).toBe(0.2);
    const day1 = { water: 0.2, moist: 0.27 };
    expect(spectrumMiss(day1, 128)).toMatch(/30 % at least/);
    expect(spectrumMiss(day1, 192)).toBeNull();
    expect(spectrumMiss({ water: 0.2, moist: 0.19 }, 256)).toMatch(/20 % at least/);
    expect(spectrumMiss({ water: 0.2, moist: 0.2 }, 256)).toBeNull();
  });

  it("reads the soil's reach as the game's soil rule does (stage 4's estimateGain)", () => {
    const fw = firstWater(PREMISES.lakeStair, made);
    if ("reason" in fw) throw new Error(fw.reason);
    const { W, H } = fw.plan;
    const { heights } = premiseLand(fw.plan, fw.water);
    const depth = dayOneWater(fw.plan, fw.water, heights);
    const none = new Float64Array(W * H);
    const reach = soilReach(heights, { depth, contamination: none }, W, H);
    const m = moisture(heights, depth, none, W, H);
    let differ = 0;
    let moist = 0;
    for (let i = 0; i < W * H; i++) {
      if (depth[i] > 0) continue;
      if (m[i] > 0) moist++;
      if (reach[i] > 0 !== m[i] > 0) differ++;
    }
    expect(moist).toBeGreaterThan(1000);
    expect(differ).toBe(0);
  });

  it("keeps its lakes through the difficulty's longest drought: each drops a level, none empties (§4.4 drought.lakes)", () => {
    const r = generatePremise(made);
    if ("reason" in r) throw new Error(r.reason);
    const plan = r.result.info.premise!.plan!;
    const hold = droughtHold(made, plan, r.result.built, waterByNumber(plan));
    const lowStart = plan.stair!.startLake === plan.stair!.lakes[0] ? plan.stair!.lakes[0] : null;
    for (const l of hold.lakes) {
      if (l.id === plan.stair!.pool) continue;
      // (most of each lake's water at the worst day; the lowest lake when it is the start's, its ruined weir's breach
      // a level deep on a bed three deep, about a third: §9)
      expect(l.worst / l.day0, l.id).toBeGreaterThanOrEqual(l.id === lowStart ? 0.28 : 0.5);
    }
    expect(hold.has).toBe(true);
    expect(hold.gone).toBe(0);
    expectReadUnderRun(made, r.result);
  });

  it("reads the start's water through Hard's 30-day drought no higher than the run, its lake parting as it falls", () => {
    const hard = makeSpec({ seed: HARD_SEED, size: { x: 128, y: 128 }, theme: "riverValley", premise: "lakeStair", designedFor: "hard" });
    const r = generatePremise(hard);
    if ("reason" in r) throw new Error(r.reason);
    expectReadUnderRun(hard, r.result);
  });

  it("hands a spec the premise rules out to the themes, saying why", () => {
    const spec = makeSpec({ seed: 1, size: { x: 64, y: 64 }, theme: "any", premise: "lakeStair" });
    const r = generatePremise(spec);
    expect("reason" in r && r.reason.length).toBeGreaterThan(0);
  });
});

/** The start's water as stage 8 gates it: the analytic drought a day at a time (`droughtStorageByDay`) reads the start's
 *  lake no higher than the run at the drought's end on any tile a pump may stand on, so the gate's read by number never
 *  vouches for water the run loses; and the gate agrees with the run. */
function expectReadUnderRun(spec: MapSpec, made: GenerateResult): void {
  const plan = made.info.premise!.plan!;
  const b = made.built;
  const water = waterByNumber(plan);
  const hold = droughtHold(spec, plan, b, water);
  const k = plan.bodies.findIndex((x) => x.id === plan.stair!.startLake) + 1;
  const run = new HazardRun(b.waterModel, { depth: b.water, contamination: b.contamination, stack: null } as never, "drought", hold.days);
  for (let d = 1; d <= hold.days; d++) run.step(TICKS_PER_DAY);
  const last = Float64Array.from(run.water().depth);
  run.dispose();
  const kept = droughtStorageByDay(b.waterModel, b.water, hold.days);
  let tiles = 0;
  let over = 0;
  for (let i = 0; i < kept.length; i++) {
    if (water.raster.lake[i] !== k || !(b.water[i] > 0.3)) continue;
    tiles++;
    if (kept[i] > last[i]) over++;
  }
  expect(tiles).toBeGreaterThan(100);
  expect(over).toBe(0);
  expect(startWaterGate(spec, plan, b, water).gone).toBe(hold.has ? hold.gone : 0);
}
