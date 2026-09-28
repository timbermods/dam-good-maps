// Re-tune a setup (D134: when the generator changes the maps, a setup's coordinates or seed may no
// longer mean what its note says). Runs the cases that use a setup against each candidate for it
// and prints how many pass, so the candidate that keeps the setup's meaning and passes most can be
// written into requests.json (and recorded in the step's progress log). Pass criteria never change.
//
//   npx tsx investigation/claude/bin/retune.ts --setup rv128-fall --candidates cands.json [--cases S05,F01]
//
// `cands.json` is a list of setups (each a full setup object). Without --cases, every request whose
// setup is this one, or is built on it, runs.

import { readFileSync } from "node:fs";
import type { Setup } from "../lib/fixtures";
import { corpus, runCase } from "./reference";

const argv = process.argv.slice(2);
const opt = (k: string) => {
  const i = argv.indexOf(k);
  return i >= 0 ? argv[i + 1] : undefined;
};
const name = opt("--setup")!;
const cands = JSON.parse(readFileSync(opt("--candidates")!, "utf8")) as Setup[];
const uses = (s: string): boolean => {
  if (s === name) return true;
  const base = (corpus.setups[s] as { base?: string } | undefined)?.base;
  return base ? uses(base) : false;
};
const ids = opt("--cases")?.split(",") ?? corpus.requests.filter((r) => uses(r.setup)).map((r) => r.id);
const original = corpus.setups[name];
cands.forEach((c, k) => {
  corpus.setups[name] = c;
  const out = ids.map((id) => runCase(corpus.requests.find((r) => r.id === id)!));
  const pass = out.filter((o) => o.pass).map((o) => o.id);
  console.log(`candidate ${k} ${JSON.stringify(c).slice(0, 160)}: ${pass.length}/${ids.length} pass (${pass.join(",")})${out.some((o) => !o.pass) ? `; failing: ${out.filter((o) => !o.pass).map((o) => `${o.id}: ${o.failures.join(" | ").slice(0, 200)}`).join(" ;; ")}` : ""}`);
});
corpus.setups[name] = original;
