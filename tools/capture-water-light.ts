// The light's before and after (D496, D497; fix/water-light): dev against this checkout, Standard and High, the same
// map from the same cameras at the same moment: a grassy valley, a cliff, a lake, pure badwater close up, and badwater
// meeting clean water. What moved: the reflection intensity the game sets every frame (1, in place of the scene's
// 0.65) on the terrain and the water, and badwater's colour by each look's own judged choice (the game's formula in
// Standard, our crimson in High).
//
//   git archive --output=.scratch/judge-dev.tar origin/dev index.html real-places src public vite.config.ts tsconfig.json package.json tools/rust/vite-plugin.mjs
//   mkdir -p .scratch/judge-dev && tar -xf .scratch/judge-dev.tar -C .scratch/judge-dev
//   npx tsx tools/capture-water-light.ts [--dev .scratch/judge-dev] [--out docs/sheets/water-light.jpg]
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
const OUT = arg("out") ?? "docs/sheets/water-light.jpg";
const PORT = Number(arg("port") ?? 4995);
const CLOCK = 12.5;
const YAW = -Math.PI / 6;
const MAP = "#s=4242&z=256&d=n&t=riverValley";

/** Page side: the views. The grassy valley: the most all-grass dry tops (moisture 5 up) round a point; the cliff: the
 *  most drop between neighbouring tops round a dry point; the lake: the most clean water round a point; pure badwater
 *  (the deepest tile whose 7×7 is all wet and nearly all bad); and where badwater meets clean water (the most change of
 *  share over 11×11 with both waters near). */
const FIND_JS = `([yaw]) => {
  const r = window.dgm3d.renderer;
  const m = r.map, s = m.surface, W = m.W, H = m.H, soil = m.soil;
  const wet = (i) => s.surface[i] === s.surface[i] && s.depth[i] > 0.05;
  const top = (i) => (wet(i) ? s.surface[i] : m.heights[i]);
  const at = (i) => [i % W + 0.5, top(i), -(Math.floor(i / W) + 0.5)];
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
  let i = bestOf(grass, 9);
  if (i >= 0) views.grass = { mode: "orbit", yaw, pitch: 0.85, distance: 34, target: at(i) };
  const drop = (j, x, y) => {
    if (wet(j) || x + 1 >= W || y + 1 >= H) return 0;
    return Math.min(4, Math.abs(m.heights[j + 1] - m.heights[j])) + Math.min(4, Math.abs(m.heights[j + W] - m.heights[j]));
  };
  i = bestOf(drop, 6);
  if (i >= 0) views.cliff = { mode: "orbit", yaw, pitch: 0.55, distance: 30, target: at(i) };
  const clean = (j) => (wet(j) && s.contamination[j] < 0.02 ? 1 : 0);
  i = bestOf(clean, 10);
  if (i >= 0) views.lake = { mode: "orbit", yaw, pitch: 0.9, distance: 40, target: at(i) };
  let best = -1, score = 0;
  for (let y = 8; y < H - 8; y++) for (let x = 8; x < W - 8; x++) {
    const k = y * W + x;
    if (!wet(k) || s.contamination[k] < 0.95) continue;
    let ok = true;
    for (let dy = -3; dy <= 3 && ok; dy++) for (let dx = -3; dx <= 3; dx++) { const j = k + dy * W + dx; if (!wet(j) || s.contamination[j] < 0.9 || Math.abs(s.surface[j] - s.surface[k]) > 0.3) { ok = false; break; } }
    if (ok && s.depth[k] > score) { score = s.depth[k]; best = k; }
  }
  if (best >= 0) views.pure = { mode: "orbit", yaw, pitch: 0.95, distance: 14, target: at(best) };
  const front = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const k = y * W + x;
    if (!wet(k)) continue;
    for (const j of [x + 1 < W ? k + 1 : -1, y + 1 < H ? k + W : -1]) {
      if (j < 0 || !wet(j) || Math.abs(s.surface[j] - s.surface[k]) > 0.35) continue;
      const d = Math.abs(s.contamination[j] - s.contamination[k]);
      front[k] += d; front[j] += d;
    }
  }
  best = -1; score = 0;
  for (let y = 8; y < H - 8; y += 2) for (let x = 8; x < W - 8; x += 2) {
    if (!wet(y * W + x)) continue;
    let sum = 0, cl = false, bad = false;
    for (let dy = -8; dy <= 8; dy++) for (let dx = -8; dx <= 8; dx++) {
      const j = (y + dy) * W + x + dx;
      if (!wet(j)) continue;
      if (Math.abs(dx) <= 5 && Math.abs(dy) <= 5) sum += front[j];
      if (s.contamination[j] < 0.05) cl = true;
      if (s.contamination[j] > 0.6) bad = true;
    }
    if (cl && bad && sum > score) { score = sum; best = y * W + x; }
  }
  if (best >= 0) views.front = { mode: "orbit", yaw, pitch: 0.95, distance: 24, target: at(best) };
  return views;
}`;

const SITES = [
  { key: "dev", label: "dev" },
  { key: "after", label: "this PR" },
] as const;
const SCENES = [
  { key: "grass", label: "A grassy valley" },
  { key: "cliff", label: "A cliff" },
  { key: "lake", label: "A lake" },
  { key: "pure", label: "Pure badwater" },
  { key: "front", label: "Badwater meeting clean water" },
] as const;

async function main() {
  const roots: Record<string, string> = { dev: DEV, after: resolve(".") };
  const servers: PreviewServer[] = [];
  const ports: Record<string, number> = {};
  for (const [k, s] of SITES.entries()) {
    ports[s.key] = PORT + k;
    servers.push(await site(roots[s.key], "water-light", s.key, ports[s.key]));
  }
  const browser = await chromium.launch({ channel: "chrome", headless: true, args: GPU_ARGS });
  try {
    const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1, colorScheme: "light" });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    const tool = await browser.newPage();
    // the views, found in this checkout's site and used for both
    await open(page, ports.after, MAP);
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
