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
  "tests/contract/everySetting.heavy.test.ts", // the settings panel's extremes each make a map (D471)
  "tests/contract/everySettingLarge.heavy.test.ts", // and over 128² (D471)
  "tests/contract/lakeLevel.heavy.test.ts", // lakes by number on a 192² generated map
  "tests/contract/collabClaims.heavy.test.ts", // every force's plan and gesture band against the claims' writes (D362)
  "tests/contract/collabSoak.heavy.test.ts", // collaborative editing: a few hundred mixed edits, checkpoints and a rejoin
  "tests/contract/collabUndoSoak.heavy.test.ts", // collaborative editing: a few hundred mixed edits with undo and redo asked at random
  "mcp/tests/long.heavy.test.ts", // a 256² map through the MCP server, past the client's time limit (D501)
  "tests/unit/waterSkirts.heavy.test.ts", // no window between two waters on generated maps at 256² (D154)
  "tests/contract/carveFallSweep.heavy.test.ts", // a fall from one stroke from every start near the reviewed ones (gaps 1, 2, 20)
  "tests/contract/islandsCleanSea.heavy.test.ts", // Islands' sea clean at 128² and 256², settled and played on (D498, #446)
  "tests/contract/premisePlan.heavy.test.ts", // the lake stair's plans on seeds 1 to 200 at three sizes (PREMISES §7 step 1)
  "tests/contract/premiseWater.heavy.test.ts", // stage 1's water settled on three plans and Four Lakes (PREMISES §7 step 2)
  "tests/contract/premiseGateWater.heavy.test.ts", // the wall with one gate's water settled on five plans (PREMISES §5.1)
  "tests/contract/premiseGateLand.heavy.test.ts", // the wall with one gate's maps built and checked on four seeds (PREMISES §5.1)
  "tests/contract/premiseStair256.heavy.test.ts", // the lake stair at 256² on five seeds and themes, none falling back (PREMISES §3.3)
];

export default defineConfig({
  test: {
    // Off CI, three workers at most (DGM_TEST_WORKERS overrides): several sessions' agents share the machine,
    // and a worker per core in each checkout used up its memory (2026-10-24). CI keeps vitest's default.
    maxWorkers: process.env.CI ? undefined : Number(process.env.DGM_TEST_WORKERS ?? 3),
    projects: [
      {
        extends: true,
        test: {
          name: "quick",
          include: ["tests/unit/**/*.test.ts", "tests/contract/**/*.test.ts", "mcp/tests/**/*.test.ts"],
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
