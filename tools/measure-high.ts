// The High look's cost on this machine's GPU (Map look 2; PLAN §20 D250 (2), D284): frame times on
// dense 256² maps, a generated map and a busy one, orbiting (the whole map, and close in) and
// painting, in Standard, in High with every effect, in High's lower-cost tier, and with each of the
// investigations' parts alone on top of the foundation (#38, #65 and #66), so each stage's cost
// shows. Information (D115), and where the automatic fallback starts (high/fallback.ts LIMITS).
//
//   npx tsx tools/measure-high.ts [--port 4941] [--seconds 5] [--only generated,busy] [--configs 1,2,3]
//     [--dpr 2] [--tag -dpr2] [--headless]
//
// It opens the installed Chrome headed (real vsync; nothing is played), builds the site from this
// checkout, and writes .scratch/measure-high.json (gitignored) and a table on stdout. The camera
// moves only here, for the measurement: the product never moves it by itself (D265).

import { mkdirSync, writeFileSync } from "node:fs";
import { chromium, type Page } from "@playwright/test";
import { build, preview } from "vite";

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const PORT = Number(arg("port") ?? 4941);
const SECONDS = Number(arg("seconds") ?? 5);
const ONLY = arg("only")?.split(",");
const HEADLESS = process.argv.includes("--headless");
/** Device pixels per CSS pixel (2: a high-density screen, four times the pixels). */
const DPR = Number(arg("dpr") ?? 1);
/** Which configurations (their numbers in CONFIGS, from 1). */
const PICK = arg("configs")?.split(",").map(Number);
const TAG = arg("tag") ?? "";
const OUT = ".scratch/measure-high-dist";

/** Dense 256² maps: forests at twice the density in big woods, ruins ×3. */
const MAPS = [
  { id: "generated", name: "River Valley 4242, 256², dense forest and ruins", fragment: "#s=4242&z=256&d=n&t=riverValley&fd=200&gs=b&ru=300" },
  { id: "busy", name: "Highlands 2, 256² (the most falls), dense forest and ruins", fragment: "#s=2&z=256&d=n&t=highlands&fd=200&gs=b&ru=300" },
];

/** The High effects of each part (render3d/high/effects.ts), for the stages' costs. */
const STAGE1 = ["geology", "soilCap", "section"];
const STAGE2 = ["crown", "landing", "bubbles", "mist", "rings", "roughWater"];
const STAGE3 = ["landmarks", "objectDetail"];
const POISON = ["poison"];
const ALL_FINISH = [...STAGE1, ...STAGE2, ...STAGE3, ...POISON];

interface Config {
  id: string;
  tier: "standard" | "high" | "lower";
  /** High effects switched off. */
  off: string[];
}

const CONFIGS: Config[] = [
  { id: "Standard", tier: "standard", off: [] },
  { id: "High, every effect", tier: "high", off: [] },
  { id: "High, lower-cost tier", tier: "lower", off: [] },
  { id: "High foundation (#38, #65, #66)", tier: "high", off: ALL_FINISH },
  { id: "foundation + stage 1 (edge)", tier: "high", off: ALL_FINISH.filter((k) => !STAGE1.includes(k)) },
  { id: "foundation + stage 2 (water finish)", tier: "high", off: ALL_FINISH.filter((k) => !STAGE2.includes(k)) },
  { id: "foundation + stage 3 (landmarks)", tier: "high", off: ALL_FINISH.filter((k) => !STAGE3.includes(k)) },
  { id: "foundation + poisoned soil", tier: "high", off: ALL_FINISH.filter((k) => !POISON.includes(k)) },
];

const pct = (a: number[], p: number) => (a.length ? [...a].sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(p * a.length))] : 0);
const round = (v: number | null) => (v === null ? null : Math.round(v * 100) / 100);

