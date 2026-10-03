// Release gate (D385), forces: Try another replaces the force before it (EDITOR_PLAN "Stored literally":
// "Try another replaces the force before it"; D220), running "the last kept force again, from its
// original land" (worker `forceAgain`). A force that breaks the start's ground carries the start in
// the same undo step (D257), clearing the generation's objects under its new place (`startClears`).
// So Try another must replace that carry too: its map is the map a fresh run of the same try would
// make. (The release gate's bug hunt found the first try's carry staying: the start stayed where the
// first try put it, and the objects its carry cleared stayed gone.)

import { describe, expect, it } from "vitest";
import { decodeProject } from "../../src/core/doc/document";
import { MapSession } from "../../src/core/doc/session";
import { startMiddle } from "../../src/core/doc/tools";
import { QUAKE_DEFAULTS } from "../../src/core/forces/quake";
import { makeSpec } from "../../src/core/spec/mapspec";
import { runGenerate } from "../../src/worker/api";
import * as ed from "../../src/worker/session";

const open = () => MapSession.open(decodeProject(ed.project().bytes));
function play(): boolean {
  for (let k = 0; k < 4000 && !(ed.forceAdvance(16)?.done ?? true); k++);
  return ed.forceStop().kept;
}
const objects = (s: MapSession) => s.built.entities.map((e) => `${e.template} ${e.id} @${e.x},${e.y}`).sort();

describe("Try another after a force that carried the start (D257, D220)", () => {
  it("Highlands 64², seed 4: a Quake Slide clicked at (42, 1) carries the start; Try another leaves the start's ground alone, so the start stays at (42, 8) and the 9 objects the first carry cleared stand, as a fresh run of that try leaves them", async () => {
    const W = 64;
    await runGenerate(makeSpec({ seed: 4, theme: "highlands", size: { x: W, y: W } }));
    ed.setEditorWaterMode("defer");
    ed.refine();
    const orig = startMiddle(open())!;
    expect(orig).toEqual([42, 8]);

    // the first try: a Slide clicked at (42, 1), Power 40, the editor's way; it breaks the start's ground
    expect(ed.forceStart({ verb: "quake", settings: { ...QUAKE_DEFAULTS, mode: "slide", power: 40, seed: 0 }, path: [{ x: 42, y: 1 }, { x: 42, y: 1 }], side: 1, cut: null, natural: true }).errors).toEqual([]);
    expect(play()).toBe(true);
    expect(startMiddle(open())).not.toEqual(orig);

    // Try another: its own fault, from the original land
    expect(ed.forceAgain().errors).toEqual([]);
    expect(play()).toBe(true);
    const tried = open();
    const b = tried.logOps.filter((o) => o.op === "forceResult").at(-1)!;
    if (b.op !== "forceResult") throw new Error("no force");
    expect(b.params.replaces).toBeDefined();
    // (it never touches the start's own ground, nor the ground two tiles round it)
    const near = new Set<number>();
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) near.add((orig[1] + dy) * W + orig[0] + dx);
    expect(b.params.tiles.filter((i) => near.has(i))).toEqual([]);

    // the same try run fresh on the original map: the same land and objects changed
    ed.jump(-1);
    const p = b.params;
    expect(ed.forceStart({ verb: "quake", settings: p.settings as typeof QUAKE_DEFAULTS, path: p.where.path!.map(([x, y]) => ({ x, y })), side: p.where.side!, cut: null }).errors).toEqual([]);
    expect(play()).toBe(true);
    const fresh = open();
    const f = fresh.logOps.filter((o) => o.op === "forceResult").at(-1)!;
    if (f.op !== "forceResult") throw new Error("no force");
    expect(f.params.tiles).toEqual(p.tiles);
    expect(f.params.removed).toEqual(p.removed);
    expect(f.params.moved).toEqual(p.moved);
    expect(startMiddle(fresh)).toEqual(orig);

    // so Try another leaves what the fresh run leaves: the start where it stood, every object standing
    expect(startMiddle(tried)).toEqual(startMiddle(fresh));
    expect(objects(tried)).toEqual(objects(fresh));
  });
});
