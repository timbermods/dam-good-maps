// Hash generated maps, to show a change left them alone (or changed only what it meant to).
//
//   npx tsx tools/map-hashes.ts [--themes any,riverValley] [--seeds 1-6] [--sizes 96,128] [--out file.tsv]
//
// One line per map: theme, size, seed, then the first 16 hex digits of the sha256 of its surface
// heights, its settled water (depth and contamination), its objects, its .timber bytes, its
// project file (the stored base, whose terrain is runs) and its check rows (ids, results, messages). Run it on dev and on the branch and diff
// the two outputs: a map whose land is the same but whose water moved shows in the water column
// only. Defaults: every theme and Any, seeds 1–6, 96² and 128² (the sample ROADMAP's 3D steps ask for).

import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { encodeProject, generatedDocument } from "../src/core/doc/document";
import { generate } from "../src/core/gen/generate";
import { AVAILABLE_THEMES, makeSpec, type ThemeId } from "../src/core/spec/mapspec";

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

function parseSeeds(s: string): number[] {
  const out: number[] = [];
  for (const part of s.split(",")) {
    const m = /^(\d+)-(\d+)$/.exec(part);
    if (m) for (let k = Number(m[1]); k <= Number(m[2]); k++) out.push(k);
    else out.push(Number(part));
  }
  return out;
}

const sha = (...parts: (Uint8Array | string)[]): string => {
  const h = createHash("sha256");
  for (const p of parts) h.update(p);
  return h.digest("hex").slice(0, 16);
};
const bytesOf = (a: Float64Array): Uint8Array => new Uint8Array(a.buffer, a.byteOffset, a.byteLength);

const themes = arg("themes", ["any", ...AVAILABLE_THEMES.filter((t) => t !== "any")].join(",")).split(",") as ThemeId[];
const seeds = parseSeeds(arg("seeds", "1-6"));
const sizes = arg("sizes", "96,128").split(",").map(Number);
const out = arg("out", "");

const rows: string[] = ["theme\tsize\tseed\theights\twater\tobjects\ttimber\tproject"];
for (const theme of themes)
  for (const size of sizes)
    for (const seed of seeds) {
      const r = generate(makeSpec({ seed, theme, size: { x: size, y: size } }));
      const b = r.built;
      const row = [theme, size, seed, sha(b.heights), sha(bytesOf(b.water), bytesOf(b.contamination)), sha(JSON.stringify(b.entities)), sha(r.bytes), sha(encodeProject(generatedDocument(r))), sha(JSON.stringify(r.report.checks))].join("\t");
      rows.push(row);
      console.log(row);
    }
if (out) writeFileSync(out, rows.join("\n") + "\n");
