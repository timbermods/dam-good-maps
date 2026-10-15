// Hash the terrain after each of a seeded run of brush strokes, to show a change to the brushes left
// them alone on maps without caves (or changed only what it meant to).
//
//   npx tsx tools/stroke-hashes.ts [--maps riverValley:96:3,islands:96:5] [--strokes 60] [--out file.tsv]
//
// For each generated map, and the same map imported as a .timber (an import's own path through the
// build), it applies the strokes (tests/contract/strokeRandom.ts: every brush, sizes from half a tile
// to nine, soft and with a target, round, square and areas) one by one through the session and prints
// one line per stroke: the map, the stroke's number and brush, whether it applied, and the first 16
// hex digits of the sha256 of the surface and of the terrain's runs (`terrain.toData()`), then of a
// full build after the last stroke. Run it on dev and on the branch and diff the two outputs.

import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { MapSession } from "../src/core/doc/session";
import { generate } from "../src/core/gen/generate";
import { makeSpec, type ThemeId } from "../src/core/spec/mapspec";
import { mulberry } from "../tests/contract/brushRandom";
import { randomBrush, STROKE_TOOLS } from "../tests/contract/strokeRandom";

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const sha = (...parts: (Uint8Array | string)[]): string => {
  const h = createHash("sha256");
  for (const p of parts) h.update(p);
  return h.digest("hex").slice(0, 16);
};

const maps = arg("maps", "riverValley:96:3,islands:96:5,highlands:64:2,canyon:64:4").split(",").map((m) => m.split(":"));
const strokes = Number(arg("strokes", "60"));
const out = arg("out", "");

const rows: string[] = ["map\tstroke\ttool\tapplied\theights\truns"];
const line = (...cells: (string | number | boolean)[]) => {
  const row = cells.join("\t");
  rows.push(row);
  console.log(row);
};
for (const [theme, size, seed] of maps) {
  const W = Number(size);
  const r = generate(makeSpec({ seed: Number(seed), theme: theme as ThemeId, size: { x: W, y: W } }));
  for (const kind of ["generated", "imported"] as const) {
    const s = kind === "generated" ? MapSession.fromGenerated(r, r.file) : MapSession.importMap(r.bytes, `${theme}.timber`);
    s.setWaterMode("defer");
    const name = `${theme}:${W}:${seed}:${kind}`;
    const rand = mulberry(Number(seed) * 7919 + W);
    for (let k = 0; k < strokes; k++) {
      const p = randomBrush(rand, W, W, STROKE_TOOLS[Math.floor(rand() * STROKE_TOOLS.length)]);
      const u = s.apply({ op: "brush", params: p });
      line(name, k, p.tool, u.ok, sha(s.built.heights), sha(JSON.stringify(s.terrain.toData())));
    }
    const full = s.fullBuild();
    line(name, "full", "-", true, sha(full.heights), "-");
  }
}
if (out) writeFileSync(out, rows.join("\n") + "\n");
