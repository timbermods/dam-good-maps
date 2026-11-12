// Four Lakes: a look at the design's ground in a window, as text (north up): each tile's level in base 36, a lake
// bed marked "~", a channel's bed ":", the springs' pool "o", dry ground " ".
//   node tools/showcase/run.mjs four-lakes-look x0 y0 x1 y1
import { designLand, W } from "./four-lakes-design";

const [x0, y0, x1, y1] = process.argv.slice(2).map(Number);
const land = designLand();
let head = "      ";
for (let x = x0; x <= x1; x++) head += x % 10 === 0 ? String(Math.floor(x / 10) % 10).padStart(2) : "  ";
console.log(head);
head = "      ";
for (let x = x0; x <= x1; x++) head += String(x % 10).padStart(2);
console.log(head);
for (let y = y1; y >= y0; y--) {
  let row = `y ${String(y).padStart(3)} `;
  for (let x = x0; x <= x1; x++) {
    const i = y * W + x;
    const mark = land.lake[i] ? "~" : land.pool[i] ? "o" : land.channel[i] ? ":" : " ";
    row += mark + land.heights[i].toString(36);
  }
  console.log(row);
}

// with a fifth and sixth argument (a start's middle tile), the game's first frame on that start: where each tile of
// the window stands in it at `level` (argument seven, default 6.4), u across then v up, each 0 to 9 from one edge
// to the other, "." outside the frame.
if (process.argv.length >= 8) {
  const { openingCamera, frameAt } = await import("./core");
  const sx = Number(process.argv[6]);
  const sy = Number(process.argv[7]);
  const level = Number(process.argv[8] ?? 6.4);
  const cam = openingCamera({ x: sx, y: sy, z: 7, orientation: "Cw0" });
  for (const which of ["u", "v"] as const) {
    console.log(`first frame on a start at ${sx},${sy}: ${which} at level ${level}`);
    for (let y = y1; y >= y0; y--) {
      let row = `y ${String(y).padStart(3)} `;
      for (let x = x0; x <= x1; x++) {
        const p = frameAt(cam, x + 0.5, y + 0.5, level);
        row += p && Math.abs(p.u) <= 1 && Math.abs(p.v) <= 1 ? " " + Math.min(9, Math.floor(((which === "u" ? p.u : p.v) + 1) * 5)) : " .";
      }
      console.log(row);
    }
  }
  for (const [x, y] of [[78, 108], [87, 99], [82.5, 103.5]]) {
    const p = frameAt(cam, x + 0.5, y + 0.5, 14.2);
    console.log(`  lip point ${x},${y} at 14.2: ${p ? `(${p.u.toFixed(2)}, ${p.v.toFixed(2)})` : "behind"}`);
  }
}
