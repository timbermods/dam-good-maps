// A worn way out (D350 (b)): the land as shown, and as the map arrived, round the cut.
// node investigation/probe/run.cjs ../m9b/worn.ts theme seed size
import { writeFileSync } from 'node:fs';
import { generate } from '../../src/core/gen/generate';
import { makeSpec, type ThemeId } from '../../src/core/spec/mapspec';
import { shadeTiles } from '../../src/core/render/shade';
import { encodePng } from '../../tools/png';
const [theme, seedS, sizeS] = process.argv.slice(2);
const size = Number(sizeS);
let shown: Uint8Array | null = null;
const r = generate(makeSpec({ seed: Number(seedS), theme: theme as ThemeId, size: { x: size, y: size } }), { onLand: (l) => { if (!shown) shown = l.heights.slice(); } });
const worn = r.info.worn;
if (!worn) { console.log('no worn way out on this map', r.info.fixes); process.exit(0); }
const b = r.built, W = b.W, H = b.H;
let x0 = W, x1 = 0, y0 = H, y1 = 0;
for (const i of worn.cut) { const x = i % W, y = (i - x) / W; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
const m = 14; x0 = Math.max(0, x0 - m); y0 = Math.max(0, y0 - m); x1 = Math.min(W - 1, x1 + m); y1 = Math.min(H - 1, y1 + m);
const cw = x1 - x0 + 1, ch = y1 - y0 + 1, S = Math.max(3, Math.min(8, Math.floor(420 / Math.max(cw, ch)))), gap = 10;
const before = shadeTiles(shown as unknown as Uint8Array, W, H, null);
const after = shadeTiles(b.heights, W, H, b.water);
const isCut = new Uint8Array(W * H); for (const i of worn.cut) isCut[i] = 1;
const IW = 3 * cw * S + 2 * gap, IH = ch * S;
const img = new Uint8Array(IW * IH * 3).fill(255);
const panel = (p: number, rgbAt: (i: number) => number[]) => {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const c = rgbAt(y * W + x);
    for (let sy = 0; sy < S; sy++) for (let sx = 0; sx < S; sx++) {
      const px = p * (cw * S + gap) + (x - x0) * S + sx, py = (y1 - y) * S + sy;
      const k = (py * IW + px) * 3; img[k] = c[0]; img[k + 1] = c[1]; img[k + 2] = c[2];
    }
  }
};
panel(0, (i) => [before[3 * i], before[3 * i + 1], before[3 * i + 2]]);
panel(1, (i) => [after[3 * i], after[3 * i + 1], after[3 * i + 2]]);
panel(2, (i) => (isCut[i] ? [240, 140, 40] : [after[3 * i], after[3 * i + 1], after[3 * i + 2]]));
const out = `investigation/m9b/local/worn-${theme}-${seedS}-${size}.png`; // (D195: kept out of git; the two committed captures were copied by hand)
writeFileSync(out, encodePng(img, IW, IH));
console.log(out, 'cut', worn.cut.length, 'tiles; basin', worn.basin, 'tiles at level', worn.level, '; panels: the land as shown, as the map arrived, the cut in orange; passed', r.report.passed);
