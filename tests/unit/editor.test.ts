// The editor's page-side helpers (EDITOR_PLAN §4): plain names, the tiles each feature covers,
// what a click selects, the hover text, how a handle moves a feature, and the features the drawing
// tools make, which must pass the operation checks the worker runs.

import { describe, expect, it } from "vitest";
import { validateOp, emptyState } from "../../src/core/doc/ops";
import type { Feature } from "../../src/core/features/schema";
import { generate } from "../../src/core/gen/generate";
import { makeSpec } from "../../src/core/spec/mapspec";
import { anchorOf, clampMove, describeTile, entitiesByTile, featureName, FeatureIndex, feedingGroups, moveBlocked, movePatch, rectOf, rectOutline, rectRuns, sourceGroups, tabOf } from "../../src/editor/features";
import { paintOverlay, SELECTED } from "../../src/editor/tools";
import { entityView, surfaceWater, waterFromDepth } from "../../src/render3d/model";

const W = 64;
const H = 48;
const forest: Feature = { id: "u-forest", kind: "forest", origin: "user", locked: false, params: { area: rectRuns({ x0: 2, y0: 3, x1: 5, y1: 4 }, W), density: 1, speciesMix: { Pine: 1 }, life: "auto", youngShare: 0 } };
const plateau: Feature = { id: "u-plateau", kind: "landform", origin: "user", locked: false, params: { kind: "plateau", edgeStyle: "cliff", outline: rectOutline({ x0: 1, y0: 1, x1: 10, y1: 8 }), height: 9 } };
const start: Feature = { id: "u-start", kind: "start", origin: "generated", locked: false, params: { position: [20, 20], orientation: "Cw0", benchRadius: 4, benchLevel: 5, player: 0 } };
const river: Feature = {
  id: "u-river",
  kind: "river",
  origin: "user",
  locked: false,
  params: { path: [[-1, 30], [20, 30], [40, 34], [64, 34]], width: 3, bedDepth: 1, bedProfile: { start: 4, steps: [] }, flow: 2, style: "straight", entry: { edge: "west" }, exit: { edge: "east" }, badwater: false },
};

describe("feature names and tabs", () => {
  it("names features in plain words", () => {
    expect(featureName(forest)).toBe("Pine forest");
    expect(featureName({ ...forest, params: { ...(forest.params as object), speciesMix: { Pine: 0.5, Oak: 0.5 } } } as Feature)).toBe("Pine and oak forest");
    expect(featureName({ ...forest, params: { ...(forest.params as object), speciesMix: { Pine: 0.4, Oak: 0.3, Birch: 0.3 } } } as Feature)).toBe("Mixed forest");
    expect(featureName(plateau)).toBe("Plateau");
    expect(featureName(start)).toBe("Start");
    expect(featureName(river)).toBe("River");
    expect([forest, plateau, start, river].map(tabOf)).toEqual(["resources", "land", "start", "water"]);
  });
});

describe("the tile index", () => {
  const index = new FeatureIndex(W, H);
  index.update([plateau, river, forest, start]);

  it("covers each feature's tiles", () => {
    expect(index.tilesOf(forest).length).toBe(8);
    // the rectangle outline holds exactly its tiles
    expect(index.tilesOf(plateau).length).toBe(10 * 8);
    expect([...index.tilesOf(start)].sort((a, b) => a - b)).toEqual([19, 20, 21].flatMap((y) => [19, 20, 21].map((x) => y * W + x)).sort((a, b) => a - b));
    expect(index.tilesOf(river).length).toBeGreaterThan(60);
  });

  it("selects the most specific feature first, never water or the generator's ground (D196)", () => {
    expect(index.allAt(3, 3).map((f) => f.id)).toEqual(["u-forest", "u-plateau"]);
    expect(index.candidatesAt(3, 3).map((f) => f.id)).toEqual(["u-forest"]);
    expect(index.candidatesAt(20, 20).map((f) => f.id)).toEqual(["u-start"]);
    expect(index.allAt(10, 30).map((f) => f.id)).toEqual(["u-river"]);
    expect(index.candidatesAt(10, 30)).toEqual([]);
    expect(index.candidatesAt(50, 5)).toEqual([]);
  });

  it("puts the move handle on the feature", () => {
    const [x, y] = anchorOf(index, forest)!;
    expect(index.tilesOf(forest)).toContain(y * W + x);
    expect(anchorOf(index, start)).toEqual([20, 20]);
  });
});

