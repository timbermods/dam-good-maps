// The Weather view's captures (D484): a generated map held on a Drought or Badtide day in the High look, light and
// dark, at three window sizes, on this machine's GPU in real Chrome (headed). One image per window size and scheme,
// and a small sheet of them.
//
//   npx tsx tools/capture-weather.ts --url http://localhost:4196/ [--hazard badtide|drought] [--day N]
//     [--map "#s=4242&z=96&d=n&t=riverValley&bw=0"] [--out .scratch/weather] [--sheet docs/sheets/<name>.jpg] [--mark "text"]
//     [--sizes 1920x1080,2560x1440,1280x800] [--schemes light,dark] [--look high|standard] [--zoom 34]
//
// The camera is placed on the contaminated ground (badtide) or the driest ground by water (drought) found on the map
// as it stands on the held day; the product never moves the camera by itself (D265).

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Page } from "@playwright/test";
import { waitForEditor } from "./wait-editor";

const arg = (name: string, d?: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : d;
};
const URL_ = arg("url", "http://localhost:4196/")!;
const HAZARD = arg("hazard", "badtide")! as "badtide" | "drought";
const DAY = arg("day") ? Number(arg("day")) : null;
const MAP = arg("map", "#s=4242&z=96&d=n&t=riverValley&bw=0")!;
const OUT = arg("out", ".scratch/weather")!;
const SHEET = arg("sheet");
const SIZES = arg("sizes", "1920x1080,2560x1440,1280x800")!.split(",").map((s) => s.split("x").map(Number) as [number, number]);
const SCHEMES = arg("schemes", "light,dark")!.split(",") as ("light" | "dark")[];
const LOOK = arg("look", "high")!;
const ZOOM = Number(arg("zoom", "30"));
const MARK = arg("mark", "");
/** Also the map's own day (Day 0) from the same camera, for the sheet's first panel. */
const PAIR = process.argv.includes("--pair");
const GPU_ARGS = ["--enable-gpu", "--use-angle=d3d11", "--ignore-gpu-blocklist"];

/** Page side: the camera for the view: the place on the map where the held day shows the effect. */
const FIND_JS = `([hazard, zoom]) => {
  const r = window.dgm3d.renderer;
  const m = r.mapState(), W = m.W, H = m.H, h = m.heights, soil = m.soil, s = m.surface;
  const wet = (i) => s.depth[i] > 0.05;
  // a window of tiles scoring best: contaminated ground (badtide) or dry ground beside water that is gone (drought)
  const score = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) score[i] = hazard === "badtide" ? (soil.contamination[i] > 0 && !wet(i) ? 1 : 0) : (soil.moisture[i] === 0 && !wet(i) ? 1 : 0);
  const R = 9; let best = -1, bx = W / 2, by = H / 2;
  for (let y = R; y < H - R; y += 3) for (let x = R; x < W - R; x += 3) {
    let v = 0, n = 0;
    for (let dy = -R; dy <= R; dy += 2) for (let dx = -R; dx <= R; dx += 2) { v += score[(y + dy) * W + x + dx]; n++; }
    // ... near (but not under) water, so the day's water shows in the same frame
    let w = 0; for (let dy = -R; dy <= R; dy += 3) for (let dx = -R; dx <= R; dx += 3) if (wet((y + dy) * W + x + dx)) w++;
    const sc = v / n * (w > 4 ? 1 : 0.5);
    if (sc > best) { best = sc; bx = x; by = y; }
  }
  let mean = 0; for (let i = 0; i < W * H; i++) mean += h[i]; mean /= W * H;
  return { found: best, view: { mode: "orbit", yaw: -Math.PI / 6, pitch: 0.95, distance: zoom, target: [bx + 0.5, h[by * W + bx], -(by + 0.5)] } };
}`;

