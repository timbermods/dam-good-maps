# Islands, rounds 3 and 4: the coast, and islands that read as islands

Rounds 2 to 4 are product code on this branch (Kyler, 2026-10-04), merged with dev and re-pinned (D148).
[islands.patch](islands.patch) is the whole change against dev's tip, Islands' own shaping only: `land/genome.ts`
`addSea`, the sea and isle cases and `rimKeep` in `land/field.ts`, the Islands-gated blocks of `gen/generate.ts`,
`land/islands.ts`. Every map is shaped before the first land is shown (D348, D370).

## Round 4: what changed, and the fault each answers

1. **One picture, Lake Basin's** (a rounded inland sea with a few dots in it). On open maps the sea now fills
   the map inside a narrow rim. The rim's broad lobes of mainland reach into it, most at the corners, so the
   coast is land and channels and the sea runs on to the rim between them. The lobes are drawn in `addSea` and
   kept on the sea's part, so islands are placed clear of them; `rimKeep` draws each as its own edge's band,
   lifted over the sea so it ends in a cliff.
2. **Islands too small, not growing with the map.** Island radii grow with the side, so their area grows as
   the promise's island does (30 tiles × the area). Their coast's wobble is capped at a 14-tile island's, so
   straits of 4–7 tiles hold at 256². The isle shape now stands out of the sea at its drawn size: its top was
   0.52–1.12 of its height (a low island stood a third its size) and its flank ran out to 1.15 of its radius
   (neighbours' feet met in a shelf at the water and joined them).
3. **Square-ish, traced.** On 28 of 30 round-3 seeds the sea's drawn ellipse reached past the rim's inner line
   on two to four sides, and on 25 its noise took it past all four. Wherever it did, the coast was the rim's
   line: a rounded square whose distance from the edge wanders only 3–11% of the side over about 38 tiles, with
   quarter-circle corners. Round 4 draws that line on purpose, with the lobes. A lobe placed by perimeter
   position once left a straight seam down each corner's diagonal; each edge now owns its band.
4. **Seed 24's atolls as land with a lake ring.** The atoll stands in open sea now (128² seeds 8, 12 and 18 are
   atolls; 24 is an archipelago).
5. **Layouts that look alike.** Central is one big island with satellites a strait off it, never in a moat:
   its lobes take two corners side by side, so the sea opens to the other edges (D427). Edge is a mainland of
   deep lobes along one edge with islands off it. Archipelago, chain, atolls and two islands keep their own
   arrangements, each sized to fit inside the lobes. Ring maps are one draw in seven (a ring passes the screens
   more often, so one in four drawn was a third shown).
6. **The sea's bowl kept under half the map.** Over it, the hydrology cuts the sea's sill until the lake fits,
   and a flat sea drains whole (a shared cause, below). `addSea` reads the land it drew on a coarse grid and
   lets the lobes reach further until about 44% is left to the sea.

## The counts, rounds 2, 3 and 4

Kyler's measure ([reach.ts](reach.ts): an island of 150+ tiles apart from the start's land, reached across at
most 8 tiles of water at a time). Islands, seeds 1–30.

| Size | No island to expand to | Attempts, mean | Wet share, median | Ring maps |
|---|---|---|---|---|
| 96² | 14 → 17 → 14 | 6.5 → 5.7 → 5.8 | 0.33 → 0.29 → 0.45 | 12 → 3 → 3 |
| 128² | 2 → 0 → 0 | 3.7 → 4.6 → 4.5 | 0.45 → 0.41 → 0.47 | 8 → 4 → 2 |
| 256² | 1 → 2 → 1 (16) | 3.4 → 4.0 → 2.6 | 0.44 → 0.39 → 0.42 | 7 → 5 → 2 |

M9b's measure (`investigation/m9b/measures.ts`):

| Size | All three outcomes | Promise missed | Water story missed | Not passed | Settle over 4 days (a reading) |
|---|---|---|---|---|---|
| 96² | 16 → 13 → 23 | 13 → 17 → 6 | 1 → 2 → 2 | 1 → 0 → 0 | 0 → 1 → 0 |
| 128² | 26 → 27 → 28 | 4 → 2 → 1 | 0 → 1 → 1 | 0 → 0 → 0 | 3 → 2 → 0 |
| 256² | 26 → 22 → 28 | 3 → 6 → 1 | 3 → 4 → 1 | 0 → 0 → 0 | 17 → 8 → 14 |

