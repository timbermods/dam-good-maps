// What the tests of maps with caves share (#435, D120): a Block dig into a hillside of a generated map, and the
// export's blocking checks in both validators (the TypeScript one and prototype/validate.py).

import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect } from "vitest";
import type { MapSession } from "../../src/core/doc/session";
import type { BlocksParams } from "../../src/core/doc/blockTool";
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

export const dig = (x: number, y: number, z: number, side: BlocksParams["side"]) => ({ op: "blocks" as const, params: { mode: "remove", side, at: [[x, y, z]], size: 1 } as BlocksParams });

/** A dry foot of a hillside, nothing near, its face `rise`+ higher to the east: the block at the foot's
 *  level in the face is dug from the side, a roof over the hollow. */
export function hillside(s: MapSession, rise = 3): { x: number; y: number; z: number } {
  const b = s.built;
  const W = b.W;
  const near = new Set<number>();
  for (const e of b.entities) for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) near.add((e.y + dy) * W + e.x + dx);
  for (let y = 6; y < b.H - 6; y++)
    for (let x = 6; x < W - 6; x++) {
      const i = y * W + x;
      const f = i + 1;
      if (b.heights[f] - b.heights[i] < rise || b.heights[f + 1] < b.heights[f] || b.water[i] > 0 || b.water[f] > 0 || b.channel[i] || near.has(i) || near.has(f)) continue;
      if (b.heights[f - W] !== b.heights[f] || b.heights[f + W] !== b.heights[f]) continue;
      return { x: x + 1, y, z: b.heights[i] };
    }
  throw new Error("no hillside");
}

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

