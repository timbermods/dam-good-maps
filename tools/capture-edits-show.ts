// Captures for what an edit just changed in 3D (docs/progress/3d-view.md, "What an edit changed"; D488). Real Chrome,
// the site built from this checkout: on a generated map's cliff (Highlands 128 seed 12) a Block dig into the wall, an
// overhang built out of it, a block added on flat ground with the Block tool itself and an Erode click; on an official
// cave map (Hollows) a dig into a cave's wall under a layer cut and a Lower dab on a roof. Each as a short sequence:
// before, just after (the glow at its strongest) and faded. One small jpg sheet.
//
//   npx tsx tools/capture-edits-show.ts [--maps <folder with the official .timber files>] [--out docs/sheets/3d-edits-show.jpg]
//                                       [--only dig,overhang,tool,erode,hollows] [--looks standard,high] [--sizes 1920,1280]
//                                       [--map <fragment>] [--port 4817] [--no-build]

import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium, type Page } from "@playwright/test";
import { build, preview } from "vite";
import { waitForEditor } from "./wait-editor";

const arg = (name: string): string | undefined => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const PORT = Number(arg("port") ?? 4817);
const DIST = ".scratch/edits-show-dist";
const SHOTS = ".scratch/edits-show";
const OUT = arg("out") ?? "docs/sheets/3d-edits-show.jpg";
const ONLY = arg("only")?.split(",");
const LOOKS = (arg("looks") ?? "standard,high").split(",");
const SIZES = (arg("sizes") ?? "1920,1280").split(",");
const MAP = arg("map") ?? "s=12&z=128&d=n&t=highlands";
const MAP_DIRS = [arg("maps") ?? "", process.env.DGM_OFFICIAL_MAPS ?? "", ".scratch/official", resolve("../DamGoodMaps/.scratch/official")];
const MAP_DIR = MAP_DIRS.find((d) => d && existsSync(d));
const official = (name: string) => (MAP_DIR ? readdirSync(MAP_DIR).filter((f) => f.endsWith(".timber") && f.includes(name)).map((f) => join(MAP_DIR, f))[0] : undefined);
const want = (id: string) => !ONLY || ONLY.includes(id);

interface Shot {
  file: string;
  label: string;
}

type Glow = { added: number; removed: number; fade: number };
const glow = (page: Page) => page.evaluate(() => (window.dgm3d!.renderer as unknown as { editGlowDrawn: Glow }).editGlowDrawn);

async function frame(page: Page, x: number, y: number, top: number, yaw: number, pitch: number, distance: number): Promise<void> {
  await page.evaluate(([x, y, top, yaw, pitch, distance]) => window.dgm3d!.renderer.setView({ mode: "orbit", yaw, pitch, distance, target: [x + 0.5, top, -(y + 0.5)] }), [x, y, top, yaw, pitch, distance]);
  await page.waitForTimeout(400);
}

async function shoot(page: Page, name: string, label: string, shots: Shot[]): Promise<void> {
  const file = join(SHOTS, `${name}.png`);
  // (the middle of the view, where the edit is: the sheet stays small)
  const v = page.viewportSize()!;
  await page.screenshot({ path: file, clip: { x: Math.round(v.width * 0.25), y: Math.round(v.height * 0.2), width: Math.round(v.width * 0.5), height: Math.round(v.height * 0.56) } });
  shots.push({ file, label });
}

/** Before, just after and faded, round `edit` (which makes the edit and waits until it is on the map). */
async function sequence(page: Page, name: string, label: string, shots: Shot[], edit: () => Promise<void>): Promise<void> {
  await page.mouse.move(4, 300);
  await page.waitForTimeout(300);
  await shoot(page, `${name}-0`, `${label}: before`, shots);
  await edit();
  await page.waitForFunction(() => (window.dgm3d!.renderer as unknown as { editGlowDrawn: Glow }).editGlowDrawn.fade > 0, null, { timeout: 120_000, polling: 40 });
  const g = await glow(page);
  await shoot(page, `${name}-1`, `${label}: just after (${g.added} faces added, ${g.removed} opened, at ${g.fade.toFixed(2)})`, shots);
  await page.waitForFunction(() => (window.dgm3d!.renderer as unknown as { editGlowDrawn: Glow }).editGlowDrawn.fade === 0, null, { timeout: 10_000, polling: 40 });
  await page.waitForTimeout(200);
  await shoot(page, `${name}-2`, `${label}: a second later`, shots);
}