async function open(page: Page, fragment: string): Promise<void> {
  await page.goto("about:blank");
  await page.goto(`http://localhost:${PORT}/${fragment}`);
  await page.getByText(/All \d+ checks passed|checks passed|checks failed/).first().waitFor({ timeout: 600_000 });
  await page.getByRole("button", { name: "Refine this map" }).click();
  await page.waitForFunction("!!window.dgmEditor && !!window.dgm3d", null, { timeout: 300_000 });
  await page.mouse.move(2, 2);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: /Ready to play|warning|problem/ }).waitFor({ timeout: 600_000 });
  await page.evaluate("window.dgmEditor.idle()");
}

async function setConfig(page: Page, c: Config): Promise<void> {
  await page.evaluate(`(() => {
    const r = window.dgm3d.renderer;
    for (const k of Object.keys(r.highEffects)) r.setHighEffect(k, !${JSON.stringify(c.off)}.includes(k));
    r.holdTier(${JSON.stringify(c.tier)});
  })()`);
  await page.waitForFunction("window.dgm3d.renderer.highSettled", null, { timeout: 120_000 });
  await page.waitForTimeout(1500);
}

type Orbit = { fps: number; p50: number; p95: number; cpuP50: number; cpuP95: number; gpuP50: number | null; gpuP95: number | null; frames: number };

async function orbit(page: Page, view: "whole" | "close"): Promise<Orbit> {
  await page.evaluate(`(() => {
    const r = window.dgm3d.renderer;
    r.resetView();
    if (${JSON.stringify(view)} === "close") r.setView({ distance: 60, pitch: 0.75 });
  })()`);
  await page.waitForTimeout(600);
  const s = (await page.evaluate(`window.dgm3d.renderer.benchOrbit(${SECONDS * 1000}, ${SECONDS * 1000 * 2})`)) as Orbit;
  return { fps: round(s.fps)!, p50: round(s.p50)!, p95: round(s.p95)!, cpuP50: round(s.cpuP50)!, cpuP95: round(s.cpuP95)!, gpuP50: round(s.gpuP50), gpuP95: round(s.gpuP95), frames: s.frames };
}

/** The whole cost of a frame, CPU and GPU: the view drawn 40 times back to back, each waited for
 *  to its end by reading a pixel back (the median; no vsync in it). The cleanest comparison between
 *  configurations. */
async function drawn(page: Page, view: "whole" | "close"): Promise<{ p50: number; p95: number }> {
  return (await page.evaluate(`(() => {
    const r = window.dgm3d.renderer;
    r.resetView();
    if (${JSON.stringify(view)} === "close") r.setView({ distance: 60, pitch: 0.75 });
    const g = r.gl.getContext();
    const t = [];
    for (let k = 0; k < 45; k++) {
      const t0 = performance.now();
      r.renderNow();
      g.readPixels(0, 0, 1, 1, g.RGBA, g.UNSIGNED_BYTE, new Uint8Array(4));
      if (k >= 5) t.push(performance.now() - t0);
    }
    t.sort((a, b) => a - b);
    return { p50: Math.round(t[t.length >> 1] * 100) / 100, p95: Math.round(t[Math.floor(t.length * 0.95)] * 100) / 100 };
  })()`)) as { p50: number; p95: number };
}

/** A raise stroke wandering for about three seconds (bench-brush.ts): frame intervals, the page's
 *  long tasks. */
