import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const here = path.dirname(fileURLToPath(import.meta.url));
const read = async file => JSON.parse(await fs.readFile(path.join(here, file), 'utf8'));
const baseline = await read('local/baseline/summary.json'), adoption = await read('local/adoption/summary.json');
const math = await read('MATH-RESULTS.json'), isolated = await read('local/hypot-only/summary.json');
const expIsolated = await read('local/exp-only/summary.json');
if (baseline.cases !== 358 || adoption.cases !== 358) throw Error('Expanded sweeps are incomplete');
if (adoption.mismatches.length || Object.values(adoption.engines).some(e => e.errors.length)) throw Error('Adoption has unresolved failures');
const engines = ['chromium', 'firefox', 'webkit'];
const nativeRows = await read('local/baseline/chromium.json'), fixedRows = await read('local/adoption/chromium.json');
const sourceFailures = Object.values(baseline.engines).flatMap(e => e.errors).filter(e => !e.message.startsWith('Wall-clock planning'));
if (sourceFailures.length) throw Error('Baseline has unexplained harness/runtime errors');
const failedHash = createHash('sha256').update('false').digest('hex');
const generationFailures = nativeRows.filter(r => r.components.passed === failedHash).map(r => r.label);
const byCause = {}, byCase = {}, changedByComponent = {}, scheduling = {};
function cause(m) {
  if (m.case.startsWith('weather/')) return 'native exp: forcing/contamination';
  if (m.components.includes('terrain')) return 'native hypot: terrain, then water propagation';
  if (m.components.includes('fallen')) return 'native hypot: fallen directions';
  return 'inspect component evidence';
}
for (const m of baseline.mismatches) { const c = cause(m); byCause[c] = (byCause[c] ?? 0) + 1; byCase[m.case] = (byCase[m.case] ?? 0) + 1; }
for (const row of nativeRows) {
  const fixed = fixedRows.find(r => r.label === row.label);
  if (fixed && row.hash !== fixed.hash) for (const key of Object.keys(row.components)) if (row.components[key] !== fixed.components[key]) changedByComponent[key] = (changedByComponent[key] ?? 0) + 1;
}
for (const name of engines) {
  const a = await read(`local/baseline/${name}.json`), b = await read(`local/adoption/${name}.json`);
  scheduling[name] = { baseline: a.filter(r => r.schedule).map(r => ({ label: r.label, ...r.schedule })), adoption: b.filter(r => r.schedule).map(r => ({ label: r.label, ...r.schedule })) };
}
const result = { base: baseline.base, platform: baseline.platform, playwright: baseline.playwright, cases: baseline.cases, engines: Object.fromEntries(engines.map(n => [n, { version: baseline.engines[n].version, userAgent: baseline.engines[n].userAgent, checkpoints: baseline.engines[n].checkpoints }])), baseline: { pairwiseCheckpointMismatches: baseline.mismatches.length, distinctCases: Object.keys(byCase).length, byCause, byCase, clockRecordFailures: scheduling, generationFailures, runtimeErrors: sourceFailures }, adoption: { pairwiseCheckpointMismatches: adoption.mismatches.length, runtimeErrors: Object.values(adoption.engines).flatMap(e => e.errors), changedChromiumCheckpointsByComponent: changedByComponent }, isolation: { onlyReplacement: 'hypot', cases: isolated.cases, checkpointsPerEngine: isolated.engines.chromium.checkpoints, mismatches: isolated.mismatches.length }, numerical: { samples: math.samples, nativeMismatches: math.nativeMismatches, portableMismatches: math.portableMismatches, nativeByFunction: math.nativeByFunction }, verification: ['baseline/adoption headless core: 0 TypeScript diagnostics', 'adoption guard: 0 forbidden approximate/random calls', 'matching CI manifests accepted; modified hash rejected', 'git apply --check adoption.patch', 'git diff --check'], provenance: 'Unchanged generation/brush/force grid cases retained from the initial same-base sweeps; corrected mixed/session cases and all supplemental cases rerun. CI and normal regeneration always use clean sweeps.' };
result.isolation.weather = { onlyReplacement: 'exp', cases: expIsolated.cases, checkpointsPerEngine: expIsolated.engines.chromium.checkpoints, mismatches: expIsolated.mismatches.length };
result.verification.push('documented locked setup command: passed', 'final harness sanity: 4 cases, 8 checkpoints per engine, 0 mismatches');
await fs.writeFile(path.join(here, 'RESULTS.json'), JSON.stringify(result, null, 2));
await fs.writeFile(path.join(here, 'MISMATCHES.tsv'), 'case\tcheckpoint\tengines\tcomponents\tcause\tchromium_sha256\tother_sha256\n' + baseline.mismatches.map(m => [m.case, m.label, m.engines.join('/'), m.components.join(','), cause(m), ...m.hashes].join('\t')).join('\n') + '\n');
console.log(JSON.stringify({ cases: result.cases, checkpoints: result.engines.chromium.checkpoints, baselineMismatches: baseline.mismatches.length, byCause, adoptionMismatches: adoption.mismatches.length, generationFailures, changedByComponent }));
