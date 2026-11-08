// The land's tone before and after (D497; fix/land-tone): dev against this checkout, Standard and High, the same map from
// the same cameras: grass by the water close up, a grassy valley from the probe's start-shot distance (about 100 away,
// where the game's frames were judged), a cliff, and dry ground. What moved: grass is one colour at every moisture, as
// the game's terrain shader draws it (ours ran deeper by the water), and the patterns keep their mean at every distance
// (the grass's strokes and the earth's cracks had faded from afar). The light look, which the browser takes when it draws
// in software, is drawn too, dev and this checkout, from the valley's view.
//
//   git archive --output=.scratch/judge-dev.tar origin/dev index.html real-places src public vite.config.ts tsconfig.json package.json tools/rust/vite-plugin.mjs
//   mkdir -p .scratch/judge-dev && tar -xf .scratch/judge-dev.tar -C .scratch/judge-dev
//   npx tsx tools/capture-land-tone.ts [--dev .scratch/judge-dev] [--out docs/sheets/land-tone.jpg]
//
// Our own generated map only; the views are found in this checkout's map (page side) and used for both sites.

import { resolve } from "node:path";
import { chromium, type Browser, type Page } from "@playwright/test";
import type { PreviewServer } from "vite";
import { GPU_ARGS, VIEWPORT, grid, open, setLook, shot, site, type View } from "./water-capture";

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const DEV = resolve(arg("dev") ?? ".scratch/judge-dev");
const OUT = arg("out") ?? "docs/sheets/land-tone.jpg";
const PORT = Number(arg("port") ?? 4997);
const CLOCK = 12.5;
const YAW = -Math.PI / 6;
const MAP = "#s=4242&z=256&d=n&t=riverValley";

/** Page side: the views. Grass by the water: the most all-grass dry tops (moisture 5 up) with water within two tiles,
 *  round a point; the valley: the most all-grass tops round a point, from the start shots' distance and pitch; the
 *  cliff: the most drop between neighbouring dry tops; dry ground: the most dry, level tops. */
const FIND_JS = `([yaw]) => {
  const r = window.dgm3d.renderer;
  const m = r.map, s = m.surface, W = m.W, H = m.H, soil = m.soil;
  const wet = (i) => s.surface[i] === s.surface[i] && s.depth[i] > 0.05;
  const at = (i) => [i % W + 0.5, m.heights[i], -(Math.floor(i / W) + 0.5)];
  const views = {};
  const bestOf = (score, r0) => {
    let best = -1, bs = 0;
    for (let y = r0; y < H - r0; y += 2) for (let x = r0; x < W - r0; x += 2) {
      let sum = 0;
      for (let dy = -r0; dy <= r0; dy++) for (let dx = -r0; dx <= r0; dx++) sum += score((y + dy) * W + x + dx, x + dx, y + dy);
      if (sum > bs) { bs = sum; best = y * W + x; }
    }
    return best;
  };
  const grass = (i) => (!wet(i) && soil.contamination[i] === 0 && Math.round(soil.moisture[i] / 15) >= 5 ? 1 : 0);
  const nearWater = (i, x, y) => {
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const xx = x + dx, yy = y + dy;
      if (xx >= 0 && yy >= 0 && xx < W && yy < H && wet(yy * W + xx)) return true;
    }
    return false;
  };
  let i = bestOf((j, x, y) => (grass(j) && nearWater(j, x, y) ? 1 : 0), 6);
  if (i >= 0) views.shore = { mode: "orbit", yaw, pitch: 0.85, distance: 28, target: at(i) };
  i = bestOf(grass, 14);
  if (i >= 0) views.valley = { mode: "orbit", yaw, pitch: 0.95, distance: 100, target: at(i) };
  const drop = (j, x, y) => {
    if (wet(j) || x + 1 >= W || y + 1 >= H) return 0;
    return Math.min(4, Math.abs(m.heights[j + 1] - m.heights[j])) + Math.min(4, Math.abs(m.heights[j + W] - m.heights[j]));
  };
  i = bestOf(drop, 6);
  if (i >= 0) views.cliff = { mode: "orbit", yaw, pitch: 0.55, distance: 30, target: at(i) };
  const dry = (j, x, y) => (!wet(j) && soil.moisture[j] === 0 && soil.contamination[j] === 0 && x + 1 < W && m.heights[j + 1] === m.heights[j] ? 1 : 0);
  i = bestOf(dry, 10);
  if (i >= 0) views.dry = { mode: "orbit", yaw, pitch: 0.9, distance: 40, target: at(i) };
  return views;
}`;

