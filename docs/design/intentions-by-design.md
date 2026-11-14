# Six intentions, made by design or removed

A design, not yet built (planning's ruling of 2026-11-14: an intention that does not emerge is made by design or
removed). It covers the six intentions `src/core/land/intentionTable.json` offers nowhere: twin-falls,
cliff-falls-lake, hanging-valleys, split-island, badwater-rich, district-behind. An Opus builder builds from this page.

**Verdicts:** build twin-falls, cliff-falls-lake, hanging-valleys, split-island and district-behind; remove
badwater-rich from the themes' intentions (it is a premise, not a nudge).

## 0. What "by design" means here

Today an intention is a nudge to the genome (`land/intentions.ts` `nudgeFor`) and a check on the finished map
(`checkIntention`). The nudge makes the ingredients more likely and hopes they meet. The six fail because they are
*relations between two things* (two falls on one cliff, a fall and a round lake, a tributary and a trough wall), and a
nudge cannot place one thing beside another.

By design means what a premise does (`docs/PREMISES.md` §2.2: the water is planned first, the land holds it), done
inside the themes' own pipeline, land first:

1. **Find the site on the land as it is**, after the field is eroded and snapped and the courses are traced
   (`land/hydro.ts` `planHydro`). Every candidate place is listed and scored. Nothing is rolled six times and hoped for.
2. **Take ground away to finish the form there** (D111: only ground is taken, none raised), with the outline bent by
   noise as every bank is, so nothing is ruled.
3. **Refuse in one line** when the land has no site ("no fall of 3 levels on a river that carries enough for two").
   The intention is then dropped and recorded as today (D138 (2)); the map is never mutilated to force it.
4. **The check on the finished map stays the judge**, on the settled water. No check is loosened to pass.

Each design below draws from a random stream of its own (`stream(seed, "<name>", attempt)`), so a map that does not
hold the intention keeps every draw it has now.

### How it was measured

Generator 0.10.22, 128², each intention asked alone (`generate` with `spec.intentions = [id]`, as
`tools/lib/intentionTable.ts` `emerged` asks it). The committed table gives the 12-seed counts. For the cause, the
check's own note and what the map holds were read on seeds 1–6 of the three themes each belongs to (18 maps an
intention; twin-falls' and cliff-falls-lake's notes on seeds 1–12). Two maps at 256².

**Not measured** (the machine was shared; a 128² map took 15–60 s): seeds 7–12 for four of the six; 256² beyond two
maps; anything in the game; and the points marked *not measured* in each section. A builder's first step in each
section is the print that closes its gap.

## 1. twin-falls

**The picture.** From the widest view a river reaches a cliff, parts round a rock island at the brink and pours as two
curtains into one gorge head. From the start it is the landmark across the valley: two white lines on one dark wall.

**Real land.** A resistant ledge with a rock island at its lip (Niagara's Goat Island, the Rhine Falls' rock): the
river parts a few tiles above the brink and both threads fall into the same plunge pool, which retreat widens into an
amphitheatre. It belongs where a river that carries real water crosses a cliff of 3+ levels: Canyon, Highlands, River
Valley. Not Islands (a flat sea: no river falls to it) and not Delta (its promise is low ground).

**Why it does not emerge (1 of 72).** The land has the falls and never the pair.
- Falls of 3+ levels in the settled water: 2 or more on 11 of 12 Canyon seeds, 1 or more on 11 of 12 Highlands and
  10 of 12 River Valley; 0 on 11 of 12 Islands, 7 of 12 Delta, 7 of 12 Lake Basin.
- The second fall is left to a split arm 26–46 tiles long (`hydro.ts`, "a river splits round an island",
  `splitAtFall`). The arm was made on 11 of 18 maps (the six tries fail on room). Its bed follows the ground with no
  knickpoint, so where the main river falls 4 levels the arm steps down in rapids: Canyon 1 has falls of 4.4 and 2.0
  levels from the same top (8.1 and 8.2), 11 tiles apart: the form, one level short.
