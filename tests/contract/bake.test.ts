// Landforms drawn with the old tools become terrain when a project opens (PLAN §20 D182): the land
// is exactly as it was, the drawn landforms are gone, it is one step of the history (undo brings
// them back), and a map with none, or with only the generator's own, is left as it is.

import { describe, expect, it } from "vitest";
import { bakeLandforms, BAKE_LABEL } from "../../src/core/doc/bake";
import { MapSession } from "../../src/core/doc/session";
import { planContextOf, planLandform } from "../../src/core/doc/tools";
import { generate } from "../../src/core/gen/generate";
import { makeSpec } from "../../src/core/spec/mapspec";
import type { Point } from "../../src/core/features/schema";

const W = 96;

describe("drawn landforms become terrain (D182)", () => {
  it("a project with a drawn hill and canyon opens with the same land and no landform tools' features", () => {
    const r = generate(makeSpec({ seed: 4242, size: { x: W, y: W }, theme: "riverValley" }));
    const s = MapSession.fromGenerated(r, r.file);
    const start = s.built.start!;
    const far = (dx: number): Point => [start.x < W / 2 ? W - 20 + dx : 20 + dx, start.y < W / 2 ? W - 20 : 20];
    const box = (c: Point, r0: number): Point[] => [[c[0] - r0, c[1] - r0], [c[0] + r0, c[1] - r0], [c[0] + r0, c[1] + r0], [c[0] - r0, c[1] + r0]];
    for (const [kind, c, height] of [["hill", far(0), 10], ["canyon", far(-12), 2]] as const) {
      const p = planLandform({ outline: box(c, 5), kind, edgeStyle: "gentle", height }, planContextOf(s), `f-bake${kind.slice(0, 4)}aaaaaa`.slice(0, 15), "user");
      expect(p.ok, p.ok ? "" : p.errors.join()).toBe(true);
      if (p.ok) expect(s.applyAll(p.ops, "user", p.label).ok).toBe(true);
    }
    const land = s.built.heights.slice();
    const generated = s.features.filter((f) => f.kind === "landform" && f.origin === "generated").length;
    // the project as it was saved, opened again
    const o = MapSession.open(s.document);
    expect(bakeLandforms(o)).toBe(2);
    expect(Array.from(o.built.heights)).toEqual(Array.from(land));
    expect(o.features.filter((f) => f.kind === "landform" && f.origin !== "generated")).toEqual([]);
    expect(o.features.filter((f) => f.kind === "landform" && f.origin === "generated").length).toBe(generated);
    expect(o.history().at(-1)!.label).toBe(BAKE_LABEL);
    // undo brings them back, the land still the same
    o.undo();
    expect(o.features.filter((f) => f.kind === "landform" && f.origin !== "generated").length).toBe(2);
    expect(Array.from(o.built.heights)).toEqual(Array.from(land));
    // and the baked map replays to the same land from its document
    o.redo();
    expect(Array.from(MapSession.open(o.document).built.heights)).toEqual(Array.from(land));
  });

  it("a map with only the generator's landforms is left as it is", () => {
    const r = generate(makeSpec({ seed: 7, size: { x: W, y: W }, theme: "riverValley" }));
    const s = MapSession.fromGenerated(r, r.file);
    const n = s.history().length;
    expect(bakeLandforms(s)).toBe(0);
    expect(s.history().length).toBe(n);
  });
});
