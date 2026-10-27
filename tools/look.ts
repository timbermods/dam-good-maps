// A closer look at a few maps (M9b's working tool; not a gate): each map drawn large, top-down, with
// what the analysis reads from it beside it, for judging maps by eye while the generator changes.
//
//   npx tsx tools/look.ts --maps any:1,canyon:7 [--size 128] [--variety 70] [--vt 25]
//                         [--scale 4] [--jobs 2] [--out .scratch/look/<name>] [--systems]
//   npx tsx tools/look.ts --themes any,islands --seeds 1-6 ...
//
// Writes one PNG per map (north up; the start's 3×3 red; badwater purple; with --systems the main
// water system blue and every other one orange) and `index.json` with each map's intentions, its
// water story, its signature and its timings; `--grid` also lays them out as one labelled PNG
// (tools/contact-sheet.py's layout, larger cells).

import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { cpus } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Worker } from "node:worker_threads";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");

interface Job {
  theme: string;
  seed: number;
  size: number;
  variety: number | null;
  vt: number | null;
  scale: number;
  systems: boolean;
  paths: boolean;
  intention: string | null;
  designedFor: string;
}

function workerSource(): string {
  const u = (p: string) => JSON.stringify(pathToFileURL(join(ROOT, p)).href);
  return `
import { parentPort } from "node:worker_threads";
import { generate } from ${u("src/core/gen/generate.ts")};
import { shadeTiles } from ${u("src/core/render/shade.ts")};
import { waterStory, wetSystems } from ${u("src/core/analysis/story.ts")};
import { signatureOf } from ${u("src/core/analysis/signature.ts")};
import * as mapspec from ${u("src/core/spec/mapspec.ts")};
import { encodePng } from ${u("tools/png.ts")};
let extra = null;
try { extra = await import(${u("src/core/gen/outcomes.ts")}); } catch { extra = null; }
parentPort.on("message", (job) => {
  if (!job) process.exit(0);
  const t0 = performance.now();
  try {
    const spec = mapspec.makeSpec({ seed: job.seed, theme: job.theme, size: { x: job.size, y: job.size }, designedFor: job.designedFor });
    if (job.vt !== null) spec.settings.terrain.verticality = job.vt;
    if (job.variety !== null && "variety" in spec.settings.terrain) spec.settings.terrain.variety = job.variety;
    let first = -1;
    const r = generate(spec, { ...(job.variety === null ? {} : { variety: job.variety }), ...(job.intention ? { intentions: [job.intention] } : {}), onCandidate: () => { if (first < 0) first = performance.now() - t0; } });
    const b = r.built, W = b.W, H = b.H, S = job.scale;
    const rgb = shadeTiles(b.heights, W, H, b.water);
    const sys = wetSystems(W, H, b.water);
    let main = -1;
    sys.volume.forEach((v, k) => { if (main < 0 || v > sys.volume[main]) main = k; });
    const img = new Uint8Array(W * S * H * S * 3);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x;
      let c = [rgb[i * 3], rgb[i * 3 + 1], rgb[i * 3 + 2]];
      if (b.water[i] > 0.05 && b.contamination[i] >= 0.05) c = [150, 60, 170];
      else if (job.systems && sys.labels[i] >= 0 && sys.labels[i] !== main) c = [230, 140, 40];
      for (let sy = 0; sy < S; sy++) for (let sx = 0; sx < S; sx++) {
        const k = (((H - 1 - y) * S + sy) * W * S + x * S + sx) * 3;
        img[k] = c[0]; img[k + 1] = c[1]; img[k + 2] = c[2];
      }
    }
    if (job.paths) for (const f of r.features) {
      if (f.kind !== "river") continue;
      const col = f.role === "river/main" ? [255, 230, 0] : f.params.badwater ? [255, 120, 255] : [255, 255, 255];
      const p = f.params.path;
      for (let k = 0; k + 1 < p.length; k++) {
        const [ax, ay] = p[k], [bx, by] = p[k + 1];
        const n = Math.max(1, Math.ceil(Math.max(Math.abs(bx - ax), Math.abs(by - ay)) * S));
        for (let t = 0; t <= n; t++) {
          const px = Math.round((ax + ((bx - ax) * t) / n) * S + S / 2), py = Math.round((H - 1 - (ay + ((by - ay) * t) / n)) * S + S / 2);
          if (px < 0 || py < 0 || px >= W * S || py >= H * S) continue;
          const k3 = (py * W * S + px) * 3;
          img[k3] = col[0]; img[k3 + 1] = col[1]; img[k3 + 2] = col[2];
        }
      }
    }
    if (b.start) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const x = b.start.x + dx, y = b.start.y + dy;
      for (let sy = 0; sy < S; sy++) for (let sx = 0; sx < S; sx++) {
        const k = (((H - 1 - y) * S + sy) * W * S + x * S + sx) * 3;
        img[k] = 230; img[k + 1] = 20; img[k + 2] = 20;
      }
    }
    const story = waterStory(W, H, b.water, r.features, b.contamination);
    const out = extra && extra.outcomesOf ? extra.outcomesOf(r) : null;
    parentPort.postMessage({
      theme: job.theme, seed: job.seed, size: job.size, variety: job.variety, vt: job.vt,
      png: Buffer.from(encodePng(img, W * S, H * S)).toString("base64"),
      passed: r.report.passed, attempts: r.attempts, genomes: r.info.genomes, ms: Math.round(performance.now() - t0), first: Math.round(first),
      intentions: r.intentions.map((x) => ({ id: x.id, ok: x.ok, note: x.note })),
      drawn: r.info.genome ? r.info.genome.intentions : [],
      recipe: r.info.genome?.seaLayout ? "sea " + r.info.genome.seaLayout : null,
      hydro: r.info.hydro, story, outcomes: out, sig: signatureOf(W, H, b.heights, b.water, r.features),
      name: r.name ?? null, description: r.description ?? null, straight: r.info.straight ?? null,
      badwater: r.features.filter((f) => f.kind === "setPiece" && f.params.kind === "badwaterBasin").map((f) => f.params.plan.outletTo),
      failures: r.failures.map((f) => f.failed.join("+")),
    });
  } catch (e) {
    parentPort.postMessage({ theme: job.theme, seed: job.seed, error: String(e && e.stack || e) });
  }
});
`;
}

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

