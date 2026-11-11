// A Carve in a working area across a multi-tile source on the area's edge, under Ride (planning's ruling of 2026-11-11):
// the seat cannot be cut on the tiles the area keeps, so the Carve leaves the whole footprint as it was and the source
// keeps its old seat, in Rust (lib.rs `level_seat`, measured on the land the area's feather keeps) as the staged forces
// do in TypeScript (clear.ts `levelSeats`). The map exports, replays byte for byte, records the same operation shown
// forward and from its end, its showing ends on the land kept, and undo restores it.

import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decodeProject } from "../../src/core/doc/document";
import { MapSession } from "../../src/core/doc/session";
import { DEFAULTS as CARVE_DEFAULTS } from "../../src/core/forces/carve/run";
import { footprint } from "../../src/core/forces/objects";
import type { ForceResultParams } from "../../src/core/forces/op";
import * as ed from "../../src/worker/session";

const W = 96;
const ID = "00000000-0000-4000-8000-0000000000b1";
const hash = (h: Uint8Array) => createHash("sha256").update(h).digest("hex");

/** The force at work played to its end, frame by frame: the land each frame showed, and the land kept. */
function playOut(): { last: Uint8Array; kept: Uint8Array } {
  let shown = ed.terrainNow().heights.slice();
  for (let k = 0; k < 4000; k++) {
    const f = ed.forceAdvance(1)!;
    if (f.heights) shown = f.heights.slice();
    if (f.done) break;
  }
  expect(ed.forceStop().errors).toEqual([]);
  return { last: shown, kept: ed.terrainNow().heights.slice() };
}

const lastOp = () => MapSession.open(decodeProject(ed.project().bytes)).state.sculpts.filter((o) => o.op === "forceResult").at(-1)!.params as ForceResultParams;

describe("a Carve in a working area leaves a source on the area's edge on its old seat", () => {
  it("under Ride: the source stands level, the map exports and replays, forward and from the end agree, undo restores", async () => {
    ed.newBlank(W, 10);
    // (a badwater source's 3 × 3 at x 18-20, y 30-32 on the carve's course: the area runs to row 31, so its row 32 is kept)
    expect(ed.apply({ op: "placeEntity", params: { id: ID, template: "BadwaterSource", x: 18, y: 30, orientation: "Cw0", components: { WaterSource: { SpecifiedStrength: 1, CurrentStrength: 1 } } } } as never).errors ?? []).toEqual([]);
    const s0 = MapSession.open(decodeProject(ed.project().bytes));
    const before = s0.built.heights.slice();
    const was = s0.built.entities.find((e) => e.id === ID)!;
    const seat = footprint({ W, H: W }, was);
    expect(seat.length).toBe(9);
    const area = Array.from({ length: 14 }, (_, k) => [18 + k, 2, 50] as [number, number, number]);
    const req = { verb: "carve" as const, settings: { ...CARVE_DEFAULTS, mode: "aim" as const, defyGravity: true, power: 70, dry: true, width: 5, wander: 0, sources: "ride" as const }, origin: [5, 28] as [number, number], end: [45, 28] as [number, number], cut: null, area };
    expect(ed.forceStart(req).errors).toEqual([]);
    const forward = playOut();
    const opForward = lastOp();
    // (the cut reached the source's rows, beside it, so its seat would have torn)
    expect(opForward.tiles.some((i) => i % W >= 14 && i % W <= 24 && Math.floor(i / W) >= 30 && Math.floor(i / W) <= 31 && !seat.includes(i))).toBe(true);
    // its showing ends on the land kept: TypeScript's feather and the Rust's held seat agree
    expect(hash(forward.last)).toBe(hash(forward.kept));
    const s = MapSession.open(decodeProject(ed.project().bytes));
    const e = s.built.entities.find((q) => q.id === ID);
    expect(e, "the source rides").toBeDefined();
    for (const i of seat) expect(s.built.heights[i], "its seat as it was").toBe(before[i]);
    expect(e!.z).toBe(was.z);
    const ex = await ed.exportTimber(true);
    expect(ex.errors).toEqual([]);
    expect(MapSession.replayMatchesStored(decodeProject(ed.project().bytes))).toBe(true);
    ed.undo();
    const back = MapSession.open(decodeProject(ed.project().bytes)).built;
    expect(hash(back.heights)).toBe(hash(before));
    const again = back.entities.find((q) => q.id === ID)!;
    expect([again.x, again.y, again.z]).toEqual([was.x, was.y, was.z]);
    // shown from its end: the same operation, the same land
    expect(ed.forceStart({ ...req, shownFrom: "end" }).errors).toEqual([]);
    const fromEnd = playOut();
    expect(hash(fromEnd.last)).toBe(hash(fromEnd.kept));
    expect(hash(fromEnd.kept)).toBe(hash(forward.kept));
    expect(lastOp()).toEqual(opForward);
  }, 300_000);
});
