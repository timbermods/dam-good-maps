# Canyon candidate: retain a main inflow

Status: **hold adoption pending shared D348/routing/measurement work and speed validation**. See REPORT.md. This is a small Canyon-only candidate, not a release-ready fix. No shared fix is embedded.

Take only this investigation's commit from `investigation/canyon`; its ancestry starts on `feature/m9b`, not `dev`. Do not merge the branch wholesale. All committed files are under `investigation/canyon/`.

## Adoption boundary

`adoption.patch` adds a guarded adjustment at the end of `src/core/land/genome.ts`'s `leanGenome`, after settings have been applied:

```ts
if (g.theme === "canyon" && s.water.rivers > 0) g.hydro.inflows = Math.max(1, g.hydro.inflows);
```

It matches the runtime hook in `prototype.ts` exactly. It keeps the seeded land parts, wall heights, terraces, side valleys, floors, resource requirements, candidate policy and water engine. Rivers: 0 and other themes keep their exact genomes. An explicitly requested river count above zero is already at least one. This does not force a source to survive D171's shared removal.

From the repository root, the M9b agent can inspect applicability with:

```sh
git apply --check investigation/canyon/adoption.patch
```

After fixing the shared findings, compare the same seeds and sheets, including regressions 96²/15 and 256²/18. Require zero validator failures and no unexplained post-display terrain changes, check practical starts and Canyon character by eye, and measure D333's speed on a quiet machine. Do not change the promise threshold to make this candidate pass. If adopted, M9b updates its living generation documentation/progress and coordinates the generator version and single re-pin under D308. The investigation changes neither.

## Regenerate

Use Node 22+ and Python with Pillow. Commands below run headlessly and do not launch Timberborn. Run them at this investigation's recorded base commit; newer product code constitutes a new experiment.

```sh
npm install --prefix investigation/canyon/local --no-audit --no-fund typescript@5.9.3 fflate@0.8.3
node investigation/canyon/run.cjs --label before
node investigation/canyon/run.cjs --label after
python investigation/canyon/summarize.py --label before
python investigation/canyon/summarize.py --label after
node investigation/canyon/run.cjs --entry investigation/canyon/diagnose.ts
node investigation/canyon/run.cjs --label verification --entry investigation/canyon/verify.ts
python investigation/canyon/evidence.py
git apply --check investigation/canyon/adoption.patch
git diff --check
```

`run.cjs` transpiles the unmodified product and calls `investigation/m9b/measures.ts`. Its only generation hook is `shapeCanyon` after `leanGenome` when `--label after` is selected. Captures happen after generation; `ms.land` and `ms.water` are the product's timings. The measure's final wall time includes capture overhead and is not used as a speed claim. `--sizes 96,256` can run a subset; a single-size worker uses `--size 128 --one canyon:1,canyon:2`. Run timings sequentially without other heavy work.

Full per-map terrain/water arrays, JSON details, individual renders, JSONL measures, summaries and verification hashes are under gitignored `local/`. Only the small CSV, six labelled sheets (each below 1 MB), code, patch and notes are committed. The earlier rejected strength trial remains in `local/strength-trial/`; it multiplied Canyon incision by 1.35 and floor by 0.75, failed to improve the 128² combined count, and is not part of the candidate.

`diagnose.ts` uses the recorded arrays to locate changed terrain, identify wet systems and dry course samples, and compare the existing radius-6 cliff reading with a radius-12 diagnostic. The wider reading is never used to accept a map. The RGB sheets use the product's top-down shading: red marks the start, purple badwater. They show the settled first map, while `local/*/*-tiles.json` also keeps the actual first shown terrain for D348.
