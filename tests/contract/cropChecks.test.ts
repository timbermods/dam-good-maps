// A cropped map has no map "as it was opened" to compare its problems with (D340): what the crop causes (the
// start's water cut off, the badwater source gone) is the player's own, listed with its fix, never as a problem
// the map already had.
import { describe, expect, it } from "vitest";
import { cropObjects } from "../../src/core/doc/crop";
import { makeSpec } from "../../src/core/spec/mapspec";
import { runGenerate } from "../../src/worker/api";
import * as ed from "../../src/worker/session";
import { map } from "./gateHelpers";

const W = 64;

describe("the checks of a cropped imported map", () => {
  it("list what the crop caused as the player's own, none as existing", async () => {
    await runGenerate(makeSpec({ seed: 3, theme: "riverValley", size: { x: W, y: W } }));
    ed.refine();
    const file = await ed.exportTimber(true);
    expect(file.ok).toBe(true);
    ed.openTimber(file.bytes, "generated.timber");
    const before = (await ed.backgroundCheck())!.check;
    // a small piece round the start, away from the water
    const entities = map(3, W, "riverValley").built.entities;
    const start = entities.find((e) => e.template === "StartingLocation")!;
    const rect = { x: Math.min(Math.max(0, start.x - 6), W - 12), y: Math.min(Math.max(0, start.y - 6), W - 12), w: 12, h: 12 };
    expect(cropObjects(entities, rect).cutStart).toBeNull();
    const r = ed.apply({ op: "crop", params: rect });
    expect(r.ok, r.errors.join("; ")).toBe(true);
    const after = (await ed.backgroundCheck())!.check;
    expect(after.existing).toEqual([]);
    // the map opened again (as the page does once the crop is made): no map as opened to compare with
    await ed.backgroundCheck();
    ed.openProject(ed.project().bytes);
    const reopened = (await ed.backgroundCheck())!.check;
    expect(reopened.existing).toEqual([]);
    expect([...reopened.blocking, ...reopened.warnings].map((c) => c.id).sort()).toEqual([...after.blocking, ...after.warnings].map((c) => c.id).sort());
    const own = [...after.blocking, ...after.warnings].map((c) => c.id);
    expect(own.length, "the crop causes problems").toBeGreaterThan(0);
    // undone, the map is the map as it was opened again
    ed.undo();
    await ed.backgroundCheck();
    const back = (await ed.backgroundCheck())!.check;
    expect(back.existing.map((c) => c.id)).toEqual(before.existing.map((c) => c.id));
    ed.closeSession();
  });
});
