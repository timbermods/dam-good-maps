// Generates once for each shape and theme and prints whether it made a map, how long it took and, when it did not,
// why (PLAN §20 D357): the smoke check for the sizes beyond the standard ones. Not a quality measure.
//
//   npx tsx tools/size-smoke.ts [--shapes 4x4,16x200,64x512] [--themes riverValley,canyon] [--seed 1] [--md]
//                               [--thumbs <dir>]
//
// One line per run: shape, theme, ok or the refusal/crash, milliseconds, attempts, and where the start stands
// along the map's longer side (0 one end, 1 the other). --md also prints the table as Markdown. --thumbs writes
// each map's top-down picture (the longer side 128 pixels, the start marked red) and an index.json, which
// tools/size-sheet.py lays out as the step's contact sheet.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { generate } from "../src/core/gen/generate";
import { thumbnailPixels } from "../src/core/render/thumb";
import { THEMES, makeSpec, THEME_NAMES, type ThemeId } from "../src/core/spec/mapspec";
import { encodePng } from "./png";

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const shapes = arg("shapes", "4x4,16x200,64x512,128x512,512x256,512x512")
  .split(",")
  .map((s) => s.split("x").map(Number) as [number, number]);
const themes = arg("themes", THEMES.join(",")).split(",") as ThemeId[];
const seed = Number(arg("seed", "1"));
const thumbs = arg("thumbs", "");
if (thumbs) mkdirSync(thumbs, { recursive: true });

const rows: { shape: string; theme: ThemeId; result: string; ms: number; attempts: number; along: number | null; png: string | null }[] = [];
for (const [x, y] of shapes)
  for (const theme of themes) {
    const t0 = performance.now();
    let result: string;
    let attempts = 0;
    let along: number | null = null;
    let png: string | null = null;
    try {
      const r = generate(makeSpec({ seed, theme, size: { x, y } }));
      attempts = r.attempts;
      result = r.report.passed ? "ok" : `refused: ${r.report.checks.filter((c) => !c.ok).map((c) => `${c.id} (${c.message})`).join("; ")}`;
      const b = r.built;
      if (b.start) along = Math.round((x >= y ? b.start.x / (x - 1) : b.start.y / (y - 1)) * 100) / 100;
      if (thumbs && b.heights.length) {
        const t = thumbnailPixels(b.heights, b.W, b.H, b.water, 128);
        const rgb = new Uint8Array(t.w * t.h * 3);
        for (let i = 0; i < t.w * t.h; i++) for (let c = 0; c < 3; c++) rgb[i * 3 + c] = t.rgba[i * 4 + c];
        if (b.start) {
          // (the start, north up as the picture is)
          const px = Math.round((b.start.x * t.w) / b.W);
          const py = Math.round(((b.H - 1 - b.start.y) * t.h) / b.H);
          for (let dy = -1; dy <= 1; dy++)
            for (let dx = -1; dx <= 1; dx++) {
              const qx = px + dx;
              const qy = py + dy;
              if (qx >= 0 && qy >= 0 && qx < t.w && qy < t.h) rgb.set([230, 30, 30], (qy * t.w + qx) * 3);
            }
        }
        png = `${x}x${y}-${theme}.png`;
        writeFileSync(join(thumbs, png), encodePng(rgb, t.w, t.h));
      }
    } catch (e) {
      result = `CRASH: ${(e as Error).message.split("\n")[0]}`;
    }
    const ms = Math.round(performance.now() - t0);
    rows.push({ shape: `${x}×${y}`, theme, result, ms, attempts, along, png });
    console.log(`${x}x${y}\t${theme}\t${ms} ms\t${attempts} attempts\tstart at ${along ?? "-"}\t${result}`);
  }

if (thumbs) writeFileSync(join(thumbs, "index.json"), JSON.stringify({ seed, shapes: shapes.map(([x, y]) => `${x}×${y}`), themes, rows }, null, 1));

if (process.argv.includes("--md")) {
  console.log("\n| Shape | " + themes.map((t) => THEME_NAMES[t]).join(" | ") + " |\n|---|" + themes.map(() => "---").join("|") + "|");
  for (const [x, y] of shapes) {
    const cells = themes.map((t) => {
      const r = rows.find((q) => q.shape === `${x}×${y}` && q.theme === t)!;
      return `${r.result === "ok" ? "ok" : r.result.startsWith("refused") ? "refused" : "CRASH"} ${(r.ms / 1000).toFixed(1)} s`;
    });
    console.log(`| ${x}×${y} | ${cells.join(" | ")} |`);
  }
}
