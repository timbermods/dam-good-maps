// The Erode demo: one force and the view it needs.
// - A click wears the rock where you click; a drag paints the sweep along a cliff or a ridge (the
//   stroke shows as it's drawn: it is the gesture, D258 (4)). No outline or prediction, ever.
// - The row: Power (how deep the rock wears), Size (how big the openings are; Auto follows Power,
//   D226) and Try another (a different result for the same gesture). Nothing more.
// - One undo step per erode; Esc takes a playing erode back at once.
// - The moment: it starts on pointer-down (dust and the grind before the rock is even planned), the
//   rock wears away over 2 to 4 seconds in the order it wore, dust and rubble falling, the opening
//   revealed as it clears. Round 2 finishes the land within about a second. The camera never moves by itself (D265).
import * as THREE from "three";
import { autoSize, DEFAULTS, erosionFloor, type ErodeSettings, type Gesture } from "../core/erode";
import { fromJson, washMap, type ErodeMap, type MapJson, type Thing } from "../core/map";
import { unevenMap } from "./uneven";
import { DETAIL_LABELS, type WashDetails } from "../core/wash";
import { LAYERS, Terrain } from "../core/terrain";
import { waterPools } from "../core/water";
import { Sounds } from "./audio";
import { CASES as LAND_CASES, type Case } from "./cases";
import { roofMap, ROOF_CASES } from "./roofs";
import { kylerCase } from "./sweeps";
import { settleThings } from "../core/objects";
import { Effects } from "./effects";
import { View, type CameraPose, type Hit } from "./view";
import type { PlanReply, PlanRequest } from "./worker";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const CASES = [...LAND_CASES, ...ROOF_CASES, kylerCase()];
const canvas = $<HTMLCanvasElement>("view");
const view = new View(canvas);
const sounds = new Sounds();
const effects = new Effects(view.effects, view.dustMaterial(), () => view.terrain);
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
effects.reduced = reducedMotion.matches;
reducedMotion.addEventListener("change", () => (effects.reduced = reducedMotion.matches));

const worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });

interface Entry {
  before: Uint32Array;
  after: Uint32Array;
  box: Box;
  gesture: Gesture;
  settings: ErodeSettings;
  stats: PlanReply;
}
type Box = { x0: number; y0: number; x1: number; y1: number };

const state = {
  map: null as ErodeMap | null,
  terrain: null as Terrain | null,
  caseId: "",
  settings: { ...DEFAULTS } as ErodeSettings,
  undo: [] as Entry[],
  redo: [] as Entry[],
  pending: 0,
  planning: null as null | { id: number; gesture: Gesture; settings: ErodeSettings; before: Uint32Array; replace: boolean; endedAt: number },
  playing: null as null | { reply: PlanReply; before: Uint32Array; t0: number; shown: number; gesture: Gesture; settings: ErodeSettings; replace: boolean; lastLight: number },
  /** For captures: true once the last erode has finished playing. */
  idle: true,
  last: null as PlanReply | null,
  instant: false,
  /** Captures drive the clock themselves (a frame at a time), so a GIF's frames are exact. */
  manual: false,
  usedDetails: null as WashDetails | null,
  lastFinalMs: 0,
};
try { state.settings.details = JSON.parse(localStorage.getItem("erode-details") ?? "{}"); } catch { /* use Auto */ }
try {
  const saved = localStorage.getItem("erode-floor");
  if (saved !== null) state.settings.floor = erosionFloor({ ...DEFAULTS, floor: Number(saved) });
} catch { /* fixed default: 1 */ }
let clock = 0;
const now = () => (state.manual ? clock : performance.now());

// ------------------------------------------------------------------------------------------ maps

const cache = new Map<string, ErodeMap>();
async function loadMap(id: string): Promise<ErodeMap> {
  if (id === "roof") return roofMap().map;
  if (id === "wash") return washMap();
  const uneven = unevenMap(id);
  if (uneven) return uneven;
  const hit = cache.get(id);
  if (hit) return hit;
  const bytes = new Uint8Array(await (await fetch(`maps/${id}.json.gz`)).arrayBuffer());
  let text: string;
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
    const ds = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
    text = await new Response(ds).text();
  } else text = new TextDecoder().decode(bytes);
  const m = fromJson(JSON.parse(text) as MapJson);
  cache.set(id, m);
  return m;
}

