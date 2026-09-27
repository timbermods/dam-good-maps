import './style.css';
import { MapRenderer, type ViewState } from '../../src/render3d/renderer';
import type { MapView } from '../../src/render3d/model';
import { THEMES, THEME_NAMES } from '../../src/core/spec/mapspec';
import { CHANGES, NOT_ENDORSED, PROVIDER_NOTICES } from '../../src/core/places/attribution';
import { Effects, bridge } from './base-effects';
import { WaterFlow, surfaceContamination } from '../maplook2/flow';
import { badwaterBed } from '../maplook2/badwater-bed';
import { Lighting } from './lighting';
import { Terrain } from './terrain';
import { Post } from './post';
import { Vegetation } from './vegetation';
import { pose } from './poses';
import type { MapRequest } from './maps.worker';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const standard = new MapRenderer($<HTMLCanvasElement>('standard'));
const high = new MapRenderer($<HTMLCanvasElement>('high'));
standard.setClock(8); high.setClock(8);
const base = new Effects(high); base.water = base.shadows = true; base.apply();
const flow = new WaterFlow(bridge(high).waterMat);
const bed = badwaterBed(bridge(high).terrainMat, bridge(high).waterMat);
const lighting = new Lighting(high, base);
const terrain = new Terrain(bridge(high).terrainMat);
const post = new Post(high);
const vegetation = new Vegetation($<HTMLCanvasElement>('trees'));
$('specimen-panel').hidden = false;
const labels = { water: 'Water', shadows: 'Soft shadows', ao: 'Ambient occlusion', tone: 'Tone mapping', grade: 'Colour grade', haze: 'Distance haze', sky: 'Sky', strata: 'Rock strata', blend: 'Soil edges', variation: 'Colour variation', specimens: 'Tree sketch', wind: 'Wind' };
type Effect = keyof typeof labels;
const flags = Object.fromEntries(Object.keys(labels).map(k => [k, true])) as Record<Effect, boolean>;
for (const [key, label] of Object.entries(labels)) {
  const el = document.createElement('label'); el.className = 'check';
  const input = document.createElement('input'); input.type = 'checkbox'; input.checked = true; input.id = key;
  input.onchange = () => setEffects({ [key]: input.checked });
  el.append(input, document.createTextNode(label)); $('toggles').append(el);
}
function setEffects(change: Partial<Record<Effect, boolean>>) {
  Object.assign(flags, change);
  for (const k of Object.keys(labels) as Effect[]) $<HTMLInputElement>(k).checked = flags[k];
  base.water = flags.water; base.shadows = flags.shadows; base.apply(); bed.setEnabled(flags.water);
  lighting.ao.value = +flags.ao; lighting.haze.value = +flags.haze; lighting.sky.value = +flags.sky;
  lighting.unclamp.value = +(flags.tone || flags.grade);
  terrain.strata.value = +flags.strata; terrain.blend.value = +flags.blend; terrain.variation.value = +flags.variation;
  post.tone = flags.tone; post.grade = flags.grade;
  vegetation.enabled = flags.specimens; vegetation.wind = flags.wind;
  $('specimen-panel').hidden = !flags.specimens;
  $('all').textContent = Object.values(flags).some(Boolean) ? 'All off' : 'All on';
  high.requestRender();
}
function all(on: boolean) { setEffects(Object.fromEntries(Object.keys(labels).map(k => [k, on]))); }
$('all').onclick = () => all(!Object.values(flags).some(Boolean));

