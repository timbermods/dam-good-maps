import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';
const source = resolve(`investigation/saving-review/local/${process.env.SAVING_FIXED ? 'product' : 'base'}/src`);
export default defineConfig({
  resolve: { alias: [{ find: '@saving-src', replacement: source }, { find: /^\.\.\/\.\.\/src\//, replacement: `${source}/` }] },
  test: { include: ['investigation/saving-review/*.test.ts', 'investigation/saving-review/local/base/tests/contract/yourMaps.test.ts', 'investigation/saving-review/local/base/tests/contract/olderGenerator.test.ts'], maxWorkers: 4, fileParallelism: false, testTimeout: 300000 },
});