const edit = (page: Page, params: unknown, label: string) =>
  page.evaluate(
    async ([p, l]) => {
      await window.dgmEditor!.edit({ op: "blocks", params: p } as never, l as string);
      await window.dgmEditor!.idle();
    },
    [params, label] as const,
  );

async function openGenerated(page: Page, fragment: string): Promise<void> {
  await page.goto("about:blank");
  await page.goto(`http://localhost:${PORT}/#${fragment}`);
  await waitForEditor(page, 180_000);
  await page.waitForTimeout(2500);
}

async function openImport(page: Page, path: string): Promise<void> {
  await page.goto("about:blank");
  await page.goto(`http://localhost:${PORT}/#s=1&z=96&d=n&t=riverValley`);
  await waitForEditor(page, 180_000);
  await page.getByLabel("Open a map or a project").setInputFiles(path);
  await page.waitForFunction(() => window.dgmEditor?.info().kind === "import" && !!window.dgm3d, null, { timeout: 180_000 });
  await page.waitForTimeout(2500);
}

/** A cliff on the map shown with a dry foot: a wall at least 3 over its foot for 5 tiles along, its tile at least 5 over
 *  the foot, high ground behind it; which way it faces (dx, dy: toward the foot) and the Block side of that face. */
async function cliff(page: Page): Promise<{ x: number; y: number; top: number; base: number; dx: number; dy: number; side: string }> {
  const spot = await page.evaluate(() => {
    const m = window.dgm3d!.renderer.mapState()!;
    const h = (x: number, y: number) => m.heights[y * m.W + x];
    const wet = (x: number, y: number) => m.surface.depth[y * m.W + x] > 0.01;
    const dirs = [
      [1, 0, "+x"],
      [-1, 0, "-x"],
      [0, 1, "+y"],
      [0, -1, "-y"],
    ] as const;
    // (clear of objects, which would stand in front of the edits)
    const busy = new Uint8Array(m.W * m.H);
    for (let k = 0; k < m.entities.count; k++)
      for (let dy = -10; dy <= 10; dy++) for (let dx = -10; dx <= 10; dx++) {
        const ex = m.entities.x[k] + dx;
        const ey = m.entities.y[k] + dy;
        if (ex >= 0 && ey >= 0 && ex < m.W && ey < m.H) busy[ey * m.W + ex] = 1;
      }
    let best: { x: number; y: number; top: number; base: number; dx: number; dy: number; side: string; score: number } | null = null;
    for (let y = 10; y < m.H - 10; y++)
      for (let x = 10; x < m.W - 10; x++)
        for (const [dx, dy, side] of dirs) {
          const t = h(x, y);
          const base = h(x + dx, y + dy);
          if (t - base < 5 || wet(x + dx, y + dy) || busy[y * m.W + x]) continue;
          // along the wall (perpendicular to its facing), and behind it
          const ax = dy !== 0 ? 1 : 0;
          const ay = dx !== 0 ? 1 : 0;
          let ok = true;
          let flat = 0;
          for (let k = -2; k <= 2 && ok; k++) {
            const wx = x + ax * k;
            const wy = y + ay * k;
            const fx = wx + dx;
            const fy = wy + dy;
            if (h(wx, wy) - h(fx, fy) < 3 || wet(fx, fy)) ok = false;
            if (Math.abs(h(fx, fy) - base) <= 1 && Math.abs(h(fx + dx, fy + dy) - base) <= 1 && !wet(fx + dx, fy + dy)) flat++;
            if (h(wx - dx * 2, wy - dy * 2) < base + 3) ok = false;
          }
          if (!ok || flat < 4) continue;
          const score = Math.min(t - base, 9) + flat;
          if (!best || score > best.score) best = { x, y, top: t, base, dx, dy, side, score };
        }
    return best;
  });
  if (!spot) throw new Error("no cliff found");
  return spot;
}

