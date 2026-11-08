// High's sun shadows (high/shadows.ts): the shaders read the depth map through the matrix it was drawn with, so a frame
// drawn between the sun's turn and the next depth map never reads the old map through the new sun's matrix (the shadows
// sliding as the camera turns, then snapping back: review of #744).

import { describe, expect, it } from "vitest";
import { Color, Matrix4, Scene, Vector3, Vector4, type WebGLRenderer } from "three";
import { SunShadows } from "../../src/render3d/high/shadows";

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
});
