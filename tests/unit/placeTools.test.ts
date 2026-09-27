// The shelf's and Remove's pointer tools (PLAN §20 D184): a click places, a drag paints trees and
// plants them once on release; Remove glows under the pointer, a click takes a tile, a drag its
// rectangle.

import { describe, expect, it } from "vitest";
import { shelfTool } from "../../src/editor/placeTools";
import { quietWord, SHELF } from "../../src/editor/shelfItems";
import { DEFAULT_OPTIONS, sourceRequest } from "../../src/editor/tools";
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
});

describe("the shelf's objects (D212, D226)", () => {
  it("read Water source, Badwater source, Start, Pine, Birch, Oak, Berry bush and so on (D226); the sources place clean and bad", () => {
    expect(SHELF.slice(0, 7).map((it) => it.name)).toEqual(["Water source", "Badwater source", "Start", "Pine", "Birch", "Oak", "Berry bush"]);
    const [clean, bad] = [SHELF[0], SHELF[1]];
    expect([clean.source, clean.template, clean.key, bad.source, bad.template]).toEqual(["clean", "WaterSource", "6", "bad", "BadwaterSource"]);
    // what they place: a clean source on the tile, a bad one's 3 x 3 round it, at the row's strength
    expect(sourceRequest({ ...DEFAULT_OPTIONS, sourceBad: false, sourceStrength: 4 }, 10, 12)).toMatchObject({ template: "WaterSource", x: 10, y: 12, components: { WaterSource: { SpecifiedStrength: 4 } } });
    expect(sourceRequest({ ...DEFAULT_OPTIONS, sourceBad: true, badwaterStrength: 2 }, 10, 12)).toMatchObject({ template: "BadwaterSource", x: 9, y: 11, components: { WaterSource: { SpecifiedStrength: 2 } } });
  });
});

describe("the shelf's quiet words (D184)", () => {
  it("say why in a word or two", () => {
    expect(quietWord("it would stand inside the ground: the ground under it is not level")).toBe("needs level ground");
    expect(quietWord("the district center stands there")).toBe("the start stands there");
    expect(quietWord("a mine site stands there")).toBe("a mine site is there");
    expect(quietWord("too close to the map edge")).toBe("too near the edge");
    expect(quietWord("under water")).toBe("under water");
  });
});
