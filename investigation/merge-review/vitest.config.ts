import { defineConfig } from 'vitest/config';
export default defineConfig({ cacheDir:'investigation/merge-review/local/vitest-cache', test: { include:['investigation/merge-review/*.test.ts'], maxWorkers:1, testTimeout:300000, reporters:['default'] } });
