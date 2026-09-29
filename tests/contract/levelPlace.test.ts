// Placed objects fit the land (PLAN §20 D328, extending D290 from the badwater source to every
// shelf object that needs level ground): placed on uneven ground it cuts its own footprint down to
// the lowest tile under it (never filled, so no water is dammed), in the placement's one undo step;
// only the map's own limits (its edge, a cave, another object's tiles) refuse, with one plain reason.

import { describe, expect, it } from "vitest";
import { cornerFor } from "../../src/core/doc/tools";
import { footprintTiles, startEntranceTile, type Orientation } from "../../src/core/format/footprints";
import { makeSpec } from "../../src/core/spec/mapspec";
import { ORIENTATION_NAMES } from "../../src/render3d/model";
import { runGenerate } from "../../src/worker/api";
import * as ed from "../../src/worker/session";

const W = 96;
const steps = () => ed.sessionView().info.history.filter((h) => h.applied).length;
const heightsNow = () => ed.sessionView().view.heights.slice();

interface Ground {
  heights: Uint8Array;
  depth: Float32Array;
  taken: Uint8Array;
  start: [number, number];
}

function groundNow(): Ground {
  const v = ed.sessionView();
  const start = (v.info.features.find((f) => f.kind === "start")?.params as { position: [number, number] } | undefined)?.position ?? [W / 2, W / 2];
  const depth = new Float32Array(W * W);
  for (let k = 0; k < v.view.water.count; k++) depth[v.view.water.tile[k]] = v.view.water.depth[k];
  const taken = new Uint8Array(W * W);
  const e = v.view.entities;
  for (let k = 0; k < e.count; k++) {
    const template = e.templates[e.template[k]];
    for (const [tx, ty] of footprintTiles(template, { template, x: e.x[k], y: e.y[k], z: 0, orientation: ORIENTATION_NAMES[e.orientation[k]] as Orientation, flipped: false })) if (tx >= 0 && ty >= 0 && tx < W && ty < W) taken[ty * W + tx] = 1;
  }
  return { heights: v.view.heights, depth, taken, start };
}

/** A spot where `tiles(x, y)` stands on dry, empty, uneven ground (a step of one or two levels
 *  across it), clear of the start; `nearWater`: with water within three tiles of it. */
function slopedSpot(g: Ground, tiles: (x: number, y: number) => [number, number][], nearWater: boolean): [number, number] {
  for (let y = 6; y < W - 6; y++)
    for (let x = 6; x < W - 6; x++) {
      if (Math.hypot(x - g.start[0], y - g.start[1]) < 14) continue;
      const own = tiles(x, y);
      const hs = own.map(([tx, ty]) => g.heights[ty * W + tx]);
      const spread = Math.max(...hs) - Math.min(...hs);
      if (spread < 1 || spread > 2) continue;
      let ok = true;
      let wet = false;
      for (let dy = -4; dy <= 4 && ok; dy++)
        for (let dx = -4; dx <= 4 && ok; dx++) {
          const i = (y + dy) * W + x + dx;
          const inside = own.some(([tx, ty]) => tx === x + dx && ty === y + dy);
          if (g.taken[i]) ok = false;
          if (inside && g.depth[i] > 0) ok = false;
          if (!inside && g.depth[i] > 0 && Math.abs(dx) <= 3 && Math.abs(dy) <= 3) wet = true;
        }
      if (ok && wet === nearWater) return [x, y];
    }
  throw new Error("no such spot");
}

async function fresh(seed = 4) {
  await runGenerate(makeSpec({ seed, theme: "riverValley", size: { x: W, y: W } }));
  ed.setEditorWaterMode("defer");
  ed.refine();
}

function place(template: string, x: number, y: number) {
  return ed.applyTool({ tool: "entity", template, x, y, orientation: "Cw0" }, "11111111-2222-4333-8444-555555555555");
}

const cover = (template: string) => (x: number, y: number) => footprintTiles(template, { template, x, y, z: 0, orientation: "Cw0", flipped: false });

