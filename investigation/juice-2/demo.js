import { JuiceEngine } from './engine.js';
import { JuiceEngine as OriginalEngine } from '/round-one/engine.js';
import { SOUNDS, DEFAULTS } from './palette.js';

const $ = id => document.getElementById(id);
const scene = $('patch'), ctx = scene.getContext('2d');
let selected = 'tree', version = 'b', generation = 0, timers = [], held = null, holding = false;
let marker = { x: 9, y: 6 }, pulses = [], planted = [], animating = false;
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const stored = (() => { try { return JSON.parse(localStorage.getItem('dgm.juice2.demo') || '{}'); } catch { return {}; } })();
$('volume').value = Number.isFinite(stored.volume) ? Math.max(0, Math.min(100, stored.volume)) : 72;
$('sound-on').checked = stored.enabled !== false;
const b = new JuiceEngine({ onState: text => { $('status').textContent = text; },
  onReward: ({ semitones }) => { $('reward').textContent = `${['ROOT', '', 'SECOND', '', 'THIRD', '', '', 'FIFTH'][semitones] || 'ROOT'} · +${semitones} st`; } });
const a = new OriginalEngine();
const engine = () => version === 'a' ? a : b;
const params = () => ({ size: $('size').value/100, strength: $('strength').value/100, distance: 0,
  pan: (marker.x-9)/18, activity: 1 });

function settings() {
  const volume = $('volume').value/100, enabled = $('sound-on').checked;
  $('volume-value').textContent = `${Math.round(volume*100)}%`;
  b.setSettings({ enabled, volume, ambience: $('ambience').checked });
  a.setSettings({ enabled, volume: Math.min(1, .22*volume/DEFAULTS.volume), ambience: $('ambience').checked });
  try { localStorage.setItem('dgm.juice2.demo', JSON.stringify({ volume: volume*100, enabled })); } catch {}
}
settings();
async function prepare() {
  const results = await Promise.all([b.unlock(), a.unlock()]);
  $('enable').textContent = results[0] ? 'Audio ready ✓' : 'Retry audio';
  return results[version === 'a' ? 1 : 0];
}
function select(id) {
  selected = id;
  const sound = SOUNDS.find(s => s.id === id);
  $('selected-name').textContent = sound.label;
  $('selected-detail').textContent = sound.detail;
  $('selected-group').textContent = sound.group.toUpperCase();
  $('hold').disabled = !['Brushes', 'Forces', 'Ambience'].includes(sound.group) || id === 'craterize';
  $('scene-caption').textContent = sound.group === 'Brushes' ? 'Hold and drag to paint · one continuous texture' : 'Click to audition · replay for variation';
  document.querySelectorAll('.sound-row').forEach(row => row.classList.toggle('selected', row.dataset.sound === id));
}
function choose(take) {
  version = take;
  $('play-a').classList.toggle('active', take === 'a'); $('play-b').classList.toggle('active', take === 'b');
  $('version').value = take;
}
function ambiencePermission(name) {
  if (['waterfall', 'stream'].includes(name)) { $('ambience').checked = true; settings(); }
}
function trigger(name, p = params(), phase) {
  ambiencePermission(name);
  const id = engine().play(name, p, { phase });
  if (id != null) flash(name);
  if (version === 'a') $('reward').textContent = 'ROUND ONE';
  return id;
}
function stop() {
  generation++; timers.forEach(clearTimeout); timers = [];
  holding = false; held = null; a.stopAll(); b.stopAll();
  $('sequence-status').textContent = 'Stopped. Choose a scene to play again.';
}
function later(fn, ms, token = generation) {
  timers.push(setTimeout(() => { if (token === generation) fn(); }, ms));
}
async function audition(name, take) {
  if (name !== selected || take !== version) stop();
  else { generation++; timers.forEach(clearTimeout); timers = []; endHold(); }
  select(name); choose(take);
  const token = generation;
  if (await prepare() && token === generation) trigger(name);
}
async function risingRun() {
  stop(); const token = generation;
  if (!(await prepare()) || token !== generation) return;
  $('sequence-status').textContent = `A quick ${SOUNDS.find(s => s.id === selected).label.toLowerCase()} run; one more after the reset.`;
  const name = selected;
  for (let i = 0; i < 5; i++) later(() => { marker = { x: 5+i*2, y: 6 }; trigger(name); }, i*330, token);
  later(() => trigger(name), 2450, token);
}
async function startHold(event) {
  if (holding) return;
  if (event?.button != null && event.button !== 0) return;
  stop(); holding = true;
  event?.currentTarget?.setPointerCapture?.(event.pointerId);
  const token = generation;
  if (!(await prepare()) || token !== generation || !holding) return;
  ambiencePermission(selected);
  const owner = engine(), id = owner.start(selected, params());
  if (id != null) { held = { owner, id }; flash(selected); }
}
function endHold() { holding = false; if (held) held.owner.stop(held.id); held = null; }

