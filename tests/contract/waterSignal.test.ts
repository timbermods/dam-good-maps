// The hover readout refreshes whenever the water under the pointer changes, without re-hovering (PLAN
// §20 D347, D387 (1)): `readoutWater` gives the readout's water words for a tile, so the page asks it
// again after each water state it shows and re-describes the tile only when the words differ. Here
// every path that changes the water a page shows: opening a map, the live water's frames, the settled
// water, the weather's days, an edit's answer, undo and redo. Each fires on a tile whose water
// changed, not on tiles whose water changed less than the readout shows, and `describeTile` then
// gives the new words.

import { describe, expect, it } from "vitest";
import { describeTile, readoutWater, readoutWaterChanged, tileWords, type TileFacts } from "../../src/core/doc/describeTile";
import { makeSpec } from "../../src/core/spec/mapspec";
import { surfaceWater, type MapView, type SoilView, type SurfaceWater, type WaterView } from "../../src/render3d/model";
import { runGenerate } from "../../src/worker/api";
import * as ed from "../../src/worker/session";

const W = 96;
const SRC = "d3870000-0000-4000-8000-000000000001";

/** The page's copy of the map, as it keeps it (Editor.tsx's mirror): each water state it shows
 *  becomes the hover readout's facts. */
class Mirror {
  heights!: Uint8Array;
  water!: SurfaceWater;
  soil: SoilView | null = null;
  open(v: MapView) {
    this.heights = v.heights;
    this.water = surfaceWater(W, W, v.water);
    this.soil = v.soil ?? null;
  }
  view(v: ed.ViewUpdate) {
    if (v.heights) this.heights = v.heights;
    if (v.water) this.water = surfaceWater(W, W, v.water);
    if (v.soil) this.soil = v.soil;
  }
  frame(w: WaterView, soil?: SoilView) {
    this.water = surfaceWater(W, W, w);
    if (soil) this.soil = soil;
  }
  /** The facts as they stand now (a snapshot: later states don't change it). */
  facts(): TileFacts {
    const { heights, water: w, soil } = this;
    return {
      W,
      H: W,
      height: (i) => heights[i],
      water: (i) => (w.surface[i] === w.surface[i] && w.depth[i] > 0.001 ? { depth: w.depth[i], contamination: w.contamination[i] } : null),
      soil: (i) => (soil ? (soil.contamination[i] > 0 ? "contaminated" : soil.moisture[i] > 0 ? "moist" : "dry") : null),
      objects: () => [],
    };
  }
}

/** (the worker's loop yields through a message channel: wait by polling, not on a timer) */
async function until(done: () => boolean, ms: number) {
  const end = performance.now() + ms;
  while (!done() && performance.now() < end) await new Promise((r) => setImmediate(r));
  expect(done(), "the worker's news came").toBe(true);
}

const at = (i: number): [number, number] => [i % W, Math.floor(i / W)];
const words = (f: TileFacts, i: number) => readoutWater(f, ...at(i));

/** The signal fires on tile i between two states, and the readout then gives the new state's words. */
function fires(before: TileFacts, after: TileFacts, i: number, what: string) {
  expect(readoutWaterChanged(before, after, ...at(i)), `${what}: ${words(before, i)} → ${words(after, i)}`).toBe(true);
  const text = tileWords(describeTile(after, ...at(i)));
  expect(text, what).toBe(words(after, i));
  expect(text, what).not.toBe(tileWords(describeTile(before, ...at(i))));
}

/** The signal fires on some tiles between two states (the last moves, the soil), each giving the new words. */
function firesSomewhere(before: TileFacts, after: TileFacts, what: string) {
  const changed: number[] = [];
  for (let i = 0; i < W * W; i++) if (readoutWaterChanged(before, after, ...at(i))) changed.push(i);
  expect(changed.length, what).toBeGreaterThan(0);
  for (const i of changed.slice(0, 20)) fires(before, after, i, what);
}

/** Tiles whose water changed between two states without the readout's words changing: the signal
 *  stays quiet there, and the readout would say the same. */
