// Mine-site pads (D363): the land before its pads, as the map arrived, and the pads with the mine sites
// the map placed on its ground.
// node investigation/probe/run.cjs ../m9b/pads.ts theme seed size
import { writeFileSync } from 'node:fs';
import { footprintTiles, type Orientation } from '../../src/core/format/footprints';
import { generate } from '../../src/core/gen/generate';
import { makeSpec, type ThemeId } from '../../src/core/spec/mapspec';
import { shadeTiles } from '../../src/core/render/shade';
import { encodePng } from '../../tools/png';
const [theme, seedS, sizeS] = process.argv.slice(2);
const size = Number(sizeS);
const r = generate(makeSpec({ seed: Number(seedS), theme: theme as ThemeId, size: { x: size, y: size } }));
const pads = r.info.pads;
if (!pads?.length) { console.log('no pads on this map; passed', r.report.passed); process.exit(0); }
const b = r.built, W = b.W, H = b.H;
// (the land before its pads: each pad's tiles a level over it)
const before = b.heights.slice();
const isPad = new Uint8Array(W * H);
for (const p of pads) for (const j of p.cut) { before[j] = p.level + 1; isPad[j] = 1; }
const isMine = new Uint8Array(W * H);
for (const e of b.entities) {
  if (e.template !== 'UndergroundRuins') continue;
  for (const [x, y] of footprintTiles('UndergroundRuins', { template: 'UndergroundRuins', x: e.x, y: e.y, z: e.z, orientation: e.orientation as Orientation, flipped: false })) if (x >= 0 && y >= 0 && x < W && y < H) isMine[y * W + x] = 1;
}
let x0 = W, x1 = 0, y0 = H, y1 = 0;
for (const p of pads) for (const i of p.cut) { const x = i % W, y = (i - x) / W; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
const m = 12; x0 = Math.max(0, x0 - m); y0 = Math.max(0, y0 - m); x1 = Math.min(W - 1, x1 + m); y1 = Math.min(H - 1, y1 + m);
const cw = x1 - x0 + 1, ch = y1 - y0 + 1, S = Math.max(3, Math.min(10, Math.floor(420 / Math.max(cw, ch)))), gap = 10;
const sBefore = shadeTiles(before, W, H, null);
const sAfter = shadeTiles(b.heights, W, H, b.water);
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
const at = (s: Uint8Array, i: number) => [s[3 * i], s[3 * i + 1], s[3 * i + 2]];
panel(0, (i) => at(sBefore, i));
panel(1, (i) => at(sAfter, i));
panel(2, (i) => (isMine[i] ? [150, 60, 170] : isPad[i] ? [240, 140, 40] : at(sAfter, i)));
const out = `investigation/m9b/local/pads-${theme}-${seedS}-${size}.png`; // (D195: kept out of git; the committed captures were copied by hand)
writeFileSync(out, encodePng(img, IW, IH));
console.log(out, 'pads', JSON.stringify(pads.map((p) => [p.x, p.y, p.level, p.cut.length])), '; panels: the land before its pads, as the map arrived, the pads in orange and the mine sites in purple; passed', r.report.passed);
