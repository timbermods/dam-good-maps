// The contact sheet (ROADMAP M9a: a tool for Kyler's eyes, not a gate; PLAN §20 D144). It generates
// seeds 1–30 of every theme at 128² (Any first) and shows each as a small top-down shaded picture,
// one grid per theme, labelled with its seed, on one HTML page in .scratch/sheets/ that opens by
// itself. A click on a map opens it in the app with its share link. No checks, no reports.
//
//   npm run sheet -- [--theme any,canyon] [--seeds 1-30] [--size 128] [--variety 70]
//                    [--designed-for normal] [--compare <git ref>] [--workers 8]
//                    [--app https://timbermods.github.io/dam-good-maps/] [--png docs/sheets/<step>.png]
//                    [--title "<title>"] [--no-open]
//
// --compare puts the same seeds from another version beside each map: that version is checked out
// into a temporary worktree outside this one (sharing this checkout's node_modules), generated
// there, and the worktree removed; the working tree is never touched. --png also writes the small
// labelled PNG a map-changing step commits (D144; laid out by tools/contact-sheet.py, under 1 MB).
// --variety sets the genome's Variety for these maps only: a share link does not carry it (M9b
// makes it a setting), so its links open the map at the default Variety.
//
// The maps are made on worker threads (one process; --workers, default the cores less two, at
// most 8), so 30 seeds of the seven themes take a couple of minutes.

import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { cpus, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Worker } from "node:worker_threads";

interface Job {
  theme: string;
  seed: number;
  size: number;
  designedFor: string;
  variety: number | null;
}

interface Made {
  theme: string;
  seed: number;
  /** The picture, a PNG, north up (base64). */
  png: string;
  passed: boolean;
  attempts: number;
  ms: number;
  /** The share link's fragment (without #). */
  fragment: string;
  version: string;
}

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");

// ------------------------------------------------------------------------------ the worker

/** The worker's body, as a module source: it imports the generator from `root` (this checkout, or a
 *  temporary worktree of another version) and this checkout's PNG writer. */
function workerSource(root: string): string {
  const u = (p: string) => JSON.stringify(pathToFileURL(join(root, p)).href);
  const png = JSON.stringify(pathToFileURL(join(ROOT, "tools", "png.ts")).href);
  return `
import { parentPort } from "node:worker_threads";
import { generate } from ${u("src/core/gen/generate.ts")};
import { shadeTiles } from ${u("src/core/render/shade.ts")};
import * as mapspec from ${u("src/core/spec/mapspec.ts")};
import { encodePng } from ${png};
const b64 = (b) => Buffer.from(b).toString("base64");
parentPort.on("message", (job) => {
  if (!job) { process.exit(0); }
  const t0 = performance.now();
  try {
  const spec = mapspec.makeSpec({ seed: job.seed, theme: job.theme, size: { x: job.size, y: job.size }, designedFor: job.designedFor });
  const r = generate(spec, job.variety === null ? {} : { variety: job.variety });
  const W = r.built.W, H = r.built.H;
  const rgb = shadeTiles(r.built.heights, W, H, r.built.water);
  const img = new Uint8Array(W * H * 3);
  for (let y = 0; y < H; y++) img.set(rgb.subarray(y * W * 3, (y + 1) * W * 3), (H - 1 - y) * W * 3);
  const s = r.built.start;
  if (s)
    for (let dy = -3; dy <= 3; dy++)
      for (let dx = -3; dx <= 3; dx++) {
        const x = s.x + dx, y = s.y + dy;
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        const rim = Math.max(Math.abs(dx), Math.abs(dy)) === 3;
        const k = ((H - 1 - y) * W + x) * 3;
        img[k] = rim ? 255 : 220; img[k + 1] = rim ? 255 : 30; img[k + 2] = rim ? 255 : 30;
      }
  const fragment = mapspec.encodeSpecFragment ? mapspec.encodeSpecFragment(r.spec) : "";
  parentPort.postMessage({ theme: job.theme, seed: job.seed, png: b64(encodePng(img, W, H)), passed: r.report.passed, attempts: r.attempts, ms: Math.round(performance.now() - t0), fragment, version: mapspec.GENERATOR_VERSION });
  } catch (e) {
    // (a theme this version does not make, for example)
    parentPort.postMessage({ theme: job.theme, seed: job.seed, png: "", passed: false, attempts: 0, ms: Math.round(performance.now() - t0), fragment: "", version: mapspec.GENERATOR_VERSION, error: String(e && e.message || e) });
  }
});
`;
}

