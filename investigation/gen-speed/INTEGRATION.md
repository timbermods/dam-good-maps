# Adoption

Apply `adoption.patch` from the repository root. The patch changes only six shared files: `gen/generate.ts`, `gen/settler.ts`, `gen/intentions.ts`, `gen/resources.ts`, `sim/drought.ts` and `validate/playability.ts`, all under `src/core/`.
No theme shaping, Islands/Canyon/Highlands shaping, generator policy, random draws, water arithmetic, Rust code or pins change. The generator version must not change for this exact reuse.

## Base and publishing

The requested clone is `C:\Users\Kyler\Documents\ChatGPT\dam-good-maps-gen-speed`, created from dev at `38d4ee6b9ef2e0c516a244be42dbfd0f5e576e7e`, now on `investigation/gen-speed-2`, with `npm ci` completed. No other checkout was accessed.
The old remote branch tip is `dc68651cc763fb973b2dddc8f6e638d523d87f8b`. It is preserved; the user authorized publication of this round on the new `investigation/gen-speed-2` branch, with one PR into `dev`. No GitHub PR was read or reviewed.

The earlier branch's report and implementation were not read. This round reuses APIs already present on the pinned dev base: guarded incremental builds and planned-water start preparation. New work is the six-file shared-stage reuse patch described below, including the bounded settled-water start cache, plus this round's profiles and exactness evidence.

D471's `fix/every-setting-makes-a-map` is absent from this base. The extreme case returns a failed result after 27 attempts, not the stated successful 37-attempt map. Port onto the base containing D471 and compare against that same base before adoption; do not change generation behavior or re-pin to make this patch pass. The missing remainder of the prompt is interpreted as keeping every existing pin unchanged.

## Why bytes stay the same

1. Generation uses the existing incremental `rebuild` path between builds within one attempt. Its guards compare field snapshots, feature keys, slope reservations, water model, soil barrier and resource inputs. Generation discards the editor's dirty-region report. Builds still happen in the original order; no attempt or check is skipped. Speculative candidates may serve as the previous build because reuse is conditional on their actual input data.
2. `prepareDrought` snapshots spill levels, pools and evaporation once. Each duration receives a fresh array, with the original evaporation accumulation, division, multiplication and subtraction order. Checks reuse the same duration's result for water, plants and storage; those readers do not mutate it.
3. Pump shores are computed lazily once per start preparation. Candidate slopes, walks, scores, filters and RNG calls remain in the same order. The original same-level and cross-level shore rules remain distinct.
4. Finished intention checks read one unchanged context. Resource growers share a fully overwritten allowed mask; they return only tile lists and retain no mask reference. The floor-wood grower keeps its own mask.
5. The additional cache retains only the most recent settled-water preparation within an attempt. It compares heights, hydrology's water mask, depth, contamination, moisture, lake/fall/river data and drawn intentions. Floating inputs include a signed-zero comparison; NaNs force a miss. It prepares against owned snapshots, preventing mutable input arrays from changing lazy tables. Avoid masks, salt, weights, nearby targets and the RNG remain per pick. The existing planned-water cache keeps its original live-input semantics.

No doomed-attempt short circuit is proposed: its diagnostic state and failure reason affect retries. Sharing the build's soil with validation was also left out: the build passes saturation while the checks currently derive it, and interchangeability is not established here.

## Verification

The first overlay passed 111 existing tests in six files: water-speedups, soilGame, start, resources, features and firstLand. Water and soil pins were unchanged. The final cache passed 54 tests in the four affected contract files, the overlay typecheck and the untimed exact check below; status is recorded in `verification.json`.
`exact.mjs` compares every requested 256² case against untouched dev: .timber bytes; unrounded terrain, water and soil arrays; water model/settle state; entities; file; features; checks/analysis; attempts/failures; intentions/outcomes; and snapshots of every shown land. It also compares drought fixtures at 0/3/9/25 days and checks input snapshot/output ownership. JsonFloat data are compared across bundles without requiring their constructor identities to match.
`results.json` records the first reuse group's one before/after reading for each case. `settler-reading.json` records the second cache's one before/after extreme reading including process CPU usage, with `--v8-pool-size=1` on both sides. The first group's before used the default V8 helper pool and its after used one helper; load was uncontrolled. All those after walls were slower. Neither that group nor this investigation establishes a whole-patch wall speedup or a performance gate. Only the second change's observed CPU reduction is claimed, on a failing map.

## Reproduce

From the isolated clone, use one generation at a time and one test worker. Set `GOMAXPROCS=1` and `UV_THREADPOOL_SIZE=1`. No browser, quiet window or Timberborn probe is involved.

```powershell
node investigation/gen-speed/make-overlay.mjs
node investigation/gen-speed/build.mjs baseline-profile --profile
node investigation/gen-speed/run.mjs baseline-profile profile
node investigation/gen-speed/build.mjs baseline
node investigation/gen-speed/build.mjs candidate --overlay
node investigation/gen-speed/run.mjs baseline before
node --v8-pool-size=1 investigation/gen-speed/run.mjs candidate after
node --v8-pool-size=1 investigation/gen-speed/run.mjs candidate reuse-before --case=extreme
node investigation/gen-speed/reuse-start.mjs
node investigation/gen-speed/build.mjs candidate-reuse --overlay
node --v8-pool-size=1 investigation/gen-speed/run.mjs candidate-reuse reuse-after --case=extreme
node investigation/gen-speed/build.mjs baseline-counts --counts
node investigation/gen-speed/build.mjs candidate-counts --overlay --counts
node --v8-pool-size=1 investigation/gen-speed/exact.mjs
node --v8-pool-size=1 investigation/gen-speed/typecheck.mjs
node --v8-pool-size=1 node_modules/vitest/vitest.mjs run --config investigation/gen-speed/vitest.config.ts --maxWorkers=1
node investigation/gen-speed/summarize.mjs
git apply --check investigation/gen-speed/adoption.patch
git diff --check
```

These commands regenerate the whole investigation; do not run them again simply to improve timing figures. Profiles and paired readings take a few minutes, longer under shared load; checks also take several minutes. Bundles, CPU profiles, JSON totals and generated maps live exclusively in gitignored `local/` (D195). Only concise evidence, harnesses, source overlays and the adoption patch are committed. After porting onto a changed product base, refresh the overlay from that base and rerun correctness checks; the included overlay files are snapshots, not replacements for unrelated later edits.
