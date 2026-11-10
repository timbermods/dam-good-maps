// High's sun shadows (high/shadows.ts): the shaders read the depth map through the matrix it was drawn with, so a frame
// drawn between the sun's turn and the next depth map never reads the old map through the new sun's matrix (the shadows
// sliding as the camera turns, then snapping back: review of #744); and the map is drawn again whenever what casts into
// it changes, plants dying in place among it.

import { describe, expect, it, vi } from "vitest";
import { Color, DataTexture, Group, Matrix4, PerspectiveCamera, Scene, Vector3, Vector4, type WebGLRenderer } from "three";
import { SunShadows } from "../../src/render3d/high/shadows";
import { HighLook, type HighHost } from "../../src/render3d/high/highLook";
import type { Baker } from "../../src/render3d/high/fields";
import { sceneUniforms } from "../../src/render3d/materials";
import { DEAD, DYING, entityView, surfaceWater, waterFromDepth } from "../../src/render3d/model";

/** Just what the depth pass asks of a renderer. */
function fakeRenderer(): WebGLRenderer {
  let target: unknown = null;
  return {
    getRenderTarget: () => target,
    setRenderTarget: (t: unknown) => void (target = t),
    getClearColor: (c: Color) => c.set(0),
    getClearAlpha: () => 1,
    setClearColor: () => {},
    clear: () => {},
    render: () => {},
  } as unknown as WebGLRenderer;
}

describe("High's sun shadows", () => {
  it("move their matrix with the depth map drawn, never before it", () => {
    const s = new SunShadows({ objectFade: { value: new Vector4() }, objectHide: { value: 0 } });
    const gl = fakeRenderer();
    const scene = new Scene();
    s.fit(64, 48);
    s.render(gl, scene);
    const drawn = s.matrix.clone();
    expect(drawn.equals(new Matrix4())).toBe(false);
    // the camera turns: the map is to be drawn again, and until it is, its matrix is the one it was drawn with
    const turned0 = new Vector3(0.3, 0.8, 0.52).normalize();
    expect(s.setSun(turned0), "a new sun changes it").toBe(true);
    expect(s.dirty).toBe(true);
    expect(s.setSun(turned0.clone()), "the same sun again changes nothing").toBe(false);
    expect(s.matrix.equals(drawn)).toBe(true);
    s.render(gl, scene);
    expect(s.dirty).toBe(false);
    expect(s.matrix.equals(drawn)).toBe(false);
    // (a new map's frame waits for its draw too)
    const turned = s.matrix.clone();
    s.fit(128, 128);
    expect(s.matrix.equals(turned)).toBe(true);
    s.render(gl, scene);
    expect(s.matrix.equals(turned)).toBe(false);
    s.dispose();
  });

  it("are drawn again when plants die or start dying in place, so a plant casts only the form it is drawn in", () => {
    // (a held day withered the birches: drawn bare, they kept their living crowns' diamond shadows, as the depth map had
    // been drawn before and nothing asked for it again)
    const gl = Object.assign(fakeRenderer(), { capabilities: { maxTextureSize: 4096 } });
    const tex = () => new DataTexture(new Uint8Array(4), 1, 1);
    const host: HighHost = {
      gl,
      scene: new Scene(),
      uniforms: sceneUniforms(16, 16, tex(), tex(), tex(), tex()),
      requestRender: () => {},
      motion: () => false,
      casters: () => [],
      groundOffset: () => 0,
      baker: {} as Baker,
      flow: () => ({ flow: null, ready: true, ms: 0 }),
    };
    const look = new HighLook(host);
    const view = entityView([
      { template: "Birch", x: 4, y: 4, z: 2, orientation: "Cw0", owner: "t" },
      { template: "Pine", x: 8, y: 4, z: 2, orientation: "Cw0", owner: "t" },
    ]);
    const heights = new Uint8Array(256).fill(2);
    look.setMap(16, 16, heights, surfaceWater(16, 16, waterFromDepth(heights, new Float32Array(256), new Float32Array(256))), view);
    look.objectsBuilt(new Group(), view);
    const camera = new PerspectiveCamera();
    // (each frame well after the last depth map: the wait between redraws is for a brush's strokes)
    let clock = 0;
    const now = vi.spyOn(performance, "now").mockImplementation(() => (clock += 1000));
    look.beforeRender(camera, 800, 0);
    expect(look.caughtUp, "the depth map drawn").toBe(true);
    const flags = view.flags.slice();
    flags[0] |= DEAD;
    expect(look.setPlantStates(flags)).toBe(1);
    expect(look.caughtUp, "a dead birch's bare wood waits to be drawn into the depth map").toBe(false);
    look.beforeRender(camera, 800, 0);
    expect(look.caughtUp).toBe(true);
    flags[1] |= DYING;
    expect(look.setPlantStates(flags)).toBe(1);
    expect(look.caughtUp, "a dying pine's drawn-in crown too").toBe(false);
    look.beforeRender(camera, 800, 0);
    // (nothing changed: nothing to draw again)
    expect(look.setPlantStates(flags)).toBe(0);
    expect(look.caughtUp).toBe(true);
    now.mockRestore();
  });
});
