# How the official maps group their water and badwater sources (D314)

A short investigation (PLAN.md §20, D314) for the water-sources-in-groups rule: how Timberborn's own
22 built-in maps (19 named + 3 unnamed dev/test maps: `_mini`, `_terraintest`,
`_waterperformancetest`) arrange their `WaterSource` and `BadwaterSource` entities, so the generator,
Real places and the forces can place grouped sources the same way. It amends D171's placement and
D300's water floor.

**Data.** The 22 official `.timber` files already sitting in `.scratch/official/` in the main clone
(gitignored, extracted from the installed game; not copied or committed here — see
`investigation/README.md`'s repository-size rule, D195). Read with the repository's own readers
(`src/core/format/timber.ts`, `world.ts`, `entities.ts`) and the sim's own object model
(`src/core/sim/model.ts`).

**Method and code.** `investigation/source-groups/measure.ts`. Run it with:

```
npx tsx investigation/source-groups/measure.ts "C:/Users/krams/code/DamGoodMaps/.scratch/official"
```

It prints one JSON record per map to stdout (about 500 KB for all 22 maps: a bulk result, so it is
not committed; regenerate it with the command above, redirected to a file, whenever you need the
raw numbers again — mine went to `investigation/source-groups/local/measurements.json`, gitignored).
Everything below is drawn from that output. `--gaps` prints the raw nearest-neighbour distances used
to choose the grouping threshold (see "Grouping" below).

## Measures, one at a time

### Grouping

A group is same-kind sources (`WaterSource` with `WaterSource`, `BadwaterSource` with
`BadwaterSource`; the two kinds are never grouped together, and none did touch on any official map)
whose footprints sit within a threshold Chebyshev distance of each other, transitively (union-find).
The threshold was chosen from the data, not guessed: `--gaps` prints every same-kind
nearest-neighbour gap on every official map, and each kind's own gaps fall into two clean bands with
one clear jump between them; the threshold is the jump's midpoint, and any value inside the jump
groups the maps identically.

- `WaterSource`: gaps of 1-9 tiles within a cluster (mostly 1: sources sit edge to edge), then a
  jump straight to 18-77 (a different spring, or the map's other river). Threshold: 13.
- `BadwaterSource`: gaps of 1-3 tiles within a cluster, then a jump to 10-161. Threshold: 6.

### Shape (row or cluster)

For a group of 2+ members, fit a line through the members' footprint centres by PCA (the 2x2
covariance of their centres; eigenvalues `l1` &ge; `l2`, `l1`'s eigenvector is the axis). The group is
a **row** when it is elongated along that axis (`l1 / l2 &ge; 4`, or `l2` is ~0 — always true for
exactly 2 members, since 2 points are perfectly collinear) *and* tight around the line (every
member's perpendicular deviation from it &le; 0.75 tile). Otherwise it is a **cluster** (members
spread out in both directions, or scattered off any single line). A group of 1 is a **singleton**.

### Spacing

For a row, the along-axis gap between consecutive members (footprint centre to footprint centre),
sorted along the axis. For a cluster the same number is reported but is less meaningful (there is no
single axis the members line up along); the report calls this out below.

### Row vs. flow

The map's own settled water carries its outflow direction on every wet tile
(`WaterMapNew.ColumnOutflows`, decoded by inverting `world.ts`'s `outflowToken`: four flow magnitudes
per tile, in the order `-y, -x, +y, +x`). The group's own net flow vector is the vector sum of that
outflow over the group's own footprint tiles. Comparing the row's axis to that vector (as unit
vectors, `|dot|`): **across** when within 30&deg; of perpendicular, **along** when within 30&deg; of
parallel, **neither** otherwise. **n/a** when the group has no net outflow at all (its water sits in
a still pool rather than a channel — see "Cases not covered").

### Strength and how it is shared

Each source's `WaterSource.SpecifiedStrength`; a group's total is the sum. "Shared equally" means
every member of a multi-member group has the same strength (within float rounding).

### Where a group sits

**On a map edge** when any of the group's footprint tiles touches the map border (recorded with
which side or sides). Otherwise, compare the group's own mean surface height to the mean surface
height of a ring 8-10 tiles out (Chebyshev), skipping the group's own tiles: **high ground** when the
group sits 1+ level above that ring (a spring on a local rise, e.g. below a ridge, D171), **hollow**
when it sits 1+ level below it (a natural sink; where every badwater group not on the numbers here
turns out to be), **level** otherwise.

## Per-map counts

19 named maps, plus the 3 unnamed dev/test maps marked "(dev)" (kept separate below:
`_waterperformancetest`, in particular, is not a natural map and skews any "typical" count badly if
mixed in).

| Map | Size | Clean sources | Clean groups | Bad sources | Bad groups |
| --- | --- | --- | --- | --- | --- |
| (dev) builtin_00 | 32x32 | 3 | 1 | 1 | 1 |
| Nomads | 256x256 | 23 | 7 | 6 | 6 |
| Pillars | 192x192 | 0 | 0 | 8 | 8 |
| Canyon | 128x128 | 4 | 1 | 4 | 3 |
| Diorama | 50x50 | 2 | 1 | 1 | 1 |
| Waterfalls | 128x128 | 5 | 1 | 2 | 2 |
| Beaverome | 192x192 | 21 | 3 | 4 | 2 |
| ThousandIslands | 256x256 | 35 | 1 | 9 | 7 |
| (dev) builtin_08 | 96x96 | 4 | 2 | 0 | 0 |
| (dev) builtin_09 (`_waterperformancetest`) | 256x256 | 79 | 14 | 14 | 12 |
| Meander | 128x128 | 10 | 2 | 1 | 1 |
| Spillage | 256x150 | 0 | 0 | 0 | 0 |
| Craters | 192x192 | 5 | 1 | 4 | 2 |
| HelixMountain | 256x256 | 6 | 1 | 5 | 3 |
| Pressure | 256x256 | 6 | 2 | 3 | 3 |
| Oasis | 256x256 | 0 | 0 | 5 | 5 |
| Lakes | 256x256 | 8 | 2 | 3 | 3 |
| Cliffside | 100x50 | 3 | 1 | 1 | 1 |
| Hollows | 192x192 | 8 | 4 | 3 | 3 |
| Terraces | 256x256 | 15 | 5 | 4 | 4 |
| MountainRange | 256x150 | 8 | 2 | 4 | 3 |
| Plains | 256x256 | 11 | 3 | 2 | 2 |

Clean sources per named map: median 6 (range 0-35, Pillars and Oasis have no `WaterSource`, only
badwater; Spillage has neither). Badwater sources per named map: median 4 (range 0-9).

## WaterSource groups, one row per group (19 named maps)

| Map | Members | Shape | Spacing (tiles) | Row vs flow | Total strength | Strengths | Site |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Nomads | 3 | row | 1, 1 | n/a | 2 | 0.5, 1, 0.5 | hollow |
| Nomads | 3 | row | 1, 1 | n/a | 2 | 0.5, 1, 0.5 | hollow |
| Nomads | 3 | row | 1, 1 | n/a | 3 | 1, 1, 1 | high ground |
| Nomads | 3 | row | 1, 1 | n/a | 3 | 1, 1, 1 | hollow |
| Nomads | 3 | row | 1, 1 | n/a | 2 | 0.5, 1, 0.5 | hollow |
| Nomads | 3 | row | 1, 1 | n/a | 2 | 0.5, 1, 0.5 | hollow |
| Nomads | 5 | cluster | (loose) | n/a | 4 | 0.5, 1, 0.5, 1, 1 | hollow |
| Canyon | 4 | row | 1, 1, 1 | across | 2 | 0.5 x4 | edge (north) |
| Diorama | 2 | row | 1 | across | 3 | 1.5, 1.5 | high ground |
| Waterfalls | 5 | row | 1, 1, 1, 1 | across | 2.5 | 0.5 x5 | edge (north) |
| Beaverome | 6 | cluster | (loose) | n/a | 3 | 0.5 x6 | level |
| Beaverome | 7 | cluster | (loose) | n/a | 3.5 | 0.5 x7 | level |
| Beaverome | 8 | cluster | (loose) | n/a | 4 | 0.5 x8 | hollow |
| ThousandIslands | 35 | row* | mostly 1 | across | 27 | 0.5/1 mixed | edge (north) |
| Meander | 8 | row | mostly 1 | across | 4.5 | 0.5-0.75 | edge (north) |
| Meander | 2 | row | 1 | across | 1 | 0.5, 0.5 | edge (east) |
| Craters | 5 | row | 1, 1, 1, 1 | across | 3.5 | 0.5, 0.75, 1, 0.75, 0.5 | edge (east) |
| HelixMountain | 6 | cluster | (loose) | n/a | 3 | 0.5 x6 | hollow |
| Pressure | 3 | row | 1, 1 | across | 1.5 | 0.25, 1, 0.25 | high ground |
| Pressure | 3 | row | 1, 1 | across | 3.75 | 1.25 x3 | high ground |
| Lakes | 5 | row | 1, 1, 1, 1 | across | 4 | 0.5, 1, 1, 1, 0.5 | level |
| Lakes | 3 | row | 1, 1 | across | 3 | 1 x3 | hollow |
| Cliffside | 3 | row | 1, 1 | across | 2.5 | 0.75, 1, 0.75 | high ground |
| Hollows | 2 | row | 1 | across | 1 | 0.5, 0.5 | high ground |
| Hollows | 2 | row | 1 | across | 1 | 0.5, 0.5 | level |
| Hollows | 3 | row | 1, 1 | across | 1 | 0.25, 0.5, 0.25 | high ground |
| Hollows | 1 | singleton | - | n/a | 0.5 | 0.5 | level |
| Terraces | 2 | row | 1 | across | 2 | 1, 1 | high ground |
| Terraces | 2 | row | 1 | across | 1 | 0.5, 0.5 | hollow |
| Terraces | 3 | row | 1, 1 | across | 1.5 | 0.5 x3 | hollow |
| Terraces | 5 | row | 1, 1, 1, 1 | across | 2.5 | 0.5 x5 | level |
| Terraces | 3 | row | 1, 1 | across | 0.75 | 0.25 x3 | high ground |
| MountainRange | 5 | row | 1, 1, 1, 1 | across | 2.5 | 0.5 x5 | level |
| MountainRange | 3 | row | 1, 1 | across | 1.5 | 0.5 x3 | hollow |
| Plains | 4 | row | 1, 1, 1 | across | 1 | 0.25 x4 | edge (north) |
| Plains | 3 | row | 1, 1 | across | 1.5 | 0.5 x3 | level |
| Plains | 4 | row | 1, 1, 1 | across | 2 | 0.5 x4 | hollow |

\* ThousandIslands' 35-member "row" is one union-find chain along a long archipelago coastline (see
"Cases not covered"); read it as several separate mouths of 2-4, not one 35-source head.

