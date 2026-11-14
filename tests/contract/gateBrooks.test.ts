// The Gate's brooks (`premise/gateBrooks.ts` `meander`; planning's rulings of 2026-11-13 and 2026-11-14 on the bends): on
// flat ground with room each bend is drawn for itself, its wavelength 6 to 14 times the brook's width and its swing 1.0
// to 1.8 rad, about means that drift along the course, so no two bends and no two brooks keep one rhythm; never so
// tight that a curve touches itself; on a steep reach it does not swing and steps aside at each level its bed drops,
// left and right by turns; it leaves its head straight; and on a straight course at any angle one of the layout's six
// draws lies as no straight even reach, read three and four wide (the reach rule, `validate/ruledLand.ts`).

import { describe, expect, it } from "vitest";
import { splitmix32 } from "../../src/core/math/rng";
import { BROOK_BESIDE, BROOK_MEANDER, besideRun, brookBends, courseReach, meander, sampled, selfGap } from "../../src/core/premise/gateBrooks";
import type { Point } from "../../src/core/premise/types";

const WIDTH = 3.5;
/** Uniform draws in [0, 1) from a seed. */
const draws = (seed: number): (() => number) => {
  const next = splitmix32(seed);
  return () => next() / 4294967296;
};
const anywhere = () => true;
/** A straight course `len` tiles long at `deg` degrees, from (40, 40). */
const course = (deg: number, len: number): Point[] => {
  const a = (deg * Math.PI) / 180;
  return [
    [40, 40],
    [40 + (Math.cos(a) * len) / 2, 40 + (Math.sin(a) * len) / 2],
    [40 + Math.cos(a) * len, 40 + Math.sin(a) * len],
  ];
};
/** Each point's place along the course's line and its offset from it. */
const offsets = (path: readonly Point[], deg: number): { u: number; y: number }[] => {
  const a = (deg * Math.PI) / 180;
  return path.map((p) => ({ u: (p[0] - 40) * Math.cos(a) + (p[1] - 40) * Math.sin(a), y: -(p[0] - 40) * Math.sin(a) + (p[1] - 40) * Math.cos(a) }));
};

