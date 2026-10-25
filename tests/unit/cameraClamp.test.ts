// The camera keeps out of the rock (cameraClamp.ts): on hand-made terrain with a cave, an arch, a pillar and an overhang,
// the eye is never inside a solid voxel (nor nearer one than its clearance) after random orbits, pans and zooms about the
// ground under a pointer, composed as the renderer's `zoom` composes them; a zoom toward a cave's mouth ends in the cave's
// air; and where the eye is clear of the rock (every view of open ground) the camera is exactly where its view puts it.

import { describe, expect, it } from "vitest";
import { armReach, CAMERA_ROOMS, clearAt, nearFor, orbitEye, roofed } from "../../src/render3d/cameraClamp";
import { zoomLimits, zoomStep, zoomStopShort, ZOOM_NEAREST } from "../../src/render3d/framing";
import { generate } from "../../src/core/gen/generate";
import { makeSpec } from "../../src/core/spec/mapspec";
import { columnMask, type TerrainSource } from "../../src/render3d/mesh";
import { pickTerrain, type Ray } from "../../src/render3d/pick";

type V = [number, number, number];

const W = 64;
const H = 64;

/** A world of voxels: ground 4 high, a mountain (x 16–31, y 30–49, 14 high) with a cave in it (x 20–27, y 30–43,
 *  air from level 4 to 8, its mouth on the south face), an arch (x 40–47, y 12–15: rock below 4 and from 9 to 12),
 *  a pillar (x 8, y 8, 16 high), an overhang (x 0–9, y 54–59: ground and a ledge from 10 to 12) and a narrow tunnel
 *  (x 51–52, y 20–39, air from level 4 to 6, in rock 11 high from x 50 to 53). */
function world(): {
  maskAt: (i: number) => number;
  solid: (x: number, y: number, z: number) => boolean;
  inCave: (p: V) => boolean;
  inTunnel: (p: V) => boolean;
} {
  const masks = new Uint32Array(W * H);
  const bits = (lo: number, hi: number) => ((1 << hi) - 1) ^ ((1 << lo) - 1);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      let m = bits(0, 4);
      if (x >= 16 && x < 32 && y >= 30 && y < 50) m = bits(0, 14);
      if (x >= 20 && x < 28 && y >= 30 && y < 44) m = bits(0, 4) | bits(9, 14);
      if (x >= 40 && x < 48 && y >= 12 && y < 16) m = bits(0, 4) | bits(9, 13);
      if (x === 8 && y === 8) m = bits(0, 16);
      if (x < 10 && y >= 54 && y < 60) m = bits(0, 4) | bits(10, 13);
      if (x >= 50 && x < 54 && y >= 20 && y < 40) m = x === 51 || x === 52 ? bits(0, 4) | bits(7, 11) : bits(0, 11);
      masks[y * W + x] = m;
    }
  const solid = (x: number, y: number, z: number) => z < 0 || (x >= 0 && y >= 0 && x < W && y < H && z < 31 && ((masks[y * W + x] >>> z) & 1) === 1);
  const inCave = (p: V) => p[0] > 20 && p[0] < 28 && -p[2] > 30 && -p[2] < 44 && p[1] > 4 && p[1] < 9;
  const inTunnel = (p: V) => p[0] > 51 && p[0] < 53 && -p[2] > 20 && -p[2] < 40 && p[1] > 4 && p[1] < 7;
  return { maskAt: (i) => masks[i], solid, inCave, inTunnel };
}

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const norm = (v: V): V => {
  const l = Math.hypot(...v);
  return [v[0] / l, v[1] / l, v[2] / l];
};
const cross = (a: V, b: V): V => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

interface View {
  target: V;
  yaw: number;
  pitch: number;
  distance: number;
}

/** The ray through screen point (u, v) ∈ [−1, 1]² from the camera as drawn (40° field of view, 16:9). */
function rayAt(eye: V, target: V, u: number, v: number): Ray {
  const fwd = norm([target[0] - eye[0], target[1] - eye[1], target[2] - eye[2]]);
  const right = norm(cross(fwd, [0, 1, 0]));
  const up = cross(right, fwd);
  const k = Math.tan((40 * Math.PI) / 360);
  return { origin: eye, direction: norm([0, 1, 2].map((i) => fwd[i] + u * k * (16 / 9) * right[i] + v * k * up[i]) as V) };
}

