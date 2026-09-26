// The forces in the editor, for Kyler's look (PLAN §20 D219): a short GIF of each force at work in the
// editor as the preview builds it (Carve, Craterize, Quake's Lift and Slide, Erupt at full power), and
// the top bar with the forces group. Small files under docs/progress/forces/ (D195: a few MB at most).
//
//   npx tsx tools/capture-forces.ts [--out docs/progress/forces] [--port 4812] [--only erupt]
//
// The site is built from this checkout as the preview builds it (the forces show), opened in the
// installed Chrome drawing on the GPU (the view's full look, the forces' moments); each force on a fresh
// copy of the same generated map (our own: Highlands 4242, 128²), the water speed at its slowest (ten
// steps a second), the water's own ripples held still so each frame keeps only what the force changed.

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
const OUT = arg("out") ?? "docs/progress/forces";
const PORT = Number(arg("port") ?? 4812);
const ONLY = arg("only");
const FRAGMENT = "#s=4242&z=128&d=n&t=highlands";
const VIEWPORT = { width: 1280, height: 820 };
/** The land's part of the screen (below the bars, clear of the shelf): halved into the GIF. */
const CLIP = { x: 280, y: 250, w: 800, h: 480 };

async function open(page: Page): Promise<{ start: [number, number] }> {
  await page.goto("about:blank");
  await page.goto(`http://localhost:${PORT}/${FRAGMENT}`);
  await page.getByText(/All \d+ checks passed/).first().waitFor({ timeout: 240_000 });
  await page.getByRole("button", { name: "Refine this map" }).click();
  await page.waitForFunction("!!window.dgmEditor && !!window.dgm3d", null, { timeout: 180_000 });
  await page.getByRole("button", { name: "No more hints" }).click().catch(() => undefined);
  await page.getByRole("combobox", { name: "Water speed" }).selectOption("slower");
  await page.waitForTimeout(2500);
  await page.evaluate("window.dgmEditor.idle()");
  const gpu = (await page.evaluate("window.dgm3d.renderer.gpu().renderer")) as string;
  if (/SwiftShader|llvmpipe|Software|Basic Render/i.test(gpu)) throw new Error(`the browser draws in software (${gpu}): the captures need the GPU`);
  const info = (await page.evaluate("window.dgmEditor.info()")) as { features: { kind: string; params: { position?: [number, number] } }[] };
  return { start: info.features.find((f) => f.kind === "start")!.params.position! };
}

/** Look at tile (x, y) from `distance`, the game's turn, a little lower; the water held still. */
async function look(page: Page, x: number, y: number, distance: number, pitchDeg = 50): Promise<void> {
  await page.evaluate(
    ([x, y, d, p]) => {
      const r = window.dgm3d!.renderer;
      const m = r.mapState()!;
      const h = m.heights[Math.round(y) * m.W + Math.round(x)];
      r.setView({ mode: "orbit", yaw: -Math.PI / 6, pitch: (p * Math.PI) / 180, distance: d, target: [x + 0.5, h, -(y + 0.5)] });
      r.setClock(12.5);
    },
    [x, y, distance, pitchDeg] as [number, number, number, number],
  );
  await page.mouse.move(5, 400);
  await page.waitForTimeout(400);
}

const client = (page: Page, x: number, y: number) => page.evaluate(([a, b]) => window.dgmEditor!.tileToClient(a, b), [x, y] as [number, number]);

/** A frame of the land, at half size, straight from the browser (decoded later). */
async function frame(page: Page): Promise<Uint8Array> {
  const cdp = await cdpOf(page);
  const r = (await cdp.send("Page.captureScreenshot", { format: "png", fromSurface: true, clip: { x: CLIP.x, y: CLIP.y, width: CLIP.w, height: CLIP.h, scale: 0.5 } })) as { data: string };
  return new Uint8Array(Buffer.from(r.data, "base64"));
}
const sessions = new WeakMap<Page, Awaited<ReturnType<ReturnType<Page["context"]>["newCDPSession"]>>>();
async function cdpOf(page: Page) {
  let s = sessions.get(page);
  if (!s) sessions.set(page, (s = await page.context().newCDPSession(page)));
  return s;
}

