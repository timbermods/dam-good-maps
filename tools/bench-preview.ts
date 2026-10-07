// The editor's water preview after a local edit (ROADMAP M8 acceptance: a local edit re-previews
// in ≤ 2 s at 256²; EDITOR_PLAN §6, §9). On a generated map of each theme, a few local edits are
// applied the way the editor applies them: the rebuild with the warm-started preview water, the
// moisture and the plants on it. It reports each edit's time and preview ticks, how far the
// preview's water is from the canonical settle that follows, and the canonical settle's time.
//
//   npx tsx tools/bench-preview.ts [--size 256] [--themes riverValley,…] [--seed 1] [--budget 2000]
//
// Exits non-zero when an edit takes longer than the budget (ms).

import { MapSession } from "../src/core/doc/session";
import { planEntity } from "../src/core/doc/placing";
import type { EditOp } from "../src/core/doc/ops";
import type { RiverFeature } from "../src/core/features/schema";
import { generate } from "../src/core/gen/generate";
import { hypot } from "../src/core/math/portable";
import { AVAILABLE_THEMES, makeSpec, type ThemeId } from "../src/core/spec/mapspec";

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const size = Number(arg("size", "256"));
const seed = Number(arg("seed", "1"));
const budget = Number(arg("budget", "2000"));
const themes = arg("themes", AVAILABLE_THEMES.join(",")).split(",") as ThemeId[];

type Edit = { name: string; ops(s: MapSession): EditOp[] | null };

/** A dry tile 2–4 tiles from deep water, away from the start. */
function besideWater(s: MapSession): [number, number] | null {
  const b = s.built;
  const W = b.W;
  for (let i = 0; i < W * W; i += 7) {
    const x = i % W;
    const y = Math.floor(i / W);
    if (x < 12 || y < 12 || x > W - 14 || y > W - 14 || b.water[i] > 0) continue;
    if (b.start && hypot(x - b.start.x, y - b.start.y) < 24) continue;
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) if (b.water[(y + dy) * W + x + dx] > 0.3) return [x, y];
  }
  return null;
}

const EDITS: Edit[] = [
  {
    name: "lower ground beside water (7×7, 2 levels)",
    ops: (s) => {
      const at = besideWater(s);
      if (!at) return null;
      const cells: [number, number, number][] = [];
      for (let y = at[1] - 3; y <= at[1] + 3; y++) cells.push([y, at[0] - 3, at[0] + 3]);
      return [{ op: "sculpt", params: { mode: "lower", cells, amount: 2 } }];
    },
  },
  {
    name: "a water source from the shelf (strength 2)",
    ops: (s) => {
      const W = s.size.x;
      for (let y = 20; y < W - 20; y += 13)
        for (let x = 20; x < W - 20; x += 13) {
          const p = planEntity(s, { template: "WaterSource", x, y, orientation: "Cw0", components: { WaterSource: { SpecifiedStrength: 2, CurrentStrength: 2 } } }, "7a1b2c3d-1111-4222-8333-444455556666");
          if (p.ok) return p.ops;
        }
      return null;
    },
  },
  {
    name: "a dam across the main river (its channel raised 3 levels)",
    ops: (s) => {
      const river = s.features.find((f): f is RiverFeature => f.kind === "river" && "edge" in f.params.entry && !f.params.badwater);
      if (!river) return null;
      const W = s.size.x;
      const half = Math.ceil(river.params.width / 2) + 2;
      const start = s.built.start;
      for (const [px, py] of river.params.path.slice(1, -1)) {
        const [x, y] = [Math.round(px), Math.round(py)];
        if (x - half < 2 || y - half < 2 || x + half > W - 3 || y + half > W - 3 || (start && hypot(x - start.x, y - start.y) < 24)) continue;
        const cells: [number, number, number][] = [];
        for (let yy = y - half; yy <= y + half; yy++) cells.push([yy, x - half, x + half]);
        return [{ op: "sculpt", params: { mode: "raise", cells, amount: 3 } }];
      }
      return null;
    },
  },
  {
    name: "remove a grove (no water change)",
    ops: (s) => {
      const f = s.features.find((g) => g.kind === "forest");
      return f ? [{ op: "deleteFeature", params: { id: f.id } }] : null;
    },
  },
];

let worst = 0;
const rows: string[] = [];
for (const theme of themes) {
  const r = generate(makeSpec({ seed, theme, size: { x: size, y: size } }));
  for (const e of EDITS) {
    const s = MapSession.fromGenerated(r, r.file);
    s.setPreviewWater(true);
    const ops = e.ops(s);
    if (!ops) {
      rows.push(`${theme} ${size}²: ${e.name}: no place for it`);
      continue;
    }
    const t0 = performance.now();
    const a = s.applyAll(ops, "user", e.name);
    const ms = performance.now() - t0;
    if (!a.ok) {
      rows.push(`${theme} ${size}²: ${e.name}: refused (${a.errors[0]})`);
      continue;
    }
    worst = Math.max(worst, ms);
    const preview = s.built.water.slice();
    const pticks = s.built.settle.preview ? s.built.settle.ticks : 0;
    const t1 = performance.now();
    s.settleCanonical();
    const cms = performance.now() - t1;
    let maxd = 0;
    let differ = 0;
    for (let i = 0; i < preview.length; i++) {
      const d = Math.abs(preview[i] - s.built.water[i]);
      if (d > maxd) maxd = d;
      if (preview[i] > 0.05 !== s.built.water[i] > 0.05) differ++;
    }
    rows.push(
      `${theme} ${size}²: ${e.name}: ${Math.round(ms)} ms${pticks ? ` (preview ${pticks} ticks)` : " (water unchanged)"}; ` +
        `canonical settle after it ${Math.round(cms)} ms; the preview's water differs by at most ${maxd.toFixed(3)}, wet or dry on ${differ} tiles`,
    );
    console.log(rows[rows.length - 1]);
  }
}
console.log(`slowest edit: ${Math.round(worst)} ms (budget ${budget} ms)`);
process.exit(worst <= budget ? 0 : 1);
