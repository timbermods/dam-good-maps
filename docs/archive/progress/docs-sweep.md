# Docs sweep: the living docs against the editor vision

2026-09-26, branch `chore/docs-sweep` (a PR into `dev`). A one-time consistency sweep after
EDITOR_PLAN.md's rewrite (Kyler's request; PLAN §20 D188), against the current editor vision and
recent decisions: brush-first editing; no landform, river or lake tools; smart Lower and Source;
the Drought and Badtide buttons beside the separate Weather view; the summoned Claude chat box;
desktop first (D139, D158, D172, D179–D189). History stays as written: where it helps, a short
"superseded" note. No code changed apart from the new guard; no map changes, and the Claude suite
is not touched.

## What changed, file by file

**tools/retired-terms.json** (new)
- The retired terms (D188 (3)): landform tool, river tool, lake tool, Channel tool, Plant brush,
  and from D182 and D184 forest brush, berry brush, resource brush, live shape tool, Terrace brush,
  Ramp brush, Demolish tool, Show dropdown, Advanced checkbox, health pill, and the old tab names
  (Land, Water, Resources and Start tab). Each with its decision and what replaced it.
- What is scanned, the allowed sections (PLAN.md §20, EDITOR_PLAN.md Part 3), the allow markers,
  and `pendingRemoval` (src/editor/Editor.tsx, panels.tsx, tools.ts: the old editor on dev, which
  the Live editing work empties).

