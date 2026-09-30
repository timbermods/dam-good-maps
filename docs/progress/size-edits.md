# Edits never replay onto new land (#86, D336)

2026-09-29, branch `fix/size-edits`.

**The bug.** Kyler's map (seed 2828713082, Any, Normal) was made at 128², the whole map set to one
level, then generated again at 256² with "keeping my edits". The edit's tiles, recorded on the 128²
map, replayed onto the 256² map's first 128 rows and columns: a flat, bare corner. `pair-map.timber`
matches a fresh 256² generation everywhere else; the generator never leaves a corner flat. Undo then
brought the 128² map back into a view built for 256² (the worker sent its heights without a size).

**The fix, then the decision.** The first fix kept edits only at the same size. Kyler then decided
D336: edits never replay onto new land.
- Every Generate makes a new map. An edited map stays open and saved, and **Back to editing**
  returns to it.
- Removed from the code:
  - the `specPatch` operation, `MapSession.regenerate` and `rebuildWithCurrentGenerator`;
  - the history's generation entries;
  - the worker's `regenerate`, and the page's "Generate, keeping my edits" and "Discard edits".
- An older map's note no longer offers a rebuild. The retired texts are in `tools/retired-terms.json`.
- Undo can no longer cross from one map to another, so the view fix for a size change went with it.

**Tests changed because the decision changed** (CLAUDE.md):
- `regenerate.test.ts` is removed. Its keep-out test exercised only the removed regeneration.
- `editor.test.ts`'s journey and `editor.spec.ts` now generate a new map and return to the edited
  one.
- `brush.test.ts` checks a stroke's replay onto its own land, through the project file.
- `document.test.ts` checks that an older map stays as saved, with no rebuild.
- `ops.test.ts` checks that a settings change is refused as an operation.
- `live-water.test.ts` loses its keep-my-edits case.
- New: `tests/e2e/generate-new-map.spec.ts`.

**Left as it is.** The generator still accepts planning constraints (`GenerateOptions.context`,
`MapSpec.constraints`). Nothing in the editor passes them now. The spec and share links carry the
field; removing it touches the generator.
