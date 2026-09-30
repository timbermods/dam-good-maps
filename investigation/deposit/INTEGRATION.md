# Adopting Deposit

Base: feature/forces **9e14f189**, its latest commit when this investigation started.
The PR into dev carries that branch's unmerged history. Take only the commit(s) changing
`investigation/deposit/`; this demo changes no product files.

1. Move `planDeposit` into `src/core/forces/deposit.ts`. Keep the imports of shared map snapshots,
   seeded numbers, path resampling, Floor, footprints, rock trimming, drainage prefill and `MinHeap`.
   A click scores downhill sectors; a drag supplies direction and reach. Low ground bends the wet
   branches, while original high ground confines the fan. The conserved integer sediment budget
   cuts a contiguous upstream corridor, at most two levels, and spends only what can be deposited.
   Preserve the wet inlet and a narrow **forward** outlet thread; without it a level-zero Canyon
   river can escape into another catchment, leaving the whole fan dry. Match channels to its low
   native bed; Floor 1 cannot cut a new level-zero bed through its banks.

2. Add `deposit` to `Verb/VERBS`, settings and validation in `forces/op.ts`, `doc/ops.ts` and
   `doc/ops.schema.json`. Keep Power 0–100, Size null or 4–64, Channels Auto/Few/Many, Floor and seed.
   Use `pathRecord`, `forceParamsOf` and `literalOf`: sorted literal heights, trimmed rock and
   removed entities replay without rerunning nature. The demo's complete entity snapshot in
   `Operation` is a standalone undo adapter; keep the existing product operation format instead.
   Sediment is soft alluvium; volcanic bits removed upstream do not become raised solid lava beds.

3. Wrap the yielding planner and `reveal` in the existing `StagedRun` machinery in `forces/runs.ts`.
   Keep its planning budget, `respectKeep`, layer/cave/working-area protection, finalization and
   cancellation tokens. Rebalance **after** protected cuts and deposits are removed: independently
   restoring protected tiles would destroy material conservation. Reveal each lobe only at its
   arrival; earlier drainage threads fill before the final threads open. Intermediate channel
   poses are a presentation, not a second stored result. Objects follow the displayed ground.
   Keep sources and their strength; bury shrubs at +2, trees at +3, other objects at +4, never the
   source or start. Adopt the product's object integrity pass for multi-tile footprints.

4. Use `carryStartOps` / session `carryStart` in the existing force transaction. The demo's small
   nearest-level adapter checks present water plus shared drainage prefill with a shallow flood
   margin; checking only old water left a start wet after settlement. Use the product's existing
   placement rules and water continuation when adopting it, rather than copying that adapter.
   Continue through the existing warm `PreviewJob` after final land. No injected water, new
   emitters, changed strength, or fixed tick count called settled. Keep its actual convergence
   status; reaching the preview cap is reported as still moving. Four of 576 random gestures
   required longer: this demo continues with shared `SettleRun`, the identical tolerance and
   sealed-basin rule, for up to twelve further days. They converge by 5,376 ticks. Decide in
   the milestone whether to extend the shared preview budget; never mark its cap as settled.

5. Extend worker requests, nature dispatch, staged construction and literal keep in `worker/session.ts`.
   Preserve gesture identity and stale-response cancellation. Add Deposit to `TopBar.tsx`'s forces
   row and a row in `ForceRows.tsx`: Power, Size, Try another, `MoreButton/MoreRow/AutoDetail` for
   Channels, and shared `ForceFloor`. Auto picks three or four drainage lines according to
   breadth; pins choose two or five. Keep More preferences locally, Floor and Watch shared.
   Reuse `FreehandPath`, the terrain-following band, F size handling and brace Power handling.

6. Add its growth cue and existing CC0 earth recordings to the shared effects/sound dispatch.
   Use `showMs`, Fast's two-second budget and `WATCH_FACTOR`. No camera motion. Esc while drawing
   cancels; this requested demo skips playback to the end in **both** speeds. Align that choice
   explicitly when adopting: feature/forces currently reverts Fast on Esc. Undo drops the whole
   transaction at any moment. Use the product's existing Try another / `replaces` behavior.

Port the sweep and browser checks, especially balance after Floor/protection, literal replay,
arrival, burial, source strength, valid start after water, byte-exact undo and separated wet branches
past their shared feeder. Use the product renderer and canonical export settle for adoption;
this standalone preview does not claim Timberborn export parity. Update EDITOR_PLAN.md there.
