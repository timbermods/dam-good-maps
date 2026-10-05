// The water bar's state (PLAN §20 D345, B14): a journey begun by an edit reads "flowing" until its settled water
// arrives; when the worker says the water is already settled (an undo, a redo), the bar reads settled at once,
// with no journey left waiting for frames that will not come.

import { describe, expect, it } from "vitest";
import { WaterPlayer } from "../../src/editor/waterPlayer";
import type { WaterView } from "../../src/render3d/model";

const empty: WaterView = { count: 0, tile: new Int32Array(0), floor: new Float32Array(0), depth: new Float32Array(0), contamination: new Float32Array(0) };
const player = () => new WaterPlayer({ show: () => undefined, changed: () => undefined });

describe("the water player's state after undo, redo and an edit (D345, B14)", () => {
  it("an edit's journey reads flowing until its settled water comes", () => {
    const p = player();
    p.begin({ water: empty, done: 0 });
    expect(p.progress).toBe(0);
    expect(p.playing).toBe(true);
  });
  it("an update the worker calls settled ends any journey: nothing is flowing", () => {
    const p = player();
    p.begin({ water: empty, done: 0 });
    p.settled();
    expect(p.progress).toBeNull();
    expect(p.playing).toBe(false);
    expect(p.words).toBeNull();
    // and it stays so: an undo after an undo
    p.settled();
    expect(p.progress).toBeNull();
  });
  it("an update settled from the start leaves the bar settled", () => {
    const p = player();
    p.settled();
    expect(p.progress).toBeNull();
    expect(p.playing).toBe(false);
  });
});
