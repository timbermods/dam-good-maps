// Contract (Kyler, 2026-10-03): a check's message is player text. An object is named as the game
// shows it, then what is wrong in a few words, then its place as "X 105 · Y 7 · Z 11" (the game's
// order, Z the height), one line per object; counts take correct plurals. The ids and coordinates
// stay in the check's data.

import { describe, expect, it } from "vitest";
import { readTimber } from "../../src/core/format/timber";
import { generate } from "../../src/core/gen/generate";
import { makeSpec } from "../../src/core/spec/mapspec";
import { validateMap } from "../../src/core/validate/checks";
import { counted, nameOf } from "../../src/core/validate/words";
import type { JsonObject } from "../../src/core/format/json";

describe("check messages read as player text", () => {
  const r = generate(makeSpec({ seed: 4242, size: { x: 96, y: 96 } }));

  it("an object that cannot load is named, in a few words, with its place, one line each", () => {
    const f = readTimber(r.bytes);
    // lift two plants clear of the ground
    const plants = f.world.entities.filter((e) => e.Template === "Pine" || e.Template === "BlueberryBush").slice(0, 2);
    expect(plants.length).toBe(2);
    const at = plants.map((e) => {
      const c = (e.Components as JsonObject).BlockObject as JsonObject;
      const co = c.Coordinates as JsonObject;
      co.Z = Number(co.Z) + 6;
      return `X ${Number(co.X)} · Y ${Number(co.Y)} · Z ${Number(co.Z)}`;
    });
    const placement = validateMap(f, { profile: "export", loadOnly: true }).report.checks.find((c) => c.id === "entities.placement")!;
    expect(placement.ok).toBe(false);
    const lines = placement.message.split("\n");
    expect(lines.length).toBe(2);
    for (const [k, line] of lines.entries()) {
      expect(line).toMatch(/^(Pine|Blueberry bush) floating · X \d+ · Y \d+ · Z \d+$/);
      expect(at).toContain(line.split(" · ").slice(1).join(" · "));
      expect(k).toBeLessThan(2);
    }
    // nothing of the internals
    expect(placement.message).not.toMatch(/\bBlueberryBush\b|\(\d+,\d+/);
  });

  it("counts take the right plural, and objects their game names (the checks' own are rust/checks/src/words.rs)", () => {
    expect(nameOf("UndergroundRuins")).toBe("Mine site");
    expect(nameOf("RuinColumnH3")).toBe("Ruin");
    expect(counted(1, "mine site")).toBe("1 mine site");
    expect(counted(2, "mine site")).toBe("2 mine sites");
    expect(counted(2, "blueberry bush", "blueberry bushes")).toBe("2 blueberry bushes");
  });
});
