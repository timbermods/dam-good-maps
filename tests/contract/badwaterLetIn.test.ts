// The shared badwater check (the force audit's S3, `core/water/badwaterLetIn.ts`): a force kept in the editor says
// when it let badwater into water that was clean, and only then. Highlands 4242 at 128² (the map Rift's PR #1010
// found it on): one badwater source at (67, 83), its stream held off the start's lake by a rise.

import { describe, expect, test } from "vitest";
import { RIFT_DEFAULTS } from "../../src/core/forces/rift";
import type { ForceRequest } from "../../src/core/forces/start";
import { MapSession } from "../../src/core/doc/session";
import { decodeProject } from "../../src/core/doc/document";
import { makeSpec } from "../../src/core/spec/mapspec";
import { runGenerate } from "../../src/worker/api";
import * as ed from "../../src/worker/session";
import { badwaterLetIn } from "../../src/core/water/badwaterLetIn";

const W = 128;
const built = () => MapSession.open(decodeProject(ed.project().bytes)).built;
/** A Rift clicked at (x, y), size 60 (the audit's case), played to its end and kept. */
function rift(x: number, y: number) {
  const request = { verb: "rift", settings: { ...RIFT_DEFAULTS, size: 60 }, path: [{ x, y }], cut: null } as ForceRequest;
  expect(ed.forceStart(request).errors).toEqual([]);
  for (let k = 0; k < 400 && !ed.forceAdvance(8)?.done; k++);
  const stop = ed.forceStop();
  expect(stop.errors).toEqual([]);
  return stop;
}
const fouled = (b: { water: Float64Array; contamination: Float64Array }, a: { water: Float64Array; contamination: Float64Array }) => {
  let n = 0;
  for (let i = 0; i < W * W; i++) if (b.water[i] >= 0.05 && b.contamination[i] < 0.05 && a.water[i] >= 0.05 && a.contamination[i] >= 0.05) n++;
  return n;
};

describe("the badwater check", () => {
  test("a Rift that lets the badwater stream into the start's lake is caught, one that does not is not, and water already mixed is not blamed", async () => {
    await runGenerate(makeSpec({ seed: 4242, theme: "highlands", size: { x: W, y: W } }));
    ed.refine();
    const b = built();
    // across the rise: the stream runs down the rift's floor into the start's lake (the settled water agrees)
    const caught = rift(40, 68);
    expect(caught.badwater, "caught").toBeDefined();
    expect(caught.badwater!.start).toBe(true);
    expect(caught.badwater!.tiles).toBeGreaterThan(400);
    expect(caught.badwater!.note).toMatch(/^Badwater now reaches the start's water: \d+ tiles, at X \d+ · Y \d+\.$/);
    const mixed = built();
    expect(fouled(b, mixed), "the settled water fouled").toBeGreaterThan(400);
    // a second Rift across the same rise, on the water the first already mixed: not its doing
    const again = rift(54, 68);
    expect(again.badwater).toBeUndefined();
    ed.undo();
    ed.undo();
    expect(built().heights).toEqual(b.heights);
    // the same Rift on the first map would have been (the check sees each change against its own before)
    expect(rift(54, 68).badwater?.start).toBe(true);
    ed.undo();
    // far from the stream: nothing said
    const away = rift(26, 12);
    expect(away.badwater).toBeUndefined();
    expect(fouled(b, built())).toBe(0);
    ed.undo();
    // headless, the same answer from the land alone, and the map's own water fully mixed is never blamed
    const all = { W, H: W, heights: b.heights, entities: b.entities, water: { depth: b.water, contamination: b.contamination } };
    expect(badwaterLetIn(all, mixed)?.tiles).toBe(caught.badwater!.tiles);
    expect(badwaterLetIn({ ...all, water: { depth: b.water, contamination: new Float64Array(W * W).fill(1) } }, mixed)).toBeNull();
  }, 240000);
});
