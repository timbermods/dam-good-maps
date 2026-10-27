// Land near the editor's one ceiling (PLAN §20 D244 step 2): frame times on a dense 256² map, before
// and after a plateau set to level 22 and a volcano erupted to the ceiling, with the High look's
// method (tools/measure-high.ts on feature/high-look: the installed Chrome headed, the view drawn and
// read back, the GPU's timer queries while orbiting, frame intervals while painting), the page's
// frames while the eruption runs, and captures for Kyler's sitting (the editor's default view and a
// low view of each, before and after). Information (D115).
//
//   npx tsx tools/measure-ceiling.ts [--port 4942] [--seconds 5] [--headless] [--no-shots] [--paint-now]
//     splitting a cause: [--no-plateau] [--no-volcano] [--plateau-level 16] [--power 60] [--eruptions 1]
//     [--volcano-top 16] [--debug] (unminified; the page's water updates, their callers, what moved)
//
// It ends with the regression check (the painting stutter after a force, fixed with D244 step 2):
// painting after the edits keeps within 1.5 × the 95th percentile of the stroke before them, and exits
// with an error otherwise.
//
// It builds the site from this checkout, writes .scratch/measure-ceiling.json (gitignored) and a
// table on stdout, and the captures to docs/progress/forces/ceiling-*.png. The camera moves only
// here, for the measurement and the captures: the product never moves it by itself (D265).

import { mkdirSync, writeFileSync } from "node:fs";
import { chromium, type Page } from "@playwright/test";
import { build, preview } from "vite";
import { waitForEditor } from "./wait-editor";

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const PORT = Number(arg("port") ?? 4942);
const SECONDS = Number(arg("seconds") ?? 5);
const HEADLESS = process.argv.includes("--headless");
const OUT = ".scratch/measure-ceiling-dist";
const SHOTS = "docs/progress/forces";
/** The High look's first map: River Valley 4242 at 256², forests at twice the density, ruins ×3. */
const FRAGMENT = arg("fragment") ?? "#s=4242&z=256&d=n&t=riverValley&fd=200&gs=b&ru=300";
const CEILING = 22;
/** Splitting a cause: the plateau's level (and none), the volcano's top to stop at (and none), no captures. */
const PLATEAU_LEVEL = Number(arg("plateau-level") ?? CEILING);
const NO_PLATEAU = process.argv.includes("--no-plateau");
const NO_VOLCANO = process.argv.includes("--no-volcano");
const VOLCANO_TOP = Number(arg("volcano-top") ?? CEILING);
const NO_SHOTS = process.argv.includes("--no-shots");
const POWER = arg("power") ?? "100";
/** Unminified, with the callers of the page's water updates while painting (finding a cause). */
const DEBUG = process.argv.includes("--debug");
const BASE = "/preview/";

const pct = (a: number[], p: number) => (a.length ? [...a].sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(p * a.length))] : 0);
const round = (v: number | null) => (v === null ? null : Math.round(v * 100) / 100);

async function open(page: Page): Promise<void> {
  await page.goto(`http://localhost:${PORT}${BASE}${FRAGMENT}`);
  await waitForEditor(page, 600_000);
  await page.mouse.move(2, 2);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: /Ready to play|warning|problem/ }).waitFor({ timeout: 600_000 });
  await page.evaluate("window.dgmEditor.idle()");
}

const idle = (page: Page) => page.evaluate("window.dgmEditor.idle()");
const client = (page: Page, x: number, y: number) => page.evaluate(`window.dgmEditor.tileToClient(${x}, ${y})`) as Promise<{ x: number; y: number }>;
const heights = (page: Page) => page.evaluate("Array.from(window.dgm3d.renderer.mapState().heights)") as Promise<number[]>;

/** The view drawn 45 times back to back, each read back to its end (the median and 95th of the last 40). */
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

