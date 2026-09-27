// Real places at deploy time (ROADMAP "Real places"; Kyler, 2026-09-25): every place's .timber is
// built once, into the site, so **Download** is a static file and **Refine** loads it. deploy.yml runs
// this after `vite build`, so every deploy rebuilds the maps with the engine it deploys.
//
//   npm run places:build                   (every place → dist/real-places/maps/<id>.timber)
//   npm run places:build -- --sample       (the sample the browser tests use: placeSample)
//   npm run places:build -- --only a,b     (the places named)
//   npm run places:build -- --out <dir>    (the built site's folder; default dist)
//
// It reads the index and data the site serves (<out>/real-places/, which vite build copies from
// public/), builds each place with src/core/places (build, settle, validate, write) in worker
// threads, and writes the files beside them. It fails, writing nothing, when a place does not pass
// the export profile and every check of the generate profile that is not about playability on its
// written file (D245: those are information; tests/contract/placesCommon.ts checks the same), or
// when a file is not the one the index records (sha256 and size): then the engine changed and the
// index is stale (`npm run places`).

import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { isMainThread, parentPort, Worker } from "node:worker_threads";
import { readTimber } from "../src/core/format/timber";
import { decodePlaceFile, placeProblems, placeSample, placeTimber, type PlaceIndex, type PlaceIndexEntry } from "../src/core/places/place";
import { validateMap } from "../src/core/validate/checks";

interface Job {
  id: string;
  data: string;
}

interface Result {
  id: string;
  ms: number;
  bytes?: Uint8Array;
  /** The checks that block it (the export profile, or the generate profile's checks that are not
   *  about playability, on its written file), or the error. */
  failing: string[];
}

/** Build and check one place (in a worker). */
function build(job: Job): Result {
  const t = performance.now();
  try {
    const r = placeTimber(decodePlaceFile(new Uint8Array(readFileSync(job.data))));
    const v = validateMap(readTimber(r.bytes), { profile: "generate", designedFor: "normal", features: [], water: { model: r.validation.model!, settled: r.validation.water! } });
    const failing = placeProblems(v.report.checks).blocking.map((id) => `generate profile: ${id}`);
    return { id: job.id, ms: performance.now() - t, bytes: r.bytes, failing };
  } catch (e) {
    return { id: job.id, ms: performance.now() - t, failing: [String(e instanceof Error ? e.message : e)] };
  }
}

function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : null;
}

const sha256 = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
const kb = (n: number) => `${(n / 1024).toFixed(0)} KB`;

async function main(): Promise<void> {
  const site = join(arg("out") ?? "dist", "real-places");
  const indexPath = join(site, "index.json");
  if (!existsSync(indexPath)) throw new Error(`${indexPath} is missing: run vite build (npm run build) first`);
  const index = JSON.parse(readFileSync(indexPath, "utf8")) as PlaceIndex;
  const only = arg("only")?.split(",") ?? null;
  const places: PlaceIndexEntry[] = process.argv.includes("--sample") ? placeSample(index) : only ? index.places.filter((p) => only.includes(p.id)) : index.places;
  if (only && places.length !== only.length) throw new Error(`no place called ${only.filter((id) => !places.some((p) => p.id === id)).join(", ")}`);
  for (const p of places) if (p.file !== `maps/${p.id}.timber`) throw new Error(`${p.id}: its file is ${p.file}, not maps/${p.id}.timber`);

  // the largest first, so the threads finish together
  const jobs: Job[] = [...places].sort((a, b) => b.size - a.size).map((p) => ({ id: p.id, data: join(site, p.data) }));
  const threads = Math.max(1, Math.min(jobs.length, Number(arg("threads") ?? availableParallelism())));
  const t0 = performance.now();
  const results = new Map<string, Result>();
  await new Promise<void>((resolve, reject) => {
    let next = 0;
    let running = threads;
    for (let k = 0; k < threads; k++) {
      const w = new Worker(fileURLToPath(import.meta.url));
      const feed = () => {
        if (next < jobs.length) w.postMessage(jobs[next++]);
        else {
          void w.terminate();
          if (--running === 0) resolve();
        }
      };
      w.on("message", (r: Result) => {
        results.set(r.id, r);
        const e = places.find((p) => p.id === r.id)!;
        console.log(`${r.failing.length ? "FAIL" : "ok  "} ${e.size}² ${(r.ms / 1000).toFixed(1).padStart(5)} s  ${e.name}${r.failing.length ? `: ${r.failing.join(", ")}` : ""}`);
        feed();
      });
      w.on("error", reject);
      feed();
    }
  });
  const seconds = (performance.now() - t0) / 1000;

  const problems: string[] = [];
  for (const p of places) {
    const r = results.get(p.id)!;
    if (r.failing.length) problems.push(`${p.name}: ${r.failing.join(", ")}`);
    else if (sha256(r.bytes!) !== p.sha256 || r.bytes!.length !== p.bytes)
      problems.push(`${p.name}: sha256 ${sha256(r.bytes!).slice(0, 12)}…, ${r.bytes!.length} B; the index has ${p.sha256.slice(0, 12)}…, ${p.bytes} B`);
  }
  if (problems.length) {
    console.error(`${problems.length} of ${places.length} real places failed; nothing written:\n  ${problems.join("\n  ")}`);
    if (problems.some((p) => p.includes("the index has"))) console.error("A file that is not the index's means the engine changed its bytes: run npm run places and commit the index.");
    process.exit(1);
  }

  const maps = join(site, "maps");
  rmSync(maps, { recursive: true, force: true });
  let total = 0;
  for (const p of places) {
    const bytes = results.get(p.id)!.bytes!;
    const path = join(site, p.file);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, bytes);
    total += bytes.length;
  }
  const largest = Math.max(...places.map((p) => p.bytes));
  const line = `${places.length} real places built in ${seconds.toFixed(0)} s on ${threads} threads: ${(total / 1024 / 1024).toFixed(1)} MB in all (largest ${kb(largest)}), each the index's file, in ${maps}.`;
  console.log(line);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Real places\n\n${line}\n`);
}

if (isMainThread) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
} else {
  parentPort!.on("message", (job: Job) => {
    const r = build(job);
    parentPort!.postMessage(r, r.bytes ? [r.bytes.buffer as ArrayBuffer] : []);
  });
}
