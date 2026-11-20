// The map's picture's camera and light (D488, `render3d/heroView.ts`): the game's map thumbnail camera framing the map
// (40° down, face-on, turned to the start's orientation, the map filling the frame), the map as it is, the start hidden; and the sun the game turns with its camera (light.ts `sunOfYaw`, D497), so the picture
// is lit as the game's thumbnails are, from behind the camera's left shoulder.

import { describe, expect, it } from "vitest";
import { OPENING } from "../../src/core/analysis/opening";
import { castPicture, PIXEL } from "../../src/core/analysis/picture";
import { formSights, FORM_LEAST, framePasses, heroCamera, heroScene, pictureLand, pictureValue, SIGHT_VOID, sightCamera, sightCast, sightFrames, voidShare } from "../../src/render3d/heroView";
import type { PictureLand } from "../../src/core/analysis/picture";
import { sunOfYaw, sunVector } from "../../src/render3d/light";
import { LIGHT } from "../../src/render3d/palette";
import { LAYERS, type EntityView, type MapView } from "../../src/render3d/model";
import { lapseCamera } from "../../src/editor/timelapse/camera";
import { lapsePlan } from "../../src/editor/timelapse/plan";

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

  it("looks from the game's thumbnail camera, face-on, turned to the start's orientation, on the map as it is, with the start hidden", () => {
    for (let o = 0; o < 4; o++) {
      const v = sample(20, 18, o);
      const { view, camera } = heroScene(v);
      expect([view.W, view.H]).toEqual([v.W, v.H]);
      expect(view.heights).toBe(v.heights);
      expect(camera.pitch).toBeCloseTo((40 * Math.PI) / 180, 12);
      expect(camera.yaw).toBeCloseTo(-(o * 90 * Math.PI) / 180, 12);
      expect(camera.fov).toBe(OPENING.fov);
      const c = heroCamera(20, 18, v.heights, o, pictureLand(v));
      expect(camera.target).toEqual([c.x, c.level, -c.y]);
      expect(view.entities.count).toBe(v.entities.count - 1);
      expect(view.entities.templates.filter((_, k) => Array.from(view.entities.template).includes(k))).not.toContain("StartingLocation");
      expect(view.entities.ids).not.toContain("e0");
    }
  });

  it("looks north at a map without a start", () => {
    const v = sample(20, 12, 0);
    const e = v.entities;
    const none: MapView = { ...v, entities: { ...e, count: 1, template: e.template.slice(1, 2), x: e.x.slice(1, 2), y: e.y.slice(1, 2), z: e.z.slice(1, 2), orientation: e.orientation.slice(1, 2), flags: e.flags.slice(1, 2), owner: e.owner.slice(1, 2), variant: e.variant.slice(1, 2), strength: e.strength.slice(1, 2), ids: e.ids.slice(1, 2) } };
    const { view, camera } = heroScene(none);
    expect([view.W, view.H]).toEqual([20, 12]);
    expect(camera.yaw).toBe(-0);
    const c = heroCamera(20, 12, v.heights, 0, pictureLand(none));
    expect(camera.target).toEqual([c.x, c.level, -c.y]);
    expect(camera.distance).toBe(c.distance);
  });

  it("fills the frame with the map: every corner of the frame lands on it at the ground's mean level, and one more step back would not", () => {
    const p = (40 * Math.PI) / 180;
    const tanV = Math.tan(((OPENING.fov / 2) * Math.PI) / 180);
    const tanH = tanV * OPENING.aspect;
    for (const [W, H] of [[128, 128], [256, 96], [64, 200]]) {
      const heights = new Uint8Array(W * H).fill(10);
      for (let o = 0; o < 4; o++) {
        const c = heroCamera(W, H, heights, o);
        expect(c.level).toBe(10);
        // the camera's look and right on the map (tile x, tile y), as the renderer turns it: north (+y) at yaw 0
        const look = [-Math.sin(c.yaw), Math.cos(c.yaw)];
        const right = [Math.cos(c.yaw), Math.sin(c.yaw)];
        const corners = (d: number) =>
          [-1, 1].flatMap((a) =>
            [-1, 1].map((b) => {
              const eye = [c.x - look[0] * d * Math.cos(p), c.y - look[1] * d * Math.cos(p), c.level + d * Math.sin(p)];
              const dir = [0, 1].map((k) => look[k] * Math.cos(p) + a * tanH * right[k] + b * tanV * look[k] * Math.sin(p));
              const dz = -Math.sin(p) + b * tanV * Math.cos(p);
              const t = (c.level - eye[2]) / dz;
              return [eye[0] + t * dir[0], eye[1] + t * dir[1]];
            }),
          );
        const on = (d: number) => corners(d).every(([x, y]) => x >= -1e-6 && x <= W + 1e-6 && y >= -1e-6 && y <= H + 1e-6);
        expect(on(c.distance), `${W}×${H} turned ${o}`).toBe(true);
        expect(on(c.distance * 1.02), `${W}×${H} turned ${o}`).toBe(false);
        // centred across the map
        expect(o % 2 === 0 ? c.x : c.y).toBeCloseTo(o % 2 === 0 ? W / 2 : H / 2, 9);
      }
    }
  });

  it("slides along the map, within the room it has, to the place whose picture scores best by the looks score: the middle where all score the same", () => {
    const W = 128;
    const H = 128;
    const N = W * H;
    const heights = new Uint8Array(N).fill(10);
    const plain = (moisture: Float32Array, entities: PictureLand["entities"]): PictureLand => ({ W, H, heights, water: new Float32Array(N), contamination: new Float32Array(N), moisture, entities });
    const mid = heroCamera(W, H, heights, 0);
    // bare ground everywhere: every place scores the same, so the middle
    expect(heroCamera(W, H, heights, 0, plain(new Float32Array(N), [])).y).toBe(mid.y);
    for (const [y0, y1] of [[112, 125], [2, 15]]) {
      // a wooded, grassy band along the north edge (tile y 112–125), then along the south edge (y 2–15)
      const moisture = new Float32Array(N);
      const trees: { template: string; x: number; y: number }[] = [];
      for (let y = y0; y <= y1; y++)
        for (let x = 0; x < W; x++) {
          moisture[y * W + x] = 10;
          if ((x + y) % 3 === 0) trees.push({ template: "Pine", x, y });
        }
      for (let o = 0; o < 4; o++) {
        const c = heroCamera(W, H, heights, o, plain(moisture, trees));
        const centred = heroCamera(W, H, heights, o);
        expect(c.distance).toBe(centred.distance);
        // looking north (o 0) or south (o 2) the frame slides toward the band (east or west, the band runs along the
        // look, and the frame stays centred across the map)
        if (o % 2 === 0) expect(Math.sign(c.y - centred.y), `turned ${o}, band at ${y0}`).toBe(y0 > 64 ? 1 : -1);
      }
    }
  });

  it("reads the view as the looks score does: every tile's voxels as a mask, each water column, the game's moisture levels", () => {
    const v = sample(20, 18, 0);
    const land = pictureLand(v);
    const N = 20 * 18;
    const cave = 3 * 20 + 4;
    // the listed column keeps its voxels (rock 0–1 and 5–7, air 2–4); a plain tile is solid to its height
    expect(land.mask![cave]).toBe(0b11100011);
    expect(land.mask![0]).toBe((1 << v.heights[0]) - 1);
    // the cave's two water columns, in order
    expect(Array.from(land.stack!.count).filter((n) => n > 0)).toEqual([2]);
    expect([land.stack!.floor[cave], land.stack!.floor[N + cave]]).toEqual([2, 8]);
    expect([land.stack!.depth[cave], land.stack!.depth[N + cave]]).toEqual([1.5, 0.5]);
    // the soil's moisture bytes (the game's level × 15) back in levels
    expect(land.moisture[15]).toBeCloseTo(15 / 15, 9);
    expect(land.entities.length).toBe(v.entities.count);
  });

  it("is where the time-lapse ends: its last shot, as its hold begins, is the picture's camera", () => {
    for (const o of [0, 1, 2, 3]) {
      const v = sample(40, 24, o);
      const plan = lapsePlan([{ kind: "land" as const, place: { x0: 2, y0: 2, x1: 9, y1: 9 } }], v.W, v.H);
      const c = heroScene(v).camera;
      const at = lapseCamera(plan, v.heights, v.W, v.H, v.entities, v)(plan.outro.hold);
      expect(at.yaw).toBeCloseTo(c.yaw, 9);
      expect(at.pitch).toBeCloseTo(c.pitch, 9);
      expect(at.distance).toBeCloseTo(c.distance, 9);
      at.target.forEach((t, k) => expect(t).toBeCloseTo(c.target[k], 9));
    }
  });
});

