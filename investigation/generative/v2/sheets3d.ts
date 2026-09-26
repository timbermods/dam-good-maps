// Contact sheets for Kyler's review of design version 2: one image per theme, seeds 1–30 of the
// default set at 128² and a row of the same theme at Verticality 85 (heights within 16), each map
// drawn from straight above in the app's own 3D view in the clean look (the view's Top mode, an
// orthographic camera: moist grass, cracked earth, water by depth, contaminated ground), at a whole
// number of pixels a tile (2 at 128², 256 px a map), never scaled, and labelled with its theme and
// seed. Written as WebP under docs/sheets/design-v2/<theme>.webp. Our own maps only (D144).
//
// The site is built and served locally for the run only, and the installed Chrome draws it headed,
// so WebGL runs on the GPU (as render.ts and tools/places-thumbs.ts on feature/real-places-2 do).
// Each map is opened through the editor's file input from the batch's .timber, as a player would.
//
//   npx tsx investigation/generative/v2/sheets3d.ts [--seeds 1-30] [--high 1-6] [--themes a,b] [--px 256]

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium, type Page } from "@playwright/test";
import { build, preview } from "vite";
import { THEME_NAMES, THEMES, type ThemeId } from "../../../src/core/spec/mapspec";
import { arg, MAPS, parseSeeds } from "../lib/paths";

const PORT = 4193;
const DIST = ".scratch/sheets3d-dist";
const OUT = join("docs", "sheets", "design-v2");
const seeds = parseSeeds(arg("seeds", "1-30"));
const high = parseSeeds(arg("high", "1-6"));
const themes = arg("themes", THEMES.join(",")).split(",") as ThemeId[];
const PX = Number(arg("px", "256"));
const COLS = 6;
const QUALITY = Number(arg("quality", "0.86"));

/** The Top mode's half height per unit of distance (src/render3d/renderer.ts, placeCamera). */
const TOP_HALF = 0.42;

async function canvasAt(page: Page, px: number): Promise<void> {
  await page.addStyleTag({
    content: `.editor-view { position: fixed !important; left: 0 !important; top: 0 !important; width: ${px}px !important; height: ${px}px !important; z-index: 2147483647 !important; margin: 0 !important; border: 0 !important; border-radius: 0 !important; }
      .editor-view > :not(canvas) { visibility: hidden !important; }
      .editor-view canvas { width: ${px}px !important; height: ${px}px !important; }`,
  });
  await page.waitForFunction((n) => document.querySelector<HTMLCanvasElement>(".editor-view canvas")?.width === n, px);
}

/** One map from above, as a PNG of whole pixels a tile. */
async function topOf(page: Page, base: string, path: string): Promise<{ png: Buffer; side: number } | null> {
  if (!existsSync(path)) return null;
  await page.goto("about:blank");
  await page.goto(`${base}/#s=1&z=96&d=n&t=riverValley`);
  await page.getByText(/checks passed|checks failed/).first().waitFor({ timeout: 180_000 });
  await page.getByLabel("Open a map or a project file in the editor").setInputFiles(path);
  await page.waitForFunction(() => !!(window as unknown as { dgmEditor?: unknown }).dgmEditor && !!(window as unknown as { dgm3d?: unknown }).dgm3d, null, { timeout: 180_000 });
  await page.evaluate(() => (window as unknown as { dgmEditor: { idle(): Promise<void> } }).dgmEditor.idle());
  // the background check may replace the water once
  await page.waitForTimeout(2500);
  await page.evaluate(() => (window as unknown as { dgmEditor: { idle(): Promise<void> } }).dgmEditor.idle());
  const gpu = (await page.evaluate(() => (window as unknown as { dgm3d: { renderer: { gpu(): { renderer: string } } } }).dgm3d.renderer.gpu().renderer)) as string;
  if (/SwiftShader|llvmpipe|Software|Basic Render/i.test(gpu)) throw new Error(`Chrome draws in software (${gpu}): the sheets need the GPU`);
  const map = (await page.evaluate(() => {
    const m = (window as unknown as { dgm3d: { renderer: { map: { W: number; H: number; heights: ArrayLike<number> } } } }).dgm3d.renderer.map;
    let s = 0;
    for (let i = 0; i < m.heights.length; i++) s += m.heights[i];
    return { W: m.W, H: m.H, level: s / m.heights.length };
  })) as { W: number; H: number; level: number };
  const side = Math.max(1, Math.round(PX / Math.max(map.W, map.H))) * Math.max(map.W, map.H);
  await page.mouse.move(side + 30, side + 30);
  await canvasAt(page, side);
  const pose = { mode: "top", yaw: 0, pitch: 1, distance: Math.max(map.W, map.H) / 2 / TOP_HALF, target: [map.W / 2, map.level, -map.H / 2] };
  await page.evaluate((v) => {
    const r = (window as unknown as { dgm3d: { renderer: { setView(v: unknown): void; setClock?(t: number | null): void } } }).dgm3d.renderer;
    r.setClock?.(12.5);
    r.setView(v);
  }, pose);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 200)))));
  return { png: await page.locator(".editor-view canvas").screenshot({ type: "png" }), side };
}

