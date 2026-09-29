# Select, Delete, the shelf and shortcuts (batch 3, D323, D328)

Branch `feature/select-shelf` (part 1) and `feature/select-shelf-2` (the rest), into `feature/forces`. Kyler's words for
each item are in `docs/feedback/2026-09-28-forces-preview.md` (on `dev`); the build order is
`docs/feedback/2026-09-29-build-order.md`.

## Done

Part 1:

- **Item 11 with item 32.** Only a file dragged in from outside the page opens a file (`DropTarget`, Editor.tsx). The
  shelf drags with the page's own pointer handling (`Shelf.tsx`): the ghost follows the pointer, the drop places (the
  Start moves the start), and a drag that doesn't place always ends placement. One label beside the pointer for what is
  picked ("Move the start here" / "Place here" / the one reason), none with nothing picked; Esc or a right-click puts
  it away.
- **Item 12.** An edge wall on an edited map is a warning with the one-click "Lower the wall" fix, one undo step.

Part 2:

- **D328 corrected** (`levelFootprint`, `core/doc/placing.ts`). Water and badwater sources stay cut-only (D290). Every
  other object and the start level to the height most of the footprint stands at (of equal shares, the one that moves
  the ground least), cutting above and filling below; where the level would fill a wet tile the footprint is cut down
  to its lowest tile instead. The edge meets the land in slopes of a level a tile out to six tiles, fading by the
  footprint's own biggest move so a steep hillside is left alone; wet tiles, other objects' tiles and caves are never
  touched. One undo step with the placement. Test: `tests/contract/levelPlace.test.ts` (a ruin across a 3-level slope
  moves no tile by more than 2, lays no wall and fills no wet tile; the sources stay cut-only). The water test is the
  map's own settled water (`waterDepth`): D290's code never looked at water, it only cut, so "a tile water flows
  across" is covered by never filling or touching a wet tile.
- **Item 1.** Delete takes what is there: objects and sources (the start too), else the ground's top level (one level
  down, one undo step; `sculpt` gained an optional `exact` so a one-tile pit stays a pit), for a hovered tile or a
  selection. The Selection row's **Delete** is a menu of what stands there with counts; hovering a choice tints it. The
  old sources-only button is folded into it (`RemoveKind` gained `water`, `badwater` and `start`; `removeTakes`).
- **Item 44.** The start can be deleted like any object. A map without a start saves as a project; the checks dot says
  "No start"; Save and Download refuse with "Place a start first: pick the Start on the shelf"; the shelf's Start
  places one again (`placeStart`: a start feature with its bench on a generated map, an entity levelled as a move on an
  opened one). **Clear everything** in the ⋯ menu removes every object, source and the start in one step
  (`clearEverything`). A deleted generated start takes its small bench with it, so the terrain there is as it was
  before the bench; Kyler may want it kept.
- **Item 6.** The Select row: the modes as icons, Raise and Lower one level a click (Up and Down too), the Level number
  starting at the selection's lowest with Flatten, Cut down and Fill up acting at once, the old dig-out folded into Cut
  down, hovering an action tints the tiles it would change, X or Esc closes. Up and Down are claimed from the camera
  only while a selection is open (`renderer.claimKey`).
- **Item 43.** **Whole map** beside the modes.
- **Item 16.** Z undoes, C redoes, X closes the selection. Quake's side flip moved from X to **V** (Q and E are the
  camera's; Z and C were free).
- **Item 46.** A placed source starts at the game's own default: WaterSource 1, BadwaterSource 3 (`DefaultStrength` in
  the blueprints `MapEditor/Water/*.blueprint.json`; the official maps run water 0.25 to 1.5 and badwater 0.5 to 3.0,
  both values among them; `docs/FINDINGS.md`, "Sources"). It was 1.5 and 1.
- **Item 20.** Generate rolls a fresh seed every press; a typed or linked seed is pinned (a lock beside the box, click
  to unlock; clearing the box unpins); the Dice button is gone. With edits kept, the seed stays (the edits belong to that
  map's features). The mismatch: no way to show a stale map was found by testing, but while a map was being made the
  card still showed the old one and Refine and the downloads (which read the worker's latest map) could take the next;
  they now wait while it is made, and a result of an older run is never shown over a newer one.
- **Item 9** (structure only): the tools and the forces are their own rows.
- The shelf's source hints say Ctrl+scroll (batch 2's move); the Undo and Redo tooltips name Z and C.

## Keys (for the shortcuts reference, EDITOR_PLAN §7)

Z undo, C redo, X close the selection, V flip Quake's side, Up and Down raise and lower an open selection, Ctrl+A or
Whole map select all. Batch 2's: Shift+scroll the target, Ctrl+scroll a source's strength, Ctrl+click the target, hold F
to size. EDITOR_PLAN §7 on this branch had no "X Remove" line left (D288 had removed it); §7 now lists the keys above.
After batch 1 lands, one final pass over the shortcuts and first-run hints for its keys. Not done here: adding the new
names to `tools/retired-terms.json` (the old Set level, Dig out, Delete sources and Dice button are named in STATUS,
ROADMAP and PLAN outside §20, which the retired-terms test would fail on): a milestone doc pass can do both.

## Tests

`tests/contract/levelPlace.test.ts`, `deleteStart.test.ts`, `edgeWallEdit.test.ts`, `edges.test.ts`,
`tests/unit/placeTools.test.ts` (item 46), `tests/e2e/select.spec.ts`, `selectRow.spec.ts`, `shelf.spec.ts`,
`generate.spec.ts`.

Updated (D148): `select.spec` (the row's new controls; Set level became Flatten; Delete sources became the menu),
`shelf.spec`'s Delete test (the start is deleted now, bare ground loses its top level, the menu), `notices.spec` (the
two menu choices for the sources), `shelf.test.ts` (the start is a kind now), `forces.spec` (V flips Quake's side),
`levelPlace.test.ts` (uneven ground is filled where dry; the start's test checks the level, not the lowest).
