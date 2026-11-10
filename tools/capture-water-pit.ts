// The clear water view's badwater and the mine pit beside badwater (D496 amended 2026-11-07; fix/water-veins): dev
// against this checkout, Standard and High, the same map from the same cameras at the same moment: badwater meeting
// clean water, pure badwater with the clear water view (T) on, and a mine site's pit near badwater. What moved: the
// clear water view keeps the badwater of the look it is in (High's crimson in High, where dev drew Standard's formula
// over it); the pit and the water's colours are unchanged (the game draws the pit lighter than badwater by day, as
// ours does).
//
//   git archive --output=.scratch/judge-dev.tar origin/dev index.html real-places src public vite.config.ts tsconfig.json package.json tools/rust/vite-plugin.mjs
//   mkdir -p .scratch/judge-dev && tar -xf .scratch/judge-dev.tar -C .scratch/judge-dev
//   npx tsx tools/capture-water-pit.ts [--dev .scratch/judge-dev] [--out docs/sheets/water-pit-clear.jpg]
//
// Our own generated map only; the views are found in this checkout's map (page side) and used for both sites.

import { resolve } from "node:path";
import { chromium, type Page } from "@playwright/test";
import type { PreviewServer } from "vite";
import { GPU_ARGS, VIEWPORT, grid, open, setLook, shot, site, type View } from "./water-capture";

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const DEV = resolve(arg("dev") ?? ".scratch/judge-dev");
const OUT = arg("out") ?? "docs/sheets/water-pit-clear.jpg";
const PORT = Number(arg("port") ?? 4997);
const CLOCK = 12.5;
const YAW = -Math.PI / 6;
const MAP = "#s=4242&z=256&d=n&t=riverValley";

/** Page side: the views. Pure badwater (the deepest tile whose 7×7 is all wet and nearly all bad); where badwater meets
 *  clean water (the most change of share over 11×11 with both waters near); and the mine site nearest pure badwater. */
const FIND_JS = `([yaw]) => {
  const r = window.dgm3d.renderer;
  const m = r.map, s = m.surface, W = m.W, H = m.H;
  const wet = (i) => s.surface[i] === s.surface[i] && s.depth[i] > 0.05;
  const top = (i) => (wet(i) ? s.surface[i] : m.heights[i]);
  const at = (i) => [i % W + 0.5, top(i), -(Math.floor(i / W) + 0.5)];
  const views = {};
  let best = -1, score = 0;
  for (let y = 8; y < H - 8; y++) for (let x = 8; x < W - 8; x++) {
    const k = y * W + x;
    if (!wet(k) || s.contamination[k] < 0.95) continue;
    let ok = true;
    for (let dy = -3; dy <= 3 && ok; dy++) for (let dx = -3; dx <= 3; dx++) { const j = k + dy * W + dx; if (!wet(j) || s.contamination[j] < 0.9 || Math.abs(s.surface[j] - s.surface[k]) > 0.3) { ok = false; break; } }
    if (ok && s.depth[k] > score) { score = s.depth[k]; best = k; }
  }
  const pure = best;
  if (best >= 0) views.pure = { mode: "orbit", yaw, pitch: 0.95, distance: 18, target: at(best) };
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
  // the mine site nearest pure badwater (a 5 × 5 centred on its origin + 2, 2 as it stands unturned)
  const e = m.entities;
  let mine = -1, md = Infinity;
  for (let k = 0; k < e.count; k++) {
    if (e.templates[e.template[k]] !== "UndergroundRuins") continue;
    const d = pure >= 0 ? Math.hypot(e.x[k] + 2 - (pure % W), e.y[k] + 2 - Math.floor(pure / W)) : 0;
    if (d < md) { md = d; mine = k; }
  }
  if (mine >= 0) views.pit = { mode: "orbit", yaw, pitch: 0.95, distance: 16, target: [e.x[mine] + 2.5, e.z[mine], -(e.y[mine] + 2.5)] };
  return views;
}`;

const SITES = [
  { key: "dev", label: "dev" },
  { key: "after", label: "this PR" },
] as const;
/** The scenes: a view and whether the clear water view (T) is on. */
const SCENES = [
  { key: "front", view: "front", clear: false, label: "Badwater meeting clean water" },
  { key: "pureClear", view: "pure", clear: true, label: "Badwater with clear water (T)" },
  { key: "frontClear", view: "front", clear: true, label: "The front with clear water (T)" },
  { key: "pit", view: "pit", clear: false, label: "A mine pit" },
] as const;

async function clearWater(page: Page, on: boolean): Promise<void> {
  await page.evaluate(`window.dgm3d.renderer.setClearWater(${on})`);
}

async function main() {
  const roots: Record<string, string> = { dev: DEV, after: resolve(".") };
  const servers: PreviewServer[] = [];
  const ports: Record<string, number> = {};
  for (const [k, s] of SITES.entries()) {
    ports[s.key] = PORT + k;
    servers.push(await site(roots[s.key], "water-pit", s.key, ports[s.key]));
  }
  const browser = await chromium.launch({ channel: "chrome", headless: true, args: GPU_ARGS });
  try {
    const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1, colorScheme: "light" });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    const tool = await browser.newPage();
    await open(page, ports.after, MAP);
    const views = (await page.evaluate(`(${FIND_JS})(${JSON.stringify([YAW])})`)) as Record<string, View>;
    for (const s of SCENES) if (!views[s.view]) throw new Error(`no view found for ${s.view}`);
    const got = new Map<string, Buffer>();
    for (const s of SITES) {
      await open(page, ports[s.key], MAP);
      for (const look of ["standard", "high"] as const) {
        await setLook(page, look);
        for (const v of SCENES) {
          await clearWater(page, v.clear);
          got.set(`${v.key}-${look}-${s.key}`, await shot(page, views[v.view], CLOCK));
        }
        await clearWater(page, false);
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
