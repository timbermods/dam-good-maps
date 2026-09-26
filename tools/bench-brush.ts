// Live editing: what a player feels while painting with the terrain brushes, measured in the
// installed Chrome, headed (real vsync, real GPU), on 256² maps. Per configuration: a raise stroke
// wandering for about four seconds, then held still; the time from each pointer event to the frame
// that draws the ground it changed; the time between frames while painting; the main thread's long
// tasks; how soon the worker has the stroke after the button comes up; how soon undo shows; and
// whether the map the worker built is the one painted (strokes that differ: 0 when all is well).
//
// Configurations, as `npm run bench:3d` picks them (PLAN §20 D46): the default GPU; and, on a
// machine with two, the other GPU (on a desktop, its integrated one) with the page's CPU slowed 4×
// on a laptop-sized screen. Measures are information (D115), never a failure.
//
// Usage: npm run bench:brush [-- --configs 1] [-- --size 256] [-- --theme riverValley]
// Writes out/live/bench-brush.json.

import { mkdirSync, writeFileSync } from "node:fs";
import { chromium, type Page } from "@playwright/test";
import { build, preview } from "vite";

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const SIZE = Number(arg("size") ?? 256);
const THEME = arg("theme") ?? "riverValley";
const CONFIGS = arg("configs")?.split(",").map(Number);
const PORT = Number(arg("port") ?? 4394);
const OUT = ".scratch/bench-brush-dist";

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
    if (!m || m[1] === "1414") continue;
    out.push({ name: m[2], luid: `${m[3]},${m[4]}`, active: /ACTIVE/.test(m[5]) });
  }
  return out;
}

const pct = (a: number[], p: number) => (a.length ? [...a].sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(p * a.length))] : 0);
const round = (v: number) => Math.round(v * 10) / 10;

const PROFILE = process.argv.includes("--profile");

async function measure(page: Page): Promise<Record<string, unknown>> {
  await page.goto(`http://localhost:${PORT}/#s=1&z=${SIZE}&d=n&t=${THEME}`);
  await page.getByText(/checks passed|checks failed/).first().waitFor({ timeout: 300_000 });
  await page.getByRole("button", { name: "Refine this map" }).click();
  await page.waitForFunction(() => !!window.dgmEditor && !!window.dgm3d, null, { timeout: 120_000 });
  // let the first checks finish, so painting is measured on its own
  await page.getByRole("button", { name: /Ready to play|warning|problem/ }).waitFor({ timeout: 300_000 });
  await page.getByRole("button", { name: "Top-down" }).click();
  await page.keyboard.press("1");
  // (a string, so the bundler's helpers stay out of the page)
  await page.evaluate(`(() => {
    const w = window;
    w.__b = { ev: [], mv: [], rend: [], raf: [], long: [] };
    const r = w.dgm3d.renderer;
    const u = r.updateTerrainRect.bind(r);
    r.updateTerrainRect = (...a) => {
      const ev = w.event;
      if (ev && ev.type === "pointermove") w.__b.mv.push([ev.timeStamp, performance.now()]);
      return u(...a);
    };
    const rn = r.renderNow.bind(r);
    r.renderNow = () => { rn(); w.__b.rend.push(performance.now()); };
    new PerformanceObserver((l) => { for (const e of l.getEntries()) w.__b.long.push([Math.round(e.startTime), Math.round(e.duration)]); }).observe({ type: "longtask" });
    const loop = (t) => { w.__b.raf.push(t); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  })()`);
  const at = (await page.evaluate(`window.dgmEditor.tileToClient(${Math.round(SIZE * 0.3)}, ${Math.round(SIZE * 0.35)})`)) as { x: number; y: number };
  await page.mouse.move(at.x, at.y);
  await page.evaluate("(() => { const b = window.__b; b.ev = []; b.mv = []; b.rend = []; b.raf = []; b.long = []; })()");
  const cdp = PROFILE ? await page.context().newCDPSession(page) : null;
  await page.mouse.down();
  for (let k = 0; k < 480; k++) {
    const t = k / 480;
    await page.mouse.move(at.x + 260 * t, at.y + 70 * Math.sin(t * 7));
    await page.waitForTimeout(6);
  }
  await page.waitForTimeout(700);
  const t0 = Date.now();
  await page.evaluate("window.__b.up = performance.now(); window.__b.down0 = window.__b.raf[0]");
  if (cdp) {
    await cdp.send("Profiler.enable");
    await cdp.send("Profiler.setSamplingInterval", { interval: 100 });
    await cdp.send("Profiler.start");
  }
  await page.mouse.up();
  await page.waitForFunction(() => window.dgmEditor!.pendingTerrain() === 0, null, { timeout: 60_000 });
  const commitMs = Date.now() - t0;
  if (cdp) await page.waitForTimeout(1500);
  if (cdp) {
    const { profile } = (await cdp.send("Profiler.stop")) as { profile: { nodes: { id: number; callFrame: { functionName: string; url: string; lineNumber: number }; hitCount?: number; children?: number[] }[]; samples: number[]; timeDeltas: number[] } };
    const self = new Map<string, number>();
    const byId = new Map(profile.nodes.map((n) => [n.id, n]));
    for (let k = 0; k < profile.samples.length; k++) {
      const n = byId.get(profile.samples[k])!;
      const key = `${n.callFrame.functionName || "(anon)"} ${n.callFrame.url.split("/").pop()}:${n.callFrame.lineNumber}`;
      self.set(key, (self.get(key) ?? 0) + (profile.timeDeltas[k] ?? 0) / 1000);
    }
    const top = [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25);
    console.log("self time (ms) while painting:");
    for (const [k, v] of top) console.log(`  ${v.toFixed(1).padStart(8)}  ${k}`);
  }
  const raw = (await page.evaluate("window.__b")) as { mv: [number, number][]; rend: number[]; raf: number[]; long: [number, number][]; up: number };
  const lat: number[] = [];
  for (const [e, u] of raw.mv) {
    const f = raw.rend.find((x) => x >= u);
    if (f !== undefined) lat.push(f - e);
  }
  const frames: number[] = [];
  for (let k = 1; k < raw.raf.length; k++) frames.push(raw.raf[k] - raw.raf[k - 1]);
  const refresh = pct(frames, 0.5);
  // undo: the ground back, in the same event as the key
  const undoMs = (await page.evaluate(`new Promise((resolve) => {
    const r = window.dgm3d.renderer;
    const before = r.mapState().heights.slice();
    const t0 = performance.now();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "z", ctrlKey: true, bubbles: true }));
    const now = r.mapState().heights;
    let changed = false;
    for (let i = 0; i < now.length && !changed; i++) if (now[i] !== before[i]) changed = true;
    requestAnimationFrame(() => resolve(changed ? performance.now() - t0 : -1));
  })`)) as number;
  await page.waitForFunction(() => window.dgmEditor!.pendingTerrain() === 0, null, { timeout: 60_000 });
  const mismatches = await page.evaluate(() => window.dgmEditor!.strokeMismatches());
  const label = await page.evaluate(() => window.dgmEditor!.info().history.at(-1)?.label ?? "");
  return {
    map: `${THEME} ${SIZE}² seed 1`,
    stroke: label,
    refreshMs: round(refresh),
    inputToFrameMs: { p50: round(pct(lat, 0.5)), p95: round(pct(lat, 0.95)), max: round(Math.max(0, ...lat)), samples: lat.length },
    frameMs: { p50: round(pct(frames, 0.5)), p95: round(pct(frames, 0.95)), p99: round(pct(frames, 0.99)), max: round(Math.max(0, ...frames)), overTwoRefreshes: frames.filter((d) => d > 2 * refresh + 1).length, frames: frames.length },
    longTasksWhilePainting: raw.long.filter(([t]) => t < raw.up).map(([, d]) => d),
    longTasksAfterRelease: raw.long.filter(([t]) => t >= raw.up).map(([t, d]) => `${d} ms at +${Math.round(t - raw.up)} ms`),
    commitAfterReleaseMs: commitMs,
    undoToFrameMs: round(undoMs),
    strokeMismatches: mismatches,
  };
}

