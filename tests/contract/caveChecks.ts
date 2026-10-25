// What the tests of maps with caves share (#435, D120): the export's blocking checks in both validators (the
// TypeScript one and prototype/validate.py). The test cave and the Block dig into a hillside are caveMap.ts's.

import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect } from "vitest";
import { readTimber } from "../../src/core/format/timber";
import { blocks } from "../../src/core/validate/report";
import { validateMap } from "../../src/core/validate/checks";

/** Python with numpy for prototype/validate.py (CI installs it; a machine without it skips that half). */
export const PY = (() => {
  for (const exe of [process.env.PYTHON ?? "python", "python3"]) {
    const r = spawnSync(exe, ["-c", "import numpy"], { encoding: "utf8" });
    if (!r.error && r.status === 0) return exe;
  }
  return null;
})();

/** The export's blocking checks (load and principle, D3) that fail, in the TypeScript validator and in
 *  prototype/validate.py, by id. */
export function exportProblems(bytes: Uint8Array, name: string): { ts: string[]; py: string[] | null } {
  const v = validateMap(readTimber(bytes), { profile: "export" });
  const ts = v.report.checks.filter((c) => blocks("export", c)).map((c) => `${c.id}: ${c.message}`);
  const blocking = new Set(v.report.checks.filter((c) => c.class === "load" || c.class === "principle").map((c) => c.id));
  if (!PY) return { ts, py: null };
  const dir = mkdtempSync(join(tmpdir(), "caves-save-"));
  try {
    const path = join(dir, name);
    writeFileSync(path, bytes);
    const out = spawnSync(PY, ["-B", "prototype/validate.py", "--profile", "export", "--json", path], { encoding: "utf8", maxBuffer: 64 << 20 });
    const line = (out.stdout ?? "").split(/\r?\n/).find((l) => l.startsWith("{"));
    expect(line, out.stderr).toBeDefined();
    const j = JSON.parse(line!) as { checks: { id: string; ok: boolean; advisory: boolean; information: boolean; detail: string }[] };
    return { ts, py: j.checks.filter((c) => !c.ok && !c.advisory && !c.information && blocking.has(c.id)).map((c) => `${c.id}: ${c.detail}`) };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

