// The start's reach, coarse: npx tsx .scratch/drc.ts <seed>   (R reached, ~ water, else the block's level; @ start)
import { generate } from "../src/core/gen/generate";
import { makeSpec } from "../src/core/spec/mapspec";
import { surfaceOf } from "../src/core/format/world";
import { mapObjects } from "../src/core/sim/model";
import { startOfObjects } from "../src/core/analysis/easyStart";
import { walkWorld, walkDistance } from "../src/core/analysis/walk";
const seed = Number(process.argv[2]);
const spec = makeSpec({ seed, theme: "lakeBasin", size: { x: 256, y: 256 }, designedFor: "normal" as never });
const r = generate(spec);
const W = 256, H = 256, B = 4;
const h = surfaceOf(r.file.world);
const objs = mapObjects(r.file.world);
const st = startOfObjects(objs, h, W)!;
const D = r.built.settle.depth;
const { blocked, links } = walkWorld(objs, W, H);
const wd = walkDistance(h, W, H, blocked, links, st);
let n = 0; for (let i = 0; i < W * H; i++) if (Number.isFinite(wd[i]) && D[i] <= 0.1) n++;
console.log("start", st.x, st.y, st.level, "reach", n, "check", r.report.checks.find((c) => c.id === "start.reach")?.value);
for (let by = H / B - 1; by >= 0; by--) {
  let row = "";
  for (let bx = 0; bx < W / B; bx++) {
    let re = 0, wt = 0, s = 0;
    for (let y = by * B; y < by * B + B; y++) for (let x = bx * B; x < bx * B + B; x++) { const i = y * W + x; if (Number.isFinite(wd[i]) && D[i] <= 0.1) re++; if (D[i] > 0.1) wt++; s += h[i]; }
    const lv = Math.round(s / (B * B));
    row += Math.floor(st.x / B) === bx && Math.floor(st.y / B) === by ? "@" : re >= 4 ? "R" : wt >= 8 ? "~" : lv < 10 ? String(lv) : String.fromCharCode(55 + lv);
  }
  console.log(row);
}
