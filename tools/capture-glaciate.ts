// Glaciate's floor for Kyler's sitting (PLAN §20 D246, D292): each of the investigation's cases that
// the editor can make (Canyon 10 at 128², click 22,22; Kyler's cross-valley Aim there, 24,80 to
// 96,36; Highlands 7 at 256², click 150,20), made in the editor as a player makes it, from the same
// camera: the land before, and the glacier with the floor's water finished (the river led to its falls
// and inflows) and round 4's details pinned (D309). Each case is one picture: an oblique view above and
// a top-down view below, the two side by side. Small files under
// docs/progress/glaciate/ (D195: a few MB at most), and a GIF of the two acts from a still camera.
//
//   npx tsx tools/capture-glaciate.ts [--out docs/progress/glaciate] [--port 4291] [--only canyon]
//
// With --power-size (D368 (3): Power is how deep, Size how wide), the Highlands case alone, on the site
// as it is: Power 0, 50 and 100 at Size 24, and Size 12 and 40 at Power 60, each beside the land
// before (glaciate-power.png and glaciate-size.png, oblique above, top-down below).
//
//   npx tsx tools/capture-glaciate.ts --power-size --out docs/progress/forces --port 4227
//
// With --trough (showcase craft's gaps 14 and 26: one U-shaped trough at a size that fits the valley), the
// same glaciers at Size Auto on dev's forces and on this checkout's: Glacier Hollow (Highlands 1280967093,
// its drawn path), a Canyon floor (Canyon 10) and a 256² Highlands (7, a click at its high ground), each the land before, dev's glacier
// and this one, oblique above and top-down below; one JPEG sheet (`--sheet`, under docs/sheets/). Dev's site
// is this checkout built with origin/dev's forces Wasm in place of its own (nothing else differs).
//
//   npx tsx tools/capture-glaciate.ts --trough --sheet docs/sheets/glaciate-trough.jpg --port 4293
//
// The site is built from this checkout as the preview builds it (the forces show).
// The installed Chrome draws on the GPU; the water is let settle (Skip) before each picture.

import { execFileSync } from "node:child_process";
import { mkdirSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium, type Page } from "@playwright/test";
import { build, preview } from "vite";
import { readPng, writeGif, type Rgba } from "./gif";
import { encodePng } from "./png";
import encodeJpeg from "../src/core/format/vendor/jpeg-encoder.js";
import { waitForEditor } from "./wait-editor";

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const OUT = arg("out") ?? "docs/progress/glaciate";
const PORT = Number(arg("port") ?? 4291);
const ONLY = arg("only");
const POWER_SIZE = process.argv.includes("--power-size");
const TROUGH = process.argv.includes("--trough");
const SHEET = arg("sheet") ?? "docs/sheets/glaciate-trough.jpg";
/** Also write each glacier's land and settled water as the view has them (JSON), for a close look. */
const DUMP = arg("dump");
const VIEWPORT = { width: 1280, height: 820 };
/** The land's part of the screen (below the bars, above the tools, clear of the shelf), halved. */
const CLIP = { x: 190, y: 160, w: 880, h: 450 };

interface Case {
  id: string;
  fragment: string;
  from: [number, number];
  to?: [number, number];
  /** A drawn path's tiles between `from` and `to`, dragged through in order. */
  via?: [number, number][];
  /** Its details pinned in the row (D309), else Auto's. */
  pins?: Record<string, unknown>;
  /** Where the cameras look (tile), the oblique's distance and turn, the top-down's reach. */
  look: [number, number];
  distance: number;
  yaw: number;
  top: number;
}

const CASES: Case[] = [
  { id: "canyon", fragment: "#s=10&z=128&d=n&t=canyon", from: [22, 22], look: [46, 44], distance: 95, yaw: -0.6, top: 110 },
  { id: "kyler-aim", fragment: "#s=10&z=128&d=n&t=canyon", from: [24, 80], to: [96, 36], look: [60, 58], distance: 105, yaw: -0.4, top: 120 },
  { id: "highlands", fragment: "#s=7&z=256&d=n&t=highlands", from: [150, 20], look: [150, 62], distance: 130, yaw: 0.3, top: 150 },
];

