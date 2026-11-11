// Naturalize roughens a cut bank (D399, showcase-craft gap 12): a stroke along a straight outlet cut with
// Flatten slumps its banks into irregular ones, and the water still flows out.
// - The gap as it was: rule 5 kept a bank standing in water, and moist ground, exactly as they were, so
//   one stroke (Size 4, Strength 5) along both banks changed almost nothing (6 tiles on the showcase map).
// - Rule 6 slumps them: many tiles come down, and where the bank's top stands back from the water varies
//   along it (here a cut face, there slumped back in steps), not ruler-straight.
// - Nothing comes down below the water's surface, nothing in the channel rises, the water settled again
//   still flows out at the map's edge, and no moist tile dries (the game's soil rules on the water as it
//   settles again).

import { describe, expect, it } from "vitest";
import { BrushStroke, type BrushParams } from "../../src/core/features/raster/brush";
import { waterLevels } from "../../src/core/features/raster/weather";
import { StrokePreview, type TerrainState } from "../../src/core/features/raster/strokePreview";
import { waterModel, type MapObject } from "../../src/core/sim/model";
import { canonicalSettle } from "../../src/core/sim/prefill";
import { gameSoil } from "../../src/core/sim/soil";

const W = 64;
const N = W * W;
const PLAIN = 14;
const BED = 11;
/** The outlet: rows 30–34, from x 10 to the map's east edge, as a Flatten stroke cuts one. */
const Y0 = 30;
const Y1 = 34;
const X0 = 10;

const source: MapObject = { template: "WaterSource", x: 12, y: 32, z: BED, orientation: "Cw0", flipped: false, components: { WaterSource: { SpecifiedStrength: 1 } } as MapObject["components"] };

function ground(): Uint8Array {
  const h = new Uint8Array(N).fill(PLAIN);
  for (let y = Y0; y <= Y1; y++) for (let x = X0; x < W; x++) h[y * W + x] = BED;
  return h;
}

const settle = (h: Uint8Array) => canonicalSettle(waterModel(W, W, h, [source])).depth;
const soil = (h: Uint8Array, depth: ArrayLike<number>) => gameSoil(W, W, h, depth, new Float64Array(N), [source]).moisture;

/** One Naturalize stroke as the page paints it (dabs a fifth of the brush apart), east along the north
 *  bank and back west along the south bank, a tile in from the water, on `h` (changed in place). Returns
 *  its settings as the page hands them to the session. With `weathering` 5, the stroke as rule 5 weathered
 *  it (the page writes a new stroke's rule itself, so that one is made as the session replays one). */
function naturalize(h: Uint8Array, depth: ArrayLike<number>, moisture: ArrayLike<number>, weathering?: 5): Omit<BrushParams, "dabs"> {
  const size = 4;
  const dabs: number[] = [];
  for (let x = 18; x <= 56; x += size * 0.2) dabs.push(Math.round(4 * x), 4 * (Y0 - 1));
  for (let x = 56; x >= 18; x -= size * 0.2) dabs.push(Math.round(4 * x), 4 * (Y1 + 2));
  if (weathering) {
    const settings: Omit<BrushParams, "dabs"> = { tool: "naturalize", size, strength: 5, seed: 7, weathers: true, weathering };
    const stroke = new BrushStroke(settings, h, W, W, () => true, { water: waterLevels(h, W, W), depth, shown: h.slice(), moisture, record: () => {} });
    stroke.add(dabs);
    return settings;
  }
  const state: TerrainState = { field: null, top: 64, pre: h.slice(), protect: new Uint8Array(N), channel: new Uint8Array(N), base: null, locked: null, columns: new Int32Array(0), water: Float64Array.from(depth), moisture: Float64Array.from(moisture) };
  const settings: Omit<BrushParams, "dabs"> = { tool: "naturalize", size, strength: 5, seed: 7, weathers: true };
  const preview = new StrokePreview(settings, state, h, W, W);
  preview.add(dabs);
  return settings;
}