const SITES = [
  { key: "dev", label: "dev" },
  { key: "after", label: "this PR" },
] as const;
const SCENES = [
  { key: "shore", label: "Grass by the water" },
  { key: "valley", label: "A grassy valley, 100 away" },
  { key: "cliff", label: "A cliff" },
  { key: "dry", label: "Dry ground" },
] as const;

async function main() {
  const roots: Record<string, string> = { dev: DEV, after: resolve(".") };
  const servers: PreviewServer[] = [];
  const ports: Record<string, number> = {};
  for (const [k, s] of SITES.entries()) {
    ports[s.key] = PORT + k;
    servers.push(await site(roots[s.key], "land-tone", s.key, ports[s.key]));
  }
  const browsers: Browser[] = [];
  try {
    const gpu = await chromium.launch({ channel: "chrome", headless: true, args: GPU_ARGS });
    browsers.push(gpu);
    const errors: string[] = [];
    const watch = (page: Page) => {
      page.on("pageerror", (e) => errors.push(String(e)));
      page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    };
    const page = await (await gpu.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1, colorScheme: "light" })).newPage();
    watch(page);
    const tool = await gpu.newPage();
    await open(page, ports.after, MAP);
    console.log(`GPU: ${await page.evaluate("window.dgm3d.renderer.gpu().renderer")}`);
    const views = (await page.evaluate(`(${FIND_JS})(${JSON.stringify([YAW])})`)) as Record<string, View>;
    for (const s of SCENES) if (!views[s.key]) throw new Error(`no view found for ${s.key}`);
    const got = new Map<string, Buffer>();
    for (const s of SITES) {
      await open(page, ports[s.key], MAP);
      for (const look of ["standard", "high"] as const) {
        await setLook(page, look);
        for (const v of SCENES) got.set(`${v.key}-${look}-${s.key}`, await shot(page, views[v.key], CLOCK));
      }
    }
    // the light look: the browser drawing in software (SwiftShader), as a computer without a usable GPU does
    const soft = await chromium.launch({ channel: "chrome", headless: true, args: ["--disable-gpu", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
    browsers.push(soft);
    const lite = await (await soft.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1, colorScheme: "light" })).newPage();
    watch(lite);
    for (const s of SITES) {
      await open(lite, ports[s.key], MAP);
      const look = (await lite.evaluate("window.dgm3d.renderer.look")) as string;
      console.log(`${s.key} in software: the ${look} look (${await lite.evaluate("window.dgm3d.renderer.gpu().renderer")})`);
      got.set(`valley-lite-${s.key}`, await shot(lite, views.valley, CLOCK));
    }
    const images: Buffer[] = [];
    const labels: string[] = [];
    for (const v of SCENES)
      for (const look of ["standard", "high"] as const)
        for (const s of SITES) {
          images.push(got.get(`${v.key}-${look}-${s.key}`)!);
          labels.push(`${v.label}: ${look === "standard" ? "Standard" : "High"}, ${s.label}`);
        }
    for (const s of SITES) {
      images.push(got.get(`valley-lite-${s.key}`)!);
      labels.push(`A grassy valley, 100 away: the light look, ${s.label}`);
    }
    await grid(tool, images, labels, 4, 0.3, resolve(OUT));
    if (errors.length) console.log(`page errors:\n${errors.join("\n")}`);
  } finally {
    for (const b of browsers) await b.close();
    for (const s of servers) await new Promise<void>((r) => s.httpServer.close(() => r()));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
