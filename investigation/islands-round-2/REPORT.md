# Islands, round 2: islands to expand to, and the other faults behind the safe version

Base: `feature/m9b` at fe3ed80f (`dev` was already merged in; nothing to merge). The generator changes are
[islands.patch](islands.patch) against that base, Islands' own shaping only (`land/genome.ts` `addSea`,
`land/islands.ts`, the sea-gated and Islands-gated blocks of `gen/generate.ts`). Nothing stamped: every change
is in how the layouts are drawn and how the land stage shapes them before the land is shown (D348, D370).
The clone is `C:\Users\Kyler\code\DamGoodMaps-islands` (this PC has no `krams` user folder).

## The counts

Kyler's measure (`investigation/m9b/islands-reach.ts`, here [reach.ts](reach.ts) at any size): an island to
expand to is dry land not joined to the start's land, clear of the map's edges, 150 tiles or more, reached from
the start across at most 8 tiles of water at a time.

| Size | No island to expand to, before | After | Attempts, mean before → after | Wet share, median before → after |
|---|---|---|---|---|
| 96² | 23 (2, 4, 5, 6, 7, 8, 9, 11, 12, 13, 14, 15, 16, 17, 19, 22, 23, 24, 25, 27, 28, 29, 30) | 14 (2, 5, 6, 7, 8, 10, 11, 17, 18, 21, 22, 23, 25, 30); 12 with 84 tiles, the 150 by area | 8.3 → 6.5 | 0.25 → 0.33 |
| 128² | 12 (5, 8, 9, 11, 12, 14, 17, 19, 20, 22, 24, 27) | 2 (6, 30) | 4.8 → 3.7 | 0.39 → 0.45 |
| 256² | 8 (8, 13, 15, 20, 22, 26, 27, 29) | 1 (25) | 3.1 → 3.4 | 0.41 → 0.44 |

M9b's measure (`investigation/m9b/measures.ts`, Islands, seeds 1–30), before → after:

| Size | All three outcomes | Promise missed | Water story missed | Not passed | Settle over 4 days |
|---|---|---|---|---|---|
| 96² | 3 → 16 of 30 | 26 → 13 | 7 → 1 | 0 → 1 (seed 11, no start) | 1 → 0 |
| 128² | 21 → 26 | 9 → 4 | 2 → 0 | 0 → 0 | 0 → 3 |
| 256² | 23 → 26 | 4 → 3 | 4 → 3 | 0 → 0 | 16 → 17 |

Ring-of-land maps at 128²: 8 of 30 (D423: about one in four). The sheet:
[docs/sheets/islands-round-2.png](../../docs/sheets/islands-round-2.png), seeds 1–30 at 128², each seed before
(the base) beside after. The per-seed table at 128² is at the end.

**Every seed's land changes at every size.** The causes below act on nearly every land the generator draws, so
once they are fixed a different land passes the screens (the first or second drawn instead of the seventh), and
the map is another. The safe version D430 accepted survives on no seed; Kyler judges the sheet beside it. (The
strait pass alone, the first fix, changed 11 seeds at 128² and fixed 5 of the 12; the rest needed the sea held.)

## The faults, ranked by what a player sees, with cause and fix

1. **Maps that read as land with lakes and rivers, not a sea with islands** (D432: 8, 9, 20, 24, 27 at 128²;
   most of 96²). Cause: on most open layouts the sea drained at the land stage. The sea's bowl at its spill
   level is about 45% of the map, over the lake budget Islands set (0.42–0.52), so the hydrology cut the
   "lake's" sill down until it fit, to the sea's floor; the river leaving the sea then cut its bed `incise`
   levels under the rim at the sea's sill, and the outlet carving a level more. A sea 2–3 levels deep was
   gone, the planned promise failed, a new genome was drawn with a sea 5% smaller (the per-attempt shrink),
   six times, and the seventh land was taken whatever it was (seed 24 at 128²: no sea at all, 14% wet).
   Fix, Islands' own: the lake budget is the most the settings allow (0.5); the sea's rivers run shallow
   channels (`incise` at most 0.4, one level under the land); the per-attempt shrink is dropped at 128² (kept
   above, for the settle; under 128² the sea is drawn smaller by the square root of side/128 and the shrink
   kept, for the shore's room). Shared causes left as they are, listed below.
2. **No island to expand to: the islands fused with the shore** (12 of 30 at 128², 9 of them open layouts).
   Four causes, all from D417's open-map round: the strait pass (`standIslandsClear`) was skipped on open maps
   so the headlands could join the land, taking the layout's islands with them; the sea was moved off centre
   by 10–18 tiles but its islands were not, so the far-side islands stood in the rim; the headlands reached
   in over the islands and joined them to the shore by their own high ground; and islands drawn within the
   rim's width of an edge were rooted in it. Fix: headlands are marked (`head`) and the strait pass runs on
   every sea map for the layout's islands, cutting round them as a group (an atoll's crescent or a chain
   joined to the shore through its neighbours parts with them), with a leak guard (a cut that would open the
   sea a way out below its level goes back); the islands move with the sea; each island keeps the rim's width
   plus its own foot (about 1.4 of its radius) from the edges, drawn in toward the sea's middle if not; a
   headland that would overlap an island moves out toward the edge or is not drawn.
3. **Islands fused with each other, so the promise (three islands) failed and lands were drawn again**:
   archipelago neighbours were spaced 1.25 radii apart while the field's island runs out to 1.4; the chain's
   islands were too big for its arc, one broken ridge. Fix: spacing 1.5 radii plus 6 tiles; the chain spans two
   radii with islands 5–14 instead of 6–17.
