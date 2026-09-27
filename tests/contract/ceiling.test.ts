// One height ceiling in the editor, on every map (PLAN §20 D244 step 2, after the Ceiling probe batch
// ceiling-20260927 passed): every brush, Select's levels and every force go up to D172's tall
// maximum and never past it; a map whose land goes above 16 becomes a tall map (its description's
// plain note, exported and validated as tall), and a standard map again at 16 or below (undo too);
// an unedited map's description is never touched.

import { describe, expect, it } from "vitest";
import { decodeProject } from "../../src/core/doc/document";
import { MapSession } from "../../src/core/doc/session";
import { applyBrush, BRUSH_MAX_LEVEL, brushProblems, type BrushParams } from "../../src/core/features/raster/brush";
import { MAX_TERRAIN } from "../../src/core/features/raster/terrain";
import { CRATER_DEFAULTS } from "../../src/core/forces/craterize";
import { ERUPT_DEFAULTS } from "../../src/core/forces/erupt";
import { forceCeiling } from "../../src/core/forces/force";
import { QUAKE_DEFAULTS } from "../../src/core/forces/quake";
import { GLACIATE_DEFAULTS } from "../../src/core/forces/glaciate/model";
import { CEILING, GAME_MAX_HEIGHT, isTall, TALL_NOTE, withTallNote } from "../../src/core/format/world";
import { readTimber } from "../../src/core/format/timber";
import { generate } from "../../src/core/gen/generate";
import { makeSpec } from "../../src/core/spec/mapspec";
import { validateMap } from "../../src/core/validate/checks";
import { runGenerate } from "../../src/worker/api";
import * as ed from "../../src/worker/session";

const W = 96;
const max = (h: ArrayLike<number>) => {
  let m = 0;
  for (let i = 0; i < h.length; i++) if (h[i] > m) m = h[i];
  return m;
};
const described = (bytes: Uint8Array) => String(readTimber(bytes).metadata?.MapDescription ?? "");

