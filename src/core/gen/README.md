# gen

The generator: settings in, a map out. `generate` draws a genome, grows the land and its rivers (`land/`), reads the features back out of them, picks the start, plants resources and objects, then builds, validates and writes the file.

**Rules**
- Deterministic (PLAN §2.1): the same seed and settings give the same file everywhere. Random numbers come from named streams (`math/`).
- A change that alters a default map needs one deliberate re-pin of the tests and golden fixtures (D308) and a new `GENERATOR_VERSION` (`spec/mapspec.ts`).
- Themes lean the generator; they are not templates (D208).
- A candidate that fails a check is retried, up to `MAX_ATTEMPTS`; the first that passes is the map, never swapped (D329). `versions.ts` looks for a sibling that meets all three outcomes, in the background.
- The first land shown is the map (D348): a land passes the land stage (`planLandStage`: its rivers planned, its courses checked) and every check the land alone can judge (a start on its planned water, no ground above 16 unless tall, no ruler-straight channel or dam wall on its planned water), then `onLand` fires, once per map (editable land), and it is never replaced. After its water settles: no start on the settled water takes the plan's start or level dry ground (`dryStart`), a start without water gets a spring by it (`springByStart`, D330's fix; `info.fixes` says which), and what fails is planned again on the same land, keeping off the starts and hollows that failed. Water that doesn't settle has its basin's way out worn wider (`water/outletWear.ts`, D350 (b)); only when that fails too do the attempts stop (`stuck`).
- Thin sheets (D333, the pooled probe): a lake's shelf at its spill level is cut a level lower at the land stage (`lowerShelves`, not round a sea), and a tributary runs a level under a floor a bigger river cleared (`land/hydro.ts`), so no flat stands level with the water beside it.
- Sources: None (D330): `withoutSources` makes the map as usual, then removes its sources and their water (the field's `dry`).
- Real places are never generator input (D108): nothing here reads `places/`.

**Start from**
- `generate.ts` `generate`.
- `settler.ts` `pickStart` (the start rules); `intentions.ts` (checks on the finished map); `resources.ts` `planResources`; `extras.ts` `planExtras` (mine sites, relics, thorns); `weir.ts` `planWeir`.
- `layout.ts` (settings to targets); `calibrated.ts` (official-map targets, mirrors `prototype/calibrated.py`); `pack.ts` `toTimberFile` (the one path to file bytes).
- `riverValley.ts` and `valley.ts` are remnants kept for `PlanConflict` and `startWalkable`.

**Tests**: `tests/contract/` (calibrated, parity, regenerate, share, resources, badwater, outflows, start) and `tests/e2e/determinism.spec.ts`. Batches: `tools/batch.ts`, `tools/batches.ts`. Run `npx vitest run tests/contract/calibrated.test.ts`.
