# River Valley flood sheets: round 2

The round-2 set keeps the flood-sheet gain and fixes the three follow-up seeds. **Promise: 30/30. Readable water: 30/30. Sheets: two of thirty, still seeds 19 and 24.** Seed 19 retains its intentional impounded lake; 24 retains the shallow lower-river bay counted conservatively in round 1. No additional sheet is counted in round 2.

Work remained in the dedicated `dam-good-maps-rivervalley` clone, on `investigation/river-valley-sheets`. Product files remain unchanged. [adoption.patch](adoption.patch) is the complete proposed change, now against round 2's fetched **dev tip `3f16eedeabaaaa5974f09913ff9f0b75d7232baf`**. That tip's product source is identical to round 1's starting `2db8f5d36e41f2e085945fda62900f6e01453df3`; intervening changes were documentation, workflow and test tooling. The branch retains the original investigation commit `f7051698` as its round-1 baseline. Date: 2026-10-04.

The [round-1/round-2 sheet](../../docs/sheets/river-valley-sheets-r2-128.jpg) shows all thirty seeds, round 1 left and round 2 right, exactly 256 pixels per map, north up, red start and purple badwater. The [opening-camera pairs](opening-3d-r2.jpg) show seeds **6, 12 and 27** in that order, round 1 left and round 2 right. The original [dev/round-1 sheet](../../docs/sheets/river-valley-sheets-128.jpg) and [six opening-camera pairs](opening-3d.jpg) remain for reference. All images come from the repository's own generator/editor and contain no imported assets.

## Three regressions

**12: a valley with clean start water.** The first round's trunk occupied one corner; its planned water passed the shared screen, but the settled map failed readability. River Valley's default trunk now enters from an edge and crosses at least half a map side in its traced extent. A short corner course cannot substitute for that trunk. An explicit Rivers setting, including zero, retains its existing control; an intended full-map escarpment can keep a shorter corner course rather than sacrifice its split. This is a route qualification inside River Valley hydrology, with no seed-specific rule and no change to shared promise/story thresholds.

Seed 12 now selects a later valley field instead of the bare first field. Its river occupies a broad valley with tributaries, visible in the opening camera. Read-back main-system share rises from **52% to 90%**, and clean-water reach from **36% to 49%**; both promise and readability pass. The nearest stored contaminated water is **27.29 tiles** from the start (Euclidean, water over 0.05 and contamination at least 0.05), against **4 tiles** in round 1. The existing start checks also pass: clean pumpable shore **2 tiles' walk**, badwater/affected-ground distance **22**, above the default target of 15. A clean water tile at least 0.5 deep is 11.05 tiles away geometrically. The badwater stream planner and names are untouched; the safer result comes from the changed valley/start candidate. This is evidence for this seed, not a new global badwater-distance guarantee.

**6: natural outlines.** The former accepted map was a spring-only plan with two square-edged pools beside its course. Requiring the default entering trunk moves it to an edge-fed, winding river in a broad floor. The pools are gone, rather than cosmetically hiding their straight sides. Readability and promise pass, and the opening camera shows a natural river outline. No shared outlet-widening or pond-shore code was changed.

**27 and 5: restore the cliff splits.** On a River Valley field drawn for `under-cliff` or `upper-lower`, hydrology now compares two deterministic river plans on copies of the same field. It retains the plan with the longer connected cliff of 3+ levels, using the existing character check's geometry (allowing two-tile gaps); ties keep the first. A full-map `upper-lower` escarpment also caps natural-ramp propensity at 0.1 so cleanup leaves the split for stairs. This bounds the choice to two plans; it creates no cliff template or wall, and both plans run before first land. Other themes execute the original single plan.

| Cliff control | Dev | Round 1 | Round 2 |
| --- | ---: | ---: | ---: |
| Seed 5 | 88% | 83% | **88%** |
| Seed 27 | 99% | 72% | **99%** |

