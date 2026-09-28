// A contact sheet of generated maps (PLAN §20 D144): seeds 1–30 of every theme at 128², top-down,
// each labelled with its seed and theme; our own generated maps only. This writes one small
// top-down picture per map, north up (the preview's shading and settled water, the start marked in
// red), to .scratch/sheet/, and tools/contact-sheet.py lays them out, labelled, as one PNG under
// 1 MB.
//
//   npx tsx tools/contact-sheet.ts [--seeds 1-30] [--size 128] [--out .scratch/sheet] [--badwater]
//
// --badwater (D200) also shows badwater: water carrying it in rust red, and each BadwaterSource as a
// yellow square 7 tiles wide with a dark rim.
//   python tools/contact-sheet.py .scratch/sheet docs/sheets/<step>.png "<title>"
//
// M9a's `npm run sheet` replaces both (ROADMAP M9a).

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { generate } from "../src/core/gen/generate";
import { shadeTiles } from "../src/core/render/shade";
import { AVAILABLE_THEMES, GENERATOR_VERSION, makeSpec } from "../src/core/spec/mapspec";
import { encodePng } from "./png";

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const [a, b] = arg("seeds", "1-30").split("-").map(Number);
const size = Number(arg("size", "128"));
const out = arg("out", ".scratch/sheet");
const showBadwater = process.argv.includes("--badwater");
mkdirSync(out, { recursive: true });
const index: { theme: string; seed: number; file: string; attempts: number; passed: boolean }[] = [];
for (const theme of AVAILABLE_THEMES) {
  for (let seed = a; seed <= (b ?? a); seed++) {
    const r = generate(makeSpec({ seed, theme, size: { x: size, y: size } }));
    const { W, H } = r.built;
    const rgb = shadeTiles(r.built.heights, W, H, r.built.water);
    // north up: the map's y grows northward, the picture's rows downward
    const img = new Uint8Array(W * H * 3);
    for (let y = 0; y < H; y++) img.set(rgb.subarray(y * W * 3, (y + 1) * W * 3), (H - 1 - y) * W * 3);
    const square = (cx: number, cy: number, r: number, fill: [number, number, number], edge: [number, number, number] = [255, 255, 255]) => {
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++) {
          const x = cx + dx;
          const y = cy + dy;
          if (x < 0 || y < 0 || x >= W || y >= H) continue;
          const rim = Math.max(Math.abs(dx), Math.abs(dy)) === r;
          const k = ((H - 1 - y) * W + x) * 3;
          img[k] = rim ? edge[0] : fill[0];
          img[k + 1] = rim ? edge[1] : fill[1];
          img[k + 2] = rim ? edge[2] : fill[2];
        }
    };
    if (showBadwater) {
      for (let i = 0; i < W * H; i++) {
        if (!(r.built.water[i] > 0.05 && r.built.contamination[i] >= 0.05)) continue;
        const x = i % W;
        const k = ((H - 1 - (i - x) / W) * W + x) * 3;
        img[k] = 150;
        img[k + 1] = 60;
        img[k + 2] = 40;
      }
      for (const e of r.built.entities) if (e.template === "BadwaterSource") square(e.x + 1, e.y + 1, 3, [255, 214, 0], [40, 30, 20]);
    }
    // the start: a red square 7 tiles wide with a white rim, so it shows at the sheet's scale
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
    index.push({ theme, seed, file, attempts: r.attempts, passed: r.report.passed });
  }
  console.log(`${theme}: ${index.filter((m) => m.theme === theme).length} maps`);
}
writeFileSync(join(out, "index.json"), JSON.stringify({ generator: GENERATOR_VERSION, size, maps: index }, null, 1));
