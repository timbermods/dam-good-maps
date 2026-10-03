# Adoption into M9b

Source: `feature/m9b` at `e292cefe30469033a922650f0455f87297c051d5`. The investigation PR
is packaged against `dev` so it carries no M9b product changes. Apply only `adoption.patch`
on M9b, after checking its current tip; no product files were edited by this investigation.

```sh
git apply --check --whitespace=error-all investigation/small-starts/adoption.patch
git apply --whitespace=error-all investigation/small-starts/adoption.patch
```

The patch contains the shared mine distance and keep-off mask, the display boundary, module
docs and two test files. If M9b has moved, port these hunks rather than replacing whole files.

`LandStage.shown` distinguishes a privately prepared field from displayed land. Pads, hollows,
cached water and failed-start exclusions survive private retries. `onLand` fires after the actual
settled start reaches the required placed mine pair, using `minesReached`/`colonyReach`. An
exhausted private field may redraw; after display, M9b's existing fixed-land retry rules apply.
The callback still fires once. All mine bands, pad limits, validators and item 47 remain unchanged.

Display now waits for the already-required settle and mine placement. An ordinary passing map
takes no additional settle. Do not replace this proof with an early geometric rejection: that
trial rejected usable land and introduced a Canyon 128² seed 9 failure.
`timings.firstLook` now measures that proof/display boundary; `firstWater` still measures the
settled start's water and can precede it. The worker emits the same land event with the same payload.

Run the new tests with `minePads`, `minePair`, `lakeIsland` and `firstLand`; rerun M9b's full
840-map measure and byte-identity comparison against this investigation. Run the full source
typecheck and the required milestone suites. Handle M9b's already-known moved-map pins under
D148/D308; update its generator version, progress log, PLAN/STATUS and contact sheet together
with adoption. This PR does not adopt the held Canyon, Highlands or Lake Basin prototypes.

Regenerate the investigation from the repo root (fresh snapshot names are required):

```sh
node investigation/small-starts/prepare.mjs --init
npm ci --prefix investigation/small-starts/local/deps --ignore-scripts --no-audit --no-fund
node investigation/small-starts/prepare.mjs before
node investigation/small-starts/prepare.mjs final --patch
node investigation/small-starts/instrument.mjs investigation/small-starts/local/before
node investigation/small-starts/instrument.mjs investigation/small-starts/local/final
node investigation/small-starts/check.mjs investigation/small-starts/local/final
node investigation/small-starts/batch.mjs investigation/small-starts/local/before investigation/small-starts/local/measures/before
node investigation/small-starts/batch.mjs investigation/small-starts/local/final investigation/small-starts/local/measures/final
node investigation/small-starts/compare.mjs
node investigation/small-starts/report.mjs
```

The two batches may run together: six workers each, twelve total. They are Node-only and never
launch Timberborn. Raw rows, dependencies and snapshots stay under ignored `local/`; only the
small summary is committed. `compare.mjs` verifies all 840 keys per run, the baseline against
M9b's committed rows, zero blocking failures, one display and unchanged displayed terrain.
The before run used observation-only diagnostics to test an early room gate; its map readings
match the committed baseline exactly. Its timings are not a clean performance baseline, so no
before/after speed claim is made. Regeneration omits that discarded gate and compares map results.