/** Frames while `act` runs and for `tail` ms after the force is kept. */
async function record(page: Page, act: () => Promise<void>, tail: number, max = 90): Promise<{ frames: Rgba[]; delays: number[] }> {
  const shots: Uint8Array[] = [await frame(page)];
  const times: number[] = [performance.now()];
  let acting = true;
  const acted = act().finally(() => (acting = false));
  let doneAt: number | null = null;
  while (shots.length < max) {
    shots.push(await frame(page));
    times.push(performance.now());
    if (acting) continue;
    const running = await page.evaluate("!!window.dgmEditor.force()");
    if (!running && doneAt === null) doneAt = performance.now();
    if (doneAt !== null && performance.now() - doneAt > tail) break;
  }
  await acted;
  // (the first frame lingers, so the land is seen before the force)
  const delays = times.map((t, k) => (k === 0 ? 700 : Math.min(200, t - times[k - 1])));
  delays[delays.length - 1] = 1600;
  return { frames: shots.map((s) => readPng(s)), delays };
}

/** Keep it small (D195): at most `max` frames (the others' time goes to the frames kept), and a
 *  strip of a few of them for a quick look (--strip, not committed). */
function save(name: string, r: { frames: Rgba[]; delays: number[] }, max = 24): void {
  let { frames, delays } = r;
  if (frames.length > max) {
    const keep: number[] = [];
    for (let k = 0; k < max; k++) keep.push(Math.round((k * (frames.length - 1)) / (max - 1)));
    const nd = keep.map((i, k) => (k === 0 ? delays[0] : delays.slice(keep[k - 1] + 1, i + 1).reduce((a, b) => a + b, 0)));
    nd[nd.length - 1] = delays[delays.length - 1];
    frames = keep.map((i) => frames[i]);
    delays = nd;
  }
  const file = join(OUT, `${name}.gif`);
  writeFileSync(file, writeGif(frames, delays));
  console.log(`${file}: ${frames.length} frames, ${(statSync(file).size / 1024).toFixed(0)} KB`);
  if (process.argv.includes("--strip")) {
    const pick = [0, 0.2, 0.4, 0.6, 0.8, 1].map((t) => frames[Math.round(t * (frames.length - 1))]);
    const w = pick[0].width;
    const h = pick[0].height;
    const rgb = new Uint8Array(w * 3 * h * 2 * 3);
    pick.forEach((f, k) => {
      const ox = (k % 3) * w;
      const oy = Math.floor(k / 3) * h;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) rgb.set(f.data.subarray((y * w + x) * 4, (y * w + x) * 4 + 3), ((oy + y) * w * 3 + ox + x) * 3);
    });
    writeFileSync(join(OUT, `${name}-strip.png`), encodePng(rgb, w * 3, h * 2));
  }
}

