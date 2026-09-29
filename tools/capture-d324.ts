// D324 (PLAN §20; feedback items 1, 4, 5, 10, 28 and badwater's re-measure): one before-and-after set
// per item, Standard and High, on this machine's GPU. Each set is a grid: a row per view, four
// columns (Standard before, Standard after, High before, High after). "Before" is a site built from
// the commit before batch 4's; "after" is this checkout. Our own generated maps only; the page's
// buttons hidden, the water held at one moment.
//
//   git archive --output=.scratch/before-d324.tar b62188ba index.html real-places src public vite.config.ts tsconfig.json package.json
//   mkdir -p .scratch/before-d324 && tar -xf .scratch/before-d324.tar -C .scratch/before-d324
//   npx tsx tools/capture-d324.ts [--before .scratch/before-d324] [--out docs/look/high] [--only water,clear,land,falls,sources]

import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium, type Browser, type Page } from "@playwright/test";
import { build, preview, type PreviewServer } from "vite";

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const BEFORE = resolve(arg("before") ?? ".scratch/before-d324");
const OUT = arg("out") ?? "docs/look/high";
const ONLY = arg("only")?.split(",");
const PORT = Number(arg("port") ?? 4971);
const VIEWPORT = { width: 1280, height: 800 };
const CLOCK = 12.5;
const GPU_ARGS = ["--enable-gpu", "--use-angle=d3d11", "--ignore-gpu-blocklist"];
const DEFAULT_YAW = -Math.PI / 6;
const DEFAULT_PITCH = (70 * Math.PI) / 180;

type Kind = "badwater" | "clearBad" | "mine" | "top" | "cliff" | "fall" | "sourceClean" | "sourceBad";
interface Row {
  fragment: string;
  kind: Kind;
  label: string;
  /** Clear water (T) on for this row. */
  clear?: boolean;
}
interface SetCase {
  id: string;
  file: string;
  rows: Row[];
}

const LAKE = "#s=3&z=256&d=n&t=lakeBasin";
const RIVER = "#s=4242&z=256&d=n&t=riverValley";
const HIGHLANDS = "#s=2&z=256&d=n&t=highlands";

const SETS: SetCase[] = [
  {
    id: "water",
    file: "d324-water.jpg",
    rows: [
      { fragment: LAKE, kind: "badwater", label: "Lake Basin 3: badwater beside clean water" },
      { fragment: LAKE, kind: "mine", label: "Lake Basin 3: a mine pit" },
    ],
  },
  { id: "clear", file: "d324-clear-water.jpg", rows: [{ fragment: LAKE, kind: "clearBad", label: "Lake Basin 3: clear water (T), no hatching", clear: true }] },
  {
    id: "land",
    file: "d324-land.jpg",
    rows: [
      { fragment: RIVER, kind: "top", label: "River Valley 4242: top-down" },
      { fragment: HIGHLANDS, kind: "cliff", label: "Highlands 2: the tallest cliff" },
    ],
  },
  {
    id: "falls",
    file: "d324-falls.jpg",
    rows: [
      { fragment: HIGHLANDS, kind: "fall", label: "Highlands 2: the tallest fall" },
      { fragment: HIGHLANDS, kind: "cliff", label: "Highlands 2: a cascade of small falls" },
    ],
  },
  {
    id: "sources",
    file: "d324-sources.jpg",
    rows: [
      { fragment: LAKE, kind: "sourceClean", label: "Lake Basin 3: a water source (clear water, T)", clear: true },
      { fragment: LAKE, kind: "sourceBad", label: "Lake Basin 3: a badwater source, 3×3 (clear water, T)", clear: true },
    ],
  },
];

