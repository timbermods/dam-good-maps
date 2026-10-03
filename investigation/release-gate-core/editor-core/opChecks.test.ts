// Every change to a map is an operation, validated and refused with a plain one-line reason when it
// is invalid (D342 (1), (4)). An operation the check accepts must apply cleanly; one that would leave
// the map in a state no tool can get out of is refused.
import { describe, expect, it } from "vitest";
import type { EditOp } from "../../../src/core/doc/ops";
import { reopen, session } from "./helpers";

describe("operations the check accepts", () => {
  it("a source's strength that is not a number is refused, not accepted into the log (where the session then throws and its project never reopens)", () => {
    const s = session();
    const src = s.built.entities.find((e) => e.template === "WaterSource")!;
    const op = { op: "setEntityProps", params: { id: src.id, components: { WaterSource: { SpecifiedStrength: "lots", CurrentStrength: "lots" } } } } as unknown as EditOp;
    // the check must give a reason
    expect(s.check(op).length).toBeGreaterThan(0);
    // and applying it must leave the document as it was, its project still opening
    let threw = false;
    try {
      s.apply(op);
    } catch {
      threw = true;
    }
    expect(threw).toBe(false);
    expect(s.document.edits.length).toBe(0);
    expect(() => reopen(s)).not.toThrow();
  });

  it("deleting a generated map's start object on its own is refused (the start is a feature: deleted with deleteFeature, or the map is left with no start and none can be placed again)", () => {
    const s = session();
    const start = s.built.entities.find((e) => e.template === "StartingLocation")!;
    const del: EditOp = { op: "deleteEntities", params: { entities: [start.id] } };
    const errors = s.check(del);
    if (errors.length) return;
    // accepted today: the map then has no start, and every way to put one back is refused
    s.apply(del);
    expect(s.built.entities.some((e) => e.template === "StartingLocation")).toBe(false);
    const f = s.features.find((x) => x.kind === "start")!;
    const again: EditOp = { op: "addFeature", params: { feature: { ...f, id: "0d6a3c55-2c1e-4c1b-9a51-3f0f6f1e2a77", origin: "user" } } };
    expect(s.check(again), "a start can be placed again").toEqual([]);
  });
});
