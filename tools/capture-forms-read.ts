// How caves, overhangs and arches read (docs/progress/3d-view.md, "Caves that read in the game's light" and "Overhangs
// and arches that read"; D488 (3)). Real Chrome, headed, the site from this checkout's dev server: Canyon 128² seed 1
// (its spring cave, the overhang sheltering its start, the arch over its gorge) from inside the cave, closer to each
// form, the game's opening camera and the map's picture's framing; Standard and High; 1920×1080 dark and 1280×800 light.
// Each frame is measured: every 6th pixel is picked (`pickSeen`), sorted by the face it lands on (a top, a wall, an
// underside) and whether that face's air is under a roof, and its brightness (Rec. 709 luma of the sRGB bytes, 0–255)
// summed by kind.
//
//   npx tsx tools/capture-forms-read.ts --tag before           (frames and numbers into .scratch/forms-read/before/)
//   npx tsx tools/capture-forms-read.ts --tag after
//   npx tsx tools/capture-forms-read.ts --sheet caves --out docs/sheets/caves-bright.jpg   (before against after)
//   options: --only cave-inside,overhang  --looks standard,high  --sizes 1920,1280  --port 4795

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium, type Page } from "@playwright/test";
import { createServer } from "vite";
import { openingCamera, VISTA_ZOOM } from "../src/core/analysis/opening";
import { ORIENTATIONS, startMiddleTile } from "../src/core/format/footprints";
import { waitForEditor } from "./wait-editor";

const arg = (name: string): string | undefined => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const ROOT = resolve(import.meta.dirname, "..");
const BASE = join(ROOT, ".scratch/forms-read");
const PORT = Number(arg("port") ?? "4795");
/** The map (its share link's fragment): `--map riverValley:4242` for another theme and seed at 128². */
const MAP_ARG = (arg("map") ?? "canyon:1").split(":");
const MAP = `#s=${MAP_ARG[1]}&z=128&d=n&t=${MAP_ARG[0]}`;
const MAP_TAG = MAP_ARG.join("-");

type Size = "1920" | "1280";
const SIZES: Record<Size, { viewport: { width: number; height: number }; scheme: "dark" | "light" }> = {
  "1920": { viewport: { width: 1920, height: 1080 }, scheme: "dark" },
  "1280": { viewport: { width: 1280, height: 800 }, scheme: "light" },
};

interface View {
  yaw: number;
  pitch: number;
  distance: number;
  target: [number, number, number];
  fov?: number;
}
interface ShotDef {
  id: string;
  label: string;
  /** The view, or a way of working it out in the page (the opening camera, the picture's framing). */
  view: View | "opening" | "opening-first" | "hero";
  /** Page code run before the view is placed, after it, and once the frame is taken (a hazard day held, High's Fog off,
   *  the camera pulled back or turned to look straight down). */
  before?: string;
  after?: string;
  undo?: string;
  /** Only in these looks (High's own switches). */
  looks?: string[];
}

/** Tile (x, y) at level z as the renderer's world point. */
const at = (x: number, y: number, z: number): [number, number, number] => [x + 0.5, z, -(y + 0.5)];
/** The orbit's yaw that looks from tile (fx, fy) toward (ax, ay) (as tools/capture-forms3d.ts). */
const yawFrom = (ax: number, ay: number, fx: number, fy: number) => Math.atan2(fx - ax, -(fy - ay));

