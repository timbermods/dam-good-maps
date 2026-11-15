// A badwater ditch's runs (src/core/land/hazards.ts `ditchRuns`; the look round of 2026-11-14, item
// (c)): its longest run along a row or a column, and its longest even 45° stair, counted as item (b)
// counts a level's stair edge (the tiles on one diagonal line). The planner refuses a ditch whose run
// is over 4 or whose stair reaches 6, so neither a dug slot nor a ruled diagonal comes back.

import { describe, expect, it } from "vitest";
import { ditchRuns } from "../../src/core/land/hazards";

const W = 64;

/** The tiles a walk from (x, y) takes, one move per letter: E, W, N, S. */
function walk(x: number, y: number, moves: string): number[] {
  const out = [y * W + x];
  for (const m of moves) {
    if (m === "E") x++;
    else if (m === "W") x--;
    else if (m === "N") y--;
    else y++;
    out.push(y * W + x);
  }
  return out;
}

describe("a ditch's runs", () => {
  it("counts a run along a row or a column in tiles", () => {
    expect(ditchRuns(walk(10, 10, "EEE"), W).axis).toBe(4);
    expect(ditchRuns(walk(10, 10, "EEEE"), W).axis).toBe(5);
    expect(ditchRuns(walk(10, 10, "ESSSSSE"), W).axis).toBe(6);
    expect(ditchRuns(walk(10, 10, ""), W).axis).toBe(1);
  });

  it("counts an even 45° stair by the tiles on one diagonal line", () => {
    // 9 moves alternating: 10 tiles, 5 on each diagonal
    expect(ditchRuns(walk(10, 10, "ESESESESE"), W).stair).toBe(5);
    // 10 moves: 11 tiles, 6 on one diagonal
    expect(ditchRuns(walk(10, 10, "ESESESESES"), W).stair).toBe(6);
    // the same stair broken by a second step one way is two short stairs
    expect(ditchRuns(walk(10, 10, "ESESEESESES"), W).stair).toBe(4);
  });

  it("reads a winding ditch as neither", () => {
    const r = ditchRuns(walk(10, 10, "EESEESSESSEENEENNEESEESS"), W);
    expect(r.axis).toBeLessThanOrEqual(3);
    expect(r.stair).toBeLessThan(6);
  });
});
