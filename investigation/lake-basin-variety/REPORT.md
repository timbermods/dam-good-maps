# Lake Basin variety: round 3

Rebased round 2 onto `dev` at `2db8f5d36e41f2e085945fda62900f6e01453df3`.
The original critique came from git (`aab3626abdacf93e00a050f2998f182efe856dde`),
not a PR review. Round 2's sheet and implementation remain as comparison evidence.

**Change and why.** The main hollow now sits 12–21% of a map width from the centre,
with variable length and area. Smaller warped hollows follow bent valley axes into it;
raised, winding ridges between those valleys survive as headlands and sometimes islands.
The secondary hollow is smaller so the principal lake keeps the centre of gravity.
A deeper inner reach and a modest 1.1–1.3 inflow multiplier keep that lake and its rivers
wet. Round 2's radial lowland, shore jitter and curved tributaries remain. Everything is
Lake Basin genome shaping before `makeField` and the first land (D348, D370), using
existing terrain parts. No lake/channel mask or shared-code change is included.

**Counts.** Normal preset, 128², seeds 1–30, the same `m9b/measures.ts` outcomes read-back.

| Reading | round 2 | round 3 |
| --- | ---: | ---: |
| Lake Basin promise | 30/30 | 30/30 |
| Readable water | 30/30 | 30/30 |
| Both | 30/30 | 30/30 |
| `straight.ts` settled channel limits | 30/30 | 30/30 |

Largest lake area varies from 9.7% to 33.2% of the map (round 2: 10.5–32.4%).
Seeds 12, 15 and 29 keep their lakes. The five `straight.test.ts` tests pass;
180 other-theme genomes (six themes, the same seeds and size) are unchanged.
[Per-seed readings](counts-r3.csv). No speed measurements or further suites were run.

[Kyler's sheet](../../docs/sheets/lake-basin-variety-r3-128.jpg): all 30 seeds,
round 2 left / round 3 right, each map 256 px, north up, red start, purple badwater.

**Still open.** On a conservative visual reading, **7, 10, 13, 17 and 21 remain central
rounded blobs: 5/30**. Some have new inlets or an island, but their main bodies still read
rounded. **25 is also a rounded blob, off-centre.** Bays and headlands are more evident
elsewhere (for example 2, 11, 18, 22, 24, 26, 28 and 30); this is a visual judgement,
not a new metric. Some terrace-aligned shore steps remain. Channel straightness does not
judge broad shores. Buildable/fertile surrounds, 3D, other settings, sizes and siblings
were not separately measured. Kyler's visual yes remains open.
[Shared observations](SHARED-FINDINGS.md) are separate and unfixed.

**Hand-back.** Product code stays unchanged in this PR. [adoption.patch](adoption.patch)
changes only `src/core/land/lakeBasin.ts` against the rebased dev tip.
[INTEGRATION.md](INTEGRATION.md) gives adoption and regeneration commands.
Bulk outputs and trials remain ignored in `investigation/lake-basin-variety/local/` (D195).
