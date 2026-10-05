// Badwater sheets, before | after (#265; D469): seeds of a theme at one size, each map as another
// checkout makes it (--before, a worktree of dev with its own packages: never a junction into this
// one) beside this checkout's, top-down: badwater (water 5% or more bad) rust red, badwater sources
// yellow, the start a red square. Each side also says, per map, whether its main water carries
// badwater: over a tenth of the main water's wet tiles 5% or more bad. The main water is read from
// the finished map, the same on every version: River Valley's and Delta's the course of the river
// named "river/main" (its own channel on a delta, not the fan's other arms) and the lakes it runs
// through; Lake Basin's its largest lake as it holds water.
//
//   git worktree add --detach .scratch/dev origin/dev   (then npm ci there)
//   npx tsx tools/badwater-sheet.ts --before .scratch/dev [--theme riverValley,delta,lakeBasin]
//       [--seeds 1-20] [--size 128] [--workers 8] [--out docs/sheets/badwater-line]
//
// Writes <out>-<theme>.png (laid out by tools/badwater-sheet.py, under 1 MB) and prints the counts.

import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Worker } from "node:worker_threads";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");

interface Job {
  theme: string;
  seed: number;
  size: number;
}

interface Made extends Job {
  png: string;
  version: string;
  passed: boolean;
  attempts: number;
  /** Share of the main water's wet tiles 5% or more bad (-1: no main water read). */
  mainBad: number;
  error?: string;
}

function workerSource(root: string): string {
  const u = (p: string) => JSON.stringify(pathToFileURL(join(root, p)).href);
  const png = JSON.stringify(pathToFileURL(join(ROOT, "tools", "png.ts")).href);
  return `
import { parentPort } from "node:worker_threads";
import { generate } from ${u("src/core/gen/generate.ts")};
import { shadeTiles } from ${u("src/core/render/shade.ts")};
import { polygonMask } from ${u("src/core/features/geometry.ts")};
import * as mapspec from ${u("src/core/spec/mapspec.ts")};
import { encodePng } from ${png};
const WET = 0.05, BAD = 0.05;
function mainMask(r, theme) {
  const b = r.built, W = b.W, H = b.H, N = W * H;
  const wet = (i) => b.water[i] > WET;
  const out = new Uint8Array(N);
  if (theme === "lakeBasin") {
    let best = null, bestN = 0;
    for (const f of r.features) {
      if (f.kind !== "lake") continue;
      const m = polygonMask(f.params.outline, W, H);
      let n = 0;
      for (let i = 0; i < N; i++) if (m[i] && wet(i)) n++;
      if (n > bestN) { bestN = n; best = m; }
    }
    if (!best) return null;
    // (the lake as it holds water: its wet tiles, and the wet tiles joined to them at its surface)
    const surf = [];
    for (let i = 0; i < N; i++) if (best[i] && wet(i)) surf.push(b.heights[i] + b.water[i]);
    surf.sort((p, q) => p - q);
    const level = surf[surf.length >> 1];
    const q = [];
    for (let i = 0; i < N; i++) if (best[i] && wet(i)) { out[i] = 1; q.push(i); }
    for (let k = 0; k < q.length; k++) {
      const c = q[k], x = c % W, y = (c - x) / W;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const j = yy * W + xx;
        if (out[j] || !wet(j) || Math.abs(b.heights[j] + b.water[j] - level) > 0.1) continue;
        out[j] = 1;
        q.push(j);
      }
    }
    return out;
  }
  const main = r.features.find((f) => f.kind === "river" && f.role === "river/main");
  if (!main) return null;
  const half = main.params.width / 2 + 1;
  const path = main.params.path;
  for (let k = 0; k + 1 < path.length; k++) {
    const [ax, ay] = path[k], [bx, by] = path[k + 1];
    const n = Math.max(1, Math.ceil(2 * Math.max(Math.abs(bx - ax), Math.abs(by - ay))));
    for (let t = 0; t <= n; t++) {
      const px = ax + ((bx - ax) * t) / n, py = ay + ((by - ay) * t) / n;
      const R = Math.ceil(half);
      for (let y = Math.max(0, Math.round(py) - R); y <= Math.min(H - 1, Math.round(py) + R); y++)
        for (let x = Math.max(0, Math.round(px) - R); x <= Math.min(W - 1, Math.round(px) + R); x++)
          if (Math.max(Math.abs(x - px), Math.abs(y - py)) <= half && wet(y * W + x)) out[y * W + x] = 1;
    }
  }
  for (const f of r.features) {
    if (f.kind !== "lake" || f.params.outlet?.target !== main.id) continue;
    const m = polygonMask(f.params.outline, W, H);
    for (let i = 0; i < N; i++) if (m[i] && wet(i)) out[i] = 1;
  }
  return out;
}
parentPort.on("message", (job) => {
  if (!job) process.exit(0);
  try {
    const spec = mapspec.makeSpec({ seed: job.seed, theme: job.theme, size: { x: job.size, y: job.size }, designedFor: "normal" });
    const r = generate(spec);
    const b = r.built, W = b.W, H = b.H, N = W * H;
    const rgb = shadeTiles(b.heights, W, H, b.water);
    const img = new Uint8Array(N * 3);
    const put = (x, y, c) => { if (x < 0 || y < 0 || x >= W || y >= H) return; const k = ((H - 1 - y) * W + x) * 3; img[k] = c[0]; img[k + 1] = c[1]; img[k + 2] = c[2]; };
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x;
      put(x, y, b.water[i] > WET && b.contamination[i] >= BAD ? [150, 48, 32] : [rgb[i * 3], rgb[i * 3 + 1], rgb[i * 3 + 2]]);
    }
    for (const s of b.sources) if (s.template === "BadwaterSource") for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) put(s.x + dx, s.y + dy, [255, 205, 0]);
    if (b.start) for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) put(b.start.x + dx, b.start.y + dy, Math.max(Math.abs(dx), Math.abs(dy)) === 3 ? [255, 255, 255] : [220, 30, 30]);
    const m = mainMask(r, job.theme);
    let n = 0, bad = 0;
    if (m) for (let i = 0; i < N; i++) if (m[i]) { n++; if (b.contamination[i] >= BAD) bad++; }
    parentPort.postMessage({ ...job, png: Buffer.from(encodePng(img, W, H)).toString("base64"), version: mapspec.GENERATOR_VERSION, passed: r.report.passed, attempts: r.attempts, mainBad: n ? bad / n : -1 });
  } catch (e) {
    parentPort.postMessage({ ...job, png: "", version: mapspec.GENERATOR_VERSION, passed: false, attempts: 0, mainBad: -1, error: String((e && e.message) || e) });
  }
});
`;
}

