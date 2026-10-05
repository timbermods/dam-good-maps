# Shaping and evidence

The original planner spends a sediment budget by filling a noise-ranked prefix of whole columns. A partially funded cone can therefore leave tall columns among untouched neighbours; donor cuts can expose those columns further. The first investigation revision fixed the numerical symptoms but went too far: it refused draws below eight tiles, removed the existing small-fan fallback, and kept only the largest connected set of receiving offers. That discarded whole lobes and cut the fan's volume. The revised source restores the original receiving, cone, lobes, fallback targets, donor rules and budget, and changes how the funded shape stays connected and supported.

Start with the original funded cone and the beds of the donors actually cut. Recover sediment from columns standing three or more levels over all neighbours. Starting on the main body, join its other lobes over permitted receiving cells, preferring original cone sites. Connecting tiles are paid for by spreading tall columns or peeling an edge whose removal preserves connectivity and support. Redistribute recovered sediment near the cone; the target budget stays fixed. Keep and area depth, ceiling, actual donor cuts and the reserved outlet all constrain these moves. No independent world smoothing pass creates or destroys material. Truly protected/capped barriers cannot be crossed: their unreachable sediment returns to the receiving side.

The original mouth, direction, reach, width, branches, channel mask, three channel stages and playback length are unchanged. All six Deposit fixtures compare these fields and their original budget to the old Rust result directly, in addition to the 50-fixture native/Wasm identity check. The 44 other-force pins stay identical. Five Deposit digests change for their corrected heights and records; one was already connected and supported and stays identical.

Short lines have no special refusal or seed gate. Draws and clicks keep the original gesture interpretation. If the old result could only move fewer than nine blocks, a compact receiving apron uses nine blocks paid for by allowed upstream/shoulder cuts; the supplemental search only runs for an insufficient old donor supply. Those original weak effects are counted separately. A zero material budget returns immediately, preserving real Floor/working-area refusals and input bytes.

The 13 Deposit contracts cover conservation, Power zero on dry/wet/edge ground, source metadata and wet outlets, object riding, channel stages, limits, playback/recording, sparse supply, donor-exposed columns, short draws and clicks across seeds and powers, and genuine restrictions. A new split-cone fixture pins the original 1,685-block volume, 23-tile reach and minimum 24 x 29 receiving span, with both lobes retained. It would fail the earlier largest-patch revision.

The final depositSweep drives the worker exactly as the editor does, through start, playback, keep and undo. Its original random gesture distribution and four powers are unchanged. Every theme (including Any) at 64Â² and 128Â² uses three passing maps and 120 Deposits; rejected generator seeds are recorded explicitly. A second worker using the original product modules opens the same map and evaluates the same request, so every revised volume is compared directly against the old result. The sweep checks lone pillars, four-neighbour connectivity of all **deposited** tiles, visible changed area, refusals, and preserved normal budgets. Separate donor banks are intentional excavation, not scattered deposited tiles.

The sheet uses exactly the previous 20 gestures: first three uses at seed 1 on each 128Â² theme, ending with the first two Islands uses. It compares the original kept Deposit with the revised kept Deposit on identical input terrain. Its matched crops and height scale show height plus hillshade; orange marks deposited tiles and blue donor cuts. All assets are procedural project-generated terrain. The accompanying sheet-volume table records volumes and receiving spans, including cases 03, 09 and 18.

## Reproduce in the isolated harness

From a fresh clone at the base with `npm ci` installed:

```powershell
node investigation/deposit-pillars/tools/setup.mjs
$env:PATH = 'C:\Users\Kyler\.cargo\bin;' + $env:PATH  # only if cargo is not on PATH
$env:DGM_CARGO_JOBS = '2'
npx tsx investigation/deposit-pillars/local/checkout/tools/rust/build.ts --native
npx tsx investigation/deposit-pillars/tools/depositSweep.ts before 120
node investigation/deposit-pillars/tools/shape.mjs
Copy-Item investigation/deposit-pillars/overlay/tests/contract/depositFan.test.ts investigation/deposit-pillars/local/checkout/tests/contract/depositFan.test.ts
npx tsx investigation/deposit-pillars/local/checkout/tools/rust/build.ts --native
npx tsx investigation/deposit-pillars/tools/depositSweep.ts final 120
npx tsx investigation/deposit-pillars/tools/verify.ts
npx tsx investigation/deposit-pillars/tools/summarize.ts
python investigation/deposit-pillars/tools/sheet.py final
Push-Location investigation/deposit-pillars/local/checkout
npx vitest run --maxWorkers 1 tests/contract/deposit.test.ts tests/contract/depositFan.test.ts
Pop-Location
```

`capture.ts <phase>` reruns just the exact 20 manifest gestures with per-case volume, extent, pillar and component counts. `depositSweep.original.ts` preserves the hunt's original reproduction. No speed measurements or Timberborn probe runs are involved. Raw per-use results, projects, and height arrays remain in gitignored local/ (D195); committed evidence is the small summary, fixture verification, sheet and its table.
