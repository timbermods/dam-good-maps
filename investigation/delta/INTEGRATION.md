# Delta adoption

Pinned base: `feature/m9b` **6c29b7e524eea5739d49b6f0df2eae3b0856f4bd**,
the remote tip fetched at the start. M9b advanced while this investigation ran.
Take only this investigation's commit, not its inherited M9b history. All committed paths
are under `investigation/delta/`; no product file was edited.

`adoption.patch` adds `src/core/land/delta.ts` and six integration points in `generate.ts`.
It is emitted from exactly the overlay the measurements execute; imports are relocated.
Check/apply on the pinned base, or port those small hunks to the current M9b generator:

```powershell
git apply --check investigation/delta/adoption.patch
git apply investigation/delta/adoption.patch
```

The land field represents soft alluvium: most downstream ground at level 4, higher noisy
shoulders upstream. A source-driven feeder descends from that catchment, splits around two
unequal islands, rejoins, then branches to three separated edge mouths. All branches share
the feeder's water and bed datum. The feeder is capped at flow 9 before the existing
flow multiplier: greater flow flooded the one-level banks and missed the six-day settle.
Width/bend phases are fitted against the existing
straightness margin, at most twelve seed-determined trials before any land is shown.
There is no elapsed-time decision, extra branch emitter, or manually painted water.

The prototype uses the normal land cleanup, slopes, mine pads, grouped sources, six-day
canonical settle, start/resource planners, validation, export and outcomes. Thresholds are
unchanged. Initial badwater is confined to the outer catchment shoulders and included in
the first land callback. The optional settled-start distance preference no longer relocates
Delta hollows; blocking containment/source checks still run. M9b's source-in-flow repair can
still change a hollow after that callback; see the report's explicit terrain-change count.

This dispatch applies only to explicit Delta generation without a regeneration context.
Other themes and constrained regeneration retain their existing path. Any and River Valley
96² seed 2 exports matched before/after SHA-256 hashes. Determinism and saved-field rebuild
are checked byte for byte; this work did not launch Timberborn.

Before production adoption, integrate the chosen settings into the alluvial process rather
than claiming full setting coverage: arbitrary river counts, lakes, relief/verticality,
flow extremes, non-square sizes, protected regeneration, and the 48² rules need their own
checks. Broaden the network's topology beyond two loops, give arms proper read-back features,
and resolve the remaining post-show hollow repairs. Preserve every blocking check. Bump the
generator version and update its living documents on M9b; rerun its required game-parity probe
through the existing authorization workflow. This is an adoption prototype, not a release gate.

## Reproduce

Run from the pinned checkout root. Only Node is required; dependencies and generated maps
stay in the ignored `local/` directory:

```powershell
npm install --prefix investigation/delta/local --no-audit --no-fund typescript@5.9.3 fflate@0.8.3 @types/node@24
node investigation/delta/local/node_modules/typescript/bin/tsc -p investigation/delta/tsconfig.json
node investigation/delta/run.cjs geometry.ts
node investigation/delta/run.cjs check.ts
node investigation/delta/batch.cjs before
node investigation/delta/batch.cjs after 96,128,256 after-final
node investigation/delta/run.cjs summarize.ts
foreach ($size in 96,128,256) {
  node investigation/delta/run.cjs sheets.ts before $size
  node investigation/delta/run.cjs sheets.ts after-final $size
}
node investigation/delta/emit-patch.cjs
```

`run.cjs` uses the probe runner's in-process TypeScript approach. The unchanged
`investigation/m9b/measures.ts --one delta:1,...,delta:20` supplies the numbers.
Both batches use one worker, defaults from `makeSpec`, and the normal land screen.
Captured terrain, water, entities, checks and `.timber` files remain under `local/before/`
and `local/after-final/`. Sheets show settled first maps, north up, numbered seeds 1–20;
the yellow cross marks the start and red marks badwater. `results.csv` keeps small per-map
numbers; `results.json` aggregates them. The supplementary arm audit samples all four
paths against the source-connected clean wet system; it never changes M9b's outcomes.
