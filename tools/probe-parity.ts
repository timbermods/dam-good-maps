// The DGM Probe's parity maps (PLAN §20 D337, D338, D339), by hand: the same writer the runner calls before it plans
// `--group Parity` (tools/probe-maps/parity.ts). Writes C:\dgm-probe\parity\<id>.timber and parity.json (each map's
// file, hash, and the tiles, ids and expected values the probe watches), rewriting only the maps whose bytes changed.
//
//   npx tsx tools/probe-parity.ts [--out C:\dgm-probe\parity] [--check]
//
// --check writes nothing and fails when a file on disk differs from a fresh build. Nothing here launches Timberborn;
// the batch needs Kyler's yes like every launch (PLAN §20 D117).

import { describeWrite, writeGroup } from "./probe-maps/group";
import { PARITY_WRITER } from "./probe-maps/parity";

const i = process.argv.indexOf("--out");
const dir = i >= 0 ? process.argv[i + 1] : undefined;
const check = process.argv.includes("--check");
try {
  const g = writeGroup(PARITY_WRITER, { dir, check, log: (l) => console.log(l) });
  for (const l of describeWrite(g)) console.log(l);
  if (check && g.files.some((f) => f.status !== "current")) {
    console.error("DIFFERS: the files on disk are not what this checkout builds");
    process.exitCode = 1;
  }
} catch (e) {
  console.error(`FAIL ${(e as Error).message}`);
  process.exitCode = 1;
}
