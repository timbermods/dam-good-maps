// Generates once for each shape and theme and prints whether it made a map, how long it took and, when it did not,
// why (PLAN §20 D357): the smoke check for the sizes beyond the standard ones. Not a quality measure.
//
//   npx tsx tools/size-smoke.ts [--shapes 4x4,16x200,64x512] [--themes riverValley,canyon] [--seed 1] [--md]
//
// One line per run: shape, theme, ok or the refusal/crash, milliseconds. --md also prints the table as Markdown.

import { generate } from "../src/core/gen/generate";
import { THEMES, makeSpec, THEME_NAMES, type ThemeId } from "../src/core/spec/mapspec";

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const shapes = arg("shapes", "4x4,16x200,64x512,128x512,512x256,512x512")
  .split(",")
  .map((s) => s.split("x").map(Number) as [number, number]);
const themes = arg("themes", THEMES.join(",")).split(",") as ThemeId[];
const seed = Number(arg("seed", "1"));

const rows: { shape: string; theme: ThemeId; result: string; ms: number }[] = [];
for (const [x, y] of shapes)
  for (const theme of themes) {
    const t0 = performance.now();
    let result: string;
    try {
      const r = generate(makeSpec({ seed, theme, size: { x, y } }));
      result = r.report.passed ? "ok" : `refused: ${r.report.checks.filter((c) => !c.ok).map((c) => `${c.id} (${c.message})`).join("; ")}`;
    } catch (e) {
      result = `CRASH: ${(e as Error).message.split("\n")[0]}`;
    }
    const ms = Math.round(performance.now() - t0);
    rows.push({ shape: `${x}×${y}`, theme, result, ms });
    console.log(`${x}x${y}\t${theme}\t${ms} ms\t${result}`);
  }

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
