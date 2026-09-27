// How far the stacked water engine's modes move generated maps' water (the 3D foundations, D120,
// D293): on each generated heightfield, the canonical settle of today's engine (sim/prefill.ts) is
// compared with the stacked engine's (sim/stackPrefill.ts) in "port" mode, which must give the same
// bits, and in "game" mode, the game's rules, which ROADMAP 3D-a's regression band expects to move
// only the water's last digits (no wet tile, deeper than 0.05, differs; depths within 0.05).
//
//   npx tsx tools/stack-band.ts [--size 128] [--seeds 1-5] [--themes riverValley,canyon,...] [--list]
//
// One line per map: wet tiles, wet tiles that differ, tiles moved by 0.05 or more, the largest depth
// change, and the settle's ticks both ways; --list prints the tiles that differ. Exits non-zero when
// port mode differs from today anywhere (breakage); maps outside game mode's band are reported.

import { generate } from "../src/core/gen/generate";
import { readTimber } from "../src/core/format/timber";
import { surfaceOf } from "../src/core/format/world";
import { voxelMasks } from "../src/core/sim/columns";
import { mapObjects, waterModel } from "../src/core/sim/model";
import { canonicalSettle } from "../src/core/sim/prefill";
import { stackModel } from "../src/core/sim/stackModel";
import { canonicalStackSettle } from "../src/core/sim/stackPrefill";
import { makeSpec, type ThemeId } from "../src/core/spec/mapspec";

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const size = Number(arg("size", "128"));
const [s0, s1] = arg("seeds", "1-5").split("-").map(Number);
const themes = arg("themes", "riverValley,canyon,lakeBasin,highlands,delta,islands").split(",") as ThemeId[];
const list = process.argv.includes("--list");
const WET = 0.05;

let maps = 0;
let outside = 0;
let broken = 0;
for (const theme of themes)
  for (let seed = s0; seed <= (s1 ?? s0); seed++) {
    const r = generate(makeSpec({ seed, size: { x: size, y: size }, designedFor: "normal", theme }));
    const w = readTimber(r.bytes).world;
    const objects = mapObjects(w);
    const hm = waterModel(w.sizeX, w.sizeY, surfaceOf(w), objects);
    const sm = stackModel(voxelMasks(w.sizeX, w.sizeY, w.voxels, w.layers), objects);
    const today = canonicalSettle(hm);
    const port = canonicalStackSettle(sm, { mode: "port" });
    const game = canonicalStackSettle(sm, { mode: "game" });
    const N = w.sizeX * w.sizeY;
    let portDiffer = 0;
    let wet = 0;
    let wetDiffer = 0;
    let moved = 0;
    let max = 0;
    const tiles: string[] = [];
    for (let i = 0; i < N; i++) {
      if (today.depth[i] !== port.depth[i] || today.contamination[i] !== port.contamination[i]) portDiffer++;
      const d = Math.abs(today.depth[i] - game.depth[i]);
      if (d > max) max = d;
      if (d >= WET) moved++;
      if (today.depth[i] > WET) wet++;
      if (today.depth[i] > WET !== game.depth[i] > WET) {
        wetDiffer++;
        if (list) tiles.push(`  (${i % w.sizeX}, ${Math.floor(i / w.sizeX)}) floor ${hm.floor[i]}: today ${today.depth[i].toFixed(4)}, game ${game.depth[i].toFixed(4)}`);
      }
    }
    maps++;
    if (portDiffer || port.ticks !== today.ticks) broken++;
    if (wetDiffer || max >= WET) outside++;
    console.log(`${theme}\t${seed}\t${size}²\twet ${wet}\twet differ ${wetDiffer}\tmoved ≥ 0.05: ${moved}\tmax ${max.toExponential(2)}\tticks ${today.ticks}/${game.ticks}\tport ${portDiffer ? `DIFFERS on ${portDiffer} tiles` : "= today"}`);
    if (tiles.length) console.log(tiles.join("\n"));
  }
console.log(`${maps} maps: ${outside} outside game mode's band; port mode differs from today on ${broken}`);
process.exit(broken ? 1 : 0);