async function cliffEdits(page: Page, look: string, size: string, shots: Shot[]): Promise<void> {
  await openGenerated(page, MAP);
  const c = await cliff(page);
  console.log(`cliff at (${c.x}, ${c.y}) facing ${c.side}, top ${c.top}, foot ${c.base}`);
  // the camera out from the cliff's face, a little to one side, looking at it
  const yaw = Math.atan2(c.dx, -c.dy) + 0.35;
  const ax = c.dy !== 0 ? 1 : 0;
  const ay = c.dx !== 0 ? 1 : 0;
  await frame(page, c.x + c.dx * 2, c.y + c.dy * 2, c.base + 2, yaw, 0.55, 34);
  const tag = `${look}, ${size}`;
  if (want("dig")) await sequence(page, `dig-${look}-${size}`, `Block dig into a cliff (Size 2), ${tag}`, shots, () => edit(page, { mode: "remove", side: c.side, at: [[c.x, c.y, c.base + 1]], size: 2 }, "Dig"));
  if (want("overhang")) await sequence(page, `overhang-${look}-${size}`, `Block overhang out of the cliff (Size 2), ${tag}`, shots, () => edit(page, { mode: "add", side: c.side, at: [[c.x + ax * 2, c.y + ay * 2, c.base + 3]], size: 2 }, "Overhang"));
  if (want("tool") && size === "1920") {
    // the Block tool itself: a click on the flat ground at the cliff's foot (plain ground: it glows only from the Block tool)
    await page.keyboard.press("7");
    const fx = c.x + c.dx * 2 - ax * 2;
    const fy = c.y + c.dy * 2 - ay * 2;
    const fz = await page.evaluate(([x, y]) => window.dgm3d!.renderer.heightAt(x, y), [fx, fy] as const);
    await sequence(page, `tool-${look}-${size}`, `The Block tool's click on the ground at the foot (plain), ${tag}`, shots, async () => {
      const p = await page.evaluate(([x, y, z]) => {
        const r = window.dgm3d!.renderer;
        const q = r.project(x + 0.5, z, -(y + 0.5));
        const b = r.canvas.getBoundingClientRect();
        return { x: q.x + b.left, y: q.y + b.top };
      }, [fx, fy, fz] as const);
      await page.mouse.move(p.x - 2, p.y - 2);
      await page.mouse.move(p.x, p.y, { steps: 2 });
      await page.waitForFunction(() => !!window.dgmEditor!.block().preview, null, { timeout: 15_000, polling: 40 });
      const n = await page.evaluate(() => window.dgmEditor!.info().edits);
      await page.mouse.down();
      await page.mouse.up();
      await page.waitForFunction((n) => window.dgmEditor!.info().edits > n, n, { timeout: 15_000, polling: 40 });
      await page.mouse.move(4, 300);
    });
    await page.keyboard.press("Escape");
  }
}

/** An Erode click on the cliff's face, on the map as it was made (a force leaves the ground by a cave as it is). */
async function erode(page: Page, look: string, size: string, shots: Shot[]): Promise<void> {
  await openGenerated(page, MAP);
  const c = await cliff(page);
  const yaw = Math.atan2(c.dx, -c.dy) + 0.35;
  await frame(page, c.x + c.dx * 2, c.y + c.dy * 2, c.base + 2, yaw, 0.55, 34);
  await page.keyboard.press("Shift+Digit8");
  await sequence(page, `erode-${look}-${size}`, `An Erode click on the cliff's face, ${look}, ${size}`, shots, async () => {
    const p = await page.evaluate(([x, y, z]) => {
      const r = window.dgm3d!.renderer;
      const q = r.project(x, z, -y);
      const b = r.canvas.getBoundingClientRect();
      return { x: q.x + b.left, y: q.y + b.top };
    }, [c.x + 0.5 + c.dx * 0.5, c.y + 0.5 + c.dy * 0.5, c.base + 2.5] as const);
    await page.mouse.click(p.x, p.y);
    await page.mouse.move(4, 300);
    // (its frames each add to the glow: the shot once they stop, the whole of what it wore glowing)
    await page.evaluate(
      () =>
        new Promise<void>((done) => {
          const r = window.dgm3d!.renderer as unknown as { editGlowDrawn: Glow };
          let seen = -1;
          let since = performance.now();
          const id = setInterval(() => {
            const n = r.editGlowDrawn.removed + r.editGlowDrawn.added;
            if (n !== seen) (seen = n), (since = performance.now());
            else if (n > 0 && performance.now() - since > 150) {
              clearInterval(id);
              done();
            }
          }, 30);
        }),
    );
  });
  await page.keyboard.press("Escape");
}