function things(): Thing[] {
  const t = state.terrain!;
  return settleThings(t, state.map!.things, state.map!.water);
}

function showWater(): void {
  view.setWater(waterPools(state.terrain!, state.map!.water));
}

async function openCase(c: Case): Promise<void> {
  cancelPlay();
  const m = await loadMap(c.map);
  state.map = m;
  state.caseId = c.id;
  state.terrain = m.id === "roof" ? roofMap().terrain : Terrain.fromHeights(m.W, m.H, m.heights);
  view.setLand(state.terrain, m.rock, m.moist);
  view.setThings(things());
  showWater();
  state.undo = [];
  state.redo = [];
  state.settings = { ...state.settings, power: c.power, size: c.size, seed: c.seed };
  syncRow();
  view.pose = structuredClone(c.overview);
  $("mapname").textContent = m.name;
  $("gesturehint").textContent = `This case: ${c.gesture.charAt(0).toLowerCase()}${c.gesture.slice(1)}.`;
  $<HTMLButtonElement>("low").textContent = c.lowName;
  readout();
}

// ------------------------------------------------------------------------------------------ the row

const power = $<HTMLInputElement>("power");
const size = $<HTMLInputElement>("size");
const auto = $<HTMLInputElement>("auto");
function syncRow(): void {
  power.value = String(state.settings.power);
  $("powerv").textContent = String(state.settings.power);
  auto.checked = state.settings.size === null;
  const s = state.settings.size ?? autoSize(state.settings.power);
  size.value = String(s);
  $("sizev").textContent = state.settings.size === null ? `Auto (${s})` : String(s);
  syncDetails();
}
power.addEventListener("input", () => {
  state.settings.power = Number(power.value);
  syncRow();
});
size.addEventListener("input", () => {
  state.settings.size = Number(size.value);
  syncRow();
});
auto.addEventListener("change", () => {
  state.settings.size = auto.checked ? null : Number(size.value);
  syncRow();
});
$("another").addEventListener("click", () => tryAnother());

const more = $("more"), detailPanel = $("details");
try { detailPanel.hidden = localStorage.getItem("erode-more") !== "open"; } catch { /* closed */ }
more.setAttribute("aria-expanded", String(!detailPanel.hidden));
more.addEventListener("click", () => {
  detailPanel.hidden = !detailPanel.hidden;
  more.setAttribute("aria-expanded", String(!detailPanel.hidden));
  try { localStorage.setItem("erode-more", detailPanel.hidden ? "closed" : "open"); } catch { /* optional storage */ }
});
const detailRows = new Map<keyof WashDetails, { slider: HTMLInputElement; value: HTMLOutputElement; pin: HTMLButtonElement }>();
for (const key of Object.keys(DETAIL_LABELS) as (keyof WashDetails)[]) {
  const row = document.createElement("label"), text = document.createElement("span");
  text.textContent = DETAIL_LABELS[key];
  const slider = document.createElement("input"); slider.type = "range"; slider.min = "0"; slider.max = "100"; slider.step = "1";
  slider.setAttribute("aria-label", DETAIL_LABELS[key]);
  const value = document.createElement("output"), pin = document.createElement("button"); pin.type = "button";
  const setPin = (v: number | null) => {
    state.settings.details = { ...state.settings.details, [key]: v };
    try { localStorage.setItem("erode-details", JSON.stringify(state.settings.details)); } catch { /* optional storage */ }
    syncDetails();
  };
  slider.addEventListener("input", () => setPin(Number(slider.value)));
  pin.addEventListener("click", e => { e.preventDefault(); setPin(state.settings.details?.[key] == null ? Number(slider.value) : null); });
  row.append(text, slider, value, pin); detailPanel.append(row); detailRows.set(key, { slider, value, pin });
}
const floorRow = document.createElement("label"), floorText = document.createElement("span");
floorText.textContent = "Floor";
const floorSlider = document.createElement("input");
floorSlider.type = "range"; floorSlider.min = "1"; floorSlider.max = String(LAYERS - 1); floorSlider.step = "1";
floorSlider.setAttribute("aria-label", "Floor"); floorSlider.title = "Lowest level Erode may cut down to";
const floorValue = document.createElement("output"), floorPin = document.createElement("button"); floorPin.type = "button";
function setFloor(value?: number): void {
  state.settings.floor = value;
  try {
    if (value === undefined) localStorage.removeItem("erode-floor");
    else localStorage.setItem("erode-floor", String(value));
  } catch { /* optional storage */ }
  syncDetails();
}
floorSlider.addEventListener("input", () => setFloor(Number(floorSlider.value)));
floorPin.addEventListener("click", e => { e.preventDefault(); setFloor(state.settings.floor === undefined ? Number(floorSlider.value) : undefined); });
floorRow.append(floorText, floorSlider, floorValue, floorPin); detailPanel.append(floorRow);
function syncDetails(): void {
  const pinned = state.settings.floor !== undefined, floor = erosionFloor(state.settings);
  floorSlider.value = String(floor);
  floorValue.textContent = `${floor} · ${pinned ? "pinned" : "default"}`;
  floorPin.textContent = pinned ? "Default" : "Pin";
  floorPin.setAttribute("aria-label", pinned ? "Reset to default Floor" : "Pin Floor");
  for (const [key, row] of detailRows) {
    const pin = state.settings.details?.[key], used = state.usedDetails?.[key];
    row.slider.value = String(pin ?? used ?? 50);
    row.value.textContent = pin != null ? `${pin} · pinned` : used != null ? `Auto (${used})` : "Auto";
    row.pin.textContent = pin == null ? "Pin" : "Auto";
    row.pin.setAttribute("aria-label", `${pin == null ? "Pin" : "Reset to Auto"} ${DETAIL_LABELS[key]}`);
  }
}