const options: MapRequest[] = [];
const select = $<HTMLSelectElement>('map');
function option(g: HTMLOptGroupElement, label: string, request: Omit<MapRequest, 'id'>) {
  const el = document.createElement('option'); el.value = String(options.length); el.textContent = label; g.append(el); options.push({ id: 0, ...request });
}
function group(label: string) { const g = document.createElement('optgroup'); g.label = label; select.append(g); return g; }
const generated = group('Generated landscapes');
for (const theme of THEMES) for (const size of [128, 256]) option(generated, `${THEME_NAMES[theme]} · ${size}²`, { kind: 'generated', theme, size });
const real = group('Real places');
for (const name of ['near-victoria-falls', 'near-yosemite-valley', 'near-danube-delta']) option(real, name.replaceAll('-', ' '), { kind: 'place', name });
for (const text of [CHANGES, NOT_ENDORSED, ...PROVIDER_NOTICES]) { const p = document.createElement('p'); p.textContent = text; $('credits').append(p); }
const gpu = standard.gpu().renderer;
$('gpu').textContent = `${gpu}${/SwiftShader|llvmpipe|Software|Basic Render/i.test(gpu) ? ' · software rendering; full Standard forced for comparison' : ''}`;
let map: MapView | undefined, label = '', ready = false, worker: Worker | undefined, serial = 0;
let rejectLoad: ((e: Error) => void) | undefined;
let syncing = false;
function sync(other: MapRenderer, view: ViewState) { if (syncing || measuring) return; syncing = true; other.setView(view); syncing = false; }
standard.onView = v => sync(high, v); high.onView = v => sync(standard, v);
async function load(index = Number(select.value), seed = Number($<HTMLInputElement>('seed').value), dense = $<HTMLInputElement>('dense').checked) {
  rejectLoad?.(new Error('Map load superseded')); worker?.terminate(); ready = false; serial++;
  select.value = String(index); $<HTMLInputElement>('seed').disabled = options[index].kind !== 'generated';
  $<HTMLInputElement>('dense').disabled = options[index].kind !== 'generated';
  $('status').textContent = 'Loading map in a worker…';
  worker = new Worker(new URL('./maps.worker.ts', import.meta.url), { type: 'module' });
  return new Promise<void>((resolve, reject) => {
    rejectLoad = reject;
    const fail = (error: string) => { $('status').textContent = error; worker?.terminate(); worker = undefined; rejectLoad = undefined; reject(new Error(error)); };
    worker!.onerror = e => fail(e.message);
    worker!.onmessage = ({ data }) => {
      if (data.id !== serial) return;
      if (data.progress) { $('status').textContent = data.progress; return; }
      if (data.error) { fail(data.error); return; }
      try {
        map = data.view; label = data.label;
        lighting.setMap(map!); flow.set(map!.W, map!.H, data.velocity, surfaceContamination(map!));
        standard.setMap(map!); high.setMap(map!); base.fit(map!.W, map!.H);
        if (!setPose($<HTMLSelectElement>('pose').value)) setPose('overview');
        ready = true;
        $('status').textContent = `${label} · ${map!.entities.count.toLocaleString()} objects · ${lighting.stats.trees.toLocaleString()} living trees · ${lighting.stats.ruins.toLocaleString()} ruins · cameras synced`;
        worker?.terminate(); worker = undefined; rejectLoad = undefined; resolve();
      } catch (e) { fail(String(e)); }
    };
    worker!.postMessage({ ...options[index], id: serial, seed, dense });
  });
}
function setPose(kind: string) {
  if (!map) return false;
  const p = pose(map, kind);
  if (!p.found) { $('status').textContent = `No ${kind} found in this map.`; return false; }
  standard.setView(p.camera); high.setView(p.camera); $<HTMLSelectElement>('pose').value = kind; return true;
}
$('load').onclick = () => { void load().catch(console.warn); }; select.onchange = () => { void load().catch(console.warn); };
$<HTMLSelectElement>('pose').onchange = e => setPose((e.target as HTMLSelectElement).value);
$('angle').onclick = () => { const v = standard.getView(); standard.setView({ yaw: v.yaw + Math.PI / 2 }); high.setView(standard.getView()); };

