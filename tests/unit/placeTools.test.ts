// The shelf's and Remove's pointer tools (PLAN §20 D184): a click places, a drag paints trees and
// plants them once on release; Remove glows under the pointer, a click takes a tile, a drag its
// rectangle.

import { describe, expect, it } from "vitest";
import { shelfTool } from "../../src/editor/placeTools";
import { DEFAULT_SHELF_OPTIONS, objectOptionsOf, quietWord, SHELF, templateOf } from "../../src/editor/shelfItems";
import { hasOptions, optionProblems, placeComponents } from "../../src/core/doc/objectOps";
import { FOOTPRINTS } from "../../src/core/format/footprints";
import { PAINT_KINDS } from "../../src/core/doc/paintParams";
import { BADWATER_STRENGTHS, DEFAULT_OPTIONS, SOURCE_STRENGTHS, sourceRequest } from "../../src/editor/tools";
import type { TileHit } from "../../src/render3d";

const hit = (x: number, y: number) => ({ x, y }) as TileHit;
const ev = (button = 0) => ({ button, clientX: 0, clientY: 0 }) as PointerEvent;
const W = 20;

describe("the shelf's pointer tool", () => {
  it("a click places; a drag with trees paints along the way and plants once", () => {
    const log: string[] = [];
    let painting: number[] | null = null;
    const host = (trees: boolean) => ({
      W,
      H: W,
      hover: (h: TileHit | null) => log.push(`hover ${h ? `${h.x},${h.y}` : "off"}`),
      place: (x: number, y: number) => log.push(`place ${x},${y}`),
      paintAround: (x: number, y: number) => (trees ? [Math.floor(y) * W + Math.floor(x)] : null),
      painting: (t: number[] | null) => void (painting = t),
      plant: (t: number[]) => log.push(`plant ${t.length}`),
    });
    const click = shelfTool(host(false));
    click.down(hit(3, 4), ev());
    click.up(hit(3, 4), ev());
    expect(log).toEqual(["place 3,4"]);
    log.length = 0;
    const drag = shelfTool(host(true));
    drag.down(hit(2, 2), ev());
    drag.move(hit(6, 2), ev());
    expect(painting!.length).toBe(5);
    drag.up(hit(6, 2), ev());
    expect(log.filter((l) => !l.startsWith("hover"))).toEqual(["plant 5"]);
    expect(painting).toBeNull();
    // a click with trees plants one, as a place
    log.length = 0;
    drag.down(hit(8, 8), ev());
    drag.up(hit(8, 8), ev());
    expect(log).toEqual(["place 8,8"]);
    // the right button is the camera's
    expect(drag.down(hit(1, 1), ev(2))).toBe(false);
  });

  it("aims at the ground seen (the voxel pick: a cave's floor, D491) and hands the click its hit", () => {
    const placed: (TileHit | null)[] = [];
    const t = shelfTool({ W, H: W, hover: () => undefined, place: (_x, _y, h) => placed.push(h), paintAround: () => null, painting: () => undefined, plant: () => undefined });
    expect(t.voxel).toBe(true);
    const floor = { x: 3, y: 4, level: 3 } as TileHit;
    t.down(floor, ev());
    t.up(floor, ev());
    // (released off the map: the pressed tile's hit)
    t.down(floor, ev());
    t.up(null, ev());
    expect(placed).toEqual([floor, floor]);
  });
});

describe("the shelf's objects (D212, D226)", () => {
  it("read Start, the water objects, Natural dam, the trees, Succulent, Mixed woods, Berry bush and so on (Layout 2's objects menu, with every 1.x object); the sources place clean and bad", () => {
    expect(SHELF.slice(0, 8).map((it) => it.name)).toEqual(["Start", "Water source", "Badwater source", "Water seep", "Badwater seep", "Aquifer", "Ancient drill", "Badtide drain"]);
    const [clean, bad] = [SHELF[1], SHELF[2]];
    // (no keys on the shelf: Kyler, 2026-10-06)
    expect([clean.source, clean.template, bad.source, bad.template]).toEqual(["clean", "WaterSource", "bad", "BadwaterSource"]);
    // what they place: a clean source on the tile, a bad one's 3 x 3 round it, at the row's strength
    expect(sourceRequest({ ...DEFAULT_OPTIONS, sourceBad: false, sourceStrength: 4 }, 10, 12)).toMatchObject({ template: "WaterSource", x: 10, y: 12, components: { WaterSource: { SpecifiedStrength: 4 } } });
    expect(sourceRequest({ ...DEFAULT_OPTIONS, sourceBad: true, badwaterStrength: 2 }, 10, 12)).toMatchObject({ template: "BadwaterSource", x: 9, y: 11, components: { WaterSource: { SpecifiedStrength: 2 } } });
  });
});

describe("a placed source starts at the game's own default strength (D323 item 46)", () => {
  it("1 water/s for a water source, 3 for a badwater source, from the game's blueprints (WaterSourceSpec DefaultStrength); both sit among the official maps' strengths", () => {
    expect(DEFAULT_OPTIONS.sourceStrength).toBe(1);
    expect(DEFAULT_OPTIONS.badwaterStrength).toBe(3);
    expect(sourceRequest(DEFAULT_OPTIONS, 10, 12).components).toEqual({ WaterSource: { SpecifiedStrength: 1, CurrentStrength: 1 } });
    expect(sourceRequest({ ...DEFAULT_OPTIONS, sourceBad: true }, 10, 12).components).toEqual({ WaterSource: { SpecifiedStrength: 3, CurrentStrength: 3 } });
    // (docs/FINDINGS.md "Sources": official water sources run 0.25 to 1.5, badwater 0.5 to 3.0)
    expect(SOURCE_STRENGTHS).toContain(DEFAULT_OPTIONS.sourceStrength);
    expect(BADWATER_STRENGTHS).toContain(DEFAULT_OPTIONS.badwaterStrength);
  });
});

describe("the shelf's quiet words (D184)", () => {
  it("say why in a word or two", () => {
    expect(quietWord("it would stand inside the ground: the ground under it is not level")).toBe("needs level ground");
    expect(quietWord("the district center stands there")).toBe("the start stands there");
    expect(quietWord("the water is in the way: the ground here is uneven, and levelling it would spill the water")).toBe("water is in the way");
    expect(quietWord("a mine site stands there")).toBe("a mine site is there");
    expect(quietWord("too close to the map edge")).toBe("too near the edge");
    expect(quietWord("under water")).toBe("under water");
    // (under a roof, the core's lines, D491)
    expect(quietWord("the start needs open ground: there is a cave or overhang there")).toBe("the start needs open ground");
    expect(quietWord("the game keeps a water source only on ground that goes down to the bottom of the map, not on a roof or a ledge")).toBe("not on a roof or a ledge");
  });
});

describe("every shelf object is one the core can place, with options the core accepts (D337, D338)", () => {
  it("each has a footprint; each object with settings places with its defaults and passes the core's checks, a plant is painted by a kind the core knows", () => {
    for (const it of SHELF) {
      const template = templateOf(it, DEFAULT_SHELF_OPTIONS);
      expect(FOOTPRINTS[template], it.name).toBeDefined();
      if (it.paint) expect(PAINT_KINDS, it.name).toContain(it.paint);
      if (!hasOptions(template)) continue;
      const c = placeComponents(template, objectOptionsOf(DEFAULT_SHELF_OPTIONS, template))!;
      expect(optionProblems(template, c), it.name).toEqual([]);
    }
  });
});
