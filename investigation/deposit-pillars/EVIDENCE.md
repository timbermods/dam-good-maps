| Theme | Size | Uses | Old pillars | Old scattered | New kept | New refused | New pillars | New scattered | New weak |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| any | 64² | 120 | 14 | 83 | 102 | 18 | 0 | 0 | 0 |
| riverValley | 64² | 120 | 12 | 82 | 102 | 18 | 0 | 0 | 0 |
| canyon | 64² | 120 | 11 | 88 | 97 | 23 | 0 | 0 | 0 |
| highlands | 64² | 120 | 14 | 86 | 94 | 26 | 0 | 0 | 0 |
| lakeBasin | 64² | 120 | 23 | 76 | 100 | 20 | 0 | 0 | 0 |
| delta | 64² | 120 | 15 | 90 | 100 | 20 | 0 | 0 | 0 |
| islands | 64² | 120 | 10 | 84 | 96 | 24 | 0 | 0 | 0 |
| any | 128² | 120 | 8 | 63 | 97 | 23 | 0 | 0 | 0 |
| riverValley | 128² | 120 | 8 | 55 | 103 | 17 | 0 | 0 | 0 |
| canyon | 128² | 120 | 4 | 74 | 99 | 21 | 0 | 0 | 0 |
| highlands | 128² | 120 | 10 | 78 | 101 | 19 | 0 | 0 | 0 |
| lakeBasin | 128² | 120 | 15 | 69 | 102 | 18 | 0 | 0 | 0 |
| delta | 128² | 120 | 12 | 66 | 97 | 23 | 0 | 0 | 0 |
| islands | 128² | 120 | 10 | 86 | 103 | 17 | 0 | 0 | 0 |

The baseline reproduced 99 / 67 uses with pillars and 589 / 491 uses with disconnected deposits at 64² / 128². Refused generator seeds are recorded in [sweep-summary.json](sweep-summary.json); three passing maps per cell are used in both phases, without silently losing theme coverage. Raw failures and height arrays stay in gitignored `local/` (D195).

Short-line cutoff and the largest connected receiving patch on split/wet ground are deliberate shaping choices. See [DETAILS.md](DETAILS.md). No product file changed, no other checkout touched, no speed measurements or Timberborn probes run. The sheet is staged here so everything stays under `investigation/deposit-pillars/`; adoption copies it to `docs/sheets/deposit-pillars.png`.

Visual inspection: all 20 pairs are readable and use the same crop and height scale within each pair. The retained orange receiving patches keep the lobed fan shape while isolated side tiles are removed; the seven short-line panels leave the terrain and donor banks untouched. This is a heightmap contact sheet, not a game or renderer capture.
