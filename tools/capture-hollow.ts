// Captures for the hollow under the cursor (docs/progress/3d-view.md, "The hollow under the cursor"; D488). Real
// Chrome, the site built from this checkout: an official cave map (Hollows, Pressure) with a brush over a roof, a
// force's ring and the Block tool's blocks over one, a tunnel dug with the Block tool into a generated map's hill, and a
// plain generated map with the same brush (nothing drawn). "Before" is the same frame with the marks hidden: the
// hollow's marks are the only thing this change draws. One small jpg sheet.
//
//   npx tsx tools/capture-hollow.ts [--maps <folder with the official .timber files>] [--out docs/sheets/hollow-under-pointer.jpg]
//                                  [--only hollows,pressure,tunnel,plain] [--looks standard,high] [--no-build]

import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium, type Page } from "@playwright/test";
import { build, preview } from "vite";
import { waitForEditor } from "./wait-editor";

const arg = (name: string): string | undefined => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const PORT = 4793;
const DIST = ".scratch/hollow-dist";
const SHOTS = ".scratch/hollow";
const OUT = arg("out") ?? "docs/sheets/hollow-under-pointer.jpg";
const ONLY = arg("only")?.split(",");
const LOOKS = (arg("looks") ?? "standard,high").split(",");
const MAP_DIRS = [arg("maps") ?? "", process.env.DGM_OFFICIAL_MAPS ?? "", ".scratch/official", resolve("../DamGoodMaps/.scratch/official")];
const MAP_DIR = MAP_DIRS.find((d) => d && existsSync(d));
const official = (name: string) => (MAP_DIR ? readdirSync(MAP_DIR).filter((f) => f.endsWith(".timber") && f.includes(name)).map((f) => join(MAP_DIR, f))[0] : undefined);

interface Shot {
  file: string;
  label: string;
}

/** Find a roof to put the cursor on: the roofed tile with the most roofed tiles within `r`, some of them thin. Runs in
 *  the page on the renderer's own masks. */
const FIND_ROOF = `(r) => {
  const m = window.dgm3d.renderer.map;
  const W = m.W, H = m.H, src = m.source;
  const roofed = new Int8Array(W * H).fill(-1);
  const surface = (k) => (k === 0 ? 0 : 32 - Math.clz32(k));
  for (const i of src.columns.keys()) {
    const k = src.masks ? src.masks[i] : 0;
    if (!k) continue;
    const top = surface(k);
    const air = ~k & ((1 << top) - 1);
    if (!air) continue;
    roofed[i] = Math.min(9, top - surface(air));
  }
  let best = null;
  for (let y = r; y < H - r; y += 2)
    for (let x = r; x < W - r; x += 2) {
      if (roofed[y * W + x] < 0) continue;
      let n = 0, thin = 0, plain = 0;
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy > r * r) continue;
        const t = roofed[(y + dy) * W + x + dx];
        if (t < 0) plain++;
        else { n++; if (t <= 2) thin++; }
      }
      // (a roof's edge in reach reads best: roofed, thin and plain ground together)
      if (plain < 10 || n < 12) continue;
      const score = n + 2 * Math.min(thin, n / 2);
      if (!best || score > best.score) best = { x, y, score, n, thin, top: m.heights[y * W + x] };
    }
  return best;
}`;

async function frame(page: Page, x: number, y: number, top: number, yaw: number, distance: number): Promise<void> {
  await page.evaluate(([x, y, top, yaw, distance]) => window.dgm3d!.renderer.setView({ mode: "orbit", yaw, pitch: 0.85, distance, target: [x + 0.5, top, -(y + 0.5)] }), [x, y, top, yaw, distance]);
  await page.waitForTimeout(300);
}

/** Hover the tile (x, y) and wait for the cursor to be laid. */
async function hover(page: Page, x: number, y: number): Promise<void> {
  const p = await page.evaluate(([x, y]) => window.dgmEditor!.tileToClient(x, y), [x, y]);
  await page.mouse.move(p.x - 3, p.y - 3);
  await page.mouse.move(p.x, p.y, { steps: 3 });
  await page.waitForTimeout(400);
}

/** The marks shown or hidden (the "before" frame is the same frame without them). */
async function marks(page: Page, on: boolean): Promise<void> {
  await page.evaluate((on) => {
    const r = window.dgm3d!.renderer as unknown as { hollow: { mesh: { visible: boolean } } | null; requestRender(): void; renderNow(): void; hollowStale: boolean };
    if (on) r.hollowStale = true;
    r.renderNow();
    if (!on && r.hollow) r.hollow.mesh.visible = false;
    r.requestRender();
  }, on);
  await page.waitForTimeout(250);
}

async function shoot(page: Page, name: string, label: string, shots: Shot[]): Promise<void> {
  const file = join(SHOTS, `${name}.png`);
  // (the middle of the view, where the cursor is: the sheet stays small)
  const v = page.viewportSize()!;
  await page.screenshot({ path: file, clip: { x: Math.round(v.width * 0.22), y: Math.round(v.height * 0.18), width: Math.round(v.width * 0.56), height: Math.round(v.height * 0.6) } });
  shots.push({ file, label });
}

