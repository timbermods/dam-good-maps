// Read a pinned renderer tree; write only the investigation's ignored comparison overlay.
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { root } from './adoption.mjs';
function git(args) {
  const r = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(r.error?.message || r.stderr);
  return r.stdout;
}
const ref = git(['rev-parse', process.argv[2] ?? 'origin/feature/high-look']).trim();
const files = git(['ls-tree', '-r', '--name-only', ref, '--', 'src/render3d']).trim().split('\n');
const entries = [];
for (const file of files) {
  if (!file.startsWith('src/render3d/') || file.includes('..')) throw new Error('Invalid overlay path');
  const text = git(['show', `${ref}:${file}`]);
  const target = resolve(root, 'investigation/performance/local/high-source', file);
  mkdirSync(resolve(target, '..'), { recursive: true }); writeFileSync(target, text);
  entries.push({ file, sha256: createHash('sha256').update(text).digest('hex') });
}
// Combine presentation-only branches in ignored files. No checkout/merge modifies the product.
const base = git(['merge-base', ref, '9e14f1895c386489928dda78f888fc79772ceef6']).trim();
const changed = git(['diff', '--name-only', base, '9e14f1895c386489928dda78f888fc79772ceef6', '--', 'src/render3d']).trim().split('\n');
const temp = resolve(root, 'investigation/performance/local/merge');
mkdirSync(temp, { recursive: true });
for (const file of changed) {
  const target = resolve(root, 'investigation/performance/local/high-source', file);
  const old = spawnSync('git', ['show', `${base}:${file}`], { cwd: root, encoding: 'utf8' });
  const high = spawnSync('git', ['show', `${ref}:${file}`], { cwd: root, encoding: 'utf8' });
  if (old.status || high.status) { writeFileSync(target, readFileSync(resolve(root, file))); continue; }
  writeFileSync(resolve(temp, 'old'), old.stdout);
  writeFileSync(resolve(temp, 'forces'), readFileSync(resolve(root, file)));
  const merged = spawnSync('git', ['merge-file', '-p', target, resolve(temp, 'old'), resolve(temp, 'forces')], { encoding: 'utf8' });
  if (merged.status > 4 || merged.status < 0) throw new Error(merged.stderr);
  let text = merged.stdout, conflicts = 0;
  text = text.replace(/^<<<<<<<[^\n]*\n([\s\S]*?)^=======\n([\s\S]*?)^>>>>>>>[^\n]*\n/gm, (_, highSide, forceSide) => {
    conflicts++;
    if (highSide.includes('import { effectsFrom') || highSide.includes('export type Look')) return highSide + forceSide;
    if (highSide.includes('this.beginCost()')) return highSide;
    if (highSide.includes('this.high?.dispose()')) return '    this.forceFx?.dispose();\n' + highSide;
    throw new Error('Unrecognized High/forces integration conflict');
  });
  if (file.endsWith('/renderer.ts') && conflicts !== 4) throw new Error('Pinned renderer conflict count changed');
  writeFileSync(target, text);
}
const integrated = [...new Set([...files, ...changed])].map(file => ({ file, sha256: createHash('sha256').update(readFileSync(resolve(root, 'investigation/performance/local/high-source', file))).digest('hex') }));
writeFileSync(resolve(root, 'investigation/performance/look-source.json'), JSON.stringify({ ref, mergeBase: base, forceBase: '9e14f1895c386489928dda78f888fc79772ceef6', purpose: 'Isolated presentation integration only; computation and interface stay at force base', entries, integrated }, null, 2) + '\n');
console.log(`Pinned ${files.length} renderer files from ${ref}; source files unchanged.`);