// Canyon 128² seed 1's forms (the generator's intentions): the spring cave's gallery at (31..34, 73..78), floor 9–11 under
// 1–2 levels of roof, its mouth facing south onto the river (level 8) at y 79; the start's overhang at (79, 85), seen from (81, 92); the arch at (101, 107) over the
// gorge (x 101–102, y 106–108, air from 3 under 1–4 levels of rock), seen from across the gorge to the north-east.
const SHOTS: ShotDef[] = [
  { id: "cave-inside", label: "inside the spring cave", view: { yaw: Math.PI, pitch: 0.1, distance: 3.6, target: at(32, 75, 11.2) } },
  { id: "cave-mouth", label: "the spring cave's mouth", view: { yaw: Math.PI + 0.25, pitch: 0.3, distance: 11, target: at(32, 77, 10.5) } },
  { id: "overhang", label: "the start's overhang", view: { yaw: yawFrom(79, 85, 81, 92), pitch: 0.3, distance: 11, target: at(79, 85, 10) } },
  { id: "overhang-under", label: "under the start's overhang", view: { yaw: Math.PI * 0.85, pitch: 0.05, distance: 3.2, target: at(80, 84, 10.4) } },
  { id: "arch", label: "the arch over the gorge", view: { yaw: yawFrom(101, 107, 110, 116), pitch: 0.35, distance: 14, target: at(101, 107, 6) } },
  { id: "opening", label: "the game's opening camera", view: "opening" },
  { id: "opening-first", label: "the game's first frame", view: "opening-first" },
  { id: "hero", label: "the map's picture", view: "hero" },
  // the finish's other views (D497): a held drought's fog colour, High with its Fog off, pulled back past the game's
  // farthest default zoom (the fog held at 154), and looking straight down (no fog)
  { id: "drought-first", label: "the game's first frame on a held drought day", view: "opening-first", before: `window.dgm3d.renderer.setSeason("drought")`, undo: `window.dgm3d.renderer.setSeason(null)` },
  { id: "fog-off", label: "the game's first frame, High's Fog off", view: "opening-first", looks: ["high"], before: `window.dgm3d.renderer.setHighEffect("fog", false)`, undo: `window.dgm3d.renderer.setHighEffect("fog", true)` },
  { id: "zoom-far", label: "pulled back to 300, past the game's farthest zoom", view: "opening", after: `window.dgm3d.renderer.setView({ distance: 300 })` },
  // the sun turning with the camera (D497): the first frame turned a quarter, the light still from behind the camera's
  // left shoulder
  { id: "turned-first", label: "the game's first frame, the camera turned a quarter", view: "opening-first", after: `(() => { const r = window.dgm3d.renderer; r.setView({ yaw: r.getView().yaw + Math.PI / 2 }); })()` },
  { id: "top-down", label: "straight down", view: "opening", after: `(() => { const r = window.dgm3d.renderer; const v = r.getView(); r.setView({ mode: "top", yaw: 0, pitch: v.pitch, distance: 120, target: v.target }); })()` },
];

/** The frame's numbers: kind → [pixels, mean luma, share under 40]. */
type Stats = Record<string, [number, number, number]>;

/** Pick every 6th pixel of the canvas and sort it by the face hit and its air (in the page; `png` the frame). */
const MEASURE = `async ([png, step]) => {
  const r = window.dgm3d.renderer;
  const m = r.map, src = m.source, W = m.W;
  const canvas = document.querySelector(".view3d > canvas") || [...document.querySelectorAll("canvas")].sort((a, b) => b.clientWidth * b.clientHeight - a.clientWidth * a.clientHeight)[0];
  const box = canvas.getBoundingClientRect();
  const img = new Image(); img.src = "data:image/png;base64," + png; await img.decode();
  const c = document.createElement("canvas"); c.width = img.width; c.height = img.height;
  const g = c.getContext("2d"); g.drawImage(img, 0, 0);
  const px = g.getImageData(0, 0, c.width, c.height).data;
  const sx = img.width / box.width, sy = img.height / box.height;
  const maskOf = (i) => (src.masks && src.columns.has(i) ? src.masks[i] : (1 << m.heights[i]) - 1);
  const roofed = (x, y, z) => {
    if (x < 0 || y < 0 || x >= W || y >= m.H || z < 0) return false;
    const k = maskOf(y * W + x);
    return z < 32 - Math.clz32(k) && !((k >>> z) & 1);
  };
  const N = { east: [1, 0, 0], west: [-1, 0, 0], north: [0, 1, 0], south: [0, -1, 0] };
  const { caveSample } = await import("/src/render3d/caveLight.ts");
  const acc = {};
  const add = (k, l) => { const a = (acc[k] ||= [0, 0, 0]); a[0]++; a[1] += l; if (l < 40) a[2]++; };
  const skyAcc = {};
  for (let y = step / 2; y < box.height; y += step)
    for (let x = step / 2; x < box.width; x += step) {
      const o = (Math.floor(y * sy) * c.width + Math.floor(x * sx)) * 4;
      const l = 0.2126 * px[o] + 0.7152 * px[o + 1] + 0.0722 * px[o + 2];
      add("all", l);
      const h = r.pickSeen(box.left + x, box.top + y);
      if (!h) { add("sky", l); continue; }
      const p = [h.point[0], -h.point[2], h.point[1]];
      const n = h.face === "top" ? [0, 0, 1] : h.face === "bottom" ? [0, 0, -1] : N[h.side];
      const air = roofed(Math.floor(p[0] + n[0] * 0.5), Math.floor(p[1] + n[1] * 0.5), Math.floor(p[2] + n[2] * 0.5));
      const face = h.face === "top" ? "floor" : h.face === "bottom" ? "ceiling" : "wall";
      add((air ? "roofed " : "open ") + face, l);
      if (air && r.cave) { const cs = caveSample(r.cave, h.point, [n[0], n[2], -n[1]]); if (cs) { const a = (skyAcc["sky " + face] ||= [0, 0]); a[0]++; a[1] += face === "floor" ? cs[0] : cs[2]; } }
      add(air ? "roofed" : "open", l);
    }
  const out = {};
  for (const [k, a] of Object.entries(acc)) out[k] = [a[0], Math.round((a[1] / a[0]) * 10) / 10, Math.round((a[2] / a[0]) * 1000) / 10];
  for (const [k, a] of Object.entries(skyAcc)) out[k] = [a[0], Math.round((a[1] / a[0]) * 1000) / 1000, 0];
  return out;
}`;

