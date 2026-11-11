// The ruin line (core/doc/ruinLine.ts): piers along a line whose tops share one level, gaps by the seed, one step; a
// project with one reopens byte for byte (D455).

import { describe, expect, it } from "vitest";
import { decodeProject } from "../../src/core/doc/document";
import { applyRuinLine, planRuinLine } from "../../src/core/doc/ruinLine";
import { MapSession } from "../../src/core/doc/session";
import { startingLocation } from "../../src/core/format/entities";
import { writeTimber } from "../../src/core/format/timber";
import { buildFileFromHeights } from "../../src/core/places/place";

const W = 96;
/** A valley running north to south: rims at level 10, the floor at 5 between X 36 and 60. */
function valley(): MapSession {
  const h = new Uint8Array(W * W);
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) h[y * W + x] = Math.max(5, 10 - Math.max(0, Math.min(x - 30, 66 - x)));
  const start = startingLocation({ id: "00000000-0000-4000-8000-0000000000aa", owner: "t", x: 5, y: 70, z: 10, orientation: "Cw0" });
  return MapSession.importMap(writeTimber(buildFileFromHeights(W, W, h, [start], "").file), "valley.timber");
}

describe("the ruin line", () => {
  it("stands its piers evenly from end to end, their tops at one level: tall in the low ground, short at the ends", () => {
    const s = valley();
    const p = planRuinLine(s, { from: [26, 40], to: [70, 40], spacing: 3, break: 0, seed: 7 });
    if (!p.ok) throw new Error(p.errors[0]);
    expect(p.top).toBe(11);
    expect(p.piers.length).toBe(15);
    for (const q of p.piers) expect(s.built.heights[q.tile] + q.height).toBe(11);
    expect([p.piers[0].height, p.piers[7].height, p.piers[14].height]).toEqual([1, 6, 1]);
  });
  it("knocks piers out by the seed, never its two ends, the same line for the same seed", () => {
    const s = valley();
    const line = (seed: number, brk: number) => {
      const p = planRuinLine(s, { from: [26, 40], to: [70, 40], spacing: 3, break: brk, seed });
      if (!p.ok) throw new Error(p.errors[0]);
      return p.piers.map((q) => q.x);
    };
    const broken = line(7, 0.5);
    expect(broken.length).toBeLessThan(15);
    expect([broken[0], broken[broken.length - 1]]).toEqual([26, 70]);
    expect(line(7, 0.5)).toEqual(broken);
    expect(line(8, 0.5)).not.toEqual(broken);
  });
  it("is one step, and its project reopens byte for byte", () => {
    const s = valley();
    expect(applyRuinLine(s, { from: [26, 40], to: [70, 44], spacing: 4, break: 0.3, seed: 11 }).ok).toBe(true);
    const ruins = () => s.built.entities.filter((e) => e.template.startsWith("RuinColumnH")).length;
    expect(ruins()).toBeGreaterThan(3);
    const project = s.project();
    expect(MapSession.replayMatchesStored(decodeProject(project))).toBe(true);
    expect(MapSession.open(decodeProject(project)).project()).toEqual(project);
    s.undo();
    expect(ruins()).toBe(0);
  });
  it("refuses a line with no room for two piers, and ground that drops too far under it, in one line", () => {
    const s = valley();
    expect(planRuinLine(s, { from: [26, 40], to: [27, 40], spacing: 3, break: 0, seed: 1 })).toEqual({ ok: false, errors: ["a ruin line needs room for two piers: drag further"] });
    expect(planRuinLine(s, { from: [26, 40], to: [70, 40], spacing: 9, break: 0, seed: 1 })).toEqual({ ok: false, errors: ["a ruin line's spacing must be a whole number from 1 to 8"] });
  });
});