interface Screen {
  width: number;
  height: number;
  scale: number;
}

async function main() {
  process.env.DGM_BASE = "/";
  console.log("building the site…");
  await build({ configFile: "vite.config.ts", base: "/", logLevel: "warn", build: { outDir: OUT, emptyOutDir: true, minify: !PROFILE } });
  const server = await preview({ configFile: "vite.config.ts", base: "/", build: { outDir: OUT }, preview: { port: PORT, strictPort: true }, logLevel: "warn" });
  try {
    const list = await gpus();
    const active = list.find((g) => g.active) ?? list[0];
    const other = list.find((g) => g !== active);
    const configs: [string, string[], number, Screen][] = [["default GPU", [], 1, { width: 1600, height: 900, scale: 1 }]];
    if (other) configs.push([`other GPU (${other.name}), CPU 4× slower, 1080p laptop screen at 150%`, [`--use-adapter-luid=${other.luid}`], 4, { width: 1280, height: 720, scale: 1.5 }]);
    const runs: Record<string, unknown>[] = [];
    for (const [k, [label, args, slow, screen]] of configs.entries()) {
      if (CONFIGS && !CONFIGS.includes(k + 1)) continue;
      const keep = ["--disable-backgrounding-occluded-windows", "--disable-renderer-backgrounding", "--disable-background-timer-throttling"];
      const browser = await chromium.launch({ channel: "chrome", headless: false, args: [...args, ...keep] });
      const page = await browser.newPage({ viewport: { width: screen.width, height: screen.height }, deviceScaleFactor: screen.scale });
      await page.addInitScript("window.__name = (f) => f;");
      if (slow > 1) await (await page.context().newCDPSession(page)).send("Emulation.setCPUThrottlingRate", { rate: slow });
      const gpu = (await page.evaluate(`(() => { const c = document.createElement("canvas").getContext("webgl2"); const e = c.getExtension("WEBGL_debug_renderer_info"); return String(e ? c.getParameter(e.UNMASKED_RENDERER_WEBGL) : c.getParameter(c.RENDERER)); })()`)) as string;
      const r = { config: label, gpu, cpuSlowdown: slow, ...(await measure(page)) };
      console.log(JSON.stringify(r, null, 2));
      runs.push(r);
      await browser.close();
    }
    mkdirSync("out/live", { recursive: true });
    writeFileSync("out/live/bench-brush.json", JSON.stringify({ date: new Date().toISOString().slice(0, 10), runs }, null, 2) + "\n");
    console.log("wrote out/live/bench-brush.json");
  } finally {
    await server.close();
  }
}

await main();
