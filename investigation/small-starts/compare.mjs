// Compare complete runs, failing loudly on missing maps or new blocking failures.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { spawnSync } from 'node:child_process';
const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const themes = ['any', 'riverValley', 'canyon', 'highlands', 'lakeBasin', 'delta', 'islands'];
const read = file => readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
const check = (rows, size) => {
  const keys = new Set(rows.map(r => `${r.theme}:${r.seed}`));
  if (rows.length !== 280 || keys.size !== 280 || rows.some(r => r.error || r.size !== size)) throw Error(`incomplete/invalid ${size} run`);
  for (const t of themes) for (let seed = 1; seed <= 40; seed++) if (!keys.has(`${t}:${seed}`)) throw Error(`missing ${t}:${seed}`);
};
const met = r => r.ok && r.outcomes?.met === true;
const summary = { source: 'e292cefe', sizes: {} };
for (const size of [96, 128, 256]) {
  const before = read(resolve(here, `local/measures/before-${size}.jsonl`));
  const after = read(resolve(here, `local/measures/final-${size}.jsonl`));
  check(before, size); check(after, size);
  const g = spawnSync('git', ['show', `e292cefe:investigation/m9b/baseline/13d1f1a2-${size}.jsonl.gz`], { cwd: root, maxBuffer: 16 * 1024 * 1024 });
  if (g.status !== 0) throw Error(String(g.stderr));
  const committed = gunzipSync(g.stdout).toString().trim().split('\n').map(JSON.parse);
  const b = new Map(before.map(r => [`${r.theme}:${r.seed}`, r]));
  const old = new Map(committed.map(r => [`${r.theme}:${r.seed}`, r]));
  const key = r => `${r.theme}:${r.seed}`;
  const drift = before.filter(r => ['ok', 'outcomes', 'heights', 'mines', 'wetShare'].some(k => JSON.stringify(r[k]) !== JSON.stringify(old.get(key(r))?.[k])));
  if (drift.length) throw Error(`baseline observation changed ${drift.map(key).join(',')}`);
  const failures = rows => rows.filter(r => !r.ok).map(r => ({ map: key(r), checks: r.failedChecks }));
  const newFailures = after.filter(r => !r.ok && b.get(key(r))?.ok);
  if (newFailures.length) throw Error(`new failures: ${newFailures.map(key).join(',')}`);
  if (failures(after).length) throw Error(`blocking failures remain: ${after.filter(r => !r.ok).map(key).join(',')}`);
  const illegalLand = after.filter(r => r.shown !== 1 || r.lands !== 1 || r.changed !== 0);
  if (illegalLand.length) throw Error(`display count or terrain changed: ${illegalLand.map(key).join(',')}`);
  summary.sizes[size] = {
    failures: { before: failures(before), after: failures(after) },
    met: { before: before.filter(met).length, after: after.filter(met).length },
    themes: Object.fromEntries(themes.map(t => [t, Object.fromEntries([20,40].map(n => {
      const a = before.filter(r => r.theme === t && r.seed <= n), z = after.filter(r => r.theme === t && r.seed <= n);
      const misses = rows => Object.fromEntries(['promise', 'water', 'standout'].map(k => [k, rows.filter(r => r.outcomes?.[k] === false).length]));
      return [n, { before: a.filter(met).length, after: z.filter(met).length, misses: { before: misses(a), after: misses(z) } }];
    }))])),
    hiddenMineRetries: after.filter(r => r.hiddenMineAttempts?.length).map(r => ({ map: key(r), attempts: r.hiddenMineAttempts })),
    bytesChanged: after.filter(r => r.bytesHash !== b.get(key(r)).bytesHash).map(key),
    gained: after.filter(r => met(r) && !met(b.get(key(r)))).map(key),
    lost: after.filter(r => !met(r) && met(b.get(key(r)))).map(key),
    terrainChangedAfterDisplay: after.filter(r => r.changed).map(r => ({ map: key(r), tiles: r.changed, worn: r.worn?.cut })),
  };
}
writeFileSync(resolve(here, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
for (const [size, r] of Object.entries(summary.sizes)) console.log(`${size}²: failures ${r.failures.before.length} → ${r.failures.after.length}, all three ${r.met.before} → ${r.met.after}, bytes changed ${r.bytesChanged.length}, all-three losses ${r.lost.length}`);
