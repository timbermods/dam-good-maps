// How far the stacked water engine's modes move generated maps' water (the 3D foundations, D120,
// D293, D295): on each generated heightfield, the canonical settle of today's engine
// (sim/prefill.ts) is compared with the stacked engine's (sim/stackPrefill.ts) in "port" mode, which
// must give the same bits, and in "game" mode, the game's rules, against D295's acceptance line: a
// tile may change between wet (deeper than 0.05) and dry only where its depth is within 0.01 of the
// wet line (0.04–0.06), and the map's water volume stays within 0.1%.
//
//   npx tsx tools/stack-band.ts [--size 128] [--seeds 1-5] [--themes riverValley,canyon,...] [--list]
//
// One line per map: wet tiles, tiles that change between wet and dry, those outside the line (read
// two ways: today's depth outside 0.04–0.06, or either depth outside it, as when a sheet's edge
// recedes to 0), the volume change, the largest depth change, and the settle's ticks both ways;
// --list prints each tile that changes. Exits non-zero when port mode differs from today anywhere
// (breakage); maps outside the line are reported.

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
/** The wet line, and D295's band round it. */
const WET = 0.05;
const BAND = 0.01;
const VOLUME = 0.001;
const inBand = (d: number) => d >= WET - BAND && d <= WET + BAND;

let maps = 0;
let outsideToday = 0;
let outsideEither = 0;
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
    let flips = 0;
    let offToday = 0;
    let offEither = 0;
    let max = 0;
    let volToday = 0;
    let volGame = 0;
    const tiles: string[] = [];
    for (let i = 0; i < N; i++) {
      if (today.depth[i] !== port.depth[i] || today.contamination[i] !== port.contamination[i]) portDiffer++;
      const a = today.depth[i];
      const b = game.depth[i];
      volToday += a;
      volGame += b;
      const d = Math.abs(a - b);
      if (d > max) max = d;
      if (a > WET) wet++;
      if (a > WET !== b > WET) {
        flips++;
        if (!inBand(a)) offToday++;
        if (!inBand(a) || !inBand(b)) offEither++;
        if (list) tiles.push(`  (${i % w.sizeX}, ${Math.floor(i / w.sizeX)}) floor ${hm.floor[i]}: today ${a.toFixed(4)}, game ${b.toFixed(4)}${inBand(a) && inBand(b) ? "" : " (outside the band)"}`);
      }
    }
    const dv = Math.abs(volGame - volToday) / Math.max(volToday, 1e-9);
    maps++;
    if (portDiffer || port.ticks !== today.ticks) broken++;
    if (offToday || dv > VOLUME) outsideToday++;
    if (offEither || dv > VOLUME) outsideEither++;
    console.log(`${theme}\t${seed}\t${size}²\twet ${wet}\tflips ${flips}\toutside the band: ${offToday} by today's depth, ${offEither} by either\tvolume ${(100 * dv).toFixed(3)}%\tmax ${max.toExponential(2)}\tticks ${today.ticks}/${game.ticks}\tport ${portDiffer ? `DIFFERS on ${portDiffer} tiles` : "= today"}`);
    if (tiles.length) console.log(tiles.join("\n"));
  }
console.log(`${maps} maps: outside D295's line ${outsideToday} (today's depth read), ${outsideEither} (either depth read); port mode differs from today on ${broken}`);
process.exit(broken ? 1 : 0);
