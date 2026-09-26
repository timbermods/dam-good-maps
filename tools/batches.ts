// Batch pass rates for every theme and size at once (ROADMAP M9a's acceptance: ≥ 98% final per theme
// and size at 96², 128², 192² and 256², "Any" included; the straightness of the channels beside
// them). Runs tools/batch.ts once per theme and size, several at a time, writes each run's report to
// a folder (bulk results stay out of git, PLAN §20 D195) and prints a summary table.
//
//   npx tsx tools/batches.ts [--themes any,riverValley,...] [--sizes 96,128,192,256]
//                            [--seeds 96=1-100,128=1-100,192=1-50,256=1-50] [--jobs 6]
//                            [--difficulty normal] [--set rl=80] [--out investigation/m9a/local/batches]
//                            [--summary-only]
//
// --seeds gives each size its seeds (one range for every size, or size=range pairs). --summary-only
// reads the reports already in --out and prints the table. The summary is also written to
// <out>/summary.md. First attempts are information (D115): only the final rate gates, and a project
// file that does not reopen to the same bytes.
//
// Exits non-zero when any theme and size is below 98% final or a run failed.

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { AVAILABLE_THEMES } from "../src/core/spec/mapspec";

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const themes = arg("themes", AVAILABLE_THEMES.join(",")).split(",");
const sizes = arg("sizes", "96,128,192,256").split(",").map(Number);
const seedArg = arg("seeds", "96=1-100,128=1-100,192=1-50,256=1-50");
const jobs = Math.max(1, Number(arg("jobs", "6")));
const difficulty = arg("difficulty", "normal");
const set = arg("set", "");
const out = arg("out", "investigation/m9a/local/batches");
const summaryOnly = process.argv.includes("--summary-only");

function seedsFor(size: number): string {
  if (!seedArg.includes("=")) return seedArg;
  for (const part of seedArg.split(",")) {
    const [s, r] = part.split("=");
    if (Number(s) === size) return r;
  }
  throw new Error(`no seeds given for ${size}² (--seeds ${seedArg})`);
}

const reportOf = (theme: string, size: number) => join(out, `${size}-${theme}${difficulty !== "normal" ? `-${difficulty}` : ""}.md`);

interface Job {
  theme: string;
  size: number;
}

async function run(j: Job): Promise<number> {
  const argv = ["--import", "tsx", "tools/batch.ts", "--seeds", seedsFor(j.size), "--size", String(j.size), "--theme", j.theme, "--difficulty", difficulty, "--min-first", "0", "--report", reportOf(j.theme, j.size)];
  if (set) argv.push("--set", set);
  const t0 = performance.now();
  return new Promise((resolve) => {
    const p = spawn(process.execPath, argv, { stdio: ["ignore", "ignore", "pipe"] });
    let err = "";
    p.stderr.on("data", (d) => (err += String(d)));
    p.on("close", (code) => {
      console.log(`${j.size}² ${j.theme}: exit ${code} in ${Math.round((performance.now() - t0) / 60000)} min${code && err ? `\n${err.trim().split("\n").slice(-5).join("\n")}` : ""}`);
      resolve(code ?? 1);
    });
  });
}

interface Row {
  size: number;
  theme: string;
  final: [number, number];
  first: [number, number];
  median: number;
  p90: number;
  bank: string;
  canal: string;
  reopen: string;
  failed: string;
  district: string;
  rise: string;
}

function parse(theme: string, size: number): Row | null {
  const f = reportOf(theme, size);
  if (!existsSync(f)) return null;
  const s = readFileSync(f, "utf8");
  const frac = (re: RegExp): [number, number] => {
    const m = re.exec(s);
    return m ? [Number(m[1]), Number(m[2])] : [0, 0];
  };
  const t = /time per map: median (\d+) ms, p90 (\d+) ms/.exec(s);
  const st = /the longest straight bank (median [\d.]+, p90 [\d.]+, max [\d.]+|none) tiles \(limit [\d.]+\), the longest canal (median [\d.]+, p90 [\d.]+, max [\d.]+|none)/.exec(s);
  const ro = /project round trip: (\d+\/\d+)/.exec(s);
  const fc = /checks that failed an attempt: (.*)/.exec(s);
  const sp = /a second district's site on (\d+\/\d+) accepted maps, ruins on a rise on (\d+\/\d+)/.exec(s);
  return {
    size,
    theme,
    final: frac(/- final: (\d+)\/(\d+)/),
    first: frac(/- first attempt: (\d+)\/(\d+)/),
    median: t ? Number(t[1]) : NaN,
    p90: t ? Number(t[2]) : NaN,
    bank: st ? st[1] : "?",
    canal: st ? st[2] : "?",
    reopen: ro ? ro[1] : "?",
    failed: fc ? fc[1] : "?",
    district: sp ? sp[1] : "?",
    rise: sp ? sp[2] : "?",
  };
}

async function main() {
  mkdirSync(out, { recursive: true });
  const all: Job[] = [];
  for (const size of sizes) for (const theme of themes) all.push({ theme, size });
  let bad = 0;
  if (!summaryOnly) {
    // the biggest maps first, so the long runs start early
    const queue = all.slice().sort((a, b) => b.size - a.size);
    const workers = Array.from({ length: Math.min(jobs, queue.length) }, async () => {
      for (let j = queue.shift(); j; j = queue.shift()) if ((await run(j)) !== 0) bad++;
    });
    await Promise.all(workers);
  }
  const pct = ([a, n]: [number, number]) => (n ? `${a}/${n} (${((100 * a) / n).toFixed(1)}%)` : "–");
  const lines = [
    `Batches designed for ${difficulty}${set ? ` with ${set}` : ""}; the straight channels are the accepted maps' longest straight bank and canal (tiles; limits 44 and 34.3, investigation/m9a/straight-reference.json).`,
    "",
    "| Size | Theme | Final | First attempt | Time median / p90 (ms) | Longest straight bank | Longest canal | Second district / rise | Project round trip | Checks that failed an attempt |",
    "|---|---|---|---|---|---|---|---|---|---|",
  ];
  let below = 0;
  for (const j of all) {
    const r = parse(j.theme, j.size);
    if (!r) {
      lines.push(`| ${j.size}² | ${j.theme} | no report | | | | | | | |`);
      below++;
      continue;
    }
    if (!r.final[1] || r.final[0] / r.final[1] < 0.98) below++;
    lines.push(`| ${r.size}² | ${r.theme} | ${pct(r.final)} | ${pct(r.first)} | ${r.median} / ${r.p90} | ${r.bank} | ${r.canal} | ${r.district} / ${r.rise} | ${r.reopen} | ${r.failed} |`);
  }
  writeFileSync(join(out, "summary.md"), lines.join("\n") + "\n");
  console.log(lines.join("\n"));
  console.log(below || bad ? `${below} theme and size below 98% final or missing; ${bad} runs exited non-zero` : "every theme and size at 98% final or better");
  process.exit(below || bad ? 1 : 0);
}

void main();
