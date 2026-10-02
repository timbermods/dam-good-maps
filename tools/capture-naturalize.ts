// Naturalize on terraced land, before and after, for Kyler's eye (PLAN §20 D387 (4)): today it scatters
// single-tile bumps and holes across clean terraces; these sheets show that as it is now. One sheet per
// look (Standard, High): rows are a map and a setting (an oblique close view, then top-down), columns the
// land before and after the stroke.
//
//   npx tsx tools/capture-naturalize.ts [--out docs/progress/naturalize] [--scratch .scratch/naturalize]
//     [--port 4977] [--only 0,2] [--explore] [--skip-build]
//
// `--explore` draws only the "before" oblique views of the candidates, to pick maps with clean terraces.
// Our own generated maps only (128², high Terracing). Each stroke goes through the editor's real input
// path: the Naturalize key, the size and strength keys, a pointer drag across a terraced slope (the
// stroke's own noise seed fixed by seeding Math.random, so a run repeats). The water is held at one
// moment and the page's buttons are hidden. Nothing in the product is changed.

import { mkdirSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium, type Page } from "@playwright/test";
import { build, preview } from "vite";

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const OUT = arg("out") ?? "docs/progress/naturalize";
const SCRATCH = arg("scratch") ?? ".scratch/naturalize";
const PORT = Number(arg("port") ?? 4977);
const ONLY = arg("only")?.split(",").map(Number);
const EXPLORE = process.argv.includes("--explore");
const SKIP_BUILD = process.argv.includes("--skip-build");
const VIEWPORT = { width: 1280, height: 800 };
const CLOCK = 12.5;
const GPU_ARGS = ["--enable-gpu", "--use-angle=d3d11", "--ignore-gpu-blocklist"];

interface Case {
  seed: number;
  theme: string;
  /** "default" is the brush as it opens (Size 5, Strength 5); "max" the largest Size and Strength. */
  setting: "default" | "max";
}

// High Terracing (100) in the themes that terrace well (Canyon and Highlands came out too broken to
// read as terraces); chosen by looking at `--explore`.
const CASES: Case[] = [
  { seed: 3, theme: "riverValley", setting: "default" },
  { seed: 6, theme: "riverValley", setting: "default" },
  { seed: 1, theme: "lakeBasin", setting: "default" },
  { seed: 3, theme: "lakeBasin", setting: "default" },
  { seed: 3, theme: "riverValley", setting: "max" },
];
const EXPLORE_CASES: Case[] = ["highlands", "riverValley", "lakeBasin", "canyon"].flatMap((theme) => [1, 2, 3, 4, 5, 6].map((seed) => ({ seed, theme, setting: "default" as const })));
const fragment = (c: Case) => `#s=${c.seed}&z=128&d=n&t=${c.theme}&tr=100`;

type View = { mode: "top" | "orbit"; yaw: number; pitch: number; distance: number; target: [number, number, number] };
interface Spot {
  cx: number;
  cy: number;
  /** Radians: the camera's side, looking up the slope. */
  yaw: number;
  /** The terraced slope's extent to paint across, as tiles. */
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  levels: number;
  edges: number;
  h: number;
  W: number;
  H: number;
}

/** Page side: the terraced slope to paint: a dry 26x20 window with the most step edges between
 *  neighbours, at least three levels, and a clear downhill; and the way the camera should face. */
