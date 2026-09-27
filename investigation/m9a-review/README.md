# M9a review set

Kyler's review set for M9a (PLAN §20 D252 (2)), made from the frozen generator at commit
`788c145` on `feature/m9a` (a re-freeze after `ca63a56`'s start-planting bug — River Valley 96² seed
1333 made no map — was found and fixed). Posted as a draft comment on PR #56
([COMMENT.md](COMMENT.md)) for the milestone session to read, edit and post. M9a is not released
until Kyler says yes on that comment.

## What's here

- `contact-sheet.png`: every theme and Any, seeds 1-30, 128x128, top-down, labelled with seed and
  theme.
- `comparison-<theme>.jpg`: the same seeds on the live generator (`main`, 0.6.2) beside the frozen
  one, one image per theme (a screenshot of the sheet tool's own comparison page, `sheet.ts`'s
  `.pair` layout: old on the left, new on the right).
- `3d-<theme>-<seed>.jpg`: 14 random maps in 3D (two per theme, including Any; not the best - drawn
  by a fixed random seed and not rerolled), from the editor's default (opening) camera, start
  visible where the default view shows it.
- `3d-<theme>-<seed>-start.jpg`: a second capture, framed on the start, for any pick whose start
  was off screen in the default view (see `picks.json` for which ones; none needed this in the
  current run — the start was on screen in every default view).
- `picks.json`: the 14 (theme, seed) picks, the random seed that drew them, and whether each
  start was on screen in the default view.
- `start-areas.png`: the start-area sheet (`start-sheet.ts`), seeds 1-30, Normal and Hard, the
  start rules' added groves marked and standing dead groves distinct (11 of 240 starts have one).
- `COMMENT.md`: a draft of the PR #56 comment.

## How to regenerate

Run from a worktree of the frozen generator's commit, after `npm ci`:

```
npx tsx investigation/m9a-review/make-all.ts
```

That runs the four steps below in order (each also runs alone, for redoing one part):

```
# 1. the contact sheet
npm run sheet -- --workers 3 --png investigation/m9a-review/contact-sheet.png --no-open \
  --title "M9a review: contact sheet (<sha>)"

# 2. the comparison against main (0.6.2); writes .scratch/sheets/sheet-<stamp>.html, then
#    screenshot each theme's <section> to comparison-<theme>.jpg
npm run sheet -- --compare main --workers 3 --no-open --title "M9a review: comparison vs main"
npx tsx investigation/m9a-review/capture-compare.ts .scratch/sheets/sheet-<stamp>.html

# 3. 14 random maps in 3D, fixed random seed 20260927 (recorded in picks.json)
npx tsx investigation/m9a-review/capture-3d.ts --rng 20260927

# 4. the start-area sheet
npx tsx tools/start-sheet.ts --seeds 1-30 --size 128 --out investigation/m9a-review/start-areas.png --jobs 3
```

A full run is roughly 20-30 minutes at `--workers 3` (the two sheets are 210 generated maps apiece;
the 3D captures open the editor up to 28 times in a headed Chrome; the start sheet generates 240
maps): keeps this modest beside other heavy work on this machine (M9a's batches run in
`DamGoodMaps-m9a`); raise `--workers`/`--jobs` when the machine is free. Give the 3D capture's
Chrome its own port (`--port`, default 4198) if another capture tool is already using its default.

Once regenerated, check every image is under 1 MB (JPEG or palette PNG) and the whole set under
about 15 MB before committing, and update `COMMENT.md`'s generator commit and any counts (the
dead-grove count, the off-screen-start list) to match the new run.
