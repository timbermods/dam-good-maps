// Glaciate's floor for Kyler's sitting (PLAN §20 D246, D292): each of the investigation's cases that
// the editor can make (Canyon 10 at 128², click 22,22; Kyler's cross-valley Aim there, 24,80 to
// 96,36; Highlands 7 at 256², click 150,20), made in the editor as a player makes it, from the same
// camera: the land before, the glacier with the floor's water as round 4 left it, and the glacier with
// the floor's water finished (the river led to its falls and inflows), both with round 4's details
// pinned (D309). Each case is one picture: an
// oblique view above and a top-down view below, the three side by side. Small files under
// docs/progress/glaciate/ (D195: a few MB at most), and a GIF of the two acts from a still camera.
//
//   npx tsx tools/capture-glaciate.ts [--out docs/progress/glaciate] [--port 4291] [--only canyon]
//
// With --power-size (D368 (3): Power is how deep, Size how wide), the Highlands case alone, on the site
// as it is: Power 0, 50 and 100 at Size 24, and Size 12 and 40 at Power 100, each beside the land
// before (glaciate-power.png and glaciate-size.png, oblique above, top-down below).
//
//   npx tsx tools/capture-glaciate.ts --power-size --out docs/progress/forces --port 4227
//
// The site is built twice from this checkout as the preview builds it (the forces show): as it is,
// and with VITE_GLACIATE_ROUND4=1 (the floor's water left as round 4 left it: the "before" of D292).
// The installed Chrome draws on the GPU; the water is let settle (Skip) before each picture.

import { mkdirSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium, type Page } from "@playwright/test";
import { build, preview } from "vite";
import { readPng, writeGif, type Rgba } from "./gif";
import { encodePng } from "./png";

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const OUT = arg("out") ?? "docs/progress/glaciate";
const PORT = Number(arg("port") ?? 4291);
const ONLY = arg("only");
const POWER_SIZE = process.argv.includes("--power-size");
/** Also write each glacier's land and settled water as the view has them (JSON), for a close look. */
const DUMP = arg("dump");
const VIEWPORT = { width: 1280, height: 820 };
/** The land's part of the screen (below the bars), halved. */
const CLIP = { x: 240, y: 230, w: 880, h: 540 };

interface Case {
  id: string;
  fragment: string;
  from: [number, number];
  to?: [number, number];
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

async function open(page: Page, base: string, fragment: string): Promise<void> {
  await page.goto("about:blank");
  // both builds with round 4's details pinned (D309: benches, steps, tarn and scree), so the pictures
  // compare the floor's water alone; Auto may draw others on the preview
  await page.goto(`${base}`);
  await page.evaluate(() => localStorage.setItem("dgm.forces", JSON.stringify({ glaciate: { benches: "some", steps: "some", tarn: true, scree: true } })));
  await page.goto("about:blank");
  await page.goto(`${base}${fragment}`);
  await page.getByText(/All \d+ checks passed|checks? (to look at|failed)/).first().waitFor({ timeout: 400_000 });
  await page.getByRole("button", { name: "Refine this map" }).click();
  await page.waitForFunction("!!window.dgmEditor && !!window.dgm3d", null, { timeout: 300_000 });
  await page.getByRole("button", { name: "No more hints" }).click({ timeout: 3000 }).catch(() => undefined);
  await page.getByRole("combobox", { name: "Water speed" }).selectOption("instant");
  await page.evaluate("window.dgmEditor.idle()");
  const gpu = (await page.evaluate("window.dgm3d.renderer.gpu().renderer")) as string;
  if (/SwiftShader|llvmpipe|Software|Basic Render/i.test(gpu)) throw new Error(`the browser draws in software (${gpu}): the captures need the GPU`);
}

async function settle(page: Page): Promise<void> {
  await page.evaluate("window.dgmEditor.idle()");
  for (let k = 0; k < 120; k++) {
    const words = await page.locator(".water-bar .bar-status").textContent();
    if (words && /settled/i.test(words)) break;
    await page.getByRole("button", { name: "Skip" }).click({ timeout: 1000 }).catch(() => undefined);
    await page.waitForTimeout(500);
  }
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

async function shot(page: Page): Promise<Rgba> {
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
  await page.keyboard.press("-");
  await page.getByRole("group", { name: "Glaciate options" }).waitFor();
  const a = await page.evaluate(([x, y]) => window.dgmEditor!.tileToClient(x, y), c.from);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  if (c.to) {
    const b = await page.evaluate(([x, y]) => window.dgmEditor!.tileToClient(x, y), c.to);
    for (let k = 1; k <= 16; k++) {
      await page.mouse.move(a.x + ((b.x - a.x) * k) / 16, a.y + ((b.y - a.y) * k) / 16);
      await page.waitForTimeout(20);
    }
  }
  await page.mouse.up();
  await page.waitForFunction("!!window.dgmEditor.force()", null, { timeout: 20_000 });
  await page.waitForFunction("!window.dgmEditor.force()", null, { timeout: 120_000 });
  await page.keyboard.press("-");
}

/** Glaciate's row set to `power` and `size` (D368 (3)). */
async function settings(page: Page, power: number, size: number): Promise<void> {
  await page.keyboard.press("-");
  const row = page.getByRole("group", { name: "Glaciate options" });
  await row.getByRole("slider", { name: "Power" }).fill(String(power));
  await row.getByRole("slider", { name: "Size" }).fill(String(size));
  await page.keyboard.press("-");
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
      ["glaciate-size", [[100, 12], [100, 40]]],
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

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  if (POWER_SIZE) return powerSize();
  const sites: { name: string; outDir: string; port: number }[] = [
    { name: "round4", outDir: resolve(".scratch/capture-glaciate-round4"), port: PORT + 1 },
    { name: "finished", outDir: resolve(".scratch/capture-glaciate-site"), port: PORT },
  ];
  const servers = [];
  process.env.DGM_BASE = "/";
  for (const s of sites) {
    console.log(`building the site (${s.name})…`);
    process.env.VITE_GLACIATE_ROUND4 = s.name === "round4" ? "1" : "";
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
        [pics.before.oblique, pics.round4.oblique, pics.finished.oblique],
        [pics.before.top, pics.round4.top, pics.finished.top],
      ]);
      const file = join(OUT, `${c.id}-floor.png`);
      writeFileSync(file, encodePng(g.rgb, g.width, g.height));
      console.log(`${file}: ${(statSync(file).size / 1024).toFixed(0)} KB (before · round 4 · finished; oblique above, top-down below)`);
    }
  } finally {
    await browser.close();
    for (const server of servers) await new Promise<void>((r) => server.httpServer.close(() => r()));
  }
}

await main();
