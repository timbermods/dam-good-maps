// One top-down picture per Islands map, a pixel a tile, north up, the start marked (as tools/contact-sheet.ts
// draws it): `npx tsx investigation/islands-round-3/look.ts <size> <a> <b> <outdir>` writes <outdir>/<seed>.png.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { generate } from "../../src/core/gen/generate";
import { shadeTiles } from "../../src/core/render/shade";
import { makeSpec } from "../../src/core/spec/mapspec";
import { encodePng } from "../../tools/png";
const [size, a, b] = process.argv.slice(2, 5).map(Number);
const out = process.argv[5];
mkdirSync(out, { recursive: true });
for (let seed = a; seed <= b; seed++) {
  const r = generate(makeSpec({ seed, theme: "islands", size: { x: size, y: size } }));
  const { W, H } = r.built;
  const rgb = shadeTiles(r.built.heights, W, H, r.built.water);
  const img = new Uint8Array(W * H * 3);
  for (let y = 0; y < H; y++) img.set(rgb.subarray(y * W * 3, (y + 1) * W * 3), (H - 1 - y) * W * 3);
  const s = r.built.start;
  if (s)
    for (let dy = -4; dy <= 4; dy++)
      for (let dx = -4; dx <= 4; dx++) {
        const x = s.x + dx, y = s.y + dy;
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        const rim = Math.max(Math.abs(dx), Math.abs(dy)) === 4;
        const k = ((H - 1 - y) * W + x) * 3;
        img[k] = rim ? 255 : 220; img[k + 1] = rim ? 255 : 30; img[k + 2] = rim ? 255 : 30;
      }
  writeFileSync(join(out, `${seed}.png`), encodePng(img, W, H));
  console.log(seed, (r.info as any).genome?.seaLayout, (r.info as any).genome?.seaRing ? "ring" : "open", r.attempts);
}
