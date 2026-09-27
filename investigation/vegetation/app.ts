import './style.css';
import { Color, OrthographicCamera, Scene, WebGLRenderTarget, type Group, type InstancedMesh, type Camera, type ShaderMaterial } from 'three';
import { MapRenderer, type ViewState } from '../../src/render3d/renderer';
import { DEAD, YOUNG, type MapView } from '../../src/render3d/model';
import { CHANGES, NOT_ENDORSED, PROVIDER_NOTICES } from '../../src/core/places/attribution';
import { bridge, Effects } from './shadows';
import { Forest, isPlant, setPalette, specimen, vegetationMaterial } from './forest';
import { paletteDefaults, species, slots, type Species, type Palette } from './models';
import { motion } from './wind';
import type { MapRequest } from './maps.worker';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const check = (id: string) => $<HTMLInputElement>(id);
const select = (id: string) => $<HTMLSelectElement>(id);
const old = new MapRenderer($<HTMLCanvasElement>('old')), fresh = new MapRenderer($<HTMLCanvasElement>('new'));
const renderers = [old, fresh], effects = renderers.map(r => new Effects(r));
effects.forEach(e => { e.shadows = true; e.apply(); });
const material = vegetationMaterial(bridge(fresh).objectMat);
const palette: Palette = { ...paletteDefaults };
let forest: Forest | undefined, map: MapView | undefined, growth: Float32Array | undefined, label = '', ready = false;
let worker: Worker | undefined, serial = 0, currentKind = 'gallery', selected: Species | null = null;
let ghost: InstancedMesh | undefined, turn = 0, clock = 8, runningBenchmark = false, adaptiveStage = 0;
let samples: number[] = [], lastSample = performance.now(), lastFrame = performance.now(), lastAdapt = performance.now();
const observations = renderers.map(() => ({ frames: 0, draws: 0, triangles: 0, submitMs: 0 }));
const options: { label: string; request: MapRequest }[] = [
  { label: 'Specimen garden · variants & growth', request: { kind: 'gallery' } },
  ...(['riverValley', 'highlands', 'lakeBasin'] as const).flatMap(theme => [128, 256].map(size => ({ label: `${theme} · ${size}²`, request: { kind: 'generated' as const, theme, size } }))),
  ...['near-victoria-falls', 'near-yosemite-valley', 'near-danube-delta'].map(name => ({ label: name.replaceAll('-', ' '), request: { kind: 'place' as const, name } })),
  { label: 'Dense forest stress · 256² generated terrain', request: { kind: 'stress' } },
  { label: 'Type lineup · mature / young / dead', request: { kind: 'lineup' } },
];
options.forEach((o, i) => select('map').add(new Option(o.label, String(i))));
renderers.forEach((r, i) => {
  r.setClock(8);
  const b = bridge(r), draw = b.gl.render.bind(b.gl);
  b.gl.info.autoReset = false;
  b.gl.render = (scene, camera) => {
    if (scene !== b.scene) { draw(scene, camera); return; }
    if ($(i ? 'new-pane' : 'old-pane').classList.contains('hidden')) return;
    if (i === 1 && forest) { const before = forest.revision; forest.update(camera, r.canvas.clientHeight); if (forest.revision !== before) effects[1].invalidate(); }
    b.gl.info.reset(); const start = performance.now(); draw(scene, camera);
    observations[i].submitMs = performance.now() - start;
    observations[i].frames++; observations[i].draws = b.gl.info.render.calls; observations[i].triangles = b.gl.info.render.triangles;
  };
});
old.onView = v => { if (!runningBenchmark) fresh.setView(v); }; fresh.onView = v => { if (!runningBenchmark) old.setView(v); };
const gpu = fresh.gpu().renderer;
$('gpu').textContent = `${gpu}. Full Standard is forced for the comparison, including on software renderers.`;
for (const text of [CHANGES, NOT_ENDORSED, ...PROVIDER_NOTICES]) { const p = document.createElement('p'); p.textContent = text; $('credits').append(p); }

