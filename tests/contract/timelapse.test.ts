// The build time-lapse's replay (D205, D285 (4); core/doc/timelapse.ts): the history replayed from the generated
// map, step by step, ends as the map itself, byte for byte (land, water once settled, soil, objects: D455's
// comparison, and the .timber the game loads), and what plays between the steps only ever shows the step's own
// result at its end.

import { describe, expect, it } from "vitest";
import { applyForce } from "../../src/core/collab";
import { decodeProject } from "../../src/core/doc/document";
import type { EditOp } from "../../src/core/doc/ops";
import { MapSession } from "../../src/core/doc/session";
import { heightsAt, logSteps, revealOrder, TimelapseReplay } from "../../src/core/doc/timelapse";
import { mapProject, Stream, type Kind } from "./collabFixtures";

const W = 64;

/** A map with a history of every kind: strokes, a sculpt, objects placed, moved, changed and removed, forces. */
function edited(): Uint8Array {
  const s = MapSession.open(decodeProject(mapProject(11, "riverValley", W)));
  s.setWaterMode("defer");
  const stream = new Stream(3, W);
  const kinds: Kind[] = ["raise", "place", "carve", "lower", "move", "smooth", "craterize", "props", "naturalize", "remove", "flatten", "erupt", "sculpt"];
  let forces = 0;
  for (const kind of kinds) {
    const c = stream.command(kind, s);
    if (!c) continue;
    if (c.kind === "force") {
      // (a force plans on settled water, as the editor's waits for it)
      s.settleCanonical();
      if (applyForce(s, c.gesture).ok) forces++;
    } else if (c.kind === "edit") s.applyAll(c.ops as EditOp[], "user", c.label);
  }
  expect(forces, "the history holds forces").toBeGreaterThan(0);
  expect(s.history().filter((h) => h.applied).length, "and steps of every kind").toBeGreaterThan(8);
  return s.project();
}

describe("the time-lapse's replay ends as the map itself", () => {
  const bytes = edited();

  it("each step's ground at its end is the step's, and the last is the map's, byte for byte", () => {
    const doc = decodeProject(bytes);
    const r = TimelapseReplay.open(doc);
    expect(r.steps.length).toBe(logSteps(r.target.logOps).length);
    // the generated map: the land the history started from
    const shown = r.map.built.heights.slice();
    for (;;) {
      const c = r.next();
      if (!c) break;
      // (half way through, nothing outside the step's tiles moved; at its end, its tiles are the step's)
      heightsAt(c, 0.5, shown);
      heightsAt(c, 1, shown);
      expect(Buffer.from(shown).equals(Buffer.from(r.map.built.heights)), `step ${c.index} (${c.label})`).toBe(true);
      if (c.tiles.length) expect(c.box, `step ${c.index} has its place`).not.toBeNull();
    }
    expect(r.at).toBe(r.steps.length);
    expect(r.finish(), "D455's comparison: the replay is the map").toBe(true);
    expect(Buffer.compare(r.map.exportTimber().bytes, r.target.exportTimber().bytes), "the .timber").toBe(0);
  });

  it("the water flowing between steps never changes the map", () => {
    const r = TimelapseReplay.open(decodeProject(bytes));
    let flowed = 0;
    while (r.next()) if (r.flow(48)) flowed++;
    expect(flowed).toBeGreaterThan(0);
    expect(r.finish()).toBe(true);
  });

  it("a river reveals downstream and a crater from its middle out", () => {
    const tiles = Int32Array.from([0, 1, 2, 3, 4, 5], (x) => 10 * W + 10 + x * 4);
    const carve = { op: "forceResult", seq: 1, origin: "user", params: { verb: "carve", where: { path: [[10, 10], [34, 10]] } } } as never;
    const a = revealOrder([carve], tiles, W);
    for (let k = 1; k < tiles.length; k++) expect(a.start[k]).toBeGreaterThan(a.start[k - 1]);
    const crater = { op: "forceResult", seq: 1, origin: "user", params: { verb: "craterize", where: { origin: [20, 10] } } } as never;
    const b = revealOrder([crater], tiles, W);
    // (tile 2 at x 18 and 3 at x 22 are nearest the strike)
    expect(Math.max(b.start[2], b.start[3])).toBeLessThan(Math.min(b.start[0], b.start[5]));
  });
});
