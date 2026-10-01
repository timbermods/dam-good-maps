# Highlands adoption

Baseline: `feature/m9b` at `da46492225cecc57530a7ffe21a5a30f0d89cc73`.
This branch contains investigation files only. Take its investigation commit(s), then evaluate
`adoption.patch` separately; merging this PR is not the adoption procedure.

## Proposed change

The patch adds a small-map Highlands-only prior selected in `drawGenome`, after the existing
priors have been constructed. At 96² and below, its rivers carry more water (1.8–2.8 versus
0.9–2.2), incise further (2.5–4.5 versus 1.5–3.5), and clear more bank room (1–4 versus 0–3).
The change tapers linearly between shortest sides 96 and 128; sides 128+ retain the original
prior exactly. Only 96² is newly measured here; intermediate/smaller sizes need adoption checks.
The existing land processes supply the plateaus, irregular
outlines, bed steps and natural slopes. There is no new template, acceptance threshold, retry,
post-display terrain edit or water repair.

**Keep the override outside `P`.** Any averages `P`; editing the original Highlands entry would
change Any as well. `verify.cjs` compares 162 draws and settings applications across the other
themes, three sizes, three seeds and three Verticality values, including Any, plus 18 unchanged
larger Highlands comparisons. `reuse.cjs` verifies another 357 baseline/candidate draws and
settings applications covering the accepted attempt and all preceding attempts at 128²/256².

The shared findings in REPORT.md need M9b's shared solutions. The patch includes none of them.
**Hold adoption until timing and shared absolute failures are resolved.** The measured
CPU-adjusted 96² first-land median increases from 2.46s to 3.41s. This is a shaping prototype,
not a claim that M9b's performance/D348 requirements pass. No acceptance threshold is lowered.
It changes small default Highlands maps: M9b owns the version decision, deliberate re-pin, living-doc
update and any in-game checks needed for adoption.

## Reproduce without editing product code

From the repository root, with Node 22+ and Python with Pillow:

```powershell
npm --prefix investigation/highlands install
node investigation/highlands/audit.cjs
node investigation/highlands/audit.cjs --prototype --sizes 96
node investigation/highlands/reuse.cjs
node investigation/highlands/enrich.cjs
node investigation/highlands/enrich.cjs --prototype
python investigation/highlands/summarize.py before
python investigation/highlands/summarize.py after
python investigation/highlands/causes.py before
python investigation/highlands/causes.py after
node investigation/highlands/verify.cjs --maps
```

The after sheets/CSV at 128² and 256² reuse the exact baseline arrays, outcomes and timings,
explicitly labelled in the CSV; they are not a second run. To independently regenerate them,
omit `reuse.cjs` and run `audit.cjs --prototype --sizes 128,256` instead.

The audit resumes existing results. Use a fresh checkout or move `local/before` and `local/after`
aside before a fresh run. Optional `--sizes 96,128,256 --count 20` selects the batch. `DGM_DEPS`
may point to an existing directory containing TypeScript 5.9.3 and fflate 0.8.3, avoiding an install.
Workers run sequentially; each calls the unchanged `investigation/m9b/measures.ts --one`.
Captures are written after measurement. No game is launched.

Large JSON captures, individual maps and rejected trials remain in ignored `local/`.
The committed CSVs include every seed's outcome, failed check, cause and timing; the six small
contact sheets show the same first maps (north up; red start; purple badwater).
Clean fall tiles are read from settled water with `analysis/vertical.ts`, not from planned drops;
their count is information, not a new gate. `verify.cjs --maps` repeats 96² seed 1 and compares
the full file's SHA-256. Timings exclude capture/render work, include the unchanged plan screen
and subsequent first-map repairs; medians are conventional medians, p90 is nearest rank.

## Patch regeneration and adoption

```powershell
node investigation/highlands/prototype.cjs
python investigation/highlands/patch.py
git apply --check investigation/highlands/adoption.patch
```

The prototype transforms TypeScript in memory; the emitted patch is that exact transformation.
Only the M9b agent should apply it to product code, after assessing REPORT.md, reconciling the
shared fixes and meeting the timing targets. Re-run the 60-map audit and M9b's map-changing checks
on the integrated result. A broad river-prior trial regressed 128² and was discarded; it is not
in this patch. The smooth taper is a reasonable interpolation, not a measured result.
