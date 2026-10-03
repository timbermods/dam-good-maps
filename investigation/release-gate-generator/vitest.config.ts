import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

// The generator's release-gate bug hunt: its own config, since the repo's only includes tests/unit and
// tests/contract (as investigation/release-gate-core/ does). At most four workers.
export default defineConfig({
  root: resolve(__dirname, "../.."),
  test: {
    include: ["investigation/release-gate-generator/**/*.test.ts"],
    testTimeout: 1_200_000,
    hookTimeout: 1_200_000,
    maxWorkers: 4,
  },
});
