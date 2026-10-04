// A badwater source never refuses for uneven ground (PLAN §20 D290): placed, switched from clean or
// moved where its nine tiles aren't level, it cuts them down to the lowest of them (never filling, so
// its water isn't dammed), a small level spring pool, in the same undo step; what stood on them goes
// with it. It still refuses at the map's edge and on the start, with one plain reason each; the
// project replays the pool exactly.

import { describe, expect, it } from "vitest";
import { decodeProject } from "../../src/core/doc/document";
import { MapSession } from "../../src/core/doc/session";
import { makeSpec } from "../../src/core/spec/mapspec";
import { runGenerate } from "../../src/worker/api";
import * as ed from "../../src/worker/session";

const W = 96;
const bad = (x: number, y: number) => ({ tool: "entity" as const, template: "BadwaterSource", x, y, orientation: "Cw0" as const, components: { WaterSource: { SpecifiedStrength: 1, CurrentStrength: 1 } } });
const uuid = (k: number) => `4444444${k}-2222-4333-8444-555555555555`;
const history = () => ed.sessionInfo().history.filter((h) => h.applied);
const heights = () => ed.terrainNow().heights;

/** A 3 × 3 of uneven, dry ground with nothing on it, away from the start and the edge. */
function unevenSpot(s: MapSession, skip: number): [number, number] {
  const b = s.built;
  const st = b.start!;
  const taken = new Set<number>();
  for (const e of b.entities) for (let dy = -1; dy <= 3; dy++) for (let dx = -1; dx <= 3; dx++) taken.add((e.y + dy) * W + e.x + dx);
  let n = 0;
  for (let y = 8; y < W - 8; y++)
    for (let x = 8; x < W - 8; x++) {
      if (Math.hypot(x - st.x, y - st.y) < 12) continue;
      const t: number[] = [];
      for (let dy = 0; dy < 3; dy++) for (let dx = 0; dx < 3; dx++) t.push((y + dy) * W + x + dx);
      if (t.some((i) => taken.has(i) || b.water[i] > 0)) continue;
      const hs = t.map((i) => b.heights[i]);
      if (Math.max(...hs) - Math.min(...hs) >= 1 && n++ === skip) return [x, y];
    }
  throw new Error("no uneven ground");
}

describe("a badwater source cuts its own spring pool (D290)", () => {
  it("placed on uneven ground: its nine tiles cut down to the lowest, nothing else changed, one step; undo takes both back; the project replays it", async () => {
    await runGenerate(makeSpec({ seed: 7, theme: "highlands", size: { x: W, y: W } }));
    ed.refine();
    const s = MapSession.open(decodeProject(ed.project().bytes));
    const [x, y] = unevenSpot(s, 0);
    // the hover says it fits
    expect(ed.footprintCheck(bad(x, y)).problem).toBeNull();
    const before = heights().slice();
    const n0 = history().length;
    const u = ed.applyTool(bad(x, y), uuid(1));
    expect(u.errors).toEqual([]);
    expect(history().length).toBe(n0 + 1);
    const nine = new Set<number>();
    for (let dy = 0; dy < 3; dy++) for (let dx = 0; dx < 3; dx++) nine.add((y + dy) * W + x + dx);
    const low = Math.min(...[...nine].map((i) => before[i]));
    const after = heights();
    for (let i = 0; i < after.length; i++) expect(after[i], `tile ${i}`).toBe(nine.has(i) ? low : before[i]);
    const again = MapSession.open(decodeProject(ed.project().bytes));
    expect(Array.from(again.built.heights)).toEqual(Array.from(after));
    expect(again.built.entities.some((e) => e.template === "BadwaterSource" && e.x === x && e.y === y)).toBe(true);
    ed.undo();
    expect(Array.from(heights())).toEqual(Array.from(before));
    expect(history().length).toBe(n0);
  });

  it("a clean source switched to badwater, and a badwater source dragged, cut their pools the same way, each one step", async () => {
    await runGenerate(makeSpec({ seed: 7, theme: "highlands", size: { x: W, y: W } }));
    ed.refine();
    const s = MapSession.open(decodeProject(ed.project().bytes));
    const [x, y] = unevenSpot(s, 3);
    // a clean source on the middle tile, then switched the page's way: removed, a bad one round it
    expect(ed.applyTool({ tool: "entity", template: "WaterSource", x: x + 1, y: y + 1, orientation: "Cw0", components: { WaterSource: { SpecifiedStrength: 2, CurrentStrength: 2 } } }, uuid(2)).errors).toEqual([]);
    const before = heights().slice();
    const n0 = history().length;
    const clean = ed.sessionView().info;
    const id = MapSession.open(decodeProject(ed.project().bytes)).built.entities.find((e) => e.template === "WaterSource" && e.x === x + 1 && e.y === y + 1)!.id;
    expect(clean).toBeTruthy();
    const u = ed.applyAll(
      [
        { op: "deleteEntities", params: { entities: [id] } },
        { op: "placeEntity", params: { id: uuid(3), template: "BadwaterSource", x, y, orientation: "Cw0", components: { WaterSource: { SpecifiedStrength: 2, CurrentStrength: 2 } } } },
      ],
      "Make a source badwater",
    );
    expect(u.errors).toEqual([]);
    expect(history().length).toBe(n0 + 1);
    let low = Infinity;
    for (let dy = 0; dy < 3; dy++) for (let dx = 0; dx < 3; dx++) low = Math.min(low, before[(y + dy) * W + x + dx]);
    for (let dy = 0; dy < 3; dy++) for (let dx = 0; dx < 3; dx++) expect(heights()[(y + dy) * W + x + dx]).toBe(low);
    // dragged onto other uneven ground: its pool is cut there, one step
    const [x2, y2] = unevenSpot(MapSession.open(decodeProject(ed.project().bytes)), 9);
    const b2 = heights().slice();
    const m = ed.applyAll([{ op: "moveEntity", params: { id: uuid(3), x: x2, y: y2 } }], "Move a badwater source");
    expect(m.errors).toEqual([]);
    let low2 = Infinity;
    for (let dy = 0; dy < 3; dy++) for (let dx = 0; dx < 3; dx++) low2 = Math.min(low2, b2[(y2 + dy) * W + x2 + dx]);
    for (let dy = 0; dy < 3; dy++) for (let dx = 0; dx < 3; dx++) expect(heights()[(y2 + dy) * W + x2 + dx]).toBe(low2);
    expect(history().length).toBe(n0 + 2);
  });

  it("it refuses only at the map's edge and on the start, with one plain reason", async () => {
    await runGenerate(makeSpec({ seed: 7, theme: "highlands", size: { x: W, y: W } }));
    ed.refine();
    const st = MapSession.open(decodeProject(ed.project().bytes)).built.start!;
    const edge = ed.applyTool(bad(W - 2, 20), uuid(4));
    expect(edge.errors).toEqual(["it does not fit on the map"]);
    const start = ed.applyTool(bad(st.x - 1, st.y - 1), uuid(5));
    expect(start.errors).toEqual(["the district center stands there"]);
    expect(ed.footprintCheck(bad(st.x - 1, st.y - 1)).problem).toBe("the district center stands there");
  });
});