## BadwaterSource groups, one row per group (19 named maps)

49 of the 59 groups (83%) are lone singletons; the rest are all pairs (no group of 3+ was found on a
named map). The 10 pairs:

| Map | Spacing (centre to centre) | Row vs flow | Total strength | Strengths | Site |
| --- | --- | --- | --- | --- | --- |
| Canyon | 4.24 | across | 1 | 0.5, 0.5 | hollow |
| Beaverome | 5.0 | across | 3 | 1.5, 1.5 | hollow |
| Beaverome | 5.83 | across | 2 | 1, 1 | hollow |
| ThousandIslands | 5.0 | across | 3 | 1.5, 1.5 | high ground |
| ThousandIslands | 3.16 | neither | 3 | 1.5, 1.5 | level |
| Craters | 7.07 | along | 2 | 1, 1 | hollow |
| Craters | 4.12 | neither | 4 | 2, 2 | hollow |
| HelixMountain | 4.47 | neither | 2 | 1, 1 | hollow |
| HelixMountain | 3.16 | across | 3 | 1.5, 1.5 | hollow |
| MountainRange | 4.47 | neither | 3 | 1.5, 1.5 | level |

(`BadwaterSource` is a 3x3 footprint, so a centre-to-centre spacing of 3 is two sources touching edge
to edge; the pairs above range from touching to a 4-tile gap between footprints.)

