// Captures for water sliced by the layer cut (docs/progress/3d-view.md, "Water sliced by the cut"; D207). Real Chrome:
// Canyon 128 seed 7 cut through its river, the official Lakes cut through its lakes, and Hollows cut through its
// underground river, each at the cut that slices the most of its water there, before (a site built from dev, `--before`)
// and after (this checkout), Standard, High and the light look (Chrome drawing in software), 1920×1080 dark and 1280×800
// light, the water held at one moment. And with no cut, the same frames from both builds compared pixel by pixel (the
// water held): a map with no cut must draw exactly as before. One small jpg sheet.
//
//   npx tsx tools/capture-cut-water.ts --build-only --dist .scratch/cut-water-dev   (with dev's src/render3d checked out)
//   npx tsx tools/capture-cut-water.ts --before .scratch/cut-water-dev [--maps <folder with the official .timber files>]
//                                      [--out docs/sheets/cut-water.jpg] [--no-build] [--only canyon,lakes,hollows]
//                                      [--looks standard,high,light]

import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium, type Browser, type Page } from "@playwright/test";
import { build, preview } from "vite";
import { waitForEditor } from "./wait-editor";

const arg = (name: string): string | undefined => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const DIST = arg("dist") ?? ".scratch/cut-water-dist";
const BEFORE = arg("before");
const SHOTS = ".scratch/cut-water";
const OUT = arg("out") ?? "docs/sheets/cut-water.jpg";
const ONLY = arg("only")?.split(",");
const LOOKS = (arg("looks") ?? "standard,high,light").split(",");
const PORT = { after: 4795, before: 4796 };
const MAP_DIRS = [arg("maps") ?? "", process.env.DGM_OFFICIAL_MAPS ?? "", ".scratch/official", resolve("../DamGoodMaps/.scratch/official")];
const MAP_DIR = MAP_DIRS.find((d) => d && existsSync(d));
const official = (name: string) => (MAP_DIR ? readdirSync(MAP_DIR).filter((f) => f.endsWith(".timber") && f.includes(name)).map((f) => join(MAP_DIR, f))[0] : undefined);

interface Shot {
  file: string;
  label: string;
}
interface Spot {
  cut: number;
  x: number;
  y: number;
  sliced: number;
}
interface Scene {
  id: string;
  label: string;
  open(page: Page, port: number): Promise<void>;
  /** Only the water under a roof (a cave's). */
  caves: boolean;
  /** The cut to take (null: the one slicing the most). */
  cut: number | null;
}

/** The cut that slices the most water columns (their floor below it, their surface over it: a cave's only, or clean
 *  water's only on the open sky, so a river rather than a badwater spring's pool), and the tile with the most of them
 *  round it. Runs in the page on the renderer's own water, per column. */
const FIND_CUT = `(caves, want) => {
  const m = window.dgm3d.renderer.map;
  const w = m.water, W = m.W, H = m.H;
  const tops = m.heights;
  const counts = new Map();
  for (let k = 0; k < w.count; k++) {
    const i = w.tile[k], f = w.floor[k], s = f + w.depth[k];
    if (caves ? !(f < tops[i] - 0.5) : w.contamination[k] > 0.5) continue;
    for (let c = Math.floor(f) + 1; c < s - 0.05; c++) counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  let cut = -1, most = 0;
  for (const [c, n] of counts) if (n > most || (n === most && c > cut)) { cut = c; most = n; }
  if (want !== null && counts.has(want)) cut = want;
  if (cut < 0) return null;
  const sliced = new Uint8Array(W * H);
  for (let k = 0; k < w.count; k++) {
    const i = w.tile[k], f = w.floor[k], s = f + w.depth[k];
    if (caves ? !(f < tops[i] - 0.5) : w.contamination[k] > 0.5) continue;
    if (f < cut && s > cut + 0.05) sliced[i] = 1;
  }
  let best = null;
  const r = 7;
  for (let y = r; y < H - r; y += 2)
    for (let x = r; x < W - r; x += 2) {
      let n = 0;
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) n += sliced[(y + dy) * W + x + dx];
      if (!best || n > best.sliced) best = { cut, x, y, sliced: n };
    }
  return best;
}`;

