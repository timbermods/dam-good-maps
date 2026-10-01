import { build } from 'esbuild';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const here = path.dirname(fileURLToPath(import.meta.url));
await mkdir(path.join(here, 'local'), { recursive: true });
const result = await build({
  entryPoints: [path.join(here, 'app.ts')], bundle: true, write: false,
  format: 'iife', platform: 'browser', target: 'es2022', minify: true,
  nodePaths: [path.join(here, 'node_modules')],
});
const template = await readFile(path.join(here, 'index.html'), 'utf8');
await writeFile(path.join(here, 'local/demo.html'),
  template.replace('/* BUNDLE */', () => result.outputFiles[0].text.replaceAll('</script', '<\\/script')));
console.log('Built local/demo.html (' + result.outputFiles[0].text.length + ' JS characters). Open it from disk; no server.');