type Orbit = { fps: number; p50: number; p95: number; gpuP50: number | null; gpuP95: number | null; frames: number };
async function orbit(page: Page, view: "whole" | "close", at?: [number, number, number]): Promise<Orbit> {
  await page.evaluate(`(() => {
    const r = window.dgm3d.renderer;
    r.resetView();
    if (${JSON.stringify(view)} === "close") r.setView({ distance: 60, pitch: 0.75${at ? `, target: ${JSON.stringify(at)}` : ""} });
  })()`);
  await page.waitForTimeout(600);
  const s = (await page.evaluate(`window.dgm3d.renderer.benchOrbit(${SECONDS * 1000}, ${SECONDS * 2000})`)) as Orbit;
  return { fps: round(s.fps)!, p50: round(s.p50)!, p95: round(s.p95)!, gpuP50: round(s.gpuP50), gpuP95: round(s.gpuP95), frames: s.frames };
}

/** Frame intervals and long tasks from now until `stop()`. */
async function watch(page: Page): Promise<() => Promise<{ frameP50: number | null; frameP95: number | null; frameMax: number | null; longTasks: number[] }>> {
  await page.evaluate(`(() => {
    const w = window;
    w.__b = { raf: [], long: [], stop: false };
    w.__b.obs = new PerformanceObserver((l) => { for (const e of l.getEntries()) w.__b.long.push(Math.round(e.duration)); });
    w.__b.obs.observe({ type: "longtask" });
    const loop = (t) => { w.__b.raf.push(t); if (!w.__b.stop) requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  })()`);
  return async () => {
    const raw = (await page.evaluate("(() => { window.__b.stop = true; window.__b.obs.disconnect(); return { raf: window.__b.raf, long: window.__b.long }; })()")) as { raf: number[]; long: number[] };
    const frames: number[] = [];
    for (let k = 1; k < raw.raf.length; k++) frames.push(raw.raf[k] - raw.raf[k - 1]);
    return { frameP50: round(pct(frames, 0.5)), frameP95: round(pct(frames, 0.95)), frameMax: round(Math.max(0, ...frames)), longTasks: raw.long };
  };
}

