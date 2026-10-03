// The automatic water fix (PLAN §20 D330, the UI brief §5): when a check that needs settled water
// fails after the player's edits, the generator side fixes it by itself (a spring by the start), never
// by replacing the map. src/core/doc/waterFix.ts, callable on any map as edited.

import { describe, expect, it } from "vitest";
import { MapSession } from "../../src/core/doc/session";
import { waterFix } from "../../src/core/doc/waterFix";
import { generate } from "../../src/core/gen/generate";
import { decodeSpecFragment } from "../../src/core/spec/mapspec";

const failing = (s: MapSession) =>
  s
    .validate("export")
    .report.checks.filter((c) => !c.ok && c.applicable !== false && !c.advisory)
    .map((c) => c.id);

describe("the automatic water fix (D330)", () => {
  const r = generate(decodeSpecFragment("s=5&t=riverValley&z=96")!.spec);

  it("has nothing to fix on a map whose water checks pass", () => {
    expect(waterFix(MapSession.fromGenerated(r, r.file))).toBeNull();
  });

  it("places a spring by the start when its water is gone, and the start's checks pass again", () => {
    const s = MapSession.fromGenerated(r, r.file);
    const ids = s.built.entities.filter((e) => e.template === "WaterSource").map((e) => e.id);
    expect(s.apply({ op: "deleteEntities", params: { entities: ids } }, "user", "Delete sources").errors).toEqual([]);
    s.settleCanonical();
    const before = failing(s);
    expect(before).toContain("start.water");
    const history = s.history().length;
    const f = waterFix(s)!;
    expect(f).not.toBeNull();
    // (the map it was given is left as it was)
    expect(s.history().length).toBe(history);
    expect(f.fixes).toContain("start.water");
    expect(f.ops.every((o) => o.op === "placeEntity")).toBe(true);
    // applied as one step: the spring's water reaches the start, and nothing new fails
    expect(s.applyAll(f.ops, "user", f.label).errors).toEqual([]);
    expect(s.history().length).toBe(history + 1);
    s.settleCanonical();
    const after = failing(s);
    expect(after).not.toContain("start.water");
    expect(after.filter((id) => !before.includes(id))).toEqual([]);
    // and the same map gives the same fix
    const again = MapSession.fromGenerated(r, r.file);
    again.apply({ op: "deleteEntities", params: { entities: ids } }, "user", "Delete sources");
    again.settleCanonical();
    expect(JSON.stringify(waterFix(again)!.ops)).toBe(JSON.stringify(f.ops));
  });
});
