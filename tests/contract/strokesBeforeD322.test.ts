// Strokes saved before D322 replay exactly (D158). D322 changed the stroke record once: a target
// (the game editor's exact Raise, Lower and Flatten, item 37), a mode (Ground, Water or Both, item 2)
// and kept sources (item 31); it retired Precise and Flatten's Ramped edges and widened the size to
// half a 256² map (item 42). Every kind of stroke the editor saved before (soft and precise, held
// and stopped, ramped with and without its own slopes, in steps, smooth, naturalize, smart Lower's
// channels and deepening, square, a pen's pressure, a working area, kept runs, riding pieces) was
// recorded by the code before D322 (tests/fixtures/strokes-before-d322.*, written at 70290a3e):
// each stroke on its own terrain, and a project holding them all. They build byte for byte as they
// did. DGM_RECORD=1 writes the fixtures again (only ever from code before D322).

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { decodeProject } from "../../src/core/doc/document";
import { MapSession } from "../../src/core/doc/session";
import { applyBrush, type BrushParams } from "../../src/core/features/raster/brush";
import { generate } from "../../src/core/gen/generate";
import { makeSpec } from "../../src/core/spec/mapspec";

const DIR = join(__dirname, "../fixtures");
const PROJECT = join(DIR, "strokes-before-d322.damgoodmaps.json");
const DIGESTS = join(DIR, "strokes-before-d322.json");
const W = 96;
const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex").slice(0, 16);

/** Dabs along a line from (x0, y0) to (x1, y1) in tiles, `n` of them, each `hold` times. */
function line(x0: number, y0: number, x1: number, y1: number, n: number, hold = 1): number[] {
  const out: number[] = [];
  for (let k = 0; k < n; k++) {
    const t = n > 1 ? k / (n - 1) : 0;
    for (let h = 0; h < hold; h++) out.push(Math.round(4 * (x0 + (x1 - x0) * t)) + 2, Math.round(4 * (y0 + (y1 - y0) * t)) + 2);
  }
  return out;
}
const levels = (dabs: number[], f: (k: number) => number) => dabs.filter((_, j) => j % 2 === 0).map((_, k) => f(k));

/** Every kind of stroke saved before D322, at (x, y) on a map with ground level `h` there. */
function strokes(x: number, y: number, h: number): BrushParams[] {
  const hold = line(x, y, x, y, 1, 40);
  const drag = line(x - 6, y - 3, x + 6, y + 4, 14);
  const pen = line(x - 4, y + 5, x + 5, y + 5, 10);
  return [
    { tool: "raise", size: 5, strength: 5, dabs: hold },
    { tool: "lower", size: 3.5, strength: 8, dabs: drag },
    { tool: "raise", size: 4, strength: 3, shape: "square", dabs: drag },
    { tool: "raise", size: 3, strength: 6, dabs: pen, pressure: levels(pen, (k) => 40 + 20 * k) },
    { tool: "flatten", size: 6, strength: 5, level: Math.max(0, h - 1), dabs: drag },
    { tool: "flatten", size: 5, strength: 5, level: h + 2, steps: 2, dabs: drag },
    { tool: "flatten", size: 4, strength: 5, level: h + 1, precise: true, levels: levels(drag, () => 1), edges: "ramped", dabs: drag },
    { tool: "flatten", size: 4, strength: 5, level: h + 2, edges: "ramped", slopes: [[x + 8, y, 1]], dabs: line(x + 2, y, x + 5, y, 4) },
    { tool: "raise", size: 2, strength: 5, precise: true, levels: levels(hold, (k) => 1 + Math.floor(k / 8)), stop: h + 4, dabs: hold },
    { tool: "lower", size: 3, strength: 5, precise: true, levels: levels(drag, (k) => 1 + (k % 3)), keep: [[y, x, x + 1]], dabs: drag },
    { tool: "smooth", size: 5, strength: 7, dabs: drag },
    { tool: "smooth", size: 4, strength: 5, walkable: true, dabs: drag },
    { tool: "naturalize", size: 5, strength: 6, seed: 12345, dabs: drag },
    { tool: "lower", size: 3, strength: 5, channel: true, dabs: line(x - 8, y, x + 8, y, 12) },
    { tool: "lower", size: 3, strength: 5, channel: true, bed: Math.max(0, h - 2), dry: 3, dabs: line(x - 8, y + 2, x + 8, y + 2, 12) },
    { tool: "lower", size: 2, strength: 5, channel: true, deepen: true, dabs: line(x - 8, y + 2, x + 8, y + 2, 12) },
    { tool: "raise", size: 5, strength: 9, area: [[y - 2, x - 5, x + 5], [y - 1, x - 5, x + 5], [y, x - 5, x + 5], [y + 1, x - 5, x + 5], [y + 2, x - 5, x + 5]], dabs: hold },
    { tool: "raise", size: 5, strength: 10, rigid: [[x + 2, y - 1, x + 4, y + 1]], dabs: hold },
  ];
}