/** Glacier Hollow's line (showcase craft, round 1: drawn down the high block's valley), its details as pinned there. */
const HOLLOW: [number, number][] = [[26, 104], [26, 102], [27, 100], [27, 98], [27, 96], [28, 94], [28, 92], [29, 90], [29, 88], [29, 86], [30, 84], [30, 82], [30, 81], [31, 79], [31, 77], [32, 75], [32, 73], [33, 71], [34, 69], [35, 68], [36, 66], [38, 65], [39, 63], [41, 62], [42, 61], [44, 60], [46, 58]];
/** A canyon's floor, drawn down its river (below the overhang at 78,19, which a force leaves as it is). */
const CANYON: [number, number][] = [[75, 25], [72, 29], [70, 31], [66, 37], [63, 44], [61, 51], [60, 58], [61, 65], [62, 72]];
const TROUGH_CASES: Case[] = [
  { id: "glacier-hollow", fragment: "#s=1280967093&z=128&d=n&t=highlands", from: HOLLOW[0], to: HOLLOW.at(-1), via: HOLLOW.slice(1, -1), pins: { benches: "some", steps: "some", tarn: false, scree: true }, look: [38, 80], distance: 92, yaw: 0.5, top: 105 },
  { id: "canyon-floor", fragment: "#s=10&z=128&d=n&t=canyon", from: CANYON[0], to: CANYON.at(-1), via: CANYON.slice(1, -1), look: [66, 42], distance: 100, yaw: -0.5, top: 110 },
  { id: "highlands-256", fragment: "#s=7&z=256&d=n&t=highlands", from: [152, 64], look: [148, 52], distance: 120, yaw: 0.3, top: 140 },
];

async function open(page: Page, base: string, fragment: string, pins: Record<string, unknown> = { benches: "some", steps: "some", tarn: true, scree: true }): Promise<void> {
  await page.goto("about:blank");
  // both builds with round 4's details pinned (D309: benches, steps, tarn and scree), so the pictures
  // compare the floor's water alone; Auto may draw others on the preview
  await page.goto(`${base}`);
  await page.evaluate((g) => localStorage.setItem("dgm.forces", JSON.stringify({ glaciate: g })), pins);
  await page.goto("about:blank");
  await page.goto(`${base}${fragment}`);
  await waitForEditor(page, 400_000);
  await page.getByRole("button", { name: "No more hints" }).click({ timeout: 3000 }).catch(() => undefined);
  // (the page plays the water at Normal: the tests' pace, at once)
  await page.evaluate("window.dgmEditor.waterSpeed('instant')");
  await page.evaluate("window.dgmEditor.idle()");
  const gpu = (await page.evaluate("window.dgm3d.renderer.gpu().renderer")) as string;
  if (/SwiftShader|llvmpipe|Software|Basic Render/i.test(gpu)) throw new Error(`the browser draws in software (${gpu}): the captures need the GPU`);
}

async function settle(page: Page): Promise<void> {
  await page.evaluate("window.dgmEditor.idle()");
  for (let k = 0; k < 240 && !(await page.evaluate("window.dgmEditor.waterSettled()")); k++) await page.waitForTimeout(500);
  await page.evaluate("window.dgmEditor.idle()");
  await page.waitForTimeout(600);
}

async function view(page: Page, c: Case, top: boolean): Promise<void> {
  await page.evaluate(
    ([x, y, d, yaw, t]) => {
      const r = window.dgm3d!.renderer;
      const m = r.mapState()!;
      const h = m.heights[Math.round(y) * m.W + Math.round(x)];
      r.setView(t ? { mode: "top", yaw: 0, pitch: Math.PI / 2, distance: d, target: [x + 0.5, h, -(y + 0.5)] } : { mode: "orbit", yaw, pitch: (46 * Math.PI) / 180, distance: d, target: [x + 0.5, h, -(y + 0.5)] });
      r.setClock(12.5);
    },
    [c.look[0], c.look[1], top ? c.top : c.distance, c.yaw, top ? 1 : 0] as [number, number, number, number, number],
  );
  await page.mouse.move(5, 400);
  await page.waitForTimeout(500);
}

/** Top-down over the gesture's points, so every one is on the screen to drag through. */
async function framed(page: Page, c: Case): Promise<void> {
  const pts = [c.from, ...(c.via ?? []), ...(c.to ? [c.to] : [])];
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const x = (Math.min(...xs) + Math.max(...xs)) / 2;
  const y = (Math.min(...ys) + Math.max(...ys)) / 2;
  const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  await page.evaluate(
    ([x, y, d]) => {
      const r = window.dgm3d!.renderer;
      const m = r.mapState()!;
      r.setView({ mode: "top", yaw: 0, pitch: Math.PI / 2, distance: d, target: [x + 0.5, m.heights[Math.round(y) * m.W + Math.round(x)], -(y + 0.5)] });
    },
    [x, y, span * 2.4 + 40],
  );
  await page.waitForTimeout(500);
}