- Where two tall falls do leave one top (or tops a level apart) they stand just past the check's 15 tiles: River Valley 6 (11.6 and 11.6
  levels, 15.3 apart), Canyon 4 (4.8 and 4.8, 17.0), Canyon 3 (5.1 and 5.1, 16.6).
- The nudge's map-long escarpment costs Highlands 5–17 attempts a map.

**Made by design: the parted lip.** In `planHydro`, where the split block is now (after the oxbow, every river
carved). `g.hydro.splitAtFall` becomes `g.hydro.twinLip`; the long arm is no longer used for this intention.
1. *The fall.* Candidates: every planned fall (`falls`, `{x, y, drop, river}`) of 3+ levels on a river carrying 1.5 or
   more at that point (its head's flow plus `joinsOf` above it), 12+ tiles from the map's edge, 10+ course tiles from a
   lake or a confluence. Take the tallest; ties to the one nearest the map's middle. None: refuse.
2. *The second thread.* It leaves the river 7–11 tiles above the brink (drawn), on the side whose ground is higher,
   and runs beside it so the two brinks are 6–10 tiles apart, centre to centre (the check reads 4–15).
3. *Its bed* is not `profileOf`'s: it holds the river's top bed `T` to its own brink, then the foot bed `F`. Its brink
   lies on the same cliff as the river's, 1 or 2 tiles up or down the flow from it (drawn), never on one grid row with
   it.
4. *The island* is the land's own rock between the threads, 3–6 tiles across at the brink, never raised. Every tile of
   it stands at `T + 1` or higher; if not, try the other side, then refuse.
5. *The gorge head.* Below both brinks the ground between and under the two threads is cut to `F` for 4–6 tiles down
   the flow, its outline `1 + 0.7 × fbm` as the cleared floor's is, so the pool is an alcove and never a rectangle. The
   existing pool rule scours it a level deeper where `BED_FLOOR` allows.
6. *Width.* The thread is `max(MIN_WIDTH, 0.6 × width)` as an arm is now, its last 3 tiles before the brink 2 wide.
7. *The nudge* keeps `knick` and one more spring; the escarpment part stays on River Valley only (Canyon and Highlands
   stand their own cliffs).

Carved with `carve`, marked with `markArm`, listed in `arms` as `kind: "split"` (so `FinalCtx.arms` gives the check
its second course). Must not break: the river's own fall (its bed is untouched), a lake's sill (never within 10 of
one), the start's water (step 1 keeps off nothing the settler needs: the start is chosen after).

Offered: Canyon, Highlands, River Valley.

**Measure.** The check is unchanged: two falls of 3+ levels, 4–15 tiles apart, tops within a level, on different
courses, read on the settled water (0.1 deep or more on each brink). Pass: 8 of seeds 1–12 at 128² and at 256² on each
of the three themes. *Not measured:* how deep the brinks stand when a river of 1.5 parts in two. If a brink reads
under 0.1, raise the flow floor (2.0, then 2.5) before touching anything else; do not lower the check's 0.1.

**Cost and risk.** One block in `hydro.ts` (about 120 lines replacing 12), one genome flag, the nudge. Maps that draw
twin-falls move (re-pin those). Risk: the thread takes the river's water and the river's own fall thins; the gorge
head is cut before the start is chosen, so the settler sees it as land like any other.

**Verdict: build.**

## 2. cliff-falls-lake

**The picture** (Kyler's words: "a cliffside with a waterfall that goes into a large circular lake"). From the widest
view a round lake lies against the foot of a cliff with one white fall on its far shore. From the start it is still
water with the cliff behind it.

**Real land.** A plunge basin: the fall scours a bowl at the cliff's foot and the river leaves over a lip on the far
side (also a tarn under a headwall). It belongs where a river comes off a bench of 3+ levels onto ground level enough
for a bowl some 20 tiles across.

**Why it does not emerge (0–2 of 12).** The fall and the lake meet; the lake is the wrong shape. Of 63 maps read:
- Canyon: a fall of 3+ into a lake of 200+ tiles on 7 of 12, the lake long on 6 of them (axes 0.22–0.47 against 0.55,
  fill 0.16–0.36 against 0.4). River Valley 3 of 12, all long. Highlands 4 of 9, 2 long. The lake is the river's own
  valley lake and takes the valley's shape.
- Lake Basin has the round lake (axes 0.75–0.9 on 4 of 6) and no fall into it (0 levels on 4 of 6): its feeders arrive
  at lake level.
- The nudge's round `basin` part is put near the scarp part's foot in the genome, before any river exists, so the
  river seldom crosses it.

**Made by design: the plunge basin.** In `planHydro`, beside `chainLakes` (hydro.ts about line 1002, which already
deepens a stretch of a river's valley into a lake before `lakeOf` is filled). New flag `g.hydro.plungeLake`; the
nudge's `escarpment` and `basin` parts and `lakeSprings` go.
1. *The site.* Along every traced course carrying 1.2 or more: a point where the ground along the course falls 3+
   levels within 6 tiles (the knickpoint rule then gathers it into one fall; the nudge keeps `knick` at 8+), and below
   it a centre `c`, `R + 1` tiles past the foot along the flow, with the ground within `1.4 R` of `c` spanning 3 levels
   or fewer, 6+ tiles from the edge, from any other course and from any lake. `R = (9 + 3 × draw) × side / 128`.
   Score: the drop, then the flattest ground. None: refuse.
2. *The bowl.* An ellipse round `c`, axes ratio 0.75–1 (drawn), turned by a draw, its shore at
   `R × (1 + 0.15 × fbm(cell 7))`. Ground inside is cut to `S − 2`, where `S` is the lowest ground on the bowl's rim
   less one (the outlet's sill, cut a level under its banks like every channel). A shelf one tile wide at `S − 1` runs
   round the shore except under the fall.
3. *The fall lands in it.* The bowl's edge reaches the cliff's foot tile; `T − S` is 3 or more, else the site is
   refused.
4. *The way out* is the river's own course on, leaving on the side away from the cliff; nothing else is cut below `S`.
5. *The budget.* `g.hydro.lakeBudget = max(itself, 1.3 × π R² / (W × H))`, as crater-rivers does, so the outlet is not
   cut down to fit.

The lake is then found, filled, settled and checked by the existing lake path. Must not break: another lake's sill
(6+ tiles off), Lake Basin's own layout (`land/lakeBasin.ts` runs first; the bowl is an extra small lake upstream),
the bed floor (`S − 2 ≥ BED_FLOOR`, else refuse).

Offered: Canyon, Highlands, River Valley; Lake Basin only if it counts 8 (its land has few 3-level steps: expect not).

**Measure.** The check is unchanged (a fall of 3+ into 200+ tiles of open water, axes 0.55+, fill 0.4+). Pass: 8 of
12 at 128² and at 256² on each theme offered. One map at 256² emerged on its own (Highlands 1: 2,167 tiles, axes 0.84,
a fall of 3.9).

**Cost and risk.** One function in `hydro.ts` (about 100 lines), one flag, the nudge shortened. Maps that draw it
move. Risk: a bowl of 250–450 tiles on a river of 1.2 fills slowly (the settle's saturation decides; raise the flow
floor to 1.5 if a bowl stands part full); a round bowl reading as a stamp, which the drawn ellipse, turn and shore
noise are there to prevent: judge three seeds' widest frames before the count.

**Verdict: build.**

## 3. hanging-valleys

**The picture.** From the widest view a broad valley floor runs between walls, and from notches high in those walls
side streams fall to it. From the start, on the floor, falls show up-valley and down-valley on both walls.

**Real land.** A trunk valley cut deeper and faster than its tributaries (a glacier's trough, or a river on soft
rock): the side valleys are left hanging and their streams fall from the trough's wall. It belongs on a wide valley
with steep sides: River Valley and Highlands. Not Canyon: its promise is a narrow cut, and its floor measures 8–9
tiles against the 20 asked, on 6 of 6.

**Why it does not emerge (1 of 72).** The trough is there; too few streams hang, and those that do are too thin to
read.
- The floor passes on River Valley 6 of 6 (36–53 tiles) and Highlands 3 of 6.
- Tributaries falling 2+ levels where they join: 0 or 1 on 17 of 18 maps (two are asked).
- River Valley 1 has two tributaries. One runs its last 34 tiles along the floor at the river's level. The other
  falls 7 levels (bed 10 to 3) at the wall, but its last two tiles before the brink hold under 0.1 of water (0.7 of
  flow in a channel 2.4 wide), so `analysis/vertical.ts` `fallsOf` reads no fall. In the game that is a wet film, not
  a waterfall: the check is right and the water is short.
- The nudge costs Highlands 8–15 attempts a map.

**Made by design: hung streams.** In `planHydro`'s choice of spring heads (hydro.ts about lines 700–850) and the
per-river loop. New flag `g.hydro.hung = 3` (the count); the nudge keeps `hanging`, `incise`, `base` and `floor` and
loses `springs += 2`.
1. *Where they hang.* After the main river's course is traced: 3 spring heads (4 at 256²), each on ground 4+ levels
   over the main bed at its nearest point, 12–30 tiles from the main course, 18+ tiles apart along it, on both walls
   where the land gives a place on each. Fewer than 2 places: refuse.
2. *What they carry.* 1.0 each (a spring is 0.7 now).
3. *The brink.* The stream keeps its bed to the trough's wall (`profileOf`'s `floorOthers` does this already) and its
   last 3 tiles before the wall are a notch 1 tile wide (2 at 1.5 or more). No knickpoint on these streams: the fall
   stays at the wall.
4. *The wall* is the cleared floor's edge as it is, `1 + 0.7 × fbm`; nothing new is cut.

Must not break: the bed floor (the nudge's `base + 2.5` already lifts the land); Islands and the sea (`DRAINS_A_SEA`
stays); the start's water on the floor (three more units of flow reach the main river: `widthAt` already widens it
below each join).

Offered: River Valley, Highlands.

**Measure.** The check is unchanged (2+ tributaries falling 2+ levels within their last 22 tiles; the floor 20+ wide
at 128²). Pass: 8 of 12 at 128² and at 256² on both themes. *Not measured:* the brink's depth at 1.0 through a
one-tile notch; if it reads under 0.1, the flow rises (1.2, 1.5), never the check's floor.

**Cost and risk.** Two places in `hydro.ts` (heads, the notch), one flag. Maps that draw it move. Risk: Highlands'
floor passes on half its seeds, so it may miss 8 and be offered on River Valley alone; three more springs on a small
map's water budget (`flowTotal`).

**Verdict: build.**

## 4. split-island

**The picture.** From the widest view the river parts round a long island and closes again below it. From the start
it is a moated piece of good land across one arm.

**Real land.** An anabranch: on a gentle reach a river cuts a second channel across a bend or behind a bar and keeps
both. It belongs on a long, low-gradient main river with room beside it: River Valley. Not Delta (its fan's islands are
its own promise, and its arms do not rejoin), not Lake Basin or Islands (short feeders), not Canyon or Highlands (no
room beside the river).

**Why it does not emerge (2 of 72).** The arm is seldom made, and when it is the island is not read.
- With `g.hydro.split = 1` the arm was made on 5 of 18 maps (River Valley 3 of 6, Delta 2 of 6, Lake Basin 0 of 6):
  six random tries at a stretch 42–66 tiles long that must miss every lake and end 6 tiles short of the mouth.
- Made, it enclosed 277, 194 and 148 tiles on River Valley 2, 5 and 4 (150 are asked) and the check still said no
  island. *Not measured:* which of the check's two conditions refused the 277 and the 194. The likely one: `levelLakes`
  reads a level reach of river of 150+ tiles as a lake, so the island's ring counts as lake water. The builder prints
  `ring` and `ringLake` on River Valley 2 first.

**Made by design: the sited arm** (the search twin-falls' thread also uses).
1. *The search.* Every start along the main course, 4 tiles apart, each side, lengths 36, 48 and 60 × side / 128. A
   candidate holds when: no lake on the stretch; the arm 5+ tiles inside the map; the land between arm and river
   150 × 1.2 × N / 16384 tiles or more, every tile of it at the bank's level or higher, its mean within 2 levels of
   the banks (land to build on). Score: the island's size up to twice the floor, then the gentlest reach. None: refuse.
2. *The arm.* 0.8 of the river's width (0.6 now: a ditch beside a river). Its bed is the river's bed at the same
   share of the stretch, never lower (no capture), its course through `meanderPath` as now.
3. *The check* counts the ring as river where it lies on a course or an arm (within its width), in place of "not a
   level lake", if the print in "why" shows that is what refuses it.

Offered: River Valley.

**Measure.** Dry land of 150+ tiles (at 128²) off the map's edge, ringed by water at least half of which is a course
or an arm. Pass: 8 of 12 at 128² and at 256² on River Valley.

**Cost and risk.** The split block in `hydro.ts` rewritten as a search (shared with §1), one case of
`checkIntention`. Every map that draws a split today (not only this intention) keeps its draws only if the old six
tries stay for `bigSplit` unset: keep them. Risk: an arm 0.8 wide halves the river's depth along the island; the
start's water there is checked by the settler as always.

**Verdict: build, after twin-falls, on the same search.** If it counts under 8 on River Valley, remove it.

## 5. badwater-rich

**The picture.** A badwater stream runs through the widest green flat near the start, and the land beside it is dead
until the player turns the stream aside.

**Real land.** A tainted side stream running along the far edge of a floodplain before it joins the river (a yazoo
stream below a mine or a mineral spring).

**Why it does not emerge (0 of 72).** Four decisions in force keep badwater away from exactly this land.
- D476 and D498 route the badwater to the main river's last 30 % or off the map on its own; D469 keeps it past the
  start's badwater distance (15 tiles on Normal); D498 keeps Lake Basin's lakes and Islands' sea clean.
- Measured on 18 maps: low moist land beside badwater within 60 tiles of the start came to 20–283 tiles on River
  Valley, 25–221 on Delta, 0–256 on Lake Basin, against 400; no badwater within 60 tiles on 3; no clean water within
  the check's 22 tiles' walk on 11 (all six Lake Basin, five Delta).

**By design it is a premise, not a nudge.** To make it, the badwater's course, the richest land and the start's clean
water must be planned together, and the result must reverse D498 on that map. That is a problem with the water that
makes it true (D508): "the best land is poisoned; turn the stream and it is yours". As a nudge inside
`land/hazards.ts` it would fight the hazard planner on every map and put the start's clean water (D85) at risk.

**Verdict: remove from the themes; add one line to PREMISES §5 as a candidate ("the poisoned floodplain").**
What goes: the id in `INTENTIONS`, `INTENTION_TEXT`, `WEIGHT6` and `START_SIDE`; its cases in `nudgeFor`,
`startPreference` and `checkIntention` (`land/intentions.ts`); `SettlerView.dBad` and `blocks.lowBad` if nothing else
reads them (`gen/intentions.ts` `settlerView`); its entries in `gen/names.ts` and `gen/showcase.ts`; its value in
`spec/mapspec.schema.json` (an old link naming it is read as no intention, D475: no upgrade path); its row in
`intentionTable.json`; the name added to `tools/retired-terms.json`. No test and no page or MCP text names it (the
MCP reads `INTENTIONS` and the table). The decision is recorded in `docs/decisions/generator.md` against D138.

## 6. district-behind

**The picture.** Forty to seventy tiles from the start a broad level bench waits above one or two ramps choked with
debris. Clear them and the second district is there.

**Real land.** A terrace or bench reached by a single draw: a river terrace, a mesa's shoulder. PERFECT names it
among the things players enjoy.

**Why it does not emerge (0–3 of 12).** Twice over.
- No site: "no debris" on 8 of 18 maps (River Valley 3, Highlands 3, Lake Basin 2): `gen/extras.ts`
  `districtCandidates` and `rampEnds` found no level ground 40–70 tiles out whose walk a small row of debris cuts.
  *Not measured:* whether the ground or the cut is what is missing.
- The site is made and the check reads something else: on 7 of 18 the site and its debris were placed and 794–2,407
  tiles lay behind the debris, but that land begins 10–19 tiles from the start, and the check asks for one level
  region of 300+ tiles whose nearest tile is 35–70 out. Emerged: 3 of 18.

**Made by design.**
1. *The check reads the site the generator placed:* the level ground joined to the placed site
   (`setpiece/secondDistrict/primary`) within 12 tiles of it, 300+ tiles (at 128²), the site itself 35–70 tiles from
   the start, off the start's walk and on the walk with every Blockage cleared. (`FinalCtx` gains `site?: {x, y}`,
   filled by `gen/intentions.ts` `finalCtx` from the build's features.)
2. *The start is placed for it:* `district-behind` joins `START_SIDE`; `startPreference` is 1 where a bench of 300+
   level tiles lies 40–70 tiles off and the fewest tiles that cut the walk to it (`gen/extras.ts`, the min-cut by
   line 563) is within the debris budget, else 0.
3. *Where the land has the bench and too many ways up,* the bench keeps the two ramps nearest the start and its
   other natural slopes are not placed. *Not measured:* that the build's derived slopes can be left out bench by
   bench; if they cannot, rule 3 is dropped and rules 1 and 2 stand alone.

Must not break: the start's own walk (`start.reach`, wood, berries and water are counted without the bench; a site
whose cutting-off fails any of them is not taken).

Offered: wherever it counts 8 after the change; expect River Valley and Highlands.

**Measure.** As rule 1. Pass: 8 of 12 at 128² and at 256² (`tooSmallFor` stays under 128²).

**Cost and risk.** `checkIntention` one case, `finalCtx` one field, `startPreference` one case, `extras.ts` the
ramps. No land changes, so only maps that draw it move. Rules 1 and 2 are small; with rule 1 alone at most 10 of the 18 read
could pass (the 3 that did and the 7 whose site was placed), short of 8 in 12, so rule 2 is needed.

**Verdict: build, last.** If rules 1 and 2 count under 8 on every theme, remove it as badwater-rich is removed, and
keep the usual far site (PLAN §9.8).

## 7. The order, what is shared, the first PR

**The table changes first.** `INTENTION_LEAST` goes from 4 to 8 and the count runs at 128² and 256²
(`INTENTION_SIDE` becomes two sides; a theme is offered when both pass). `drawIntentions` then draws an intention only
on the themes it is offered for (its `WEIGHT6` entry read as 0 elsewhere). This moves most maps' draws once, with
badwater-rich's removal, so it is one PR and one re-pin. Other intentions that count 4–7 today fall off the offered
list by the same rule: planning says whether they join this work or wait.

**Order.**
1. **PR 1: the rule and the removal.** `INTENTION_LEAST` 8, the 256² column, the draw limited to offered themes,
   badwater-rich removed (§5's list), this page linked from `docs/README.md` and `src/core/land/README.md` (whose
   "steered, never stamped" line is amended to §0), the decision recorded. No new form. One re-pin of everything.
2. **PR 2: twin-falls** (§1) with the sited search of §4 as a shared function (`siteArm`), used here for the thread.
3. **PR 3: cliff-falls-lake** (§2). Independent of PR 2; may run beside it in its own worktree (both touch
   `planHydro`, different blocks).
4. **PR 4: hanging-valleys** (§3).
5. **PR 5: split-island** (§4) on PR 2's search, then **district-behind** (§6).

**Shared.** The sited search (`siteArm`: twin-falls, split-island). The brink rule (a notch narrowed until the settled
brink holds 0.1: twin-falls, hanging-valleys). The refusal line carried from `planHydro` to the intention's note
(`Hydro.designed: { id, ok, note, at }[]`, read by `gen/intentions.ts` `finalChecks` so a dropped intention says why
the land had no site).

**Each build PR's check.** `npm run intentions -- --check --theme <t>` on the themes it offers, the count's lines in
the PR; the widest frame and the opening frame of three seeds a theme judged against "drawn with a ruler?"; the pins
of the maps that moved. In the game: none until all five are in, then one probe batch of one seed each, to see each
fall pour after the settle and stop and return through a drought.
