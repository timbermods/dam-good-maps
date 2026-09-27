// The Real places card pictures (Kyler, 2026-09-25), two for each place, both drawn by the Map look
// 3D view in its clean look on this machine's GPU, in the installed Chrome, headed (CI has no GPU,
// and a browser that draws in software gets the light look), and committed:
// - cards/<id>.webp: an angled overview, 480 px square (twice the card). The camera looks the
//   index's way (`view`: along the map's axis nearest to the way the land rises, from the low side
//   toward the high side; src/core/places/view.ts), and stands so the land fills the picture: the
//   far edge spans it, with a thin band of sky above, and the near side runs off the bottom. Drawn
//   at 960 px and scaled down.
// - cards/<id>-top.webp: the map from straight above (the view's Top mode, an orthographic
//   camera): moist grass, cracked earth, water by depth and contaminated ground as the game shows
//   them. It is turned by whole quarter turns so its top is the overview's far edge, and the two
//   read as one map; the gallery shows a north arrow on each. Drawn at a whole number of pixels a
//   tile, close to 512 px (480 at 96², 512 at 128² and 256²), so every tile edge is sharp.
//
//   npm run places:thumbs                   (the places whose pictures do not show the current map)
//   npm run places:thumbs -- --all          (every place)
//   npm run places:thumbs -- --only a,b     (the places named)
//   npm run places:thumbs -- --dir <dir>    (write there instead, and leave the index alone: trials)
//   npm run places:thumbs -- --port 4832 --threads 4   (the preview's port; the maps' build threads)
//
// Each place opens in the editor as the gallery's Refine opens it (its .timber, built by
// tools/places-build.ts), in a fresh browser context. The water is held at one moment of its
// movement. The index records the sha256 of the .timber the pictures show (imageFrom), so a map the
// engine changes is seen to need new pictures (the contract test).

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Browser, type Page } from "@playwright/test";
import { build, preview } from "vite";
import type { PlaceIndex, PlaceIndexEntry } from "../src/core/places/place";
import { innerLevel, viewYaw, VIEW_TURNS } from "../src/core/places/view";

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

const PUBLIC = "public/real-places";
const DIST = ".scratch/thumbs-dist";
const PORT = Number(arg("port") ?? 4193);
/** The overview's side: twice the card's 240 px. */
const SIDE = 480;
/** Drawn at twice that, then scaled down. */
const DRAWN = SIDE * 2;
/** The map from above: about this many pixels, a whole number a tile. */
const TOP = 512;
const QUALITY = Number(arg("quality") ?? 0.8);
const PITCH = Number(arg("pitch") ?? 0.7);
/** The band of sky above the far edge, as a share of the picture's height. */
const SKY = Number(arg("sky") ?? 0.07);
/** The view's vertical field of view, in degrees (src/render3d/renderer.ts). */
const FOV = 40;
/** The Top mode's half height per unit of distance (src/render3d/renderer.ts, placeCamera). */
const TOP_HALF = 0.42;

type V3 = [number, number, number];

interface Pose {
  mode: "orbit" | "top";
  yaw: number;
  pitch: number;
  distance: number;
  target: V3;
}

/** The overview's camera, looking the place's way. */
function overview(W: number, H: number, heights: number[], view: PlaceIndexEntry["view"]): Pose {
  return frame(W, H, heights, innerLevel(heights, W, H), viewYaw(view), PITCH);
}

const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: number[], b: number[]): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: number[]): V3 => {
  const l = Math.hypot(a[0], a[1], a[2]);
  return [a[0] / l, a[1] / l, a[2] / l];
};

/** Where a point falls in a square picture, from -1 to 1 across and up, as
 *  src/render3d/renderer.ts places its perspective camera. */
function project(p: V3, target: V3, yaw: number, pitch: number, d: number): [number, number] {
  const tan = Math.tan((FOV / 2) * (Math.PI / 180));
  const cp = Math.cos(pitch);
  const cam: V3 = [target[0] + Math.sin(yaw) * cp * d, target[1] + Math.sin(pitch) * d, target[2] + Math.cos(yaw) * cp * d];
  const f = norm([target[0] - cam[0], target[1] - cam[1], target[2] - cam[2]]);
  const r = norm(cross(f, [0, 1, 0]));
  const u = cross(r, f);
  const v = [p[0] - cam[0], p[1] - cam[1], p[2] - cam[2]];
  const depth = Math.max(1e-6, dot(v, f));
  return [dot(v, r) / (depth * tan), dot(v, u) / (depth * tan)];
}