/** How far back from the water each column's bank top stands (the first tile at the plain's level),
 *  along the stroke, on the north bank and the south. */
function tops(h: Uint8Array): { north: number[]; south: number[] } {
  const north: number[] = [];
  const south: number[] = [];
  for (let x = 22; x <= 52; x++) {
    let n = 1;
    while (n < 12 && h[(Y0 - n) * W + x] < PLAIN) n++;
    let s = 1;
    while (s < 12 && h[(Y1 + s) * W + x] < PLAIN) s++;
    north.push(n);
    south.push(s);
  }
  return { north, south };
}

const wiggles = (a: number[]) => a.reduce((c, v, i) => c + (i && v !== a[i - 1] ? 1 : 0), 0);

describe("Naturalize roughens a cut bank (D399, gap 12)", () => {
  const h0 = ground();
  const depth0 = settle(h0);
  const moist0 = soil(h0, depth0);
  const outflow = (d: ArrayLike<number>) => {
    let s = 0;
    for (let y = Y0; y <= Y1; y++) s += d[y * W + W - 1];
    return s;
  };

  it("the outlet holds water that flows out at the map's edge, with moist banks", () => {
    expect(outflow(depth0)).toBeGreaterThan(0.2);
    expect(moist0[(Y0 - 1) * W + 30]).toBeGreaterThan(0);
  });

  it("rule 5 (the gap as it was): the banks stay as they were", () => {
    const h = h0.slice();
    naturalize(h, depth0, moist0, 5);
    let changed = 0;
    for (let i = 0; i < N; i++) if (h[i] !== h0[i]) changed++;
    expect(changed, "tiles rule 5 changes").toBeLessThan(10);
  });

  it("one stroke along the banks slumps them into irregular ones, and the water still flows out", () => {
    const h = h0.slice();
    const settings = naturalize(h, depth0, moist0);
    expect(settings, "a new stroke records its rule, and the water's wells").toMatchObject({ weathering: 6, wells: expect.any(Array) });
    let changed = 0;
    const bad: string[] = [];
    for (let i = 0; i < N; i++) {
      if (h[i] === h0[i]) continue;
      changed++;
      const at = `(${i % W}, ${Math.floor(i / W)})`;
      if (h[i] > h0[i]) bad.push(`${at} rose ${h0[i]} → ${h[i]}`);
      if (depth0[i] > 1e-3) bad.push(`${at} in the water changed ${h0[i]} → ${h[i]}`);
      // (no lower than the water's surface beside it)
      for (const j of [i - 1, i + 1, i - W, i + W]) if (depth0[j] > 1e-3 && h[i] < h0[j] + depth0[j]) bad.push(`${at} came down to ${h[i]}, under the water beside it`);
    }
    expect(bad).toEqual([]);
    const t = tops(h);
    console.log(`rule 6: ${changed} tiles changed; the bank tops stand back north ${t.north.join("")}, south ${t.south.join("")}`);
    expect(changed, "tiles the stroke changes").toBeGreaterThan(80);
    // irregular: along each bank its top stands back by several distances, changing often
    for (const [side, a] of Object.entries(t)) {
      expect(new Set(a).size, `${side} bank: distinct set-backs`).toBeGreaterThanOrEqual(3);
      expect(wiggles(a), `${side} bank: changes of set-back along it`).toBeGreaterThanOrEqual(6);
    }
    // the water, settled again on the new land, still flows out, and no moist tile dries
    const depth1 = settle(h);
    expect(outflow(depth1), "water at the outlet's mouth").toBeGreaterThan(0.5 * outflow(depth0));
    const moist1 = soil(h, depth1);
    const dried: string[] = [];
    for (let i = 0; i < N; i++) if (moist0[i] > 0 && !(moist1[i] > 0)) dried.push(`(${i % W}, ${Math.floor(i / W)}) ${h0[i]} → ${h[i]}`);
    expect(dried).toEqual([]);
  });
});
