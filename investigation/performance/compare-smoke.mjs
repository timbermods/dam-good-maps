import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { root } from './adoption.mjs';
const dir = resolve(root, 'investigation/performance');
const manifests = readdirSync(resolve(dir, 'local/runs')).sort().map(n => ({ path: n, ...JSON.parse(readFileSync(resolve(dir, 'local/runs', n, 'manifest.json'))) })).filter(m => m.mode === 'smoke');
const checks = [];
for (const browser of ['edge', 'firefox']) for (const name of ['craterize-fast', 'brush-large', 'select-raise']) {
  const find = phase => manifests.filter(m => m.phase === phase).flatMap(m => m.results.map(r => ({ manifest: m.path, ...r }))).filter(r => r.browser === browser && r.case === name && r.size === 128 && r.status === 'complete' && r.snapshots.initial !== r.snapshots.final).at(-1);
  const b = find('before'), a = find('after');
  const equal = !!(a && b && a.snapshots.final === b.snapshots.final && a.redoExact && b.redoExact);
  checks.push({ browser, name, before: b?.manifest, after: a?.manifest, finalEqual: equal, hash: equal ? a.snapshots.final : undefined,
    sourceHash: { before: b?.provenance?.sourceHash, after: a?.provenance?.sourceHash },
    glitches: { before: b?.summary.errors, after: a?.summary.errors },
    findings: { before: b?.summary.findings, after: a?.summary.findings } });
}
const result = { scope: '128 clean native; functional byte comparisons only, NOT timing certification', checks };
writeFileSync(resolve(dir, 'smoke-proof.json'), JSON.stringify(result, null, 2) + '\n');
console.log(`${checks.filter(c => c.finalEqual).length}/${checks.length} functional before/after final snapshots identical`);
process.exitCode = checks.some(c => !c.finalEqual) ? 1 : 0;
