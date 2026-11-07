// What the water's before-and-after sheets share (tools/capture-water-flow-surface.ts, tools/capture-water-badwater.ts):
// a site built from a source tree and served, the editor opened at a map with its canvas the whole window, a look set,
// a shot from a view at a held moment, and a labelled grid of shots as a JPEG.

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { Page } from "@playwright/test";
import { build, preview, type PreviewServer } from "vite";
import { waitForEditor } from "./wait-editor";

export const VIEWPORT = { width: 1280, height: 800 };
export const GPU_ARGS = ["--enable-gpu", "--use-angle=d3d11", "--ignore-gpu-blocklist"];

export type View = { mode: "orbit"; yaw: number; pitch: number; distance: number; target: [number, number, number] };

/** Build the site of a source tree into .scratch/<prefix>-<label> and serve it on a port. */
export async function site(root: string, prefix: string, label: string, port: number): Promise<PreviewServer> {
  const outDir = resolve(`.scratch/${prefix}-${label}`);
  console.log(`building the ${label} site…`);
  process.env.DGM_BASE = "/";
  await build({ root, configFile: join(root, "vite.config.ts"), base: "/", logLevel: "warn", build: { outDir, emptyOutDir: true } });
  return preview({ root, configFile: join(root, "vite.config.ts"), base: "/", build: { outDir }, preview: { port, strictPort: true }, logLevel: "warn" });
}

/** Open the editor at a map, settled, its 3D canvas the whole window alone. */
export async function open(page: Page, port: number, fragment: string): Promise<void> {
  await page.goto("about:blank");
  await page.goto(`http://localhost:${port}/${fragment}`);
  await waitForEditor(page, 600_000);
  await page.mouse.move(2, 2);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(2500);
  await page.evaluate("window.dgmEditor.idle()");
  await page.addStyleTag({ content: `.view3d { position: fixed !important; left: 0 !important; top: 0 !important; width: ${VIEWPORT.width}px !important; height: ${VIEWPORT.height}px !important; z-index: 2147483647 !important; } .view3d > :not(canvas) { visibility: hidden !important; } .view3d > canvas { width: ${VIEWPORT.width}px !important; height: ${VIEWPORT.height}px !important; }` });
  await page.evaluate("window.dispatchEvent(new Event('resize'))");
  await page.waitForTimeout(500);
}

/** Set the look (High with every effect on), waiting for High's bakes. */
export async function setLook(page: Page, look: "standard" | "high"): Promise<void> {
  await page.evaluate(`(() => { const r = window.dgm3d.renderer; for (const k of Object.keys(r.highEffects ?? {})) r.setHighEffect(k, true); r.setLookChoice(${JSON.stringify(look)}, false); })()`);
  if (look === "high") await page.waitForFunction("window.dgm3d.renderer.highSettled", null, { timeout: 180_000 });
  await page.waitForTimeout(1500);
}

/** The canvas from a view, the water's clock held at `clock` seconds. */
export async function shot(page: Page, v: View, clock: number): Promise<Buffer> {
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

/** A labelled grid of shots written as a JPEG of at most about 900 KB. */
export async function grid(tool: Page, images: Buffer[], labels: string[], cols: number, scale: number, file: string): Promise<void> {
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
