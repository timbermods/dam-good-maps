// The Ruin places like the trees (D548): a stroke of the brush is `paintObjects` with kind "ruins", scattered over the
// tiles the brush covered at the density, never stacked, each column at the Height (Same) or from 1 up to it (Mixed);
// one undo step; a project with a stroke reopens byte for byte (D455).

import { describe, expect, it } from "vitest";
import { decodeProject } from "../../src/core/doc/document";
import { planPaintObjects } from "../../src/core/doc/paint";
import type { PaintParams } from "../../src/core/doc/paintParams";
import { MapSession } from "../../src/core/doc/session";
import { startingLocation } from "../../src/core/format/entities";
import { writeTimber } from "../../src/core/format/timber";
import { tilesToRuns } from "../../src/core/math/grid";
import { buildFileFromHeights } from "../../src/core/places/place";

const W = 64;
/** Flat ground at level 6, a step up to 9 east of X 40 (so a stroke crosses two levels). */
function land(): MapSession {
  const h = new Uint8Array(W * W);
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) h[y * W + x] = x >= 40 ? 9 : 6;
  const start = startingLocation({ id: "00000000-0000-4000-8000-0000000000aa", owner: "t", x: 5, y: 58, z: 6, orientation: "Cw0" });
  return MapSession.importMap(writeTimber(buildFileFromHeights(W, W, h, [start], "").file), "land.timber");
}

/** The tiles of the brush's ring round (cx, cy), `r` tiles across its radius (the shelf's `paintDisc`). */
function disc(cx: number, cy: number, r: number): number[] {
  const out: number[] = [];
  for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) if (Math.hypot(x - cx, y - cy) <= r) out.push(y * W + x);
  return out;
}

const stroke = (tiles: number[], o: Partial<PaintParams> = {}): PaintParams => ({ kind: "ruins", area: tilesToRuns(tiles, W), density: 1, seed: 7, ...o });
const ruins = (s: MapSession) => s.built.entities.filter((e) => /^RuinColumnH\d$/.test(e.template));

describe("the Ruin's brush", () => {
  it("at 100 % fills every tile of the ring a ruin can stand on, at the Height, never on another object", () => {
    const s = land();
    const ring = disc(40, 20, 4);
    // a ruin already there counts, and nothing stacks on it
    expect(s.apply({ op: "placeEntity", params: { id: "00000000-0000-4000-8000-0000000000bb", template: "RuinColumnH2", x: 40, y: 20, orientation: "Cw0" } }).ok).toBe(true);
    const r = s.apply({ op: "paintObjects", params: stroke(ring, { height: 5 }) });
    expect(r.errors).toEqual([]);
    const all = ruins(s);
    expect(all.length).toBe(ring.length);
    expect(new Set(all.map((e) => e.y * W + e.x))).toEqual(new Set(ring));
    expect(all.filter((e) => e.template === "RuinColumnH5").length).toBe(ring.length - 1);
    // the columns stand on their own tile's ground, across the step, their models and turns mixed
    expect(new Set(all.map((e) => e.z))).toEqual(new Set([6, 9]));
    expect(new Set(all.map((e) => e.orientation)).size).toBeGreaterThan(1);
  });

  it("scatters by the density, and a second stroke fills the gaps up to it", () => {
    const s = land();
    const ring = disc(20, 20, 6);
    expect(s.apply({ op: "paintObjects", params: stroke(ring, { density: 0.4 }) }).ok).toBe(true);
    expect(ruins(s).length).toBe(Math.round(0.4 * ring.length));
    const again = s.apply({ op: "paintObjects", params: stroke(ring, { density: 0.4, seed: 8 }) });
    expect(again.ok).toBe(false);
    expect(again.errors[0]).toMatch(/already holds as many/);
    expect(s.apply({ op: "paintObjects", params: stroke(ring, { density: 0.8, seed: 9 }) }).ok).toBe(true);
    expect(ruins(s).length).toBe(Math.round(0.8 * ring.length));
  });

  it("places exactly one on a single tile", () => {
    const s = land();
    expect(s.apply({ op: "paintObjects", params: stroke([10 * W + 10], { height: 4 }) }).ok).toBe(true);
    expect(ruins(s).map((e) => [e.template, e.x, e.y])).toEqual([["RuinColumnH4", 10, 10]]);
  });

  it("Same stands every column at the Height; Mixed each from 1 up to it, the same for the same seed", () => {
    const s = land();
    const ring = disc(20, 30, 6);
    const heights = (o: Partial<PaintParams>) => {
      const p = planPaintObjects(s, stroke(ring, o));
      if (!p.ok) throw new Error(p.errors[0]);
      return p.plan.map((q) => Number(q.template.slice("RuinColumnH".length)));
    };
    expect(new Set(heights({ height: 6 }))).toEqual(new Set([6]));
    expect(new Set(heights({ height: 6, heights: "same" }))).toEqual(new Set([6]));
    const mixed = heights({ height: 6, heights: "mixed" });
    expect(new Set(mixed)).toEqual(new Set([1, 2, 3, 4, 5, 6]));
    expect(heights({ height: 6, heights: "mixed" })).toEqual(mixed);
    expect(new Set(heights({ height: 1, heights: "mixed" }))).toEqual(new Set([1]));
    // (no height given: the shelf's 3)
    expect(new Set(heights({}))).toEqual(new Set([3]));
  });

  it("is one undo step, and its project reopens byte for byte, the replay placing the same ruins", () => {
    const s = land();
    expect(s.apply({ op: "paintObjects", params: stroke(disc(30, 30, 5), { density: 0.7, height: 4, heights: "mixed" }) }).ok).toBe(true);
    const placed = ruins(s).map((e) => `${e.template}@${e.x},${e.y},${e.z},${e.orientation}`);
    expect(placed.length).toBeGreaterThan(20);
    const project = s.project();
    expect(MapSession.replayMatchesStored(decodeProject(project))).toBe(true);
    const reopened = MapSession.open(decodeProject(project));
    expect(reopened.project()).toEqual(project);
    expect(ruins(reopened).map((e) => `${e.template}@${e.x},${e.y},${e.z},${e.orientation}`)).toEqual(placed);
    s.undo();
    expect(ruins(s).length).toBe(0);
  });

  it("refuses in one line: off the map, a height out of range, Mixed as an age, a height on another kind", () => {
    const s = land();
    expect(s.check({ op: "paintObjects", params: { ...stroke([]), area: [[0, W - 2, W + 3]] } }).length).toBe(1);
    const tall = s.check({ op: "paintObjects", params: stroke([5 * W + 5], { height: 9 }) });
    expect(tall.length).toBe(1);
    expect(tall[0]).toMatch(/height/);
    expect(s.check({ op: "paintObjects", params: stroke([5 * W + 5], { age: "mixed" }) })).toEqual(["ruins have no age"]);
    expect(s.check({ op: "paintObjects", params: { kind: "trees", template: "Pine", area: tilesToRuns([5 * W + 5], W), density: 1, seed: 1, height: 3 } })).toEqual(["trees have no height: only ruins do"]);
    expect(s.apply({ op: "paintObjects", params: { ...stroke([]), area: [[0, W - 2, W + 3]] } }).ok).toBe(false);
    expect(ruins(s).length).toBe(0);
  });
});
