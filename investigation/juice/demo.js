import { JuiceEngine } from './engine.js';
import { SOUNDS } from './synth.js';
import { Garden } from './garden.js';
const $ = id => document.getElementById(id);
const engine = new JuiceEngine({ onState: text => { $('status').textContent = text; }, onMeter: m => {
  $('meter').textContent = `${m.active} / 64 layers · peak ${m.peak ? (20 * Math.log10(m.peak)).toFixed(1) : '−∞'} dBFS · ${m.dropped} excess accents skipped`;
} });
const garden = new Garden($('garden'));
let selected = 'raise', stroke = null, held = false, pointer = null, generation = 0, sequenceTimers = [], paintingFrame = 0;
const continuous = new Set(['raise','lower','flatten','smooth','naturalize','remove','tree','berry','carve','waterfall','stream']);
const params = () => ({ size: +$('size').value / 100, strength: +$('strength').value / 100 });
const icons = ['↟','↧','▱','≈','⁙','◌','♧','❧','▥','⌂','⌂','◉','◉','≋','☄','ϟ','⇆','△','↶','≋','∿'];

for (const group of [...new Set(SOUNDS.map(s => s[3]))]) {
  const section = document.createElement('div'); section.className = 'sound-group';
  const label = document.createElement('div'); label.className = 'group-name'; label.textContent = group; section.append(label);
  SOUNDS.forEach(([id, name, description, category], i) => {
    if (category !== group) return;
    const button = document.createElement('button'); button.className = 'sound'; button.dataset.sound = id;
    button.setAttribute('aria-pressed', String(id === selected));
    button.innerHTML = `<span class="symbol" aria-hidden="true">${icons[i]}</span><span><strong>${name}</strong><small>${description}</small></span>`;
    button.addEventListener('click', () => { stop(); select(id); audition(); }); section.append(button);
  });
  $('palette').append(section);
}
function select(name) {
  selected = name; $('selected').textContent = SOUNDS.find(s => s[0] === name)[1];
  document.querySelectorAll('[data-sound]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.sound === name)));
  $('hold').disabled = !continuous.has(name);
  $('scene-caption').textContent = continuous.has(name) ? 'Drag or hold Space to paint' : 'Click the garden to listen';
}
async function audition() {
  const ticket = ++generation;
  if (!await engine.unlock() || ticket !== generation) return;
  engine.play(selected, params());
  $('status').textContent = `${$('selected').textContent} · a fresh variation`;
}
function ambience() {
  engine.stop('falls'); engine.stop('stream');
  if ($('ambience').checked && engine.settings.enabled) {
    engine.start('waterfall', { size: 0.3, strength: 0.3, pan: 0.5 }, 'falls');
    engine.start('stream', { size: 0.25, strength: 0.35, pan: -0.4 }, 'stream');
  }
}
async function begin(event) {
  if (event?.button != null && event.button !== 0) return;
  if (!continuous.has(selected)) { audition(); return; }
  if (held) return;
  held = true; const ticket = ++generation;
  $('hold').classList.add('active');
  if (!await engine.unlock() || !held || ticket !== generation) { if (ticket === generation) end(); return; }
  stroke = engine.start(selected, params());
  const frame = () => {
    if (!held) return;
    garden.change(selected, pointer || garden.tiles[96], params().size);
    paintingFrame = requestAnimationFrame(frame);
  };
  frame(); $('status').textContent = 'One flowing texture for the whole stroke.';
}
function end() {
  held = false; if (stroke !== null) engine.stop(stroke); stroke = null;
  cancelAnimationFrame(paintingFrame); $('hold').classList.remove('active');
}
function stop() {
  generation++; end(); sequenceTimers.forEach(clearTimeout); sequenceTimers = [];
  engine.stopAll(); $('ambience').checked = false;
  document.querySelectorAll('[data-sequence]').forEach(b => b.classList.remove('active'));
  garden.phase = ''; garden.draw(); $('status').textContent = 'All quiet.';
}
$('replay').addEventListener('click', audition);
$('hold').addEventListener('pointerdown', e => { $('hold').setPointerCapture(e.pointerId); begin(e); });
for (const type of ['pointerup','pointercancel','lostpointercapture']) $('hold').addEventListener(type, end);
for (const element of [$('hold'), $('garden')]) {
  element.addEventListener('keydown', e => { if (e.code === 'Space' && !e.repeat) { e.preventDefault(); begin(); } });
  element.addEventListener('keyup', e => { if (e.code === 'Space') { e.preventDefault(); end(); } });
}
$('garden').addEventListener('pointerdown', e => { $('garden').setPointerCapture(e.pointerId); pointer = garden.hit(e); begin(e); });
$('garden').addEventListener('pointermove', e => {
  pointer = garden.hit(e);
  if (stroke !== null) engine.update(stroke, { ...params(), pan: (pointer.x - pointer.y) / 20, strength: params().strength * (e.pointerType === 'pen' ? Math.max(0.05, e.pressure) : 1) });
});
for (const type of ['pointerup','pointercancel','lostpointercapture']) $('garden').addEventListener(type, end);
$('stop').addEventListener('click', stop);
document.addEventListener('keydown', e => { if (e.key === 'Escape') stop(); });
window.addEventListener('blur', () => { stop(); engine.pause(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); });
window.addEventListener('pagehide', () => engine.dispose());
$('enabled').addEventListener('click', async () => {
  const enabled = !engine.settings.enabled;
  if (!enabled) stop();
  engine.setSettings({ enabled }); $('enabled').setAttribute('aria-pressed', String(enabled)); $('enabled').textContent = enabled ? 'Sound on' : 'Sound off';
  if (enabled) await engine.unlock();
});
for (const id of ['volume','size','strength','distance']) $(id).addEventListener('input', () => {
  const value = +$(id).value;
  $(`${id}-value`).textContent = id === 'distance' ? (value < 20 ? 'Close' : value < 65 ? 'Across the map' : 'Far away') : `${value}%`;
  if (id === 'volume') engine.setSettings({ volume: value / 100 });
  if (id === 'distance') engine.setDistance(value / 100);
  if (stroke !== null) engine.update(stroke, params());
});
$('ambience').addEventListener('change', async () => {
  const ticket = generation;
  if (await engine.unlock() && ticket === generation) ambience();
});
function later(ms, action) { sequenceTimers.push(setTimeout(action, ms)); }
document.querySelectorAll('[data-sequence]').forEach(button => button.addEventListener('click', async () => {
  stop(); const ticket = generation;
  if (!await engine.unlock() || ticket !== generation) return;
  button.classList.add('active');
  const type = button.dataset.sequence;
  $('status').textContent = `${button.textContent.trim()} · Esc to stop`;
  if (type === 'hillside') {
    select('raise'); const id = engine.start('raise', params(), 'sequence-stroke');
    for (let i = 0; i < 38; i++) later(i * 90, () => { garden.change('raise', garden.tiles[45 + i % 5], 0.7); engine.update(id, { size: 0.35 + i / 100, strength: 0.3 + Math.sin(i / 10) * 0.2, pan: (i / 38 - 0.5) * 0.8 }); });
    later(3450, () => { engine.stop(id); select('smooth'); engine.start('smooth', params(), 'sequence-smooth'); });
    later(4900, () => engine.stop('sequence-smooth'));
  } else if (type === 'forest') {
    select('tree'); engine.start('tree', { ...params(), strength: 0.25 }, 'forest');
    for (let i = 0; i < 12; i++) later(i * 330, () => { const tile = garden.tiles[30 + (i * 17) % 120]; garden.change('tree', tile); if (i % 2 === 0) engine.play('tree', { ...params(), pan: (tile.x - tile.y) / 20 }); });
    later(4050, () => engine.stop('forest'));
  } else {
    select('erupt'); engine.play('erupt', params());
    garden.phase = 'rumble'; garden.draw();
    later(1100, () => { garden.phase = 'plume'; for(let i=0;i<24;i++) garden.change('raise', garden.tiles[104], 0.65); garden.draw(); });
    later(3100, () => { garden.phase = 'cool'; garden.draw(); });
  }
  later(6100, () => { button.classList.remove('active'); garden.phase = ''; garden.draw(); $('status').textContent = 'Ready for another listen.'; });
}));
