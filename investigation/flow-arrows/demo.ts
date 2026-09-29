import { MapRenderer } from '../../src/render3d/renderer';
import type { Camera, Scene } from 'three';
import { FlowArrows } from './arrows';
import type { FlowMap } from './flow';

const $ = (id: string) => document.getElementById(id)!;
const select = (id: string) => $(id) as HTMLSelectElement;
const toggle = $('toggle') as HTMLInputElement;
const canvas = $('mapCanvas') as HTMLCanvasElement;
const renderer = new MapRenderer(canvas);
renderer.setLookChoice('high', false);
// Investigation-only bridge; product integration should own FlowArrows inside MapRenderer.
const bridge = renderer as unknown as { scene: Scene; camera(): Camera };
const arrows = new FlowArrows(bridge.scene, () => bridge.camera(), canvas, () => { renderer.renderNow(); status(); });
let data: any, current: FlowMap, edited = false, revision = 0, loading = false, loadId = 0;
function revive(raw: any): FlowMap {
  const v = structuredClone(raw);
  v.heights = Uint8Array.from(v.heights);
  v.columns.tiles = Int32Array.from(v.columns.tiles); v.columns.voxels = Uint8Array.from(v.columns.voxels);
  for (const key of ['tile', 'floor', 'depth', 'contamination']) v.water[key] = key === 'tile' ? Int32Array.from(v.water[key]) : Float32Array.from(v.water[key]);
  for (const key of ['template','owner']) v.entities[key] = Uint16Array.from(v.entities[key]);
  for (const key of ['x','y','z']) v.entities[key] = Int16Array.from(v.entities[key]);
  for (const key of ['flags','orientation','variant']) v.entities[key] = Uint8Array.from(v.entities[key]);
  v.entities.strength = Float32Array.from(v.entities.strength);
  v.soil.moisture = Uint8Array.from(v.soil.moisture); v.soil.contamination = Uint8Array.from(v.soil.contamination);
  if(v.flow) { v.flow.out=Float64Array.from(v.flow.out); v.flow.depth=Float64Array.from(v.flow.depth); }
  return v;
}
function status() {
  if(loading) return;
  const s=arrows.stats;
  const state=!s.available ? 'flow unavailable — regenerate fixtures' : !toggle.checked ? 'arrows off' : `${s.count} arrows · ${s.reducedMotion ? 'reduced motion' : 'slow drift'}`;
  $('status').textContent = `${select('map').selectedOptions[0].text} · ${renderer.look} · ${state}${edited ? ' · riverbed lowered 2 blocks' : ''}`;
}
function applyMap(keepView = false) {
  current = revive(edited ? data.edited : data.original);
  // Water and its exact corresponding flow data replace one another in the same JS turn.
  arrows.setMap(current);
  renderer.setMap(current, keepView);
  renderer.renderNow(); arrows.refresh(); renderer.renderNow(); revision++;
  $('edit').textContent = edited ? 'Undo riverbed edit' : 'Edit riverbed';
  status();
}
async function load() {
  const id = ++loadId; loading=true;
  ($('edit') as HTMLButtonElement).disabled=true;
  $('status').textContent = 'Loading generated map and settled flow…';
  const response = await fetch(`./local/${select('map').value}.json`);
  if (!response.ok) throw new Error('Run npm run generate first');
  const next = await response.json();
  if (id !== loadId) return;
  data = next; edited = false; loading=false; applyMap();
  ($('edit') as HTMLButtonElement).disabled=false;
}
function close() {
  if(!data) return;
  const { x, y } = data.edit;
  renderer.setView({ target: [x + .5, current.heights[y * 128 + x] + 1, -y - .5], distance: 35, pitch: .95 });
  renderer.renderNow();
}
toggle.onchange = () => { arrows.enabled=toggle.checked; arrows.refresh(); status(); renderer.renderNow(); };
select('map').onchange = () => { load().catch(fail); };
select('look').onchange = () => { renderer.setLookChoice(select('look').value as 'high' | 'standard', false); renderer.renderNow(); };
renderer.listenLook(() => { arrows.setLook(renderer.look === 'high' || renderer.look === 'lower'); status(); });
renderer.onView = () => { arrows.refresh(); renderer.requestRender(); status(); };
$('overview').onclick = () => renderer.resetView();
$('close').onclick = close;
$('edit').onclick = () => { if(!loading){edited = !edited; applyMap(true);} };
function fail(e: unknown) { loading=false; $('status').textContent = String(e); console.error(e); }
window.addEventListener('pagehide',()=>arrows.dispose(),{once:true});
Object.assign(window, { flowDemo: { renderer, arrows, get current() { return current; }, get revision() { return revision; }, get count() { return arrows.stats.count; }, get ready() { return !!data && !loading; }, close } });
load().catch(fail);