/** The overview's framing: the far edge's middle a band of sky below the picture's top, and the
 *  camera as far back as it can stand while the far edge spans the picture and the near edge, at
 *  its highest, runs off the bottom (so the map's side never shows): the land fills all but the
 *  sky. */
function frame(W: number, H: number, heights: number[], level: number, yaw: number, pitch: number): Pose {
  const corners: V3[] = [];
  for (const x of [0, W]) for (const z of [0, -H]) corners.push([x, level, z]);
  // the ground's way forward, from the camera toward the target
  const fwd: V3 = [-Math.sin(yaw), 0, -Math.cos(yaw)];
  const byDepth = [...corners].sort((a, b) => dot(a, fwd) - dot(b, fwd));
  const far = byDepth.slice(2);
  // the near edge's tiles (x, and y = -z), at the edge's highest ground
  const [a0, a1] = byDepth.slice(0, 2);
  const ex = (x: number) => Math.min(W - 1, Math.max(0, Math.round(x - 0.5)));
  const ey = (z: number) => Math.min(H - 1, Math.max(0, Math.round(-z - 0.5)));
  let nearTop = 0;
  for (let k = 0; k <= 64; k++) {
    const x = a0[0] + ((a1[0] - a0[0]) * k) / 64;
    const z = a0[2] + ((a1[2] - a0[2]) * k) / 64;
    nearTop = Math.max(nearTop, heights[ey(z) * W + ex(x)]);
  }
  const near: V3[] = [
    [a0[0], nearTop, a0[2]],
    [a1[0], nearTop, a1[2]],
  ];
  const farMid: V3 = [(far[0][0] + far[1][0]) / 2, level, (far[0][2] + far[1][2]) / 2];
  const top = 1 - 2 * SKY;
  const centre: V3 = [W / 2, level, -H / 2];
  const span = Math.max(W, H);
  /** The target, slid along the ground, that puts the far edge's middle at the top of the land. */
  const targetFor = (d: number): V3 => {
    let a = -span;
    let b = span;
    for (let k = 0; k < 50; k++) {
      const m = (a + b) / 2;
      const t: V3 = [centre[0] + fwd[0] * m, level, centre[2] + fwd[2] * m];
      // sliding the target forward lowers the far edge in the picture
      if (project(farMid, t, yaw, pitch, d)[1] > top) a = m;
      else b = m;
    }
    return [centre[0] + fwd[0] * a, level, centre[2] + fwd[2] * a];
  };
  const farWide = (d: number) => {
    const t = targetFor(d);
    return Math.max(...far.map((c) => Math.abs(project(c, t, yaw, pitch, d)[0])));
  };
  const nearLow = (d: number) => {
    const t = targetFor(d);
    return Math.max(...near.map((c) => project(c, t, yaw, pitch, d)[1]));
  };
  /** The farthest distance at which `ok` holds (it holds nearer). */
  const farthest = (ok: (d: number) => boolean) => {
    let a = span * 0.2;
    let b = span * 4;
    for (let k = 0; k < 50; k++) {
      const m = (a + b) / 2;
      if (ok(m)) a = m;
      else b = m;
    }
    return a;
  };
  const d = Math.min(
    farthest((m) => farWide(m) >= 1),
    farthest((m) => nearLow(m) <= -1),
  );
  return { mode: "orbit", yaw, pitch, distance: d, target: targetFor(d) };
}

/** The Top mode's camera over the whole map, which fills the picture exactly. */
function above(W: number, H: number, level: number): Pose {
  return { mode: "top", yaw: 0, pitch: 1, distance: Math.max(W, H) / 2 / TOP_HALF, target: [W / 2, level, -H / 2] };
}

