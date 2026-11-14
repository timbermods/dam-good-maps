// The Gate's brooks (`premise/gateBrooks.ts` `meander`; planning's rulings of 2026-11-13 on the bends): on flat ground
// with room a brook swings 1.3 rad or more each way of its course, a wavelength 8 to 10 times its width, never so tight
// that a curve touches itself; on a steep reach it does not swing and steps aside at each level its bed drops, left and
// right by turns; it leaves its head straight; and on a straight course at any angle one of the layout's six draws
// lies as no straight even reach, read three and four wide (the reach rule, `validate/ruledLand.ts`).

import { describe, expect, it } from "vitest";
import { splitmix32 } from "../../src/core/math/rng";
import { BROOK_MEANDER, courseReach, meander, sampled, selfGap } from "../../src/core/premise/gateBrooks";
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
  it("on flat ground a brook swings 1.3 rad or more each way of its course, a wavelength 8 to 10 widths", () => {
    for (const [seed, deg] of [[1, 0], [2, 23], [3, 45], [4, 67]] as const) {
      const m = meander(course(deg, 160), WIDTH, draws(seed), { levels: 0, from: 6 }, anywhere);
      const o = offsets(m.path, deg);
      // (its crossings of its course, clear of its head and its end, and its swing at each: its steepest heading
      // against the course within three tiles of the crossing, where it turns from one bend into the next)
      const heading = (k: number): number => Math.abs(Math.atan2(o[k].y - o[k - 1].y, o[k].u - o[k - 1].u));
      const crossings: { u: number; heading: number }[] = [];
      for (let k = 1; k < o.length; k++) {
        if (o[k].u < 12 || o[k].u > 160 - 14) continue;
        if (o[k - 1].y === 0 || o[k - 1].y * o[k].y > 0) continue;
        let most = 0;
        for (let j = 1; j < o.length; j++) if (Math.abs(o[j].u - o[k].u) <= 3) most = Math.max(most, heading(j));
        crossings.push({ u: o[k].u, heading: most });
      }
      expect(crossings.length, `${deg}°`).toBeGreaterThanOrEqual(6);
      for (const c of crossings) expect(c.heading, `${deg}°: its swing at ${c.u.toFixed(0)}`).toBeGreaterThanOrEqual(BROOK_MEANDER.swing[0] - 0.06);
      // (half a wavelength from one crossing to the next: 4 to 5 widths, a width's slack for lobes of unequal swing)
      const halves = crossings.slice(1).map((c, k) => c.u - crossings[k].u);
      const mean = halves.reduce((s, h) => s + h, 0) / halves.length;
      expect(mean, `${deg}°: half a wavelength`).toBeGreaterThanOrEqual((BROOK_MEANDER.wave[0] * WIDTH) / 2 - 1);
      expect(mean, `${deg}°: half a wavelength`).toBeLessThanOrEqual((BROOK_MEANDER.wave[1] * WIDTH) / 2 + 1);
      for (const h of halves) {
        expect(h, `${deg}°`).toBeGreaterThanOrEqual((BROOK_MEANDER.wave[0] * WIDTH) / 2 - WIDTH);
        expect(h, `${deg}°`).toBeLessThanOrEqual((BROOK_MEANDER.wave[1] * WIDTH) / 2 + WIDTH);
      }
    }
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
    // (five levels down 46 tiles: a drop every 6.7 tiles, under 0.6 of half a wavelength)
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
});
