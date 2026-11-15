// Which themes each intention is offered for (planning, 2026-11-14, amended 2026-11-15; src/core/land/intentionTable.ts):
// each intention asked alone of each theme on seeds 1–12 at 128² and at 256², offered where it emerged on at least 8 of
// the 12 at both sides.
//
//   npm run intentions                                    (writes src/core/land/intentionTable.json; about 1,500 maps a
//                                                          side, some 12 core-hours at 128² and 30 at 256²)
//   npm run intentions -- --side 256 --threads 6          (counts one side, or with --theme one theme, and writes those
//                                                          cells into the committed table, the others kept)
//   npm run intentions -- --check                         (writes nothing; fails when the committed table differs)
//   npm run intentions -- --check --theme canyon --side 256 --part 2/3
//                                                         (the same, for one theme, one side and every third intention
//                                                          from the second: Nightly runs one such job each)
//
// The check runs in Nightly only (planning: not on pull requests, not in the release gate). A red Nightly on it means
// the list moved: regenerate the table with `npm run intentions` in a pull request that says which intention moved, on
// which theme, and why (the generator change that moved it). The table is the generator's too (`drawIntentions` draws
// only what it offers): a change to its offered list moves maps, with a generator version and a re-pin.

import { readFileSync, writeFileSync } from "node:fs";
import { INTENTION_SIDES, offeredBy, STYLE_THEMES, type IntentionTable, type StyleTheme } from "../src/core/land/intentionTable";
import { INTENTIONS, type IntentionId } from "../src/core/land/intentions";
import { computeTable } from "./lib/intentionTable";

const FILE = "src/core/land/intentionTable.json";
const arg = (name: string): string | null => {
  const at = process.argv.indexOf(name);
  return at >= 0 ? (process.argv[at + 1] ?? null) : null;
};
const check = process.argv.includes("--check");
const only = arg("--theme") as StyleTheme | null;
if (only && !STYLE_THEMES.includes(only)) throw new Error(`--theme is one of ${STYLE_THEMES.join(", ")}`);
const side = arg("--side") === null ? null : Number(arg("--side"));
if (side !== null && !INTENTION_SIDES.includes(side)) throw new Error(`--side is one of ${INTENTION_SIDES.join(", ")}`);
const part = arg("--part");
const [k, n] = part ? part.split("/").map(Number) : [1, 1];
if (!(Number.isInteger(k) && Number.isInteger(n) && k >= 1 && k <= n)) throw new Error("--part is k/n, 1 ≤ k ≤ n: every n-th intention from the k-th");
const threads = arg("--threads") === null ? undefined : Number(arg("--threads"));
const themes = only ? [only] : STYLE_THEMES;
const sides = side !== null ? [side] : INTENTION_SIDES;
const ids: IntentionId[] = INTENTIONS.filter((_, i) => i % n === k - 1);
const t0 = performance.now();
const table = await computeTable(
  threads,
  (done, of) => {
    if (done % 50 === 0 || done === of) process.stderr.write(`${done}/${of} maps, ${Math.round((performance.now() - t0) / 1000)} s\n`);
  },
  { themes, sides, ids },
);
const committed = JSON.parse(readFileSync(FILE, "utf8")) as IntentionTable;
const scoped = (id: IntentionId, t: StyleTheme, s: number) => ids.includes(id) && themes.includes(t) && sides.includes(s);
if (!check) {
  // (the cells counted replace the committed ones; the rest are kept, and the offered list is read again from all)
  const whole = ids.length === INTENTIONS.length && themes.length === STYLE_THEMES.length && sides.length === INTENTION_SIDES.length;
  const out = table;
  if (!whole)
    for (const id of INTENTIONS)
      for (const t of STYLE_THEMES)
        for (const s of INTENTION_SIDES) if (!scoped(id, t, s)) out.counts[id][t][String(s)] = committed.counts?.[id]?.[t]?.[String(s)] ?? 0;
  out.offered = Object.fromEntries(INTENTIONS.map((id) => [id, offeredBy(out.counts[id])])) as IntentionTable["offered"];
  writeFileSync(FILE, `${JSON.stringify(out, null, 1)}\n`);
  console.log(`wrote ${FILE}${whole ? "" : ` (${sides.map((s) => `${s}²`).join(", ")}${only ? `, ${only}` : ""}${n > 1 ? `, part ${k}/${n}` : ""})`}`);
} else {
  const moved: string[] = [];
  // (the generator's version is recorded, not checked: a new version that moves no count moves nothing offered)
  if (committed.least !== table.least) moved.push(`least: ${committed.least} → ${table.least}`);
  if (JSON.stringify(committed.sides) !== JSON.stringify(table.sides)) moved.push("sides");
  if (JSON.stringify(committed.seeds) !== JSON.stringify(table.seeds)) moved.push("seeds");
  for (const id of ids)
    for (const t of themes)
      for (const s of sides) {
        const was = committed.counts[id]?.[t]?.[String(s)];
        const now = table.counts[id][t][String(s)];
        if (was !== now) moved.push(`${id} on ${t} at ${s}²: ${was} → ${now} of ${table.seeds.length}${(was >= table.least) !== (now >= table.least) ? (now >= table.least ? " (now passes)" : " (no longer passes)") : ""}`);
      }
  const scope = `${only ? ` on ${only}` : ""}${side !== null ? ` at ${side}²` : ""}${n > 1 ? `, part ${k}/${n}` : ""}`;
  if (moved.length) {
    console.error(`The intention list moved${scope}:\n${moved.join("\n")}\nRegenerate it with npm run intentions in a pull request that says which intention moved and why.`);
    process.exit(1);
  }
  console.log(`${FILE} is the generator's${scope}`);
}
