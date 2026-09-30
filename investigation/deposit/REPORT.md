# Deposit findings

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
