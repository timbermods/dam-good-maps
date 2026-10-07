// Live editing: what a player feels while painting with the terrain brushes, measured in the
// installed Chrome, headed (real vsync, real GPU), on 256² maps. Per configuration: a raise stroke
// wandering for about four seconds, then held still; the time from each pointer move's arrival to the
// frame that draws the next re-mesh after it (the ground its points changed, whether the page pressed
// its dab at once or queued its points for the next animation frame; a move whose points pressed
// nothing counts to the next re-mesh; in display frames, the land's trail); from each move to the next
// frame drawn (the cursor and the ring); the time between frames while painting; the main thread's long
// tasks; how soon the worker has the stroke after the button comes up; how soon undo shows; and
// whether the map the worker built is the one painted (strokes that differ: 0 when all is well).
//
// Where the land is drawn from decides how a move is followed. The page's own preview (every brush but
// Naturalize without the D422 patch) presses its dabs in the page, so the re-mesh after a move is the move's.
// A Naturalize stroke weathered in the worker (D422) draws land that comes back later, and that land is
// from the dabs the worker was sent, not from the moves that arrived since. The tool then watches the page's
// messages to the worker (weatherAdd's dabs and the moment each answer arrives, hooked from the page side,
// nothing in the product changed), gives each move the first dab call that carries a point beyond the
// previous move's position (the stroke runs left to right, so a point's x says which move it came from),
// and follows that call's answer to the re-mesh it draws and to the frame after it.
//
// Configurations, as `npm run bench:3d` picks them (PLAN §20 D46): the default GPU; and, on a
// machine with two, the other GPU (on a desktop, its integrated one) with the page's CPU slowed 4×
// on a laptop-sized screen. Measures are information (D115), never a failure.
//
// Usage: npm run bench:brush [-- --configs 1] [-- --size 256] [-- --theme riverValley]
//   [-- --tool naturalize --brush 64 --strength 10 --terracing 100] (another soft brush, its Size and
//   Strength set with the keys as a player would; the Terracing in the map's link). Besides the frame
//   times it reports the land's re-mesh per change; --profile prints where the drag's time goes.
// Writes out/live/bench-brush.json.

import { mkdirSync, writeFileSync } from "node:fs";
import { chromium, type Page } from "@playwright/test";
import { build, preview } from "vite";
import { waitForEditor } from "./wait-editor";
import { sin } from "../src/core/math/portable";

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const SIZE = Number(arg("size") ?? 256);
const THEME = arg("theme") ?? "riverValley";
const CONFIGS = arg("configs")?.split(",").map(Number);
const PORT = Number(arg("port") ?? 4394);
const TOOL = arg("tool") ?? "raise";
const BRUSH = arg("brush") ? Number(arg("brush")) : null;
const STRENGTH = arg("strength") ? Number(arg("strength")) : null;
const TERRACING = arg("terracing");
/** The tool keys (the toolbar's order). */
const TOOL_KEY: Record<string, string> = { raise: "1", lower: "2", flatten: "3", smooth: "4", naturalize: "5" };
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

type Profile = { nodes: { id: number; callFrame: { functionName: string; url: string; lineNumber: number }; hitCount?: number; children?: number[] }[]; samples: number[]; timeDeltas: number[] };

