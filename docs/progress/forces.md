# The forces: Carve, Craterize, Quake and Erupt, and the editor's sounds

> **State (2026-09-27; where a fresh session resumes).** Branch `feature/forces`, `dev` merged in
> last at 1491523 (D261-D266). Round 2 (D226) and round 2b (D239, D247, D248) are done, below.
> The queue, in order (the coordinator's, 2026-09-27):
>
> 1. **CI green: done.** The red Erupt ceiling test was the test's spot under a wrapped view bar
>    (5fbf586; run 36298701656 green). Its hover words go with D258 (below).
> 2. **D249, brushes and sources: done** (the section below; captures linked there).
> 3. **D257/D258: done** (the section below; `dev` merged at 052aa69 first).
> 4. **D265 + D266: done** (the camera still; the forces at their own pace: the section below).
> 5. **D260: done** (the section below).
> 6. **D259 with the working area (D254), D261 Wand, D264**: work in progress in `git stash`
>    ("d259-wip": the brush's `area`, the forces' feathered working area, the new Select tool with
>    Circle, Brush and Wand, its button and chip, Ctrl+A, Set level's Set / Cut down / Fill up, Max
>    water depth, `applySelection`); tests and docs still to write. Then **D263** (smart Lower's
>    depth from strokes).
> 7. **D270** (Kyler's answer to #84): Flatten's Ramped lays its own natural slopes along the rim.
> 8. **D244 step 2 waits** for the Ceiling probe batch (the milestone session runs it after M9a's).
>
> **D277: M12 is deferred.** No Claude steps, limits, tool entries or suite requests for any tool from
> here on (Select, Wand, Max water depth, Ramped…), and the Claude reference suite isn't run again;
> the Claude code already here (D257's steps included) stays as it is, unmaintained; a test that
> depends on it and breaks is skipped with a note to D277.
>
> Checked at each step's end: see its section. Parked: Claude's `placeObject` can't yet choose a slope's way to join a step (B15); Kyler's
> listening check of the sounds. Kyler's forces-sitting checklist is in `docs/STATUS.md`.

Kyler's decisions: D194, D199 (Carve), D202 (Craterize), D203 and D219 (Quake, with both Lift and
Slide), D206 and D216 (Erupt, its plume billowing bigger and darker at high power), D205 and D212
(juice: sounds on by default, quiet, with an off switch), D220 (build on the forces core; hook the
synthesised sounds in). The sources: `investigation/forces-core` (#59) and each force's own
investigation (#47, #51, #50, #52); `investigation/juice` (#58).

## Water that no source feeds recedes at once (D260)

- **The rule** (`unfedTiles` in `src/core/sim/preview.ts`, used by the warm start): of the water carried
  over to the new ground, a tile loses its feed when the canonical start's walk from the running
  sources (prefill.ts `flowThrough`, now its own function: every running emitter's water walked
  downhill or level over the filled surface, and the stored lakes up to their surface) no longer
  reaches it nor a tile round it, or when less water flows through it than before (a source removed
  or weakened, a river cut off or turned away: each model's flow is kept while it lives, so an edit
  compares with the last). Those tiles take the canonical start, dry where nothing reaches them, so
  their water drains away in the edit's own journey from its first frame, as the canonical settle's
  does. A stored lake (`RetainedWater`) is reached by its own water: it stays while its hollow holds
  it, drains through a breach, and is gone when filled in (its surface is under the new ground).
  A first try (tiles joined through water to no source) missed water joined to another river
  downstream; the walk follows the way water runs.
- **A removed source's marker** goes the moment the objects change (`sourcesChanged`: the sources
  near the pointer and those its water comes from are found again at once, from the objects as they
  are, not the page's memo).

The time until the view shows no water the canonical settle won't have (a tile over 0.05 deep where
the settle is dry), 256², seed 7, measured on the preview's frames played at normal speed; water the
preview never drains waits for the background check (0.7 s, then its own settle). `.scratch/d260measure.ts`
(not committed: run on this machine, before and after the change).

| Map | Edit | Before | After |
|---|---|---|---|
| River Valley | remove the strongest source (its 10 at the river's mouth) | 2.5 s (432 tiles until the check's settle) | at once (the first frame) |
| River Valley | a river cut off with a Raise across it | 4.0 s (42 tiles) | 4.8 s (42 tiles): none of them wet before the edit, at most 0.06 deep: the backed-up river's thin spread the preview stops before, not unfed water |
| River Valley | Kyler's sheet: one of its two sources removed | at once | 0.3 s |
| River Valley | Kyler's sheet: then the other | 1.5 s | 0.4 s |
| Highlands | remove the strongest source | 5.5 s (176 tiles) | at once |
| Highlands | a river cut off with a Raise across it | 7.7 s (16 tiles) | 10.4 s (16 tiles): as River Valley's, a thin new spread (at most 0.06 deep) |
| Highlands | Kyler's sheet: one of its two sources removed | 10.4 s (106 tiles) | 17.8 s (37 tiles, at most 0.10 deep): the sheet's thin fringe the preview stops before drying |
| Highlands | Kyler's sheet: then the other | 1.0 s | 1.1 s |
| both | a carve's oxbow lake breached with Lower | (no oxbow formed in six Wander-100 carves at 256²) | the contract test's stored lake drains through its breach as the canonical settle's |

(The "after" check-settle times differ from "before" with this machine's load: M9a's batches were
running.) What's left is the preview's own approximation (its stopping rule ends while thin sheets,
at most 0.1 deep, still spread or retreat), not water without a feed; the canonical settle ends the
journey there as before. Not loosened: the parity tests pass unchanged.

Tests: `tests/contract/unfedWater.test.ts` (a pool whose source goes is dry from the preview's first
frame and ends as the canonical settle; with two sources, removing one restarts it and it settles to
what the other keeps; a river cut off by raised ground: below the cut unfed, above fed, the preview
ending as the settle; a stored lake kept by an edit elsewhere, drained through a breach as the
settle, gone when filled in), `tests/e2e/unfedWater.spec.ts` (a source placed and settled, removed with
Delete: its marker gone at once, its water drained within four seconds).

For Kyler's forces sitting: remove a source (Delete, or Remove): its label goes at once and its water
drains away in a second or two; cut a river with Raise: the water below the cut goes.

## The camera still, the forces at their own pace (D265, D266)

- **The camera moves only when the player moves it (D265).** Gone: the water bar's **Follow** (and
  the camera drifting to where the water rose most), Carve's **Follow** toggle (and the force
  driver's follow of a carve's head, which Unleash on a source had too; saved rows with it on are
  ignored: the field is gone), and the camera shake an impact, a quake and a rising volcano gave the
  view. The effects on the land (dust, flashes, the plume, the glow) play as before. What moves the
  camera now is the player: dragging, the keys, the wheel, the minimap, a bookmark, Reset view, a
  problem's "Show", and a new map framing itself.
- **The forces keep their own pace (D266).** The force driver no longer reads the water's speed: every
  force plays a step a call at its tuned pace (a carve at twenty steps a second, an eruption's 28
  stages over about four seconds, as at the normal speed before); Esc and undo still take it back at
  once. The Speed control stays on the water bar for the water (the weather branch moves it).

Tests: `forces.spec` (the forces with motion welcome leave the view exactly where it was, frame by
frame; no Follow on the water bar or Carve's row, and a running carve never moves the view; a
Craterize takes the same time at Slower and Instant), `forceDriver.test` (a force's pace, its
eruption's four seconds). **Changed to the decisions (D148):** `forceDriver.test`'s "paces by the
water's speed" checks the one pace; its "ending by itself keeps it" expected the step Instant's
ten-step calls reached (30), now the step it ended on (25); the reduced-motion test's name keeps
"no camera moving", now checked with motion welcome too.

For Kyler's forces sitting: no camera moves by itself anywhere (no Follow, no shake); a force looks
the same at every water speed.

## The forces bound only by nature, with clean gestures (D257, D258)

Built on this branch after D249, with `dev` merged in again (052aa69: D252-D260). [Carve's Aim and
Erupt's Vent, clean](forces/clean-gestures.png).

- **Bound only by nature (D257).** No force refuses, stops short or reshapes its result for the start
  any more: Craterize and Erupt leave the start's ground out of what they keep (`startGround` and the
  quiet "Start here" are gone from `src/core/forces/objects.ts`), Erupt's fit no longer steers round the
  start and its vent no longer terraces the start's ground, Quake's faults run anywhere (`faultReason`
  is gone; the Slide refusal and the "painted Lift would flood the start" refusal too) and leaves the
  start out of its object ride (no apron flattened for it), Carve's `protectedGround` keeps only the
  land above the layer showing and an imported map's caves, and Unleash's breakout no longer avoids
  the start. What still limits a force is nature and the map: its floor, the ceiling, the layer showing,
  caves.
- **The start is carried** (`carryStart` in the worker; `startBrokenBy`, `moveStartNear(…, level)` and
  `carryStartOps` in `src/core/doc/tools.ts`). After a force is kept, if it changed the start's own
  tiles (its 3 × 3 and its door) and left it off level ground, in a river, on an object or off the map,
  the start moves to the nearest spot within 24 tiles where it stands on level ground already (so the
  force's land stays as it made it), in the same undo step as the force (undo takes both back). Where
  there's no such spot it stays, and the checks say so. Claude's force, carve and unleash steps do the
  same (their proposals carry the start in the step, and say so in the report).
- **The checks and their fixes.** The quiet dot already listed the start's checks; each now has a
  one-click fix where one exists: its ground, door, dry ring and what covers it: "Move the start to the
  nearest good spot" (as before); water out of reach: "Move the start near the water" (the nearest good
  spot by the nearest water a pump reaches); berry bushes short: "Plant N berry bushes near the start";
  the starting logs short of the floor: "Plant N oaks for the starting logs" (on the nearest free soil
  within the walk, moist soil first, oaks on dry ground only when there's no more; a tree keeps its
  logs when it dies). The planting fixes come with the check (`startPlanting` in
  `src/core/validate/playability.ts`, stable ids) and the worker keeps only the plants the game takes.
- **Clean gestures (D258).** Nothing predicts a force's result on the land: Craterize's crater outline,
  Erupt's cone, its line to a flank vent and its "breaks out on the flank" and "grows broader" words,
  Carve's Aim line and Unleash's line from the source are gone, as are the hover hints ("Paint a fault
  · X flips the side that moves", "Paint the fissure", "Click where it starts") and Quake's band on the
  side that moves (the row's Left and Right say it; a Lift shows it live). What shows: a small cursor
  ring where a click will act (Carve's Unleash, Craterize's Strike, Erupt's Vent); Aim as a drag in a
  direction (Carve's Aim, now a drag instead of two clicks; Craterize's Aim; Unleash dragged from its
  button) with only a thin straight arrow from where the drag began to the pointer (`AimArrow`, an SVG
  over the map), gone as the force starts; the painted stroke of Quake's fault and Erupt's fissure; and
  a word only when the force won't act at all ("No room to rise here", Aim uphill without Defy
  gravity). A click in Carve's Aim with no drag does nothing. A force picked now takes a click on the
  start or a source too (they were grabbed before: with the start refused it didn't matter).
- Retired (`tools/retired-terms.json`, as patterns of the exact interface words so describing the
  behaviour stays possible): "No room to rise here: it breaks out…", "Near the height limit: it grows
  broader", "The start's ground stays as it is…". Erupt's Size tooltip and Carve's top-bar hint say it
  the new way.

Tests: `forceOps.test` (every force through the start in the worker: Craterize and Erupt on it, a Lift
and a Slide across it, a Carve aimed through it; each completes as one step, exactly one start standing
on level ground, undo taking back force and carry; the start's wood and food fixes each mend their
check), `forces.test` (every random fault quakes: none refused), `carve.test` (a carve from the start's
ground runs; only the kept land refuses), the e2e `forces.spec` (hover shows only the cursor, no words;
Craterize on the start strikes and the start moves, undo brings both back; a Lift through the start
quakes; Craterize's Aim is a drag with only the arrow), `carve.spec` (Carve's Aim: the cursor, a click
alone doing nothing, a drag with only the arrow, running on release), `unleash.spec` (the arrow while
aiming, gone on release).

**Tests changed to the new decisions (D148), none weakened:** `forceOps.test`'s "refuses where the start
sits, with the quiet word, and changes nothing" checks the start carried instead (D257);
`forces.test`'s random strokes "either quake or are refused with Start here" now all quake; the pinned
prototype cases for Quake and Erupt (#59's parity) and `eruptHeadroom.test`'s studies compare with the
prototypes live on the same studies without their start, since the prototypes kept the start's ground
(on those studies the port is the prototype, land, objects and rock, exactly; Craterize's and Carve's
pinned cases are unchanged and pass as pinned); `carve.test`'s "the start's own ground can't be a
carve's origin" checks it can, and that only the kept land refuses; `randomOps`' force draw keeps off
the start's ground itself (the session doesn't carry the start; the worker does); `forces.spec`'s
Craterize and Quake "the start refuses it" check the start carried, its Erupt ceiling hover checks no
words and no preview (D258), and its Quake Slide no longer needs the other side; `carve.spec`'s Aim
"picks a start, then an end" is the drag with its arrow; `unleash.test`'s breakout "never on the start's
ground" is named for the ground it keeps (the layer showing, caves), which is what it checks. Claude's
request B25 ("drop a meteor right on the start") expected the refusal: it now expects the step
accepted and the start carried (its reference a meteor of size 14, inside the 30% cap).

Checked: typecheck clean; `npm run test:quick` passes; the forces', Carve's, Unleash's, the start's and
the editor's e2e specs pass; the Claude reference suite 135 of 148 (B25 as above; the 13 that fail fail
on `dev` too); the harness's own tests fail the same 3 with and without these changes.

Defaults chosen (for `docs/decisions-pending.md`): the start is carried only when the force changed
its own tiles and left it standing badly (water over it is the dot's, with its fix); it goes to level
ground only, within 24 tiles, nearest first; the fixes plant berry bushes first, then oaks (8 logs
each) on the nearest free soil within the walk; Quake's side band is removed with the other previews;
a click in Aim does nothing; the small cursor is a ring of about three tiles in the drawing colour.

For Kyler's forces sitting (the new lines for STATUS's checklist):
- Any force through the start: it goes on, and the start hops to the nearest level ground in the same
  step (one undo takes both back); then the dot shows what it left short, each with its fix (move the
  start, near the water; plant berry bushes; plant oaks for the starting logs).
- Clean gestures: hover any force, only a small cursor; Carve's Aim and Craterize's Aim are drags with
  a thin arrow; Unleash dragged from its button, the arrow from the source; no outline, route or words
  (only "No room to rise here", and Aim uphill without Defy gravity).
- Quake: no band on the side that moves any more (the row says Left or Right; a Lift shows it as it's
  painted). Say if you want the band back.

## Brushes and water sources (D249)

Built on this branch after round 2b. [Clear sources off: they ride the ground](forces/clear-sources-off.png);
[Clear sources on: the ring's mark, the sources red, then gone with the stroke](forces/clear-sources-on.png).

- **Clear sources**, a toggle in the five brushes' row after Straight lines (shared by all five, off by
  default, remembered with the brush's size and strength). On, the ring carries a small red mark on its
  north-east edge, the sources under the ring glow red before the stroke reaches them (and those it
  has passed over stay red), and letting go sends the stroke and the removal of every source it
  pressed on as one step (`strokeClearing` in the worker: the `brush` and a `deleteEntities`; its label
  "Raise, 101 tiles, 5 sources cleared"), the water receding live, with Remove's sound. "Pressed on"
  is exactly the stroke's own tiles (`dabPresses`, `markBrushTiles`), so what glowed is what goes.
  The forces are unchanged.
- **Sources ride the ground** with it off. The cause of the pits and pillars: a precise stroke's
  `keep` held every non-plant object's tiles, the sources' included (`keptTiles`); a one-tile source
  in a river channel or a cluster of them escaped the build's pit filling. `keptTiles` and Flatten's
  footprints leave the sources out now; a water source's tile changes like any other and the source
  stands on it (the build puts every placed object on its ground). A 3 × 3 badwater source rides as
  one level piece: a stroke that changes one of its tiles records its rectangle in the new `rigid`
  field (`BrushParams`, the schema), and once the stroke is applied its nine tiles take its middle
  tile's level, on the page as it is let go and in the build alike (`levelRigid`; a stroke with
  pieces is rebuilt whole when a rebuild touches it, as smooth's are). No strength or footprint
  changes. Strokes saved before keep their `keep` runs and replay exactly (D158); no version needed.
- **Easy to hit** (`src/editor/sourceSpots.ts`): with any tool picked, the pointer within two tiles
  of a source (by the larger distance to its nearest tile) targets it, over water or bare ground; a
  tile with another object on it is that object; the nearest wins. The targeted source's marker shows,
  a little bolder. With nothing picked a press there grabs it (click selects, drag moves); with the
  shelf's Water source a press still needs the source itself, so a new one can go right beside it;
  Shift+scroll still needs the source itself (with a brush out it sets the brush's strength).
- **Delete** (or Backspace) removes the targeted source with any tool picked: one step ("Remove a water
  source"), its water receding live, Remove's sound; a selected source goes as before.
- **Remove**: hovering near a source glows it red; a press there takes only sources (that one on a
  click; on a drag, those in the rectangle and the one pressed, whatever the filters say; the word
  beside the pointer counts sources); the start always stays. A highlighted source now turns a clear
  red (its blue only darkened before), and the glow comes back when the objects are drawn again.
- Found on the way: CI's red Erupt test (runs 36296986453, 36297079561) was the test's spot, not the
  product: the view bar wrapping to a second row (1a93e2b) moved the rows down, and once an eruption
  is kept Erupt's row gains a line (Try another), which then covered the summit the test hovers
  (`elementFromPoint` gave the options row). The helper now asks for the map above and below the
  spot too (5fbf586; CI green, run 36298701656).

Tests: `tests/contract/brushSources.test.ts` (a water source on its raised tile; a badwater source
level and standing on its ground, its strength and footprint as they were, against a control without
the piece; the page's stroke equals the build's, a rebuild round it equals a full build, undo, redo
and the project; a saved stroke with `keep` over sources replays as it did; the field checked by the
engine and the schema; in the worker, Clear sources' one step, its label, the other source kept, undo
bringing it back, and the stroke alone where no source is), `tests/unit/sourceSpots.test.ts`
(targeting's reach, the nearest, a tree wins, a badwater source's whole footprint; the sources pressed
equal the stroke's own tiles'), `tests/unit/placeTools.test.ts` (Remove's source press: a click, a
drag, the glow, and a drag elsewhere with its filters), `tests/e2e/brushSources.spec.ts` (through the
page: off by default, ride, the ring's mark and the glow, the stroke's one step and its undo, Delete
two tiles away, a Remove drag from a source keeping a pine in its rectangle), and `brushKit.spec`
checks Clear sources off by default with the other toggles. **Changed to the decision (D148), none
weakened:** `brushKit.spec` counted three toggles in Smooth's row (no walkable one, D247); the row has
four now, Clear sources the new one, and it still checks there is no walkable toggle. Checked:
typecheck clean; `npm run test:quick` 680 passed, 13 skipped; the affected e2e specs pass.

Defaults chosen (for `docs/decisions-pending.md`): the reach is two tiles by the larger distance to
the source's nearest tile; a 3 × 3 source takes its middle tile's level; the mark sits on the ring's
north-east; Clear sources is remembered across visits (as size and strength are); a Clear sources
stroke's label adds ", N sources cleared". Not done: Claude's `brush` step (M12) doesn't level a
3 × 3 source it passes over yet (its one-tile sources ride).

## Round 2b: Unleash on sources (D239), the brush row (D247, D248)

Built on this branch after round 2, with `dev` merged in again (eb3f103: D244-D248, #68).

### Unleash, on a source (D239)

A selected water or badwater source has a small **Unleash** beside its strength, with a quick
**Power** (and U). Clicked, the source's own water carves its course with Carve's engine; pressed
and dragged out onto the land, it aims there (the source's own drag still moves it, D196). The
source's strength sets the width; everything else is Carve's defaults. While it works the row is
Carve's (Pause, Stop keeps what is carved, Revert); Esc takes it all back; one undo step, "Unleash a
source"; **Try another** re-rolls the course in its place ("Try another course"). The source stays:
the carve is a dry one, adding no other source; a badwater source's river is badwater (its preview
ribbon too). [The row](forces/unleash-row.png), and [a source on the hills carving its
river](forces/unleash.gif).

- **From a pool** (`carve/unleash.ts`, `breakout`): where the water at the source stands half a level
  deep or more, the pool is its level water round it; it breaks out at the lowest tile of that
  water's rim (an outlet it already has, or its lowest bank; the nearest of them), like a lake
  breaching. Aimed, it breaks out where the rim is nearest the aim. Never on the start's ground.
- **Its width** (`unleashWidth`): the width whose Carve "Keep river" source has that strength
  (Carve's own `sourceStrength` inverted: 1.5 water/s 4.1 tiles, 3 6.1, 4 7.5, 8 12.8; 2 to 24).
- **The operation**: the carve's `forceResult` as every force keeps it, with `where.source` (the
  source it unleashed) and the carve's own start; the engine and the schema check it (only a carve
  names one, and adds none). Projects replay it exactly; the oxbow water (#70) and the settle rule
  (D222) apply as to any carve.
- **Claude** (D134): the `carve` step takes `source: [x, y]` (a placed source's tile) instead of
  `from` or `where`, with `to` to aim; request B28 (a source placed on the hill and unleashed).
- Found while building it: starting the carve on pointer-up let the row turn into "Unleash at work"
  before the click landed, so the click pressed its Stop (nothing carved); it starts from the
  button's click now. And a shallow sheet of water round a new source first read as a pool (0.25):
  a pool is half a level deep.

### Smooth's "Make walkable" removed (D247)

The toggle has left Smooth's row and new strokes never set it (the page and Claude's `brush` step:
it now says to smooth the steps, then place a Slope where beavers should climb). Strokes saved with
it still replay exactly: the engine and the build keep honouring the flag (tested: its steps, its
slopes, the project reopened). <!-- retired-terms:allow -->"Make walkable"<!-- /retired-terms:allow --> is a retired term now
(`tools/retired-terms.json`: instead, the shelf's Slope and Flatten's ramped edges). Two lines of
`docs/STATUS.md` named it: they carry an allow marker now (the text is unchanged).

**Flatten's ramped edges, checked** (they use the same planner): ten ramped pads on three standard
maps (River Valley 3, Highlands 7, Canyon 10) got 0 to 2 slopes each (five got none), against 17 to
62 one-level steps round each pad. The cause and one recommendation are `docs/decisions-pending.md`
#84; Flatten is not changed.

### Level lines, a view switch (D248)

**Level lines** is in the view bar beside Height colours (the same words and tooltip), off by default
and remembered as before, and works whatever tool is picked (or none): it only changes what shows.
With it the view bar is wider than a laptop's view: it wraps to a second row before the compass now
(CI caught the bar running under the compass), and the brush bar sits under however many rows it
takes.

### The nightly's sweep

`tests/contract/properties.test.ts` (the heavy project) draws every log operation; `randomOps` now
draws a `forceResult` too: a small, low-power Craterize, Erupt or Quake Lift planned on the map as its
build stands and kept literally, the way the product keeps one (only planned, not played through its
stages, so it stays fast). The heavy project passes (4 of 4).

### Sounds: the audio context as the editor opens

Making a page's first audio context opens the audio device, 200-350 ms on the page's thread: on the
first key it stalled the view (CI's camera test caught it once), and made in idle time it could land
in the middle of a first gesture. The engine's context is now made as the editor opens (the page is
busy loading then); the first gesture only resumes it (and starts the bank's load). The first key
costs nothing now (the worst frame 6.2 ms, no long task).

### Tests (round 2b)

- `tests/contract/unleash.test.ts`: the breakout at a pool's lowest rim tile, aimed at the nearest,
  at the source out of water, never on the start's ground; width from strength; in the worker: one
  step, the source kept and no other, its width, aimed by an end (uphill refused in plain words), Esc,
  Try another, undo, a badwater source's badwater river; the operation's source checked alike by the
  engine and the schema.
- `tests/e2e/unleash.spec.ts`: a source placed and selected; Unleash beside its strength; Stop keeps
  one step; Try another; undo; U then Esc; dragged from Unleash onto lower land, aimed.
- `tests/contract/brush.test.ts`: a stroke saved with walkable replays exactly through a project.
- `tests/e2e/brushKit.spec.ts`: Smooth's row without it; Level lines in the view bar beside Height
  colours, with a brush out or none.
- `tests/unit/juiceSounds.test.ts`: the context made ready as the editor opens fetches nothing.

**Tests changed to the new decisions (D148), none weakened:** `brushKit.spec` checked Smooth's
walkable toggle and a walkable stroke, and Level lines in the brush row: it checks Smooth has no such
toggle and its stroke carries none, and Level lines in the view bar (D247, D248). `brush.test`'s
walkable case is named for a saved stroke now, and also reopens the project. Claude's B15 ("wear down
the steep steps so beavers can walk there") used Smooth's walkable: its reference is the Smooth stroke
(steps worn to one level), and its report must say a Slope joins a step where beavers climb.

### Defaults chosen in round 2b (for `docs/decisions-pending.md`)

- Unleash's aim: pressed on Unleash and dragged out onto the land (the source's own drag still moves
  it); a click unleashes it downhill; U too.
- A pool: water half a level deep or more at the source, its level water round it; the breakout at
  the rim's lowest tile, the nearest of them; aimed, the rim nearest the aim.
- Its width: Carve's Keep river width for that strength (as above).
- Esc takes an unleash back, as with Carve (Stop keeps what is carved).
- History words: "Unleash a source", "Try another course".
- Level lines' state is kept with the brush's settings, as before.

### What's left after round 2b

- Claude's `placeObject` for a slope doesn't choose a way that joins a step (so B15 can't place one
  for the player yet); decisions-pending #84's recommendation would give Ramped its own slopes.
- D244 (one height ceiling everywhere) waits for its in-game probe (step 1) before it is built here.

## Round 2: Kyler's review (D226)

Kyler tried the forces and the sounds on the preview (a88d7d2): Quake and Craterize great; Erupt
broken (it stopped partway, and steep eruptions with a peak became flat mesas); Power and size
separate in every force; the brush size in the options row; the shelf's order; sounds too quiet.
Codex's second sound round (#64) came in with it. Built on this branch after merging `dev` (f3f8a39,
then e1fe89e with #63 and #64).

### Erupt, to the demo he approved

**Why it went wrong.** Two causes, both in how the editor ran the prototype's engine, not in the
engine:

1. **The ceiling pressed the cone flat.** The prototype's volcano rises `(2 + 18·power)·1.42` levels
   above its vent for a steep cone (about 19 at the default power), then every level is clamped to the
   map's ceiling. The demo's study map stood at level 3 under a ceiling of 22: room for all of it. The
   editor's maps stand at 6–12 under a ceiling of 16 (the brushes' own, or the map's top on a tall
   map): the cone was cut off flat, and each eruption after it only widened the flat top. On
   Highlands 7 (128²), 21 of 57 eruptions across the settings pressed their whole core flat against the
   ceiling (up to 193 tiles within eight of the vent), and five eruptions on one spot made a mesa.
2. **It ended long before its eruption.** The swell was 14 stages at the water speed's pace (50 ms at
   normal: the land stopped rising after 0.7 s), and the eruption then counted as done: the plume's
   thinning and the lava's cooling started at once, while the demo grows its volcano over eight pulses
   of about half a second each, the plume and glow building with it. The land stopped partway through
   its own eruption.

Nothing threw: across those runs and through the page (128² and 256², eruptions stacked on one spot)
every eruption completed and was kept. The page's force driver, though, would have left a half-risen
land had a frame failed to show or the worker failed; it now keeps going past a frame the page can't
show, and takes all of it back (as Esc) if the worker fails.

**The fix** (`src/core/forces/erupt.ts`, `eruptAnatomy`): where the prototype's volcano fits under the
ceiling it is the prototype's, level for level. Where it doesn't:

- every level it raises (its cone, its apron, its ridges) is scaled together, so its summit reaches the
  ceiling at most, and is never pressed flat;
- while Size follows Power it grows broader rather than taller (up to 1.6 times), but never so broad
  that its low summit spreads into a plateau: its top level stays about three tiles across (a volcano
  already broad may grow a little narrower instead, to 0.6 at least);
- with less than three quarters of its rise, Auto's summit is a peak (a crater or a caldera pressed
  into a few levels reads as a flat top); a summit picked by hand stays;
- with too little room at the vent itself (under four levels: the top of an earlier volcano), it breaks
  out on the flank, the nearest place with room (the seed choosing among the nearest, so Try another
  breaks out elsewhere): overlapping eruptions build new cones on the flanks. A fitted volcano's lava
  runs downhill from its vent: its apron and ridges never pile onto higher ground (an older cone's
  upper slopes would otherwise be pressed into a mesa);
- a fissure keeps its line and rises less where the ground is high;
- at the ceiling everywhere near, it says "No room to rise here" (red under the pointer), and does
  nothing.

The page previews the same fit under the pointer (its breadth; a line out to the flank vent, with
"No room to rise here: it breaks out on the flank"; "Near the height limit: it grows broader"). The
swell is now 28 stages over about four seconds at the normal speed (`ERUPT_PACE`), as the demo's: the
land rises with its plume and its glow, and the eruption counts as done only when it has risen.

**Against the prototype** (`tests/contract/eruptHeadroom.test.ts`, `tools/erupt-compare.ts`; the
prototype's own engine and seeds, 24 settings a map: power 20, 62 and 96, Steep and Broad, each
summit):

| Map | The same as the prototype | Otherwise |
| --- | --- | --- |
| the demo's study (level 3, ceiling 22) | 22 of 24, level for level and rock for rock | the two where the demo itself hit 22 (power 96, Steep, Peak and Crater: 137 and 128 tiles pressed flat); the editor's peak there is one tile |
| the same under a ceiling of 16 (13 levels of room) | 17 of 24 | peaks at 16 with 1–27 tiles at the top, where the prototype pressed 66–408 flat; calderas keep their floors |
| level 12 under 16 (4 levels of room) | 2 of 24 | every one a summit of 1–45 tiles at the top (a caldera's rim 8–13), where the prototype pressed 435–437 tiles flat |

Every case where the prototype has the room is identical (the test compares 40 and more of them,
fissures included). On Highlands 7 in the editor's worker, with every setting: the five eruptions on
one spot now make a cluster of cones, the tops at 20 tiles at most; the rest that touch the ceiling
are rims of craters picked by hand (a ring about three tiles wide) and fissures on ground already at
the ceiling. [Before and after on the demo's own seeds](forces/erupt-headroom.png): the demo; the
editor now on the same map (the same); the prototype with four levels of room (what the editor did:
pale where pressed against the ceiling); the editor now there (886, 787, 7,332, 1,264 and 2,174 tiles
pressed flat become 45, 30, 297, 57 and 60). Rows: a steep crater (seed 890), a broad shield (890), a
huge caldera (77), eruptions on older flanks (313, 314), and Kyler's case, three steep peaks on one
spot (the demo itself made that a mesa; the editor, three cones).

### Power and size, separate in every force

Each size control follows Power (**Auto**, pressed) until its slider sets it by hand; Auto puts it
back (`SizeControl` in `TopBar.tsx`, one control for all): Carve's **Width** and its new **Depth**
(1–12 levels below the land it runs through, at most: a wide, shallow river at high Power; the carve
caps each tile's cut there, `DEPTH_MIN/MAX` in `carve/run.ts`), Craterize's **Size** (4–180 tiles,
as before, now in the same control), Erupt's **Size** back (its breadth, 6–140 tiles; Power sets its
height). Quake's drawn line sets its length. A set size is kept in the operation (`depth`, `size`);
operations from before have neither and replay as they were (the schema and the engine agree). A
force's options now flow on from its mode switch, wrapping a control at a time (Carve's is two lines
at 1280 wide). [The options rows](forces/forces-rows.png).

### The brushes, the shelf

Every brush's row starts with its **Size**, a number and a slider (0.5–24, the same number as hold F
and [ and ]). The shelf reads Water source, Badwater source, Start, Pine, then the rest.

### The sounds: Codex's round two (#64)

The round-one synthesiser is gone from `src/` (`synth.ts`, `worklet.ts`; `investigation/juice` keeps
it as history). The editor's one engine is round two's, ported to TypeScript (`src/editor/juice/`:
`engine.ts`, `palette.ts`, `calibration.ts`, `bank.ts`): recorded CC0 foley played by the browser's
own audio thread, no synthesis on the page. Its 24 recordings (818,400 bytes) are in
`public/sounds/juice-2/audio/` with their manifest (`bank.json`: source, author, licence, edits,
SHA-256) and provenance (`SOUNDS.md`), checked file by file against the round's own. They load
lazily: nothing with the page; the first click or key in the editor fetches and decodes them (four at
a time, a few hundred milliseconds warm); a sound asked for before is dropped, never played late. The
engine's audio context is made as the editor opens (making a page's first context opens the audio
device: 200–350 ms on the page's thread on this machine, which on the first gesture stalled the
view; CI's camera test caught it); the first gesture only resumes it.

The mapping (`juice.ts`, the cues round one already had): a brush's recorded bed from its first change
of the land to its end, with one soft contact at its start, rising gently to a fifth on a long stroke;
each placement its accent by material, at most one every 120 ms of a painted grove (with a quiet leaf
bed while it paints); sources' splash, darker and murkier for badwater; Remove's earth puff; undo's
reversed wooden catch (a stroke's bed stops first); Carve's torrent held; Craterize's breath, then its
crack and boom, then its falling stone as the debris lands; Quake's low bed, its crack once, a Slide's
splintering and grind; Erupt's pressure, its plume (its roar held while it swells) and its cooling
hiss when kept. Each force's accents play under its run's id and its beds under their own: Esc or
undo stops all of it at once, and the page hidden stops everything and sleeps. Repeats climb a small
pentatonic ladder and reset after a pause.

**Loudness:** the round's own clearly audible default, 0.72 (its everyday actions near −23 dBFS, its
forces near −16.5, in its measure; at least 21 dB over round one's quiet default); a compressor and a
bounded curve keep every sample below 0.92 of full scale. And the reason round one was so quiet: a
sound's distance came from the camera's distance to it, and at the editor's usual views that was
always "far" (every sound attenuated by 18 dB and muffled). A sound's distance now comes from where it
is in the view: anything on screen, what is being edited, plays at its full level at any zoom; off
screen it fades. A player's saved choice is kept as it is, off included (round two's proposal: never
silently raise a saved volume); the slider moves in steps of 0.02. Water ambience stays off and has no
switch yet.

### Claude (M12 stays ready, D134)

The `carve` step takes `depth` (1–12) and the `erupt` step `size` (6–140), each described in `limits`;
the erupt step reports the fit (the flank it broke out on, or that it grew broader near the height
limit). Requests B26 (a wide, shallow river: power 90, width 16, depth 2) and B27 (a broad volcano
about 60 tiles across). The reference suite: 134 of 147 (the six force requests B22-B27 pass; the 13 that fail on `dev` still fail).

### What a player feels at 256²

Highlands 7 (3,860 objects), the installed Chrome on the GPU, the new pace and the recorded sounds
playing: an eruption of 4.5 s, its frames 5.9 / 11.8 / 35.3 ms (median, 95th percentile, most), no
long task; Craterize 5.9 / 23.5 / 41.2, none; Carve 5.9 / 11.8 / 52.9, one of 51 ms; a map-wide
painted Lift 5.9 / 29.3 / 88.2, three of 52–62 ms at keeping.

### Tests (round 2)

- `tests/contract/eruptHeadroom.test.ts`: against the prototype itself (the same where it has room,
  level and rock; a peak near the ceiling, broader; cones on the flanks, each eruption complete; "No
  room to rise here"; the staged run always ends with the plan's map; Size its breadth, Power its
  height).
- `tests/contract/forceSizes.test.ts`: Carve's Depth caps the cut (two levels at power 95, width 16);
  kept in the operation and replayed; each size checked alike by the engine and the schema; older
  operations fit.
- `tests/unit/juiceSounds.test.ts`: the bank intact against its manifest and the round's own, its
  credits beside it; every recipe on the bank; runs; force phases; distance; the engine silent until
  the first gesture, then loading four at a time, sounds asked for while it loads dropped, a force's
  run cut at once, the page hidden stopping and sleeping, off silent, bursts bounded; nothing on the
  input path waiting for audio.
- `tests/e2e/sounds.spec.ts` (the bank fetched only after the first gesture, the first edit at once,
  a placement's accent, Esc silencing an impact), `tests/e2e/sizes.spec.ts` (the shelf's order, every
  brush's Size and a stroke of that size, each force's Auto), and in `forces.spec.ts` Erupt near the
  ceiling (a peak, no mesa; again on its summit, the flank).
- Totals at round 2's push: typecheck clean; `npm run test:quick` 667 passed, 13 skipped;
  `npx playwright test` 55 passed, 1 skipped; the Claude reference suite 134 of 147.

**Tests changed to the new decisions (D148), none weakened:**

- `placeTools.test` and `brushKit.spec` read the shelf in D212's order; D226's now.
- `juice.test` checked round one's quiet default (the engine's 0.22) and a saved volume's conversion;
  it checks round two's default (0.72, on) and a saved choice kept exactly, and the round-two cues
  (Craterize's debris, Quake's Slide, Erupt's plume bed and its cooling).
- `juiceSynth.test` tested round one's synthesiser, which is gone; `juiceSounds.test` tests round two.
- `forces.spec`'s fissure painted ten tiles past its vent, now under the Erupt row (wider with its Size):
  it paints on whichever side of the vent the map takes the pointer; it waits for the eruption to
  start (four seconds now) before it checks it.

### Defaults chosen in round 2 (for `docs/decisions-pending.md`)

- The forces' ceiling stays 16, or the map's own top up to 22 (D172: a standard map stays standard).
- Erupt's fit: a flank vent below four levels of room; broader up to 1.6 times; a summit's top about
  three tiles across; a volcano already broad may narrow to 0.6; Auto a peak below three quarters of its
  rise; a fitted volcano's lava never on higher ground than its vent.
- Erupt's swell: 28 stages, about four seconds at the normal speed (twice at the slower, half at the
  faster, at once at instant).
- Size controls: the slider sets it by hand at once (no box to untick first), Auto puts it back; Carve's
  Depth 1–12 levels (its Auto reads the carve's cut where it starts); Erupt's Size 6–140 tiles across
  (Steep and Broad and the summit shape it only while it follows Power).
- The brush row's Size: first in the row, 0.5–24 in half tiles.
- Sounds: round two's 0.72 for a fresh player; saved choices kept as saved; a sound's distance from
  where it is on screen; one accent every 120 ms at most for a painted grove, with a quiet leaf bed.

### What's left after round 2

- Kyler's ear: round two's balance was measured, not listened to in the editor on speakers and
  headphones (round two's own adoption note).
- Water ambience: the engine has round two's waterfall and stream beds, but no switch shows it (off).
- The GPU morphs of round 1 (Quake's glides, Craterize's growing bowl) are still not in the editor's
  renderer; Erupt's finer stages stand in for its demo's morph.

Round 1 (D219), as it was built, follows; where round 2 changed it, the section above says so.

## What was built

### One forces core (`src/core/forces/`)

- **Ported from #59**, into `src/` (nothing in `src/` imports an investigation): the shared numbers
  (`random.ts`: integer mixers, the map's hidden rock beds), fresh volcanic rock (`rock.ts`: a bit per
  level of each tile; Erupt lays it, digging takes it away, Lift moves it up or down, Slide carries it),
  the object rules (`objects.ts`: footprints, the start's ground and its quiet "Start here", the
  knocked-down pose), and the three verbs, faithfully (`craterize.ts`, `erupt.ts`, `quake.ts` with its
  fault brush). The port is pinned to #59's 45 parity cases: every one gives the same land, objects
  and fallen trees byte for byte (`tests/contract/forces.test.ts`).
- **Carve** is the port already on `dev` (from #47, checked step for step by `tools/carve-equiv.ts`),
  now on the same core: it finds fresh volcanic rock hard (it bends round a lava field; the prototype's
  four lines), and the rock it cuts through goes. The 9 pinned Carve cases pass too.
- **The staged runs** (`runs.ts`): Craterize, Erupt and Quake are planned on their own copy of the map
  a few rows a step (a 12 ms budget, so the worker keeps answering the page), then shown in stages:
  the impactor falls while it is planned, the bowl opens at once and the debris lands ring by ring
  (eight stages); the ground stirs, then the volcano swells level by level (fourteen); a Lift's front
  races along its fault (eight, as the prototype); a Slide's block moves along it a tile at a time, all
  of it together (as many stages as its tiles of travel). The water shown moves with the land (the
  game's own rules, a few ticks a stage, from the water there was; a Slide carries its water with its
  ground). What is kept is always the plan's final map: the stages only show it, so the result never
  depends on the pace, the machine or the effects (tested: stepped or run whole, the same land).
- **The map's rock** is derived once from the map as it was opened (`MapSession.openedHeights`), never
  rerolled by an edit; every force meets the same rock.
- **One operation, `forceResult`** (`op.ts`, `result.ts`, the schema): the force, its settings and
  where it acted (a record: a replay never runs the force), then its literal result: the changed tiles
  and their levels, the fresh rock where it changed, the objects that lost their ground, the ones it
  carried, the trees it knocked down (dead; the way each lies is the editor's view, never the game's:
  a `.timber` keeps a dead tree), a carve's source and sealed oxbow lake. Try another replaces the
  force before it; undoing it brings that one back. The build applies it like the carve before it
  (its levels with the sculpts, kept out of the integrity pass; its objects as quiet entity edits).
  **Projects saved with `carve`** still open and replay exactly: `carve` stays a document operation,
  applied the same way (tested). New carves, the editor's and Claude's, keep `forceResult`.

### The worker: one set of force calls

`forceStart`, `forceAdvance`, `forcePaint` (a painted Lift), `forceStop`, `forceCancel`, `forceAgain`
run any of the four in the editor's own worker, on the open map's session: no second history or water
owner (the carve's own calls stay, as names for these). A force starts from the map as it stands, its
water in flight included; the ground above the layer showing (D207) and an imported map's caves are
left as they are. When it is kept, its final map gets the build's own integrity pass first, so the
last stage shown is exactly what the build keeps (a one-tile pit a force left beside its tiles, or a
level past the editor's limit, would otherwise change at the last moment). Objects the map placed
again while a force worked (its settled water re-planting trees) are left out of its object changes.

### The page

- **The top bar's forces group:** Carve, Craterize, Quake, Erupt (keys 7, 8, 9, 0), between the
  brushes and Remove, each with its icon. Each options row starts with its mode switch
  (`ForceRows.tsx`, Carve's is `CarveRow.tsx`): Craterize's Strike or Aim, Power (Pebble, Meteor,
  Asteroid, Cataclysm), Size following Power or set, Walls, Centre, Light or Heavy debris, Rays; Erupt's
  Vent or Fissure, Power (Cinder, Cone, Volcano, Cataclysm), Steep or Broad, Summit, Light or Heavy
  flows, Ridges; Quake's Lift or Slide, Power (Tremor, Rift, Upheaval, Cataclysm), Sheer or Stepped,
  the side that moves. Try another shows once a force is kept. While a force works its row is its
  status and Revert (Carve's keeps Pause and Stop), and the other tools wait.
- **The grammar:** Strike and Vent are a click; Aim presses on the impact and drags the way the
  impactor travels; a fissure and a fault are painted (Shift continues a straight line from where the
  last stroke ended). Under the pointer the land shows the crater's rim or the vent's cone, the
  painted line and, for a fault, the side that moves (a light band); red, with "Start here", where the
  start refuses it. A Lift is shown whole as it is painted (the worker takes the latest stroke when it
  is free) and kept when let go; a fault that runs through the start is refused whole; a Slide, a
  fissure and an aimed impact start when let go. X flips a quake's side, even while painting. Esc
  drops a stroke still being drawn, and takes a force back at once; undo too.
- **One driver** (`forceDriver.ts`, the carve's driver made general): frames at the water speed's pace
  (ten steps a second at its slowest), each frame's moment to the effects and the sounds, Carve's
  Pause, Stop and follow camera as before.
- **The moments** (`render3d/forces.ts`, from #59's effects): the impact (a streak falling, a flash,
  a shock ring, dust and thrown blocks, a short shake); the fault's crack running along it, dust at
  its head, a light shake; the eruption's plume of soft rolling puffs, bigger and darker the more
  powerful it is (D216: `plumeLook`), the lava's glow along its flows cooling to a dark crust and
  fading (the terrain shader's heat), a light rumble. Knocked-down trees lie along their heading
  (their dead model, laid down). With reduced motion, or in software rendering, none of it plays and
  the camera never moves; the land is exactly the same (tested).

### The sounds (D205, D212, D220; replaced in round 2)

Round one's, replaced by Codex's round two in round 2 (above). Codex's synthesised engine (#58) was the editor's one sound engine (`src/editor/juice/`: `synth.ts`,
the synthesiser in an AudioWorklet, `worklet.ts`; `engine.ts` on the page), for the editor's lifetime:
made at the first click or key (browsers ask for that), never waited on, bounded (64 voices, four
textures, excess accents dropped), paused when the page is hidden or loses the focus. `juice.ts` keeps
the land's little effects as they were and routes the sounds:

- a brush stroke is one texture from its first change of the land to its end (Raise, Lower, Flatten,
  Smooth and Naturalize each have theirs), never a pile of accents;
- a placement has its accent (a tree's wooden pop, a bush's pluck, a ruin's clank, the mine site's
  clunk, the start's thump), a source its gurgle (darker for badwater), Remove its poof, a successful
  undo a soft rewind;
- each force its cues, once each: Carve's torrent held while it runs (its activity from its head);
  Craterize's whistle, then its impact and falling debris; Quake's rumble held, the crack once, and a
  Slide's grinding; Erupt's rumble held, the plume rising, and a cooling hiss when it is kept. Esc
  stops every sound of a force at once, and none of it plays later.

**Defaults:** on, quiet: the player's volume (0 to 1, 0.5 by default) scales the engine's quiet level
(0.5 is the engine's own default, 0.22); a player's saved choice (`dgm.sound`) is kept, off included.
Water ambience is off (the setting is kept for when it is turned on; this build adds no switch for
it). Sound and its volume stay among the view buttons.

### Claude (M12 stays ready, D134)

`investigation/claude`: `craterize`, `erupt` and `quake` steps (`lib/forceSteps.ts`), each making the
editor's own `forceResult` operation, with `limits` for each and the harness prompt; the `carve` step
keeps the shared operation too. Requests B22 (a crater about 24 tiles across), B23 (a small volcano),
B24 (a lifted fault) and B25 (a meteor on the start: refused, "Start here"). The reference suite:
132 of 145 (128 of 141 on `dev`; the four new requests pass, the 13 that fail on `dev` still fail).

## What a player feels at 256² (Highlands 7, 3,860 objects; the installed Chrome on this machine's GPU)

Measured with the page's frames (requestAnimationFrame gaps) and long tasks while each force ran and
was kept, after two changes: the worker sends a force's water and objects at most every 120 ms (and
always with its last frame), and the page puts a frame's water and objects on the next animation
frames rather than in one (each is a whole map's update, about 25 ms here: the water journey's own
path). Before them a map-wide Lift had 14 long tasks of 57–125 ms and Craterize four of 51–83 ms.

| Force | frame gap p50 / p95 / max (ms) | long tasks (ms) |
|---|---|---|
| Craterize (power 55) | 7.0 / 21.1 / 84 | 82, 56 (as it is kept) |
| Erupt (power 62) | 7.0 / 27.4 / 40 | none |
| Quake, a painted Lift across the whole map | 7.0 / 21.0 / 108 | 55, 71, 66, 55 |
| Quake, Slide | 7.0 / 21.1 / 35 | none |
| Carve (3 s, then Stop) | 7.0 / 20.9 / 83 | 76, 57 |

The worker plans a force in 12 ms slices, so the page's calls never wait long on it. What remains is
the kept edit's own view (as for any edit) and, for a map-wide Lift, the size of the ground it moves;
remeshing that in slices is left for later.

## Captures for Kyler

`tools/capture-forces.ts` (this branch as the preview builds it, our own Highlands 4242 at 128², on the
GPU, the water speed at its slowest; about 2.9 MB in all, D195):

- [the top bar with the forces group and Erupt's options row](forces/forces-bar.png);
- [Carve](forces/carve.gif): a river unleashed (power 75, wander 60);
- [Craterize](forces/craterize.gif): a strike with rays (power 45): the streak, the flash, the shock
  ring and the dust, the bowl, a peak in the middle, the river running into its rings;
- [Erupt](forces/erupt.gif) as Kyler makes it (round 2: steep, a peak, the default power, the map's
  ceiling 16): the ground stirs, the volcano swells over four seconds with its plume, the lava glows
  along its flows and cools, and a stepped peak stays, damming the river into lakes;
- [Quake, Lift](forces/quake-lift.gif): a fault painted across the map, the far side rising behind
  the pointer, the river dammed into lakes;
- [Quake, Slide](forces/quake-slide.gif): the fault drawn, then the block sliding along it (power 70:
  15 tiles), a badwater channel carried with it.

`npx tsx tools/capture-forces.ts [--only erupt] [--strip]` makes them again (`tools/gif.ts` writes the
GIFs: one palette, each frame only where it changed).

## Tests

- `tests/contract/forces.test.ts`: #59's 45 pinned parity cases (Quake Lift and Slide, Sheer and
  Stepped; Craterize's four centres with and without rays; Erupt's Vent and Fissure, Steep and Broad;
  Carve straight to winding, every step); the kept regressions: 300 random strokes (a quake or "Start
  here", never a silent failure), every short stroke quakes, the pen; a Slide carrying ridges and a
  ruin exactly Power's tiles; a river across a Slide flowing, live and settled; rock moving with the
  land; Carve bending round an eruption's lava; a staged force the same at any pace; the ground kept
  out (a cut) as it was.
- `tests/contract/forceOps.test.ts`: every force at work in the editor's worker (frames, Esc, kept as
  one step exactly as shown, Try another, undo); a painted Lift; the start's refusal; forces, brushes
  and placements in one history (undo and redo in any order to the same maps; the project file,
  format 3, reopens them; the export is the same bytes); a carve kept as the `carve` operation of
  before; the engine and the schema (Ajv agrees) refusing a result that doesn't fit.
- `tests/unit/forceDriver.test.ts` (was `carveDriver.test.ts`), `tests/unit/juice.test.ts`,
  `tests/unit/juiceSynth.test.ts` (#58's numeric checks), `tests/unit/release.test.ts`.
- `tests/e2e/forces.spec.ts`: Craterize, Erupt and Quake through the page (their rows and mode
  switches, kept as one step as shown and as the worker keeps it, Esc, Try another, undo, the start's
  refusal, keys 8, 9, 0 and X, Esc putting a force away); reduced motion (the same land, the camera
  still). `tests/e2e/carve.spec.ts` as before.
- `tests/e2e/start-edit.spec.ts` waits for the instant checks (they come from the checks worker a
  moment after the edit; CI once read them before they came). Not a decision change: the same check.

At the last push: `npm run test:quick` 621 passed, 13 skipped; `npx playwright test` 51 passed,
1 skipped.

### Tests changed to the new decisions (D148)

- `brushKit.spec` checked that Craterize, Quake and Erupt stay hidden; they are ready (D216, D219), so
  it checks the forces group's four buttons with their keys.
- `carve.spec` checked the other forces were hidden; it checks they stand beside Carve.
- `release.test` expected the preview to show Carve only; it expects all four, with their keys and
  modes.
- `juice.test` checked the forces' touch registry (`register`); the forces' sounds are cues on the one
  engine now, so it checks those (strokes one texture, placements' accents, cues once each, Esc
  stopping a force's sounds) and the saved choice kept.
- `carveDriver.test` became `forceDriver.test` (the driver is every force's), with a staged force and
  a painted Lift added.

## Defaults chosen (for `docs/decisions-pending.md`)

- Keys: 8 Craterize, 9 Quake, 0 Erupt (the bar's order after Carve's 7); X flips a quake's side while
  Quake is picked (Remove's X otherwise).
- Quake Slide: shown as its fault while painted, then the block slides tile by tile when let go (the
  prototype's GPU glides and painted slides aren't in the editor's renderer); a Slide that would carry
  the start is refused (X flips the side). A painted Lift carries the start with its ground, and is
  refused if that floods or tips it (only when the start was dry and flat before).
- Stages: 8 for an impact, 8 for a Lift, the travel's tiles (at least 8) for a Slide, at the water
  speed's pace; an eruption's, 28 over about four seconds (round 2).
- A small render-only shake with the impact and the quake, and a lighter one while a volcano swells,
  on by default (off with reduced motion); no switch for it.
- The prototypes' own defaults for each force's options (Craterize power 55, Terraced, Heavy debris;
  Erupt power 62, Steep, Heavy flows, Ridges; Quake power 60, Lift, Sheer, the left side moving).
- The Power words: Pebble, Meteor, Asteroid, Cataclysm; Cinder, Cone, Volcano, Cataclysm; Tremor,
  Rift, Upheaval, Cataclysm.
- The sound volume: round 1's was the player's 0.5 as the engine's 0.22; round 2's is round two's
  0.72 (above); no ambience switch yet (off).
- Objects a force touched that the map planted again while it worked are left out of its result.

## What's left, and what couldn't come across

- **Quake's GPU glides** (vertices sliding from their source over 240 ms, painted slides following the
  pen) need the forces-core's own mesh attributes; the editor shows a Slide as whole-tile stages
  instead. **Craterize's GPU morph** (the terrain faces growing over 1.35 s) likewise: the bowl
  appears at once and the debris ring by ring. The rock bands on walls (the demo's shader) are not
  drawn.
- **A painted fissure** starts when let go (Erupt's own INTEGRATION.md: "releasing begins one event"),
  not as it is painted (the forces-core demo paints it live).
- **Generated maps' trees** come from the map's resources, planned again on the new ground after any
  edit: a force's knocked-down trees and removals apply to the trees still there, and new trees may
  grow on the new ground (as with Carve and the brushes).
- **Fallen poses** are the editor's view only (a `.timber` keeps dead standing trees, the game's own).
- **Fresh rock under brushes:** a brush that lowers through fresh volcanic rock and raises the ground
  again may bring the rock back (the rock is taken from the forces' operations and trimmed to the
  ground as it stands).
- Water ambience (a nearby waterfall or stream) is not wired (off by default, as decided).
