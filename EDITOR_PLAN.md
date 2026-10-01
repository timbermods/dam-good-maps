# Dam Good Maps: the map editor

> **The yardstick for every review: [docs/PERFECT.md](docs/PERFECT.md)** (what perfect means, `PLAN.md` §20 D225).

**Read this before any editor work** (`CLAUDE.md`). Part 1 is the editor's vision, taken from Kyler's
decisions (`PLAN.md` §20: D158, D172, D179–D187). Part 2 is the technical reference that still holds.
Part 3 lists what was superseded: it must not come back. Where anything here conflicts with Part 1
or with `PLAN.md` §20, those win. The decisions themselves stay in `PLAN.md` §20; `ROADMAP.md`
orders the work.

# Part 1: the vision

## 1. The idea

A studio for creating maps. Start from a generated map or a real place, shape it like a painter, and
the water responds to everything you do. It is deliberately different from the game's own editor,
which is a precision workshop; players can still fine-tune in the game's editor if they want. The
editor is desktop-first (D185).

## 2. The principles

- **The land is the interface.** The map is the hero; the interface stays small and quiet. Feedback
  comes from the land itself: water moving, ground greening, a waterfall appearing.
- **Direct manipulation.** Everything happens where the cursor is.
- **Few tools, each obvious.** A new idea must earn a button, or make an existing tool smarter.
- **Smart defaults instead of settings.** Options stay hidden until wanted.
- **Forgiveness.** Every stroke or placement is one instant undo step, and Esc always backs out.
- **One grammar:** pick, paint or place, see.
- **Tools read intent.** Small quality-of-life tricks remove decisions the player would otherwise
  make: smart Lower, a target level that follows the ground until set (D322), clear water round a brush over
  water, sampling a riverbed on water. Whenever a player would hesitate, switch tools or do
  something twice, look for a way the tool could have known what they meant (D204).
- **Every control says what it does** (D351, amended by D361 and D368 (6)): each tool, force, option, view toggle,
  shelf item and button has a tooltip: a short phrase that says what it is for at a glance, then its shortcut at the
  end as a small key cap, never in brackets in the middle ("Carve a river" then a cap 7). No second sentence, no
  technical detail, about 60 characters at most. **One shared tooltip** shows them all (`src/ui/Tooltip.tsx`): a
  control carries its phrase as its `title` and its keys in `data-keys` (`tip("Carve a river", "7")`), and the one
  layer shows them when it is hovered, the browser's own tooltip kept back. Whoever changes a control updates its
  tooltip in the same commit; `tests/e2e/tooltips.spec.ts` fails on any interactive control without one, on any
  tooltip with a second sentence, past that length or with a key in brackets, and on a control named with a key its
  tooltip doesn't end with (`tests/unit/tooltipForm.test.ts` checks the tools', forces' and shelf's where they are
  written).
- **Things just work, and are fast.** Full frame rate on 256² maps; painting never waits on water;
  water reacts around the edit first, then the rest of the map; nothing ever freezes.

(D158, D179, D184, D204, D212.)

## 3. The screen

