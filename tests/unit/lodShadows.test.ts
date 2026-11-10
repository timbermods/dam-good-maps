// High's depth map and the trees' close-up and far models (high/highLook.ts `LOD_SETTLE`): a tree casts the model it is
// drawn with. A birch's far model is two octahedra, so a depth map drawn from afar kept their diamonds under the close-up
// birches after a zoom in. The map is drawn again once the camera's changes to the models have settled, never through
// the zoom itself (drawn at every change, a zoom dropped frames: docs/progress/3d-view.md).

import { afterEach, describe, expect, it, vi } from "vitest";
import { Color, DataTexture, Group, PerspectiveCamera, Scene, type WebGLRenderer } from "three";
import { HighLook, type HighHost } from "../../src/render3d/high/highLook";
import type { Baker } from "../../src/render3d/high/fields";
import { sceneUniforms } from "../../src/render3d/materials";
import { entityView, surfaceWater, waterFromDepth } from "../../src/render3d/model";

/** Just what the depth pass asks of a renderer. */
function fakeRenderer(): WebGLRenderer {
  let target: unknown = null;
  return {
    capabilities: { maxTextureSize: 4096 },
    getRenderTarget: () => target,
    setRenderTarget: (t: unknown) => void (target = t),
    getClearColor: (c: Color) => c.set(0),
    getClearAlpha: () => 1,
    setClearColor: () => {},
    clear: () => {},
    render: () => {},
  } as unknown as WebGLRenderer;
}

afterEach(() => {
  vi.useRealTimers();
});

describe("High's depth map and the trees' models", () => {
  it("is drawn again with the close-up models once a zoom in has settled, and not through the zoom", () => {
    vi.useFakeTimers();
    const tex = () => new DataTexture(new Uint8Array(4), 1, 1);
    let asked = 0;
    const host: HighHost = {
      gl: fakeRenderer(),
      scene: new Scene(),
      uniforms: sceneUniforms(16, 16, tex(), tex(), tex(), tex()),
      requestRender: () => void asked++,
      motion: () => false,
      casters: () => [],
      groundOffset: () => 0,
      baker: {} as Baker,
      flow: () => ({ flow: null, ready: true, ms: 0 }),
    };
    const look = new HighLook(host);
    const view = entityView([
      { template: "Birch", x: 4, y: 4, z: 2, orientation: "Cw0", owner: "t" },
      { template: "Birch", x: 6, y: 4, z: 2, orientation: "Cw0", owner: "t" },
    ]);
    const heights = new Uint8Array(256).fill(2);
    look.setMap(16, 16, heights, surfaceWater(16, 16, waterFromDepth(heights, new Float32Array(256), new Float32Array(256))), view);
    look.objectsBuilt(new Group(), view);
    const camera = new PerspectiveCamera(50, 1, 0.1, 2000);
    const at = (d: number) => {
      camera.position.set(5, 2 + d * 0.8, -4.5 + d * 0.6);
      camera.lookAt(5, 2, -4.5);
      camera.updateMatrixWorld();
    };
    const frame = () => {
      vi.advanceTimersByTime(16);
      look.beforeRender(camera, 800, 0);
    };
    // from afar: the far models, and the depth map drawn with them
    at(400);
    frame();
    vi.advanceTimersByTime(1000);
    frame();
    expect(look.stats.forest.far).toBe(2);
    const passes = look.stats.shadowPasses;
    expect(look.caughtUp).toBe(true);
    // the zoom in: the birches change to their close-up models, and no depth map is drawn while it goes on
    for (const d of [200, 100, 50, 20, 8, 6]) {
      at(d);
      frame();
      expect(look.stats.shadowPasses, `zooming, at ${d}`).toBe(passes);
    }
    expect(look.stats.forest.near).toBe(2);
    // settled: drawn again, once, with the models the birches are drawn with
    asked = 0;
    vi.advanceTimersByTime(300);
    expect(look.caughtUp, "the close-up models wait to be drawn into the depth map").toBe(false);
    expect(asked).toBeGreaterThan(0);
    frame();
    expect(look.stats.shadowPasses).toBe(passes + 1);
    // the camera still: nothing more
    vi.advanceTimersByTime(1000);
    frame();
    expect(look.stats.shadowPasses).toBe(passes + 1);
    look.dispose();
  });
});