for (const group of [...new Set(SOUNDS.map(s => s.group))]) {
  const title = document.createElement('div'); title.className = 'group'; title.textContent = group;
  $('sound-list').append(title);
  for (const sound of SOUNDS.filter(s => s.group === group)) {
    const row = document.createElement('div'); row.className = 'sound-row'; row.dataset.sound = sound.id;
    const name = document.createElement('button'); name.className = 'sound-select'; name.textContent = sound.label;
    const detail = document.createElement('small'); detail.textContent = sound.detail; name.append(detail);
    name.onclick = () => select(sound.id); row.append(name);
    for (const take of ['a', 'b']) {
      const button = document.createElement('button'); button.className = `take ${take === 'b' ? 'new' : ''}`;
      button.textContent = take.toUpperCase(); button.setAttribute('aria-label', `${sound.label}, round ${take === 'a' ? 'one' : 'two'}`);
      button.onclick = () => audition(sound.id, take); row.append(button);
    }
    $('sound-list').append(row);
  }
}
$('enable').onclick = prepare;
$('play-a').onclick = () => audition(selected, 'a'); $('play-b').onclick = () => audition(selected, 'b');
$('stop').onclick = stop; $('run').onclick = risingRun;
$('volume').oninput = settings;
$('sound-on').onchange = () => { if (!$('sound-on').checked) stop(); settings(); };
$('version').onchange = () => { stop(); choose($('version').value); };
for (const key of ['size', 'strength', 'distance']) $(key).oninput = () => {
  $(key+'-value').textContent = key === 'distance' ? ['Close', 'Nearby', 'Across the map', 'Far away'][Math.min(3, Math.floor($(key).value/26))] : `${$(key).value}%`;
  if (held) held.owner.update(held.id, params());
  const distance = $('distance').value/100*2;
  a.setDistance(distance); b.setDistance(distance);
};
$('ambience').onchange = async () => {
  const token = generation; settings();
  if ($('ambience').checked && await prepare() && token === generation && $('ambience').checked) engine().start('waterfall', { size: .35, strength: .35 }, 'ambience');
};
$('hold').onpointerdown = startHold;
for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) $('hold').addEventListener(type, endHold);
$('hold').onkeydown = event => { if ([' ', 'Enter'].includes(event.key) && !event.repeat) { event.preventDefault(); startHold(); } };
$('hold').onkeyup = event => { if ([' ', 'Enter'].includes(event.key)) { event.preventDefault(); endHold(); } };
window.addEventListener('blur', endHold);
scene.onpointerdown = event => {
  const rect = scene.getBoundingClientRect(); marker = { x: (event.clientX-rect.left)/rect.width*18, y: (event.clientY-rect.top)/rect.height*12 };
  if (SOUNDS.find(s => s.id === selected).group === 'Brushes') startHold(event);
  else audition(selected, version);
};
scene.onpointermove = event => {
  if (!held) return;
  const rect = scene.getBoundingClientRect(); marker = { x: (event.clientX-rect.left)/rect.width*18, y: (event.clientY-rect.top)/rect.height*12 };
  held.owner.update(held.id, params()); flash(selected);
};
for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) scene.addEventListener(type, endHold);
scene.onkeydown = event => { if ([' ', 'Enter'].includes(event.key)) { event.preventDefault(); audition(selected, version); } };
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') { stop(); return; }
  if (/INPUT|SELECT|TEXTAREA/.test(event.target.tagName) || event.repeat) return;
  if (event.key === '1' || event.key === '2') audition(selected, event.key === '1' ? 'a' : 'b');
});
document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); });