- **The rows over the map** (D323, item 9; structure only, the design pass styles them): four, top to bottom: the
  view bar; the tools (Raise, Lower, Flatten, Smooth, Naturalize, Select); the forces, **in three clusters by
  prominence** (D352, one list, `FORCE_GROUPS` in `TopBar.tsx`: Carve, Craterize, Erupt · Rift, Quake,
  Glaciate · Erode, Deposit; today Carve, Craterize, Erupt · Quake, Glaciate, their keys unchanged: 7, 8, 0 and 9,
  -; a force not adopted yet takes its place in the list), and the first-run hint points at Carve; then the active tool's settings and its More (no Remove tool, D288: see **Delete**
  below). **Every force's row takes Glaciate's shape**
  (D289): **Power**, **Size**, at most one signature choice, and **Try another**. Carve's one choice is **Keep river** or
  **Dry canyon**; Quake's is **Lift** or **Slide**; Craterize and Erupt have none. The gesture is the mode: a click
  unleashes a carve, strikes, or vents; a drag aims a carve or an impact, or opens a fissure. Everything else (Carve's
  wander, walls, Canyon depth and Banks; Craterize's walls, centre, debris and rays; Erupt's shape, summit, flows and ridges; Quake's
  scarp; Glaciate's benches, steps, tarn and scree) is natural variation drawn from the ground where the force acts and the seed (`core/forces/nature.ts`: rugged
  ground carves straighter gorges between steep walls and raises steeper cones, open ground lets a river wander and
  shows an impact's rays), which Try another re-rolls; the operation keeps what was drawn, so projects replay exactly.
  **A small More button, at the row's end, opens those details** (D309, amending D289; outlined in the accent colour
  with a chevron so it is clear more settings are behind it, D361, item 10): closed by default, remembering
  whether it was left open. Every detail starts on **Auto**, nature's own pick; setting one pins it, with a small way
  back to Auto beside it (the same idiom as Size's own Auto, D226). Once a force runs, a detail still on Auto shows the
  value it just took, one click away from being pinned, so the player can Try another until they love a result and pin
  what made it. Try another re-rolls only the details still on Auto; a pin is remembered with the player's other editor
  preferences, and the operation keeps the values it ran with (picked or pinned), so replay and undo stay exact and old
  projects replay unchanged. The controls themselves are the ones from before D289, brought back rather than rebuilt.
  **A long settings row takes a second line** (D345, B2: a brush's Sources, Square and Straight lines sit below its Size,
  Level and Mode), and **a tool's More opens as a compact grid panel**, not a longer row.
  The four forces are built on one shared forces core (D203, D206, D220). While a force works its row is its status
  (Carve's with Pause) and Revert; it keeps itself when it ends (no Stop, D289); the other tools wait.
  **Every force is fast, with a choice to watch** (D321, item 29; amends D266): a force is worked out first (its
  gathering shows meanwhile: a carve's surge at its origin, an impactor falling, the ground stirring, the ice gathering),
  then shown. **Fast**, the default: its land is final within about two seconds of the gesture, however long or large
  the result, and the player can act again at once; a force whose own pace is quicker keeps it (an impact about half a
  second). **Slow forces**, a toggle in the view bar beside Sound, remembered with the other editor preferences: about four
  times as long, to be watched; a click anywhere or a new gesture's key jumps it straight to its final land, kept
  as one step (undo still takes it back).
  **Esc skips, undo takes it back** (D344, A4; amends D341 (2)): while a gesture is still being drawn (a line not yet let
  go, a painted Lift), Esc cancels it, and nothing of it lands; once a force plays, in Fast or in Slow forces, Esc skips it to
  its end, its final land kept as one step; Ctrl+Z (or Z, or Revert) takes all of it back at any moment. While a force
  plays its row's hint line says **Esc to skip · Ctrl+Z to undo** (a painted Lift still drawn: **Esc to cancel**). The pace never follows the water's Speed. What is only a show (the water
  filling a new channel, the falls starting, dust, lava's glow) plays on after the land is final, never blocking.
  **A force changes things only when it reaches them** (item 30): objects, trees and sources go as the carve's head,
  the ice front or the lava reaches them; an impact changes everything at once at its moment; under a quake they ride
  the ground. The water, the water of swept sources included, stays as it was until the land is final, then flows on
  from there as after any edit (the glacier's meltwater river takes over at the end). **Nothing pops in after the
  animation** (D368 (9)): the last frame shown is the land kept and adds no more than the force's own frames do.
  Carve's river shape (its Banks and River depth, worked out once the canyon is cut) settles a few stations behind
  the head as it passes (`spread` in `carve/play.ts`); a Slide's rivers joined again and its tear show through the
  slide's second half along the fault (`extras` in `runs.ts`); `tests/contract/forcePop.test.ts` holds every force
  and mode to it in Fast and Slow forces. The result and what is saved never depend on the pace.
  **The Floor** (D321, item 40): at the end of every force's More, the lowest level any force cuts down to, 1 by
  default, up to the height ceiling; one setting shared by all the forces (set in any force's More, it holds for every
  force), kept with the player's editor preferences, never Auto (it is a rule, not a flavour), with **Default** back to
  1. Nothing a force does goes below it: where a carve, a crater, a fault or a glacier would go deeper, it runs
  shallower there instead, never stopping; ground already below it stays as it is. One implementation on the forces
  core (`core/forces/floor.ts`, lifted from Erode round 6's Floor), which Erode and Spring adopt when they are built;
  the operation keeps it in its settings when it isn't 1. The forces go to the preview first
  and reach the public site only once Kyler has tried them (D219): until then the public site shows
  no forces group at all.
  **A visible effect wherever it is used** (D356): `tests/contract/forceEverywhere.ts` uses every force the editor's way
  (Carve, Craterize, Erupt and Glaciate clicked; Quake's Slide and Lift on a short drawn fault) at random places and on
  each kind of ground (flat, water, a peak, a slope, the map's edge, beside the start), at low, mid and high Power,
  headless on fixed seeds, and fails where fewer than 9 tiles change by a level; a sample runs in the quick suite,
  every theme at 128² nightly, and `tools/force-everywhere.ts` sweeps 128² and 256². What it finds doing nothing waits for
  Kyler's decision in its `KNOWN` list (empty since D360 (1)); a force adopted later gets the same check. **Carve
  clicked at the map's edge carves inward** (D360 (1a), `core/forces/carve/edge.ts`): where its water would run
  straight off the map, the click becomes a river aimed into the map, toward the lowest ground within 60° of straight
  in, cutting through rises; its operation keeps the aim. **A Quake click makes a short natural fault** (D360 (1b),
  `clickFault` in `core/forces/quake.ts`), Lift or Slide: 10 to 22 tiles with Power, along the slope's contour (a
  seeded way on flat ground), turned and bent by the seed, so Try another varies it; its operation keeps the fault.
  **Bound only by nature** (D257): a force obeys only what it physically is and the map's physical limits (its floor,
  the height ceiling, the file format); it never refuses, stops short or reshapes its result for playability. Where it
  carves, buries or moves the start's ground, the start is carried to the nearest level ground where it stands well, in
  the same undo step; the quiet dot then says what the force left short at the start (its water, wood and berries, the
  starting-logs floor), each with its one-click fix: move the start (near the water, for water out of reach), plant
  berry bushes, plant oaks for the starting logs.
  **Clean, magic gestures** (D258): no force draws a predicted route, footprint, outline or fit on the land. A click
  (Carve unleashed, Craterize's strike, Erupt's vent, Unleash on a source) starts the force at once, finding its own
  way; **one ring at the cursor shows the force's size** at its Power and Size (D312; one ring, never two, D321 item
  13): the crater's radius, the volcano's, Carve's width (where a carve goes depends on the land), like a brush's
  ring: how big, never what shape. **Quake shows only a small marker** at the cursor, a dot, never a circle (D368
  (2)): how far it reaches is its own decision, and no force draws its reach in advance. It is drawn once, in one calm colour, where the cursor
  actually is: on the water's surface over water (the force's pointer meets the water there, not the bed below), on
  the ground elsewhere; a force's small reach still shows a small ring round the cursor. **A drag draws a line
  freehand** (D321, item 41; D327): the one way to steer, a shared piece lifted from Erode's sweep
  (`src/editor/freehand.ts`, its pen `core/forces/path.ts`): a press becomes a drawn line once the pointer moves six
  pixels, the line shows on the land as it is drawn (the player's own gesture, D258), and on release the force goes:
  Carve and Glaciate along it, Quake's fault and Erupt's fissure are it. Anything less than a drag is the force's own
  click. **Craterize is click-only** (D368 (7): a crater is one impact): a press and drag strikes once, where the
  press began, at its Size, drawing no line. **The preview is the stroke** (D361 (2),
  amending D344 A3; `bandTiles` in `freehand.ts`): a drawn gesture shows as a band along the line the player draws,
  never an area and never a ring: Carve's and Glaciate's band their width (their Size, the player's own); a fault or a
  fissure a narrow band about as wide as a fault's crack, a loop traced as its outline, nothing filled. What the force
  decides (its reach, its extent) is never drawn in advance; the ring shows only for a click. A line dragged from a
  source's Unleash stays a thin line. **A drawn shape sets the force's extent, and Size is for clicks** (D344, A6): Carve
  and Glaciate run the line drawn, end to end (their Size is their width, the band's); Quake's line is its length; an
  Erupt fissure's breadth is the breadth Power gives, never more than the shape's own span (`fissureBreadth` in
  `core/forces/erupt.ts`, the worker giving it as the fissure's `size`, which its operation keeps), so a small loop
  gives a small eruption even at the largest Size. The only word a force shows is why it won't act at all (Erupt's "No
  room to rise here").
  **Power and size are separate in every force** (D226): each size control follows Power by default, or is
  set by hand: Carve's **Size** (how wide it cuts; its depth follows Power and the width), Craterize's **Size**,
  Erupt's **Size** (breadth); Glaciate's **Size** (its width) stays 30 on Auto whatever the Power (D368 (3)); Quake's
  drawn line sets its length. Every brush's options row shows its size, a number and a slider, as well as hold F to
  resize (D226, D322). **A force's Size and Power work as a brush's** (D344, A1, A2; one key habit for every tool, D368
  (1); `keyHabit` in `src/editor/forceSize.ts`): hold F and move the mouse to size its ring on the map (a click or
  letting go keeps it, Esc or a right click puts it back), { and } step its Size, [ and ] its Power by five, the number
  beside the pointer while it changes; a Size set by hand
  is off Auto. Power and Size always read as numbers in the row, a Size on Auto as **Auto (68)** (Power's word, a
  creek to a catastrophe, is its tooltip). Quake has no Size: F does nothing there.
  **Size sets how far a force reaches; Power how strong it is within that** (D361 (1), (3); `core/forces/strength.ts`).
  Power acts on every force and mode: a painted Lift answers [ and ] while it is painted, and Try another takes the
  row's Power and Size as they are now. A force set larger than the size its Power gives keeps its reach and acts in
  proportion (`strength`: 1 at Power 100 and at Power's own size, the square root of the natural share at Power 0):
  Craterize's and Erupt's every level scaled by it, Carve no deeper than its share of 12 levels (at least 2, its
  banks included); Glaciate's Power is how deep it carves and its Size how wide, neither driving the other (D368
  (3); below, under Glaciate); Quake's Slide travels 2 tiles at Power 0 to 20 at 100. A tempered force still moves every tile it reaches by at
  least a level (`tempered`): Power scales how deep, never whether (D356). At the largest Size, Power 0 is the gentlest effect that
  still shows: `tests/contract/forcePower.test.ts` holds each force to at least 9 tiles changed, at most a quarter of
  Power 100's change in all (a Slide 30%), at most 4 levels deep (60% of Power 100's deepest; Slide, which moves land sideways,
  aside), and a change growing across Power 0, 50 and 100.
- **The left shelf:** a clean grid of placeable objects: the **Water source** and the **Badwater
  source** (two separate items, D212), then the **Start**, **Pine** (D226's order), **Birch**, **Oak**, **Berry
  bush**, ruins, the mine site, relics, slopes and the rest, each a small render in the map's look. Picking one shows a live ghost that follows the
  cursor, green where it fits and red where it doesn't (the start has three colours: **green** it fits and meets every start
  requirement, **amber** it fits but misses some, which the panel lists, **red** it cannot be placed there; a placed
  start changes colour only when something about it changed, D361, item 4), with **one label** beside the pointer (D323, item 32): the
  reason where it doesn't fit, "Move the start here" for the start where it does, "Place here" for the rest; nothing
  picked, no label. Click to place, R to rotate; **Esc or a right-click puts a picked object away** (a right-drag is
  still the camera). **Drag an object out of the shelf** (D323, item 11): the ghost follows the pointer, letting go
  over the map places it there (the start moves the map's one start), and a drag that doesn't place, released off the
  map or where it can't stand (the reason shows for a moment), always ends placement. The drag is the page's own pointer
  drag, never the browser's: only a real file dragged in from outside the page can open a file, so dragging an icon
  never offers to close the map. Drag trees and bushes on the map to paint them in natural clusters.
  **Placed objects fit the land** (D328, extending D290; corrected by Kyler 2026-09-29): a ruin, mine site, relic,
  landmark or an opened map's start placed on uneven ground levels its footprint (the start's door too) to the height
  most of that footprint already stands at, cutting what is above and filling what is below, in the placement's one undo
  step. **Placing an object never visibly spills water** (D345, B6): it never fills a wet tile, never cuts a dry tile
  below the surface of the water beside it (the level rises to that surface instead, filling dry ground, and the edge
  slopes stop at it too), and its levelling ops are exact, so the integrity pass cannot round a lone tile down beside a
  lake. A footprint that stands in water on uneven ground is refused with one plain reason ("the water is in the way:
  the ground here is uneven, and levelling it would spill the water"); one already level may stand in shallow water,
  changing nothing. The rule lives in the core (`core/features/footprintLevel.ts` `platformLevel`, `core/doc/placing.ts`
  `levelFootprint` and `levelProblem`), the ghost shows the level the worker names. It leaves other objects' tiles, caves
  and water as they are. The edge meets the land around it in short
  natural slopes (one level a tile, out to six tiles, fading so a steep hillside is left alone), never a step or a wall;
  no tile moves by more than about half the slope's height across a ruin. Water and badwater sources stay cut-only
  (D290). It refuses only at the map's edge, in a cave and on another object's tiles, with one plain reason. A
  generated map's start already levels its own bench. A placed source starts at the game's own default strength
  (D323, item 46: 1 water/s for a water source and 3 for a badwater source, the `DefaultStrength` of the game's
  blueprints, both among the official maps' strengths); the strength can still be changed.
  **Scatter-type items place like a brush** (D235, as in Cities: Skylines; scheduled after the forces round 2): trees,
  bushes, ruins, thorns and the like show a brush circle with the terrain brushes' grammar (F or { and } to resize, [ and ] its density, the
  size in the options row, strength as density from a sparse scatter to a dense grove); dragging scatters that exact item
  naturally inside the circle, random, never overlapping, only where the game allows it (a ruin stroke paints a ruin
  field with varied heights and mixed models); painting over objects fills gaps up to the density, never stacking;
  trees and bushes on dry ground tint the brush amber with a quiet "dry ground: these will die" (still allowed); trees
  have an **Age** option, Grown (default) or Mixed; a quick click or the smallest size places exactly one; each stroke
  is one undo step, and Select and Delete clear them (D288). Unique landmarks stay single-placement: the start, the mine site,
  relics and geothermal fields.
- **The view buttons** (D287): one **Top-down** toggle (lit while the view looks straight down, off for the usual
  orbit), Reset view, Height colours, **Level lines** (beside Height colours, D248: a thin line wherever the ground
  steps down a level, off by default, whatever tool is picked), Markers (the sources and the slopes), Clear water and
  the overlays, **Badwater** and **Under roofs** (where the map has roofed water). The legend appears only while an
  overlay is on. No dam site is drawn on the map or named on the map card: Timberborn has no dam sites, and ours were a
  heuristic of straight lines; the analysis stays internal (the generator's measures, the checks). The land shows
  moisture itself, and the water bar's Drought shows a drought day by day, so there is no Moisture or Drought view.
  **Slow forces** (D321, item 29), beside Sound: the forces played out slowly; off, Fast. **The level control** (▾ ∞ ▴, D345
  B3, as in Timberborn's own editor) and the compass are **one tidy cluster** at the top right (D368 (5)): the compass
  in the corner, the level control beside it on its line, centred with it and the same height, larger and easy to
  see; **Slow forces** (D361, item 8: it was Watch) and **Sound**, a speaker icon crossed out when muted, directly
  beneath, Slow forces from the level control's left edge and Sound square under the compass to its right edge; one
  height and one gap throughout (`tests/e2e/viewAndHeader.spec.ts` measures it to a pixel), the volume opening
  beneath the speaker; the view bar keeps the rest. **Every camera view frames the whole map, centred in the
  map area** (D345, B1): the default view, Top-down and Reset view fit the map's corners inside the canvas with a margin
  and put its middle at the canvas's middle, whatever the window's size.
- **The water bar's status is the worker's real state** (D345, B14): every update the worker answers with carries
  `waterSettled` (no settle is running for it); the page begins a water journey only when it is false, and reads
  "Water settled" at once when it is true, so an undo, a redo or an edit that leaves the water as it is never leaves
  "Water flowing… 0%" waiting for frames that will not come (`WaterPlayer.settled`, `tests/contract/waterStatus.test.ts`).
- **The minimap** (D205): a small top-down view of the whole map in a corner, refreshed after edits
  settle, with an outline of what the camera sees; click or drag on it to move there. On by default
  for 256² maps, off for smaller ones, with a toggle among the view buttons.
- **Juice** (D205, D220, D226): small satisfying feedback on every action (a soft thud as land
  rises, a puff of dust when it's lowered, a pop and a wiggle when something is placed, a splash when
  a source starts, each force's own moment). The sounds are Codex's second round (#64): recorded CC0
  foley with a crisp, musical reward. A brush's recorded bed for as long as its stroke changes the
  land (packed earth for Raise, loose stone for Lower, a mineral scrape for Flatten, leaves for Smooth
  and Naturalize); an accent for each thing placed by its material (hollow wood and leaves for a
  tree, damped metal for a ruin, heavy timber for the mine site, a splash and bubbles for a source,
  murkier for badwater); an earth puff for a delete; a reversed wooden catch for undo; and each force's
  own, phase by phase (a torrent for Carve; a breath, a crack, a boom and falling stone for
  Craterize; a fault's crack and grind for Quake and its Slide; pressure, a roaring plume and a
  cooling hiss for Erupt). Repeating an action climbs a small pentatonic ladder (to a fifth) and
  resets after a pause; a held stroke rises gently. On by default at the mix's own clearly audible
  level (D226), limited and never harsh, with a volume and an off switch the player keeps (D212);
  water ambience is off unless turned on. The recordings load on the first click or key, never with
  the page, and nothing waits on them. Micro-animations follow the reduced-motion setting. Nothing
  new stays on screen unless in use.
- **Visible layers, identical to Timberborn** (D207): a compact layer widget with the view buttons,
  showing the visible level (∞ when everything shows) with up and down arrows, quiet at ∞ until used.
  Everything above the chosen level is hidden (terrain, water, objects) and the cut surfaces show as
  the tops of what remains. The layer pick (Alt+click) slices to a tile's level, and again on the same
  level returns to ∞. Brushes and placement act on the visible land, never on hidden terrain above
  the cursor. Esc never resets the slice; the widget's ∞ does.
- **The hover readout:** a quiet corner line for what's under the cursor ("Height 11, dry soil"); over
  water, its depth, the bed level and its contamination (D196). **It names every object and plant too**, with its key
  fact where one is useful (D347, B11): "Mine site", "Ruin, 5 levels, 75 scrap metal", "Water source, 1 water/s",
  "Badwater source, 3 badwater/s", "Pine, grown", "Relic, medium", "Geothermal field"; where an object sits on ground the
  line gives both ("Geothermal field · Height 5, dry soil"), and up to three objects separated by ";". It works with the
  plain pointer and with any tool held. It is one plain core function, `describeTile` (`core/doc/describeTile.ts`),
  returning data (the ground, and each object's name, fact and words); the readout only words and shows it, and
  `tests/contract/describeTile.test.ts` calls it directly for every kind.
- **Saved names** (D345, B10): a saved map is `dgm-<theme>-<seed>.timber` (the theme the map has, `any` for a Surprise
  me map; a seed typed as a word made file-safe, lowercase with dashes; a real place or an opened file by its name as
  `dgm-<name>`); Save to Timberborn never overwrites: a taken name gets `-2`, `-3`. `core/gen/pack.ts` `fileName` and
  `namedFile`.
- **The header:** Undo and Redo; one primary button, **Save to Timberborn** (**Download .timber** in
  browsers that can't save to a folder); a small menu for the rest (Open, Save project, Download
  .timber, History, New map).
- **Checks:** a quiet dot, green or amber. Clicking it lists the problems, each highlighted on the
  map. Never a pop-up.
- **The notices** (the No badwater line, D213; what opening a file changed): a quiet strip under the map, never
  over it, so they cover no control in any layout (a force's rows, the view buttons, the water bar); Hide closes it.
- **The start:** its reach (water, wood, berries) appears when it is hovered or dragged, then fades.

(D184, D212, D219.)

## 4. Shaping the land

- **The brushes,** circle or square. Terrace is a Flatten option ("in steps"). Ramp is the shelf's **Slope** (a natural
  slope exactly where the player puts it); Smooth has no walkable option (D247) and Flatten no Ramped edges (D322).
  **Naturalize** weathers what the player paints: forces' results, brush strokes (exact ones too), rivers (the water
  re-settles as after any edit) and set pieces are all fair game. It leaves only what must not change for the map to
  stay correct: the start's pad and the ground under water sources, badwater sources and objects (not trees, bushes,
  ruin columns or slopes), worked out by the core when the stroke applies and recorded in it, so a headless operation gets the same protection and a replay is exact; its wear never leaves a slope joining nothing (D253, D368 (8), D342). A stroke saved before
  D368 (8) has no `weathers` flag and replays as it did, leaving protected tiles alone. Pen pressure on drawing tablets (a soft stroke's strength).
  Every brush's options row starts with its **Size**, a number and a slider up to half the map's width, so the largest
  brush paints the whole map in one stroke (D322, item 42); hold F and move the mouse to size the ring on the map, its
  size beside the pointer, and let go to keep it (a click sets it too; Esc or a right click puts it back); { and } step
  it (D205, D226; D368 (1)).
- **The height brushes work as the game's editor does** (D322, item 37; replaces item 8's stop levels and D193's
  held digging): Raise, Lower and Flatten each have a **target level**, shown beside the pointer at all times ("up to 8",
  "down to 5", "level 7") and as a plane over the ring. Raise lifts every tile under the brush below the target to it
  and leaves higher ground (the game editor's relative raise); Lower cuts every tile above it down to it (relative
  lower); Flatten sets every tile to it, higher or lower (absolute height). They act exactly, with the brush's
  footprint and hard edges; holding adds nothing. Until the player sets it, the target follows the ground under the
  pointer (a level above for Raise, below for Lower, the same for Flatten) and locks where a stroke starts. **Shift+scroll**
  changes it (0 to the height ceiling; plain scroll still zooms), **Ctrl+click** on the land takes its level (on water,
  the bed's), and the row's **Level** list sets it; once set it stays until the tool changes or Esc (the next Esc puts
  the brush away). Past either end of the range Raise and Lower are **Free**: they sculpt softly, building up as the
  player paints, as they always did. Smooth and Naturalize stay soft; Shift+scroll, or [ and ], sets their strength (Raise, Lower and Flatten take
  nothing from [ and ]: their target level is theirs, D368 (1)). The tooltips
  name the game editor's terms. Under a layer cut (D207) Raise stops at the cut. An exact stroke's tiles stay as it
  leaves them (the build's integrity pass leaves them out, so a one-tile pit stays a pit).
- **Ground, Water and Both** (D322, item 2): every brush's row has its mode. **Ground** changes only dry tiles and
  never lowers a tile beside water below that water's surface, so rivers and lakes stay where they are and nothing
  spills; **Water** changes only the wet tiles (those drawn as water), so a bed is reshaped without its banks; **Both**
  (the default) changes everything. Which tiles are wet is fixed when a stroke starts, from the map's own water (never
  a drought's or a badtide's shown at the time). In Both, a Lower stroke that starts in water still carves a flowing
  channel (smart Lower, §5); no other brush has an automatic behaviour of its own. Inside an open selection the mode
  applies within it. The Wand (Select) stays for whole-body jobs.
- **Sources: Ride · Keep · Clear** (D322, item 31; D249): one choice in every brush's row. **Ride** (the default): the
  sources the stroke passes over ride the ground like trees and bushes (a 3 × 3 source as one level piece), never left
  in a pit or on a pillar. **Keep**: every source under the stroke and the ground it stands on stay exactly where they
  were while the stroke changes everything round them (hard sculpting may leave one on a small pillar or in a small
  pit, as the player chose). **Clear**: the sources the brush passes over are removed in the same undo step (they glow
  red under the ring first, and the ring carries a small mark), even when the stroke changes no ground, and their
  water drains at once as a deleted source's does (item 15, D260). Each brush remembers its mode and its choice.
- **Precision when wanted:** the target level, straight lines, level lines (a view switch, D248), a Select tool for big
  shaped edits (a small button on the bar beside the brushes; M and Ctrl+drag still open it, D259), and live
  dimensions (a selection's size, a straight line's length, the target beside the pointer).
- **Flatten** (D204, D322): sets the ground to its target, cutting and filling, so one stroke makes a clean plateau with
  the game editor's hard edges; a walkable edge is the shelf's Slope. A quiet "the start fits here" hint when the area
  is big and flat enough for the district center, and a stronger one when the start requirements would also hold
  there; trees and objects ride the ground (a piece whose footprint the edge would split keeps its ground).
- **Hills, plateaus, ridges and valleys come from the brushes,** not buttons.
- **Craterize, a force of nature** (D202): its own top-bar button next to Carve (key 8), simulating a
  giant impact. A click strikes; so does a press and drag, once, where the press began (D368 (7): a crater is one
  impact, never a line or a second crater; the engine's glancing blow stays only for operations already saved);
  **Power** (a pebble to a cataclysm); **Size** (following Power, or set: D226); **Try
  another**. Its walls (steep or terraced), centre (bowl, peak, ring or flat), debris (light or heavy) and rays come
  from the land and the seed (D289). Its ring
  at the cursor, its Size (D258, D312). The impact moment: a streak falls, a flash, a shock
  ring, dust and thrown blocks (the camera never shakes, D265), the bowl opening at once and the debris landing ring
  by ring; trees inside the bowl are gone, those round it are knocked down (dead, standing upright where their
  ground held, gone where the blow broke it: D321, item 7). Newer impacts overprint older ones; heavy debris can dam a river; it strikes wherever it is
  aimed, the start's ground too (D257), and never adds water; one undo step: undo reverts it, Esc skips it to its end (D344). Built from
  `investigation/craterize` (#51) on the forces core (#59), on the preview until Kyler has tried it
  (D219; ready: D216, D226).
- **Quake, a force of nature** (D203, D219): in the forces group (key 9). It splits the land along a
  fault drawn freehand (D327, with the travelling forces' pen): **Lift** or **Slide** (its one choice, D289); **Power**;
  **Try another** (another tilt and crack).
  **X** flips the side of the stroke that moves, even while painting; its scarp (sheer or stepped) comes from the land
  and the seed. The drawn line sets its length (D226). The fault shows on the land as it is
  painted (D258: the stroke is the gesture). Lift raises along the curve and shows its whole result as it is painted
  (the ground reacts behind the pointer), kept when let go; Slide shows the fault while it is painted, then its block
  slides along it tile by tile, 2 to 20 tiles (D361 (3)), each part of it the way the drawn line runs there (a straight fault's one
  heading; a curved one's bending with it, D327), and a river that crossed the fault is joined again
  along it. A crack runs along the fault and dust rises at its head (the view stays still, D265).
  Objects ride with the land (a rigid one on flat ground of its own), trees on the fault go (their ground broke;
  no tree is ever left leaning, D321 item 7); a fault
  runs wherever it is painted, through the start too (D257: the start is carried to level ground when
  its own breaks); it never adds water; one undo step: undo reverts it, Esc skips it to its end (D344). Built from
  `investigation/quake` (#52, with both Lift and Slide) on the forces core (#59), on the preview until
  Kyler has tried it (D219; ready: D226).
- **Erupt, a force of nature** (D206, D216, D226): in the forces group (key 0). It raises a volcano:
  a click vents, a drag opens a fissure (D289: the gesture is the mode); **Power**; **Size** (breadth: following
  Power, or set: D226); **Try another**. Its shape (steep or broad), summit (peak, crater or caldera), flows (light or
  heavy) and ridges come from the land and the seed (D289). The ground stirs, then the volcano
  swells level by level, its **terrain final in about two seconds** (D312: its 28 stages at 55 ms); its effects (the lava's
  glow cooling, the smoke) play on, but the player never waits for them and can act again at once; its plume billows bigger and darker the more powerful the eruption (D216),
  the lava glows along its flows, then cools to a dark crust and fades into the ground. **A volcano always
  looks like a volcano** (D321, item 14): its cone is the dominant shape at every setting, rising to a clear summit
  (with Summit: Crater, a bowl a fifth of its height deep under the rim), the flows running down its sides; heavy
  flows spread a wider, thicker skirt of lava along them, never a round plateau that turns it into a mound; its
  surface reads as rock (no lone raised tile above or below its neighbours, the summit aside); High Power grows it
  toward the height ceiling (22, D244). A volcano
  always keeps a peak within the headroom it has: near the height ceiling it spreads wider rather
  than rising taller, never flat-topped; overlapping eruptions build new cones on the flanks; an eruption
  always completes, as in the demo Kyler approved (D226). Fresh volcanic rock is hard for Carve; flows
  can dam rivers; objects ride the rising ground (a rigid one on a terrace of its own), trees near a
  vent die, standing, or go where the cone rises under them (D321, item 7), and what stands in it goes, each as the
  heat reaches it (item 30); it erupts wherever it is asked, the start's ground too (D257),
  and never adds water; nothing of its fit shows before it (D258): a small cursor, and "No room to rise
  here" only where it can't rise at all; one undo step: undo reverts it, Esc skips it to its end (D344). Built from `investigation/erupt` (#50) on the forces core
  (#59), on the preview until Kyler has tried it (D219).
- **Glaciate, a force of nature** (D246, D291, D292; built on `feature/glaciate` from `investigation/glaciate`'s round 4,
  for Kyler's forces sitting): it turns a valley that's already there into a glacial valley: a broad, level floor between
  steep walls stepping down by bars; a tarn in its cirque; hanging side valleys with springs and falls (Meltwater);
  scree, a moraine and an outwash plain from the material it cut; the river leaving by the old outlet. "Carve gives you
  water; Glaciate gives you land." Its own button in the forces group (key -). A **click Flows** (it follows the valleys
  down from there; on flat ground a seeded way to lower ground or an edge) and a **drag draws its path** freehand
  (D321, item 41: the gesture Carve shares): the ice gathers under the pointer as it's pressed, a drag of six pixels or
  more draws the line, which shows as it is drawn, and on release the glacier grinds along it through the ridges, the
  way it was drawn (the line resampled every two tiles, smoothed into one curve); nothing predicts the valley on the
  land (D258); its operation keeps the line (`where.path`). Its ring at the cursor shows its width, its Size (D312;
  how big, never what shape). **Power is how deep the ice carves, Size how wide** (D368 (3), amended): lower Power
  makes the glacier shallower and changes nothing else. Power 100 is round 4's glacier in full, the deep U-shaped
  valley Kyler approved; below it the plan lifts each station's floor toward a level under the valley's bottom there
  (`liftFloors` in `glaciate/plan.ts`, by `glacierDepth`'s share, running only downhill and staying over a river
  already in its way), never fills the ground under it, and cuts no tile deeper than `glacierCut` allows (1 level at
  Power 0, a light scour; 6 at 50; channels and pools two more), all before its river, falls, tarn and water checks
  are laid, so they are laid on the shallower floor as on round 4's: at every Power the valley is a U and its water
  lies in a channel or a tarn, never a sheet (`tests/contract/glaciateFloor.test.ts`). Scaling every level instead
  flattened the profile and stranded the water. Its default Power is 60, a middle depth like the other forces'.
  Size is its width alone. Neither drives the other: how far it flows, the relief its depth is measured from and its
  Auto Size (30) are round 4's whatever the Power (`FLOW_REACH`, `RELIEF_SPAN`, `GLACIATE_AUTO_SIZE`);
  `tests/contract/glaciatePowerSize.test.ts` measures it across its valley (`glacierSections`). Its row is
  **Power**, **Size** (Auto: 30)
  and **Meltwater** (on by default), with **Try another** once one is kept (D289), and **More** (D309): its **Benches**
  (sheer walls, some benches on the soft rock as round 4 had them, or many), its **Steps** (the floor drops by few, some
  or many), a **Tarn** in its cirque and **Scree** at its walls' feet, each on Auto (drawn from the land and the seed,
  round 4's the likeliest) until pinned, as for the other forces; a glacier saved without them is round 4's.
  Two acts, the ice advancing for three fifths of its showing and melting back for two (in Fast about two seconds in
  all, in Slow forces about eight, D321), the land under it taking its final levels as the front passes and the objects in
  its path going with it; the water stays as it was until the land is final, then the valley's own water takes over;
  the camera never moves (D265). **The floor reads as one river** (D292): the river winds across the level floor to the falls'
  pools and the rivers coming in, so their water drops straight into it; a fall it can't reach, nor pass within six
  tiles of, stays a dry hanging valley; every join runs straight to the river, never along a wall's foot; a lip's other
  face runs into its own pool. The game's water is run a while on the finished floor as it's planned: if it would wet the
  dry floor, the river bends toward the falls instead, or keeps round 4's meander, whichever keeps the floor dry. Literal
  land, the game's own water: nothing is masked. Bound only by nature (D257): no refusal for playability (only the map's
  floor: "At the map floor: no ground left to carve"); through the start's ground it goes on and the start is carried to
  level ground in the same step. Trees and objects in its path are swept; swept clean sources feed its cirque head,
  badwater is discarded. Its springs come in groups as the game's own maps have them (D314, `core/water/sourceGroups.ts`):
  the cirque head's a row across the glacier's way down, each hanging valley's a group at its lip (small springs stay
  one), the strength shared. One `forceResult` operation, one undo step, stored literally: its changed levels and every level
  of its own ground (so the build keeps its banks whole), the objects it swept, its springs and its tarn's water; undo
  reverts it at once, Try another replaces it, and it replays to the same bytes. **Its ice, its sounds and its land keep
  one pace** (D344, A7): the ice's front and its melt follow the glacier's own stages as the frames bring them, at the
  showing's pace (`ForceCue.pace`: Fast compresses its five seconds, Slow forces stretches them), so the front reaches each
  tile as the land there changes, and the ice is gone, the meltwater's sound ending, as the land settles; its sounds
  fit each act as shown (`recipe`'s `span`), and a glacier skipped to its end melts away at once. It builds up to the editor's one
  ceiling (D172's tall maximum on every map, D244). Sounds from the editor's CC0 bank (grinding stone, a
  low wooden groan, slow cracks, meltwater: the investigation's recipe). No ice-sheet mode for now.
- **Erode, a force of nature** (PLAN §20 D279–D281; terrain above terrain, step 3, after the view): wind and water wear
  rock into caves, alcoves, overhangs and arches; the land decides which; every shape obeys the support rule; a click or
  a drawn sweep; **Power**, **Size**, **Try another**; two to four seconds of dust and rubble. Prototyped on
  `investigation/erode` (held, like the other forces' investigations, until Kyler has tried it).
- **The block tool** (PLAN §20 D280 (3); terrain above terrain, step 3): precision, beside Erode's magic. Point at a
  block's face and click to add a block against it, drag to paint a layer outward from that face; remove blocks to
  hollow a cave; sized like the brushes; shows at once any block the game's support rule would drop.
- **Delete** (D288, amended by D323 items 1 and 44; there is no Remove tool): Delete removes what is there, never
  silently: objects and sources first, the start included (it is the player's like any object); where only ground is
  left, its top block, one level down (under water, the bed's top block), for a single hovered tile or a whole
  selection, one undo step per press. With a selection open, the Delete key removes everything standing inside it, or
  the ground's top level where nothing stands; the Selection row's **Delete** opens a menu of what is there with counts
  (Everything, Water sources, Badwater sources, Start, Ruins, Trees, Bushes, Slopes and the rest, then Ground (one
  level)), and hovering a choice shows what it would take. **The counts and Everything include what is under water**
  (D345, B5): the resource features hold trees and bushes on ground a lake covers, and they stand again when the water
  drains, so the core's `objectsIn` (`core/doc/inArea.ts`) counts them, and Delete takes them by giving those tiles up
  from their feature's area (a ruin field only partly inside the selection gives up just the tiles inside it, its `cleared` tiles, so the
  columns outside keep their heights and places, the ones under water inside are deleted too, D360 b). With no selection, Delete takes what the pointer is on: a
  source within its targeting range (D249) first, else the objects on the tile, else the ground. **Ctrl+A** or **Whole
  map** selects the whole map for a map-wide Delete. One undo step; the water they fed drains as its cause is gone
  (D260), and any check the map runs (moisture, drought) follows from that same water change. **Clear everything** in
  the editor's ⋯ menu removes every source, badwater source, tree, bush, ruin, object and the start in one undo step,
  leaving the terrain. A map without a start is allowed while editing: it saves as a project, the checks dot says
  "No start", and only Save to Timberborn and Download .timber refuse ("Place a start first: pick the Start on the
  shelf"); the shelf's Start places one again. A force still carries an existing start (D257).
- **Heights** (D244, built after the Ceiling probe batch ceiling-20260927 passed): one ceiling on every map, D172's
  tall maximum (22, `CEILING` in `src/core/format/world.ts`), for the brushes (their levels, stops and holds), Select's
  Level number, the forces and the build's integrity pass, with nothing about it in the interface. A map whose land
  goes above 16 is a tall map: its description ends with the plain note "Timberborn's map editor opens and saves this
  map as it is, but can't raise land above level 16." (what the probe found), and it is exported and validated as tall
  (up to 22 loads; the check says the in-game editor edits only up to 16). Back at 16 or below (an edit or an undo), it
  is a standard map again and the note goes; a map that needs no change keeps its description byte for byte. A
  generated map's description notes tall land in its own words ("The land rises to level N: the game's map editor
  edits only up to level 16."); they are its note, never doubled: exported and opened again as a file, it exports the
  same bytes, and edited there its sentence follows the land's top level, or goes back at 16 or below (D341).
  Generation is unchanged: the generator's Verticality and Real places' standard or tall option decide how tall a
  generated map starts.
- **Select** (D259; on `feature/forces`, for Kyler's forces sitting): a small button on the bar beside the brushes; M
  and Ctrl+drag still open it. Shapes: Rectangle, Freehand, **Wand** (D261: a click on land selects the ground joined to it at that level; a click
  on water selects that river's or lake's visible water tiles, badwater included, never a bank tile; a snapshot at the
  click that never follows the water as it moves), **Circle** (drag from the centre outward, the
  radius beside the pointer) and **Brush** (paint the selection with the brush ring, at the brushes' size); Shift adds and
  Alt subtracts in every mode. The **Level** number reaches the map's ceiling (22 under D244); Ctrl+click on the land
  only takes that tile's level as the Level number (D361, item 7): it never creates or changes the selection, however
  the hand moves before the button is let go (a brush's Ctrl+drag, which hands its drag to Select, still selects); it
  acts at once, one undo step. **The row** (D323, item 6): the marking modes
  are icons; **Whole map** beside them selects everything (as Ctrl+A); **Raise** and **Lower** move the selection one
  level per click (the Up and Down arrow keys too, while a selection is open: W and S still move the camera); a
  **Level** number starts at the selection's lowest ground, with **Flatten** (cut and fill), **Cut down** (only lowers
  ground above the level) and **Fill up** (only raises ground below it) acting at once (Cut down to the
  lowest level); hovering any action tints the land inside the selection it would change; Esc or X closes; plain
  one-line tooltips. Select's own actions are exact, with hard edges: precision tools; **Delete** is a menu (see
  **Delete**). **Select all** (D264): Ctrl+A selects the whole map, in Select or with any brush out. **Max water depth** (1 up to
  the map's deepest water) raises the ground under the selection's water wherever it is deeper than the number, then the
  water re-settles: a lake keeps its surface and becomes that deep; a river ends about that deep, and the report says so
  if any water ended deeper. Objects and sources ride changed ground; the start moves to the nearest valid ground only if
  its own ground can no longer hold it; each action is one undo step with a clear label ("Cut 4,210 tiles down to level
  16"). The selection stays open after an action until
  Esc or the × closes it.
- **The working area is Select's open selection** (D254, D259); there is no second way of marking an area. While a
  selection is open, the brushes, the forces and a brush's Clear work only inside it; everything outside is locked, exactly
  as it is, and dimmed. A **feathered edge**: inside the area a tool's effect tapers off toward the boundary, so edited
  land meets locked land naturally, never a cliff or a straight wall. To the forces, locked land is unbreakable rock (the
  forces core's hardness): Carve's river turns away from it, lava pools against it, a crater's rim stops at it. Water is
  never locked: it follows the land inside and out. "Fence off an area, then paint inside it" is one motion: Ctrl+drag
  with a brush out makes the selection, and on release the same brush keeps painting inside it. One row at a time: with
  a brush or force picked, the Select row shrinks to a chip beside it ("Working inside 40 × 40 · Esc to clear") that
  expands when clicked (the brush or force goes back). Every edit is one undo step as always; marking or clearing the
  area is not an edit. As built: the feathered edge lets a tile change at most as many levels as it is steps inside the
  area (the edit meets the locked land a level a tile); a stroke keeps its `area` (runs) so it replays exactly; a force
  treats the land outside as land it keeps, eases its result to the edge the same way once it is kept, and refuses to
  start outside the area ("Outside the working area: Esc clears it"); a brush's Clear takes only the sources wholly inside.
  The Level number follows the height ceiling's constant (16 until D244's step 2 lifts it).

(D180, D182, D183, D184, D202, D203, D206, D216, D219, D220, D226, D249, D254, D259, D322.)

## 5. Water

Make a valley, drop a source, and there's a river.

- **Smart Lower:** a stroke that starts in or near water carves a bed that keeps flowing downhill. Its depth comes from
  strokes, never from holding (D263): a new channel's bed starts one level below the surface of the water it leaves (the
  water enters about one tile deep, with no pit where it leaves), never rises, and steps down to one level below the land
  beside it; it cuts deeper only where it must to keep flowing downhill, and no deeper. A stroke drawn along an existing
  channel deepens it by exactly one level. Holding only extends the river; plain Lower, away from water, still digs
  deeper while held.
  The brush ring itself turns a clear water-blue and slightly thicker, with a faint fill as a second
  cue; ordinary Lower keeps the white ring. Readable over water, badwater, every ground and in
  colour-blind views (D198).
- **Water source and Badwater source** (D212): first on the left shelf, before the start (D226's
  order). Click to
  place, and the water spreads at once; the row beneath the top bar sets the next one's strength;
  Ctrl+scroll over any source sets its strength (D322 moved it off Shift+scroll, the brushes' target; strong waterfalls allowed, with a friendly note
  past the official range); drag to move. **One strength number everywhere** (D361, item 6): the row beneath the top bar
  shows the strength of the source being pointed at or selected, the same as its marker's label, and updates live while
  scrolling; that source is highlighted; in a row of sources it says which the scroll changes, this source and not the
  row, and shows both ("this source 0.25 · row 1 water/s"); with nothing pointed at, the slider is the next source's
  (`sourceStrengths`, `sourceStrengthWords` in `features.ts`). **One value behind it** (D368 (4)): the label, the row
  (its Strength and its words) and the scroll's note all read the page's copy of the objects with the strengths just
  set on top (`strengthReader`), so they change together at every Ctrl+scroll notch, and the worker sends the objects
  again whenever a strength changed, so its real strength follows within one answer (`tests/e2e/sources.spec.ts`). A click on a placed source selects it and shows its
  strength, its water (clean or bad) and Remove; Delete (or that Remove) makes its water recede live. A
  source is always findable, even underwater: a subtle upwelling (bubbles, a gentle ring) shows
  through the water; with a source picked on the shelf or when hovering near one, a clear marker
  with its strength; Markers shows every source (D196). **Sources are easy to hit** (D249): with any tool picked, the
  pointer over water or bare ground within about two tiles of a source targets it, above or under water (a direct hit on
  another object wins; the nearest source wins); Delete or Backspace removes the targeted source, one undo step, its water
  receding live. **A badwater source cuts its own spring pool** (D290, generalised to every object by D328: one
  `levelFootprint` in `core/doc/placing.ts`): it is 3 × 3 in the game and needs level ground,
  so where it is placed, switched from clean or dragged onto uneven ground, its nine tiles are cut down to the lowest of
  them (never filled, so its water isn't dammed) and what stood on them goes, a small level pool in the same undo step;
  it refuses only at the map's edge, in a cave and on the start. Every placement refusal is one plain reason ("the
  district center stands there", "off the map"); uneven ground is never one (D328).
  Removing the map's last badwater source is never refused: the map becomes a **No badwater** map (a
  peaceful one; badtides still come), a quiet line in the notices says so, the file's description and checks follow, and
  undo brings the source and the setting back (D213). A planned edit (a lake, a landform, a set piece, a move) that would
  reshape the ground under another feature's source keeps off it and says why (decisions-pending #89); the brushes treat
  sources as D249 says.
- **Unleash, on a source** (D239): select a placed water or badwater source and a small **Unleash** action sits beside it,
  next to its strength, with a quick **Power** (or press U). Clicked, the source's own water carves its course downhill
  with Carve's engine (momentum, wander, waterfalls, the carving moment and its effects; the camera stays where the player left it, D265); where it stands in
  a pool or a lake (water half a level deep or more round it) it breaks out where the water would spill over, the lowest
  point of its rim (an outlet it already has, or its lowest bank), like a lake breaching, and carves on. Pressed and
  dragged out onto the land, its river follows the line drawn from it (D321, item 41: the line shows as it is drawn;
  aimed from a pool, it breaks out where the rim is nearest the line's end; uphill, it says the water runs downhill); the source's own drag still moves it. Its
  width is the width whose Carve source would have the source's strength (a stronger source, a wider river); the rest is
  Carve's defaults, so it's one click. The source stays the river's origin: the carve is a dry one and adds no other
  source; a badwater source carves a badwater river. While it works the row is Carve's own (Pause, Revert; it keeps
  itself when it ends, D289); undo takes it all back and Esc skips it to its end, as with Carve; the whole carve is one undo step ("Unleash a source");
  **Try another** re-rolls the course in its place ("Try another course"). Stored literally like every force (the
  carve's `forceResult`, with the source it unleashed), so projects replay exactly; the retained oxbow water (#70) and the
  settle rule (D222) apply as to any carve. The Carve tool stays as it is. Claude's `carve` step takes a `source` to
  unleash one.
- **Water is never an object.** It is the result of sources and land: never selectable or deletable,
  with no river panel or selection. A river's flow is its sources' strength; clean or bad belongs to
  each source; water changes only through its causes (a source removed, moved or weakened, or the
  land reshaped). Generated maps' rivers are just their sources (edge inflows included) and their
  land. Hovering water quietly highlights the sources feeding it (D196).
- **Seeing underwater** (D196, D212): while a brush is over water already there (painting a
  submerged bed), the water under and right round it turns clear, so the bed, ledges and sources
  show; working on dry land leaves the water as it is, so it can be seen. T (the game's key) or
  **Clear water** makes all of it clear. Clear water still reads as water: a faint blue tint, its
  ripples and a soft bright shoreline. Badwater stays clearly distinct when clear (its own colour and
  dark stripes), for colour-blind players too. Sources can go anywhere in the editor; the "only
  where water begins" rule (D171) is for generated maps.
- **Lakes, waterfalls, joins and branches emerge from the land.**
- **Water flows visibly,** and the land greens along new water. It reacts at once: water near an edit
  starts moving within a frame or two, the rest of the map follows, always at one brisk pace: small
  edits settle nearby in a second or two, big changes (a new river, a breach) still flow visibly. The
  water bar: the status, Pause, Skip (straight to where it settles), Replay, Drought and Badtide; no
  speed control there (D197, D268).
- **The camera only moves when the player moves it** (D265, an accessibility rule): no feature moves,
  tilts, zooms or shakes it on its own (no follow, for the water or any force); effects on the land
  are unaffected.
- **Drought and Badtide, day by day** (D267, D268): clicking one shows the hazard's last day at once
  (with progress while it's worked out); clicking again returns to the map's own water. While a hazard
  is shown, a day strip on the water bar runs from Day 0 to the last day: previous and next, a click on
  any day, play, and **Speed** (slower, normal, faster, instant; it appears only here). Stepping animates
  that day's water at that speed; Instant jumps and stays; nothing reverts on its own. A length of 1 to
  30 days per hazard (defaults drought 9, badtide 8), remembered. The start's water is highlighted, and
  the strip marks the day it leaves a pump's reach (or, in a badtide, the day badwater reaches it or its
  farmland); hovering any water says when it dries or turns bad. Any edit while a hazard is shown ends
  the view at once: the map's own water returns and the edit's water plays as usual; clicking the
  button again shows the new worst day (D269). The game's weather rules, unchanged. The
  Weather step's summary and map-card lines build on these buttons (D133).
- **Carve, a force of nature** (D194, D199, D216): the first button of the forces group (key 7),
  with its full set:
  - a click unleashes it where the cursor is: the river finds its own way downhill;
  - **a drag draws its path freehand** (D321, item 41: one way to steer, the piece Glaciate shares): the line shows as
    it is drawn, and on release the river carves along it, its water running from the line's higher end to its lower,
    whichever way it was drawn, cutting through rises to keep flowing (D289), with its depth, walls and the Floor. The
    path is kept a tile every two along it (at most 128 between its ends); the carve steers along a smooth curve
    through them (Catmull-Rom, a point five tiles ahead on it): at Wander 0 it follows the line, higher it meanders
    naturally round it. Its operation keeps the line (`where.path`), and Try another runs along the same one;
  - **Power** (creek to catastrophe) and **Size** (how wide it cuts: following Power by default, or set by hand for
    slot canyons or wide lazy rivers; its depth follows Power and the width, D226, D289);
  - its wander (straight to winding) and walls (a steep gorge or wide terraces) drawn from the land and the seed
    (D289), with natural variation within each carve (bends wider and deeper on the outside, narrower on the
    straights, never a uniform tube), and **Try another path**, which re-rolls them; a bend cut off becomes an oxbow
    lake, sealed by sediment at both ends;
  - behind More, beside **Canyon depth** (how deep the cut goes, so how tall the walls are; item 25's name for its
    Depth), **River depth** (D321, item 17): how deep its water may be, a number from 1 up to the height ceiling, or
    **Off**; 2 unless set, remembered. Once the canyon is cut, wherever the game's water would pool deeper than that
    over the ground the carve cut (a bend's scour, the canyon's end behind its own fan) the bed is raised under the
    pool's spill level (one level under it less the setting, the water flowing over the sill standing a little
    above it), the walls as tall as Power made them; Off leaves it as deep as it cuts, and a dry canyon has no river
    to limit. **Banks** (item 18, on Auto: open ground leaves wider ones, a gorge few): about how many tiles of flat
    land lie on each side of the river before the walls, 0 to 10, wider inside a bend and narrower outside it, with
    a slow swell along the course, never a constant strip. The banks stand at the river's waterline: the bed below
    them by the river's depth (at least two levels, so its normal surface stays just below their top and never
    spreads over them as a standing sheet), running only downhill; the carve's own source row stands in the river;
    the walls step back by the banks' width; the banks are moist for crops and, like any low floor, may flood when
    the river refills (D307). Built after the carve in `core/forces/carve/river.ts`; its operation keeps both;
  - its one choice, **Keep river** (the default) or **Dry canyon**. Keep river leaves a
    source group at the origin (D314, `core/water/sourceGroups.ts`: a row across the carve's heading, fewer where
    cramped, as the official maps' rows are) whose total strength follows the river's Width, not its Power, so a slot
    canyon keeps a modest stream and a wide river a big one, shared among its sources; Dry canyon leaves none. Its
    operation keeps the row literally (the anchor at the origin and the rest), so projects replay exactly, and a carve
    from before keeps its single source. Each source is editable afterwards like any other. Unleash places none: the
    player's source stays the river's origin (Kyler, D314). A row at the map's edge must flow into the map, never
    straight off it (D321, item 27): `core/water/edgeSources.ts` checks every force's placed sources (Carve's row,
    Glaciate's springs) and keeps what leaks with the run (`edgeLeaks`); the fix, M9b's edge lip, plugs into its
    `EDGE_LIP` hook once batch 5 brings it to dev (pending);
  - the visible carving effects (a surging head, crumbling blocks, dust, its muddy surge, murky for badwater), the
    camera staying where the player left it (D265: no Follow); the whole run is worked out first (its surge gathering at
    the origin), then played back at Fast's or Slow forces' pace (D321), the land and the objects changing only as the head
    reaches them and the water as it was until the land is final;
  - Space pauses it; it keeps itself when it ends (no Stop, D289); Ctrl+Z (or undo) reverts the whole carve instantly,
    at any moment until it is kept, its keep on its way included (D341); once kept, undo does; Esc skips it to its end,
    kept as one step (D344, A4);
  - **drawn uphill, shown the way it was drawn** (D344, A5): its water still runs from the line's higher end (item 41:
    the land decides), but its showing starts where the stroke began, the head coming back up its course
    (`core/forces/carve/play.ts`, `fromEnd`; the page asks with `shownFrom: "end"`), each tile taking its final level
    as the head reaches it; its land and its operation are the same either way.

  The water cuts its own gorge or valley, with floodplains and a delta. An oxbow lake holds its
  water behind its sediment; with nothing feeding it, it evaporates over time, as in the game. Its
  slow drying is not the water still changing: the quiet dot settles once the rest of the water
  has (D222). Fresh volcanic rock (Erupt's) is hard for it: it bends round a lava field. Built from
  `investigation/carve` (#47, D216) on the forces core (#59), on the preview until Kyler has tried it
  (D219).
- **Optional water sounds,** our own.
- **What you watch is what you'll play:** the final water always matches the game's settled result.

(D180, D181, D184, D186, D194, D196, D212, D216, D222.)

## 6. The look

The clean game-like view (D135), contaminated ground as a layer over the ground (D154), the mine
sites and ruins (D178), the approved badwater in one shared water palette (D177), and a High mode
with the water shader and soft shadows, chosen automatically on capable GPUs with a fallback to this
Standard look (Map look 2, D147, D284), right after the forces' release.
Waterfalls leave the lip and arc into the pool as one sheet, round the corners of a lip too, with
foam at the lip, whitewater and a splash where they land (soft white water, never cells that read
as cracked tiles), and a small fall at each step of a cascade (D201, D215, D222).

## 6a. Alive, not mechanical (D240; after the forces round 2)

Visual only: the final map and water are exactly as they'd be without it. Every animation is short, never delays the next
action, never makes the editor feel sluggish, switches off with reduced motion, and is synced with the sounds.

- **Land:** raised blocks grow up from below with a tiny overshoot and settle; lowered blocks sink and crumble, with a puff
  of dust and a few pebbles; a stroke's changes ripple outward from the brush's centre over a few milliseconds, so it feels
  organic, not stamped; fresh ground starts as bare earth and grass creeps over it in about a second where it's moist;
  cutting down reveals rock layers in the new walls.
- **Water:** the surface glides between states instead of jumping tile by tile; advancing water has a thin line of foam
  and shimmer at its front; basins fill with a smoothly rising surface and ripples; water tipping over a new edge bursts
  into a waterfall with a splash; ground darkens with a wet sheen where water touches it, and draining water leaves damp
  ground and fading puddles; sources pulse with a gentle upwelling, stronger for stronger sources.
- **Moments:** Generate reveals the new map in about a second and a half (the land rises into its shape, water flows in,
  trees pop up; a click skips to the finished map); placed trees and bushes pop in with a bounce and a rustle, removed ones
  topple or shrink away with a poof, ruins crumble, and painting a forest is a cascade of tiny pops; undo plays the change
  quickly in reverse; the brush ring breathes while hovering, squashes slightly on press and eases as it moves; Save to
  Timberborn ends with a small send-off (a flourish, a sound, "Ready to play in Timberborn"); optional ambience: soft
  cloud shadows drifting across the land.
- **Performance:** GPU and shader effects where possible, never per-tile work on the main thread; particles and
  simultaneous pops capped, so a huge stroke over a dense forest stays smooth; the frame rate measured before and after on
  dense 256² maps; effects scale down automatically on weaker hardware rather than stutter.

## 7. Controls

Like the game: WASD and the arrow keys move (Shift moves faster), Q and E rotate, scroll zooms,
Alt+scroll slices the visible layers from the top down, Alt+click jumps to a tile's layer (again on
the same level returns to ∞), and T
toggles clear water. 1 to 5 pick the brushes, 6 the Water source, 7 Carve, 8 Craterize, 9 Quake, 0
Erupt, - Glaciate and M Select. **Z undoes, C redoes and X puts down whatever is held** (D345, B7; it closed the
selection only, D323 item 16): a brush, a force, the shelf's object, Select and its selection, a picked source or object,
leaving a plain pointer, which picks **every object on the map** (D360 a: trees, bushes and ruin columns too, and
sources and the start by their own grabs) with a click and moves it with a drag, one undo step each (Esc puts a drag
back). A quiet highlight shows exactly what will be picked, and a bigger object wins over a tree or a bush under the
pointer (`core/features/objects.ts` `isPickable`, `pickWinner`); a slope, derived from the ground, is not picked;
in Select, **Ctrl+click** on the land only takes its level (never changing the selection, D361) and **Shift+scroll** dials the Level number (D345, B8), whether
or not a selection is open (Z and C: D323, item 16;
Ctrl+Z, Ctrl+Y and Ctrl+Shift+Z work too; none of them act while typing in a field); with Quake picked, **V** flips
the side of the fault that moves (it was X). With a selection open, Up and Down raise and lower it one level (the
camera keeps W and S). Delete removes what the pointer is on, or what stands in an open selection, else the ground's
top level (D288, D323); Ctrl+A selects the whole map. While a force runs, Space pauses it, Ctrl+Z (or Z) takes it
back, and Esc skips it to its end (a painted Lift still drawn: Esc cancels it; D344, A4); the other keys wait, C among
them. A river's or a fault's
line is drawn freehand with the mouse (D321), so Enter and Backspace no longer do anything to it. Slow forces is a view-bar
toggle with no key. **When the window loses focus** (a screenshot tool, Alt+Tab; D361, item 5) the editor lets go of
everything held: every camera key and Shift's speed, F's sizing (kept), and any stroke or gesture in progress ends as a
released mouse button would end it, at the pointer's last place (`render3d/focusLost.ts`), so nothing behaves as if a
key or the mouse were still held.
**One key habit for every tool** (D368 (1)): F with the mouse, and { and }, set the Size; [ and ] set the strength: a force's Power, Smooth and Naturalize's strength, and nothing on Raise, Lower and Flatten (they have a target level instead). Shift+scroll sets Raise, Lower and Flatten's target level (D322) and Smooth and Naturalize's strength, Ctrl+scroll a hovered source's strength, Esc backs out (a target set by hand first). Hold F and move the mouse to resize the brush or the force live, its size beside the pointer; let go (or click) to set it (D344, A1). Quake has no Size: F and { } do nothing there. U unleashes a selected source (D239). Ctrl+Shift+1 to 9
saves a camera bookmark (position, angle, zoom), and Shift+1 to 9 glides back to it; the number keys
alone stay the brush shortcuts; bookmarks are saved with the project. Every tool is reachable by
keyboard, with labels for screen readers. (D180, D184, D196, D205, D212, D219.)

## 8. The generator, Claude and the first run

**The page is the editor follows [docs/UI-BRIEF.md](docs/UI-BRIEF.md) (D330, Kyler's UI round, 2026-09-29).** Where the list below disagrees with the brief, the brief wins: one workspace with no expand button, full screen or "Refine this map" step; the side panel holds the map (the switch, the candidates strip, the map card, Your maps) and the rows over the map hold the land; Generate runs only on its button. D233 (1), (2) and (4), and its regenerating on a setting change, are superseded. **Edits never replay onto new land** (D336): every Generate makes a new map, at any size or setting; an edited map stays saved and one step away.

**Decided, to be built after the forces round 2 and M9a's release (D232–D234):**
- **3D everywhere** (D232): 3D is the default view; the 2D toggle goes (Top-down and the minimap cover it), with an automatic
  fallback for computers that can't run 3D well.
- **The page is the editor** (D233): after Generate, the map on the landing page is already editable, with no separate
  step or screen. Around it, compact and unobtrusive, only the essentials: the brushes, Water source and Badwater source,
  and the forces. An expand button in the map's bottom-right corner opens the full editor (the whole shelf, the view
  buttons, layers and the rest) in true full screen, with the same map and edits and no reload; with Keyboard Lock in
  Chrome and Edge, Esc still cancels and holding Esc exits; elsewhere it fills the window so Esc keeps working; a button
  returns to the page. Generating over edits is simply undoable, with a quiet note ("New map. Undo to get <map name>
  back."); changing a setting regenerates, also undoable. The legend is a small Legend button, collapsed by default (a
  one-time hint for first visitors; it opens by itself when an overlay is on). Save to Timberborn works from the page and
  full screen; Real places open the same way; on phones the map is view-only.
- **Your maps** (D234): every edited map is kept in this browser (settings, seed, edits and a small top-down thumbnail),
  saved quietly after edits settle; a row of thumbnails on the landing page and the same list in the "…" menu reopen
  each exactly as left; rename, copy, delete (undoable), a mark for maps already saved to Timberborn; the last 30 kept,
  stars kept forever; running out of storage is said plainly; it says it lives in this browser, and Download project
  file and Save to Timberborn stay the permanent ways. No folders, tags or search.

**As built today:**

- **Generate always makes a new map** (D323, item 20): every press rolls a fresh seed, shown in the box; typing a seed
  pins it (a small lock beside the box) and Generate then makes that map again until the player unlocks it or clears
  the box; opening a share link pins its seed; there is no Dice button. Refine and the downloads wait while a map is being made, so they
  never take a newer map than the card shows.
- **"Refine this map"** opens the editor. Edits never replay onto new land (D336): when the
  shown map has edits, the note under the button says "Generate makes a new map. Yours stays saved,
  with its edits."; the new map is made beside it, the edited map stays open and autosaved, and the
  banner's **Back to editing** returns to it. Refining the new map asks first, as opening any other
  map does.
- **Claude (M12)** is a small chat box summoned with a key, which disappears when done. Many players
  won't use it, so it never takes permanent space. Claude steers the generator for character and
  uses the tools only for precise edits (D139, D187).
- **First run:** three one-line hints (paint the land, place things, add water), then never again.

## 9. The future

3D carving is Erode (the magic) and the block tool (the precision), not smarter Lower and Raise
(D217's plan is superseded by D279–D281; §5 above has both tools).
A time-lapse of how a map was built (moved to ROADMAP's "Later", D285 (4)): the edit history replayed
at speed from the generated map, a camera gliding to each edit, saved as a WebM video to share (D205).
Every future editing tool is brush-first and follows these principles: cave carving is a brush (the
terrain-above-terrain steps). (D179, D182.)

## 10. What's gone, and must not come back

<!-- retired-terms:allow -->
The landform tools and their handles, the river and lake tools, the Channel tool, the separate plant
brushes, the busy readouts, the Show dropdown and the Advanced checkbox. Part 3 lists each with the
decision that replaced it. CI flags these names if they reappear anywhere else
(`tools/retired-terms.json`, D188).
<!-- /retired-terms:allow -->

# Part 2: the technical reference

## Working rules

- Editor work follows `ROADMAP.md`, one step at a time; each ends with its checks passing and a short
  progress entry. Record deviations and decisions in `PLAN.md` §20.
- The editor must never export a file that breaks the game. Load problems block export; playability
  and design problems show on the quiet dot and never block it. The classes are defined in `PLAN.md`
  §19.5.
- In-game checks are logged in `docs/ingame-log.md`; a DGM Probe batch plays maps in the real game
  only after Kyler's yes in chat, every time (`PLAN.md` §20, D117; `CLAUDE.md`).
- Everything works without Claude. Claude is an add-on.

## Non-goals

- Voxel-level cave and overhang editing, until terrain above terrain's steps (`ROADMAP.md`, "Terrain above terrain"; `PLAN.md` §20, D118, D125, D279–D281 lift this non-goal in step 3, "Creating them").
  - Until then, imported caves and overhangs must be preserved and exported unchanged, together with the water the file stores under them.
  - Until then, the tools edit surface height only.
  - The data model stores terrain as runs per tile from project format 3 (D119), so voxel editing needs no format change.
- Terrain above the map's own limit: 16, or 22 on tall maps (`PLAN.md` §20, D172; §5.9, D132). The tools keep to the map's limit (D123), and imported maps with terrain up to 22 are preserved.
- Multiplayer starts, for now. Timberborn 1.1 keeps exactly one StartingLocation per map. Fair multi-colony maps for Kyler's Timber Together mod are a later goal (`PLAN.md` §20, D5): the spec and feature schema keep room for them (`MapSpec.colonies`, `start.player`), and the editor's data model must not assume a single start forever.
- Real-time collaborative editing, accounts, or server-side storage.

## The map document

This is the most important part to get right. Everything else builds on it. The shared parts (spec, features, set-piece builders, ids, build order) are defined once in `PLAN.md` §19. This section adds what only the editor needs.

**Map document**

```
MapDocument {
  formatVersion
  generatorVersion  // the generator that built `base`
  spec              // MapSpec (PLAN.md §19.1), or null for imported maps
  base              // built from spec, or parsed from an imported file; stored in the project file, never mutated
  field             // a generated map's field (format 3, M9a): heights, solid runs, the features it holds, its ramps
  features          // parametric feature objects (PLAN.md §19.2)
  edits             // ordered list of edit operations
  meta              // name, premise, designedFor, timestamps, app version, import report
}
```

**The generator's features are its plan, not editing objects.** The generator builds every map from
parametric features (`PLAN.md` §19.2) and keeps them in the document, so the analysis and Claude's
steering can use them. The editor does not show them as objects with handles (D182, D184):
the player shapes the land with the brushes and places things from the shelf. Set-piece builders
stay shared with the generator (`PLAN.md` §19.3). Saved projects that hold landform features from
before D182 open with their land exactly as it was, as plain terrain.

**Building the final map:** the one build pipeline in `PLAN.md` §19.8. It runs landforms, then set pieces, rivers and lakes, pads, sculpt edits, derived slopes, water, resources, the start and entity edits, in that order. A generated map starts from its stored field (M9a): the rivers, natural lakes, badwater hollows and rises read back out of it are the field's own, so the build marks their channels and leaves their ground; one the player has changed is built as it now says. Every step is deterministic, so the same document always produces a byte-identical `.timber` file. Changing a feature's parameter rebuilds only the area it affects. That incremental rebuild must equal a full rebuild (`PLAN.md` §19.7).

**Edit operations** are small, serializable commands with undo data, in one envelope `{op, params}`
(`core/doc/ops.ts`, `ops.schema.json`; the validation report's fixes use the same envelope, D35):
brush strokes, placements and moves, source changes, removals, the Select tool's actions, and
Every stroke replays exactly onto its own land and survives format 3. There is no settings change
among them: edits never replay onto new land (D336). A Lower stroke that starts in or beside
water records `channel` (smart Lower) and, since D263, how deep it may cut: a new channel records its `bed` (one level
below the surface of the water round its first dab, never below that water's own bed, as the page read it) and `dry`
(its first dabs still in that water, where the bed holds, so no pit), and a stroke that never leaves the water it began
in is a deepening pass (`deepen`: a level off what the brush's middle passes over, once). The page starts a stroke from
inside the water as a deepening pass and repaints it as a new channel the moment a dab leaves that water. Strokes saved
before D263 (`channel` alone) keep their old start, the lowest ground there, and replay exactly. The bed never rises
along the stroke, so the replay carves the same bed. A stroke also records the brush
kit's options it used: square; its `target` (D322, item 37: Raise, Lower and Flatten exact, with hard edges; a stroke
without one is soft, Free); its `mode` with the tiles that were wet when it started and, for Ground, the banks'
levels (`wet`, `bank`, D322 item 2: only runs its dabs reach); `sources: "keep"` (D322 item 31: its `keep` runs are the
sources' ground, which the integrity pass leaves too); the tiles it keeps (a layer cut's, the footprints its edge
would leave on a step, D204; a precise hold's objects in strokes saved before D322), the pieces that ride it whole (`rigid`: a 3 × 3 badwater source's
rectangle, which takes its middle tile's level once the stroke is applied, D249; strokes saved
before keep their `keep` runs and replay exactly), the working area it was painted in (`area`, D254: runs; it changes
only inside, feathered),
a soft Flatten's level (strokes saved before D322), its steps, and in strokes saved before D322 precise (each dab's
depth in levels, a stop level) and ramped edges with the slopes a ramped stroke laid on its rim (`slopes`, D270: worked out when the stroke is applied, on the
ground it leaves, clear of objects, water and the tiles the build keeps free; each placed again by every build while it
still fits; a ramped stroke from before D270 has none and the slope planner joins its steps, as it did), Smooth's walkable flag (only on strokes saved before D247, which still replay exactly), and a pen's pressure per dab. Strokes saved before D322 replay
exactly (`tests/contract/strokesBeforeD322.test.ts`, on strokes recorded by the code before it). A source's strength
changed in steps (a slider, Ctrl+scroll) is one undo step. An object from the shelf is `placeEntity` (a
drag's grove is one step of them, on the tiles where a tree can grow); the start moves, and turns
with the shelf's R, in one step; Delete is `deleteEntities`, with `removeSlope` for the slopes the
build places, and never touches the ground or the start. A stroke with Sources: **Clear** is one
step of the `brush` and a `deleteEntities` of the sources it pressed on (D249, D322), also when it changed no ground. A force's run becomes one operation whose
result is stored literally, so a replay assigns it and never runs the force again: `forceResult`,
shared by the four forces (D220): the force, its settings and where it acted (a record), then the
changed tiles and their levels, the fresh volcanic rock where it changed (a bit per level), the
objects that lost their ground, the ones it carried (a Slide), the trees it knocked down (dead,
with the way the blow threw each, a record only: every tree is drawn upright on its tile, as in the game, D321
item 7), a carve's source and a
sealed oxbow lake's water. Try another replaces the force before it, and undoing it brings that
one back. Projects saved with the `carve` operation of before still open and replay exactly.
Operations validate their inputs against the
schemas and reject invalid ones instead of clamping silently.

The document keeps the applied operations as its log, on top of its generation (the spec, the
planned features and the stored base, D37). The log replays only onto that generation: undo and
redo, reopening a project and share links. **Edits never replay onto new land** (D336): an edit
only means something on the land it was made for, so nothing replaces a document's generation
under its log. Generate makes a new map, and an older map opens exactly as it was saved, with no
rebuild that keeps its edits.

**Stable identity** is defined in `PLAN.md` §19.4:
- generated features are hashed from the seed, their kind and their role in the plan, not their position in a list;
- the player's and Claude's placements get a stored UUID;
- entities are hashed from their owning feature.

Edits referencing them therefore survive other edits wherever the referenced object still exists. When a referenced object disappears, the edit is flagged as orphaned and shown to the user, never silently dropped.

**Conflict rules**
- Edits never replay onto new land (D336): there is no regeneration under the player's edits, at any size or setting, and no rebuild with a newer generator that keeps them. Generate makes a new map beside the edited one, which stays saved and one step away.
- When terrain changes under an entity, the entity snaps to the new ground if placement stays valid; otherwise it's flagged with a fix option.

**Working representation.**
- Surface heights and entities are kept in typed arrays.
- A voxel override layer preserves imported caves and overhangs. Columns with more than one solid run are locked to the brushes and exported unchanged, until the 3D stages.
- After every terrain edit the instant checks re-test terrain support. The game deletes voxels more than 3 tiles sideways from support, and the objects standing on them.
- Dirty-region tracking lets rendering, validation and the water preview update only what changed.

**Persistence**
- Project file download and upload (`.damgoodmaps.json`, compressed). It holds the spec, features, edits, locks, meta, generator version and the built base (`PLAN.md` §19.6), so a project opens exactly even after the generator changes. For imported maps it holds the original file's data.
- Autosave in the browser through the storage adapter (`PLAN.md` §19.9; IndexedDB on the website), guarded against storage failures; recover the last session on reload (`PLAN.md` §20, D44).
- `.timber` export through the `export` validation profile. Re-importing a `.timber` file bakes everything into a new imported map.

**Undo and redo** run over the operation list, with periodic snapshots so undo stays fast on 256×256 maps. The history is visible as a list the user can step back through. Undo never crosses from one map to another: each document keeps its own land (D336). When UI-BRIEF §6's undo brings back a replaced map, the page opens that map afresh, with a view built for its size.

## Checks and water

- Reuse the generator's validation modules unchanged. There must be one source of truth for what "valid" means. The editor runs them with the `export` profile (`PLAN.md` §19.5). An imported map's own problems, the ones it had when it was opened, are listed but never blamed on the player's edits: they do not block its export (`PLAN.md` §20, D43).
- **Instant checks** after every edit, on the dirty region (the ground it changed, and the objects it placed, moved or removed): footprints, ground support, overlaps, start area, limits, slopes, terrain support.
- **Background checks** in a web worker, debounced and cancelled when a newer edit arrives: water simulation, reachability, resource totals, moisture reach, drought survival, interestingness scores.
- Issues have a severity, a location and a plain-language explanation. They are listed from the quiet dot, each highlighted on the map; clicking one flies the camera to it.
  - **Error** (load class): the file would crash the game, lose objects on load, or start without beavers. Export is blocked until fixed.
  - **Warning** (playability or design class): a playability problem (flooded start, no water nearby, a map above height 16). It shows on the quiet dot and never blocks export; the warning is noted in the map description.
- **Edge walls warn on an edited map** (D323, item 12; D151 still holds for the generator and Real places): a wall
  raised along a map edge (`terrain.edge_wall`) is a warning on the quiet dot, never a block on a save, with the
  one-click fix **Lower the wall** (the outer tiles cut down to the land inside, one undo step; `lowerTheWall` in
  `core/validate/checks.ts`). The session's checks run with `editing: true`; generated maps (`generate` profile) and the
  Real places conversions do not, so they still guarantee no walls.
- **One-click fixes** wherever a sensible fix exists: move the start to the nearest valid spot, add an outlet to a lake, pull trees back into moisture reach, remove overlapping entities, add a missing slope. Each fix is a normal edit operation, applied live and undoable.
- **Water preview:** the settled water of the prototype's port of the game's rules (`PLAN.md` §10).
  - **Exact on heightfield terrain**, which covers every generated map and most edited ones. The port reproduced the game's own save to 0.001 depth, and matched Diorama and Waterfalls exactly.
  - **Approximate under roofs** (imported caves, tunnels, overhang bridges, badtide drains). There the editor keeps the water the file stores, shows a "preview approximate" overlay, and does not re-simulate unless the user edits nearby. As built (M8, D100): the tiles under roofs keep the file's water in the view and the export, every other tile is simulated, and **Show → Water under roofs** marks them; the roofed columns are never edited (D40), so they are not simulated again.
  - **Steady state in temperate weather.** Delayed sources and badtide drains are off, seeps stop at 0.8 deep, and aquifers run only under a powered drill. Drought is shown analytically: what the basins still hold after N days.
  - **Sealed oxbow lakes** (D216): a carve's cut-off bend is a basin no source feeds, which the canonical settle would start dry. The carve stores the water the game settles there just before its mouths closed (`RetainedWater`, part of the water model); every settle starts the lake from it, then runs the game's rules, so the lake evaporates as an unfed one does in the game. The same document still always settles to the same bytes. Its evaporation is not the water still changing (D222): while the lake is sealed (no running source and no map edge in its water), the tiles of it that only lost water are left out of the settle's test, so `water.settles` passes and the quiet dot settles once the rest of the water has; the preview's water stops then too. The canonical settle still runs on to its own test, so the water written is unchanged (`PLAN.md` §10, §11.3).
  - **Water changes only through its causes** (D260; on `feature/forces`): after every edit that can change what water is fed (a source removed, weakened or moved; a stroke, force or Select action that changes where water can flow), the tiles whose water lost its feed on the new ground (the canonical start's walk from the running sources no longer reaches them, nor a tile round them; or less water now flows through them than before) take the canonical start in the warm start (`unfedTiles`, sim/preview.ts; only water the old ground's canonical start reached too: water the settle itself spread past that walk, a lake filling up behind a new dam, keeps its water), so their water drains away as part of the edit's own journey (within about a second on 128² and two on 256² at normal speed; at once at Instant). A removed source's upwelling, marker and strength label go the moment it is removed. A stored lake (`RetainedWater`) keeps its water only while its hollow holds it: breached, it drains through the breach; filled in, its water is gone. The preview's water once it stops matches the canonical settle's, except under roofs.
  - **Speed:** after an edit the preview re-settles from its previous state. The target is ≤ 2 s for a local edit on 256². A full re-settle runs in the background with progress. The editor's background settle runs on past its first game day while the water still moves (a lake filling behind a force's dam), up to the canonical settle's four days (`PREVIEW_JOB_DAYS`), so "Water settled" means it. As built (M8, D99): 1.3–1.4 s in Chrome on the slowest themes, at most 1.75 s in Node; the background check is debounced by 0.7 s and dropped when a newer edit arrives.
  - **While a stroke is painted** (D197): the page sends the stroke's ground to the worker every frame it changes, and the worker runs the water on it at once (the simulation steps only wet tiles and their neighbours, about 0.7–1.6 ms a tick on 256², so the water nearest the edit is what moves first) and sends each frame as soon as the water has answered; while the stroke touches no water, only water still settling elsewhere moves and goes at the journey's pace. The page meshes a stroke's water, and the journey's frames but its last, a few chunks a frame (about 2 ms, nearest the view's middle first: `updateWaterSoon`), so painting and turning the view keep the display's rate while the water moves all over the map (D244's measurements: a stroke after a volcano had frames of 70–120 ms at 170 Hz, now 6 ms at the 95th). On release, the stroke's operation carries that water on into the journey; Esc drops it. On 256² River Valley, the water in a new channel moves 25–36 ms after its ground changes (it moved 80–95 ms after the release before, and not at all while painting).
  - **The journey's speed** (D197): slower, normal (the default, three times the slowest: a small edit settles nearby in a second or two), faster, or instant (the latest water there is).
  - **Export:** the exported file always gets the canonical settle (`PLAN.md` §19.7), with a progress bar, so an export never depends on the preview's history.

## Claude integration (M12)

**All work on M12, its preparation included, is deferred while Kyler refines Dam Good Maps**
(D277): no step before M12 adds tool entries, suite requests or reference solutions for Claude; the
design below stays as recorded, and M12's first part, when it begins, is catching Claude up to the
tools as they are then.

**Summoned, small, steering** (D139, D187): a chat box summoned with a key that disappears when
done; Claude steers the generator for character, and uses the editor's tools only for precise edits.
M12 revises the step kinds below to the current tools (brush strokes, sources, placements from the
shelf, Remove, the Select tool's actions); steps that add landforms, rivers, lakes or set pieces as
editable objects are superseded (D182, D184).

Claude lets users fine-tune a map in plain language, for example: "add a giant waterfall in the north part of the map that is roughly 20 blocks wide," "make it a bit wider," "move the start closer to the lake," or "put more ruins on the eastern plateau." Requests like these must work reliably, with results that match what was asked.

**Claude steers the generator; it never hand-builds the map** (`PLAN.md`, Product principles; §20 D139, D256). When a request asks for character or new features ("make this valley harsher", "give me a huge dam opportunity halfway down", "put the start under a cliff"), Claude turns it into intentions (outcomes, not recipes; D138) and settings, steering whole-map generation toward them ("describe the map you want" and its candidates); Claude checks the result with the analysis and reports honestly what emerged and what didn't. A request for local change ("make the north mountainous", "add a big waterfall") uses the forces instead. Requests that change the map's character ("harsher", "more vertical", "more varied") steer too, through settings and a new map (D145; an edited map stays saved beside it, D336). Editor operations, below, are for precise edits the player asks for ("move the start here", "widen this river by two", "delete that forest") and for precise follow-ups ("make it wider"). Where this section's tables name a builder as a character word's lever (a huge dam opportunity), M12 steers the generator instead; no dam wall is ever built (D111).

**Describe the map you want** (D139). A player types a sentence. Claude turns it into intentions; the generator makes several candidates steered toward them; the analysis checks which really have them; Claude shows the ones that do and says honestly what didn't emerge. Editor operations only for small touches the player asks for. The first good candidate appears quickly, and more stream in behind it while the player looks; progress is shown, and the player can act on the first result.

**Principle.** Claude never edits terrain or voxels directly. It proposes steps (below; `PLAN.md` §20, D89) that the app expands into operations from the map document, mostly adding and updating features and set pieces, as JSON that matches a published schema. The app validates the operations, applies them to a preview copy, runs validation, and shows a before/after comparison for the user to accept or reject. Accepted operations join the normal edit list and undo like any other edit. Because features are parametric, anything Claude builds stays editable by hand.

**Spatial language.** The app, not Claude, resolves places and sizes, so results are consistent. The resolver returns the area, how it read the words, and every assumption it made:
- Compass places use the editor's compass (north is up). "The north part" means the northern third by default; "north edge," "center" and "northeast corner" each have a defined area. Non-square maps use the same fractions of each side.
- Places relative to features: "near the start" (20 tiles), "close to" (12), "next to" (8), "far from" (40 or more), "closer to the lake" (nearer than now by at least 3), "between the lake and the start," "along the river." A reference to a kind ("the lake") picks the one this conversation made, then the player's own, then the one nearest the start, and says so.
- Places along a river are measured along its flow (`PLAN.md` §20, D84). They are always resolved from the river's actual flow, never from the compass: each river's course in flow order, read from its settled water surface (else its bed), with its tributaries and a name for each ("the main river," "the north tributary," "the river from the east edge"):
  - "upstream" and "downstream" of something: the part of the river's course above or below it (the upper or lower third when nothing is named; "just upstream" is within max(12, 15% of the river));
  - a position along the course, measured from the source: "halfway down" is 0.4–0.6 of the course by default ("halfway down the north tributary" is 40–60% of its length, "near the mouth" 75–100%);
  - banks, relative to the flow: "the start's bank" is the side of the river the start is on, and "the opposite bank" is the other side;
  - "this valley": the selected feature's valley, otherwise the main river's.

  Every theme flows west to east today (D67), so "upstream = west" would pass every test on a generated map and still be wrong for drawn rivers and for Delta's channels.
- Sizes are in blocks, matching what users see on the map grid. "Giant," "small," "a bit wider" map to defined ranges relative to the map's size and to the achievable ranges the builders publish (`PLAN.md` §9.10), documented in the schema. For example, a giant waterfall is 30–40% of the side along its lip, "roughly 20" is 20 ±3 (a number means ±max(3, 15%)), and a bit wider is +25% (D96). A dam opportunity's sizes are in the judgement-word table below (decisions-pending #46).

**Judgement words.** Words that judge the map ("harsher," "a huge dam opportunity," "a dangerous badwater route," "lush") map to measured targets, so the same word always does the same thing (`PLAN.md` §20, D84). Each word has:
- **targets:** metrics the batch tools already measure (`tools/settings-suite.ts`, `src/core/analysis/metrics.ts`), such as reservoir volume, badwater distance, the water stored near the start and the berries near the start;
- **a direction** for each target;
- **a size, relative to the map's current value and the official range** (`investigation/calibration.json`, 19 official maps): a target moves a quarter of the way from the map's current value to the far end of the official range (p90 going up, p10 going down). "A bit" is an eighth of the way, "much" half. A map already past that end only has to move in the word's direction, and the report says it was already outside the official range. No target goes past a setting's hard bounds or a builder's limit (`PLAN.md` §9.10);
- **levers:** the settings (`PLAN.md` §5) or builders that move the targets;
- **aliases** ("tougher," "greener," "deadly," …), and "a bit" or "much" of each.

Playability checks are guards, never traded away to meet a word: every check that passes now must still pass, the advisory start targets included (D91). When a full step would break a guard, the word backs its levers off, riskiest first, and the report says what was held back. It also says when a word's settings are already at their limits, or when its theme is marked weak for it (roomier on Canyon: the walls fix the floor, so a landform or a moved start is offered instead). Judgement words change the map's settings, which make a new map; the edited one stays saved and one step away (edits never replay onto new land, D336). A word used about part of the map ("make this valley harsher") is applied map-wide and reported as map-wide (D94; decisions-pending #43).

| Word (opposite) | Targets and direction | Levers | Official range (p10 / median / p90) | Guards and limits |
|---|---|---|---|---|
| harsher (easier) | clean flow strength down; badwater-to-clean strength up; water stored near the start down; trees and living bushes near the start down; trees and bushes per 10k tiles down | River flow, Drought reserve, Badwater, Forest density, Berries near start, Berry bushes elsewhere | badwater ratio 0.36 / 0.65 / 1.86; trees within 20 of the start 47 / 117 / 172; bushes within 20 of the start 6 / 47 / 80 | Stored water never below the drought need × reserve (`water.reservoir`); trees, bushes and water near the start never below the start rules. |
| huge (small) dam opportunity | the best dam site near the start: its reservoir's volume and its volume per dam tile, up (small: a smaller site) | the dam-site builder (`PLAN.md` §9.1), at the place asked for | best dam site's volume per dam tile 65 / 471 / 4,479 | Huge: at least twice the map's current best dam site near the start, and a volume per dam tile at the official median or above. Small: it still holds the drought need × reserve, and less than the current best. The basin stays under 15% of the map and off the map edge. |
| dangerous (safe) badwater | badwater-to-clean strength up; badwater's distance from the start down (safe: the reverse) | Badwater, Badwater distance; a badwater basin's strength (1–3) and place | ratio as above; distance 12 / 30.5 / 54 | Never nearer the start than the badwater rule; the start's water stays clean. |
| lush (dry) | trees per 10k tiles up; bushes per 10k tiles up; clean flow strength up; natural basins up | Forest density, Berry bushes elsewhere, River flow, Lakes and basins | trees per 10k 402 / 606 / 1,196; bushes per 10k 17 / 44 / 148 | Dry keeps the start's trees, bushes and water within the start rules. |
| wetter (less water) | water share up; clean flow strength up; natural basins of 20+ tiles up | River flow, Lakes and basins, Drought reserve | water share 0.07 / 0.12 / 0.40; basins 2.8 / 12 / 21 | The water share stays under `water.no_flood`'s cap. |
| rugged (flatter) | height range up; cliff share up (flatter: both down) | Relief, Terracing, Waterfalls | height range 10.8 / 13 / 15; cliff share 0.09 / 0.16 / 0.19 | Terrain stays within the map's limit: 16, or 22 at high Verticality (`PLAN.md` §5.9). |
| richer (poorer) | scrap per 1k tiles up; trees per 10k tiles up | Ruins and scrap, Forest density | scrap per 1k 152 / 281 / 724 | Ruins stay the ruin rule's distance from the start. |
| roomier (cramped) | land walkable from the start up; flat share up | Buildable land, Relief | walkable land 1,007 / 1,296 / 4,523; flat share 0.36 / 0.52 / 0.60 | Cramped never goes below the buildable-land rule. |

Words without a measurable meaning ("more interesting," "nicer") are answered with concrete options.

**Query tools.** Claude asks the app questions before proposing anything. Both delivery routes let Claude call functions the app defines: tool use in the Messages API, and page functions passed as tools to the artifact's `sample` capability. So queries are tools, not a text protocol:
- `resolve_region` ("north third") returns an area and what's in it;
- `find_sites` finds candidate locations (e.g. "a cliff site at least 20 blocks wide in the north third, away from the start");
- `measure` measures distances, heights and widths;
- `list_features` returns the features with their parameters;
- `limits` returns the achievable ranges for a set piece here;
- `dry_run` applies a proposal to a preview copy and returns the validation report and measurements;
- `propose` submits the final step list with its expectations.

`find_sites` plans every candidate with the real builders, checks it with a real build, ranks the candidates, and returns the nearest alternative when none fits.

**Steps.** Claude proposes steps, not raw operations (`PLAN.md` §20, D89; decisions-pending #41). A step names what to build and where, in words or numbers ("addSetPiece damSite halfway down, size huge"), or takes a site `find_sites` returned, ready to use. The app expands it with the editor's own planners, so a step fails with the planner's reason, never with a broken map. The groundwork (`investigation/claude/`) has 17 step kinds: `changeSettings`, `addSetPiece`, `changeSetPiece`, `changeFeature`, `addSource`, `changeSource`, `addResource`, `removeResources`, `placeObject`, `remove`, `moveFeature`, `moveStart`, `deleteFeature`, `sculpt`, `brush`, `carve` and `undoLast`. `brush` paints a place, or one stroke along a path; a Lower stroke from water, or from a source, carves a bed the water follows (D184). It takes the brush kit's options: Flatten's `steps` (terraces) and ramped `edges` (D204); Smooth lays no slopes (D247: a slope is `placeObject`'s slope). `changeSource` sets sources' strength, a river's at its mouth (D196). `placeObject` places one of the shelf's objects, at a tile or where it fits in a place, turned; `remove` is Remove over a place, with its filters; `moveStart` takes a `facing`, the start's door (D184). `carve` is the editor's Carve (D199), from a tile or the highest dry ground of a place, with its options and a `path` (Try another path); given a place, a course that would break a check passing now tries another path, then the next highest dry ground there. A river is a source and such a stroke; a lake is a hollow dug with `brush` and filled by `addSource` with `fillHollow`. Steps that add landforms, rivers or lakes as objects are refused with that advice. M12 adds `addMapObject` and the M7 set pieces (`ROADMAP.md` M12). A proposal has at most 12 steps and changes at most 30% of the map.

Tool results stay small. The artifact caps a tool result at 32 KB, a tool's input schema at 4 KB and a whole request at 64 KiB. So the map summary Claude starts from is feature-level and at most about 16 KB, and details come through the tools. A text version of the same messages remains as a fallback for a view where tools are unavailable.

**Intent checks.** Every proposal includes the measurable expectations behind the request, e.g. `{feature: waterfall, width: 20 ±3, location: north third}`. After applying the proposal to the preview copy, the app measures the actual result and compares:
- the width of the falling water in the water preview: lip tiles with any water on them (deeper than 0.001) and a drop of at least 1.5;
- where the feature ended up.

A mismatch goes back to Claude to revise, just like a validation failure.

**Loop.** Request → queries → proposal with expectations → the app applies it to a preview, validates and measures → revise if anything fails → the user sees the result with a short plain-language report. Each round is a paid request on the user's plan or key, which is why the cap matters. A round is a `dry_run` or a `propose`. A request with one goal gets 3 rounds and 10 tool calls; each further goal Claude declares (in its first `dry_run` or `propose`) adds 3 calls, and every second one a round, up to 6 rounds and 20 calls (`PLAN.md` §20, D93; decisions-pending #28). The budget never shrinks, and every tool result carries what is left. The report says what was built, with measured numbers, and anything that differs from the request, for example: "Added a waterfall in the north, 20 blocks wide with a 9-block drop, fed by four new springs (2 blocks/s: a thin sheet; a full official-looking fall needs about 8 blocks/s, twice this map's river flow). It drains into the existing river. Cleared 34 trees."

**Compound requests.** Requests are often compound and vague, for example: "Make this valley harsher. Put the start upstream, give me a huge dam opportunity halfway down, and create a dangerous badwater route on the opposite side." Claude breaks such a request into bounded operations, and the engine tells it whether each idea is feasible (`PLAN.md` §20, D84). The builders, limits, `dry_run` and intent checks already cover a single request; a compound one adds:
- **Goals.** Claude splits the request into goals, each with its own measurable expectations (the judgement-word targets, places from the resolver, sizes from the builders' ranges).
- **Order.** Settings changes come first, then placements. A settings change makes a new map (edits never replay onto new land, D336), so Claude's placements are made on it after the change, never carried across. The app applies the steps in its own order, each on the map the previous ones left, and says so when that differs from Claude's: settings, deletions, the start, moves and changes, sources, dam sites and gorges, falls and cliffs, badwater, sculpts and brushes, a hollow's spring, resources (D90).
- **Combined check.** Every goal's expectations are checked against the combined preview, not one at a time. The app measures them; it never takes Claude's own expectations as the result.
- **Interference.** The engine detects goals that interfere and names them. For example: badwater joining a river above a dam site poisons the reservoir (through its outlet, its channel, or the reservoir rising over it); less flow shrinks a reservoir, and fills it more slowly; badwater near the start breaks the start rules. It also names a new piece shrinking an existing reservoir, a regenerated map moving the start (D95), a builder's reduction, what a step cleared, and settings being map-wide.
- **Guards** hold for the whole proposal (D91): a step that breaks one is named.
- **Feasibility.** When a goal isn't feasible, the tools return the reason and the nearest feasible alternative (a place or a size). Claude offers that alternative in the report and never substitutes it silently. Only a builder's reduction within the goal's tolerance is built, and reported, for example a 20-wide fall reduced to 19 (D92).
- **Report.** It names every trade-off and every goal that wasn't met.
- **Budget.** The loop's cap grows with the number of goals, up to a ceiling (Loop, above). The other option, building the goals one after another with a check each, is recorded in `docs/decisions-pending.md` #28.

**Follow-ups.** The conversation keeps track of what Claude created, so "make it wider," "move it a bit east" or "undo the waterfall" refer to the right feature. Users can also select a feature on the map and ask about it ("make this lake deeper").

**Ambiguity.** For normal requests Claude picks a sensible interpretation, does it, and states its assumptions in the report. It asks a question first only when interpretations would lead to very different maps, or when the request would break playability (for example, a waterfall that would flood the start). A goal that can't be met without breaking a start rule is not built, as asked or bent: the report offers the nearest version that keeps the rule, or Claude asks when no version does (D84; decisions-pending #42).

**Other uses.** "Explain this map," "why does this fail validation," and "suggest improvements" (answered with proposed operations the user can apply). A question gets an answer, not a proposal: the summary carries each failing check's message.

**Safety.** Treat Claude's output as untrusted input:
- schema validation, bounds checks, a cap on operation count and area per proposal, and no code execution;
- every tool checks its own arguments, because the artifact route does not enforce tool schemas and the API's strict mode cannot express numeric bounds;
- text inside map names or imported files is data, never instructions.

**Delivery.** The audit checked Anthropic's current documentation (sources in `AUDIT.md`) and evaluated both routes.

*Route A: the Claude artifact edition.* Dam Good Maps is published as a Claude artifact whose Claude calls count against each user's own plan.
- **Page:** one self-contained HTML page of at most 16 MiB. Scripts load only from cdnjs, jsDelivr (`/npm/` paths), unpkg and the Tailwind and jQuery CDNs. `fetch`, XHR and WebSockets reach only the page's own origin, so the page cannot call the Anthropic API or any other host.
- **Calling Claude:** through the `sample` capability.
  - The viewer's own plan pays. Viewers sign in and consent on the first call, and rate limits apply.
  - The page picks a model tier (quick / default / complex), not a model id. There is no system prompt, and input is capped at 64 KiB.
  - Page functions can be offered as tools. `sample.json` parses but does not check the reply against a schema.
- **Downloads:** a page cannot start a download itself. The `downloads` capability saves files after the viewer confirms, but its extension allowlist has no `.timber`. The artifact edition therefore offers a `.zip` holding the `.timber` (decision D10), and the install help says to extract it. Project files save as `.json`.
- **Storage:** per-viewer browser storage works but may be unavailable. The `db` capability, a shared JSON store with documents of at most 256 KiB, makes an artifact organisation-internal. The editor therefore autosaves to browser storage and never uses `db`.
- **Sharing:**
  - Viewers need a Claude account.
  - The help center says artifacts that use Claude cannot use "Anyone with the link" on Team and Enterprise plans.
  - For Pro and Max, the help center and the Claude Code docs disagree about public links.
- **Verdict:** partly as described. "Claude calls count against the user's own plan" holds. The rest needs changes: the download must be a `.zip`; queries become tools, not a text protocol; and public sharing, Web Workers, and opening a local `.timber` must be proven by the spike below.

*Route B: bring your own API key on the standalone site.*
- **Browser calls:** the Messages API accepts calls from a browser when the client opts in: `dangerouslyAllowBrowser: true` in the TypeScript SDK, which sends the `anthropic-dangerous-direct-browser-access` header.
- **Key risk:** the official docs warn that a key in a browser can be extracted, and call it low-risk only for internal tools and short-lived keys. Mitigations:
  - the key stays in memory by default, with an opt-in "remember" that stores it in browser storage and says so;
  - suggest a key with an expiry (the Console can create one);
  - set a strict Content-Security-Policy with `connect-src 'self' https://api.anthropic.com`;
  - load no third-party scripts at runtime;
  - never log the key or put it in a URL.
- **Schema-shaped output:** structured outputs are generally available. Strict tool use (`strict: true`) guarantees schema-shaped operations. Its JSON Schema subset drops `minimum`/`maximum`, `minLength`/`maxLength` and recursive schemas, so bounds stay in the app.
- **Model:** configurable. The default is the starting point the models overview recommends; at audit time that was `claude-opus-5-5`, with `claude-sonnet-5` as the cheaper choice.
- **Prompt caching:** cache the stable prefix (instructions, schemas, map summary).
- **Verdict:** works as described, with the mitigations above.

*Recommendation* (decision D8 in `PLAN.md` §20):
- One `ClaudeBridge` interface with two adapters.
- The model layer is provider-neutral (D140): the engine, tools, checks and the steering principle don't depend on the model, and only a thin adapter talks to the model API. Claude is the default and the only provider built in M12. The design leaves room for an OpenAI adapter (a player's own OpenAI API key) later, tested with the same request suite before it's offered.
- Build the Messages API adapter first. It also runs the Claude request suite in Node.
- Ship bring-your-own-key as an advanced option.
- Then ship the artifact edition as the no-key route, once the spike passes.
- The standalone site works fully without Claude.

*One codebase, two builds.*
- The platform adapters of `PLAN.md` §19.9 (files, storage, workers, claude, download naming) are the only differences.
- `vite build --mode artifact` produces one HTML file with everything inlined and workers as blobs.
- It declares only the `sample` and `downloads` capabilities, because `db`, `assets` and `mcp` would each rule out public sharing.

*Spike (roadmap M3).* Publish a test artifact. It must prove:
- a blob Web Worker runs;
- a file input reads a local `.timber`;
- `downloads.save` saves a `.zip`;
- `sample` works with tools on the quick and default tiers, with measured latency;
- the artifact can be opened by others on Kyler's plan, including by public link.

Record the results in "Editor decisions".

*Spike results (M3).* See [docs/spike-m3.md](docs/spike-m3.md) and decisions D8, D10 and D41. The
page is published privately at <https://claude.ai/artifact/Dkm1eoXZ6KvPwjBBc6JiRp>.
- Blob workers, file open and the `.zip` download all work under the artifact's rules.
- Route B's browser calls pass CORS with the direct-browser-access header.
- `sample`'s latency and who can open the artifact wait for Kyler's own run of the page.

## Architecture

- **Module boundaries** (the same tree as `PLAN.md` §3):
  - `core`: spec, features and rasterization, set-piece builders, format I/O, the map document, the operations engine, validation, the water simulation;
  - `generator`;
  - `render3d`, shared with the generator's preview;
  - `editor-ui`;
  - `render-2d`;
  - `sim-worker` (water preview and background validation);
  - `claude-bridge` (summary builder, schema, tools, proposal loop): `src/claude/`, with its Messages API adapter in `src/platform/claude/` (`ROADMAP.md` M12);
  - `platform` adapters.
- The operations engine and feature rasterization are headless and fully testable without the UI.
- Determinism: the same document always produces a byte-identical `.timber` file (`PLAN.md` §19.7).
- 3D rendering (`src/render3d`, `PLAN.md` §20, D45):
  - chunked meshing (32×32 chunks) with remeshing of dirty chunks only;
  - a voxel mesher only for columns with more than one solid run (1% of official map columns, up to 58% on one workshop map);
  - instanced trees, bushes and ruins;
  - picking against the heightfield and the features for direct manipulation;
  - the shelf (D184): each object's picture is drawn once by the view itself (the object's model in
    the map's look, into a small render target), and the ghost under the pointer is the object's own
    model, tinted green or red; a source the pointer targets glows (D249);
  - the minimap (D205): the Real places top-down picture (`core/render/shade.ts`, one pixel a tile),
    drawn again when the page is idle after an edit or its water settles, never per frame; the
    outline is the view's four corners carried to the ground at the camera's target level;
  - camera bookmarks (D205): the renderer's view (mode, turn, tilt, distance, target) kept per slot
    in the document's meta (`views`), never an edit, taken by the autosave; a glide eases there in
    about half a second (at once with reduced motion);
  - the game's layers (D196): one uniform cuts the world above a level; the terrain's vertices are
    clamped to it (walls above it fold away, the cut tops lie on it, hatched), water and objects above
    it are not drawn, and picking lands on the cut. As the game steps it (D207,
    `LevelVisibilityService`): down from the whole world, the highest layer that hides anything
    (the map's top less one); up past it, the whole world; the pick (Alt+middle-click, the game's
    binding, and Alt+click) cuts at a tile's visible level when it is below the layer showing,
    and otherwise shows everything. Under a cut the brushes leave the ground above it as it is
    (its tiles are the stroke's kept tiles) and never raise past it; the Select tool's actions
    likewise;
  - clear water (D196, D212): one uniform clears all the water (T), another the water round the brush
    or the shelf's ghost while it is over water (the view decides from its own water, `clearNear`);
    clean water keeps a faint blue tint, its ripples and a bright shoreline, badwater its own colour,
    half see-through, with dark diagonal stripes (the shared water palette's `CLEAR_WATER`);
  - each source's upwelling (D196): a texture of the sources' middle tiles, read by the water shader
    for its rings and bubbles, and brighter for the sources the water under the pointer comes from;
  - juice (D205): a puff of dust and a source's rings are a few particles and two rings, alive for
    under a second; a placed object's pop and wiggle scales its own instance; a force's moment
    (`forces.ts`: an impact's streak, flash, ring, dust and blocks; a fault's crack and dust; an
    eruption's plume and its heat on the terrain shader; no camera shake, D265) plays on its own clock
    from fixed pools, at the force's showing's pace (Fast or Slow forces, D321), never the water's speed. None of them play with reduced motion or
    in software rendering. Every tree stands upright on its tile, a knocked-down one as its dead model (D321, item 7: a force's
    knocked-down tree whose ground it broke is gone, `settleKnocked` in `core/forces/objects.ts`). The sounds
    are Codex's second round (#64), ported into `src/editor/juice/` (`engine.ts`, `palette.ts`,
    `calibration.ts`, `bank.ts`): recorded CC0 foley (24 files, 1,090,848 bytes at 256 kbps, D313's
    re-encode from the round's original 192 kbps, in `public/sounds/juice-2/` with their manifest and
    provenance, `SOUNDS.md`), fetched and decoded on
    the first click or key (four at a time; the audio context itself is made as the editor opens,
    since opening the audio device blocks the page for a few hundred milliseconds) and played by the browser's own audio thread (buffer
    sources, held beds as pre-crossfaded loops): no synthesis on the page, no worklet. One engine for
    the editor's lifetime, never waited on: a sound asked for while the bank loads, while paused or
    off, or past the limits (72 recordings, 20 sounds, four held beds, ten accents a second) is
    dropped, never played late. A compressor and a bounded curve keep every sample below 0.92 of
    full scale. A force's phases play under its run's id, so undo stops all of it at once; the
    page hidden stops everything and sleeps. A sound's distance comes from where it is in the view:
    on screen, what is being edited, it plays at its full level at any zoom; off screen it fades and
    softens. Smooth's recipe is a softer, higher, shorter relative of Flatten's own scrape recording,
    not its earlier leaf-bed (D313, a family with Flatten). The player's volume (0.54 by default,
    a quarter lower than the round's original 0.72, D313) and off switch are kept as saved
    (`dgm.sound`); a volume saved before D313 is kept exactly, never lowered to match.
- The forces (D203, D206, D220): one shared core in `src/core/forces/`, from Codex's forces core (#59):
  `force.ts` (a run on its own copy of the map, a step at a time: ten steps a second of a carve,
  whatever the frame rate), the shared numbers, rock and object rules (`random.ts`, `rock.ts`,
  `objects.ts`), the verbs (`carve/`, ported step for step from #47 and checked by
  `tools/carve-equiv.ts`; `craterize.ts`, `erupt.ts`, `quake.ts`, ported from #59 and pinned to its
  45 parity cases), the staged runs that show Craterize, Erupt and Quake a stage at a time
  (`runs.ts`: planned a few rows a step, then the bowl and its debris, the swell, the fault's front or
  the slide), the operation (`op.ts`) and its literal result (`result.ts`). Carve's run is worked out whole, a
  slice at a time, each step's changed tiles and the objects its cut took recorded, then played back (`carve/play.ts`,
  D321); its water no longer runs while it cuts (the head's surge is the effects'), and its fan's height reads the water
  as it was, so the land is the same at any pace (164 carves checked against the earlier code: the same land). Erupt is the prototype's
  volcano, reshaped by D321's item 14 (its crater deeper, its apron's reach 1.75 radii and thickest along its lava
  lobes, its lava ridges fading out by it, lone tiles settled), where it has the room under the map's ceiling;
  where it hasn't, `eruptAnatomy` fits it (D226): every level it raises (cone, apron, ridges) scaled
  together so its summit reaches the ceiling at most, broader rather than taller while Size follows
  Power (at most 1.25 times since item 14, never so broad that a low peak's top spreads past a few tiles), Auto's
  summit a peak when it keeps less than three quarters of its rise; with too little room at the vent
  (under four levels) it erupts from its flank, the nearest place with room (the seed choosing
  among the nearest); a fissure rises less where its line is high; at the ceiling with no flank near,
  "No room to rise here", the one word the page shows from the same fit (D258: no preview on the land). Its swell is 28 stages
  (about 1.5 seconds at its own pace, D312), so the land rises with its plume and glow; an object on its flanks changes
  as the heat reaches it. Each size control (Carve's Width and Depth, Craterize's and Erupt's Size) follows Power (Auto)
  until its slider sets it; a set size is kept in the operation's settings (`depth`, `size`; absent
  in operations from before D226, which replay as they were). Unleash (D239, `carve/unleash.ts`) is a
  Carve run from a placed source: `breakout` finds where the water it stands in would spill over (or
  where the rim is nearest an aim), `unleashWidth` its width from its strength; the run keeps the
  source (`unleashed`, adding none) and paints its water as the source's (badwater for a badwater
  source); its operation names the source (`where.source`). The map's hidden rock is
  derived once from the map as opened (never rerolled); fresh volcanic rock comes from the forces'
  operations. What is kept is always the plan's final map, touched by the build's own integrity pass
  in the worker, so the last stage is exactly what the build keeps. The editor's worker works a force out a
  slice a call, then shows as many steps a frame as the page asks (`forceStart`, `forceAdvance`, `forcePaint`,
  `forceStop`, `forceCancel`, `forceAgain`; no second history or water owner); its frames carry the ground and the
  objects, never water (D321, item 30), and say once it is worked out (`planned`) how many steps show it (`total`) and
  how many have (`shown`). A staged force's operation keeps that `total` as its `steps` (`stagedParamsOf`, D366),
  never how many slices its planning took, so the same gesture is the same operation on a quick or a busy machine;
  the forces' maths is the portable maths (`PLAN.md` §2.1), so it is the same in every browser. The page paces them (`forceDriver.ts`, D321, item 29): Fast, its land final within
  `FAST_MS` (two seconds) of the gesture, or its own pace where that is quicker; Slow forces, `WATCH_FACTOR` (four) times
  Fast's own; a frame that fails to show never stops a force, and a worker that fails takes all of it back, as undo
  would. **Undo at any moment leaves the map exactly as it was before the gesture, and nothing lands afterwards**
  (D341); **Esc skips a playing force to its end, and cancels a gesture still drawn** (D344, A4: `ForceDriver.escape`,
  the keep of `stop`, or `cancel` for a painted Lift not yet let go): each force the page starts is a gesture with its own name (`ForceRequest.gesture`), and
  `forceCancel(gesture)` holds the rule in the worker whatever it has reached: not started yet, it never starts; at
  work, it is dropped; kept already (Esc came while its keep was on its way), it is taken back as if never kept,
  its step gone and Redo as it was (`MapSession.mark`, `stepSince`, `takeBack`), while that step is still the latest.
  The page's keep sends nothing once Esc has come; Revert stays live while a force is being kept. The driver's time
  is a clock it is given (`ForceClock`): `tests/contract/forceEsc.test.ts` steps it and presses undo, and Esc, at every moment
  of every force's run, in Fast and Slow forces. `tools/bench-forces.ts` times the worker's own cost; `tests/e2e/forceSpeed.spec.ts` checks through the
  page the showing the driver plans for Fast and Slow forces (never a busy machine's wall clock, D341; it prints the times, and with `DGM_BENCH_FORCES=1`, each force's largest case at 128² and 256²). Which builds show the forces:
  `src/editor/release.ts` (D219).
- "Move the start here" (D204, one label since D323): after a Flatten stroke the page looks, once it is idle, for a spot on
  the stroke's level ground where the district center stands (its footprint and door level and dry,
  nothing standing there); the start's full check (the walks to water, wood and berries) runs in a
  small worker of its own, so the page never waits for it.
- Keep worker messages small: send dirty regions and compact arrays, not whole documents.
- Hosting: a static site on GitHub Pages under the timbermods organization, built from the Dam Good Maps repository. The same code also builds the Claude artifact edition (Claude integration).

## Testing

- **Unit:** every operation and feature type applies and undoes correctly; features rasterize deterministically; operations serialize losslessly; orphaned edits are detected.
- **Property tests:**
  - random operation sequences, then export, re-import and compare;
  - undoing everything returns the exact starting map;
  - rivers drawn in random directions always flow downhill to an outlet and keep their water;
  - an incremental rebuild equals a full rebuild.
- **Validation parity:** the editor's validation gives identical results to the generator's for the same map, including on all 19 official maps, with multi-tile emitters and blockers handled by their footprints (`PLAN.md` §11.5).
- **Import:**
  - every voxel-format map from the investigation (official, dev and workshop, 0.7 to 1.1) imports, renders and validates;
  - with no edits, each re-exports its normalized world byte for byte (`PLAN.md` §19.6);
  - the two 0.6 heightmap maps import through the `Heights` conversion;
  - the 90-layer workshop map keeps layers 0–21 with a warning, as the game does, and exports with the standard 23 layers;
  - a pre-1.0 map without `WaterSimulationMigrator` has its strengths halved at import.
- **Performance budgets on 256×256** (revised by the audit; adjust in "Editor decisions" if measurements differ, with reasons). Under Kyler's one rule (`PLAN.md` §20, D115) they are information, reported at each step; what blocks is what a player feels: the editor stays responsive, tool feedback comes within a frame, slower work runs in the background, and the page never freezes.
  - tool feedback within one frame (16 ms), with lightweight proxies while dragging;
  - a feature edit committed (rasterize and remesh the affected chunks) in ≤ 100 ms;
  - instant checks ≤ 50 ms;
  - a dirty-chunk remesh ≤ 5 ms per chunk;
  - the water preview after a local edit ≤ 2 s (warm start); CI reports it as a number, never a failed build (D145);
  - the canonical full settle for export ≤ 3 s as the target. The audit measured 6.5–11 s for an unoptimized JS port from empty (`PLAN.md` §10).
- **End to end** (e.g. Playwright): generate, edit, export, re-import, compare.
- **Claude request suite:** 120 requests (`tests/claude/requests.json`), each with its map, its goals and their expectations, whether it is feasible, what the report must say, and a reference solution (`PLAN.md` §20, D88). The kinds: the requests below word for word, simple, follow-ups, compass, feature-relative, flow-relative, judgement and size words, compound, vague, impossible, conflicting, questions and safety. The maps: generated maps of 48², 96², 128² and 256², rivers drawn in each direction, tributaries, and imports.
  - The reference solutions run in CI through `MapSession` with the real validators; every one must pass.
  - Reference solutions for character and feature requests, Kyler's flagship requests included (the giant waterfall and the compound request; D145), steer whole-map generation or use the forces for local change (D256) instead of building features with planners (D139). A request whose steered solution needs a capability that doesn't exist yet (M9's intentions) is marked "waiting for capability", not failed, and is checked from the step that provides it.
  - Every step before M12 that adds a way to edit or understand maps adds its requests, with reference solutions, and re-runs the whole suite so it stays green (D134). This is suspended while Kyler refines Dam Good Maps (D277): the suite leaves the regular checks and stays in the repository unmaintained until M12 begins.
  - "Describe the map you want" requests (D139): the candidates shown really have the intentions, and the report names the ones that didn't emerge.
  - With a key, the suite runs nightly in Node through the Messages API adapter, with the same prompts and tools the artifact edition uses and the artifact's limits on (64 KiB input, 32 KB results). It checks expectations against the achievable ranges (`PLAN.md` §9.10).
  - Include at least:
    - "add a giant waterfall in the north part of the map that is roughly 20 blocks wide", on 128² and 256²; on 96² it must fit, and on 48² it must report the reduction to 19;
    - "make it wider";
    - "move the start closer to the lake";
    - "add a dam site near the start";
    - "put more ruins on the eastern plateau";
    - "keep badwater in the south";
    - "make the map harder";
    - the compound request, word for word, on 128² and 256²: "Make this valley harsher. Put the start upstream, give me a huge dam opportunity halfway down, and create a dangerous badwater route on the opposite side.";
    - the same request on a map whose river doesn't flow west to east: a drawn river, and a Delta map (M7);
    - an impossible one: a huge dam opportunity on 48². It passes only if the report says honestly what couldn't be done and offers the nearest alternative;
    - a conflicting one: "put a badwater spring just upstream of the start". It passes only if the start rules hold, and the report or a question says why;
    - the workshop catalogue's requests (a spiral mountain or quarry, an island in a moat, a heart-shaped lake, a badwater volcano, twin waterfalls, a hanging lake on a mesa, a mesa field, a river split round an island, a less obvious dam site, a more surprising map), listed with their builders in `ROADMAP.md` M12 (`PLAN.md` §20, D87).
  - A request passes when the result validates, every feasible goal's expectations hold on the final map (measured by the app, never by Claude's own expectations), no guard broke, and the report accurately describes what changed, naming every goal not met with the nearest alternative offered. A compound request passes when every goal meets its expectations on the combined result, the map validates, and the report accurately names each trade-off. An optional judge model checks the report against the request's must-say list.
  - The artifact edition gets a manual smoke test on the same requests.
- **Usability tasks, dropped as a formal, timed M13 gate** (PLAN §20 D285 (1), 2026-09-27): M13 keeps only the Report a
  problem link, a shortcuts reference and help, and a final performance pass. The tasks below stay useful as an informal
  sanity check, without their timed targets:
  1. Add a river from the north edge that passes near the start.
  2. Add a lake that can be dammed, near the start.
  3. Move the start onto a plateau and make it playable.
  4. Add a ruin field on a hill.
  5. Export the map and fix any warnings first.
  6. The full journey: generate a map from settings, refine it with at least one manual edit and one Claude request, export it and load it in Timberborn.
- **In-game checklist** for the IN-GAME CHECK milestones (deferred, logged as pending in `docs/ingame-log.md`, D11): the map loads, water settles as the preview showed, the district center places, beavers survive the first drought, and edited features behave as intended. Add the audit's checks in `PLAN.md` §18 F (waterfall visibility, sealed river mouths, halved pre-1.0 imports, roofed water in imported maps).

## Contract with the generator

The generator (`PLAN.md`) and the editor are one app. The shared foundations are defined once, in **`PLAN.md` §19**, used by both, and built first (`ROADMAP.md` M1–M3). This section only points there:

| Item | Definition | In short |
|---|---|---|
| Map spec | `PLAN.md` §19.1 | One versioned JSON schema (`MapSpec`) for seed, size, theme, archetype, premise, difficulty, settings, set-piece requests and constraints. The settings panel, the URL codec, `SpecPatch` (a JSON Merge Patch) and Claude all produce it. |
| Parametric features | `PLAN.md` §19.2 | One schema for rivers, lakes, landforms, set pieces, forests, berry patches, ruin fields, map objects and the start. The generator builds every map from them and keeps them in the document as its plan; the editor does not expose them as objects with handles (D182). |
| Set-piece builders | `PLAN.md` §19.3 | One builder per kind (`plan` / `rasterize` / `limits`), used by the generator, the editor tools and Claude. |
| Stable ids | `PLAN.md` §19.4 | Generated features hashed from seed, kind and role; user features get stored UUIDs; entities are hashed from their owning feature. |
| Validation | `PLAN.md` §19.5 | One set of modules with check classes (load, playability, design) and profiles (generate, export, import). |
| Format I/O | `PLAN.md` §19.6 | One reader and writer, import normalization, project files. |
| Determinism | `PLAN.md` §2.1, §19.7 | `build(document)` is pure; per-feature RNG streams; incremental equals full; the canonical water settle for files; the portable maths in `src/core/` and the cross-engine check (`tools/determinism/`, D366). |
| Build order | `PLAN.md` §19.8 | One pipeline for generation and editing. |
| Platform adapters | `PLAN.md` §19.9 | Files, storage, workers, Claude and download naming: the only differences between the website and the artifact edition. |

If anything here or in `PLAN.md` defines one of these differently, `PLAN.md` §19 wins. Reconcile the other text and record the decision in "Editor decisions" (`PLAN.md` §20).

# Part 3: superseded

These were planned or built before Kyler's current decisions. They must not come back.

| Superseded | Replaced by |
|---|---|
| "Edit features, not blocks": landforms (hill, plateau, ridge, canyon, valley, island, terraces), set pieces, forests, berry patches and ruin fields as objects with handles; presets | D182, D184: the brush kit; the left shelf |
| Plan, confirm and place: a preview, then a Place click | D179: every edit live |
| The river tool (clicked or drawn from source to outlet, its start and end rules, Natural or exact, width, depth and strength) and the lake tool (basin, rim and sill, click-fill) | D184: smart Lower and Source; lakes, falls, joins and branches emerge |
| The Channel tool; separate plant brushes (forest, berry) | D184: smart Lower; trees and bushes from the shelf, click one or drag many |
| The name Demolish | D184: Remove |
| The Remove tool (X, its filters, its drag and its red hover); Select's Clear objects | D288: Select and Delete; Delete on what the pointer is on |
| The forces' mode switches (Unleash or Aim, Strike or Aim, Vent or Fissure); Carve's Defy gravity, its mid-carve Stop, and Quake's Side that moves control | D289: the gesture is the mode; an aimed carve cuts through rises instead; D309 confirms Defy gravity and the mid-carve Stop stay gone; X flips Quake's side |
| The Orbit and Top-down pair; the Dam sites view, the map card's best dam site and the preview's hatched dam site; the Moisture and Drought views | D287: one Top-down toggle; the land shows moisture; the water bar's Drought, day by day |
| Terrace and Ramp as separate brushes | D184: Flatten "in steps"; D247, D322: Ramp is the shelf's Slope |
| Precise mode, hold to dig and its "stop at" level (D193, item 8's Up to level and Down to level) | D322 (item 37): Raise, Lower and Flatten's target level, exact with hard edges, as the game's editor |
| Flatten's Ramped edges (D204, D270) | D322: the game editor's hard-edged Flatten; a walkable edge is the shelf's Slope |
| The shared Clear sources toggle | D322 (item 31): each brush's Sources, Ride, Keep or Clear |
| Shift+scroll over a source for its strength | D322: Ctrl+scroll over a source; Shift+scroll is the brushes' target |
| Four text tabs (Land, Water, Resources, Start), the inspector, simple and advanced mode, the Advanced checkbox, the Show dropdown, help paragraphs | D184: the top bar, the left shelf, the view buttons, smart defaults |
| The health pill, and a confirmation before exporting with warnings | D184: the quiet dot; never a pop-up |
| The legend always beside the map | D184: only while an overlay is on |
| Busy cursor readouts (the river's width, depth and cuts) | D184: the land shows it; the precision tools keep their live dimensions (D183) |
| A stamp library of placeable set pieces (built-in and user stamps, with export and import) | D253: removed entirely; the forces reshape land instead |
| Symmetry: mirroring strokes live | D253: Kyler doesn't want it; PERFECT asks that every map feel designed by nature |
| Regenerate an area, with constraints; locks and their conflict rules | D253, D254: the working area protects what the player likes while every tool still works on the rest |
| Claude as a panel; Claude steps that add landforms, rivers, lakes or set pieces; Claude locking or regenerating an area | D139, D187, D256: a summoned chat box; steering whole-map generation and the forces for local change, the brushes only for precise edits |
| Terrain above 16 as a non-goal | D172: up to 22 on tall maps |
| Tablet and touch support as a later goal | D185: desktop-first (pen pressure on drawing tablets stays) |
| "Superior to the in-game editor by being easier": the editor as a simpler copy of the game's | Part 1, §1: a studio, deliberately different from the game's precision workshop |
| The milestone list E1–E9 | `ROADMAP.md`: E1–E5 were built in M3–M8; M12–M13 and the 3D stages are built brush-first |
| The audit's change list (2026-09-23) | `AUDIT.md` keeps it |
| D312's Shift+click points for Carve and Glaciate (Enter, Backspace), and Aim's thin straight arrow (D258 (3)) | D321, item 41: a drag draws the path freehand, the line showing as it is drawn; one way to steer |
| A force's second small ring round the cursor, and its ring drawn on the bed under water | D321, item 13: one ring, drawn once where the cursor is, on the water's surface over water |
| Trees knocked down by a force drawn lying along the blow | D321, item 7: every tree stands upright on its tile; a knocked-down one whose ground broke is gone |