/** A 96 × 96 map of level ground 4 high, its start in the middle facing north, with a fin of rock 12 high along y at
 *  x 60–61 that a window 3 wide and 6 high is worn through (an arch, seen through along x), and a block of cliff 12 high
 *  whose south foot is worn back two tiles under its roof (an overhang, open to the south). */
function formsMap(): MapView {
  const W = 96;
  const H = 96;
  const N = W * H;
  const heights = new Uint8Array(N).fill(4);
  const masks = new Map<number, number>();
  const plain = (h: number) => (1 << h) - 1;
  for (let y = 30; y <= 60; y++)
    for (const x of [60, 61]) {
      heights[y * W + x] = 12;
      // the window: air at layers 4–9 under a roof 10–11
      if (y >= 44 && y <= 46) masks.set(y * W + x, plain(12) & ~(plain(10) & ~plain(4)));
    }
  for (let y = 70; y <= 80; y++)
    for (let x = 20; x <= 35; x++) {
      heights[y * W + x] = 12;
      // the shelter under the roof: air at layers 4–6
      if (y <= 71) masks.set(y * W + x, plain(12) & ~(plain(7) & ~plain(4)));
    }
  const tiles = [...masks.keys()];
  const voxels = new Uint8Array(tiles.length * LAYERS);
  tiles.forEach((i, k) => {
    for (let z = 0; z < LAYERS; z++) voxels[k * LAYERS + z] = (masks.get(i)! >>> z) & 1;
  });
  const entities: EntityView = {
    count: 1,
    templates: ["StartingLocation"],
    owners: ["f"],
    template: Uint16Array.of(0),
    x: Int16Array.of(46),
    y: Int16Array.of(46),
    z: Int16Array.of(4),
    orientation: Uint8Array.of(0),
    flags: new Uint8Array(1),
    owner: new Uint16Array(1),
    variant: new Uint8Array(1),
    strength: new Float32Array(1),
    ids: ["start"],
  };
  return {
    W,
    H,
    heights,
    columns: { tiles: Int32Array.from(tiles), voxels },
    water: { count: 0, tile: new Int32Array(0), floor: new Float32Array(0), depth: new Float32Array(0), contamination: new Float32Array(0), outflow: new Float32Array(0) },
    entities,
    soil: { moisture: new Uint8Array(N).fill(120), contamination: new Uint8Array(N), runs: { tile: new Int32Array(0), level: new Uint8Array(0), moisture: new Uint8Array(0), contamination: new Uint8Array(0) } },
  };
}

