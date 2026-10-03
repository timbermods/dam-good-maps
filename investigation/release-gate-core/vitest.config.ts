import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

// The release-gate bug hunt (D385): its own config, since the repo's only includes tests/unit and
// tests/contract. editor-core/ runs on dev; water/ runs from a feature/m9b checkout with this folder
// copied in (REPORT.md says how). At most two workers: the machine is shared.
export default defineConfig({
  root: resolve(__dirname, "../.."),
  test: {
    include: ["investigation/release-gate-core/**/*.test.ts"],
    testTimeout: 600_000,
    hookTimeout: 600_000,
    maxWorkers: 2,
  },
});
