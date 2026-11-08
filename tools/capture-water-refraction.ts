// The game's refraction of the ground behind its water and its waterfall mask (Q9 P2, P1; fix/water-refraction): dev
// against this checkout, Standard and High, the same 256² map from the same cameras at the same moment: a shallow clear
// stream over its bed close up (where the refraction shows most), a lake's edge, a waterfall close up, and the falls
// from the game's opening camera. `--cost` measures instead what a frame costs in each (the view drawn and the GPU
// finished, 120 frames with the water's clock moving, the median and the 95th percentile, ms), close up, where the copy
// of the screen behind the water is made, and from the opening camera, where it is not. `--motion` writes a few frames
// of the stream a fifteenth of a second apart (.scratch/water-refraction/, for the eye; not committed).
//
//   git archive --output=.scratch/judge-dev.tar origin/dev index.html real-places src public vite.config.ts tsconfig.json package.json tools/rust/vite-plugin.mjs
//   mkdir -p .scratch/judge-dev && tar -xf .scratch/judge-dev.tar -C .scratch/judge-dev
//   npx tsx tools/capture-water-refraction.ts [--dev .scratch/judge-dev] [--out docs/sheets/water-refraction.jpg] [--cost] [--motion]
//
// Our own generated map only; the views are found in this checkout's map (page side) and used for both sites.

import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium, type Page } from "@playwright/test";
import type { PreviewServer } from "vite";
import { GPU_ARGS, VIEWPORT, grid, open, setLook, shot, site, type View } from "./water-capture";

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const DEV = resolve(arg("dev") ?? ".scratch/judge-dev");
const OUT = arg("out") ?? "docs/sheets/water-refraction.jpg";
const PORT = Number(arg("port") ?? 4995);
const CLOCK = 12.5;
const YAW = -Math.PI / 6;
const MAP = arg("map") ?? "#s=7&z=256&d=n&t=highlands";
const COST = process.argv.includes("--cost");
const MOTION = process.argv.includes("--motion");

/** Page side: the views. The stream: the most clean water under half a level deep in a narrow channel, close (8
 *  away); the lake's edge: clean water beside land with deep water behind it; a fall: the tile above the largest drop of
 *  clean water to water a level or more below, close and from the game's opening camera (60° down, zoom 4). */
const FIND_JS = `([yaw]) => {
  const r = window.dgm3d.renderer;
  const m = r.map, s = m.surface, W = m.W, H = m.H;
  const wet = (i) => s.surface[i] === s.surface[i] && s.depth[i] > 0.05;
  const clean = (j) => wet(j) && s.contamination[j] < 0.02;
  const top = (i) => (wet(i) ? s.surface[i] : m.heights[i]);
  const at = (i) => [i % W + 0.5, top(i), -(Math.floor(i / W) + 0.5)];
  const share = new Float32Array(W * H);
  for (let y = 5; y < H - 5; y++) for (let x = 5; x < W - 5; x++) {
    let n = 0;
    for (let dy = -5; dy <= 5; dy++) for (let dx = -5; dx <= 5; dx++) n += wet((y + dy) * W + x + dx) ? 1 : 0;
    share[y * W + x] = n / 121;
  }
  const bestOf = (score, r0, step = 2) => {
    let best = -1, bs = 0;
    for (let y = r0; y < H - r0; y += step) for (let x = r0; x < W - r0; x += step) {
      let sum = 0;
      for (let dy = -r0; dy <= r0; dy += step) for (let dx = -r0; dx <= r0; dx += step) sum += score((y + dy) * W + x + dx);
      if (sum > bs) { bs = sum; best = y * W + x; }
    }
    return best;
  };
  const views = {};
  let i = bestOf((j) => (clean(j) && s.depth[j] < 0.5 && share[j] > 0.15 && share[j] < 0.45 ? 1 : 0), 3, 1);
  if (i >= 0) views.stream = { mode: "orbit", yaw, pitch: 0.85, distance: 8, target: at(i) };
  i = bestOf((j) => (clean(j) && share[j] > 0.4 && share[j] < 0.7 ? (s.depth[j] > 1.5 ? 2 : s.depth[j] < 0.6 ? 1 : 0) : 0), 4, 1);
  if (i >= 0) views.edge = { mode: "orbit", yaw, pitch: 0.7, distance: 16, target: at(i) };
  let fall = -1, drop = 0;
  for (let y = 2; y < H - 2; y++) for (let x = 2; x < W - 2; x++) {
    const j = y * W + x;
    if (!clean(j)) continue;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const k = (y + dy) * W + x + dx;
      if (wet(k) && s.surface[j] - s.surface[k] > drop) { drop = s.surface[j] - s.surface[k]; fall = k; }
    }
  }
  if (fall >= 0 && drop >= 1) {
    views.fall = { mode: "orbit", yaw, pitch: 0.55, distance: 14, target: at(fall) };
    views.opening = { mode: "orbit", yaw, pitch: Math.PI / 3, distance: 32 * 1.3 ** 4, target: at(fall) };
  }
  return { views, drop };
}`;