async function shot(page: Page): Promise<Rgba> {
  // (the page's passing notes are not the land)
  await page.addStyleTag({ content: ".floating, .editor-message { display: none !important; }" });
  return readPng(new Uint8Array(await page.screenshot({ clip: { x: CLIP.x, y: CLIP.y, width: CLIP.w, height: CLIP.h }, scale: "css" })));
}

const half = (f: Rgba): Rgba => {
  const w = f.width >> 1;
  const h = f.height >> 1;
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      for (let c = 0; c < 4; c++) data[(y * w + x) * 4 + c] = (f.data[(2 * y * f.width + 2 * x) * 4 + c] + f.data[(2 * y * f.width + 2 * x + 1) * 4 + c] + f.data[((2 * y + 1) * f.width + 2 * x) * 4 + c] + f.data[((2 * y + 1) * f.width + 2 * x + 1) * 4 + c]) >> 2;
  return { width: w, height: h, data };
};

/** Pictures in a grid (rows of columns), 4 px apart. */
function grid(rows: Rgba[][]): { rgb: Uint8Array; width: number; height: number } {
  const cw = rows[0][0].width;
  const ch = rows[0][0].height;
  const cols = Math.max(...rows.map((r) => r.length));
  const width = cols * cw + (cols + 1) * 4;
  const height = rows.length * ch + (rows.length + 1) * 4;
  const rgb = new Uint8Array(width * height * 3).fill(246);
  rows.forEach((row, ry) =>
    row.forEach((f, rx) => {
      const ox = 4 + rx * (cw + 4);
      const oy = 4 + ry * (ch + 4);
      for (let y = 0; y < Math.min(ch, f.height); y++) for (let x = 0; x < Math.min(cw, f.width); x++) rgb.set(f.data.subarray((y * f.width + x) * 4, (y * f.width + x) * 4 + 3), ((oy + y) * width + ox + x) * 3);
    }),
  );
  return { rgb, width, height };
}

/** The glacier, as a player makes it: Glaciate picked (-), a click, or a drag with its arrow. */
async function glaciate(page: Page, c: Case): Promise<void> {
  await page.keyboard.press("Shift+Digit7");
  await page.getByRole("group", { name: "Glaciate options" }).waitFor();
  const a = await page.evaluate(([x, y]) => window.dgmEditor!.tileToClient(x, y), c.from);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  let at = a;
  for (const t of c.to ? [...(c.via ?? []), c.to] : []) {
    const b = await page.evaluate(([x, y]) => window.dgmEditor!.tileToClient(x, y), t);
    const steps = c.via ? 4 : 16;
    for (let k = 1; k <= steps; k++) {
      await page.mouse.move(at.x + ((b.x - at.x) * k) / steps, at.y + ((b.y - at.y) * k) / steps);
      await page.waitForTimeout(20);
    }
    at = b;
  }
  await page.mouse.up();
  await page.waitForFunction("!!window.dgmEditor.force()", null, { timeout: 20_000 });
  await page.waitForFunction("!window.dgmEditor.force()", null, { timeout: 120_000 });
  await page.keyboard.press("Shift+Digit7");
}

/** Glaciate's row set to `power` and `size` (D368 (3)). */
async function settings(page: Page, power: number, size: number): Promise<void> {
  await page.keyboard.press("Shift+Digit7");
  const row = page.getByRole("group", { name: "Glaciate options" });
  await row.getByRole("slider", { name: "Power" }).fill(String(power));
  await row.getByRole("slider", { name: "Size" }).fill(String(size));
  await page.keyboard.press("Shift+Digit7");
}

