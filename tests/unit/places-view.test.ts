// Real places' card pictures face one way (Kyler, 2026-09-25; src/core/places/view.ts): the index
// records the direction the 3D overview looks (`view`), the map from above is turned to match, and
// each picture's north arrow shows where north is.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { decodeHeights, decodePlaceFile, type PlaceIndex } from "../../src/core/places/place";
import { innerLevel, placeView, viewYaw, VIEW_TURNS, type PlaceView } from "../../src/core/places/view";
import { northLabel } from "../../src/ui/NorthArrow";

const INDEX = JSON.parse(readFileSync("public/real-places/index.json", "utf8")) as PlaceIndex;
const VIEWS: PlaceView[] = ["N", "E", "S", "W"];
/** A direction in tiles (y grows northward). */
const COMPASS: Record<PlaceView, [number, number]> = { N: [0, 1], E: [1, 0], S: [0, -1], W: [-1, 0] };

describe("which way a place's pictures face", () => {
  it("each view's camera looks that way, and north is its quarter turns clockwise from the top", () => {
    for (const v of VIEWS) {
      const yaw = viewYaw(v);
      // src/render3d/renderer.ts: the camera stands at the target + (sin yaw, cos yaw) in world x
      // and z (z = -y), so it looks along (-sin yaw, cos yaw) in tiles
      const ahead = [-Math.sin(yaw), Math.cos(yaw)];
      expect(ahead[0], v).toBeCloseTo(COMPASS[v][0], 9);
      expect(ahead[1], v).toBeCloseTo(COMPASS[v][1], 9);
      // north (0, 1), clockwise from the picture's top u (the way the camera looks): atan2(-ux, uy)
      const [ux, uy] = COMPASS[v];
      const clockwise = Math.round((Math.atan2(-ux, uy) * 180) / Math.PI);
      expect((((clockwise % 360) + 360) % 360) / 90, v).toBe(VIEW_TURNS[v]);
    }
    expect([0, 1, 2, 3].map(northLabel)).toEqual(["North is up", "North is to the right", "North is down", "North is to the left"]);
  });

  it("looks along the axis nearest to the way the land rises, north when it is flat", () => {
    const W = 64;
    const ramp = (f: (x: number, y: number) => number) => Array.from({ length: W * W }, (_, i) => f(i % W, Math.floor(i / W)));
    expect(placeView(ramp((x) => Math.floor(x / 8)), W, W)).toBe("E");
    expect(placeView(ramp((x) => Math.floor((W - x) / 8)), W, W)).toBe("W");
    expect(placeView(ramp((_, y) => Math.floor(y / 8)), W, W)).toBe("N");
    expect(placeView(ramp((_, y) => Math.floor((W - y) / 8)), W, W)).toBe("S");
    // mostly east, a little north: east
    expect(placeView(ramp((x, y) => Math.floor((2 * x + y) / 12)), W, W)).toBe("E");
    expect(placeView(ramp(() => 5), W, W)).toBe("N");
    // a wall along the edges is left out
    expect(innerLevel(ramp((x, y) => (x < 4 || y < 4 || x >= W - 4 || y >= W - 4 ? 16 : 3)), W, W)).toBe(3);
    expect(placeView(ramp((x, y) => (x < 4 ? 16 : Math.floor((W - x) / 8))), W, W)).toBe("W");
  });

  it("the index records each place's view, as the overview's camera works it out", () => {
    const seen = new Set<PlaceView>();
    for (const e of INDEX.places) {
      const p = decodePlaceFile(new Uint8Array(readFileSync(`public/real-places/${e.data}`)));
      expect(e.view, e.id).toBe(placeView(decodeHeights(p.heights), p.W, p.H));
      seen.add(e.view);
    }
    expect([...seen].sort()).toEqual(["E", "N", "S", "W"]);
    // the pictures tool aims the overview and turns the map from above by the index's view, and
    // the gallery turns the north arrows by it
    const tool = readFileSync("tools/places-thumbs.ts", "utf8");
    expect(tool).toContain("viewYaw(view)");
    expect(tool).toContain("VIEW_TURNS[p.view]");
    expect(readFileSync("src/places/Gallery.tsx", "utf8")).toContain("north={VIEW_TURNS[p.view]}");
  });
});
