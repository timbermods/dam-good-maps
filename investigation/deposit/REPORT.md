# Deposit findings

## Round 2

Real cone relief and broad lobes replace the subtle patch. Higher banks supply visible cuts
of up to five levels. The renderer imports product soil colours and moisture, with **no sediment
or cut tint**. Power 0 keeps a small apron. Slope, flat, water and peak clicks find a foot, sheet,
delta or nearby hollow. Watch grows alternating lobes, switches left/right beds, and shows
three source-driven water poses with soft, existing CC0 rushing audio.

Full Power, Size 64, seed 2, unchanged 128² generator land:

| Case | Cut = deposited | Maximum rise | Gentle added ground | Level interior tiles | Newly dry tiles |
| --- | ---: | ---: | ---: | ---: | ---: |
| Canyon | 2,958 | 7 | 72.5% | 124 | 166 |
| Dry gully | 7,410 | 10 | 85.0% | 500 | 0 |
| Lake delta | 4,079 | 9 | 75.1% | 231 | 347 |

Wet fans retain their outlet and separated wet branches (25/44 split stations past the feeder).
The dry fan has no wet added tiles; every balance is exactly zero.

**Checks:** 576 setting combinations pass Floor/bounds, conservation, determinism, replay,
arrival, objects/sources, valid starts and exact undo. Every water model converged, by 5,440 ticks.
After the apron fix, 542 models were verified byte-identical; all 34 changed models were settled
twice again. **795 clicks** across all Powers/Sizes/Channels at Default Floor have **zero no-ops**:
minimum 70 changed tiles, 18 raised tiles and 52 conserved blocks; 75 water samples pass.
TypeScript, build and real browser controls, sound and undo pass without runtime/asset errors.
Largest gesture: **2.056 s** to final land; worst browser Fast: **2.060 s**. Eighteen downscaled
JPEGs and a short Watch GIF are in README, with regeneration commands. Bulk stays local.

**Falls short:** a Floor forbidding every eligible cut cannot permit a conserved deposit.
The sweep records 144 blocked Floor-22 cases and two at Floor 12; Floor is never silently lowered.
Default-Floor coverage has no terrain rejection. Canyon channels follow its native zero-level
bed; Floor prevents new level-zero cuts. Routing/avulsion illustrates the force rather than a
sediment-fluid solver. Primitive rendering shares product soil, not full shaders/export parity;
protected areas and multi-tile objects need the shared hooks in INTEGRATION.

## Round 1 (historical)

**The idea works:** sediment builds irregular, shallow lobes at a mouth; the upstream corridor
deepens by at most two levels. Wet fans split into distributaries separated by new dry banks
and keep an outlet. The Highlands fan stays dry; the lake fan makes emergent land.
Watch grows lobes with shifting drainage beds. Water re-settles after final land, as in the core.

Seed 2, on unchanged 128² generator land:

| Case | Cut = deposited blocks | Level interior tiles | Gentle added ground | Carried / buried |
| --- | ---: | ---: | ---: | ---: |
| Canyon river | 952 | 316 | 73.4% | 342 / 0 |
| Dry Highlands gully | 2,606 | 367 | 86.2% | 354 / 101 |
| Valley into lake | 1,895 | 324 | 65.2% | 193 / 0 |

Gentle means no more than one level to each neighbouring tile. Canyon seed 2 uses badwater off;
Highlands is seed 5, Lake Basin seed 4. The lake example exposes 555 formerly wet tiles.
Sources ride upright with their strength unchanged; the start is carried to dry level ground.
Size and Channels have Auto; Floor keeps the shared **Default** convention.

**Checks:** 576 random clicks/drags, 192 settings combinations per case: all Channels choices,
Power 0/1/35/100, Size Auto/4/22/64, Floor 1/3/12/22. No balance, bounds, Floor, determinism,
literal replay, arrival or final-start failures. 3,456 exact undo snapshots; 2,304 arrival snapshots.
Four lake gestures exceeded the initial shared preview cap; all four converge with the same solver
and stopping rule continued, by 5,376 ticks. Determinism, worker slicing, valid starts and undo
were checked again for those cases. No capped result is called settled. Initial sweep: 493 seconds;
worst headless planning: 282.6 ms. Recorded regressions make the continuation check cheap to repeat.

**Browser:** real pointer and key controls, both Esc playback modes, planning/playback undo,
Try another, source riding/strength, water continuation and fixed camera pass; no runtime errors.
Largest 128² gesture: Power 100, Size 64, 112-tile reach, final land in **2.023 s**.
Worst captured finish, including slow-water regressions: **2.028 s**. TypeScript and build pass.
Six downscaled comparisons and one 520px growth GIF total under 1 MB; README gives regeneration.

**Falls short:** primitive rendering omits product vegetation, moisture and water shaders; this
proves the force and preview, not canonical export parity. Rigid objects ride their anchor;
adoption needs the existing multi-tile integrity and document start-carry hooks. Protected-area
adoption must rebalance after excluded cuts/deposits. Power 0 or a Floor leaving no sediment
produces no change. Bulk files stay ignored. Only `investigation/deposit/` changes from base
feature/forces **9e14f189**; the milestone takes this investigation's commit only.
