// The in-game capture kit's contact sheet: each of the game's captures beside our renderer's view from the same camera,
// in Standard and High. The probe (investigation/probe/runner/captures.ts, `batch -- <map> --captures`) writes the
// game's shots and captures.json, each shot with the camera the game rendered it with (DGM Probe 0.3.4: its place,
// where it looks, its field of view); this opens the same .timber in the editor as a player does (the file input),
// poses the view from that camera exactly, and draws it:
//   - day 1: the map as the editor opens it (its own water and soil);
//   - a hazard's worst day: the game's water and soil at that moment (its whole-map record), the hazard held
//     (`setSeason`, the fog's colour) and the plants the game had dead drawn withered: our renderer drawing the game's
//     state, so a difference is the drawing's, not the simulation's.
// The editor draws the day's light; the game's captures fall in its full daylight (hours 4 and 13), so the light matches.
//
//   npx tsx tools/capture-ingame.ts <captures folder or its captures.json> [--looks standard,high] [--port 4977]
//
// Writes, in the captures folder (local only: no game screenshot ever goes into git or onto GitHub):
//   ours/<moment>-<pose>-<look>.jpg   our renderer at the game's camera
//   sheet.html                        each capture: the game's beside ours in each look, labelled
//   sheet.jpg                         the same as one picture
//
// Picture tool: its maths is the camera's, never a map's (tools/portable-guard.ts PRESENTATION_TOOL, `capture-`).

import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import { chromium, type Page } from "@playwright/test";
import { build, preview, type PreviewServer } from "vite";
import type { CaptureRecord, CapturesFile } from "../investigation/probe/runner/captures";
import type { MapSnapshot } from "../investigation/probe/runner/job";
import { contaminationByte, moistureByte } from "../src/render3d/palette";
import { waitForEditor } from "./wait-editor";

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const input = process.argv[2];
if (!input || input.startsWith("--")) {
  console.error("usage: npx tsx tools/capture-ingame.ts <captures folder or captures.json> [--looks standard,high] [--port 4977]");
  process.exit(2);
}
const JSON_FILE = statSync(input).isDirectory() ? join(input, "captures.json") : input;
const DIR = dirname(resolve(JSON_FILE));
const LOOKS = (arg("looks") ?? "standard,high").split(",").filter((l): l is "standard" | "high" => l === "standard" || l === "high");
const PORT = Number(arg("port") ?? 4977);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Our view's pose from the game's camera: the game's world (x east, y up, z north) is ours with z turned (ours: z =
 *  −north); the orbit's target on the camera's look line, as far as the game's own camera stood from its target. */
function viewOf(c: NonNullable<CaptureRecord["camera"]>): { fov: number; view: { mode: "orbit"; yaw: number; pitch: number; distance: number; target: [number, number, number] } } {
  const [px, py, pz] = c.position;
  const [fx, fy, fz] = c.forward;
  const d = Math.max(4, Math.hypot(px - c.stateTarget[0], py - c.stateTarget[1], pz - c.stateTarget[2]));
  const target: [number, number, number] = [px + fx * d, py + fy * d, -(pz + fz * d)];
  return { fov: c.fieldOfView, view: { mode: "orbit", yaw: Math.atan2(-fx, fz), pitch: Math.asin(Math.max(-1, Math.min(1, -fy))), distance: d, target } };
}

async function site(): Promise<PreviewServer> {
  const outDir = resolve(ROOT, `.scratch/capture-ingame-${PORT}`);
  // (its own cache: a worktree's node_modules may be another's, joined)
  const cacheDir = resolve(ROOT, `.scratch/capture-ingame-${PORT}-vite`);
  console.log("building the site…");
  process.env.DGM_BASE = "/";
  await build({ root: ROOT, configFile: join(ROOT, "vite.config.ts"), base: "/", cacheDir, logLevel: "warn", build: { outDir, emptyOutDir: true } });
  return preview({ root: ROOT, configFile: join(ROOT, "vite.config.ts"), base: "/", cacheDir, build: { outDir }, preview: { port: PORT, strictPort: true }, logLevel: "warn" });
}

