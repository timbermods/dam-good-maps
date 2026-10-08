// The check rows of terrain above terrain (3D Foundations, stage 3) and the floor graph behind them (D122),
// on small hand-made maps with the core called directly: `walk.levels` (information), `terrain.dropped`,
// `water.sealed_source` (a warning) and `plants.clearance`, each passing and failing; `terrain.single_floor`
// an imported map's row only; and D482: the same slope that joins nothing blocks a generated map and only
// warns on an imported one, which still exports.

import { describe, expect, it } from "vitest";
import { groupChecks } from "../../src/core/doc/checkItems";
import { MapSession } from "../../src/core/doc/session";
import { entityJson, slope, startingLocation, tree, waterSource, type EntitySpec } from "../../src/core/format/entities";
import type { Orientation } from "../../src/core/format/footprints";
import { mapMetadata, writeTimber, type TimberFile } from "../../src/core/format/timber";
import { emptySimulationSingletons, GAME_VERSION, LAYERS, voxelsFromHeights } from "../../src/core/format/world";
import { thumbnailJpeg } from "../../src/core/render/shade";
import { PLANT_CLEARANCE, plantsWithoutRoom } from "../../src/core/terrain/clearance";
import { floorAt, floorGraph } from "../../src/core/terrain/floors";
import { ColumnTerrain } from "../../src/core/terrain/runs";
import { validateMap, type ValidateOptions } from "../../src/core/validate/checks";
import { blocks, type CheckResult } from "../../src/core/validate/report";

const GROUND = 4;

/** Flat ground at level 4, to carve and build on. */
class Scene {
  readonly N: number;
  voxels: Uint8Array;
  entities: EntitySpec[] = [];
  constructor(readonly W: number, readonly H: number) {
    this.N = W * H;
    this.voxels = voxelsFromHeights(new Uint8Array(this.N).fill(GROUND), W, H);
  }
  /** Solid (or air) from z0 up to and including z1, over the tiles x0–x1, y0–y1. */
  fill(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, solid = true): this {
    for (let z = z0; z <= z1; z++) for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) this.voxels[z * this.N + y * this.W + x] = solid ? 1 : 0;
    return this;
  }
  private base(x: number, y: number, z: number) {
    return { id: `00000000-0000-4000-8000-${String(this.entities.length).padStart(12, "0")}`, owner: "", x, y, z };
  }
  start(x: number, y: number, z = GROUND): this {
    this.entities.push(startingLocation({ ...this.base(x, y, z), orientation: "Cw0" }));
    return this;
  }
  slope(x: number, y: number, z: number, orientation: Orientation): this {
    this.entities.push(slope({ ...this.base(x, y, z), orientation }));
    return this;
  }
  plant(species: "Pine" | "Birch" | "Oak", x: number, y: number, z = GROUND): this {
    this.entities.push(tree({ ...this.base(x, y, z), species }));
    return this;
  }
  source(x: number, y: number, z: number): this {
    this.entities.push(waterSource({ ...this.base(x, y, z), strength: 1 }));
    return this;
  }
  file(): TimberFile {
    const { W, H } = this;
    const heights = ColumnTerrain.fromVoxels(this.voxels, W, H).heights();
    return {
      metadata: mapMetadata(W, H, "A hand-made map"),
      thumbnail: thumbnailJpeg(heights, W, H),
      versionTxt: GAME_VERSION + "\r\n",
      world: { gameVersion: GAME_VERSION, timestamp: "2026-10-07 00:00:00", sizeX: W, sizeY: H, layers: LAYERS, voxels: this.voxels, singletons: emptySimulationSingletons(W, H), entities: this.entities.map(entityJson) },
      extraFiles: [],
    };
  }
  checks(opts: ValidateOptions = { profile: "import", loadOnly: true }): Record<string, CheckResult> {
    return Object.fromEntries(validateMap(this.file(), opts).report.checks.map((c) => [c.id, c]));
  }
}