async function placeView(page: Page, s: ShotDef, fov0: number, size: { width: number; height: number }): Promise<void> {
  if (typeof s.view === "object") {
    const v = s.view;
    await page.evaluate(([v, fov]) => {
      const r = window.dgm3d!.renderer as unknown as { persp: { fov: number; updateProjectionMatrix(): void }; setView(v: unknown): void };
      r.persp.fov = fov;
      r.persp.updateProjectionMatrix();
      r.setView({ mode: "orbit", yaw: v.yaw, pitch: v.pitch, distance: v.distance, target: v.target });
    }, [v, v.fov ?? fov0] as const);
    return;
  }
  const st = (await page.evaluate(() => {
    const e = (window.dgm3d!.renderer as unknown as { map: { entities: { count: number; templates: string[]; template: Uint16Array; x: Int16Array; y: Int16Array; z: Int16Array; orientation: Uint8Array } } }).map.entities;
    for (let k = 0; k < e.count; k++) if (e.templates[e.template[k]] === "StartingLocation") return { x: e.x[k], y: e.y[k], z: e.z[k], o: e.orientation[k] & 3 };
    return null;
  }))!;
  const yaw = -((st.o * 90 + 35) * Math.PI) / 180;
  if (s.view === "hero") {
    // the map's picture's framing (render3d/hero.ts frameHero: 40° down, turned as the new game opens, the map's width
    // filling the frame under a band of sky), drawn in the view itself at 16:9
    await page.evaluate(
      async ([yaw, fov]) => {
        const url = "/src/render3d/renderer.ts";
        const { drawnOutline } = (await import(/* @vite-ignore */ url)) as typeof import("../src/render3d/renderer");
        const r = window.dgm3d!.renderer as unknown as {
          persp: { fov: number; updateProjectionMatrix(): void };
          canvas: HTMLCanvasElement;
          map: { W: number; H: number; heights: Uint8Array };
          setView(v: unknown): void;
          getView(): { distance: number; target: [number, number, number] };
          screenBox(p: Float32Array): { x0: number; x1: number; y0: number; y1: number };
          pickAtLevel(x: number, y: number, l: number): { point: [number, number, number] } | null;
        };
        r.persp.fov = fov;
        r.persp.updateProjectionMatrix();
        const { W, H, heights } = r.map;
        let sum = 0;
        for (let i = 0; i < heights.length; i++) sum += heights[i];
        const level = sum / heights.length;
        const outline = drawnOutline(W, H, heights);
        r.setView({ mode: "orbit", yaw, pitch: (40 * Math.PI) / 180, distance: Math.max(W, H) * 1.6, target: [W / 2, level, -H / 2] });
        const rect = r.canvas.getBoundingClientRect();
        const h = rect.height;
        const w = Math.min(rect.width, (h * 16) / 9);
        for (let pass = 0; pass < 8; pass++) {
          let b = r.screenBox(outline);
          const s = (b.x1 - b.x0) / (1.15 * w);
          const v = r.getView();
          if (Number.isFinite(s) && s > 0) r.setView({ distance: Math.min(v.distance * s, Math.max(W, H) * 6) });
          b = r.screenBox(outline);
          const from = r.pickAtLevel(rect.left + (b.x0 + b.x1) / 2, rect.top + b.y0 + h / 2, level);
          const to = r.pickAtLevel(rect.left + rect.width / 2, rect.top + 0.08 * h + h / 2, level);
          if (!from || !to) break;
          const t = r.getView().target;
          r.setView({ target: [t[0] + from.point[0] - to.point[0], t[1], t[2] + from.point[2] - to.point[2]] });
        }
      },
      [yaw, fov0] as const,
    );
    return;
  }
  const orientation = ORIENTATIONS[st.o];
  const [mx, my] = startMiddleTile({ x: st.x, y: st.y, orientation });
  const cam = openingCamera({ x: mx, y: my, z: st.z, orientation }, s.view === "opening-first" ? undefined : VISTA_ZOOM);
  void size;
  await page.evaluate((v) => {
    const r = window.dgm3d!.renderer as unknown as { persp: { fov: number; updateProjectionMatrix(): void }; setView(v: unknown): void };
    r.persp.fov = 35;
    r.persp.updateProjectionMatrix();
    r.setView(v);
  }, { mode: "orbit", yaw, pitch: (60 * Math.PI) / 180, distance: cam.distance, target: [cam.target[0], cam.target[2], -cam.target[1]] });
}

