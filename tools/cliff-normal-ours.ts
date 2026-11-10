// Our cliffs' normal map (src/render3d/cliffNormal.ts `makeCliffNormal`, D497) written as its raw bytes (RG, two a
// texel, `CLIFF_NORMAL_SIZE` square), for tools/game-cliff-normal.py to light beside the game's own. Ours alone: nothing
// of the game's is read or written here.
//
//   npx tsx tools/cliff-normal-ours.ts [.scratch/cliff-normal/ours.bin]

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { CLIFF_NORMAL_SIZE, makeCliffNormal } from "../src/render3d/cliffNormal";

const out = resolve(process.argv[2] ?? ".scratch/cliff-normal/ours.bin");
mkdirSync(dirname(out), { recursive: true });
const t0 = performance.now();
const bytes = makeCliffNormal(CLIFF_NORMAL_SIZE);
writeFileSync(out, bytes);
console.log(`${out}: ${CLIFF_NORMAL_SIZE}² RG, made in ${Math.round(performance.now() - t0)} ms`);
