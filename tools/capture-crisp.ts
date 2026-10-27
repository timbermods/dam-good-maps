// The map's crispness (feedback: "slightly blurry in both looks"): a before-and-after pair per look, at full
// size, each with a map overview and a close view at a slant where grass meets dry earth. "Before" is a site
// built from the commit before the fix; "after" is this checkout. Composites: before on the left, after on
// the right, each at the canvas's own size (judge the detail at full size). Our own generated map only.
//
//   git archive --output=.scratch/before-crisp.tar <commit> index.html real-places src public vite.config.ts tsconfig.json package.json
//   mkdir -p .scratch/before-crisp && tar -xf .scratch/before-crisp.tar -C .scratch/before-crisp
//   npx tsx tools/capture-crisp.ts [--before .scratch/before-crisp] [--out docs/look/high]

import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium, type Browser, type Page } from "@playwright/test";
import { build, preview, type PreviewServer } from "vite";
import { waitForEditor } from "./wait-editor";

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const BEFORE = resolve(arg("before") ?? ".scratch/before-crisp");
const OUT = arg("out") ?? "docs/look/high";
const PORT = Number(arg("port") ?? 4971);
const VIEWPORT = { width: 1280, height: 800 };
const CLOCK = 12.5;
const GPU_ARGS = ["--enable-gpu", "--use-angle=d3d11", "--ignore-gpu-blocklist"];
const DEFAULT_YAW = -Math.PI / 6;
const DEFAULT_PITCH = (70 * Math.PI) / 180;

const FRAGMENT = "#s=4242&z=256&d=n&t=riverValley";

/** Page side: the two views. */
const FIND_JS = `([kind, defaultYaw, defaultPitch]) => {
  const r = window.dgm3d.renderer;
  const m = r.map, s = m.surface, W = m.W, H = m.H, h = m.heights, mo = m.soil.moisture;
  const wet = (i) => s.surface[i] === s.surface[i];
  const at = (x, y) => h[Math.max(0, Math.min(H - 1, Math.round(y))) * W + Math.max(0, Math.min(W - 1, Math.round(x)))];
  let mean = 0; for (let i = 0; i < W * H; i++) mean += h[i]; mean /= W * H;
  if (kind === "overview") return { mode: "orbit", yaw: defaultYaw, pitch: defaultPitch, distance: Math.max(W, H) * 0.9, target: [W / 2, mean, -H / 2] };
  // close: a straight run of grass meeting dry earth at one height, seen from a slant
  let best = null, bd = 1e9;
  for (let y = 8; y < H - 12; y++) for (let x = 8; x < W - 8; x++) {
    let ok = true;
    for (let k = 0; k < 5 && ok; k++) { const a = (y + k) * W + x, b = a + 1; ok = mo[a] > 0 && mo[b] === 0 && h[a] === h[b] && !wet(a) && !wet(b) && mo[a - 1] > 0 && mo[b + 1] === 0; }
    if (!ok) continue;
    const d = Math.hypot(x - W / 2, y - H / 2);
    if (d < bd) { bd = d; best = { x: x + 1, y: y + 2.5 }; }
  }
  if (!best) return null;
  return { mode: "orbit", yaw: -0.5, pitch: 0.5, distance: 7, target: [best.x, at(best.x, best.y), -best.y] };
}`;

async function site(root: string, label: string, port: number): Promise<PreviewServer> {
  const outDir = resolve(`.scratch/capture-d324-${label}`);
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
  await page.evaluate(`window.dgm3d.renderer.setClock(${CLOCK})`);
  await page.addStyleTag({ content: "body * { visibility: hidden !important; } .view3d > canvas { visibility: visible !important; }" });
}

async function setLook(page: Page, look: "standard" | "high"): Promise<void> {
  await page.evaluate(`(() => { const r = window.dgm3d.renderer; for (const k of Object.keys(r.highEffects)) r.setHighEffect(k, true); r.setLookChoice(${JSON.stringify(look)}, false); })()`);
  await page.waitForFunction("window.dgm3d.renderer.highSettled", null, { timeout: 120_000 });
  await page.waitForTimeout(400);
}