## Overall distributions (19 named maps; dev/test maps excluded)

**WaterSource** (37 groups, 170 individual sources):
- Singleton groups: 1/37 (3%) — clean sources are almost always grouped, not solitary.
- Group size (excluding the one 35-member chain): 1, then mostly 2-5, mode **3** (13 of 36 groups);
  a few larger groups up to 8.
- Shape of multi-member groups: **row 31, cluster 5**. The 5 clusters are the larger, looser groups
  (5-8 members: Nomads' one 5-member group, Beaverome's three 6-8 member groups, builtin_08's one
  3-member group) — see "Cases not covered".
- Row vs. flow, of the 31 rows: **25 across, 0 along, 0 neither, 6 n/a** (no net flow at the group's
  own tiles — a still pool, not a channel). Every row with a measurable flow lies **across** it; none
  lies along it.
- Spacing within a row: overwhelmingly **1 tile** (sources sit edge to edge); a small number of
  larger single gaps inside otherwise-1-tile rows (a bend, or a slightly separated extra source).
- Strength per source: 0.25-1.5, most common **0.5** (105 of 170, 62%).
- Multi-member groups sharing strength equally: 24/36 (67%). Of the 12 that don't, most still use
  only two values with the strongest source in the middle and weaker sources on the outside,
  symmetric (e.g. Craters' 0.5, 0.75, 1, 0.75, 0.5; Nomads' 0.5, 1, 0.5) — a tapered variant of the
  equal-share rule, not an arbitrary mix.
