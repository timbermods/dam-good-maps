// ROADMAP M8 (EDITOR_PLAN §6, E5): validation parity between the editor and the generator. The
// editor previews water warm-started from its previous state, then settles it canonically in the
// background and validates. Whatever the preview did, the editor's verdicts are the generator's
// validator's on the file it exports, check by check, and its map equals a full build. The water a
// file gets is always the canonical settle (PLAN §19.7); the preview's is never written.

import { describe, expect, it } from "vitest";
import { MapSession } from "../../src/core/doc/session";
import { planContextOf, planLake } from "../../src/core/doc/tools";
import { readTimber } from "../../src/core/format/timber";
import { writeTimber } from "../../src/core/format/timber";
import { generate } from "../../src/core/gen/generate";
import { makeSpec, type ThemeId } from "../../src/core/spec/mapspec";
import { validateMap } from "../../src/core/validate/checks";
import type { CheckResult } from "../../src/core/validate/report";
import * as ed from "../../src/worker/session";
import { runGenerate } from "../../src/worker/api";

const verdict = (c: CheckResult) => (c.applicable === false ? "na" : c.approximate ? "approx" : c.ok ? "pass" : "fail");
const verdicts = (cs: readonly CheckResult[]) => cs.map((c) => [c.id, verdict(c)]);

/** A few local edits: ground lowered beside water, a lake with its spring, a forest removed. */
function edit(s: MapSession): void {
  const b = s.built;
  const W = b.W;
  let pick = -1;
  for (let i = 0; i < W * W && pick < 0; i += 5) {
    const x = i % W;
    const y = Math.floor(i / W);
    if (x < 12 || y < 12 || x > W - 14 || y > W - 14 || b.water[i] > 0) continue;
    if (b.start && Math.hypot(x - b.start.x, y - b.start.y) < 24) continue;
    let near = false;
    for (let dy = -3; dy <= 3 && !near; dy++) for (let dx = -3; dx <= 3; dx++) if (b.water[(y + dy) * W + x + dx] > 0.3) near = true;
    if (near) pick = i;
  }
  expect(pick).toBeGreaterThanOrEqual(0);
  const px = pick % W;
  const py = Math.floor(pick / W);
  const cells: [number, number, number][] = [];
  for (let y = py - 2; y <= py + 2; y++) cells.push([y, px - 2, px + 2]);
  expect(s.apply({ op: "sculpt", params: { mode: "lower", cells, amount: 1 } }).ok).toBe(true);
  // a lake somewhere it fits
  for (let y = 16; y < W - 16; y += 11) {
    let done = false;
    for (let x = 16; x < W - 16 && !done; x += 11) {
      const outline: [number, number][] = [
        [x - 3.5, y - 3.5],
        [x + 3.5, y - 3.5],
        [x + 3.5, y + 3.5],
        [x - 3.5, y + 3.5],
      ];
      const p = planLake({ outline }, planContextOf(s), "7a1b2c3d-1111-4222-8333-444455556666");
      if (p.ok && s.applyAll(p.ops, "user", p.label).ok) done = true;
    }
    if (done) break;
  }
  const forest = s.features.find((f) => f.kind === "forest" && f.origin === "generated");
  if (forest) expect(s.apply({ op: "deleteFeature", params: { id: forest.id } }).ok).toBe(true);
}

describe("validation parity between the editor and the generator (ROADMAP M8)", () => {
  it.each([
    ["riverValley", 96, 3],
    ["lakeBasin", 128, 5],
    ["islands", 96, 7],
  ] as [ThemeId, number, number][])("%s %i², seed %i: previewed edits, then the canonical settle: the editor's verdicts are the file's", (theme, size, seed) => {
    const r = generate(makeSpec({ seed, theme, size: { x: size, y: size } }));
    expect(r.report.passed).toBe(true);
    // unedited: the editor's checks are the generator's
    const s = MapSession.fromGenerated(r, r.file);
    s.setPreviewWater(true);
    expect(verdicts(s.validate("generate").report.checks)).toEqual(verdicts(r.report.checks));
    // edited with the preview's water
    edit(s);
    expect(s.waterPending).toBe(true);
    const v = s.validate("generate"); // settles canonically first
    expect(s.waterPending).toBe(false);
    const bytes = s.exportTimber().bytes;
    const again = validateMap(readTimber(bytes), { profile: "generate", spec: s.spec, features: s.features });
    expect(verdicts(v.report.checks)).toEqual(verdicts(again.report.checks));
    expect(Array.from(again.water!.depth)).toEqual(Array.from(s.built.water));
    // the map equals a full build: the preview left nothing behind
    const full = s.fullBuild();
    expect(Array.from(s.built.water)).toEqual(Array.from(full.water));
    expect(Buffer.from(s.exportTimber().bytes).equals(Buffer.from(writeTimber(s.exportFile(full))))).toBe(true);
  });

  it("the worker's background check equals its one-go export check, and the export is the canonical file", async () => {
    const spec = makeSpec({ seed: 21, size: { x: 96, y: 96 } });
    await runGenerate(spec);
    ed.refine();
    const s0 = ed.sessionInfo();
    expect(s0.kind).toBe("generated");
    // an edit: the preview's water shows until the background check has run
    const b = ed.sessionView();
    const W = b.view.W;
    // (ground clear of the map's objects: a sculpt under a mine site or a ruin would leave it
    // floating, a load problem that blocks the export; D252's start planting moved seed 21's first
    // candidate onto its mine site)
    const e = b.view.entities;
    const busy = new Uint8Array(W * W);
    for (let k = 0; k < e.count; k++) {
      if (/^(Pine|Birch|Oak|Succulent|BlueberryBush)$/.test(e.templates[e.template[k]])) continue;
      for (let dy = -6; dy <= 6; dy++) for (let dx = -6; dx <= 6; dx++) if (e.x[k] + dx >= 0 && e.x[k] + dx < W && e.y[k] + dy >= 0 && e.y[k] + dy < W) busy[(e.y[k] + dy) * W + e.x[k] + dx] = 1;
    }
    let at = -1;
    for (let i = W * 20; i < W * (W - 20) && at < 0; i += 3) if (b.view.heights[i] > 3 && (i % W) > 20 && (i % W) < W - 20 && !busy[i] && !busy[i + W]) at = i;
    const u = ed.apply({ op: "sculpt", params: { mode: "raise", cells: [[Math.floor(at / W), (at % W) - 2, (at % W) + 2]], amount: 1 } });
    expect(u.ok).toBe(true);
    const progress: number[] = [];
    const bg = await ed.backgroundCheck((p) => progress.push(p.done));
    expect(bg).not.toBeNull();
    const sync = ed.exportCheck();
    expect(bg!.check).toEqual(sync);
    // a newer edit drops a check that is running
    const u2 = ed.apply({ op: "sculpt", params: { mode: "lower", cells: [[Math.floor(at / W), (at % W) - 2, (at % W) + 2]], amount: 1 } });
    expect(u2.ok).toBe(true);
    const racing = ed.backgroundCheck();
    ed.apply({ op: "sculpt", params: { mode: "raise", cells: [[Math.floor(at / W) + 1, (at % W) - 2, (at % W) + 2]], amount: 1 } });
    const stale = await racing;
    expect(stale === null || stale.check.version === ed.sessionInfo().version).toBe(true);
    const out = await ed.exportTimber(true);
    expect(out.ok).toBe(true);
  });
});