async function capture(tag: string): Promise<void> {
  const dir = join(BASE, tag);
  mkdirSync(dir, { recursive: true });
  const only = arg("only")?.split(",");
  const looks = process.argv.includes("--software") ? ["light"] : (arg("looks") ?? "standard,high").split(",");
  const sizes = (arg("sizes") ?? "1920,1280").split(",") as Size[];
  process.env.DGM_BASE = "/";
  const server = await createServer({ root: ROOT, configFile: join(ROOT, "vite.config.ts"), server: { port: PORT, strictPort: true }, logLevel: "warn" });
  await server.listen();
  // (--software: Chrome drawing in software, where the page shows the light look; the frames are named "light")
  const software = process.argv.includes("--software");
  const browser = await chromium.launch({ channel: "chrome", headless: false, args: software ? ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--disable-gpu"] : ["--enable-gpu", "--ignore-gpu-blocklist"] });
  const stats: Record<string, Stats> = existsSync(join(dir, "stats.json")) ? JSON.parse(readFileSync(join(dir, "stats.json"), "utf8")) : {};
  try {
    for (const look of looks)
      for (const sz of sizes) {
        const { viewport, scheme } = SIZES[sz];
        const context = await browser.newContext({ viewport, deviceScaleFactor: 1, colorScheme: scheme });
        if (look !== "light") await context.addInitScript(`try { localStorage.setItem('dgm.look', '${look}'); } catch {}`);
        await context.addInitScript("window.__name = (f) => f");
        const page = await context.newPage();
        page.on("console", (m) => {
          if (m.type() === "error") console.log(`  [page] ${m.text().slice(0, 200)}`);
        });
        await page.goto(`http://localhost:${PORT}/${MAP}`, { timeout: 600_000, waitUntil: "domcontentloaded" });
        await waitForEditor(page, 600_000);
        await page.evaluate(() => window.dgmEditor!.idle());
        await page.mouse.move(2, 2);
        await page.keyboard.press("Escape");
        // only the 3D view (the largest canvas)
        await page.evaluate(() => {
          const cs = [...document.querySelectorAll("canvas")];
          const big = cs.reduce((m, c) => (c.clientWidth * c.clientHeight > m.clientWidth * m.clientHeight ? c : m), cs[0]);
          big.setAttribute("data-forms-view", "");
          const st = document.createElement("style");
          st.textContent = "body * { visibility: hidden !important } [data-forms-view] { visibility: visible !important }";
          document.head.append(st);
        });
        const fov0 = (await page.evaluate("window.dgm3d.renderer.persp.fov")) as number;
        await page.evaluate("window.dgm3d.renderer.setClock(6)");
        await page.waitForTimeout(4000);
        for (const s of SHOTS) {
          if (only && !only.some((o) => s.id.startsWith(o))) continue;
          if (s.looks && !s.looks.includes(look)) continue;
          if (s.before) await page.evaluate(s.before);
          await placeView(page, s, fov0, viewport);
          if (s.after) await page.evaluate(s.after);
          await page.waitForTimeout(2500);
          await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(null)))));
          const loc = page.locator("[data-forms-view]");
          const box = (await loc.boundingBox())!;
          // the opening camera and the picture at 16:9 (the field of view is vertical: the height kept)
          const w = s.view === "opening" || s.view === "opening-first" || s.view === "hero" ? Math.min(box.width, (box.height * 16) / 9) : box.width;
          const png = await page.screenshot({ type: "png", clip: { x: box.x, y: box.y, width: box.width, height: box.height } });
          const name = `${MAP_TAG === "canyon-1" ? "" : MAP_TAG + "-"}${s.id}-${look}-${sz}`;
          stats[name] = (await page.evaluate(`(${MEASURE})(${JSON.stringify([png.toString("base64"), 6])})`)) as Stats;
          const jpg = await page.screenshot({ type: "jpeg", quality: 88, clip: { x: box.x + (box.width - w) / 2, y: box.y, width: w, height: box.height } });
          writeFileSync(join(dir, `${name}.jpg`), jpg);
          if (s.undo) await page.evaluate(s.undo);
          const st = stats[name];
          const show = (k: string) => (st[k] ? `${k} ${st[k][1]} (${st[k][2]}% <40, n ${st[k][0]})` : "");
          console.log(`${name}: ${["all", "roofed floor", "roofed wall", "roofed ceiling", "open floor", "open wall", "sky floor", "sky wall", "sky ceiling"].map(show).filter(Boolean).join(" · ")}`);
        }
        await context.close();
      }
  } finally {
    writeFileSync(join(dir, "stats.json"), JSON.stringify(stats, null, 1));
    await browser.close();
    await server.close();
  }
}

