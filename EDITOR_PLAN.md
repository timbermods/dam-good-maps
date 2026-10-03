# Dam Good Maps: the map editor

> **The yardstick for every review: [docs/PERFECT.md](docs/PERFECT.md)** (what perfect means, `PLAN.md` §20 D225).

**Read this before any editor work** (`CLAUDE.md`). Part 1 is the editor's vision and how it works now, taken from
Kyler's decisions (`PLAN.md` §20: D158, D172, D179–D187 and the later ones it cites). Part 2 is the technical
reference. Where anything here conflicts with `PLAN.md` §20, §20 wins. The next screen is
[docs/UI-BRIEF.md](docs/UI-BRIEF.md)'s ("The page is the editor", D330; a separate page session owns that design):
where this document describes the screen and the brief differs, the brief wins. What was superseded, the detailed
text this document condensed (at D390) and the deferred Claude integration's design are in
[docs/archive/editor-plan.md](docs/archive/editor-plan.md). `ROADMAP.md` orders the work.

# Part 1: the vision

## 1. The idea

A studio for creating maps. Start from a generated map or a real place, shape it like a painter, and the water
responds to everything you do. It is deliberately different from the game's own editor, which is a precision
workshop; players can still fine-tune in the game's editor if they want. The editor is desktop-first (D185).

## 2. The principles

- **The land is the interface.** The map is the hero; the interface stays small and quiet. Feedback comes from the
  land itself: water moving, ground greening, a waterfall appearing.
- **Direct manipulation.** Everything happens where the cursor is.
- **Few tools, each obvious.** A new idea must earn a button, or make an existing tool smarter.
- **Smart defaults instead of settings.** Options stay hidden until wanted.
- **Forgiveness.** Every stroke or placement is one instant undo step, and Esc always backs out.
- **One grammar:** pick, paint or place, see.
- **Tools read intent.** Small quality-of-life tricks remove decisions the player would otherwise make: smart
  Lower, a target level that follows the ground until set (D322), clear water round a brush over water, sampling a
  riverbed on water. Whenever a player would hesitate, switch tools or do something twice, look for a way the tool
  could have known what they meant (D204).
