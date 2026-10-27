// Release gate (D385), forces: "carried objects land where the force put them" (D425; EDITOR_PLAN
// "Only the player places objects": "the objects a force carries leave their ground together and land
// where it put them"). The build applies a force's carried objects as quiet moves and leaves out one
// put down on ground another object holds (`applyEntityEdits`, core/features/edits.ts). It recorded the
// held ground once, at the first quiet move of the whole log, and never updated it for the objects
// removed or moved by hand after that (the release gate's bug hunt, D385). So once any force had
// carried something, an object a later force carried onto a tile where an object stood that the
// player had since deleted or moved was silently left out: it vanished, though the force found that
// tile free and its operation listed it as carried there.

import { describe, expect, it } from "vitest";
import { decodeProject } from "../../src/core/doc/document";
import type { EditOp } from "../../src/core/doc/ops";
import { MapSession } from "../../src/core/doc/session";
import { QUAKE_DEFAULTS } from "../../src/core/forces/quake";
import { makeSpec } from "../../src/core/spec/mapspec";
import { runGenerate } from "../../src/worker/api";
import * as ed from "../../src/worker/session";

const W = 64;
const open = () => MapSession.open(decodeProject(ed.project().bytes));
const gid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const PINES = Array.from({ length: 12 }, (_, k) => gid(k + 1));
const ROW = 27;
const X0 = 33;

/** A Quake Slide along a straight fault, the editor's worker keeping it. */
function slide(path: { x: number; y: number }[], side: 1 | -1, power: number): void {
  expect(ed.forceStart({ verb: "quake", settings: { ...QUAKE_DEFAULTS, mode: "slide", power, seed: 1 }, path, side, cut: null }).errors).toEqual([]);
  for (let k = 0; k < 4000 && !(ed.forceAdvance(16)?.done ?? true); k++);
  expect(ed.forceStop().kept).toBe(true);
}

/** Highlands 64², seed 1: twelve Pines planted in a row on dry free ground, (33..44, 27). */
async function planted(): Promise<void> {
  await runGenerate(makeSpec({ seed: 1, theme: "highlands", size: { x: W, y: W } }));
  ed.refine();
  PINES.forEach((id, k) => expect(ed.apply({ op: "placeEntity", params: { id, template: "Pine", x: X0 + k, y: ROW, orientation: "Cw0" } }).errors).toEqual([]));
}

/** The row's Slide: Power 20 carries the row 6 tiles east along a fault 3 tiles south of it. What it
 *  listed as carried that doesn't stand where it put it. */
function rowSlide(): string[] {
  slide([{ x: 2, y: ROW + 3 }, { x: W - 3, y: ROW + 3.2 }], -1, 20);
  const s = open();
  const f = s.logOps.filter((o) => o.op === "forceResult").at(-1)!;
  if (f.op !== "forceResult") throw new Error("no force");
  const at = new Map(s.built.entities.map((e) => [e.id, e]));
  const carried = (f.params.moved ?? []).filter((m) => PINES.includes(m.id));
  expect(carried.length).toBeGreaterThan(8);
  return carried.filter((m) => at.get(m.id)?.x !== m.x || at.get(m.id)?.y !== m.y).map((m) => `Pine ${m.id.slice(-2)} carried to (${m.x}, ${m.y})`);
}

describe("an object a force carries lands where the force put it (D425)", () => {
  it("Highlands 64², seed 1: after a Slide elsewhere, a Pine of a planted row deleted by hand; the row's Slide carries the Pine behind it onto its tile, and that Pine stands there", async () => {
    await planted();
    // a Slide across the south of the map, carrying what stands there
    slide([{ x: 4, y: W - 12 }, { x: W - 5, y: W - 11.5 }], 1, 30);
    // the player deletes the ninth Pine, at (41, 27)
    expect(ed.apply({ op: "deleteEntities", params: { entities: [PINES[8]] } } as EditOp).errors).toEqual([]);
    expect(rowSlide()).toEqual([]);
  });

  it("the same with the ninth Pine moved by hand two tiles north instead of deleted", async () => {
    await planted();
    slide([{ x: 4, y: W - 12 }, { x: W - 5, y: W - 11.5 }], 1, 30);
    expect(ed.apply({ op: "moveEntity", params: { id: PINES[8], x: X0 + 8, y: ROW - 2 } } as EditOp).errors).toEqual([]);
    expect(rowSlide()).toEqual([]);
  });

  it("(control) without the first Slide, the deleted Pine's tile takes the carried Pine", async () => {
    await planted();
    expect(ed.apply({ op: "deleteEntities", params: { entities: [PINES[8]] } } as EditOp).errors).toEqual([]);
    expect(rowSlide()).toEqual([]);
  });
});