async function openGenerated(page: Page, port: number, fragment: string): Promise<void> {
  await page.goto("about:blank");
  await page.goto(`http://localhost:${port}/#${fragment}`);
  await waitForEditor(page, 300_000);
  await page.evaluate("window.dgmEditor.idle && window.dgmEditor.idle()");
  await page.waitForTimeout(3000);
}

async function openImport(page: Page, port: number, path: string): Promise<void> {
  await page.goto("about:blank");
  await page.goto(`http://localhost:${port}/#s=1&z=96&d=n&t=riverValley`);
  await waitForEditor(page, 300_000);
  await page.getByLabel("Open a map or a project").setInputFiles(path);
  await page.waitForFunction("window.dgmEditor?.info().kind === 'import' && !!window.dgm3d", null, { timeout: 300_000 });
  await page.waitForTimeout(4000);
}

/** The view at the spot, the cut set (null: none), the water held; a frame drawn. */
async function frame(page: Page, spot: Spot, cut: number | null, distance: number): Promise<void> {
  await page.mouse.move(4, 300);
  await page.evaluate(
    ([x, y, level, cut, distance]) => {
      const r = (window as unknown as { dgm3d: { renderer: { setSlice(c: number | null): void; setClock(t: number | null): void; setView(v: object): void } } }).dgm3d.renderer;
      r.setClock(12.5);
      r.setSlice(cut);
      r.setView({ mode: "orbit", yaw: 0.6, pitch: 0.85, distance, target: [x + 0.5, level, -(y + 0.5)] });
    },
    [spot.x, spot.y, spot.cut, cut, distance] as const,
  );
  await page.waitForTimeout(2500);
}

async function shoot(page: Page, name: string, label: string, shots: Shot[]): Promise<void> {
  const file = join(SHOTS, `${name}.png`);
  const v = page.viewportSize()!;
  await page.screenshot({ path: file, clip: { x: Math.round(v.width * 0.2), y: Math.round(v.height * 0.12), width: Math.round(v.width * 0.6), height: Math.round(v.height * 0.58) } });
  shots.push({ file, label });
}

/** The canvas's pixels now. */
async function pixels(page: Page): Promise<Buffer> {
  return page.locator("canvas").first().screenshot();
}

/** Pixels that differ between two screenshots of the same size (PNG bytes decoded in the page), and where (a PNG of
 *  them, white on black, as base64). */
async function differing(page: Page, a: Buffer, b: Buffer): Promise<{ n: number; mask: string }> {
  return page.evaluate(
    async ([a, b]) => {
      const load = async (b64: string) => {
        const img = new Image();
        img.src = `data:image/png;base64,${b64}`;
        await img.decode();
        const c = document.createElement("canvas");
        c.width = img.width;
        c.height = img.height;
        const g = c.getContext("2d")!;
        g.drawImage(img, 0, 0);
        return g.getImageData(0, 0, c.width, c.height).data;
      };
      const [pa, pb] = await Promise.all([load(a), load(b)]);
      if (pa.length !== pb.length) return { n: -1, mask: "" };
      let n = 0;
      const img = new Image();
      img.src = `data:image/png;base64,${a}`;
      await img.decode();
      const c = document.createElement("canvas");
      c.width = img.width;
      c.height = img.height;
      const g = c.getContext("2d")!;
      const out = g.createImageData(c.width, c.height);
      for (let i = 0; i < pa.length; i += 4) {
        const d = pa[i] !== pb[i] || pa[i + 1] !== pb[i + 1] || pa[i + 2] !== pb[i + 2];
        if (d) n++;
        out.data[i] = out.data[i + 1] = out.data[i + 2] = d ? 255 : 0;
        out.data[i + 3] = 255;
      }
      g.putImageData(out, 0, 0);
      return { n, mask: c.toDataURL("image/png").split(",")[1] };
    },
    [a.toString("base64"), b.toString("base64")] as const,
  );
}