function interruptEffects(): void { effects.clear(); sounds.interrupt(); }

// ------------------------------------------------------------------------------------------ planning

function plan(gesture: Gesture, settings: ErodeSettings, replace: boolean): void {
  const t = state.terrain!, m = state.map!;
  const id = ++state.pending;
  state.planning = { id, gesture, settings: structuredClone(settings), before: t.cols.slice(), replace, endedAt: now() };
  state.idle = false;
  const req: PlanRequest = { id, W: t.W, H: t.H, cols: t.cols.slice(), rock: m.rock, keep: m.keep, water: m.water, gesture, settings };
  worker.postMessage(req);
}

worker.onmessage = (ev: MessageEvent<PlanReply>) => {
  const r = ev.data;
  const p = state.planning;
  if (!p || p.id !== r.id) return;
  state.planning = null;
  state.last = r;
  if (r.reason) {
    word(r.reason);
    sounds.stopWear(0.2);
    state.idle = true;
    return;
  }
  state.playing = { reply: r, before: p.before, t0: p.endedAt, shown: -1, gesture: p.gesture, settings: p.settings, replace: p.replace, lastLight: -1 };
  if (state.instant) finishPlay();
};

function tryAnother(): void {
  if (state.playing || state.planning) return;
  const last = state.undo[state.undo.length - 1];
  if (!last) return;
  // the same gesture from the same land, a new personality, the row as it stands
  restore(last.before, last.box);
  state.undo.pop();
  interruptEffects();
  sounds.wake().then(() => sounds.startWear());
  plan(last.gesture, { ...state.settings, seed: (last.settings.seed + 1) >>> 0 }, true);
}

// ------------------------------------------------------------------------------------------ the moment

const tmp = new THREE.Vector3();
function voxelWorld(v: number, N: number, W: number, falling = false): { p: THREE.Vector3; dir: THREE.Vector3 } {
  const t = state.terrain!;
  const z = Math.floor(v / N), i = v - z * N, x = i % W, y = (i - x) / W;
  const p = new THREE.Vector3(x + 0.5, z + 0.5, -(y + 0.5));
  if (falling) return { p, dir: new THREE.Vector3(0, -1, 0) };
  const dir = new THREE.Vector3(0, 0.4, 0);
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) if (!t.solid(x + dx, y + dy, z)) dir.add(tmp.set(dx, 0, -dy));
  return { p, dir: dir.normalize() };
}

