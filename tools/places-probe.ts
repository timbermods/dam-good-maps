// A probe group of real places whose water keeps moving (Kyler, 2026-09-26, D245 (6)): the file
// holds the water the editor shows, which has not settled within the canonical 4 days; the game
// rebuilds its flows from those depths every tick, so it should load as shown and go on moving as
// the model predicts. DGM Probe plays each as a "Given map" (3 temperate days, then Normal's longest
// first drought) and compares the start's water, sampled every hour, with the model.
//
//   npx tsx tools/places-probe.ts                        (the default three: 96², 128² and 256²)
//   npx tsx tools/places-probe.ts --out <dir> id id id   (the places named)
//
// It writes each place's .timber (built as the deploy builds it) into <dir> (default
// investigation/probe/local/places-moving/, gitignored) and prints the batch commands. It launches
// nothing: a probe batch runs only after Kyler's yes (CLAUDE.md, D117; on the work machine, D218).

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { decodePlaceFile, placeTimber, type PlaceIndex } from "../src/core/places/place";

const DEFAULT = ["paricutin", "badlands-national-park", "lake-toba"];
const args = process.argv.slice(2);
const at = args.indexOf("--out");
const out = resolve(at >= 0 ? args[at + 1] : "investigation/probe/local/places-moving");
const ids = args.filter((a, i) => !a.startsWith("--") && args[i - 1] !== "--out");
const index = JSON.parse(readFileSync("public/real-places/index.json", "utf8")) as PlaceIndex;
mkdirSync(out, { recursive: true });
const paths: string[] = [];
for (const id of ids.length ? ids : DEFAULT) {
  const e = index.places.find((p) => p.id === id);
  if (!e) throw new Error(`no real place called ${id}`);
  if (!e.notes?.includes("The water keeps moving")) console.warn(`${e.name}: its water settles (no "The water keeps moving" note)`);
  const r = placeTimber(decodePlaceFile(new Uint8Array(readFileSync(join("public/real-places", e.data)))));
  const path = join(out, `${e.id}.timber`);
  writeFileSync(path, r.bytes);
  paths.push(path);
  console.log(`${path}  ${e.name}, ${e.size}², ${r.bytes.length} bytes${e.notes?.length ? ` (${e.notes.join("; ")})` : ""}`);
}
const maps = paths.map((p) => `"${p.split("\\").join("/")}"`).join(" ");
console.log(`
The batch (from this checkout's folder; it prints the plan and a one-time code, and launches nothing):
  npm --prefix investigation/probe run build-mod -- --no-install
  npm --prefix investigation/probe run batch -- --backup-settings
  npm --prefix investigation/probe run batch -- ${maps} --group "Given maps" --keep-mods --run-id places-moving --reference C:/dgm-probe/settings-backup/<stamp>/Timberborn-settings.reg
Then, after the yes, the last command again with --confirmed-launch <code>.`);
