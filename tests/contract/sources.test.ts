// Water sources start rivers (Kyler, 2026-09-25, D171): a source is where water begins, never in
// the middle of a flow. `water.source_in_flow` (analysis/sources.ts, prototype/playability.py
// `sources_in_flow`) flags a source that water from another source comes down to; a sealed mouth, a
// cluster of sources side by side at a river's head and springs across one pool are heads.
//
// Each case is a small map settled with the canonical settle: a river channel running east from the
// west edge, its bed stepping down, on ground two levels above it.

import { describe, expect, it } from "vitest";
import { sourcesInFlow } from "../../src/core/analysis/sources";
import type { Orientation } from "../../src/core/format/footprints";
import { waterModel, type MapObject } from "../../src/core/sim/model";
import { canonicalSettle } from "../../src/core/sim/prefill";
import { rulesFor, checkPlayability } from "../../src/core/validate/playability";
import { Collector } from "../../src/core/validate/report";
import { MapSession } from "../../src/core/doc/session";
import { generate } from "../../src/core/gen/generate";
import { makeSpec } from "../../src/core/spec/mapspec";

const W = 48;
const H = 24;
const N = W * H;

function source(x: number, y: number, z: number, strength = 1, template = "WaterSource", orientation: Orientation = "Cw0"): MapObject {
  return { template, x, y, z, orientation, flipped: false, components: { WaterSource: { SpecifiedStrength: strength } } as MapObject["components"] };
}

/** Ground at level 8; a channel 4 wide (y 10–13) from the west edge to the east edge, its bed
 *  stepping down a level every 12 tiles (6, 5, 4, 3). */
function river(): Uint8Array {
  const h = new Uint8Array(N).fill(8);
  for (let y = 10; y <= 13; y++) for (let x = 0; x < W; x++) h[y * W + x] = 6 - Math.floor(x / 12);
  return h;
}

/** A sealed mouth: a source on every channel tile of the west edge. */
function mouth(h: Uint8Array): MapObject[] {
  const out: MapObject[] = [];
  for (let y = 10; y <= 13; y++) out.push(source(0, y, h[y * W], 0.5));
  return out;
}

function flagged(h: Uint8Array, objects: MapObject[]): { inFlow: number[]; sources: number } {
  const model = waterModel(W, H, h, objects);
  const settle = canonicalSettle(model);
  expect(settle.settled).toBe(true);
  return sourcesInFlow(model, objects, settle.depth);
}

