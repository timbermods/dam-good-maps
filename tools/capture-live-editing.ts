// Live editing's D212 changes, before and after, for Kyler's look (PLAN §20 D212): the clear water
// round a brush over a river and on dry land beside it, all the water clear (T) where badwater
// meets clean water, a greyscale and colour-blindness sheet of that, and the top bar and the shelf
// with the sources moved onto it. Small PNGs, side by side, under docs/progress/live-editing/.
//
//   git archive --output=.scratch/before-live.tar 59f826c index.html real-places src public vite.config.ts tsconfig.json package.json
//   mkdir -p .scratch/before-live && tar -xf .scratch/before-live.tar -C .scratch/before-live
//   npx tsx tools/capture-live-editing.ts [--before .scratch/before-live] [--out docs/progress/live-editing]
//
// The before site is built from --before (59f826c is what the preview showed: push 4), the after
// site from this checkout (as `npm run try` builds it: what the preview shows); both are opened in
// the installed Chrome drawing on the GPU (the view's full look), the same map opened in the
// editor, and drawn from the same cameras at the same moment of the water's movement. Our own
// generated map only (River Valley 5, 128², where badwater meets clean water). Ports 4796 and 4797.

import { mkdirSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium, type Page } from "@playwright/test";
import { build, preview, type PreviewServer } from "vite";

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const BEFORE = resolve(arg("before") ?? ".scratch/before-live");
const OUT = arg("out") ?? "docs/progress/live-editing";
const FRAGMENT = "#s=5&z=128&d=n&t=riverValley";
const VIEWPORT = { width: 1200, height: 760 };
const CLOCK = 12.5;
/** The view's default camera: 30° east of north, 70° down (renderer.ts); a lower one for the water. */
const YAW = -Math.PI / 6;
const PITCH = (55 * Math.PI) / 180;

async function site(root: string, label: string, port: number, mode: string): Promise<PreviewServer> {
  const outDir = resolve(`.scratch/capture-live-${label}`);
  console.log(`building the ${label} site…`);
  process.env.DGM_BASE = "/";
  await build({ root, configFile: join(root, "vite.config.ts"), mode, base: "/", logLevel: "warn", build: { outDir, emptyOutDir: true } });
  return preview({ root, configFile: join(root, "vite.config.ts"), base: "/", build: { outDir }, preview: { port, strictPort: true }, logLevel: "warn" });
}

async function open(page: Page, port: number): Promise<void> {
  await page.goto("about:blank");
  await page.goto(`http://localhost:${port}/${FRAGMENT}`);
  await page.getByText(/All \d+ checks passed/).first().waitFor({ timeout: 240_000 });
  await page.getByRole("button", { name: "Refine this map" }).click();
  await page.waitForFunction("!!window.dgmEditor && !!window.dgm3d", null, { timeout: 180_000 });
  await page.mouse.move(2, 2);
  await page.keyboard.press("Escape");
  // the first run's hints away, then the background check (it may replace the water once)
  const close = page.getByRole("button", { name: /close|dismiss|×/i }).first();
  if (await close.isVisible().catch(() => false)) await close.click().catch(() => undefined);
  await page.waitForTimeout(3000);
  await page.evaluate("window.dgmEditor.idle()");
  const gpu = (await page.evaluate("window.dgm3d.renderer.gpu().renderer")) as string;
  if (/SwiftShader|llvmpipe|Software|Basic Render/i.test(gpu)) throw new Error(`the browser draws in software (${gpu}): the captures need the GPU`);
}

/** Page side: a clean river tile (half a level deep, wet all round), a dry tile beside it, and water partly
 *  bad near it (null when the map has none). */
