// Naturalize strokes saved with D399's first rule (`weathering: 2`, the whole stroke weathered at once)
// replay exactly (D158) after the rule that weathers dab by dab (`weathering: 3`). The strokes (held and
// dragged, every size, square, a pen's pressure, a working area, kept runs) were recorded by the code of
// `weathering: 2` (tests/fixtures/strokes-weathering-2.*, written at 647e45e1): each stroke on its own
// terrain, and a project holding them all, with the water each recorded (`rim`, `shore`, `pools`). They
// build byte for byte as they did. DGM_RECORD_W2=1 writes the fixtures again (only ever from that code).

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
const PROJECT = join(DIR, "strokes-weathering-2.damgoodmaps.json");
const DIGESTS = join(DIR, "strokes-weathering-2.json");
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

/** Naturalize strokes as the editor painted them with D399's first rule, at (x, y) (the session gave
 *  them `weathering: 2` and their water; on their own, `weathering: 2` is given here). */
function strokes(x: number, y: number): BrushParams[] {
  const hold = line(x, y, x, y, 1, 40);
  const drag = line(x - 6, y - 3, x + 6, y + 4, 14);
  const long = line(x - 10, y + 6, x + 10, y - 6, 30);
  const pen = line(x - 4, y + 5, x + 5, y + 5, 10);
  const nat = (p: Omit<BrushParams, "tool" | "weathers">): BrushParams => ({ tool: "naturalize", weathers: true, ...p });
  return [
    nat({ size: 5, strength: 5, seed: 12345, dabs: drag }),
    nat({ size: 2, strength: 9, seed: 7, dabs: hold }),
    nat({ size: 9, strength: 10, seed: 99, dabs: long }),
    nat({ size: 16, strength: 3, seed: 2024, dabs: line(x, y, x + 1, y, 2) }),
    nat({ size: 4, strength: 6, seed: 5, shape: "square", dabs: drag }),
    nat({ size: 3, strength: 7, seed: 11, dabs: pen, pressure: pen.filter((_, j) => j % 2 === 0).map((_, k) => 40 + 20 * k) }),
    nat({ size: 6, strength: 8, seed: 13, area: [[y - 2, x - 5, x + 5], [y - 1, x - 5, x + 5], [y, x - 5, x + 5], [y + 1, x - 5, x + 5], [y + 2, x - 5, x + 5]], dabs: hold }),
    nat({ size: 5, strength: 5, seed: 17, keep: [[y, x, x + 2]], dabs: drag }),
  ];
}

/** A synthetic terrain: a terraced slope with a cliff and a pit, 48 × 48. */
function terrain(): Uint8Array {
  const n = 48;
  const t = new Uint8Array(n * n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) t[y * n + x] = Math.max(0, Math.min(16, 4 + Math.floor(x / 5) + (x > 26 ? 3 : 0) - (Math.hypot(x - 30, y - 30) < 4 ? 4 : 0)));
  return t;
}

/** A generated map at Terracing 100 and a dry, open spot on it. */
function map(): { s: MapSession; x: number; y: number } {
  const spec = makeSpec({ seed: 3, theme: "riverValley", size: { x: W, y: W } });
  spec.settings.terrain.terracing = 100;
  const r = generate(spec);
  const s = MapSession.fromGenerated(r, r.file);
  const b = s.built;
  const st = b.start!;
  for (let y = 16; y < W - 16; y++)
    for (let x = 16; x < W - 16; x++) {
      if (Math.hypot(x - st.x, y - st.y) < 30) continue;
      let ok = true;
      for (let yy = y - 10; yy <= y + 10 && ok; yy++) for (let xx = x - 12; xx <= x + 12 && ok; xx++) if (b.water[yy * W + xx] > 0 || b.channel[yy * W + xx]) ok = false;
      if (ok) return { s, x, y };
    }
  throw new Error("no spot");
}

interface Digests {
  written: string;
  alone: string[];
  final: { heights: string; entities: string };
}

const entitiesOf = (s: MapSession) => sha(new TextEncoder().encode(s.built.entities.map((e) => `${e.id}@${e.template},${e.x},${e.y},${e.z},${e.orientation}`).join("|")));

describe("Naturalize strokes saved with `weathering: 2` replay exactly (D158)", () => {
  if (process.env.DGM_RECORD_W2 === "1")
    it("records them (the code of `weathering: 2` only)", () => {
      const t0 = terrain();
      const alone = strokes(24, 24).map((p) => {
        const t = t0.slice();
        applyBrush({ ...p, weathering: 2 }, t, 48, 48);
        return sha(t);
      });
      const { s, x, y } = map();
      for (const p of strokes(x, y)) expect(s.apply({ op: "brush", params: p }, "user", "Naturalize").errors).toEqual([]);
      writeFileSync(PROJECT, s.project());
      const d: Digests = { written: "647e45e1 (weathering: 2)", alone, final: { heights: sha(s.built.heights), entities: entitiesOf(s) } };
      writeFileSync(DIGESTS, JSON.stringify(d, null, 1) + "\n");
    });

  it("each stroke on its own gives the terrain it gave", () => {
    const d = JSON.parse(readFileSync(DIGESTS, "utf8")) as Digests;
    const t0 = terrain();
    const got = strokes(24, 24).map((p) => {
      const t = t0.slice();
      applyBrush({ ...p, weathering: 2 }, t, 48, 48);
      return sha(t);
    });
    expect(got).toEqual(d.alone);
  });

  it("the project saved with them opens to the same map", () => {
    const d = JSON.parse(readFileSync(DIGESTS, "utf8")) as Digests;
    const doc = decodeProject(new Uint8Array(readFileSync(PROJECT)));
    // (strokes with D399's first rule, and the water they recorded)
    expect(doc.edits.every((e) => e.op === "brush" && e.params.weathering === 2 && Array.isArray(e.params.shore))).toBe(true);
    const s = MapSession.open(doc);
    expect(sha(s.built.heights)).toBe(d.final.heights);
    expect(entitiesOf(s)).toBe(d.final.entities);
    // undo and redo of the last give the same map again
    s.undo();
    s.redo();
    expect(sha(s.built.heights)).toBe(d.final.heights);
  });
});
