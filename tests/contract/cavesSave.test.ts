// Caves and arches made on a map without caves save and export (#435, D120): a hollow the Block tool or
// Erode leaves on a generated map, or on an import with no caves of its own, is terrain above terrain,
// so its water is the stacked engine's on every water column and the file writes it so (water on every
// column, soil on every run top), the way it does for a cave import. Saved, reopened and exported, the
// bytes are the same; both validators' export profile passes; undone back to plain, the map is a
// heightfield again and exports the same bytes as before the hollow.

import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { rowWords } from "../../src/core/doc/checkItems";
import { decodeProject } from "../../src/core/doc/document";
import { MapSession } from "../../src/core/doc/session";
import { ERODE_DEFAULTS } from "../../src/core/forces/erode";
import { readTimber } from "../../src/core/format/timber";
import { generate } from "../../src/core/gen/generate";
import { makeSpec } from "../../src/core/spec/mapspec";
import type { BlocksParams } from "../../src/core/doc/blockTool";
import { HazardRun } from "../../src/core/sim/weather";
import { blocks, failing } from "../../src/core/validate/report";
import { validateMap } from "../../src/core/validate/checks";
import { runGenerate } from "../../src/worker/api";
import * as ed from "../../src/worker/session";
import { caveSession } from "./caveMap";

/** Python with numpy for prototype/validate.py (CI installs it; a machine without it skips that half). */
const PY = (() => {
  for (const exe of [process.env.PYTHON ?? "python", "python3"]) {
    const r = spawnSync(exe, ["-c", "import numpy"], { encoding: "utf8" });
    if (!r.error && r.status === 0) return exe;
  }
  return null;
})();

const dig = (x: number, y: number, z: number, side: BlocksParams["side"]) => ({ op: "blocks" as const, params: { mode: "remove", side, at: [[x, y, z]], size: 1 } as BlocksParams });

/** A dry foot of a hillside, nothing near, its face `rise`+ higher to the east: the block at the foot's
 *  level in the face is dug from the side, a roof over the hollow. */