/** The canvas at a size, only the scene in view. */
async function canvasAt(page: Page, px: number): Promise<void> {
  await page.addStyleTag({
    // the view's frame holds the canvas in its own box beside the controls and the legend: every
    // other part is hidden (a visible canvas shows inside a hidden box), and the box fills the square
    content: `.editor-view { position: fixed !important; left: 0 !important; top: 0 !important; width: ${px}px !important; height: ${px}px !important; z-index: 2147483647 !important; margin: 0 !important; border: 0 !important; border-radius: 0 !important; }
      .editor-view * { visibility: hidden !important; }
      .editor-view .view3d { position: absolute !important; left: 0 !important; top: 0 !important; width: ${px}px !important; height: ${px}px !important; margin: 0 !important; }
      .editor-view .view3d > canvas { visibility: visible !important; width: ${px}px !important; height: ${px}px !important; }`,
  });
  await page.waitForFunction((n) => document.querySelector<HTMLCanvasElement>(".editor-view .view3d > canvas")!.width === n, px);
}

async function shoot(page: Page, pose: Pose): Promise<Buffer> {
  await page.evaluate((v) => {
    const r = window.dgm3d!.renderer as unknown as { setView(v: unknown): void; setClock?(t: number | null): void };
    r.setClock?.(12.5);
    r.setView(v);
  }, pose);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 200)))));
  return page.locator(".editor-view .view3d > canvas").screenshot({ type: "png" });
}

/** A square PNG as WebP, scaled to a side, or turned by whole quarter turns clockwise at its own
 *  size (every pixel kept) (in the page's canvas). */
async function webp(page: Page, png: Buffer, side: number, turns = 0): Promise<Buffer> {
  const b64 = (await page.evaluate(
    async ([data, s, q, t]) => {
      const img = new Image();
      img.src = `data:image/png;base64,${data}`;
      await img.decode();
      const c = document.createElement("canvas");
      c.width = s;
      c.height = s;
      const g = c.getContext("2d")!;
      g.imageSmoothingEnabled = !t;
      g.imageSmoothingQuality = "high";
      g.translate(s / 2, s / 2);
      g.rotate((t * Math.PI) / 2);
      g.drawImage(img, -s / 2, -s / 2, s, s);
      return c.toDataURL("image/webp", q).split(",")[1];
    },
    [png.toString("base64"), side, QUALITY, turns] as [string, number, number, number],
  )) as string;
  return Buffer.from(b64, "base64");
}

async function render(browser: Browser, base: string, p: PlaceIndexEntry): Promise<{ overview: Buffer; top: Buffer; pose: Pose; gpu: string }> {
  const ctx = await browser.newContext({ viewport: { width: DRAWN + 40, height: DRAWN + 40 }, deviceScaleFactor: 1, colorScheme: "light" });
  try {
    const page = await ctx.newPage();
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.goto(`${base}#place=${p.id}`);
    await page.waitForFunction((name) => window.dgmEditor?.info().name === name && !!window.dgm3d, p.name, { timeout: 180_000 });
    await page.evaluate(() => window.dgmEditor!.idle());
    // the editor shows the preview's water at once, and the background check's exact settle
    // replaces it when it is done (the checks dot stops waiting), easing it in
    await page.waitForFunction(() => {
      const dot = document.querySelector(".checks-dot");
      return !!dot && !dot.classList.contains("wait");
    }, null, { timeout: 300_000 });
    await page.waitForTimeout(2500);
    await page.evaluate(() => window.dgmEditor!.idle());
    const gpu = (await page.evaluate(() => window.dgm3d!.renderer.gpu().renderer)) as string;
    if (/SwiftShader|llvmpipe|Software|Basic Render/i.test(gpu)) throw new Error(`Chrome draws in software (${gpu}): the pictures need the GPU`);
    await page.mouse.move(DRAWN + 30, DRAWN + 30);
    // (the renderer's map is private to it: read loosely, as tools/capture-look.ts does)
    const map = (await page.evaluate(() => {
      const m = (window.dgm3d!.renderer as unknown as { map: { W: number; H: number; heights: ArrayLike<number> } }).map;
      return { W: m.W, H: m.H, heights: Array.from(m.heights) };
    })) as { W: number; H: number; heights: number[] };

    await canvasAt(page, DRAWN);
    const pose = overview(map.W, map.H, map.heights, p.view);
    const overviewPng = await shoot(page, pose);

    const perTile = Math.max(1, Math.round(TOP / Math.max(map.W, map.H)));
    const side = perTile * Math.max(map.W, map.H);
    await canvasAt(page, side);
    const topPng = await shoot(page, above(map.W, map.H, innerLevel(map.heights, map.W, map.H)));

    const out = { overview: await webp(page, overviewPng, SIDE), top: await webp(page, topPng, side, VIEW_TURNS[p.view]), pose, gpu };
    if (errors.length) throw new Error(`${p.name}: page errors: ${errors.join("; ")}`);
    return out;
  } finally {
    await ctx.close();
  }
}

