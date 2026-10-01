// The 3D view's budget (ROADMAP M4, PLAN §14.2): it builds in under 1.5 s at 256² and orbits at
// 60 fps on a mid-range laptop. This measures both in the installed Chrome, headed (real vsync,
// real GPU), on 256² maps: generated ones, and the local investigation maps when present.
//
// It runs three configurations when the machine has two GPUs (and the first one otherwise):
//   - the default GPU, in a 1600×900 window;
//   - the other GPU (picked with Chrome's --use-adapter-luid; on a desktop with an integrated GPU
//     this is the weakest one), in the same window;
//   - the other GPU with the page's CPU slowed 4× (Chrome's CPU throttling), as a stand-in for a
//     laptop CPU, on a laptop's screen: 1080p at 150% scaling (1280×720 CSS pixels at 1.5×).
// Per map: the build (meshing, upload and the first frame, the GPU finished), and a scripted orbit
// (one turn every 8 s) with the time between frames, the CPU time of each render call, and the
// GPU time per frame from timer queries when Chrome offers them.
//
// Usage: npm run bench:3d [-- --seconds 8] [-- --quick] [-- --configs 3 --maps Beavertopia --seeds 1]
// (a subset, for trying things out) [-- --out out/map-look/bench3d.json]. Writes out/m4/bench3d.json
// by default (a subset run: .scratch/bench3d-subset.json). CI cannot
// run this (no GPU, no display); tests/e2e/render3d.spec.ts checks what CI can.

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { cpus, platform, release, totalmem } from "node:os";
import { dirname, join } from "node:path";
import { chromium, type Browser, type Page } from "@playwright/test";
import { strFromU8, unzipSync } from "fflate";
import { build, preview } from "vite";

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const SECONDS = Number(arg("seconds") ?? 8);
const QUICK = process.argv.includes("--quick");
/** --configs 3: only the third configuration (1-based, comma-separated); --maps Beavertopia: only
 *  the local maps whose names contain one of these (comma-separated); --seeds 1,2: the generated. */
const CONFIGS = arg("configs")?.split(",").map(Number);
const MAPS = arg("maps")?.split(",");
const SEEDS = arg("seeds")?.split(",").map(Number);
const PORT = 4190;
const OUT = ".scratch/bench3d-dist";

interface Gpu {
  name: string;
  luid: string;
  active: boolean;
}

async function gpus(): Promise<Gpu[]> {
  const b = await chromium.launch({ channel: "chrome", headless: true });
  const p = await b.newPage();
  await p.goto("chrome://gpu");
  await p.waitForTimeout(1500);
  const text = (await p.evaluate(
    "(() => { const walk = (n) => { let s = ''; if (n.shadowRoot) s += walk(n.shadowRoot); n.childNodes.forEach((c) => { s += c.nodeType === 3 ? c.textContent + '\\n' : walk(c); }); return s; }; return walk(document.body); })()",
  )) as string;
  await b.close();
  const out: Gpu[] = [];
  for (const line of text.split("\n")) {
    const m = /VENDOR= 0x([0-9a-f]+), DEVICE=0x[0-9a-f]+ \[([^\]]+)\].*LUID=\{(\d+),(\d+)\}(.*)/i.exec(line);
    if (!m || m[1] === "1414") continue; // Microsoft Basic Render Driver
    out.push({ name: m[2], luid: `${m[3]},${m[4]}`, active: /ACTIVE/.test(m[5]) });
  }
  return out;
}

