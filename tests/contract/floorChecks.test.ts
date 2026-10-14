// The load checks on terrain above terrain (3D Foundations, stage 2; investigation/terrain3d
// INVENTORY.md's two bugs): the support rule runs on every map with a tile that is not one plain run
// from the bottom, whatever its count of floors, and a slope and the start are read on the floor they
// stand on, not the tile's top surface. Small hand-made maps, the checks called directly.

import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../src/core/format/json";
import type { TimberFile } from "../../src/core/format/timber";
import { emptySimulationSingletons, GAME_VERSION, LAYERS, voxelsFromHeights } from "../../src/core/format/world";
import { validateMap } from "../../src/core/validate/checks";
import type { CheckResult } from "../../src/core/validate/report";

const W = 16;
const H = 14;
const N = W * H;
const GROUND = 4;

/** Flat ground at level 4, to carve and build on. */
class Scene {
  voxels = voxelsFromHeights(new Uint8Array(N).fill(GROUND), W, H);
  entities: JsonObject[] = [];
  set(x: number, y: number, z: number, solid: boolean): this {
    this.voxels[z * N + y * W + x] = solid ? 1 : 0;
    return this;
  }
  /** Solid from z0 up to and including z1. */
  fill(x: number, y: number, z0: number, z1: number, solid = true): this {
    for (let z = z0; z <= z1; z++) this.set(x, y, z, solid);
    return this;
  }
  add(template: string, x: number, y: number, z: number): this {
    this.entities.push({ Id: `00000000-0000-4000-8000-${String(this.entities.length).padStart(12, "0")}`, Template: template, Components: { BlockObject: { Coordinates: { X: x, Y: y, Z: z }, Orientation: "Cw0" } } });
    return this;
  }
  checks(): Record<string, CheckResult> {
    const file: TimberFile = {
      metadata: {},
      thumbnail: null,
      versionTxt: GAME_VERSION + "\r\n",
      world: { gameVersion: GAME_VERSION, timestamp: "2026-10-07 00:00:00", sizeX: W, sizeY: H, layers: LAYERS, voxels: this.voxels, singletons: emptySimulationSingletons(W, H), entities: this.entities },
      extraFiles: [],
    };
    return Object.fromEntries(validateMap(file, { profile: "import", loadOnly: true }).report.checks.map((c) => [c.id, c]));
  }
}

describe("the support rule on every map (terrain.supported)", () => {
  /** A wall to level 7 at (2, 5) with a ledge at z = 6 reaching `out` tiles from it over open air. */
  const ledge = (out: number) => {
    const s = new Scene().fill(2, 5, GROUND, 6);
    for (let k = 1; k <= out; k++) s.set(2 + k, 5, 6, true);
    return s;
  };

  it("an overhang three out from its wall stands; the fourth block floats", () => {
    expect(ledge(3).checks()["terrain.supported"]).toMatchObject({ ok: true, value: 0 });
    expect(ledge(4).checks()["terrain.supported"]).toMatchObject({ ok: false, value: 1 });
  });

  it("ground floating over air all the way down is checked, though each tile has one floor", () => {
    // a slab at z = 6 over a trench cut to the bottom, touching nothing: the game deletes all of it
    const s = new Scene();
    for (let x = 4; x <= 11; x++) s.fill(x, 9, 0, GROUND - 1, false).set(x, 9, 6, true);
    const c = s.checks();
    expect(c["terrain.single_floor"].ok).toBe(true);
    expect(c["terrain.supported"]).toMatchObject({ ok: false, value: 8 });
    // the same span resting on a wall at each end, six across: every block within three of a wall
    const held = new Scene().fill(4, 9, GROUND, 6).fill(11, 9, GROUND, 6);
    for (let x = 5; x <= 10; x++) held.fill(x, 9, 0, GROUND - 1, false).set(x, 9, 6, true);
    expect(held.checks()["terrain.supported"]).toMatchObject({ ok: true, value: 0 });
  });

  it("a heightfield has nothing to check", () => {
    expect(new Scene().fill(3, 3, GROUND, 12).checks()["terrain.supported"]).toMatchObject({ ok: true, value: 0 });
  });
});

describe("a slope is read on the floor it stands on (slopes.connect)", () => {
  /** A step up from level 4 to 5 at y = 4 and above (lower y), with a slope at (8, 5) joining it. */
  const step = () => {
    const s = new Scene();
    for (let y = 0; y <= 4; y++) for (let x = 0; x < W; x++) s.set(x, y, GROUND, true);
    return s.add("Slope", 8, 5, GROUND);
  };

  it("joins its step in the open", () => {
    expect(step().checks()["slopes.connect"].ok).toBe(true);
  });

  it("joins its step under a roof", () => {
    const s = step();
    for (const y of [4, 5, 6]) s.set(8, y, 8, true);
    expect(s.checks()["slopes.connect"].ok).toBe(true);
  });

  it("joins its step on a ledge, over a cave", () => {
    const s = step();
    for (const y of [4, 5, 6]) s.fill(8, y, 1, 2, false);
    expect(s.checks()["slopes.connect"].ok).toBe(true);
  });

  it("under a roof, joins nothing when its high side is a wall or its foot a drop", () => {
    const wall = step().fill(8, 4, GROUND + 1, 8);
    for (const y of [5, 6]) wall.set(8, y, 8, true);
    expect(wall.checks()["slopes.connect"]).toMatchObject({ ok: false, value: 1 });
    const drop = step().set(8, 6, GROUND - 1, false);
    for (const y of [4, 5, 6]) drop.set(8, y, 8, true);
    expect(drop.checks()["slopes.connect"]).toMatchObject({ ok: false, value: 1 });
  });
});

describe("the start is read on the floor it stands on (start.flat, start.entrance)", () => {
  /** The start's 3×3 at (6–8, 6–8), its entrance at (7, 5). */
  const start = (z = GROUND) => new Scene().add("StartingLocation", 6, 6, z);
  /** A roof one block thick at level `z` over the start and its entrance. */
  const roofed = (s: Scene, z: number) => {
    for (let y = 5; y <= 8; y++) for (let x = 6; x <= 8; x++) s.set(x, y, z, true);
    return s;
  };

  it("in the open, and under a roof clear of its five levels", () => {
    for (const s of [start(), roofed(start(), GROUND + 5)]) {
      const c = s.checks();
      expect(c["start.flat"].ok).toBe(true);
      expect(c["start.entrance"].ok).toBe(true);
    }
  });

  it("on a ledge, over a cave", () => {
    const s = start();
    for (let y = 5; y <= 8; y++) for (let x = 6; x <= 8; x++) s.fill(x, y, 1, 2, false);
    const c = s.checks();
    expect(c["start.flat"].ok).toBe(true);
    expect(c["start.entrance"].ok).toBe(true);
  });

  it("under a roof, uneven ground and a walled entrance still fail", () => {
    const hole = roofed(start(), GROUND + 5).set(7, 7, GROUND - 1, false);
    expect(hole.checks()["start.flat"].ok).toBe(false);
    const walled = roofed(start(), GROUND + 5).fill(7, 5, GROUND, GROUND + 4);
    const c = walled.checks();
    expect(c["start.flat"].ok).toBe(true);
    expect(c["start.entrance"].ok).toBe(false);
  });
});
