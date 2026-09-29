# Badwater on every map

**Built** on branch `feature/badwater-source` (PR #54 into `dev`), from Kyler's D200 of 2026-09-26:
badwater is a late-game resource (Extract, then Catalyst, Grease and Explosives), not only a hazard,
so every map has at least one permanent badwater source, unless the player picks **No badwater** for
a peaceful map. Generated maps change: generator **0.6.3**; older share links open with the note
that the map may differ.

## The official maps

`tools/official-baselines.ts` now measures badwater too (`src/core/resources/measure.ts`: each
BadwaterSource's strength, its distance from the start, and its lowness, the share of the tiles 4–6
tiles round it whose top stands above it), into `investigation/official-baselines.json`.

- **Does every official map have one?** 18 of 19 have a BadwaterSource. **Spillage** has none, but
  five BadwaterSeeps (one starts after a few cycles), a lasting badwater supply of another kind.
  **Nomads** and **Oasis** have only sources that start after a few cycles (time-activated). So
  every official map has lasting badwater, and `resources.badwater_source` counts seeps and
  time-activated sources.
- **Count by size** (Nomads and Oasis left out, and Pillars, a badwater map by design with eight
  sources of 3 and no clean WaterSource: its clean water comes from seeps and an aquifer): 1 / 2 /
  4 / 3.5 sources on small / medium / large / max maps; the typical range ×0.86–1.11 of that.
- **Strength:** each source 0.5–3, median 1.5 (25th–75th 1–1.5); a map's total 1.25 / 3.5 / 5.5 / 6.5
  by size (Meander and Plains, with one or two weak sources, and Pillars left out as outliers); the
  badwater-to-clean ratio median 0.71 (25th–75th 0.49–1.51).
- **Where:** 84% stand where at least half the ground 4–6 tiles round them is higher (lowness median
  0.77): in hollows and side valleys. The nearest to the start is a median 56 tiles out (10th 27).

## What changed

- **`src/core/resources/badwater.ts`** (a module of its own, for M9a's generator to take):
  - `badwaterBudget(W, H, setting, seed)`: the official count and total for the size, moved within
    the typical range by the seed, × 0.5 / 1 / 1.5 (count) and × 0.5 / 1 / 1.75 (strength) for Low /
    Normal / High; each source 1–3 (the basin builder's range); none with No badwater, at least one
    otherwise. It replaces the rivers' flow × the badwater ratio.
  - `pickBadwaterSprings`: for ground the generator did not shape: a flat, dry 3×3 in a hollow or
    side valley (lowness ≥ 0.5), at least the badwater distance + 14 tiles from the start (as the
    generator's basins keep), the first nearest that distance, the next 6 tiles further each, 12
    tiles apart.
  - `NO_BADWATER_NOTE` and `asksForBadwater`: the description line and how the validators read it.
- **The generator** (`gen/water.ts` `placeBadwater`): as many side basins as the budget, each 1–3
  strong; candidates where the ground round the floor stands higher come first (a hollow or side
  valley), at the same distances as before (the badwater distance + 14: about 29 tiles at Normal,
  44 at Easy, 22 at Hard). When no basin fits by the usual search (the 60 nearest candidates), it
  tries up to 400 before a map goes without, and a map still without one fails
  `resources.badwater_source` and is generated again.
- **No badwater** is the Badwater setting's first option (it was **Off**). With it the map places
  no badwater sources; badtides still happen. The share link carries `bw=0` as before, and the map's
  description says "No badwater: a peaceful map (badtides still turn every source bad)." The panel
  says how many sources this map gets and the official number for its size.
- **Old links and projects:** the setting tells them apart. A link or project whose Badwater was 0
  (Off) was the player's choice: it opens as No badwater. One that asked for badwater (Low, Normal
  or High) keeps asking: a link generates again with 0.6.3 and gets at least one; a project reopens
  to the same bytes (its features are its map), and if it has none, `resources.badwater_source`
  reports it until it is generated again.
- **`resources.badwater_source`**, in both validators (`validate/playability.ts`,
  `prototype/playability.py`): at least one BadwaterSource or BadwaterSeep with strength, unless the
  map is set to No badwater. The setting comes from the map's spec; a map without it (an import)
  counts as No badwater when its description says so. It blocks generation, warns on export and is
  reported on import, like `resources.mine_site`.
- **Real places and Pick a place:** `planMapResources` places the springs first, in the same call
  (below).

### For Real places and Pick a place

```ts
const r = planMapResources({
  W, H, heights, water: settle.depth, moisture, soilContamination: soil,
  entities: base,                         // the place's sources, start and slopes
  start: startCentreOf(startObject),
  settings: defaultSettings("riverValley", "normal", { x: W, y: H }).resources,
  seed: hash32("real-place", place.id),
  nearStart: { wood: Math.ceil(1.35 * rules.woodWithin20), bushes: Math.max(rules.berriesTarget, Math.ceil(1.15 * rules.bushesWithin20)) },
  ruinsClear: rules.ruinsWithin + 7,
  owner: `real-place:${place.id}`,
  badwater: { setting: "normal", within: rules.badwaterWithin },   // "off" for No badwater
});
entities.push(...r.entities);             // badwater sources, trees, bushes, ruin columns, mine sites
const water = r.water ?? { settle, moisture, soilContamination: soil };   // write this settle
```

- `badwater` is required. `setting` is the map's Badwater (`"off"`, `"low"`, `"normal"`, `"high"`);
  `within` its badwater distance (Normal 15).
- The springs go first. The water is settled again with them (`canonicalSettle`, moisture and soil
  on it), and a spring whose badwater comes nearer the start than `within` is dropped for the next
  best, three settles at most. Trees, bushes and mine sites are then placed on that water.
- `r.water` is that settle (`{ settle, moisture, soilContamination }`), or null when no spring was
  placed (No badwater, or no hollow or side valley far enough from the start). The file writes it.
- `r.badwater` lists the springs (tile, level, strength, lowness, distance from the start).
- The places tests expect today's places to lack one (`PLACES_LACK_BADWATER` in
  `tests/contract/placesCommon.ts`, beside `PLACES_LACK_MINE_SITES`); the rebuild turns both to
  `false`.

## Results

**Batches** (`tools/batch.ts`, 100 seeds per theme and size at Normal, 30 at Easy and Hard at 128²),
final pass / first attempt. Blocking: final ≥ 98% in every theme and size: **passes, 100% in all 36
runs** (2,760 maps). First attempts are information (0.6.2: 92–100% at Normal).

| Theme | 96² | 128² | 192² | 256² | Easy 128² | Hard 128² |
|---|---|---|---|---|---|---|
| River Valley | 100% / 99% | 100% / 98% | 100% / 100% | 100% / 99% | 100% / 100% | 100% / 100% |
| Canyon | 100% / 96% | 100% / 96% | 100% / 98% | 100% / 99% | 100% / 97% | 100% / 100% |
| Highlands | 100% / 93% | 100% / 97% | 100% / 95% | 100% / 92% | 100% / 87% | 100% / 97% |
| Lake Basin | 100% / 100% | 100% / 100% | 100% / 100% | 100% / 100% | 100% / 100% | 100% / 100% |
| Delta | 100% / 98% | 100% / 99% | 100% / 98% | 100% / 100% | 100% / 100% | 100% / 100% |
| Islands | 100% / 100% | 100% / 100% | 100% / 100% | 100% / 100% | 100% / 100% | 100% / 100% |

- **Every accepted map has its badwater source** (at least one on each of the 2,760; the blocking
  guarantee). None of the maps failed a first attempt on `resources.badwater_source`: the wider
  search always found one. Retries were `start.wood` 26, `water.settles` 11, `start.water` 9,
  `start.dry` 5 and `terrain.edge_wall` 1 (Delta 96²), Canyon and Highlands most.
- **Sources placed** (information): 1–2 at 96², 1–2 at 128², 2–4 at 192², 1–4 at 256² at Normal, and
  1–2 on the Low themes (Highlands, Islands). 17 of 2,760 maps got fewer than their budget (at most
  9 of 100 on 256² River Valley), never none.
- On the oracle's 150 maps: each source 1–2.75 strong (median 1.25 at 96², 1.75 at 128² and 256²;
  official 1.5); the nearest a median 27–28 tiles from the start at Normal (its badwater distance
  is 15; official 56); every one stands where the ground round it is higher (measured on the built
  map, where the basin's rim counts too).
- Every project file reopened to the same bytes; resources and mine sites stayed in their ranges.
- Time per map: medians 0.2–5.4 s by theme and size, from 25% under to 45% over 0.6.2's (192²
  Delta 1.3 → 2.0 s). M9a's build shared the machine, so these wall-clock numbers are noisy.

- **Oracle** (`npm run oracle`, seeds 1–50 at 96², 128² and 256², and the 19 official maps): PASS.
  150 maps generated, load checks and round trips pass; **0 disagreements** on 2,350 checks of 50
  generated maps (47 each, with the new check) and on the 19 official maps, all of which pass
  `resources.badwater_source` in both validators (Spillage by its seeps).
- **Contact sheet** (D144): [docs/sheets/badwater-source.png](../sheets/badwater-source.png), seeds
  1–30 of every theme at 128², badwater sources yellow, badwater rust red, the start red
  (`tools/contact-sheet.ts --badwater`).
- **The canonical file** (D148): the live check's download (River Valley 4242, 128², Normal) is now
  sha256 `bd86a867…` (0.6.2: `b358b4f8…`); `tests/contract/look-mine-ruins.test.ts` re-pinned.
- **Keep M12 ready** (D134): the Claude reference suite passes **99 of 120** (dev at 0.6.2: 103).
  Newly passing: S06, P12, J11. Newly failing:
  - **P09** ("remove the badwater spring", on `rv96`, which now has one): the removal breaks
    `resources.badwater_source`, which passed before, and guards are never traded away. This one is
    D200's own: with one source left, the request either sets the map to No badwater or is refused
    with the nearest alternative. Parked for Kyler (below).
  - S09, F07, F08, W09, M01 and X04: setups the extra basins moved (their badwater and dam sites
    now break a check or fit nowhere); for the post-merge re-tune (STATUS, D134).

## For Kyler

1. **The contact sheet**: badwater sources are yellow, the badwater's course rust red. Most maps now
   have 2 sources at 128² and 3–4 at 192² and 256² (before: 1–2, rising with the rivers' flow).
2. **"Remove the badwater spring" in the Claude suite (P09)**: when a map has one source left, should
   removing it set the map to No badwater, or be refused ("every map keeps one badwater source;
   choose No badwater for a peaceful map")? Default until you say: refused, as it is now.

## Tests

- New `tests/contract/badwater.test.ts`: the calibration is the official measure, and 18 of 19
  official maps have a source; the budget (none with No badwater, at least one otherwise, more on
  larger maps, each 1–3, the seed and the setting move it); every theme's generated map has one and
  passes; No badwater places none, says so in the description and the share link, and passes, in
  both validators without its settings; a map that asks and has none fails in every profile
  (blocks generation, warns on export) and passes when set to No badwater; the Python validator
  agrees; springs in a side valley beyond the distance, never on a flat plateau; `planMapResources`
  places springs, settles the water again, and keeps the badwater away from the start.
- Updated per D148 (they still passed or no longer meant what their names say, after Kyler's
  decision):
  - `tests/contract/features.test.ts`: the badwater basins are the budget's sources, not the old
    strength ÷ 3.
  - `tests/contract/validate.test.ts`: `resources.badwater_source` is in the check list.
  - `tests/contract/places.test.ts`, `placesCommon.ts`: every place passes every check but its
    known faults, now also the missing badwater source, which both validators flag, until Real
    places 2 rebuilds them.
  - `tests/contract/resources.test.ts`: `planMapResources` takes `badwater`; on flat ground it
    places no spring and leaves the water as it was.
  - `tests/contract/look-mine-ruins.test.ts`: the seed-4242 download's sha256 is `bd86a867…`, as
    generator 0.6.3 makes it.
- `tests/contract/objects.test.ts`: the every-object map moves from seed 15 to seed 13, a seed on
  which every theme still places every kind of object (a seed choice, not a decision).

## Docs

- PLAN §5.4 (the Badwater row), §9.5 (as built), §11.4 (the checks table: `resources.mine_site` and
  `resources.badwater_source` added; the resource amounts marked advisory, as they have been since
  D167–D170: drift fixed), ROADMAP (status), README (every map has a badwater source; No badwater).
