// D297's line for the game's water rules (PLAN §20 D293, D297, D303, D308): on generated maps, the
// canonical settle under the game's rules against the port's as it was before M9b, on the same
// map's water model. A tile may change between wet (deeper than 0.05) and dry only where its depth
// under the game's rules is within 0.01 of the wet line, and the map's water volume stays within
// 0.1%. Exits non-zero when a map is outside the line.
//
//   npx tsx tools/water-rules-band.ts [--themes any,riverValley,...] [--seeds 1-5] [--size 128] [--list]

import { generate } from "../src/core/gen/generate";
import { canonicalSettle } from "../src/core/sim/prefill";
import { makeSpec, THEMES, type ThemeId } from "../src/core/spec/mapspec";

const arg = (n: string, f: string) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : f;
};
const themes = arg("themes", THEMES.join(",")).split(",") as ThemeId[];
const [a, b] = arg("seeds", "1-5").split("-").map(Number);
const size = Number(arg("size", "128"));
const list = process.argv.includes("--list");
const WET = 0.05;
const BAND = 0.01;

let outside = 0;
console.log("map | flips (wet↔dry) | outside the band (on the edge row; wetter) | volume change | settle ticks port/game");
for (const theme of themes)
  for (let seed = a; seed <= (b ?? a); seed++) {
    const r = generate(makeSpec({ seed, theme, size: { x: size, y: size } }));
    const m = r.built.waterModel;
    const port = canonicalSettle(m, { rules: "port" });
    const game = canonicalSettle(m);
    let flips = 0;
    let bad = 0;
    // (outside the band: on the map's edge row, where the game's spill threshold keeps 0.1 on a
    // floor-0 tile, D303; or inside)
    let edgeBad = 0;
    let rose = 0;
    const where: string[] = [];
    let vp = 0;
    let vg = 0;
    for (let i = 0; i < port.depth.length; i++) {
      vp += port.depth[i];
      vg += game.depth[i];
      if (port.depth[i] > WET === game.depth[i] > WET) continue;
      flips++;
      if (Math.abs(game.depth[i] - WET) > BAND) {
        bad++;
        const x = i % m.W;
        const y = Math.floor(i / m.W);
        if (x === 0 || y === 0 || x === m.W - 1 || y === m.H - 1) edgeBad++;
        if (game.depth[i] > port.depth[i]) rose++;
        if (where.length < 6) where.push(`(${i % m.W}, ${Math.floor(i / m.W)}) ${port.depth[i].toFixed(3)}→${game.depth[i].toFixed(3)}`);
      }
    }
    const dv = vp > 0 ? Math.abs(vg - vp) / vp : 0;
    const ok = bad === 0 && dv <= 0.001;
    if (!ok) outside++;
    console.log(`${theme} ${seed} | ${flips} | ${bad} (${edgeBad}; ${rose})${list && where.length ? ` ${where.join(", ")}` : ""} | ${(100 * dv).toFixed(3)}% | ${port.ticks}/${game.ticks}${ok ? "" : "  OUTSIDE"}`);
  }
console.log(outside ? `${outside} map(s) outside D297's line` : "every map within D297's line");
if (outside) process.exitCode = 1;
