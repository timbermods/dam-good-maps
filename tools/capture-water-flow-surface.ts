// The water's flow-carried surface (Q9 P5, P11; D496, D497): before and after, dev against this checkout, Standard and
// High, the same maps from the same cameras at the same moment: a river close up, a lake, a fall, and badwater meeting
// clean water. With --motion, also the river close up at six moments half a second apart (both looks, this checkout
// only), to check by eye that the texture flows downstream and that no seam shows where a phase jumps.
//
//   git archive --output=.scratch/judge-dev.tar origin/dev index.html real-places src public vite.config.ts tsconfig.json package.json tools/rust/vite-plugin.mjs
//   mkdir -p .scratch/judge-dev && tar -xf .scratch/judge-dev.tar -C .scratch/judge-dev
//   npx tsx tools/capture-water-flow-surface.ts [--before .scratch/judge-dev] [--out docs/sheets/water-flow-surface.jpg] [--motion]
//
// Our own generated maps only; the views are found in each map's water (page side), the same in both sites.

import { resolve } from "node:path";
import { chromium } from "@playwright/test";
import type { PreviewServer } from "vite";
import { GPU_ARGS, VIEWPORT, grid, open, setLook, shot as shotAt, site as siteOf, type View } from "./water-capture";

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const BEFORE = resolve(arg("before") ?? ".scratch/judge-dev");
const OUT = arg("out") ?? "docs/sheets/water-flow-surface.jpg";
const MOTION = process.argv.includes("--motion");
const PORT = Number(arg("port") ?? 4981);
const CLOCK = 12.5;
const YAW = -Math.PI / 6;

/** Page side: the views in the map's water: a narrow clean river with the fastest flow, the widest deep clean lake,
 *  a fall facing the camera, and where badwater meets clean water. */
const FIND_JS = `([yaw]) => {
  const r = window.dgm3d.renderer;
  const m = r.map, s = m.surface, W = m.W, H = m.H;
  const wet = (i) => s.surface[i] === s.surface[i] && s.depth[i] > 0.05;
  const at = (i) => [i % W + 0.5, s.surface[i], -(Math.floor(i / W) + 0.5)];
  const speed = (i) => { const o = s.outflow, k = s.top[i]; return o && k >= 0 ? Math.hypot(o[k * 4 + 3] - o[k * 4 + 1], o[k * 4 + 2] - o[k * 4]) : 0; };
  const views = {};
  let best = -1, score = 0;
  for (let y = 6; y < H - 6; y++) for (let x = 6; x < W - 6; x++) {
    const i = y * W + x;
    if (!wet(i) || s.contamination[i] > 0.02) continue;
    let n = 0, level = true;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const j = i + dy * W + dx; if (wet(j)) { n++; if (Math.abs(s.surface[j] - s.surface[i]) > 0.3) level = false; } }
    const v = n >= 7 && n <= 15 && level ? speed(i) : 0;
    if (v > score) { score = v; best = i; }
  }
  if (best >= 0) views.river = { mode: "orbit", yaw, pitch: 0.95, distance: 16, target: at(best) };
  best = -1; score = 0;
  for (let y = 10; y < H - 10; y += 2) for (let x = 10; x < W - 10; x += 2) {
    let n = 0;
    for (let dy = -10; dy <= 10; dy += 2) for (let dx = -10; dx <= 10; dx += 2) { const j = (y + dy) * W + x + dx; if (wet(j) && s.depth[j] > 1 && s.contamination[j] < 0.02) n++; }
    if (n > score) { score = n; best = y * W + x; }
  }
  if (best >= 0) views.lake = { mode: "orbit", yaw, pitch: 0.95, distance: 38, target: at(best) };
  // (a fall between two rivers, the tallest: the camera on its lower side, a little to one side of facing it)
  let fall = null;
  score = 0;
  for (let y = 4; y < H - 4; y++) for (let x = 4; x < W - 4; x++) {
    const i = y * W + x;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const j = i + dy * W + dx;
      if (!wet(i) || !wet(j) || s.contamination[i] > 0.05 || s.depth[i] < 0.3 || s.depth[j] < 0.3) continue;
      const drop = s.surface[i] - s.surface[j];
      if (drop >= 1 && drop <= 6 && drop > score) { score = drop; fall = { x, y, dx, dy, top: s.surface[i], low: s.surface[j] }; }
    }
  }
  if (fall) views.fall = { mode: "orbit", yaw: Math.atan2(fall.dx, -fall.dy) + 0.35, pitch: 0.5, distance: 20, target: [fall.x + 0.5 + fall.dx * 0.5, (fall.top + fall.low) / 2, -(fall.y + 0.5 + fall.dy * 0.5)] };
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
  if (best >= 0) views.badwater = { mode: "orbit", yaw, pitch: 0.95, distance: 24, target: at(best) };
  return views;
}`;

