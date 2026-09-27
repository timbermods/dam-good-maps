// Check a folder of .timber files the way a probe batch's maps are checked before a launch: every
// check of the TypeScript validator (the export profile, at the difficulty given) and the Python
// validator's load checks (prototype/validate.py --load-only), with each map's logs within the
// starting-logs floor's walk (D224, D227).
//
//   npx tsx tools/check-maps.ts <folder> [--difficulty normal]
//
// Exits non-zero when a map fails a check (an error or a warning) in either validator.

import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { readTimber } from "../src/core/format/timber";
import type { Difficulty } from "../src/core/spec/mapspec";
import { validateMap } from "../src/core/validate/checks";

const dir = process.argv[2];
if (!dir) throw new Error("usage: npx tsx tools/check-maps.ts <folder> [--difficulty normal]");
const i = process.argv.indexOf("--difficulty");
const difficulty = (i >= 0 ? process.argv[i + 1] : "normal") as Difficulty;
const files = readdirSync(dir)
  .filter((n) => n.endsWith(".timber"))
  .sort()
  .map((n) => join(dir, n));

let bad = 0;
for (const p of files) {
  const v = validateMap(readTimber(new Uint8Array(readFileSync(p))), { profile: "export", designedFor: difficulty });
  // every check that did not pass, but for information and the advisory ones (warnings count: the
  // playability checks warn on an export and would block a generated map)
  const blocking = v.report.checks.filter((c) => !c.ok && c.severity !== "info" && !c.advisory).map((c) => `${c.id} (${c.severity})`);
  const floor = v.report.checks.find((c) => c.id === "start.wood_floor");
  if (blocking.length) bad++;
  console.log(`${p.split(/[\\/]/).pop()}: ${blocking.length ? `FAILS ${blocking.join(", ")}` : "every check passes"}; logs within the floor's walk ${floor?.value ?? "?"}`);
}
const py = spawnSync("python", ["prototype/validate.py", ...files, "--load-only", "--quiet", "--difficulty", difficulty], { encoding: "utf8" });
console.log(`Python load checks: ${py.status === 0 ? "every map passes" : `exit ${py.status}`}${py.stdout.trim() ? `\n${py.stdout.trim()}` : ""}${py.stderr.trim() ? `\n${py.stderr.trim()}` : ""}`);
if (py.status !== 0) bad++;
process.exit(bad ? 1 : 0);