/** Power alone and Size alone, on the Highlands case (D368 (3)). */
async function powerSize(): Promise<void> {
  const c = CASES.find((k) => k.id === "highlands")!;
  const outDir = resolve(".scratch/capture-glaciate-site");
  process.env.DGM_BASE = "/";
  console.log("building the site…");
  await build({ mode: "e2e", base: "/", logLevel: "warn", build: { outDir, emptyOutDir: true } });
  const server = await preview({ base: "/", build: { outDir }, preview: { port: PORT, strictPort: true }, logLevel: "warn" });
  const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--enable-gpu", "--use-angle=d3d11", "--ignore-gpu-blocklist"] });
  try {
    const page = await browser.newPage({ viewport: VIEWPORT });
    await open(page, `http://localhost:${PORT}/`, c.fragment);
    await settle(page);
    const pictures = async () => {
      await view(page, c, false);
      const oblique = half(await shot(page));
      await view(page, c, true);
      return { oblique, top: half(await shot(page)) };
    };
    const before = await pictures();
    const one = async (power: number, size: number) => {
      await settings(page, power, size);
      await glaciate(page, c);
      await settle(page);
      const p = await pictures();
      await page.keyboard.press("Control+z");
      await settle(page);
      console.log(`Power ${power}, Size ${size}`);
      return p;
    };
    for (const [name, runs] of [
      ["glaciate-power", [[0, 24], [50, 24], [100, 24]]],
      ["glaciate-size", [[60, 12], [60, 40]]],
    ] as const) {
      const shots = [];
      for (const [power, size] of runs) shots.push(await one(power, size));
      const g = grid([[before.oblique, ...shots.map((q) => q.oblique)], [before.top, ...shots.map((q) => q.top)]]);
      const file = join(OUT, `${name}.png`);
      writeFileSync(file, encodePng(g.rgb, g.width, g.height));
      console.log(`${file}: ${(statSync(file).size / 1024).toFixed(0)} KB (before · ${runs.map(([p, s]) => `Power ${p} Size ${s}`).join(" · ")}; oblique above, top-down below)`);
    }
  } finally {
    await browser.close();
    await new Promise<void>((r) => server.httpServer.close(() => r()));
  }
}

/** The trough before and after (--trough): each case's land, dev's glacier and this checkout's at Size Auto,
 *  oblique above and top-down below, the cases one under another, as one JPEG. */