function stepPlay(now: number): void {
  const pl = state.playing;
  if (!pl) return;
  const r = pl.reply;
  const t = state.terrain!;
  const e = (now - pl.t0) / 1000;
  const upTo = Math.min(r.buckets - 1, Math.floor((e / r.duration) * r.buckets));
  if (upTo > pl.shown) {
    let count = 0;
    const N = t.N;
    const gone: number[] = [];
    for (let k = 0; k < r.removed.length; k++) {
      const b = r.bucket[k];
      if (b <= pl.shown || b > upTo) continue;
      const v = r.removed[k];
      const z = Math.floor(v / N);
      t.set(v - z * N, z, false);
      gone.push(v);
      count++;
    }
    for (let k = 0; k < (r.added?.length ?? 0); k++) if (r.addBucket![k] > pl.shown && r.addBucket![k] <= upTo) {
      const v = r.added![k]; t.set(v % N, Math.floor(v / N), true);
    }
    // the effects: a share of the worn voxels puff and drop stones
    const every = Math.max(1, Math.round(count / 14));
    let n = 0;
    for (let k = 0; k < r.removed.length; k++) {
      const b = r.bucket[k];
      if (b <= pl.shown || b > upTo) continue;
      if (n++ % every) continue;
      const { p, dir } = voxelWorld(r.removed[k], N, t.W, !!r.roof || !!r.falling?.[k]);
      effects.puff(p, dir, 0.8, k * 0.013);
      if ((k * 7919) % 3 === 0) effects.drop(p.clone().addScaledVector(dir, 0.3), dir, k * 0.021);
    }
    pl.shown = upTo;
    const relight = upTo - pl.lastLight >= 4 || upTo === r.buckets - 1;
    if (relight) pl.lastLight = upTo;
    view.update(r.box, relight);
    if (!relight) view.openCells(gone);
    if (r.roof || r.sweep) { view.setThings(things()); showWater(); }
    sounds.wear(Math.min(1, count / Math.max(8, r.worn / r.buckets) / 1.6));
  }
  if (e >= r.duration) finishPlay();
}

function finishPlay(): void {
  const pl = state.playing;
  if (!pl) return;
  const r = pl.reply;
  const t = state.terrain!;
  t.cols.set(r.finalCols);
  view.update(r.box, true);
  showWater();
  view.setThings(things());
  sounds.stopWear(0.2);
  sounds.collapse();
  const entry: Entry = { before: pl.before, after: r.finalCols.slice(), box: r.box, gesture: pl.gesture, settings: pl.settings, stats: r };
  state.undo.push(entry);
  state.redo = [];
  state.playing = null;
  state.idle = true;
  state.lastFinalMs = now() - pl.t0;
  if (r.details) state.usedDetails = r.details;
  syncRow();
  view.showStroke(null);
  readout();
}

/** Esc: a playing (or planning) erode goes back at once, all of it. */
function cancelPlay(): void {
  if (state.planning) {
    const p = state.planning;
    state.planning = null;
    if (p.replace) {
      // Try another had taken the last one back: it stays taken back
    }
  }
  const pl = state.playing;
  if (pl) {
    state.terrain!.cols.set(pl.before);
    view.update(pl.reply.box, true);
    showWater();
    view.setThings(things());
    state.playing = null;
  }
  interruptEffects();
  view.showStroke(null);
  state.idle = true;
}

function restore(cols: Uint32Array, box: Box): void {
  state.terrain!.cols.set(cols);
  view.update(box, true);
  showWater();
  view.setThings(things());
}

function undo(): void {
  if (state.playing || state.planning) return cancelPlay();
  const e = state.undo.pop();
  if (!e) return;
  restore(e.before, e.box);
  state.redo.push(e);
  readout();
}
function redo(): void {
  if (state.playing || state.planning) return;
  const e = state.redo.pop();
  if (!e) return;
  restore(e.after, e.box);
  state.undo.push(e);
  readout();
}
$("undo").addEventListener("click", undo);
$("redo").addEventListener("click", redo);

// ------------------------------------------------------------------------------------------ input

let down: null | { x: number; y: number; hit: Hit; drag: boolean; tiles: Gesture["points"]; world: THREE.Vector3[] } = null;
let orbiting: null | { x: number; y: number; pan: boolean } = null;

