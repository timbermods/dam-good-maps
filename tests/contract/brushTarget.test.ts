// The brushes as the game's editor has them (D322): a target level (item 37), the Ground, Water and
// Both modes (item 2), kept sources (item 31) and sizes up to half the map (item 42), in the stroke
// the build replays.
// - Raise lifts every tile under it below the target to it and leaves the rest (a relative raise);
//   Lower cuts every tile above it down to it; Flatten sets every tile to it. Exact, with the brush's
//   footprint and hard edges; holding adds nothing; the integrity pass leaves a one-tile pit a pit.
// - Ground changes only the tiles dry at the start and never lowers a bank below its water's
//   surface; Water only the wet ones.
// - Keep leaves the sources' ground exactly as it was, a pillar if the land round it goes.

import Ajv2020 from "ajv/dist/2020";
import { describe, expect, it } from "vitest";
import opsSchema from "../../src/core/doc/ops.schema.json" with { type: "json" };
import { decodeProject } from "../../src/core/doc/document";
import { MapSession } from "../../src/core/doc/session";
import { applyBrush, brushProblems, BRUSH_SIZE_MAX, type BrushParams } from "../../src/core/features/raster/brush";
import { StrokePreview } from "../../src/core/features/raster/strokePreview";
import { generate } from "../../src/core/gen/generate";
import { makeSpec } from "../../src/core/spec/mapspec";

const N = 32;
/** A slope rising a level every four tiles eastward, from level 4. */
function slope(): Uint8Array {
  const t = new Uint8Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) t[y * N + x] = 4 + Math.floor(x / 4);
  return t;
}
const at = (x: number, y: number) => [4 * x + 2, 4 * y + 2];
/** The tiles a size-`r` exact brush at (cx, cy) covers (the precise reach, round). */
const under = (cx: number, cy: number, r: number) => (x: number, y: number) => (4 * (x - cx)) ** 2 + (4 * (y - cy)) ** 2 <= (Math.round(r * 4) - 2) ** 2;

describe("a target: Raise, Lower and Flatten as the game's editor (D322, item 37)", () => {
  it("Raise lifts only what is below the target to it; Lower cuts only what is above it; Flatten sets all; hard edges", () => {
    const t0 = slope();
    const inside = under(16, 16, 5);
    for (const [tool, target] of [["raise", 8], ["lower", 6], ["flatten", 7]] as const) {
      const t = t0.slice();
      applyBrush({ tool, size: 5, strength: 5, target, dabs: at(16, 16) }, t, N, N);
      for (let y = 0; y < N; y++)
        for (let x = 0; x < N; x++) {
          const h0 = t0[y * N + x];
          const want = !inside(x, y) ? h0 : tool === "raise" ? Math.max(h0, target) : tool === "lower" ? Math.min(h0, target) : target;
          expect(t[y * N + x], `${tool} (${x}, ${y})`).toBe(want);
        }
    }
  });

  it("holding still adds nothing, and the dabs' order doesn't matter", () => {
    const a = slope();
    const b = slope();
    applyBrush({ tool: "raise", size: 3, strength: 10, target: 9, dabs: at(10, 10) }, a, N, N);
    applyBrush({ tool: "raise", size: 3, strength: 10, target: 9, dabs: [...at(10, 10), ...at(10, 10), ...at(10, 10), ...at(10, 10)] }, b, N, N);
    expect(Array.from(b)).toEqual(Array.from(a));
  });

  it("Flatten in steps benches from the target", () => {
    const t = slope();
    applyBrush({ tool: "flatten", size: 12, strength: 5, target: 6, steps: 2, dabs: at(16, 16) }, t, N, N);
    for (let x = 6; x < 26; x++) expect((t[16 * N + x] - 6) % 2).toBe(0);
  });

  it("a one-tile pit stays a pit through the build; the page paints what the build makes", () => {
    const r = generate(makeSpec({ seed: 3, theme: "riverValley", size: { x: 96, y: 96 } }));
    const s = MapSession.fromGenerated(r, r.file);
    const b = s.built;
    let spot = -1;
    for (let i = 20 * 96 + 20; i < 76 * 96 && spot < 0; i++) {
      const x = i % 96;
      if (x < 20 || x > 76 || b.water[i] > 0 || b.channel[i] || b.heights[i] < 4) continue;
      let flat = true;
      for (let dy = -2; dy <= 2 && flat; dy++) for (let dx = -2; dx <= 2 && flat; dx++) if (b.heights[i + dy * 96 + dx] !== b.heights[i] || b.water[i + dy * 96 + dx] > 0) flat = false;
      if (flat) spot = i;
    }
    expect(spot).toBeGreaterThan(0);
    const x = spot % 96;
    const y = Math.floor(spot / 96);
    const p: BrushParams = { tool: "lower", size: 1, strength: 5, target: b.heights[spot] - 3, dabs: at(x, y) };
    const shown = b.heights.slice();
    const { dabs, ...settings } = p;
    new StrokePreview(settings, s.terrainState(), shown, 96, 96).add(dabs);
    expect(s.apply({ op: "brush", params: p }).errors).toEqual([]);
    expect(s.built.heights[spot]).toBe(b.heights[spot] - 3);
    expect(Array.from(shown)).toEqual(Array.from(s.built.heights));
    expect(Array.from(MapSession.open(decodeProject(s.project())).built.heights)).toEqual(Array.from(s.built.heights));
  });
});

