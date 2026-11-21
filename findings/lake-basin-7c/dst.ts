// The ground round the start: npx tsx .scratch/dst.ts <seed> [radius]
import { generate } from "../src/core/gen/generate";
import { makeSpec } from "../src/core/spec/mapspec";
import { surfaceOf } from "../src/core/format/world";
import { mapObjects } from "../src/core/sim/model";
import { startOfObjects } from "../src/core/analysis/easyStart";
const seed = Number(process.argv[2]), R = Number(process.argv[3] ?? 20);
const spec = makeSpec({ seed, theme: "lakeBasin", size: { x: 256, y: 256 }, designedFor: "normal" as never });
const r = generate(spec);
const W = 256, H = 256;
const h = surfaceOf(r.file.world);
const st = startOfObjects(mapObjects(r.file.world), h, W)!;
const D = r.built.settle.depth;
console.log("start", st.x, st.y, "level", st.level, "attempts", r.attempts);
for (let y = Math.min(H - 1, st.y + R); y >= Math.max(0, st.y - R); y--) {
  let row = "";
  for (let x = Math.max(0, st.x - R); x <= Math.min(W - 1, st.x + R); x++) {
    const i = y * W + x;
    const c = h[i] < 10 ? String(h[i]) : String.fromCharCode(55 + h[i]);
    row += x === st.x && y === st.y ? "@" + c : (D[i] > 0.1 ? "~" : h[i] === st.level ? " " : ".") + c;
  }
  console.log(row);
}
import { easyRoom } from "../src/core/analysis/easyStart";
import { walkWorld } from "../src/core/analysis/walk";
const objs = mapObjects(r.file.world);
const { blocked } = walkWorld(objs, W, H);
const wet = (i: number) => D[i] > 0.1;
const sum = (a: Uint8Array) => a.reduce((s, v) => s + v, 0);
console.log("room with objects", sum(easyRoom(h, W, H, wet, blocked, st.x, st.y, st.level, 14)), "without", sum(easyRoom(h, W, H, wet, null, st.x, st.y, st.level, 14)));
let bl = ""; for (let y = st.y + 14; y >= st.y - 14; y--) { let row = ""; for (let x = st.x - 14; x <= st.x + 14; x++) { const i = y * W + x; row += blocked[i] ? "#" : wet(i) ? "~" : h[i] === st.level ? "." : "^"; } bl += row + "\n"; }
console.log(bl);