/** Before and after of what the pointer is over now. */
async function pair(page: Page, name: string, label: string, shots: Shot[]): Promise<void> {
  await marks(page, false);
  await shoot(page, `${name}-before`, `${label}: before`, shots);
  await marks(page, true);
  const drawn = await page.evaluate(() => window.dgm3d!.renderer.hollowDrawn);
  await shoot(page, `${name}-after`, `${label}: after (${drawn.tiles} tiles)`, shots);
}

async function openImport(page: Page, path: string): Promise<void> {
  await page.goto("about:blank");
  await page.goto(`http://localhost:${PORT}/#s=1&z=96&d=n&t=riverValley`);
  await waitForEditor(page, 180_000);
  await page.getByLabel("Open a map or a project").setInputFiles(path);
  await page.waitForFunction(() => window.dgmEditor?.info().kind === "import" && !!window.dgm3d, null, { timeout: 180_000 });
  await page.waitForTimeout(2500);
}

async function openGenerated(page: Page, fragment: string): Promise<void> {
  await page.goto("about:blank");
  await page.goto(`http://localhost:${PORT}/#${fragment}`);
  await waitForEditor(page, 180_000);
  await page.waitForTimeout(2500);
}

/** Pick a tool by its key and set a brush's size. */
async function tool(page: Page, key: string, bigger = 0): Promise<void> {
  await page.mouse.move(5, 300);
  await page.keyboard.press(key);
  for (let k = 0; k < bigger; k++) await page.keyboard.press("BracketRight");
}

async function caveMap(page: Page, id: string, file: string, look: string, size: string, shots: Shot[]): Promise<void> {
  await openImport(page, file);
  const spot = (await page.evaluate(`(${FIND_ROOF})(5)`)) as { x: number; y: number; top: number; n: number; thin: number };
  console.log(`${id}: roof at (${spot.x}, ${spot.y}), top ${spot.top}, ${spot.n} roofed tiles in reach, ${spot.thin} thin`);
  await frame(page, spot.x, spot.y, spot.top, 0.6, 46);
  await tool(page, "2", 2);
  await hover(page, spot.x, spot.y);
  await pair(page, `${id}-${look}-${size}-brush`, `${id}, ${look}, ${size}, Raise brush over a roof`, shots);
  if (size === "1920" && look === "standard") {
    await tool(page, "Shift+Digit2");
    await hover(page, spot.x, spot.y);
    await pair(page, `${id}-${look}-${size}-force`, `${id}, ${look}, Craterize's ring over a roof`, shots);
    await tool(page, "7");
    await hover(page, spot.x, spot.y);
    await pair(page, `${id}-${look}-${size}-block`, `${id}, ${look}, Block over a roof`, shots);
  }
  await page.keyboard.press("Escape");
}

/** A tunnel dug with the Block tool into a generated map's hill: Remove clicked into a cliff's face, eight times, a
 *  2 × 2 footprint, each click into the face the last one opened. */
async function tunnel(page: Page, look: string, size: string, shots: Shot[]): Promise<void> {
  await openGenerated(page, "s=7&z=128&d=n&t=canyon");
  // a cliff facing east: a tile with ground at least 5 higher than its east neighbour, and high ground behind it
  const spot = await page.evaluate(() => {
    const m = (window.dgm3d!.renderer as unknown as { map: { W: number; H: number; heights: Uint8Array } }).map;
    let best: { x: number; y: number; top: number; base: number; score: number } | null = null;
    for (let y = 6; y < m.H - 6; y++)
      for (let x = 12; x < m.W - 2; x++) {
        const t = m.heights[y * m.W + x];
        const base = m.heights[y * m.W + x + 1];
        if (t - base < 5) continue;
        let low = 99;
        for (let dy = -3; dy <= 3; dy++) for (let dx = -9; dx <= 0; dx++) low = Math.min(low, m.heights[(y + dy) * m.W + x + dx]);
        if (low < base + 4) continue;
        const score = low - base;
        if (!best || score > best.score) best = { x, y, top: t, base, score };
      }
    return best;
  });
  if (!spot) throw new Error("no cliff to tunnel into");
  for (let k = 0; k < 8; k++) {
    await page.evaluate(([x, y, z]) => window.dgmEditor!.edit({ op: "blocks", params: { mode: "remove", side: "+x", at: [[x, y, z]], size: 2 } } as never, "Tunnel"), [spot.x - k, spot.y, spot.base]);
    await page.evaluate(() => window.dgmEditor!.idle());
  }
  const dug = await page.evaluate(() => (window.dgm3d!.renderer as unknown as { map: { source: { columns: Map<number, unknown> } } }).map.source.columns.size);
  console.log(`tunnel into the cliff at (${spot.x}, ${spot.y}), top ${spot.top}, floor ${spot.base}: ${dug} columns`);
  await page.waitForTimeout(2000);
  await frame(page, spot.x - 3, spot.y, spot.top, 0.6, 36);
  await tool(page, "3", 1);
  await hover(page, spot.x - 3, spot.y);
  await pair(page, `tunnel-${look}-${size}-brush`, `Canyon 128 seed 7, a tunnel dug with Block, ${look}, ${size}, Lower brush`, shots);
}