/** The game's water and soil of a moment, as the renderer takes them. */
function stateOf(snapshotFile: string): { water: { tile: number[]; floor: number[]; depth: number[]; cont: number[] }; moisture: number[]; soil: number[]; dead: number[] } {
  const s = JSON.parse(gunzipSync(readFileSync(snapshotFile)).toString("utf8")) as MapSnapshot;
  const water = { tile: [] as number[], floor: [] as number[], depth: [] as number[], cont: [] as number[] };
  for (let i = 0; i < s.width * s.height; i++)
    if (s.depth[i] > 0.001) {
      water.tile.push(i);
      water.floor.push(s.floor[i]);
      water.depth.push(s.depth[i]);
      water.cont.push(s.contamination[i]);
    }
  // (the soil's bytes as the editor holds them)
  const moisture = s.moisture.map(moistureByte);
  const soil = s.soilContamination.map(contaminationByte);
  const dead = s.plants.filter((p) => p.plant?.dead).map((p) => p.y * s.width + p.x);
  return { water, moisture, soil, dead };
}

/** Page side: a moment's state put in (null: the map as the editor opened it, kept the first time). */
const SET_STATE_JS = `(g) => {
  const r = window.dgm3d.renderer;

  window.__opened ??= { water: r.map.water, soil: r.map.soil };
  if (!g) {
    r.updateWater(window.__opened.water, true);
    if (window.__opened.soil) r.updateSoil(window.__opened.soil);
    r.setSeason(null);
    r.setWithered(null);
    return true;
  }
  r.updateWater({ count: g.water.tile.length, tile: Int32Array.from(g.water.tile), floor: Float32Array.from(g.water.floor), depth: Float32Array.from(g.water.depth), contamination: Float32Array.from(g.water.cont) }, true);
  r.updateSoil({ moisture: Uint8Array.from(g.moisture), contamination: Uint8Array.from(g.soil) });
  r.setSeason(g.hazard);
  r.setWithered(g.dead.length ? Int32Array.from(g.dead) : null);
  return true;
}`;

async function frame(page: Page): Promise<void> {
  await page.evaluate("new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(null))))");
  await page.evaluate("window.dgm3d.renderer.whenDrawn()");
}

