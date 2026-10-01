import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, cpSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

export const here = dirname(fileURLToPath(import.meta.url));
export const root = resolve(here, '../..');
export const local = join(here, 'local');
const base = 'f5874349acfc657ebf715ba30424fca7c30db626';
const page = 'b8471e7ae8d43a6050f5a0410beacc5ecf5bd603';
const read = (ref, path) => execFileSync('git', ['show', `${ref}:${path}`], { cwd: root, encoding: 'utf8', maxBuffer: 32e6 }).replaceAll('\r\n', '\n');
function put(dir, path, text) { mkdirSync(dirname(join(dir, path)), { recursive: true }); writeFileSync(join(dir, path), text); }

mkdirSync(local, { recursive: true });
execFileSync(process.execPath, [join(here, 'make-cache-patch.mjs')], { stdio: 'inherit' });
// Only disposable local copies are changed. The tracked product stays read-only.
for (const variant of ['before', 'after']) {
  const dir = join(local, variant);
  mkdirSync(dir, { recursive: true });
  for (const folder of ['src', 'public', 'prototype']) cpSync(join(root, folder), join(dir, folder), { recursive: true });
  cpSync(join(root, 'investigation/notes'), join(dir, 'investigation/notes'), { recursive: true });
  for (const name of ['package.json', 'tsconfig.json']) cpSync(join(root, name), join(dir, name));
  const paths = execFileSync('git', ['diff', '--name-only', base, page, '--', 'src'], { cwd: root, encoding: 'utf8' }).trim().split(/\r?\n/);
  // Read part 1's new components; keep latest dev's renderer and every other existing module.
  for (const path of paths) if (!existsSync(join(root, path))) put(dir, path, read(page, path));
  put(dir, 'tools/first-visit-maps.ts', read(page, 'tools/first-visit-maps.ts'));
  put(dir, 'bench.tsx', readFileSync(join(here, 'bench.tsx')));
  put(dir, 'index.html', '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="app"></div><script type="module" src="/bench.tsx"></script></body></html>');
}

const pickerPath = 'src/core/library/firstVisit.ts';
const original = read(page, pickerPath);
const a = original.indexOf('export const FIRST_VISIT_FORMAT');
const b = original.indexOf('/** Why a generated map');
const picker = original.slice(a, b);
const changes = new Map([
  [pickerPath, original.slice(0, a) + 'export { FIRST_VISIT_FORMAT, FIRST_VISIT_DIR, FIRST_VISIT_SIZE, pickFirstVisit } from "./firstVisitPicker";\nimport { FIRST_VISIT_SIZE, type FirstVisitMap } from "./firstVisitPicker";\nexport type { FirstVisitMap, FirstVisitIndex } from "./firstVisitPicker";\n\n' + original.slice(b)],
  ['src/core/library/firstVisitPicker.ts', '// Browser-safe first-visit metadata and selection. Build-time generation stays in firstVisit.ts.\nimport type { ThemeId } from "../spec/mapspec";\n\n' + picker],
  ['src/page/firstVisit/load.ts', read(page, 'src/page/firstVisit/load.ts').replace('../../core/library/firstVisit"', '../../core/library/firstVisitPicker"')],
  ['src/page/firstVisit/start.ts', readFileSync(join(here, 'start.ts'), 'utf8')],
]);
let patch = '';
for (const [path, source] of changes) {
  const old = join(local, 'patch-old', path), next = join(local, 'patch-new', path);
  mkdirSync(dirname(old), { recursive: true }); mkdirSync(dirname(next), { recursive: true });
  const existed = existsSync(join(local, 'before', path));
  if (existed) writeFileSync(old, readFileSync(join(local, 'before', path)));
  writeFileSync(next, source);
  let diff;
  try { diff = execFileSync('git', ['diff', '--no-index', '--no-prefix', '--', existed ? old : (process.platform === 'win32' ? 'NUL' : '/dev/null'), next], { encoding: 'utf8' }); }
  catch (e) { if (e.status !== 1) throw e; diff = e.stdout.toString(); }
  const lines = diff.replaceAll('\r\n', '\n').split('\n');
  lines[0] = `diff --git a/${path} b/${path}`;
  patch += lines.map(line => line.startsWith('--- ') ? `--- ${existed ? 'a/' + path : '/dev/null'}` : line.startsWith('+++ ') ? `+++ b/${path}` : line === ' ' ? '' : line).join('\n');
  put(join(local, 'after'), path, source);
}
writeFileSync(join(here, 'adoption.patch'), patch);
execFileSync('git', ['apply', '--no-index', '--check', join(here, 'adoption.patch')], { cwd: join(local, 'before') });

if (!process.argv.includes('--skip-maps')) {
  execFileSync(process.execPath, ['--import', 'tsx', 'tools/first-visit-maps.ts', ...(process.argv.includes('--no-python') ? ['--no-python'] : [])], { cwd: join(local, 'before'), stdio: 'inherit' });
}
const maps = join(local, 'before/public/first-visit');
if (!existsSync(join(maps, 'index.json'))) throw Error('Generate release-checked first-visit maps first');
cpSync(maps, join(local, 'after/public/first-visit'), { recursive: true });
const marks = { name: 'startup-measurement-only', transform(code, id) {
  if (id.replaceAll('\\', '/').endsWith('/src/ui/View3D.tsx')) return code.replace('const stats = r.setMap(props.view);', 'const stats = r.setMap(props.view); performance.mark("map-frame");');
} };
for (const variant of ['before', 'after']) {
  await build({ configFile: false, root: join(local, variant), base: '/dam-good-maps/',
    plugins: [marks, (await import('@preact/preset-vite')).default()], worker: { format: 'es' },
    define: { __AFTER__: String(variant === 'after') },
    build: { target: 'es2022', sourcemap: true, manifest: true, outDir: join(local, `dist-${variant}`), emptyOutDir: true } });
}
await build({ configFile: join(root, 'vite.config.ts'), root, plugins: [marks], build: { outDir: join(local, 'dist-dev'), emptyOutDir: true, manifest: true } });
writeFileSync(join(local, 'provenance.json'), JSON.stringify({ base, page, patch: 'adoption.patch', productFilesChanged: false, fixtureIndex: JSON.parse(readFileSync(join(maps, 'index.json'))), node: process.version }, null, 2));
