// The DGM Probe's tall maps (PLAN §20 D172), by hand: the same writer the runner calls before it plans
// `--group "Tall maps"` (tools/probe-maps/tall.ts), then the Python validator's load checks on every map. Writes
// C:\dgm-probe\tall\<id>.timber and tall.json, rewriting only the maps whose bytes changed.
//
//   npx tsx tools/probe-tall.ts [--out C:\dgm-probe\tall] [--check]
//
// --check writes nothing and fails when a file on disk differs from a fresh build. Exits non-zero when a load check
// fails in either validator (terrain.max_height and terrain.edge_wall are reported, not failed: see tall.ts).
// Nothing here launches Timberborn.

import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { describeWrite, writeGroup } from "./probe-maps/group";
import { TALL_WRITER } from "./probe-maps/tall";

const i = process.argv.indexOf("--out");
const dir = i >= 0 ? process.argv[i + 1] : undefined;
const check = process.argv.includes("--check");
let g;
try {
  g = writeGroup(TALL_WRITER, { dir, check, log: (l) => console.log(l) });
} catch (e) {
  console.error(`FAIL ${(e as Error).message}`);
  process.exit(1);
}
for (const l of describeWrite(g)) console.log(l);
if (check && g.files.some((f) => f.status !== "current")) {
  console.error("DIFFERS: the files on disk are not what this checkout builds");
  process.exitCode = 1;
}
if (!check)
  for (const f of g.files) {
    const r = spawnSync(process.env.PYTHON ?? "python", ["prototype/validate.py", join(g.dir, f.file), "--load-only", "--json"], { encoding: "utf8", maxBuffer: 64 << 20 });
    const line = (r.stdout ?? "").split(/\r?\n/).find((l) => l.startsWith("{"));
    if (!line) {
      console.log(`python ${f.file}: did not run: ${(r.stderr ?? "").slice(-400)}`);
      process.exitCode = 1;
      continue;
    }
    const rep = JSON.parse(line) as { checks: { id: string; ok: boolean; detail: string }[] };
    const bad = rep.checks.filter((c) => !c.ok && c.id !== "terrain.max_height" && c.id !== "terrain.edge_wall");
    const mh = rep.checks.find((c) => c.id === "terrain.max_height");
    console.log(`python ${f.file}: ${bad.length ? "FAIL " + bad.map((c) => `${c.id}: ${c.detail}`).join(" | ") : "load ok"}; terrain.max_height ${mh ? (mh.ok ? "ok" : "fails") + ": " + mh.detail : "not reported"}`);
    if (bad.length) process.exitCode = 1;
  }