async function sheet(browser: Browser, shots: Shot[]): Promise<void> {
  const cells = shots.map((s) => `<figure><img src="file:///${resolve(s.file).replace(/\\/g, "/")}"><figcaption>${s.label}</figcaption></figure>`).join("");
  const html = `<!doctype html><meta charset="utf-8"><style>
    body { margin: 0; padding: 12px; background: #1b1d22; color: #e8e6e1; font: 13px system-ui, sans-serif; width: 1776px; }
    h1 { font-size: 16px; margin: 0 0 10px; }
    .grid { display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 8px; }
    figure { margin: 0; } img { width: 100%; display: block; border-radius: 4px; }
    figcaption { padding: 3px 2px 0; color: #c9c6bf; font-size: 12px; }
  </style><h1>Water sliced by the layer cut (D207): dev (before) and this branch (after), real Chrome, the water held</h1><div class="grid">${cells}</div>`;
  const htmlFile = resolve(SHOTS, "sheet.html");
  writeFileSync(htmlFile, html);
  const page = await browser.newPage({ viewport: { width: 1800, height: 1000 } });
  await page.goto(`file:///${htmlFile.replace(/\\/g, "/")}`);
  await page.waitForTimeout(800);
  await page.screenshot({ path: OUT, type: "jpeg", quality: 58, fullPage: true });
  console.log(`wrote ${OUT}`);
}

