// Makes the whole M9b review set (PLAN §20 D252 (2), D273; copied from investigation/m9a-review) in
// one command, from whatever commit this worktree is checked out at.
//
//   npx tsx investigation/m9b-review/make-all.ts [--compare origin/feature/m9a] [--workers 3] [--rng 20260928] [--out investigation/m9b-review]
//
// Runs, in order: the contact sheet with M9a's maps beside M9b's (`sheet.ts --compare --png`: the
// PNG, M9b's own maps only, is also D144's docs/sheets/m9b.png; then a screenshot per theme of the
// comparison page), the 3D captures (`capture-3d.ts`: 14 random maps and four Any maps at Variety
// 100 and Verticality 100 at 256²), and the start-area sheet (`start-sheet.ts`). Each step's own file
// has the details and can be run alone. Keeps worker/job counts modest by default (3) to sit beside
// other heavy work on this machine; raise --workers when the machine is free.

import { existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const arg = (name: string, fallback: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const OUT = arg("out", "investigation/m9b-review");
const WORKERS = arg("workers", "3");
const COMPARE = arg("compare", "origin/feature/m9a");
const RNG = arg("rng", "20260928");
const sha = (spawnSync("git", ["rev-parse", "--short", "HEAD"], { encoding: "utf8" }).stdout || "?").trim();

function run(cmd: string, args: string[]): void {
  console.log(`\n$ npx tsx ${args.join(" ")}`);
  const r = spawnSync(process.execPath, ["--import", "tsx", ...args], { stdio: "inherit" });
  if (r.status !== 0) throw new Error(`${args[0]} failed (exit ${r.status})`);
}

function latestSheetHtml(before: Set<string>): string {
  const dir = resolve(".scratch", "sheets");
  const after = readdirSync(dir).filter((f) => f.endsWith(".html") && !before.has(f));
  if (!after.length) throw new Error("sheet.ts did not write a new .scratch/sheets/*.html");
  after.sort((a, b) => statSync(join(dir, b)).mtimeMs - statSync(join(dir, a)).mtimeMs);
  return join(dir, after[0]);
}

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  mkdirSync(resolve(".scratch", "sheets"), { recursive: true });
  console.log(`M9b review set from ${sha}, into ${OUT}`);

  // 1-2. the contact sheet beside M9a's (its PNG is M9b's maps only), then one JPEG per theme
  const before = new Set(existsSync(resolve(".scratch", "sheets")) ? readdirSync(resolve(".scratch", "sheets")) : []);
  run("sheet", ["tools/sheet.ts", "--compare", COMPARE, "--workers", WORKERS, "--png", join(OUT, "contact-sheet.png"), "--no-open", "--title", `M9b review: contact sheet (${sha}) beside M9a`]);
  const html = latestSheetHtml(before);
  run("capture-compare", ["investigation/m9b-review/capture-compare.ts", html, "--out", OUT]);

  // 3. the 3D captures: 14 random maps and four chaos maps, a fixed recorded random seed
  run("capture-3d", ["investigation/m9b-review/capture-3d.ts", "--rng", RNG, "--out", OUT]);

  // 4. the start-area sheet (D229, D252 (1)): default themes and difficulties
  run("start-sheet", ["tools/start-sheet.ts", "--seeds", "1-30", "--size", "128", "--out", join(OUT, "start-areas.png"), "--jobs", WORKERS]);

  console.log(`\nDone. Files are in ${OUT}. Check each is under 1 MB and the set under ~15 MB before committing.`);
}

void main();
