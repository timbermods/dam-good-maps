# Islands, round 3: the coast

Base: `dev` at 79881e0b (M9b released), with round 2 ([PR #210](https://github.com/timbermods/dam-good-maps/pull/210))
re-applied unchanged; its numbers re-based on this tip matched round 2's exactly. The generator changes are
[islands.patch](islands.patch) against dev (rounds 2 and 3 together), Islands' own shaping only: `land/genome.ts`
`addSea`, `land/islands.ts`, `rimKeep` in `land/field.ts`, the Islands-gated blocks of `gen/generate.ts`.

## What changed, and the fault each answers

The faults are D417, D423 and D427, and the theme critique's Islands section (PR #211): the sea's outline ran with
the map's edges in a rounded square, the rim was a thin even frame, and too many maps were a ring of land round
the sea.

1. **The sea's outline was the rim's rounded square.** Every layout drew its sea at about half the side, so
   the rim cut it on all four sides. Fix: every layout's radius is about a third of the side (central
   0.32–0.37, edge 0.34–0.38, archipelago 0.34–0.39, chain 0.33–0.38, atolls 0.34–0.38, two seas 0.36–0.40,
   times 1.12). The sea's own floor and arms draw the coast, and the land round it is broad where the sea
   lies off the middle. Islands are drawn at 0.85 of their old size to keep their share of the smaller sea.
2. **The rim was even and thin.** Fix: its inner line wanders from 3% to 11% of the side (was 1–8%), so where
   the sea meets the rim the coast bends in bays and out in headlands, with cliffs where it falls fast.
3. **Too many ring maps, and the ring a frame along the edges.** Fix: a ring on 25% of the archipelago,
   chain, atolls and two-seas maps (central never, the moat, D427; edge never), so about one map in five. On
   a ring map the sea and its layout are drawn at 0.82, so the ring is broad land round the sea's outline.
4. **The edge layout's band held a sixth of the map and its water story never read.** Fix: an ordinary sea,
   a broad ellipse drawn at the middle and pushed 0.14–0.18 of the side toward the north edge (the map's
   orientation turns it), meeting the rim there.
5. **Atolls filled the smaller sea to its shore.** Fix: a smaller ring (radius 20–26 at 128², was 26–34) of
   smaller pieces (6–8, was 7–10), so a channel of sea stays round it.
6. **Lands drawn again had less sea.** The per-attempt sea shrink is gone from 128² up (round 2 kept it
   above 128²; a sea a third of the side settles at 256² without it), and kept under 128² for the start's
   room.

## The counts

Kyler's measure ([reach.ts](reach.ts); an island to expand to is 150 tiles or more of dry land, apart from the
start's, reached across at most 8 tiles of water). Islands, seeds 1–30.

| Size | No island to expand to: dev → round 2 → round 3 | Attempts, mean | Wet share, median | Ring maps |
|---|---|---|---|---|
| 96² | 23 → 14 → 17 | 8.3 → 6.5 → 5.7 | 0.25 → 0.33 → 0.29 | 17 → 12 → 3 |
| 128² | 12 → 2 → 0 | 4.8 → 3.7 → 4.6 | 0.39 → 0.45 → 0.41 | 11 → 8 → 4 |
| 256² | 8 → 1 → 2 (24, 26) | 3.1 → 3.4 → 4.0 | 0.41 → 0.44 → 0.39 | 12 → 7 → 5 |

M9b's measure (`investigation/m9b/measures.ts`), dev → round 2 → round 3:

| Size | All three outcomes | Promise missed | Water story missed | Not passed | Settle over 4 days |
|---|---|---|---|---|---|
| 96² | 3 → 16 → 13 | 26 → 13 → 17 | 7 → 1 → 2 | 0 → 1 → 0 | 1 → 0 → 1 |
| 128² | 21 → 26 → 27 | 9 → 4 → 2 | 2 → 0 → 1 | 0 → 0 → 0 | 0 → 3 → 2 |
| 256² | 23 → 26 → 22 | 4 → 3 → 6 | 4 → 3 → 4 | 0 → 0 → 0 | 16 → 17 → 8 |

Round 2's no-start map at 96² (seed 11) is gone. The sheets, seeds 1–30 at 128², dev's tip beside round 3:
[1–10](../../docs/sheets/islands-round-3-1.png), [11–20](../../docs/sheets/islands-round-3-2.png),
[21–30](../../docs/sheets/islands-round-3-3.png).

## Open

- **Some seas still read large and square-ish** at 128²: 13, 16 and 21 on the sheet.
  Their coasts still run with the edges for long stretches; the cause is not traced.
- **Atolls can read as land with a lake ring** when their sea is small: 128² seed 24 at 17% wet.
- **256² lost most of round 2's gain on M9b's measure:** all three on 22 of 30 (round 2 26), the promise
  missed on 6 (7, 13, 16, 18, 19, 26), against 8 seeds settling over four days instead of 17. The misses
  plan two islands or fewer of the promise's size (30 tiles × the area, 120 at 256²) with the land apart mostly
  at 2–6%: a sea a third of the side holds fewer islands that size. Seed 13's lands fail mostly on a river
  leaving its course (a shared check). Tried and dropped: islands back to full size at 256² fixed seed 16
  but not the count (21 of 30, five seeds without an island to expand to). The trade between the coast
  and the promise at 256² is Kyler's call.
- **256², no island to expand to:** seed 24 (chain) and seed 26 (archipelago, 14% wet).
- **96²** stays D433's known shortfall: 17 seeds without an island, none without a start.
- **Every seed's land changes again** at every size; Kyler judges the sheets.
- The Islands contract pins move with the land (D148 re-pins for the milestone session; not run here). Any's
  sea maps share `addSea`, so they move too.
- Shared causes stay as round 2 listed them (its report, "Shared causes"): the lake outlet cut below its sill,
  the lake budget clamped to 0.5, the outlet carving a level under a sea's shelf, a shown land kept though its
  start fails, Islands' slow settle at 256².

## Regenerating

Large results stay in `local/` (D195). `sh run-reach.sh <size> <tag>` writes `local/<tag>-<size>.json`;
`node summarise.cjs dev r2 r3h` prints the first table. M9b's measure: `node investigation/probe/run.cjs
../m9b/measures.ts --themes islands --seeds 1-30 --size <size> --jobs 4 --out <file>.jsonl`, then
`python investigation/m9b/summary.py <file>.jsonl`. Pictures: `sh run-look.sh 128 <dir>` (one pixel a tile, the
start marked), then `python montage.py <before dir> <after dir> docs/sheets/islands-round-3 "<title>"`.
`why-attempts.ts` and `sea-settled.ts` are the diagnostics used. Baselines ran in worktrees of dev's tip and of
round 2 re-based, with these scripts copied in.
