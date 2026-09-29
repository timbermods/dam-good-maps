# M9b: composition and variety

> **Hand-back note (batch 5, D325; 2026-09-29).** Branch `feature/m9b` (draft PR #70), from `dev`
> (merged to e2ed9d90). Batch 5 of Kyler's build order (`docs/feedback/2026-09-29-build-order.md`),
> step by step below ("Batch 5"). Steps 1–5 in (the one re-pin done, the quick suite green), and
> D330's two generator pieces (Sources: None, the automatic water fix), and step 6 (the numbers as
> data). Next: step 7, the release candidate (the batches, the chaos batch, then the pooled probe on
> Kyler's yes, then the review set).
> Defaults this session chose: decisions-pending #135–#146.

Kyler's decisions: PLAN §20 D252, D273–D278, D282, D286, D294 (the starting list from M9a's review
set), D298 (the game's own soil rules). The yardstick: `docs/PERFECT.md`'s "Maps", "Water" and
"Challenge" (Challenge's terrain difficulty is deferred, D276).

## Batch 5 (D325): the forces-preview feedback's items 47, 36, 26, 27, 22, 21, 24

Measured with `investigation/m9b/measures.ts` (seeds 1–10 of every theme at 128², the cycle model
for badwater; results in `investigation/m9b/local/measures/`, ignored).

- **Step 1, the height budget (items 47, 36).** The land stands on a floor: every level moves up
  by `BED_FLOOR` (3) and the relief is squeezed only where it would pass the ceiling
  (`genome.ts` `leanGenome`); no cut goes below it (the river profiles, pools, oxbows, outlets,
  badwater pits, and a clamp before the course check). Deepest bed per theme 0 → 3. Highest
  terrain is a cap on every map, 10–22, its default following Verticality (16 / 22; #139); at
  Verticality 70+ spikes, walls and trenches one or two tiles wide standing two levels out go
  (`levels.ts` `readable`; #140). Verticality 100 maps reach 17–22.
- **Step 2, the trees and the start (items 26, 47).** Living trees only count toward the tree
  budget (#141): dead trees per theme (sum of 10 maps) Any 12,620 → 18, River Valley 12,336 → 25,
  Canyon 10,014 → 29, Highlands 11,161 → 120, Lake Basin 12,696 → 133, Delta 15,571 → 63,
  Islands 13,032 → 34 (the start's fallback, the floor's dry wood, one drought-killed grove on a
  third of maps); `resources.trees` counts living trees against the official living share. Two
  mine sites the colony reaches (#136), Hard's berries 30 (#137), the start's farmland and level
  land on its walk (`start.farmland`, `start.level_land`; #138; the walk's numbers are
  `analysis.walkReach`, item 24's with them), the settler's land on the settled water. Badwater
  contained (#142): land it reaches before the badtide, median per theme 96–361 → 71–144 tiles;
  none reaches the start's water or farmland. The new intention `district-behind` (#135).
- **Step 3, item 27.** `src/core/water/edgeLip.ts` (callable, with its README section and
  `tests/unit/edgeLip.test.ts`): the edge tiles an edge row's water would reach stand a level above
  it. The course check seals only a mouth's own tiles (a wider seal hid the leak), the lip holds a
  lake's shore at the edge too, and badwater ditches keep out of its reach (one carried a whole
  river off the map). Maps losing over 5% of a head's water off the map beside its row, seeds 1–10
  of every theme at 128²: 18 of 70 → 0.
- **Step 4 (D329, replacing the step as written).** The first map that passes is the map
  (`generate`), never swapped; its outcomes decide a background search (`gen/versions.ts`: up to 6
  siblings, a worker of its own) for a version meeting all three, offered under Generate with a
  short note (#143; misses that notify #144); "Looking for a better one" retired. Speed: mouth
  tiles and path fields no longer sweep the whole map (the path field is the same bit for bit),
  drainage reused across pit candidates, far badwater kept (#145), the bank start's land 800
  tiles. One map at a time on this PC: to the map 128² median 1.7 s (p90 4.9), 256² 11.1 s (p90
  25); first maps meeting all three 39% and 34%; targets proposed in #146.
- **Step 5, the one re-pin (D308, D148).** The quick suite green (782 passed, 13 skipped); every
  change under "Tests updated" below. The Python validator (`prototype/playability.py`) takes the
  new checks (two reachable mine sites, the start's farmland and level land, living trees in the
  amounts) and Hard's berries, so the real places' parity holds; item 47's start land is a known
  shortfall for real places (D331: a preference there). CI's browser specs moved to batch 5's maps
  too (seeds and names), and the attempt cap is 16 (Lake Basin 128² seed 19 passed only after 12).
- **D330's two generator pieces.** Sources: Placed · None (`so=n`; the water section's Sources):
  None is the map as generated, then its features' sources and their water removed (the field's
  `dry`, which also plants the trees and bushes where the soil was moist as generated); its water
  checks say "No water source" as information until a source runs (`tests/contract/sourcesNone.test.ts`).
  The automatic water fix (`src/core/doc/waterFix.ts`, callable as `waterFixOps` in the worker's
  session): a spring by the start, tried on a copy and settled, when the start's water, berries or
  farmland fail after edits (`tests/contract/waterFix.test.ts`).
- **Step 6, items 24's and 47's numbers as data** (no display until "The page is the editor"):
  `analysis.walkReach` (trees within the floor's 40-tile walk and the logs they hold; the start's
  farmland and level land within 20) and `analysis.levers` (farmland, the nearest metal, the
  nearest badwater, the shortest dam within 40 tiles that stores the drought's need, buildable
  land), all from the start's one walk (`tests/contract/levers.test.ts`).
- **State at the hand-back:** CI green on `99adfc2f` (test, oracle, generation, the four browser
  shards); the contact sheet `docs/sheets/m9b.png` remade. Not yet: the heavy settings experiment
  (nightly) fails 10 of 34 on this branch, each a setting that moves its target less since batch 5:
  Relief (the land squeezed under the ceiling on the beds' floor), Forest density (living trees
  only), Badwater distance, the start's badwater rule and Designed for (far badwater kept, #145),
  Berries near start, Lakes and basins, Waterfalls, Mine sites, and one Verticality map failing a
  check; their targets want deciding (D148) with the release candidate's batches.

## D333: M9b's answers (Kyler, 2026-09-29)

### The pooled probe (D308 (2), D333 (1)): run m9b-20260929b, on 7695e6a8

18 maps (the catalog's `M9b` group: two per theme at 128², two chaos maps at 256², two with
Sources: None), played with Kyler's installed mods on his yes; the restore was clean (only Steam's
`steam_autocloud.vdf` changed). Results in `C:\dgm-probe\results\m9b-20260929b\`. **14 of 18
pass every check** (load, objects, water, terrain, cal-timeline, drought-start-water,
m9a-badwater), both chaos maps with them.

- **The two Sources: None maps "failed" water on 0 of 0 wet tiles** (the game and the model both
  dry): the check read an empty map's volume as a failure. Now a map dry in the file and in the
  game holds, and water on one side only fails (`compare.ts` `waterHolds`, with a self-test).
- **River Valley 128² seed 2 and Lake Basin 128² seed 2 fail cal-timeline after the drought's
  refill** (day 7 on): wet tiles, judged as D297 judges them, 646 in the game against 679 in the
  model (5.2%) and 3,159 against 3,412 (7.6%); the water 3.4% and 3.5% apart. Both agree through
  the drought. Tile by tile (`investigation/m9b/local/refill.ts`), every extra tile of the model's
  lies in a thin sheet on a flat standing level with the water: River Valley's 728 tiles of the
  level-4 flat round a tributary running on that flat (its bed the flat's level, its surface 4.04–
  4.26; the file had 0.039 there, the game 0.044 or dry, the model 0.060); Lake Basin's level-7 and
  level-8 shelves under a lake at 8.07 (the file 0.075–0.098, the game dry, the model 0.08–0.10).
  Such a flat has two steady states under the game's spill threshold (a dry tile of the same floor
  takes water only when the water beside it stands 0.1 higher): wet if it was wet, dry if it dried.
  The drought dries it in both; on the refill the model re-wets it and the game mostly doesn't,
  hundredths apart in a transient: D311's known weak spot, thin sheets, not a water rule. What a
  player sees is the game's: water on those flats at the start that the first drought takes for
  good. Thin sheets (under 0.1 deep over 20+ tiles of one level, `sheets.ts`) are on 59 of 70 first
  maps at 128² (River Valley's median 1,310 tiles), and were on 52 of 70 before batch 5. The fix
  belongs to the generator (no flat level with a water surface), not the model; below.
- The runner's self-test: the High terrain group's test mesa covered Highlands 4242's start (moved
  by generator 0.8.0); the mesa now stands at the first of a few places 30+ tiles from the start.

### Items 24's and 47's numbers reach the page (#92)

The worker's `GenerateResponse` carries `walkReach` and `levers` (the shapes of
`PlayabilityAnalysis`, which "The page is the editor" part 1's map card mirrors) for every map it
sends: a generated one, a version the background search found, a sibling, an edited document
(`tests/contract/levers.test.ts`).

## Handoff (2026-09-27, evening)

Where it stopped: the last commits on `feature/m9b` are `2afb62f9` (decisions-pending #134 follows
D290) on `d5dd375f` (two map fixes) on `284818ad` (sources in groups). Since the grouped sources:

- **D314's source groups** (`284818ad`): `src/core/water/sourceGroups.ts`, its README and
  `tests/unit/sourceGroups.test.ts` taken whole from `a6346fe4`; inland springs and a lake's spring
  are groups (`placeSourceGroup` in `features/build.ts`); an edge mouth is the rule's row
  (`mouthRow`/`mouthRowAt` in `features/raster/terrain.ts`, cut by `land/hydro.ts`, sealed by the
  build; the channel narrowed to it). Pending default #134.
- **D290 and the badwater toggle** (`2afb62f9`, docs only): on a mouth of 2 the editor's badwater
  toggle follows D290 (the 3×3 moves in along the channel and cuts its own pool, never refuses);
  that editor side lands with `feature/forces` (dd01844). Nothing to build on M9b.
- **Two map fixes** from the contact sheet (`d5dd375f`): a badwater ditch no longer runs
  ruler-straight where its wave met ground it keeps off (`land/hazards.ts` `windOnce`: the wave
  swings less there, down to the route); the sea's rim of land along the edges wanders
  (`land/field.ts`, `keepRim`), so no sea draws a square.
- `docs/sheets/m9b.png` (committed earlier) was made before the grouped sources and these fixes:
  remake it at the release candidate.

**The quick suite on `d5dd375f`** (`npx vitest run --project quick --maxWorkers=4`, about 25 min):
765 passed, 10 failed, 13 skipped. The ten, and what each needs (D148: re-seed or re-pin, never
weaken):

| Test | Now | Needs |
|---|---|---|
| `tests/contract/look-mine-ruins.test.ts`, the 4242 download | `LIVE_SHA` 8d2941ad… | re-pin to the new sha (4f739ec0…; print the full one with the snippet below) and add 8d2941ad… to the comment's history |
| `tests/contract/brush.test.ts`, "smooth, make walkable…" | River Valley 96² seed 4 | another seed where the stroke by the start finds a cliff |
| `tests/contract/carve.test.ts`, the oxbow carve | Canyon 96² seed 22, aim (48, 10) → (48, 86) | a Canyon seed and aim whose carve leaves a lake of 70+ tiles |
| `tests/contract/objects.test.ts`, "ruins on a rise" | highlands 7, islands 6, 8, 7 (2 of 4 now) | four 128² maps holding an `obstaclePayoff` set piece |
| `tests/contract/setpieces.test.ts`, "an on-river fall asked to drop 16…" | `session(96, 7)` | a 96² seed where some place along a river takes the fall |
| `tests/contract/setpieces.test.ts`, gorge, terraced cliffs, badwater basin | `session(128, 7)` (the describe's one map) | a 128² seed where all four builders' range tests pass |
| `tests/contract/shelf.test.ts`, the painted grove | River Valley 96² seed 18 | a seed with 9×9 open level ground 16+ tiles from the start |
| `tests/contract/resources.test.ts`, "generated maps carry the official amounts…" | 0.5225, the line < 0.52 | **look first**: a share just over its line on the grouped-source maps; find which measure and whether a map changed or the line was tight, before re-seeding |

**Next step, in order:**

1. Re-seed the six seed-bound tests the way the earlier ones were (`docs/progress/m9b.md`, "Tests
   updated…"): make the test's seed an environment value for a moment, try seeds, keep the first
   that passes, hard-code it with a one-line reason, e.g.

   ```
   sed -i 's/session(128, 7)/session(128, Number(process.env.GSEED ?? 7))/' tests/contract/setpieces.test.ts
   for g in 8 9 10 11 12; do GSEED=$g npx vitest run tests/contract/setpieces.test.ts -t "the other builders" | grep -E "Tests "; done
   ```

   For the set-piece maps, a quick finder: generate seeds and list the maps whose features hold
   `obstaclePayoff` / `secondDistrict` / `weir` (`r.features.some((g) => g.kind === "setPiece" &&
   g.params.kind === "obstaclePayoff")`). For the oxbow: a Canyon 96² sweep over seeds 1–30 and six
   aims (corner to corner both ways, edge to edge both ways), keeping the first whose
   `carveParams(...).lake.tiles.length > 70` (the test's own `carveOp`).
2. Re-pin the 4242 sha:

   ```
   npx tsx -e 'import { createHash } from "node:crypto"; import { generate } from "./src/core/gen/generate"; import { makeSpec } from "./src/core/spec/mapspec"; const r = generate(makeSpec({ seed: 4242, size: { x: 128, y: 128 }, theme: "riverValley", designedFor: "normal" })); console.log(createHash("sha256").update(r.bytes).digest("hex"));'
   ```
3. Look at the resources test's 0.5225 (above), then run the quick suite again; log every changed
   test under "Tests updated…" (D148).
4. Then, under D308: small samples on 256² generation time (Canyon 256² seed 1 still takes 12
   attempts, most refused after the settle: a source in another's flow, the water not settling, the
   course check); the names hand-check (30 maps, 10 at Variety 100); merge `origin/dev` when M9a
   lands there. At the release candidate: the contact sheet again (`npm run sheet -- --compare
   origin/feature/m9a --png docs/sheets/m9b.png --no-open`), the per-theme batches (`tools/batches.ts`,
   96/128 at 100 seeds, 192/256 at 50, 4 jobs) and the chaos batch (`--themes any --sizes 128,256
   --set "vy=100&vt=100"`), the 200-seeds measures, the pooled probe, then the review set
   (`investigation/m9b-review/make-all.ts`).

Also in flight: the rules set Real places 2 takes is `1c9d1340` (its checkout line is in the
milestone session's messages and in the commit's message: water and soil default to the port's
there); the paused per-theme batches of the port-era generator (investigation/m9b/local/batches/)
are stale: don't resume them.

## What was built

### One readable water system (D273 (1), D294 (1))

M9a's maps held 4–9 separate water systems each: every river head, spring and spring lake found its
own way to its own edge. Now (`land/hydro.ts`):

- **The main river first, tributaries after.** The first head traced is the main river; every later
  head must join the water already traced, as a tributary at least 18% of the map's side long. Only
  a Rivers count the player set may enter as a river of its own when none can join. At most 4–6
  heads (4 at 96², 5 at 128², 6 at 192², 7 at 256²), a spring lake's kept room among them.
- **Rivers that can be followed** (`land/courses.ts`). Before the water settles, a priority flood
  from every draining edge tile (all but an inflow's sealed mouth) and a second from the stretch of
  edge the river's system leaves by (35% of the side either way, and a delta's mouths): where some
  course tile's water has a strictly lower way out elsewhere, the plan is refused and made again
  (an attempt refused before its water settled now keeps only its land for the record, no settle).
- The causes it found, each fixed at the source:
  - **a lake standing above where its river begins**: a lake found on a course now stands below the
    head's level (the mouth's banks, or the spring) as well as within the water budget; a
    budget-cut hollow is one lake, not several copies;
  - **a head below the spill of its own way down** (a low point of the upstream edge behind a ridge,
    or a hollow on the way filling above the head): refused when it is traced;
  - **an inflow's banks lowered to its channel**: the carve and the edge relaxing now leave the
    outer two rows of an inflow's edge beyond its mouth's own width (the game drains every edge tile
    but a mouth's sources), and an inflow heads inland from its mouth, never along its edge;
  - **a weir whose pool drained by an edge 40+ tiles upstream**: its pool is followed all the way;
  - **an inflow's water running back out by its own edge** (a low plain along the edge beside the
    mouth; a tie with the exit counted too, since the near edge takes it all): the edge row there
    gets a lip a level over the water, at most two levels high and a quarter of the side long, else
    the plan is made again; the mouth's own tiles never;
  - **a lake standing higher than an inflow's mouth could hold** (its water would stand over the
    mouth's edge beside it): a lake on a river stands no higher than the lowest spill of every
    inflow mouth whose water reaches it;
  - **an inflow's mouth** keeps a level block three tiles wide and three deep at its lowest bed
    (the edge's banks beside it are kept now; a narrower mouth held no BadwaterSource when the
    player turned the river to badwater in the editor: 4 of 16 River Valley mains could, now all);
  - **a spring lake's water** joins the rivers already traced, as a spring's does (a spring lake
    with a way out of its own was a second system, sometimes larger than the river's);
  - **a hollow on the course above the river's reach** (a pit on a shoulder the course crosses, its
    water standing over the channel's banks upstream, where they drain away lower): no lake of that
    river's, so its channel runs on through it (it was left uncarved, then dropped as unreached,
    and the course stood high and dry across it).
- **The water story** (`analysis/story.ts`, information and the candidate choice): the main
  system's share of the water, other systems, heads, rivers that never join, how much of each
  river's course holds water, and how much of the dry land lies within 14% of the side of clean
  water (D294's "water in one corner").

### Themes keep their promise (D273 (2))

`analysis/signature.ts` measures each promise; `gen/outcomes.ts` `PROMISES` sets the lines where
the theme's maps part from the others (on seeds 1–10 of every theme at 128²):

| Theme | Promise | Measure and line |
|---|---|---|
| River Valley | a main river through a broad valley | the main river's valley floor (within a level of its water), median across its course, ≥ 20% of the side at 128², growing as the square root of the side |
| Canyon | a river cut deep between cliffs for a real stretch | a river whose ground 2–6 tiles out rises 3+ levels over its water on both sides, for max(16, 16% of the side) tiles and 20% of its course at 128² (the length growing, the share falling, as the square root of the side) |
| Highlands | high, rugged ground with plateaus and valleys among it | 60%+ of the dry land 4+ levels over the rivers, 3+ plateaus (level ground of 120+ tiles at 128² whose rim mostly drops 2+ levels), cliffs on 10%+ at 128² (lines: their share falls as the square root of the side, 7% at 256²) |
| Lake Basin | big lakes that dominate the water | 55%+ of the water in the natural lakes the generator found (its read-back lake features; level bodies counted wide rivers too), the largest 4%+ of the map |
| Delta | a river splitting into several channels as it reaches low ground | the main system leaves by 3+ separate mouths |
| Islands | land broken by water into islands | 3+ islands of 30+ tiles (at 128²) in a sea of 25%+ of the map, 5%+ of the land apart from the largest mass |

**Larger maps** (the paused 256² batches: River Valley missed its promise 40 times in 14 maps,
and "only a fifth of the land near clean water" was the commonest water miss on every theme): the
valley floor, the springs and the heads grow with the map (the floor and the springs as the square
root of the side and the area, the heads as the area to the ¾), and River Valley's line is a floor
25.6 tiles wide at 128², growing as the square root of the side (36 at 256²).

The priors were steered toward them (they blurred, D294 (2)): River Valley's big river clears a
floor of 7–13 tiles; Canyon's floor 0–2.5 and its cut 3–6 levels; Highlands leans up (lean
0.55–0.9), with more and broader plateaus, benches 2–3, rivers set 1.5–3.5 into their valleys;
Delta always fans into two or three more mouths; Canyon has 2–5 springs, so side canyons carry
water across its plateaus (its water sat in one corner, D294 (1, 4)).

**Islands had no sea** (D294 (2)): the Lakes setting's None applied at Islands' own preset (None),
cutting every sea's lake budget to nothing. A setting now leans the genome only where it moves from
the theme's preset. The sea lies in one of six layouts (`land/genome.ts` `addSea`, its own random
stream): off-centre, off one edge behind a strip of coast, an archipelago across most of the map,
an island chain along an arc, atolls (rings of islets, lobed, with passes), or two seas with a
ridge between. A sea is fed by springs on the heights round it (an inflow enters low on the bowl's
rim, and no lake stands above where its water comes in), and keeps a rim of land along the map's
edges: a sea that ran to an edge spilled out there and stood low, its islands on the dry floor
joined to the land (Islands met its promise on 3 of 10 maps; the archipelago's sea is broad again,
its islands scattered where the water is deep).

### A character on every map (D273 (3), D274)

- **The set** (`land/intentions.ts`): Kyler's four and the seven, and the ten he picked: the oxbow
  lake, lakes stepping down the valley, the river split round a big island, two falls side by side,
  a long cliff splitting the map, hanging side valleys, two ways to grow, badwater through the
  richest land, a relic on a pinnacle, a plug holding back a lake. Each has its steering (a nudge,
  never a build) and its check on the finished map. Every map draws one (60%) or two (40%).
- **The recipes fold in** (D275 (1)): the great scarp is the long cliff's steering, the island in a
  river the split island's, the chain of lakes the stepped lakes', the mesa field one of the
  landmark's, the hanging lake and the caldera already Kyler's high lake and crater; the badwater
  volcano and the volcano island are dropped (the Islands layouts stand for the second).
- **Lakes read per level body**: the checks read every level lake within the water (a river joins
  the lakes along it into one body, and each counted as one before).
- Emergence, forced on Any seeds 1–6 at 128² (`tools/intention-rates.ts`), first round: the long
  cliff 6/6, badwater through rich land 3/6, the split island, two ways and the relic 2/6, twin
  falls, the oxbow and stepped lakes 1/6, hanging valleys and the plug 0/6. Since: the oxbow tries
  any river where its bed has room below it; two ways and badwater through rich land steer the
  start (its preference reads the farmland one way and higher ground the other, and the low land
  beside badwater within 60 tiles) and are re-steered once like the other start intentions (two
  ways 3/3 on seeds 1–3).
- **A map's own intention** (D138: failure allowed, many realizations): when none of the
  intentions a map was steered toward emerged, the set is checked on the finished map in an order
  drawn from its seed, and the first that holds is its standout ("found", not steered). Every map
  of seeds 1–10 of every theme then had a standout (58 of 70 had one before it).

### Candidates by the outcomes (D278 (1a))

`generate` makes candidates until one meets the three outcomes (readable water, the theme's promise,
a standout intention); a candidate that misses one grows new land; after 4 the best stands (the most
outcomes met, then stored water near the start where the player asked for more reserve). It replaces
K = 3 and the score (dropped with M9c, D278 (3)). Each candidate is announced (`onCandidate`); the
page shows the first one found, its water settled, and "Found a map. Looking for a better one (2 of
4)" while it looks on.

Where the outcomes stand (seeds 1–10 of every theme at 128², `tools/look.ts`; three rounds, the
last after the course, sea, Canyon, badwater and found-intention changes). Times are medians on this
machine while other sessions' tests and conversions ran (four maps at a time), so they are high:

| Theme | Promise | Water reads | Standout | All three | Attempts | Time | First candidate |
|---|---|---|---|---|---|---|---|
| Any | — | 8 | 10 | 8 | 3 | 12.6 s | 8.8 s |
| River Valley | 10 | 6 | 10 | 6 | 5 | 23.2 s | 4.7 s |
| Canyon | 10 | 10 | 10 | 10 | 5 | 17.7 s | 5.6 s |
| Highlands | 10 | 10 | 10 | 10 | 3 | 11.2 s | 4.7 s |
| Lake Basin | 7 | 10 | 10 | 7 | 5 | 11.9 s | 5.3 s |
| Delta | 9 | 10 | 10 | 9 | 2 | 10.3 s | 7.2 s |
| Islands | 8 | 10 | 10 | 8 | 3 | 32.9 s | 15.5 s |

(The first round: 30 of 70 met all three; Canyon's water read on 4, Islands kept its promise on 3.)
Most of the time is the water's settle, once or twice an attempt (about 0.6 s at 128², a broad sea
2–2.5 s: Islands' first candidate is slow for that). What still misses: River Valley's water on 4 of
10 (a separate spring lake larger than the river's own water, a tributary dry most of its course,
dry uplands), Lake Basin's lakes on 3.

### Nothing stamped (D273 (5), D294 (5))

- Crater rims (the caldera part) and round lakes are lobed by two waves round them (on a
  pseudo-angle, the deterministic sine) and stretched along a drawn axis; cone craters noisier.
- The badwater pit is 1.5–2.1 times as long as wide, along the fall of the ground, so its stain
  runs down toward its ditch instead of a round disc; a ditch joins only a channel whose water
  leaves the map without passing a lake (it poisoned whole seas and lakes), and only in the last
  12% of the side before it leaves (joined higher up, it turned the main river's whole lower course
  purple), else it runs to the edge; on its way it never crosses or runs beside other water.

### The 8 orientations (D275 (2))

`land/orient.ts`: each map's land is turned or mirrored into one of its 8 orientations right after
it is made, from a stream of its own, and the water's way with it; the rivers, the start and the
objects are then found on the turned land. A map that is not square takes the 4 that keep its sides.
Measured on the draw (seeds 1–100; it does not depend on the theme): all 8 appear, the most common
18% (genome 0), 17% (genomes 1 and 2).

### Names, how it plays, Another like this, Variety

- **Names** (`gen/names.ts`, D278 (1b)): from the standout, a few titles each ("Stair Lakes", "Relic
  Spire", "Oxbow Bend"), some with the land's noun (the theme's, the sea layout's, or for Any what
  the map shows most); chosen by the seed, never a title the names study forbids (official and
  workshop titles, real places: `src/core/data/forbiddenNames.json`). **How it plays**: the
  standout in the map's own numbers (each intention's check says what it found, "A river winds
  back and forth 12 times down the hill, dropping 5 levels at its bends.") and one thing read from
  the map (the start's water in the first drought, a dam site near the start, where the badwater
  lies, the woods). On the map card; the theme moves to
  the line under the name.
- **Another like this** (D278 (1c)): on the page beside Refine, and in the editor's menu. A sibling
  keeps the theme, settings and intentions and grows different land (the genome's variation, D143);
  its link carries `vr=` and `in=`. A sibling whose land matches the map it came from (85% of tiles
  within a level) is passed over for the next.
- **Variety** is a setting (`vy=`, 0–100, 70 the default; D276), beside Verticality.

### The game's own soil rules (D298)

`src/core/sim/columns.ts` and `soil3d.ts` are taken whole from `feature/terrain3d-a` at 62508d7d
(identical on both branches). `sim/soil.ts` `gameSoil` runs its game mode on one run per tile; the
build and the TypeScript validator's moisture, soil contamination and drought moisture use it;
`prototype/soil.py` is the Python validator's port (float32, one whole-grid update a tick),
bit for bit with the TypeScript. `tests/unit/soilGame.test.ts` holds the heightfield half of the 3D
branch's soil test (its cave half needs the stacked engine) and the Python parity.

Measured (`tools/soil-compare.ts`, the same maps with the old model and the game's; seeds 1–3 of
every theme at 128², and Any, River Valley and Islands seed 1 at 256²):

| Theme | Plants | Moved or changed | Old model's time / game's (mean, ms, under load) |
|---|---|---|---|
| Any | 5,980 | 1,745 (29%) | 19,852 / 18,641 |
| River Valley | 5,954 | 1,683 (28%) | 5,474 / 5,923 |
| Canyon | 4,937 | 1,580 (32%) | 21,166 / 17,905 |
| Highlands | 5,461 | 0 | 28,876 / 30,084 |
| Lake Basin | 5,947 | 1,964 (33%) | 17,271 / 14,268 |
| Delta | 7,085 | 4,334 (61%) | 12,716 / 14,992 |
| Islands | 6,161 | 0 | 25,576 / 25,555 |

Most of the moves are a cascade: planting draws over the moist land, so one tile of difference
shifts every later draw; where no tile's moisture crossed zero (Highlands, Islands here), nothing
moved. The time is the same within the machine's noise (game mode ~20 ms at 128²). Not yet on the
game's rules: the Real places conversion (`places/place.ts`), `planMapResources` (Real places and
Pick a place) and the editor's soil view; decisions-pending #109.

### The game's water rules (D293, D303, D308)

`sim/water.ts` runs the game's rules by default (`rules: "port"` keeps the port as it was, for the
tests): evaporation on every active tile, a dry one that receives water too; the spill threshold at
the map's edge (floor-0 tiles beside the padding; `edgeSpill`, taken from `feature/weather-days`);
a partial obstacle (NaturalDam) read from the higher of the two floors; the source step setting the
old depth. The game's fifth rule, direction limiters, needs a badtide drain's roofed cell, which a
heightfield cannot hold. `prototype/watersim.py` runs the same rules, bit for bit (every golden
fixture and the edge, dam and seep grids: 0 difference); the golden vectors are regenerated; the
speed-ups test keeps its port digests (still byte-exact) and pins the game's beside them.

**D297's line** (`tools/water-rules-band.ts`, information: the canonical settle, game against port, on the same
map's water model): 10 of 18 maps within (six themes, seeds 1–3, 128²). Outside: River Valley 2
(139 tiles, volume −0.36%), Lake Basin 3 (156 tiles, 0.057 → 0), Delta 3 (30 tiles, −0.85%),
Delta 1 and 2, Highlands 1 and 2, River Valley 3 (3–30 tiles). Taking the rules one at a time on
three of them, the dry-tile evaporation makes all of it (without it: 0 tiles, 0.000%); the edge
spill alone moves a few edge-row tiles from 0 to 0.1. Thin spreading films (0.04–0.09 deep) no
longer form, or take another way, since a dry tile loses 1e-3 a second before it wets. The game's
result is the line's own reference. **Accepted by Kyler (D311):** the game's water rules on open
ground stand although D297's line is missed where thin sheets form less; the pooled probe batch at
the release candidate checks the water against the game itself (decisions-pending #133). The band
tool stays as information.

**One switch, and a set Real places 2 can take** (the milestone session's coordination under
D308): the rules come as a self-contained set, `1c9d1340`, in which water and soil run the port's
rules unless a caller asks for the game's (`DEFAULT_WATER_RULES`, `DEFAULT_SOIL_RULES`: taking it
changes no map, checked on a clean `feature/m9a`: the 4242 sha unchanged, the oracle sample at 0
disagreements). `sim/water.ts` and `prototype/watersim.py`, `sim/soil.ts` and `prototype/soil.py`,
the build (`rules`), `validateMap` (`waterRules`, `soilRules`), and `prototype/validate.py`
(`--water-rules`, `--soil-rules`). M9b's own switch (`06e9bb87`) turns both defaults to the game's;
the Real places, converted under the port's water, settle with it (`place.ts`) until Real places 2
converts them under the game's.

**Sources in groups (D314)**, part of the same switch: `water/sourceGroups.ts` taken whole from
`feature/source-groups` (a6346fe4). The build places a river's inland spring and a lake's spring as
a group (a row across the flow at the head, 2–5 sources sharing the strength, fewer where the ground
is cramped); an edge river's mouth is the rule's row centred where its course crosses the edge, the
channel narrowed to it (`raster/terrain.ts` `mouthRow`, which the hydrology cuts and the build
seals; decisions-pending #134). Aquifers, set pieces' own springs and a badwater river's mouth are
unchanged; the generator places no other badwater springs (its badwater is the pits' set pieces).

**The one re-pin** (D148, D308): the water golden vectors (under the game's rules); the speed-ups
test keeps the port's digests and pins the game's beside them; `waterGame.test.ts` checks the two
languages bit for bit under the game's; `soilGame.test.ts`'s scene settles on the port's water, as
its pin was made; the 4242 download's sha; the map-bound tests re-seeded (listed below).

**Found by the re-pin:** a regeneration's badwater basin took the edge of a player's forest (its
clear square, 5 tiles either way of the pit's middle, reached past the tiles the planner kept off):
the planner now keeps that square off the player's features.

### The probe's two findings (D302)

Measured with the weather-cycle model the probe compares the game against, which followed the game
on both (`investigation/m9b/cycle-check.ts`: 3 temperate days, a 3-day drought, 3 temperate, a
3-day badtide; 10–40 s a map, no game):

- **Badwater refilling pools** (D273 (1), (5)): water over 10% badwater more than 3 tiles from the
  file's badwater, just before the badtide. On M9b's Any 128² seed 1, 40 tiles: refilling after the
  drought, the ditch (cut one below the ground beside it) rose over its banks and left a 0.1-deep
  sheet of badwater on the flat beside it. Ditches are now cut two below the ground beside them: 0
  tiles outside the way down on 15 maps (two Delta maps keep 2 tiles, within the probe's allowance).
- **A sheet in the badtide** (D273 (2)): tiles 0.05–0.12 deep a day into the badtide, dry in the
  file and more than 2 tiles from its water. Delta on M9b: 0–7 tiles (seeds 1–5). River Valley:
  284 and 491 tiles on seeds 1 and 4 (none on 3); Any 4 and 5: 65–77. It is the floodplain: the
  valley floor one level over the bed (PLAN §7.4), the channel running about 0.7 deep; after the
  drought the refill overtops onto the floor and leaves a film. **Kyler's answer (D307):** a floor
  one level over its bed that floods when the river refills or in a badtide is a floodplain, as the
  game plays it; the floor rule and the channels' depth stay (decisions-pending #132).

### Chaos (D273 (6))

Any at Variety 100 and Verticality 100 (`tools/batches.ts --set "vy=100&vt=100"`, 4 jobs, the
results in `investigation/m9b/local/chaos/`):

| Size | Seeds | Final | First attempt | Attempts (mean) | Time a map (median / p90 / max) |
|---|---|---|---|---|---|
| 128² | 100 | 98% | 17% | 5.4 | 15 s / 41 s / 78 s |
| 256² | 50 | 98% | 14% | 6.3 | 102 s / 200 s / 354 s |

**Breakage found and fixed:** 16 of 147 accepted maps' project files did not reopen: on land above
16 a river's natural fall can drop more than 15 levels, and the feature schema's bed step allowed
15 (its start already 22). A bed step's drop now goes to 22, as its start (`features.schema.json`);
the waterfall set piece keeps its own 15 (PLAN §9.10); two of the maps re-checked reopen and rebuild
byte for byte. The time at 256² is too long (most attempts refused after their settle: the course
check, the start, the water settling).

## Tools

- `tools/look.ts` (+ `look-grid.py`): chosen maps drawn large with their water story, signature,
  outcomes, intentions and name; `--systems`, `--paths`, `--intention <id>`.
- `tools/intention-rates.ts`: each intention forced on the same seeds, how often it emerges.
- `tools/soil-compare.ts`: D298's report.

## Tests updated because a decision changed what they tested

- `tests/contract/spec.test.ts`: the codec's round trip draws Variety too (D276: a setting).
- `tests/unit/genome.test.ts`: "draws zero, one or two intentions" is now "draws one or two
  intentions, never none" (D273 (3): every map has a character).
- `tests/contract/live-water.test.ts`: a regeneration whose own map passed takes the attempts its
  candidate choice takes (D278 (1a)), fewer than every layout, instead of exactly one.
- `tests/e2e/editor.spec.ts`, `tests/e2e/legend.spec.ts`: the editor's heading and the page's
  caption name the map by its own name (D278 (1b)), read from the card, not "River Valley".
- `tests/contract/ops.test.ts`: the placed Blockage goes on a free tile found on the map, not at
  (40, 3), which 0.8.0's map of seed 77 covers.
- `tests/contract/shelf.test.ts`: the painted grove is counted on its own tiles and removed within
  its own bounds (a pine of the map's own a few tiles off made the count the map's luck); seed 18.
- Re-seeded for 0.8.0's maps and the game's rules (D148): the badwater test (seed 22), every object
  on (seed 2), a second district's site, ruins on a rise, the weir, the builders' ranges (seed 7),
  the narrows (seed 5), the 16-level fall (seed 7), the oxbow carve (Canyon 22), the tall river's
  reopen (Highlands 10), the edge lake (Lake Basin 6), two brush strokes (seed 4); the 4242 sha.
- Batch 5 (D325, D329), decisions: `spec.test.ts` rejects Highest terrain above 22, not 16 (item
  36), and its round trip draws 2–4 mine sites; `start.test.ts` and the Python `calibrated.py`:
  Hard's berries 30 (item 47); `resources.test.ts`: mine sites two to four, a project or link asking
  for 0 or 1 opens asking for 2, every generated map has two, and "the official amounts" counts
  living trees against the official living share with dead trees under a tenth (item 26; it was
  "two thirds dead"); `validate.test.ts`: the map without objects asks for two mine sites;
  `projects.test.ts`: the deep fall is a bed step of 19 on the map's tallest river (the beds' floor
  makes a generated one rare), the edge lake Lake Basin 96² seed 8; `brush.test.ts`: the ramped
  flatten's spot among living trees (dry ground holds no dead groves); `places.test.ts` and
  `placesCommon.ts`: the start's farmland and level land known for real places (D331); new:
  `tests/unit/edgeLip.test.ts`, `tests/contract/versions.test.ts`.
- Batch 5, re-seeded for its maps: the oxbow carve (Canyon 96² seed 44, (86, 10) toward (10, 86)),
  the removed slope (one the edits leave), the weir (Canyon 4, 6, 7, 16, Highlands 2), the second
  district (Islands 2, 8, Lake Basin 2, River Valley 4), ruins on a rise (Islands 10, 6, Highlands
  13, River Valley 7), the badwater river (River Valley 128² seed 3), the builders' ranges (seed
  13), the dropped source (River Valley 96² seed 2); the 4242 sha `050fe985…`.
