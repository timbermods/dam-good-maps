# Lake Basin investigation

Read [REPORT.md](REPORT.md) for the adoption verdict and [INTEGRATION.md](INTEGRATION.md) for the
hand-back. Round 2 uses shared core `e292cefe30469033a922650f0455f87297c051d5`, merged into
`investigation/lake-basin`. Product files are imported read-only; the adoption diff is prepared
in memory and has not been applied. Raw terrain, individual images and traces stay in ignored `local/`.

`round2.ts` is the current shaping candidate. `prototype.ts`, the unprefixed evidence files and
`current-*` preserve Round 1 on `da464922` and `65b759d0`; they are historical, not Round 2 results.
To reproduce those exactly, use their pinned core and the scripts from investigation commit `2bdfa83a`.

## Regenerate Round 2

Use an existing dependency tree containing TypeScript 5.9 and fflate 0.8.3; Python needs Pillow.
From the repository root in PowerShell:

```powershell
$env:LAKE_DEPS = 'C:/path/to/existing/node_modules'
node investigation/lake-basin/run.cjs --mode baseline --out investigation/lake-basin/local/round2-baseline --jobs 1
node investigation/lake-basin/run.cjs --mode baseline --out investigation/lake-basin/local/round2-baseline --analyze
python investigation/lake-basin/export.py round2-baseline
python investigation/lake-basin/sheet.py investigation/lake-basin/local/round2-baseline investigation/lake-basin/round2-baseline.png

node investigation/lake-basin/run.cjs --mode round2 --shape ./round2.ts --out investigation/lake-basin/local/round2-prototype --jobs 1
node investigation/lake-basin/run.cjs --mode round2 --out investigation/lake-basin/local/round2-prototype --analyze
python investigation/lake-basin/export.py round2-prototype
python investigation/lake-basin/sheet.py investigation/lake-basin/local/round2-prototype investigation/lake-basin/round2-prototype.png

node investigation/lake-basin/check.cjs
# Expected nonzero until the seed-37 unchanged-land finding in REPORT.md is resolved:
node investigation/lake-basin/run.cjs --check
python investigation/lake-basin/verify-evidence.py
python investigation/lake-basin/make-patch.py
git apply --check --ignore-space-change investigation/lake-basin/adoption.patch
```

Each batch defaults to sizes 96²/128²/256², seeds 1–20, Normal, default settings, first maps only.
The runner calls unchanged `investigation/m9b/measures.ts`; failed generations stay in the
denominator. It never launches Timberborn. `--sizes` and `--seeds` select diagnostic subsets.

The sheet is north-up, with P/S/W for the product's promise/standout/readable-water outcomes;
PASS means the existing validator passed. Yellow marks clean sources, orange badwater, red the
start. The CSV preserves each miss, lake fill, courses, shores, timing and start resources.
Cause labels include diagnostic inferences, not just proofs. Outcome thresholds are unchanged.

`central_feeders` is an additional information line: largest wet lake ≥4% of the map, centroid
within 18% of the side from the centre, no second lake >60% of its size, and three directed
feeding river heads connected to its dominant wet system. Heads may merge upstream; they are
not necessarily three separate shore mouths. Round 2 excludes badwater and repair springs and
uses the lake's dominant wet label, avoiding a stray wet shore tile. Historical counts retain
Round 1's definition. Shore shallows are 0.1–1.2 deep; beaches are adjacent dry tiles no more
than 1.2 above the water. These are information, not replacements for Kyler's eye.

Wall time is on the shared PC. M9b's CPU-scaled times remain unchanged in the summaries. Direct
CPU times, when recorded, use process counters at the actual `onLand` and `objects` callbacks
(the latter immediately follows the core's first-water timestamp), avoiding a whole-run CPU
ratio applied to stages with different contention. CPU time is not wall latency. Negative
water times are excluded, not treated as instant maps. Quantiles use M9b's upper-middle and
floor(0.9*n) convention. Check `directCpu.maps` before comparing that subset.

## Shared-cost observation

For a cost breakdown, set `LAKE_TIMES` to an ignored JSON path before a worker run;
`timings.ts` observes shared calls without changing arguments or results. Unset it for timings
used in the report. Regeneration writes only investigation files. CRLF checkouts need
`--ignore-space-change` when checking the LF adoption diff.

```powershell
$env:LAKE_TIMES = 'investigation/lake-basin/local/round2-cost-7.json'
node investigation/lake-basin/run.cjs --worker --mode round2 --shape ./round2.ts --out investigation/lake-basin/local/round2-cost --one lakeBasin:7 --size 256
Remove-Item Env:LAKE_TIMES
python investigation/lake-basin/cost-evidence.py
```

This records the first-land boundary and hashes every actual drought input, proving repeated
calculations on equal inputs. Hashing and log writes are excluded from each call's timer but
included in whole-map time; the observed run is excluded from the outcome timing batch. The
observer must produce the same export hash as the canonical 256/7 capture before evidence is
saved. For a repeat of the full 256² outcome check, rerun with `--sizes 256` into a separate
ignored folder; compare each capture's `sha256`, never its timing fields.