/** The local investigation maps that are 256 × 256 (the budget is at 256²). */
function localMaps(): string[] {
  const out: string[] = [];
  for (const d of ["investigation/raw/builtin", "investigation/raw/workshop"]) {
    if (!existsSync(d)) continue;
    for (const f of readdirSync(d)) {
      if (!f.endsWith(".timber")) continue;
      const path = join(d, f);
      const world = unzipSync(new Uint8Array(readFileSync(path)), { filter: (e) => e.name === "world.json" })["world.json"];
      if (world && /"MapSize":\{"Size":\{"X":256,"Y":256\}/.test(strFromU8(world.subarray(0, 4096)))) out.push(path);
    }
  }
  return out;
}

interface MapResult {
  map: string;
  size: string;
  build: { ms: number; meshMs: number; terrainQuads: number; waterQuads: number; instances: number };
  /** Click (3D switch or file open) to the first frame, wall clock. */
  openMs: number;
  triangles: number;
  calls: number;
  orbit: Awaited<ReturnType<typeof orbit>>;
}

async function orbit(page: Page) {
  return page.evaluate((ms) => window.dgm3d!.renderer.benchOrbit(ms), SECONDS * 1000);
}

async function measureGenerated(page: Page, seed: number): Promise<MapResult> {
  await page.goto("about:blank"); // a new page load, not a hash change
  await page.goto(`http://localhost:${PORT}/#s=${seed}&z=256&d=n&t=riverValley&v=0.3.0`);
  await page.getByText(/checks passed/).first().waitFor({ timeout: 300_000 });
  await page.evaluate(() => delete window.dgm3d);
  const t0 = Date.now();
  await page.getByRole("button", { name: "3D", exact: true }).click();
  await page.waitForFunction(() => !!window.dgm3d, null, { timeout: 60_000 });
  const openMs = Date.now() - t0;
  const b = await page.evaluate(() => window.dgm3d!.build);
  // orbit in the editor, the heavier view
  await page.getByRole("button", { name: "Refine this map" }).click();
  await page.waitForFunction(() => !!window.dgmEditor && !!window.dgm3d, null, { timeout: 60_000 });
  await page.waitForTimeout(500);
  const info = await page.evaluate(() => window.dgm3d!.renderer.info());
  const o = await orbit(page);
  return { map: `generated seed ${seed}`, size: "256×256", build: pickBuild(b), openMs, triangles: info.triangles, calls: info.calls, orbit: o };
}

function pickBuild(b: { ms: number; meshMs: number; terrainQuads: number; waterQuads: number; instances: number }) {
  return { ms: round(b.ms), meshMs: round(b.meshMs), terrainQuads: b.terrainQuads, waterQuads: b.waterQuads, instances: b.instances };
}

const round = (v: number) => Math.round(v * 10) / 10;

async function measureFile(page: Page, path: string): Promise<MapResult | null> {
  await page.goto("about:blank");
  await page.goto(`http://localhost:${PORT}/#s=1&z=96&d=n&t=riverValley&v=0.3.0`);
  await page.getByText(/checks passed|checks failed/).first().waitFor({ timeout: 300_000 });
  await page.evaluate(() => delete window.dgm3d);
  const t0 = Date.now();
  await page.getByLabel("Open a map or a project file in the editor").setInputFiles(path);
  await page.waitForFunction(() => !!window.dgmEditor && !!window.dgm3d, null, { timeout: 120_000 });
  const openMs = Date.now() - t0;
  const size = await page.evaluate(() => {
    const i = window.dgmEditor!.info();
    return `${i.W}×${i.H}`;
  });
  if (size !== "256×256") return null;
  await page.waitForTimeout(500);
  const b = await page.evaluate(() => window.dgm3d!.build);
  const info = await page.evaluate(() => window.dgm3d!.renderer.info());
  const o = await orbit(page);
  return { map: path.replace(/^.*[\\/]/, ""), size, build: pickBuild(b), openMs, triangles: info.triangles, calls: info.calls, orbit: o };
}

interface Screen {
  width: number;
  height: number;
  scale: number;
}

const DESKTOP: Screen = { width: 1600, height: 900, scale: 1 };
const LAPTOP: Screen = { width: 1280, height: 720, scale: 1.5 };

async function runConfig(label: string, args: string[], cpuSlowdown: number, screen: Screen, maps: string[]): Promise<{ label: string; gpu: string; cpuSlowdown: number; screen: Screen; refreshHz: number; dpr: number; results: MapResult[] }> {
  // (a window other windows cover still draws at the display's rate: Chrome would pause it)
  const keepDrawing = ["--disable-backgrounding-occluded-windows", "--disable-renderer-backgrounding", "--disable-background-timer-throttling"];
  const browser: Browser = await chromium.launch({ channel: "chrome", headless: false, args: [...args, ...keepDrawing] });
  // Standard held: this budget is ROADMAP M4/PLAN §14.2, before the High look existed, and a
  // capable GPU would otherwise silently draw High, which costs more to render and would
  // invalidate the budget (found auditing capture-badwater.ts's same gap, D304's investigation)
  const context = await browser.newContext({ viewport: { width: screen.width, height: screen.height }, deviceScaleFactor: screen.scale });
  await context.addInitScript("try { localStorage.setItem('dgm.look', 'standard'); } catch {}");
  const page = await context.newPage();
  if (cpuSlowdown > 1) {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: cpuSlowdown });
  }
  await page.goto(`http://localhost:${PORT}/#s=1&z=96&d=n&t=riverValley&v=0.3.0`);
  await page.getByText(/checks passed/).first().waitFor({ timeout: 120_000 });
  // (a string, so the bundler's helpers stay out of the page)
  const env = (await page.evaluate(`new Promise((resolve) => {
    const c = document.createElement("canvas").getContext("webgl2");
    const e = c.getExtension("WEBGL_debug_renderer_info");
    const gpu = String(e ? c.getParameter(e.UNMASKED_RENDERER_WEBGL) : c.getParameter(c.RENDERER));
    const t = [];
    const step = (now) => {
      t.push(now);
      if (t.length < 121) requestAnimationFrame(step);
      else resolve({ gpu, refreshHz: Math.round(120000 / (t[120] - t[0])), dpr: window.devicePixelRatio });
    };
    requestAnimationFrame(step);
  })`)) as { gpu: string; refreshHz: number; dpr: number };
  console.log(`\n== ${label}: ${env.gpu}, CPU ${cpuSlowdown}× slower, display ${env.refreshHz} Hz, DPR ${env.dpr}`);
  const results: MapResult[] = [];
  const seeds = SEEDS ?? (QUICK ? [1] : [1, 2, 3]);
  for (const seed of seeds) {
    const r = await measureGenerated(page, seed);
    results.push(r);
    report(r);
  }
  for (const path of maps) {
    const r = await measureFile(page, path);
    if (!r) continue;
    results.push(r);
    report(r);
  }
  await browser.close();
  return { label, gpu: env.gpu, cpuSlowdown, screen, refreshHz: env.refreshHz, dpr: env.dpr, results };
}