const SPOT_JS = `() => {
  const m = window.dgm3d.renderer.mapState();
  const { W, H, heights: h, surface } = m;
  const dry = (i) => !(surface.depth[i] > 0);
  const ww = 26, wh = 20;
  let best = null;
  for (let y0 = 10; y0 + wh < H - 10; y0 += 2) for (let x0 = 10; x0 + ww < W - 10; x0 += 2) {
    let edges = 0, wet = 0; const seen = new Set();
    let gx = 0, gy = 0;
    for (let y = y0; y < y0 + wh; y++) for (let x = x0; x < x0 + ww; x++) {
      const i = y * W + x;
      if (!dry(i)) wet++;
      seen.add(h[i]);
      if (x + 1 < x0 + ww) { const d = h[i + 1] - h[i]; if (d) edges++; gx += d; }
      if (y + 1 < y0 + wh) { const d = h[i + W] - h[i]; if (d) edges++; gy += d; }
    }
    if (wet > 0 || seen.size < 3) continue;
    // a clear slope: the mean height gradient across the window
    const slope = Math.hypot(gx, gy) / (ww * wh);
    const score = Math.min(edges, 220) * Math.min(slope, 0.6) * Math.min(seen.size, 6);
    if (!best || score > best.score) best = { score, x0, y0, gx, gy, edges, levels: seen.size };
  }
  if (!best) return null;
  const cx = best.x0 + ww / 2, cy = best.y0 + wh / 2;
  // the camera sits downhill, looking up the slope (yaw as the cliff view of tools/capture-high.ts)
  const yaw = Math.atan2(-best.gx, best.gy);
  return { cx, cy, yaw, x0: best.x0, y0: best.y0, x1: best.x0 + ww, y1: best.y0 + wh, levels: best.levels, edges: best.edges, h: h[Math.round(cy) * W + Math.round(cx)], W, H };
}`;

function views(s: Spot): { oblique: View; top: View; wide: View } {
  return {
    oblique: { mode: "orbit", yaw: s.yaw, pitch: 0.5, distance: 40, target: [s.cx, s.h, -s.cy] },
    top: { mode: "top", yaw: 0, pitch: 0.5, distance: 36, target: [s.cx, s.h, -s.cy] },
    wide: { mode: "top", yaw: 0, pitch: 0.5, distance: Math.max(s.W, s.H) * 1.25, target: [s.W / 2, s.h, -s.H / 2] },
  };
}

async function open(page: Page, c: Case): Promise<void> {
  await page.goto("about:blank");
  await page.goto(`http://localhost:${PORT}/${fragment(c)}`);
  await page.getByText(/All \d+ checks passed/).first().waitFor({ timeout: 600_000 });
  await page.getByRole("button", { name: "Refine this map" }).click();
  await page.waitForFunction("!!window.dgmEditor && !!window.dgm3d", null, { timeout: 300_000 });
  await page.getByRole("button", { name: "No more hints" }).click().catch(() => undefined);
  await page.mouse.move(2, 2);
  await page.waitForTimeout(2500);
  await page.evaluate("window.dgmEditor.idle()");
  await page.evaluate(`window.dgm3d.renderer.setClock(${CLOCK})`);
}

async function setLook(page: Page, look: "standard" | "high"): Promise<void> {
  await page.evaluate(`(() => { const r = window.dgm3d.renderer; for (const k of Object.keys(r.highEffects)) r.setHighEffect(k, true); r.setLookChoice(${JSON.stringify(look)}, false); })()`);
  await page.waitForFunction("window.dgm3d.renderer.highSettled", null, { timeout: 120_000 });
  await page.waitForTimeout(400);
}

async function setView(page: Page, v: View): Promise<void> {
  await page.evaluate(`window.dgm3d.renderer.setView(${JSON.stringify(v)})`);
  await page.evaluate("new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(null))))");
}

/** The frame at a view with the page's buttons hidden, as PNG bytes. */
async function shot(page: Page, v: View): Promise<Buffer> {
  await page.mouse.move(2, 2);
  await setView(page, v);
  await page.evaluate(`window.dgm3d.renderer.setClock(${CLOCK})`);
  const style = await page.addStyleTag({ content: "body * { visibility: hidden !important; } .view3d > canvas { visibility: visible !important; }" });
  await page.waitForTimeout(350);
  const png = await page.locator(".view3d > canvas").screenshot({ type: "png" });
  await style.evaluate((e) => e.remove());
  return png;
}

