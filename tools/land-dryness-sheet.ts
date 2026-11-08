// Dryness as the game shows it (D497; fix/land-tone): our side of one probe start shot with irrigated grass and dry
// ground side by side, dev against this checkout, Standard and High, from the judge's fitted camera. The game's frame
// is the judge's input (C:\dgm-probe\shots\<batch>\m9b-<shot>-water.jpg) and stays out of git; this sheet is ours alone.
//
//   npx tsx tools/water-pixel-judge.ts --dev .scratch/judge-dev --samples --ours .scratch/ours
//   npx tsx tools/land-dryness-sheet.ts [--from .scratch/ours] [--shot riverValley-128-1-start] [--out docs/sheets/land-tone-dryness.jpg]

import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium } from "@playwright/test";
import { grid } from "./water-capture";

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const FROM = resolve(arg("from") ?? ".scratch/ours");
const SHOT = arg("shot") ?? "riverValley-128-1-start";
const OUT = resolve(arg("out") ?? "docs/sheets/land-tone-dryness.jpg");

async function main() {
  const images: Buffer[] = [];
  const labels: string[] = [];
  for (const look of ["standard", "high"] as const)
    for (const [key, label] of [["dev", "dev"], ["formula", "this PR"]] as const) {
      images.push(readFileSync(join(FROM, `${SHOT}-${look}-${key}.png`)));
      labels.push(`${SHOT}, irrigated and dry: ${look === "standard" ? "Standard" : "High"}, ${label}`);
    }
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    await grid(await browser.newPage(), images, labels, 2, 0.5, OUT);
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