describe("the floor graph (D122)", () => {
  // a wall four thick and three high across the map, x = 8–11
  const walled = () => new Scene(20, 12).fill(8, 11, 0, 11, GROUND, GROUND + 2);
  const graph = (s: Scene, slopes: { x: number; y: number; z: number; orientation: Orientation }[] = []) => floorGraph({ W: s.W, H: s.H, layers: LAYERS, voxels: s.voxels }, slopes);

  it("a heightfield has one floor per tile, and a wall parts the ground either side of it from its top", () => {
    const g = graph(walled());
    expect(g.tile.length).toBe(20 * 12);
    expect(g.areas).toBe(3);
    expect(g.area[floorAt(g, 0, 0, GROUND)]).not.toBe(g.area[floorAt(g, 19, 0, GROUND)]);
    expect(floorAt(g, 9, 5, GROUND)).toBe(-1);
  });

  it("a tunnel one level high joins the two sides, with no headroom rule; the roof over it is its own floor", () => {
    const s = walled().fill(8, 11, 5, 5, GROUND, GROUND, false);
    const g = graph(s);
    expect(g.areas).toBe(2);
    expect(g.area[floorAt(g, 0, 0, GROUND)]).toBe(g.area[floorAt(g, 19, 0, GROUND)]);
    expect(g.area[floorAt(g, 9, 5, GROUND)]).toBe(g.area[floorAt(g, 0, 0, GROUND)]);
    expect(g.area[floorAt(g, 9, 5, GROUND + 3)]).not.toBe(g.area[floorAt(g, 0, 0, GROUND)]);
  });

  it("levels join only by slopes: a step of one level is not walked, a slope up it is", () => {
    const step = new Scene(20, 12).fill(10, 19, 0, 11, GROUND, GROUND);
    expect(graph(step).areas).toBe(2);
    expect(graph(step, [{ x: 9, y: 5, z: GROUND, orientation: "Cw270" }]).areas).toBe(1);
    // a slope facing away from the step joins nothing
    expect(graph(step, [{ x: 9, y: 5, z: GROUND, orientation: "Cw90" }]).areas).toBe(2);
  });
});

describe("walk.levels: the areas that need stairs (information, never a failure)", () => {
  const full: ValidateOptions = { profile: "import" };
  /** 40 × 40 with the start in the west; `east` raises x = 20–39 by so many levels (800 tiles). */
  const land = (east = 0) => {
    const s = new Scene(40, 40).start(4, 4);
    if (east) s.fill(20, 39, 0, 39, GROUND, GROUND + east - 1);
    return s;
  };

  it("one level: every level is walked to", () => {
    expect(land().checks(full)["walk.levels"]).toMatchObject({ ok: true, value: 0, message: "Every level can be walked to from the start" });
  });

  it("a wide terrace one level up with no slope needs stairs; with a slope it does not", () => {
    const c = land(1).checks(full)["walk.levels"];
    expect(c).toMatchObject({ ok: true, value: 1, severity: "info", message: "1 area needs stairs to reach, at level 5" });
    expect(c.where?.tiles).toEqual([[20, 0]]);
    expect(land(1).slope(19, 10, GROUND, "Cw270").checks(full)["walk.levels"]).toMatchObject({ ok: true, value: 0, message: "Every level can be walked to from the start" });
  });

  it("counts each area and names the highest; a small ledge is not listed", () => {
    const two = land(2).fill(30, 39, 0, 39, GROUND + 2, GROUND + 3);
    expect(two.checks(full)["walk.levels"]).toMatchObject({ ok: true, value: 2, message: "2 areas need stairs to reach, the highest at level 8" });
    const ledge = land().fill(20, 29, 20, 29, GROUND, GROUND + 2);
    expect(ledge.checks(full)["walk.levels"]).toMatchObject({ ok: true, value: 0 });
  });

  it("never blocks, whatever the map's kind", () => {
    for (const profile of ["generate", "export", "import"] as const) {
      const c = land(1).checks({ profile })["walk.levels"];
      expect(c.ok).toBe(true);
      expect(blocks(profile, c)).toBe(false);
    }
  });

  it("does not apply without a start", () => {
    expect(new Scene(40, 40).checks(full)["walk.levels"]).toMatchObject({ ok: true, applicable: false });
  });
});