describe("placed objects fit the land (D328)", () => {
  for (const template of ["UndergroundRuins", "LargeRelic", "GeothermalField", "SmallRelic"]) {
    it(`a ${template} placed on a slope cuts its own footprint level, in one undo step, and raises nothing`, async () => {
      await fresh();
      const g = groundNow();
      const [x, y] = slopedSpot(g, cover(template), false);
      const own = cover(template)(x, y).map(([tx, ty]) => ty * W + tx);
      const low = Math.min(...own.map((i) => g.heights[i]));
      const before = heightsNow();
      // the hover check says it fits (no "not level" any more)
      expect(ed.footprintCheck({ tool: "entity", template, x, y, orientation: "Cw0" }).problem).toBeNull();
      const n = steps();
      const r = place(template, x, y);
      expect(r.ok, JSON.stringify(r.errors)).toBe(true);
      expect(steps()).toBe(n + 1);
      const after = heightsNow();
      for (const i of own) expect(after[i], `tile ${i}`).toBe(low);
      // cut, never filled: nothing on the map is higher than it was
      for (let i = 0; i < after.length; i++) expect(after[i]).toBeLessThanOrEqual(before[i]);
      expect(ed.exportCheck().blocking.map((b) => b.message)).toEqual([]);
      // one undo puts the ground and the object back
      ed.undo();
      expect(steps()).toBe(n);
      expect([...heightsNow()]).toEqual([...before]);
    });
  }

  it("a ruin column placed on a slope stands there as it does on flat ground", async () => {
    await fresh();
    const g = groundNow();
    const [x, y] = slopedSpot(g, (a, b) => [[a, b], [a + 1, b]], false);
    const n = steps();
    expect(place("RuinColumnH3", x, y).ok).toBe(true);
    expect(steps()).toBe(n + 1);
  });

  it("beside water it raises no dam: the ground only goes down", async () => {
    await fresh();
    const template = "UndergroundRuins";
    const g = groundNow();
    const [x, y] = slopedSpot(g, cover(template), true);
    const before = heightsNow();
    const r = place(template, x, y);
    expect(r.ok, JSON.stringify(r.errors)).toBe(true);
    const after = heightsNow();
    let lowered = 0;
    for (let i = 0; i < after.length; i++) {
      expect(after[i]).toBeLessThanOrEqual(before[i]);
      if (after[i] < before[i]) lowered++;
    }
    expect(lowered).toBeGreaterThan(0);
  });

  it("still refuses at the map edge, and on another object, with one plain reason", async () => {
    await fresh();
    const edge = ed.footprintCheck({ tool: "entity", template: "UndergroundRuins", x: W - 2, y: 40, orientation: "Cw0" });
    expect(edge.problem).toMatch(/off the map|does not fit on the map/);
    const start = groundNow().start;
    const on = ed.footprintCheck({ tool: "entity", template: "LargeRelic", x: start[0], y: start[1], orientation: "Cw0" });
    expect(on.problem).toMatch(/district center|stands there/);
  });

  it("the Start of an opened map placed on a slope levels its footprint and door, in one step", async () => {
    await fresh();
    const saved = await ed.exportTimber(true);
    expect(saved.ok).toBe(true);
    ed.openTimber(saved.bytes, "Opened.timber");
    const g = groundNow();
    const o: Orientation = "Cw0";
    const at = (x: number, y: number): [number, number][] => {
      const [cx, cy] = cornerFor(x, y, o);
      const door = startEntranceTile(cx, cy, o);
      const t: [number, number][] = [];
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) t.push([x + dx, y + dy]);
      return [...t, [door[0], door[1]]];
    };
    const [x, y] = slopedSpot(g, at, false);
    const own = at(x, y).map(([tx, ty]) => ty * W + tx);
    const low = Math.min(...own.map((i) => g.heights[i]));
    const before = heightsNow();
    const n = steps();
    const r = ed.moveStartTo(x, y, o);
    expect(r.ok, JSON.stringify(r.errors)).toBe(true);
    expect(steps()).toBe(n + 1);
    const after = heightsNow();
    for (const i of own) expect(after[i]).toBe(low);
    for (let i = 0; i < after.length; i++) expect(after[i]).toBeLessThanOrEqual(before[i]);
    ed.undo();
    expect([...heightsNow()]).toEqual([...before]);
  });
});