async function dayShown(page: Page, hazard: string, day: number | null): Promise<void> {
  const bar = page.getByRole("toolbar", { name: "Water time" });
  await bar.getByRole("button", { name: hazard === "badtide" ? "Badtide" : "Drought", exact: true }).click();
  await page.waitForFunction(() => /Day \d+/.test(document.querySelector('[aria-label="Water time"]')?.textContent ?? ""), null, { timeout: 240_000 });
  if (day !== null) {
    for (let i = 0; i < 40; i++) {
      const now = Number(/Day (\d+)/.exec((await bar.textContent()) ?? "")?.[1]);
      if (now === day) break;
      await bar.getByRole("button", { name: now < day ? "▶" : "◀" }).click();
      await page.waitForTimeout(400);
    }
  }
  await page.waitForTimeout(600);
  await page.waitForFunction(() => !document.querySelector(".day-fill"), null, { timeout: 240_000 });
  await page.waitForTimeout(1500);
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ channel: "chrome", headless: false, args: GPU_ARGS, ignoreDefaultArgs: ["--enable-unsafe-swiftshader"] });
  const shots: { file: string; label: string; png: Buffer }[] = [];
  let gpuLine = "";
  try {
    for (const scheme of SCHEMES) {
      for (const [w, h] of SIZES) {
        const context = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, colorScheme: scheme });
        await context.addInitScript(`try { localStorage.setItem('dgm.look', '${LOOK}'); } catch {}`);
        const page = await context.newPage();
        const errors: string[] = [];
        page.on("pageerror", (e) => errors.push(String(e)));
        await page.goto(`${URL_}${MAP}`);
        await waitForEditor(page, 600_000);
        await page.waitForFunction("window.dgmEditor.waterSettled()", null, { timeout: 120_000 });
        gpuLine = (await page.evaluate(`(() => { const g = document.createElement('canvas').getContext('webgl'); const e = g.getExtension('WEBGL_debug_renderer_info'); return g.getParameter(e.UNMASKED_RENDERER_WEBGL); })()`)) as string;
        if (/SwiftShader|llvmpipe|Software|Basic Render/i.test(gpuLine)) throw new Error(`software rendering: ${gpuLine}`);
        await page.evaluate(`(() => { const r = window.dgm3d.renderer; if (${JSON.stringify(LOOK)} === 'high') for (const k of Object.keys(r.highEffects)) r.setHighEffect(k, true); r.setLookChoice(${JSON.stringify(LOOK)}, false); })()`);
        await page.waitForFunction("window.dgm3d.renderer.highSettled || ('" + LOOK + "' !== 'high')", null, { timeout: 120_000 });
        await page.evaluate("window.dgm3d.renderer.setClock(12.5)");
        await dayShown(page, HAZARD, DAY);
        const found = (await page.evaluate(`(${FIND_JS})(${JSON.stringify([HAZARD, ZOOM])})`)) as { found: number; view: unknown };
        await page.evaluate(`window.dgm3d.renderer.setView(${JSON.stringify(found.view)})`);
        await page.mouse.move(w / 2, h * 0.05);
        await page.waitForTimeout(2500);
        const png = await page.screenshot({ type: "png" });
        const file = join(OUT, `${HAZARD}-${LOOK}-${scheme}-${w}x${h}.png`);
        writeFileSync(file, png);
        console.log(`${file} (found ${found.found.toFixed(2)}) ${errors.length ? "ERRORS " + errors.join("|") : ""}`);
        shots.push({ file, label: `${scheme} ${w}x${h}`, png });
        if (PAIR && scheme === SCHEMES[0] && w === 1280) {
          // the same camera on Day 0, the map's own water and ground
          const bar = page.getByRole("toolbar", { name: "Water time" });
          await bar.locator(".day-label").dblclick();
          await bar.getByRole("textbox", { name: "Day" }).fill("0");
          await bar.getByRole("textbox", { name: "Day" }).press("Enter");
          await page.waitForFunction(() => !document.querySelector(".day-fill"), null, { timeout: 120_000 });
          await page.mouse.move(w / 2, h * 0.05);
          await page.waitForTimeout(2500);
          const png0 = await page.screenshot({ type: "png" });
          writeFileSync(join(OUT, `${HAZARD}-${LOOK}-${scheme}-${w}x${h}-day0.png`), png0);
          shots.push({ file, label: `Day 0 ${scheme} ${w}x${h}`, png: png0 });
        }
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
  console.log(`GPU: ${gpuLine}`);
  if (SHEET) {
    // a sheet: the 1280x800 shot of each scheme, side by side (small)
    const b = await chromium.launch({ channel: "chrome", headless: true });
    const tool = await b.newPage();
    const pick = [...shots.filter((s) => s.label.startsWith("Day 0")), ...shots.filter((s) => !s.label.startsWith("Day 0") && s.label.endsWith("1280x800"))];
    const imgs = pick.map((s) => s.png.toString("base64"));
    const labels = pick.map((s) => (s.label.startsWith("Day 0") ? `${MARK ? MARK + ": " : ""}the map's own day, ${LOOK}, ${s.label.slice(6)}` : `${MARK ? MARK + ": " : ""}${HAZARD} held${DAY !== null ? " on day " + DAY : " on its last day"}, ${LOOK}, ${s.label}`));
    const code = `async ({ imgs, labels }) => {
      const els = await Promise.all(imgs.map(async (b) => { const i = new Image(); i.src = "data:image/png;base64," + b; await i.decode(); return i; }));
      const w = 760, h = Math.round(els[0].height * w / els[0].width), band = 26;
      const c = document.createElement("canvas"); c.width = w * els.length; c.height = h + band;
      const g = c.getContext("2d"); g.fillStyle = "#1b1b1b"; g.fillRect(0, 0, c.width, c.height);
      els.forEach((e, k) => { g.drawImage(e, k * w, band, w, h); g.fillStyle = "#f2f2f2"; g.font = "15px system-ui, sans-serif"; g.fillText(labels[k], k * w + 8, 18); });
      return c.toDataURL("image/jpeg", 0.8).split(",")[1];
    }`;
    const b64 = (await tool.evaluate(`(${code})(${JSON.stringify({ imgs, labels })})`)) as string;
    writeFileSync(SHEET, Buffer.from(b64, "base64"));
    console.log(`${SHEET}: ${Math.round(Buffer.from(b64, "base64").length / 1024)} KB`);
    await b.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
