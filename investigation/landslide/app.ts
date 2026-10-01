import { snapshotMap, type FullForceMap } from "../../src/core/forces/force";
import { FreehandPath } from "../../src/editor/freehand";
import { showMs } from "../../src/editor/forceDriver";
import { pathLength } from "../../src/core/forces/path";
import { footprint } from "../../src/core/forces/objects";
import { CASES, loadCase } from "./maps";
import { DEFAULTS, reveal, widthOf, type Plan, type Settings, type Intent } from "./landslide";
import { View } from "./view";
import { Sound } from "./audio";
import "./style.css";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>("land"), view = new View(canvas), audio = new Sound();
const worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
let settings: Settings = { ...DEFAULTS }, map: FullForceMap, initial: FullForceMap;
let current = CASES[0], pen = new FreehandPath(128, 128), band: { x: number; y: number }[] | null = null;
let id = 0, active: { id: number; t0: number; plan: Plan | null; skip: boolean; watch: boolean; start: number; duration: number } | null = null;
const history: { before: FullForceMap; intent: Intent; settings: Settings; plan?: Plan }[] = [];
let sizeKey = false, resizeFrom: { x: number; size: number } | null = null, waterTicks = 0;
const metrics = { plannedMs: 0, finalMs: 0, renderedFrames: 0, settled: false, lastSeed: 0 };
let pendingResolve: (() => void) | null = null;
try {
  const prefs = JSON.parse(localStorage.getItem("landslide-prefs") ?? "{}");
  settings = { ...settings, ...prefs.settings, seed: 1 };
  $<HTMLInputElement>("watch").checked = !!prefs.watch;
  $<HTMLInputElement>("sound").checked = prefs.sound !== false;
  $("details").hidden = !prefs.more;
} catch { /* first visit */ }
function save(): void {
  localStorage.setItem("landslide-prefs", JSON.stringify({ settings, watch: $<HTMLInputElement>("watch").checked, sound: $<HTMLInputElement>("sound").checked, more: !$("details").hidden }));
}
function controls(): void {
  $<HTMLInputElement>("power").value = String(settings.power);
  $("powerValue").textContent = String(settings.power);
  $<HTMLInputElement>("size").value = String(widthOf(settings));
  $("sizeValue").textContent = settings.size === null ? `Auto · ${Math.round(widthOf(settings))}` : String(settings.size);
  $<HTMLSelectElement>("style").value = settings.style; $<HTMLInputElement>("floor").value = String(settings.floor);
  $("more").setAttribute("aria-expanded", String(!$("details").hidden));
  $<HTMLButtonElement>("undo").disabled = !history.length;
  $<HTMLButtonElement>("again").disabled = !history.length || !!active;
  $<HTMLButtonElement>("example").disabled = !!active;
}
function status(text: string): void { $("status").textContent = text; }
function cancelWorker(): void { worker.postMessage({ kind: "cancel" }); }
async function choose(index: number): Promise<void> {
  const loading = ++id; active = null; cancelWorker(); audio.stop(); pen.cancel(); history.length = 0;
  current = CASES[index]; $<HTMLSelectElement>("case").value = String(index);
  status("Loading the land…"); const loaded = await loadCase(current);
  if (loading !== id) return;
  initial = loaded; map = snapshotMap(initial);
  settings.power = current.power; settings.size = current.size; settings.seed = 1;
  waterTicks = 0; metrics.settled = false; view.load(map); view.focus(current.intent.path ?? [current.intent.click!]);
  status(`${current.title} · 128² · drag anywhere or try the example`); controls();
}
function start(intent: Intent, again = false): Promise<void> {
  if (active) finish();
  cancelWorker(); audio.stop(); waterTicks = 0;
  if (again && history.length) { const old = history.pop()!; map = snapshotMap(old.before); intent = structuredClone(old.intent); settings.seed = (old.settings.seed + 1) >>> 0; }
  else settings.seed = (settings.seed + 1) >>> 0;
  const before = snapshotMap(map), s = { ...settings };
  history.push({ before, intent: structuredClone(intent), settings: s });
  view.show(map); metrics.settled = false; metrics.renderedFrames = 0;
  active = { id: ++id, t0: performance.now(), plan: null, skip: false, watch: $<HTMLInputElement>("watch").checked, start: 0, duration: 0 };
  const soundId = id;
  if ($<HTMLInputElement>("sound").checked) void audio.unlock().then(() => {
    if (soundId === id && active && $<HTMLInputElement>("sound").checked) audio.crack();
  });
  view.drawBand(intent.path ?? null, 1, map); status("The hillside is cracking…"); controls();
  worker.postMessage({ kind: "plan", id, map: before, settings: s, intent });
  return new Promise(resolve => { pendingResolve = resolve; });
}
function end(): void {
  const a = active; if (!a?.plan) return;
  map = snapshotMap(a.plan.map); view.show(map); view.effects(null, 1);
  metrics.finalMs = performance.now() - a.t0; metrics.lastSeed = a.plan.settings.seed;
  if ($<HTMLInputElement>("sound").checked) audio.settle();
  const st = a.plan.stats;
  status(`Landslide · ${st.removed.toLocaleString()} blocks moved · ${st.style} · water finding its way`);
  $("nature").textContent = `Style: ${st.style} · ${st.edgeLoss} blocks past the edge`;
  history.at(-1)!.plan = a.plan;
  worker.postMessage({ kind: "water", id: a.id }); active = null; controls();
  pendingResolve?.(); pendingResolve = null;
}
function finish(): void { if (active) { active.skip = true; if (active.plan) end(); } }
function undo(): void {
  const old = history.pop(); if (!old) return;
  ++id; active = null; cancelWorker(); audio.stop(); pen.cancel(); band = null;
  map = snapshotMap(old.before); view.drawBand(null, 0, map); view.effects(null, 1); view.show(map);
  status("Undone · the land and water are back"); metrics.settled = false; controls();
  pendingResolve?.(); pendingResolve = null;
}
worker.onmessage = ({ data }) => {
  if (data.id !== id) return;
  if (data.kind === "error") { undo(); status(data.message); return; }
  if (data.kind === "plan" && active) {
    view.drawBand(null,0,map); active.plan = data.plan; metrics.plannedMs = performance.now() - active.t0;
    active.start = performance.now();
    active.duration = showMs("quake", 36, active.watch ? "watch" : "fast", metrics.plannedMs);
    if (active.skip) end();
  }
  if (data.kind === "water" && !active) {
    map.water = data.water; waterTicks = data.ticks; view.show(map);
  }
  if (data.kind === "settled") {
    metrics.settled = data.settled;
    const st = history.at(-1)?.plan?.stats;
    status(`Landslide · ${st?.changed.toLocaleString() ?? 0} tiles · land final in ${(metrics.finalMs / 1000).toFixed(2)}s · ${data.settled ? "water settled" : "water still moving (settle limit)"}`);
  }
};
function frame(now: number): void {
  const a = active;
  if (a?.plan) {
    const progress = Math.min(1, (now - a.start) / a.duration);
    if (progress >= 1) end();
    else {
      map = reveal(a.plan, progress); view.show(map, a.plan, progress); view.effects(a.plan, progress);
      metrics.renderedFrames++; status(`${a.watch ? "Watching" : "Landslide"} · cracking · sliding · spreading · Esc finishes · Undo restores`);
    }
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
canvas.addEventListener("pointerdown", e => {
  if (!map || e.button !== 0) return;
  void audio.unlock();
  if (active) { finish(); return; }
  if (sizeKey) { resizeFrom = { x: e.clientX, size: widthOf(settings) }; canvas.setPointerCapture(e.pointerId); return; }
  const at = view.at(e.clientX, e.clientY); if (!at) return;
  pen.down(at, e.clientX, e.clientY); canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener("pointermove", e => {
  if (resizeFrom) { settings.size = Math.max(4, Math.min(64, Math.round(resizeFrom.size + (e.clientX - resizeFrom.x) / 5))); controls(); return; }
  if (!pen.pressed) return;
  band = pen.move(view.at(e.clientX, e.clientY), e.clientX, e.clientY);
  if (band) { view.drawBand(band, Math.max(8, Math.min(48, pathLength(band)*.48)), map); status(`Draw the Landslide · ${Math.round(Math.max(8,Math.min(48,pathLength(band)*.48)))} tiles wide · Esc cancels`); }
});
canvas.addEventListener("pointerup", e => {
  if (resizeFrom) { resizeFrom = null; save(); return; }
  const gesture = pen.up(view.at(e.clientX, e.clientY));
  band = null; if (map) view.drawBand(null, 0, map);
  if (gesture) void start(gesture);
});
canvas.addEventListener("pointercancel", () => { pen.cancel(); band = null; if (map) view.drawBand(null, 0, map); });
document.addEventListener("keydown", e => {
  if (e.key === "Escape") {
    if (pen.pressed) { pen.cancel(); band = null; view.drawBand(null, 0, map); status("Drawing cancelled"); }
    else if (active) finish();
    resizeFrom = null; return;
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") { e.preventDefault(); undo(); return; }
  if ((e.target as HTMLElement).matches("input,select")) return;
  if (e.key.toLowerCase() === "f") { sizeKey = true; status("Size · hold F and drag left or right"); }
  if (e.key === "{" || e.key === "}") { settings.power = Math.max(0, Math.min(100, settings.power + (e.key === "}" ? 5 : -5))); controls(); save(); }
});
document.addEventListener("keyup", e => { if (e.key.toLowerCase() === "f") sizeKey = false; });
for (const key of ["power", "size"] as const) $<HTMLInputElement>(key).addEventListener("input", e => { settings[key] = Number((e.target as HTMLInputElement).value); controls(); save(); });
$("sizeAuto").onclick = () => { settings.size = null; controls(); save(); };
$("style").onchange = () => { settings.style = $<HTMLSelectElement>("style").value as Settings["style"]; save(); };
$("floor").onchange = () => {
  const v = Number($<HTMLInputElement>("floor").value);
  if (!Number.isInteger(v) || v < 1 || v > 22) { status("Floor is a whole level from 1 to 22"); controls(); return; }
  settings.floor = v; save();
};
$("floorDefault").onclick = () => { settings.floor = 1; controls(); save(); };
$("more").onclick = () => { $("details").hidden = !$("details").hidden; controls(); save(); };
$("undo").onclick = undo;
$("again").onclick = () => { void audio.unlock(); const old = history.at(-1); if (old) void start(old.intent, true); };
$("example").onclick = () => { void audio.unlock(); void start(current.intent); };
$("reset").onclick = () => { void choose(CASES.indexOf(current)); };
for (const key of ["watch", "sound"]) $(key).onchange = () => { if (!$<HTMLInputElement>("sound").checked) audio.stop(); save(); };
$<HTMLSelectElement>("case").innerHTML = CASES.map((c, i) => `<option value="${i}">${c.title}</option>`).join("");
$("case").onchange = () => { void choose(Number($<HTMLSelectElement>("case").value)); };
void choose(0);

// Local automation exercises the same start/worker/playback/undo path as the visible controls.
declare global { interface Window { landslide: {
  ready: () => boolean; choose: (i: number) => Promise<void>; run: (intent?: Intent) => Promise<void>;
  undo: () => void; finish: () => void; metrics: typeof metrics;
  state: () => { map: FullForceMap; settings: Settings; history: number; active: boolean; waterTicks: number };
  set: (s: Partial<Settings>, watch?: boolean) => void; screen: View["screen"];
} } }
window.landslide = { ready: () => !!map, choose, run: (intent = current.intent) => start(intent),
  undo, finish, metrics, state: () => ({ map, settings, history: history.length, active: !!active, waterTicks }),
  set: (s, watch) => { settings = { ...settings, ...s }; if (watch !== undefined) $<HTMLInputElement>("watch").checked = watch; controls(); },
  screen: p => view.screen(p) };
