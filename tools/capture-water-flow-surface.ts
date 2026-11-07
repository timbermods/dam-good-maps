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

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { chromium, type Page } from "@playwright/test";
import { build, preview, type PreviewServer } from "vite";
import { waitForEditor } from "./wait-editor";

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const BEFORE = resolve(arg("before") ?? ".scratch/judge-dev");
const OUT = arg("out") ?? "docs/sheets/water-flow-surface.jpg";
const MOTION = process.argv.includes("--motion");
const PORT = Number(arg("port") ?? 4981);
const VIEWPORT = { width: 1280, height: 800 };
const CLOCK = 12.5;
const YAW = -Math.PI / 6;

type View = { mode: "orbit"; yaw: number; pitch: number; distance: number; target: [number, number, number] };

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

async function site(root: string, label: string, port: number): Promise<PreviewServer> {
  const outDir = resolve(`.scratch/water-flow-surface-${label}`);
  console.log(`building the ${label} site…`);
  process.env.DGM_BASE = "/";
  await build({ root, configFile: join(root, "vite.config.ts"), base: "/", logLevel: "warn", build: { outDir, emptyOutDir: true } });
  return preview({ root, configFile: join(root, "vite.config.ts"), base: "/", build: { outDir }, preview: { port, strictPort: true }, logLevel: "warn" });
}

async function open(page: Page, port: number, fragment: string): Promise<void> {
  await page.goto("about:blank");
  await page.goto(`http://localhost:${port}/${fragment}`);
  await waitForEditor(page, 600_000);
  await page.mouse.move(2, 2);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(2500);
  await page.evaluate("window.dgmEditor.idle()");
  // the canvas the whole window, alone
  await page.addStyleTag({ content: `.view3d { position: fixed !important; left: 0 !important; top: 0 !important; width: ${VIEWPORT.width}px !important; height: ${VIEWPORT.height}px !important; z-index: 2147483647 !important; } .view3d > :not(canvas) { visibility: hidden !important; } .view3d > canvas { width: ${VIEWPORT.width}px !important; height: ${VIEWPORT.height}px !important; }` });
  await page.evaluate("window.dispatchEvent(new Event('resize'))");
  await page.waitForTimeout(500);
}

async function setLook(page: Page, look: "standard" | "high"): Promise<void> {
  await page.evaluate(`(() => { const r = window.dgm3d.renderer; for (const k of Object.keys(r.highEffects ?? {})) r.setHighEffect(k, true); r.setLookChoice(${JSON.stringify(look)}, false); })()`);
  if (look === "high") await page.waitForFunction("window.dgm3d.renderer.highSettled", null, { timeout: 180_000 });
  await page.waitForTimeout(1500);
}

async function shot(page: Page, v: View, clock = CLOCK): Promise<Buffer> {
  await page.evaluate(`(() => { const r = window.dgm3d.renderer; r.setView(${JSON.stringify(v)}); r.setClock(${clock}); })()`);
  await page.evaluate("new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(null))))");
  await page.waitForTimeout(300);
  await page.evaluate("window.dgm3d.renderer.renderNow()");
  return page.locator(".view3d > canvas").screenshot({ type: "png" });
}

/** Page side: a labelled grid of images as a JPEG (base64). */
const GRID_JS = `async ({ images, labels, cols, scale, quality }) => {
  const imgs = await Promise.all(images.map(async (b64) => { const i = new Image(); i.src = "data:image/png;base64," + b64; await i.decode(); return i; }));
  const w = Math.round(imgs[0].width * scale), h = Math.round(imgs[0].height * scale);
  const gap = 6, band = 24, rows = Math.ceil(imgs.length / cols);
  const c = document.createElement("canvas");
  c.width = cols * w + (cols - 1) * gap; c.height = rows * (h + band) + (rows - 1) * gap;
  const g = c.getContext("2d");
  g.fillStyle = "#1b1b1b"; g.fillRect(0, 0, c.width, c.height);
  imgs.forEach((img, k) => {
    const x = (k % cols) * (w + gap), y = Math.floor(k / cols) * (h + band + gap);
    g.drawImage(img, x, y + band, w, h);
    g.fillStyle = "#f2f2f2"; g.font = "15px system-ui, sans-serif"; g.fillText(labels[k], x + 8, y + 17);
  });
  return c.toDataURL("image/jpeg", quality).split(",")[1];
}`;

async function grid(tool: Page, images: Buffer[], labels: string[], cols: number, scale: number, file: string): Promise<void> {
  for (let q = 0.85; ; q -= 0.05) {
    const b64 = (await tool.evaluate(`(${GRID_JS})(${JSON.stringify({ images: images.map((b) => b.toString("base64")), labels, cols, scale, quality: q })})`)) as string;
    const buf = Buffer.from(b64, "base64");
    if (buf.length <= 900_000 || q <= 0.5) {
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, buf);
      console.log(`${file}: ${Math.round(buf.length / 1024)} KB`);
      return;
    }
  }
}

async function main() {
  const servers = MOTION ? [null, await site(resolve("."), "after", PORT + 1)] : [await site(BEFORE, "dev", PORT), await site(resolve("."), "after", PORT + 1)];
  const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--enable-gpu", "--use-angle=d3d11", "--ignore-gpu-blocklist"] });
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
