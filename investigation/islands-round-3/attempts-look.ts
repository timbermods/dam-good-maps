// Every land a seed drew, failed or shown, a pixel a tile, north up: <outdir>/<seed>-<attempt>.png, and
// each attempt's layout and why it failed (the planned water with the temporary line in REPORT.md,
// "Regenerating"; without it, the land alone). `npx tsx investigation/islands-round-3/attempts-look.ts <size> <seed> <outdir>`
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { generate } from "../../src/core/gen/generate";
import { shadeTiles } from "../../src/core/render/shade";
import { makeSpec } from "../../src/core/spec/mapspec";
import { encodePng } from "../../tools/png";
const [size, seed] = process.argv.slice(2, 4).map(Number);
const out = process.argv[4];
mkdirSync(out, { recursive: true });
const pic = (b: any, name: string) => {
  const { W, H } = b; const rgb = shadeTiles(b.heights, W, H, b.water); const img = new Uint8Array(W * H * 3);
  for (let y = 0; y < H; y++) img.set(rgb.subarray(y * W * 3, (y + 1) * W * 3), (H - 1 - y) * W * 3);
  writeFileSync(join(out, name), encodePng(img, W, H));
};
const r = generate(makeSpec({ seed, theme: "islands", size: { x: size, y: size } }), { onAttempt: (a: any) => {
  const g = a.result.info?.genome; const p = (globalThis as any).__plan; pic(p ?? a.result.built, `${seed}-${a.attempt}.png`); (globalThis as any).__plan = null;
  console.log(a.attempt, a.passed ? "passed" : "failed", g?.seaLayout, g?.seaRing ? "ring" : "open", a.result.info?.stage);
} } as any);
console.log("attempts", r.attempts);
