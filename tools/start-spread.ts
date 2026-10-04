// How the start's own planting sits round each start (PLAN §20 D252): the groves for Minimum
// starting wood and the berry patches for Minimum starting bushes. For each theme and seed it prints
// the plants the start rules planted, their share within 6 and 10 tiles, the directions they fill, how much it leans to one
// side, its mean distance and the kinds of place it went, and whether the start meets Minimum
// starting wood, Minimum starting bushes and the starting-logs floor; then a summary per theme: how
// many starts get a ring (6 or more of the 8 directions each holding a sixteenth of the planting
// within 10 tiles).
//
//   npx tsx tools/start-spread.ts [--themes any,riverValley,canyon,highlands] [--seeds 1-20] [--size 128]
//                                 [--difficulty normal] [--jobs 4] [--out file.json]
//
// Each theme is made in its own process (--part), several at a time.

import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { startPlantingSpread, type StartPlantingSpread } from "./lib/startPlanting";
import { generate } from "../src/core/gen/generate";
import { runsToTiles } from "../src/core/math/grid";
import { groundOfFile } from "./lib/resources";
import { makeSpec, type Difficulty, type ThemeId } from "../src/core/spec/mapspec";

const here = dirname(fileURLToPath(import.meta.url));
const arg = (name: string, fallback: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};

interface Row extends StartPlantingSpread {
  theme: string;
  seed: number;
  passed: boolean;
  wood: number;
  bushes: number;
  floor: number;
  /** Standing dead trees in the start rules' groves (on dry ground). */
  deadTrees: number;
}

function part(theme: ThemeId, difficulty: Difficulty, seeds: number[], size: number, out: string): void {
  const rows: Row[] = [];
  for (const seed of seeds) {
    const r = generate(makeSpec({ seed, theme, size: { x: size, y: size }, designedFor: difficulty }));
    const st = r.features.find((f) => f.kind === "start");
    const [x, y] = st && st.kind === "start" ? st.params.position : [size >> 1, size >> 1];
    const s = startPlantingSpread(r.features, size, { x, y });
    const value = (id: string) => Number(r.report.checks.find((c) => c.id === id)?.value ?? NaN);
    // the start rules' groves' standing dead trees (a tree on dry ground)
    const mine = new Set<number>();
    for (const f of r.features) if (f.kind === "forest" && f.role?.startsWith("forest/start/")) for (const i of runsToTiles(f.params.area, size)) mine.add(i);
    let deadTrees = 0;
    for (const o of groundOfFile(r.file).objects) if (mine.has(o.y * size + o.x) && (o.components.LivingNaturalResource as { IsDead?: boolean } | undefined)?.IsDead === true) deadTrees++;
    const row: Row = { theme, seed, passed: r.report.passed, wood: value("start.wood"), bushes: value("start.food"), floor: value("start.wood_floor"), deadTrees, ...s };
    rows.push(row);
    console.log(
      `${theme} ${seed}: ${row.passed ? "passed" : "FAILED"}; ${s.groves} groves, ${s.patches} patches, ${s.plants} plants; within 6: ${(100 * s.yardShare).toFixed(0)}%, within 10: ${(100 * s.innerShare).toFixed(0)}%, ${s.octants}/8 directions${s.ring ? " (a ring)" : ""}; lean ${s.lean.toFixed(2)}; mean ${s.meanDistance.toFixed(1)} tiles, nearest ${s.nearest.toFixed(1)}; ${s.kinds.join(" ") || "-"}; trees ${Object.entries(s.species).map(([k, v]) => `${k} ${v}`).join(", ") || "none"}; dead ${deadTrees}; wood ${row.wood}, bushes ${row.bushes}, floor ${row.floor}`,
    );
  }
  writeFileSync(out, JSON.stringify(rows));
}

const q = (v: number[], p: number) => {
  const s = [...v].sort((a, b) => a - b);
  return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : NaN;
};

async function main(): Promise<void> {
  const size = Number(arg("size", "128"));
  const difficulty = arg("difficulty", "normal") as Difficulty;
  const [a, b] = arg("seeds", "1-20").split("-").map(Number);
  const seeds = Array.from({ length: (b ?? a) - a + 1 }, (_, k) => a + k);
  const i = process.argv.indexOf("--part");
  if (i >= 0) {
    part(process.argv[i + 1] as ThemeId, difficulty, seeds, size, arg("part-out", ""));
    return;
  }
  const themes = arg("themes", "any,riverValley,canyon,highlands").split(",") as ThemeId[];
  const jobs = Number(arg("jobs", "4"));
  const tmp = resolve(here, "..", ".scratch", "start-spread");
  mkdirSync(tmp, { recursive: true });
  const queue = themes.map((t) => ({ t, file: join(tmp, `${t}-${difficulty}-${size}.json`) }));
  const parts = [...queue];
  const run = async () => {
    for (let p = queue.shift(); p; p = queue.shift()) {
      const job = p;
      await new Promise<void>((done, fail) => {
        const c = spawn(process.execPath, ["--import", "tsx", resolve(here, "start-spread.ts"), "--part", job.t, "--seeds", `${seeds[0]}-${seeds.at(-1)}`, "--size", String(size), "--difficulty", difficulty, "--part-out", job.file], { stdio: ["ignore", "inherit", "inherit"] });
        c.on("exit", (code) => (code === 0 ? done() : fail(new Error(`${job.t} exited ${code}`))));
      });
    }
  };
  await Promise.all(Array.from({ length: Math.min(jobs, parts.length) }, run));
  const all: Row[] = [];
  console.log(`\n${size}², ${difficulty}, seeds ${seeds[0]}–${seeds.at(-1)}: rings (6 or more of the 8 directions each holding 1/16 of the planting within 10 tiles); the plants the start rules planted, their share within 6 and within 10 tiles, lean, mean distance (p10 / median / p90), the start rules met`);
  for (const p of parts) {
    const rows = JSON.parse(readFileSync(p.file, "utf8")) as Row[];
    all.push(...rows);
    const f = (v: number[], d = 2) => `${q(v, 0.1).toFixed(d)} / ${q(v, 0.5).toFixed(d)} / ${q(v, 0.9).toFixed(d)}`;
    const met = rows.filter((r) => r.passed).length;
    console.log(
      `${p.t}: rings ${rows.filter((r) => r.ring).length}/${rows.length}; plants ${f(rows.map((r) => r.plants), 0)}; within 6 ${f(rows.map((r) => r.yardShare))}; within 10 ${f(rows.map((r) => r.innerShare))}; lean ${f(rows.map((r) => r.lean))}; mean distance ${f(rows.map((r) => r.meanDistance), 1)}; starts with dead trees ${rows.filter((r) => r.deadTrees > 0).length}/${rows.length}; passed ${met}/${rows.length}; wood min ${Math.min(...rows.map((r) => r.wood))}, bushes min ${Math.min(...rows.map((r) => r.bushes))}, floor min ${Math.min(...rows.map((r) => r.floor))}`,
    );
  }
  const out = arg("out", "");
  if (out) writeFileSync(out, JSON.stringify(all, null, 1));
}

void main();
