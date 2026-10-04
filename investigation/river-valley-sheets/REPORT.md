# River Valley: flood sheets

Base: `dev@2db8f5d36e41f2e085945fda62900f6e01453df3`, the dev tip fetched when this investigation started. Date: 2026-10-04. Work was done only in the new `dam-good-maps-rivervalley` clone. Product files are unchanged on this branch; [adoption.patch](adoption.patch) contains the proposed product change.

The after set has **two sheets out of thirty: seeds 19 and 24**, counted conservatively. Dev's six named sheets were 5, 12, 19, 21, 22 and 26. Five of those six now read as channels. Seed 19 keeps its intentional impounded lake and is still counted as a sheet top-down, even though the opening camera reads it as a lake. Seed 24 is a new residual broad, shallow bay on the lower river. Its large spent lake shelf is removed, but I still count the remaining bay against the two-map allowance. This is not a claim that every wide body of water is a sheet: the compact outlined ponds, the curved lake on 23, and the bounded lake chain on 28 are distinct features.

See [all 30 pairs](../../docs/sheets/river-valley-sheets-128.jpg), dev left and after right in each pair, exactly 256 pixels per map, north up, red start and purple badwater. The [six opening-camera pairs](opening-3d.jpg) use the editor's reset/opening 3D camera, with no orbit adjustment. All maps and captures were generated from this repository's generator and editor; no external maps or assets were imported.

## What changed

The existing meanders, width variation, tributary tracing, broad valley floor, genome draws, random streams and oxbow construction remain in place. The River Valley trunk keeps a descending channel grade through incidental hollows: a lake cannot reset its downstream bed above the incoming channel. Intentional plugged lakes retain their impoundment, so storage remains a possible character rather than being drained indiscriminately.

After all courses are carved, River Valley checks the physical spill levels of its planned lakes. When more than 2% of the map is a spent, open shelf inside a lake's old mask, only its remaining closed core stays marked as a lake. Channel membership is restored through the removed shelf. Compact ponds and oxbows retain their outlines. This prevents the later shared shelf operation from treating a large drained floodplain as the floor of standing water.

Both operations run inside `planHydro`, before land-stage cleanup, screening, preparation and `onLand`. There is no post-display terrain correction in this patch. Every behavior change is conditional on River Valley; the genome and the other themes' behavior are untouched. There are no seed-specific rules. No badwater-line or map-name code is changed.

## Read-back results

Seeds 1-30, 128 x 128, **Normal** (`makeSpec` with `designedFor: "normal"`), unchanged product thresholds. Each map is exported to `.timber`, decoded with `readTimber`, and measured with the existing `outcomesOf` on its stored terrain, water and contamination. The small per-map evidence is [measures.json](measures.json); complete fields, maps and trial results stay in `local/`.

| Measure | Dev | After |
| --- | ---: | ---: |
| Theme promise | 29/30 | **30/30** |
| Readable water | 28/30 | **28/30** |
| All three outcomes | 27/30 | **28/30** |
| Passing generated/exported maps | 30/30 | 30/30 |
| Exactly one first land; final terrain identical to it | 30/30 | 30/30 |
| Exported terrain identical to built terrain | 30/30 | 30/30 |
| Visually counted sheets | 6/30 | **2/30** |

The readable-water count is preserved in aggregate, not seed by seed. Dev misses 9 and 27; after misses **9 and 12**. Seed 12's earlier selected candidate is now river-shaped, but its main system holds only 52% of clean wet tiles and three tributaries fail the joining measure. Seed 9 still has separated/incompletely wet courses. These misses are disclosed, not hidden by a new threshold. Seed 7 gains the valley promise. A changed screen result can select an earlier candidate or a different course even though the genome draws and random streams themselves are unchanged.

The named character controls survive:

| Character | Dev | After |
| --- | --- | --- |
| Seed 23 oxbow | 251-tile curved lake; keeps 73% through a nine-day drought | **Same size and retention**, still recognized as an oxbow |
| Seed 5 cliff split | Longest 3+ level cliff spans 88% | **83%**, still an upper/lower-world split; same selected attempt |
| Seed 27 cliff split | Cliff spans 99% | **72%**, still an upper/lower-world split; an earlier candidate is selected |

The final after water still shows winding trunks and joining branches across the set. The broad, dry floors provide building space rather than being erased to make the water narrower. The work was judged against `docs/PERFECT.md`'s Maps and Water sections: natural courses, different water stories, describable character, inviting building ground and readable water.

## Verification and scope

- `node investigation/river-valley-sheets/typecheck.cjs`: adoption source typechecks without writing product files.
- `node node_modules/vitest/vitest.mjs run --config investigation/river-valley-sheets/vitest.config.ts --maxWorkers 4`: **4 files / 14 tests passed**, including `tests/unit/straight.test.ts`, genome, river-sheet and first-land tests. The Vite loader transforms the adoption source in memory.
- `git apply --check investigation/river-valley-sheets/adoption.patch`: passes against the pinned base; patch is not applied to this branch.
- Other-theme drawn and Normal-leaned genomes match exactly for Any, Canyon, Highlands, Lake Basin, Delta and Islands, seeds 1-30, attempts 0-8 (1,620 genomes per mode). Hashes are in `measures.json`.
- Twelve exported-map imports opened in the unchanged editor and were captured with zero page errors. Water was not regenerated for the after captures: they show the stored after exports.
- No timing comparisons or speed measurements were collected. Generation batches ran sequentially. Tests used at most four workers; captures used one browser page at a time.

[Shared findings](SHARED_FINDINGS.md) are reported separately. None is fixed for shared code or other themes. Validation here covers the requested 128-square Normal set and the focused first-land tests; it is not an in-game probe or a claim about every setting/size.

## Source limitation

The requested `investigation/theme-critique/REPORT.md` and `captures/rv-sheet-lakes.jpg` do **not exist at the starting dev tip**. A final fetch of dev also had no files under `investigation/theme-critique/`. Therefore neither could be read or inspected. The supplied six-seed critique in the task was used, together with fresh paired baseline exports and opening-camera captures. `docs/PERFECT.md`'s Maps section and the investigation size rule in `investigation/README.md` were read.

## Regeneration

See [INTEGRATION.md](INTEGRATION.md) for exact commands. Large outputs, including all `.timber` files, bulk JSON, individual images, rejected trials and the editor build, are gitignored under `investigation/river-valley-sheets/local/` (D195). Committed results are two JPEG sheets, this report, integration notes, small measure evidence, the patch and the reproduction tools. Runtime was deliberately not measured, as requested; regeneration comprises two sequential 30-map batches, twelve editor imports/captures and the focused test run.