async function plainMap(page: Page, look: string, size: string, shots: Shot[]): Promise<void> {
  await openGenerated(page, "s=7&z=128&d=n&t=canyon");
  await frame(page, 64, 64, 8, 0.6, 46);
  await tool(page, "2", 2);
  await hover(page, 64, 64);
  const hollow = await page.evaluate(() => {
    const r = window.dgm3d!.renderer as unknown as { hollow: unknown; hollowDrawn: { tiles: number } };
    return { made: r.hollow !== null, tiles: r.hollowDrawn.tiles };
  });
  console.log(`plain map: marks made ${hollow.made}, tiles ${hollow.tiles}`);
  await shoot(page, `plain-${look}-${size}`, `Canyon 128 seed 7 (no caves), ${look}, ${size}: nothing drawn, marks never made (${hollow.made ? "MADE" : "none"})`, shots);
}

async function sheet(page: Page, shots: Shot[]): Promise<void> {
  const cells = shots
    .map((s) => `<figure><img src="file:///${resolve(s.file).replace(/\\/g, "/")}"><figcaption>${s.label}</figcaption></figure>`)
    .join("");
  const html = `<!doctype html><meta charset="utf-8"><style>
    body { margin: 0; padding: 12px; background: #1b1d22; color: #e8e6e1; font: 13px system-ui, sans-serif; width: 1776px; }
    h1 { font-size: 16px; margin: 0 0 10px; }
    .grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; }
    figure { margin: 0; } img { width: 100%; display: block; border-radius: 4px; }
    figcaption { padding: 4px 2px 0; color: #c9c6bf; }
  </style><h1>The hollow under the cursor (D488): before and after, real Chrome</h1><div class="grid">${cells}</div>`;
  const htmlFile = resolve(SHOTS, "sheet.html");
  writeFileSync(htmlFile, html);
  await page.setViewportSize({ width: 1800, height: 1000 });
  await page.goto(`file:///${htmlFile.replace(/\\/g, "/")}`);
  await page.waitForTimeout(500);
  await page.screenshot({ path: OUT, type: "jpeg", quality: 66, fullPage: true });
  console.log(`wrote ${OUT}`);
}

async function main() {
  mkdirSync(SHOTS, { recursive: true });
  process.env.DGM_BASE = "/";
  if (!process.argv.includes("--no-build")) {
    console.log("building the site…");
    await build({ configFile: "vite.config.ts", base: "/", logLevel: "warn", build: { outDir: DIST, emptyOutDir: true } });
  }
  const server = await preview({ configFile: "vite.config.ts", base: "/", build: { outDir: DIST }, preview: { port: PORT, strictPort: true }, logLevel: "warn" });
  const browser = await chromium.launch({ channel: "chrome", headless: false });
  const shots: Shot[] = [];
  const errors: string[] = [];
  try {
    const sizes: [string, { width: number; height: number }, "dark" | "light"][] = [
      ["1920", { width: 1920, height: 1080 }, "dark"],
      ["1280", { width: 1280, height: 800 }, "light"],
    ];
    for (const look of LOOKS)
      for (const [size, viewport, scheme] of sizes) {
        const context = await browser.newContext({ viewport, deviceScaleFactor: 1, colorScheme: scheme });
        await context.addInitScript(`try { localStorage.setItem('dgm.look', '${look}'); } catch {}`);
        await context.addInitScript("window.__name = (f) => f");
        const page = await context.newPage();
        page.on("pageerror", (e) => errors.push(String(e)));
        page.on("console", (m) => m.type() === "error" && errors.push(m.text().slice(0, 300)));
        for (const [id, name] of [["hollows", "Hollows"], ["pressure", "Pressure"]] as const) {
          if (ONLY && !ONLY.includes(id)) continue;
          const f = official(name);
          if (!f) console.log(`${name}: not found (pass --maps)`);
          else if (id === "hollows" || size === "1920") await caveMap(page, name, f, look, size, shots);
        }
        if (!ONLY || ONLY.includes("tunnel")) if (size === "1920") await tunnel(page, look, size, shots);
        if (!ONLY || ONLY.includes("plain")) if (size === "1920" && look === "standard") await plainMap(page, look, size, shots);
        await context.close();
      }
    const page = await browser.newPage();
    await sheet(page, shots);
    if (errors.length) console.log(`page errors: ${errors.join("; ")}`);
  } finally {
    await browser.close();
    await server.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