function hillside(s: MapSession, rise = 3): { x: number; y: number; z: number } {
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

/** The first dry tile at the foot of a cliff `drop`+ high (Erode wears a cave into its face). */
function cliffFoot(s: MapSession, drop: number): number {
  const { W, H, heights, water } = s.built;
  for (let y = 3; y < H - 3; y++)
    for (let x = 3; x < W - 3; x++) {
      const i = y * W + x;
      if (water[i] <= 0.01 && [i - 1, i + 1, i - W, i + W].some((j) => heights[j] - heights[i] >= drop)) return i;
    }
  throw new Error("no cliff");
}

/** The export's blocking checks (load and principle, D3) that fail, in the TypeScript validator and in
 *  prototype/validate.py, by id. */
function exportProblems(bytes: Uint8Array, name: string): { ts: string[]; py: string[] | null } {
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

/** What the file's water arrays hold: their levels, which must cover every column the terrain has. */
function waterArrays(bytes: Uint8Array): { ok: boolean; levels: number } {
  const c = validateMap(readTimber(bytes), { profile: "export", loadOnly: true }).report.checks.find((x) => x.id === "file.arrays")!;
  return { ok: !failing(c), levels: Number(c.value) };
}

/** Saved, reopened and exported: the same bytes; the export's checks pass; its water on every column. */
function savesAndExports(s: MapSession, name: string): Uint8Array {
  s.settleCanonical();
  expect(s.built.waterModel.stacked).toBeDefined();
  expect(s.built.settle.stack?.stacked).toBe(true);
  const bytes = s.exportTimber().bytes;
  const arrays = waterArrays(bytes);
  expect(arrays.ok).toBe(true);
  expect(arrays.levels).toBeGreaterThanOrEqual(2);
  const again = MapSession.open(decodeProject(s.project()));
  again.settleCanonical();
  expect(again.built.settle.stack?.stacked).toBe(true);
  expect(Buffer.from(again.exportTimber().bytes).equals(Buffer.from(bytes))).toBe(true);
  const p = exportProblems(bytes, name);
  expect(p.ts).toEqual([]);
  if (p.py) expect(p.py).toEqual([]);
  return bytes;
}

describe("a hollow made on a map without caves saves and exports (#435)", () => {
  const r = generate(makeSpec({ seed: 3, theme: "riverValley", size: { x: 64, y: 64 } }));

  it("a Block dig into a hillside on a generated map: water per column, the same bytes reopened, and undone, the same bytes as before", () => {
    const s = MapSession.fromGenerated(r, r.file);
    s.settleCanonical();
    const plain = s.exportTimber().bytes;
    expect(s.built.waterModel.stacked).toBeUndefined();
    const { x, y, z } = hillside(s);
    expect(s.apply(dig(x, y, z, "-x")).errors).toEqual([]);
    expect(s.plainAt(y * s.built.W + x)).toBe(false);
    savesAndExports(s, "dig.timber");
    // Drought and Badtide behave as on a cave import
    const hazard = (m: MapSession) => { m.settleCanonical(); const w = m.waterShown(); return new HazardRun(m.built.waterModel, { depth: Float64Array.from(w.depth), contamination: Float64Array.from(w.contamination), stack: w.stack }, "drought", 1); };
    const dug = hazard(s), cave = hazard(caveSession());
    expect([dug.stack !== null, dug.sim === null]).toEqual([cave.stack !== null, cave.sim === null]);
    expect(dug.stack).not.toBeNull();
    // undone, a heightfield again: the same model, water and file as before the hollow
    expect(s.undo()).toBe(true);
    s.settleCanonical();
    expect(s.built.waterModel.stacked).toBeUndefined();
    expect(s.built.settle.stack).toBeUndefined();
    expect(Buffer.from(s.exportTimber().bytes).equals(Buffer.from(plain))).toBe(true);
  });

  it("the same on an import with no caves of its own", () => {
    const s = MapSession.importMap(r.bytes, "plain.timber");
    expect(s.columns.size).toBe(0);
    const plain = s.exportTimber().bytes;
    const { x, y, z } = hillside(s);
    expect(s.apply(dig(x, y, z, "-x")).errors).toEqual([]);
    savesAndExports(s, "import-dig.timber");
    expect(s.undo()).toBe(true);
    expect(s.built.waterModel.stacked).toBeUndefined();
    expect(Buffer.from(s.exportTimber().bytes).equals(Buffer.from(plain))).toBe(true);
  });

  it("an Erode cave on a generated map: water per column, the same bytes reopened, and undone, the same bytes as before", async () => {
    await runGenerate(makeSpec({ seed: 21, theme: "highlands", size: { x: 96, y: 96 } }));
    ed.refine();
    const plain = MapSession.open(decodeProject(ed.project().bytes));
    plain.settleCanonical();
    const before = plain.exportTimber().bytes;
    const foot = cliffFoot(plain, 7);
    expect(ed.forceStart({ verb: "erode", settings: { ...ERODE_DEFAULTS, power: 70, seed: 3 }, path: [{ x: foot % 96, y: Math.floor(foot / 96) }], cut: null }).errors).toEqual([]);
    for (let k = 0; k < 200; k++) if (ed.forceAdvance(4)!.done) break;
    expect(ed.forceStop().kept).toBe(true);
    const s = MapSession.open(decodeProject(ed.project().bytes));
    expect(s.columns.size).toBeGreaterThan(0);
    savesAndExports(s, "erode.timber");
    ed.undo();
    const undone = MapSession.open(decodeProject(ed.project().bytes));
    expect(undone.columns.size).toBe(0);
    undone.settleCanonical();
    expect(undone.built.waterModel.stacked).toBeUndefined();
    expect(Buffer.from(undone.exportTimber().bytes).equals(Buffer.from(before))).toBe(true);
  }, 120000);

  it("a file whose own water is short of its caves' levels says what saves it again (it has no tile to show)", () => {
    expect(rowWords("file.arrays", "Water saved with 1 level, the terrain needs 2")).toBe("Water saved with 1 level, the caves need 2: an edit to the ground saves it again");
  });
});
