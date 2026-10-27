// Top-down pictures of one theme's maps (tools/contact-sheet.ts, for one theme and any seeds), laid
// out by tools/contact-sheet.py:
//   npx tsx investigation/canyon-highlands-height/sheet.ts --theme canyon --seeds 1-30 --size 96 --out local/sheet-canyon
//   python tools/contact-sheet.py <out> <png> "<title>"
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { generate } from "../../src/core/gen/generate";
import { shadeTiles } from "../../src/core/render/shade";
import { GENERATOR_VERSION, makeSpec, type ThemeId } from "../../src/core/spec/mapspec";
import { encodePng } from "../../tools/png";

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const theme = arg("theme", "canyon") as ThemeId;
const seeds: number[] = [];
for (const part of arg("seeds", "1-30").split(",")) {
  const [a, b] = part.split("-").map(Number);
  for (let s = a; s <= (b ?? a); s++) seeds.push(s);
}
const size = Number(arg("size", "96"));
const out = arg("out", `investigation/canyon-highlands-height/local/sheet-${theme}-${size}`);
mkdirSync(out, { recursive: true });
const index: { theme: string; seed: number; file: string; attempts: number; passed: boolean; met: boolean; summary: string }[] = [];
for (const seed of seeds) {
  const r = generate(makeSpec({ seed, theme, size: { x: size, y: size } }));
  const { W, H } = r.built;
  const rgb = shadeTiles(r.built.heights, W, H, r.built.water);
  const img = new Uint8Array(W * H * 3);
  for (let y = 0; y < H; y++) img.set(rgb.subarray(y * W * 3, (y + 1) * W * 3), (H - 1 - y) * W * 3);
  const s = r.built.start;
  if (s)
    for (let dy = -4; dy <= 4; dy++)
      for (let dx = -4; dx <= 4; dx++) {
        const x = s.x + dx;
        const y = s.y + dy;
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        const rim = Math.max(Math.abs(dx), Math.abs(dy)) === 4;
        const k = ((H - 1 - y) * W + x) * 3;
        img[k] = rim ? 255 : 220;
        img[k + 1] = rim ? 255 : 30;
        img[k + 2] = rim ? 255 : 30;
      }
  const file = `${theme}-${seed}.png`;
  writeFileSync(join(out, file), encodePng(img, W, H));
  index.push({ theme, seed, file, attempts: r.attempts, passed: r.report.passed, met: !!r.outcomes?.met, summary: r.outcomes?.summary ?? "" });
  console.log(`${theme} ${seed}: ${r.outcomes?.met ? "all three" : r.outcomes?.summary}`);
}
writeFileSync(join(out, "index.json"), JSON.stringify({ generator: GENERATOR_VERSION, size, maps: index }, null, 1));
