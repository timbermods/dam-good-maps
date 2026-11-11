// The wall with one gate's map for a seed (docs/PREMISES.md §5.1): its plan, water and land, stage 3's start and one
// build with its checks (`src/core/premise/gateMap.ts` `gateMap`; the works not laid yet). Each map's line opens with
// the start's five check numbers (planning, #236), then its checks, its land invariants and its water settled on the
// land (the lake and the Still Pool against the sill, the Veil's curtain, the Gate and the leat dry, stray water, water
// on the edge but the Low River's); it writes a `.timber` the game loads, a project the page opens and a top-down
// picture (the ground shaded by height, settled water blue, moist ground green, trees dark dots, bushes red).
//
//   npx tsx tools/premise-gate-map.ts [--seed 1 | --seeds 1-12] [--size 128] [--theme riverValley] [--out .scratch/premise-gate]

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { encodeProject, generatedDocument } from "../src/core/doc/document";
import type { BuildResult } from "../src/core/features/build";
import { writeTimber } from "../src/core/format/timber";
import type { StyleTheme } from "../src/core/premise/choice";
import { gateMap, startNumbers } from "../src/core/premise/gateMap";
import { makeSpec } from "../src/core/spec/mapspec";
import { readGateSettle } from "../tests/contract/gateSettle";
import { encodePng } from "./png";

const args = process.argv.slice(2);
const opt = (name: string) => {
  const k = args.indexOf(`--${name}`);
  return k >= 0 ? args[k + 1] : undefined;
};
const side = Number(opt("size") ?? 128);
const theme = (opt("theme") ?? "riverValley") as StyleTheme;
const out = opt("out") ?? ".scratch/premise-gate";
const range = opt("seeds");
const seeds = range ? (([a, b]) => Array.from({ length: b - a + 1 }, (_, k) => a + k))(range.split("-").map(Number)) : [Number(opt("seed") ?? 1)];

function picture(b: BuildResult, top: number): { rgb: Uint8Array; width: number; height: number } {
  const { W, H } = b;
  const h = b.heights;
  const S = 4;
  const rgb = new Uint8Array(W * S * H * S * 3);
  const plant = new Map<number, [number, number, number]>();
  for (const e of b.entities) {
    const c: [number, number, number] | null = e.template === "BlueberryBush" ? [200, 30, 60] : ["Pine", "Birch", "Oak"].includes(e.template) ? [10, 70, 20] : null;
    if (c) plant.set(e.y * W + e.x, c);
  }
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const g = 60 + (170 * h[i]) / Math.max(1, top);
      const wv = x > 0 && y + 1 < H ? h[i] - h[(y + 1) * W + x - 1] : 0;
      const shade = Math.max(-40, Math.min(40, wv * 18));
      let c: [number, number, number] = [g * 0.8 + shade, g * 0.82 + shade, g * 0.62 + shade];
      if (b.settle.depth[i] > 0.05) {
        const k = Math.min(1, b.settle.depth[i] / 3);
        c = [70 - 50 * k, 150 - 60 * k, 220 - 40 * k];
      } else if (b.moisture[i] > 0) c = [c[0] * 0.55, c[1] * 0.95 + 10, c[2] * 0.45];
      const pc = plant.get(i);
      for (let a = 0; a < S; a++)
        for (let bb = 0; bb < S; bb++) {
          const px = pc && a > 0 && a < S - 1 && bb > 0 && bb < S - 1 ? pc : c;
          const o = ((H - 1 - y) * S + a) * W * S * 3 + (x * S + bb) * 3;
          rgb[o] = Math.max(0, Math.min(255, px[0]));
          rgb[o + 1] = Math.max(0, Math.min(255, px[1]));
          rgb[o + 2] = Math.max(0, Math.min(255, px[2]));
        }
    }
  return { rgb, width: W * S, height: H * S };
}

for (const seed of seeds) {
  const spec = makeSpec({ seed, size: { x: side, y: side }, theme: "any", premise: "any" });
  const t0 = performance.now();
  const r = gateMap(spec, theme);
  const ms = performance.now() - t0;
  if ("reason" in r) {
    console.log(`seed ${seed}: ${r.reason}`);
    continue;
  }
  if (!r.map) {
    console.log(`seed ${seed}: no start for the first frame (${r.frame.reason})`);
    continue;
  }
  const m = r.map;
  const five = startNumbers(m);
  const nums = Object.entries(five).map(([id, c]) => `${id.slice(6)} ${c.value}${c.ok ? "" : ` (under ${c.limit})`}`).join(", ");
  const failed = m.report.checks.filter((c) => !c.ok && c.severity === "error").map((c) => `${c.id}: ${c.message}`);
  console.log(`seed ${seed} at ${side}²: ${nums}; ${failed.length ? `FAILS ${failed.join("; ")}` : "every blocking check passes"}; ${(ms / 1000).toFixed(1)} s`);
  if (r.landFails.length) console.log(`  land FAILS ${r.landFails.map((f) => `${f.id}: ${f.reason}`).join("; ")}`);
  const s = readGateSettle(r.plan, r.water, m.built.heights, m.built.settle, 0, r.land.niches);
  const L = (id: string) => s.levels.find((l) => l.id === id)!;
  console.log(`  settled: lake ${L("lake").level.toFixed(2)} (sill ${L("lake").sill}), Still Pool ${L("kettle").level.toFixed(2)}, cleft ${L("pool").level.toFixed(2)} (lip ${L("pool").sill}); the Veil ${s.veil.ok ? "pours" : "FAILS"}: ${s.veil.note}; Gate ${s.gateWet} and leat ${s.leatWet} wet past their bars; stray ${s.stray}; edge ${s.edge}`);
  mkdirSync(out, { recursive: true });
  const name = `wallGate-${theme}-${side}-${seed}`;
  const doc = generatedDocument({ spec, features: m.features, built: m.built, file: m.file, field: m.field, name: m.name, description: r.plan.line });
  writeFileSync(join(out, `${name}.damgoodmaps`), encodeProject(doc));
  writeFileSync(join(out, `${name}.timber`), writeTimber(m.file));
  const p = picture(m.built, spec.settings.terrain.highestTerrain);
  writeFileSync(join(out, `${name}.png`), encodePng(p.rgb, p.width, p.height));
  if (seeds.length === 1) console.log(`  ${join(out, name)}.{timber,damgoodmaps,png}`);
}
