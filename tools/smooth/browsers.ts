// The five configurations and how each browser is launched (headed, 1440x900 at device pixel ratio 1).

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { unzipSync } from "fflate";
import { chromium, firefox, webkit, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { CONFIG_LABELS, type ConfigId } from "./plan";
import type { Env, FirefoxEvidence } from "./probe";

export const VIEWPORT = { width: 1440, height: 900 };

export interface ConfigDef {
  id: ConfigId;
  label: string;
  engine: "chromium" | "firefox" | "webkit";
  /** CDP CPU throttling rate (Chromium only); 1 is none. */
  throttle: number;
  /** Run on the integrated GPU (Chromium's --use-adapter-luid). */
  integrated?: boolean;
}

export const CONFIGS: Record<ConfigId, ConfigDef> = {
  chromium: { id: "chromium", label: CONFIG_LABELS.chromium, engine: "chromium", throttle: 1 },
  "chromium-4x": { id: "chromium-4x", label: CONFIG_LABELS["chromium-4x"], engine: "chromium", throttle: 4 },
  "igpu-4x": { id: "igpu-4x", label: CONFIG_LABELS["igpu-4x"], engine: "chromium", throttle: 4, integrated: true },
  firefox: { id: "firefox", label: CONFIG_LABELS.firefox, engine: "firefox", throttle: 1 },
  webkit: { id: "webkit", label: CONFIG_LABELS.webkit, engine: "webkit", throttle: 1 },
};

export interface Gpu {
  name: string;
  luid: string;
  active: boolean;
}

/** The machine's GPUs as Chrome lists them (chrome://gpu), as tools/bench3d.ts reads them. */
export async function listGpus(): Promise<Gpu[]> {
  const b = await chromium.launch({ channel: "chrome", headless: true });
  const p = await b.newPage();
  await p.goto("chrome://gpu");
  await p.waitForTimeout(1500);
  const text = (await p.evaluate(
    "(() => { const walk = (n) => { let s = ''; if (n.shadowRoot) s += walk(n.shadowRoot); n.childNodes.forEach((c) => { s += c.nodeType === 3 ? c.textContent + '\\n' : walk(c); }); return s; }; return walk(document.body); })()",
  )) as string;
  await b.close();
  const out: Gpu[] = [];
  for (const line of text.split("\n")) {
    const m = /VENDOR= 0x([0-9a-f]+), DEVICE=0x[0-9a-f]+ \[([^\]]+)\].*LUID=\{(\d+),(\d+)\}(.*)/i.exec(line);
    if (!m || m[1] === "1414") continue; // Microsoft Basic Render Driver
    out.push({ name: m[2], luid: `${m[3]},${m[4]}`, active: /ACTIVE/.test(m[5]) });
  }
  return out;
}

/** The integrated GPU: the AMD Radeon one, else the one that is not the active (discrete) GPU. */
export function pickIntegrated(gpus: Gpu[]): Gpu {
  const radeon = gpus.find((g) => /radeon|amd/i.test(g.name) && !/rx\s?\d{4}|rtx|geforce|nvidia/i.test(g.name));
  const other = radeon ?? gpus.find((g) => !g.active);
  if (!other) throw new Error(`no second GPU to pick: ${gpus.map((g) => g.name).join(", ") || "none listed"}`);
  return other;
}

// a window other windows cover would otherwise stop drawing (as tools/bench3d.ts)
const KEEP_DRAWING = ["--disable-backgrounding-occluded-windows", "--disable-renderer-backgrounding", "--disable-background-timer-throttling"];

/** Firefox runs on the optimizing tier, never pinned to baseline (Kyler's rule): these prefs, and Playwright's debugger bridge
 *  (juggler Runtime.js in the browser's omni.ja) must not hold WebAssembly at the baseline tier. Checked before the first Firefox run. */
export const FIREFOX_PREFS = { "javascript.options.wasm_baselinejit": false, "javascript.options.wasm_optimizingjit": true, "javascript.options.wasm_lazy_tiering": false };

const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
let firefoxChecked: { executable: string; evidence: FirefoxEvidence } | null = null;