**tests/unit/retired-terms.test.ts** (new, in CI's quick suite)
- Fails when a retired term appears in the living docs (EDITOR_PLAN, PLAN outside §20, ROADMAP,
  CLAUDE, STATUS, docs/README, README), `src/` (.ts, .tsx, .css) or index.html.
- Matching ignores case, `**` and backticks, hyphens, underscores and line breaks, splits camelCase
  and takes simple plurals; a blank line stops a match.
- A file in `pendingRemoval` must exist and still hold a term, so the list only shrinks.
- Tests with planted terms: every form is caught, near misses ("riverside tool", "tooltip") are
  not, the markers and the allowed sections work, and an unclosed marker is reported.

**EDITOR_PLAN.md**
- Part 1 §10 ("What's gone") sits between allow markers, and says CI flags those names elsewhere.

**ROADMAP.md**
- How the order was chosen: generated maps open with their plan kept, not "grabbable" features (D182).
- Keep M12 ready: character and new features steer; precise edits are brush-style, never landform objects (D139, D187).
- Overview: the From column of M9, 3D-c, Weather, M10–M13 and Later names EDITOR_PLAN's current sections, E1–E9 dropped.
- Overview: new titles for Weather (the full cycle's timeline), M10 (symmetry and the brushes' extras) and M11 (stamps painted as brushes).
- Overview: #13 marked moot in the Refinement row; a note that M1–M8 and Look use the pre-rewrite section numbers and record the old editor.
- Live editing: plain scroll zooms and strength moves off plain scroll, in the principles, the top bar and Source: Alt+scroll (#58) at first, then Shift+scroll with Alt+scroll slicing layers once D196 merged from dev during the sweep.
- Live editing: desktop-first (D185), and pen pressure "on a drawing tablet".
- Live editing: the Drought and Badtide buttons each show one event; the Weather view is the full cycle (D186).
- Live editing: the "Removed:" list between allow markers.
- Live editing: the header's Save to Timberborn is merged (#40), no longer "until it lands".
- Live editing: its Claude tool entries are brush-style operations (D187).
- M9: the place resolver and judgement words point at EDITOR_PLAN's Claude integration.
- M9: the resolver's test river is laid with the river planner, not "drawn" (D184).
- Frame pass: "editor panels" became the editor's bars and shelf.
- 3D stages: carving is a brush (D182); "Why this order" says the brushes came with Live editing and 3D-a moves them onto runs.
- 3D-a: caves stay locked to the brushes; a new item moves the Live editing brushes onto runs; blocking: projects saved before 3D-a open the same and their strokes replay exactly.
- 3D-c: 3D picking and selections without handles; Carve and Fill as brushes, with tunnels, arches, caves, ledges and overhangs carved, not placed.
- 3D-c: cave carving (D125's Carve and Fill) is kept apart from the top bar's Carve, the water's force (D194, merged from dev during the sweep); whether it extends that Carve, makes Lower and Raise smarter or earns a button is left to the stage (D184).
- 3D-c: Claude steers 3D forms and carves with strokes (D139, D187); blocking and budgets per stroke.
- Weather view: a paragraph on how it sits beside the editor's buttons (D186).
- Weather view: item 1 is the full cycle's timeline; live water notes the editor already has it (D179 (2)).
- Weather view: blocking gains "the editor's Drought and Badtide buttons keep working".
- M10: rewritten, as "Symmetry, and the brushes' extras". The brushes came with Live editing; symmetry mirrors strokes, sources, placements and removals live, as one undo step.
- M10: the extras stay options of existing brushes (D158, D184); M12 entries are brush-style; blocking reworded for strokes.
- M11: stamps painted as brushes (ghost, click or drag, blended, one undo step, plain land afterwards); user stamps from a selection.
- M11: stamps carry terrain, not "feature groups"; the dam stamps follow D111; the water builders serve the generator and steering, and smart Lower in the editor.
- M11: blocking gains "a stamp paints as responsively as a brush".
- Refinement: #13 and the river-pond crossing marked moot (D184); the containment note says the highland streams keep the banks.
- Refinement: item 2 now applies only to M11's dam stamps; item 6 is the river planner's banks; the dam-site tool dropped from items 8 and Information.
- M12: a new "The model" block: the summoned chat box, steering, and brush-style precise edits (D139, D145 (7), D187).
- M12: the step kinds mapped: kept, steering instead, brush-style instead, retired.
- M12: `find_sites` and `list_features` reworded; the suite paragraph points here for the requests to redo.
- M12: the workshop requests steer or use a stamp, never a landform object; files that move: steps.ts and sites.ts without the landform, lake and drawn-river steps.
- M12: `src/` changes 2, 3, 5 and 6 annotated (D111, D139, D184); the corpus re-tune ends with moving every reference solution to the model.
- M12: blocking gains "no landform, river, lake, set-piece or resource-area object" and "the chat box appears only when summoned"; results are ordinary land.
- M13: the usability tasks without E9; the first-run hints came with Live editing; a mobile layout for the generator and Real places only (D185); the full journey's reference.
- Later: tablet and touch support and "make editable" detection moved to "No longer planned" (D185, D182).

**PLAN.md** (outside §20)
- Intro: generated maps' features are the plan the editor keeps; the land is shaped with the brushes (D182).
- Product principles: Claude's precise edits are brush-style, never landform objects (D187).
- §2, §3, §7.10, §10 (twice), §19, §19.2, §19.9: EDITOR_PLAN references use its new section names; §19's link anchor fixed.
- §5.2 Highest terrain: 17–22 come with high Verticality and tall Real places (D172), not "left out".
- §7: "Refine this map" hands the editor the plan; nothing to grab (D182, D184).
- §7.0: regeneration avoids "ground the player has shaped", not "a player's plateau".
- §7.3: set pieces are planned by the generator and reached by Claude's steering; the editor has no set-piece tools.
- §8 Highlands: the stream uses the river planner that drawn rivers used until D184.
- §9: builders are called by the generator and by Claude through steering; the editor's set-piece tools go with Live editing.
- §9.2: the standalone fall's users (the old Waterfall tool; now a steered landmark or a stamp).
- §9.6: the Plugged spillway tool goes; the shelf places the blockage.
- §9.9: the gorge builder's users.
- §9.10: size words resolve when Claude steers; the S = 2 default when it steers.
- §9.11: a note that these builders serve the generator and steering, and the spurs mode only M11's dam stamps (D111).
- §11 and §19.5: export warnings show on the quiet dot and never block; no confirmation (D184).
- §14.1: Refine this map no longer opens "with its features ready to edit".
- §17: the heights-above-16 row records the probe's answer (D172); the features-first row's reason.
- §18 E1: answered (D172, run 20260925-tall).
- §19.1: the setPieces comment (Claude steering, not the player).
- §19.2: the editor doesn't edit features' params; the river's banks param; editor-only state for symmetry and stamps; "what a generated map's plan holds".
- §19.3: the builders' users; `core/doc/tools.ts` in the past tense, with what the generator still uses.

**docs/STATUS.md**
- The decisions list, "in the version in force": D158, D179, D180, D182, D183 and D184 no longer name the removed tools.
- Running: the docs sweep, pointing here.
- "Where to look next": every decision is D1–D197.

**docs/progress/README.md**
- Links this entry.

**README.md**
- The table links the docs index. Nothing else: README and the site's help text describe the site
  as released on `main`, which keeps the old editor (its land, water and resource tools) until
  `live-editing-done` ships. The Live editing release PR rewrites the editor section (D188); the
  Save to Timberborn lines are the release's own.

**docs/README.md**
- Retired terms: the test's path, the allowed places and markers, and `pendingRemoval`.

**docs/decisions-pending.md** (history; notes only)
- #13 superseded by D184 (no drawn rivers); #30 superseded by D182 (features aren't edited as objects).

**CLAUDE.md, the site's help and install text** (App.tsx, the Real places gallery, index.html)
- Checked; nothing contradicts the vision. No change.

## M12: what the generator and the Claude groundwork need

Checked before any planner code goes with the landform tools. Evidence is file:line on `dev`
(3c351ee).

**Keep (the generator or `investigation/claude` needs it)**
- `planRiver` and its helpers: the generator (`src/core/gen/valley.ts:40`, the highland stream at
  `:1041`), and the groundwork (`lib/steps.ts:15`, `lib/synthetic.ts:7`).
- `planLake`: the generator, through `planRiver` (`src/core/doc/tools.ts:293`); the groundwork
  (`steps.ts`, `sites.ts:7`). `src/core/gen/water.ts:12` also imports it, in `placePonds`, which
  nothing calls.
- `replacePatch`, `planContextOf`: `planRiver`, `placing.ts:25`, and the groundwork.
- `startCentre`, `startProblem`, `pieceTiles`, `cornerFor`, `moveStartNear`: the groundwork
  (`sites.ts`, `view.ts`), and the start check's one-click fix (`src/worker/session.ts:533`).
- `planPiece`, `objectsOnNewGround`, `withObjectsOnNewGround`, `pieceName`: the groundwork's
  set-piece steps (until M12 moves them to steering).
- `moveEdit`, `deleteEdit`, `kindName`, `plainName`: the groundwork and the worker.
- `src/core/doc/placing.ts`: `entityProblem` (used by `MapSession` itself, `session.ts:39`), and
  the object placement (`planObject`, `moveObject`, `planEntity`, `footprintCheck`,
  `objectGround`) that the shelf's live ghosts can reuse.
- All of `src/core/features/route.ts` (ops.ts, the terrain rasterizer, three set-piece builders,
  `validate/playability.ts`, `gen/water.ts`); it is not a Channel tool.
- All of `src/core/features/` and `features.schema.json`: the generator makes landform (plateau,
  valley, terraces), river, lake, setPiece, mapObject, forest, berryPatch, ruinField and start
  features. Keep the landform kinds hill, ridge, canyon and island in the schema: old projects hold
  them, and the rasterizer doesn't depend on the kind.
- All of `src/core/doc/ops.ts`, `ops.schema.json` and `MapSession`.
- From `src/editor/features.ts`: `describeTile`, `entitiesByTile`, `FeatureIndex` and
  `TileContext`, which the generator's 3D preview uses (`src/ui/Preview3D.tsx:6`) and
  `tests/unit/look.test.ts` tests. Move them out of `src/editor/` before deleting that file.
- From `src/editor/tools.ts`: `DAM` (the dam-site overlay colour), which
  `tests/unit/look-readable.test.ts:9` imports; it is `DAM_OVERLAY` from `src/render3d/palette.ts`.
- Dev tools that import planners: `tools/ingame-files.ts` (`planRiver`, `planLake`) and
  `tools/bench-preview.ts` (`planLake`).

**Editor-only (goes with the tools, once nothing else imports it)**
- `planArea`, `AreaRequest`, `AreaPreview` (`placing.ts:187–211`): only `src/worker/session.ts:35,
  768` and `tests/contract/objects.test.ts:171–201`.
- `planRiverBadwater` (the old river inspector's "Make it badwater"; the groundwork's
  `setRiverBadwater` uses `updateFeature` instead) and `lakeAt` (the Plugged spillway tool): only
  `src/worker/session.ts:775–777` and `tests/contract/objects.test.ts:251`.
- `planLandform`, `LandformRequest`: not the generator; only the groundwork (`steps.ts:407`,
  `sites.ts:912`) and tests (`tests/contract/randomOps.ts`, `reshape.test.ts`). It can go once the
  groundwork's `addLandform` steers instead (below).
- In `src/worker/session.ts`: the `river`, `lake`, `landform` and `area` tool requests (`:727–733`),
  the planner branch of `planTool` (`:781–790`) and the request type imports (`:29–32`).
- `riverWidthFor` as an export (nothing imports it; the function stays inside `planRiver`).
- In `moveEdit`'s `movePlan`, the drawn-river and drawn-lake re-plans (`tools.ts:736–749`): trim
  with care, because the generated highland stream (`banks: true`) takes the same path.
- `src/editor/liveShapes.ts` and the "live shape tools" section of `src/worker/session.ts` on
  `feature/live-editing`.
- Tests of the editor's tools: `tests/contract/rivers.test.ts` (drawn rivers), the river, lake and
  landform edits in `randomOps.ts` (run by `properties.test.ts`), `reshape.test.ts`, the `planArea`
  cases in `objects.test.ts`, `e2e/tools.spec.ts`, and parts of `e2e/editor.spec.ts`,
  `e2e/objects.spec.ts` and `unit/editor.test.ts`. `parity.test.ts:52` and `import.test.ts:167`
  use `planLake` only to make an edit: swap in a brush stroke. Update these as their decisions
  change them (CLAUDE.md), never weakened.

**The request suite: requests that need new reference solutions** (the Live editing work changes
them when it removes the tools; the suite stays green)
- `addLandform` → steer: P02, P10, P12, C02, C05, R06.
- `addLake` → steer, or a hollow the water fills: P01, C01, R04, W04, W10, J11, M02, M07, Z05.
- `addRiver` → smart Lower strokes and a source: P08; Z04 is a safety request refused by the
  argument check before any planner runs. The setups of W05, W06 and W07 lay creeks with it.
- `addResource` → placements from the shelf: S08, P03, P04, F09, C03, C04, R01, R03, W06, W07, M03,
  M07, M10, Z02; and `moveStart`'s option that brings food (S06, M01, M04, and F07, F08 through
  their setup).
- `changeFeature` on a lake's floor depth: F05. `setRiverBadwater` → the river's sources switched
  to bad: X05.
- `moveFeature` (S09, F02, F07, W09) and `deleteFeature` (P09, F03, Z07) touch set pieces and
  objects, not landforms, rivers or lakes; they move to steering or Remove with the rest.
- Per step kind, the reference solutions that use it: changeSettings 18, addSetPiece 40,
  changeSetPiece 3, changeFeature 1, addRiver 2, addLake 9, addLandform 6, addResource 14,
  removeResources 1, moveFeature 4, moveStart 3, deleteFeature 3, setRiverBadwater 1, sculpt 0,
  undoLast 2. M12-INTEGRATION.md §13's split: 49 waiting, 18 map character, 38 operations, 15
  questions and safety.

## Left for the Live editing work (`src/editor/`, not changed here)

Found on `dev` and on `feature/live-editing` (9b75c93). Each contradicts D182 or D184 unless noted.
- `tools.ts`: the landform tools (Hill, Plateau, Ridge, Canyon, Valley, Island), Terraced cliffs,
  River, Lake, the set-piece tools (Waterfall, Dam site, Gorge, Badwater spring, Plugged spillway),
  the area tools (Forest, Berry patch, Ruin field, Thorn belt), Advanced's Object and Unstable core,
  the click-a-river Weir and Plug, Slope as a click tool, and the LAND, WATER, RESOURCE and
  ADVANCED tool groups, with their hints.
- `tools.ts`, hints: Dam site's "A rock ridge closes the valley" also contradicts D111 (no built
  dam walls). River's "[ and ] change its width" is a removed control.
- `panels.tsx`: the four text tabs (Land, Water, Resources, Start) and the Advanced checkbox.
- `panels.tsx`: the layer toggles, which move to the view buttons; the legend shows only while an
  overlay is on.
- `panels.tsx`: the feature and entity inspectors, with their nudge buttons.
- `panels.tsx`: the health pill ("Ready to play", "Open the checks"), where the quiet dot goes.
- `panels.tsx`: the instant problems alert ("Problems this edit made", `role="alert"`), a pop-up.
- `panels.tsx`: the export dialog's confirm checkbox for warnings (warnings never block, never a
  pop-up).