describe("the map's picture on its 3D forms and within the map (D488 audit)", () => {
  it("finds the arch, looked through along it, and the overhang, looked into from its open side; a heightfield has none", () => {
    const v = formsMap();
    const forms = formSights(pictureLand(v));
    const arch = forms.find((f) => f.arch)!;
    expect(arch, "the window through the fin reads as an arch").toBeDefined();
    // looked through along x, at the window's air (x 60–62, y 44–47, layers 4–10)
    expect(Math.abs(arch.look[0])).toBeCloseTo(1, 9);
    expect(arch.look[1]).toBeCloseTo(0, 9);
    expect(arch.x).toBeGreaterThan(60);
    expect(arch.x).toBeLessThan(62);
    expect(arch.y).toBeGreaterThan(44);
    expect(arch.y).toBeLessThan(47);
    expect(arch.z).toBeGreaterThan(4);
    expect(arch.z).toBeLessThan(10);
    const shelter = forms.find((f) => !f.arch)!;
    expect(shelter, "the worn foot reads as an overhang").toBeDefined();
    // its mouth along the cliff's south face (y 70), looked into northward from the south
    expect(shelter.look[0]).toBeCloseTo(0, 9);
    expect(shelter.look[1]).toBeCloseTo(1, 9);
    expect(Math.abs(shelter.y - 70)).toBeLessThan(0.5);
    expect(shelter.x).toBeGreaterThan(20);
    expect(shelter.x).toBeLessThan(36);
    expect(formSights({ ...pictureLand(v), mask: null })).toEqual([]);
  });

  it("frames a form where the map's landmark is missing, and the frame chosen passes on the full picture", () => {
    const v = formsMap();
    const land = pictureLand(v);
    const f = sightFrames(v, land);
    expect(f.landmark, "level ground has no landmark").toBeNull();
    expect(f.forms.length).toBeGreaterThanOrEqual(2);
    // the arch, seen through to the land beyond, is worth more than the shelter's shade
    const arch = f.forms.find((g) => g.form.arch)!;
    expect(arch.frame.through).toBeGreaterThan(0);
    for (const g of f.forms) if (!g.form.arch) expect(arch.frame.value).toBeGreaterThan(g.frame.value);
    const c = sightCamera(v, land)!;
    expect(c).toEqual(arch.frame.c);
    expect(framePasses(land, c, FORM_LEAST)).toBe(true);
    const pic = castPicture(land, sightCast(c));
    expect(voidShare(pic)).toBeLessThanOrEqual(SIGHT_VOID);
    expect(pictureValue(pic).through).toBeGreaterThan(0);
    // the picture's camera is the sight's (heroScene)
    const scene = heroScene(v).camera;
    expect(scene.target).toEqual([c.x, c.level, -c.y]);
    expect([scene.yaw, scene.pitch, scene.distance]).toEqual([c.yaw, c.pitch, c.distance]);
  });

  it("counts the backdrop behind the trees' crowns as the backdrop: the share the frame shows is the share without the trees", () => {
    // trees along the map's far edge, the camera looking out past it, low: their crowns stand in front of the void
    const W = 64;
    const H = 64;
    const N = W * H;
    const heights = new Uint8Array(N).fill(4);
    const trees: { template: string; x: number; y: number }[] = [];
    for (let x = 0; x < W; x++) for (const y of [H - 1, H - 2, H - 3]) trees.push({ template: "Pine", x, y });
    const land: PictureLand = { W, H, heights, water: new Float32Array(N), contamination: new Float32Array(N), moisture: new Float32Array(N).fill(10), entities: trees };
    const c = { x: 32, y: 24, level: 4, distance: 30, pitch: (25 * Math.PI) / 180, yaw: 0 };
    const pic = castPicture(land, sightCast(c));
    const bare = castPicture({ ...land, entities: [] }, sightCast(c));
    let voids = 0;
    let veiled = 0;
    for (let k = 0; k < pic.kind.length; k++) {
      if (pic.kind[k] === PIXEL.void) voids++;
      if (pic.veiled[k]) {
        veiled++;
        expect(pic.kind[k]).toBe(PIXEL.tree);
        expect(bare.kind[k]).toBe(PIXEL.void);
      }
    }
    expect(veiled, "crowns against the void").toBeGreaterThan(0);
    expect(voidShare(pic)).toBe(voidShare(bare));
    expect(voidShare(pic)).toBeGreaterThan(voids / pic.kind.length);
    // what the picture shows is as before: the crowns, their looks unchanged
    expect(Array.from(pic.kind).filter((k) => k === PIXEL.tree).length).toBeGreaterThan(veiled);
    // and such a frame is refused where the void alone would have let it by (about 3 % void, 10 % with the crowns')
    expect(voids / pic.kind.length).toBeLessThanOrEqual(SIGHT_VOID);
    expect(voidShare(pic)).toBeGreaterThan(SIGHT_VOID);
    expect(framePasses(land, c, 0)).toBe(false);
  });
});
