import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';
import { root, files, candidate } from './adoption.mjs';
export default defineConfig({
  root,
  plugins: [{ name: 'adoption-under-test', enforce: 'pre', transform(code, id) {
    const file = files.find(f => id.replaceAll('\\', '/') === resolve(root, f).replaceAll('\\', '/'));
    return file ? candidate(file) : undefined;
  } }],
  test: { include: ['tests/unit/forceDriver.test.ts', 'tests/unit/juice.test.ts', 'tests/unit/waterPlayer.test.ts', 'investigation/performance/test.spec.ts'],
    maxWorkers: 1, fileParallelism: false },
});