- `Editor.tsx`: the header comment ("EDITOR_PLAN §4", "four tabs"), the tab state and `tabOf`, and
  the comments "as the Lake tool reads it" and "on the Start tab".
- `Editor.tsx`: freehand river drawing (`drawRiver`) with the river's width on [ and ].
- `Editor.tsx`: the cursor readouts, such as "Lake: fills to level N here, about T tiles" and the
  river's sealed-mouth message.
- `Editor.tsx`: the feature handles (move, height, delete, resize).
- `Editor.tsx`: Undo, Redo, History and Open as text buttons in the header, where D184 wants two
  small icons, one primary button and one menu.
- `liveShapes.ts` (branch only): the live shape tools. The guard flags its first line, and
  `src/worker/session.ts:1276`, once the branch merges dev. Remove them with the landform tools,
  or add them to `pendingRemoval` on the branch until then.
- Outside `src/editor/`, in files the branch also changes: `src/ui/View3D.tsx:6` says "the editor
  puts its handles on top". `src/ui/App.tsx:1` and `View3D.tsx:1` cite "EDITOR_PLAN §4", an old
  section number. `App.tsx` lazy-loads `ExportDialog`, the confirm dialog above.
- README.md's editor section still lists the released editor's tools (Land, Water, Resources,
  Advanced, Show, the pill, Place, "Select a feature to move it"), which is right while `main` has
  that editor. The Live editing release PR rewrites it for the new editor, following CLAUDE.md's
  writing rules (D188).
- BrushBar's "Strength (Alt+wheel)" follows #58, which D196 replaces with Shift+scroll (Alt+scroll
  slices layers). Not contradictions: WaterBar's Drought and Badtide
  buttons (D186).
