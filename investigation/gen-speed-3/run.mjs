import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { Session } from 'node:inspector';
import { promisify } from 'node:util';
import { trace } from './trace.mjs';

const dir = import.meta.dirname;
const variant = process.argv[2] ?? 'baseline';
const seeds = (process.argv.find(a=>a.startsWith('--seeds='))?.slice(8) ?? '1,2,3').split(',').map(Number);
const themes = (process.argv.find(a=>a.startsWith('--themes='))?.slice(9) ?? 'any,riverValley,canyon,highlands,lakeBasin,delta,islands').split(',');
const tr = globalThis.__genTrace = trace();
const api = await import(`./local/${variant}.mjs`);
const outDir = resolve(dir, 'local', variant);
mkdirSync(outDir, { recursive: true });
const hash = b => createHash('sha256').update(b).digest('hex');
const rows = [];
// Single generation at a time, no native settle installer and no parallel-water helpers.
// First cell includes lazy Wasm compilation; all remaining cells use the same worker lifetime.
for (const theme of themes) for (const seed of seeds) {
  tr.reset();
  let firstLand = null, candidate = null;
  const lands = [];
  const t0 = performance.now();
  const cpu0 = process.cpuUsage();
  const session = variant.endsWith('-profile') && seed === seeds[0] ? new Session() : null;
  const post = session ? promisify(session.post.bind(session)) : null;
  if (session) { session.connect(); await post('Profiler.enable'); await post('Profiler.start'); }
  const response = await api.runGenerate(api.makeSpec({ theme, seed }), p => {
    tr.progress(p);
    if (p.kind === 'land') { firstLand ??= performance.now() - t0; lands.push(hash(p.heights)); }
    if (p.kind === 'candidate') candidate ??= performance.now() - t0;
  });
  const wall = performance.now() - t0;
  const cpu = process.cpuUsage(cpu0);
  if (session) { const { profile } = await post('Profiler.stop'); writeFileSync(resolve(outDir, `${theme}-${seed}.cpuprofile`), JSON.stringify(profile)); session.disconnect(); }
  const r = api.lastGenerated();
  const row = { theme, seed, size: 128, firstLand, candidate, wall, cpuMs: (cpu.user + cpu.system)/1000, attempts: r.attempts, genomes: r.info.genomes, settles: r.info.settles, passed: response.passed, sha256: hash(response.timber), projectSha256: hash(response.project), lands, failures: r.failures, ...tr.finish() };
  writeFileSync(resolve(outDir, `${theme}-${seed}.json`), JSON.stringify(row, null, 2));
  rows.push(row);
  console.log(`${variant} ${theme} ${seed}: first passing candidate ${candidate?.toFixed(0)} ms; return ${wall.toFixed(0)} ms; ${r.attempts} attempts; ${r.info.genomes} genomes`);
}
writeFileSync(resolve(outDir, 'results.json'), JSON.stringify({ node: process.version, variant, seeds, themes, rows }, null, 2));