/** On Hollows: a wall inside a cave (air with rock east of it, a floor under it, the roof well over it). */
async function caveWall(page: Page): Promise<{ x: number; y: number; z: number; top: number } | null> {
  return page.evaluate(() => {
    const m = (window.dgm3d!.renderer as unknown as { map: { W: number; H: number; heights: Uint8Array; source: { masks?: Uint32Array } } }).map;
    const ms = m.source.masks;
    if (!ms) return null;
    const mk = (i: number) => (ms[i] ? ms[i] : (1 << m.heights[i]) - 1);
    let best: { x: number; y: number; z: number; top: number; score: number } | null = null;
    for (let y = 8; y < m.H - 8; y++)
      for (let x = 8; x < m.W - 8; x++) {
        const i = y * m.W + x;
        if (!ms[i]) continue;
        const a = mk(i);
        const e = mk(i + 1);
        for (let z = 1; z < 18; z++) {
          // air here and above, a floor under it, rock east of it at this level and the next
          if ((a >> z) & 1 || (a >> (z + 1)) & 1 || !((a >> (z - 1)) & 1) || !((e >> z) & 1) || !((e >> (z + 1)) & 1)) continue;
          let room = 0;
          for (let dy = -3; dy <= 3; dy++) for (let dx = -4; dx <= 0; dx++) if (!((mk(i + dy * m.W + dx) >> z) & 1)) room++;
          if (!best || room > best.score) best = { x, y, z, top: m.heights[i], score: room };
        }
      }
    return best;
  });
}

async function hollows(page: Page, look: string, size: string, shots: Shot[]): Promise<void> {
  const f = official("Hollows");
  if (!f) return console.log("Hollows: not found (pass --maps)");
  await openImport(page, f);
  const w = await caveWall(page);
  if (!w) return console.log("Hollows: no cave wall found");
  console.log(`Hollows: cave wall at (${w.x}, ${w.y}) layer ${w.z}, top ${w.top}`);
  const tag = `${look}, ${size}`;
  await page.evaluate((cut) => window.dgm3d!.renderer.setSlice(cut), w.z + 3);
  await frame(page, w.x, w.y, w.z, -Math.PI / 2 + 0.4, 0.75, 24);
  await sequence(page, `hollows-dig-${look}-${size}`, `Hollows cut at ${w.z + 3}, Block dig into a cave's wall (Size 2), ${tag}`, shots, () => edit(page, { mode: "remove", side: "-x", at: [[w.x + 1, w.y, w.z]], size: 2, cut: w.z + 3 }, "Dig"));
  await page.evaluate(() => window.dgm3d!.renderer.setSlice(null));
  if (size !== "1920") return;
  // a Lower dab on a roof: the roof's top a stroke takes glows when the worker's columns come
  const roof = await page.evaluate(() => {
    const m = (window.dgm3d!.renderer as unknown as { map: { W: number; H: number; heights: Uint8Array; source: { masks?: Uint32Array } } }).map;
    const ms = m.source.masks!;
    for (let y = 12; y < m.H - 12; y++)
      for (let x = 12; x < m.W - 12; x++) {
        let ok = true;
        for (let dy = -2; dy <= 2 && ok; dy++)
          for (let dx = -2; dx <= 2 && ok; dx++) {
            const i = (y + dy) * m.W + x + dx;
            const k = ms[i];
            const h = m.heights[i];
            // a roof three or more thick over air
            ok = !!k && ((k >> (h - 1)) & 1) === 1 && ((k >> (h - 2)) & 1) === 1 && ((k >> (h - 3)) & 1) === 1 && (k & ((1 << (h - 3)) - 1)) !== (1 << (h - 3)) - 1;
          }
        if (ok) return { x, y, top: m.heights[y * m.W + x] };
      }
    return null;
  });
  if (!roof) return console.log("Hollows: no roof for the dab");
  await frame(page, roof.x, roof.y, roof.top, 0.6, 0.85, 30);
  await page.keyboard.press("3");
  await sequence(page, `hollows-dab-${look}-${size}`, `Hollows, a Lower dab on a roof, ${tag}`, shots, async () => {
    const p = await page.evaluate(([x, y]) => window.dgmEditor!.tileToClient(x, y), [roof.x, roof.y] as [number, number]);
    const n = await page.evaluate(() => window.dgmEditor!.info().edits);
    await page.mouse.move(p.x, p.y, { steps: 2 });
    await page.mouse.down();
    await page.waitForTimeout(120);
    await page.mouse.up();
    await page.waitForFunction((n) => window.dgmEditor!.info().edits > n, n, { timeout: 15_000, polling: 40 });
    await page.mouse.move(4, 300);
  });
  await page.keyboard.press("Escape");
}

