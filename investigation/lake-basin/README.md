# Lake Basin investigation

Read [REPORT.md](REPORT.md) first. The prototype is exploratory, **not ready for adoption**.
Only this directory changes. Product code is imported read-only. Generated fields, per-map PNGs,
and traces live in ignored `local/`; the committed sheets and CSVs are small summaries.

The audit starts at `feature/m9b` commit `da46492225cecc57530a7ffe21a5a30f0d89cc73`.
The second check uses `65b759d013d8bf6c2aeec6341a202f8dbe5152ce`, which arrived during the investigation.
Seeds 1–20, default Lake Basin settings, Normal, 96²/128²/256². No background siblings are chosen.
An exhausted generation counts as a failure, with unavailable outcomes counted false.

## Regenerate

Use the checkout's installed dependencies, or set `LAKE_DEPS` to an existing `node_modules`
containing TypeScript 5.9 and fflate 0.8.3. The runner uses M9b's unmodified `measures.ts` for every
map. It launches Node workers, never Timberborn. Python needs Pillow for the sheets.

From the repository root (PowerShell):

```powershell
$env:LAKE_DEPS = 'C:/path/to/existing/node_modules'
node investigation/lake-basin/run.cjs --jobs 2
node investigation/lake-basin/run.cjs --analyze
python investigation/lake-basin/export.py baseline
python investigation/lake-basin/sheet.py investigation/lake-basin/local/baseline investigation/lake-basin/baseline.png

node investigation/lake-basin/run.cjs --mode prototype --jobs 2
node investigation/lake-basin/run.cjs --mode prototype --analyze
python investigation/lake-basin/export.py prototype
python investigation/lake-basin/sheet.py investigation/lake-basin/local/prototype investigation/lake-basin/prototype.png

node investigation/lake-basin/check.cjs
node investigation/lake-basin/run.cjs --check
node investigation/lake-basin/run.cjs --worker --trace --out investigation/lake-basin/local/evidence --one lakeBasin:14 --size 96
```

For the newer-core comparison, make a detached checkout of the second hash under
`investigation/lake-basin/local/`, copy only this directory's `.ts`, `.cjs`, and `.py` files into
its `investigation/lake-basin/`, and run the same commands there. Keep its results labelled by the
second hash; copying the small CSV/summary/sheet back does not change product code. The committed
`current-*` files are that comparison, not a replacement of the original audit.

In that newer checkout, run `run.cjs --worker --mode prototype --out
investigation/lake-basin/local/source-proof --one lakeBasin:13 --size 96` and the baseline
trace command above with `--out investigation/lake-basin/local/evidence-current`.
From the original checkout, `python investigation/lake-basin/evidence.py PATH_TO_NEWER_CHECKOUT`
regenerates the compact shared evidence.

`baseline.csv` records every seed's outcome failures and composition misses, with lake fill,
river roots, dry course samples, and thin water outside lake outlines as evidence. These are
diagnostic readings, not new product acceptance gates. The sheet's P/S/W labels are the existing
promise/standout/readability checks. Yellow is a source, red the start. No resource overlays.

`central_feeders` is additional composition information: largest wet lake ≥4% of the map,
centroid within 18% of the side from the centre, no second lake >60% of its size, and at least
three directed feeding heads connected by wet tiles. It is intentionally stricter than the
product's area-only promise; it is not a substitute for Kyler's eye. A head is a tributary in the
directed network, not necessarily a separate mouth on the lake's shore. Shallows count shore
water 0.1–1.2 deep; sub-0.1 sheets are not counted as useful shallows.

Times are wall time on the shared PC with two workers. The summaries also preserve M9b's
CPU-adjusted timings. Negative first-water times mean no playable map, not instant water; they
are excluded from timing percentiles and counted in `timedWaterMaps`. Percentiles use the batch
measure's upper middle / floor(0.9*n) convention.