async function main() {
  mkdirSync(SHOTS, { recursive: true });
  process.env.DGM_BASE = "/";
  if (!process.argv.includes("--no-build")) {
    console.log(`building the site into ${DIST}…`);
    await build({ configFile: "vite.config.ts", base: "/", logLevel: "warn", build: { outDir: DIST, emptyOutDir: true } });
  }
  if (process.argv.includes("--build-only")) return;
  const servers = [await preview({ configFile: "vite.config.ts", base: "/", build: { outDir: DIST }, preview: { port: PORT.after, strictPort: true }, logLevel: "warn" })];
  if (BEFORE) servers.push(await preview({ configFile: "vite.config.ts", base: "/", build: { outDir: BEFORE }, preview: { port: PORT.before, strictPort: true }, logLevel: "warn" }));
  const gpu = await chromium.launch({ channel: "chrome", headless: false });
  // (the light look: Chrome drawing in software, as a player's browser without a GPU does)
  const soft = await chromium.launch({ channel: "chrome", headless: false, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  const scenes: Scene[] = [
    // (its river is mostly under a level deep, so a whole-level cut slices it only where it pools deeper: at 9)
    { id: "canyon", label: "Canyon 128 seed 7, its river", caves: false, cut: 9, open: (p, port) => openGenerated(p, port, "s=7&z=128&d=n&t=canyon") },
  ];
  const lakes = official("Lakes");
  scenes.push(
    lakes
      ? { id: "lakes", label: "Lakes (official), its lakes", caves: false, cut: null, open: (p, port) => openImport(p, port, lakes) }
      : { id: "lakes", label: "Lake Basin 128 seed 5, its lakes", caves: false, cut: null, open: (p, port) => openGenerated(p, port, "s=5&z=128&d=n&t=lakeBasin") },
  );
  const hollows = official("Hollows");
  // (its river is under a level deep, drawn whole or gone at any whole-level cut; the cave water a cut slices is a shaft by
  // the river, at 2, and a cave pool in the south, at 10)
  if (hollows)
    scenes.push(
      { id: "hollows", label: "Hollows (official), a shaft by its underground river", caves: true, cut: 2, open: (p, port) => openImport(p, port, hollows) },
      { id: "hollows10", label: "Hollows (official), a cave pool", caves: true, cut: 10, open: (p, port) => openImport(p, port, hollows) },
    );
  else console.log("Hollows: not found (pass --maps)");
  const shots: Shot[] = [];
  const errors: string[] = [];
  const identity: string[] = [];
  try {
    const sizes: [string, { width: number; height: number }, "dark" | "light"][] = [
      ["1920", { width: 1920, height: 1080 }, "dark"],
      ["1280", { width: 1280, height: 800 }, "light"],
    ];
    const spots = new Map<string, Spot>();
    for (const look of LOOKS)
      for (const [size, viewport, scheme] of sizes) {
        const browser = look === "light" ? soft : gpu;
        const context = await browser.newContext({ viewport, deviceScaleFactor: 1, colorScheme: scheme });
        await context.addInitScript(`try { localStorage.setItem('dgm.look', '${look === "high" ? "high" : "standard"}'); } catch {}`);
        await context.addInitScript("window.__name = (f) => f");
        // (the first-run notes are not in the frames)
        await context.addInitScript("try { localStorage.setItem('dgm.firstRun', 'done'); } catch {}");
        const page = await context.newPage();
        page.on("pageerror", (e) => errors.push(String(e)));
        page.on("console", (m) => m.type() === "error" && errors.push(m.text().slice(0, 300)));
        for (const scene of scenes) {
          if (ONLY && !ONLY.includes(scene.id)) continue;
          // (the second Hollows scene at 1920 only: the sheet stays small)
          if (scene.id === "hollows10" && size !== "1920") continue;
          const distance = scene.id.startsWith("hollows") ? 24 : scene.id === "canyon" ? 36 : 48;
          for (const variant of BEFORE ? (["before", "after", "again"] as const) : (["after"] as const)) {
            // ("again": this branch opened a second time, its frame with no cut only: the frames' own noise)
            if (variant === "again" && size !== "1920") continue;
            await scene.open(page, PORT[variant === "again" ? "after" : variant]);
            const drawn = await page.evaluate("window.dgm3d.renderer.look");
            let spot = spots.get(scene.id);
            if (!spot) {
              spot = (await page.evaluate(`(${FIND_CUT})(${scene.caves}, ${scene.cut})`)) as Spot;
              if (!spot) throw new Error(`${scene.id}: no water to slice`);
              console.log(`${scene.id}: cut ${spot.cut} at (${spot.x}, ${spot.y}), ${spot.sliced} columns sliced round it`);
              spots.set(scene.id, spot);
            }
            // (no cut: this build's frame, for the comparison of the two builds)
            if (size === "1920") {
              await frame(page, spot, null, distance);
              const px = await pixels(page);
              (identityFrames[`${scene.id}-${look}`] ??= {})[variant] = px;
            }
            if (variant === "again") continue;
            await frame(page, spot, spot.cut, distance);
            await shoot(page, `${scene.id}-${look}-${size}-${variant}`, `${scene.label}, cut at ${spot.cut}: ${variant}, ${look} (${drawn}), ${size} ${scheme}`, shots);
          }
        }
        if (size === "1920")
          for (const scene of scenes) {
            const f = identityFrames[`${scene.id}-${look}`];
            if (f?.before && f.after) {
              const d = await differing(page, f.before, f.after);
              writeFileSync(join(SHOTS, `nocut-${scene.id}-${look}-diff.png`), Buffer.from(d.mask, "base64"));
              writeFileSync(join(SHOTS, `nocut-${scene.id}-${look}-before.png`), f.before);
              const again = f.again ? (await differing(page, f.after, f.again)).n : null;
              identity.push(`${scene.id}, ${look}, no cut: ${d.n} pixels differ between dev and this branch${again === null ? "" : `; ${again} between two loads of this branch`}`);
            }
          }
        await context.close();
      }
    await sheet(gpu, shots);
    console.log(identity.join("\n"));
    if (errors.length) console.log(`page errors: ${errors.join("; ")}`);
  } finally {
    await gpu.close();
    await soft.close();
    for (const s of servers) await s.close();
  }
}

const identityFrames: Record<string, { before?: Buffer; after?: Buffer; again?: Buffer }> = {};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
