| Theme | Size | Uses kept | Old pillars | Old scattered | New refused | New pillars | New scattered | New weak | Volume losses | Tiny fans expanded |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| any | 64² | 120 | 14 | 83 | 0 | 0 | 0 | 0 | 0 | 0 |
| riverValley | 64² | 120 | 12 | 82 | 0 | 0 | 0 | 0 | 0 | 0 |
| canyon | 64² | 120 | 11 | 88 | 0 | 0 | 0 | 0 | 0 | 0 |
| highlands | 64² | 120 | 14 | 86 | 0 | 0 | 0 | 0 | 0 | 0 |
| lakeBasin | 64² | 120 | 23 | 76 | 0 | 0 | 0 | 0 | 0 | 1 |
| delta | 64² | 120 | 15 | 90 | 0 | 0 | 0 | 0 | 0 | 0 |
| islands | 64² | 120 | 10 | 84 | 0 | 0 | 0 | 0 | 0 | 1 |
| any | 128² | 120 | 8 | 63 | 0 | 0 | 0 | 0 | 0 | 0 |
| riverValley | 128² | 120 | 8 | 55 | 0 | 0 | 0 | 0 | 0 | 0 |
| canyon | 128² | 120 | 4 | 74 | 0 | 0 | 0 | 0 | 0 | 0 |
| highlands | 128² | 120 | 10 | 78 | 0 | 0 | 0 | 0 | 0 | 0 |
| lakeBasin | 128² | 120 | 15 | 69 | 0 | 0 | 0 | 0 | 0 | 0 |
| delta | 128² | 120 | 12 | 66 | 0 | 0 | 0 | 0 | 0 | 1 |
| islands | 128² | 120 | 10 | 86 | 0 | 0 | 0 | 0 | 0 | 0 |

The baseline reproduced 99 / 67 uses with pillars and 589 / 491 uses with disconnected deposits at 64² / 128². [sweep-summary.json](sweep-summary.json) records every cell and rejected generator seed. Both phases use the same three passing maps per cell. Raw height arrays and per-use results stay in gitignored local/ (D195).

The original worker evaluates every identical request alongside the revised worker. All 1,680 revised uses keep; 1,677 preserve their exact original deposited volume. Three original tiny effects use nine blocks instead: one Lake Basin and one Islands case at 64², and one Delta case at 128². Supplemental permitted upstream/shoulder cuts pay for the added visibility; balance stays zero. The normal cone budget and reach stay intact.

| Case | Theme | Power | Before blocks | After blocks | Before span | After span |
| --- | --- | ---: | ---: | ---: | --- | --- |
| 01 | any | 0 | 53 | 53 | 8 × 7 | 8 × 7 |
| 02 | any | 35 | 465 | 465 | 29 × 27 | 29 × 27 |
| 03 | any | 70 | 1508 | 1508 | 44 × 47 | 44 × 47 |
| 04 | riverValley | 0 | 52 | 52 | 7 × 7 | 7 × 7 |
| 05 | riverValley | 35 | 2206 | 2206 | 27 × 28 | 27 × 28 |
| 06 | riverValley | 70 | 668 | 668 | 42 × 29 | 42 × 29 |
| 07 | canyon | 0 | 52 | 52 | 9 × 9 | 9 × 9 |
| 08 | canyon | 35 | 349 | 349 | 29 × 26 | 30 × 26 |
| 09 | canyon | 70 | 491 | 491 | 41 × 33 | 41 × 33 |
| 10 | highlands | 0 | 55 | 55 | 7 × 6 | 7 × 6 |
| 11 | highlands | 35 | 1123 | 1123 | 28 × 32 | 28 × 32 |
| 12 | highlands | 70 | 1266 | 1266 | 48 × 38 | 48 × 38 |
| 13 | lakeBasin | 0 | 53 | 53 | 7 × 7 | 7 × 7 |
| 14 | lakeBasin | 35 | 1050 | 1050 | 27 × 28 | 27 × 28 |
| 15 | lakeBasin | 70 | 3540 | 3540 | 44 × 42 | 45 × 42 |
| 16 | delta | 0 | 52 | 52 | 7 × 6 | 7 × 6 |
| 17 | delta | 35 | 288 | 288 | 25 × 25 | 25 × 27 |
| 18 | delta | 70 | 661 | 661 | 41 × 33 | 41 × 33 |
| 19 | islands | 0 | 52 | 52 | 8 × 10 | 8 × 10 |
| 20 | islands | 35 | 547 | 547 | 27 × 27 | 27 × 27 |

All 20 sheet cases preserve their original volumes and retain or extend their receiving spans, including all seven Power 0 gestures. [sheet-summary.json](sheet-summary.json) also records receiving areas. Cases 03, 09 and 18 retain their 1,508 / 491 / 661 blocks and 44 × 47 / 41 × 33 / 41 × 33 receiving spans. Orange is deposited sediment; blue is donor excavation. The source terrain and image are procedural project outputs.

[verification.json](verification.json) records 44 unchanged other-force pins, five Deposit re-pins, all 50 native/Wasm matches, 96 short-line fans, and six Deposit fixture geometry/budget matches. The 13 focused contracts and both typechecks pass. The adoption patch applies cleanly at the pinned base.

No product file changed, no other checkout was touched, and no speed measurements or Timberborn probes ran. The sheet stays under investigation/deposit-pillars/; adoption copies it to docs/sheets/deposit-pillars.png. See [DETAILS.md](DETAILS.md) for the shaping and reproduction.