function report(r: MapResult): void {
  const o = r.orbit;
  const gpu = o.gpuP50 === null ? "" : `, GPU ${o.gpuP50.toFixed(2)}/${o.gpuP95!.toFixed(2)} ms`;
  console.log(
    `${r.map.padEnd(34)} build ${String(r.build.ms).padStart(6)} ms (open ${r.openMs} ms), ${r.triangles.toLocaleString()} tris, ` +
      `orbit ${o.fps.toFixed(0)} fps, frames p50/p95/p99 ${o.p50.toFixed(1)}/${o.p95.toFixed(1)}/${o.p99.toFixed(1)} ms, over 1/60 s: ${o.over60}/${o.frames}${gpu}`,
  );
}

async function main() {
  process.env.DGM_BASE = "/";
  console.log("building the site…");
  await build({ configFile: "vite.config.ts", base: "/", logLevel: "warn", build: { outDir: OUT, emptyOutDir: true } });
  const server = await preview({ configFile: "vite.config.ts", base: "/", build: { outDir: OUT }, preview: { port: PORT, strictPort: true }, logLevel: "warn" });
  try {
    const list = await gpus();
    const active = list.find((g) => g.active) ?? list[0];
    const other = list.find((g) => g !== active);
    const maps = localMaps().filter((m) => !MAPS || MAPS.some((n) => m.includes(n)));
    const configs: [string, string[], number, Screen][] = [["default GPU", [], 1, DESKTOP]];
    if (other) {
      configs.push([`other GPU (${other.name})`, [`--use-adapter-luid=${other.luid}`], 1, DESKTOP]);
      configs.push([`other GPU (${other.name}), CPU 4× slower, 1080p laptop screen at 150%`, [`--use-adapter-luid=${other.luid}`], 4, LAPTOP]);
    }
    const runs = [];
    const chosen = CONFIGS ? configs.filter((_, k) => CONFIGS.includes(k + 1)) : QUICK ? configs.slice(0, 1) : configs;
    for (const [label, args, slow, screen] of chosen) runs.push(await runConfig(label, args, slow, screen, QUICK ? [] : maps));
    const all = runs.flatMap((r) => r.results.map((x) => ({ ...x, config: r.label })));
    const worstBuild = Math.max(...all.map((r) => r.build.ms));
    const worstFps = Math.min(...all.map((r) => r.orbit.fps));
    const over = all.reduce((s, r) => s + r.orbit.over60, 0);
    const frames = all.reduce((s, r) => s + r.orbit.frames, 0);
    const machine = {
      cpu: cpus()[0]?.model.trim(),
      threads: cpus().length,
      memoryGB: Math.round(totalmem() / 2 ** 30),
      os: `${platform()} ${release()}`,
      gpus: list.map((g) => g.name),
      chrome: (await (async () => {
        const b = await chromium.launch({ channel: "chrome", headless: true });
        const v = b.version();
        await b.close();
        return v;
      })()),
    };
    const summary = { worstBuildMs: worstBuild, worstFps: round(worstFps), framesOver60: over, frames, budget: { buildMs: 1500, fps: 60 } };
    // --out picks the report's file; a subset run never replaces a full run's report
    const out = arg("out") ?? (CONFIGS || MAPS || SEEDS || QUICK ? ".scratch/bench3d-subset.json" : "out/m4/bench3d.json");
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out,JSON.stringify({ date: new Date().toISOString().slice(0, 10), seconds: SECONDS, machine, summary, runs }, null, 2) + "\n");
    console.log(`\nmachine: ${machine.cpu}, ${machine.threads} threads, ${machine.memoryGB} GB; GPUs: ${machine.gpus.join(", ")}; Chrome ${machine.chrome}`);
    console.log(`worst build ${worstBuild} ms (budget 1500), worst orbit ${worstFps.toFixed(0)} fps (budget 60), ${over} of ${frames} frames over 1/60 s`);
    console.log(`wrote ${out}`);
    if (worstBuild >= 1500 || worstFps < 60) process.exitCode = 1;
  } finally {
    await server.close();
  }
}

await main();
