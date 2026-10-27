// The opening shot's rates (D493): how often the game's first camera, pulled back without turning,
// frames a landmark (a standing form 8+ levels over its ring, 25–60 tiles from the start), on the
// default maps and on maps steered toward the landmark intention; and how often the landmark
// intention emerges.
//
//   npx tsx tools/opening-rates.ts [--themes riverValley,canyon] [--seeds 1-30] [--size 128] [--jobs 3] [--force landmark] [--json out.json]

import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Worker } from "node:worker_threads";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const arg = (n: string, f: string) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : f;
};

interface Row {
  theme: string;
  seed: number;
  passed: boolean;
  drawn: string[];
  landmark: string;
  inView: boolean;
  anyOrientation: boolean;
  stand: number;
  dist: number;
  score: number;
  orientation: string;
  ms: number;
  error?: string;
}

async function main(): Promise<void> {
  const themes = arg("themes", "riverValley,canyon,highlands,lakeBasin,delta,islands").split(",");
  const [a, b] = arg("seeds", "1-30").split("-").map(Number);
  const size = Number(arg("size", "128"));
  const force = arg("force", "");
  const jobs: { theme: string; seed: number }[] = [];
  for (const theme of themes) for (let seed = a; seed <= (b ?? a); seed++) jobs.push({ theme, seed });
  const u = (p: string) => JSON.stringify(pathToFileURL(join(ROOT, p)).href);
  const file = join(ROOT, ".scratch", `.dgm-opening-${process.pid}.mjs`);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(
    file,
    `import { parentPort } from "node:worker_threads";
import { generate } from ${u("src/core/gen/generate.ts")};
import * as mapspec from ${u("src/core/spec/mapspec.ts")};
import { fallsOf } from ${u("src/core/analysis/vertical.ts")};
import { prepareOpening, openingShotScore, landmarkInView } from ${u("src/core/analysis/opening.ts")};
parentPort.on("message", (j) => {
  if (!j) process.exit(0);
  const t0 = performance.now();
  try {
    const r = generate(mapspec.makeSpec({ seed: j.seed, theme: j.theme, size: { x: ${size}, y: ${size} } }), ${force ? `{ intentions: [${JSON.stringify(force)}] }` : "{}"});
    const b = r.built;
    const se = b.entities.find((e) => e.template === "StartingLocation");
    const st = { x: b.start.x, y: b.start.y, z: b.start.z, orientation: se.orientation };
    const land = prepareOpening(b.heights, b.W, b.H, b.water, fallsOf(b.heights, b.water, b.W, b.H, 1.5));
    const shot = openingShotScore(land, st);
    const anyO = ["Cw0", "Cw90", "Cw180", "Cw270"].some((o) => landmarkInView(land, { ...st, orientation: o }));
    const lm = r.intentions.find((q) => q.id === "landmark");
    parentPort.postMessage({ ...j, passed: r.report.passed, drawn: r.intentions.map((q) => q.id + ":" + q.outcome), landmark: lm ? lm.outcome : "", inView: !!shot.landmark, anyOrientation: anyO, stand: shot.landmark?.stand ?? 0, dist: shot.landmark?.dist ?? 0, score: Math.round(shot.score * 100) / 100, orientation: st.orientation, ms: Math.round(performance.now() - t0) });
  } catch (e) { parentPort.postMessage({ ...j, passed: false, drawn: [], landmark: "", inView: false, anyOrientation: false, stand: 0, dist: 0, score: 0, orientation: "", ms: 0, error: String(e && e.stack || e) }); }
});`,
  );
  const n = Math.max(1, Math.min(Number(arg("jobs", "3")), jobs.length));
  const out: Row[] = [];
  let next = 0;
  try {
    await new Promise<void>((ok, fail) => {
      let live = n;
      for (let w = 0; w < n; w++) {
        const worker = new Worker(file);
        const feed = () => worker.postMessage(next < jobs.length ? jobs[next++] : null);
        worker.on("message", (m: Row) => {
          out.push(m);
          process.stdout.write(`\r${out.length}/${jobs.length}   `);
          feed();
        });
        worker.on("error", fail);
        worker.on("exit", () => {
          if (--live === 0) ok();
        });
        feed();
      }
    });
  } finally {
    rmSync(file, { force: true });
  }
  process.stdout.write("\n");
  out.sort((p, q) => p.theme.localeCompare(q.theme) || p.seed - q.seed);
  const json = arg("json", "");
  if (json) writeFileSync(json, JSON.stringify(out, null, 1));
  for (const e of out.filter((r) => r.error).slice(0, 3)) console.log(`${e.theme} ${e.seed}: ${e.error}`);
  console.log(`theme        maps  landmark drawn  emerged  drawn+in view  frames holding a landmark  could (any turn)`);
  const line = (name: string, r: Row[]) => {
    const drawn = r.filter((x) => x.landmark && x.landmark !== "found");
    const emerged = drawn.filter((x) => x.landmark === "emerged" || x.landmark === "re-steered");
    console.log(`${name.padEnd(12)} ${String(r.length).padStart(4)}  ${String(drawn.length).padStart(14)}  ${String(emerged.length).padStart(7)}  ${String(drawn.filter((x) => x.inView).length).padStart(13)}  ${String(r.filter((x) => x.inView).length).padStart(25)}  ${String(r.filter((x) => x.anyOrientation).length).padStart(16)}`);
  };
  for (const t of themes) line(t, out.filter((r) => r.theme === t));
  line("all", out);
}

void main();