let measuring = false, permitted = false;
const counts = [0, 0], totals = [0, 0];
for (const [i, r] of [standard, high].entries()) {
  const b = bridge(r), draw = b.gl.render.bind(b.gl);
  b.gl.render = (scene, camera) => {
    if (measuring && !permitted) return;
    draw(scene, camera); if (scene === b.scene) {
      counts[i]++; totals[i]++;
      if (i === 1) vegetation.render(b.uniforms.time.value);
    }
  };
}
let clock = 8, previous = performance.now(), last = previous;
function frame(now: number) {
  const dt = Math.min(.1, (now - previous) / 1000); previous = now;
  const paused = $<HTMLInputElement>('pause').checked || document.hidden || matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (ready && !paused && !measuring) { clock += dt; standard.setClock(clock); high.setClock(clock); }
  if (now - last > 1000) {
    for (const [i, name] of ['standard-fps', 'high-fps'].entries()) $(name).textContent = measuring ? 'measuring' : paused ? 'paused' : `${(counts[i] * 1000 / (now - last)).toFixed(1)} fps`;
    counts.fill(0); last = now;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

const nextFrame = () => new Promise<number>(resolve => requestAnimationFrame(resolve));
const percentile = (v: number[], q: number) => [...v].sort((a, b) => a - b)[Math.min(v.length - 1, Math.floor(v.length * q))] ?? 0;
/** Measures actual presentation cadence plus completion time. finish() is deliberate:
 * it includes GPU work, rather than reporting only fast asynchronous submission. */
async function measure(mode: 'standard' | 'high' | 'both', milliseconds = 2200) {
  if (!ready || measuring) throw new Error('Map not ready or measurement already active');
  const view = standard.getView(), paused = $<HTMLInputElement>('pause').checked;
  measuring = true; document.body.classList.add('measuring');
  try {
    const renderers = mode === 'both' ? [standard, high] : [mode === 'standard' ? standard : high];
    const deltas: number[] = [], renderTimes: number[] = [];
    let started = await nextFrame(), lastFrame = started, elapsed = 0;
    while (elapsed < milliseconds + 700) {
      if (document.hidden) throw new Error('Keep the demo visible during measurement');
      const now = await nextFrame(); elapsed = now - started;
      const v = { ...view, yaw: view.yaw + elapsed / 10000 * Math.PI * 2 };
      for (const r of renderers) { r.setView(v); r.setClock(8 + elapsed / 1000); }
      const begin = performance.now(); permitted = true;
      for (const r of renderers) { r.renderNow(); bridge(r).gl.getContext().finish(); if (r === high && vegetation.enabled) vegetation.finish(); }
      permitted = false;
      if (elapsed > 700) { deltas.push(now - lastFrame); renderTimes.push(performance.now() - begin); }
      lastFrame = now;
    }
    return { mode, frames: deltas.length, fps: 1000 / (deltas.reduce((a, b) => a + b, 0) / deltas.length), frameP50: percentile(deltas, .5), frameP95: percentile(deltas, .95), renderP50: percentile(renderTimes, .5), renderP95: percentile(renderTimes, .95), drawingBuffer: [standard.canvas.width, standard.canvas.height], effects: { ...flags }, shadowPasses: base.passes };
  } finally {
    permitted = false; measuring = false; document.body.classList.remove('measuring');
    standard.setView(view); high.setView(view); $<HTMLInputElement>('pause').checked = paused;
    standard.setClock(clock); high.setClock(clock);
  }
}
let measurements: unknown;
$('bench').onclick = async () => {
  $<HTMLButtonElement>('bench').disabled = true;
  try {
    const results = [];
    for (const mode of ['standard', 'high', 'both'] as const) { $('measure').textContent = `Measuring ${mode}…`; results.push(await measure(mode)); }
    measurements = { gpu: standard.gpu(), label, stats: lighting.stats, results };
    $('measure').textContent = results.map(r => `${r.mode}: ${r.fps.toFixed(1)} fps / ${r.renderP50.toFixed(1)} ms`).join(' · ');
    $<HTMLButtonElement>('download').disabled = false;
  } catch (e) { $('measure').textContent = String(e); }
  finally { $<HTMLButtonElement>('bench').disabled = false; }
};
$('download').onclick = () => { const url = URL.createObjectURL(new Blob([JSON.stringify(measurements, null, 2)], { type: 'application/json' })); const a = document.createElement('a'); a.href = url; a.download = 'maplook3-performance.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); };

const api = {
  get ready() { return ready; }, get map() { return map; }, get label() { return label; }, get totals() { return totals; },
  standard, high, base, lighting, terrain, post, vegetation, options, flags, load, setPose, setEffects, all, measure,
  freeze(t = 8) { $<HTMLInputElement>('pause').checked = true; clock = t; standard.setClock(t); high.setClock(t); standard.renderNow(); high.renderNow(); },
  camera(v: Partial<ViewState>) { standard.setView(v); high.setView(v); },
};
declare global { interface Window { maplook3: typeof api } }
window.maplook3 = api;
for (const r of [standard, high]) r.canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); ready = false; $('status').textContent = 'WebGL context lost. Reload to restore the comparison.'; });
window.addEventListener('pagehide', () => { worker?.terminate(); vegetation.dispose(); post.dispose(); lighting.dispose(); flow.dispose(); base.dispose(); standard.dispose(); high.dispose(); });
void load().catch(console.warn);