interface Cell {
  png: string | null;
  label: string;
}

/** The sheet: a title, the default rows, a band and the high row; each map labelled below it. */
async function compose(tool: Page, title: string, rows: { band?: string; cells: Cell[] }[], side: number): Promise<Buffer> {
  const b64 = (await tool.evaluate(
    async ([t, rs, s, cols, q]) => {
      const GAP = 8;
      const LABEL = 20;
      const HEAD = 44;
      const BAND = 28;
      const W = cols * s + (cols + 1) * GAP;
      let H = HEAD;
      for (const r of rs) H += (r.band ? BAND : 0) + Math.ceil(r.cells.length / cols) * (s + LABEL + GAP);
      H += GAP;
      const c = document.createElement("canvas");
      c.width = W;
      c.height = H;
      const g = c.getContext("2d")!;
      g.fillStyle = "#f4f1ea";
      g.fillRect(0, 0, W, H);
      g.fillStyle = "#2b2620";
      g.font = "600 22px system-ui, sans-serif";
      g.textBaseline = "middle";
      g.fillText(t, GAP, HEAD / 2);
      g.imageSmoothingEnabled = false;
      let y = HEAD;
      for (const r of rs) {
        if (r.band) {
          g.fillStyle = "#6b6358";
          g.font = "600 15px system-ui, sans-serif";
          g.fillText(r.band, GAP, y + BAND / 2);
          y += BAND;
        }
        for (let k = 0; k < r.cells.length; k++) {
          const cell = r.cells[k];
          const x = GAP + (k % cols) * (s + GAP);
          const yy = y + Math.floor(k / cols) * (s + LABEL + GAP);
          if (cell.png) {
            const img = new Image();
            img.src = `data:image/png;base64,${cell.png}`;
            await img.decode();
            g.drawImage(img, x, yy, s, s);
          } else {
            g.fillStyle = "#ddd6c8";
            g.fillRect(x, yy, s, s);
          }
          g.fillStyle = "#2b2620";
          g.font = "13px system-ui, sans-serif";
          g.fillText(cell.label, x + 2, yy + s + LABEL / 2);
        }
        y += Math.ceil(r.cells.length / cols) * (s + LABEL + GAP);
      }
      return c.toDataURL("image/webp", q).split(",")[1];
    },
    [title, rows, side, COLS, QUALITY] as [string, typeof rows, number, number, number],
  )) as string;
  return Buffer.from(b64, "base64");
}

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  process.env.DGM_BASE = "/";
  console.log("building the site…");
  await build({ configFile: "vite.config.ts", base: "/", logLevel: "warn", build: { outDir: DIST, emptyOutDir: true } });
  const server = await preview({ configFile: "vite.config.ts", base: "/", build: { outDir: DIST }, preview: { port: PORT, strictPort: true }, logLevel: "warn" });
  const browser = await chromium.launch({ channel: "chrome", headless: false });
  const base = `http://localhost:${PORT}`;
  try {
    const page = await browser.newPage({ viewport: { width: PX + 200, height: PX + 200 }, deviceScaleFactor: 1, colorScheme: "light" });
    const tool = await browser.newPage();
    await tool.goto(`${base}/`);
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    for (const theme of themes) {
      const t0 = performance.now();
      let side = PX;
      const cellsOf = async (set: string, list: number[], tag: string) => {
        const out: Cell[] = [];
        for (const seed of list) {
          const r = await topOf(page, base, resolve(join(MAPS, set, `${theme}-${seed}.timber`)));
          if (r) side = r.side;
          out.push({ png: r ? r.png.toString("base64") : null, label: `${THEME_NAMES[theme]} ${seed}${tag}` });
        }
        return out;
      };
      const rows = [
        { cells: await cellsOf("v2-128", seeds, "") },
        { band: "Verticality 85 (heights within 16)", cells: await cellsOf("v2-128-vt85", high, ", Verticality 85") },
      ];
      const img = await compose(tool, `${THEME_NAMES[theme]}: design version 2, seeds ${seeds[0]}–${seeds[seeds.length - 1]} at 128², from above`, rows, side);
      const file = join(OUT, `${theme}.webp`);
      writeFileSync(file, img);
      console.log(`${file}: ${(img.length / 1024 / 1024).toFixed(2)} MB, ${((performance.now() - t0) / 1000).toFixed(0)} s`);
    }
    if (errors.length) console.log(`page errors: ${errors.join("; ")}`);
  } finally {
    await browser.close();
    await server.close();
  }
}

void main();
