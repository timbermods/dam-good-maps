// The DGM Probe's size maps (PLAN §20 D357 (9)), by hand: the same writer the runner calls before it plans
// `--group Sizes` (tools/probe-maps/sizes.ts). Writes C:\dgm-probe\sizes\<id>.timber and sizes.json (each map's file,
// size, sha256 and what the probe watches), rewriting only the maps whose bytes changed.
//
//   npx tsx tools/probe-sizes.ts [--out C:\dgm-probe\sizes] [--check] [--python]
//
// --check writes nothing and fails when a file on disk differs from a fresh build. --python also runs the Python
// validator's load checks on every map (file.size is the limit under test: both validators allow 4–256).
// Nothing here launches Timberborn.

import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { describeWrite, writeGroup } from "./probe-maps/group";
import { SIZES_WRITER } from "./probe-maps/sizes";

const i = process.argv.indexOf("--out");
const dir = i >= 0 ? process.argv[i + 1] : undefined;
const check = process.argv.includes("--check");
const g = writeGroup(SIZES_WRITER, { dir, check, log: (l) => console.log(l) });
for (const l of describeWrite(g)) console.log(l);
if (check && g.files.some((f) => f.status !== "current")) {
  console.error("DIFFERS: the files on disk are not what this checkout builds");
  process.exitCode = 1;
}
if (process.argv.includes("--python") && !check)
  for (const f of g.files) {
    const r = spawnSync(process.env.PYTHON ?? "python", ["prototype/validate.py", join(g.dir, f.file), "--load-only", "--json"], { encoding: "utf8", maxBuffer: 256 << 20 });
    const line = (r.stdout ?? "").split(/\r?\n/).find((l) => l.startsWith("{"));
    if (!line) {
      console.log(`python ${f.file}: did not run: ${(r.stderr ?? "").slice(-300)}`);
      process.exitCode = 1;
      continue;
    }
    const rep = JSON.parse(line) as { checks: { id: string; ok: boolean; detail: string }[] };
    const bad = rep.checks.filter((c) => !c.ok && c.id !== "file.size" && c.id !== "terrain.edge_wall");
    const size = rep.checks.find((c) => c.id === "file.size");
    console.log(`python ${f.file}: ${bad.length ? "FAIL " + bad.map((c) => `${c.id}: ${c.detail}`).join(" | ") : "load ok"}; file.size ${size ? (size.ok ? "ok" : "refused, as expected above 256") : "not reported"}`);
    if (bad.length) process.exitCode = 1;
  }
