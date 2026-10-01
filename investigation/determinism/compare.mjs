// Compare complete manifests from different machines, including architecture and OS.
import fs from 'node:fs/promises';
import path from 'node:path';
const dirs = process.argv.slice(2);
if (dirs.length < 2) throw Error('Pass at least two result directories');
const all = [];
for (const dir of dirs) {
  const summary = JSON.parse(await fs.readFile(path.join(dir, 'summary.json'), 'utf8'));
  if (summary.mismatches.length || Object.values(summary.engines).some(e => e.errors.length)) throw Error(`${dir}: incomplete or mismatched engine run`);
  for (const engine of ['chromium', 'firefox', 'webkit']) {
    const rows = JSON.parse(await fs.readFile(path.join(dir, `${engine}.json`), 'utf8'));
    if (rows.length !== summary.engines[engine].checkpoints) throw Error('Truncated manifest');
    all.push({ dir, engine, summary, rows });
  }
}
const reference = all[0]; let differences = 0;
for (const result of all.slice(1)) {
  if (result.summary.base !== reference.summary.base || result.summary.smoke !== reference.summary.smoke || result.summary.adopted !== reference.summary.adopted || result.summary.cases !== reference.summary.cases) throw Error('Source or suite differs');
  if (result.rows.length !== reference.rows.length) throw Error('Checkpoint count differs');
  for (let k = 0; k < reference.rows.length; k++) {
    const a = reference.rows[k], b = result.rows[k];
    if (a.label !== b.label) throw Error('Checkpoint order differs');
    if (a.hash !== b.hash) { differences++; console.error(`${result.dir}/${result.engine}: ${a.label}: ${Object.keys(a.components).filter(key => a.components[key] !== b.components[key]).join(', ')}`); }
  }
}
console.log(`${all.length} engine/host manifests, ${reference.rows.length} checkpoints each, ${differences} mismatches`);
if (differences) process.exitCode = 1;
