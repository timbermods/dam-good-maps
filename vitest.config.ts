import { configDefaults, defineConfig } from "vitest/config";

// Two projects. "quick" is every unit and contract test but the heaviest; CI runs it on every push
// and pull request (`npm run test:quick`). "heavy" is the long property runs and the settings batch;
// CI runs it nightly (.github/workflows/nightly.yml, `npm run test:heavy`). `npm test` runs both, as
// each milestone's full check does.
//
// The timeouts only catch a hung test. Under load (four workers, or other batches on the machine) a
// case can take several times its usual time: the drawn rivers at 96² took 17 s alone and over 120 s
// beside three other workers (investigation/audit/AUDIT.md, "Baseline").
const HEAVY = [
  "tests/contract/properties.test.ts", // random edits, undo and redo on every size preset (E1)
  "tests/contract/rivers.test.ts", // rivers drawn at random on three sizes
  "tests/contract/reshape.test.ts", // set pieces, lakes and landforms beside every kind of object
  "tests/contract/settings.test.ts", // each setting's batch experiment (M6)
  "tests/contract/firstLand256.test.ts", // the first land shown is the map at 256² (D348)
  "tests/contract/forceEverywhere.heavy.test.ts", // every force at many places on every theme (D356)
  "tests/contract/editSequences.heavy.test.ts", // sequences of edits on every theme add no object (D368 (10))
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
