// Step runs (`validate/stepRuns.ts`, the look round's item (b), 2026-11-13): five or more equal one-tile steps in a
// straight line, each riser running straight across it, read as a staircase drawn with a ruler. The measure finds a
// laid flight along a row, a column and a diagonal, and leaves a flight whose risers wander, steps of two levels and
// water alone; the three maps the look round named carry no more runs than the known list allows (the list may only
// shrink; every 128² default map, seeds 1 to 12 of each theme, is checked against it in stepRunsMaps.heavy.test.ts).

import { describe, expect, it } from "vitest";
import { generate } from "../../src/core/gen/generate";
import { breakFlights } from "../../src/core/land/levels";
import { makeSpec } from "../../src/core/spec/mapspec";
import { wetOf } from "../../src/core/validate/ruledLand";
import { STEP_RUN, stepRuns } from "../../src/core/validate/stepRuns";
import { allowedRuns, STEP_RUNS_KNOWN } from "./stepRunsKnown";

/** A flat land at level 3 with a flight laid on it: `len` tiles climbing a level a tile from (x0, y0) along (dx, dy),
 *  `wide` lines across. */
function flight(W: number, x0: number, y0: number, dx: number, dy: number, len: number, wide: number): Uint8Array {
  const h = new Uint8Array(W * W).fill(3);
  // every tile takes the level of its place along the flight (before it: 3; past it: the top)
  for (let y = 0; y < W; y++)
    for (let x = 0; x < W; x++) {
      // along: the projection on (dx, dy), in steps; across: on the perpendicular
      const along = dx !== 0 && dy !== 0 ? ((x - x0) * dx + (y - y0) * dy) / 2 : (x - x0) * dx + (y - y0) * dy;
      const across = dx !== 0 && dy !== 0 ? ((x - x0) * dy - (y - y0) * dx) / 2 : (x - x0) * dy - (y - y0) * dx;
      if (Math.abs(across) > (wide - 1) / 2 + 0.5) continue;
      const k = Math.floor(along);
      h[y * W + x] = 3 + Math.max(0, Math.min(len - 1, k));
    }
  return h;
}

describe("step runs", () => {
  it("find a laid flight along a row, a column and a diagonal, once a line, at its full length", () => {
    const W = 40;
    const row = stepRuns(flight(W, 10, 20, 1, 0, 7, 5), null, W, W);
    expect(row.longest).toBe(7);
    expect(row.runs.filter((r) => r.length === 7 && r.dx === 1 && r.dy === 0).length).toBeGreaterThanOrEqual(3);
    expect(row.runs[0]).toMatchObject({ length: 7, x: 10, dx: 1, dy: 0 });
    // falling the other way: the run's lower end and its direction up
    const col = stepRuns(flight(W, 20, 30, 0, -1, 6, 5), null, W, W);
    expect(col.longest).toBe(6);
    expect(col.runs.some((r) => r.length === 6 && r.x === 20 && r.y === 30 && r.dx === 0 && r.dy === -1)).toBe(true);
    const diag = stepRuns(flight(W, 8, 8, 1, 1, 6, 9), null, W, W);
    expect(diag.runs.some((r) => r.length === 6 && r.dx === 1 && r.dy === 1)).toBe(true);
  });

  it("leave four steps, steps of two levels, a flight whose risers wander, and steps under water", () => {
    const W = 40;
    expect(stepRuns(flight(W, 10, 20, 1, 0, STEP_RUN - 1, 5), null, W, W).count).toBe(0);
    // two levels a tile
    const two = flight(W, 10, 20, 1, 0, 7, 5);
    for (let i = 0; i < W * W; i++) two[i] = 3 + 2 * (two[i] - 3);
    expect(stepRuns(two, null, W, W).count).toBe(0);
    // each line of the flight shifted a tile from the line beside it: no riser runs straight across
    const jag = new Uint8Array(W * W).fill(3);
    for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) jag[y * W + x] = 3 + Math.max(0, Math.min(7, x - 10 + (y % 2)));
    expect(stepRuns(jag, null, W, W).count).toBe(0);
    // a flight under water is not seen
    const h = flight(W, 10, 20, 1, 0, 7, 5);
    const wet = new Uint8Array(W * W);
    for (let y = 0; y < W; y++) for (let x = 12; x < 15; x++) wet[y * W + x] = 1;
    expect(stepRuns(h, wet, W, W).count).toBe(0);
  });

  it("are broken by the generator's pass where it finds them, along rows, columns and diagonals", () => {
    const W = 40;
    for (const [dx, dy, wide] of [[1, 0, 5], [0, -1, 5], [1, 1, 9], [1, -1, 9]] as const) {
      const h = flight(W, 20 - 4 * dx, 20 - 4 * dy, dx, dy, 8, wide);
      expect(stepRuns(h, null, W, W).count).toBeGreaterThan(0);
      breakFlights(h, W, W, 7);
      expect(stepRuns(h, null, W, W).count, `${dx},${dy}`).toBe(0);
      // the flight stands on level ground, which gives it its first tile: along its middle line every step stays one
      // level, so the colony walks it as before
      const at = (j: number) => h[(20 + (j - 4) * dy) * W + 20 + (j - 4) * dx];
      for (let j = -3; j < 11; j++) expect(Math.abs(at(j + 1) - at(j)), `${dx},${dy} at ${j}`).toBeLessThanOrEqual(1);
    }
  });

  it("the look round's maps carry no more than the known list allows (Highlands 1, River Valley 3, Delta 2 at 128²)", () => {
    for (const [theme, seed] of [["highlands", 1], ["riverValley", 3], ["delta", 2]] as const) {
      const b = generate(makeSpec({ seed, size: { x: 128, y: 128 }, theme })).built;
      const r = stepRuns(b.heights, wetOf(b.settle.depth), b.W, b.H);
      expect(r.count, `${theme} ${seed}: ${JSON.stringify(r.runs.slice(0, 5))}`).toBeLessThanOrEqual(allowedRuns(theme, seed));
    }
  });

  it("the known list only names maps at 128² seeds 1 to 12 and allows each at least one run", () => {
    for (const [key, n] of Object.entries(STEP_RUNS_KNOWN)) {
      expect(key).toMatch(/^(any|riverValley|canyon|highlands|lakeBasin|delta|islands):([1-9]|1[0-2])$/);
      expect(n).toBeGreaterThan(0);
    }
  });
});
