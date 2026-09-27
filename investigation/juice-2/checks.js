import { loadBank, outputGraph, scheduleLayer, JuiceEngine, LIMITS } from './engine.js';
import { recipe, SOUNDS, parameters, spatial } from './palette.js';
import { TRIM } from './calibration.js';
import { JuiceSynth } from '/round-one/synth.js';
const out = document.getElementById('results');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const rng = seed => () => { seed = (Math.imul(seed, 1664525)+1013904223)>>>0; return seed/4294967296; };
let bank;
async function render(name, { size = .45, strength = .55, distance = 0, seed = 41, overload = false, trim = true, scale = 1, rate = 48000 } = {}) {
  const context = new OfflineAudioContext(2, rate*7, rate);
  bank ??= await loadBank(context);
  const graph = outputGraph(context, overload ? 1 : .72);
  const p = parameters({ size, strength, distance }), s = spatial(p);
  const gain = context.createGain(); gain.gain.value = s.gain*(trim ? TRIM[name] ?? 1 : 1)*scale;
  const filter = context.createBiquadFilter(); filter.type='lowpass'; filter.frequency.value=s.cutoff; filter.Q.value=.5;
  gain.connect(filter).connect(graph.input);
  for (let i = 0; i < (overload ? 18 : 1); i++) for (const layer of recipe(name,p,{random:rng(seed+i)})) scheduleLayer(context,bank,gain,layer,.02);
  const rendered = await context.startRendering();
  const l = rendered.getChannelData(0), r = rendered.getChannelData(1);
  let peak = 0, sum = 0, maximum = 0, finite = true;
  const window = Math.round(rate*.4);
  for (let i = 0; i < l.length; i++) {
    finite &&= Number.isFinite(l[i]) && Number.isFinite(r[i]);
    peak = Math.max(peak,Math.abs(l[i]),Math.abs(r[i]));
    sum += (l[i]*l[i]+r[i]*r[i])/2;
    if (i>=window) sum -= (l[i-window]**2+r[i-window]**2)/2;
    maximum = Math.max(maximum,sum/window);
  }
  let tail=0; for(let i=l.length-4800;i<l.length;i++) tail=Math.max(tail,Math.abs(l[i]),Math.abs(r[i]));
  return { peak: +peak.toFixed(5), rms400: +(10*Math.log10(Math.max(maximum,1e-15))).toFixed(2), finite, tail: +tail.toFixed(7), head: Array.from(l.slice(2500,2600)) };
}
function originalLevel(name) {
  const synth = new JuiceSynth(48000,41); synth.settings({ambience:true});
  synth.play(name,{size:.45,strength:.55});
  const left=new Float32Array(128),right=new Float32Array(128),energy=new Float64Array(19200);
  let sum=0,max=0,index=0;
  for(let block=0;block<2625;block++) {
    synth.render(left,right);
    for(let i=0;i<128;i++) { const e=(left[i]**2+right[i]**2)/2; sum-=energy[index]; energy[index]=e; sum+=e; index=(index+1)%energy.length; max=Math.max(max,sum/energy.length); }
  }
  return +(10*Math.log10(max)).toFixed(2);
}
document.getElementById('measure').onclick = async () => {
  out.textContent='Rendering 21 recipes…';
  try {
    const rows=[];
    for (const sound of SOUNDS) {
      const result=await render(sound.id); const {head,...metrics}=result;
      const alternate=await render(sound.id,{rate:44100,seed:900});
      rows.push({sound:sound.id,...metrics, rms44100:alternate.rms400,
        oldRms400:originalLevel(sound.id), alternateFinite:alternate.finite, alternatePeak:alternate.peak}); out.textContent=`Rendered ${rows.length}/21…`;
    }
    const near=await render('tree'), far=await render('tree',{distance:2}), small=await render('raise',{size:0,strength:0}), big=await render('raise',{size:1,strength:1});
    const variation=await render('tree',{seed:900}), overload=await render('craterize',{overload:true,size:1,strength:1});
    const checks={ allFinite:rows.every(r=>r.finite&&r.alternateFinite), noClip:rows.every(r=>r.peak<.92&&r.alternatePeak<.92)&&overload.peak<.92,
      cleanTails:rows.every(r=>r.tail<.001), distanceDrops:far.rms400<near.rms400-10,
      strengthAndSize:big.rms400>small.rms400+3, variation:JSON.stringify(near.head)!==JSON.stringify(variation.head),
      balancedActions:rows.filter(r=>SOUNDS.find(s=>s.id===r.sound).group.match(/Brushes|Objects/)).every(r=>Math.abs(r.rms400+23)<1),
      clearlyLouder:rows.filter(r=>!['waterfall','stream'].includes(r.sound)).every(r=>r.rms400>r.oldRms400+6) };
    const report={ checks, passed:Object.values(checks).every(Boolean), rows,
      overload: {peak:overload.peak,rms400:overload.rms400}, distanceDb:+(far.rms400-near.rms400).toFixed(2), scaleDb:+(big.rms400-small.rms400).toFixed(2) };
    out.textContent=JSON.stringify(report,null,2);
  } catch(error) { out.textContent=`FAIL: ${error.stack}`; }
};
document.getElementById('calibrate').onclick = async () => {
  const trims = {};
  out.textContent = 'Calibrating silent offline renders…';
  try {
    for (const sound of SOUNDS) {
      const target = sound.group === 'Ambience' ? -29 : sound.group === 'Forces' ? -16.5 : sound.id === 'undo' ? -25 : -23;
      let scale = 1;
      for (let i=0;i<4;i++) {
        const result = await render(sound.id,{trim:false,scale});
        scale = Math.min(8, scale*10**((target-result.rms400)/20));
      }
      trims[sound.id] = +scale.toFixed(4);
    }
    out.textContent = JSON.stringify(trims,null,2);
  } catch(error) { out.textContent=`FAIL: ${error.stack}`; }
};
document.getElementById('lifecycle').onclick = async () => {
  const engine = new JuiceEngine({settings:{volume:0}});
  const checks={ lazyContext:engine.context===null, preGestureSilent:engine.play('tree')===null };
  const started=performance.now();
  const ready=engine.unlock(); // Resume synchronously in this trusted click.
  out.textContent='Checking live engine (muted)…';
  try {
    checks.decoded=await ready && engine.bank.size===24;
    const setupMs=performance.now()-started;
    checks.ambienceOff=engine.start('waterfall')===null;
    const id=engine.start('raise'), before=engine.sources;
    const t=performance.now();
    for(let i=0;i<5000;i++) engine.update(id,{size:(i%100)/100});
    const burstMs=performance.now()-t;
    checks.coalesced=engine.pending.size===1;
    await wait(60);
    checks.noRetriggers=engine.sources<=before;
    for(let i=0;i<100;i++) engine.play('craterize');
    checks.bounded=engine.sources<=LIMITS.sources&&engine.events.size<=LIMITS.events;
    engine.stopAll(); await wait(250);
    checks.cancelled=engine.sources===0&&engine.events.size===0;
    await wait(300);
    const force = engine.play('erupt',{}, {id:'phases',phase:'rumble'});
    const plume = engine.play('erupt',{}, {id:'phases',phase:'plume'});
    checks.phaseGroup=force==='phases'&&plume==='phases'&&engine.events.size===1;
    engine.stop('phases'); await wait(200);
    checks.phaseCancel=engine.sources===0;
    engine.setSettings({enabled:false}); checks.off=engine.play('tree')===null;
    engine.setSettings({enabled:true}); engine.start('smooth'); engine.pause(); await wait(220);
    checks.paused=engine.context.state==='suspended'&&engine.sources===0;
    await engine.unlock(); checks.resumed=engine.ready;
    engine.play('erupt'); engine.dispose(); await wait(120);
    checks.disposed=engine.disposed&&!engine.ready;
    out.textContent=JSON.stringify({passed:Object.values(checks).every(Boolean),checks,setupMs:+setupMs.toFixed(1),updateBurstMs:+burstMs.toFixed(2)},null,2);
  } catch(error) { await engine.dispose(); out.textContent=`FAIL: ${error.stack}`; }
};