dev's tip before round 2, for reference: no island at 96/128/256² on 23, 12 and 8 seeds; all three outcomes on 3,
21 and 23. No map at any size is without a start. Sheets, round 3 left and round 4 right, north up, start marked:
128² [1–10](../../docs/sheets/islands-round-4-128-1.png), [11–20](../../docs/sheets/islands-round-4-128-2.png),
[21–30](../../docs/sheets/islands-round-4-128-3.png); 256² scaled to 256 px
[1–10](../../docs/sheets/islands-round-4-256-1.png), [11–20](../../docs/sheets/islands-round-4-256-2.png),
[21–30](../../docs/sheets/islands-round-4-256-3.png).

## Still short, by seed

- **Read as a lake with islands** (a rounded sea closed in by land, broad water round big islands): 128² 6, 7,
  12, 16, 20; 256² 3, 9, 20, 22, 26, 29 (20, 22 and 29 central, a big island in a round sea).
- **Square-ish** (a coast running with an edge for a long stretch): 128² 2, 21, 26; 256² 2, 5, 13, 17, 19, 21, 23,
  25, 27, 30. Nearly all are the edge layout: its sea side meets the thin rim with one or two lobes. Lobes on its
  sea's corners too were tried and dropped: four 256² edge maps lost their reachable island, and the sides stayed
  straight.
- **The water is broad between islands more often than straits and channels.** Packing larger islands closer
  was tried: nine 128² seeds lost their island to expand to, fused to each other and the shore.
- **96²**: 14 seeds without an island to expand to (D433's shortfall, smaller); the promise now holds on 24.
- Every seed's land changes again. Any's sea maps share `addSea` and move too.

## Shared causes, listed, not fixed

- **The lake budget is clamped to half the map** (`genome.ts`, `leanGenome`), below Islands' water cap (0.70).
  A sea over it has its sill cut; round 4 keeps the sea's bowl under it by growing the lobes.
- **A lake over its budget is cut to its floor** (`hydro.ts`, `hollow`): a flat-floored sea over budget drains
  whole, not to a smaller sea. Round 2's shared causes stand (the outlet cut below its sill, the outlet carving
  under a sea's shelf, a shown land kept though its start fails).
- **The page's Flatten disagrees with its operation over deep water**: Islands 96² seed 5, stroke 7 of the brush
  test, four sea tiles a level apart. Kept as an expected failure naming it (`tests/contract/brush.test.ts`).
- **The probe runner failed on dev**: `src/core/sim/rustWater.ts`'s top-level `module` clashed with CommonJS's.
  Fixed here (`investigation/probe/run.cjs`), since M9b's measure needs it.

## Regenerating

Large results stay in `local/` (D195). `sh run-reach.sh <size> <tag>` writes `local/<tag>-<size>.json`, and
`node summarise.cjs <tags>` prints the first table. M9b's measure: `node investigation/probe/run.cjs
../m9b/measures.ts --themes islands --seeds 1-30 --size <size> --jobs 4 --out <file>.jsonl`, then `python
investigation/m9b/summary.py <file>.jsonl`. Pictures: `sh run-look.sh <size> <dir>`, `python grid.py <dir> <png>`
(a quick grid) and `python montage.py <left> <right> <prefix> "<title>" 10 "round 3 | round 4"` (the sheets).
Diagnostics: `edges.ts` (the square-ish trace), `parts.ts`, `why-attempts.ts`, `sea-settled.ts`. `fates.ts` (what
became of each island on each planned land) and `attempts-look.ts` read the planned land, which needs a temporary
line just after the promise screen's `keeps` in `attemptOnce` (gen/generate.ts), removed before committing:
`if (process.env.DGM_WHY) (globalThis as any).__plan = { heights: hLand, water: est, W, H };`.

## Round 3, in short

The sea drawn at a third of the side, the rim wandering 3–11%, rings on a quarter of open layouts, the edge
layout rebuilt, smaller atolls, no per-attempt shrink from 128² up. It fixed the rounded-square coast where the
sea stayed inside the rim, and made Lake Basin's picture; its 256² promise fell to 22. Its sheets beside dev's
tip are [islands-round-3-1](../../docs/sheets/islands-round-3-1.png), [-2](../../docs/sheets/islands-round-3-2.png),
[-3](../../docs/sheets/islands-round-3-3.png).