describe("the Gate's brooks: meanders", () => {
  it("on flat ground each bend is its own: a swing of 1.0 to 1.8 rad, a wavelength 6 to 14 widths, no two brooks one rhythm", () => {
    const means: number[] = [];
    for (const [seed, deg] of [[1, 0], [2, 23], [3, 45], [4, 67]] as const) {
      const m = meander(course(deg, 160), WIDTH, draws(seed), { levels: 0, from: 6 }, anywhere);
      const o = offsets(m.path, deg);
      // (its bends, clear of its head and its end: from one lobe's furthest point off its course to the next one's, and
      // its swing between them, its steepest heading against the course where it turns from one bend into the next.
      // Read at its crossings of its course, as when every bend was one size, a short bend after a long one was read
      // where it had not yet turned)
      const tops: number[] = [];
      for (let k = 2; k + 1 < o.length; k++) {
        if (o[k].u < 10 || o[k].u > 160 - 12) continue;
        if ((o[k].y - o[k - 1].y) * (o[k + 1].y - o[k].y) < 0) tops.push(k);
      }
      expect(tops.length, `${deg}°`).toBeGreaterThanOrEqual(5);
      const halves: number[] = [];
      for (let e = 1; e < tops.length; e++) {
        let swing = 0;
        for (let k = tops[e - 1] + 1; k <= tops[e]; k++) swing = Math.max(swing, Math.abs(Math.atan2(o[k].y - o[k - 1].y, o[k].u - o[k - 1].u)));
        const at = `${deg}°: its bend at ${o[tops[e]].u.toFixed(0)}`;
        expect(swing, at).toBeGreaterThanOrEqual(BROOK_MEANDER.swing[0] - 0.06);
        expect(swing, at).toBeLessThanOrEqual(BROOK_MEANDER.swing[1] + 0.06);
        // (half a wavelength from one lobe's top to the next: 3 to 7 widths, half a width's slack)
        const half = o[tops[e]].u - o[tops[e - 1]].u;
        expect(half, at).toBeGreaterThanOrEqual((BROOK_MEANDER.wave[0] * WIDTH) / 2 - WIDTH / 2);
        expect(half, at).toBeLessThanOrEqual((BROOK_MEANDER.wave[1] * WIDTH) / 2 + WIDTH / 2);
        halves.push(half);
      }
      // (its bends unlike one another: its longest 1.3 times its shortest or more)
      expect(Math.max(...halves) / Math.min(...halves), `${deg}°`).toBeGreaterThanOrEqual(1.3);
      means.push(halves.reduce((t, h) => t + h, 0) / halves.length);
    }
    // (and the brooks unlike one another: their mean bends a width apart or more, the longest from the shortest)
    expect(Math.max(...means) - Math.min(...means)).toBeGreaterThanOrEqual(WIDTH);
  });

  it("no curve touches itself: a brook keeps more than its width from itself 12 tiles and more further on", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const m = meander(course((seed * 37) % 90, 120), WIDTH, draws(seed), { levels: 0, from: 6 }, anywhere);
      expect(selfGap(m.path, 12), `seed ${seed}`).toBeGreaterThan(4);
    }
  });

  it("leaves its head straight along its course, and ends on it", () => {
    for (const deg of [0, 30, 45, 80]) {
      const m = meander(course(deg, 90), WIDTH, draws(7 + deg), { levels: 0, from: 6 }, anywhere);
      const o = offsets(m.path, deg);
      for (const q of o) if (q.u <= BROOK_MEANDER.lead) expect(Math.abs(q.y), `${deg}° at ${q.u.toFixed(1)}`).toBeLessThan(0.05);
      expect(Math.abs(o[o.length - 1].y)).toBeLessThan(0.05);
      expect(o[o.length - 1].u).toBeCloseTo(90, 1);
    }
  });

  it("on a steep reach it does not swing, and steps aside at each level its bed drops, left and right by turns", () => {
    // (five levels down 46 tiles: a drop every 6.7 tiles, under 0.5 of half a wavelength)
    const m = meander(course(0, 46), WIDTH, draws(11), { levels: 5, from: 6 }, anywhere);
    expect(m.drops.length).toBe(5);
    const o = offsets(m.path, 0);
    const at = (u: number) => o.reduce((best, q) => (Math.abs(q.u - u) < Math.abs(best.u - u) ? q : best)).y;
    // (the drops clear of its head and its tail, where its offset is its own)
    const inner = m.drops.filter((d) => d > BROOK_MEANDER.lead + BROOK_MEANDER.head + 2 && d < 46 - 2 - BROOK_MEANDER.tail - 2);
    expect(inner.length).toBeGreaterThanOrEqual(3);
    const steps = inner.map((d) => at(d + BROOK_MEANDER.stepRun / 2) - at(d - BROOK_MEANDER.stepRun / 2));
    for (const s of steps) expect(Math.abs(s)).toBeGreaterThanOrEqual(0.6 * BROOK_MEANDER.sidestep[0] * WIDTH);
    for (let k = 1; k < steps.length; k++) expect(Math.sign(steps[k])).toBe(-Math.sign(steps[k - 1]));
    // (and between two drops it holds its side: no lobe of a meander's size)
    expect(Math.max(...o.map((q) => Math.abs(q.y)))).toBeLessThan(BROOK_MEANDER.sidestep[1] * WIDTH + 1);
  });

  it("swings as far as its room lets it: within a belt 5 tiles each side it keeps to the belt", () => {
    const m = meander(course(0, 120), WIDTH, draws(5), { levels: 0, from: 6 }, (p) => Math.abs(p[1] - 40) <= 5);
    for (const p of m.path) expect(Math.abs(p[1] - 40)).toBeLessThanOrEqual(5.5);
    // (and still swings: a squeezed lobe is drawn smaller, never flat)
    expect(Math.max(...m.path.map((p) => Math.abs(p[1] - 40)))).toBeGreaterThan(3);
  });

  it("on a straight course at any angle, one of six draws lies as no straight even reach, three and four wide", () => {
    for (const deg of [0, 23, 45, 67, 90]) {
      const draw = draws(100 + deg);
      let held = 0;
      for (let d = 0; d < 6; d++) {
        const c = sampled(meander(course(deg, 110), WIDTH, draw, { levels: 0, from: 6 }, anywhere), 3).path;
        if (courseReach(c, 1.5).tiles === 0 && courseReach(c, 2).tiles === 0) held++;
      }
      expect(held, `${deg}°`).toBeGreaterThanOrEqual(1);
    }
    // (the course itself, no meander on it, is a canal: ruled past five times its width)
    expect(courseReach(course(0, 110), 1.5).tiles).toBeGreaterThan(0);
    expect(courseReach(course(45, 110), 2).tiles).toBeGreaterThan(0);
  });

  it("a trunk's bends vary: a straight reach of two wavelengths or more, then a loop tighter than any other bend", () => {
    // (planning's verdict of 2026-11-14 on round 2, `TRUNK_VARY`; read as `gateMeasures.ts` `trunkBends` reads a laid
    // trunk: bends turning under twice the ruling's least swing in a row, in its mean wavelengths, and each bend's turn a
    // tile, its first and last aside. A draw the layout lays is one of its six; on courses 140 tiles long at any angle
    // two in three or more show both, and a brook's own course, `vary` off, none of the reach)
    let both = 0;
    let n = 0;
    let plain = 0;
    for (const deg of [0, 11, 22, 33, 45, 56, 67, 78, 90])
      for (let seed = 1; seed <= 6; seed++) {
        const read = (vary: boolean) => {
          const m = meander(course(deg, 140), WIDTH, draws(seed * 97 + deg), { levels: 0, from: 0 }, anywhere, 2, vary);
          const b = brookBends(m.path);
          const inner = b.slice(1, -1);
          const wave = (2 * b.reduce((s, x) => s + x.length, 0)) / b.length;
          let straight = 0;
          let run = 0;
          for (const x of inner) straight = Math.max(straight, (run = x.swing < 2 * BROOK_MEANDER.swing[0] ? run + x.length : 0));
          const tight = inner.map((x) => x.swing / Math.max(1, x.length)).sort((p, q) => q - p);
          return { waves: straight / wave, tight: tight[0] / tight[1] };
        };
        const v = read(true);
        n++;
        if (v.waves >= 2 && v.tight > 1.15) both++;
        if (read(false).waves >= 2) plain++;
      }
    expect(both / n).toBeGreaterThanOrEqual(2 / 3);
    expect(plain).toBe(0);
  });

  it("two brooks run side by side where one keeps near the other and heads as it does; a tributary coming in does not", () => {
    const line = (x0: number, y0: number, x1: number, y1: number): Point[] => Array.from({ length: 41 }, (_, k) => [x0 + ((x1 - x0) * k) / 40, y0 + ((y1 - y0) * k) / 40]);
    // (two straight courses 8 tiles apart, 80 long: beside each other all the way)
    expect(besideRun(line(10, 10, 90, 10), line(10, 18, 90, 18))).toBeGreaterThanOrEqual(78);
    // (the same two a tile further apart than `within`: never)
    expect(besideRun(line(10, 10, 90, 10), line(10, 11 + BROOK_BESIDE.within, 90, 11 + BROOK_BESIDE.within))).toBe(0);
    // (a tributary in at 45° to its confluence: near its trunk over its last tiles, never beside it)
    expect(besideRun(line(20, 60, 60, 20), line(10, 20, 90, 20))).toBe(0);
    // (and two meandering brooks on parallel courses 9 tiles apart: beside each other past `BROOK_TREE.run`'s 30 tiles)
    const a = meander(course(0, 120), WIDTH, draws(21), { levels: 0, from: 6 }, (p) => Math.abs(p[1] - 40) <= 4);
    const b = a.path.map((p): Point => [p[0], p[1] + 9]);
    expect(besideRun(a.path, b)).toBeGreaterThan(30);
  });
});
