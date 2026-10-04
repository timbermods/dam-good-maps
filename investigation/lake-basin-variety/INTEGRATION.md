# Lake Basin variety: round 3 milestone hand-back

Await Kyler's yes on the [round 2 / round 3 sheet](../../docs/sheets/lake-basin-variety-r3-128.jpg).
Central rounded blobs still remain on seeds **7, 10, 13, 17 and 21**; 25 is rounded but
off-centre. This PR contains investigation evidence, not an automatic product adoption.

Base: `dev` at `2db8f5d36e41f2e085945fda62900f6e01453df3`, after rebasing round 2.
`adoption.patch` changes **only `src/core/land/lakeBasin.ts`**. On Kyler's yes, the milestone
session can apply its zero-context hunks at that base:

```powershell
git apply --unidiff-zero investigation/lake-basin-variety/adoption.patch
```

If dev moves, port into that module while preserving intervening work. `prototype.ts`
is the identical implementation with investigation-relative imports. Product code must
never import the investigation. The existing shaping call stays after settings/intentions
and before `makeField`, orientation, snapping and the first land display (D348, D370).
D464's unconditional Lake Basin entry point remains; other themes return immediately.
Explicit Rivers (including zero) and the existing Lakes budget lean remain respected.
No shared field, drainage, rasterizer, settle, placement or validation change is needed.

Adoption note from source inspection: `tests/unit/lakeBasin.test.ts` currently asserts
exactly one `shape: 'valley'` basin. That representation is replaced by warped hollows,
intervening ridges and one compact round inner reach. The milestone session must revise
that structural assertion to express the new terrain construction while retaining its
settings/difficulty/size/other-theme invariants. That suite was not run or changed here;
the requested adoption patch remains limited to the one shaping module.

Validation here: Normal preset, 128², seeds 1–30; both outcomes and channel straightness
30/30, five straightness unit tests passing, and 180 non-Lake-Basin genomes unchanged.
No further suites, size/settings/sibling batches or speed measurements were run.

Regenerate from the pinned dev base with this investigation and locked dependencies:

```powershell
npm ci --ignore-scripts --no-audit --no-fund
node investigation/lake-basin-variety/audit.cjs round2
node investigation/lake-basin-variety/audit.cjs after
python investigation/lake-basin-variety/sheet.py after
node node_modules/vitest/vitest.mjs run tests/unit/straight.test.ts --project quick
node investigation/probe/run.cjs ../lake-basin-variety/genomes.ts
```

`round2.ts` is the exact prototype Kyler judged at original commit
`e05cd25e062aaed4309410e41132ee525ba56ece`. Engine code is unchanged between its original
dev base and this rebased base, so its captured baseline is retained without another
identical generation run. The audit substitutes `round2.ts` or `prototype.ts` only for
Lake Basin shaping. It loads `m9b/measures.ts` in memory with its clocks/CPU sampling and
timing fields removed, and uses the same generated map for each image and channel reading.
All 60 individual renders and bulk JSON stay in `investigation/lake-basin-variety/local/`.
The sheet uses Pillow, 256 px per map, north up, red start and purple contaminated water.
The small `counts-r3.csv` records the requested outcomes and channel readings; original
`counts.csv` and the original sheet retain the previous dev / round 2 comparison.
