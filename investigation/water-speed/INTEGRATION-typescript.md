# Integration: exact water speedup

The proposal is [`water.ts`](water.ts), a standalone replacement for `src/core/sim/water.ts`.
It keeps every export, constructor argument, option, method, public array and return shape.
The application is untouched. The reference is **feature/m9b at
`b01f113c1d97f90de042b7cbe74d052c28f0342c`**. See [REPORT.md](REPORT.md) for measurements and checks.

## Adopt in the milestone session

1. Take only this investigation's commits. Its PR into `dev` carries the M9b ancestry until M9b lands.
2. Compare the milestone's current `src/core/sim/water.ts` with the pinned reference. If its rules have
   changed, port the cache mechanisms onto those rules and regenerate the evidence; do not replace newer rules.
3. Copy `investigation/water-speed/water.ts` to `src/core/sim/water.ts`, retaining the milestone's provenance comments.
   There are no supporting runtime files, dependencies, asynchronous initialization, workers or browser settings.
4. Run typecheck, the existing water/game/pinned-byte/sealed-basin tests, live-water and outflow contracts,
   the Python oracle, and this investigation's matrix on the milestone's revision. Update the living simulation
   documentation in that adoption PR. The investigation's baseline failures are listed in REPORT.md.

The simulator contract stays the existing one: fixed positive integer dimensions; valid tile indices;
constructor source-cell membership; and water/momentum changed through the simulation or its existing warm-start
interface. Source strength, contamination, seep limits, floor and dam values are read as before. These caches
do not make arbitrary replacement of public depth arrays or mutation of private wet lists a supported operation.

## Why the caches preserve the result

- **Active membership.** A tile is active exactly when it is wet, has a wet four-neighbour, or is a constructor
  source cell. `activeRefs` counts these reasons, at most six. A wet/dry transition changes the references of
  that tile and its four neighbours by one. Transitions are applied after scanning the old active list, so new
  memberships cannot change the current substep's scan. Outside this set, the reference itself does no work:
  the tile is dry, receives no water, and has no source. Previously wet flow slots are cleared as before.
- **Wet-neighbour counts.** `wn[i] = 1 +` the number of positive-depth eight-neighbours. Initialize once; each
  positivity transition changes the eight neighbours' counts by integer ±1. Integers in this range are exact,
  so update order cannot affect a count. Counts on dry tiles may differ from the reference's stale private
  scratch values; only wet neighbours' counts enter saturation. Public saturation bytes agree.
- **Evaporation.** Saturation reads a tile's count and its four neighbours' counts/positivity. A positivity
  transition can therefore affect a modifier only within distance two. Invalidate a conservative 5×5 square,
  coalescing duplicates. Consume the dirty set at the original tick boundary, retaining the same modifier for
  both substeps. Wet tiles receive the original polynomial evaluated in its original order; dry tiles get 1.
  The eight possible polynomial values are cached as binary64 values, without approximation.
- **Flow clearing and geometry.** Every currently wet tile overwrites all four flow slots, including blocked
  zeros, before any inflow is read. Clear only previously wet tiles that are now dry. Cached indices reproduce
  the original four directions and −1 edge sentinel. No physical value is cached.
- **Dry/no-inflow shortcut.** A dry active tile's flow slots are zero. With four zero inflows, the original
  formulas produce positive-zero depth, concentration and momentum; `Dold` receives the original depth zero,
  including its sign. Assign exactly those values. Source emission still follows in the original order.
- **Index order.** Swap-delete membership and sorting the private active list every 64 ticks change iteration
  order. Flow pass 1 reads the complete start-of-substep depth and momentum, writing only its tile's `f` slots.
  Pass 2 reads complete `f` and the old concentration, writing only its tile's depth, momentum, old depth and
  `Cnew`. Concentration is committed only after that pass. Thus tile order introduces no reduction or shared
  accumulation. Every per-tile four-term sum, emitter/cell order, volume reduction and settle check remains
  in its original order.

These are dependency arguments, supplemented by byte checks; the matrix is not a claim to exhaustively test
every conceivable malformed JavaScript object. No wet tile's physical evolution is frozen. No tolerance,
maximum day count, check period, tick/substep count or starting water is changed. Extra persistent storage is
23 bytes per tile plus 72 bytes: about **1.44 MiB at 256²**.

## Regenerate