const { maskAt, solid, inCave, inTunnel } = world();
const reach = (v: View) => armReach(v.target, v.yaw, v.pitch, v.distance, W, H, maskAt).reach;
/** The least room the eye keeps (a hair less, for the boundary found by halving). */
const LEAST = CAMERA_ROOMS[CAMERA_ROOMS.length - 1] * 0.999;
const eyeOf = (v: View): V => orbitEye(v.target, v.yaw, v.pitch, reach(v));
const voxelAt = (p: V) => solid(Math.floor(p[0]), Math.floor(-p[2]), Math.floor(p[1]));

interface World {
  W: number;
  H: number;
  maskAt: (i: number) => number;
  maxY: number;
}

/** One turn of the wheel by `factor` about what the pointer at (u, v) sees from the camera as drawn: the renderer's
 *  `zoom` (`zoomStep`). `held` false: as on dev, the rock never holding the camera. */
function wheel(v: View, factor: number, u: number, w: number, at: World = { W, H, maskAt, maxY: 16 }, held = true): View {
  const hold = held ? armReach(v.target, v.yaw, v.pitch, v.distance, at.W, at.H, at.maskAt).reach : v.distance;
  const eye = orbitEye(v.target, v.yaw, v.pitch, hold);
  const step = zoomStep(
    { mode: "orbit", ...v },
    factor,
    hold,
    () => {
      const hit = pickTerrain(rayAt(eye, v.target, u, w), at.W, at.H, at.maskAt);
      return hit ? { point: hit.point, maxY: at.maxY } : null;
    },
    zoomLimits(at.W, at.H),
    at,
  );
  return step ? { ...v, ...step } : v;
}
const zoom = (v: View, factor: number, u: number, w: number) => wheel(v, factor, u, w);

/** The generated canyon the plain-map cases are played on (made once). */
let canyonMade: (World & { heights: Uint8Array }) | null = null;
function canyon(): World & { heights: Uint8Array } {
  if (canyonMade) return canyonMade;
  const { W: CW, H: CH, heights } = generate(makeSpec({ seed: 7, theme: "canyon", size: { x: 96, y: 96 } })).built;
  const src: TerrainSource = { W: CW, H: CH, heights, columns: new Map() };
  canyonMade = { W: CW, H: CH, heights, maskAt: (i) => columnMask(src, i), maxY: 23 };
  return canyonMade;
}