async function measure(page: Page): Promise<Record<string, unknown>> {
  // the worker's messages (a string, so the bundler's helpers stay out of the page): each weatherAdd call's
  // dabs and when it was posted, and, from the answer's own event time, when its land arrived
  await page.addInitScript(`(() => {
    const w = window;
    w.__w = { adds: [], byId: new Map() };
    const seen = new WeakSet();
    const post = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function (m, ...rest) {
      try {
        if (!seen.has(this)) {
          seen.add(this);
          this.addEventListener("message", (e) => {
            const a = e.data && w.__w.byId.get(e.data.id);
            if (a) a.resp = e.timeStamp;
          });
        }
        if (m && Array.isArray(m.path) && m.path[0] === "weatherAdd") {
          const a0 = m.argumentList && m.argumentList[0];
          const dabs = Array.isArray(a0) ? a0 : a0 && a0.value;
          const a = { t: performance.now(), xs: [], resp: null };
          for (let i = 0; Array.isArray(dabs) && i < dabs.length; i += 2) a.xs.push(dabs[i] / 4);
          w.__w.adds.push(a);
          w.__w.byId.set(m.id, a);
        }
      } catch {}
      return post.call(this, m, ...rest);
    };
  })()`);
  await page.goto(`http://localhost:${PORT}/#s=1&z=${SIZE}&d=n&t=${THEME}${TERRACING ? `&tr=${TERRACING}` : ""}`);
  await waitForEditor(page, 300_000);
  // let the first checks finish, so painting is measured on its own
  await page.getByRole("button", { name: /Ready to play|warning|problem/ }).waitFor({ timeout: 300_000 });
  await page.getByRole("button", { name: "Top-down" }).click();
  await page.keyboard.press(TOOL_KEY[TOOL]);
  // the Size and Strength by their keys, from the brush as it opens (Size 5, Strength 5)
  if (BRUSH !== null) for (const s of [6, 8, 10, 12, 15, 18, 21, 24, 32, 40, 48, 64, 80, 96, 112, 128]) if (s <= BRUSH) await page.keyboard.press("}");
  if (STRENGTH !== null) for (let k = 5; k < STRENGTH; k++) await page.keyboard.press("]");
  // (a string, so the bundler's helpers stay out of the page)
  await page.evaluate(`(() => {
    const w = window;
    w.__b = { ev: [], mv: [], rend: [], raf: [], long: [], pending: [], moves: [], mx: [], meshAt: [] };
    // each pointer move's arrival: the land it brought is drawn by the next re-mesh, whether the page
    // presses its dab at once or queues its points for the next animation frame (one dab a frame)
    window.addEventListener("pointermove", (e) => { w.__b.pending.push(e.timeStamp); w.__b.moves.push(e.timeStamp); w.__b.mx.push(e.clientX); }, { capture: true });
    const r = w.dgm3d.renderer;
    const u = r.updateTerrainRect.bind(r);
    w.__b.mesh = [];
    r.updateTerrainRect = (...a) => {
      const now = performance.now();
      w.__b.meshAt.push(now);
      for (const t of w.__b.pending) w.__b.mv.push([t, now]);
      w.__b.pending = [];
      const t = performance.now();
      const out = u(...a);
      if (!r.flushTerrain) w.__b.mesh.push(performance.now() - t);
      return out;
    };
    // (a renderer that draws a brush's land once a frame, flushTerrain: its re-mesh is that, not the call)
    if (r.flushTerrain) {
      const fl = r.flushTerrain.bind(r);
      r.flushTerrain = () => {
        const t = performance.now();
        const did = fl();
        if (did) w.__b.mesh.push(performance.now() - t);
        return did;
      };
    }

    const rn = r.renderNow.bind(r);
    r.renderNow = () => { rn(); w.__b.rend.push(performance.now()); };
    new PerformanceObserver((l) => { for (const e of l.getEntries()) w.__b.long.push([Math.round(e.startTime), Math.round(e.duration)]); }).observe({ type: "longtask" });
    const loop = (t) => { w.__b.raf.push(t); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  })()`);
  const at = (await page.evaluate(`window.dgmEditor.tileToClient(${Math.round(SIZE * 0.3)}, ${Math.round(SIZE * 0.35)})`)) as { x: number; y: number };
  await page.mouse.move(at.x, at.y);
  await page.evaluate("(() => { const b = window.__b; b.ev = []; b.mv = []; b.rend = []; b.raf = []; b.long = []; b.mesh = []; b.pending = []; b.moves = []; b.mx = []; b.meshAt = []; window.__w.adds = []; window.__w.byId.clear(); })()");
  // (the page's pixels per tile in the top-down view, to place each move on the map; a tile's own x is its centre)
  const tile0 = Math.round(SIZE * 0.3);
  const pxPerTile = (((await page.evaluate(`window.dgmEditor.tileToClient(${tile0 + 10}, ${Math.round(SIZE * 0.35)})`)) as { x: number }).x - at.x) / 10;
  const histBefore = await page.evaluate(() => window.dgmEditor!.info().history.length);
  const cdp = PROFILE ? await page.context().newCDPSession(page) : null;
  // (--profile: the drag itself, from the press to just before the release)
  if (cdp) {
    await cdp.send("Profiler.enable");
    await cdp.send("Profiler.setSamplingInterval", { interval: 100 });
    await cdp.send("Profiler.start");
  }
  await page.mouse.down();
  for (let k = 0; k < 480; k++) {
    const t = k / 480;
    await page.mouse.move(at.x + 260 * t, at.y + 70 * sin(t * 7));
    await page.waitForTimeout(6);
  }
  await page.waitForTimeout(700);
  const t0 = Date.now();
  await page.evaluate("window.__b.up = performance.now(); window.__b.down0 = window.__b.raf[0]");
  const profile = cdp ? ((await cdp.send("Profiler.stop")) as { profile: Profile }).profile : null;
  await page.mouse.up();
  await page.waitForFunction(() => window.dgmEditor!.pendingTerrain() === 0, null, { timeout: 60_000 });
  // (a worker-weathered stroke is one operation once its last land is in)
  await page.waitForFunction((n) => window.dgmEditor!.info().history.length > n, histBefore, { timeout: 60_000 });
  const commitMs = Date.now() - t0;
  if (profile) {
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
  const raw = (await page.evaluate("window.__b")) as { mv: [number, number][]; rend: number[]; raf: number[]; long: [number, number][]; up: number; mesh: number[]; moves: number[]; mx: number[]; meshAt: number[] };
  const worker = (await page.evaluate("window.__w.adds")) as { t: number; xs: number[]; resp: number | null }[];
  // the worker's land (D422): each move's land is in the first dab call carrying a point beyond the
  // previous move's tile x (the points a move pressed, or, when it pressed none, the next move's); the
  // land is drawn by the first re-mesh after that call's answer arrived
  if (worker.some((a) => a.xs.length)) {
    const tileX = (cx: number) => tile0 + 0.5 + (cx - at.x) / pxPerTile;
    raw.mv = [];
    let prev = tileX(at.x);
    for (let m = 0; m < raw.moves.length; m++) {
      const call = worker.find((a) => a.resp !== null && a.resp >= raw.moves[m] && a.xs.some((x) => x > prev + 0.125));
      prev = tileX(raw.mx[m]);
      if (!call) continue;
      const u = raw.meshAt.find((t) => t >= call.resp!);
      if (u !== undefined) raw.mv.push([raw.moves[m], u]);
    }
  }
  const lat: number[] = [];
  // (and only the moves the next re-mesh follows within half a second: those whose points changed
  // the land; a move that pressed nothing waits for whichever dab next does)
  const shown: number[] = [];
  for (const [e, u] of raw.mv) {
    const f = raw.rend.find((x) => x >= u);
    if (f === undefined) continue;
    lat.push(f - e);
    if (u - e < 500) shown.push(f - e);
  }
  // the cursor and the ring: from each pointer move to the next frame drawn (they are drawn in the
  // move's own handling)
  const cursor: number[] = [];
  for (const e of raw.moves) {
    const f = raw.rend.find((x) => x >= e);
    if (f !== undefined) cursor.push(f - e);
  }
  const frames: number[] = [];
  for (let k = 1; k < raw.raf.length; k++) frames.push(raw.raf[k] - raw.raf[k - 1]);
  const refresh = pct(frames, 0.5);
  // (the display's own frame: the shortest frames while painting)
  const vsync = pct(frames, 0.1);
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
  const last = (await page.evaluate("window.dgmEditor.lastStroke()")) as { tool: string; size: number; strength: number } | null;
  return {
    map: `${THEME} ${SIZE}² seed 1`,
    stroke: label,
    brush: last ? `${last.tool}, Size ${last.size}, Strength ${last.strength}` : null,
    refreshMs: round(refresh),
    landFrom: worker.some((a) => a.xs.length) ? `worker (${worker.length} dab calls)` : "page preview",
    inputToFrameMs: { p50: round(pct(lat, 0.5)), p95: round(pct(lat, 0.95)), max: round(Math.max(0, ...lat)), samples: lat.length },
    cursorToFrameMs: { p50: round(pct(cursor, 0.5)), p95: round(pct(cursor, 0.95)), samples: cursor.length },
    landShownMs: { p50: round(pct(shown, 0.5)), p95: round(pct(shown, 0.95)), samples: shown.length },
    landTrailFrames: { p50: round(pct(shown, 0.5) / vsync), p95: round(pct(shown, 0.95) / vsync), frameMs: round(vsync) },
    frameMs: { p50: round(pct(frames, 0.5)), p95: round(pct(frames, 0.95)), p99: round(pct(frames, 0.99)), max: round(Math.max(0, ...frames)), overTwoRefreshes: frames.filter((d) => d > 2 * refresh + 1).length, frames: frames.length },
    remeshMs: { p50: round(pct(raw.mesh, 0.5)), p95: round(pct(raw.mesh, 0.95)), max: round(Math.max(0, ...raw.mesh)), samples: raw.mesh.length },
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
      // Standard held: this budget is D46, before the High look existed, and a capable GPU would
      // otherwise silently draw High, which costs more to render and would invalidate the budget
      // (found auditing capture-badwater.ts's same gap, D304's investigation)
      const context = await browser.newContext({ viewport: { width: screen.width, height: screen.height }, deviceScaleFactor: screen.scale });
      await context.addInitScript("try { localStorage.setItem('dgm.look', 'standard'); } catch {}");
      const page = await context.newPage();
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