/** Before against after, a row a shot: [before Standard, after Standard, before High, after High] at 1920 (and the
 *  1280 light frames of the first shots after them). */
async function sheet(kind: string, out: string): Promise<void> {
  const ids = (arg("ids") ?? (kind === "caves" ? "cave-inside,cave-mouth,opening" : "overhang,overhang-under,arch,opening,hero")).split(",");
  const rows: { label: string; files: (string | null)[] }[] = [];
  const sheetLooks = (arg("looks") ?? "standard,high").split(",");
  const heads = sheetLooks.flatMap((l) => [`${l[0].toUpperCase()}${l.slice(1)}, before (dev)`, `${l[0].toUpperCase()}${l.slice(1)}, after`]);
  for (const sz of ["1920", "1280"] as Size[])
    for (const id of ids) {
      if (sz === "1280" && !(arg("light") ?? (kind === "caves" ? "cave-inside" : "overhang,arch")).split(",").includes(id)) continue;
      // (an id may name another map first: riverValley-4242-opening)
      const s = SHOTS.find((x) => id.endsWith(x.id) && (id === x.id || id.endsWith(`-${x.id}`)))!;
      const where = id === s.id ? "Canyon 128² seed 1" : id.slice(0, -s.id.length - 1).replace(/^(\w+)-(\d+)$/, "$1 128² seed $2");
      const tags = [arg("before") ?? "before", arg("after") ?? "after"];
      const files = sheetLooks.flatMap((look) => tags.map((tag) => join(BASE, tag, `${id}-${look}-${sz}.jpg`)));
      rows.push({ label: `${where}, ${s.label}, ${sz === "1920" ? "1920×1080 dark" : "1280×800 light"}`, files: files.map((f) => (existsSync(f) ? f : null)) });
    }
  const browser = await chromium.launch({ channel: "chrome", headless: false });
  try {
    const page = await browser.newPage();
    const data = rows.map((r) => ({ label: r.label, imgs: r.files.map((f) => (f ? readFileSync(f).toString("base64") : null)) }));
    const jpeg = (await page.evaluate(
      `(async (rows) => {
        const load = async (b) => { if (!b) return null; const i = new Image(); i.src = "data:image/jpeg;base64," + b; await i.decode(); return i; };
        const W = ${sheetLooks.length > 1 ? 2400 : 1600}, cols = ${sheetLooks.length * 2}, w = W / cols, band = 26, head = 30;
        const all = await Promise.all(rows.map(async (r) => ({ label: r.label, imgs: await Promise.all(r.imgs.map(load)) })));
        const hOf = (r) => { const i = r.imgs.find(Boolean); return i ? Math.round(i.height * w / i.width) : 100; };
        const H = head + all.reduce((s, r) => s + band + hOf(r), 0);
        const c = document.createElement("canvas"); c.width = W; c.height = H;
        const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, W, H);
        g.fillStyle = "#222"; g.font = "bold 18px sans-serif";
        ${JSON.stringify(heads)}.forEach((t, k) => g.fillText(t, k * w + 8, 21));
        let y = head;
        for (const r of all) {
          const h = hOf(r);
          g.fillStyle = "#222"; g.font = "16px sans-serif"; g.fillText(r.label, 8, y + 19);
          r.imgs.forEach((im, k) => { if (im) g.drawImage(im, k * w, y + band, w - 4, h); });
          y += band + h;
        }
        return c.toDataURL("image/jpeg", 0.8).split(",")[1];
      })(${JSON.stringify(data)})`,
    )) as string;
    writeFileSync(out, Buffer.from(jpeg, "base64"));
    console.log(`wrote ${out} (${Math.round(Buffer.from(jpeg, "base64").length / 1024)} KB)`);
  } finally {
    await browser.close();
  }
}

const tag = arg("tag");
const kind = arg("sheet");
if (kind) await sheet(kind, arg("out") ?? `docs/sheets/${kind === "caves" ? "caves-bright" : "forms-read"}.jpg`);
else if (tag) await capture(tag);
else console.log("--tag <name> or --sheet caves|forms");
