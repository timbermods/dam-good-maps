// Release gate (D385), the water: a Fill below the rim of a stepped hollow on ground the pre-fill's
// walk crosses stores water from nowhere round it.
//
// The canonical settle's pre-fill fills every depression its walk crosses to its spill level; a Fill
// overrides only its own tiles (those under its level). The hollow's higher step, above the Fill's
// level but below the rim, keeps the walk's water. Its floor stands no higher than the Fill's surface,
// so the D385 removal counts it fed by the Fill (sim/fed.ts: "level counts"), and at the end the
// sealed-basin rule (D413) stores the whole basin as the pre-fill started it: the Fill at its level
// and the step round it a level higher, full. The file holds water the player never asked for, which
// no source feeds, standing a level above the Fill beside it; the game levels the two at once.
// Breaks D385/D420 (no water from nowhere), D394/D413 (a Fill stored at exactly its level, the game
// evaporating it from there) and PERFECT Water 1.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MapSession } from "../../src/core/doc/session";
import { planFill } from "../../src/core/doc/waterEdits";
import { readTimber } from "../../src/core/format/timber";
import { storedWater } from "../../src/core/format/world";
import { gameRun, rect, tilesOf } from "./gateWater";

describe("a Fill below the rim of a stepped pit on a dry plateau (D385, D394, D413)", () => {
  it("M9b's River Valley 96² seed 34: a 5×5 pit one level deep with a 3×3 pit a level deeper in it, filled to the inner pit's rim; only the Fill's 9 tiles hold water, at its level", () => {
    const s = MapSession.importMap(new Uint8Array(readFileSync("tests/fixtures/m9b-river-valley-96-34.timber")), "m9b-river-valley-96-34.timber");
    const W = s.size.x;
    // the plateau at level 4 round (41, 11), dry (tests/contract/waterFromNowhere.test.ts)
    for (const i of tilesOf(W, 38, 8, 44, 14)) {
      expect(s.built.heights[i]).toBe(4);
      expect(s.built.water[i]).toBe(0);
    }
    expect(s.apply({ op: "sculpt", params: { mode: "lower", cells: rect(39, 9, 43, 13), amount: 1 } }).errors).toEqual([]);
    expect(s.apply({ op: "sculpt", params: { mode: "lower", cells: rect(40, 10, 42, 12), amount: 1 } }).errors).toEqual([]);
    expect(s.built.heights[11 * W + 41]).toBe(2);
    expect(s.built.heights[9 * W + 39]).toBe(3);
    // (dug and settled, the pit is dry: D385 holds without the Fill)
    for (const i of tilesOf(W, 39, 9, 43, 13)) expect(s.built.water[i]).toBe(0);
    const plan = planFill(s, 41, 11, 3);
    expect(plan.reason).toBeNull();
    expect(plan.tiles).toBe(9);
    expect(s.apply(plan.op!).errors).toEqual([]);
    const lake = new Set(plan.op!.params.lake.tiles);
    const ring = tilesOf(W, 39, 9, 43, 13).filter((i) => !lake.has(i));
    const b = s.built;
    // the file the game loads
    const file = readTimber(s.exportTimber().bytes);
    const stored = storedWater(file.world.singletons, W, s.size.y);
    const inFile = new Map<number, number>();
    for (let k = 0; k < stored.tile.length; k++) inFile.set(stored.tile[k], Math.max(inFile.get(stored.tile[k]) ?? 0, stored.depth[k]));
    const ringWater = ring.filter((i) => (inFile.get(i) ?? 0) > 0.001);
    expect(ringWater.length, `ring tiles the file holds water on (the step at level 3 round the Fill; e.g. (39, 9) ${(inFile.get(9 * W + 39) ?? 0).toFixed(3)} deep)`).toBe(0);
    for (const i of lake) expect(b.heights[i] + b.water[i], `the Fill's surface at tile ${i}`).toBe(3);
    // the game's rules from the stored water: only evaporation, nothing levels out
    const g = gameRun(s, 150);
    let moved = 0;
    for (let i = 0; i < W * s.size.y; i++) if (g.D[i] > b.water[i] + 0.01) moved++;
    expect(moved, "tiles the game raises within 150 ticks of loading the file").toBe(0);
  });
});