async function main(): Promise<void> {
  const indexPath = join(PUBLIC, "index.json");
  const index = JSON.parse(readFileSync(indexPath, "utf8")) as PlaceIndex;
  const only = arg("only")?.split(",");
  const dir = arg("dir");
  const places = index.places.filter((p) =>
    only
      ? only.includes(p.id)
      : process.argv.includes("--all") || p.imageFrom !== p.sha256 || !existsSync(join(PUBLIC, p.image)) || !existsSync(join(PUBLIC, p.topImage)),
  );
  if (only && places.length !== only.length) throw new Error(`no place called ${only.filter((id) => !places.some((p) => p.id === id)).join(", ")}`);
  if (!places.length) {
    console.log("every card picture shows its current map");
    return;
  }
  console.log(`${places.length} place(s) to draw; building the site and the maps…`);
  await build({ configFile: "vite.config.ts", base: "/", logLevel: "warn", build: { outDir: DIST, emptyOutDir: true } });
  const threads = arg("threads");
  execFileSync(process.execPath, [...process.execArgv, "tools/places-build.ts", "--out", DIST, "--only", places.map((p) => p.id).join(","), ...(threads ? ["--threads", threads] : [])], { stdio: "inherit" });
  const server = await preview({ configFile: "vite.config.ts", base: "/", build: { outDir: DIST }, preview: { port: PORT, strictPort: true }, logLevel: "warn" });
  const browser = await chromium.launch({ channel: "chrome", headless: false, args: ["--ignore-gpu-blocklist"] });
  const out = dir ?? PUBLIC;
  mkdirSync(join(out, "cards"), { recursive: true });
  const t0 = performance.now();
  let total = 0;
  try {
    for (const p of places) {
      const t = performance.now();
      const r = await render(browser, `http://localhost:${PORT}/`, p);
      writeFileSync(join(out, p.image), r.overview);
      writeFileSync(join(out, p.topImage), r.top);
      total += r.overview.length + r.top.length;
      if (!dir) p.imageFrom = p.sha256;
      console.log(
        `${p.size}² ${((performance.now() - t) / 1000).toFixed(1).padStart(5)} s  overview ${(r.overview.length / 1024).toFixed(1).padStart(5)} KB, above ${(r.top.length / 1024).toFixed(1).padStart(5)} KB  looking ${p.view}  ${p.name}${p === places[0] ? `  (${r.gpu})` : ""}`,
      );
    }
  } finally {
    await browser.close();
    await server.close();
  }
  if (!dir) {
    // imageFrom where tools/real-places.ts writes it (after view), so `npm run places -- --check`
    // sees the same bytes
    index.places = index.places.map((p) => {
      const entry: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(p)) {
        if (k === "imageFrom") continue;
        entry[k] = v;
        if (k === "view" && p.imageFrom) entry.imageFrom = p.imageFrom;
      }
      return entry as unknown as PlaceIndexEntry;
    });
    writeFileSync(indexPath, JSON.stringify(index, null, 1) + "\n");
  }
  console.log(
    `${places.length} place(s) in ${((performance.now() - t0) / 1000).toFixed(0)} s, ${(total / 1024).toFixed(0)} KB (${(total / 1024 / places.length).toFixed(1)} KB a place), in ${join(out, "cards")}${dir ? "" : "; the index records the map they show"}`,
  );
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
