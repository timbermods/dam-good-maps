# Lake Basin variety

Base: `dev` tip at task start, `65e0aab24742caa7c419349a41a6ef480b603896`.
Critique read from fetched git commit `aab3626abdacf93e00a050f2998f182efe856dde`:
Lake Basin section and all four requested captures. No PR was reviewed.

**Change.** Independent seed/sibling draws vary lake position, length, a second hollow and
one raised winding flank. Warped hollows replace the valley basin's straight side arms;
existing rivers keep their bends. Warped regional relief, contour jitter and one-level
preset shores break terrace lines. The hollows cut into the uplands last, so a later mesa
cannot overwrite them. A small deeper reach keeps long lakes dominant. Round 2's broad
radial lowland, modest inflow load and buildable surrounds remain the aim. Explicit zero
Rivers is respected along with D464's settings/sibling entry point and Lakes budget lean.
All changes are Lake Basin genome shaping before the first land (D348, D370).

**Counts.** Normal preset Lake Basin, 128², seeds 1–30; same `m9b/measures.ts` read-back,
without speed sampling. Every seed remains in the denominator.

| Reading | dev tip | after |
| --- | ---: | ---: |
| Lake Basin promise | 27/30 | 30/30 |
| Readable water | 28/30 | 30/30 |
| Both | 26/30 | 30/30 |
| `straight.ts` settled channel limits | 30/30 | 30/30 |

Seeds **12, 15 and 29 now have substantial lakes and meet both outcomes**.
The five `tests/unit/straight.test.ts` checks pass. [Per-seed readings](counts.csv).
No other checks or speed measurements were run.

[Kyler's one sheet](../../docs/sheets/lake-basin-variety-128.jpg): all 30 seeds, dev on the
left and after on the right, every map 256 px, north up; red marks the start and purple
marks badwater. The after pictures vary in position, elongation, paired water and shore
relief rather than repeating the central spokes. The top-down colours are the same
height/water shading used by the critique; they do not measure fertile or level land.

**Still open.** Kyler's visual yes, especially whether cliff flanks, paired lakes and
buildable shores feel varied enough. Paired hollows can join into one lobed lake; this
is not a guarantee of two separate lakes for every paired draw. Some stepped shores
remain. Badwater colours most of seed 29's new lake purple; readability passing does
not establish a clean lake. Channel straightness excludes broad shores. No 3D, other-size, settings,
difficulty or sibling batch was run under the requested check limit.
[Shared follow-ups](SHARED-FINDINGS.md) stay separate and unfixed.

**Hand-back.** Product code is unchanged in this investigation PR.
[Adoption patch](adoption.patch) changes only `src/core/land/lakeBasin.ts` against the
pinned dev tip. [INTEGRATION.md](INTEGRATION.md) gives adoption on Kyler's yes and exact
regeneration commands. Bulk JSON, individual renders and trials stay gitignored in
`investigation/lake-basin-variety/local/` (D195); no runtime estimate was measured.
