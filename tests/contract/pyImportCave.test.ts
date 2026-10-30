// An imported map with a cave passes `prototype/validate.py --load-only` (D28, D43): terrain.single_floor is
// information on an import, never blocking, as the TypeScript checks have it; the row is still reported.

import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MapSession } from "../../src/core/doc/session";
import { generate } from "../../src/core/gen/generate";
import { makeSpec } from "../../src/core/spec/mapspec";
import { dig, hillside } from "./caveMap";
import { PY } from "./caveChecks";

describe("the Python validator on an imported map with a cave", () => {
  it.skipIf(!PY)("passes --load-only, the single-floor row reported as advisory", () => {
    // a generated map with a hollow dug into a hillside, exported: a cave, and no project file beside it
    const r = generate(makeSpec({ seed: 3, theme: "riverValley", size: { x: 64, y: 64 } }));
    const s = MapSession.fromGenerated(r, r.file);
    const { x, y, z } = hillside(s);
    expect(s.apply(dig(x, y, z, "-x")).errors).toEqual([]);
    s.settleCanonical();
    const dir = mkdtempSync(join(tmpdir(), "py-import-cave-"));
    try {
      const path = join(dir, "Cave.timber");
      writeFileSync(path, s.exportTimber().bytes);
      const out = spawnSync(PY!, ["-B", "prototype/validate.py", "--load-only", "--json", path], { encoding: "utf8", maxBuffer: 64 << 20 });
      const line = (out.stdout ?? "").split(/\r?\n/).find((l) => l.startsWith("{"));
      expect(line, out.stderr).toBeDefined();
      const checks = (JSON.parse(line!) as { checks: { id: string; ok: boolean; advisory: boolean; detail: string }[] }).checks;
      const row = checks.find((c) => c.id === "terrain.single_floor");
      expect(row, "the row is reported").toBeDefined();
      expect(row!.ok).toBe(false);
      expect(row!.advisory).toBe(true);
      expect(checks.filter((c) => !c.ok && !c.advisory).map((c) => `${c.id}: ${c.detail}`)).toEqual([]);
      expect(out.status, out.stdout).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
