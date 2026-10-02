// Water never appears from nowhere (PLAN §20 D385; PERFECT.md: what you see is what you get). A pit
// dug on dry ground that no source's water and no water already there reaches stays dry on every
// path the editor's water takes: the instant answer (the last settled water on the new ground), the
// stroke's live water, the background settle's frames and its settled water, the canonical settle
// and the saved file. The cause was the canonical settle's pre-fill (sim/prefill.ts): its walk
// spreads level over flat ground in every direction, so a hollow on a dry plateau the walk crossed
// started full (and its thin start on the plateau drained into a hollow that started empty), and
// the simulation can't take water out of a closed hollow. Found on M9b's maps (tests/e2e/brushKit
// .spec.ts on seed 34, River Valley 96²: a 3 × 3 pit two levels deep filled with 1.86 of water a few
// seconds after the stroke); `tests/fixtures/m9b-river-valley-96-34.timber` is that map, saved by
// `feature/m9b`'s generator, so the check doesn't depend on the generator. Water that should be
// there still comes: a pit beside a river, or with a source in it, fills.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MapSession } from "../../src/core/doc/session";
import { readTimber } from "../../src/core/format/timber";
import { storedWater } from "../../src/core/format/world";
import { waterModel, type MapObject } from "../../src/core/sim/model";
import { canonicalSettle, prefill } from "../../src/core/sim/prefill";
import { PreviewJob, staleWater, type WarmState } from "../../src/core/sim/preview";
import type { WaterModel } from "../../src/core/sim/water";

/** Water deeper than this is water to the player (the hover readout's line). */
const WET = 0.001;

/** The deepest water on `tiles`. */
const deepest = (depth: ArrayLike<number>, tiles: readonly number[]) => Math.max(0, ...tiles.map((i) => depth[i]));

/** A background settle run to its end a few ticks at a time, as the editor's worker runs it: the
 *  deepest water on `tiles` in any frame, and the settled water. */
function journey(job: PreviewJob, tiles: readonly number[]) {
  let most = 0;
  let r = job.advance(4);
  while (!r) {
    most = Math.max(most, deepest(job.sim.D, tiles));
    r = job.advance(4);
  }
  return { most: Math.max(most, deepest(r.depth, tiles)), settled: r };
}

/** Every way the editor's water answers a dug pit (the cells of a 3 × 3 square at (x, y), lowered
 *  `amount` levels), the deepest water on the pit in each: the instant answer, the stroke's live
 *  water while it paints, the background settle from the stroke's water and from the last settled
 *  water (frames and the settled water), the canonical settle and the saved file. */
function digPit(s: MapSession, x: number, y: number, amount: number) {
  const W = s.size.x;
  const pit: number[] = [];
  const cells: [number, number, number][] = [];
  for (let yy = y - 1; yy <= y + 1; yy++) {
    cells.push([yy, x - 1, x + 1]);
    for (let xx = x - 1; xx <= x + 1; xx++) pit.push(yy * W + xx);
  }
  s.setWaterMode("defer");
  const before = s.lastSettled()!;
  expect(deepest(before.water.depth, pit), "the pit's ground is dry before the stroke").toBe(0);
  // the stroke's live water (worker/session.ts draftStroke): the water flows on as the ground moves
  const painting: WaterModel = { ...before.model, floor: before.model.floor.slice() };
  const draft = new PreviewJob(before, painting);
  draft.advance(16);
  for (const i of pit) painting.floor[i] -= amount;
  let live = 0;
  for (let t = 0; t < 240; t += 4) {
    draft.advance(4);
    live = Math.max(live, deepest(draft.sim.D, pit));
  }
  // the operation: the instant answer is the last settled water on the new ground
  expect(s.apply({ op: "sculpt", params: { mode: "lower", cells, amount } }).ok).toBe(true);
  expect(s.waterStale).toBe(true);
  const instant = deepest(s.built.water, pit);
  const model = s.built.waterModel;
  // the background settle (kickWater): from the stroke's water, and from the last settled water
  const fromDraft = journey(new PreviewJob(draft.state(), model), pit);
  const fromSettled = journey(new PreviewJob(before, model), pit);
  // the canonical settle, and the file
  s.settleCanonical();
  expect(s.waterPending).toBe(false);
  const canonical = deepest(s.built.water, pit);
  const file = readTimber(s.exportTimber().bytes);
  const stored = storedWater(file.world.singletons, W, s.size.y);
  let saved = 0;
  for (let k = 0; k < stored.tile.length; k++) if (pit.includes(stored.tile[k])) saved = Math.max(saved, stored.depth[k]);
  return { pit, instant, live, fromDraft: fromDraft.most, fromSettled: fromSettled.most, canonical, saved };
}

describe("a pit dug where no water reaches stays dry (D385)", () => {
  it("M9b's River Valley 96² seed 34 (brushKit's old seed): the pit on the dry plateau at (41, 11), two levels deep, holds no water on any path", () => {
    const s = MapSession.importMap(new Uint8Array(readFileSync("tests/fixtures/m9b-river-valley-96-34.timber")), "m9b-river-valley-96-34.timber");
    const W = s.size.x;
    // the plateau at level 4, dry for three tiles all round, as the browser spec picked it
    for (let dy = -3; dy <= 3; dy++)
      for (let dx = -3; dx <= 3; dx++) {
        const i = (11 + dy) * W + 41 + dx;
        expect(s.built.heights[i]).toBe(4);
        expect(s.built.water[i]).toBe(0);
      }
    const r = digPit(s, 41, 11, 2);
    expect(s.built.heights[11 * W + 41]).toBe(2);
    // (the pre-fill's walk does reach the pit: the cause, kept in view)
    expect(prefill(s.built.waterModel).depth[11 * W + 41]).toBe(2);
    expect(r.instant).toBe(0);
    expect(r.live).toBeLessThan(WET);
    expect(r.fromDraft).toBeLessThan(WET);
    expect(r.fromSettled).toBeLessThan(WET);
    expect(r.canonical).toBe(0);
    expect(r.saved).toBe(0);
  });
});

