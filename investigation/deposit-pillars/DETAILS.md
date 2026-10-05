# Shaping and evidence

The original planner fills a noise-ranked prefix of whole columns. A partially funded cone can leave pillars and stray tiles; donor cuts can expose columns further. Round 2 kept the original volume and lobes but joined every lobe by a shortest receiving path. Those one-tile paths formed wires and a rectangle in case 09. This revision deletes that path search and the global connectivity requirement.

The planner starts from the original funded cone, with the beds of donors actually cut. It caps unsupported columns and reclaims receiving tiles that do not belong to any filled 2 x 2 patch. Capping and body classification settle together: removing a tile may expose its neighbour. The recovered sediment raises supported relief in existing bodies or grows complete patches at lobe edges, preferring the original cone targets. Separate bodies are accepted. There is no search for another lobe, no connecting route, no largest-component selection and no global world smoothing.

Each deposited tile belongs to a filled 2 x 2 receiving patch. Thus each disconnected lobe contains at least four tiles, and the footprint has no one-tile lines, isolated tiles or skinny isolated fragments. This deliberately removes thin extremities as well as connectors. The committed sheet table records original full spans, original body spans and revised spans so removed stray extremities are not presented as preserved terrain. Normal volume, receiving geometry and all substantial original lobes remain.

The original mouth, direction, reach, width, branches, channel mask, three channel stages and playback length stay unchanged. All six Deposit fixtures compare these fields and their original volume directly against the old Rust result. All 50 fixtures match native and Wasm; all 44 other-force pins stay identical. Five Deposit digests change for corrected heights and arrival/stats records; the sixth already satisfies the body and support rules.

Short lines have no length or seed refusal. Clicks and draws keep their original interpretation. Round 2's small-budget correction stays: effects with fewer than nine original blocks use nine allowed upstream/shoulder blocks to make a visible small fan. A zero material budget preserves genuine Floor/working-area refusals. Keep/area depth, ceiling, actual donor cuts and the reserved wet outlet constrain every receiving patch. Donor excavation stays exactly balanced with deposited sediment.

The 13 focused contracts cover conservation, Power zero on dry/wet/edge ground, wet outlets and source metadata, object riding, channels, limits, playback/recording, sparse supply, donor-exposed columns, clicks/short draws across seeds and powers, and genuine restrictions. Every sampled raised tile must belong to a sediment body and have neighbour support. The split-cone regression retains the original 1,685 blocks, 23-tile reach and minimum 24 x 29 footprint with both lobes present, and rejects filling the forward high barrier.

The sweep follows the editor worker through start, playback, keep and undo. Its gesture distribution, powers, maps and passing-seed selection match the original hunt. Each of seven themes (including Any) at each size uses three passing maps and 120 Deposits. A second worker using unchanged product modules evaluates every identical request to check original volume. The revised checks distinguish disconnected bodies from scattered fragments: `scattered` means a lobe smaller than four tiles; `wires` counts uses with any deposited tile outside every filled 2 x 2 patch; `lobed` counts valid uses with several bodies. Pillar checks include boundary tiles. Historical baseline `scattered` numbers counted every disconnected result, so the report labels them explicitly rather than treating the definitions as identical.

The sheet uses the same previous 20 gestures: first three uses at seed 1 on each 128 x 128 theme, ending with two Islands uses. Inputs, paths and powers are checked for identity. Each pair shares its crop and height scale. Orange is deposited sediment, blue is donor excavation. All terrain and images are procedural project outputs; no external assets are used. Cases 02, 03, 08, 09, 12 and 20 retain their main lobes without the connector paths.

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
npx tsx investigation/deposit-pillars/tools/depositSweep.ts lobes 120
npx tsx investigation/deposit-pillars/tools/verify.ts
npx tsx investigation/deposit-pillars/tools/summarize.ts
python investigation/deposit-pillars/tools/sheet.py lobes
Push-Location investigation/deposit-pillars/local/checkout
npx vitest run --maxWorkers 1 tests/contract/deposit.test.ts tests/contract/depositFan.test.ts
Pop-Location
```

`capture.ts <phase>` reruns only the 20 manifest gestures with volume, extent, pillar, thin-tile and component metrics. `depositSweep.original.ts` preserves the hunt's original reproduction. No speed measurements or Timberborn probes are involved. Raw per-use results and height arrays stay in gitignored local/ (D195); committed evidence is the small summary, fixture verification, sheet and its table.
