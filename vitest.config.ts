import { configDefaults, defineConfig } from "vitest/config";

// Two projects. "quick" is every unit and contract test but the heaviest; CI runs it on every push
// and pull request (`npm run test:quick`). "heavy" is the long property runs, the settings batch and
// every real place's byte check; CI runs it nightly (.github/workflows/nightly.yml,
// `npm run test:heavy`), and runs the real places' files on a pull request into main, the release
// check (ci.yml, `npm run test:places`). `npm test` runs both, as each milestone's full check does.
//
// The timeouts only catch a hung test. Under load (four workers, or other batches on the machine) a
// case can take several times its usual time: the drawn rivers at 96² took 17 s alone and over 120 s
// beside three other workers (investigation/audit/AUDIT.md, "Baseline").
const HEAVY = [
  "tests/contract/properties.test.ts", // random edits, undo and redo on every size preset (E1)
  "tests/contract/rivers.test.ts", // rivers drawn at random on three sizes
  "tests/contract/reshape.test.ts", // set pieces, lakes and landforms beside every kind of object
  "tests/contract/settings.test.ts", // each setting's batch experiment (M6)
  // every real place, built and checked byte for byte against the index (a sample runs on every
  // push: tests/contract/places.test.ts)
  "tests/contract/places-build-1.test.ts",
  "tests/contract/places-build-2.test.ts",
  "tests/contract/places-build-3.test.ts",
];

export default defineConfig({
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "quick",
          include: ["tests/unit/**/*.test.ts", "tests/contract/**/*.test.ts"],
          exclude: [...configDefaults.exclude, ...HEAVY],
          testTimeout: 300_000,
          hookTimeout: 300_000,
        },
      },
      {
        extends: true,
        test: {
          name: "heavy",
          include: HEAVY,
          testTimeout: 1_200_000,
          hookTimeout: 1_200_000,
        },
      },
    ],
  },
});
