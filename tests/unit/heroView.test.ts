// The map's picture's camera and light (D488, `render3d/heroView.ts`): the game's opening camera on the start, the map
// as it is, the start hidden; and the sun the game turns with its camera (light.ts `sunOfYaw`, D497), so the picture
// is lit as the game's thumbnails are, from behind the camera's left shoulder.

import { describe, expect, it } from "vitest";
import { openingCamera, OPENING, VISTA_ZOOM } from "../../src/core/analysis/opening";
import { ORIENTATIONS, startMiddleTile } from "../../src/core/format/footprints";
import { heroScene } from "../../src/render3d/heroView";
import { sunOfYaw, sunVector } from "../../src/render3d/light";
import { LIGHT } from "../../src/render3d/palette";
import { LAYERS, type EntityView, type MapView } from "../../src/render3d/model";

/** A W × H map with a slope of heights, a column with a cave, two water columns on one tile, soil, and objects of
 *  several footprints at every orientation. */
function sample(W: number, H: number, start: number): MapView {
  const N = W * H;
  const heights = Uint8Array.from({ length: N }, (_, i) => 2 + ((i * 7) % 11));
  const cave = 3 * W + 4;
  const voxels = new Uint8Array(LAYERS);
  for (let z = 0; z < 8; z++) voxels[z] = z < 2 || z >= 5 ? 1 : 0;
  heights[cave] = 8;
  const objects: [string, number, number, number, number][] = [
    ["StartingLocation", 6, 6, 4, start],
    ["Pine", 1, 2, 3, 0],
    ["RuinColumnH3", 9, 1, 2, 1],
    ["Slope", 2, 9, 5, 2],
    ["UndergroundRuins", 10, 8, 2, 3],
    ["WaterSource", 3, 12, 1, 1],
    ["MediumRelic", 2, 4, 3, 1],
    ["MediumRelic", 12, 12, 3, 2],
    ["NaturalOverhang3x1", 8, 13, 6, 3],
    ["BadwaterSource", 5, 1, 2, 0],
  ];
  const templates = [...new Set(objects.map((o) => o[0]))];
  const n = objects.length;
  const entities: EntityView = {
    count: n,
    templates,
    owners: ["f"],
    template: Uint16Array.from(objects, (o) => templates.indexOf(o[0])),
    x: Int16Array.from(objects, (o) => o[1]),
    y: Int16Array.from(objects, (o) => o[2]),
    z: Int16Array.from(objects, (o) => o[3]),
    orientation: Uint8Array.from(objects, (o, k) => o[4] | (k === 1 ? 8 : 0)),
    flags: new Uint8Array(n),
    owner: new Uint16Array(n),
    variant: Uint8Array.from(objects, (_, k) => k),
    strength: Float32Array.from(objects, (_, k) => k / 2),
    ids: objects.map((_, k) => `e${k}`),
  };
  return {
    W,
    H,
    heights,
    columns: { tiles: Int32Array.of(cave), voxels },
    water: { count: 2, tile: Int32Array.of(cave, cave), floor: Float32Array.of(2, 8), depth: Float32Array.of(1.5, 0.5), contamination: Float32Array.of(0, 0.3), outflow: Float32Array.of(1, 2, 3, 4, 5, 6, 7, 8) },
    entities,
    soil: { moisture: Uint8Array.from({ length: N }, (_, i) => i % 200), contamination: Uint8Array.from({ length: N }, (_, i) => (i * 3) % 255), runs: { tile: Int32Array.of(cave), level: Uint8Array.of(2), moisture: Uint8Array.of(9), contamination: Uint8Array.of(0) } },
  };
}

describe("the map's picture: its camera and light (D488)", () => {
  it("is lit by the game's sun, which turns with the camera: 45° up, from behind the camera's left shoulder", () => {
    // (Sun.blueprint DayColors SunXAngle 45; Sun.UpdateRotation: the camera's turn + RotateWithCameraOffset 40)
    expect(LIGHT.sunElevation).toBeCloseTo(Math.PI / 4, 12);
    expect(LIGHT.sunFollow).toBe(40);
    for (const yaw of [0, 0.7, -2.1, Math.PI]) {
      const s = sunOfYaw(yaw);
      // the camera at yaw looks along (−sin yaw, cos yaw) on the map (north at yaw 0); the sun is behind it, 40° round
      const look = [-Math.sin(yaw), Math.cos(yaw)];
      const along = s.x * look[0] + s.y * look[1];
      expect(along).toBeCloseTo(-Math.cos((40 * Math.PI) / 180), 9);
      // and to its left: the camera's left at yaw is (−cos yaw, −sin yaw)
      expect(s.x * -Math.cos(yaw) + s.y * -Math.sin(yaw)).toBeCloseTo(Math.sin((40 * Math.PI) / 180), 9);
      const v = sunVector(s);
      expect(Math.asin(v[1])).toBeCloseTo(Math.PI / 4, 9);
    }
  });

  it("looks from the game's opening camera on the map as it is, at the default zoom's widest, with the start hidden", () => {
    for (let o = 0; o < 4; o++) {
      const v = sample(20, 18, o);
      const { view, camera } = heroScene(v);
      expect([view.W, view.H]).toEqual([v.W, v.H]);
      expect(view.heights).toBe(v.heights);
      const orientation = ORIENTATIONS[o];
      const [mx, my] = startMiddleTile({ x: 6, y: 6, orientation });
      const cam = openingCamera({ x: mx, y: my, z: 4, orientation }, VISTA_ZOOM);
      expect(camera.pitch).toBeCloseTo((60 * Math.PI) / 180, 12);
      expect(camera.yaw).toBeCloseTo(-((o * 90 + OPENING.turn) * Math.PI) / 180, 12);
      expect(camera.fov).toBe(35);
      expect(camera.distance).toBeCloseTo(32 * 1.3 ** 6, 9);
      expect(camera.target).toEqual([cam.target[0], cam.target[2], -cam.target[1]]);
      expect(view.entities.count).toBe(v.entities.count - 1);
      expect(view.entities.templates.filter((_, k) => Array.from(view.entities.template).includes(k))).not.toContain("StartingLocation");
      expect(view.entities.ids).not.toContain("e0");
    }
  });

  it("looks at a map without a start from the game's default thumbnail camera: 40° down, looking north, the map's width away", () => {
    const v = sample(20, 12, 0);
    const e = v.entities;
    const none: MapView = { ...v, entities: { ...e, count: 1, template: e.template.slice(1, 2), x: e.x.slice(1, 2), y: e.y.slice(1, 2), z: e.z.slice(1, 2), orientation: e.orientation.slice(1, 2), flags: e.flags.slice(1, 2), owner: e.owner.slice(1, 2), variant: e.variant.slice(1, 2), strength: e.strength.slice(1, 2), ids: e.ids.slice(1, 2) } };
    const { view, camera } = heroScene(none);
    expect([view.W, view.H]).toEqual([20, 12]);
    expect(camera.pitch).toBeCloseTo((40 * Math.PI) / 180, 12);
    expect(camera.yaw).toBe(0);
    expect(camera.distance).toBe(20);
    expect(camera.target).toEqual([10, 0, -6]);
  });
});