async function trough(): Promise<void> {
  // dev's site: this checkout with origin/dev's forces Wasm in place of its own
  const dir = resolve(".scratch/capture-trough");
  const devWasm = join(dir, "forcesWasm.dev.ts");
  mkdirSync(dir, { recursive: true });
  writeFileSync(devWasm, execFileSync("git", ["show", "origin/dev:src/core/forces/rust/forcesWasm.ts"], { maxBuffer: 1 << 28 }));
  const sites = [
    { name: "dev", outDir: join(dir, "dev"), port: PORT + 1, alias: [{ find: /^\.\/forcesWasm$/, replacement: devWasm }] },
    { name: "fix", outDir: join(dir, "fix"), port: PORT, alias: [] },
  ];
  process.env.DGM_BASE = "/";
  const servers = [];
  for (const s of sites) {
    console.log(`building the site (${s.name})…`);
    await build({ mode: "e2e", base: "/", logLevel: "warn", resolve: { alias: s.alias }, cacheDir: join(dir, `vite-${s.name}`), build: { outDir: s.outDir, emptyOutDir: true } });
    servers.push(await preview({ base: "/", build: { outDir: s.outDir }, preview: { port: s.port, strictPort: true }, logLevel: "warn" }));
  }
  const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--enable-gpu", "--use-angle=d3d11", "--ignore-gpu-blocklist"] });
  const rows: Rgba[][] = [];
  try {
    const page = await browser.newPage({ viewport: VIEWPORT });
    for (const c of TROUGH_CASES) {
      if (ONLY && ONLY !== c.id) continue;
      const pics: { oblique: Rgba; top: Rgba }[] = [];
      for (const s of sites) {
        await open(page, `http://localhost:${s.port}/`, c.fragment, c.pins ?? {});
        await settle(page);
        if (!pics.length) {
          await view(page, c, false);
          const oblique = half(await shot(page));
          await view(page, c, true);
          pics.push({ oblique, top: half(await shot(page)) });
        }
        await framed(page, c);
        await glaciate(page, c);
        await settle(page);
        await view(page, c, false);
        const oblique = half(await shot(page));
        await view(page, c, true);
        pics.push({ oblique, top: half(await shot(page)) });
        console.log(`${c.id}: ${s.name}`);
      }
      rows.push(pics.map((p) => p.oblique), pics.map((p) => p.top));
    }
  } finally {
    await browser.close();
    for (const server of servers) await new Promise<void>((r) => server.httpServer.close(() => r()));
  }
  const g = grid(rows);
  const rgba = new Uint8Array(g.width * g.height * 4);
  for (let i = 0; i < g.width * g.height; i++) rgba.set([g.rgb[i * 3], g.rgb[i * 3 + 1], g.rgb[i * 3 + 2], 255], i * 4);
  writeFileSync(SHEET, encodeJpeg({ data: rgba, width: g.width, height: g.height }, 82).data);
  console.log(`${SHEET}: ${(statSync(SHEET).size / 1024).toFixed(0)} KB (before · dev · this, each case oblique above and top-down below)`);
}

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  if (POWER_SIZE) return powerSize();
  if (TROUGH) return trough();
  const sites: { name: string; outDir: string; port: number }[] = [{ name: "finished", outDir: resolve(".scratch/capture-glaciate-site"), port: PORT }];
  const servers = [];
  process.env.DGM_BASE = "/";
  for (const s of sites) {
    console.log(`building the site (${s.name})…`);
    await build({ mode: "e2e", base: "/", logLevel: "warn", build: { outDir: s.outDir, emptyOutDir: true } });
    servers.push(await preview({ base: "/", build: { outDir: s.outDir }, preview: { port: s.port, strictPort: true }, logLevel: "warn" }));
  }
  const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--enable-gpu", "--use-angle=d3d11", "--ignore-gpu-blocklist"] });
  try {
    const page = await browser.newPage({ viewport: VIEWPORT });
    for (const c of CASES) {
      if (ONLY && ONLY !== c.id) continue;
      const pics: Record<string, { oblique: Rgba; top: Rgba }> = {};
      for (const s of sites) {
        await open(page, `http://localhost:${s.port}/`, c.fragment);
        if (!pics.before) {
          await view(page, c, false);
          const oblique = half(await shot(page));
          await view(page, c, true);
          pics.before = { oblique, top: half(await shot(page)) };
        }
        await view(page, c, false);
        if (s.name === "finished" && (!ONLY || ONLY === c.id) && c.id === "canyon") {
          // the two acts, from a still camera (D265), on their own pace (D266)
          const frames: Rgba[] = [];
          const delays: number[] = [];
          let last = performance.now();
          const done = glaciate(page, c).then(() => (last = -1));
          while (last >= 0 && frames.length < 90) {
            frames.push(half(await shot(page)));
            const now = performance.now();
            delays.push(Math.min(250, Math.max(60, now - last)));
            last = now;
          }
          await done;
          await settle(page);
          await view(page, c, false);
          frames.push(half(await shot(page)));
          delays.push(1800);
          const keep = frames.length > 36 ? frames.filter((_, k) => k % Math.ceil(frames.length / 36) === 0 || k === frames.length - 1) : frames;
          const kd = keep.map((_, k) => (k === keep.length - 1 ? 1800 : 140));
          const file = join(OUT, "two-acts.gif");
          writeFileSync(file, writeGif(keep, kd));
          console.log(`${file}: ${keep.length} frames, ${(statSync(file).size / 1024).toFixed(0)} KB`);
        } else {
          await glaciate(page, c);
          await settle(page);
          await view(page, c, false);
        }
        if (DUMP) {
          const state = await page.evaluate("(() => { const m = window.dgm3d.renderer.mapState(); return { W: m.W, H: m.H, heights: Array.from(m.heights), depth: Array.from(m.surface.depth), contamination: Array.from(m.surface.contamination), moisture: m.soil ? Array.from(m.soil.moisture) : [], soilBad: m.soil ? Array.from(m.soil.contamination) : [] }; })()");
          mkdirSync(DUMP, { recursive: true });
          writeFileSync(join(DUMP, `${c.id}-${s.name}.json`), JSON.stringify(state));
        }
        const oblique = half(await shot(page));
        await view(page, c, true);
        pics[s.name] = { oblique, top: half(await shot(page)) };
      }
      const g = grid([
        [pics.before.oblique, pics.finished.oblique],
        [pics.before.top, pics.finished.top],
      ]);
      const file = join(OUT, `${c.id}-floor.png`);
      writeFileSync(file, encodePng(g.rgb, g.width, g.height));
      console.log(`${file}: ${(statSync(file).size / 1024).toFixed(0)} KB (before · finished; oblique above, top-down below)`);
    }
  } finally {
    await browser.close();
    for (const server of servers) await new Promise<void>((r) => server.httpServer.close(() => r()));
  }
}

await main();