canvas.addEventListener("contextmenu", (e) => e.preventDefault());
canvas.addEventListener("pointerdown", (e) => {
  canvas.setPointerCapture(e.pointerId);
  if (e.button === 2 || e.button === 1) {
    orbiting = { x: e.clientX, y: e.clientY, pan: e.button === 1 || e.shiftKey };
    return;
  }
  if (e.button !== 0 || state.playing || state.planning) return;
  const hit = view.pick(e.clientX, e.clientY);
  if (!hit) return;
  interruptEffects();
  // it starts the instant you act: dust at the rock and the grind, before any planning
  sounds.wake().then(() => sounds.startWear());
  const n = new THREE.Vector3(hit.nx, hit.nz, -hit.ny);
  effects.puff(hit.point.clone().addScaledVector(n, 0.3), n, 4, Math.random());
  down = { x: e.clientX, y: e.clientY, hit, drag: false, tiles: [{ x: hit.x + 0.5, y: hit.y + 0.5, z: hit.z + 0.5, nz: hit.nz }], world: [hit.point.clone()] };
});
canvas.addEventListener("pointermove", (e) => {
  if (orbiting) {
    const dx = e.clientX - orbiting.x, dy = e.clientY - orbiting.y;
    orbiting.x = e.clientX;
    orbiting.y = e.clientY;
    if (orbiting.pan || e.shiftKey) view.pan(dx, dy);
    else view.orbit(dx, dy);
    return;
  }
  const hit = view.pick(e.clientX, e.clientY);
  if (!down) {
    view.showCursor(state.playing || state.planning ? null : hit);
    return;
  }
  if (!down.drag && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) down.drag = true;
  if (!down.drag || !hit) return;
  view.showCursor(hit);
  const last = down.tiles[down.tiles.length - 1];
  const tx = hit.x + 0.5, ty = hit.y + 0.5;
  if (Math.hypot(tx - last.x, ty - last.y) >= 1) {
    down.tiles.push({ x: tx, y: ty, z: hit.z + 0.5, nz: hit.nz });
    down.world.push(hit.point.clone());
    view.showStroke(down.world);
    const n = new THREE.Vector3(hit.nx, hit.nz, -hit.ny);
    effects.puff(hit.point.clone().addScaledVector(n, 0.3), n, 1, Math.random());
  }
});
canvas.addEventListener("pointerup", (e) => {
  if (orbiting) {
    orbiting = null;
    return;
  }
  if (!down) return;
  const d = down;
  down = null;
  if (e.button !== 0) return;
  const gesture: Gesture = { points: d.drag ? simplify(d.tiles) : [d.tiles[0]] };
  plan(gesture, { ...state.settings, seed: (state.settings.seed + state.undo.length * 7) >>> 0 }, false);
});
canvas.addEventListener("wheel", (e) => {
  e.preventDefault();
  view.zoom(e.deltaY);
}, { passive: false });

const keys = new Set<string>();
window.addEventListener("keydown", (e) => {
  if (e.target instanceof HTMLInputElement && e.target.type !== "range" && e.target.type !== "checkbox") return;
  if (e.key === "Escape") return cancelPlay();
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") return (e.preventDefault(), e.shiftKey ? redo() : undo());
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") return (e.preventDefault(), redo());
  keys.add(e.key.toLowerCase());
});
window.addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));

/** A stroke's points at most a tile apart are enough; keep every other one past 40. */
function simplify<T>(pts: T[]): T[] {
  if (pts.length <= 40) return pts;
  return pts.filter((_, k) => k % 2 === 0 || k === pts.length - 1);
}

// ------------------------------------------------------------------------------------------ chrome

let wordTimer = 0;
function word(text: string): void {
  const w = $("word");
  w.textContent = text;
  w.classList.add("on");
  clearTimeout(wordTimer);
  wordTimer = window.setTimeout(() => w.classList.remove("on"), 1600);
}

function readout(): void {
  const e = state.undo[state.undo.length - 1];
  const r = $("readout");
  if (!e) {
    r.textContent = "";
    return;
  }
  const s = e.stats;
  r.textContent = `Worn ${s.worn} blocks · ${s.held} kept to hold a roof · dropped on load: ${s.dropped} · ${Math.round(s.ms)} ms`;
}

const sel = $<HTMLSelectElement>("case");
for (const c of CASES) {
  const o = document.createElement("option");
  o.value = c.id;
  o.textContent = c.title;
  sel.append(o);
}
sel.addEventListener("change", () => openCase(CASES.find((c) => c.id === sel.value)!));
$("playcase").addEventListener("click", () => playCase());
$("overview").addEventListener("click", () => (view.pose = structuredClone(currentCase().overview)));
$("low").addEventListener("click", () => (view.pose = structuredClone(currentCase().low)));
const soundBtn = $<HTMLButtonElement>("sound");
soundBtn.addEventListener("click", () => {
  sounds.setOn(!sounds.on);
  soundBtn.textContent = sounds.on ? "Sound on" : "Sound off";
  soundBtn.setAttribute("aria-pressed", String(sounds.on));
});

