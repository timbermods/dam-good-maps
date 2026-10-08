// Hash imported maps through import, an edit, the project file, reopening and export, to show a change
// left them alone.
//
//   npx tsx tools/import-hashes.ts <folder> [<folder> …] [--out file.tsv]
//
// One line per map: its file, then the first 16 hex digits of the sha256 of the .timber it exports
// unedited, its check rows, and, after one sculpt stroke (the first three plain tiles in a row below
// level 15, raised by one), its heights, its settled water, its exported .timber, its check rows, its
// project file and the .timber the reopened project exports. Run it on dev and on the branch and diff
// the two outputs. The official maps are not ours to commit: point it at investigation/raw/builtin and
// keep the output in a gitignored folder (D195).

import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { decodeProject } from "../src/core/doc/document";
import { MapSession } from "../src/core/doc/session";

const args = process.argv.slice(2);
const o = args.indexOf("--out");
const out = o >= 0 ? args[o + 1] : "";
const dirs = args.filter((a, k) => !a.startsWith("--") && (o < 0 || k !== o + 1));
if (!dirs.length) throw new Error("usage: npx tsx tools/import-hashes.ts <folder> [<folder> …] [--out file.tsv]");

const sha = (...parts: (Uint8Array | string)[]): string => {
  const h = createHash("sha256");
  for (const p of parts) h.update(p);
  return h.digest("hex").slice(0, 16);
};
const bytesOf = (a: Float64Array): Uint8Array => new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
const rowsOf = (s: MapSession): string => sha(JSON.stringify(s.validate().report.checks));

const rows: string[] = ["map\ttimber\tchecks\tedit\theights\twater\ttimber2\tchecks2\tproject\treopened"];
for (const dir of dirs)
  for (const name of readdirSync(dir).filter((n) => n.endsWith(".timber")).sort()) {
    let row: (string | number)[];
    try {
      const s = MapSession.importMap(new Uint8Array(readFileSync(join(dir, name))), name);
      row = [name, sha(s.exportTimber().bytes), rowsOf(s)];
      const { x: W, y: H } = s.size;
      const h = s.built.heights;
      const caves = s.columns;
      let at = -1;
      for (let i = 0; i + 2 < W * H && at < 0; i++) if (i % W < W - 2 && [i, i + 1, i + 2].every((j) => !caves.has(j) && h[j] > 0 && h[j] < 15)) at = i;
      const y = Math.floor(at / W);
      const x = at % W;
      const r = at < 0 ? { ok: false, errors: ["no plain tiles"] } : s.apply({ op: "sculpt", params: { mode: "raise", cells: [[y, x, x + 2]], amount: 1 } });
      if (!r.ok) row.push(`refused: ${r.errors[0]}`);
      else {
        const timber = s.exportTimber().bytes;
        const project = s.project();
        row.push(`${x},${y}`, sha(s.built.heights), sha(bytesOf(s.built.water), bytesOf(s.built.contamination)), sha(timber), rowsOf(s), sha(project), sha(MapSession.open(decodeProject(project)).exportTimber().bytes));
      }
    } catch (e) {
      row = [name, "refused", e instanceof Error ? e.message : String(e)];
    }
    rows.push(row.join("\t"));
    console.log(row.join("\t"));
  }
if (out) writeFileSync(out, rows.join("\n") + "\n");
