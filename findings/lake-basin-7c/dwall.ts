// The start's reach edge, fine: npx tsx .scratch/dwall.ts <seed> x0 y0 x1 y1  (R reached; else level; ~ water)
import { generate } from "../src/core/gen/generate";
import { makeSpec } from "../src/core/spec/mapspec";
import { surfaceOf } from "../src/core/format/world";
import { mapObjects } from "../src/core/sim/model";
import { startOfObjects } from "../src/core/analysis/easyStart";
import { walkWorld, walkDistance } from "../src/core/analysis/walk";
const [seed, x0, y0, x1, y1] = process.argv.slice(2).map(Number);
const spec = makeSpec({ seed, theme: "lakeBasin", size: { x: 256, y: 256 }, designedFor: "normal" as never });
const r = generate(spec);
const W = 256;
const h = surfaceOf(r.file.world);
const objs = mapObjects(r.file.world);
const st = startOfObjects(objs, h, W)!;
const D = r.built.settle.depth;
const { blocked, links } = walkWorld(objs, W, W);
const wd = walkDistance(h, W, W, blocked, links, st);
console.log("start", st.x, st.y, st.level, "links", links.length);
for (let y = y1; y >= y0; y--) {
  let row = "";
  for (let x = x0; x <= x1; x++) {
    const i = y * W + x;
    const c = h[i] < 10 ? String(h[i]) : String.fromCharCode(55 + h[i]);
    row += (D[i] > 0.1 ? "~" : Number.isFinite(wd[i]) ? "R" : blocked[i] ? "#" : " ") + c;
  }
  console.log(row);
}
