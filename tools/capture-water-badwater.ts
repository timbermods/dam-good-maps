// Badwater as the game draws it (Q9 P9; D496, D497): before and after, dev before the flow-carried surface, #826's
// surface and this checkout, Standard and High, the same map from the same cameras at the same moment: pure badwater
// close up, where badwater meets clean water, and a Badtide held, wide. With --motion, also the badwater close up at
// six moments half a second apart (both looks, this checkout only), to check by eye that the pattern flows downstream
// and that no seam shows where a phase jumps.
//
//   git archive --output=.scratch/judge-dev.tar <dev before #826> index.html real-places src public vite.config.ts tsconfig.json package.json tools/rust/vite-plugin.mjs
//   mkdir -p .scratch/judge-dev && tar -xf .scratch/judge-dev.tar -C .scratch/judge-dev   (and .scratch/judge-826 the same)
//   npx tsx tools/capture-water-badwater.ts [--dev .scratch/judge-dev] [--base .scratch/judge-826|none] [--out docs/sheets/water-badwater.jpg] [--motion]
//
// Our own generated maps only; the views are found in this checkout's water (page side) and used for every site.

import { resolve } from "node:path";
import { chromium, type Page } from "@playwright/test";
import type { PreviewServer } from "vite";
import { GPU_ARGS, VIEWPORT, grid, open, setLook, shot, site, type View } from "./water-capture";

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const DEV = resolve(arg("dev") ?? ".scratch/judge-dev");
const BASE = resolve(arg("base") ?? ".scratch/judge-826");
const OUT = arg("out") ?? "docs/sheets/water-badwater.jpg";
const MOTION = process.argv.includes("--motion");
const PORT = Number(arg("port") ?? 4991);
const CLOCK = 12.5;
const YAW = -Math.PI / 6;
const MAP = "#s=4242&z=256&d=n&t=riverValley";

/** Page side: pure badwater close up (the deepest tile whose 5×5 is all wet and nearly all bad), and where badwater
 *  meets clean water (the most change of share over 11×11 with both waters near). */
const FIND_JS = `([yaw]) => {
  const r = window.dgm3d.renderer;
  const m = r.map, s = m.surface, W = m.W, H = m.H;
  const wet = (i) => s.surface[i] === s.surface[i] && s.depth[i] > 0.05;
  const at = (i) => [i % W + 0.5, s.surface[i], -(Math.floor(i / W) + 0.5)];
  const views = {};
  let best = -1, score = 0;
  for (let y = 8; y < H - 8; y++) for (let x = 8; x < W - 8; x++) {
    const i = y * W + x;
    if (!wet(i) || s.contamination[i] < 0.95) continue;
    let ok = true;
    for (let dy = -3; dy <= 3 && ok; dy++) for (let dx = -3; dx <= 3; dx++) { const j = i + dy * W + dx; if (!wet(j) || s.contamination[j] < 0.9 || Math.abs(s.surface[j] - s.surface[i]) > 0.3) { ok = false; break; } }
    if (ok && s.depth[i] > score) { score = s.depth[i]; best = i; }
  }
  if (best >= 0) views.pure = { mode: "orbit", yaw, pitch: 0.95, distance: 14, target: at(best) };
  const front = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (!wet(i)) continue;
    for (const j of [x + 1 < W ? i + 1 : -1, y + 1 < H ? i + W : -1]) {
      if (j < 0 || !wet(j) || Math.abs(s.surface[j] - s.surface[i]) > 0.35) continue;
      const d = Math.abs(s.contamination[j] - s.contamination[i]);
      front[i] += d; front[j] += d;
    }
  }
  best = -1; score = 0;
  for (let y = 8; y < H - 8; y += 2) for (let x = 8; x < W - 8; x += 2) {
    if (!wet(y * W + x)) continue;
    let sum = 0, clean = false, bad = false;
    for (let dy = -8; dy <= 8; dy++) for (let dx = -8; dx <= 8; dx++) {
      const j = (y + dy) * W + x + dx;
      if (!wet(j)) continue;
      if (Math.abs(dx) <= 5 && Math.abs(dy) <= 5) sum += front[j];
      if (s.contamination[j] < 0.05) clean = true;
      if (s.contamination[j] > 0.6) bad = true;
    }
    if (clean && bad && sum > score) { score = sum; best = y * W + x; }
  }
  if (best >= 0) views.front = { mode: "orbit", yaw, pitch: 0.95, distance: 24, target: at(best) };
  return views;
}`;

