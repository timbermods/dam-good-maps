import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { cpus, totalmem } from 'node:os';

const dir = import.meta.dirname;
const baseline = await import('./local/baseline.mjs');
const candidate = await import('./local/candidate.mjs');
const hash = b => createHash('sha256').update(b).digest('hex');
// A cross-bundle, binary comparison, including signed zero and the raw bytes of every array.
function exact(v) {
  if (ArrayBuffer.isView(v)) return [v.constructor.name, Buffer.from(v.buffer, v.byteOffset, v.byteLength).toString('hex')];
  if (v instanceof ArrayBuffer) return ['ArrayBuffer', Buffer.from(v).toString('hex')];
  if (typeof v === 'number') return ['number', Buffer.from(new Float64Array([v]).buffer).toString("hex")];
  if (v instanceof Map) return ['Map', [...v].map(([k,x])=>[exact(k), exact(x)])];
  if (v instanceof Set) return ['Set', [...v].map(exact)];
  if (Array.isArray(v)) return v.map(exact);
  if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().filter(k=> !['timings','ms','cache','dirty'].includes(k)).map(k=>[k, exact(v[k])]));
  return v;
}
function digest(v) { return hash(JSON.stringify(exact(v))); }
const output = resolve(dir, 'local/paired');
mkdirSync(output, { recursive: true });
const rows = [];
// Warm each API's lazy Wasm once, with the same excluded tiny default map.
for (const api of [baseline,candidate]) await api.runGenerate(api.makeSpec({ theme: 'delta', seed: 1, size: { x:48, y:48 } }));
let cell = 0;
for (const theme of baseline.THEMES) for (const seed of [1,2,3]) {
  const pair = {};
  for (const variant of cell++ % 2 ? ['candidate','baseline'] : ['baseline','candidate']) {
    const api = variant === 'baseline' ? baseline : candidate;
    const spec = api.makeSpec({ theme, seed });
    let firstLand = null, firstCandidate = null;
    const progress = [];
    const lands = [];
    const t0 = performance.now(), cpu0 = process.cpuUsage();
    const response = await api.runGenerate(spec, p => {
      if (p.kind === 'land') { firstLand ??= performance.now()-t0; lands.push({ attempt:p.attempt, heights:p.heights.slice(), water:p.water.slice() }); }
      if (p.kind === 'candidate') firstCandidate ??= performance.now()-t0;
      // Keep data until after the timed path, then hash it; no audit serialization in the timing.
      progress.push(p);
    });
    const wall = performance.now()-t0, cpu = process.cpuUsage(cpu0);
    const r = api.lastGenerated();
    if (!response.passed || firstCandidate === null) throw new Error(`${theme}/${seed} made no passing candidate`);
    pair[variant] = { firstLand, firstCandidate, wall, cpuMs:(cpu.user+cpu.system)/1000, sha256:hash(response.timber), projectSha256:hash(response.project), emptyWaterSha256:hash(api.emptyWaterFile().bytes), state:digest(r), response:digest(response), progress:digest(progress), land:digest(lands), attempts:r.attempts, genomes:r.info.genomes, settles:r.info.settles, failures:r.failures };
  }
  const identical = ['sha256','projectSha256','emptyWaterSha256','state','response','progress','land','attempts','genomes','settles'].every(k=>pair.baseline[k] === pair.candidate[k]);
  const row = { theme, seed, size:128, identical, ...pair };
  rows.push(row);
  writeFileSync(resolve(output,'results.json'), JSON.stringify({ node:process.version, cpu:cpus()[0].model, logicalCpus:cpus().length, memoryGiB:Math.round(totalmem()/2**30), warmup:'delta seed 1 48², both variants', rows }, null, 2));
  console.log(`${theme} ${seed}: candidate ${pair.baseline.firstCandidate.toFixed(0)} | ${pair.candidate.firstCandidate.toFixed(0)} ms; bytes/state/progress ${identical ? 'identical' : 'DIFFER'}`);
  if (!identical) throw new Error(`Exactness failed: ${theme}/${seed}`);
}