/** A synthetic terrain: a slope with a ridge and a pit, 48 × 48. */
function terrain(): Uint8Array {
  const n = 48;
  const t = new Uint8Array(n * n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) t[y * n + x] = Math.max(0, Math.min(16, 6 + Math.floor(x / 8) + (Math.abs(y - 20) < 2 ? 3 : 0) - (Math.hypot(x - 30, y - 30) < 4 ? 4 : 0)));
  return t;
}

/** A generated map and a dry, open spot on it. */
function map(): { s: MapSession; x: number; y: number; h: number } {
  const r = generate(makeSpec({ seed: 3, theme: "riverValley", size: { x: W, y: W } }));
  const s = MapSession.fromGenerated(r, r.file);
  const b = s.built;
  const st = b.start!;
  for (let y = 16; y < W - 16; y++)
    for (let x = 16; x < W - 16; x++) {
      if (Math.hypot(x - st.x, y - st.y) < 30) continue;
      let ok = true;
      for (let yy = y - 10; yy <= y + 10 && ok; yy++) for (let xx = x - 12; xx <= x + 12 && ok; xx++) if (b.water[yy * W + xx] > 0 || b.channel[yy * W + xx]) ok = false;
      if (ok) return { s, x, y, h: b.heights[y * W + x] };
    }
  throw new Error("no spot");
}

interface Digests {
  written: string;
  alone: string[];
  steps: string[];
  final: { heights: string; entities: string };
}

const entitiesOf = (s: MapSession) => sha(new TextEncoder().encode(s.built.entities.map((e) => `${e.id}@${e.template},${e.x},${e.y},${e.z},${e.orientation}`).join("|")));

describe("strokes saved before D322 replay exactly (D158)", () => {
  if (process.env.DGM_RECORD === "1")
    it("records them (code before D322 only)", () => {
      const t0 = terrain();
      const alone = strokes(20, 20, t0[20 * 48 + 20]).map((p) => {
        const t = t0.slice();
        applyBrush(p, t, 48, 48);
        return sha(t);
      });
      const { s, x, y, h } = map();
      const steps: string[] = [];
      for (const p of strokes(x, y, h)) {
        expect(s.apply({ op: "brush", params: p }, "user", p.tool).errors).toEqual([]);
        steps.push(sha(s.built.heights));
      }
      writeFileSync(PROJECT, s.project());
      const d: Digests = { written: "70290a3e (before D322)", alone, steps, final: { heights: sha(s.built.heights), entities: entitiesOf(s) } };
      writeFileSync(DIGESTS, JSON.stringify(d, null, 1) + "\n");
    });

  it("each stroke on its own gives the terrain it gave", () => {
    const d = JSON.parse(readFileSync(DIGESTS, "utf8")) as Digests;
    const t0 = terrain();
    const got = strokes(20, 20, t0[20 * 48 + 20]).map((p) => {
      const t = t0.slice();
      applyBrush(p, t, 48, 48);
      return sha(t);
    });
    expect(got).toEqual(d.alone);
  });

  it("the project saved with them opens to the same map, and replays each step the same", () => {
    const d = JSON.parse(readFileSync(DIGESTS, "utf8")) as Digests;
    const s = MapSession.open(decodeProject(new Uint8Array(readFileSync(PROJECT))));
    expect(sha(s.built.heights)).toBe(d.final.heights);
    expect(entitiesOf(s)).toBe(d.final.entities);
    // step by step: the saved strokes applied again one at a time, each map as it was
    const doc = decodeProject(new Uint8Array(readFileSync(PROJECT)));
    const saved = doc.edits;
    expect(saved).toHaveLength(d.steps.length);
    const again = MapSession.open({ ...doc, edits: [] });
    saved.forEach((o, k) => {
      expect(again.apply({ op: o.op, params: o.params } as never).errors, `stroke ${k + 1}`).toEqual([]);
      expect(sha(again.built.heights), `after stroke ${k + 1}`).toBe(d.steps[k]);
    });
  });
});
