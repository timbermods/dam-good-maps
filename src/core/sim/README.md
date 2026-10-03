# sim

The game's water and soil rules on a height field: the water model, the exact water simulation, the canonical settle, soil moisture and contamination, drought, and hazard weather.

**Rules**
- **Water must match the game.** `water.ts` is an exact port of `prototype/watersim.py`, which reproduced the game's own save to 0.001 depth. Keep every operation in the same order; the two agree bit for bit on the golden fixtures.
- The water written into a file always comes from the canonical settle (`prefill.ts`), never from the editor's warm-started preview (`preview.ts`, PLAN §19.7).
- Water never appears from nowhere: what the pre-fill puts where no source's water goes is taken away once the water has settled (`prefill.ts` `canonicalRun`), and the warm start keeps the pre-fill's water only where something reaches it (D385).
- Every emitter and blocker is handled through its footprint (`model.ts`, PLAN §11.5).
- Changing a rule moves maps: re-pin the golden fixtures (D308).

**Start from**: `model.ts` `waterModel`; `prefill.ts` `canonicalSettle`; `water.ts` (the simulation); `moisture.ts`, `contamination.ts`; `drought.ts` `droughtStorage`; `preview.ts` (editor previews); `weather.ts` (Drought and Badtide days); `fed.ts` (which water a source, a stored lake or kept water reaches: the drained tiles of Remove unfed water, and no water from nowhere, D385); `fill.ts` (a Fill's hollow and how long it lasts).

**Tests**: `tests/unit/water.test.ts` (against `tests/golden/water.json.gz`, made by `tools/export-fixtures.py`), `water-speedups`, `weather`, `sealedBasins`, `startWater`, `fedFill`; `tests/contract/live-water.test.ts`, `mechanics`, `outflows`, `waterFromNowhere`. Run `npx vitest run tests/unit/water.test.ts`.