async function sheet(page: Page, shots: Shot[]): Promise<void> {
  const cells = shots.map((s) => `<figure><img src="file:///${resolve(s.file).replace(/\\/g, "/")}"><figcaption>${s.label}</figcaption></figure>`).join("");
  const html = `<!doctype html><meta charset="utf-8"><style>
    body { margin: 0; padding: 12px; background: #1b1d22; color: #e8e6e1; font: 13px system-ui, sans-serif; width: 1776px; }
    h1 { font-size: 16px; margin: 0 0 10px; }
    .grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; }
    figure { margin: 0; } img { width: 100%; display: block; border-radius: 4px; }
    figcaption { padding: 4px 2px 0; color: #c9c6bf; }
  </style><h1>What an edit just changed in 3D (D488): before, just after, a second later; real Chrome</h1><div class="grid">${cells}</div>`;
  const htmlFile = resolve(SHOTS, "sheet.html");
  writeFileSync(htmlFile, html);
  await page.setViewportSize({ width: 1800, height: 1000 });
  await page.goto(`file:///${htmlFile.replace(/\\/g, "/")}`);
  await page.waitForTimeout(500);
  await page.screenshot({ path: OUT, type: "jpeg", quality: 62, fullPage: true });
  console.log(`wrote ${OUT}`);
}

async function main() {
  mkdirSync(SHOTS, { recursive: true });
  process.env.DGM_BASE = "/";
  if (!process.argv.includes("--no-build")) {
    console.log("building the site…");
    await build({ configFile: "vite.config.ts", base: "/", logLevel: "warn", build: { outDir: DIST, emptyOutDir: true } });
  }
  const server = await preview({ configFile: "vite.config.ts", base: "/", build: { outDir: DIST }, preview: { port: PORT, strictPort: true }, logLevel: "warn" });
  const browser = await chromium.launch({ channel: "chrome", headless: false });
  const shots: Shot[] = [];
  const errors: string[] = [];
  try {
    const sizes: [string, { width: number; height: number }, "dark" | "light"][] = [
      ["1920", { width: 1920, height: 1080 }, "dark"],
      ["1280", { width: 1280, height: 800 }, "light"],
    ];
    for (const look of LOOKS)
      for (const [size, viewport, scheme] of sizes) {
        if (!SIZES.includes(size)) continue;
        // (each scene in a context of its own: the page reopens an address on the project it last edited there)
        const scene = async (run: (page: Page) => Promise<void>) => {
          const context = await browser.newContext({ viewport, deviceScaleFactor: 1, colorScheme: scheme });
          await context.addInitScript(`try { localStorage.setItem('dgm.look', '${look}'); } catch {}`);
          await context.addInitScript("window.__name = (f) => f");
          const page = await context.newPage();
          page.on("pageerror", (e) => errors.push(String(e)));
          page.on("console", (m) => m.type() === "error" && errors.push(m.text().slice(0, 300)));
          await run(page);
          await context.close();
        };
        if (want("erode") && size === "1920") await scene((page) => erode(page, look, size, shots));
        if (want("dig") || want("overhang") || want("tool")) await scene((page) => cliffEdits(page, look, size, shots));
        if (want("hollows")) await scene((page) => hollows(page, look, size, shots));
      }
    const page = await browser.newPage();
    await sheet(page, shots);
    if (errors.length) console.log(`page errors: ${errors.join("; ")}`);
  } finally {
    await browser.close();
    await server.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
