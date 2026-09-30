import { build } from 'vite';
import preact from '@preact/preset-vite';
import { mkdirSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { root, files, candidate } from './adoption.mjs';
const dir = resolve(root, 'investigation/performance');
const phase = process.argv[2] ?? 'before';
if (!['before', 'after'].includes(phase)) throw new Error('build.mjs before|after');
const local = resolve(dir, 'local');
mkdirSync(local, { recursive: true });
// The source tree is never edited. The same exact transforms generate the adoption diff and
// the proposed production build. Editor.tsx, rows, worker and simulation are untouched.
const patches = [];
for (const file of files) {
  const a = resolve(local, 'original', file), b = resolve(local, 'candidate', file);
  mkdirSync(resolve(a, '..'), { recursive: true }); mkdirSync(resolve(b, '..'), { recursive: true });
  writeFileSync(a, readFileSync(resolve(root, file), 'utf8').replaceAll('\r\n', '\n'));
  writeFileSync(b, candidate(file));
  const diff = spawnSync('git', ['diff', '--no-index', '--no-prefix', '--', a, b], { encoding: 'utf8' });
  if (diff.status !== 1) throw new Error(diff.error?.message || diff.stderr || `No candidate diff: ${file}`);
  patches.push(diff.stdout.split('\n').map(line => line === ' ' ? '' : line.startsWith('diff --git ') ? `diff --git a/${file} b/${file}` :
    line.startsWith('--- ') ? `--- a/${file}` : line.startsWith('+++ ') ? `+++ b/${file}` : line).join('\n'));
}
writeFileSync(resolve(dir, 'adoption.patch'), patches.join(''));
const head = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' });
if (head.status !== 0) throw new Error(head.error?.message || head.stderr);
const base = head.stdout.trim();
await build({
  root, configFile: false, base: '/', mode: 'e2e',
  plugins: [
    { name: 'performance-proposal', enforce: 'pre', transform(code, id) {
      const path = id.replaceAll('\\', '/');
      const file = files.find(f => path === resolve(root, f).replaceAll('\\', '/'));
      if (phase !== 'after' || !file) return undefined;
      const codeAfter = candidate(file);
      return { code: codeAfter, map: { version: 3, sources: [resolve(local, 'candidate', file)],
        sourcesContent: [codeAfter], names: [], mappings: codeAfter.split('\n').map((_, i) => i ? 'AACA' : 'AAAA').join(';') } };
    }, transformIndexHtml(html) {
      return { html, tags: [{ tag: 'script', attrs: { type: 'module', src: '/investigation/performance/probe.js' }, injectTo: 'head' }] };
    } }, preact(),
  ],
  worker: { format: 'es' },
  build: { target: 'es2022', outDir: resolve(local, 'build', phase), emptyOutDir: true, sourcemap: true, chunkSizeWarningLimit: 900 },
});
const sourceHash = createHash('sha256').update(files.map(file => phase === 'after' ? candidate(file) : readFileSync(resolve(root, file), 'utf8').replaceAll('\r\n', '\n')).join('\n')).digest('hex');
const assets = resolve(local, 'build', phase, 'assets');
const buildHash = createHash('sha256');
for (const file of readdirSync(assets).filter(n => /\.(js|css)$/.test(n)).sort()) buildHash.update(file).update(readFileSync(resolve(assets, file)));
writeFileSync(resolve(local, 'build', phase, 'provenance.json'), JSON.stringify({ base, phase, mode: 'e2e', sourceHash, buildHash: buildHash.digest('hex'), files, timestamp: new Date().toISOString() }, null, 2));
