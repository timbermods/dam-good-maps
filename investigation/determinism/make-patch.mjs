import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { transform } from './transform.mjs';
const here = path.dirname(fileURLToPath(import.meta.url)), root = path.resolve(here, '../..');
async function files(dir) { const out = []; for (const d of await fs.readdir(dir, { withFileTypes: true })) { const p = path.join(dir, d.name); if (d.isDirectory()) out.push(...await files(p)); else if (/\.[jt]s$/.test(p)) out.push(p); } return out.sort(); }
let patch = ''; const changed = [];
for (const file of [...await files(path.join(root, 'src/core')), path.join(root, 'src/worker/session.ts')]) {
  const rel = path.relative(root, file).replaceAll('\\', '/'), source = (await fs.readFile(file, 'utf8')).replaceAll('\r\n', '\n');
  let module = path.posix.relative(path.posix.dirname(rel), 'src/core/math/portable'); if (!module.startsWith('.')) module = './' + module;
  const after = transform(source, file, module);
  if (source === after) continue;
  const a = 'local/patch-before/' + rel, b = 'local/patch-after/' + rel;
  await fs.mkdir(path.dirname(path.join(here, a)), { recursive: true }); await fs.mkdir(path.dirname(path.join(here, b)), { recursive: true });
  await fs.writeFile(path.join(here, a), source); await fs.writeFile(path.join(here, b), after);
  const r = spawnSync('git', ['diff', '--no-index', '--no-ext-diff', '--src-prefix=a/', '--dst-prefix=b/', '--', a, b], { cwd: here, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  if (r.status !== 1) throw Error(r.stderr || 'expected a diff');
  patch += r.stdout.replaceAll('a/local/patch-before/', 'a/').replaceAll('b/local/patch-after/', 'b/'); changed.push(rel);
}
const portable = (await fs.readFile(path.join(here, 'portable.ts'), 'utf8')).replace("'../../src/core/math/detmath'", "'./detmath'").replaceAll('\r\n', '\n');
const lines = portable.trimEnd().split('\n');
patch += 'diff --git a/src/core/math/portable.ts b/src/core/math/portable.ts\nnew file mode 100644\n--- /dev/null\n+++ b/src/core/math/portable.ts\n@@ -0,0 +1,' + lines.length + ' @@\n' + lines.map(l => '+' + l).join('\n') + '\n';
// Git accepts an empty context line for a blank source line. Avoid trailing
// whitespace when this patch itself is added as a repository artifact.
patch = patch.replace(/^ $/gm, '');
await fs.writeFile(path.join(here, 'adoption.patch'), patch);
await fs.writeFile(path.join(here, 'PATCH-FILES.json'), JSON.stringify([...changed, 'src/core/math/portable.ts'], null, 2));
console.log(`Generated adoption.patch: ${changed.length + 1} files, ${patch.length} bytes; product source untouched.`);
