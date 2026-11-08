// The game's still detail albedo on its water (Q9 P6; fix/water-detail): dev, which drew it at its texture's mean,
// against this checkout, which draws its pattern (waterTextures.ts `makeDetailField`, at xz × 0.015, not carried by
// the flow), Standard and High, the same map from the same cameras at the same moment: a lake close up, the game's
// opening camera, a river, a shallow shore, and the game's farthest default zoom over the widest water (where a
// 67-tile repeat would show if it tiled visibly).
//
//   git archive --output=.scratch/judge-dev.tar origin/dev index.html real-places src public vite.config.ts tsconfig.json package.json tools/rust/vite-plugin.mjs
//   mkdir -p .scratch/judge-dev && tar -xf .scratch/judge-dev.tar -C .scratch/judge-dev
//   npx tsx tools/capture-water-detail.ts [--dev .scratch/judge-dev] [--out docs/sheets/water-detail.jpg]
//
// Our own generated map only; the views are found in this checkout's map (page side) and used for both sites.

import { resolve } from "node:path";
import { chromium } from "@playwright/test";
import type { PreviewServer } from "vite";
import { GPU_ARGS, VIEWPORT, grid, open, setLook, shot, site, type View } from "./water-capture";

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const DEV = resolve(arg("dev") ?? ".scratch/judge-dev");
const OUT = arg("out") ?? "docs/sheets/water-detail.jpg";
const PORT = Number(arg("port") ?? 4993);
const CLOCK = 12.5;
const YAW = -Math.PI / 6;
const MAP = arg("map") ?? "#s=4242&z=256&d=n&t=riverValley";

/** Page side: the views. The lake: the most clean water round a point, close (14 away, 0.75 down); the opening camera
 *  as the game's (60° down, zoom 4); the river: the most clean water in a channel; a shallow shore: the most clean water
 *  under half a level deep beside land; far: the game's farthest default zoom (zoom 6) over the most clean water. */
const FIND_JS = `([yaw]) => {
  const r = window.dgm3d.renderer;
  const m = r.map, s = m.surface, W = m.W, H = m.H;
  const wet = (i) => s.surface[i] === s.surface[i] && s.depth[i] > 0.05;
  const top = (i) => (wet(i) ? s.surface[i] : m.heights[i]);
  const at = (i) => [i % W + 0.5, top(i), -(Math.floor(i / W) + 0.5)];
  const views = {};
  const bestOf = (score, r0, step = 2) => {
    let best = -1, bs = 0;
    for (let y = r0; y < H - r0; y += step) for (let x = r0; x < W - r0; x += step) {
      let sum = 0;
      for (let dy = -r0; dy <= r0; dy += step) for (let dx = -r0; dx <= r0; dx += step) sum += score((y + dy) * W + x + dx);
      if (sum > bs) { bs = sum; best = y * W + x; }
    }
    return best;
  };
  const clean = (j) => (wet(j) && s.contamination[j] < 0.02 ? 1 : 0);
  let i = bestOf(clean, 10);
  if (i >= 0) views.lake = { mode: "orbit", yaw, pitch: 0.75, distance: 14, target: at(i) };
  i = bestOf(clean, 16);
  if (i >= 0) views.opening = { mode: "orbit", yaw, pitch: Math.PI / 3, distance: 32 * 1.3 ** 4, target: at(i) };
  i = bestOf(clean, 40, 4);
  if (i >= 0) views.far = { mode: "orbit", yaw, pitch: Math.PI / 3, distance: 32 * 1.3 ** 6, target: at(i) };
  const share = new Float32Array(W * H);
  for (let y = 5; y < H - 5; y++) for (let x = 5; x < W - 5; x++) {
    let n = 0;
    for (let dy = -5; dy <= 5; dy++) for (let dx = -5; dx <= 5; dx++) n += wet((y + dy) * W + x + dx) ? 1 : 0;
    share[y * W + x] = n / 121;
  }
  i = bestOf((j) => (clean(j) && share[j] > 0.25 && share[j] < 0.5 ? 1 : 0), 6);
  if (i >= 0) views.river = { mode: "orbit", yaw, pitch: 0.6, distance: 24, target: at(i) };
  i = bestOf((j) => (clean(j) && s.depth[j] < 0.5 && share[j] > 0.3 && share[j] < 0.8 ? 1 : 0), 4, 1);
  if (i >= 0) views.shore = { mode: "orbit", yaw, pitch: 0.9, distance: 12, target: at(i) };
  return views;
}`;

const SITES = [
  { key: "dev", label: "dev (its mean)" },
  { key: "after", label: "this PR (its pattern)" },
] as const;
const SCENES = [
  { key: "lake", label: "A lake, close" },
  { key: "opening", label: "The opening camera" },
  { key: "river", label: "A river" },
  { key: "shore", label: "A shallow shore" },
  { key: "far", label: "The farthest zoom" },
] as const;

async function main() {
  const roots: Record<string, string> = { dev: DEV, after: resolve(".") };
  const servers: PreviewServer[] = [];
  const ports: Record<string, number> = {};
  for (const [k, s] of SITES.entries()) {
    ports[s.key] = PORT + k;
    servers.push(await site(roots[s.key], "water-detail", s.key, ports[s.key]));
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
    let page = await pageFor();
    await open(page, ports.after, MAP);
    const views = (await page.evaluate(`(${FIND_JS})(${JSON.stringify([YAW])})`)) as Record<string, View>;
    for (const s of SCENES) if (!views[s.key]) throw new Error(`no view found for ${s.key}`);
    console.log(JSON.stringify(views));
    const got = new Map<string, Buffer>();
    for (const s of SITES) {
      await page.context().close();
      page = await pageFor();
      await open(page, ports[s.key], MAP);
      for (const look of ["standard", "high"] as const) {
        await setLook(page, look);
        for (const v of SCENES) got.set(`${v.key}-${look}-${s.key}`, await shot(page, views[v.key], CLOCK));
      }
    }
    const images: Buffer[] = [];
    const labels: string[] = [];
    for (const v of SCENES)
      for (const look of ["standard", "high"] as const)
        for (const s of SITES) {
          images.push(got.get(`${v.key}-${look}-${s.key}`)!);
          labels.push(`${v.label}: ${look === "standard" ? "Standard" : "High"}, ${s.label}`);
        }
    await grid(tool, images, labels, 4, 0.3, resolve(OUT));
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
