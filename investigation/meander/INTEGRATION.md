# Adopting Meander

Based on feature/forces `9e14f1895c386489928dda78f888fc79772ceef6`. The PR into dev carries
its unmerged history. Take only this investigation's commit(s); no product files changed.

1. Adopt `meander.ts` into `src/core/forces/meander.ts`. Keep the existing imports for maps,
   paths, seeded numbers, Floor, footprints, rock, water models and Carve's `findNeck`.
   The new part is existing-river tracing, curvature migration with downstream lag, and the finite
   sediment budget. Every age increment conserves whole blocks; deposited bars seal a real old bend.
   Do not replace this with a new Carve or add sources.

2. Extend `Verb/VERBS`, `forces/op.ts`, `doc/ops.ts` and `doc/ops.schema.json` with Meander.
   Keep Power 0–100, Size null or 4–64, Bends Auto/Tight/Broad, Floor, unsigned seed and the
   shared recorded freehand path. Store resolved Bends and literal changed heights/rock/entities
   through the existing result builders. Store oxbows as the existing `RetainedWater` data.
   Replay assigns the result, never reruns the river's evolution. The demo's entity/water snapshot
   in `Operation` is its standalone adapter; use the product's existing format and history owner.

3. Wrap the yielding planner as a `StagedRun` in `forces/runs.ts`. Feed each conserved age increment
   to the existing worker planning budget and arrival playback. Preserve working areas, layers,
   caves and the final integrity pass. Sources retain identity and strength and ride their tile;
   cut-away objects disappear, deposited objects ride upright. Keep water unchanged during land
   playback, then continue the shared solver from the conserved transported water. Retained pools
   use the shared sealed-basin stopping rule and canonical prefill; no hidden sources.

4. Use `carryStartOps` / the session's carry hook, including the post-water check, in the same
   transaction. Replace the small demo adapter with those existing placement checks. Preserve
   gesture IDs and stale-response cancellation: undo during planning, playback or water takes
   everything back, and an old reply never lands. Try another replaces that transaction.

5. Add Meander to `editor/TopBar.tsx`'s forces row and `ForceRows.tsx`: Power, Size,
   Try another, and `MoreButton/MoreRow/AutoDetail` for Bends; `ForceFloor` stays shared.
   Use `FreehandPath` and its six-pixel click/drag distinction. Click Size means along-river reach;
   drag extent comes from the stroke, whose band follows the current water surface at river width.
   Show no cursor circle. Use existing F/braces handling and persisted More, pins, Floor and Watch.

6. Pace playback with the existing `showMs` Fast budget / Watch factor; extend the cue/sound
   dispatch with the existing CC0 splash and earth recordings. Never move the camera.
   This requested demo finishes playback on Esc in either speed. Reconcile that explicitly with
   the current milestone's Fast-Esc cancellation rule; undo always restores the whole gesture.

Port the conservation, replay, arrival and water checks into contract tests. Extend river selection
to tributaries and contaminated stems before general adoption; the demo traces the longest clean
source-to-edge stem. Run the product's required checks and update EDITOR_PLAN.md in the adoption PR.
