# gen

The generator: settings in, a map out. `generate` draws a genome, grows the land and its rivers (`land/`), reads the features back out of them, picks the start, plants resources and objects, then builds, validates and writes the file.

**Rules**
- Deterministic (PLAN §2.1): the same seed and settings give the same file everywhere. Random numbers come from named streams (`math/`).
- A change that alters a default map needs one deliberate re-pin of the tests and golden fixtures (D308) and a new `GENERATOR_VERSION` (`spec/mapspec.ts`).
- Themes lean the generator; they are not templates (D208).
- A candidate that fails a check is retried, up to `MAX_ATTEMPTS`.
- Real places are never generator input (D108): nothing here reads `places/`.

**Start from**
- `generate.ts` `generate`.
- `settler.ts` `pickStart` (the start rules); `intentions.ts` (checks on the finished map); `resources.ts` `planResources`; `extras.ts` `planExtras` (mine sites, relics, thorns); `weir.ts` `planWeir`.
- `layout.ts` (settings to targets); `calibrated.ts` (official-map targets, mirrors `prototype/calibrated.py`); `pack.ts` `toTimberFile` (the one path to file bytes).
- `riverValley.ts` and `valley.ts` are remnants kept for `PlanConflict` and `startWalkable`.

**Tests**: `tests/contract/` (calibrated, parity, share, resources, badwater, outflows, start) and `tests/e2e/determinism.spec.ts`. Batches: `tools/batch.ts`, `tools/batches.ts`. Run `npx vitest run tests/contract/calibrated.test.ts`.