describe("Ground, Water and Both (D322, item 2)", () => {
  // a river two tiles wide along y = 10..11 at level 3, its surface at 4.6; the land at 6
  function land(): Uint8Array {
    const t = new Uint8Array(N * N).fill(6);
    for (let x = 0; x < N; x++) for (const y of [10, 11]) t[y * N + x] = 3;
    return t;
  }
  const wet: [number, number, number][] = [[10, 0, N - 1], [11, 0, N - 1]];
  const bank: [number, number, number, number][] = [[9, 0, N - 1, 5], [12, 0, N - 1, 5]];

  it("Ground lowers only the dry land, never a bank below its water's surface; the bed stays", () => {
    const t = land();
    applyBrush({ tool: "lower", size: 6, strength: 5, target: 2, mode: "ground", wet, bank, dabs: at(16, 11) }, t, N, N);
    expect(t[10 * N + 16]).toBe(3);
    expect(t[11 * N + 16]).toBe(3);
    expect(t[9 * N + 16]).toBe(5);
    expect(t[12 * N + 16]).toBe(5);
    expect(t[14 * N + 16]).toBe(2);
    // soft, too (Free): the banks hold
    const u = land();
    applyBrush({ tool: "lower", size: 6, strength: 10, mode: "ground", wet, bank, dabs: [...at(16, 11), ...at(16, 11), ...at(16, 11), ...at(16, 11), ...at(16, 11), ...at(16, 11)] }, u, N, N);
    expect(u[9 * N + 16]).toBeGreaterThanOrEqual(5);
    expect(u[10 * N + 16]).toBe(3);
  });

  it("Water reshapes only the bed; Both everything", () => {
    const t = land();
    applyBrush({ tool: "flatten", size: 6, strength: 5, target: 1, mode: "water", wet, dabs: at(16, 11) }, t, N, N);
    expect(t[10 * N + 16]).toBe(1);
    expect(t[9 * N + 16]).toBe(6);
    const u = land();
    applyBrush({ tool: "flatten", size: 6, strength: 5, target: 1, dabs: at(16, 11) }, u, N, N);
    expect(u[9 * N + 16]).toBe(1);
  });
});

describe("the record (D322)", () => {
  it("targets, modes, kept sources and the larger sizes are valid; the rest refused", () => {
    const base: BrushParams = { tool: "raise", size: 3, strength: 5, dabs: [40, 40] };
    const ajv = new Ajv2020({ strict: false });
    const check = ajv.compile(opsSchema);
    const good: BrushParams[] = [
      { ...base, target: 7 },
      { ...base, tool: "flatten", target: 0 },
      { ...base, mode: "ground", wet: [[1, 2, 3]], bank: [[0, 2, 3, 5]] },
      { ...base, mode: "water", wet: [[1, 2, 3]] },
      { ...base, sources: "keep", keep: [[10, 10, 10]] },
      { ...base, size: BRUSH_SIZE_MAX },
    ];
    for (const p of good) {
      expect(brushProblems(p, 256, 256), JSON.stringify(p)).toEqual([]);
      expect(check({ op: "brush", params: p }), JSON.stringify(p)).toBe(true);
    }
    const bad: BrushParams[] = [
      { ...base, tool: "smooth", target: 7 },
      { ...base, target: 23 },
      { ...base, target: 7, precise: true },
      { ...base, wet: [[1, 2, 3]] },
      { ...base, mode: "water", bank: [[0, 2, 3, 5]] },
      { ...base, sources: "keep" },
      { ...base, size: BRUSH_SIZE_MAX + 1 },
    ];
    for (const p of bad) expect(brushProblems(p, 256, 256), JSON.stringify(p)).not.toEqual([]);
  });

  it("a kept source's ground stays exactly, a pillar if the land round it goes", () => {
    const r = generate(makeSpec({ seed: 3, theme: "riverValley", size: { x: 96, y: 96 } }));
    const s = MapSession.fromGenerated(r, r.file);
    const b = s.built;
    let spot = -1;
    for (let i = 20 * 96 + 20; i < 76 * 96 && spot < 0; i++) {
      const x = i % 96;
      if (x < 20 || x > 76 || b.water[i] > 0 || b.channel[i] || b.heights[i] < 6) continue;
      let ok = true;
      for (let dy = -4; dy <= 4 && ok; dy++) for (let dx = -4; dx <= 4 && ok; dx++) if (b.water[i + dy * 96 + dx] > 0 || b.channel[i + dy * 96 + dx]) ok = false;
      if (ok) spot = i;
    }
    const x = spot % 96;
    const y = Math.floor(spot / 96);
    const h = b.heights[spot];
    const p: BrushParams = { tool: "lower", size: 3, strength: 5, target: h - 3, sources: "keep", keep: [[y, x, x]], dabs: at(x, y) };
    expect(s.apply({ op: "brush", params: p }).errors).toEqual([]);
    expect(s.built.heights[spot]).toBe(h);
    expect(s.built.heights[spot + 1]).toBe(h - 3);
    expect(Array.from(MapSession.open(decodeProject(s.project())).built.heights)).toEqual(Array.from(s.built.heights));
  });
});
