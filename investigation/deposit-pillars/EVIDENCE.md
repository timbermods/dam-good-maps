| Theme | Size | Kept | Uses with separate lobes | Pillars | Stray fragments | One-tile lines | Weak keeps | Refused | Volume losses | Tiny fans expanded |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| any | 64² | 120 | 57 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| riverValley | 64² | 120 | 56 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| canyon | 64² | 120 | 63 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| highlands | 64² | 120 | 54 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| lakeBasin | 64² | 120 | 50 | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| delta | 64² | 120 | 68 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| islands | 64² | 120 | 64 | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| any | 128² | 120 | 46 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| riverValley | 128² | 120 | 31 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| canyon | 128² | 120 | 45 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| highlands | 128² | 120 | 48 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| lakeBasin | 128² | 120 | 39 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| delta | 128² | 120 | 37 | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| islands | 128² | 120 | 59 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |

Separate lobes are now accepted per Kyler’s round 3 direction. A stray fragment means a disconnected receiving component with fewer than four tiles. A thin receiving tile lies outside every filled 2 × 2 patch; none is allowed, whether it is an isolated fragment, an attached tail or a connector. All deposited tiles pass this body check and neighbour support. The 717 uses with valid separate lobes are recorded above, not classified as scattered failures.

The original worker evaluates every identical request alongside the revised worker. All 1680 revised uses keep; 1677 preserve exact original deposited volume. The three round 2 tiny effects retain their nine-block visibility correction, paid by permitted upstream/shoulder cuts. No length refusal returns. [sweep-summary.json](sweep-summary.json) records every cell and skipped generator seed. Its historical baseline disconnected counts used the former all-components definition; they are explicitly named separately from current stray-fragment failures. Raw heights and per-use results stay gitignored in local/ (D195).

| Case | Theme | Power | Before blocks | After blocks | Before full span | Before body span | After body span | Lobe sizes after |
| --- | --- | ---: | ---: | ---: | --- | --- | --- | --- |
| 01 | any | 0 | 53 | 53 | 8 × 7 | 7 × 5 | 8 × 6 | 29 |
| 02 | any | 35 | 465 | 465 | 29 × 27 | 24 × 25 | 25 × 25 | 157, 86, 10, 10 |
| 03 | any | 70 | 1508 | 1508 | 44 × 47 | 38 × 46 | 40 × 47 | 268, 259, 43, 54 |
| 04 | riverValley | 0 | 52 | 52 | 7 × 7 | 5 × 5 | 7 × 6 | 31 |
| 05 | riverValley | 35 | 2206 | 2206 | 27 × 28 | 25 × 26 | 26 × 27 | 360 |
| 06 | riverValley | 70 | 668 | 668 | 42 × 29 | 42 × 29 | 42 × 29 | 299, 12, 21, 6 |
| 07 | canyon | 0 | 52 | 52 | 9 × 9 | 9 × 7 | 9 × 9 | 38 |
| 08 | canyon | 35 | 349 | 349 | 29 × 26 | 27 × 25 | 27 × 26 | 51, 140, 22, 10 |
| 09 | canyon | 70 | 491 | 491 | 41 × 33 | 38 × 32 | 39 × 33 | 41, 14, 44, 109, 52 |
| 10 | highlands | 0 | 55 | 55 | 7 × 6 | 6 × 5 | 7 × 5 | 25 |
| 11 | highlands | 35 | 1123 | 1123 | 28 × 32 | 26 × 28 | 27 × 28 | 386, 6 |
| 12 | highlands | 70 | 1266 | 1266 | 48 × 38 | 35 × 37 | 35 × 38 | 184, 28, 332 |
| 13 | lakeBasin | 0 | 53 | 53 | 7 × 7 | 7 × 5 | 7 × 6 | 30 |
| 14 | lakeBasin | 35 | 1050 | 1050 | 27 × 28 | 25 × 28 | 27 × 28 | 391, 20 |
| 15 | lakeBasin | 70 | 3540 | 3540 | 44 × 42 | 43 × 41 | 43 × 42 | 740, 91 |
| 16 | delta | 0 | 52 | 52 | 7 × 6 | 6 × 5 | 7 × 5 | 24 |
| 17 | delta | 35 | 288 | 288 | 25 × 25 | 25 × 23 | 25 × 23 | 74, 183, 15 |
| 18 | delta | 70 | 661 | 661 | 41 × 33 | 39 × 33 | 40 × 33 | 146, 77, 92, 37, 175, 17 |
| 19 | islands | 0 | 52 | 52 | 8 × 10 | 8 × 7 | 8 × 8 | 38 |
| 20 | islands | 35 | 547 | 547 | 27 × 27 | 25 × 27 | 26 × 27 | 234, 21 |

All 20 sheet cases preserve original volume and retain or extend their original **body** spans, including seven Power 0 gestures. The full original spans included stray tiles and thin extremities; those are removed, not joined by wires. Body span measures tiles that already belonged to a filled 2 × 2 patch. [sheet-summary.json](sheet-summary.json) records area, both spans, pillars, thin tiles and every lobe size. Cases 02, 03, 08, 09, 12 and 20 retain substantial separate bodies with no artificial connector.

[verification.json](verification.json): 44 unchanged other-force pins, five Deposit re-pins, all 50 native/Wasm matches, 96 short-line fans and all six Deposit fixture geometry/budget matches. Both typechecks and all 13 contracts pass. The adoption patch applies cleanly at the pinned base and reproduces the tested overlays.

All assets are procedural project output. No product file or other checkout changed; no speed measurements or Timberborn probes ran. The sheet stays under investigation/deposit-pillars/; adoption copies it to docs/sheets/deposit-pillars.png. See [DETAILS.md](DETAILS.md) for shaping, acceptance definitions and reproduction.
