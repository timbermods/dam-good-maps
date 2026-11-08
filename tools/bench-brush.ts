// Live editing: what a player feels while painting with the terrain brushes, measured in the
// installed Chrome, headed (real vsync, real GPU), on 256² maps. Per configuration: a raise stroke
// wandering about 70 tiles across the map (laid out in tiles on the level it starts on, so it stays
// on the map however the view frames it), then held still; the time from each pointer move's arrival
// to the frame that draws the land its points changed (in display frames, the land's trail); from each
// move to the next frame drawn (the cursor and the ring); the time between frames while painting; the
// main thread's long tasks; how soon the worker has the stroke after the button comes up; how soon undo
// shows; and whether the map the worker built is the one painted (strokes that differ: 0 when all is
// well).
//
// A move's land: the page queues a move's points and presses them in the next animation frame (one
// press a frame), so a move is followed to the re-mesh of the frame that presses it (or of its own
// handling, for a straight line or an area). A move whose press changes nothing has no land to wait
// for, and is counted apart (`movesChangingNothing`): a Raise with its target (D322, the default "up to"
// a level above the ground it starts on) over ground already at it, a move shorter than a dab's spacing,
// a target's hold. Counting those to whatever later re-mesh came (seconds on, once the stroke reached
// lower ground) was a wait no player sees (#858).
//
// Where the land is drawn from decides how a move is followed. The page's own preview (every brush but
// Naturalize without the D422 patch) presses its dabs in the page, so the re-mesh after a move is the move's.
// A Naturalize stroke weathered in the worker (D422) draws land that comes back later, and that land is
// from the dabs the worker was sent, not from the moves that arrived since. The tool then watches the page's
// messages to the worker (weatherAdd's dabs and the moment each answer arrives, hooked from the page side,
// nothing in the product changed), gives each move the first dab call that carries a point beyond the
// previous move's position (the stroke runs left to right, so a point's x says which move it came from),
// and follows that call's answer to the re-mesh it draws and to the frame after it. (A move's tile x is
// where the page's own pick puts it on the stroke's level.) A call answered without land changed nothing,
// and its moves are counted apart (`movesChangingNothing`), as the page's own are (#868): most of a Size 5
// stroke's dabs fall on ground already weathered as far as it goes. `workerAnswerMs` is from each move to the
// answer for its points, land or none, so a queue of calls waiting for the worker shows there.
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
/** The tool keys (the toolbar's order; 1 is Select, the brushes follow: BRUSHES in src/editor/brushes.ts). */
const TOOL_KEY: Record<string, string> = { raise: "2", lower: "3", flatten: "4", smooth: "5", naturalize: "6" };
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
            if (a) {
              a.resp = e.timeStamp;
              a.land = !!(e.data && e.data.value);
            }
          });
        }
        if (m && Array.isArray(m.path) && m.path[0] === "weatherAdd") {
          const a0 = m.argumentList && m.argumentList[0];
          const dabs = Array.isArray(a0) ? a0 : a0 && a0.value;
          const a = { t: performance.now(), xs: [], resp: null, land: false };
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
  // the stroke, in tiles on the level it starts on (the page's plane for it), and where each point is on screen
  const sx = Math.round(SIZE * 0.3);
  const sy = Math.round(SIZE * 0.35);
  const N = 480;
  const tiles: [number, number][] = [];
  for (let k = 0; k <= N; k++) tiles.push([sx + 0.5 + SIZE * 0.27 * (k / N), sy + 0.5 + SIZE * 0.075 * sin((k / N) * 7)]);
  const { level, path } = (await page.evaluate(`(() => {
    const r = window.dgm3d.renderer;
    const level = r.heightAt(${sx}, ${sy});
    const c = r.canvas.getBoundingClientRect();
    const path = ${JSON.stringify(tiles)}.map(([x, y]) => { const p = r.project(x, level, -y); return [p.x + c.left, p.y + c.top]; });
    return { level, path };
  })()`)) as { level: number; path: [number, number][] };
  // (a string, so the bundler's helpers stay out of the page)
  await page.evaluate(`(() => {
    const w = window;
    w.__b = { ev: [], mv: [], rend: [], raf: [], long: [], pending: [], pressing: [], idle: 0, frame: -1, moves: [], mx: [], meshAt: [] };
    const r = w.dgm3d.renderer;
    // each pointer move's arrival, and its tile x on the stroke's level
    window.addEventListener("pointermove", (e) => {
      w.__b.pending.push(e.timeStamp);
      w.__b.moves.push(e.timeStamp);
      const p = r.pickAtLevel(e.clientX, e.clientY, ${level});
      w.__b.mx.push(p ? p.point[0] : NaN);
    }, { capture: true });
    // a frame's first callback: the moves that arrived before it are the ones this frame presses; those
    // the frame before pressed without a re-mesh changed nothing
    const raf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (cb) => raf((t) => {
      if (t !== w.__b.frame) {
        w.__b.frame = t;
        w.__b.idle += w.__b.pressing.length;
        w.__b.pressing = w.__b.pending;
        w.__b.pending = [];
      }
      return cb(t);
    });
    const u = r.updateTerrainRect.bind(r);
    w.__b.mesh = [];
    r.updateTerrainRect = (...a) => {
      const now = performance.now();
      w.__b.meshAt.push(now);
      // (and those handled in this event, for a straight line or an area, which press in their own handling)
      for (const t of w.__b.pressing) w.__b.mv.push([t, now]);
      for (const t of w.__b.pending) w.__b.mv.push([t, now]);
      w.__b.pressing = [];
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
  await page.mouse.move(path[0][0], path[0][1]);
  await page.evaluate("(() => { const b = window.__b; b.ev = []; b.mv = []; b.rend = []; b.raf = []; b.long = []; b.mesh = []; b.pending = []; b.pressing = []; b.idle = 0; b.moves = []; b.mx = []; b.meshAt = []; window.__w.adds = []; window.__w.byId.clear(); })()");
  const histBefore = await page.evaluate(() => window.dgmEditor!.info().history.length);
  const cdp = PROFILE ? await page.context().newCDPSession(page) : null;
  // (--profile: the drag itself, from the press to just before the release)
  if (cdp) {
    await cdp.send("Profiler.enable");
    await cdp.send("Profiler.setSamplingInterval", { interval: 100 });
    await cdp.send("Profiler.start");
  }
  await page.mouse.down();
  for (let k = 1; k <= N; k++) {
    await page.mouse.move(path[k][0], path[k][1]);
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
  const raw = (await page.evaluate("window.__b")) as { mv: [number, number][]; rend: number[]; raf: number[]; long: [number, number][]; up: number; mesh: number[]; moves: number[]; mx: number[]; meshAt: number[]; idle: number; pressing: number[]; pending: number[] };
  const worker = (await page.evaluate("window.__w.adds")) as { t: number; xs: number[]; resp: number | null; land: boolean }[];
  // the worker's land (D422): each move's land is in the first dab call carrying a point beyond the
  // previous move's tile x (the points a move pressed, or, when it pressed none, the next move's); the
  // land is drawn by the first re-mesh after that call's answer arrived. A call whose answer carries no
  // land changed nothing (a dab over ground already weathered as far as it goes): its moves are counted
  // apart, as the page's own are, since following them to a later call's land was a wait no player sees
  // (#868, as #858 found for Raise)
  const remote = worker.some((a) => a.xs.length);
  // (and from each move to the worker's answer for its points, land or none: the wait behind earlier calls included)
  const answered: number[] = [];
  let unchanged = 0;
  if (remote) {
    raw.mv = [];
    let prev = tiles[0][0];
    for (let m = 0; m < raw.moves.length; m++) {
      const call = worker.find((a) => a.resp !== null && a.resp >= raw.moves[m] && a.xs.some((x) => x > prev + 0.125));
      if (Number.isFinite(raw.mx[m])) prev = raw.mx[m];
      if (!call) continue;
      answered.push(call.resp! - raw.moves[m]);
      if (!call.land) {
        unchanged++;
        continue;
      }
      const u = raw.meshAt.find((t) => t >= call.resp!);
      if (u !== undefined) raw.mv.push([raw.moves[m], u]);
    }
  }
  const lat: number[] = [];
  // (and only the moves whose land is drawn within half a second: the worker's land, followed by the dab
  // call that carries it, may come later)
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
    landFrom: remote ? `worker (${worker.length} dab calls)` : "page preview",
    // (the worker's land: from a move to the worker's answer for its points; each dab call's time there and
    // back, and how many dabs it carried)
    ...(remote
      ? {
          workerAnswerMs: { p50: round(pct(answered, 0.5)), p95: round(pct(answered, 0.95)), max: round(Math.max(0, ...answered)), samples: answered.length },
          workerCalls: (() => {
            const rt = worker.filter((a) => a.resp !== null).map((a) => a.resp! - a.t);
            const n = worker.map((a) => a.xs.length);
            return { roundTripP50: round(pct(rt, 0.5)), roundTripP95: round(pct(rt, 0.95)), dabs: n.reduce((a, b) => a + b, 0), dabsPerCallP50: pct(n, 0.5), dabsPerCallMax: Math.max(0, ...n), withLand: worker.filter((a) => a.land).length };
          })(),
        }
      : {}),
    inputToFrameMs: { p50: round(pct(lat, 0.5)), p95: round(pct(lat, 0.95)), max: round(Math.max(0, ...lat)), samples: lat.length },
    movesChangingNothing: remote ? unchanged : raw.idle + raw.pressing.length + raw.pending.length,
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