/** Make every job on `n` worker threads running the generator at `root`. */
async function makeAll(jobs: Job[], root: string, n: number, label: string): Promise<Made[]> {
  // (this checkout's worker file goes in its .scratch; another version's in its temporary worktree)
  const dir = root === ROOT ? join(ROOT, ".scratch") : root;
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `.dgm-sheet-worker-${process.pid}.mjs`);
  writeFileSync(file, workerSource(root));
  const out: Made[] = [];
  let next = 0;
  let done = 0;
  const t0 = performance.now();
  try {
    await new Promise<void>((ok, fail) => {
      const workers = Math.max(1, Math.min(n, jobs.length));
      let live = workers;
      for (let w = 0; w < workers; w++) {
        const worker = new Worker(file);
        const feed = () => worker.postMessage(next < jobs.length ? jobs[next++] : null);
        worker.on("message", (m: Made) => {
          out.push(m);
          done++;
          if (done % 10 === 0 || done === jobs.length) process.stdout.write(`\r${label}: ${done}/${jobs.length} maps, ${((performance.now() - t0) / 1000).toFixed(0)} s   `);
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

// ------------------------------------------------------------------------------ another version

/** Check `ref` out into a temporary worktree beside nothing of ours, run `f` on it, remove it. */
async function withVersion<T>(ref: string, f: (root: string) => Promise<T>): Promise<T> {
  const dir = join(tmpdir(), `dgm-sheet-${process.pid}-${Date.now()}`);
  const git = (...args: string[]) => {
    const r = spawnSync("git", ["-C", ROOT, ...args], { encoding: "utf8" });
    if (r.status !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr}`);
    return r.stdout.trim();
  };
  git("worktree", "add", "--detach", dir, ref);
  const nm = join(dir, "node_modules");
  try {
    // the other version runs on this checkout's packages (a junction, removed before the worktree)
    symlinkSync(join(ROOT, "node_modules"), nm, "junction");
    return await f(dir);
  } finally {
    // the junction first, so nothing follows it into this checkout's packages
    if (existsSync(nm)) unlinkSync(nm);
    git("worktree", "remove", "--force", dir);
  }
}

// ------------------------------------------------------------------------------ the page

const NAMES: Record<string, string> = { any: "Any", riverValley: "River Valley", canyon: "Canyon", highlands: "Highlands", lakeBasin: "Lake Basin", delta: "Delta", islands: "Islands" };

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function page(o: { title: string; themes: string[]; seeds: number[]; size: number; app: string; mine: Made[]; other: Made[] | null; ref: string | null; seconds: number; variety: number | null }): string {
  const key = (m: { theme: string; seed: number }) => `${m.theme}/${m.seed}`;
  const mine = new Map(o.mine.map((m) => [key(m), m]));
  const other = o.other ? new Map(o.other.map((m) => [key(m), m])) : null;
  const version = o.mine[0]?.version ?? "?";
  const cell = (m: Made | undefined, tag: string) =>
    m && m.png
      ? `<a href="${esc(o.app)}#${esc(m.fragment)}" target="_blank" title="${esc(`${NAMES[m.theme] ?? m.theme} ${m.seed}, ${tag}: ${m.passed ? "passed" : "did not pass"} after ${m.attempts} attempt${m.attempts > 1 ? "s" : ""}, ${m.ms} ms`)}"><img src="data:image/png;base64,${m.png}" alt=""></a>`
      : `<div class="none">none</div>`;
  const sections = o.themes
    .map((t) => {
      const cells = o.seeds
        .map((seed) => {
          const a = mine.get(`${t}/${seed}`);
          const b = other?.get(`${t}/${seed}`);
          const flag = a && !a.passed ? ' <span class="bad">did not pass</span>' : "";
          return `<figure>${other ? `<div class="pair">${cell(b, o.ref ?? "")}${cell(a, version)}</div>` : cell(a, version)}<figcaption>${esc(NAMES[t] ?? t)} ${seed}${flag}</figcaption></figure>`;
        })
        .join("");
      return `<section><h2>${esc(NAMES[t] ?? t)}</h2><div class="grid">${cells}</div></section>`;
    })
    .join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(o.title)}</title><style>
body{font:14px/1.4 system-ui,sans-serif;margin:16px;background:#f7f5ef;color:#222}
h1{font-size:18px;margin:0 0 4px}p.meta{margin:0 0 12px;color:#555}
h2{font-size:15px;margin:18px 0 6px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(${other ? 300 : 150}px,1fr));gap:8px}
figure{margin:0}figcaption{font-size:12px;color:#444}
img{width:100%;image-rendering:auto;display:block;border:1px solid #ccc}
.pair{display:grid;grid-template-columns:1fr 1fr;gap:3px}.none{aspect-ratio:1;background:#ddd;display:grid;place-items:center;color:#777}
.bad{color:#b00}
</style></head><body><h1>${esc(o.title)}</h1><p class="meta">Generator ${esc(version)}${o.ref ? ` (right) beside ${esc(o.ref)} (left)` : ""}, ${o.size}×${o.size}, seeds ${o.seeds[0]}–${o.seeds[o.seeds.length - 1]}${o.variety !== null ? `, Variety ${o.variety} (the links open the map at the default Variety)` : ""}; made in ${o.seconds} s. A click opens the map in ${esc(o.app)} (a map made by another generator version opens with a note).</p>${sections}</body></html>`;
}

// ------------------------------------------------------------------------------ main

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

async function main(): Promise<void> {
  const { THEMES } = await import("../src/core/spec/mapspec");
  const themes = arg("theme", THEMES.join(",")).split(",");
  const [a, b] = arg("seeds", "1-30").split("-").map(Number);
  const seeds: number[] = [];
  for (let s = a; s <= (b ?? a); s++) seeds.push(s);
  const size = Number(arg("size", "128"));
  const designedFor = arg("designed-for", "normal");
  const variety = process.argv.includes("--variety") ? Number(arg("variety", "70")) : null;
  const workers = Number(arg("workers", String(Math.max(1, Math.min(8, cpus().length - 2)))));
  const app = arg("app", "https://timbermods.github.io/dam-good-maps/");
  const ref = process.argv.includes("--compare") ? arg("compare", "dev") : null;
  const jobs: Job[] = themes.flatMap((theme) => seeds.map((seed) => ({ theme, seed, size, designedFor, variety })));
  const t0 = performance.now();
  const mine = await makeAll(jobs, ROOT, workers, "this version");
  // (another version makes only the themes it had: the others show "none")
  const other = ref ? await withVersion(ref, (root) => makeAll(jobs, root, workers, ref)) : null;
  const seconds = Math.round((performance.now() - t0) / 1000);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outDir = join(ROOT, ".scratch", "sheets");
  mkdirSync(outDir, { recursive: true });
  const title = arg("title", `Contact sheet, ${size}×${size}${ref ? ` against ${ref}` : ""}`);
  const html = join(outDir, `sheet-${stamp}.html`);
  writeFileSync(html, page({ title, themes, seeds, size, app, mine, other, ref, seconds, variety }));
  console.log(`${html} (${mine.length} maps${other ? ` and ${other.length} from ${ref}` : ""}, ${seconds} s)`);
  const png = process.argv.includes("--png") ? arg("png", "") : "";
  if (png) {
    // the small PNG a map-changing step commits (D144): tools/contact-sheet.py lays it out
    const dir = join(ROOT, ".scratch", "sheet-png", stamp);
    mkdirSync(dir, { recursive: true });
    const index = mine
      .slice()
      .sort((p, q) => themes.indexOf(p.theme) - themes.indexOf(q.theme) || p.seed - q.seed)
      .map((m) => {
        const file = `${m.theme}-${m.seed}.png`;
        writeFileSync(join(dir, file), Buffer.from(m.png, "base64"));
        return { theme: m.theme, seed: m.seed, file, attempts: m.attempts, passed: m.passed };
      });
    writeFileSync(join(dir, "index.json"), JSON.stringify({ generator: mine[0]?.version, size, maps: index }, null, 1));
    const r = spawnSync(process.env.PYTHON ?? "python", [join(ROOT, "tools", "contact-sheet.py"), dir, png, title], { encoding: "utf8" });
    process.stdout.write(r.stdout + r.stderr);
    if (r.status !== 0) process.exitCode = 1;
  }
  if (!process.argv.includes("--no-open")) {
    const opener = process.platform === "win32" ? ["cmd", ["/c", "start", "", html]] : process.platform === "darwin" ? ["open", [html]] : ["xdg-open", [html]];
    spawn(opener[0] as string, opener[1] as string[], { detached: true, stdio: "ignore" }).unref();
  }
}

void main();