function currentCase(): Case {
  return CASES.find((c) => c.id === state.caseId) ?? CASES[0];
}

/** The case's own gesture on its fresh land. */
function playCase(seedOffset = 0): void {
  const c = currentCase();
  if (state.playing || state.planning) return;
  while (state.undo.length) undo();
  state.settings = { ...state.settings, power: c.power, size: c.size, seed: c.seed };
  syncRow();
  interruptEffects();
  sounds.wake().then(() => sounds.startWear());
  const pts = c.points;
  // as a pointer-down does: dust where the gesture touches the rock, at once
  for (const p of pts) effects.puff(new THREE.Vector3(p.x, p.z + 0.3, -p.y), new THREE.Vector3(0, 0.5, 0), 4, p.x * 0.1);
  plan({ points: pts }, { ...state.settings, seed: c.seed + seedOffset }, false);
}

// ------------------------------------------------------------------------------------------ the loop

let lastT = performance.now();
function frame(): void {
  requestAnimationFrame(frame);
  if (state.manual) return;
  tick(performance.now());
}
function tick(t: number): void {
  const dt = (t - lastT) / 1000;
  lastT = t;
  view.time.value = t / 1000;
  // keys pan and turn (the player's own camera)
  const k = (s: string) => keys.has(s);
  const sp = 380 * dt;
  if (k("arrowleft") || k("a")) view.pan(sp, 0);
  if (k("arrowright") || k("d")) view.pan(-sp, 0);
  if (k("arrowup") || k("w")) view.pan(0, sp);
  if (k("arrowdown") || k("s")) view.pan(0, -sp);
  if (k("q")) view.orbit(-200 * dt, 0);
  if (k("e")) view.orbit(200 * dt, 0);
  const finishingFrom = state.playing?.t0;
  stepPlay(t);
  effects.update(dt);
  view.render();
  if (finishingFrom !== undefined && !state.playing) state.lastFinalMs = now() - finishingFrom;
}

function fit(): void {
  view.resize();
}
window.addEventListener("resize", fit);
fit();
effects.onLand = (hard) => sounds.land(hard);

// ------------------------------------------------------------------------------------------ hooks for the captures

declare global {
  interface Window {
    erode: unknown;
  }
}
window.erode = {
  cases: CASES.map((c) => c.id),
  open: async (id: string) => {
    sel.value = id;
    await openCase(CASES.find((c) => c.id === id)!);
  },
  play: (seedOffset = 0, instant = false) => {
    state.instant = instant;
    playCase(seedOffset);
  },
  pose: (p: CameraPose) => (view.pose = structuredClone(p)),
  caseOf: (id: string) => CASES.find((c) => c.id === id),
  get idle() {
    return state.idle && !state.planning && !state.playing;
  },
  get busy() {
    return effects.busy;
  },
  get last() {
    const r = state.undo[state.undo.length - 1]?.stats;
    return r ? { worn: r.worn, held: r.held, fell: r.fell, dropped: r.dropped, ms: r.ms, checkMs: r.checkMs, box: r.box, finalMs: state.lastFinalMs, details: r.details, roof: r.roof, sweep: r.sweep, rubble: r.added?.length } : null;
  },
  snapshot: () => ({ cols: Array.from(state.terrain!.cols), things: things(), pose: structuredClone(view.pose) }),
  quiet: () => effects.clear(),
  undo,
  /** Take the clock (captures): frames advance only through step(). */
  manual: (on: boolean) => {
    state.manual = on;
    clock = performance.now();
    lastT = clock;
  },
  step: (ms: number) => {
    clock += ms;
    tick(clock);
  },
  get planning() {
    return !!state.planning;
  },
  /** Tiles with more than one run now (0 on the land as generated). */
  get hollowTiles() {
    return state.terrain?.multiRun() ?? 0;
  },
  get undoDepth() {
    return state.undo.length;
  },
  /** Where a tile-space point shows on screen (client pixels). */
  screenOf: (x: number, y: number, z: number) => {
    view.applyPose();
    const v = new THREE.Vector3(x, z, -y).project(view.camera);
    const r = canvas.getBoundingClientRect();
    return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
  },
  get playing() {
    return !!state.playing;
  },
};

openCase(CASES[0]).then(() => {
  requestAnimationFrame(frame);
  document.body.dataset.ready = "1";
});
