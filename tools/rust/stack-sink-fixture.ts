// Writes the sink case into tests/golden/stacked-water.json, the stacked engine's identity fixtures (D448, D366):
// the probe's test map T7 (tools/terrain3d-maps.ts `t7Sink`), settled by the engine as the eight #71 cases are.
//
//   npx tsx tools/rust/stack-sink-fixture.ts [--check]
//
// Unlike those eight, this case is NOT game-verified: a sink under a roof follows the game's code
// (UpdateWaterSourcesTask, WaterDepthSetter.SetWaterDepth) and no probe run has played it yet. It is here so native
// Rust, Node's WebAssembly and CI's browser engines are held to the same bytes on a negative strength
// (tools/rust/stack-identity.ts, tools/determinism). Run it again only when the sink rule is meant to change;
// --check writes nothing and fails when the file's case is not what this checkout computes.

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { gzipSync } from "fflate";
import { toMapObject } from "../../src/core/features/build";
import { stackObjectRows } from "../../src/core/sim/stackWater";
import { t7Sink } from "../terrain3d-maps";
import { runStackFixture } from "./stack-fixtures";

const FILE = "tests/golden/stacked-water.json";
const NOTE = " The t7-sink case is not from #71 and not game-verified: its sink under a roof follows the game's code (UpdateWaterSourcesTask, WaterDepthSetter), not yet played (tools/rust/stack-sink-fixture.ts).";
const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");

const m = t7Sink();
const { W, H, N, mask } = m.scene;
const rows = stackObjectRows(m.scene.entities.map(toMapObject));
// the engine's input: five counts, the masks, the objects' rows, no retained water, then the operations
// (build by the game's rules; begin the canonical settle of at most 4 days; advance; saturation)
const ops = [
  [0, 0, 0],
  [3, 4, 0],
  [4, 10_000_000, 0],
  [6, 0, 0],
];
const input = new Uint8Array(20 + 4 * N + 8 * rows.length + 24 * ops.length);
const d = new DataView(input.buffer);
[W, H, rows.length / 8, 0, ops.length].forEach((v, k) => d.setUint32(4 * k, v, true));
let at = 20;
for (let i = 0; i < N; i++, at += 4) d.setUint32(at, mask[i], true);
for (let i = 0; i < rows.length; i++, at += 8) d.setFloat64(at, rows[i], true);
for (const op of ops) for (const v of op) (d.setFloat64(at, v, true), (at += 8));

const base = { name: m.id, W, H, settle: null, hashes: {}, levels: 0, inputSha256: sha(input), inputGzip: Buffer.from(gzipSync(input, { mtime: 0 })).toString("base64"), fields: {} };
const r = runStackFixture(base as never);
const count = r.fields[3];
let levels = 1;
for (const c of count) if (c > levels) levels = c;
const entry = {
  ...base,
  settle: { settled: r.info[2] === 1, ticks: r.info[0] },
  hashes: { depth: sha(r.fields[6]).slice(0, 16), overflow: sha(r.fields[7]).slice(0, 16), contamination: sha(r.fields[8]).slice(0, 16) },
  levels,
  fields: Object.fromEntries([3, 4, 5, 6, 7, 8, 10, 11, 12, 13, 14, 16, 17, 18, 19].map((k) => [String(k), sha(r.fields[k])])),
};

const data = JSON.parse(readFileSync(FILE, "utf8")) as { reference: string; cases: { name: string }[] };
const have = data.cases.findIndex((c) => c.name === entry.name);
const same = have >= 0 && JSON.stringify(data.cases[have]) === JSON.stringify(entry);
if (process.argv.includes("--check")) {
  console.log(same ? `${entry.name}: current` : `${entry.name}: DIFFERS from ${FILE}`);
  process.exit(same ? 0 : 1);
}
if (have >= 0) data.cases[have] = entry;
else data.cases.push(entry);
if (!data.reference.includes("t7-sink")) data.reference += NOTE;
writeFileSync(FILE, JSON.stringify(data, null, 2) + "\n");
console.log(`${entry.name}: ${same ? "current" : "written"}; settled ${entry.settle.settled} in ${entry.settle.ticks} ticks; depth ${entry.hashes.depth}, overflow ${entry.hashes.overflow}`);