/** Page side: a wide view of a Badtide's water: the badwater's middle (its wet tiles over half bad), from far enough to
 *  hold most of it. */
const WIDE_JS = `([yaw]) => {
  const r = window.dgm3d.renderer;
  const m = r.map, s = m.surface, W = m.W, H = m.H;
  let n = 0, sx = 0, sy = 0;
  for (let i = 0; i < W * H; i++) if (s.surface[i] === s.surface[i] && s.depth[i] > 0.05 && s.contamination[i] > 0.5) { n++; sx += i % W; sy += Math.floor(i / W); }
  if (!n) return null;
  const x = Math.round(sx / n), y = Math.round(sy / n), i = y * W + x;
  const h = s.surface[i] === s.surface[i] ? s.surface[i] : m.heights[i];
  return { mode: "orbit", yaw, pitch: 0.9, distance: Math.min(110, Math.max(45, Math.sqrt(n) * 1.6)), target: [x + 0.5, h, -(y + 0.5)] };
}`;

/** Hold a Badtide (the Water time bar's button, pressed under the canvas laid over the page), until its day is drawn. */
async function badtide(page: Page): Promise<void> {
  // (the bar is hidden under the canvas: found among hidden elements, clicked by its event)
  const bar = page.getByRole("toolbar", { name: "Water time", includeHidden: true });
  await bar.getByRole("button", { name: "Badtide", exact: true, includeHidden: true }).dispatchEvent("click");
  await page.waitForTimeout(800);
  await page.waitForFunction(() => !document.querySelector(".day-fill"), null, { timeout: 900_000 });
  await page.waitForTimeout(2500);
}

/** `--base none`: before and after only, dev (`--dev`) beside this checkout. */
const SITES = [
  { key: "dev", label: "dev" },
  { key: "826", label: "#826" },
  { key: "after", label: "this PR" },
].filter((s) => s.key !== "826" || arg("base") !== "none");
const SCENES = [
  { key: "pure", label: "Pure badwater close up" },
  { key: "front", label: "Badwater meeting clean water" },
  { key: "wide", label: "A Badtide, wide" },
] as const;

async function main() {
  const roots: Record<string, string> = { dev: DEV, "826": BASE, after: resolve(".") };
  const servers: PreviewServer[] = [];
  const ports: Record<string, number> = {};
  for (const [k, s] of SITES.entries()) {
    if (MOTION && s.key !== "after") continue;
    ports[s.key] = PORT + k;
    servers.push(await site(roots[s.key], "water-badwater", s.key, ports[s.key]));
  }
  const browser = await chromium.launch({ channel: "chrome", headless: true, args: GPU_ARGS });
  try {
    const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1, colorScheme: "light" });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    const tool = await browser.newPage();
    // the views, found in this checkout's site and used for every site
    await open(page, ports.after, MAP);
    const views = (await page.evaluate(`(${FIND_JS})(${JSON.stringify([YAW])})`)) as Record<string, View>;
    if (!MOTION) {
      await badtide(page);
      const wide = (await page.evaluate(`(${WIDE_JS})(${JSON.stringify([YAW])})`)) as View | null;
      if (wide) views.wide = wide;
    }
    for (const s of MOTION ? SCENES.slice(0, 1) : SCENES) if (!views[s.key]) throw new Error(`no view found for ${s.key}`);
    if (MOTION) {
      await open(page, ports.after, MAP);
      for (const look of ["standard", "high"] as const) {
        await setLook(page, look);
        const images: Buffer[] = [];
        const labels: string[] = [];
        for (let k = 0; k < 6; k++) {
          const t = 10 + k * 0.5;
          images.push(await shot(page, views.pure, t));
          labels.push(`${look}, t = ${t.toFixed(1)} s`);
        }
        await grid(tool, images, labels, 3, 0.5, resolve(`.scratch/water-badwater-motion-${look}.jpg`));
      }
    } else {
      const got = new Map<string, Buffer>();
      for (const s of SITES) {
        await open(page, ports[s.key], MAP);
        for (const look of ["standard", "high"] as const) {
          await setLook(page, look);
          for (const v of ["pure", "front"] as const) got.set(`${v}-${look}-${s.key}`, await shot(page, views[v], CLOCK));
        }
        await badtide(page);
        for (const look of ["standard", "high"] as const) {
          await setLook(page, look);
          got.set(`wide-${look}-${s.key}`, await shot(page, views.wide, CLOCK));
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
      await grid(tool, images, labels, SITES.length, SITES.length === 3 ? 0.36 : 0.5, resolve(OUT));
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