const FIND_JS = `(() => {
  const m = window.dgm3d.renderer.mapState();
  const { W, H } = m;
  const d = m.surface.depth, c = m.surface.contamination;
  const wet = (x, y) => x >= 0 && y >= 0 && x < W && y < H && d[y * W + x] > 0.05;
  let river = null, best = 1e9;
  for (let y = 12; y < H - 12; y++)
    for (let x = 12; x < W - 12; x++) {
      const i = y * W + x;
      if (d[i] < 0.4 || c[i] > 0.02) continue;
      let ok = true;
      for (let dy = -1; dy <= 1 && ok; dy++) for (let dx = -1; dx <= 1 && ok; dx++) if (!wet(x + dx, y + dy) || c[(y + dy) * W + x + dx] > 0.02) ok = false;
      const s = Math.hypot(x - W / 2, y - H / 2);
      if (ok && s < best) { best = s; river = [x, y]; }
    }
  if (!river) return null;
  let dry = null; best = 1e9;
  for (let y = 4; y < H - 4; y++)
    for (let x = 4; x < W - 4; x++) {
      let near = false, clear = true;
      for (let dy = -7; dy <= 7; dy++) for (let dx = -7; dx <= 7; dx++) {
        if (!wet(x + dx, y + dy)) continue;
        if (Math.abs(dx) <= 4 && Math.abs(dy) <= 4) clear = false; else near = true;
      }
      const s = Math.hypot(x - river[0], y - river[1]);
      if (clear && near && s < best) { best = s; dry = [x, y]; }
    }
  let bad = null; best = 1e9;
  for (let i = 0; i < W * H; i++) {
    if (d[i] < 0.3 || c[i] < 0.3 || c[i] > 0.8) continue;
    const x = i % W, y = Math.floor(i / W);
    const s = Math.hypot(x - river[0], y - river[1]);
    if (s < best) { best = s; bad = [x, y]; }
  }
  const h = (t) => m.heights[t[1] * W + t[0]];
  return { river, dry, bad, hr: h(river), hd: dry ? h(dry) : 0, hb: bad ? h(bad) : 0 };
})()`;

interface Found {
  river: [number, number];
  dry: [number, number] | null;
  bad: [number, number] | null;
  hr: number;
  hd: number;
  hb: number;
}

async function view(page: Page, target: [number, number, number], distance: number): Promise<void> {
  await page.evaluate(`window.dgm3d.renderer.setView(${JSON.stringify({ mode: "orbit", yaw: YAW, pitch: PITCH, distance, target })})`);
  await page.evaluate(`window.dgm3d.renderer.setClock(${CLOCK})`);
}
async function pointAt(page: Page, x: number, y: number): Promise<void> {
  const p = (await page.evaluate(`window.dgmEditor.tileToClient(${x}, ${y})`)) as { x: number; y: number };
  await page.mouse.move(p.x + 4, p.y, { steps: 2 });
  await page.mouse.move(p.x, p.y, { steps: 2 });
}
/** The scene alone (the 3D view's canvas, drawn now at the same moment of the water's movement):
 *  the page's buttons, rows and notes are not in it; the brush ring and the ghost are. */
async function shot(page: Page): Promise<Buffer> {
  await page.evaluate("new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(null))))");
  await page.waitForTimeout(300);
  const url = (await page.evaluate(`(() => { const r = window.dgm3d.renderer; r.setClock(${CLOCK}); r.renderNow(); return r.canvas.toDataURL("image/png"); })()`)) as string;
  return Buffer.from(url.split(",")[1], "base64");
}

interface Shots {
  river: Buffer;
  dry: Buffer | null;
  all: Buffer;
  bar: Buffer;
}

