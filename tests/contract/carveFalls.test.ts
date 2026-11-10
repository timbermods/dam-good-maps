// A fall from one stroke (showcase craft gaps 1, 2 and 20): a Carve drawn from high ground over its edge, or an
// Unleash dragged the same way, cuts a stream a level deep on top, two levels into the ground, with a lip one level
// down at the edge and the drop below it; it never bowls the high ground. With a Fall set, the water below stands at
// least that far under the lip (the reach below cut down to it), where the land has an edge or only a slope; a stroke
// with nowhere to fall is refused. Before: the stream cut five levels into the mesa, its banks lowered the tabletop
// three levels across twenty tiles, and the water ran down a ramp to the floor with no fall.

import { describe, expect, it } from "vitest";
import { waterSource } from "../../src/core/format/entities";
import { plainEntities, type ForceMap, type FullForceMap } from "../../src/core/forces/force";
import { DEFAULTS, type CarveSettings } from "../../src/core/forces/carve/run";
import { modelOf } from "../../src/core/forces/runs";
import { planForce, type ForceRequest } from "../../src/core/forces/start";
import { canonicalSettle } from "../../src/core/sim/prefill";
import { fallStudy } from "./carveFixtures";

interface Fell {
  before: Uint8Array;
  after: Uint8Array;
  depth: Float64Array;
  W: number;
}

/** A stroke as the page draws it (nature draws the details still on Auto, banks among them; Wander 0 unless set, so
 *  the course keeps to its row), run to its end and its water settled as the game plays it; or why it was refused. */
function stroke(m: ForceMap, from: [number, number], to: [number, number], s: Record<string, unknown> = {}, source?: string): Fell | string {
  const N = m.W * m.H;
  const via: [number, number][] = [];
  for (let k = 1; k < 8; k++) via.push([Math.round(from[0] + ((to[0] - from[0]) * k) / 8), Math.round(from[1] + ((to[1] - from[1]) * k) / 8)]);
  const settings = { ...DEFAULTS, mode: "aim", power: 65, wander: 0, walls: null, depth: null, banks: null, riverDepth: 2, defyGravity: !source, ...s } as unknown as CarveSettings;
  const request = { verb: "carve", settings, origin: from, end: to, via, cut: null, natural: true, ...(source ? { source } : {}) } as ForceRequest;
  const state = { W: m.W, H: m.H, pre: m.heights.slice(), protect: new Uint8Array(N), channel: new Uint8Array(N) } as never;
  const plan = planForce({ base: m as FullForceMap, request, state, caves: [], newId: () => "carve-own-source" });
  if (!plan.ok) return plan.error;
  const r = plan.carve!.finish();
  return { before: m.heights.slice(), after: r.map.heights.slice(), depth: Float64Array.from(canonicalSettle(modelOf(r.map)).depth), W: m.W };
}

/** Along row y from x0 east: the last tile no more than two levels under the top before the ground falls away (the lip), the
 *  ground there and just past it, and the water on each tile. */
function across(f: Fell, y: number, x0: number, top: number) {
  const at = (x: number) => y * f.W + x;
  let lip = x0;
  while (f.after[at(lip + 1)] >= top - 2) lip++;
  return { lip, ground: f.after[at(lip)], below: f.after[at(lip + 1)], surface: (x: number) => f.after[at(x)] + f.depth[at(x)], depth: (x: number) => f.depth[at(x)] };
}

/** Tiles of the high ground lowered further than `reach` tiles from the stream's water on it: a bowl. */
function bowled(f: Fell, top: number, reach: number): number {
  const wet: [number, number][] = [];
  for (let i = 0; i < f.before.length; i++) if (f.before[i] >= top && f.depth[i] > 0.3) wet.push([i % f.W, Math.floor(i / f.W)]);
  let n = 0;
  for (let i = 0; i < f.before.length; i++) {
    if (f.before[i] < top || f.after[i] >= f.before[i]) continue;
    const [x, y] = [i % f.W, Math.floor(i / f.W)];
    if (!wet.some(([a, b]) => Math.hypot(a - x, b - y) <= reach)) n++;
  }
  return n;
}

const Y = 20;

