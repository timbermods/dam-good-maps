// Under Ride, a multi-tile source on ground a force moved unevenly keeps riding, its seat levelled to the lowest of its
// tiles as D290 levels a placed one (planning's ruling of 2026-11-11; clear.ts `levelSeats`, Rust's Carve `level_seat`).
// The map that found it: Highlands 4242 at 256², a Craterize at (170, 70), whose debris apron tore a badwater source's
// 3 × 3 at (150, 104): it rode onto uneven ground and stood inside it, and the export refused the map.

import { describe, expect, it } from "vitest";
import { decodeProject } from "../../src/core/doc/document";
import { MapSession } from "../../src/core/doc/session";
import { levelSeats } from "../../src/core/forces/clear";
import { CRATER_DEFAULTS, type CraterSettings } from "../../src/core/forces/craterize";
import { footprint } from "../../src/core/forces/objects";
import { waterSource } from "../../src/core/format/entities";
import { plainEntities } from "../../src/core/forces/force";
import { makeSpec } from "../../src/core/spec/mapspec";
import { runGenerate } from "../../src/worker/api";
import * as ed from "../../src/worker/session";

const W = 256;
const SOURCE = "98a92938-81f3-40e5-bbd9-0966c0277dbc";

describe("a multi-tile source rides a force on a level seat (planning's ruling of 2026-11-11)", () => {
  it("Highlands 4242's crater under Ride: the badwater source rides on its seat, the export takes the map, replay and undo hold", async () => {
    await runGenerate(makeSpec({ seed: 4242, theme: "highlands", size: { x: W, y: W } }));
    ed.refine();
    const before = MapSession.open(decodeProject(ed.project().bytes)).built;
    const was = before.entities.find((e) => e.id === SOURCE)!;
    expect(was.template).toBe("BadwaterSource");
    const settings = { ...CRATER_DEFAULTS, size: 54, centre: "flat", sources: "ride" } as unknown as CraterSettings;
    expect(ed.forceStart({ verb: "craterize", settings, origin: [170, 70], cut: null, natural: false }).errors).toEqual([]);
    for (let k = 0; k < 3; k++) ed.forceAdvance(1);
    expect(ed.forceStop().kept).toBe(true);
    const s = MapSession.open(decodeProject(ed.project().bytes));
    const b = s.built;
    const e = b.entities.find((q) => q.id === SOURCE);
    expect(e, "the source rides").toBeDefined();
    const tiles = footprint({ W, H: W }, e!);
    expect(tiles.length).toBe(9);
    const low = Math.min(...tiles.map((i) => b.heights[i]));
    // (the crater moved its tiles unevenly: without the seat it stood inside the ground)
    const op = s.state.sculpts.filter((o) => o.op === "forceResult").at(-1)!.params as { tiles: number[]; heights: number[] };
    expect(tiles.some((i) => op.tiles.includes(i))).toBe(true);
    for (const i of tiles) expect(b.heights[i], "its seat is level").toBe(low);
    expect(e!.z).toBe(low);
    const ex = await ed.exportTimber(true);
    expect(ex.errors).toEqual([]);
    expect(ex.ok).toBe(true);
    expect(MapSession.replayMatchesStored(decodeProject(ed.project().bytes))).toBe(true);
    // undo, the force's one step, brings back the land and the source as they were
    ed.undo();
    const back = MapSession.open(decodeProject(ed.project().bytes)).built;
    expect(Buffer.compare(Buffer.from(back.heights), Buffer.from(before.heights))).toBe(0);
    const again = back.entities.find((q) => q.id === SOURCE)!;
    expect([again.x, again.y, again.z]).toEqual([was.x, was.y, was.z]);
  }, 600_000);

  it("a footprint moved evenly cuts nothing; a single-tile source and one under a roof are left as they ride", () => {
    const n = 8;
    const heights = new Uint8Array(n * n).fill(5);
    const bad = plainEntities([waterSource({ x: 2, y: 2, z: 5, id: "bad", owner: "test", strength: 1, bad: true })])[0];
    const one = plainEntities([waterSource({ x: 6, y: 6, z: 5, id: "one", owner: "test", strength: 1 })])[0];
    const before = { W: n, H: n, heights, entities: [bad, one] };
    // every tile of the 3 × 3 raised by 2, the single source's tile and a neighbour by different amounts
    const even = heights.slice();
    for (const i of footprint(before, bad)) even[i] = 7;
    even[6 * n + 6] = 6;
    const after = { W: n, H: n, heights: even, entities: [{ ...bad }, { ...one }] };
    expect(levelSeats(before, after, false)).toEqual([]);
    // the 3 × 3 moved unevenly: cut to the lowest, standing on it
    const torn = heights.slice();
    footprint(before, bad).forEach((i, k) => (torn[i] = 5 + (k % 3)));
    const after2 = { W: n, H: n, heights: torn, entities: [{ ...bad }] };
    expect(levelSeats(before, after2, false).length).toBe(6);
    for (const i of footprint(before, bad)) expect(torn[i]).toBe(5);
    expect(after2.entities[0].z).toBe(5);
    // one under a roof (below its tile's ground) stays in its cave
    const cave = { ...bad, z: 2 };
    const torn3 = heights.slice();
    footprint(before, bad).forEach((i, k) => (torn3[i] = 5 + (k % 3)));
    expect(levelSeats({ ...before, entities: [cave] }, { W: n, H: n, heights: torn3, entities: [{ ...cave }] }, false)).toEqual([]);
  });
});
