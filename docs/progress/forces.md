# The forces: Carve, Craterize, Quake and Erupt, and the editor's sounds

> **State (2026-09-26, the forces build).** Built on branch `feature/forces` (from `dev` at 985e1cf):
> the four forces as the top bar's forces group on one shared forces core (Codex's #59), the
> editor's sounds on Codex's synthesised engine (#58), their tests, Claude's steps and the docs.
> They show on the preview and the dev server, never on the public site (`FORCES_RELEASED` stays
> false, pending #69). The branch is not merged into `dev` until Kyler has tried the forces (D219).
> Next: the milestone session puts the branch on the preview; Kyler tries it.

Kyler's decisions: D194, D199 (Carve), D202 (Craterize), D203 and D219 (Quake, with both Lift and
Slide), D206 and D216 (Erupt, its plume billowing bigger and darker at high power), D205 and D212
(juice: sounds on by default, quiet, with an off switch), D220 (build on the forces core; hook the
synthesised sounds in). The sources: `investigation/forces-core` (#59) and each force's own
investigation (#47, #51, #50, #52); `investigation/juice` (#58).

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

### The sounds (D205, D212, D220)

Codex's synthesised engine (#58) is the editor's one sound engine (`src/editor/juice/`: `synth.ts`,
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
B24 (a lifted fault) and B25 (a meteor on the start: refused, "Start here").

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
- Stages: 8 for an impact, 14 for an eruption, 8 for a Lift, the travel's tiles (at least 8) for a
  Slide, at the water speed's pace.
- A small render-only shake with the impact and the quake, and a lighter one while a volcano swells,
  on by default (off with reduced motion); no switch for it.
- The prototypes' own defaults for each force's options (Craterize power 55, Terraced, Heavy debris;
  Erupt power 62, Steep, Heavy flows, Ridges; Quake power 60, Lift, Sheer, the left side moving).
- The Power words: Pebble, Meteor, Asteroid, Cataclysm; Cinder, Cone, Volcano, Cataclysm; Tremor,
  Rift, Upheaval, Cataclysm.
- The sound volume: the player's 0.5 is the engine's 0.22 (one scale, so a saved volume keeps its
  meaning); no ambience switch yet (off).
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