describe("a fall from one stroke (showcase craft gaps 1, 2 and 20)", () => {
  it("a Carve drawn off a mesa: a stream a level deep two levels into the top, a lip one level down at the edge, and the water falls below it", () => {
    const f = stroke(fallStudy("mesa"), [6, Y], [44, Y]);
    if (typeof f === "string") throw new Error(f);
    const a = across(f, Y, 6, 13);
    // the lip at the mesa's edge, one level down, and a drop of at least three below it
    expect(a.lip).toBeGreaterThanOrEqual(27);
    expect(a.lip).toBeLessThanOrEqual(29);
    expect(a.ground).toBe(12);
    expect(a.below).toBeLessThanOrEqual(9);
    // the stream on top, two levels down and about a level deep, never a thin sheet
    for (let x = 12; x < a.lip - 1; x++) {
      expect(f.after[Y * f.W + x], `bed at x ${x}`).toBe(11);
      expect(a.depth(x), `water at x ${x}`).toBeGreaterThan(0.6);
    }
    // the water pours over the lip and lands three levels or more below
    expect(a.depth(a.lip)).toBeGreaterThan(0.01);
    expect(a.surface(a.lip) - a.surface(a.lip + 2)).toBeGreaterThanOrEqual(3);
    // no bowl: the tabletop is cut only within the stream's own width, winding as nature draws it too
    expect(bowled(f, 13, 4)).toBe(0);
    const wound = stroke(fallStudy("mesa"), [6, Y], [44, Y], { wander: null });
    if (typeof wound === "string") throw new Error(wound);
    expect(bowled(wound, 13, 4)).toBe(0);
  });

  it("an Unleash dragged off the mesa's edge ends in the same fall", () => {
    const m = fallStudy("mesa");
    m.entities.push(...plainEntities([waterSource({ x: 14, y: Y, z: 13, id: "spring", owner: "test", strength: 1 })]));
    const f = stroke(m, [14, Y], [44, Y], {}, "spring");
    if (typeof f === "string") throw new Error(f);
    const a = across(f, Y, 14, 13);
    expect(a.ground).toBe(12);
    expect(a.below).toBeLessThanOrEqual(9);
    expect(a.depth(a.lip - 3)).toBeGreaterThan(0.6);
    expect(a.surface(a.lip) - a.surface(a.lip + 2)).toBeGreaterThanOrEqual(3);
    expect(bowled(f, 13, 4)).toBe(0);
  });

  it("with a Fall set down a slope, the water below stands that far under the lip; Size sets the lip's width", () => {
    const f = stroke(fallStudy("slope", 11), [6, Y], [71, Y], { fall: 4, width: 3 });
    if (typeof f === "string") throw new Error(f);
    const a = across(f, Y, 6, 11);
    expect(a.ground).toBe(10);
    expect(a.depth(a.lip)).toBeGreaterThan(0.01);
    expect(a.surface(a.lip) - a.surface(a.lip + 2)).toBeGreaterThanOrEqual(4);
    // the lip: at least three tiles across the stream at its level, the water pouring over each
    const lips = Array.from({ length: 9 }, (_, k) => (Y - 4 + k) * f.W + a.lip).filter((i) => f.after[i] === 10 && f.depth[i] > 0.01 && f.before[i] >= 10);
    expect(lips.length).toBeGreaterThanOrEqual(3);
  });

  it("a set Size widens the fall: Size 10 pours over a lip about ten tiles wide", () => {
    const f = stroke(fallStudy("mesa"), [6, Y], [44, Y], { width: 10 });
    if (typeof f === "string") throw new Error(f);
    const a = across(f, Y, 6, 13);
    expect(a.ground).toBe(12);
    const lips = Array.from({ length: 21 }, (_, k) => (Y - 10 + k) * f.W + a.lip).filter((i) => f.after[i] === 12 && f.depth[i] > 0.01);
    expect(lips.length).toBeGreaterThanOrEqual(9);
    expect(lips.length).toBeLessThanOrEqual(12);
  });

  it("a landmark: Fall 8 off a tall mesa", () => {
    const f = stroke(fallStudy("mesa", 15), [6, Y], [71, Y], { fall: 8, width: 4 });
    if (typeof f === "string") throw new Error(f);
    const a = across(f, Y, 6, 15);
    expect(a.ground).toBe(14);
    expect(a.depth(a.lip - 3)).toBeGreaterThan(0.6);
    expect(a.surface(a.lip) - a.surface(a.lip + 2)).toBeGreaterThanOrEqual(8);
  });

  it("a Fall with nowhere to fall is refused, in one line", () => {
    expect(stroke(fallStudy("flat"), [6, Y], [56, Y], { fall: 4 })).toBe("A fall needs high ground to fall from: draw the stroke from it over an edge or down a slope");
  });
});
