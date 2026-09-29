import { MapRenderer } from '../../src/render3d/renderer';
import type { MapView } from '../../src/render3d/model';
import type { Scene } from 'three';
import { arrowGeometry, makeArrows } from './arrows';

const $ = (id: string) => document.getElementById(id)!;
const select = (id: string) => $(id) as HTMLSelectElement;
const toggle = $('toggle') as HTMLInputElement;
const renderer = new MapRenderer($('mapCanvas') as HTMLCanvasElement);
renderer.setLookChoice('high', false);
// Investigation-only bridge. Integration should own this mesh inside MapRenderer.
const scene = (renderer as unknown as { scene: Scene }).scene;
const arrows = makeArrows();
scene.add(arrows);
let data: any, current: MapView, edited = false, count = 0, scale = 1, revision = 0;
let loadId = 0;
function revive(raw: any): MapView {
  const v = structuredClone(raw);
  v.heights = Uint8Array.from(v.heights);
  v.columns.tiles = Int32Array.from(v.columns.tiles); v.columns.voxels = Uint8Array.from(v.columns.voxels);
  for (const key of ['tile', 'floor', 'depth', 'contamination']) v.water[key] = key === 'tile' ? Int32Array.from(v.water[key]) : Float32Array.from(v.water[key]);
  for (const key of ['template','owner']) v.entities[key] = Uint16Array.from(v.entities[key]);
  for (const key of ['x','y','z']) v.entities[key] = Int16Array.from(v.entities[key]);
  for (const key of ['flags','orientation','variant']) v.entities[key] = Uint8Array.from(v.entities[key]);
  v.entities.strength = Float32Array.from(v.entities.strength);
  v.soil.moisture = Uint8Array.from(v.soil.moisture); v.soil.contamination = Uint8Array.from(v.soil.contamination);
  return v;
}
function status() {
  $('status').textContent = `${select('map').selectedOptions[0].text} · ${renderer.look} · ${toggle.checked ? count + ' arrows' : 'arrows off'}${edited ? ' · riverbed lowered 2 blocks' : ''}`;
}
function rebuildArrows() {
  if (!current) return;
  const result = arrowGeometry(current, scale);
  arrows.geometry.dispose(); arrows.geometry = result.geometry; count = result.count;
  status();
}
function applyMap(keepView = false) {
  current = revive(edited ? data.edited : data.original);
  renderer.setMap(current, keepView);
  scale = Math.max(.3, Math.min(1, renderer.getView().distance / 170));
  rebuildArrows(); revision++;
  renderer.renderNow();
  $('edit').textContent = edited ? 'Undo riverbed edit' : 'Edit riverbed';
}
async function load() {
  const id = ++loadId;
  $('status').textContent = 'Loading generated map…';
  const response = await fetch(`./local/${select('map').value}.json`);
  if (!response.ok) throw new Error('Run npm run generate first');
  const next = await response.json();
  if (id !== loadId) return;
  data = next; edited = false; applyMap();
}
function close() {
  const { x, y } = data.edit;
  renderer.setView({ target: [x + .5, current.heights[y * 128 + x] + 1, -y - .5], distance: 35, pitch: .95 });
  renderer.renderNow();
}
toggle.onchange = () => { arrows.visible = toggle.checked; status(); renderer.renderNow(); };
select('map').onchange = () => { load().catch(fail); };
select('look').onchange = () => { renderer.setLookChoice(select('look').value as 'high' | 'standard', false); renderer.renderNow(); };
renderer.listenLook(() => {
  const high = renderer.look === 'high' || renderer.look === 'lower';
  arrows.material.color.setHex(high ? 0xc9d2ba : 0xbccbb9);
  arrows.material.opacity = high ? .66 : .62;
  status();
});
renderer.onView = () => {
  const next = Math.max(.3, Math.min(1, renderer.getView().distance / 170));
  if (Math.abs(next - scale) > .025) { scale = next; rebuildArrows(); renderer.renderNow(); }
};
$('overview').onclick = () => renderer.resetView();
$('close').onclick = close;
$('edit').onclick = () => { edited = !edited; applyMap(true); };
function fail(e: unknown) { $('status').textContent = String(e); console.error(e); }
// Small capture/smoke-test surface, no product API changes.
Object.assign(window, { flowDemo: { renderer, arrows, get current() { return current; }, get revision() { return revision; }, get count() { return count; }, get ready() { return !!data; }, close } });
load().catch(fail);