- Site: hollow 13, high ground 9, level 8, a map edge 7 (north 5, east 2). "Hollow" here almost
  always means a spring feeding a valley that dips below its surroundings (D171's "valley heads and
  below ridges"), not a stagnant pit — that reading is reserved for badwater below.

**BadwaterSource** (59 groups, 69 individual sources):
- Singleton groups: 49/59 (83%) — a badwater source is usually alone.
- The 10 non-singleton groups are all pairs; no group of 3+ badwater sources on a named map.
- Row vs. flow of the 10 pairs: across 5, neither 4, along 1 — no strong directional signal (a pit's
  water often has no one obvious downstream side).
- Spacing of the 10 pairs: 3.16-7.07 tiles centre to centre (touching to a roughly 4-tile gap).
- Strength per source: 0.5-3, most common **1.5** (26 of 69, 38%).
- Pairs sharing strength equally: **10/10 (100%)**.
- Site: hollow 40 (68%), level 10, high ground 9, never on a map edge.

## The proposed rule

**Clean water (`WaterSource`).** A river's head gets a **row of sources across the flow** (never
along it), most often **3** (commonly 2-5, occasionally more on a wide mouth), spaced **1 tile
apart** (edge to edge), each at strength **0.5** and the total **shared equally** across the row (a
symmetric taper toward the middle is an acceptable variant, not required). The row sits either on a
map edge (an incoming river) or inland at a spot that dips slightly below its surroundings (a valley
head) or, less often, on a small local rise (a spring below a ridge), matching D171's existing
placement rule — this only changes single sources into grouped rows.

**Badwater (`BadwaterSource`).** Usually **one source alone** (83% of the time). When there is more
than one at a site, it is a **pair**, not a larger cluster: two sources a few tiles apart (roughly
touching up to a 4-tile gap), sharing their strength **equally**, each typically **1.5**. Badwater
groups sit in a hollow far more often than clean ones do (68% vs. 22%), rarely on level ground, and
never on a map edge. The row-vs-flow test does not give a clean signal for badwater pairs (they
often sit in a still pit), so no orientation rule is proposed for the pair beyond "close together."

## Cases the rule doesn't cover

- **A long coastline of separate small mouths chains into one "group."** ThousandIslands' 35-member
  water-source "row" is really several distinct 2-4-source mouths around an archipelago, close
  enough along the shore that the union-find grouping (any single fixed threshold) links them
  transitively into one chain. Any placement rule built from this measurement should group sources
  by which river or shoreline segment they belong to, not purely by nearest-neighbour distance, or
  it will occasionally chain unrelated mouths together on a busy coastline.
- **Larger clusters are looser than a row.** Nomads' 5-member group and Beaverome's three 6-8-member
  groups are "cluster" by the shape test (not tight enough around one line to call a row), spread
  over a wider area with uneven spacing. A generator rule aiming only for "a row of 3-4" won't need
  to reproduce these, but a rule that sometimes builds bigger groups (a major river's mouth) should
  expect them to spread into a loose cluster rather than a single long row once past about 5-6
  members.
- **Unequal-strength rows are usually a symmetric taper, not arbitrary.** 33% of clean multi-member
  groups don't share strength equally, but nearly all of those are a taper (strongest in the middle,
  weaker at the ends) rather than a random split; a rule that only implements equal sharing covers
  two-thirds of the official maps outright and is a reasonable simplification of the rest.
- **A few maps have no water sources, or no badwater sources, at all** (Pillars and Oasis have none;
  Spillage has neither). The rule above describes a map that has sources of that kind; it says
  nothing about how many maps should have none.
- **The flow-direction reading needs a channel, not a pool.** 6 of the 31 clean rows sit in areas
  with no net settled-water outflow (a lake or a wide pool rather than a running channel), so
  "across the flow" can't be checked there; those groups are still rows by shape, just not
  comparable to a flow direction. The same applies to most badwater pairs, which is why no
  orientation rule is proposed for badwater.
- **The dev/test maps are excluded on purpose.** `_waterperformancetest` (79 water sources across 14
  groups) exists to stress-test the water simulation, not to show a normal map's source layout; it
  and the other two unnamed maps are reported above for completeness but are not part of the rule's
  supporting numbers.