async function pick(page: Page, key: string, row: string, set?: (row: ReturnType<Page["getByRole"]>) => Promise<void>): Promise<void> {
  await page.keyboard.press(key);
  const r = page.getByRole("group", { name: row });
  await r.waitFor();
  if (set) await set(r);
  await page.mouse.move(5, 400);
}

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  const outDir = resolve(".scratch/capture-forces-site");
  console.log("building the site (as the preview builds it)…");
  process.env.DGM_BASE = "/";
  await build({ mode: "e2e", base: "/", logLevel: "warn", build: { outDir, emptyOutDir: true } });
  const server = await preview({ base: "/", build: { outDir }, preview: { port: PORT, strictPort: true }, logLevel: "warn" });
  const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--enable-gpu", "--use-angle=d3d11", "--ignore-gpu-blocklist"] });
  try {
    const page = await browser.newPage({ viewport: VIEWPORT });
    const want = (n: string) => !ONLY || ONLY === n;
    if (want("bar")) {
      await open(page);
      await pick(page, "0", "Erupt options");
      const box = (await page.locator(".brush-bar-wrap").boundingBox())!;
      const shot = readPng(new Uint8Array(await page.screenshot({ clip: { x: box.x, y: box.y, width: Math.min(box.width, 1000), height: 104 } })));
      const rgb = new Uint8Array(shot.width * shot.height * 3);
      for (let i = 0; i < shot.width * shot.height; i++) rgb.set(shot.data.subarray(i * 4, i * 4 + 3), i * 3);
      writeFileSync(join(OUT, "forces-bar.png"), encodePng(rgb, shot.width, shot.height));
      console.log(`${OUT}/forces-bar.png`);
    }
    if (want("carve")) {
      const { start } = await open(page);
      const at: [number, number] = [start[0] < 64 ? 96 : 30, start[1] < 64 ? 100 : 26];
      await look(page, at[0] + (at[0] < 64 ? 14 : -14), at[1] + (at[1] < 64 ? 12 : -12), 95);
      await pick(page, "7", "Carve options", async (r) => {
        await r.getByRole("slider", { name: "Power" }).fill("75");
        await r.getByRole("slider", { name: "Wander" }).fill("60");
      });
      const p = await client(page, at[0], at[1]);
      save("carve", await record(page, () => page.mouse.click(p.x, p.y), 800, 70));
    }
    if (want("craterize")) {
      const { start } = await open(page);
      const at: [number, number] = [start[0] < 64 ? 92 : 36, start[1] < 64 ? 88 : 40];
      await look(page, at[0], at[1], 110);
      await pick(page, "8", "Craterize options", async (r) => {
        await r.getByRole("slider", { name: "Power" }).fill("45");
        await r.getByText("Rays").click();
      });
      const p = await client(page, at[0], at[1]);
      save("craterize", await record(page, () => page.mouse.click(p.x, p.y), 1600));
    }
    if (want("erupt")) {
      const { start } = await open(page);
      const at: [number, number] = [start[0] < 64 ? 92 : 36, start[1] < 64 ? 90 : 38];
      await look(page, at[0], at[1], 120, 38);
      await pick(page, "0", "Erupt options", async (r) => {
        await r.getByRole("slider", { name: "Power" }).fill("100");
      });
      const p = await client(page, at[0], at[1]);
      save("erupt", await record(page, () => page.mouse.click(p.x, p.y), 4500, 80));
    }
    for (const mode of ["lift", "slide"] as const) {
      if (!want(`quake-${mode}`)) continue;
      const { start } = await open(page);
      const y = start[1] < 64 ? 92 : 36;
      await look(page, 64, y, 125);
      await pick(page, "9", "Quake options", async (r) => {
        await r.getByRole("button", { name: mode === "lift" ? "Lift" : "Slide" }).click();
        await r.getByRole("slider", { name: "Power" }).fill(mode === "lift" ? "55" : "70");
        // the side away from the start moves
        await r.getByRole("button", { name: start[1] < y ? "Left" : "Right" }).click();
      });
      const a = await client(page, 12, y);
      const b = await client(page, 116, y + 3);
      save(
        `quake-${mode}`,
        await record(
          page,
          async () => {
            await page.mouse.move(a.x, a.y);
            await page.mouse.down();
            for (let k = 1; k <= 24; k++) {
              await page.mouse.move(a.x + ((b.x - a.x) * k) / 24, a.y + ((b.y - a.y) * k) / 24);
              await page.waitForTimeout(35);
            }
            await page.mouse.up();
          },
          1200,
        ),
      );
    }
  } finally {
    await browser.close();
    await new Promise<void>((r) => server.httpServer.close(() => r()));
  }
}

await main();
