// A generation's field as the document stores it (#313): its dry masks are stored as runs by the
// map's own width, never a width guessed from the area, so a non-square field keeps its tiles. The
// width is a required argument; the line under @ts-expect-error fails the typecheck if it is ever
// made optional again.
import { describe, expect, it } from "vitest";
import { fieldData } from "../../src/core/gen/generate";

describe("fieldData", () => {
  it("stores a non-square field's dry tiles at their own place", () => {
    const W = 128, H = 512;
    const moist = new Uint8Array(W * H);
    moist[300 * W + 7] = 1;
    const field = { heights: new Uint8Array(W * H), contains: new Set<string>(), dry: { moist, poisoned: new Uint8Array(W * H) } };
    expect(fieldData(field, W).dry!.moist).toEqual([[300, 7, 7]]);
    // @ts-expect-error the width is required: sqrt(area) is wrong for a non-square map
    const guessed = () => fieldData(field);
    expect(typeof guessed).toBe("function");
  });
});
