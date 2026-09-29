// The genome (M9a, docs/m9-design.md §3; src/core/land/genome.ts): drawn from a theme's prior, or
// from "Any" (D208, D209), deterministically, with Verticality's heights above 16 from 70 (D172).

import { describe, expect, it } from "vitest";
import { drawGenome, EDITOR_TOP, GAME_TOP, LEANINGS, VT_HIGH, tallTop, type Genome } from "../../src/core/land/genome";
import { ACTIVE, drawIntentions, clashes } from "../../src/core/land/intentions";
import { stream } from "../../src/core/math/rng";
import { VT_DEFAULT } from "../../src/core/spec/mapspec";

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

  it("draws zero, one or two intentions, never two that pull the start two ways", () => {
    const counts = [0, 0, 0];
    for (let seed = 1; seed <= 400; seed++) {
      const ids = drawIntentions(seed % 2 ? "any" : "canyon", 30, stream(seed, "test-intentions"));
      counts[ids.length]++;
      for (const id of ids) expect(ACTIVE).toContain(id);
      if (ids.length === 2) expect(clashes(ids[0], ids[1])).toBe(false);
    }
    expect(counts[0]).toBeGreaterThan(60);
    expect(counts[1]).toBeGreaterThan(150);
    expect(counts[2]).toBeGreaterThan(60);
  });
});
