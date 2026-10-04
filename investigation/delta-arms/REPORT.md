# Delta arms

Base: dev `f1a87b54c933540b9dd20179216ba09ec734122b`. Adoption awaits Kyler's visual yes on [the sheet](../../docs/sheets/delta-arms.png): all 30 seeds, dev beside after, each map 256 × 256 px.

Delta's arms now seek low ground inside their seeded fan, then meander independently. Their banks use the rivers' existing noisy erosion; flat reaches can split round an island and rejoin. Apex, mouth slots, spread, lean and arm count keep their seed-dependent rules. Channels remain narrower than the main river (55% nominal width, minimum 2.4 tiles); ground between them remains above the bed. Everything happens in Delta's pre-display hydrology; product files and shared algorithms were not edited.

Bending exposed unequal bed drops and dry apex ledges. The patch aligns **all** fan beds by downstream position rather than unequal arc lengths, cuts the entrance from the actual apex ground (one level down, respecting BED_FLOOR), and extends D447's bed correction to Delta's main river where arms cross it. Early variants introduced water/promise regressions; those variants are not the delivered patch.

Only the requested checks ran: default Delta, 128², seeds 1–30, the exact promise/water projection from `investigation/m9b/measures.ts`, and `straightness`/`tooStraight` from `src/core/analysis/straight.ts` on settled water. No timing collection or additional suites.

| Check | dev | After |
| --- | ---: | ---: |
| Delta promise | 25/30 | **30/30** |
| Water outcome | 29/30 | **30/30** |
| Straightness passes | 30/30 | **30/30** |
| Longest measured bank / paired canal, tiles | 37 / 20.89 | 30 / 20.72 |

Before: promise misses 7, 9, 26, 27, 29; water misses 27. After: no misses. Per-seed readings: [counts.csv](counts.csv).

**Shared limitations, left unchanged:** today's ruled-looking arms already pass straight.ts because it measures individual wet bank runs, not arm centreline directions or a fan's repeated angles. Width noise interrupts contours; borders and broad water are excluded. The longest bank/canal stays below its 44/34.28 limits. Also, waterStory samples river features, not each separate fan arm; its green result alone is not a per-arm wetness guarantee. The sheet is the requested visual evidence. Other sizes, settings and long-term water behaviour remain outside this investigation's checks.

Regenerate from the pinned base with root dependencies installed (Node 22+, Python with Pillow):

```powershell
node investigation/delta-arms/build.mjs
node investigation/delta-arms/run.mjs before
node investigation/delta-arms/run.mjs after
python investigation/delta-arms/sheet.py
```

Inputs are BASE.json and default seeds 1–30 at 128². Allow a few minutes for the pair of runs and sheet; this is a scheduling estimate, not a speed measurement. Bundles, full maps, plans, PNGs and intermediate results stay in ignored `local/`. Only the small readings, code, patch and 0.83 MiB sheet are committed. The sheet uses the product's own terrain shading; no external assets.

The user-supplied theme critique guided this work. Its PR #211 report/captures were not fetched: automatic approval review rejected that read under AGENTS.md's prohibition on reviewing GitHub PRs.