/** Paint Naturalize across the slope as the player would: the key, the size and strength keys, a drag. */
async function paint(page: Page, s: Spot, setting: Case["setting"]): Promise<{ size: number; strength: number }> {
  await page.evaluate(`(() => { let a = 0x9e3779b9; Math.random = () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; })()`);
  await setView(page, { mode: "top", yaw: 0, pitch: 0.5, distance: 60, target: [s.cx, s.h, -s.cy] });
  await page.keyboard.press("5");
  if (setting === "max") {
    for (let k = 0; k < 14; k++) await page.keyboard.press("}");
    for (let k = 0; k < 6; k++) await page.keyboard.press("]");
  }
  // a serpentine over the slope's window, rows a brush radius apart (a single click's worth at the maximum)
  const radius = setting === "max" ? 64 : 5;
  const pts: [number, number][] = [];
  if (setting === "max") pts.push([s.cx, s.cy], [s.cx + 1, s.cy]);
  else {
    let dir = 1;
    for (let y = s.y0 + 3; y <= s.y1 - 3; y += radius) {
      const xs: [number, number] = dir > 0 ? [s.x0 + 2, s.x1 - 2] : [s.x1 - 2, s.x0 + 2];
      pts.push([xs[0], y], [xs[1], y]);
      dir = -dir;
    }
  }
  const px = async (p: [number, number]) => (await page.evaluate(([a, b]) => window.dgmEditor!.tileToClient(a, b), p)) as { x: number; y: number };
  const first = await px(pts[0]);
  await page.mouse.move(first.x, first.y);
  await page.mouse.down();
  let at = first;
  for (const p of pts.slice(1)) {
    const to = await px(p);
    const n = Math.max(1, Math.ceil(Math.hypot(to.x - at.x, to.y - at.y) / 12));
    for (let k = 1; k <= n; k++) {
      await page.mouse.move(at.x + ((to.x - at.x) * k) / n, at.y + ((to.y - at.y) * k) / n);
      await page.waitForTimeout(12);
    }
    at = to;
  }
  await page.mouse.up();
  await page.mouse.move(2, 2);
  await page.evaluate("window.dgmEditor.idle()");
  await page.waitForTimeout(1500);
  const last = (await page.evaluate("window.dgmEditor.lastStroke()")) as { tool: string; size: number; strength: number } | null;
  if (!last || last.tool !== "naturalize") throw new Error(`the stroke was not a Naturalize stroke: ${JSON.stringify(last)}`);
  return { size: last.size, strength: last.strength };
}

/** Page side: cells (two columns, before and after) with a label band over each, as a JPEG. */
const SHEET_JS = `async ({ images, labels, scale, quality }) => {
  const imgs = await Promise.all(images.map(async (b64) => { const i = new Image(); i.src = "data:image/png;base64," + b64; await i.decode(); return i; }));
  const w = Math.round(imgs[0].width * scale), h = Math.round(imgs[0].height * scale);
  const gap = 6, band = 26, cols = 2;
  const rows = Math.ceil(imgs.length / cols);
  const c = document.createElement("canvas");
  c.width = cols * w + (cols - 1) * gap;
  c.height = rows * (h + band) + (rows - 1) * gap;
  const g = c.getContext("2d");
  g.fillStyle = "#1b1b1b";
  g.fillRect(0, 0, c.width, c.height);
  g.imageSmoothingQuality = "high";
  imgs.forEach((img, k) => {
    const x = (k % cols) * (w + gap), y = Math.floor(k / cols) * (h + band + gap);
    g.drawImage(img, x, y + band, w, h);
    g.fillStyle = "#f2f2f2";
    g.font = "15px system-ui, sans-serif";
    g.fillText(labels[k], x + 8, y + 18);
  });
  return c.toDataURL("image/jpeg", quality / 100).split(",")[1];
}`;