/** The Firefox to run (DGM_FIREFOX_EXECUTABLE, else Playwright's) and the proof its debugger is unpinned. Throws, refusing Firefox runs, if not. */
export function firefoxSetup(): { executable: string; evidence: FirefoxEvidence } {
  if (firefoxChecked) return firefoxChecked;
  const executable = process.env.DGM_FIREFOX_EXECUTABLE ?? firefox.executablePath();
  if (!executable || !existsSync(executable)) throw new Error(`Firefox is not installed (${executable}); npx playwright install firefox`);
  const archive = join(dirname(executable), "omni.ja");
  if (!existsSync(archive)) throw new Error(`no omni.ja beside ${executable}: cannot check the Firefox debugger`);
  const bytes = readFileSync(archive);
  const name = "chrome/juggler/content/content/Runtime.js";
  const runtime = unzipSync(bytes, { filter: (f) => f.name === name })[name];
  const text = runtime ? new TextDecoder().decode(runtime) : "";
  const unpinned = text.includes("this._debugger.allowUnobservedWasm = true") && text.includes("this._debugger.allowUnobservedAsmJS = true");
  if (!unpinned) throw new Error(`Firefox refused: its debugger pins WebAssembly to the baseline tier (${name} lacks allowUnobservedWasm/allowUnobservedAsmJS in ${archive}). Use a corrected copy through DGM_FIREFOX_EXECUTABLE.`);
  firefoxChecked = { executable, evidence: { executable, omniJaSha256: sha(bytes), runtimeJsSha256: sha(runtime), runtimeUnpinned: true, prefs: FIREFOX_PREFS } };
  return firefoxChecked;
}

export async function launch(def: ConfigDef, integrated: Gpu | null): Promise<Browser> {
  if (def.engine === "firefox") {
    const { executable } = firefoxSetup();
    return firefox.launch({ headless: false, firefoxUserPrefs: FIREFOX_PREFS, ...(process.env.DGM_FIREFOX_EXECUTABLE ? { executablePath: executable } : {}) });
  }
  if (def.engine === "webkit") return webkit.launch({ headless: false });
  const args = [...KEEP_DRAWING];
  if (def.integrated) {
    if (!integrated) throw new Error("integrated GPU not chosen");
    args.push(`--use-adapter-luid=${integrated.luid}`);
  }
  return chromium.launch({ channel: "chrome", headless: false, args });
}

/** Make the context: fixed viewport and DPR, the look held by the player's own choice, the recorder injected. */
export async function newPage(browser: Browser, look: string, probe: string): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  // dgm.look is the player's choice, which wins over the automatic fallback (src/render3d/high/fallback.ts)
  await context.addInitScript(`try { localStorage.setItem('dgm.look', ${JSON.stringify(look)}); } catch {}`);
  await context.addInitScript(probe);
  const page = await context.newPage();
  page.setDefaultTimeout(180_000);
  return { context, page };
}

export async function throttle(context: BrowserContext, page: Page, rate: number): Promise<void> {
  if (rate <= 1) return;
  const cdp = await context.newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate });
}

/** The WebGL renderer, the display's rate, the pixel ratio and the look the page actually draws. */
export async function readEnv(page: Page, browser: Browser, def: ConfigDef): Promise<Env> {
  const e = (await page.evaluate(`new Promise((resolve) => {
    const c = document.createElement("canvas").getContext("webgl2");
    const x = c && c.getExtension("WEBGL_debug_renderer_info");
    const webgl = c ? String(x ? c.getParameter(x.UNMASKED_RENDERER_WEBGL) : c.getParameter(c.RENDERER)) : "no WebGL2";
    const t = [];
    const step = (now) => { t.push(now); if (t.length < 61) requestAnimationFrame(step); else resolve({ webgl, refreshHz: Math.round(60000 / (t[60] - t[0])), dpr: window.devicePixelRatio, look: (window.dgm3d && window.dgm3d.renderer.look) || null }); };
    requestAnimationFrame(step);
  })`)) as Omit<Env, "browser" | "engine">;
  return { browser: browser.version(), engine: def.engine, ...e, ...(def.engine === "firefox" ? { firefox: firefoxSetup().evidence } : {}) };
}