async function shot(page: Page, v: unknown): Promise<Buffer> {
  await page.evaluate(`window.dgm3d.renderer.setView(${JSON.stringify(v)})`);
  await page.evaluate("new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(null))))");
  await page.waitForTimeout(300);
  await page.evaluate("window.dgm3d.renderer.renderNow()");
  return page.locator(".view3d > canvas").screenshot({ type: "png" });
}

/** Page side: the grid, a labelled band over each cell. */
const COMPOSE_JS = `async ({ images, labels, cols, scale, quality }) => {
  const imgs = await Promise.all(images.map(async (b64) => { const i = new Image(); i.src = "data:image/png;base64," + b64; await i.decode(); return i; }));
  const w = Math.round(imgs[0].width * scale), h = Math.round(imgs[0].height * scale);
  const gap = 5, band = 24;
  const rows = Math.ceil(imgs.length / cols);
  const c = document.createElement("canvas");
  c.width = cols * w + (cols - 1) * gap;
  c.height = rows * (h + band) + (rows - 1) * gap;
  const g = c.getContext("2d");
  g.fillStyle = "#1b1b1b";
  g.fillRect(0, 0, c.width, c.height);
  imgs.forEach((img, k) => {
    const x = (k % cols) * (w + gap), y = Math.floor(k / cols) * (h + band + gap);
    g.drawImage(img, x, y + band, w, h);
    g.fillStyle = "#f2f2f2";
    g.font = "14px system-ui, sans-serif";
    g.fillText(labels[k], x + 6, y + 17);
  });
  return c.toDataURL("image/jpeg", quality / 100).split(",")[1];
}`;

async function main() {
  mkdirSync(OUT, { recursive: true });
  const before = await site(BEFORE, "before", PORT);
  const after = await site(resolve("."), "after", PORT + 1);
  let browser: Browser | null = null;
  try {
    browser = await chromium.launch({ channel: "chrome", headless: true, args: GPU_ARGS });
    const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1, colorScheme: "light" });
    await context.addInitScript("try { localStorage.setItem('dgm.look', 'standard'); } catch {}");
    const page = await context.newPage();
    const tool = await browser.newPage();
    await tool.goto(`http://localhost:${PORT + 1}/`);
    const shots: Record<string, Buffer> = {};
    for (const [side, port] of [["before", PORT], ["after", PORT + 1]] as const) {
      await open(page, port, FRAGMENT);
      for (const look of ["standard", "high"] as const) {
        await setLook(page, look);
        for (const kind of ["overview", "close"] as const) {
          const v = await page.evaluate(`(${FIND_JS})(${JSON.stringify([kind, DEFAULT_YAW, DEFAULT_PITCH])})`);
          if (!v) throw new Error(`no ${kind} view`);
          shots[`${side}-${look}-${kind}`] = await shot(page, v);
        }
      }
    }
    for (const look of ["standard", "high"] as const)
      for (const kind of ["overview", "close"] as const) {
        const b64 = (await tool.evaluate(`(${COMPOSE_JS})(${JSON.stringify({ images: [shots[`before-${look}-${kind}`], shots[`after-${look}-${kind}`]].map((b) => b.toString("base64")), labels: [`${look === "high" ? "High" : "Standard"}, before: ${kind}`, `${look === "high" ? "High" : "Standard"}, after: ${kind}`], cols: 2, scale: 1, quality: 88 })})`)) as string;
        const file = join(OUT, `crisp-${look}-${kind}.jpg`);
        writeFileSync(file, Buffer.from(b64, "base64"));
        console.log(`${file}: ${Math.round(Buffer.from(b64, "base64").length / 1024)} KB`);
      }
  } finally {
    await browser?.close();
    await before.close();
    await after.close();
  }
}

await main();