const SCENES = [
  { key: "river", label: "A river close up", fragment: "#s=4242&z=256&d=n&t=riverValley" },
  { key: "lake", label: "A lake", fragment: "#s=3&z=256&d=n&t=lakeBasin" },
  { key: "fall", label: "A fall", fragment: "#s=4242&z=256&d=n&t=riverValley" },
  { key: "badwater", label: "Badwater meeting clean water", fragment: "#s=4242&z=256&d=n&t=riverValley" },
] as const;

const site = (root: string, label: string, port: number): Promise<PreviewServer> => siteOf(root, "water-flow-surface", label, port);
const shot = (page: Parameters<typeof shotAt>[0], v: View, clock = CLOCK) => shotAt(page, v, clock);

async function main() {
  const servers = MOTION ? [null, await site(resolve("."), "after", PORT + 1)] : [await site(BEFORE, "dev", PORT), await site(resolve("."), "after", PORT + 1)];
  const browser = await chromium.launch({ channel: "chrome", headless: true, args: GPU_ARGS });
  try {
    const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1, colorScheme: "light" });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    const tool = await browser.newPage();
    // the views, found once (in this checkout's site) and used for both
    const views: Record<string, View> = {};
    for (const s of SCENES) {
      if (views[s.key]) continue;
      await open(page, PORT + 1, s.fragment);
      const found = (await page.evaluate(`(${FIND_JS})(${JSON.stringify([YAW])})`)) as Record<string, View>;
      for (const t of SCENES) if (t.fragment === s.fragment && found[t.key]) views[t.key] = found[t.key];
    }
    for (const s of SCENES) if (!views[s.key]) throw new Error(`no view found for ${s.key}`);
    if (MOTION) {
      const river = SCENES[0];
      await open(page, PORT + 1, river.fragment);
      for (const look of ["standard", "high"] as const) {
        await setLook(page, look);
        const images: Buffer[] = [];
        const labels: string[] = [];
        for (let k = 0; k < 6; k++) {
          const t = 10 + k * 0.5;
          images.push(await shot(page, views.river, t));
          labels.push(`${look}, t = ${t.toFixed(1)} s`);
        }
        await grid(tool, images, labels, 3, 0.5, resolve(`.scratch/water-flow-motion-${look}.jpg`));
      }
    } else {
      // (each map opened once a site; every look and view of it drawn there)
      const got = new Map<string, Buffer>();
      for (const [k, port] of [["dev", PORT], ["after", PORT + 1]] as const)
        for (const fragment of new Set(SCENES.map((s) => s.fragment))) {
          await open(page, port, fragment);
          for (const look of ["standard", "high"] as const) {
            await setLook(page, look);
            for (const s of SCENES) if (s.fragment === fragment) got.set(`${s.key}-${look}-${k}`, await shot(page, views[s.key]));
          }
        }
      const images: Buffer[] = [];
      const labels: string[] = [];
      for (const s of SCENES)
        for (const look of ["standard", "high"] as const)
          for (const k of ["dev", "after"] as const) {
            images.push(got.get(`${s.key}-${look}-${k}`)!);
            labels.push(`${s.label}: ${look === "standard" ? "Standard" : "High"}, ${k === "dev" ? "dev" : "the flow-carried surface"}`);
          }
      await grid(tool, images, labels, 4, 0.36, resolve(OUT));
    }
    if (errors.length) console.log(`page errors:\n${errors.join("\n")}`);
  } finally {
    await browser.close();
    for (const s of servers) if (s) await new Promise<void>((r) => s.httpServer.close(() => r()));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
