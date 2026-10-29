// The map's picture's camera and light (D488, `render3d/heroView.ts`): the game's opening camera on the start, the
// map turned under the view's fixed sun so the light falls as the game's thumbnails have it (the sun turning with the
// camera), the start hidden, and a turned map the same map: every tile, column, water column, soil and object where
// a quarter turn puts it.

import { describe, expect, it } from "vitest";
import { openingCamera, OPENING, VISTA_ZOOM } from "../../src/core/analysis/opening";
import { footprintTiles, ORIENTATIONS, startMiddleTile } from "../../src/core/format/footprints";
import { heroScene, sunTurns, turnView } from "../../src/render3d/heroView";
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

/** Where a quarter turn clockwise puts tile (x, y) of a map W wide. */
const turned = (x: number, y: number, W: number): [number, number] => [y, W - 1 - x];

describe("the map's picture: its camera and light (D488)", () => {
  it("puts the sun nearest where the game's stands: behind the camera's left shoulder", () => {
    // the view's sun is toward the north-west (315°); the game's toward the camera's turn + 220°
    for (let o = 0; o < 4; o++) expect((o + sunTurns(o * 90 + OPENING.turn)) % 4, `start Cw${o * 90}`).toBe(1);
    expect(sunTurns(0)).toBe(1);
  });

  it("turns a map a quarter: tiles, columns, water, soil and every object's covered tiles go where the turn puts them", () => {
    const W = 14;
    const H = 16;
    const v = sample(W, H, 2);
    const t = turnView(v, 1);
    expect([t.W, t.H]).toEqual([H, W]);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const [nx, ny] = turned(x, y, W);
        const i = y * W + x;
        const j = ny * t.W + nx;
        expect(t.heights[j]).toBe(v.heights[i]);
        expect(t.soil!.moisture[j]).toBe(v.soil!.moisture[i]);
        expect(t.soil!.contamination[j]).toBe(v.soil!.contamination[i]);
      }
    const [cx, cy] = turned(4, 3, W);
    expect(Array.from(t.columns.tiles)).toEqual([cy * t.W + cx]);
    expect(Array.from(t.columns.voxels)).toEqual(Array.from(v.columns.voxels));
    expect(Array.from(t.water.tile)).toEqual([cy * t.W + cx, cy * t.W + cx]);
    expect(Array.from(t.soil!.runs!.tile)).toEqual([cy * t.W + cx]);
    // an outflow east (+x, the fourth) now runs south (−y, the first); one north (+y) now runs east (+x)
    expect(Array.from(t.water.outflow!)).toEqual([4, 1, 2, 3, 8, 5, 6, 7]);
    for (let k = 0; k < v.entities.count; k++) {
      const name = v.entities.templates[v.entities.template[k]];
      const at = (e: EntityView) => ({ template: name, x: e.x[k], y: e.y[k], z: e.z[k], orientation: ORIENTATIONS[e.orientation[k] & 3], flipped: false });
      const before = footprintTiles(name, at(v.entities)).map(([x, y]) => turned(x, y, W).join(",")).sort();
      const after = footprintTiles(name, at(t.entities)).map(([x, y]) => [x, y].join(",")).sort();
      expect(after, name).toEqual(before);
      expect(t.entities.orientation[k] & 3, name).toBe(((v.entities.orientation[k] & 3) + 1) % 4);
      expect(t.entities.orientation[k] & ~3, name).toBe(v.entities.orientation[k] & ~3);
    }
    // four quarter turns are the map itself
    const back = turnView(v, 4);
    expect(back).toBe(v);
    const round = turnView(turnView(v, 2), 2);
    expect(Array.from(round.heights)).toEqual(Array.from(v.heights));
    expect(Array.from(round.entities.x)).toEqual(Array.from(v.entities.x));
    expect(Array.from(round.entities.y)).toEqual(Array.from(v.entities.y));
  });

  it("looks from the game's opening camera on the turned map, at the default zoom's widest, with the start hidden", () => {
    for (let o = 0; o < 4; o++) {
      const v = sample(20, 18, o);
      const { view, camera } = heroScene(v);
      const t = turnView(v, sunTurns(o * 90 + OPENING.turn));
      // the start, on the turned map, faces a quarter clockwise (the sun's best)
      let s = -1;
      for (let k = 0; k < t.entities.count; k++) if (t.entities.templates[t.entities.template[k]] === "StartingLocation") s = k;
      const orientation = ORIENTATIONS[t.entities.orientation[s] & 3];
      expect(orientation).toBe("Cw90");
      const [mx, my] = startMiddleTile({ x: t.entities.x[s], y: t.entities.y[s], orientation });
      const cam = openingCamera({ x: mx, y: my, z: 4, orientation }, VISTA_ZOOM);
      expect(camera.pitch).toBeCloseTo((60 * Math.PI) / 180, 12);
      expect(camera.yaw).toBeCloseTo(-((90 + 35) * Math.PI) / 180, 12);
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
    const keep = 1;
    const e = v.entities;
    const none: MapView = { ...v, entities: { ...e, count: keep, template: e.template.slice(1, 2), x: e.x.slice(1, 2), y: e.y.slice(1, 2), z: e.z.slice(1, 2), orientation: e.orientation.slice(1, 2), flags: e.flags.slice(1, 2), owner: e.owner.slice(1, 2), variant: e.variant.slice(1, 2), strength: e.strength.slice(1, 2), ids: e.ids.slice(1, 2) } };
    const { view, camera } = heroScene(none);
    // turned a quarter: the map's north looks east
    expect([view.W, view.H]).toEqual([12, 20]);
    expect(camera.pitch).toBeCloseTo((40 * Math.PI) / 180, 12);
    expect(camera.yaw).toBeCloseTo(-Math.PI / 2, 12);
    expect(camera.distance).toBe(20);
    expect(camera.target).toEqual([6, 0, -10]);
  });
});