async function paint(page: Page): Promise<Record<string, unknown>> {
  await page.evaluate("window.dgm3d.renderer.resetView()");
  await page.keyboard.press("1");
  await page.evaluate(`(() => {
    const w = window;
    w.__b = { raf: [], long: [] };
    new PerformanceObserver((l) => { for (const e of l.getEntries()) w.__b.long.push(Math.round(e.duration)); }).observe({ type: "longtask" });
    const loop = (t) => { w.__b.raf.push(t); if (!w.__b.stop) requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  })()`);
  const at = (await page.evaluate("window.dgmEditor.tileToClient(77, 90)")) as { x: number; y: number };
  await page.mouse.move(at.x, at.y);
  await page.evaluate("(() => { window.__b.raf = []; window.__b.long = []; })()");
  await page.mouse.down();
  for (let k = 0; k < 360; k++) {
    const t = k / 360;
    await page.mouse.move(at.x + 260 * t, at.y + 70 * Math.sin(t * 7));
    await page.waitForTimeout(6);
  }
  await page.mouse.up();
  const raw = (await page.evaluate("(() => { window.__b.stop = true; return window.__b; })()")) as { raf: number[]; long: number[] };
  await page.waitForFunction(() => window.dgmEditor!.pendingTerrain() === 0, null, { timeout: 120_000 });
  await page.keyboard.press("Escape");
  // (undo the stroke, so every configuration paints the same land)
  await page.evaluate(`window.dispatchEvent(new KeyboardEvent("keydown", { key: "z", ctrlKey: true, bubbles: true }))`);
  await page.waitForFunction(() => window.dgmEditor!.pendingTerrain() === 0, null, { timeout: 120_000 });
  const frames: number[] = [];
  for (let k = 1; k < raw.raf.length; k++) frames.push(raw.raf[k] - raw.raf[k - 1]);
  return { frameP50: round(pct(frames, 0.5)), frameP95: round(pct(frames, 0.95)), frameMax: round(Math.max(0, ...frames)), frames: frames.length, longTasks: raw.long };
}

async function main() {
  process.env.DGM_BASE = "/";
  console.log("building the site…");
  await build({ configFile: "vite.config.ts", base: "/", logLevel: "warn", build: { outDir: OUT, emptyOutDir: true } });
  const server = await preview({ configFile: "vite.config.ts", base: "/", build: { outDir: OUT }, preview: { port: PORT, strictPort: true }, logLevel: "warn" });
  const results: Record<string, unknown>[] = [];
  try {
    const keep = ["--disable-backgrounding-occluded-windows", "--disable-renderer-backgrounding", "--disable-background-timer-throttling", "--enable-gpu", "--ignore-gpu-blocklist"];
    const browser = await chromium.launch({ channel: "chrome", headless: HEADLESS, args: keep });
    const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: DPR });
    await page.addInitScript("window.__name = (f) => f; try { localStorage.setItem('dgm.look', 'standard'); } catch {}");
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    for (const m of MAPS) {
      if (ONLY && !ONLY.includes(m.id)) continue;
      console.log(`\n${m.name}`);
      await open(page, m.fragment);
      const info = (await page.evaluate(`(() => { const r = window.dgm3d.renderer; return { gpu: r.gpu().renderer, canvas: [r.canvas.width, r.canvas.height], objects: r.mapState().entities.count, falls: r.info().falls }; })()`)) as Record<string, unknown>;
      console.log(JSON.stringify(info));
      for (const [n, c] of CONFIGS.entries()) {
        if (PICK && !PICK.includes(n + 1)) continue;
        await setConfig(page, c);
        const drawWhole = await drawn(page, "whole");
        const drawClose = await drawn(page, "close");
        const whole = await orbit(page, "whole");
        const close = await orbit(page, "close");
        const painting = await paint(page);
        const stats = await page.evaluate("window.dgm3d.renderer.highStats");
        const row = { map: m.id, dpr: DPR, config: c.id, drawn: { whole: drawWhole, close: drawClose }, whole, close, painting, stats, ...info };
        results.push(row);
        console.log(`${c.id.padEnd(38)} drawn: whole ${drawWhole.p50} ms, close ${drawClose.p50} ms · whole: GPU p50 ${whole.gpuP50} p95 ${whole.gpuP95} ms, ${whole.fps} fps · close: GPU p50 ${close.gpuP50} p95 ${close.gpuP95} ms, ${close.fps} fps · painting: frames p50 ${painting.frameP50} p95 ${painting.frameP95} ms, long tasks ${(painting.longTasks as number[]).length}`);
      }
    }
    await browser.close();
    if (errors.length) console.log("page errors:", errors);
  } finally {
    await server.close();
  }
  mkdirSync(".scratch", { recursive: true });
  writeFileSync(`.scratch/measure-high${TAG}.json`, JSON.stringify({ date: new Date().toISOString(), seconds: SECONDS, results }, null, 2) + "\n");
  console.log(`\nwrote .scratch/measure-high${TAG}.json`);
}

await main();
