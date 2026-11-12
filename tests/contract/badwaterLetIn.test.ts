// The shared badwater check (the force audit's S3, `core/water/badwaterLetIn.ts`): a force kept in the editor says
// when it let badwater into water that was clean, and only then. The case builds its own ground, so no generator
// version can move it (planning's rule of 2026-11-12): a blank 96² map at level 10 with
//   - a clean channel along y 45-49 at level 5, fed by a clean source at its east end, running west off the map
//     through a pool 2 deep beside the start (x 54-66, y 40-55; the start at 48, 48);
//   - a badwater trench along y 21-24 at level 8, fed by a badwater source at its west end, running east off the
//     map, held off the clean channel by the plain between them (the ridge).

import { describe, expect, test } from "vitest";
import { RIFT_DEFAULTS } from "../../src/core/forces/rift";
import type { ForceRequest } from "../../src/core/forces/start";
import { MapSession } from "../../src/core/doc/session";
import { decodeProject } from "../../src/core/doc/document";
import * as ed from "../../src/worker/session";
import { badwaterLetIn } from "../../src/core/water/badwaterLetIn";

const W = 96;
const built = () => MapSession.open(decodeProject(ed.project().bytes)).built;
const flat = (y0: number, y1: number, x0: number, x1: number, level: number) => {
  const cells: [number, number, number][] = [];
  for (let y = y0; y <= y1; y++) cells.push([y, x0, x1]);
  expect(ed.apply({ op: "sculpt", params: { mode: "flatten", cells, level, exact: true } } as never).errors ?? []).toEqual([]);
};
const source = (id: string, template: string, x: number, y: number, strength: number) =>
  expect(ed.apply({ op: "placeEntity", params: { id, template, x, y, orientation: "Cw0", components: { WaterSource: { SpecifiedStrength: strength, CurrentStrength: strength } } } } as never).errors ?? []).toEqual([]);

function ground() {
  ed.newBlank(W, 10);
  flat(45, 49, 0, 92, 5);
  flat(40, 55, 54, 66, 3);
  flat(21, 24, 60, 95, 8);
  source("00000000-0000-4000-8000-0000000000c1", "WaterSource", 90, 47, 4);
  source("00000000-0000-4000-8000-0000000000c2", "BadwaterSource", 60, 22, 1);
}
/** A Rift dragged from (x, y0) to (x, y1) on the water settled (as a player sees it once it has), played to its end
 *  and kept. */
function rift(x: number, y0: number, y1: number) {
  ed.settleWater();
  const request = { verb: "rift", settings: { ...RIFT_DEFAULTS }, path: [{ x, y: y0 }, { x, y: y1 }], cut: null } as ForceRequest;
  expect(ed.forceStart(request).errors).toEqual([]);
  for (let k = 0; k < 400 && !ed.forceAdvance(8)?.done; k++);
  const stop = ed.forceStop();
  expect(stop.errors).toEqual([]);
  return stop;
}
/** Tiles of clean water in `b` that are badwater in `a`, both settled. */
const fouled = (b: { water: Float64Array; contamination: Float64Array }, a: { water: Float64Array; contamination: Float64Array }) => {
  let n = 0;
  for (let i = 0; i < W * W; i++) if (b.water[i] >= 0.05 && b.contamination[i] < 0.05 && a.water[i] >= 0.05 && a.contamination[i] >= 0.05) n++;
  return n;
};

describe("the badwater check", () => {
  test("a Rift through the ridge that lets the badwater into the start's pool is caught, one elsewhere is not, and water already mixed is not blamed", () => {
    ground();
    const b = built();
    let clean = 0;
    for (let i = 0; i < W * W; i++) if (b.water[i] >= 0.05 && b.contamination[i] < 0.05) clean++;
    expect(clean, "the channel and the pool hold clean water").toBeGreaterThan(500);
    // across the ridge: the badwater runs down the rift's floor into the clean channel and the start's pool
    const caught = rift(75, 12, 60);
    expect(caught.badwater, "caught").toBeDefined();
    expect(caught.badwater!.start).toBe(true);
    expect(caught.badwater!.note).toMatch(/^Badwater now reaches the start's water: \d+ tiles, at X \d+ · Y \d+\.$/);
    const mixed = built();
    // (the settled water fouls about half of it: mixing reaches the far end of the channel more slowly than the settle runs)
    expect(fouled(b, mixed), "the settled water fouled too").toBeGreaterThan(200);
    // a second Rift across the same ridge, on the water the first already mixed: not its doing
    const again = rift(84, 12, 60);
    expect(again.badwater).toBeUndefined();
    ed.undo();
    ed.undo();
    expect(built().heights).toEqual(b.heights);
    // the same Rift on the first ground is (the check sees each change against its own before)
    const alone = rift(84, 12, 60);
    expect(alone.badwater?.start).toBe(true);
    ed.undo();
    // far from the badwater: nothing said, and the settled water agrees
    const away = rift(21, 66, 90);
    expect(away.badwater).toBeUndefined();
    expect(fouled(b, built())).toBe(0);
    ed.undo();
    // headless, the same answer from the land alone, and a map whose water was all badwater is never blamed
    const all = { W, H: W, heights: b.heights, entities: b.entities, water: { depth: b.water, contamination: b.contamination } };
    expect(badwaterLetIn(all, mixed)?.tiles).toBe(caught.badwater!.tiles);
    expect(badwaterLetIn({ ...all, water: { depth: b.water, contamination: new Float64Array(W * W).fill(1) } }, mixed)).toBeNull();
  }, 240000);
});
