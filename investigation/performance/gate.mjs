import { readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cases, forces } from './scenarios.mjs';
import { root } from './adoption.mjs';
import { median,repeatedStats } from './metrics.mjs';
import { createHash } from 'node:crypto';
import { requirements, isQuiet, loadSpiked } from './coverage.mjs';
const dir = resolve(root, 'investigation/performance'), path = resolve(dir, 'local/runs');
const budget = JSON.parse(readFileSync(resolve(dir, 'budgets.json')));
const suite = process.argv.includes('--suite=full') ? 'full' : 'core';
if (process.argv.slice(2).some(arg => !['--suite=core','--suite=full'].includes(arg))) throw new Error('Use --suite=core or --suite=full');
const manifests = existsSync(path) ? readdirSync(path).filter(n => !n.endsWith('-smoke')).map(n => resolve(path, n, 'manifest.json')).filter(existsSync).map(p => ({ path: p, ...JSON.parse(readFileSync(p)) })) : [];
const failures = [], totals = [];
if (budget.status !== 'calibrated') failures.push({ reason: 'budgets are provisional; calibrate from three quiet baselines before adoption' });
const currentAfter = resolve(dir, 'local/build/after/provenance.json');
const expectedHash = existsSync(currentAfter) ? JSON.parse(readFileSync(currentAfter)).sourceHash : undefined;
const expectedBuild = existsSync(currentAfter) ? JSON.parse(readFileSync(currentAfter)).buildHash : undefined;
const currentBefore = resolve(dir, 'local/build/before/provenance.json');
const baselineHash = existsSync(currentBefore) ? JSON.parse(readFileSync(currentBefore)).sourceHash : undefined;
const baselineBuild = existsSync(currentBefore) ? JSON.parse(readFileSync(currentBefore)).buildHash : undefined;
const harnessDigest = createHash('sha256');
for (const file of ['probe.js', 'audio-worklet.js', 'scenarios.mjs', 'coverage.mjs', 'budgets.json', 'metrics.mjs', 'load.ps1', 'laptop-profile.ps1', 'run.mjs', 'drain.mjs', 'continuous-load.mjs']) harnessDigest.update(file).update(readFileSync(resolve(dir, file)));
const harnessHash = harnessDigest.digest('hex');
const verbs = readFileSync(resolve(root, 'src/core/forces/op.ts'), 'utf8').match(/export const VERBS[^=]*=\s*\[([^\]]+)\]/)?.[1]?.match(/"([a-z]+)"/g)?.map(s => s.slice(1, -1)) ?? [];
if (!verbs.length) failures.push({ reason: 'cannot enumerate current force registry' });
for (const verb of verbs) if (!forces.some(f => f.name.toLowerCase() === verb)) failures.push({ reason: `unregistered force: ${verb}` });
function eligible(row, phase) {
  return row.status === 'complete' && row.qualified && row.harnessHash === harnessHash &&
    row.provenance?.sourceHash === (phase === 'before' ? baselineHash : expectedHash) &&
    row.provenance?.buildHash === (phase === 'before' ? baselineBuild : expectedBuild) &&
    isQuiet(row.load, budget.quiet) && row.loadAfter?.quiet === true && !loadSpiked(row.loadDuring, budget.quiet);
}
for (const requirement of requirements(budget,suite)) {
  const { browser, profile, size, look, id, repeats, captureRepeats } = requirement;
  const match = row => row.browser === browser && row.profile === profile && row.size === size && row.look === look && row.case === requirement.case;
  const before = manifests.filter(m => m.mode === 'measure' && m.phase === 'before' && !m.flags.hour).flatMap(m => m.results).filter(row => match(row) && eligible(row,'before'));
  const after = manifests.filter(m => m.mode === 'measure' && m.phase === 'after' && !m.flags.hour).flatMap(m => m.results).filter(row => match(row) && eligible(row,'after'));
  const paired = Array.from({length:repeats},(_,i)=>i+1).filter(repeat=>after.some(r=>r.repeat===repeat)&&before.some(r=>r.repeat===repeat));
  if (paired.length < repeats) failures.push({ id, reason: `missing ${repeats} qualified paired runs`, before: before.length, after: after.length });
  for (const a of after) {
    if (!expectedHash || a.provenance?.sourceHash !== expectedHash) failures.push({ id, repeat: a.repeat, reason: 'measurement was not made against current proposal build' });
    if (!expectedBuild || a.provenance?.buildHash !== expectedBuild || a.harnessHash !== harnessHash) failures.push({ id, repeat: a.repeat, reason: 'built product or harness provenance mismatch' });
    const b = before.find(b => b.repeat === a.repeat);
    if (!baselineHash || b?.provenance?.sourceHash !== baselineHash) failures.push({ id, repeat: a.repeat, reason: 'baseline build provenance mismatch' });
    if (!baselineBuild || b?.provenance?.buildHash !== baselineBuild || b?.harnessHash !== harnessHash) failures.push({ id, repeat: a.repeat, reason: 'baseline product or harness provenance mismatch' });
    if (!b || a.snapshots.final !== b.snapshots.final) failures.push({ id, repeat: a.repeat, reason: 'final bytes differ (or no matching baseline)' });
    if (!a.redoExact) failures.push({ id, repeat: a.repeat, reason: 'redo byte mismatch' });
    if (browser === 'edge' && !a.device.longTasksSupported) failures.push({ id, repeat: a.repeat, reason: 'primary long-main-thread-task oracle unavailable' });
    if (!a.summary.frames || !a.summary.rendered || a.summary.hitches.length || a.summary.longTasks.length || a.summary.glitches.length || a.summary.p99 > budget.frame.p99Ms) failures.push({ id, repeat: a.repeat, reason: 'frame/glitch budget exceeded or measurement empty', hitches: a.summary.hitches.length, longTasks: a.summary.longTasks.length, glitches: a.summary.glitches.length, p99: a.summary.p99 });
  }
  const captureBefore = manifests.filter(m=>m.mode==='capture'&&m.phase==='before').flatMap(m=>m.results).filter(row=>match(row)&&eligible(row,'before'));
  const captureAfter = manifests.filter(m=>m.mode==='capture'&&m.phase==='after').flatMap(m=>m.results).filter(row=>match(row)&&eligible(row,'after'));
  const capture = [...captureBefore,...captureAfter];
  if (capture.some(c=>!c.captureHash || !c.summary?.rendered)) failures.push({id,reason:'frame capture empty or missing provenance'});
  // A visual/audio oracle is mandatory. Missing review is not zero glitches/dropouts. The existing
  // geometric checks cannot certify shadows, topology holes, reflections or actual audio samples.
  const capturePairs = [...new Set(captureAfter.map(r=>r.repeat))].filter(repeat=>captureBefore.some(r=>r.repeat===repeat));
  if (capturePairs.length < captureRepeats) failures.push({ id, reason: `missing ${captureRepeats} qualified capture pairs` });
  const oraclePath = resolve(dir, 'local/oracles', id.replaceAll('/', '-') + '.json');
  if (!existsSync(oraclePath)) failures.push({ id, reason: 'visual/audio oracle unavailable' });
  else {
    const oracle = JSON.parse(readFileSync(oraclePath));
    if (!capture.every(c => c.captureHash && oracle.captureHashes?.includes(c.captureHash))) failures.push({ id, reason: 'oracle is not bound to current frame/audio capture hashes' });
    if (!(oracle.heldTextureReleaseMsMax <= budget.audio.heldTextureReleaseMsMax)) failures.push({ id, reason: 'sound release/motion timing evidence unavailable or over budget' });
    if (!budget.requiredManualOracles.every(n => oracle.checked?.includes(n)) || oracle.glitches !== 0 || oracle.dropouts !== 0 || oracle.crackles !== 0) failures.push({ id, reason: 'incomplete or failed visual/audio oracle' });
  }
  // Fixed repeat IDs, earliest qualified record per ID: do not select the fastest five.
  const fixed=rows=>Array.from({length:repeats},(_,i)=>rows.find(r=>r.repeat===i+1)).filter(Boolean);
  const repeated={before:repeatedStats(fixed(before)),after:repeatedStats(fixed(after))};
  if(repeated.after.runs===repeats&&!(Number.isFinite(repeated.after.p99Ms.median)&&Number.isFinite(repeated.after.p99Ms.worst)&&repeated.after.p99Ms.median<=budget.frame.p99Ms&&repeated.after.p99Ms.worst<=budget.frame.p99Ms&&
    repeated.after.hitches.worst===0&&repeated.after.longTasks.worst===0))failures.push({id,reason:'median/worst repeated pacing budget exceeded',repeated});
  totals.push({ id, required:repeats, before: before.length, after: after.length, capturePairs:capturePairs.length,repeated,
    longTasks: browser==='firefox' ? 'API may be unavailable; frame-pacing and visual/audio compatibility checks still required' : 'required' });
}
{
  const {browser,profile,size,look,required} = budget.longSession;
  const rows = manifests.filter(m => m.mode === 'measure' && m.phase === 'after' && m.flags.hour).flatMap(m => m.results).filter(r => r.browser === browser && r.profile === profile && r.size === size && r.look === look && eligible(r,'after') && r.longSession?.elapsed >= budget.longSession.durationMs);
  if (rows.length < required) failures.push({ id: `${browser}/${profile}/${size}/${look}/hour`, reason: 'missing one qualified hour-long session' });
  for (const row of rows) {
    if (!row.device?.longTasksSupported) failures.push({id:`${browser}/${profile}/${size}/${look}/hour`,reason:'hour Long Tasks oracle unavailable'});
    if (!row.longReference) { failures.push({ id: `${browser}/${profile}/${size}/${look}/hour`, reason: 'missing matched start/end reference interaction' }); continue; }
    const { first, last } = row.longReference;
    const beforeMB = row.loadAtStart?.browserPrivateMB ?? median(row.load?.samples?.map(s => s.browserPrivateMB) ?? []);
    const afterMB = median(row.loadAfter?.samples?.map(s => s.browserPrivateMB) ?? []);
    if (!(beforeMB > 0 && afterMB > 0) || afterMB > beforeMB * budget.longSession.browserPrivateGrowthRatioMax) failures.push({ id: `${browser}/${profile}/${size}/${look}/hour`, reason: 'browser private-memory evidence unavailable or over provisional growth budget', beforeMB, afterMB });
    if (!first.frames || !last.frames || [first, last].some(s => s.hitches.length || s.glitches.length || s.longTasks.length)) failures.push({ id: `${browser}/${profile}/${size}/${look}/hour`, reason: 'reference interaction missing or contains hitch/task/glitch' });
    if (last.p99 > first.p99 * budget.longSession.endP99RatioMax || last.memory.last.geometries > first.memory.last.geometries || last.memory.last.textures > first.memory.last.textures) failures.push({ id: `${browser}/${profile}/${size}/${look}/hour`, reason: 'end/start frame or GPU memory regression' });
    if (!row.longWindows?.length) failures.push({id:`${browser}/${profile}/${size}/${look}/hour`,reason:'hour event stream missing'});
    else if (row.longWindows.some(w => w.summary.hitches.length || w.summary.glitches.length || w.summary.longTasks.length)) failures.push({ id: `${browser}/${profile}/${size}/${look}/hour`, reason: 'hitch/task/glitch during long session' });
  }
}
writeFileSync(resolve(dir, `local/gate${suite==='full'?'-full':''}.json`), JSON.stringify({ suite, status: failures.length ? 'NOT READY' : 'PASS', failures, totals }, null, 2));
console.log(`${failures.length ? 'NOT READY' : 'PASS'}: ${failures.length} failures/missing evidence; details local/gate.json`);
process.exitCode = failures.length ? 1 : 0;