describe("terrain.dropped: what the build's support pass removed (a generated map's row)", () => {
  it("passes at none, fails with the count, and blocks a generated map", () => {
    const s = new Scene(16, 14);
    const none = s.checks({ profile: "generate", loadOnly: true, dropped: 0 })["terrain.dropped"];
    expect(none).toMatchObject({ ok: true, value: 0, message: "No ground had to be removed" });
    const some = s.checks({ profile: "generate", loadOnly: true, dropped: 12 })["terrain.dropped"];
    expect(some).toMatchObject({ ok: false, value: 12, severity: "error", message: "12 blocks of ground removed: nothing held them up" });
    expect(blocks("generate", some)).toBe(true);
    expect(s.checks({ profile: "generate", loadOnly: true, dropped: 1 })["terrain.dropped"].message).toBe("1 block of ground removed: nothing held it up");
    // on a generated map being edited it warns, and never blocks the export
    const edited = s.checks({ profile: "export", loadOnly: true, dropped: 12 })["terrain.dropped"];
    expect(edited.severity).toBe("warning");
    expect(blocks("export", edited)).toBe(false);
  });

  it("is absent on an imported map, and when the build does not say", () => {
    const s = new Scene(16, 14);
    expect(s.checks({ profile: "import", loadOnly: true, dropped: 12 })["terrain.dropped"]).toBeUndefined();
    expect(s.checks({ profile: "generate", loadOnly: true })["terrain.dropped"]).toBeUndefined();
  });
});

describe("water.sealed_source: a source sealed inside rock (a warning)", () => {
  /** Ground at level 8 with a chamber inside it, 5 × 5 and three high on a floor at level 2, and a source in it. */
  const cave = () => new Scene(24, 24).fill(0, 23, 0, 23, GROUND, 7).fill(8, 12, 8, 12, 2, 4, false).source(9, 9, 2);

  it("warns where the source's air joins neither the sky nor the edge, and never blocks", () => {
    const c = cave().checks({ profile: "import" })["water.sealed_source"];
    expect(c).toMatchObject({ ok: false, advisory: true, severity: "warning", value: 1, message: "Water source sealed inside rock · X 9 · Y 9 · Z 2" });
    expect(c.where?.tiles).toEqual([[9, 9]]);
    for (const profile of ["generate", "export", "import"] as const) expect(blocks(profile, cave().checks({ profile })["water.sealed_source"])).toBe(false);
  });

  it("passes with a shaft up to the sky, with a tunnel out to the map's edge, and in the open", () => {
    const shaft = cave().fill(12, 12, 12, 12, 5, 7, false);
    expect(shaft.checks({ profile: "import" })["water.sealed_source"]).toMatchObject({ ok: true, message: "No water source is sealed in" });
    const tunnel = cave().fill(0, 7, 10, 10, 2, 2, false);
    expect(tunnel.checks({ profile: "import" })["water.sealed_source"].ok).toBe(true);
    const open = new Scene(24, 24).source(9, 9, GROUND);
    expect(open.checks({ profile: "import" })["water.sealed_source"]).toMatchObject({ ok: true, value: 0 });
  });
});