/** Page side: one view of the map. */
const FIND_JS = `([kind, defaultYaw, defaultPitch]) => {
  const r = window.dgm3d.renderer;
  const m = r.map, s = m.surface, W = m.W, H = m.H, h = m.heights, e = m.entities;
  const wet = (i) => s.surface[i] === s.surface[i];
  const at = (x, y) => h[Math.max(0, Math.min(H - 1, Math.round(y))) * W + Math.max(0, Math.min(W - 1, Math.round(x)))];
  const around = (x, y, d, pitch, yaw) => ({ mode: "orbit", yaw: yaw ?? defaultYaw, pitch, distance: d, target: [x + 0.5, at(x, y), -(y + 0.5)] });
  const entity = (name) => { for (let j = 0; j < e.count; j++) if (e.templates[e.template[j]] === name) return j; return -1; };
  if (kind === "badwater" || kind === "clearBad") {
    // badwater water itself, with clean water in reach: the most bad tiles round a spot that also has clean ones
    let best = -1, bx = -1, by = -1;
    for (let y = 4; y < H - 4; y += 2) for (let x = 4; x < W - 4; x += 2) {
      let bad = 0, clean = 0;
      for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) { const i = (y + dy) * W + x + dx; if (!wet(i)) continue; if (s.contamination[i] > 0.7) bad++; else if (s.contamination[i] < 0.2) clean++; }
      const v = clean >= 6 ? bad : 0;
      if (v > best) { best = v; bx = x; by = y; }
    }
    return bx < 0 ? null : kind === "clearBad" ? around(bx, by, 14, 0.95) : around(bx, by, 22, 0.8);
  }
  if (kind === "mine") { const k = entity("UndergroundRuins"); return k < 0 ? null : around(e.x[k] + 2, e.y[k] + 2, 13, 0.78); }
  if (kind === "sourceClean") { const k = entity("WaterSource"); return k < 0 ? null : around(e.x[k], e.y[k], 4.5, 0.95, 0.4); }
  if (kind === "sourceBad") { const k = entity("BadwaterSource"); return k < 0 ? null : around(e.x[k] + 1, e.y[k] + 1, 8, 0.95, 0.4); }
  if (kind === "top") return { mode: "top", yaw: 0, pitch: defaultPitch, distance: Math.max(W, H) * 1.25 * 0.45, target: [W / 2, at(W / 2, H / 2), -H / 2] };
  if (kind === "fall") {
    let best = -1, v = null;
    for (let y = 2; y < H - 2; y++) for (let x = 2; x < W - 2; x++) { const i = y * W + x; if (!wet(i)) continue; for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) { const j = (y + dy) * W + x + dx; if (!wet(j)) continue; const drop = s.surface[i] - s.surface[j]; if (drop > best) { best = drop; v = { mode: "orbit", yaw: Math.atan2(dx, -dy) - 0.5, pitch: 0.42, distance: Math.max(18, drop * 2.4 + 9), target: [x + 0.5 + dx * 1.2, s.surface[j] + drop * 0.3, -(y + 0.5 + dy * 1.2)] }; } } }
    return v;
  }
  if (kind === "cliff") {
    let best = -1, bx = W / 2, by = H / 2, byaw = 0;
    for (let y = 2; y < H - 2; y++) for (let x = 2; x < W - 2; x++) { const i = y * W + x; for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) { const d = h[i] - h[(y + dy) * W + x + dx]; if (d > best) { best = d; bx = x + dx; by = y + dy; byaw = Math.atan2(dx, -dy); } } }
    return { mode: "orbit", yaw: byaw, pitch: 0.28, distance: 32, target: [bx + 0.5, h[by * W + bx] + best * 0.5, -(by + 0.5)] };
  }
  return null;
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
  await page.getByText(/All \d+ checks passed/).first().waitFor({ timeout: 600_000 });
  await page.getByRole("button", { name: "Refine this map" }).click();
  await page.waitForFunction("!!window.dgmEditor && !!window.dgm3d", null, { timeout: 300_000 });
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

async function shot(page: Page, v: unknown, clear: boolean): Promise<Buffer> {
  await page.evaluate(`window.dgm3d.renderer.setClearWater(${clear})`);
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
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    const tool = await browser.newPage();
    await tool.goto(`http://localhost:${PORT}/`);
    for (const set of SETS) {
      if (ONLY && !ONLY.includes(set.id)) continue;
      console.log(set.id);
      // image[row][column]: before/after × Standard/High
      const cells: Buffer[][] = set.rows.map(() => []);
      const labels: string[][] = set.rows.map(() => []);
      for (const [side, port] of [["before", PORT], ["after", PORT + 1]] as const) {
        for (const [k, row] of set.rows.entries()) {
          await open(page, port, row.fragment);
          for (const [look, name] of [["standard", "Standard"], ["high", "High"]] as const) {
            await setLook(page, look);
            const v = await page.evaluate(`(${FIND_JS})(${JSON.stringify([row.kind, DEFAULT_YAW, DEFAULT_PITCH])})`);
            if (!v) throw new Error(`no ${row.kind} view on ${row.fragment}`);
            const idx = (look === "high" ? 2 : 0) + (side === "after" ? 1 : 0);
            cells[k][idx] = await shot(page, v, !!row.clear);
            labels[k][idx] = `${name}, ${side}: ${row.label}`;
          }
        }
      }
      // columns: Standard before, Standard after, High before, High after
      const images = cells.flat();
      const b64 = (await tool.evaluate(`(${COMPOSE_JS})(${JSON.stringify({ images: images.map((b) => b.toString("base64")), labels: labels.flat(), cols: 4, scale: 0.36, quality: 78 })})`)) as string;
      const buf = Buffer.from(b64, "base64");
      writeFileSync(join(OUT, set.file), buf);
      console.log(`  ${join(OUT, set.file)}: ${Math.round(buf.length / 1024)} KB`);
    }
    if (errors.length) console.log(`page errors: ${errors.join("; ")}`);
  } finally {
    await browser?.close();
    await before.close();
    await after.close();
  }
}

await main();
