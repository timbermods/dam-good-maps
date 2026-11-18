// The poisoned floodplain's stage 4, the works and the ladder by number (docs/design/poisoned-floodplain.md §6, §7
// "works", §9 row 4): on a map at 128² that holds on its first attempt, every rung it lists has its site on the land
// and buys its floor (`gives`; planning's ruling of 2026-11-17: `works.paid` decides the listing, the pond, the turn
// and the river in listed on every map), the turn's dam is six tiles or fewer and sends the red water over the col to the Dry Fork's
// edge, the river in's weir sends the river down the slough to the backswamp; and a hand-broken ladder for every works
// check. The two proofs (the works built as operations on the settled map's session) are
// premisePlainWorks.heavy.test.ts.

import { describe, expect, it } from "vitest";
import type { Ladder, WorkSite } from "../../src/core/premise/ladder";
import { plainMap, type PlainMap } from "../../src/core/premise/plainMap";
import { LISTED, PLAIN_WORKS_BLOCKING, plainMeasure, plainWorksFailures, TURN } from "../../src/core/premise/plainWorks";
import { plainOf } from "../../src/core/premise/premises/poisonedPlain";
import { makeSpec } from "../../src/core/spec/mapspec";

// (seed 5: step 5 moved the start and the walls, and seed 2 at 128² now holds on its third attempt; the test is of a map
// that holds on its first)
const spec = makeSpec({ seed: 5, size: { x: 128, y: 128 }, theme: "any", premise: "any" });
const made = plainMap(spec);
if ("reason" in made) throw new Error(made.reason);
const good: PlainMap = made;
const { plan } = good.land;
const heights = Uint8Array.from(good.map.built.heights);
const site = (id: string): WorkSite => good.ladder.works.find((w) => w.id === id)!;

describe("The poisoned floodplain's works", () => {
  it("holds on its first attempt with every works check passed", () => {
    expect(good.held).toBe(true);
    expect(good.attempt).toBe(0);
    expect(good.works).toEqual([]);
  });

  it("lists the pond, the turn and the river in, and only rungs that buy their floor, each sited on the land", () => {
    const listed = good.ladder.works.map((w) => w.id);
    for (const id of LISTED) expect(listed, id).toContain(id);
    for (const id of listed) expect(plan.works.map((w) => w.id), id).toContain(id);
    for (const s of good.ladder.works) {
      const work = plan.works.find((w) => w.id === s.id)!;
      expect(s.tiles.length, s.id).toBeGreaterThan(0);
      expect(s.level, s.id).toBeDefined();
      const range = s.id === "brookPond" ? work.gives.reservoir : work.gives.green;
      expect(range, s.id).toBeDefined();
      expect(range![0], s.id).toBeGreaterThan(0);
      expect(plainMeasure(s), s.id).toBeGreaterThanOrEqual(range![0]);
      expect(s.paid, s.id).toBe(true);
    }
  });

  it("dams the gulch in six tiles or fewer a level over the col, and clears the dead band by number", () => {
    const turn = site("turn");
    expect(turn.tiles.length).toBeLessThanOrEqual(TURN.most);
    expect(turn.level).toBe(plainOf(plan)!.col.level + TURN.over);
    for (const id of ["lowLevee", "swampLevee"]) if (good.ladder.works.some((w) => w.id === id)) expect(turn.cleared, id).toBeGreaterThan(site(id).cleared!);
    expect(site("riverIn").green).toBeGreaterThan(turn.green);
  });
});

describe("A broken poisoned-floodplain ladder fails its works checks", () => {
  const ids = (change: (w: WorkSite) => WorkSite | null) => {
    const ladder: Ladder = { ...good.ladder, works: good.ladder.works.map((w) => change({ ...w, tiles: [...w.tiles] })).filter((w): w is WorkSite => !!w) };
    return plainWorksFailures({ land: good.land, heights, ladder }).map((f) => f.id);
  };

  it("works.sites: the pond, the turn or the river in with no site, the pond under its floor, a turn of more than six tiles", () => {
    for (const id of LISTED) expect(ids((w) => (w.id === id ? null : w)), id).toContain("works.sites");
    expect(ids((w) => (w.id === "brookPond" ? { ...w, paid: false, note: "holds 0" } : w))).toContain("works.sites");
    // (a levee under its floor leaves the listing: not a failure)
    expect(ids((w) => (w.id === "swampLevee" || w.id === "lowLevee" ? null : w))).not.toContain("works.sites");
    const turn = site("turn");
    const more = turn.tiles.slice();
    for (let i = 0; more.length <= TURN.most; i++) if (!more.includes(turn.tiles[0] + i + 1)) more.push(turn.tiles[0] + i + 1);
    expect(ids((w) => (w.id === "turn" ? { ...w, tiles: more } : w))).toContain("works.sites");
  });

  it("works.paid: a rung under its floor", () => {
    expect(ids((w) => (w.id === "swampLevee" ? { ...w, paid: false, note: "clears 0" } : w))).toContain("works.paid");
  });

  it("turn.byNumber: a dam no higher than the narrows' floor leaves the red water on the valley's floor", () => {
    const turn = site("turn");
    const low = Math.min(...turn.tiles.map((i) => heights[i]));
    expect(ids((w) => (w.id === "turn" ? { ...w, level: low } : w))).toContain("turn.byNumber");
  });

  it("turn.byNumber: red water that leaves the map by an edge other than the Dry Fork's (step 5)", () => {
    // (the Dry Fork's end moved to the map's far corner from where it leaves: the dam's water still leaves where it
    // did, now an edge that is not the Dry Fork's; the settle's proof counts such water a leak, 256² seed 4 its plateau)
    const moved = JSON.parse(JSON.stringify(good.land.plan));
    const path = plainOf(moved)!.fork.path;
    const end = path[path.length - 1];
    path[path.length - 1] = [end[0] < plan.W / 2 ? plan.W : 0, end[1] < plan.H / 2 ? plan.H : 0];
    const failed = plainWorksFailures({ land: { ...good.land, plan: moved }, heights, ladder: good.ladder });
    expect(failed.find((f) => f.id === "turn.byNumber")?.reason).toMatch(/leaves the map at/);
  });

  it("riverIn.byNumber: a weir a level lower leaves the slough's mouth dry", () => {
    const inn = site("riverIn");
    expect(ids((w) => (w.id === "riverIn" ? { ...w, level: inn.level! - 1 } : w))).toContain("riverIn.byNumber");
  });

  it("blocks on the sites and the two works by number, and only says a rung under its floor", () => {
    expect([...PLAIN_WORKS_BLOCKING].sort()).toEqual(["riverIn.byNumber", "turn.byNumber", "works.sites"]);
  });
});
