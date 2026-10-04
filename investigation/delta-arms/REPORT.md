# Delta arms, round 2

Base remains dev `f1a87b54c933540b9dd20179216ba09ec734122b`. [The sheet](../../docs/sheets/delta-arms.png) now shows **dev beside round 2**, seeds 1–30, each map 256 × 256 px; round 1 is dropped. Read the Delta report section and both requested pictures from git branch `investigation/theme-critique`, sha `aab3626abdacf93e00a050f2998f182efe856dde`.

Round 1's narrow corridors still followed apex-to-mouth rays. Round 2 gives each arm a broad curved corridor with its own departure angle, phase and turning length; terrain chooses the path inside it. Bends grow to 8–16 tiles where the fan has room, at the rivers' scale. Forward progress toward the outlet edge prevents turns escaping the fan, while neighbouring courses diverge, converge and braid. Seeds 1, 8 and 13 visibly lose the ruled set; braided channels remain on 18, 22, 24 and 28. The seeded apex/mouth layout, narrower variable widths, eroded banks and flat-reach braids are retained.

The wider turns exposed a lake-floor mismatch that round 1 sometimes corrected accidentally by crossing the main course. Delta's main bed now follows actual lake floors **before** drawing arms. Keep round 1's common downstream beds, apex incision and D447 correction together. All changes are Delta-only and happen before land is shown; product files and shared helpers remain unchanged.

Only the requested checks ran: default Delta, 128², seeds 1–30, the exact promise/water projection from `investigation/m9b/measures.ts`, and `straightness`/`tooStraight` from `src/core/analysis/straight.ts` on settled water. No timing collection or additional suites.

| Check | dev | Round 2 |
| --- | ---: | ---: |
| Delta promise | 25/30 | **30/30** |
| Water outcome | 29/30 | **30/30** |
| Straightness passes | 30/30 | **30/30** |
| Longest measured bank / paired canal, tiles | 37 / 20.89 | 30 / 20.72 |

Before: promise misses 7, 9, 26, 27, 29; water misses 27. Round 2: no misses, preserving round 1's 30/30 counts. Per-seed readings: [counts.csv](counts.csv).

**Shared issues, not fixed:** straight.ts measures wet bank contours, not repeated arm axes; noisy banks, borders and broad water exclusions let today's straight-looking arms pass its 44/34.28 limits. waterStory samples river features rather than every arm. The shared lake outlet profile can also stand above its actual floor; this patch adapts only Delta's stem, not that shared profile calculation. Open: Kyler's visual yes; the critique's apex blobs/badwater are outside this arms round. Other sizes/settings and long-term water were not checked.

Regenerate from the pinned base with root dependencies installed (Node 22+, Python with Pillow):

```powershell
node investigation/delta-arms/build.mjs
node investigation/delta-arms/run.mjs before
node investigation/delta-arms/run.mjs after
python investigation/delta-arms/sheet.py
```

Inputs are BASE.json and default seeds 1–30 at 128². Allow a few minutes, not timed. Bundles, maps, reference pictures and intermediate results stay in ignored `local/`. Only code, small readings, the patch and the sheet (under 1 MiB) are committed. The sheet uses the product's original shading; no external assets.