describe("hover text", () => {
  it("says what stands on a tile", () => {
    const heights = new Uint8Array(W * H).fill(4);
    for (const i of rectRuns({ x0: 1, y0: 1, x1: 10, y1: 8 }, W).flatMap(([y, a, b]) => Array.from({ length: b - a + 1 }, (_, k) => y * W + a + k))) heights[i] = 9;
    const depth = new Float64Array(W * H);
    depth[30 * W + 10] = 0.62;
    const ents = entityView([
      { template: "Pine", x: 3, y: 3, z: 9, orientation: "Cw0", owner: "u-forest" },
      { template: "Birch", x: 30, y: 10, z: 4, orientation: "Cw0", owner: "import", dead: true },
      { template: "RuinColumnH3", x: 31, y: 10, z: 4, orientation: "Cw0", owner: "import" },
    ]);
    const index = new FeatureIndex(W, H);
    index.update([plateau, river, forest]);
    const ctx = { W, H, heights, water: surfaceWater(W, H, waterFromDepth(heights, depth, new Float64Array(W * H))), entities: ents, entitiesAt: entitiesByTile(ents, W), index };
    expect(describeTile(ctx, 3, 3)).toBe("Plateau, height 9, pine forest");
    expect(describeTile(ctx, 10, 30)).toBe("River, height 4, water 0.6 deep");
    expect(describeTile(ctx, 30, 10)).toBe("Height 4, dead birch");
    expect(describeTile(ctx, 31, 10)).toBe("Height 4, ruin column, 3 high");
    // the editor: water, never a river or a landform (D196), with its bed and its badwater
    const ed = { ...ctx, editor: true };
    expect(describeTile(ed, 10, 30)).toBe("Water 0.6 deep, bed level 4");
    expect(describeTile(ed, 3, 3)).toBe("Height 9, pine forest");
    const mixed = new Float64Array(W * H);
    mixed[30 * W + 10] = 0.3;
    const bad = { ...ed, water: surfaceWater(W, H, waterFromDepth(heights, depth, mixed)) };
    expect(describeTile(bad, 10, 30)).toBe("Water 0.6 deep, bed level 4, 30% badwater");
    // and a click picks no water (D196)
    expect(index.candidatesAt(10, 30).map((f) => f.kind)).not.toContain("river");
    expect(index.allAt(10, 30).map((f) => f.kind)).toContain("river");
  });
});

describe("the sources (D196)", () => {
  it("sources side by side are one marker, and the water under the pointer finds the sources upstream of it", () => {
    const heights = new Uint8Array(W * H).fill(8);
    // a river along y = 20, stepping down eastward, fed by two sources at its head (x 0–1) and a
    // tributary from the south joining at x 40, fed by its own source at (40, 5)
    const depth = new Float64Array(W * H);
    for (let x = 0; x < W; x++) {
      heights[20 * W + x] = 6 - Math.floor(x / 16);
      depth[20 * W + x] = 0.5;
    }
    for (let y = 5; y < 20; y++) {
      heights[y * W + 40] = 7;
      depth[y * W + 40] = 0.3;
    }
    const ents = entityView([
      { template: "WaterSource", x: 0, y: 20, z: 6, orientation: "Cw0", owner: "r", strength: 1 },
      { template: "WaterSource", x: 1, y: 20, z: 6, orientation: "Cw0", owner: "r", strength: 1.5 },
      { template: "WaterSource", x: 40, y: 5, z: 7, orientation: "Cw0", owner: "t", strength: 2 },
    ]);
    const groups = sourceGroups(ents, W, heights);
    expect(groups.map((g) => [g.members.length, g.strength])).toEqual([[2, 2.5], [1, 2]]);
    const water = surfaceWater(W, H, waterFromDepth(heights, depth, new Float64Array(W * H)));
    // above the join: only the river's head feeds it
    expect(feedingGroups(water, groups, W, H, 20, 20)).toEqual([0]);
    // below the join: both
    expect(feedingGroups(water, groups, W, H, 55, 20)).toEqual([0, 1]);
    // on the tributary: its own source
    expect(feedingGroups(water, groups, W, H, 40, 10)).toEqual([1]);
    // dry ground: none
    expect(feedingGroups(water, groups, W, H, 30, 40)).toBeNull();
  });
});