describe("water sources start rivers (D171)", () => {
  it("a sealed river mouth, a row across the channel at the edge, is where the river begins", () => {
    const h = river();
    const r = flagged(h, mouth(h));
    expect(r.sources).toBe(4);
    expect(r.inFlow).toEqual([]);
  });

  it("a source downstream inside the river is flagged", () => {
    const h = river();
    const objects = [...mouth(h), source(30, 11, h[11 * W + 30], 1)];
    const r = flagged(h, objects);
    expect(r.inFlow).toEqual([4]);
  });

  it("a cluster of sources side by side at a spring-fed river's head is where it begins; more flow comes from the cluster or its strength", () => {
    const h = river();
    // no mouth: the channel's west end is walled, and a 2 × 2 cluster feeds the river from there
    for (let y = 10; y <= 13; y++) h[y * W] = 8;
    const cluster = [source(2, 11, 6, 2), source(3, 11, 6, 2), source(2, 12, 6, 2), source(3, 12, 6, 2)];
    expect(flagged(h, cluster).inFlow).toEqual([]);
    // the same water from one strong source at the head: fine; a second one downstream is not
    expect(flagged(h, [source(2, 11, 6, 8)]).inFlow).toEqual([]);
    expect(flagged(h, [source(2, 11, 6, 4), source(26, 12, 4, 4)]).inFlow).toEqual([1]);
  });

  it("a spring inside a lake the river fills is flagged; a pond fed by its own spring is not", () => {
    const h = river();
    // a lake 3 deep across the channel's middle reach (x 18–29, y 6–17), its outlet the channel
    for (let y = 6; y <= 17; y++) for (let x = 18; x <= 29; x++) h[y * W + x] = 2;
    const lakeSpring = source(24, 8, 2, 0.5);
    expect(flagged(h, [...mouth(h), lakeSpring]).inFlow).toEqual([4]);
    // a pond away from the river, fed by its own spring, draining to the river
    const p = river();
    for (let y = 1; y <= 5; y++) for (let x = 30; x <= 36; x++) p[y * W + x] = 7;
    for (let y = 6; y <= 9; y++) p[y * W + 33] = 7; // its outlet down to the channel's bank
    expect(flagged(p, [...mouth(p), source(33, 3, 7, 0.5)]).inFlow).toEqual([]);
  });

  it("springs spread across one pool feed it together", () => {
    const h = new Uint8Array(N).fill(8);
    // a pool 2 deep (x 10–30, y 6–17) with an outlet channel to the east edge at its rim's level
    for (let y = 6; y <= 17; y++) for (let x = 10; x <= 30; x++) h[y * W + x] = 5;
    for (let y = 11; y <= 12; y++) for (let x = 31; x < W; x++) h[y * W + x] = 7;
    const springs = [source(12, 8, 5, 0.5), source(20, 15, 5, 0.5), source(28, 8, 5, 0.5)];
    expect(flagged(h, springs).inFlow).toEqual([]);
  });

  it("a tributary with its own mouth joins the river without being inside it", () => {
    const h = river();
    // a tributary from the south edge (x 20–21) down to the river's bed
    for (let y = 0; y < 10; y++) for (let x = 20; x <= 21; x++) h[y * W + x] = 5;
    const objects = [...mouth(h), source(20, 0, 5, 0.5), source(21, 0, 5, 0.5)];
    expect(flagged(h, objects).inFlow).toEqual([]);
  });

  it("is a design check: it blocks a generated map and is information on an import; in the editor (export) sources go anywhere (D184)", () => {
    const h = river();
    const objects = [...mouth(h), source(30, 11, h[11 * W + 30], 1)];
    const model = waterModel(W, H, h, objects);
    const water = canonicalSettle(model);
    const editor = new Collector("export");
    checkPlayability({ W, H, surface: h, objects, model, water, rules: rulesFor(null, "normal"), features: null }, editor);
    const e = editor.checks.find((x) => x.id === "water.source_in_flow")!;
    expect(e.ok).toBe(true);
    expect(e.applicable).toBe(false);
    expect(e.severity).toBe("info");
    for (const [profile, severity] of [["generate", "error"], ["import", "info"]] as const) {
      const c = new Collector(profile);
      checkPlayability({ W, H, surface: h, objects, model, water, rules: rulesFor(null, "normal"), features: null }, c);
      const r = c.checks.find((x) => x.id === "water.source_in_flow")!;
      expect(r.ok).toBe(false);
      expect(r.class).toBe("design");
      expect(r.severity).toBe(severity);
      expect(r.value).toBe(1);
      expect(r.where?.tiles).toEqual([[30, 11]]);
    }
  });
});

describe("a source placed by hand in the editor (D184: sources go anywhere)", () => {
  it("a source dropped in a river exports with no issue", () => {
    const r = generate(makeSpec({ seed: 3, theme: "riverValley", size: { x: 96, y: 96 } }));
    const s = MapSession.fromGenerated(r, r.file);
    s.setWaterMode("defer");
    const before = s.validate("export").report.checks.filter((c) => !c.ok).map((c) => c.id);
    // the middle of the main river, away from the start
    const start = s.built.start!;
    let at = -1;
    for (let i = 0; i < 96 * 96 && at < 0; i++) if (s.built.channel[i] && s.built.water[i] > 0.3 && Math.hypot((i % 96) - start.x, Math.floor(i / 96) - start.y) > 25) at = i;
    expect(at).toBeGreaterThanOrEqual(0);
    const u = s.apply({ op: "placeEntity", params: { id: "0f5a3c2e-1b7d-4e8a-9c6f-2d4b8a1e3f70", template: "WaterSource", x: at % 96, y: Math.floor(at / 96), orientation: "Cw0", components: { WaterSource: { SpecifiedStrength: 2, CurrentStrength: 2 } } } }, "user", "Place water source");
    expect(u.errors).toEqual([]);
    const v = s.validate("export").report;
    const c = v.checks.find((x) => x.id === "water.source_in_flow")!;
    expect(c.ok).toBe(true);
    expect(c.applicable).toBe(false);
    expect(v.checks.filter((x) => !x.ok).map((x) => x.id)).toEqual(before);
  });
});
