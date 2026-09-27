// Makes the whole M9a review set (PLAN §20 D252 (2)) in one command, from whatever commit this
// worktree is checked out at (the frozen generator, once M9a re-freezes on a new sha).
//
//   npx tsx investigation/m9a-review/make-all.ts [--compare main] [--workers 3] [--rng 20260927] [--out investigation/m9a-review]
//
// Runs, in order: the contact sheet (`sheet.ts --png`), the comparison against --compare
// (`sheet.ts --compare`, then a screenshot per theme of its own page), the 14 random 3D captures
// (`capture-3d.ts`), and the start-area sheet (`start-sheet.ts`). Each step's own file has the
// details and can be run alone. Keeps worker/job counts modest by default (3) to sit beside other
// heavy work on this machine; raise --workers when the machine is free.
//
// A full run is four sequential steps of a few minutes each (the two sheets generate 210 maps
// apiece, the 3D captures open the editor up to 28 times in a headed Chrome, the start sheet
// generates 240 maps): roughly 20-30 minutes total at --workers 3 on this machine, less on a quiet
// one with more workers.

import { existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const arg = (name: string, fallback: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const OUT = arg("out", "investigation/m9a-review");
const WORKERS = arg("workers", "3");
const COMPARE = arg("compare", "main");
const RNG = arg("rng", "20260927");
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
  console.log(`M9a review set from ${sha}, into ${OUT}`);

  // 1. the contact sheet
  run("sheet", ["tools/sheet.ts", "--workers", WORKERS, "--png", join(OUT, "contact-sheet.png"), "--no-open", "--title", `M9a review: contact sheet (${sha})`]);

  // 2. the comparison against --compare, then one JPEG per theme of its own page
  const before = new Set(existsSync(resolve(".scratch", "sheets")) ? readdirSync(resolve(".scratch", "sheets")) : []);
  run("sheet", ["tools/sheet.ts", "--compare", COMPARE, "--workers", WORKERS, "--no-open", "--title", `M9a review: comparison vs ${COMPARE}`]);
  const html = latestSheetHtml(before);
  run("capture-compare", ["investigation/m9a-review/capture-compare.ts", html, "--out", OUT]);

  // 3. 14 random maps in 3D, a fixed recorded random seed
  run("capture-3d", ["investigation/m9a-review/capture-3d.ts", "--rng", RNG, "--out", OUT]);

  // 4. the start-area sheet (D229, D252 (1)): default themes and difficulties
  run("start-sheet", ["tools/start-sheet.ts", "--seeds", "1-30", "--size", "128", "--out", join(OUT, "start-areas.png"), "--jobs", WORKERS]);

  console.log(`\nDone. Files are in ${OUT}. Check each is under 1 MB and the set under ~15 MB before committing.`);
}

void main();
