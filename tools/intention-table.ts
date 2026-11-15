// Which themes each intention is offered for (planning, 2026-11-14; src/core/land/intentionTable.ts): each intention
// asked alone of each theme on seeds 1–12 at 128², offered where it emerged on at least 4 of the 12.
//
//   npm run intentions                            (writes src/core/land/intentionTable.json; about 1,600 maps, an hour)
//   npm run intentions -- --check                 (writes nothing; fails when the committed table differs)
//   npm run intentions -- --check --theme canyon  (the same, one theme's column: Nightly runs a theme a job)
//
// The check runs in Nightly only (planning: not on pull requests, not in the release gate). A red Nightly on it means
// the list moved: regenerate the table with `npm run intentions` in a pull request that says which intention moved, on
// which theme, and why (the generator change that moved it).

import { readFileSync, writeFileSync } from "node:fs";
import { STYLE_THEMES, type IntentionTable, type StyleTheme } from "../src/core/land/intentionTable";
import { INTENTIONS } from "../src/core/land/intentions";
import { computeTable } from "./lib/intentionTable";

const FILE = "src/core/land/intentionTable.json";
const check = process.argv.includes("--check");
const at = process.argv.indexOf("--theme");
const only = at >= 0 ? (process.argv[at + 1] as StyleTheme) : null;
if (only && !STYLE_THEMES.includes(only)) throw new Error(`--theme is one of ${STYLE_THEMES.join(", ")}`);
if (only && !check) throw new Error("--theme checks one theme's column: give --check with it");
const t0 = performance.now();
const table = await computeTable(
  undefined,
  (done, of) => {
    if (done % 50 === 0 || done === of) process.stderr.write(`${done}/${of} maps, ${Math.round((performance.now() - t0) / 1000)} s\n`);
  },
  only ? [only] : STYLE_THEMES,
);
const text = `${JSON.stringify(table, null, 1)}\n`;
if (!check) {
  writeFileSync(FILE, text);
  console.log(`wrote ${FILE}`);
} else {
  const committed = JSON.parse(readFileSync(FILE, "utf8")) as IntentionTable;
  const themes = only ? [only] : STYLE_THEMES;
  const moved: string[] = [];
  // (the generator's version is recorded, not checked: a new version that moves no count moves nothing offered)
  for (const k of ["side", "least"] as const) if (committed[k] !== table[k]) moved.push(`${k}: ${committed[k]} → ${table[k]}`);
  if (JSON.stringify(committed.seeds) !== JSON.stringify(table.seeds)) moved.push("seeds");
  for (const id of INTENTIONS)
    for (const t of themes) {
      const was = committed.counts[id]?.[t];
      const now = table.counts[id][t];
      if (was !== now) moved.push(`${id} on ${t}: ${was} → ${now} of ${table.seeds.length}${(was >= table.least) !== (now >= table.least) ? (now >= table.least ? " (now offered)" : " (no longer offered)") : ""}`);
    }
  if (moved.length) {
    console.error(`The intention list moved${only ? ` on ${only}` : ""}:\n${moved.join("\n")}\nRegenerate it with npm run intentions in a pull request that says which intention moved and why.`);
    process.exit(1);
  }
  console.log(`${FILE} is the generator's${only ? ` on ${only}` : ""}`);
}
