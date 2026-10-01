// Freeze the specified M9b source without checking out or editing the product.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { resolve, dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const base = 'e292cefe30469033a922650f0455f87297c051d5';
const deps = resolve(here, 'local/deps');
const git = (...args) => {
  const r = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  if (r.status !== 0) throw Error(r.stderr || `git failed: ${r.status}`);
  return r.stdout;
};
if (process.argv.includes('--init')) {
  mkdirSync(deps, { recursive: true });
  for (const f of ['package.json', 'package-lock.json']) writeFileSync(resolve(deps, f), git('show', `${base}:${f}`));
  console.log(`Install: npm ci --prefix "${deps}" --ignore-scripts --no-audit --no-fund`);
} else {
  const name = process.argv[2] ?? 'after';
  if (!/^[a-z0-9-]+$/.test(name)) throw Error('simple snapshot name required');
  const snap = resolve(here, 'local', name);
  if (existsSync(snap)) throw Error('snapshot already exists; use a fresh name');
  mkdirSync(snap, { recursive: true });
  const zip = resolve(here, 'local/source.zip');
  git('archive', '--format=zip', '-o', zip, base, 'src', 'tests', 'tools', 'investigation/m9b', 'investigation/carve', 'investigation/generative', 'investigation/probe/run.cjs', 'package.json', 'tsconfig.json', 'vitest.config.ts');
  const require = createRequire(import.meta.url);
  const { unzipSync } = require(resolve(deps, 'node_modules/fflate'));
  for (const [name, bytes] of Object.entries(unzipSync(readFileSync(zip)))) {
    const dest = resolve(snap, name);
    if (!dest.startsWith(snap + sep)) throw Error('archive path leaves snapshot');
    if (name.endsWith('/')) { mkdirSync(dest, { recursive: true }); continue; }
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, bytes);
  }
  if (process.argv.includes('--patch')) {
    const directory = relative(root, snap).split(sep).join('/');
    git('apply', '--check', '--whitespace=error-all', '--directory', directory, resolve(here, 'adoption.patch'));
    git('apply', '--whitespace=error-all', '--directory', directory, resolve(here, 'adoption.patch'));
  }
  const runner = resolve(snap, 'investigation/probe/run.cjs');
  writeFileSync(runner, readFileSync(runner, 'utf8').replace("path.join(__dirname, 'node_modules')", JSON.stringify(resolve(deps, 'node_modules'))));
  console.log(snap);
}
