// Every check row of a folder's maps as the editor shows them on import, to show what a change to the
// checks does to real maps.
//
//   npx tsx tools/check-rows.ts <folder> [<folder> …] [--out rows.tsv]
//
// One line per check and map: the file, the check's id, ok or FAIL, its severity and its message. Run it on
// dev and on the branch and diff the two outputs. The official maps are not ours to commit: point it at
// investigation/raw/builtin and keep the output in a gitignored local/ folder (D195).

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { MapSession } from "../src/core/doc/session";

const args = process.argv.slice(2);
const o = args.indexOf("--out");
const out = o >= 0 ? args[o + 1] : "";
const dirs = args.filter((a, k) => !a.startsWith("--") && (o < 0 || k !== o + 1));
if (!dirs.length) throw new Error("usage: npx tsx tools/check-rows.ts <folder> [<folder> …] [--out rows.tsv]");

const rows: string[] = [];
for (const dir of dirs)
  for (const name of readdirSync(dir).filter((n) => n.endsWith(".timber")).sort()) {
    try {
      const s = MapSession.importMap(new Uint8Array(readFileSync(join(dir, name))), name);
      for (const c of s.validate().report.checks) rows.push([name, c.id, c.ok ? "ok" : "FAIL", c.severity, c.message.replace(/\s+/g, " ")].join("\t"));
    } catch (e) {
      rows.push([name, "(import)", "refused", e instanceof Error ? e.message : String(e)].join("\t"));
    }
    console.log(`${name}: ${rows.length} rows so far`);
  }
if (out) writeFileSync(out, rows.join("\n") + "\n");
else console.log(rows.join("\n"));