async function captureSite(page: Page, port: number, f0: Found | null): Promise<{ shots: Shots; found: Found }> {
  await open(page, port);
  const found = (f0 ?? ((await page.evaluate(FIND_JS)) as Found | null))!;
  if (!found) throw new Error("no river on the map");
  // the top bar and the shelf, as a player sees them
  const box = (await page.locator(".editor-main").boundingBox())!;
  const bar = await page.screenshot({ clip: { x: box.x, y: box.y, width: Math.min(830, box.width), height: 270 } });
  const [rx, ry] = found.river;
  const mid: [number, number] = found.dry ? [rx * 0.7 + found.dry[0] * 0.3, ry * 0.7 + found.dry[1] * 0.3] : [rx, ry];
  await view(page, [mid[0] + 0.5, found.hr, -(mid[1] + 0.5)], 22);
  // a Lower brush over the river, then on dry land beside it
  await page.keyboard.press("2");
  await pointAt(page, rx, ry);
  const river = await shot(page);
  let dry: Buffer | null = null;
  if (found.dry) {
    await pointAt(page, found.dry[0], found.dry[1]);
    dry = await shot(page);
  }
  await page.mouse.move(2, 2);
  await page.keyboard.press("Escape");
  // all the water clear (T), where badwater meets clean water when the map has some
  const at = found.bad ?? found.river;
  await view(page, [at[0] + 0.5, found.bad ? found.hb : found.hr, -(at[1] + 0.5)], 24);
  await page.keyboard.press("t");
  const all = await shot(page);
  await page.keyboard.press("t");
  return { shots: { river, dry, all, bar }, found };
}

/** Page side: images side by side with their labels, optionally transformed (Machado, Oliveira
 *  and Fernandes 2009, severity 1, in linear RGB; greyscale as luminance), each channel rounded
 *  to `bits` bits so the PNG stays small. */
const IMAGES_JS = `async ({ images, labels, cols, scale, transform, bits, crop }) => {
  const imgs = await Promise.all(images.map(async (b64) => { const i = new Image(); i.src = "data:image/png;base64," + b64; await i.decode(); return i; }));
  const [cw, ch] = crop ?? [imgs[0].width, imgs[0].height];
  const cx = (imgs[0].width - cw) / 2, cy = (imgs[0].height - ch) / 2;
  const w = Math.round(cw * scale), h = Math.round(ch * scale);
  const gap = 6, band = 26;
  const rows = Math.ceil(imgs.length / cols);
  const c = document.createElement("canvas");
  c.width = cols * w + (cols - 1) * gap;
  c.height = rows * (h + band) + (rows - 1) * gap;
  const g = c.getContext("2d");
  g.fillStyle = "#1b1b1b";
  g.fillRect(0, 0, c.width, c.height);
  const M = {
    grey: [0.2126, 0.7152, 0.0722, 0.2126, 0.7152, 0.0722, 0.2126, 0.7152, 0.0722],
    protanopia: [0.152286, 1.052583, -0.204868, 0.114503, 0.786281, 0.099216, -0.003882, -0.048116, 1.051998],
    deuteranopia: [0.367322, 0.860646, -0.227968, 0.280085, 0.672501, 0.047413, -0.01182, 0.04294, 0.968881],
    tritanopia: [1.255528, -0.076749, -0.178779, -0.078411, 0.930809, 0.147602, 0.004733, 0.691367, 0.3039],
  };
  const table = new Float32Array(256);
  for (let k = 0; k < 256; k++) { const s = k / 255; table[k] = s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); }
  const enc = (v) => { const s = v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(Math.max(0, v), 1 / 2.4) - 0.055; return Math.max(0, Math.min(255, Math.round(s * 255))); };
  imgs.forEach((img, k) => {
    const x = (k % cols) * (w + gap), y = Math.floor(k / cols) * (h + band + gap);
    g.drawImage(img, cx, cy, cw, ch, x, y + band, w, h);
    const t = transform[k];
    if (t) {
      const m = M[t];
      const d = g.getImageData(x, y + band, w, h);
      const p = d.data;
      for (let i = 0; i < p.length; i += 4) {
        const r = table[p[i]], gg = table[p[i + 1]], b = table[p[i + 2]];
        p[i] = enc(m[0] * r + m[1] * gg + m[2] * b);
        p[i + 1] = enc(m[3] * r + m[4] * gg + m[5] * b);
        p[i + 2] = enc(m[6] * r + m[7] * gg + m[8] * b);
      }
      g.putImageData(d, x, y + band);
    }
    g.fillStyle = "#f2f2f2";
    g.font = "15px system-ui, sans-serif";
    g.fillText(labels[k], x + 8, y + 18);
  });
  const all = g.getImageData(0, 0, c.width, c.height);
  const q = 1 << (8 - bits);
  for (let i = 0; i < all.data.length; i++) if (i % 4 !== 3) all.data[i] = Math.min(255, Math.round(all.data[i] / q) * q);
  g.putImageData(all, 0, 0);
  return c.toDataURL("image/png").split(",")[1];
}`;

