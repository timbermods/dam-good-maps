// Drought and Badtide, day by day, in the editor's worker (PLAN §20 D267, D269): the hazard is
// worked out on the map as it is (the water after the last edit settled first), with each day's
// water and soil from Day 0 (the map's own) to the last, the frames within each day, and how far it
// has come; any edit ends it, and showing it again works out the new land.

import { describe, expect, it } from "vitest";
import { runGenerate } from "../../src/worker/api";
import { makeSpec } from "../../src/core/spec/mapspec";
import * as ed from "../../src/worker/session";

const W = 96;

describe("a hazard worked out in the editor's worker", () => {
  it("its days run from the map's own water to the last day; an edit ends it; shown again, it is the new land's", async () => {
    await runGenerate(makeSpec({ seed: 21, size: { x: W, y: W } }));
    ed.setEditorWaterMode("defer");
    ed.refine();
    const progress: number[] = [];
    const ready: number[] = [];
    let early: [boolean, boolean] | null = null;
    ed.listen((e) => {
      if (e.kind !== "hazard") return;
      progress.push(e.done);
      ready.push(e.ready);
      // a day can be shown as soon as it is worked out, the next not yet
      if (!early && e.ready === 1) early = [ed.hazardDay(1) !== null, ed.hazardDay(2) !== null];
    });
    const own = ed.sessionView().view.water;
    const sum = (await ed.showHazard("drought", 3))!;
    expect(sum).not.toBeNull();
    expect(sum.days).toBe(3);
    expect(sum.last.day).toBe(3);
    expect(sum.change.length).toBe(W * W);
    // how far it came, told as it went, to the end
    expect(progress[0]).toBe(0);
    expect(progress.at(-1)).toBe(1);
    expect(ready.at(-1)).toBe(3);
    expect(ready.every((r, k) => k === 0 || r >= ready[k - 1])).toBe(true);
    expect(early).toEqual([true, false]);
    // Day 0 is the map's own water
    const d0 = ed.hazardDay(0)!;
    expect(Array.from(d0.water.depth)).toEqual(Array.from(own.depth));
    // a drought: less water on its last day than the map has
    const vol = (w: { depth: Float32Array }) => w.depth.reduce((a, b) => a + b, 0);
    expect(vol(sum.last.water)).toBeLessThan(vol(own));
    // the frames within a day end on the day itself
    const steps = ed.hazardSteps(3)!;
    expect(steps.length).toBeGreaterThanOrEqual(4);
    expect(Array.from(steps.at(-1)!.depth)).toEqual(Array.from(ed.hazardDay(3)!.water.depth));
    expect(ed.hazardSteps(0)).toBeNull();
    expect(ed.hazardSteps(4)).toBeNull();

    // an edit ends it (D269)
    let at = -1;
    for (let i = W * 20 + 20; i < W * (W - 20) && at < 0; i += 7) if (own.depth.length && !Array.from(own.tile).includes(i)) at = i;
    const x = at % W;
    const y = Math.floor(at / W);
    const u = ed.apply({ op: "sculpt", params: { mode: "raise", cells: [[y, x - 1, x + 1], [y + 1, x - 1, x + 1]], amount: 1 } });
    expect(u.ok).toBe(true);
    expect(ed.hazardDay(3)).toBeNull();
    expect(ed.hazardSteps(1)).toBeNull();

    // shown again: the new land, after its water has settled; a badtide of 2 days
    const again = (await ed.showHazard("badtide", 2))!;
    expect(again.days).toBe(2);
    expect(again.version).toBe(u.info.version);
    expect(ed.hazardDay(2)).not.toBeNull();
    // Drought or Badtide pressed again: it ends
    ed.endHazard();
    expect(ed.hazardDay(1)).toBeNull();
    ed.listen(null);
  });

  it("a newer hazard or an edit while one is worked out drops it", async () => {
    await runGenerate(makeSpec({ seed: 5, size: { x: W, y: W } }));
    ed.refine();
    const first = ed.showHazard("drought", 9);
    const second = ed.showHazard("drought", 2);
    expect(await first).toBeNull();
    expect((await second)!.days).toBe(2);
  });
});
