// Compact index only. Full captures, events and output samples remain gitignored.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { root } from './adoption.mjs';
const dir = resolve(root, 'investigation/performance');
const read = p => JSON.parse(readFileSync(resolve(dir, p)));
const runs = readdirSync(resolve(dir, 'local/runs')).sort();
const blocked = runs.filter(n => n.endsWith('-measure')).map(n => read(`local/runs/${n}/manifest.json`)).flatMap(m => m.results).find(r => r.status === 'blocked-busy');
if (!blocked) throw new Error('No blocked quiet-gate evidence; this historical index needs revision after qualified measurements');
const latest = read('local/load-latest.json');
const captured = runs.filter(n => n.endsWith('-smoke')).map(n => read(`local/runs/${n}/manifest.json`)).filter(m => m.flags['validate-capture']).flatMap(m => m.results).filter(r => r.capture && r.status === 'complete').at(-1);
if (!captured) throw new Error('Run an explicitly unqualified --validate-capture smoke before making the diagnostic index');
const counts = {};
for (const finding of captured.summary.errors) counts[finding.kind] = (counts[finding.kind] ?? 0) + 1;
const functional = read('smoke-proof.json');
const compactLoad = load => ({ quiet: load.quiet, samples: load.samples.map(s => ({ at: s.at, cpu: s.cpuPercent, gpuEngineMax: s.gpuEngineMaxPercent })) });
const result = {
  status: 'NOT READY; no qualified before/after performance results',
  hardware: { cpu: latest.cpu.trim(), cores: latest.logicalCores, memoryGB: latest.memoryGB, gpus: latest.gpus },
  blockedBaseline: { browser: blocked.browser, size: blocked.size, look: blocked.look, status: blocked.status, load: compactLoad(blocked.load) },
  latestLoad: compactLoad(latest),
  functional: { index: 'smoke-proof.json', scope: functional.scope, passed: functional.checks.filter(c => c.finalEqual).length, total: functional.checks.length },
  diagnosticCapture: { scope: 'Edge native Clean 256 Craterize Fast Power 100; busy, unqualified smoke; not before/after performance evidence',
    path: captured.capture.slice(captured.capture.indexOf('local\\runs')).replaceAll('\\', '/'), redoExact: captured.redoExact, counts,
    interpretation: 'Geometry candidates only: depth occlusion can hide below-land surfaces; queued mesh state can differ from target state. Pixel glitches are unverified.',
    source: ['probe.js: diagnose', 'src/render3d/renderer.ts: updateWaterSoon/processWaterQueue', 'src/editor/waterPlayer.ts: blendWater'],
    audio: 'Legacy capture omitted silent input quanta and reported two gaps; not audible-dropout proof. Tap corrected; fresh qualified PCM and listening remain required.' },
  missing: ['three quiet repeats', 'High look', 'physical laptop and Firefox throttle coverage', 'one-hour sessions',
    'qualified before/after GIFs', 'pixel/audio oracle', 'Firefox long-task oracle', 'export file byte comparison', 'calibrated budgets'],
};
writeFileSync(resolve(dir, 'evidence.json'), JSON.stringify(result, null, 2) + '\n');
console.log('Compact evidence index written; no timing result inferred from smoke captures.');
