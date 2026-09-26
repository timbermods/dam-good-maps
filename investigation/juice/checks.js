import { JuiceEngine } from './engine.js';
import { SOUNDS } from './synth.js';
const out = document.querySelector('#results'), button = document.querySelector('#run');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const lines = [];
const check = (condition, label) => { lines.push(`${condition ? 'PASS' : 'FAIL'} ${label}`); out.textContent = lines.join('\n'); if (!condition) throw new Error(label); };
let engine = new JuiceEngine();
button.addEventListener('click', async () => {
  button.disabled = true; lines.length = 0;
  const errors = [];
  const onError = e => errors.push(e.message || 'unhandled rejection');
  window.addEventListener('error', onError); window.addEventListener('unhandledrejection', onError);
  try {
    check(engine.context === null, 'No context or sound before interaction');
    engine.onState = state => { if (/unavailable|stopped|could not/.test(state)) errors.push(state); };
    const start = performance.now();
    check(await engine.unlock(), 'AudioWorklet loads after interaction');
    lines.push(`INFO First unlock ${(performance.now() - start).toFixed(1)} ms`);
    const analyser = new AnalyserNode(engine.context, { fftSize: 2048 }); engine.node.connect(analyser);
    const data = new Float32Array(analyser.fftSize);
    const level = () => { analyser.getFloatTimeDomainData(data); return Math.max(...data.map(Math.abs)); };
    let peak = 0, maxLayers = 0, reports = 0;
    engine.onMeter = m => { peak = Math.max(peak, m.peak); maxLayers = Math.max(maxLayers, m.active); reports++; };
    const intervals = []; let frame = 0, last = performance.now();
    const tick = now => { intervals.push(now-last); last = now; frame = requestAnimationFrame(tick); }; frame = requestAnimationFrame(tick);
    engine.start('raise', { size: 0.7 }, 'brush'); await sleep(350);
    check(level() > 0.0001, 'Real worklet produces nonzero audio');
    engine.stop('brush'); await sleep(350);
    check(level() < 1e-6, 'Stroke release becomes silent');
    for (const [name] of SOUNDS) { engine.play(name); await sleep(65); }
    engine.stopAll(); await sleep(400);
    check(level() < 1e-6, 'Stop cancels voices, including scheduled force phases');
    engine.setSettings({ volume: 1 }); engine.start('carve', { size: 1, strength: 1 }, 'stress');
    for(let i = 0; i < 80; i++) { engine.play('craterize', { size: 1, strength: 1 }); engine.update('stress', { size: i / 80 }); await sleep(35); }
    engine.setSettings({ enabled: false }); await sleep(400);
    engine.play('raise'); check(level() < 1e-6, 'Off switch silences and discards new actions');
    engine.setSettings({ enabled: true, volume: 0 }); engine.play('tree'); await sleep(250);
    check(level() < 1e-6, 'Zero volume stays silent');
    engine.setSettings({ volume: 0.22 }); engine.start('stream', {}, 'stream'); await sleep(250);
    engine.pause(); await sleep(400); check(engine.context.state === 'suspended', 'Background pause suspends audio');
    check(await engine.unlock(), 'A new interaction can resume the context'); await sleep(200);
    check(level() < 1e-6, 'Resume has no stale sounds');
    engine.play('erupt'); await sleep(1200); engine.stopAll(); await sleep(300);
    cancelAnimationFrame(frame);
    check(reports > 0 && peak > 0 && peak < 0.821, 'Worklet peak is bounded below full scale');
    check(maxLayers <= 64, 'Worklet voice count stays bounded');
    check(errors.length === 0, 'No browser or processor errors');
    intervals.sort((a,b) => a-b);
    lines.push(`INFO ${navigator.userAgent}\nINFO ${engine.context.sampleRate} Hz; base latency ${engine.context.baseLatency}s\nINFO peak ${peak.toFixed(5)}; max measured layers ${maxLayers}\nINFO RAF p50 ${intervals[Math.floor(intervals.length*.5)].toFixed(1)} ms; p99 ${intervals[Math.floor(intervals.length*.99)].toFixed(1)} ms; max ${intervals.at(-1).toFixed(1)} ms`);
    await engine.dispose(); check(engine.context.state === 'closed', 'Dispose closes the audio context');
    lines.push('DONE'); out.textContent = lines.join('\n');
  } catch(e) { out.textContent += `\nERROR ${e.message}`; await engine.dispose().catch(() => {}); }
  finally { window.removeEventListener('error', onError); window.removeEventListener('unhandledrejection', onError); engine = new JuiceEngine(); button.disabled = false; }
});
