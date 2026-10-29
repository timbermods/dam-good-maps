// The map's picture (D488, `render3d/hero.ts`), before and after a change: each map opened in the editor, its
// picture drawn as a save draws it (960×540, `heroPicture`), and a crop of it enlarged where its detail is judged
// (`--crop x,y,w,h` in the picture's pixels, per map, else none). Real Chrome on the GPU, headed.
//
//   git archive --output=.scratch/before-hero.tar origin/dev index.html real-places src public tools vite.config.ts tsconfig.json package.json
//   mkdir -p .scratch/before-hero && tar -xf .scratch/before-hero.tar -C .scratch/before-hero
//   npx tsx tools/capture-hero.ts --maps riverValley:4242@560,180,240,135;canyon:1 [--before .scratch/before-hero] [--out docs/sheets/hero.jpg]
//
// Without --before only the working tree's pictures are drawn. Each picture is also written whole beside the sheet
// (`<out>-<theme>-<seed>-<before|after>.jpg`) unless --sheet-only.

import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { chromium, type Page } from "@playwright/test";
import { build, preview, type PreviewServer } from "vite";
import { waitForEditor } from "./wait-editor";

const arg = (name: string, f?: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : f;
};
const MAPS = (arg("maps", "riverValley:4242") as string).split(";").map((m) => {
  const [spec, crop] = m.split("@");
  const [theme, seed] = spec.split(":");
  return { theme, seed: Number(seed), crop: crop ? (crop.split(",").map(Number) as [number, number, number, number]) : null };
});
const SIZE = Number(arg("size", "128"));
const BEFORE = arg("before");
const OUT = arg("out", ".scratch/hero/hero.jpg") as string;
const PORT = Number(arg("port", "4981"));
const WHOLE = !process.argv.includes("--sheet-only");

async function site(root: string, label: string, port: number): Promise<PreviewServer> {
  const outDir = resolve(`.scratch/capture-hero-${label}`);
  console.log(`building the ${label} site…`);
  await build({ root, configFile: join(root, "vite.config.ts"), base: "/", logLevel: "warn", build: { outDir, emptyOutDir: true } });
  return preview({ root, configFile: join(root, "vite.config.ts"), base: "/", build: { outDir }, preview: { port, strictPort: true }, logLevel: "warn" });
}

/** The map's picture, as a save draws it, from the map the view holds (its water as the view has it). */
async function picture(page: Page, port: number, theme: string, seed: number, chunk: string): Promise<Buffer> {
  await page.goto("about:blank");
  await page.goto(`http://localhost:${port}/#s=${seed}&z=${SIZE}&d=n&t=${theme}`);
  await waitForEditor(page, 600_000);
  await page.evaluate("window.dgmEditor.idle()");
  const b64 = (await page.evaluate(`(async () => {
    const hero = await import(${JSON.stringify(chunk)});
    const r = window.dgm3d.renderer, m = r.map;
    const jpeg = await hero.heroPicture({ W: m.W, H: m.H, heights: m.heights, columns: { tiles: r.columnsSent.tiles, voxels: r.columnsSent.voxels }, water: m.water, entities: m.entities, soil: m.soil ?? undefined });
    let s = '';
    for (let i = 0; i < jpeg.length; i++) s += String.fromCharCode(jpeg[i]);
    return btoa(s);
  })()`)) as string;
  return Buffer.from(b64, "base64");
}

const COMPOSE_JS = `async ({ images, labels, cols, scale }) => {
  const imgs = await Promise.all(images.map(async (b64) => { const i = new Image(); i.src = "data:image/jpeg;base64," + b64; await i.decode(); return i; }));
  const w = Math.round(imgs[0].width * scale), h = Math.round(imgs[0].height * scale);
  const gap = 6, band = 26;
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
    g.font = "16px system-ui, sans-serif";
    g.fillText(labels[k], x + 8, y + 19);
  });
  return c.toDataURL("image/jpeg", 0.86).split(",")[1];
}`;

/** A crop of a JPEG, enlarged to the picture's size (nearest, so its pixels show as they are). */
const CROP_JS = `async ({ b64, crop, w, h }) => {
  const i = new Image(); i.src = "data:image/jpeg;base64," + b64; await i.decode();
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  const g = c.getContext("2d"); g.imageSmoothingEnabled = false;
  g.drawImage(i, crop[0], crop[1], crop[2], crop[3], 0, 0, w, h);
  return c.toDataURL("image/jpeg", 0.92).split(",")[1];
}`;

async function main(): Promise<void> {
  mkdirSync(dirname(OUT), { recursive: true });
  const sites: [string, PreviewServer, number][] = [];
  if (BEFORE) sites.push(["before", await site(resolve(BEFORE), "before", PORT), PORT]);
  sites.push(["after", await site(resolve("."), "after", PORT + 1), PORT + 1]);
  const browser = await chromium.launch({ channel: "chrome", headless: false });
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1, colorScheme: "light" });
    await context.addInitScript("window.__name = (f) => f");
    const page = await context.newPage();
    const images: string[] = [];
    const labels: string[] = [];
    for (const m of MAPS) {
      for (const [label, , port] of sites) {
        const jpeg = await picture(page, port, m.theme, m.seed, findChunk(label));
        if (WHOLE) writeFileSync(OUT.replace(/\.jpg$/, `-${m.theme}-${m.seed}-${label}.jpg`), jpeg);
        const tag = sites.length > 1 ? `${label}: ` : "";
        images.push(jpeg.toString("base64"));
        labels.push(`${tag}${m.theme} ${SIZE}² seed ${m.seed}`);
        if (m.crop) {
          const crop = (await page.evaluate(`(${CROP_JS})(${JSON.stringify({ b64: jpeg.toString("base64"), crop: m.crop, w: 960, h: 540 })})`)) as string;
          images.push(crop);
          labels.push(`${tag}its ${m.crop[2]}×${m.crop[3]} px at ${m.crop[0]},${m.crop[1]}, ×${(960 / m.crop[2]).toFixed(1)}`);
        }
      }
    }
    const cols = MAPS.some((m) => m.crop) ? 2 : sites.length;
    const b64 = (await page.evaluate(`(${COMPOSE_JS})(${JSON.stringify({ images, labels, cols, scale: 0.5 })})`)) as string;
    writeFileSync(OUT, Buffer.from(b64, "base64"));
    console.log(`${OUT}: ${Math.round(Buffer.from(b64, "base64").length / 1024)} KB`);
  } finally {
    await browser.close();
    await Promise.all(sites.map(([, s]) => s.close?.().catch(() => {})));
  }
}

/** The hero chunk's address in a built site (`assets/hero-*.js`). */
function findChunk(label: string): string {
  const f = readdirSync(resolve(`.scratch/capture-hero-${label}/assets`)).find((n) => /^hero-.*\.js$/.test(n));
  if (!f) throw new Error(`no hero chunk in the ${label} site`);
  return `/assets/${f}`;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