/** A raise stroke wandering for about three seconds across the high ground (frame intervals), then undone. */
async function paint(page: Page, from: [number, number]) {
  await page.evaluate("window.dgm3d.renderer.resetView()");
  await page.getByRole("button", { name: "Raise brush (1)" }).click();
  const n0 = (await page.evaluate("window.dgmEditor.info().history.filter((h) => h.applied).length")) as number;
  const at = await client(page, from[0], from[1]);
  await page.mouse.move(at.x, at.y);
  const waterStatus = await page.getByRole("toolbar", { name: "Water time" }).getByRole("status").innerText().catch(() => "?");
  // what the page does on the stroke's frames: the renderer's updates, counted and timed
  await page.evaluate(`(() => {
    const r = window.dgm3d.renderer;
    const w = window;
    w.__calls = {};
    for (const name of ["updateWater", "updateWaterSoon", "updateTerrainRect", "updateSoil", "updateEntities", "refreshShadows", ...(${DEBUG} ? ["meshWater", "bakeTiles", "updateClearAround"] : [])]) {
      const f = r[name];
      if (typeof f !== "function" || f.__wrapped) continue;
      const g = function (...a) {
        // (debug: which tiles of the water moved since the last frame, and by how much)
        if (${DEBUG} && name === "updateWater") {
          const m = r.map;
          const was = new Map();
          for (let k = 0; k < m.water.count; k++) was.set(m.water.tile[k], m.water.depth[k]);
          const v = a[0];
          const moved = [];
          let most = 0;
          for (let k = 0; k < v.count; k++) {
            const d = Math.abs(v.depth[k] - (was.get(v.tile[k]) ?? 0));
            was.delete(v.tile[k]);
            if (d > 0.01) moved.push(v.tile[k]);
            most = Math.max(most, d);
          }
          for (const [t, d] of was) if (d > 0.01) { moved.push(t); most = Math.max(most, d); }
          const s = (w.__moved ??= { frames: 0, tiles: 0, most: 0, x0: 1e9, y0: 1e9, x1: -1, y1: -1, count: v.count });
          s.frames++;
          s.tiles += moved.length;
          s.most = Math.max(s.most, most);
          s.count = v.count;
          for (const t of moved) { const x = t % m.W, y = Math.floor(t / m.W); s.x0 = Math.min(s.x0, x); s.y0 = Math.min(s.y0, y); s.x1 = Math.max(s.x1, x); s.y1 = Math.max(s.y1, y); }
        }
        const t0 = performance.now();
        const out = f.apply(this, a);
        const c = (w.__calls[name] ??= { n: 0, ms: 0, stacks: {} });
        c.n++;
        if (${DEBUG} && name === "updateWater") {
          const st = (new Error().stack || "").split(String.fromCharCode(10)).slice(2, 7).map((l) => l.trim().replace(/[(].*[/]/, "(")).join(" < ");
          c.stacks[st] = (c.stacks[st] || 0) + 1;
        }
        c.ms += performance.now() - t0;
        return out;
      };
      g.__wrapped = true;
      r[name] = g;
    }
  })()`);
  const stop = await watch(page);
  await page.mouse.down();
  for (let k = 0; k < 360; k++) {
    const t = k / 360;
    await page.mouse.move(at.x + 200 * t, at.y + 60 * Math.sin(t * 7));
    await page.waitForTimeout(6);
  }
  await page.mouse.up();
  const r = await stop();
  const calls = (await page.evaluate("(() => { const c = window.__calls; window.__calls = {}; for (const k in c) c[k].ms = Math.round(c[k].ms); return c; })()")) as Record<string, { n: number; ms: number; stacks?: Record<string, number> }>;
  if (DEBUG) console.log("the water that moved between the stroke's water frames:", await page.evaluate("(() => { const s = window.__moved; window.__moved = undefined; return JSON.stringify(s); })()"));
  if (DEBUG && calls.updateWater?.stacks) {
    console.log("updateWater's callers while painting:");
    for (const [st, n] of Object.entries(calls.updateWater.stacks).sort((a, b) => b[1] - a[1]).slice(0, 6)) console.log(`  ${n} × ${st}`);
  }
  for (const c of Object.values(calls)) delete c.stacks;
  await page.waitForFunction("window.dgmEditor.pendingTerrain() === 0", null, { timeout: 120_000 });
  await idle(page);
  await page.getByRole("button", { name: "Raise brush (1)" }).click();
  // (the stroke undone, only if it made one: every measurement paints the same land)
  const n1 = (await page.evaluate("window.dgmEditor.info().history.filter((h) => h.applied).length")) as number;
  if (n1 > n0) await page.getByRole("button", { name: "Undo (Ctrl+Z)" }).click();
  await page.waitForFunction("window.dgmEditor.pendingTerrain() === 0", null, { timeout: 120_000 });
  await idle(page);
  return { ...r, stroke: n1 > n0, calls, waterStatus };
}

async function measure(page: Page, label: string, close: [number, number, number], paintFrom: [number, number]) {
  const row = {
    label,
    drawn: { whole: await drawn(page, "whole"), close: await drawn(page, "close") },
    whole: await orbit(page, "whole"),
    close: await orbit(page, "close", close),
    painting: await paint(page, paintFrom),
    top: Math.max(...(await heights(page))),
  };
  console.log(
    `${label.padEnd(34)} top ${row.top} · drawn whole ${row.drawn.whole.p50} ms, close ${row.drawn.close.p50} ms · whole: GPU p50 ${row.whole.gpuP50} p95 ${row.whole.gpuP95} ms, ${row.whole.fps} fps · close: GPU p50 ${row.close.gpuP50} p95 ${row.close.gpuP95} ms, ${row.close.fps} fps · painting p50 ${row.painting.frameP50} p95 ${row.painting.frameP95} ms, long tasks ${row.painting.longTasks.length}, water "${row.painting.waterStatus}", calls ${JSON.stringify(row.painting.calls)}`,
  );
  return row;
}

