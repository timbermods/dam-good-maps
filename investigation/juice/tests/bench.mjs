import { performance } from 'node:perf_hooks';
import { JuiceSynth } from '../synth.js';
const s = new JuiceSynth(48000, 903);
const l = new Float32Array(128), r = new Float32Array(128);
const blocks = 3750, times = [];
for(let i = 0; i < 4; i++) s.start('erupt', { size: 1, strength: 1 }, `bed-${i}`);
const start = performance.now();
let highWater = 0;
for(let b = 0; b < blocks; b++) {
  if (b % 100 === 0) s.play('craterize', { size: 1, strength: 1 });
  highWater = Math.max(highWater, s.activeCount);
  const before = performance.now(); s.render(l, r); times.push(performance.now() - before);
}
times.sort((a,b) => a - b);
console.log(JSON.stringify({ node: process.version, sampleRate: 48000, audioSeconds: 10, wallMs: +(performance.now()-start).toFixed(2), voices: highWater, blockBudgetMs: 128/48, p50BlockMs: times[Math.floor(blocks*.5)], p99BlockMs: times[Math.floor(blocks*.99)], maxBlockMs: times.at(-1), peak: s.peak, dropped: s.dropped }, null, 2));
