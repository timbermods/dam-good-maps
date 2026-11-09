import { describe, expect, it } from "vitest";
import { DataTexture } from "three";
import { VIEW_DEPTH, VIEW_DEPTH_GLSL, viewDepth } from "../../src/render3d/viewDepth";
import { sceneUniforms, waterMaterial } from "../../src/render3d/materials";
import { waterHooks } from "../../src/render3d/high/shaders";

// The water's depth as the game reads it from its depth buffer (Q9 P3; the water-character audit's gap 7): along the view
// to the ground behind, so a bank facing the camera has a light band at its foot and a bank the view passes over has none.

const PITCH = (55 * Math.PI) / 180;
const W = 16;
const H = 16;

/** A channel along y between x0 and x1 (exclusive), its bed at `bed`, its banks' tops at `bank`. */
function channel(x0: number, x1: number, bed: number, bank: number): number[] {
  const h: number[] = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) h.push(x >= x0 && x < x1 ? bed : bank);
  return h;
}

/** The view's ray at the game's pitch, its heading along the map's x (1: looking east, −1: west) or y. */
const ray = (dx: number, dy: number, pitch = PITCH): [number, number, number] => [dx * Math.cos(pitch), dy * Math.cos(pitch), -Math.sin(pitch)];

describe("the water's depth along the view (viewDepth.ts)", () => {
  // a river a level deep: its bed at 2, its surface at 3, its banks' tops at 4, from x 4 to 8
  const heights = channel(4, 8, 2, 4);
  const at = (x: number, r: [number, number, number]) => viewDepth(W, H, heights, [x, 8.5], 3, 2, r);

  it("is none at the foot of the bank facing the camera, the far bank, deepening over 1 / tan(pitch) a level", () => {
    // looking east, the east bank (x 8) is the far one: the view meets its wall
    const east = ray(1, 0);
    expect(at(8 - 1e-6, east)).toBeCloseTo(0, 5);
    for (const u of [0.1, 0.3, 0.5, 0.65]) expect(at(8 - u, east), `${u} from the far bank`).toBeCloseTo(u * Math.tan(PITCH), 6);
    // the band's width per level at the game's 55°: 0.70 tile
    const band = 1 / Math.tan(PITCH);
    expect(band).toBeCloseTo(0.7, 2);
    expect(at(8 - band + 1e-6, east)).toBeLessThan(1);
    expect(at(8 - band - 1e-3, east)).toBeCloseTo(1, 9);
    // two levels deep, twice as wide
    const deep = channel(4, 8, 1, 4);
    const at2 = (x: number) => viewDepth(W, H, deep, [x, 8.5], 3, 1, east);
    expect(at2(8 - band)).toBeCloseTo(1, 5);
    expect(at2(8 - 2 * band - 1e-3)).toBeCloseTo(2, 9);
  });

  it("is the whole depth up to the edge of the bank the view passes over, the near bank", () => {
    // looking east, the west bank (x 4) is the near one: the view goes on away from it, down to the bed
    const east = ray(1, 0);
    for (const u of [1e-4, 0.05, 0.2, 0.5, 1.5]) expect(at(4 + u, east), `${u} from the near bank`).toBeCloseTo(1, 9);
    // and the band swaps sides as the camera turns: looking west, the west bank is the far one
    const west = ray(-1, 0);
    expect(at(4 + 1e-6, west)).toBeCloseTo(0, 5);
    expect(at(4 + 0.35, west)).toBeCloseTo(0.35 * Math.tan(PITCH), 6);
    expect(at(8 - 1e-4, west)).toBeCloseTo(1, 9);
  });

  it("is the whole depth along a bank parallel to the view, straight down, and never past the game's _MaxDepth", () => {
    expect(at(4.05, ray(0, 1))).toBeCloseTo(1, 9);
    expect(at(7.95, ray(0, -1))).toBeCloseTo(1, 9);
    expect(at(7.95, [0, 0, -1])).toBeCloseTo(1, 9);
    // eight levels deep reads as the game's 5 (its depth saturates there)
    const pit = channel(1, 15, -5, 4);
    expect(viewDepth(W, H, pit, [3, 8.5], 3, -5, ray(1, 0))).toBe(VIEW_DEPTH.max);
    // (a narrow one: the view meets the far wall first, 2 tiles across)
    expect(viewDepth(W, H, channel(4, 8, -5, 4), [6, 8.5], 3, -5, ray(1, 0))).toBeCloseTo(2 * Math.tan(PITCH), 9);
  });

  it("shows a step in the bed as a band at the foot of its wall where it faces the camera, and the deeper bed past its edge", () => {
    // the bed at 1 from x 4 to 6, at 2 from 6 to 8: looking east, the step at x 6 is a wall facing the camera
    const h = channel(4, 8, 2, 4).map((v, i) => (i % W >= 4 && i % W < 6 ? 1 : v));
    const east = ray(1, 0);
    expect(viewDepth(W, H, h, [6 - 1e-6, 8.5], 3, 1, east)).toBeCloseTo(1, 5);
    expect(viewDepth(W, H, h, [4.2, 8.5], 3, 1, east)).toBeCloseTo(2, 9);
    // looking west from over the shallower bed by the step, the view passes over the step's edge down to the deeper bed
    expect(viewDepth(W, H, h, [6.2, 8.5], 3, 2, ray(-1, 0))).toBeCloseTo(2, 9);
  });

  it("is what the water's shader reads on its top, in every look (the light look as the game's Low quality)", () => {
    const t = () => new DataTexture(new Uint8Array(4), 1, 1);
    for (const lite of [false, true]) {
      const shader = waterMaterial(sceneUniforms(1, 1, t(), t(), t(), t()), lite).fragmentShader;
      expect(shader).toContain(VIEW_DEPTH_GLSL);
      expect(shader).toContain("float d = n.y > 0.5 ? waterViewDepth(g, vWorld.y, vFloor) : depth;");
      // no shallowing toward every bank of our own (D148: WATER_SURFACE.bank, bankWidth until gap 7)
      expect(shader).not.toContain("waterSeenDepth");
    }
    const high = waterMaterial(sceneUniforms(1, 1, t(), t(), t(), t()), false, waterHooks()).fragmentShader;
    expect(high).toContain("float hlDepth = max(0.0, d);");
    expect(high).not.toContain("mix(0.10, 1.0, smoothstep(0.0, 0.55, shore))");
  });
});
