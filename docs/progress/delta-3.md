# Delta 1 round 3: the bars, step by step

Delta 1 round 3 (D549 amended, generator 0.10.65), measured against base (dev at the merge-base, 0fc2390b) on Delta 256²
s1–12 and 128² s1–6, Normal. ✗ marks a bar missed. Pump walk is the walk to pump water on the settled water.

## Step 5: chosen on the water as it settles, weighed by the walk, no unfed water

| map | on terrace | room | reach (base) | badwater in view (base) | pump walk | attempts (base) | CPU s (base) |
|---|---|---|---|---|---|---|---|
| 256² s1 | yes | 529 | 32211 (28428) | 0 (73) | 5.2 | 2 (2) | 55.8 (44.4) |
| 256² s2 | yes | 442 | 52633 (40353) | 0 (0) | 5.8 | 3 (4) | 61.8 (69.9) |
| 256² s3 | yes | 416 | 53513 (25576) | 0 (0) | 4 | 7 (1) | 67.5 (47.5) |
| 256² s4 | yes | 407 | 24328 (18282) | 0 (0) | 3.8 | 1 (1) | 50 (60.1) |
| 256² s5 | yes | 522 | 43150 (29571) | 0 (163) | 5 | 1 (1) | 57.7 (47.6) |
| 256² s6 | yes | 429 | 34433 (27497) | 1 (407) | 5.2 | 1 (1) | 45.5 (47.4) |
| 256² s7 | yes | 476 | 30174 (34593) ✗ | 0 (0) | 5.4 | 1 (1) | 46.3 (38) |
| 256² s8 | no, site | 318 ✗ | 34783 (19377) | 0 (92) | 6.4 | 2 (2) | 56.1 (45.8) |
| 256² s9 | no, no site | 304 ✗ | 35557 (30620) | 0 (611) | 5.4 | 1 (1) | 43.2 (35.5) |
| 256² s10 | no, no site | 404 | 43345 (43920) ✗ | 0 (0) | 8.2 | 2 (3) | 44.4 (48.3) |
| 256² s11 | yes | 534 | 42483 (4446) | 0 (73) | 6 | 3 (3) | 66.9 (59.9) |
| 256² s12 | no, no site | 418 | 38940 (31519) | 0 (73) | 6 | 1 (1) | 47.2 (51) |
| 128² s1 | yes | 509 | 5402 (3136) | 75 (83) | 8 | 2 (8) | 21.1 (34.9) |
| 128² s2 | yes | 417 | 4025 (3243) | 66 (315) | 5.2 | 1 (2) | 19.3 (15.5) |
| 128² s3 | yes | 405 | 3508 (7379) ✗ | 81 (73) ✗ | 5.2 | 2 (2) | 14.7 (15.9) |
| 128² s4 | yes | 512 | 4800 (3543) | 77 (96) | 5.4 | 4 (7) | 26.2 (28.5) |
| 128² s5 | yes | 525 | 5521 (5363) | 0 (220) | 6 | 1 (1) | 17.5 (15) |
| 128² s6 | yes | 402 | 8540 (4480) | 27 (62) | 6 | 7 (1) | 34 (19.9) |

On the terrace 14 of 18. CPU 775.2 s against 725.1 s (1.069); attempts 42 against 42. Rerun with the place chosen before
the land is shown (below): every map hashes the same, CPU 742.0 s (1.023).

**Settles (page time).** The heightfield and forms settles' ticks, Delta 256², branch against base (the branch runs
512 ticks more on each attempt that reaches its start, the water the terrace's place is chosen on): s1 2816 (2816), s2 4352 (3840), s3 768 (4352), s4 2048 (4352), s5 5248 (5504), s6
4352 (4608), s7 3200 (2944), s8 7296 (5376), s9 3584 (3072), s10 2560 (4864), s11 4352 (5248), s12 4352 (5632); all
12, 44928 against 52608 (0.85). Step 4 settled the land again after moving the terrace and after its refit: the place
is now chosen on the water 512 ticks in, before the land settles once. s6 and s10 ran their settles to the end on
water no source reaches (a hollow behind s6's west lip, s10's hollows from the land's later cuts) and s1 on a planned
lake whose river left: those bodies are filled (D549 (9)).

**The land shown (D348).** The place is chosen, the terrace refit and the unfed water filled on the land stage, before
the land is shown (above 128² it is shown there) and never on a later attempt: every map above hashes as it did with the
place chosen after the show, and Delta 96² s1 and s3, 128² s1 and s2 and 256² s1 change no tile after the land shown.

**The constants sized for 128² (planning's table, `findings/constants-128`).** Delta needs no change for rows 1, 3 and
4: its land within 10 tiles of water is 0.387 of the land at 128² and 0.379 at 256², its green land 0.331 and 0.322
(the fan's arms cross the map), while its sources per 10k tiles fall 5.29 → 3.72. Its edge warp above 128² is the ring
forms' (`RINGS` warpCell 18, warpReach 4), and `DELTA_RINGS` and the jitter scale with `formScale`.

**Fallbacks.** 256² s8: its terrace sees 208 badwater tiles against 0 off it, so the start stands off it (room 318).
256² s9, s10 and s12 have no terrace place that passes on their water.

**What falls short.** Reach on 256² s7 (30174 against 34593; the start off the terrace walks to 34665, so it stays,
under `offReach`), 256² s10 (43345 against 43920, a fallback) and 128² s3 (3508 against 7379; dev's start stands
inland at level 11); badwater in view on 128² s3 (81 against 73); room on s8 and s9 (fallbacks). Settles on s2, s7, s8
and s9 run longer than base's. Easy rows and the other themes' hashes are not yet measured for this step.
