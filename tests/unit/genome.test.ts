// The genome (M9a, docs/m9-design.md §3; src/core/land/genome.ts): drawn from a theme's prior, or
// from "Any" (D208, D209), deterministically, with Verticality's heights above 16 from 70 (D172).

import { describe, expect, it } from "vitest";
import { drawGenome, EDITOR_TOP, GAME_TOP, LEANINGS, leanGenome, ownScaleFor, VT_HIGH, tallTop, type Genome } from "../../src/core/land/genome";
import { ACTIVE, drawIntentions, clashes } from "../../src/core/land/intentions";
import { stream } from "../../src/core/math/rng";
import { makeSpec, VT_DEFAULT } from "../../src/core/spec/mapspec";

const THEMES = ["any", ...LEANINGS] as const;

describe("the genome", () => {
  it("is a pure function of theme, seed, size, attempt and options", () => {
    for (const theme of THEMES) {
      const a = drawGenome(theme, 7, 128, 128, 0);
      const b = drawGenome(theme, 7, 128, 128, 0);
      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
      expect(JSON.stringify(drawGenome(theme, 7, 128, 128, 1))).not.toBe(JSON.stringify(a));
      expect(JSON.stringify(drawGenome(theme, 8, 128, 128, 0))).not.toBe(JSON.stringify(a));
    }
  });

  it("keeps every map within 16 below high Verticality, and rises toward 22 above it", () => {
    for (const theme of THEMES)
      for (let seed = 1; seed <= 20; seed++) {
        const g = drawGenome(theme, seed, 128, 128, 0);
        // Variety 70 jitters the setting by up to 15 × (70 − 60) / 40 levels
        expect(g.vtSetting).toBe(VT_DEFAULT[theme]);
        expect(Math.abs(g.vt - VT_DEFAULT[theme])).toBeLessThanOrEqual(4);
        expect(g.tall).toBe(false);
        expect(g.top).toBeLessThanOrEqual(EDITOR_TOP);
        const t = drawGenome(theme, seed, 128, 128, 0, { vt: 85 });
        expect(t.tall).toBe(true);
        expect(t.top).toBe(tallTop(t.vt));
        expect(t.top).toBeGreaterThan(EDITOR_TOP);
        expect(t.top).toBeLessThanOrEqual(GAME_TOP);
        const locked = drawGenome(theme, seed, 128, 128, 0, { vt: 85, tallAllowed: false });
        expect(locked.tall).toBe(false);
        expect(locked.top).toBeLessThanOrEqual(EDITOR_TOP);
      }
    expect(tallTop(VT_HIGH)).toBe(EDITOR_TOP);
    expect(tallTop(100)).toBe(GAME_TOP);
  });

  it("gives every Islands map its sea, and Any one now and then", () => {
    let anySeas = 0;
    for (let seed = 1; seed <= 300; seed++) {
      expect(drawGenome("islands", seed, 128, 128, 0).sea).toBe(true);
      for (const t of LEANINGS) if (t !== "islands") expect(drawGenome(t, seed, 128, 128, 0).sea).toBe(false);
      if (drawGenome("any", seed, 128, 128, 0).sea) anySeas++;
    }
    // a sixth of Any maps, as often as an Islands draw among the six themes
    expect(anySeas).toBeGreaterThan(25);
    expect(anySeas).toBeLessThan(80);
  });

  it("draws Any from ranges as broad as all six themes together", () => {
    const span = (gs: Genome[], f: (g: Genome) => number) => {
      const v = gs.map(f);
      return [Math.min(...v), Math.max(...v)];
    };
    const any: Genome[] = [];
    const each: Genome[] = [];
    for (let seed = 1; seed <= 400; seed++) {
      any.push(drawGenome("any", seed, 128, 128, 0));
      each.push(drawGenome(LEANINGS[seed % 6], seed, 128, 128, 0));
    }
    // flow, lake budgets, incision and caprock reach both ends of the six themes' ranges
    for (const f of [(g: Genome) => g.hydro.flowMul, (g: Genome) => g.hydro.incise, (g: Genome) => g.cap.share, (g: Genome) => g.noise.cell]) {
      const [alo, ahi] = span(any, f);
      const [elo, ehi] = span(each, f);
      expect(alo).toBeLessThan(elo + 0.25 * (ehi - elo));
      expect(ahi).toBeGreaterThan(ehi - 0.25 * (ehi - elo));
    }
    // every part kind appears
    const kinds = new Set(any.flatMap((g) => g.parts.map((p) => p.kind)));
    for (const k of ["ridge", "trough", "basin", "caldera", "mesa", "mesaField", "escarpment", "cone", "plateau", "knolls"]) expect(kinds.has(k as never)).toBe(true);
  });

  // (M9b, D273 (3): every map has a character, so none is no longer drawn; it drew none on a
  // quarter of maps before)
  it("draws one or two intentions, never none, never two that pull the start two ways", () => {
    const counts = [0, 0, 0];
    for (let seed = 1; seed <= 400; seed++) {
      const ids = drawIntentions(seed % 2 ? "any" : "canyon", 30, stream(seed, "test-intentions"));
      counts[ids.length]++;
      for (const id of ids) expect(ACTIVE).toContain(id);
      if (ids.length === 2) expect(clashes(ids[0], ids[1])).toBe(false);
    }
    expect(counts[0]).toBe(0);
    expect(counts[1]).toBeGreaterThan(200);
    expect(counts[2]).toBeGreaterThan(100);
  });

  // #1193: a map narrower than 96 draws its land at its own scale from the first round, not a 128²'s squeezed in;
  // 96² and up keep a 128²'s land (but for a late rescue round's gentle land, D471), and Highlands, whose promise is
  // height, waits for the eighth round
  it("draws a map narrower than 96 at its own scale from the first round, and a 96² map at a 128²'s", () => {
    const relief = (theme: "delta" | "riverValley", n: number, seed: number) => {
      const own = ownScaleFor(theme, n, n, 0);
      const g = drawGenome(theme, seed, n, n, 0, own ? { ownScale: own } : {});
      leanGenome(g, makeSpec({ seed, size: { x: n, y: n }, theme }).settings, n, n, seed, 0, "normal");
      return { relief: g.relief, parts: g.parts.length, own: g.ownScale };
    };
    expect(ownScaleFor("delta", 48, 48, 0)).toBe("root");
    expect(ownScaleFor("riverValley", 64, 192, 0)).toBe("root");
    expect(ownScaleFor("delta", 96, 96, 0)).toBeNull();
    expect(ownScaleFor("highlands", 48, 48, 0)).toBeNull();
    expect(ownScaleFor("highlands", 48, 48, 8)).toBe("side");
    let bigParts = 0, smallParts = 0;
    for (const theme of ["delta", "riverValley"] as const)
      for (let seed = 1; seed <= 6; seed++) {
        const big = relief(theme, 128, seed);
        const small = relief(theme, 48, seed);
        expect(small.own, `${theme} ${seed}: 48² at its own scale`).toBeCloseTo(Math.sqrt(48 / 128), 9);
        // (its levels' spread a root of 48/128 of what a 128²'s would be)
        expect(small.relief, `${theme} ${seed}: 48²'s levels under 128²'s`).toBeLessThan(big.relief);
        bigParts += big.parts;
        smallParts += small.parts;
        const at96 = relief(theme, 96, seed);
        expect(at96.own, `${theme} ${seed}: 96² at a 128²'s scale`).toBeUndefined();
        expect(at96.relief, `${theme} ${seed}: 96²'s levels a 128²'s`).toBe(big.relief);
      }
    // (and its parts by its area: a theme's few parts round alike now and then, so counted over the twelve)
    expect(smallParts).toBeLessThan(bigParts * 0.75);
  });
});