Both splits survive on the final exported terrain, not just the hydrology intermediate. The route choice can change River Valley's selected candidates and starts elsewhere in the thirty-map set; the complete comparison is provided rather than limiting evidence to the three fixes.

## Keep the gain

Round 1's descending trunk grade through incidental hollows and reconciliation of large spent lake masks remain intact. Intentional plugged lakes keep their impoundment. Compact ponds, existing meander/tributary construction, width variation and oxbow construction remain in place. **Seeds 21 and 22 have identical exported terrain, stored water, contamination, features and start to round 1** and still read as rivers from the opening camera. Seed 23's corresponding fields are also identical: its **251-tile oxbow still keeps 73% through a nine-day drought**.

Every adoption edit is in `src/core/land/hydro.ts`, conditional on River Valley behavior. No shared lower-shelf, outlet, start/badwater planner, name, promise threshold or water-story threshold is changed. Other themes' drawn and Normal-leaned genomes match exactly. River Valley's full-scarp ramp propensity is deliberately changed during its own shaping; this is not a claim that its complete effective genome is unchanged.

## Read-back and verification

Seeds 1-30, 128 x 128, **Normal**, same default settings and existing outcome measures. Each generated map is exported to `.timber`, decoded with `readTimber`, and measured on its stored terrain, water and contamination.

| Measure | Dev | Round 1 | Round 2 |
| --- | ---: | ---: | ---: |
| Theme promise | 29/30 | 30/30 | **30/30** |
| Readable water | 28/30 | 28/30 | **30/30** |
| All three outcomes | 27/30 | 28/30 | **30/30** |
| Passing generated/exported maps | 30/30 | 30/30 | 30/30 |
| Exactly one first land, unchanged thereafter | 30/30 | 30/30 | 30/30 |
| Exported terrain identical to built terrain | 30/30 | 30/30 | 30/30 |
| Visually counted sheets | 6/30 | 2/30 | **2/30: 19, 24** |

Dev misses readability on 9 and 27, round 1 on 9 and 12; round 2 has no readability or promise misses. Small evidence is committed in [measures-r2.json](measures-r2.json) and [regressions-r2.json](regressions-r2.json); the original [measures.json](measures.json) records round 1. Complete fields, exports and rejected trials remain in `local/`.

- Adoption source typecheck passes; `git apply --check` passes, and patch generation verifies the branch's untouched hydrology source equals the declared dev base.
- Focused tests: **5 files / 18 tests passed**, including `tests/unit/straight.test.ts`, genome, river-sheet, first-land and four new regression checks for 6, 12, 5 and 27. Tests use at most four workers. Seed 6's automated test covers its entering-trunk selection; pond outlines and sheet counts are judged from the supplied images.
- Other-theme genomes match across seeds 1-30 and attempts 0-8: **1,620 genomes per mode**. Six theme hashes are committed.
- Ten opening-camera imports/captures (6, 12, 27, plus the preserved 21 and 22 in each round) have zero page errors. Captures use the unchanged editor, exact exports, reset camera and fixed lighting, with no orbit adjustment. The extra 21/22 captures stay local.
- Generation batches and browser pages ran sequentially. No speed measurement or benchmark was taken. Large results remain gitignored in `local/` under D195.

[Shared findings](SHARED_FINDINGS.md) remain separate and unfixed for shared code. Validation covers the requested 128-square Normal set and focused tests, without an in-game probe or a guarantee for all settings and sizes. `docs/PERFECT.md`'s Maps/Water criteria guide the visual reading: natural courses, distinct features, describable character, inviting ground and readable water.

## Source limitation and reproduction

The requested theme-critique report and capture were absent from the starting dev tip and remain absent from round 2's fetched dev tip. The supplied critiques, fresh baseline exports and paired captures were used. See [INTEGRATION.md](INTEGRATION.md) for exact reproduction and adoption commands. Product source is never written during reproduction; the transformation and compiler host apply the proposal in memory.