describe("the camera keeps out of the rock", () => {
  it("is exactly where its view puts it wherever its eye is clear and it looks at no point under a roof (every view of a map without terrain above terrain that stays above the ground)", () => {
    // a heightfield (no roofs anywhere), rough, and the cave world's open ground
    const r0 = rng(11);
    const heights = Array.from({ length: W * H }, () => Math.floor(r0() * r0() * 18));
    const plain = (i: number) => (1 << heights[i]) - 1;
    for (const [mask, label] of [
      [plain, "heightfield"],
      [maskAt, "caves"],
    ] as const) {
      const r = rng(7);
      let checked = 0;
      for (let k = 0; k < 3000; k++) {
        const v: View = { target: [r() * W, r() * 12, -r() * H], yaw: r() * Math.PI * 2, pitch: 0.18 + r() * 1.32, distance: 6 + r() * 120 };
        expect(roofed(v.target, W, H, plain), label).toBe(false);
        if (roofed(v.target, W, H, mask) || !clearAt(orbitEye(v.target, v.yaw, v.pitch, v.distance), W, H, mask)) continue;
        expect(armReach(v.target, v.yaw, v.pitch, v.distance, W, H, mask), label).toEqual({ reach: v.distance, room: CAMERA_ROOMS[0] });
        checked++;
      }
      expect(checked).toBeGreaterThan(1000);
    }
  });

  it("is never inside a solid voxel, nor nearer one than its least clearance, after random orbits, pans and zooms", () => {
    let held = 0;
    for (const seed of [1, 2, 3, 4, 5]) {
      const r = rng(seed);
      let v: View = { target: [24, 6, -36], yaw: Math.PI, pitch: 0.3, distance: 24 };
      for (let step = 0; step < 1500; step++) {
        const what = r();
        if (what < 0.35) v = { ...v, yaw: v.yaw + (r() - 0.5) * 0.8, pitch: Math.min(1.5, Math.max(0.18, v.pitch + (r() - 0.5) * 0.5)) };
        else if (what < 0.5) v = { ...v, target: [Math.min(W, Math.max(0, v.target[0] + (r() - 0.5) * 8)), v.target[1], Math.min(0, Math.max(-H, v.target[2] + (r() - 0.5) * 8))] };
        else v = zoom(v, r() < 0.7 ? 0.787 : 1.27, (r() - 0.5) * 1.6, (r() - 0.5) * 1.6);
        const eye = eyeOf(v);
        expect(voxelAt(eye), `seed ${seed} step ${step}: eye ${eye.join(", ")}`).toBe(false);
        expect(clearAt(eye, W, H, maskAt, LEAST)).toBe(true);
        if (reach(v) < v.distance) held++;
      }
    }
    // (the walks do take the camera into the rock's way: the clamp is exercised, not only open views)
    expect(held).toBeGreaterThan(100);
  });

  it("a zoom toward a cave's mouth ends in the cave's air, the eye clear of the rock at every turn", () => {
    // from the south, low, looking into the mouth; the pointer a little off the middle of the view
    for (const [u, w] of [
      [0, 0],
      [0.12, -0.08],
      [-0.1, 0.05],
    ]) {
      let v: View = { target: [24, 6.5, -36], yaw: 0, pitch: 0.25, distance: 30 };
      expect(inCave(eyeOf(v))).toBe(false);
      for (let k = 0; k < 30; k++) {
        v = zoom(v, 0.787, u, w);
        expect(clearAt(eyeOf(v), W, H, maskAt, LEAST)).toBe(true);
      }
      const eye = eyeOf(v);
      expect(inCave(eye), `eye ${eye.join(", ")}`).toBe(true);
    }
  });

  it("stops a zoom in short of the ground under the pointer", () => {
    expect(zoomStopShort(10, 7.87, 20)).toBe(7.87);
    // 2 tiles away, the nearest is 1.6: a step to 0.8 of the distance stops at 0.8
    expect(zoomStopShort(10, 7, 2)).toBeCloseTo(10 * (ZOOM_NEAREST / 2), 9);
    expect(zoomStopShort(10, 7, 1)).toBe(10);
    expect(zoomStopShort(10, 12, 1)).toBe(12);
  });

  it("orbited inside the cave, stays in its air whenever its eye would be in the rock round it", () => {
    let inside = 0;
    for (let a = 0; a < 360; a += 3)
      for (const pitch of [0.2, 0.5, 0.9]) {
        const v: View = { target: [24, 5, -38], yaw: (a * Math.PI) / 180, pitch, distance: 6 };
        const eye = eyeOf(v);
        expect(clearAt(eye, W, H, maskAt, LEAST)).toBe(true);
        if (reach(v) < v.distance) {
          expect(inCave(eye), `yaw ${a} pitch ${pitch}`).toBe(true);
          inside++;
        }
      }
    expect(inside).toBeGreaterThan(100);
  });

  it("turned and tilted in a tunnel two tiles wide, stays in the tunnel, its near plane inside the room it has there", () => {
    // (looking at a point in the tunnel's air, off its middle; one on its floor, turned low toward a wall, can leave
    // the arm no room at all, and the camera then keeps its place outside: never in the rock)
    for (let a = 0; a < 360; a += 5)
      for (const pitch of [0.2, 0.5, 1.0]) {
        const v: View = { target: [51.6, 5, -30], yaw: (a * Math.PI) / 180, pitch, distance: 6 };
        const held = armReach(v.target, v.yaw, v.pitch, v.distance, W, H, maskAt);
        const eye = orbitEye(v.target, v.yaw, v.pitch, held.reach);
        expect(inTunnel(eye), `yaw ${a} pitch ${pitch}: eye ${eye.join(", ")}`).toBe(true);
        expect(clearAt(eye, W, H, maskAt, held.room * 0.999)).toBe(true);
        // (the near plane's corners, a 40° field of view in a 3:1 window, lie within the room)
        const near = nearFor(held.room);
        const k = Math.tan((20 * Math.PI) / 180);
        expect(near * Math.hypot(1, k, k * 3)).toBeLessThan(held.room);
      }
  });

  it("on a generated canyon, at a flat angle among steep walls, the eye stays above the ground under it, orbited, panned and zoomed", () => {
    // (a plain map: setView clamps only the tilt, so a low camera beside a wall came down into the ground or under it)
    const world = canyon();
    const { W: CW, H: CH, heights } = world;
    const mask = world.maskAt;
    const at = (x: number, y: number) => heights[Math.min(CH - 1, Math.max(0, y)) * CW + Math.min(CW - 1, Math.max(0, x))];
    // ground at the foot of steep walls: a tile with one 4 or more levels higher within 3 tiles
    const feet: number[] = [];
    for (let y = 3; y < CH - 3; y++)
      for (let x = 3; x < CW - 3; x++) {
        const h = at(x, y);
        let wall = false;
        for (let dy = -3; dy <= 3 && !wall; dy++) for (let dx = -3; dx <= 3 && !wall; dx++) wall = at(x + dx, y + dy) - h >= 4;
        if (wall) feet.push(y * CW + x);
      }
    expect(feet.length).toBeGreaterThan(200);
    const r = rng(23);
    let held = 0;
    let views = 0;
    for (let k = 0; k < 300; k++) {
      const i = feet[Math.floor(r() * feet.length)];
      let v: View = { target: [(i % CW) + 0.5, heights[i] + r() * 1.5, -(Math.floor(i / CW) + 0.5)], yaw: r() * Math.PI * 2, pitch: 0.18 + r() * 0.15, distance: 6 + r() * 30 };
      for (let step = 0; step < 12; step++) {
        const what = r();
        if (what < 0.4) v = { ...v, yaw: v.yaw + (r() - 0.5) * 1.2, pitch: Math.min(0.35, Math.max(0.18, v.pitch + (r() - 0.5) * 0.1)) };
        else if (what < 0.6) v = { ...v, target: [Math.min(CW, Math.max(0, v.target[0] + (r() - 0.5) * 6)), v.target[1], Math.min(0, Math.max(-CH, v.target[2] + (r() - 0.5) * 6))] };
        else {
          v = wheel(v, r() < 0.7 ? 0.787 : 1.27, (r() - 0.5) * 1.6, (r() - 0.5) * 1.6, world);
        }
        const held1 = armReach(v.target, v.yaw, v.pitch, v.distance, CW, CH, mask);
        const eye = orbitEye(v.target, v.yaw, v.pitch, held1.reach);
        const gx = Math.floor(eye[0]);
        const gy = Math.floor(-eye[2]);
        const ground = gx >= 0 && gy >= 0 && gx < CW && gy < CH ? heights[gy * CW + gx] : 0;
        // above the ground under it, by the room it keeps (the whole clearance, wherever the arm has it)
        expect(eye[1] - ground, `view ${k} step ${step}: eye ${eye.join(", ")} over ground ${ground}`).toBeGreaterThanOrEqual(held1.room * 0.999);
        expect(clearAt(eye, CW, CH, mask, held1.room * 0.999)).toBe(true);
        if (held1.reach < v.distance) held++;
        views++;
      }
    }
    // (most of these low views among walls have the ground or a wall in the camera's way: the clamp is what holds them)
    expect(held).toBeGreaterThan(views / 10);
  });

  it("zoomed out while the rock holds it, goes as far out as on dev and comes out of the rock (a cave; a canyon's cliff behind a low camera)", () => {
    const cases: [string, World, View][] = [
      // in the cave, the camera turned into the mountain behind it
      ["cave", { W, H, maskAt, maxY: 16 }, { target: [24, 6, -38], yaw: Math.PI, pitch: 0.3, distance: 12 }],
    ];
    // the canyon: a low camera with a cliff behind it, held well in
    const c = canyon();
    const r = rng(5);
    for (let k = 0; k < 20000 && cases.length < 4; k++) {
      const i = Math.floor(r() * c.W * c.H);
      const v: View = { target: [(i % c.W) + 0.5, c.heights[i] + 0.5, -(Math.floor(i / c.W) + 0.5)], yaw: r() * Math.PI * 2, pitch: 0.2, distance: 16 };
      if (armReach(v.target, v.yaw, v.pitch, v.distance, c.W, c.H, c.maskAt).reach < 6) cases.push(["canyon", c, v]);
    }
    expect(cases.length).toBe(4);
    for (const [name, world, start] of cases) {
      let now = start;
      let dev = start;
      const drawn = (v: View) => orbitEye(v.target, v.yaw, v.pitch, armReach(v.target, v.yaw, v.pitch, v.distance, world.W, world.H, world.maskAt).reach);
      const first = drawn(start);
      // 15 turns of the wheel out at the middle of the view, then three presses of -
      for (let k = 0; k < 18; k++) {
        const f = k < 15 ? 1.27 : 1.15;
        now = wheel(now, f, 0, 0, world);
        dev = wheel(dev, f, 0, 0, world, false);
        expect(clearAt(drawn(now), world.W, world.H, world.maskAt, CAMERA_ROOMS[CAMERA_ROOMS.length - 1] * 0.999)).toBe(true);
      }
      expect(now.distance, name).toBeCloseTo(dev.distance, 9);
      const last = drawn(now);
      // (out of the rock: drawn where its view puts it, and well away from where the rock held it)
      expect(armReach(now.target, now.yaw, now.pitch, now.distance, world.W, world.H, world.maskAt).reach, name).toBe(now.distance);
      expect(Math.hypot(...last.map((v, n) => v - first[n])), name).toBeGreaterThan(20);
    }
  });
});
