// What blocks (D3): a principle blocks what the generator hands over, warns on a player's export and is
// information on an import; only a load problem blocks the export (a player's own map exports whenever the
// game will load it). rust/checks/src/report.rs's test holds its twin.

import { describe, expect, it } from "vitest";
import { blocks, severityOf, type CheckClass, type CheckResult, type Profile } from "../../src/core/validate/report";

const failing = (cls: CheckClass): CheckResult => ({ id: "x", class: cls, severity: "error", ok: false, message: "x" });

describe("what blocks in each profile (D3)", () => {
  it("a principle blocks generate, warns on export and is information on import", () => {
    const r = failing("principle");
    const at = (p: Profile) => ({ blocks: blocks(p, r), severity: severityOf(p, "principle", false) });
    expect(at("generate")).toEqual({ blocks: true, severity: "error" });
    expect(at("export")).toEqual({ blocks: false, severity: "warning" });
    expect(at("import")).toEqual({ blocks: false, severity: "info" });
  });

  it("only a load problem blocks the export", () => {
    expect(blocks("export", failing("load"))).toBe(true);
    expect(severityOf("export", "load", false)).toBe("error");
    for (const cls of ["playability", "design", "principle"] as const) {
      expect(blocks("export", failing(cls))).toBe(false);
      expect(blocks("generate", failing(cls))).toBe(true);
    }
  });
});
