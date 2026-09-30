// Kyler's forces sitting, batch A (PLAN §20 D344): the pure pieces. A1 a force's Size from F's
// pointer, [ and ] and its Power from { and }, as a brush's; A3 a drawn gesture is a band of its width
// along the line, never a circle; A6 a fissure's breadth from the shape drawn, so a small loop gives a
// small eruption at any Size; A7 Glaciate's sounds fitted to its showing, the meltwater ending as the
// land settles.

import { describe, expect, it } from "vitest";
import { ERUPT_DEFAULTS, ERUPT_SIZE_MAX, ERUPT_SIZE_MIN, fissureBreadth, naturalBreadth, shapeSpan } from "../../src/core/forces/erupt";
import { bandTiles } from "../../src/editor/freehand";
import { FORCE_SIZES, sizeForReach, sized, snapSize, stepPower, stepSize } from "../../src/editor/forceSize";
import { recipe } from "../../src/editor/juice/palette";
import { FORCE_KEYS } from "../../src/editor/TopBar";

describe("a force's Size and Power from the keys (A1)", () => {
  it("F's pointer sets the Size whose ring reaches it: half its Size, on its slider's steps and range", () => {
    expect(sizeForReach("craterize", 10)).toBe(20);
    expect(sizeForReach("craterize", 10.4)).toBe(20);
    expect(sizeForReach("carve", 3.3)).toBe(7);
    expect(sizeForReach("erupt", 1)).toBe(FORCE_SIZES.erupt.min);
    expect(sizeForReach("glaciate", 999)).toBe(FORCE_SIZES.glaciate.max);
    for (const verb of ["carve", "craterize", "erupt", "glaciate"] as const)
      for (let d = 0; d < 100; d += 0.7) {
        const s = sizeForReach(verb, d);
        expect(s % FORCE_SIZES[verb].step, verb).toBe(0);
        expect(s).toBeGreaterThanOrEqual(FORCE_SIZES[verb].min);
        expect(s).toBeLessThanOrEqual(FORCE_SIZES[verb].max);
      }
  });

  it("[ and ] step the Size from where it is (an Auto size between steps goes to the next one that way); { and } step Power by five", () => {
    expect(stepSize("craterize", 20, 1)).toBe(22);
    expect(stepSize("craterize", 20, -1)).toBe(18);
    expect(stepSize("craterize", 21.3, 1)).toBe(22);
    expect(stepSize("craterize", 21.3, -1)).toBe(20);
    expect(stepSize("carve", 7.5, 1)).toBe(8);
    expect(stepSize("carve", 7.5, -1)).toBe(7);
    expect(stepSize("carve", 24, 1)).toBe(24);
    expect(stepSize("erupt", 6, -1)).toBe(6);
    expect(snapSize("glaciate", 31)).toBe(32);
    expect(stepPower(60, 1)).toBe(65);
    expect(stepPower(0, -1)).toBe(0);
    expect(stepPower(100, 1)).toBe(100);
    expect(stepPower(62, -1)).toBe(55);
  });

  it("Quake has no Size (its drawn line is its length)", () => {
    expect(sized("quake")).toBe(false);
    expect(sized("carve")).toBe(true);
    expect(sized(null)).toBe(false);
  });
});

describe("a drawn gesture shows as a band of its width (A3)", () => {
  const W = 64;
  it("every tile within its half width of the line, and none farther: a band, never a circle", () => {
    const line = [
      { x: 10, y: 20 },
      { x: 30, y: 22 },
      { x: 45, y: 35 },
    ];
    const r = 4;
    const band = new Set(bandTiles(line, r, W, W));
    const dist = (x: number, y: number) => {
      let best = Infinity;
      for (let k = 1; k < line.length; k++) {
        const a = line[k - 1];
        const b = line[k];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy)));
        best = Math.min(best, Math.hypot(x - a.x - dx * t, y - a.y - dy * t));
      }
      return best;
    };
    for (let y = 0; y < W; y++)
      for (let x = 0; x < W; x++) expect(band.has(y * W + x), `${x},${y}`).toBe(dist(x, y) <= r + 1e-9);
    // (as wide along the line as at its ends: no circle anywhere)
    const across = (x: number) => [...band].filter((i) => i % W === x).length;
    expect(Math.abs(across(20) - across(25))).toBeLessThanOrEqual(1);
  });

  it("a line of no width is its own tiles; a band stays on the map", () => {
    expect(bandTiles([{ x: 5, y: 5 }, { x: 8, y: 5 }], 0.5, W, W).sort((a, b) => a - b)).toEqual([5 * W + 5, 5 * W + 6, 5 * W + 7, 5 * W + 8]);
    expect(bandTiles([{ x: 0, y: 0 }, { x: 3, y: 0 }], 6, W, W).every((i) => i >= 0 && i < W * W)).toBe(true);
  });
});

describe("a fissure's breadth from its shape (A6)", () => {
  const loop = (cx: number, cy: number, r: number) => Array.from({ length: 25 }, (_, k) => ({ x: cx + r * Math.cos((k / 24) * Math.PI * 2), y: cy + r * Math.sin((k / 24) * Math.PI * 2) }));
  it("a small loop gives a small eruption, whatever Size says; a long line keeps the breadth Power gives", () => {
    const s = { ...ERUPT_DEFAULTS, mode: "fissure" as const, power: 100, shape: "steep" as const, size: ERUPT_SIZE_MAX };
    const small = fissureBreadth(s, loop(40, 40, 4));
    expect(shapeSpan(loop(40, 40, 4))).toBeCloseTo(8, 0);
    expect(small).toBeLessThanOrEqual(8);
    expect(small).toBeGreaterThanOrEqual(ERUPT_SIZE_MIN);
    const long = fissureBreadth(s, [{ x: 5, y: 10 }, { x: 120, y: 30 }]);
    expect(long).toBe(Math.round(naturalBreadth({ ...s, size: null }) / 2) * 2);
    // (Size is for a vent's click: a fissure's breadth never reads it)
    expect(fissureBreadth({ ...s, size: 6 } as typeof s, loop(40, 40, 30))).toBe(fissureBreadth(s, loop(40, 40, 30)));
    // (a bigger loop, a bigger eruption, up to the breadth Power gives)
    expect(fissureBreadth(s, loop(40, 40, 8))).toBeGreaterThan(small);
  });
});

describe("Glaciate's sounds keep to its showing (A7)", () => {
  const end = (layers: ReturnType<typeof recipe>) => Math.max(...layers.map((l) => (l.delay ?? 0) + (l.duration ?? 0)));
  it("each phase fits the time it shows: its cracks within the advance, its meltwater ending as the land settles", () => {
    const rnd = () => 0.5;
    for (const span of [0.8, 1.2, 3.2, 4.8]) {
      expect(end(recipe("glaciate", {}, { phase: "advance", span, random: rnd }))).toBeLessThanOrEqual(Math.max(span, 0.2) + 0.02);
      expect(end(recipe("glaciate", {}, { phase: "retreat", span, random: rnd }))).toBeCloseTo(span, 5);
    }
    // (its own pace, as before: the investigation's recipe exactly)
    const own = recipe("glaciate", {}, { phase: "retreat", random: rnd });
    expect(own[0].duration).toBe(2.2);
  });
});

describe("the hint while a force plays (A4)", () => {
  it("reads as Kyler put it", () => {
    expect(FORCE_KEYS).toBe("Esc to skip · Ctrl+Z to undo");
  });
});
