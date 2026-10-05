# Shaping and evidence

The old planner combines three independent choices: noisy offers with a smooth cone target; a rank sorted mostly by distance along the fan plus per-tile noise; and a budget that fills each sorted tile to its entire target before moving on. When the donor supply ends midway through that list, tall columns survive among untouched neighbours. Donor cuts can then lower their neighbours further. If the cone is too small, the old minimum-area/material fallback gathers arbitrary nearby tiles and inflates individual targets. A seeded short cone can therefore become scattered debris, or have no usable receiving room at all.

The candidate changes allocation at the source. Keep the existing cone, lobes, receiving placement, channel masks, target limits, donor search and supply calculation. Pick one connected component of positive receiving offers, then traverse it from a safe site near the mouth. Every tile gets at most one level per pass, and new sites join the already deposited footprint. Stop at the existing cone target, the actual material budget, or a height cap two levels above the highest available neighbour. The cap uses the deepest permitted donor cuts, so it is safe even after all the donors have been lowered. Cut exactly the material actually deposited; an unsuccessful footprint cuts nothing.

No independent cleanup/smoothing pass erases material, and no extra tile or extra cone height is invented to satisfy a quota. Connectivity follows from the frontier condition; pillar prevention follows from the neighbour cap and the conservative donor beds. The fan's receiving footprint must contain at least nine raised tiles. Donor excavation may occupy separate upstream/higher patches, as before; “scattered” means disconnected **deposited** tiles, not separate excavation banks. The sweep measures the kept worker result, after playback and the keep, and checks four-neighbour connectivity of every raised tile.

Refusals: endpoint distance greater than one and less than eight tiles is a drawn line too short for this fan. It always gives `Draw a longer line for a fan (at least 8 tiles)` before any seeded shaping. This is a deliberate, documented call under the prompt's permission to refuse short lines. Repeated points and distances at most one tile keep the existing click interpretation. Longer draws and clicks lacking a nine-tile connected receiving patch give the existing one-line material/room refusal, with no cut or partial fan kept.

Existing contracts verify conserved volume, Power zero on dry/wet/edge ground, channel stages, height variation, Keep/Floor/area limits, source identities and their metadata, wet outlet connectivity, object riding/burial, playback final identity, typed/packed agreement and recording. Added regressions cover small sediment supply, donor cuts, all sampled seeds for a five-tile draw, and too-small working areas. The separate verification compares all 50 packed fixtures against native Rust, checks 44 other-force pins against the starting dev pins, and changes only the five Deposit digests whose output changed. The sixth Deposit fixture remains identical.

`depositSweep.original.ts` preserves the hunt's reproduction. `depositSweep.ts` uses the same random generator, click/draw distribution, four powers, three map seeds, worker calls and undo. It adds explicit deposited-component counting and a nonzero exit on any remaining after defect. Unlike the original silent generation skip, it records rejected generator seeds and continues in seed order until each theme/size has three passing maps (maximum seed 24). Both phases use exactly those same maps and gestures, including the Any theme. Generation failures are generator outcomes, not Deposit refusals. Each of the 14 cells exercises 120 Deposits.

The 20-pair sheet uses the first three gestures on seed 1 at 128² in theme order, ending with the first two Islands gestures. It compares the old planner's kept Deposit to the candidate on the identical input map and gesture, rather than comparing untouched terrain to a Deposit. Colour shows actual deposited/cut tiles; a candidate refusal shows the unchanged input and its reason. All imagery is procedural rendering of project-generated terrain, with no outside assets.

## Reproduce without changing product files

From a fresh clone at the base commit with `npm ci` installed:

```powershell
node investigation/deposit-pillars/tools/setup.mjs
$env:PATH = 'C:\Users\Kyler\.cargo\bin;' + $env:PATH  # only if cargo is not on PATH
$env:DGM_CARGO_JOBS = '2'
npx tsx investigation/deposit-pillars/local/checkout/tools/rust/build.ts --native
npx tsx investigation/deposit-pillars/tools/depositSweep.ts before 120
git apply --check --directory=investigation/deposit-pillars/local/checkout investigation/deposit-pillars/adoption.patch
git apply --directory=investigation/deposit-pillars/local/checkout investigation/deposit-pillars/adoption.patch
npx tsx investigation/deposit-pillars/local/checkout/tools/rust/build.ts --native
npx tsx investigation/deposit-pillars/tools/depositSweep.ts after 120
npx tsx investigation/deposit-pillars/tools/verify.ts
Push-Location investigation/deposit-pillars/local/checkout
npx vitest run --maxWorkers 1 tests/contract/deposit.test.ts tests/contract/depositFan.test.ts
Pop-Location
python investigation/deposit-pillars/tools/sheet.py
```

The `--directory` argument confines the adoption patch to the isolated harness. Source snapshots under `overlay/` are also available.

Raw per-use failures and terrain arrays stay in `local/` (gitignored, D195). Committed evidence is the small sweep table, fixture verification and 20-pair sheet. Reproduction is a full correctness batch, so allow it to finish; no speed measurements or probe runs are involved.
