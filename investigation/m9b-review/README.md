# M9b review set

Kyler's review set for M9b (PLAN §20 D252 (2), D273), made on 2026-10-02 from `feature/m9b` at commit
`365ee6f6`. The comparison is against `origin/dev`, which carries M9a's released generator (0.7.0). The tools are
copies of `investigation/m9a-review`'s (branch `review/m9a-set`), changed for M9b: the contact
sheet sits beside M9a's maps of the same seeds, and the 3D captures add four Any maps at Variety
100 and Verticality 100 at 256² (D273 (6)). Judged by Kyler's eye against `docs/PERFECT.md`'s Maps
and Water sections (D252); the measures in `docs/progress/m9b.md` are information.

## What's here

- `contact-sheet.png`: every theme and Any, seeds 1-30, 128x128, top-down, labelled with seed and
  theme (M9b's maps only; the same picture is `docs/sheets/m9b.png`, D144).
- `comparison-<theme>.jpg`: the same seeds on M9a's generator (`origin/dev`, 0.7.0) beside M9b's,
  one image per theme (the sheet tool's own comparison page: M9a on the left, M9b on the right).
- `3d-<theme>-<seed>.jpg`: 14 random maps in 3D at 128² (two per theme, including Any; drawn by a
  fixed random seed and never rerolled), from the editor's default (opening) camera.
- `3d-chaos-<seed>.jpg`: Any maps at Variety 100 and Verticality 100, 256² (seeds 73, 480 and 46; seed
  941 has no picture, see "Chaos map without a picture").
- `3d-…-start.jpg`: a second capture framed on the start, for any pick whose start was off screen
  in the default view (`picks.json` says which).
- `picks.json`: the picks, the random seed that drew them, each map's name and how-it-plays line, the map card's checks line,
  and whether its start was on screen.
- `start-areas.png`: the start-area sheet (`tools/start-sheet.ts`), seeds 1-30, Normal and Hard.

## Chaos map without a picture

Any 941 at Variety 100 and Verticality 100, 256², fails its checks ("2 of 29 checks failed": no start
placed after 18 attempts, and 0 mine sites). The page keeps **Refine this map** disabled for a map
that fails, so there is nothing to open in 3D. `capture-3d.ts` now records such a map in `picks.json`
(its checks line and the report text) and carries on. The picks are never rerolled.

## How to regenerate

From a worktree at the commit to review, after `npm ci`:

```
npx tsx investigation/m9b-review/make-all.ts --compare origin/dev [--workers 3] [--rng 20260928]
```

That runs, in order (each also runs alone):

```
# 1-2. the contact sheet beside M9a's; its PNG is M9b's maps only
npm run sheet -- --compare origin/dev --workers 2 --png investigation/m9b-review/contact-sheet.png --no-open
npx tsx investigation/m9b-review/capture-compare.ts .scratch/sheets/sheet-<stamp>.html

# 3. the 3D captures (14 random at 128², 4 chaos at 256², one of them without a picture); --only random|chaos for one group
npx tsx investigation/m9b-review/capture-3d.ts --rng 20260928

# 4. the start-area sheet
npx tsx tools/start-sheet.ts --seeds 1-30 --size 128 --out investigation/m9b-review/start-areas.png --jobs 3
```

A full run generates about 900 maps (420 for the two sheets, 240 for the start sheet, 18 opened in
a headed Chrome, four of them at 256²): most of an hour at `--workers 2` on a busy machine. Give the 3D capture's
Chrome its own port (`--port`, default 4198) if another capture uses it. Check every image is under
1 MB and the whole set under about 15 MB before committing (D195).