describe("moving a feature", () => {
  const heights = new Uint8Array(W * H).fill(6);

  it("shifts areas, outlines and the start, whose bench takes the new ground", () => {
    expect(movePatch(forest, 2, -1, W, H, heights)).toEqual({ params: { area: [[2, 4, 7], [3, 4, 7]] } });
    expect((movePatch(plateau, 1, 1, W, H, heights).params as { outline: number[][] }).outline[0]).toEqual([1.5, 1.5]);
    heights[20 * W + 23] = 7;
    // with no river near, the bench has no bank to run to (D97): its old one is removed
    expect(movePatch(start, 3, 0, W, H, heights)).toEqual({ params: { position: [23, 20], benchLevel: 7, bank: null } });
  });

  it("keeps a river's mouth on its edge", () => {
    const p = (movePatch(river, 0, 4, W, H, heights).params as { path: number[][] }).path;
    expect(p).toEqual([[-1, 34], [20, 34], [40, 38], [64, 38]]);
    const q = (movePatch(river, 3, 0, W, H, heights).params as { path: number[][] }).path;
    expect(q[0]).toEqual([-1, 30]);
    expect(q[1]).toEqual([23, 30]);
    expect(q[3]).toEqual([64, 34]);
  });

  it("stops at the map's edge, and says why a feature cannot move", () => {
    expect(clampMove(forest, -10, -10, W, H)).toEqual([-2, -3]);
    expect(clampMove(start, 100, 0, W, H)).toEqual([W - 1 - 21, 0]);
    expect(moveBlocked(forest)).toBeNull();
    // the ground the generator built is shaped with the brushes, never moved (D182)
    expect(moveBlocked({ ...plateau, params: { kind: "valley", edgeStyle: "gentle", along: { river: "r", halfWidth: 4, floorAboveBed: 1 } } } as Feature)).toMatch(/shape it with the brushes/);
    expect(moveBlocked(plateau)).toMatch(/shape it with the brushes/);
  });
});

describe("the drawing tools", () => {
  const heights = new Uint8Array(W * H).fill(3);
  heights[5 * W + 5] = 11;
  const rect = rectOf([8, 9], [2, 3], W, H);

  it("paint the overlay", () => {
    const data = new Uint8Array(W * H * 4);
    paintOverlay(data, W, H, [{ tiles: [W + 1], color: SELECTED, dx: 1 }]);
    expect([...data.subarray((W + 2) * 4, (W + 2) * 4 + 4)]).toEqual(SELECTED);
    expect(data[(W + 1) * 4 + 3]).toBe(0);
  });
});

describe("a generated map's features in the index", () => {
  it("every feature of a 96² map covers tiles, and the start is found under its tile", () => {
    const r = generate(makeSpec({ seed: 3, size: { x: 96, y: 96 } }));
    const index = new FeatureIndex(96, 96);
    index.update(r.features);
    for (const f of r.features) expect(index.tilesOf(f).length, `${f.kind} ${f.id}`).toBeGreaterThan(0);
    const s = r.features.find((f) => f.kind === "start")!;
    const [x, y] = (s.params as { position: [number, number] }).position;
    expect(index.candidatesAt(x, y)[0].id).toBe(s.id);
  });
});