- **Every control says what it does** (D351, D361, D368 (6)): each tool, force, option, view toggle, shelf item and
  button has a tooltip, a short phrase (about 60 characters at most, no second sentence, no technical detail) that
  says what it is for at a glance, then its shortcut at the end as a small key cap, never in brackets ("Carve a
  river" then a cap 7). One shared tooltip shows them all (`src/ui/Tooltip.tsx`): a control carries its phrase as
  its `title` and its keys in `data-keys` (`tip("Carve a river", "7")`). Whoever changes a control updates its
  tooltip in the same commit; `tests/e2e/tooltips.spec.ts` fails on any interactive control without one, with a
  second sentence, past that length, with a key in brackets, or named with a key its tooltip doesn't end with
  (`tests/unit/tooltipForm.test.ts` checks the tools', forces' and shelf's where they are written).
- **Things just work, and are fast.** Full frame rate on 256² maps; painting never waits on water; water reacts
  around the edit first, then the rest of the map; nothing ever freezes.
- **The camera only moves when the player moves it** (D265, an accessibility rule): no feature moves, tilts, zooms
  or shakes it on its own (no follow, for the water or any force); effects on the land are unaffected.

(D158, D179, D184, D204, D212.)

## 3. The screen

The editor's parts as they are now. The page is the editor (D330): every map opens in the editor at once, in one
window, and Maps opens the generator's settings in a drawer in the palette's column. Their look, sizes and exact places are
[DESIGN.md](DESIGN.md)'s ("The one-page editor").

- **The header:** **Maps** alone at the left edge, above the left column, lit while the drawer is open. The map's
  name at the window's exact centre, and under it "Seed 4242 · 128×128" (an opened file shows its size; if this
  browser can't keep the map, that line says so); it never reaches either side: where the room is short the second
  line goes first, then the name ellipsizes. A click on the name renames it in place, at the same place, size and
  font: Enter or leaving saves through the core (`MapSession.setName`; never an operation or an undo step, D443),
  Esc cancels, and a blank name is refused in the core's words, said in the second line. On the right Undo, Redo, the checks dot with its
  words ("Ready to play", "2 things to look at"; below about 1,000px wide the dot alone), **Save to Timberborn**
  (**Download .timber** in browsers that can't save to a folder), the only lit control, Look, and **File** (Open…,
  Save project, Download .timber, Clear everything, History, About).
- **One left column** at one width (352px): the palette (four tools to a row, each with its picture and name) or
  the Maps drawer; opening or closing the drawer swaps them, and nothing else on the screen moves or changes size.
- **The Maps drawer:** **Generate** and **Surprise me** pinned at its top; under them, scrolling as one panel: what
  is on the map (picture, number, name); Theme and Seed (a typed seed is kept, with a lock to unlock it); Size;
  Terrain, Water, Hazards, Resources, **Difficulty** (Starting wood, Max walk to water, Starting berries, Start
  area, No ruins within) and Limits for this size, each opening in place under its own row, several at once, with
  the settings' fields and guards (PLAN §5) and no line under them (the official maps' range is in each tooltip);
  **Your maps**. Every map is made for Normal until the core drops difficulty after M9b's release. Every Generate makes a new map named for its
  theme ("River Valley") and replaces the open one without asking: edits never replay onto new land (D336), and the
  map it replaces is already in Your maps.
- **Your maps** (D234): every map opened or made is kept in this browser and saved quietly after its edits settle
  (`core/library/saver.ts`), a new one a moment after it opens and the open one before anything replaces it; the
  drawer's foot shows them as square tiles, two to a row (the stored 64px picture, the name and the size), newest
  first, the open map marked, a click opening one. Phones stay view-only (D185).
- **The address** is always the open map's share link (its spec, D7; a link carries no edits): copying it shares the
  map as generated, and a link opens straight into the editor. A reload brings the open map back from Your maps,
  edits and all. A real place's address is `#place=<id>`; an opened file has none.
- **Select is always in hand** (Kyler, the v4 verdict): held when a map opens; Esc and X put anything else down and
  return to it; a drag on the land marks an area and a click clears it; a source and the start are pressed and
  dragged as before; a click picks an object and a drag then moves it, while a drag from an object not picked
  marks an area. The middle button turns the view, the right button pans.

- **The rows over the map** (D323, item 9): four, top to bottom: the view bar; the tools (Raise, Lower, Flatten,
  Smooth, Naturalize, Select); the forces in three clusters by prominence (D352, `FORCE_GROUPS` in `TopBar.tsx`:
  Carve, Craterize, Erupt · Rift, Quake, Glaciate · Erode, Deposit; today Carve, Craterize, Erupt · Quake,
  Glaciate, keys 7, 8, 0, 9, -; a force not adopted yet takes its place in the list); the active tool's settings
  and its More, or with nothing else in hand Select's line. A long settings row takes a second line, and a tool's
  More opens as a compact grid panel (D345, B2). The first-run hint points at Carve. Every force's row is §4's.
- **The left shelf** (the palette): a clean grid of placeable objects: the **Water source** and the **Badwater source** (two
  items, D212), then the **Start**, **Pine**, **Birch**, **Oak**, **Berry bush**, ruins, the mine site, relics,
  slopes and the rest, each a small render in the map's look.
  - Picking one shows a live ghost that follows the cursor, green where it fits and red where it doesn't (the start
    has three colours: **green** it fits and meets every start requirement, **amber** it fits but misses some,
    which the panel lists, **red** it cannot be placed there; a placed start changes colour only when something
    about it changed, D361), with **one label** beside the pointer (D323, item 32): the reason where it doesn't
    fit, "Move the start here" for the start where it does, "Place here" for the rest. Click to place, R to
    rotate; **Esc or a right-click puts a picked object away** (a right-drag is still the camera).
  - **Drag an object out of the shelf** (D323, item 11): the ghost follows the pointer, letting go over the map
    places it there (the start moves the map's one start); a drag that doesn't place always ends placement. The
    drag is the page's own pointer drag, never the browser's, so dragging an icon never offers to close the map.
    Drag trees and bushes on the map to paint them in natural clusters.
  - **Placed objects fit the land** (D328, extending D290): a ruin, mine site, relic, landmark or an opened map's
    start placed on uneven ground levels its footprint (the start's door too) to the height most of that footprint
    already stands at, cutting what is above and filling what is below, in the placement's one undo step, meeting
    the land in short natural slopes (one level a tile, out to six tiles, fading so a steep hillside is left
    alone), never a step or a wall. **Placing an object never visibly spills water** (D345, B6): it never fills a
    wet tile and never cuts a dry tile below the surface of the water beside it (the level rises to that surface
    instead); a footprint that stands in water on uneven ground is refused with one plain reason ("the water is in
    the way: the ground here is uneven, and levelling it would spill the water"), and one already level may stand
    in shallow water. The rule lives in the core (`core/features/footprintLevel.ts` `platformLevel`,
    `core/doc/placing.ts` `levelFootprint`, `levelProblem`); the ghost shows the level the worker names. Other
    objects' tiles, caves and water are left as they are; water and badwater sources stay cut-only (D290). It
    refuses only at the map's edge, in a cave and on another object's tiles, with one plain reason. A generated
    map's start already levels its own bench. A placed source starts at the game's own default strength (D323, item
    46: 1 water/s, 3 for badwater); it can be changed.
  - **Scatter-type items place like a brush** (D235): trees, bushes, ruins, thorns and the like show a brush circle
    with the terrain brushes' grammar (F or { and } to resize, [ and ] its density, the size in the options row);
    dragging scatters that exact item naturally inside the circle, random, never overlapping, only where the game
    allows it (a ruin stroke paints a ruin field with varied heights and mixed models), filling gaps up to the
    density, never stacking; trees and bushes on dry ground tint the brush amber with "dry ground: these will die"
    (still allowed); trees have an **Age** option, Grown (default) or Mixed; a quick click or the smallest size
    places exactly one; each stroke is one undo step, and Select and Delete clear them (D288). Unique landmarks
    stay single-placement: the start, the mine site, relics and geothermal fields.
- **The view buttons** (D287): one **Top-down** toggle (lit while the view looks straight down), Reset view, Height
  colours, **Level lines** (D248: a thin line wherever the ground steps down a level, off by default), Markers (the
  sources and the slopes), **Flow** (D353: the water's currents, off by default, kept like Markers), Clear water
  and the overlays, **Badwater** (with its one-line caption at the lower left) and **Under roofs** (where the map
  has roofed water). Toggling any of them moves nothing. No dam site is drawn on the map or named on the map
  card (Timberborn has no dam sites); the analysis stays internal. The land shows moisture itself, and the water
  bar's Drought shows a drought day by day, so there is no Moisture or Drought view.
- **The top-right cluster** (D345 B3, D368 (5)): the compass in the corner, the **level control** (▾ value ▴, at one
  fixed width) beside it, centred and larger, and, directly beneath, **Slow forces** and **Sound** (a
  speaker icon, crossed out when muted; its volume opens beneath it), then a named **Legend** button across the
  column; one height and one gap throughout, one right edge for the column and the water bar
  (`tests/e2e/viewAndHeader.spec.ts`, `layout.spec.ts`). The legend opens only by its button, under it over the
  map, as tall as its content (scrolling inside past one gap above the water bar): every line a name (Moist ground,
  Water, Trees and bushes, Start, Slope…; "Markers on:" Slope arrows, Level lines, Contamination edge, Mine site
  outline), a click showing its things on the map. **Every camera view frames the whole map, centred in the map
  area** (D345, B1).
- **Visible layers, as in Timberborn** (D207): the level control shows the visible level (∞ when everything
  shows) with up and down arrows; its value runs up to 22 (the game's highest terrain), then ∞, on every map; the
  first step down from ∞ goes to the map's highest level, up runs through every level to 22, then ∞, and a click on
  the value shows the whole world (Kyler, 2026-10-03). Everything above the chosen level is hidden (terrain, water,
  objects) and the cut surfaces show as the tops of what remains. The layer pick (Alt+click) slices to a tile's
  level, and again on the same level returns to ∞; Alt+scroll steps as the game does. Brushes and placement act on
  the visible land, never on hidden terrain above the cursor. Esc never resets the slice.
- **The water bar's status is the worker's real state** (D345, B14): every update the worker answers with carries
  `waterSettled`; the page begins a water journey only when it is false, and reads "Water settled" at once when it
  is true, so an undo, a redo or an edit that leaves the water as it is never leaves "Water flowing… 0%" waiting
  (`WaterPlayer.settled`, `tests/contract/waterStatus.test.ts`). The bar is: the status, **Pause water** (Play
  water while paused; shown unavailable while the water is settled), Skip, Replay, Drought and Badtide (§5).
- **The minimap** (D205): a small top-down view of the whole map in a corner, refreshed after edits settle, with an
  outline of what the camera sees; click or drag on it to move there. On by default for 256² maps, off for smaller
  ones, with a toggle among the view buttons.
- **Juice** (D205, D220, D226): small satisfying feedback on every action (a soft thud as land rises, a puff of dust
  when it's lowered, a pop and a wiggle when something is placed, a splash when a source starts, each force's own
  moment), with Codex's second-round sounds (#64: recorded CC0 foley; a bed for as long as a stroke changes the
  land, an accent for each thing placed by its material, each force's own phase by phase). Repeating an action
  climbs a small pentatonic ladder and resets after a pause. On by default at a clearly audible level, never harsh,
  with a volume and an off switch the player keeps (D212); water ambience is off unless turned on. The recordings
  load on the first click or key, never with the page, and nothing waits on them. Micro-animations follow the
  reduced-motion setting. Nothing new stays on screen unless in use.
- **The hover readout:** a quiet corner line for what's under the cursor ("Height 11, dry soil"); over water, its
  depth, the bed level and its contamination (D196). **It names every object and plant too**, with its key fact
  where one is useful (D347, B11): "Mine site", "Ruin, 5 levels, 75 scrap metal", "Water source, 1 water/s", "Pine,
  grown", "Relic, medium"; where an object sits on ground the line gives both ("Geothermal field · Height 5, dry
  soil"), up to three objects separated by ";". It works with any tool held. It is one plain core function,
  `describeTile` (`core/doc/describeTile.ts`), returning data; the readout only words and shows it
  (`tests/contract/describeTile.test.ts`). It refreshes whenever the water under the pointer changes, without
  re-hovering (D347, D387 (1)): after each water state the page shows, it asks `readoutWater` for the hovered tile
  (the readout's water words, as rounded and shown) and re-describes only when they differ
  (`tests/contract/waterSignal.test.ts`).
- **Saved names** (D345, B10): a saved map is `dgm-<theme>-<seed>.timber` (`any` for a Surprise me map; a seed typed
  as a word made file-safe; a real place, an opened file or a renamed map as `dgm-<name>`); Save to Timberborn never overwrites: a
  taken name gets `-2`, `-3` (`core/gen/pack.ts` `fileName`, `namedFile`).
- **Checks:** a quiet dot, green or amber, with its words. Clicking it lists the problems, each with Fix and Show,
  highlighted on the map. Never a pop-up.
- **The notices** (the No badwater line, D213; what opening a file changed): a quiet strip under the map, never
  over it, so they cover no control in any layout; Hide closes it.
- **The start:** its reach (water, wood, berries) appears when it is hovered or dragged, then fades.

(D184, D212, D219.)

## 4. Shaping the land

### The forces' shared rules

Every force (Carve, Craterize, Erupt, Quake, Glaciate; Erode and Deposit when built) follows these. They are built
on one shared forces core, `src/core/forces/` (D203, D206, D220; see its README).

- **One row** (D289): **Power**, **Size** (Quake has none), at most one signature choice (Carve's **Keep river** or
  **Dry canyon**; Quake's **Lift** or **Slide**; Glaciate's **Meltwater**), and **Try another**. The gesture is the
  mode: a click unleashes a carve, strikes, vents or flows; a drag draws a line freehand (below). Everything else
  (Carve's wander, walls, Canyon depth and Banks; Craterize's walls, centre, debris and rays; Erupt's shape, summit,
  flows and ridges; Quake's scarp; Glaciate's benches, steps, tarn and scree) is natural variation drawn from the
  ground where the force acts and the seed (`core/forces/nature.ts`), which Try another re-rolls; the operation
  keeps what was drawn, so projects replay exactly. **A small More button** at the row's end (outlined in the accent
  colour with a chevron, D309, D361; closed by default, remembering how it was left) opens those details; every
  detail starts on **Auto**, nature's own pick; setting one pins it, with a small way back to Auto beside it. Once
  a force runs, a detail on Auto shows the value it just took, one click from being pinned. Try another re-rolls
  only the details still on Auto; pins are remembered with the editor preferences. While a force works its row is
  its status (Carve's with Pause) and Revert; it keeps itself when it ends (no Stop); the other tools wait.
- **Fast, with a choice to watch** (D321, item 29): a force is worked out first (its gathering shows meanwhile),
  then shown. **Fast**, the default: its land is final within about two seconds of the gesture, however long or
  large the result, and the player can act again at once (an impact keeps its own, quicker pace). **Slow forces**
  (a toggle beside Sound, remembered): about four times as long, to be watched; a click anywhere or a new
  gesture's key jumps it to its final land. The pace never follows the water's speed. What is only a show (water
  filling a new channel, falls starting, dust, lava's glow) plays on after the land is final, never blocking.
- **Esc skips, undo takes it back** (D344, A4): while a gesture is still being drawn, Esc cancels it and nothing of
  it lands; once a force plays, Esc skips it to its end, its final land kept as one step; Ctrl+Z (or Z, or Revert)
  takes all of it back at any moment, and nothing lands afterwards (D341). The row's hint line says **Esc to skip ·
  Ctrl+Z to undo** (a painted Lift still drawn: **Esc to cancel**).
- **A force changes things only when it reaches them** (item 30): objects, trees and sources go as the carve's head,
  the ice front or the lava reaches them; an impact changes everything at once; under a quake they ride the
  ground. The water, swept sources' water included, stays as it was until the land is final, then flows on as after
  any edit. **Nothing pops in after the animation** (D368 (9)): the last frame shown is the land kept
  (`tests/contract/forcePop.test.ts` holds every force and mode to it, in both paces). The result and what is saved
  never depend on the pace.
- **The Floor** (D321, item 40): at the end of every force's More, the lowest level any force cuts down to, 1 by
  default, up to the height ceiling: one setting shared by all the forces, kept with the editor preferences, never
  Auto (a rule, not a flavour), with **Default** back to 1. Where a force would go deeper it runs shallower there,
  never stopping; ground already below it stays (`core/forces/floor.ts`, which Erode and Spring adopt when built).
- **A visible effect wherever it is used** (D356): never "nothing happened", never "not here". A force adapts to
  where it is used (a slope, flat ground, water, a peak), scaled by Power; one that works in one narrow situation
  becomes an option on another force or is dropped (Meander into Carve, D355; the Landslide dropped, D354).
  `tests/contract/forceEverywhere.ts` uses every force the editor's way at random places and on each kind of ground,
  at low, mid and high Power, and fails where fewer than 9 tiles change by a level (a sample in the quick suite,
  every theme at 128² nightly; `tools/force-everywhere.ts` sweeps 128² and 256²; a force adopted later gets the
  same check). **Carve clicked at the map's edge carves inward** (D360 (1a), `core/forces/carve/edge.ts`). **A Quake
  click makes a short natural fault** (D360 (1b), `clickFault` in `core/forces/quake.ts`): 10 to 22 tiles with
  Power, along the slope's contour (a seeded way on flat ground), turned and bent by the seed.
- **Bound only by nature** (D257): a force obeys only what it physically is and the map's physical limits (its
  floor, the height ceiling, the file format); it never refuses, stops short or reshapes its result for
  playability. Where it carves, buries or moves the start's ground, the start is carried to the nearest level ground
  where it stands well, in the same undo step; the quiet dot then says what the force left short at the start
  (water, wood and berries, the starting-logs floor), each with its one-click fix (move the start, plant berry
  bushes, plant oaks).
- **Clean, magic gestures** (D258): no force draws a predicted route, footprint, outline or fit on the land. A click
  starts the force at once, finding its own way; **one ring at the cursor shows the force's size** at its Power
  and Size (D312, D321 item 13): the crater's radius, the volcano's, Carve's width, like a brush's ring (how big,
  never what shape), drawn once in one calm colour where the cursor is (on the water's surface over water).
  **Quake shows only a small marker**, a dot (D368 (2)). **A drag draws a line freehand** (D321, item 41; D327;
  `src/editor/freehand.ts`, the pen `core/forces/path.ts`): a press becomes a drawn line once the pointer moves
  six pixels, the line shows as it is drawn, and on release the force goes (Carve and Glaciate along it; Quake's
  fault and Erupt's fissure are it). **Craterize is click-only** (D368 (7)): a crater is one impact. **The preview
  is the stroke** (D361 (2); `bandTiles`): a band along the drawn line, never an area; what the force decides (its
  reach, its extent) is never drawn in advance. **A drawn shape sets the force's extent, and Size is for clicks**
  (D344, A6): Carve and Glaciate run the line end to end (Size is their width), Quake's line is its length, an
  Erupt fissure's breadth is the breadth Power gives, never more than the shape's own span. The only word a force
  shows is why it won't act at all (Erupt's "No room to rise here").
- **Power and Size** (D226, D344 A1–A2, D361 (1), (3), D368 (1)): separate in every force; each Size follows Power
  by default (shown **Auto (68)**) or is set by hand. One key habit for every tool (`keyHabit` in
  `src/editor/forceSize.ts`): hold F and move the mouse to size the ring on the map (a click or letting go keeps
  it, Esc or a right click puts it back), { and } step the Size, [ and ] the Power by five (or F held and the wheel,
  D368 (11)), the number beside the pointer. **Size sets how far a force reaches; Power how strong it is within
  that** (`core/forces/strength.ts`): a force set larger than its Power's own size keeps its reach and acts in
  proportion (`strength`: 1 at Power 100 and at Power's own size, the square root of the natural share at Power
  0). A tempered force still moves every tile it reaches by at least a level: Power scales how deep, never whether
  (D356). At the largest Size, Power 0 is the gentlest effect that still shows; `tests/contract/forcePower.test.ts`
  holds each force to at least 9 tiles changed, at most a quarter of Power 100's change (a Slide 30%), at most 4
  levels deep, and a change growing across Power 0, 50 and 100.
- **Stored literally:** a force's run is one `forceResult` operation, stored literally, one undo step; Try another
  replaces it (§ The map document).
- A forces release goes to the preview first and reaches the public site only once Kyler has tried each force
  (D219).

### The forces

- **Carve** (D194, D199, D216; key 7): a click unleashes a river that finds its own way downhill; a drag draws its path
  (the water runs from the line's higher end to its lower, cutting through rises to keep flowing, D289; kept a tile
  every two along it and steered along a smooth curve; at Wander 0 it follows the line, higher it meanders round it;
  `where.path`, kept by Try another; a carve drawn uphill is shown the way it was drawn, D344 A5). **Power** (creek to
  catastrophe), **Size** (width; depth follows Power and the width). Wander and walls come from the land and the seed,
  with natural variation (bends wider and deeper on the outside); a cut-off bend becomes an oxbow lake sealed by
  sediment. Behind More: **Canyon depth**, **River depth** (D321, item 17: how deep its water may be, 1 up to the
  height ceiling or **Off**, 2 unless set; where the water would pool deeper over the cut ground the bed is raised
  under the pool's spill level) and **Banks** (item 18, Auto: 0 to 10 tiles of flat land each side of the river
  before the walls, wider inside a bend, at the river's waterline, the bed below them by the river's depth, at least
  two levels; moist for crops and may flood when the river refills, D307; `core/forces/carve/river.ts`). **Keep
  river** (default) leaves a source group at the origin (D314, `core/water/sourceGroups.ts`: a row across the heading,
  fewer where cramped) whose total strength follows the river's Width, not its Power; **Dry canyon** leaves none. A
  source row at the map's edge must flow into the map (D321, item 27: `core/water/edgeSources.ts` keeps what leaks
  with the run, `edgeLeaks`; the fix, M9b's edge lip, plugs into `EDGE_LIP`). Space pauses it. An oxbow lake holds its
  water behind its sediment and evaporates when nothing feeds it (the quiet dot settles once the rest of the water
  has, D222). Fresh volcanic rock (Erupt's) is hard for it.

- **Unleash, on a source** (D239; U): select a placed water or badwater source and a small **Unleash** action with
  a quick **Power** sits beside it; the source's own water carves its course downhill with Carve's engine (where it
  stands in a pool of half a level or more it breaks out over the lowest point of its rim). A drag from the source
  draws the course (D321, item 41; the source's own drag still moves it); its width is the width whose Carve source
  would have the source's strength. The source stays the river's origin: the carve is dry and adds no other source;
  a badwater source carves a badwater river. One undo step ("Unleash a source"); Try another re-rolls the course.
  Claude's `carve` step takes a `source` to unleash one.
- **Craterize** (D202; key 8): a giant impact. A click strikes; so does a press and drag, once, where the press
  began (D368 (7)). **Power** (a pebble to a cataclysm), **Size**, **Try another**; walls (steep or terraced),
  centre (bowl, peak, ring or flat), debris (light or heavy) and rays from the land and the seed. A streak falls, a
  flash, a shock ring, dust and thrown blocks (the camera never shakes, D265), the bowl opening at once and the
  debris landing ring by ring; trees inside the bowl are gone, those round it are knocked down (dead, standing
  upright where their ground held, gone where the blow broke it: D321, item 7). Newer impacts overprint older ones;
  heavy debris can dam a river; it strikes wherever aimed (the start's ground too, D257) and never adds water.
- **Quake** (D203, D219; key 9): splits the land along a fault drawn freehand (D327): **Lift** or **Slide**;
  **Power**; **Try another** (another tilt and crack). **V** flips the side that moves, even while painting; its
  scarp (sheer or stepped) comes from the land and the seed. Lift raises along the curve and shows its whole
  result as it is painted, kept when let go; Slide shows the fault while it is painted, then its block slides
  along it, 2 to 20 tiles (D361 (3)), the way the drawn line runs there, and a river that crossed the fault is
  joined again along it. A crack runs along the fault and dust rises at its head. Objects ride with the land (a
  rigid one on flat ground of its own), trees on the fault go (D321 item 7), the start is carried to level ground
  when its own breaks (D257); it never adds water.
- **Erupt** (D206, D216, D226; key 0): raises a volcano. A click vents, a drag opens a fissure (D289). **Power**,
  **Size** (breadth), **Try another**; shape (steep or broad), summit (peak, crater or caldera), flows (light or
  heavy) and ridges from the land and the seed. Its terrain is final in about two seconds (D312); the lava's glow,
  the smoke and the plume (bigger and darker with Power) play on, never blocking. **A volcano always looks like a
  volcano** (D321, item 14): the cone is the dominant shape at every setting, rising to a clear summit (Summit:
  Crater, a bowl a fifth of its height deep under the rim), flows running down its sides, heavy flows a wider
  thicker skirt, never a round plateau; its surface reads as rock (no lone raised tile, the summit aside); high
  Power grows it toward the height ceiling (22, D244), and near the ceiling it spreads wider rather than taller,
  never flat-topped. Overlapping eruptions build new cones on the flanks; an eruption always completes (D226).
  Fresh volcanic rock is hard for Carve; flows can dam rivers; objects ride the rising ground, trees near a vent
  die, what stands in it goes, each as the heat reaches it (item 30); it erupts wherever asked (the start's ground
  too, D257) and never adds water; "No room to rise here" only where it can't rise at all.
- **Glaciate** (D246, D291, D292; key -): turns a valley that is already there into a glacial valley: a broad, level
  floor between steep walls stepping down by bars, a tarn in its cirque, hanging side valleys with springs and falls
  (Meltwater), scree, a moraine and an outwash plain, the river leaving by the old outlet ("Carve gives you water;
  Glaciate gives you land"). A **click Flows** (down the valleys; on flat ground a seeded way to lower ground or an
  edge); a **drag draws its path** (D321, item 41; `where.path`). **Power is how deep the ice carves, Size how wide**
  (D368 (3)): Power 100 is round 4's glacier in full; below it the plan lifts each station's floor toward a level
  under the valley's bottom (`liftFloors`, `glacierCut`: 1 level at Power 0, 6 at 50; channels and pools two more), so
  at every Power the valley is a U and its water lies in a channel or a tarn, never a sheet
  (`tests/contract/glaciateFloor.test.ts`, `glaciatePowerSize.test.ts`); default Power 60, Size Auto 30. Its row:
  **Power**, **Size**, **Meltwater** (on), **Try another**, **More** (**Benches**, **Steps**, **Tarn**, **Scree**, each
  on Auto). Two acts, the ice advancing for three fifths of its showing and melting back for two. **The floor reads as
  one river** (D292): it winds across the level floor to the falls' pools and the rivers coming in; a fall it can't
  reach, nor pass within six tiles of, stays a dry hanging valley; the game's water is run on the finished floor as it
  is planned, and if it would wet the dry floor the river bends toward the falls or keeps round 4's meander. Bound
  only by nature (D257; only "At the map floor: no ground left to carve"). Trees and objects in its path are swept;
  swept clean sources feed its cirque head, badwater is discarded; its springs come in groups as the game's own maps
  have them (D314). One `forceResult`; its ice, sounds and land keep one pace (D344, A7: `ForceCue.pace`). No ice-sheet
  mode for now.

- **Erode** (D279–D281; terrain above terrain, step 3): wind and water wear rock into caves, alcoves, overhangs and
  arches; the land decides which; every shape obeys the support rule; a click or a drawn sweep; **Power**,
  **Size**, **Try another**; two to four seconds of dust and rubble. Prototyped on `investigation/erode`, held
  until Kyler has tried the other forces.
- **The block tool** (D280 (3); terrain above terrain, step 3): precision, beside Erode's magic. Point at a block's
  face and click to add a block against it, drag to paint a layer outward from that face; remove blocks to hollow a
  cave; sized like the brushes; shows at once any block the game's support rule would drop.

### The brushes and precision tools

- **The brushes,** circle or square. Terrace is a Flatten option ("in steps"). Ramp is the shelf's **Slope** (a
  natural slope exactly where the player puts it); Smooth has no walkable option (D247) and Flatten no Ramped edges
  (D322). **Naturalize** weathers what the player paints (forces' results, strokes, rivers, set pieces); it leaves
  only what must not change for the map to stay correct: the start's pad and the ground under water sources,
  badwater sources and objects (not trees, bushes, ruin columns or slopes), worked out by the core when the stroke
  applies and recorded in it, so a replay is exact; its wear never leaves a slope joining nothing (D253, D368 (8),
  D342; a stroke saved before D368 (8) has no `weathers` flag and replays leaving protected tiles alone). It
  weathers like nature (D387 (4), D399; `raster/weather.ts`): edges, read softly, wander in and out along one
  smooth noise fixed to the map's tiles, in curves the size of Size (wider with Strength, so a strong stroke
  bends an edge by several tiles), never fraying; a cliff of three levels or more sheds into a stepped slope,
  up from the cliff's middle and down from it in steps mostly two levels tall, treads two tiles or more (wider
  with Strength, varying along the cliff where the noise says), its edges wandering: the top pulls back and
  the foot becomes an apron that runs out in lobes (where the foot is water or a stream the whole cliff pulls
  back); it sheds only so far round the cliff (taller cliffs farther, unevenly), only where the stroke
  presses, narrowing into the cliff beside it, and a slope once shed is left as it is; old land has fewer
  terraces: a narrow stretch of a terrace joins the level it borders most, whole, where that takes away more
  edges than it adds (a Size 64, Strength 10 stroke leaves no more level edges than there were); flat tops
  stay flat; little knobs and pits wear away; the effect fades out across the ring's
  outer part, so there is no seam; and painting the same spot again changes less and less. The water stays
  where it stood: from the settled water the session has when the stroke begins, a wet tile is never raised and
  a dry tile beside water never comes down below that water's surface (recorded in the stroke, `shore` and
  `pools`, with where water stood round it, `rim`). It keeps the downhill order: no tile it changes ends above
  or below all its neighbours, no neighbouring pair swaps which is higher, nothing one tile wide appears (a
  tread, ledge, wall or slot), nothing newly holds water and no way out for water closes; what would break one
  is mended or taken back. Farmland is never lost: moist ground (the settled water's moisture when the stroke
  begins, recorded in it, `moist`) keeps its height, so a cliff above it pulls back instead of burying it. It
  weathers dab by dab: each dab weathers the land the dabs before it left, only round where it presses harder
  (and edges wander only there), so a dab costs its own footprint, and the replay does exactly the same. A new
  stroke records its rule (`weathering: 3`, added by the core); a stroke saved with D399's first rule
  (`weathering: 2`, the whole stroke at once) or before D399 replays with its own rule. Pen pressure on drawing tablets sets a soft stroke's strength. Every brush's options row starts with its **Size**, a
  number and a slider up to half the map's width, so the largest brush paints the whole map in one stroke (D322,
  item 42); F held, { and } size it as for the forces (D205, D226, D368 (1)).
- **The height brushes work as the game's editor does** (D322, item 37): Raise, Lower and Flatten each have a
  **target level**, shown beside the pointer ("up to 8", "down to 5", "level 7") and as a plane over the ring.
  Raise lifts every tile below the target to it and leaves higher ground; Lower cuts every tile above it down to
  it; Flatten sets every tile to it, higher or lower. They act exactly, with the brush's footprint and hard edges;
  holding adds nothing. Until the player sets it, the target follows the ground under the pointer (a level above
  for Raise, below for Lower, the same for Flatten) and locks where a stroke starts. **Shift+scroll** changes it
  (0 to the height ceiling), **Ctrl+click** on the land takes its level (on water, the bed's), and the row's
  **Level** list sets it; once set it stays until the tool changes or Esc. Past either end of the range Raise and
  Lower are **Free**: they sculpt softly, building up as the player paints. Smooth and Naturalize stay soft;
  Shift+scroll, F held with the wheel, or [ and ] set their strength (Raise, Lower and Flatten take nothing from
  those: their target level is theirs). Tooltips name the game editor's terms. Under a layer cut (D207) Raise stops
  at the cut. An exact stroke's tiles stay as it leaves them (the integrity pass leaves them out).
- **Ground, Water and Both** (D322, item 2): every brush's mode. **Ground** changes only dry tiles and never lowers
  a tile beside water below that water's surface; **Water** changes only the wet tiles (those drawn as water); **Both**
  (default) changes everything. Which tiles are wet is fixed when a stroke starts, from the map's own water (never a
  drought's or a badtide's). In Both, a Lower stroke that starts in water still carves a flowing channel (smart
  Lower, §5). Inside an open selection the mode applies within it.
- **Sources: Ride · Keep · Clear** (D322, item 31; D249): in every brush's row. **Ride** (default): the sources the
  stroke passes over ride the ground like trees and bushes (a 3 × 3 source as one level piece). **Keep**: every
  source under the stroke and the ground it stands on stay exactly where they were, at the level the map showed
  (a one-tile spike the integrity pass levelled stays levelled, `keepShownGround`). **Clear**: the sources the
  brush passes over are removed in the same undo step (they glow red under the ring first), even when the stroke
  changes no ground, and their water drains at once (item 15, D260). Each brush remembers its mode and choice.
- **Precision when wanted:** the target level, straight lines, level lines, a Select tool for big shaped edits (a
  small button beside the brushes; M and Ctrl+drag still open it, D259), and live dimensions.
- **Flatten** (D204, D322): sets the ground to its target, cutting and filling, so one stroke makes a clean plateau
  with hard edges; a walkable edge is the shelf's Slope. A quiet "the start fits here" hint when the area is big and
  flat enough for the district center, and a stronger one when the start requirements would also hold there;
  trees and objects ride the ground.
- **Hills, plateaus, ridges and valleys come from the brushes,** not buttons.
- **Delete** (D288, D323 items 1 and 44; there is no Remove tool): Delete removes what is there, never silently:
  objects and sources first, the start included; where only ground is left, its top block, one level down (under
  water, the bed's top block), for a single hovered tile or a whole selection, one undo step per press. With a
  selection open, Delete removes everything standing inside it, or the ground's top level where nothing stands;
  the Selection row's **Delete** opens a menu of what is there with counts (Everything, Water sources, Badwater
  sources, Start, Ruins, Trees, Bushes, Slopes and the rest, then Ground (one level)), hovering a choice showing
  what it would take. **The counts and Everything include what is under water** (D345, B5): a generated map's own
  trees, bushes and ruin columns stand in a lake that covers them (a tree dead, D404) and are counted as standing;
  a resource feature without the generation's record (an old document's) holds its trees and bushes under the
  water, which stand again when it drains, and those are counted too (`objectsIn`, `core/doc/inArea.ts`); a ruin field only partly inside the selection gives up just the tiles inside it (its
  `cleared` tiles, D360 b). With no selection, Delete takes what the pointer is on: a source within its targeting
  range (D249) first, else the objects on the tile, else the ground. **Ctrl+A** or **Whole map** selects the whole
  map. The water the removed sources fed drains as its cause is gone (D260). **Clear everything** in the ⋯ menu
  removes every source, badwater source, tree, bush, ruin, object and the start in one undo step, leaving the
  terrain. A map without a start is allowed while editing: it saves as a project, the checks dot says "No start",
  and only Save to Timberborn and Download .timber refuse ("Place a start first: pick the Start on the shelf").
- **Heights** (D244, after the Ceiling probe batch ceiling-20260927): one ceiling on every map, D172's tall maximum
  (22, `CEILING` in `src/core/format/world.ts`), for the brushes, Select's Level number, the forces and the
  integrity pass, with nothing about it in the interface. A map whose land goes above 16 is a tall map: its
  description ends with "Timberborn's map editor opens and saves this map as it is, but can't raise land above
  level 16." and it is exported and validated as tall; back at 16 or below it is a standard map again and the note
  goes; a map that needs no change keeps its description byte for byte. A generated map's description notes tall
  land in its own words ("The land rises to level N: the game's map editor edits only up to level 16."), never
  doubled, and its sentence follows the land's top level when edited (D341). Generation is unchanged: the
  generator's Verticality and Real places' standard or tall option decide how tall a generated map starts.
- **Select** (D259): Rectangle, Freehand, **Wand** (D261: a click on land selects the ground joined to it at that
  level; on water, that river's or lake's visible water tiles, badwater included, never a bank tile; a snapshot at
  the click), **Circle** (drag from the centre) and **Brush** (paint the selection at the brushes' size); Shift adds
  and Alt subtracts. **Ctrl+click** on the land only takes that tile's level as the Level number (D361, item 7).
  **The row** (D323, item 6): the marking modes are icons; **Whole map**; **Raise** and **Lower** move the
  selection one level per click (Up and Down arrow keys too); a **Level** number (to the map's ceiling) starts at
  the selection's lowest ground with **Flatten**, **Cut down** and **Fill up** acting at once; **Select all**
  (D264: Ctrl+A); hovering any action tints the land it would change; Esc or X closes. **Max water depth** (1 up to
  the map's deepest water) raises the ground under the selection's water wherever it is deeper than the number,
  then the water re-settles (a lake keeps its surface and becomes that deep; a river ends about that deep, and the
  report says so if any ended deeper). Select's actions are exact, with hard edges; objects and sources ride changed
  ground; the start moves to the nearest valid ground only if its own can no longer hold it; each action is one
  undo step with a clear label ("Cut 4,210 tiles down to level 16"); the selection stays open until Esc or the ×.
- **The working area is Select's open selection** (D254, D259); there is no second way of marking an area. While a
  selection is open, the brushes, the forces and a brush's Clear work only inside it; everything outside is locked,
  exactly as it is, and dimmed. **A feathered edge**: a tile changes at most as many levels as it is steps inside
  the area, so edited land meets locked land a level a tile, never a cliff. To the forces, locked land is
  unbreakable rock: Carve's river turns away from it, lava pools against it, a crater's rim stops at it; a force
  refuses to start outside the area ("Outside the working area: Esc clears it"); a brush's Clear takes only the
  sources wholly inside. Water is never locked. Ctrl+drag with a brush out makes the selection, and on release the
  same brush keeps painting inside it. With a brush or force picked, the Select row shrinks to a chip ("Working
  inside 40 × 40 · Esc to clear"). Marking or clearing the area is not an edit; a stroke keeps its `area` (runs) so
  it replays exactly.

(D180, D182, D183, D184, D202, D203, D206, D216, D219, D220, D226, D249, D254, D259, D322.)


## 5. Water

Make a valley, drop a source, and there's a river.

- **Smart Lower:** a stroke that starts in or near water carves a bed that keeps flowing downhill. Its depth comes
  from strokes, never from holding (D263): a new channel's bed starts one level below the surface of the water it
  leaves (the water enters about one tile deep, with no pit where it leaves), never rises, and steps down to one
  level below the land beside it; it cuts deeper only where it must to keep flowing downhill. A stroke drawn along
  an existing channel deepens it by exactly one level. Holding only extends the river; plain Lower, away from
  water, still digs deeper while held. The brush ring turns a clear water-blue and slightly thicker, with a faint
  fill as a second cue; ordinary Lower keeps the white ring (readable over water, badwater, every ground and in
  colour-blind views, D198).
- **Water source and Badwater source** (D212): first on the left shelf. Click to place, and the water spreads at
  once; the row beneath the top bar sets the next one's strength; Ctrl+scroll over any source sets its strength
  (strong waterfalls allowed, with a friendly note past the official range); drag to move. **One strength number
  everywhere** (D361, item 6; D368 (4)): the row beneath the top bar shows the strength of the source being pointed
  at or selected, the same as its marker's label and the scroll's note, live while scrolling; in a row of sources
  it says which the scroll changes ("this source 0.25 · row 1 water/s"); with nothing pointed at, the slider is the
  next source's (`sourceStrengths`, `sourceStrengthWords`, `strengthReader`; `tests/e2e/sources.spec.ts`). A click on
  a placed source selects it and shows its strength, its water (clean or bad) and Remove; Delete (or Remove) makes
  its water recede live. A source is drawn as the game draws one (D324): a stone basin with water welling up, a
  badwater source a darker stone basin with badwater boiling up, at its true 3×3 size. A source is always findable,
  even underwater (a subtle upwelling shows through the water); with a source picked or hovering near one, a clear
  marker with its strength; Markers shows every source (D196). **Sources are easy to hit** (D249): with any tool
  picked, the pointer over water or bare ground within about two tiles of a source targets it (a direct hit on
  another object wins; the nearest source wins); Delete or Backspace removes it, one undo step. **A badwater source
  cuts its own spring pool** (D290, generalised to every object by D328): it is 3 × 3 and needs level ground, so
  where it is placed, switched from clean or dragged onto uneven ground, its nine tiles are cut down to the lowest
  of them (never filled, so its water isn't dammed) and what stood on them goes, in the same undo step. Every
  placement refusal is one plain reason ("the district center stands there", "off the map"); uneven ground is
  never one (D328). Removing the map's last badwater source is never refused: the map becomes a **No badwater**
  map, a quiet line in the notices says so, the file's description and checks follow, and undo brings the source
  and the setting back (D213). A planned edit that would reshape the ground under another feature's source keeps
  off it and says why (decisions-pending #89).
- **Unleash, on a source:** see §4.
- **Water is never an object.** It is the result of sources and land: never selectable or deletable, with no river
  panel or selection. A river's flow is its sources' strength; clean or bad belongs to each source; water changes
  only through its causes (a source removed, moved or weakened, or the land reshaped). Generated maps' rivers are
  just their sources (edge inflows included) and their land. Hovering water quietly highlights the sources feeding
  it (D196).
- **Remove unfed water and Fill** (D387 (2) and (3), D394): Remove unfed water takes the water no source feeds (a
  pool the settle left in a hollow, a sealed oxbow lake, a Fill), map-wide or within a selection, and says first
  what it will take ("12 pools, 3,400 tiles of water"); a pool with a tile in the selection goes whole, and fed
  water is never touched. Fill fills a hollow with standing water to a chosen level, with no source, and says
  roughly how long it will last; it is refused with a plain reason when the hollow doesn't hold water at that
  level. Each is one undo step. Their engine and questions are in the core; where they sit in the page is agreed
  with the page session (D388).
- **Seeing underwater** (D196, D212): while a brush is over water already there, the water under and right round it
  turns clear, so the bed, ledges and sources show; working on dry land leaves the water as it is. T (the game's
  key) or **Clear water** makes all of it clear. Clear water still reads as water (a faint blue tint, ripples, a
  soft bright shoreline); badwater stays clearly distinct when clear (its own darker crimson, dull troughs and slow
  bubbles; never a hatching, D324), for colour-blind players too, by lightness. Sources can go anywhere in the
  editor; the "only where water begins" rule (D171) is for generated maps.
- **Lakes, waterfalls, joins and branches emerge from the land.**
- **Water flows visibly,** and the land greens along new water. It reacts at once: water near an edit starts moving
  within a frame or two, the rest of the map follows, always at one brisk pace (D197, D268): small edits settle
  nearby in a second or two, big changes (a new river, a breach) still flow visibly. The water bar: the status,
  Pause, Skip (straight to where it settles), Replay, Drought and Badtide; no speed control there (D268).
- **Drought and Badtide, day by day** (D267, D268): clicking one shows the hazard's last day at once (with progress
  while it's worked out); clicking again returns to the map's own water. While one is shown, a day strip on the
  water bar runs from Day 0 to the last day: previous and next, a click on any day, play, and **Speed** (slower,
  normal, faster, instant; it appears only here). Stepping animates that day's water at that speed; Instant jumps
  and stays; nothing reverts on its own. A length of 1 to 30 days per hazard (defaults drought 9, badtide 8),
  remembered. The start's water is highlighted, and the strip marks the day it leaves a pump's reach (or, in a
  badtide, the day badwater reaches it or its farmland); hovering any water says when it dries or turns bad. Any
  edit while a hazard is shown ends the view at once (D269). The game's weather rules, unchanged. The Weather
  step's summary and map-card lines build on these buttons (D133).
- **Optional water sounds,** our own. **What you watch is what you'll play:** the final water always matches the
  game's settled result.

(D180, D181, D184, D186, D194, D196, D212, D216, D222.)

## 6. The look

Two looks (Map look 2, D147, D242, D250, D284):
- **Standard**, the clean game-like view (D135): contaminated ground as a layer over the ground (D154), the mine
  sites and ruins (D178), the approved badwater in one shared water palette (D177); waterfalls leave the lip and arc
  into the pool as one sheet, with foam at the lip, whitewater and a splash where they land (soft white water, never
  cells that read as cracked tiles), and a small fall at each step of a cascade (D201, D215, D222).
- **High**, the same view finished further: water coloured by depth with clear shallows, fine crests and flecks
  moving with the flow and crimson matte badwater over its poisoned bed (#38); soft shadows, warm sunlight, ambient
  occlusion, a colour-preserving tone curve, distance haze, sky, rock strata and soil edges (#65); trees and bushes
  swaying in the wind, also on the shelf's icons and the placement ghost (#66, D241); and the map's edge cut through
  rock with a soil cap and the water's section, continuous waterfall crowns, irregular landings with froth, mist and
  splash rings, rough water below falls (#67). #67's visible seasons wait for the Drought and Badtide day-by-day
  view (D286 (4)).

In both looks the water moves with its real current (D353): the surface's textures run downstream, faint foam
threads follow the current's lanes, wakes curve off a bank where it opens or narrows in fast water and a seam marks
where two currents join, all gone where the water is still. The **Flow** view (off by default) adds a few glowing
streaks travelling down those lanes, fast water's longer and brighter, badwater's dim embers; until the page has
its switch, `?flow=on` in the address turns it on.

Both follow Timberborn's references (D334): dry earth a warm brown drifting to mauve, grass a muted green meeting it
along the tile's edge with a slight painted wobble and a thin darker rim, olive-grey stone, bright orange ruins with
cream sacks, contamination as the game's sparse orange-red veins, falls teal with lighter streaks. Readability is the
game's own: its look and its cues, with no lightness gap or pattern beyond them (D334 (2)).

High is the default where the computer draws it smoothly: it starts in High (or where it settled last time on that
GPU at about that window size), watches what each frame costs the GPU, steps down by itself to a lower-cost High
(no soft shadows, mist, rings, wind or fine detail, far tree models, 85% of the pixels) and then to Standard when
frames stay too slow, and never back up in a session. The **Look** menu (on the 3D view; in the editor's header)
chooses **Automatic**, **High** or **Standard**, and switches High's four parts; every effect is switchable too
(`setHighEffect`). A browser drawing in software keeps the light look, with no choice. The camera never moves by
itself in either look (D265).

## 6a. Alive, not mechanical (D240)

Visual only: the final map and water are exactly as they would be without it. Every animation is short, never
delays the next action, switches off with reduced motion, and is synced with the sounds: raised blocks grow up with
a tiny overshoot, lowered ones sink and crumble with dust, a stroke ripples outward from the brush's centre; the
water surface glides between states, with a thin line of foam at its front; Generate reveals the new map in about a
second and a half (a click skips to the finished map); placed trees and bushes pop in, removed ones topple or
shrink, undo plays the change quickly in reverse, Save to Timberborn ends with a small send-off. GPU and shader
effects where possible, never per-tile work on the main thread, particles and pops capped, effects scaling down on
weaker hardware rather than stutter. (The full list is in the archive.)

## 7. Controls

Like the game: WASD and the arrow keys move (Shift moves faster), Q and E rotate, scroll zooms, Alt+scroll slices
the visible layers from the top down, Alt+click jumps to a tile's layer (again on the same level returns to ∞), and
T toggles clear water. 1 to 5 pick the brushes, 6 the Water source, 7 Carve, 8 Craterize, 9 Quake, 0 Erupt, -
Glaciate and M Select.

- **Z undoes, C redoes and X puts down whatever is held** (D345, B7): a brush, a force, the shelf's object, the
  selection, a picked source or object, leaving Select in hand (§3), which picks **every object on the map**
  with a click (D360 a: trees, bushes and ruin columns too, and sources and the start by their own grabs) and moves
  it with a drag, one undo step each (Esc puts a drag back). A quiet highlight shows exactly what will be picked,
  and a bigger object wins over a tree or a bush under the pointer (`core/features/objects.ts` `isPickable`,
  `pickWinner`); a slope is not picked. Ctrl+Z, Ctrl+Y and Ctrl+Shift+Z work too; none act while typing in a field.
- With Quake picked, **V** flips the side of the fault that moves. With a selection open, Up and Down raise and
  lower it one level (the camera keeps W and S). Delete removes what the pointer is on, or what stands in an open
  selection, else the ground's top level (D288, D323); Ctrl+A selects the whole map. In Select, **Ctrl+click** on
  the land only takes its level (D361) and **Shift+scroll** dials the Level number (D345, B8), whether or not a
  selection is open.
- While a force runs, Space pauses it, Ctrl+Z (or Z) takes it back, and Esc skips it to its end (a painted Lift
  still drawn: Esc cancels it; D344, A4); the other keys wait, C among them. A river's or a fault's line is drawn
  freehand with the mouse (D321). Slow forces is a view-bar toggle with no key.
- **When the window loses focus** (D361, item 5) the editor lets go of everything held: every camera key and
  Shift's speed, F's sizing (kept), and any stroke or gesture in progress ends as a released mouse button would
  end it, at the pointer's last place (`render3d/focusLost.ts`).
- **One key habit for every tool** (D368 (1), (11); `keyHabit` in `forceSize.ts`): F with the mouse, and { and },
  set the Size; F held with the wheel, and [ and ], set the strength (a force's Power, Smooth and Naturalize's
  strength; nothing on Raise, Lower and Flatten, which have a target level instead); the number shows beside the
  pointer; hold F and move the mouse to resize live, let go (or click) to set it (D344, A1). Plain scroll still
  zooms; Shift+scroll sets Raise, Lower and Flatten's target level (D322) and Smooth and Naturalize's strength,
  Ctrl+scroll a hovered source's strength, Esc backs out (a target set by hand first). Quake has no Size. U
  unleashes a selected source (D239).
- Ctrl+Shift+1 to 9 saves a camera bookmark (position, angle, zoom), and Shift+1 to 9 glides back to it; bookmarks
  are saved with the project. Every tool is reachable by keyboard, with labels for screen readers. (D180, D184,
  D196, D205, D212, D219.)

## 8. The generator, Claude and the first run

**The page is the editor** (D330; [docs/UI-BRIEF.md](docs/UI-BRIEF.md), as Kyler reshaped it on the current editor's
skeleton, DESIGN.md): one window with no step between making a map and shaping it; the Maps drawer holds the map
as a whole (the settings, what is on it, Your maps) and the rows over the map hold the land; Generate runs
only on its button. **Edits never replay onto new land** (D336): every Generate makes a new map, at any size or
setting; an edited map stays in Your maps, one click away (D234). Decided and not yet built: the candidates strip
(the versions, checkpoint 2).

**As built today:**
- **Generate always makes a new map** (D323, item 20): every press rolls a fresh seed, shown in the box; typing a
  seed pins it (a small lock beside the box) and Generate then makes that map again until the player unlocks it or
  clears the box; opening a share link pins its seed. Generate waits while a map is being made; the map open stays
  editable meanwhile.
- **Every map opens in the editor at once** (D330): a new map replaces the open one without asking, and the one it
  replaces stays in Your maps, its row in the drawer bringing it back (§3).
- **Claude (M12)** is a small chat box summoned with a key, which disappears when done. Many players won't use it,
  so it never takes permanent space. Claude steers the generator for character and uses the tools only for precise
  edits (D139, D187). The design is deferred (Part 2).
- **First run:** three one-line hints (paint the land, place things, add water), then never again.

## 9. The future

3D carving is Erode (the magic) and the block tool (the precision), not smarter Lower and Raise (D279–D281). A
time-lapse of how a map was built is in ROADMAP's "Later" (D285 (4)). Every future editing tool is brush-first and
follows these principles (D179, D182).

## 10. What's gone, and must not come back

<!-- retired-terms:allow -->
The landform tools and their handles, the river and lake tools, the Channel tool, the separate plant brushes, the
Remove tool, Terrace and Ramp as brushes, precise mode and hold-to-dig, Flatten's ramped edges, the Show dropdown,
the Advanced checkbox, the four text tabs, the health pill, the legend always beside the map, the busy readouts,
the stamp library, symmetry, regenerate-an-area and locks, the Dam sites, Moisture and Drought views, waypoints and
the aim arrow, "Generate, keeping my edits" and a rebuild that keeps edits, and Claude as a panel. The superseded
table, each with the decision that replaced it, is in the archive; `tools/retired-terms.json` names them and CI
flags them if they reappear anywhere else (D188).
<!-- /retired-terms:allow -->

# Part 2: the technical reference

## Working rules

- Editor work follows `ROADMAP.md`, one step at a time; each ends with its checks passing and a short progress
  entry. Record deviations and decisions in `PLAN.md` §20.
- The editor must never export a file that breaks the game. Load problems block export; playability and design
  problems show on the quiet dot and never block it. The classes are defined in `PLAN.md` §19.5.
- In-game checks are logged in `docs/archive/ingame-log.md`; a DGM Probe batch plays maps in the real game only
  after Kyler's yes in chat, every time (`PLAN.md` §20, D117; `CLAUDE.md`).
- Everything works without Claude. Claude is an add-on.

## Non-goals

- Voxel-level cave and overhang editing, until terrain above terrain's step 3, "Creating them" (`ROADMAP.md`,
  "Terrain above terrain"; `PLAN.md` §20, D118, D125, D279–D281). Until then imported caves and overhangs must be
  preserved and exported unchanged, together with the water the file stores under them, and the tools edit
  surface height only. The data model stores terrain as runs per tile from project format 3 (D119), so voxel
  editing needs no format change.
- Terrain above the map's own limit: 16, or 22 on tall maps (`PLAN.md` §20, D172; §5.9). The tools keep to the
  map's limit (D123), and imported maps with terrain up to 22 are preserved.
- Multiplayer starts, for now. Timberborn 1.1 keeps exactly one StartingLocation per map. Fair multi-colony maps for
  Kyler's Timber Together mod are a later goal (`PLAN.md` §20, D5): the spec and feature schema keep room for them
  (`MapSpec.colonies`, `start.player`), and the editor's data model must not assume a single start forever.
- Accounts and server-side storage. Real-time collaborative editing is planned peer to peer, with no server (`docs/COLLAB-BRIEF.md`, D349, D362); nothing of it is built before its milestone.

## The map document

The shared parts (spec, features, set-piece builders, ids, validation classes, format I/O, determinism and the build
order) are defined once in `PLAN.md` §19; this section adds what only the editor needs: the document's structure,
the operations on it, and how it is kept.

```
MapDocument {
  formatVersion
  generatorVersion  // the generator that built `base`
  spec              // MapSpec (PLAN.md §19.1), or null for imported maps
  base              // built from spec, or parsed from an imported file; stored in the project file, never mutated
  field             // a generated map's field (format 3): heights, solid runs, the features it holds, its ramps
  features          // parametric feature objects (PLAN.md §19.2)
  edits             // ordered list of edit operations
  meta              // name, description, designedFor, timestamps, app version, import report, camera bookmarks
}
```

**The generator's features are its plan, not editing objects.** The document keeps them (`PLAN.md` §19.2) so the
analysis and Claude's steering can use them; the editor does not show them as objects with handles (D182, D184):
the player shapes the land with the brushes and places things from the shelf. Saved projects that hold landform
features from before D182 open with their land exactly as it was, as plain terrain.

**Building the final map:** the one build pipeline in `PLAN.md` §19.8. A generated map starts from its stored field:
the rivers, natural lakes, badwater hollows and rises read back out of it are the field's own, so the build marks
their channels and leaves their ground; one the player has changed is built as it now says. Every step is
deterministic, so the same document always produces a byte-identical `.timber` file; changing a feature's
parameter rebuilds only the area it affects, and that incremental rebuild must equal a full rebuild (`PLAN.md`
§19.7).

**Edit operations** are small, serializable commands with undo data, in one envelope `{op, params}`
(`core/doc/ops.ts`, `ops.schema.json`; the validation report's fixes use the same envelope, D35): brush strokes,
placements and moves, source changes, removals, the Select tool's actions, and forces' results. There is no
settings change among them (D336). Operations validate their inputs against the schemas and reject invalid ones
instead of clamping silently. Every stroke replays exactly onto its own land and survives format 3, because a
stroke records the options it used:
- A Lower stroke that starts in or beside water records `channel` (smart Lower) and how deep it may cut (D263): a
  new channel its `bed` (one level below the surface of the water round its first dab, never below that water's own
  bed) and `dry`; a stroke that never leaves the water it began in is a deepening pass (`deepen`: a level off what
  the brush's middle passes over, once). The bed never rises along the stroke, so the replay carves the same bed.
  Strokes saved before D263 keep their old start and replay exactly.
- Also recorded: the brush kit's options (`square`; `target`, D322: Raise, Lower and Flatten exact with hard edges,
  a stroke without one is soft, Free; `mode` with the tiles that were wet when it started and, for Ground, the
  banks' levels, `wet`, `bank`; `sources: "keep"` with its `keep` runs; the tiles a layer cut keeps; the pieces
  that ride whole, `rigid`, a 3 × 3 badwater source's rectangle taking its middle tile's level, D249; the working
  area it was painted in, `area`, D254: runs, feathered; `steps`; a pen's pressure per dab). Strokes saved before
  D322, D270 or D247 (precise or ramped strokes with their `slopes`, Smooth's walkable flag, soft Flatten's level)
  replay exactly (`tests/contract/strokesBeforeD322.test.ts`).
- A source's strength changed in steps (a slider, Ctrl+scroll) is one undo step. An object from the shelf is
  `placeEntity` (a drag's grove is one step of them); the start moves, and turns with R, in one step; Delete is
  `deleteEntities`, with `removeSlope` for the slopes the build places, and never touches the ground or the start.
  A stroke with Sources: **Clear** is one step of the `brush` and a `deleteEntities` of the sources it pressed on
  (D249, D322).
- A force's run becomes one operation whose result is stored literally, so a replay assigns it and never runs the
  force again: `forceResult`, shared by the forces (D220): the force, its settings and where it acted (a record),
  then the changed tiles and their levels, the fresh volcanic rock (a bit per level), the objects that lost their
  ground, the ones it carried (a Slide), the trees it knocked down (a record only: every tree is drawn upright, D321
  item 7), a carve's source and a sealed oxbow lake's water. Try another replaces the force before it, and undoing
  it brings that one back. Projects saved with the `carve` operation of before still open and replay exactly.

The document keeps the applied operations as its log, on top of its generation (the spec, the planned features and
the stored base, D37). The log replays only onto that generation: undo and redo, reopening a project and share
links. **Edits never replay onto new land** (D336): an edit only means something on the land it was made for, so
nothing replaces a document's generation under its log, at any size or setting, and there is no rebuild with a newer
generator that keeps the edits. Generate makes a new map beside the edited one, which stays saved and one step
away; an older map opens exactly as it was saved.

**Stable identity** is `PLAN.md` §19.4: generated features are hashed from the seed, their kind and their role in the
plan, the player's and Claude's placements get a stored UUID, entities are hashed from their owning feature. Edits
referencing them survive other edits wherever the referenced object still exists; when it disappears, the edit is
flagged as orphaned and shown, never silently dropped. When terrain changes under an entity, the entity snaps to
the new ground if placement stays valid; otherwise it is flagged with a fix option.

**Working representation.** Surface heights and entities are kept in typed arrays. A voxel override layer preserves
imported caves and overhangs: columns with more than one solid run are locked to the brushes and exported
unchanged, until terrain above terrain's step 3. After every terrain edit the instant checks re-test terrain
support (the game deletes voxels more than 3 tiles sideways from support, and the objects standing on them).
Dirty-region tracking lets rendering, validation and the water preview update only what changed.

**Persistence.** The project file (`PLAN.md` §19.6) download and upload; Your maps in the browser (D234;
`platform/yourMaps.ts`, IndexedDB), guarded against storage failures, recovering the open map on reload (D44); `.timber` export through the `export` validation profile. Re-importing a `.timber` file bakes everything into
a new imported map.

**Undo and redo** run over the operation list, with periodic snapshots so undo stays fast on 256×256 maps. The
history is visible as a list the user can step back through. Undo never crosses from one map to another: each
document keeps its own land (D336); when UI-BRIEF §6's undo brings back a replaced map, the page opens that map
afresh, with a view built for its size.

## Checks and water

The editor reuses the generator's validation modules unchanged (one source of truth for what "valid" means), run
with the `export` profile (`PLAN.md` §19.5, §11). An imported map's own problems, the ones it had when it was
opened, are listed but never blamed on the player's edits and do not block its export (`PLAN.md` §20, D43).

- **Instant checks** after every edit, on the dirty region: footprints, ground support, overlaps, start area,
  limits, slopes, terrain support. **Background checks** in a web worker, debounced (0.7 s) and cancelled when a
  newer edit arrives: water simulation, reachability, resource totals, moisture reach, drought survival.
- Issues have a severity, a location and a plain-language explanation. They are listed from the quiet dot, each
  highlighted on the map; clicking one flies the camera to it. **Error** (load class): the file would crash the
  game, lose objects on load, or start without beavers; export is blocked until fixed. **Warning** (playability or
  design): a flooded start, no water nearby, a map above height 16; it shows on the quiet dot and never blocks
  export; the warning is noted in the map description.
- **Edge walls warn on an edited map** (D323, item 12; D151 still holds for the generator and Real places):
  `terrain.edge_wall` is a warning on the quiet dot, never a block on a save, with the one-click fix **Lower the
  wall** (the outer tiles cut down to the land inside, one undo step; `lowerTheWall` in
  `core/validate/checks.ts`). The session's checks run with `editing: true`; generated maps and the Real places
  conversions do not, so they still guarantee no walls.
- **Only the player places objects** (D368 (10)): no force, brush or editor action, and nothing one of them triggers,
  ever adds a Slope or any other shelf object; the editor repairs nothing by placing. Slopes are derived once, at
  generation (`placeSlopes`, before the land is shown); an opened map's document keeps the generation's slopes in its
  stored map (`BuildInput.generatedSlopes`, `features/slopes.ts` `keptSlopes`), and every rebuild after an edit keeps
  those that still stand (the high side one level up, the tile behind at their own level) and loses those an edit
  took away, for good: the build checks them after every edit in order, so a later edit that gives the step back
  never brings one back (`TerrainCache.slopeGone`); it never derives again. The generation's trees, bushes and ruin
  columns are kept the same way (`BuildInput.generatedResources`, `raster/resources.ts` `KeptTiles`): only those
  the generation placed stand, and the water and moisture under them never take one away or bring one back; a tree
  or a bush is marked dead or alive from the ground under it, dead where it is dry, flooded or contaminated, as the
  game's editor does (D404). A Flatten that floods a grove and a Lift that drains it leave the same trees. What
  holds ground can move on, so nothing is kept from standing by what merely stands there now: the objects a force
  carries leave their ground together and land where it put them, one it put down on the start or on a slope the
  build keeps is listed as lost (`forces/result.ts` `literalOf`), and moving the start removes the generation's
  objects under it in the same step (`doc/tools.ts` `startClears`). `tests/contract/editSequences.ts` runs every
  brush and force in sequences and fails on any new object id (a few every run, every theme nightly). The same holds for an edited import and for the start (moving it places
  nothing, and its checks predict only the slopes that stand). What an edit leaves out of reach is reported, never
  repaired: the start's walk by `start.reach`, `start.water` and the rest, a mine site the colony can no longer
  walk to by `resources.mine_reach` (advisory, on the quiet dot, only once the map has been edited), each for the
  player to fix with a Slope from the shelf or the land. Two forces place the water they make, by design: Carve's
  river its source group (D314) and Glaciate its meltwater springs (D246). A stroke from before D247 or D270 that
  asked the planner for slopes still replays exactly; a new ramped Flatten is refused (`worker/session.ts`
  `newRampedStroke`). `tests/contract/editsPlaceNothing.test.ts` runs every force and brush and compares the objects
  before and after.
- **One-click fixes** wherever a sensible fix exists: move the start to the nearest valid spot, add an outlet to a
  lake, pull trees back into moisture reach, remove overlapping entities, add a missing slope. Each fix is a normal
  edit operation, applied live and undoable.
- **Water preview:** the settled water of the port of the game's rules (`PLAN.md` §10).
  - **Exact on heightfield terrain**, which covers every generated map and most edited ones; **approximate under
    roofs** (imported caves, tunnels, overhang bridges, badtide drains): there the editor keeps the water the file
    stores, shows a "preview approximate" overlay, and does not re-simulate unless the user edits nearby. The
    tiles under roofs keep the file's water in the view and the export, every other tile is simulated, and the
    **Under roofs** view button marks them (D100); the roofed columns are never edited (D40).
  - **Steady state in temperate weather.** Delayed sources and badtide drains are off, seeps stop at 0.8 deep, and
    aquifers run only under a powered drill. Drought is shown analytically: what the basins still hold after N days.
  - **Sealed oxbow lakes** (D216): a carve's cut-off bend is a basin no source feeds; the carve stores the water the
    game settles there just before its mouths closed (`RetainedWater`), every settle starts the lake from it, and
    it evaporates as an unfed one does in the game. Its evaporation is not the water still changing (D222, D413), so
    the canonical settle stops, `water.settles` passes and the quiet dot settles once the rest of the water has;
    the lake is written with the water its carve kept (`PLAN.md` §10, §11.3).
  - **Remove unfed water and Fill** (D387, D394; `core/doc/waterEdits.ts`): water is fed where a running emitter's
    water reaches it by the simulation's flow rule (`sim/fed.ts` `fedTiles`: a wet neighbour whose floor stands
    under a fed tile's surface, a natural dam only once overtopped); every other wet tile is unfed. The question
    `unfedWater(session, area?)` counts the unfed bodies holding water over 0.001 deep and builds the
    `removeUnfedWater` operation, which stores their tiles as the water model's `drained`: once the canonical settle
    has passed, the unfed water on them is taken and the settle runs on (at most a day), and the preview and the
    carried-over water take it at once; fed water is never taken. `planFill(session, x, y, level)` builds the
    `fillHollow` operation, a `RetainedWater` as a carve stores its oxbow lake, or a plain reason (it would spill
    off the map, the level is at or below the ground); its `days` come from the game's evaporation
    (`sim/fill.ts` `fillDays`). The lakes and removals compose in log order (`sim/water.ts` `composeKept`: a removal
    takes the lakes before it; a later Fill keeps its water). A Fill is written at exactly its level: the settle
    stops once only sealed basins evaporate and stores them as they started (D413), so `days` count from it.
  - **Water changes only through its causes** (D260): after every edit that can change what water is fed (a source
    removed, weakened or moved; a stroke, force or Select action that changes where water can flow), the tiles
    whose water lost its feed on the new ground take the canonical start in the warm start (`unfedTiles`,
    `sim/preview.ts`; water the settle itself spread past that walk, a lake filling up behind a new dam, keeps
    its water), so their water drains away as part of the edit's own journey (within about a second on 128² and
    two on 256²). A removed source's upwelling, marker and strength label go the moment it is removed. A stored
    lake keeps its water only while its hollow holds it. The preview's water once it stops matches the canonical
    settle's, except under roofs.
  - **No water from nowhere** (D385): a hollow dug where no source's water and no water already there reaches
    stays dry on every path (the instant answer, the stroke's live water, the background settle, the canonical
    settle and the file); one dug beside a river, or with a source in it, fills. The warm start keeps the
    pre-fill's water on the changed ground only where a running source, a stored lake or the kept water reaches it
    (`sim/fed.ts`), and the canonical settle takes away the water its pre-fill left where none reaches (`PLAN.md`
    §10; `tests/contract/waterFromNowhere.test.ts`).
  - **Speed:** after an edit the preview re-settles from its previous state; the target is ≤ 2 s for a local edit
    on 256² (measured 1.3–1.4 s in Chrome on the slowest themes, at most 1.75 s in Node, D99). A full re-settle
    runs in the background with progress, past the first game day while the water still moves, up to the canonical
    settle's days (`PREVIEW_JOB_DAYS`), so "Water settled" means it. Speed belongs to the day strip alone (D268; §5).
  - **While a stroke is painted** (D197): the page sends the stroke's ground to the worker every frame it changes,
    the worker runs the water on it at once (so the water nearest the edit moves first) and sends each frame as
    soon as it has answered; the page meshes a stroke's water a few chunks a frame (`updateWaterSoon`), so painting
    and turning the view keep the display's rate. On release, the stroke's operation carries that water on into
    the journey; Esc drops it.
  - **Export:** the exported file always gets the canonical settle (`PLAN.md` §19.7), with a progress bar, so an
    export never depends on the preview's history.

## Claude integration (M12)

Deferred (D277): no step before M12 adds tool entries, suite requests or reference solutions for Claude; M12's first
part, when it begins, is catching Claude up to the tools as they are then. The full design as recorded (spatial
language, judgement words, query tools, steps, intent checks, the loop, compound requests, safety, and the two
delivery routes, the artifact edition and bring-your-own-key) is in
[docs/archive/editor-plan.md](docs/archive/editor-plan.md). What binds the editor now:

- **Summoned, small, steering** (D139, D187): a chat box summoned with a key that disappears when done. Claude
  steers the generator for character (it never hand-builds the map, `PLAN.md` Product principles) and uses the
  editor's operations only for precise edits; for local change it uses the forces (D256). Steps that add landforms,
  rivers, lakes or set pieces as editable objects are superseded (D182, D184).
- **Claude never edits terrain or voxels directly.** It proposes steps that the app expands into operations from the
  map document (`PLAN.md` §20, D89), as JSON matching a published schema; the app validates them, applies them to a
  preview copy, runs validation, and shows a before/after for the user to accept or reject; accepted operations
  join the normal edit list and undo like any other edit. Claude's output is untrusted input: schema validation,
  bounds checks, a cap on operations and area per proposal, no code execution, every tool checking its own
  arguments, and text inside map names or imported files is data, never instructions.
- **Platform:** one `ClaudeBridge` interface with two adapters, the Messages API (also running the request suite in
  Node) and the artifact edition's `sample` capability; the model layer is provider-neutral (D140). The standalone
  site works fully without Claude. The platform adapters are `PLAN.md` §19.9; the `src/claude/` module does not
  exist yet.

## Architecture

- **Module boundaries** (the folder READMEs under `src/core/` say where each starts): `core` (spec, features and
  rasterization, set-piece builders, format I/O, the map document, the operations engine, validation, the water
  simulation, the forces); `render3d`, shared with the generator's preview; the editor UI (`src/editor/`) and the
  page (`src/ui/`); the worker (`src/worker/`: water preview and background validation); `platform` adapters. M12
  adds a `claude-bridge` (summary builder, schema, tools, proposal loop) in `src/claude/`, with its Messages API
  adapter in `src/platform/claude/`.
- **The editor's code** (`src/editor/`, its `README.md`): `Editor.tsx` is a thin shell that builds a bag afresh each
  render and calls one hook per feature, in a fixed order, each in its feature folder (`session/`, `paint/`, `view/`,
  `sources/`, `start/`, `shelf/`, `remove/`, `forces/`, `rows/`, `selection/`, `keyboard/`, `testHook/`, `save/`);
  the markup is plain functions in `render/`, and what the viewer last used is in `prefs/`. New behaviour goes in the
  slice it belongs to; the `README.md` says how slices reach each other.
- The operations engine and feature rasterization are headless and fully testable without the UI. Determinism: the
  same document always produces a byte-identical `.timber` file (`PLAN.md` §19.7). Keep worker messages small: send
  dirty regions and compact arrays, not whole documents. Hosting: a static site on GitHub Pages under the
  timbermods organization (`PLAN.md` §2).
- **3D rendering** (`src/render3d`, `PLAN.md` §20, D45): chunked meshing (32×32 chunks) with remeshing of dirty
  chunks only; a voxel mesher only for columns with more than one solid run; instanced trees, bushes and ruins;
  picking against the heightfield and the features.
  - The shelf (D184): each object's picture is drawn once by the view itself (the object's model in the map's look,
    into a small render target), and the ghost under the pointer is the object's own model, tinted green or red; a
    source the pointer targets glows (D249).
  - The minimap (D205): the Real places top-down picture (`core/render/shade.ts`, one pixel a tile), drawn again when
    the page is idle after an edit or its water settles, never per frame. Camera bookmarks (D205): kept per slot in the
    document's meta (`views`), never an edit, taken by the autosave; a glide eases there in about half a second (at
    once with reduced motion). The game's layers (D196, D207) are one uniform that cuts the world above a level
    (terrain vertices clamped to it, the cut tops lying on it, hatched; water and objects above it not drawn; picking
    landing on the cut), stepped as the game's `LevelVisibilityService` does; under a cut the brushes and Select's
    actions leave the ground above it as it is. Clear water (D196, D212) is one uniform for all the water (T) and
    another for the water round the brush or the shelf's ghost (`clearNear`; the shared palette's `CLEAR_WATER`, D324);
    each source's upwelling (D196) is a texture of the sources' middle tiles, read by the water shader.

  - Juice (D205): a puff of dust and a source's rings are a few particles and two rings, alive for under a second;
    a placed object's pop and wiggle scales its own instance; a force's moment (`forces.ts`) plays on its own clock
    from fixed pools, at the showing's pace, never the water's speed, and none play with reduced motion or in
    software rendering. Every tree stands upright on its tile (`settleKnocked` in `core/forces/objects.ts`). The
    sounds (`src/editor/juice/`): recorded CC0 foley (24 files in `public/sounds/juice-2/`, with a manifest and
    provenance, `SOUNDS.md`), fetched and decoded on the first click or key and played by the browser's own audio
    thread (no synthesis, no worklet); one engine for the editor's lifetime, never waited on: a sound asked for
    while the bank loads, while paused or off, or past the limits (72 recordings, 20 sounds, four held beds, ten
    accents a second) is dropped, never played late; a compressor keeps every sample below 0.92 of full scale; a
    force's phases play under its run's id, so undo stops all of it at once; a sound's distance comes from where
    it is in the view. The player's volume (0.54 by default, D313) and off switch are kept as saved (`dgm.sound`).
  - The moving water (D353): the water worker adds the settle's own outflows (four a wet column) to every water
    view it sends, handed over with its other arrays (an imported map's stored outflows); the renderer works out
    the current from them (`render3d/current.ts`: net across each face, over the depth), never from the
    surface's slope, and a fall's lip pours the outflow over its side, the map's edge included (`falls.ts`). The renderer's bake worker (`bake.worker.ts`) turns it into the flow
    texture both looks' water reads and the moving water's shapes (`motionShapes.ts`: the lanes, wakes and seams as
    ready-made arrays), a quarter of a second after the water changes and at least once a second while it keeps
    changing; `motion.ts` hands them to the GPU. Only drawn: nothing in it reaches the water or a map.
  - The High look (D284; `src/render3d/high/`): the Standard shaders take the High additions only at named points
    (`materials.ts` `ShaderHooks`), and only in High's own materials, which the meshes swap to while the look is
    High: the Standard materials are never changed. High's terrain shares Standard's own uniforms (height range,
    hover, ground mode and an eruption's heat). A 2048² sun depth map (redrawn only when the terrain or objects
    change, at most ten times a second while a brush paints), ambient occlusion made in a small worker
    (`bake.worker.ts`), trees batched by species (at most 32 draws). Each effect is a uniform switch.
    The automatic choice (`fallback.ts`) reads each frame's GPU time (timer queries; without them every fourth
    frame) and a first quick reading a second after the first map.
- **The forces** (D203, D206, D220): one shared core in `src/core/forces/` (its README), from Codex's forces core
  (#59): `force.ts` (a run on its own copy of the map, a step at a time: ten steps a second of a carve, whatever
  the frame rate), the shared numbers, rock and object rules, the verbs (`carve/`, checked by
  `tools/carve-equiv.ts`; `craterize.ts`, `erupt.ts`, `quake.ts`, pinned to their 45 parity cases), the staged runs
  (`runs.ts`), the operation (`op.ts`) and its literal result (`result.ts`).
  - Carve's run is worked out whole, a slice at a time, each step's changed tiles and the objects its cut took
    recorded, then played back (`carve/play.ts`, D321), so the land is the same at any pace. Erupt fits its anatomy
    to the headroom under the ceiling (`eruptAnatomy`, D226): every level it raises scaled together so its summit
    reaches the ceiling at most, a flank vent where the vent has under four levels. Each size control follows Power
    (Auto) until set; a set size is kept in the operation's settings (`depth`, `size`). Unleash (D239,
    `carve/unleash.ts`): `breakout` finds where the water would spill over, `unleashWidth` its width from its
    strength; the operation names the source (`where.source`). The map's hidden rock is derived once from the map
    as opened; fresh volcanic rock comes from the forces' operations. What is kept is always the plan's final map,
    touched by the build's own integrity pass in the worker.
  - The editor's worker works a force out a slice a call, then shows as many steps a frame as the page asks
    (`forceStart`, `forceAdvance`, `forcePaint`, `forceStop`, `forceCancel`, `forceAgain`; no second history or water
    owner); its frames carry the ground and the objects, never water, and say once it is worked out (`planned`) how
    many steps show it (`total`) and how many have (`shown`). A staged force's operation keeps that `total` as its
    `steps` (`stagedParamsOf`, D366), so the same gesture is the same operation on a quick or a busy machine. The
    page paces them (`forceDriver.ts`, D321): Fast within `FAST_MS` (two seconds) or the force's own pace where
    quicker; Slow forces `WATCH_FACTOR` (four) times that; a frame that fails to show never stops a force, and a
    worker that fails takes all of it back.
  - **Undo at any moment leaves the map exactly as it was before the gesture, and nothing lands afterwards**
    (D341); **Esc skips a playing force to its end, and cancels a gesture still drawn** (D344, A4:
    `ForceDriver.escape`): each force the page starts is a gesture with its own name (`ForceRequest.gesture`), and
    `forceCancel(gesture)` holds the rule in the worker whatever it has reached: not started, it never starts; at
    work, it is dropped; kept already, it is taken back as if never kept, its step gone and Redo as it was
    (`MapSession.mark`, `stepSince`, `takeBack`). The driver's time is a clock it is given (`ForceClock`):
    `tests/contract/forceEsc.test.ts` presses undo, and Esc, at every moment of every force's run, in both paces;
    `tools/bench-forces.ts` times the worker's cost and `tests/e2e/forceSpeed.spec.ts` checks the showing the driver
    plans (never a busy machine's wall clock, D341). Which builds show the forces: `src/editor/release.ts` (D219).
- **"Move the start here"** (D204, one label since D323): after a Flatten stroke the page looks, once it is idle, for
  a spot on the stroke's level ground where the district center stands (its footprint and door level and dry,
  nothing standing there); the start's full check (the walks to water, wood and berries) runs in a small worker of
  its own, so the page never waits for it.

## Testing

- **Unit:** every operation and feature type applies and undoes correctly; features rasterize deterministically;
  operations serialize losslessly; orphaned edits are detected.
- **Property tests:** random operation sequences, then export, re-import and compare; undoing everything returns the
  exact starting map; an incremental rebuild equals a full rebuild.
- **Validation parity and import** are `PLAN.md` §15, §11.5 and §19.6: the editor's validation gives identical results
  to the generator's, including on all 19 official maps; every voxel-format map from the investigation (0.7 to 1.1)
  imports, renders and validates, and with no edits re-exports its normalized world byte for byte; the two 0.6
  heightmap maps import through the `Heights` conversion; the 90-layer workshop map keeps layers 0–21 with a
  warning and exports with the standard 23.
- **Performance budgets on 256×256.** Under Kyler's one rule (`PLAN.md` §20, D115) they are information, reported at
  each step; what blocks is what a player feels: the editor stays responsive, tool feedback comes within a frame,
  slower work runs in the background, and the page never freezes. Tool feedback within one frame (16 ms), with
  lightweight proxies while dragging; a feature edit committed in ≤ 100 ms; instant checks ≤ 50 ms; a dirty-chunk
  remesh ≤ 5 ms per chunk; the water preview after a local edit ≤ 2 s (warm start; CI reports it as a number,
  never a failed build, D145); the canonical full settle for export ≤ 3 s as the target (`PLAN.md` §10).
- **End to end** (Playwright): generate, edit, export, re-import, compare.
- **In-game checklist** for the milestones that need one (deferred, logged as pending in
  `docs/archive/ingame-log.md`, D11): the map loads, water settles as the preview showed, the district center
  places, beavers survive the first drought, and edited features behave as intended; the audit's checks are in
  `PLAN.md` §18 F.
- **Claude request suite** (120 requests, `tests/claude/requests.json`, with reference solutions run through
  `MapSession`): suspended with the Claude work (D277) and unmaintained until M12 begins; its description is in
  the archive.
- **Usability tasks** are dropped as a timed gate (D285 (1)); they stay an informal sanity check (add a river that
  passes near the start; add a lake that can be dammed; move the start onto a plateau and make it playable; add a
  ruin field on a hill; export the map and fix any warnings first; the full journey, generate, refine, export and
  load in Timberborn).

# Part 3: superseded

What was planned or built before Kyler's current decisions, each item with the decision that replaced it, is in
[docs/archive/editor-plan.md](docs/archive/editor-plan.md). It must not come back: §10 above is the short list, and
`tools/retired-terms.json` names the terms CI flags.