function quietWhereWordsStay(before: TileFacts, after: TileFacts): number {
  let n = 0;
  for (let i = 0; i < W * W; i++) {
    const a = before.water(i);
    const b = after.water(i);
    if (!a || !b || a.depth === b.depth) continue;
    if (readoutWaterChanged(before, after, ...at(i))) continue;
    expect(tileWords(describeTile(after, ...at(i)))).toBe(tileWords(describeTile(before, ...at(i))));
    n++;
  }
  return n;
}

describe("the water-changed signal for the hover readout (D347, D387 (1))", () => {
  it("fires only when the words would change: depth as rounded, badwater as shown, the soil once dry", () => {
    const one = (water: { depth: number; contamination: number } | null, soil: "moist" | "dry" = "moist"): TileFacts => ({ W: 1, H: 1, height: () => 4, water: () => water, soil: () => soil, objects: () => [] });
    const same = (a: TileFacts, b: TileFacts) => !readoutWaterChanged(a, b, 0, 0);
    expect(same(one({ depth: 0.61, contamination: 0 }), one({ depth: 0.64, contamination: 0 }))).toBe(true);
    expect(same(one({ depth: 0.64, contamination: 0 }), one({ depth: 0.66, contamination: 0 }))).toBe(false);
    expect(same(one({ depth: 0.051, contamination: 0 }), one({ depth: 0.054, contamination: 0 }))).toBe(true);
    expect(same(one({ depth: 0.051, contamination: 0 }), one({ depth: 0.056, contamination: 0 }))).toBe(false);
    expect(same(one({ depth: 1, contamination: 0.301 }), one({ depth: 1, contamination: 0.304 }))).toBe(true);
    expect(same(one({ depth: 1, contamination: 0.3 }), one({ depth: 1, contamination: 0.32 }))).toBe(false);
    expect(same(one({ depth: 1, contamination: 0.01 }), one({ depth: 1, contamination: 0.04 }))).toBe(true);
    expect(same(one({ depth: 1, contamination: 0.96 }), one({ depth: 1, contamination: 1 }))).toBe(true);
    expect(same(one({ depth: 1, contamination: 0 }), one(null))).toBe(false);
    expect(same(one(null, "moist"), one(null, "dry"))).toBe(false);
    expect(same(one(null, "dry"), one(null, "dry"))).toBe(true);
    expect(readoutWater(one(null), 1, 0)).toBeNull();
  });

  it("every path that changes the water fires on a tile it changed", async () => {
    // (seed 2 on M9b's maps, D148: seed 3's River Valley has no dry, flat spot 9 tiles clear of the
    // water for the source the test places)
    await runGenerate(makeSpec({ seed: 2, theme: "riverValley", size: { x: W, y: W } }));
    ed.setAutoWater(false);
    const m = new Mirror();
    m.open(ed.refine().view);
    const first = m.facts();

    // a clean, deep water tile on ground that can be lowered, and a dry flat spot far from water
    const inside = (i: number, d: number) => at(i)[0] >= d && at(i)[1] >= d && at(i)[0] < W - d && at(i)[1] < W - d;
    let deep = -1;
    for (let i = 0; i < W * W && deep < 0; i++) {
      const w = first.water(i);
      if (inside(i, 12) && w && w.depth > 0.5 && w.contamination === 0 && first.height(i) >= 3) deep = i;
    }
    const around = (i: number, r: number, ok: (j: number) => boolean) => {
      const [x, y] = at(i);
      for (let yy = y - r; yy <= y + r; yy++) for (let xx = x - r; xx <= x + r; xx++) if (!ok(yy * W + xx)) return false;
      return true;
    };
    let spot = -1;
    for (let i = 0; i < W * W && spot < 0; i++) {
      const h = first.height(i);
      if (inside(i, 12) && h >= 5 && around(i, 9, (j) => first.water(j) === null) && around(i, 3, (j) => first.height(j) === h)) spot = i;
    }
    expect(deep, "a deep water tile").toBeGreaterThanOrEqual(0);
    expect(spot, "a dry spot for a source").toBeGreaterThanOrEqual(0);
    const [sx, sy] = at(spot);

    // a source on dry ground: the live water's frames, then the settled water (the worker's own loop)
    const frames: TileFacts[] = [];
    let settled: TileFacts | null = null;
    ed.listen((e) => {
      if (e.kind === "water" && !e.draft) {
        m.frame(e.water);
        frames.push(m.facts());
      } else if (e.kind === "settled") {
        m.view(e.view);
        settled = m.facts();
      }
    });
    ed.setAutoWater(true);
    const placedUpdate = ed.apply({ op: "placeEntity", params: { id: SRC, template: "WaterSource", x: sx, y: sy, orientation: "Cw0", components: { WaterSource: { SpecifiedStrength: 4, CurrentStrength: 4 } } } });
    expect(placedUpdate.errors).toEqual([]);
    m.view(placedUpdate.view);
    const placed = m.facts();
    await until(() => settled !== null, 60_000);
    ed.listen(null);
    ed.setAutoWater(false);
    // the live water's frames: the source's water rises on its tile; tiles whose depth moves by less
    // than the readout shows stay quiet
    expect(frames.length).toBeGreaterThan(2);
    fires(placed, frames[0], spot, "the live water's first frame");
    let quiet = 0;
    for (let k = 1; k < frames.length; k++) quiet += quietWhereWordsStay(frames[k - 1], frames[k]);
    expect(quiet, "tiles whose water moved less than the readout shows").toBeGreaterThan(0);
    // the settled water: its soil and last moves after the last frame
    firesSomewhere(frames[frames.length - 1], settled!, "the settled water");
    fires(placed, settled!, spot, "the settled water, after the edit's answer");

    // the weather's days, held (Kyler, 2026-10-04): a drought's last day has the source's water drained; Day 0 is the
    // map's own water again
    let shown: TileFacts | null = null;
    ed.listen((e) => {
      if (e.kind !== "weather" || e.phase !== "day" || !e.water) return;
      m.frame(e.water, e.soil);
      shown = m.facts();
    });
    const day = async (d: number | null): Promise<TileFacts> => {
      shown = null;
      ed.showWeatherDay("drought", d);
      await until(() => shown !== null, 120_000);
      return shown!;
    };
    const last = await day(null);
    expect(readoutWaterChanged(settled!, last, sx, sy), "the drought's last day changes the source's water").toBe(true);
    fires(settled!, last, spot, "a day of the drought");
    const end = await day(0);
    ed.listen(null);
    ed.stopWeather();
    expect(words(end, spot)).toBe(words(settled!, spot));
    firesSomewhere(last, end, "the weather's end");

    // an edit's answer: ground lowered under the water keeps its surface, so the water is deeper at once
    const [dx, dy] = at(deep);
    const cells: [number, number, number][] = [];
    for (let y = dy - 1; y <= dy + 1; y++) cells.push([y, dx - 1, dx + 1]);
    const lowered = ed.apply({ op: "sculpt", params: { mode: "lower", cells, amount: 2 } });
    expect(lowered.ok).toBe(true);
    m.view(lowered.view);
    const edited = m.facts();
    fires(end!, edited, deep, "an edit's answer");
    m.view(ed.settleWater());
    const editSettled = m.facts();

    // undo's answer: the ground comes back up under the water at once; redo's lowers it again
    m.view(ed.undo().view);
    const undone = m.facts();
    fires(editSettled, undone, deep, "undo");
    m.view(ed.settleWater());
    const undoSettled = m.facts();
    const saved = ed.project().bytes;
    m.view(ed.redo().view);
    const redone = m.facts();
    fires(undoSettled, redone, deep, "redo");
    m.view(ed.settleWater());
    const redoSettled = m.facts();

    // opening a map: the project saved before the redo, opened over the map after it
    m.open(ed.openProject(saved).view);
    const reopened = m.facts();
    fires(redoSettled, reopened, deep, "opening a map");
    // (saved before its canonical water, it opens on its saved base water; the canonical water follows)
    const canonical = await ed.backgroundCheck();
    if (canonical?.view) m.view(canonical.view);
    expect(words(m.facts(), deep)).toBe(words(undoSettled, deep));
  }, 300_000);
});