const SITES = [
  { key: "dev", label: "dev" },
  { key: "after", label: "this PR" },
] as const;
const SCENES = [
  { key: "stream", label: "A shallow stream, close" },
  { key: "edge", label: "A lake's edge" },
  { key: "fall", label: "A waterfall, close" },
  { key: "opening", label: "The falls, opening camera" },
] as const;

/** Page side: `n` frames, each drawn with the water's clock a thirtieth of a second on and the GPU waited for (a pixel
 *  read), timed; the median and the 95th percentile (ms). */
const COST_JS = `async ([n]) => {
  const r = window.dgm3d.renderer;
  const gl = r.gl.getContext();
  const px = new Uint8Array(4);
  const t = [];
  let clock = 20;
  for (let k = 0; k < n + 10; k++) {
    await new Promise((res) => requestAnimationFrame(res));
    const t0 = performance.now();
    r.setClock((clock += 1 / 30));
    r.renderNow();
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    if (k >= 10) t.push(performance.now() - t0);
  }
  t.sort((a, b) => a - b);
  return [t[Math.floor(t.length / 2)], t[Math.floor(t.length * 0.95)]];
}`;

async function main() {
  const roots: Record<string, string> = { dev: DEV, after: resolve(".") };
  const servers: PreviewServer[] = [];
  const ports: Record<string, number> = {};
  for (const [k, s] of SITES.entries()) {
    ports[s.key] = PORT + k;
    servers.push(await site(roots[s.key], "water-refraction", s.key, ports[s.key]));
  }
  const browser = await chromium.launch({ channel: "chrome", headless: true, args: GPU_ARGS });
  try {
    const errors: string[] = [];
    const pageFor = async () => {
      const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1, colorScheme: "light" });
      const p = await context.newPage();
      p.on("pageerror", (e) => errors.push(String(e)));
      p.on("console", (m) => m.type() === "error" && errors.push(m.text()));
      return p;
    };
    const tool = await browser.newPage();
    let page: Page = await pageFor();
    await open(page, ports.after, MAP);
    const found = (await page.evaluate(`(${FIND_JS})(${JSON.stringify([YAW])})`)) as { views: Record<string, View>; drop: number };
    const views = found.views;
    for (const s of SCENES) if (!views[s.key]) throw new Error(`no view found for ${s.key} (the largest fall ${found.drop.toFixed(2)})`);
    console.log(JSON.stringify(found));
    const got = new Map<string, Buffer>();
    for (const s of SITES) {
      await page.context().close();
      page = await pageFor();
      await open(page, ports[s.key], MAP);
      for (const look of ["standard", "high"] as const) {
        await setLook(page, look);
        if (COST) {
          for (const v of ["stream", "opening"] as const) {
            await page.evaluate(`window.dgm3d.renderer.setView(${JSON.stringify(views[v])})`);
            const [p50, p95] = (await page.evaluate(`(${COST_JS})([120])`)) as number[];
            console.log(`${s.key} ${look} ${v}: a frame ${p50.toFixed(2)} ms (95th percentile ${p95.toFixed(2)})`);
          }
          continue;
        }
        if (MOTION && s.key === "after") {
          mkdirSync(".scratch/water-refraction", { recursive: true });
          for (let k = 0; k < 6; k++) writeFileSync(`.scratch/water-refraction/stream-${look}-${k}.png`, await shot(page, views.stream, CLOCK + k / 15));
        }
        for (const v of SCENES) got.set(`${v.key}-${look}-${s.key}`, await shot(page, views[v.key], CLOCK));
      }
    }
    if (!COST) {
      const images: Buffer[] = [];
      const labels: string[] = [];
      for (const v of SCENES)
        for (const look of ["standard", "high"] as const)
          for (const s of SITES) {
            images.push(got.get(`${v.key}-${look}-${s.key}`)!);
            labels.push(`${v.label}: ${look === "standard" ? "Standard" : "High"}, ${s.label}`);
          }
      await grid(tool, images, labels, 4, 0.3, resolve(OUT));
    }
    if (errors.length) console.log(`page errors:\n${errors.join("\n")}`);
  } finally {
    await browser.close();
    for (const s of servers) await new Promise<void>((r) => s.httpServer.close(() => r()));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