describe("one ceiling in the editor (D244)", () => {
  it("is D172's tall maximum everywhere: the brushes, the build, the forces, the operations' limits", () => {
    expect(CEILING).toBe(GAME_MAX_HEIGHT);
    expect(CEILING).toBe(22);
    expect(BRUSH_MAX_LEVEL).toBe(CEILING);
    expect(MAX_TERRAIN).toBe(CEILING);
    expect(forceCeiling(new Uint8Array(4).fill(3))).toBe(CEILING);
    const dabs = [4 * 10 + 2, 4 * 10 + 2];
    expect(brushProblems({ tool: "flatten", size: 3, strength: 5, level: CEILING, dabs }, 32, 32)).toEqual([]);
    expect(brushProblems({ tool: "flatten", size: 3, strength: 5, level: CEILING + 1, dabs }, 32, 32)).not.toEqual([]);
    expect(brushProblems({ tool: "raise", size: 3, strength: 5, precise: true, stop: CEILING, dabs }, 32, 32)).toEqual([]);
  });

  it("every brush reaches the ceiling and never passes it", () => {
    const Wb = 64;
    const held = Array.from({ length: 2000 }, () => [4 * 32 + 2, 4 * 32 + 2]).flat();
    for (const p of [
      { tool: "raise", size: 12, strength: 10 },
      { tool: "raise", size: 4, strength: 10, precise: true, levels: Array(2000).fill(CEILING) },
      { tool: "flatten", size: 12, strength: 10, level: CEILING },
      { tool: "flatten", size: 12, strength: 10, level: CEILING, precise: true, edges: "ramped", levels: Array(2000).fill(CEILING) },
    ] as Omit<BrushParams, "dabs">[]) {
      const h = new Uint8Array(Wb * Wb).fill(14);
      applyBrush({ ...p, dabs: held }, h, Wb, Wb);
      expect(max(h), `${p.tool}${p.precise ? " precise" : ""}${p.edges ? " ramped" : ""}`).toBe(CEILING);
    }
  });

  it("a map raised past 16 is tall: its description's note, exported and validated as tall; undo makes it standard again", async () => {
    await runGenerate(makeSpec({ seed: 3, theme: "riverValley", size: { x: W, y: W } }));
    ed.setEditorWaterMode("defer");
    ed.refine();
    const s0 = MapSession.open(decodeProject(ed.project().bytes));
    expect(isTall(s0.built.heights)).toBe(false);
    const before = s0.exportTimber().bytes;
    expect(described(before)).not.toContain(TALL_NOTE);
    // Select's Set level up to the ceiling, on a patch far from the start
    const st = s0.built.start!;
    const x0 = st.x < W / 2 ? 70 : 14;
    const y0 = st.y < W / 2 ? 70 : 14;
    const cells: [number, number, number][] = [];
    for (let y = y0; y < y0 + 6; y++) cells.push([y, x0, x0 + 5]);
    const u = ed.apply({ op: "sculpt", params: { mode: "flatten", cells, level: CEILING } }, "user", "Set level");
    expect(u.errors).toEqual([]);
    const s1 = MapSession.open(decodeProject(ed.project().bytes));
    expect(max(s1.built.heights)).toBe(CEILING);
    expect(isTall(s1.built.heights)).toBe(true);
    const tall = s1.exportTimber();
    expect(described(tall.bytes)).toContain(TALL_NOTE);
    expect(described(tall.bytes).startsWith(described(before))).toBe(true);
    const v = validateMap(readTimber(tall.bytes), { profile: "export", external: true, loadOnly: true, spec: null });
    const height = v.report.checks.find((c) => c.id === "terrain.max_height")!;
    expect(height.ok).toBe(true);
    expect(height.value).toBe(CEILING);
    expect(v.report.checks.filter((c) => c.class === "load" && !c.ok)).toEqual([]);
    // undo: standard again, without the note
    ed.undo();
    const s2 = MapSession.open(decodeProject(ed.project().bytes));
    expect(isTall(s2.built.heights)).toBe(false);
    expect(described(s2.exportTimber().bytes)).toBe(described(before));
  });

  it("the forces build up to the ceiling on any map, never past it", async () => {
    await runGenerate(makeSpec({ seed: 3, theme: "highlands", size: { x: W, y: W } }));
    ed.setEditorWaterMode("defer");
    ed.refine();
    const s = MapSession.open(decodeProject(ed.project().bytes));
    const st = s.built.start!;
    const at: [number, number] = [st.x < W / 2 ? 70 : 24, st.y < W / 2 ? 70 : 24];
    const run = (req: ed.ForceRequest) => {
      expect(ed.forceStart(req).errors).toEqual([]);
      for (let k = 0; k < 800 && !ed.forceAdvance(8)!.done; k++);
      expect(ed.forceStop().errors).toEqual([]);
      return MapSession.open(decodeProject(ed.project().bytes)).built.heights;
    };
    // a big eruption rises past 16 and stops at the ceiling at most
    const erupted = run({ verb: "erupt", settings: { ...ERUPT_DEFAULTS, power: 100 }, origin: at, cut: null });
    expect(max(erupted)).toBeGreaterThan(16);
    expect(max(erupted)).toBeLessThanOrEqual(CEILING);
    // a second one on its summit, and a Lift across it, still never past it
    expect(max(run({ verb: "erupt", settings: { ...ERUPT_DEFAULTS, power: 100, seed: 3 }, origin: at, cut: null }))).toBeLessThanOrEqual(CEILING);
    expect(max(run({ verb: "quake", settings: { ...QUAKE_DEFAULTS, power: 100 }, path: [{ x: at[0] - 12, y: at[1] }, { x: at[0] + 12, y: at[1] }], side: 1, cut: null }))).toBeLessThanOrEqual(CEILING);
    expect(max(run({ verb: "craterize", settings: { ...CRATER_DEFAULTS, power: 100 }, origin: [at[0] + 6, at[1] + 6], cut: null }))).toBeLessThanOrEqual(CEILING);
    // a glacier from the volcano's summit: its moraine and banks never past it either
    expect(max(run({ verb: "glaciate", settings: { ...GLACIATE_DEFAULTS, power: 100 }, origin: at, cut: null }))).toBeLessThanOrEqual(CEILING);
  });

  it("an unedited map keeps its description byte for byte; the note is plain words, added once and taken off again", () => {
    const r = generate(makeSpec({ seed: 7, theme: "riverValley", size: { x: 64, y: 64 } }));
    const s = MapSession.fromGenerated(r, r.file);
    s.setWaterMode("defer");
    expect(described(s.exportTimber().bytes)).toBe(String(r.file.metadata?.MapDescription ?? ""));
    const text = "A river.  ";
    expect(withTallNote(text, false)).toBe(text);
    const once = withTallNote(text, true);
    expect(once).toBe(`A river.\n\n${TALL_NOTE}`);
    expect(withTallNote(once, true)).toBe(once);
    expect(withTallNote(once, false)).toBe("A river.");
    expect(withTallNote("", true)).toBe(TALL_NOTE);
    expect(TALL_NOTE).toBe("Timberborn's map editor opens and saves this map as it is, but can't raise land above level 16.");
  });
});