function range(s: string): number[] {
  const out: number[] = [];
  for (const part of s.split(",")) {
    const [a, b] = part.split("-").map(Number);
    for (let k = a; k <= (b ?? a); k++) out.push(k);
  }
  return out;
}

async function main(): Promise<void> {
  const size = Number(arg("size", "128"));
  const variety = process.argv.includes("--variety") ? Number(arg("variety", "70")) : null;
  const vt = process.argv.includes("--vt") ? Number(arg("vt", "25")) : null;
  const scale = Number(arg("scale", size > 160 ? "2" : "4"));
  const systems = process.argv.includes("--systems");
  const paths = process.argv.includes("--paths");
  const intention = process.argv.includes("--intention") ? arg("intention", "") : null;
  const designedFor = arg("designed-for", "normal");
  const pairs: [string, number][] = process.argv.includes("--maps")
    ? arg("maps", "").split(",").map((p) => {
        const [t, s] = p.split(":");
        return [t, Number(s)] as [string, number];
      })
    : arg("themes", "any").split(",").flatMap((t) => range(arg("seeds", "1-6")).map((s) => [t, s] as [string, number]));
  const jobs: Job[] = pairs.map(([theme, seed]) => ({ theme, seed, size, variety, vt, scale, systems, paths, intention, designedFor }));
  const outDir = resolve(ROOT, arg("out", join(".scratch", "look", new Date().toISOString().replace(/[:.]/g, "-"))));
  mkdirSync(outDir, { recursive: true });
  const n = Math.max(1, Math.min(Number(arg("jobs", String(Math.max(1, Math.min(4, cpus().length - 2))))), jobs.length));
  const file = join(ROOT, ".scratch", `.dgm-look-worker-${process.pid}.mjs`);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, workerSource());
  const results: Record<string, unknown>[] = [];
  let next = 0;
  const t0 = performance.now();
  try {
    await new Promise<void>((ok, fail) => {
      let live = n;
      for (let w = 0; w < n; w++) {
        const worker = new Worker(file);
        const feed = () => worker.postMessage(next < jobs.length ? jobs[next++] : null);
        worker.on("message", (m: Record<string, unknown>) => {
          const tag = `${m.theme}-${m.seed}`;
          if (m.error) console.log(`${tag}: ERROR ${m.error}`);
          else {
            writeFileSync(join(outDir, `${tag}.png`), Buffer.from(m.png as string, "base64"));
            const s = m.story as { mainShare: number; systems: number; ponds: number; heads: number; separate: number; readable: boolean; why: string[] };
            const ints = (m.intentions as { id: string; ok: boolean }[]).map((x) => `${x.id}${x.ok ? "+" : "-"}`).join(" ");
            console.log(`${tag}: ${m.passed ? "ok" : "FAIL"} ${m.attempts}a/${m.genomes}g ${m.ms}ms | story ${s.readable ? "readable" : "NOT (" + s.why.join("; ") + ")"} main ${s.mainShare} sys ${s.systems} ponds ${s.ponds} heads ${s.heads} sep ${s.separate} wet ${(s as {mainWet?: number}).mainWet}/${(s as {leastWet?: number}).leastWet} reach ${(s as {reach?: number}).reach} | ${ints || "(no intentions)"} | fails ${(m.failures as string[]).join(",")}${m.recipe ? " | recipe " + m.recipe : ""}${m.name ? " | " + m.name : ""}`);
            delete m.png;
            m.file = `${tag}.png`;
          }
          results.push(m);
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
  results.sort((a, b) => pairs.findIndex(([t, s]) => t === a.theme && s === a.seed) - pairs.findIndex(([t, s]) => t === b.theme && s === b.seed));
  writeFileSync(join(outDir, "index.json"), JSON.stringify({ size, variety, vt, maps: results }, null, 1));
  console.log(`${outDir} (${results.length} maps, ${Math.round((performance.now() - t0) / 1000)} s)`);
  if (process.argv.includes("--grid")) {
    const r = spawnSync(process.env.PYTHON ?? "python", [join(ROOT, "tools", "look-grid.py"), outDir, arg("grid-cols", "3"), arg("grid-cell", "384")], { encoding: "utf8" });
    process.stdout.write(r.stdout + r.stderr);
  }
}

void main();