async function makeAll(jobs: Job[], root: string, n: number, label: string): Promise<Made[]> {
  const dir = join(root, ".scratch");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `.dgm-badwater-sheet-${process.pid}.mjs`);
  writeFileSync(file, workerSource(root));
  const out: Made[] = [];
  let next = 0;
  try {
    await new Promise<void>((ok, fail) => {
      let live = Math.max(1, Math.min(n, jobs.length));
      for (let w = 0, k = live; w < k; w++) {
        const worker = new Worker(file);
        const feed = () => worker.postMessage(next < jobs.length ? jobs[next++] : null);
        worker.on("message", (m: Made) => {
          out.push(m);
          process.stdout.write(`\r${label}: ${out.length}/${jobs.length}   `);
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
  return out;
}

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const NAMES: Record<string, string> = { riverValley: "River Valley", delta: "Delta", lakeBasin: "Lake Basin" };

async function main(): Promise<void> {
  const before = resolve(arg("before", ""));
  const themes = arg("theme", "riverValley,delta,lakeBasin").split(",");
  const [a, z] = arg("seeds", "1-20").split("-").map(Number);
  const seeds = Array.from({ length: (z ?? a) - a + 1 }, (_, k) => a + k);
  const size = Number(arg("size", "128"));
  const workers = Math.min(8, Number(arg("workers", "8")));
  const out = arg("out", "docs/sheets/badwater-line");
  const jobs = themes.flatMap((theme) => seeds.map((seed) => ({ theme, seed, size })));
  const after = await makeAll(jobs, ROOT, workers, "this checkout");
  const old = arg("before", "") ? await makeAll(jobs, before, workers, "before") : [];
  const dir = join(ROOT, ".scratch", "badwater-sheet");
  mkdirSync(dir, { recursive: true });
  const line = (ms: Made[]) => {
    const hit = ms.filter((m) => m.mainBad > 0.1).map((m) => m.seed).sort((p, q) => p - q);
    return `${hit.length} of ${ms.length}${hit.length ? ` (${hit.join(", ")})` : ""}`;
  };
  for (const theme of themes) {
    const pick = (ms: Made[]) => ms.filter((m) => m.theme === theme).sort((p, q) => p.seed - q.seed);
    const A = pick(after);
    const B = pick(old);
    const maps = A.map((m) => {
      const o = B.find((p) => p.seed === m.seed);
      const fa = `${theme}-${m.seed}-after.png`;
      writeFileSync(join(dir, fa), Buffer.from(m.png, "base64"));
      let fb = "";
      if (o?.png) writeFileSync(join(dir, (fb = `${theme}-${m.seed}-before.png`)), Buffer.from(o.png, "base64"));
      return { seed: m.seed, after: fa, before: fb, afterBad: m.mainBad > 0.1, beforeBad: !!o && o.mainBad > 0.1 };
    });
    const vb = B[0]?.version ?? "";
    const va = A[0]?.version ?? "";
    const title = `${NAMES[theme] ?? theme} ${size}², seeds ${seeds[0]}–${seeds[seeds.length - 1]}: ${B.length ? `before (dev, ${vb}) | ` : ""}after (${va}). Rust red: badwater; yellow: sources; red square: start; * main ${theme === "lakeBasin" ? "lake" : "river"} carries badwater`;
    writeFileSync(join(dir, `${theme}.json`), JSON.stringify({ title, maps }, null, 1));
    const png = `${out}-${theme}.png`;
    const r = spawnSync(process.env.PYTHON ?? "python", [join(ROOT, "tools", "badwater-sheet.py"), join(dir, `${theme}.json`), dir, png], { encoding: "utf8" });
    process.stdout.write(r.stdout + r.stderr);
    console.log(`${NAMES[theme] ?? theme}: main ${theme === "lakeBasin" ? "lake" : "river"} carries badwater on ${B.length ? `${line(B)} before, ` : ""}${line(A)} after`);
    for (const m of [...A, ...B]) if (m.error || !m.passed) console.log(`  ${m.version} seed ${m.seed}: ${m.error ?? "did not pass"}`);
  }
}

void main();