async function sheet(tool: Page, cells: { png: Buffer; label: string }[], file: string, most = 1_450_000): Promise<void> {
  let scale = 0.5;
  let q = 82;
  for (;;) {
    const b64 = (await tool.evaluate(`(${SHEET_JS})(${JSON.stringify({ images: cells.map((c) => c.png.toString("base64")), labels: cells.map((c) => c.label), scale, quality: q })})`)) as string;
    const buf = Buffer.from(b64, "base64");
    if (buf.length <= most || (q <= 55 && scale <= 0.4)) {
      writeFileSync(file, buf);
      console.log(`${file}: ${Math.round(buf.length / 1024)} KB (scale ${scale}, quality ${q})`);
      return;
    }
    if (q > 60) q -= 6;
    else scale -= 0.05;
  }
}

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  mkdirSync(SCRATCH, { recursive: true });
  const outDir = resolve(".scratch/capture-naturalize-site");
  if (!SKIP_BUILD) {
    console.log("building the site…");
    process.env.DGM_BASE = "/";
    await build({ base: "/", logLevel: "warn", build: { outDir, emptyOutDir: true } });
  }
  const server = await preview({ base: "/", build: { outDir }, preview: { port: PORT, strictPort: true }, logLevel: "warn" });
  const browser = await chromium.launch({ channel: "chrome", headless: true, args: GPU_ARGS });
  try {
    const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1, colorScheme: "light" });
    await context.addInitScript("try { localStorage.setItem('dgm.look', 'standard'); } catch {}");
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    const tool = await browser.newPage();
    await tool.goto(`http://localhost:${PORT}/`);

    if (EXPLORE) {
      let n = 0;
      for (const c of EXPLORE_CASES) {
        await open(page, c);
        const s = (await page.evaluate(`(${SPOT_JS})()`)) as Spot | null;
        if (!s) {
          console.log(`${c.theme} ${c.seed}: no terraced dry window`);
          continue;
        }
        console.log(`${n++} ${c.theme} ${c.seed}: levels ${s.levels}, edges ${s.edges}`);
        await setLook(page, "standard");
        const v = views(s);
        writeFileSync(join(SCRATCH, `explore-${c.theme}-${c.seed}.png`), await shot(page, v.oblique));
      }
      return;
    }

    const look = { standard: [] as { png: Buffer; label: string }[], high: [] as { png: Buffer; label: string }[] };
    const log: string[] = [];
    for (const [k, c] of CASES.entries()) {
      if (ONLY && !ONLY.includes(k)) continue;
      console.log(`${c.theme} ${c.seed} (${c.setting})`);
      await open(page, c);
      const gpu = (await page.evaluate("window.dgm3d.renderer.gpu().renderer")) as string;
      if (/SwiftShader|llvmpipe|Software|Basic Render/i.test(gpu)) throw new Error(`the browser draws in software (${gpu})`);
      const s = (await page.evaluate(`(${SPOT_JS})()`)) as Spot | null;
      if (!s) throw new Error(`${c.theme} ${c.seed}: no terraced dry window`);
      const v = views(s);
      // the max stroke covers the map: its top-down view is the whole map
      const frames: [string, View][] = [
        ["oblique", v.oblique],
        ["top-down", c.setting === "max" ? v.wide : v.top],
      ];
      const before: Record<string, Buffer> = {};
      for (const lk of ["standard", "high"] as const) {
        await setLook(page, lk);
        for (const [name, view] of frames) before[`${lk}-${name}`] = await shot(page, view);
      }
      const used = await paint(page, s, c.setting);
      log.push(`${c.theme} ${c.seed} ${c.setting}: Size ${used.size}, Strength ${used.strength}; slope window (${s.x0},${s.y0})-(${s.x1},${s.y1}), ${s.levels} levels`);
      for (const lk of ["standard", "high"] as const) {
        await setLook(page, lk);
        for (const [name, view] of frames) {
          const after = await shot(page, view);
          const tag = `${lk}-${name}`;
          writeFileSync(join(SCRATCH, `${c.theme}-${c.seed}-${c.setting}-${tag}-before.png`), before[tag]);
          writeFileSync(join(SCRATCH, `${c.theme}-${c.seed}-${c.setting}-${tag}-after.png`), after);
          const label = (when: string) => `${when}: seed ${c.seed}, ${c.theme}, ${lk === "high" ? "High" : "Standard"} look, Size ${used.size}, Strength ${used.strength}, ${name}`;
          look[lk].push({ png: before[tag], label: label("Before") }, { png: after, label: label("After") });
        }
      }
    }
    if (!ONLY) {
      await sheet(tool, look.standard, join(OUT, "standard.jpg"));
      await sheet(tool, look.high, join(OUT, "high.jpg"));
      for (const f of ["standard.jpg", "high.jpg"]) console.log(`${f}: ${statSync(join(OUT, f)).size} bytes`);
    } else {
      await sheet(tool, look.standard, join(SCRATCH, "partial-standard.jpg"));
      await sheet(tool, look.high, join(SCRATCH, "partial-high.jpg"));
    }
    for (const l of log) console.log(l);
    if (errors.length) console.log(`page errors: ${errors.join("; ")}`);
  } finally {
    await browser.close();
    await new Promise<void>((r) => server.httpServer.close(() => r()));
  }
}

await main();
