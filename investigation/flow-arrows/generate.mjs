import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
await mkdir(new URL('./local/', import.meta.url), { recursive: true });
await build({ entryPoints: ['generate.ts'], bundle: true, platform: 'node', format: 'esm', outfile: 'local/generate.mjs', nodePaths: ['node_modules'] });
await import('./local/generate.mjs');