async function load(index = Number(select('map').value), seed = Number(check('seed').value)) {
  ready = false; worker?.terminate(); const id = ++serial;
  select('map').value = String(index); currentKind = options[index].request.kind;
  check('seed').disabled = ['gallery', 'lineup', 'place'].includes(currentKind);
  $('status').textContent = 'Building the map in a worker…';
  worker = new Worker(new URL('./maps.worker.ts', import.meta.url), { type: 'module' });
  return new Promise<void>((resolve, reject) => {
    worker!.onerror = e => { $('status').textContent = `Map worker failed: ${e.message}`; reject(new Error(e.message)); };
    worker!.onmessage = ({ data }) => {
      if (data.id !== id) return;
      if (data.progress) { $('status').textContent = data.progress; return; }
      if (data.error) { $('status').textContent = data.error; worker?.terminate(); reject(new Error(data.error)); return; }
      try {
        clearGhost(); forest?.dispose(); forest = undefined;
        map = data.view; growth = data.growth; label = data.label;
        old.setMap(map!); fresh.setMap(map!);
        // Remove only the replaced vegetation; every other existing object stays identical.
        const objects = (fresh as unknown as { objects: Group }).objects;
        for (const child of [...objects.children]) if (isPlant(child.name.split('.')[0])) {
          objects.remove(child); const mesh = child as InstancedMesh; mesh.geometry.dispose(); mesh.dispose();
        }
        forest = new Forest(map!.entities, growth, material); bridge(fresh).scene.add(forest.group);
        if (currentKind === 'gallery') { forest.entries.forEach(e => { e.variant = Math.floor(e.index / 4) % 3; }); forest.bindBatches(); }
        effects.forEach(e => e.fit(map!.W, map!.H)); apply();
        setPose(currentKind === 'gallery' ? 'garden' : currentKind === 'lineup' ? 'types' : 'edge'); ready = true;
        samples = []; lastAdapt = performance.now();
        $('status').textContent = `${label} · ${forest.stats.plants.toLocaleString()} plants · cameras synced · built in ${(data.ms / 1000).toFixed(1)} s`;
        $('legend').textContent = currentKind === 'gallery' ? 'Columns: pine · birch · oak · berries. Front: three mature rows. Middle: 8%, 32%, 66% growth. Back: bare / dead.' : 'Pine: dark radial tiers · Birch: light split crowns · Oak: broad lobes · Berries: low blue-dotted clusters.';
        worker?.terminate(); worker = undefined; renderIcons(); resolve();
      } catch (e) { $('status').textContent = String(e); reject(e); }
    };
    worker!.postMessage({ ...options[index].request, seed, id });
  });
}
function camera(v: Partial<ViewState>) { old.setView(v); fresh.setView(v); }
function setPose(kind: string) {
  if (!map) return;
  select('pose').value = kind;
  if (currentKind === 'lineup') { camera({ mode: kind === 'types' || kind === 'overview' ? 'top' : 'orbit', target: [11, 2.5, -7], distance: 12, pitch: 0.90, yaw: 0 }); return; }
  if (currentKind === 'gallery') {
    const top = kind === 'types' || kind === 'overview';
    camera({ mode: top ? 'top' : 'orbit', target: [11, 2.5, kind === 'types' ? -4.5 : kind === 'stages' ? -12.3 : -9], distance: kind === 'types' ? 10 : kind === 'stages' ? 15 : 26, pitch: 0.87, yaw: top ? 0 : -0.18 }); return;
  }
  if (kind === 'overview') { camera({ mode: 'top', target: [map.W / 2, 5, -map.H / 2], distance: Math.max(map.W, map.H) * 1.5 }); return; }
  const e = map.entities, planted = new Set<number>();
  for (let i = 0; i < e.count; i++) if (isPlant(e.templates[e.template[i]]) && e.templates[e.template[i]] !== 'BlueberryBush') planted.add(e.y[i] * map.W + e.x[i]);
  let winner = -1, best = -Infinity;
  for (let i = 0; i < e.count; i++) {
    if (!isPlant(e.templates[e.template[i]]) || e.templates[e.template[i]] === 'BlueberryBush' || e.flags[i] & DEAD && kind !== 'stages') continue;
    const x = e.x[i], y = e.y[i]; let count = 0;
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) if (planted.has((y + dy) * map.W + x + dx)) count++;
    let score = kind === 'edge' ? 25 - Math.abs(20 - count) : count;
    if (kind === 'stages') score += e.flags[i] & (DEAD | YOUNG) ? 100 : 0;
    score -= Math.hypot(x - map.W / 2, y - map.H / 2) * 0.015;
    if (score > best) { best = score; winner = i; }
  }
  if (winner < 0) { setPose('overview'); return; }
  camera({ mode: kind === 'types' ? 'top' : 'orbit', target: [e.x[winner] + 0.5, e.z[winner] + 0.5, -e.y[winner] - 0.5], distance: kind === 'edge' ? 26 : 13, pitch: kind === 'edge' ? 0.85 : 0.60, yaw: -0.55 });
}
function apply() {
  const low = check('low').checked;
  motion.vegSway.value = check('sway').checked && !low && !matchMedia('(prefers-reduced-motion: reduce)').matches ? 1 : 0;
  if (forest) { forest.detail = check('detail').checked; forest.low = low; }
  effects.forEach(e => { e.shadows = check('shadows').checked && !low; e.apply(); });
  effects[1].moving = motion.vegSway.value > 0;
  renderers.forEach(r => bridge(r).gl.setPixelRatio(low ? 1 : Math.min(window.devicePixelRatio, 2)));
  check('sway').disabled = low; check('detail').disabled = low;
  renderers.forEach(r => r.requestRender());
}
function layout(value: string) {
  select('layout').value = value;
  $('old-pane').classList.toggle('hidden', value === 'new'); $('new-pane').classList.toggle('hidden', value === 'old');
  $('comparison').classList.toggle('single', value !== 'both'); lastAdapt = performance.now(); samples = [];
}
function clearGhost() {
  if (ghost) { ghost.removeFromParent(); ghost.geometry.dispose(); ghost.dispose(); ghost = undefined; }
  old.setGhost(null);
}
function pick(name: Species) {
  selected = selected === name ? null : name; turn = 0; clearGhost();
  for (const b of $('shelf').querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.species === selected));
}
for (const r of renderers) r.onHover = hit => {
  if (!selected || !map || !hit) { clearGhost(); return; }
  if (!ghost) { ghost = specimen(selected, material); ghost.userData.vegetationGhost = true; bridge(fresh).scene.add(ghost); }
  const occupied = forest?.entries.some(e => Math.floor(e.x) === hit.x && Math.floor(-e.z) === hit.y);
  ghost.position.set(hit.x + 0.5, map.heights[hit.y * map.W + hit.x], -hit.y - 0.5); ghost.rotation.y = turn;
  ghost.setColorAt(0, occupied ? new Color(1.65, 0.40, 0.35) : new Color(0.7, 1.4, 0.7)); ghost.instanceColor!.needsUpdate = true;
  old.setGhost({ template: selected, x: hit.x, y: hit.y, z: ghost.position.y, orientation: 0, ok: !occupied }); fresh.requestRender();
};
window.addEventListener('keydown', e => { if (e.key === 'Escape') { selected = null; clearGhost(); renderIcons(); } if (e.key.toLowerCase() === 'r' && selected) { turn += Math.PI / 2; if (ghost) ghost.rotation.y = turn; } });
function renderIcons() {
  $('shelf').replaceChildren();
  const gl = bridge(fresh).gl, scene = new Scene(), cam = new OrthographicCamera(-0.75, 0.75, 0.85, -0.85, 0.1, 20);
  cam.position.set(3, 2.5, 4); cam.lookAt(0, 0.80, 0);
  const target = new WebGLRenderTarget(96, 108), saved = { target: gl.getRenderTarget(), color: gl.getClearColor(new Color()), alpha: gl.getClearAlpha(), shadow: material.uniforms.mlEnabled.value };
  material.uniforms.mlEnabled.value = 0;
  for (const name of species) {
    const mesh = specimen(name, material); scene.add(mesh); gl.setRenderTarget(target); gl.setClearColor(0xe5e9dc, 1); gl.clear(); gl.render(scene, cam);
    const pixels = new Uint8Array(96 * 108 * 4); gl.readRenderTargetPixels(target, 0, 0, 96, 108, pixels);
    const c = document.createElement('canvas'); c.width = 96; c.height = 108; const ctx = c.getContext('2d')!, image = ctx.createImageData(96, 108);
    for (let y = 0; y < 108; y++) image.data.set(pixels.subarray((107 - y) * 384, (108 - y) * 384), y * 384); ctx.putImageData(image, 0, 0);
    const button = document.createElement('button'), img = document.createElement('img'); img.src = c.toDataURL(); img.alt = ''; button.append(img, name === 'BlueberryBush' ? 'Berries' : name); button.dataset.species = name; button.setAttribute('aria-pressed', String(selected === name)); button.onclick = () => pick(name); $('shelf').append(button);
    scene.remove(mesh); mesh.geometry.dispose(); mesh.dispose();
  }
  target.dispose(); gl.setRenderTarget(saved.target); gl.setClearColor(saved.color, saved.alpha); material.uniforms.mlEnabled.value = saved.shadow;
}
for (const slot of slots) {
  const l = document.createElement('label'), input = document.createElement('input'); input.type = 'color'; input.value = palette[slot]; input.id = `colour-${slot}`;
  l.append(input, slot); $('colours').append(l); input.oninput = () => { palette[slot] = input.value; setPalette(material, palette); fresh.requestRender(); renderIcons(); };
}
for (const [id, uniform] of [['roughness', 'vegRoughness'], ['wrap', 'vegWrap'], ['specular', 'vegSpecular'], ['ambient', 'vegAmbient']]) check(id).oninput = () => { material.uniforms[uniform].value = Number(check(id).value); renderIcons(); fresh.requestRender(); };
$('reset').onclick = () => { Object.assign(palette, paletteDefaults); slots.forEach(s => check(`colour-${s}`).value = palette[s]); setPalette(material, palette); for (const [id, value] of [['roughness', 0.92], ['wrap', 0.25], ['specular', 0.045], ['ambient', 1]] as const) { check(id).value = String(value); check(id).dispatchEvent(new Event('input')); } };
$('export').onclick = () => { const url = URL.createObjectURL(new Blob([JSON.stringify({ palette, roughness: Number(check('roughness').value), wrap: Number(check('wrap').value), specular: Number(check('specular').value), ambient: Number(check('ambient').value) }, null, 2)], { type: 'application/json' })); const a = document.createElement('a'); a.href = url; a.download = 'vegetation-tuning.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); };
for (const id of ['sway', 'detail', 'low', 'shadows']) check(id).onchange = () => { adaptiveStage = 0; apply(); };
$('load').onclick = () => void load().catch(console.error); select('map').onchange = () => void load().catch(console.error);
select('pose').onchange = () => setPose(select('pose').value); select('layout').onchange = () => layout(select('layout').value);
$('top').onclick = () => camera({ mode: 'top' }); $('orbit').onclick = () => camera({ mode: 'orbit' });
function percentile(values: number[], p: number) { return [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.floor(values.length * p))] ?? 0; }
function frame(now: number) {
  const dt = now - lastFrame; lastFrame = now;
  if (ready && !document.hidden && !runningBenchmark && !check('pause').checked) {
    clock += Math.min(dt, 100) / 1000; motion.vegTime.value = clock;
    renderers.forEach((r, i) => { if (select('layout').value !== (i ? 'old' : 'new')) r.setClock(clock); });
    samples.push(dt); if (samples.length > 600) samples.shift();
  }
  if (now - lastSample > 1200) {
    observations.forEach((o, i) => { $(`${i ? 'new' : 'old'}-fps`).textContent = `${check('pause').checked && !runningBenchmark ? 'Paused' : (o.frames * 1000 / (now - lastSample)).toFixed(0) + ' fps'} · ${o.draws} draws`; o.frames = 0; });
    if (forest) $('counts').textContent = `${forest.stats.near.toLocaleString()} near / ${forest.stats.far.toLocaleString()} far · ${forest.stats.triangles.toLocaleString()} plant triangles · last LOD update ${forest.stats.lodMs.toFixed(2)} ms`;
    lastSample = now;
  }
  // Conservative one-way downgrade, only the single proposal pane; paired cost cannot choose a product budget.
  if (now - lastAdapt > 6000 && ready && !runningBenchmark && check('adaptive').checked && select('layout').value === 'new' && samples.length > 60) {
    if (percentile(samples, 0.95) > 22 && adaptiveStage < 2) {
      adaptiveStage++; if (adaptiveStage === 1) check('sway').checked = false; else check('low').checked = true;
      apply(); $('status').textContent = adaptiveStage === 1 ? 'Frame budget exceeded · sway disabled automatically.' : 'Frame budget exceeded · laptop mode enabled automatically.';
    }
    lastAdapt = now; samples = [];
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
function renderImmediate(r: MapRenderer) {
  const internals = r as unknown as { frame: number };
  if (internals.frame) cancelAnimationFrame(internals.frame); internals.frame = 0; r.renderNow();
}
function freeze(t = 8) { check('pause').checked = true; clock = t; motion.vegTime.value = t; renderers.forEach(r => { r.setClock(t); renderImmediate(r); }); }
async function benchmark(seconds = 6) {
  if (!ready || runningBenchmark) return;
  runningBenchmark = true;
  const saved = { layout: select('layout').value, sway: check('sway').checked, low: check('low').checked, detail: check('detail').checked, pause: check('pause').checked, camera: old.getView() };
  const report: { renderer: string; label: string; viewport: number[]; shadows: boolean; cases: unknown[] } = { renderer: gpu, label, viewport: [window.innerWidth, window.innerHeight], shadows: check('shadows').checked, cases: [] };
  try {
    for (const mode of ['today', 'still', 'sway', 'laptop']) {
      layout(mode === 'today' ? 'old' : 'new'); check('sway').checked = mode === 'sway'; check('low').checked = mode === 'laptop'; check('detail').checked = true; apply();
      $('status').textContent = `Measuring ${mode} · ${seconds} s after warm-up…`;
      const r = mode === 'today' ? old : fresh, times: number[] = [], submits: number[] = [];
      const start = performance.now(); let previous = start, clockStart = clock;
      await new Promise<void>(resolve => {
        const step = (now: number) => {
          const elapsed = (now - start) / 1000;
          r.setView({ ...saved.camera, yaw: saved.camera.yaw + elapsed * 0.12, mode: 'orbit' });
          motion.vegTime.value = clockStart + elapsed; r.setClock(clockStart + elapsed); renderImmediate(r);
          if (elapsed > 2) { times.push(now - previous); submits.push(observations[mode === 'today' ? 0 : 1].submitMs); }
          previous = now;
          if (elapsed >= seconds + 2) resolve(); else requestAnimationFrame(step);
        }; requestAnimationFrame(step);
      });
      const observation = observations[mode === 'today' ? 0 : 1];
      report.cases.push({ mode, frames: times.length, fps: times.length * 1000 / times.reduce((a, b) => a + b, 0), frameP50: percentile(times, 0.5), frameP95: percentile(times, 0.95), submitP50: percentile(submits, 0.5), submitP95: percentile(submits, 0.95), draws: observation.draws, triangles: observation.triangles, plants: mode === 'today' ? null : { ...forest?.stats }, pixelSize: [r.canvas.width, r.canvas.height] });
    }
    $('measurements').textContent = JSON.stringify(report, null, 2); $('status').textContent = 'Measurement complete · results below. 60 fps on your PC still requires your local result.'; return report;
  } finally {
    layout(saved.layout); check('sway').checked = saved.sway; check('low').checked = saved.low; check('detail').checked = saved.detail; check('pause').checked = saved.pause; camera(saved.camera); apply(); runningBenchmark = false;
  }
}
$('benchmark').onclick = () => void benchmark().catch(console.error);
const api = { get ready() { return ready; }, get map() { return map; }, get forest() { return forest; }, get label() { return label; }, old, fresh, effects, material, options, load, camera, setPose, freeze, apply, layout, benchmark, pick,
  configure(p: { sway?: boolean; detail?: boolean; low?: boolean; shadows?: boolean }) { for (const [key, value] of Object.entries(p)) check(key).checked = value; apply(); },
  stats() { return { vegetation: forest?.stats, observations, gpu, growth: growth ? { min: Math.min(...growth), max: Math.max(...growth) } : null }; },
};
declare global { interface Window { vegetation: typeof api } }
window.vegetation = api;
renderers.forEach(r => r.canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); ready = false; $('status').textContent = 'Graphics context lost. Reload to restore the map.'; }));
window.addEventListener('pagehide', () => { worker?.terminate(); clearGhost(); forest?.dispose(); material.dispose(); effects.forEach(e => e.dispose()); renderers.forEach(r => r.dispose()); });
void load(0).catch(console.error);
