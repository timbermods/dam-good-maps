// E1 property tests (EDITOR_PLAN §9 and §10, ROADMAP M3 acceptance), on a generated map of every
// size preset: random operations, where after every step the incremental rebuild equals a full
// rebuild, byte for byte in the exported file; undo and redo along the way; then export, re-import
// and compare; the project file round trip; and undoing everything returns the exact starting map.

import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decodeProject } from "../../src/core/doc/document";
import { MapSession } from "../../src/core/doc/session";
import type { BuildResult } from "../../src/core/features/build";
import { entityJson } from "../../src/core/format/entities";
import { stringify } from "../../src/core/format/json";
import { writeTimber } from "../../src/core/format/timber";
import { generate } from "../../src/core/gen/generate";
import { stream } from "../../src/core/math/rng";
import { makeSpec, SIZE_PRESETS } from "../../src/core/spec/mapspec";
import { LOG_OPS, type EditOp } from "../../src/core/doc/ops";
import { randomOp } from "./randomOps";

const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");

/** Everything a build writes into a file, compared exactly. */
function expectSameBuild(a: BuildResult, b: BuildResult, what: string): void {
  expect(Buffer.from(a.heights).equals(Buffer.from(b.heights)), `${what}: heights`).toBe(true);
  for (const key of ["water", "contamination", "moisture", "soilContamination"] as const) {
    let diff = -1;
    for (let i = 0; i < a[key].length && diff < 0; i++) if (a[key][i] !== b[key][i]) diff = i;
    expect(diff, `${what}: ${key} differs at tile ${diff}`).toBe(-1);
  }
  expect(stringify(a.entities.map(entityJson)), `${what}: entities`).toBe(stringify(b.entities.map(entityJson)));
  expect(a.orphans, `${what}: orphans`).toEqual(b.orphans);
  expect(a.notes, `${what}: notes`).toEqual(b.notes);
}

const OPS: Record<number, number> = { 96: 40, 128: 32, 192: 20, 256: 16 };

/** Seeds re-picked where a map change left a preset's random draws without a tool edit, which the
 *  test needs (D148): the large preset on 305 since housekeeping's randomOps (no setLock) shifted
 *  the draws on M9a's maps, and 303 then applied none; the small preset on 306 since the draws took
 *  in Fill and Remove unfed water (#167's operations), and 301 then applied none; the max preset on 309
 *  since Remove unfed water joined the log operations (#176), and
 *  304 then never found unfed water to take; the max preset on 310 since M9b's maps changed the draws, and 309 then never found unfed water to take. */
const SEED_FOR: Record<number, number> = { 96: 306, 192: 305, 256: 310 };

