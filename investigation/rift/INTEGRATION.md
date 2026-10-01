# Adopting Rift

This branch starts at feature/forces **9e14f189**. Its PR into dev includes that branch's
unmerged history. Take only the Rift investigation commit(s); adopt the algorithm in the
milestone session. No product files are changed here.

1. Move the headless planning algorithm from `rift.ts` into `src/core/forces/rift.ts`.
   Keep its imports of `quake.Fault`, `path.resamplePath`, `force.fullMap/snapshotMap`,
   `floor.holdAtFloor/forceFloor`, `rock.transportRock` and shared seeded numbers.
   Auto walls read fixed rock beds and volcanic rock; independent coherent bank offsets,
   ledges, block tilts and short secondary throws give the dropped strip its character.

2. Add `rift` to `Verb/VERBS` and settings/result validation in `forces/op.ts`,
   `doc/ops.ts` and `doc/ops.schema.json`. Keep Power 0–100, Size null or 4–64,
   Walls Auto/Sheer/Stepped, Floor 1–ceiling and the unsigned seed. Use the shared
   `pathRecord` and `forceParamsOf/literalOf`: the product stores sorted literal heights
   and rock, never reruns nature when replaying a project.
   The demo's full entity snapshot in `Operation` is just its standalone undo/replay adapter;
   do not add that duplicate snapshot to the product format.

3. Wrap the yielding planner and `reveal` as a `StagedRun` in `forces/runs.ts`.
   Use its planning budget, `respectKeep` for working areas/layers/caves, finalization hook,
   vertical object transport and warm water model. Keep objects upright; do not use Quake's
   tree-toppling path. The start uses the existing `carryStartOps` / session `carryStart`
   transaction. Replace the demo's nearest-level adapter with that existing hook.
   Sources keep their identity/strength and ride their ground; Rift adds none.

4. Extend `worker/session.ts` requests, nature dispatch, staged construction and literal keep.
   Preserve gesture IDs and stale-response cancellation. Final terrain and source positions
   arrive only behind the rupture; water stays unchanged until final land, then continues via
   the existing warm preview. Do not inject lake depth or change source strength to fill it.
   The demo's fixed 768-tick water continuation is for repeatable evidence, not a new canonical settle.

5. Add Rift to `editor/TopBar.tsx`'s forces row and `ForceRows.tsx`.
   Use Power, Size, Try another, `MoreButton/MoreRow/AutoDetail`, and `ForceFloor`.
   Store Walls pins and More alongside the other force preferences in `Editor.tsx`;
   keep Floor and Watch shared. Auto's mixed wall result can report hard-rock ledges locally;
   Sheer/Stepped pin the whole Rift. Floor uses Default, never Auto.
   Wire the existing `FreehandPath`; display a terrain-following band at the opening width,
   without a cursor circle. Drawn length comes entirely from the stroke; click length from Size.
   Feed F and braces into existing size/power handling.

6. Extend the shared driver/cue and sound dispatch for Rift. Keep `showMs`'s Fast budget
   and Watch factor; add a crack/drop cue and heavy settle using the existing CC0 bank.
   Esc while drawing cancels; this demo's requested Esc-during-playback behavior finishes
   the plan in both speeds. Align that choice deliberately with the milestone's current
   cancellation rules (feature/forces currently reverts Fast on Esc). Undo always drops
   the whole transaction. No camera motion.

Port the random sweep and browser controls checks as contract tests, including literal replay,
arrival, source riding, start relocation and byte-exact undo. Keep the level-zero river regression:
Floor 1 cannot capture a river whose surface is below 1. This is a physical limit, not a refusal.
Run the product's required checks and update EDITOR_PLAN.md in the adoption PR.
