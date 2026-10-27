import { defineConfig } from 'vitest/config';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, '../..');
const overlay = resolve(import.meta.dirname, 'candidate/src/core/gen/generate.ts');
export default defineConfig({
  root,
  plugins: [{ name:'adoption-overlay', enforce:'pre', load(id) {
    if (id.replaceAll('\\','/') === resolve(root,'src/core/gen/generate.ts').replaceAll('\\','/')) return readFileSync(overlay,'utf8');
  } }],
  test: {
    include: [
      'tests/contract/features.test.ts',
      'tests/contract/firstLand.test.ts',
      'tests/contract/start.test.ts',
      'tests/contract/resources.test.ts',
      'tests/unit/rustWater.test.ts',
      'tests/unit/water-speedups.test.ts',
    ],
    maxWorkers:1, fileParallelism:false, testTimeout:300000, hookTimeout:300000,
  },
});