// (River Valley and Any in turn: every map since M9a is a generated field, whose read-back features
// the random operations reshape too)
describe.each(Object.entries(SIZE_PRESETS).map(([name, side], k) => [name, side, SEED_FOR[side] ?? 301 + k, k % 2 ? "any" : "riverValley"] as const))("the %s preset (%i²), seed %i, %s", (_name, side, seed, theme) => {
  const r = generate(makeSpec({ seed, size: { x: side, y: side }, theme }));

  it("random operations: the incremental rebuild equals a full rebuild after every step, undo and redo included; export, re-import and compare; undo all", () => {
    expect(r.report.passed).toBe(true);
    const s = MapSession.fromGenerated(r);
    const rng = stream(seed, "e1-property-test");
    let applied = 0;
    let rejected = 0;
    const kinds = new Set<string>();
    // the random operations, then once more each log operation the draw has not produced yet, in
    // two passes: a kind that needs another first (Remove unfed water needs unfed water, which a Fill
    // makes) gets its second chance once the others have applied
    const sweep = [...LOG_OPS, ...LOG_OPS].map((kind) => () => {
      if (kinds.has(kind)) return null;
      for (let tries = 0; tries < 400; tries++) {
        const op = randomOp(s, rng);
        // the sweep looks for an operation of the kind that applies here (the random draws
        // already test rejections)
        if (op && !Array.isArray(op) && op.op === kind && s.check(op).length === 0) return op;
      }
      return null;
    });
    const draws: (() => EditOp | EditOp[] | null)[] = [...Array.from({ length: OPS[side] }, () => () => randomOp(s, rng)), ...sweep];
    let tools = 0;
    for (let step = 0; step < draws.length; step++) {
      const drawn = draws[step]();
      if (!drawn) continue;
      const before = s.document.edits.length;
      // a tool's edit is a group of operations applied as one step
      const res = Array.isArray(drawn) ? s.applyAll(drawn, "user", "tool") : s.apply(drawn);
      if (!res.ok) {
        // a rejection is clean: a reason, and nothing changed
        rejected++;
        expect(res.errors.length, JSON.stringify(drawn)).toBeGreaterThan(0);
        expect(s.document.edits.length).toBe(before);
        continue;
      }
      applied++;
      if (Array.isArray(drawn)) tools++;
      for (const op of Array.isArray(drawn) ? drawn : [drawn]) kinds.add(op.op);
      const name = Array.isArray(drawn) ? `a tool's ${drawn.map((o) => o.op).join("+")}` : drawn.op;
      expectSameBuild(s.built, s.fullBuild(), `after ${name} (step ${step})`);
      if (rng.float() < 0.25 && s.canUndo) {
        // step back and forth: the snapshots and the undo data give the same maps
        const n = 1 + rng.int(0, Math.min(3, s.history().filter((h) => h.applied).length));
        const bytes = sha(s.exportTimber().bytes);
        for (let k = 0; k < n; k++) s.undo();
        expectSameBuild(s.built, s.fullBuild(), `after ${n} undos (step ${step})`);
        for (let k = 0; k < n; k++) s.redo();
        expectSameBuild(s.built, s.fullBuild(), `after ${n} redos (step ${step})`);
        expect(sha(s.exportTimber().bytes)).toBe(bytes);
      }
    }
    expect(applied).toBeGreaterThanOrEqual(OPS[side] * 0.6);
    expect(tools).toBeGreaterThan(0);
    expect(rejected).toBeGreaterThanOrEqual(0);
    expect([...kinds].sort()).toEqual([...LOG_OPS].sort());
    // the incremental and the full build export the same file
    const exported = s.exportTimber().bytes;
    expect(sha(writeTimber(s.exportFile(s.fullBuild())))).toBe(sha(exported));

    // export, re-import and compare: our own file needs no normalization, and exports unchanged
    const again = MapSession.importMap(exported, "edited.timber");
    expect(again.meta.source!.report.changes).toEqual([]);
    expect(Buffer.from(again.built.heights).equals(Buffer.from(s.built.heights))).toBe(true);
    const ents = (b: BuildResult) => b.entities.map((e) => `${e.id} ${e.template} ${e.x},${e.y},${e.z} ${e.orientation}`).sort();
    expect(ents(again.built)).toEqual(ents(s.built));
    expect(sha(again.exportTimber().bytes)).toBe(sha(exported));
    // the load checks give the same verdicts on the edited map and on its re-import
    const load = (v: ReturnType<MapSession["validate"]>) => v.report.checks.filter((c) => c.class === "load").map((c) => `${c.id} ${c.ok}`);
    expect(load(again.validate("export"))).toEqual(load(s.validate("export")));

    // the project file opens to the same map
    const reopened = MapSession.open(decodeProject(s.project()));
    expect(sha(reopened.exportTimber().bytes)).toBe(sha(exported));
    expect(reopened.orphans()).toEqual(s.orphans());

    // undoing everything returns the exact starting map
    while (s.undo());
    expect(s.document.edits).toEqual([]);
    expect(s.features).toEqual(r.features);
    expectSameBuild(s.built, s.fullBuild(), "after undoing everything");
    expect(sha(s.exportTimber().bytes)).toBe(sha(r.bytes));
  });
});