describe("plants.clearance: a plant needs its height in air", () => {
  /** A slab of rock one block thick at level `z` over the tile (5, 5), held by a wall beside it. */
  const roofed = (s: Scene, z: number) => s.fill(6, 6, 5, 5, GROUND, z).fill(5, 5, 5, 5, z, z);

  it("a pine under rock two levels above its floor has no room; three levels is enough", () => {
    const low = roofed(new Scene(16, 14), GROUND + 2).plant("Pine", 5, 5).checks();
    expect(low["plants.clearance"]).toMatchObject({ ok: false, value: 1, severity: "error", message: "1 plant has no room under the rock above it; the game removes it" });
    expect(low["plants.clearance"].where?.entities).toHaveLength(1);
    expect(low["plants.clearance"].fix?.[0].op).toBe("deleteEntities");
    // counted once, here and not as an object inside terrain
    expect(low["entities.placement"].ok).toBe(true);
    const high = roofed(new Scene(16, 14), GROUND + 3).plant("Pine", 5, 5).checks();
    expect(high["plants.clearance"]).toMatchObject({ ok: true, value: 0, message: "Every plant has room above it" });
  });

  it("a birch needs two levels, and several plants are counted", () => {
    expect(roofed(new Scene(16, 14), GROUND + 2).plant("Birch", 5, 5).checks()["plants.clearance"].ok).toBe(true);
    const two = roofed(new Scene(16, 14), GROUND + 1).plant("Birch", 5, 5);
    two.fill(10, 10, 5, 5, GROUND, GROUND + 2).fill(9, 9, 5, 5, GROUND + 2, GROUND + 2).plant("Oak", 9, 5);
    expect(two.checks()["plants.clearance"]).toMatchObject({ ok: false, value: 2, message: "2 plants have no room under the rock above them; the game removes them" });
    expect(blocks("generate", two.checks({ profile: "generate", loadOnly: true })["plants.clearance"])).toBe(true);
  });

  it("the core's rule says the same, with the air each plant has", () => {
    const s = roofed(new Scene(16, 14), GROUND + 2).plant("Pine", 5, 5).plant("Pine", 2, 2);
    const t = ColumnTerrain.fromVoxels(s.voxels, s.W, s.H);
    expect(plantsWithoutRoom(t, s.entities).map((c) => [c.plant.x, c.plant.y, c.air])).toEqual([[5, 5, 2]]);
    expect(PLANT_CLEARANCE).toMatchObject({ Pine: 3, Oak: 3, Birch: 2, Succulent: 2, BlueberryBush: 1 });
  });
});

describe("terrain.single_floor is an imported map's row", () => {
  it("is absent on a generated map, in generation and in the editor, and stays on an import", () => {
    const s = new Scene(16, 14);
    expect(s.checks({ profile: "generate", loadOnly: true })["terrain.single_floor"]).toBeUndefined();
    expect(s.checks({ profile: "export", loadOnly: true })["terrain.single_floor"]).toBeUndefined();
    expect(s.checks({ profile: "import", loadOnly: true })["terrain.single_floor"]).toMatchObject({ ok: true });
    expect(s.checks({ profile: "export", external: true, loadOnly: true })["terrain.single_floor"]).toMatchObject({ ok: true });
  });
});

describe("slopes.connect blocks a generated map and warns on an imported one (D482)", () => {
  /** A slope on flat ground: nothing a level up on its high side. */
  const lone = () => new Scene(16, 14).start(2, 2).slope(8, 5, GROUND, "Cw0");

  it("the same slope: an error that blocks on a generated map, in generation and at export", () => {
    const made = lone().checks({ profile: "generate", loadOnly: true })["slopes.connect"];
    expect(made).toMatchObject({ ok: false, value: 1, severity: "error" });
    expect(made.advisory).toBeUndefined();
    expect(blocks("generate", made)).toBe(true);
    const edited = lone().checks({ profile: "export", loadOnly: true })["slopes.connect"];
    expect(edited.severity).toBe("error");
    expect(blocks("export", edited)).toBe(true);
  });

  it("a warning on an imported map, with its fix, that blocks nothing", () => {
    for (const opts of [{ profile: "import" }, { profile: "export", external: true }] as const) {
      const c = lone().checks({ ...opts, loadOnly: true })["slopes.connect"];
      expect(c).toMatchObject({ ok: false, value: 1, advisory: true, severity: "warning" });
      expect(c.fix?.[0].op).toBe("removeSlope");
      expect(blocks(opts.profile, c)).toBe(false);
    }
  });

  it("an imported map with such a slope still exports", () => {
    const s = MapSession.importMap(writeTimber(lone().file()), "lone-slope.timber");
    const groups = groupChecks(s, s.validate("export"), null);
    expect(groups.blocking.map((c) => c.id)).toEqual([]);
    expect(groups.advisory.map((c) => c.id)).toContain("slopes.connect");
    const again = MapSession.importMap(s.exportTimber().bytes, "lone-slope.timber");
    expect(again.built.entities.filter((e) => e.template === "Slope")).toHaveLength(1);
  });
});