// a synthetic map, independent of any generator: a hill at level 8 (x < 6) with a spring's channel at
// level 6 (y 9–11) dropping onto the plateau's lip (x 6, level 4) and on into a gorge at level 2
// (y 9–11, x ≥ 7) that leaves by the east edge; the rest of the plateau, at level 4, is dry
const W = 40;
const H = 24;
function plateau(): Uint8Array {
  const h = new Uint8Array(W * H).fill(4);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const gorge = y >= 9 && y <= 11;
      if (x < 6) h[y * W + x] = gorge ? 6 : 8;
      else if (x >= 7 && gorge) h[y * W + x] = 2;
    }
  return h;
}
function spring(x: number, y: number, z: number, strength: number): MapObject {
  return { template: "WaterSource", x, y, z, orientation: "Cw0", flipped: false, components: { WaterSource: { SpecifiedStrength: strength } } as MapObject["components"] };
}
const square = (x: number, y: number) => {
  const out: number[] = [];
  for (let yy = y - 1; yy <= y + 1; yy++) for (let xx = x - 1; xx <= x + 1; xx++) out.push(yy * W + xx);
  return out;
};
/** The water paths of the core (no session): the instant answer, the background settle from the
 *  settled water (its frames and its end) and the canonical settle, after `edit` changes the ground. */
function paths(objects: MapObject[], edit: (h: Uint8Array) => void, tiles: readonly number[]) {
  const h = plateau();
  const m0 = waterModel(W, H, h, objects);
  const from: WarmState = { model: m0, water: canonicalSettle(m0) };
  const h1 = h.slice();
  edit(h1);
  const m1 = waterModel(W, H, h1, objects);
  const instant = deepest(staleWater(from, m1).depth, tiles);
  const job = journey(new PreviewJob(from, m1), tiles);
  const canonical = canonicalSettle(m1);
  return { from, instant, frames: job.most, settled: deepest(job.settled.depth, tiles), canonical: deepest(canonical.depth, tiles), canonicalWater: canonical };
}

describe("water from nowhere, on a synthetic dry plateau (D385)", () => {
  const sources = [spring(1, 10, 6, 1.5)];
  const pit = square(25, 4);
  const dig = (h: Uint8Array) => {
    for (const i of pit) h[i] = 2;
  };

  it("the plateau is dry, but the pre-fill's walk spreads over all of it and fills a pit dug there", () => {
    const h = plateau();
    const m0 = waterModel(W, H, h, sources);
    const c0 = canonicalSettle(m0);
    for (let y = 0; y < 8; y++) for (let x = 8; x < W; x++) expect(c0.depth[y * W + x], `(${x}, ${y})`).toBe(0);
    const h1 = h.slice();
    dig(h1);
    expect(prefill(waterModel(W, H, h1, sources)).depth[4 * W + 25]).toBe(2);
  });

  it("a pit dug on it stays dry: the instant answer, the background settle's frames and its end, the canonical settle", () => {
    const r = paths(sources, dig, pit);
    expect(r.instant).toBe(0);
    expect(r.frames).toBeLessThan(WET);
    expect(r.settled).toBeLessThan(WET);
    expect(r.canonical).toBe(0);
    // and nothing else changed: the water off the pit is the dry plateau's
    for (let i = 0; i < W * H; i++) if (!pit.includes(i)) expect(Math.abs(r.canonicalWater.depth[i] - r.from.water.depth[i]), `tile ${i}`).toBeLessThan(0.01);
  });

  it("a pit dug beside the gorge, below its water, fills: in the background settle and in the canonical settle", () => {
    // (x 9–11, y 6–8, down to level 1: beside the gorge, its floor below the gorge's water)
    const beside = square(10, 7);
    const r = paths(
      sources,
      (h) => {
        for (const i of beside) h[i] = 1;
      },
      beside,
    );
    expect(r.settled).toBeGreaterThan(0.5);
    expect(r.canonical).toBeGreaterThan(0.5);
  });

  it("a pit with a spring in it fills, on the dry plateau", () => {
    const fed = [...sources, spring(25, 4, 2, 0.5)];
    const r = paths(fed, dig, pit);
    expect(r.settled).toBeGreaterThan(0.5);
    expect(r.canonical).toBeGreaterThan(0.5);
  });

  it("a hollow a stored lake (a carve's oxbow) fills keeps its water", () => {
    const h = plateau();
    dig(h);
    const lake = { tiles: pit.slice().sort((a, b) => a - b), floor: pit.map(() => 2), depth: pit.map(() => 1.5), contamination: pit.map(() => 0) };
    const m: WaterModel = { ...waterModel(W, H, h, sources), retained: [lake] };
    expect(deepest(canonicalSettle(m).depth, pit)).toBeGreaterThan(1.2);
  });
});