async function sequence(name) {
  stop(); const token = generation;
  if (!(await prepare()) || token !== generation) return;
  const owner = engine();
  $('sequence-status').textContent = `Playing ${name === 'crater' ? 'a craterize strike' : name} · round ${version === 'a' ? 'one' : 'two'}`;
  if (name === 'forest') {
    select('tree'); planted = [];
    for (let i = 0; i < 9; i++) later(() => { marker = { x: 3+i%5*2.5, y: 3+Math.floor(i/5)*3 }; trigger(i === 8 ? 'berry' : 'tree'); }, i*340);
  } else if (name === 'hillside') {
    select('raise'); const id = owner.start('raise', params()); held = { owner, id };
    for (let i = 0; i < 30; i++) later(() => { marker = { x: 3+i*.34, y: 6+Math.sin(i*.2)*2 }; owner.update(id, { ...params(), size: .3+i/70 }); flash('raise'); }, i*110);
    later(() => { owner.stop(id); const smooth = owner.start('smooth', params()); held = { owner, id: smooth }; select('smooth'); flash('smooth'); }, 3400);
    later(endHold, 5700);
  } else if (name === 'crater') { select('craterize'); trigger('craterize', { ...params(), size: .85, strength: .9 }); }
  else { select('erupt'); trigger('erupt', { ...params(), size: .85, strength: .9 }); later(() => flash('erupt'), 1000); later(() => flash('water'), 3400); }
  later(() => { $('sequence-status').textContent = 'Scene complete. Replay for another variation.'; }, name === 'eruption' ? 7000 : name === 'hillside' ? 6100 : 4500);
}
document.querySelectorAll('[data-sequence]').forEach(button => button.onclick = () => sequence(button.dataset.sequence));

function point(x, y, z = 0) { return [500+(x-y)*28, 62+(x+y)*12-z]; }
function poly(points, fill) { ctx.fillStyle = fill; ctx.beginPath(); points.forEach(([x,y],i) => i ? ctx.lineTo(x,y) : ctx.moveTo(x,y)); ctx.closePath(); ctx.fill(); }
function tree(x, y, small = false) {
  const [px, py] = point(x, y, 25); ctx.fillStyle='#b19e70'; ctx.fillRect(px-2,py-7,4,16);
  poly([[px,py-(small?27:45)],[px-16,py],[px+16,py]], '#a1b280');
  poly([[px,py-(small?27:45)],[px,py],[px+16,py]], '#768e60');
}
function flash(name) {
  pulses.push({ name, x: marker.x, y: marker.y, at: performance.now() });
  if (pulses.length > 20) pulses.shift();
  if (['tree','berry'].includes(name)) { planted.push({ ...marker, small: name === 'berry' }); if (planted.length > 35) planted.shift(); }
  if (!animating) { animating = true; requestAnimationFrame(draw); }
}
function draw(now = performance.now()) {
  ctx.clearRect(0,0,1000,440);
  for (let x = 0; x < 18; x++) for (let y = 0; y < 12; y++) {
    const z = 9+Math.max(0, Math.sin(x*.23)*Math.cos(y*.17))*32;
    const p = point(x,y,z), q=point(x+1,y,z), r=point(x+1,y+1,z), s=point(x,y+1,z);
    if (x===17 || y===11) poly([s,r,[r[0],r[1]+20],[s[0],s[1]+20]], '#657853');
    poly([p,q,r,s], (x+y)%3===0 ? '#87986a' : '#8fa172');
    if (Math.abs(y-(4+Math.sin(x*.35)*2)) < 1) poly([p,q,r,s], '#6faaa0');
  }
  [[3,3],[6,2],[12,3],[14,8],[4,9]].forEach(p => tree(...p)); planted.forEach(t => tree(t.x,t.y,t.small));
  pulses = pulses.filter(p => now-p.at<900);
  for (const p of pulses) {
    const t = (now-p.at)/900, [x,y] = point(p.x,p.y,28);
    ctx.globalAlpha = 1-t; ctx.strokeStyle = /crater|quake|erupt/.test(p.name) ? '#f6c17b' : '#d9eac3'; ctx.lineWidth=2;
    ctx.beginPath(); ctx.ellipse(x,y,12+t*45,(12+t*45)*.45,0,0,Math.PI*2); ctx.stroke();
  }
  ctx.globalAlpha=1; animating = pulses.length>0 && !reduced.matches;
  if (animating) requestAnimationFrame(draw);
}
select(selected); draw();
window.addEventListener('pagehide', () => { stop(); a.dispose(); b.dispose(); });