4. **The edge layout's islands out of reach of either shore** (seeds 19 and 29 at 128², 11–15 attempts): drawn
   in the sea's middle, 17 or more tiles from both shores. Fix: drawn off the mainland, a third to three
   quarters of the way from the sea's middle to its shore.
5. **One large island in a moat inside a ring of land** (D427; seed 22 at 128² after the first fixes): the
   central layout drew a ring one time in four. Fix: central never a ring.
6. **A land with no island to expand to shown anyway**: added to the land screen from 128² up (Islands only,
   `islandToExpandTo` in `land/islands.ts`: 150 tiles by area, reached from the largest shore mass, the
   start's likeliest land): drawn again like a land missing the promise, within the screen's budget.

## Shared causes, listed, not fixed (the brief)

- **A lake's outlet is cut below its sill** (`hydro.ts`, `profileOf`): past a lake the bed is `cut` levels
  under the ground beside it, which at the lake's edge is the sill, so every planned lake or sea stands
  `cut − 1` levels under its planned level, and a shallow sea drains. [shared-causes.diff](shared-causes.diff)
  holds the fix tried (the sea's bed held at its sill while the ground beside stands at it; the sea exempt
  from the lake budget up to Islands' 0.70 cap), gated to sea maps: it fixed the same seeds the Islands-own
  knobs fix. Left out.
- **The lake budget is clamped to 0.5 of the map** (`genome.ts`, `leanGenome`) while Islands' water cap is
  0.70 (D369, D409): a sea whose bowl is over half the map is still cut down. About one land in eight.
- **The outlet carving takes a level below a sea's shelf** (`levels.ts`, `carveOutlets`): a sea standing one
  level deep at its sill is left dry.
- **A shown land is kept though its start fails on the settled water** (D348): at 96² seed 11 (seed 10 on an
  earlier variant) the land passed the land-stage start check, the start then failed its settled checks and
  the mine pair, and 6–23 re-plans found none: a map with no start. Good lands at 128² (seeds 6, 19, 29) also
  fell to `no start`, `one place for a start`, `source in a flow` and `terrain.dam_wall` after passing every
  screen, which then spent the screen budget on the lands after.
- **Islands at 256² settles over four days on 16–17 of 30** (unchanged; the slowest theme, D380).

## Open

- 128² seeds 6 and 30: all seven or more lands fail (the start, then the promise on the rest); 30's chain has
  a 555-tile island more than 8 tiles out. 256² seed 25: the same, a chain. 96²: 14 seeds (12 by area) and
  seed 11 with no start; D433's known shortfall stays one, smaller.
- The sea's outline is the rim's rounded square where the sea is bigger than the map (seeds 2, 10, 15, 24,
  25 after; D417's concern): a layout-radius fault, not touched.
- The contract tests' pinned Islands seeds (parity, objects, lakeIsland, projects) will move with the land:
  D148 re-pins for the milestone session; not run here. `tsc --noEmit` passes. Any's sea maps share
  `addSea`, so they move too.

## Regenerating

`sh investigation/islands-round-2/run-reach.sh <size> <tag>` (4 workers) writes `local/<tag>-<size>.json`;
`node investigation/islands-round-2/summarise.cjs 128` prints the tables; M9b's measure:
`node investigation/probe/run.cjs ../m9b/measures.ts --themes islands --seeds 1-30 --size <size> --jobs 4`;
the sheet: `npm run sheet -- --theme islands --seeds 1-30 --size 128 --compare <base> --workers 4 --no-open`,
then `python investigation/islands-round-2/pair-sheet.py <page.html> <base> docs/sheets/islands-round-2.png "<title>"`.
`isles.ts`, `attempts.ts`, `why-attempts.ts`, `sea-settled.ts` and `render-land.py` are the diagnostics used.
Large results stay in `local/` (D195).

## Seeds 1–30 at 128²: the largest island to expand to (tiles, strait), before → after

| Seed | Before | After | Layout after | Seed | Before | After | Layout after |
|---|---|---|---|---|---|---|---|
| 1 | 489 (1) | 1229 (7) | atolls | 16 | 671 (7) | 1486 (3) | central |
| 2 | 201 (1) | 189 (7) | edge, ring | 17 | none (largest 207) | 603 (4) | archipelago |
| 3 | 598 (5) | 629 (6) | archipelago | 18 | 635 (2) | 646 (2) | atolls, ring |
| 4 | 731 (7) | 1172 (3) | archipelago | 19 | none (largest 288) | 398 (4) | chain, ring |
| 5 | none (largest 86) | 641 (3) | chain | 20 | none (largest 71) | 716 (1) | chain, ring |
| 6 | 313 (8) | none (largest 55) | twoSeas | 21 | 413 (8) | 1472 (8) | archipelago |
| 7 | 437 (2) | 660 (1) | archipelago | 22 | none (largest 69) | 314 (4) | archipelago |
| 8 | none (largest 149) | 1307 (1) | twoSeas | 23 | 155 (6) | 641 (2) | twoSeas |
| 9 | none (largest 10) | 533 (2) | archipelago | 24 | none (largest 140) | 797 (2) | archipelago |
| 10 | 300 (2) | 769 (4) | archipelago | 25 | 362 (6) | 343 (4) | archipelago, ring |
| 11 | none (largest 68) | 157 (2) | archipelago | 26 | 207 (2) | 274 (2) | archipelago |
| 12 | none (largest 240) | 1207 (3) | archipelago, ring | 27 | none (largest 2) | 618 (6) | edge, ring |
| 13 | 206 (5) | 664 (4) | edge, ring | 28 | 355 (8) | 369 (7) | archipelago |
| 14 | none (largest 72) | 725 (5) | twoSeas | 29 | 384 (4) | 736 (3) | archipelago |
| 15 | 1041 (4) | 1534 (6) | archipelago | 30 | 199 (2) | none (largest 555) | chain |