async function compose(tool: Page, images: Buffer[], labels: string[], cols: number, scale: number, transform: (string | null)[], file: string, budget: number, crop: [number, number] | null = null): Promise<number> {
  for (let bits = 6; ; bits--) {
    const b64 = (await tool.evaluate(`(${IMAGES_JS})(${JSON.stringify({ images: images.map((b) => b.toString("base64")), labels, cols, scale, transform, bits, crop })})`)) as string;
    const buf = Buffer.from(b64, "base64");
    if (buf.length <= budget || bits <= 4) {
      writeFileSync(file, buf);
      console.log(`  ${file}: ${Math.round(buf.length / 1024)} KB (${bits} bits a channel)`);
      return buf.length;
    }
  }
}

async function main() {
  statSync(join(BEFORE, "vite.config.ts"));
  mkdirSync(OUT, { recursive: true });
  const before = await site(BEFORE, "before", 4796, "production");
  const after = await site(resolve("."), "after", 4797, "try");
  const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--enable-gpu", "--use-angle=d3d11", "--ignore-gpu-blocklist"] });
  try {
    const page = await browser.newPage({ viewport: VIEWPORT });
    const a = await captureSite(page, 4797, null);
    const b = await captureSite(page, 4796, a.found);
    // the full-size shots, for a closer look (not committed)
    const raw = resolve(".scratch/capture-live-raw");
    mkdirSync(raw, { recursive: true });
    for (const [k, s] of Object.entries({ after: a.shots, before: b.shots })) for (const [n, buf] of Object.entries(s)) if (buf) writeFileSync(join(raw, `${k}-${n}.png`), buf);
    console.log(`river tile ${a.found.river.join(", ")}; dry tile ${a.found.dry?.join(", ") ?? "none"}; badwater ${a.found.bad?.join(", ") ?? "none"}`);
    const tool = await browser.newPage();
    let total = 0;
    const CROP: [number, number] = [760, 470];
    const brush = [b.shots.river, a.shots.river, ...(a.shots.dry && b.shots.dry ? [b.shots.dry, a.shots.dry] : [])];
    const brushWords = ["Before: a Lower brush over the river", "After: clear only round the brush", "Before: a Lower brush on dry land", "After: on dry land the water stays"].slice(0, brush.length);
    total += await compose(tool, brush, brushWords, 2, 0.46, brush.map(() => null), join(OUT, "clear-water-brush.png"), 230_000, CROP);
    total += await compose(tool, [b.shots.all, a.shots.all], ["Before: all the water clear (T)", "After (T): tint, ripples, a bright shoreline"], 2, 0.5, [null, null], join(OUT, "clear-water-all.png"), 150_000, CROP);
    total += await compose(tool, [a.shots.all, a.shots.all, a.shots.all, a.shots.all], ["After (T): greyscale", "Protanopia", "Deuteranopia", "Tritanopia"], 2, 0.42, ["grey", "protanopia", "deuteranopia", "tritanopia"], join(OUT, "clear-water-colour-blind.png"), 200_000, CROP);
    total += await compose(tool, [b.shots.bar, a.shots.bar], ["Before: Source in the top bar", "After: the sources on the shelf, after Start (the preview's build: Carve shows)"], 1, 0.66, [null, null], join(OUT, "shelf.png"), 150_000);
    console.log(`total ${Math.round(total / 1024)} KB`);
  } finally {
    await browser.close();
    before.httpServer.close();
    after.httpServer.close();
  }
}

await main();