/** The editor's default view, and a low view looking at (x, y) from the south-west. */
async function shoot(page: Page, name: string, x: number, y: number, h: number) {
  if (NO_SHOTS) return;
  await page.mouse.move(2, 2);
  await page.evaluate("window.dgm3d.renderer.resetView()");
  await page.waitForTimeout(800);
  // (the log links one default view before and one after: the plateau's before, the volcano's after)
  const def = name === "plateau-before" ? "before" : name === "volcano-after" ? "after" : null;
  if (def) await page.screenshot({ path: `${SHOTS}/ceiling-${def}-default.png` });
  await page.evaluate(`window.dgm3d.renderer.setView({ target: [${x}, ${h * 0.6}, ${-y}], distance: 95, pitch: 0.3, yaw: -0.6 })`);
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${SHOTS}/ceiling-${name}-low.png` });
}

/** Dry ground away from the start and the water, nearest the given place: the middle of an n × n. */
async function dryNear(page: Page, want: [number, number], n: number): Promise<[number, number]> {
  return (await page.evaluate(`(() => {
    const m = window.dgm3d.renderer.mapState();
    const W = m.W;
    window.dgm3d.renderer.resetView();
    window.dgm3d.renderer.renderNow();
    // (where the map takes the pointer in the editor's default view)
    const onMap = (x, y) => {
      const p = window.dgmEditor.tileToClient(x, y);
      return p.visible !== false && document.elementFromPoint(p.x, p.y)?.tagName === "CANVAS";
    };
    const info = window.dgmEditor.info();
    const st = info.features.find((f) => f.kind === "start").params.position;
    const r = ${Math.ceil(n / 2) + 2};
    let best = null;
    let bestD = Infinity;
    for (let y = r + 4; y < m.H - r - 4; y += 2)
      for (let x = r + 4; x < W - r - 4; x += 2) {
        if (Math.hypot(x - st[0], y - st[1]) < 40) continue;
        let ok = true;
        for (let yy = y - r; yy <= y + r && ok; yy++) for (let xx = x - r; xx <= x + r && ok; xx++) if (m.surface.depth[yy * W + xx] > 0) ok = false;
        if (!ok || !onMap(x, y)) continue;
        const d = Math.hypot(x - ${want[0]}, y - ${want[1]});
        if (d < bestD) { bestD = d; best = [x, y]; }
      }
    return best;
  })()`)) as [number, number];
}

async function main() {
  // (built as the preview is, under /preview/: the forces show there before their release, D219)
  process.env.DGM_BASE = BASE;
  console.log("building the site…");
  await build({ configFile: "vite.config.ts", base: BASE, logLevel: "warn", build: { outDir: OUT, emptyOutDir: true, ...(DEBUG ? { minify: false } : {}) } });
  const server = await preview({ configFile: "vite.config.ts", base: BASE, build: { outDir: OUT }, preview: { port: PORT, strictPort: true }, logLevel: "warn" });
  const out: Record<string, unknown> = { date: new Date().toISOString(), seconds: SECONDS, fragment: FRAGMENT };
  try {
    const keep = ["--disable-backgrounding-occluded-windows", "--disable-renderer-backgrounding", "--disable-background-timer-throttling", "--enable-gpu", "--ignore-gpu-blocklist"];
    const browser = await chromium.launch({ channel: "chrome", headless: HEADLESS, args: keep });
    const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
    await page.addInitScript("window.__name = (f) => f; try { localStorage.setItem('dgm.firstRun', 'done'); } catch {}");
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await open(page);
    const W = (await page.evaluate("window.dgm3d.renderer.mapState().W")) as number;
    out.map = await page.evaluate(`(() => { const r = window.dgm3d.renderer; return { gpu: r.gpu().renderer, canvas: [r.canvas.width, r.canvas.height], objects: r.mapState().entities.count }; })()`);
    console.log(JSON.stringify(out.map));
    // the plateau west of the middle, the volcano east of it
    const plateau = await dryNear(page, [Math.round(W * 0.35), Math.round(W * 0.5)], 24);
    const volcano = await dryNear(page, [Math.round(W * 0.68), Math.round(W * 0.45)], 16);
    const h0 = await heights(page);
    const hp = h0[plateau[1] * W + plateau[0]];
    const hv = h0[volcano[1] * W + volcano[0]];
    out.places = { plateau, volcano, groundPlateau: hp, groundVolcano: hv };
    await shoot(page, "plateau-before", plateau[0], plateau[1], hp);
    await shoot(page, "volcano-before", volcano[0], volcano[1], hv);
    const rows: unknown[] = [];
    rows.push(await measure(page, "before (top at most 16)", [plateau[0], hp, -plateau[1]], [plateau[0] - 20, plateau[1] + 30]));

    // a plateau set to 22: Select, a 24 × 24 rectangle, Set level 22
    if (!NO_PLATEAU) {
    await page.getByRole("button", { name: "Select (M)" }).click();
    const a = await client(page, plateau[0] - 12, plateau[1] - 12);
    const b = await client(page, plateau[0] + 11, plateau[1] + 11);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(b.x, b.y, { steps: 8 });
    await page.mouse.up();
    const row = page.getByRole("group", { name: "Selection" });
    await row.getByRole("combobox", { name: "Level", exact: true }).selectOption(String(PLATEAU_LEVEL));
    await row.getByRole("button", { name: "Set level" }).click();
    await page.waitForFunction("window.dgmEditor.pendingTerrain() === 0", null, { timeout: 120_000 });
    await idle(page);
    // close the selection (while it is open it is the working area, D254: a force works only inside it)
    const closeSel = page.getByRole("button", { name: "Close the selection" });
    if (await closeSel.count()) await closeSel.first().click();
    await page.keyboard.press("Escape");
    await page.waitForFunction("window.dgmEditor.selection().length === 0", null, { timeout: 10_000 });
    await page.waitForTimeout(3000);
    out.plateauTop = (await heights(page))[plateau[1] * W + plateau[0]];
    await shoot(page, "plateau-after", plateau[0], plateau[1], CEILING);
    }

    // a volcano to the ceiling: Erupt at full Power, again on its summit until it stands at 22
    await page.getByRole("button", { name: "Erupt (0)" }).click();
    await page.getByRole("group", { name: "Erupt options" }).getByRole("slider", { name: "Power" }).fill(POWER);
    const eruptions: unknown[] = [];
    let summit = volcano;
    for (let k = 0; k < (NO_VOLCANO ? 0 : Number(arg("eruptions") ?? 4)); k++) {
      const hs = await heights(page);
      let top = 0;
      for (let y = volcano[1] - 10; y <= volcano[1] + 10; y++)
        for (let x = volcano[0] - 10; x <= volcano[0] + 10; x++)
          if (hs[y * W + x] > top) {
            top = hs[y * W + x];
            summit = [x, y];
          }
      if (top >= VOLCANO_TOP) break;
      await page.evaluate("window.dgm3d.renderer.resetView()");
      await page.waitForTimeout(400);
      const p = await client(page, summit[0], summit[1]);
      await page.mouse.move(p.x + 3, p.y);
      await page.mouse.move(p.x, p.y);
      const stop = await watch(page);
      const t0 = Date.now();
      await page.mouse.click(p.x, p.y);
      const started = await page.waitForFunction("!!window.dgmEditor.force()", null, { timeout: 10_000 }).then(() => true, () => false);
      if (!started) {
        console.log("the eruption didn't start:", await page.locator(".map-note, [role=status]").allInnerTexts(), await page.evaluate("JSON.stringify(window.dgmEditor.gesture())"), await page.getByRole("button", { name: "Erupt (0)" }).getAttribute("aria-pressed"), p, await page.evaluate(`document.elementFromPoint(${p.x}, ${p.y})?.tagName`));
        await stop();
        break;
      }
      await page.waitForFunction("!window.dgmEditor.force()", null, { timeout: 120_000 });
      await idle(page);
      const frames = await stop();
      const after = Math.max(...(await heights(page)).filter((_, i) => Math.abs((i % W) - volcano[0]) <= 30 && Math.abs(Math.floor(i / W) - volcano[1]) <= 30));
      eruptions.push({ at: summit, ms: Date.now() - t0, top: after, ...frames });
      console.log(`eruption ${k + 1} at ${summit}: top ${after}, ${Date.now() - t0} ms, frames p50 ${frames.frameP50} p95 ${frames.frameP95} max ${frames.frameMax}, long tasks ${JSON.stringify(frames.longTasks)}`);
    }
    out.eruptions = eruptions;
    await page.keyboard.press("Escape");
    await page.waitForTimeout(3000);
    const hs = await heights(page);
    let top = 0;
    for (let y = volcano[1] - 30; y <= volcano[1] + 30; y++) for (let x = volcano[0] - 30; x <= volcano[0] + 30; x++) top = Math.max(top, hs[y * W + x]);
    out.volcanoTop = top;
    await shoot(page, "volcano-after", summit[0], summit[1], top);
    // (and a stroke at once after the last edit, while its water may still be settling)
    if (process.argv.includes("--paint-now")) {
      out.paintNow = await paint(page, [plateau[0] - 20, plateau[1] + 30]);
      console.log(`painting at once after the edits: ${JSON.stringify(out.paintNow)}`);
    }
    rows.push(await measure(page, "after (plateau and volcano at 22)", [summit[0], top, -summit[1]], [plateau[0] - 20, plateau[1] + 30]));
    // painting elsewhere after: across the volcano's flank (high ground), and on the plateau's top
    out.paintFlank = await paint(page, [summit[0] - 14, summit[1] + 6]);
    out.paintPlateau = await paint(page, [plateau[0] - 8, plateau[1]]);
    console.log(`painting after, on the volcano's flank: ${JSON.stringify(out.paintFlank)}; on the plateau: ${JSON.stringify(out.paintPlateau)}`);
    out.rows = rows;
    out.errors = errors;
    await browser.close();
    if (errors.length) console.log("page errors:", errors);
  } finally {
    await server.close();
  }
  mkdirSync(".scratch", { recursive: true });
  writeFileSync(".scratch/measure-ceiling.json", JSON.stringify(out, null, 2) + "\n");
  console.log("\nwrote .scratch/measure-ceiling.json");
  // the regression check (Live editing's blocking rule, D158): painting after the tall edits keeps
  // the display's rate as painting before them does: every stroke's 95th percentile within a frame
  // and a half of the stroke before the edits (before the fix, 70–120 ms at 170 Hz)
  const rows = (out.rows ?? []) as { painting: { frameP95: number | null } }[];
  const before = rows[0]?.painting.frameP95 ?? null;
  const after = [rows[1]?.painting, out.paintFlank, out.paintPlateau, out.paintNow].filter(Boolean) as { frameP95: number | null }[];
  if (before !== null && after.length) {
    const limit = before * 1.5;
    const worst = Math.max(...after.map((p) => p.frameP95 ?? 0));
    console.log(`regression check: painting p95 before ${before} ms, after the edits at most ${worst} ms (limit ${limit.toFixed(1)} ms): ${worst <= limit ? "pass" : "FAIL"}`);
    if (worst > limit) process.exitCode = 1;
  }
}

await main();
