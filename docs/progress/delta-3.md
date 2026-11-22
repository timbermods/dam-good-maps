# Delta 1 round 3: the bars, step by step

Delta 1 round 3 (D549 amended, generator 0.10.65), measured against base (dev at the merge-base, 0fc2390b) on Delta 256²
s1–12 and 128² s1–6, Normal. ✗ marks a bar missed. Pump walk is the walk to pump water on the settled water.

## Step 3: the terrace over all water near it

| map | on terrace | room | reach (base) | badwater in view (base) | pump walk | attempts (base) | CPU s (base) | Easy rows worse |
|---|---|---|---|---|---|---|---|---|
| 256² s1 | yes | 442 | 34887 (28428) | 0 (73) | 2.4 | 2 (2) | 58.8 (44.4) | none |
| 256² s2 | yes | 422 | 51775 (40353) | 0 (0) | 6.2 | 3 (4) | 63.7 (69.9) | none |
| 256² s3 | yes | 483 | 49857 (25576) | 0 (0) | 5.7 | 7 (1) | 67.9 (47.5) | none |
| 256² s4 | yes | 407 | 24329 (18282) | 0 (0) | 3.8 | 1 (1) | 45.1 (60.1) | none |
| 256² s5 | yes | 511 | 47919 (29571) | 0 (163) | 5.2 | 1 (1) | 62.1 (47.6) | none |
| 256² s6 | yes | 408 | 42861 (27497) | 3 (407) | 7 | 1 (1) | 65.5 (47.4) | none |
| 256² s7 | yes | 476 | 30179 (34593) ✗ | 0 (0) | 5.4 | 1 (1) | 45.6 (38) | none |
| 256² s8 | yes | 480 | 24233 (19377) | 202 (92) ✗ | 5 | 2 (2) | 64.6 (45.8) | none |
| 256² s9 | no, no site | 304 ✗ | 32044 (30620) | 0 (611) | 5.4 | 1 (1) | 39.7 (35.5) | none |
| 256² s10 | no, no site | 401 | 43195 (43920) ✗ | 0 (0) | 8 | 2 (3) | 69.5 (48.3) | none |
| 256² s11 | yes | 439 | 44194 (4446) | 0 (73) | 3.8 | 3 (3) | 55.7 (59.9) | none |
| 256² s12 | no, no site | 418 | 38940 (31519) | 0 (73) | 6 | 1 (1) | 42.1 (51) | none |
| 128² s1 | yes | 509 | 5402 (3136) | 75 (83) | 8 | 2 (8) | 20.9 (34.9) | none |
| 128² s2 | yes | 417 | 4025 (3243) | 66 (315) | 5.2 | 1 (2) | 18.3 (15.5) | none |
| 128² s3 | yes | 405 | 3508 (7379) ✗ | 81 (73) ✗ | 5.2 | 2 (2) | 13.6 (15.9) | none |
| 128² s4 | yes | 512 | 4800 (3543) | 77 (96) | 5.4 | 4 (7) | 23.2 (28.5) | none |
| 128² s5 | yes | 503 | 5493 (5363) | 0 (220) | 5.2 | 1 (1) | 15.8 (15) | none |
| 128² s6 | yes | 402 | 8540 (4480) | 27 (62) | 6 | 7 (1) | 28.5 (19.9) | none |

On the terrace 15 of 18. CPU 800.6 s against 725.1 s (1.104); attempts 42 against 42.

**The other bars.** Easy start: no Easy row worse on any of the 18 (every branch map misses none). Every other theme
hashes the same with the version set back (Canyon, Lake Basin, River Valley, Highlands, Islands 128² s1, River Valley
256² s2, Islands 256² s1, Delta 96² s1), and the two pinned maps (`look-mine-ruins`, `premiseMap`) give their old pins
byte for byte. Page time (the page's worker, from the page's open to the map made, base then branch, one at a time):
256² s10 20.9 s against 24.4 s, s3 19.4 s against 23.3 s.

**Fallbacks.** Delta 256² s9, s10 and s12 have no terrace place that passes on their water: the settler stands
anywhere else as on dev.

**What falls short.** Page time (+17 % and +20 %): the settles run longer on the grown banks (s10's first settle
24.7 s, its forms' stacked settle 23.0 s), no work thrown away. Reach on 256² s7 (30179 against 34593) and 128² s3 (3508
against 7379): the derived slopes' tree is centred on the start (40 tiles at 128²), so a terrace at the land's edge by
the river joins less of the land than dev's start inland; the bank the terrace picks (its land joined by one-level steps)
does not see that. s10's reach is 1.6 % under (a fallback). Badwater in view on 256² s8 (202 against 92) and 128² s3
(81 against 73). Room on s9 (304, a fallback). CPU 1.104 of base, at the line (base 256² s1–6 ran six at a time, the
rest ten).