Run from `investigation/water-speed/` in the pinned checkout. Node 24.13.0, TypeScript 5.9.3 and esbuild 0.28.2
were used. Python needs numpy. All bulk data, compiled bundles, CPU profiles and browser results go in ignored
`local/`. The 19 official maps and game saves are local read-only references and are never committed here.

Reuse an existing dependency installation by setting `DGM_DEPS` to its repository directory. Alternatively,
`node prepare-deps.mjs` writes a dependency manifest inside `local/deps/`, after which install there:

```powershell
node prepare-deps.mjs
npm --prefix local/deps install
$env:DGM_DEPS = (Resolve-Path local/deps).Path
$env:DGM_OFFICIAL = 'C:/path/to/investigation/raw/builtin'
$env:DGM_SAVES = 'C:/path/to/investigation/raw/saves'
$env:PYTHON = 'C:/path/to/python.exe'
$env:PYTHONDONTWRITEBYTECODE = '1'
node prototype.mjs
node build.mjs
node typecheck.mjs
node smoke.mjs
node samples.mjs
node profile.mjs
node verify.mjs --workers 4
node bench.mjs --all --workers 1 --reps 1
node bench.mjs --workers 1 --reps 5
node oracle.mjs --seeds 1-18 --sizes 128,256
node oracle.mjs --prefix oracle-sea --seeds 19-21 --sizes 128,256 --no-official
node pinned.mjs --workers 2
node bench.mjs --pinned --prefix timing-pinned --stages canonical --workers 1 --reps 1
node oracle-bind.mjs
$tailIds = node select-tail.mjs
node bench.mjs --ids $tailIds --prefix timing-tail --stages canonical --workers 1 --reps 5
$regressionIds = node select-regressions.mjs
node bench.mjs --ids $regressionIds --prefix timing-regressions --stages canonical --workers 1 --reps 5
```

Run the existing tests from the repository root, using the investigation's config and the Vitest executable
under `$env:DGM_DEPS/node_modules/vitest/vitest.mjs`. For the evidence filenames expected by `summarize.mjs`,
run the 13-file suite excluding `places-build-*` to `local/tests-final.json`, then those three gallery shards
to `local/tests-gallery.json`:

```powershell
node "$env:DGM_DEPS/node_modules/vitest/vitest.mjs" run --config investigation/water-speed/tests.config.mjs --exclude 'tests/contract/places-build-*.test.ts' --outputFile.json investigation/water-speed/local/tests-final.json
node "$env:DGM_DEPS/node_modules/vitest/vitest.mjs" run --config investigation/water-speed/tests.config.mjs tests/contract/places-build --outputFile.json investigation/water-speed/local/tests-gallery.json
$env:WATER_VARIANT = 'baseline'
node "$env:DGM_DEPS/node_modules/vitest/vitest.mjs" run --config investigation/water-speed/tests.config.mjs tests/contract/badwater.test.ts -t 'D213' --outputFile.json investigation/water-speed/local/tests-baseline.json
node "$env:DGM_DEPS/node_modules/vitest/vitest.mjs" run --config investigation/water-speed/tests.config.mjs tests/unit/water.test.ts -t "the game's own save" --outputFile.json investigation/water-speed/local/tests-save-baseline.json
Remove-Item Env:WATER_VARIANT
```

The config substitutes the candidate virtually, directs
caches/reports into `local/`, and can read the local saved-map reference through `DGM_SAVES`. It never edits tests.
`WATER_VARIANT=baseline` runs the untouched simulator as a failure control.

For Chrome, set `DGM_CHROME` to a Chrome executable (or install Playwright's Chromium into a local browser
cache) and run `node browser.mjs`. This uses a fresh headless browser and checks raw bytes within it, then
full-state hashes against Node on all fixtures and six river/lake/sea models.

Proof and timing runs resume from matching bundle fingerprints; they fail on a mismatch. Use a single timing
worker on a quiet machine for a wall-time replication. Keep the required Python and upstream failure checks
visible. `node summarize.mjs` creates the small committed evidence and short report only after the full matrix
and per-case timings are complete. Run `chart.py` with Python to regenerate the two small charts.

The first Python batch completed before the private-index sorting ablation was adopted. `oracle-bind.mjs`
requires each of its 35 tested exports to hash identically to the final candidate's complete baseline/fast
generation checks; the sea supplement was run on the final candidate. Together they cover 40 successful
exports and two identical baseline refusals, with no Python load, round-trip or verdict-parity failures.
Both oracle commands intentionally retain their nonzero exit for those generator refusals.