async function main(): Promise<void> {
  const caps = JSON.parse(readFileSync(JSON_FILE, "utf8")) as CapturesFile;
  const usable = caps.captures.filter((c) => c.camera);
  if (!usable.length) throw new Error(`${JSON_FILE}: no capture records its camera (DGM Probe 0.3.4 or later writes them)`);
  const W = 1600, H = 900;
  mkdirSync(join(DIR, "ours"), { recursive: true });
  const server = await site();
  const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--enable-gpu", "--use-angle=d3d11", "--ignore-gpu-blocklist"] });
  const errors: string[] = [];
  try {
    const context = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, colorScheme: "light" });
    const page = await context.newPage();
    page.on("pageerror", (e) => errors.push(String(e).slice(0, 300)));
    await page.goto(`http://localhost:${PORT}/#s=1&z=96&d=n&t=riverValley`);
    await waitForEditor(page, 600_000);
    // the .timber the game played, opened as a player opens it
    await page.getByLabel("Open a map or a project").setInputFiles(caps.mapFile);
    await page.waitForFunction("window.dgmEditor?.info().kind === 'import' && !!window.dgm3d", null, { timeout: 300_000 });
    await page.evaluate("window.dgmEditor.idle()");
    await page.mouse.move(2, 2);
    // the canvas alone, the shot's size
    await page.addStyleTag({ content: `.view3d { position: fixed !important; left: 0 !important; top: 0 !important; width: ${W}px !important; height: ${H}px !important; z-index: 2147483647 !important; } .view3d > :not(canvas) { visibility: hidden !important; } .view3d > canvas { width: ${W}px !important; height: ${H}px !important; }` });
    await page.evaluate("window.dispatchEvent(new Event('resize'))");
    await page.waitForTimeout(800);
    await page.evaluate(`(${SET_STATE_JS})(null)`);
    const gpu = (await page.evaluate("window.dgm3d.renderer.gpu().renderer")) as string;
    console.log(`our renderer on ${gpu}`);
    const moments = [...new Set(usable.map((c) => c.moment))];
    for (const look of LOOKS) {
      await page.evaluate(`(() => { const r = window.dgm3d.renderer; for (const k of Object.keys(r.highEffects ?? {})) r.setHighEffect(k, true); r.setLookChoice(${JSON.stringify(look)}, false); })()`);
      if (look === "high") await page.waitForFunction("window.dgm3d.renderer.highSettled", null, { timeout: 300_000 });
      await page.waitForTimeout(1000);
      const drawn = (await page.evaluate("window.dgm3d.renderer.look")) as string;
      if (drawn !== look) console.log(`  the page draws ${drawn}, not ${look} (its GPU may not run High)`);
      for (const moment of moments) {
        const first = usable.find((c) => c.moment === moment)!;
        const state = first.hazard && first.snapshot && existsSync(first.snapshot) ? { ...stateOf(first.snapshot), hazard: first.hazard } : null;
        if (first.hazard && !state) console.log(`  ${moment}: no whole-map record, so ours shows the map's own water`);
        await page.evaluate(`(${SET_STATE_JS})(${JSON.stringify(state)})`);
        await page.waitForTimeout(1500);
        for (const c of usable.filter((x) => x.moment === moment)) {
          const { fov, view } = viewOf(c.camera!);
          await page.evaluate(`(() => { const r = window.dgm3d.renderer; r.persp.fov = ${fov}; r.setView(${JSON.stringify(view)}); r.setClock(12.5); })()`);
          await frame(page);
          if (look === "high") await page.waitForFunction("window.dgm3d.renderer.highSettled", null, { timeout: 120_000 }).catch(() => undefined);
          await page.waitForTimeout(600);
          await page.evaluate("window.dgm3d.renderer.renderNow()");
          const file = join(DIR, "ours", `${c.file.replace(/\.jpg$/, "")}-${look}.jpg`);
          writeFileSync(file, await page.locator(".view3d > canvas").screenshot({ type: "jpeg", quality: 88 }));
          console.log(`  ${basename(file)}`);
        }
      }
    }
    // the sheet: a row per capture, the game's beside ours in each look
    const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
    const rows = caps.captures
      .map((c) => {
        const cells = [`<figure><img src="${c.file}"><figcaption>the game</figcaption></figure>`, ...LOOKS.map((l) => (c.camera ? `<figure><img src="ours/${c.file.replace(/\.jpg$/, "")}-${l}.jpg"><figcaption>ours, ${l === "high" ? "High" : "Standard"}</figcaption></figure>` : `<figure class="none">no camera recorded</figure>`))];
        return `<section><h2>${esc(caps.map)} · ${esc(c.label)} · ${esc(c.pose)}</h2><p>${esc(c.what)}; game day ${c.day.toFixed(2)}, hour ${c.hour.toFixed(1)}${c.camera ? `, field of view ${c.camera.fieldOfView.toFixed(1)}°` : ""}</p><div class="row">${cells.join("")}</div></section>`;
      })
      .join("\n");
    const html = `<!doctype html><meta charset="utf-8"><title>${esc(caps.map)}: in the game and ours</title>
<style>body{margin:0;padding:16px;background:#1b1d1f;color:#e8e6e1;font:14px/1.4 system-ui,sans-serif}h1{font-size:20px;margin:0 0 4px}h2{font-size:15px;margin:18px 0 2px}p{margin:0 0 6px;color:#b9b6ae}.row{display:grid;grid-template-columns:repeat(${1 + LOOKS.length},1fr);gap:8px}figure{margin:0}img{width:100%;display:block}figcaption{font-size:12px;color:#b9b6ae}.none{color:#888;padding:40px}</style>
<h1>${esc(caps.map)}: the game (DGM Probe ${esc(caps.modVersion)}, Timberborn ${esc(caps.gameVersion)}) beside our renderer from the same camera</h1>
<p>Run ${esc(caps.runId)}. Weather played: ${caps.weather.map((w) => `cycle ${w.cycle}: ${w.temperateDays} temperate days, then ${w.hazardDays} days of ${w.hazard}`).join("; ")}. Ours on day 1 is the map as the editor opens it; on a hazard's day, the game's water and soil at that moment drawn by our renderer. A player's zoom reaches ${caps.playerWidest} tiles.${caps.notes.length ? " Notes: " + esc(caps.notes.join("; ")) : ""}</p>
${rows}`;
    const sheet = join(DIR, "sheet.html");
    writeFileSync(sheet, html);
    const view = await context.newPage();
    await view.setViewportSize({ width: 1500, height: 900 });
    await view.goto("file:///" + sheet.replace(/\\/g, "/"));
    await view.waitForLoadState("load");
    writeFileSync(join(DIR, "sheet.jpg"), await view.screenshot({ type: "jpeg", quality: 82, fullPage: true }));
    console.log(`sheet: ${sheet} and ${join(DIR, "sheet.jpg")}`);
    if (errors.length) console.log(`page errors: ${errors.join("; ")}`);
  } finally {
    await browser.close();
    await new Promise<void>((done) => server.httpServer.close(() => done()));
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.stack : e);
  process.exitCode = 1;
});
