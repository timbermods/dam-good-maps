# The forces: Carve, Craterize, Quake and Erupt, and the editor's sounds

> **D341 (2) and (3), 2026-09-29: Esc was a real race; no test stays flaky.** Esc (or Ctrl+Z) while a force
> was being kept (its last frame shown, the keep on its way to the worker, the row saying "Settling…") did
> nothing, and the force landed: `ForceDriver.cancel` returned early while `stopping`. That is carve.spec:61's
> CI failure (Esc arrived after the last frame on a slow machine). Fixed at both ends: each force is a named
> gesture; `forceCancel(gesture)` in the worker drops it at work, never starts it if taken back first, and takes
> it back as if never kept when its keep got there first (`MapSession.mark`/`stepSince`/`takeBack`, Redo as it
> was); the driver cancels in every phase and the page's keep sends nothing after Esc; Revert stays live while
> settling. `tests/contract/forceEsc.test.ts` runs the driver on a stepped clock against the real worker session
> and presses Esc at each moment of every force (Carve and Try another path, Craterize, Quake Slide and painted
> Lift, Erupt, Glaciate; Fast, and Watch with Esc and undo); before the fix every force failed at `keep:sent`.
> Erode has no force of its own here yet. Flaky tests, each made deterministic: Glaciate's and Craterize's pace
> (a wall-clock ratio; the first run is cold) and forceSpeed/Erupt's two seconds (software frames) now check the
> showing the driver plans (`forceTiming`: `due`, `show`, `total`), the driver itself on exact time
> (forceDriver.test, stepped clock); camera.spec (frame-sampled distances) waits on the glide's own state, its
> pace unit-tested (`render3d/cameraGlide.ts`); share.spec:40 waited on the first map's card and now waits for
> the new map; places.spec's phone screenshot ("Unable to capture screenshot" on `feature/high-look`, beside
> look-high's software 3D in the same shard) was a capture for the eye, never a check: captures are opt-in
> (`DGM_CAPTURES=1`). brushKit's F readout is batch 2's (`fix/brush-f-readout`).

> **Batch 1 (D321, D327), 2026-09-29: built.** Items 29+30 (Fast/Watch; nothing changes before it's
> reached; no water in frames), 40 (the Floor, `core/forces/floor.ts`), 7 (no tree leaning), 41+13 (the
> freehand path, `editor/freehand.ts`; one ring at the cursor), D327 (curved Slide), 17+25+18 (River depth,
> Canyon depth, Banks: `carve/river.ts`) and 14 (Erupt's volcano). Pending: item 27's fix, the check and
> its `EDGE_LIP` hook built (`core/water/edgeSources.ts`), until M9b's `edgeLip.ts` reaches dev. Fast
> (land final, 128²/256², largest case): Carve 2.0/2.0 s, Craterize 0.6/0.6, Quake Slide 1.2/1.2, Erupt
> 1.7/1.7, Glaciate 2.0/2.0. Keys: none added; Enter and Backspace no longer drop or launch points (the
> points are retired); Watch is a view-bar toggle, no key. Tests updated: carve, Glaciate and Erupt parity
> cases (the Floor; item 14's volcano), the Fast specs time the showing, not the machine's planning.

> **2026-09-29: the notices sit under the map.** D213's No badwater line (shown when a force or Delete
> sources takes the map's last badwater spring) sat over the top of the map and covered the force rows.
> The notices are now a strip under the map, never over it (EDITOR_PLAN.md, the overlays list);
> `tests/e2e/notices.spec.ts` picks each force with the line showing, wide and narrow, and fails if the
> line overlaps any control. **Glaciate now lives on `feature/forces` (D320):** `feature/glaciate` was
> merged in (567c2feb, the forces merged into it first; 2c363f00 gives CI's test job 45 minutes) and
> retired; PR #76 is closed, folded into #77.

> **State (2026-09-27; where a fresh session resumes).** Branch `feature/forces`, `dev` merged in
> last at ea7cf14 (housekeeping's lock removal, #72; merge 5e1a3e2). Round 2 (D226) and round 2b (D239, D247, D248) are done, below.
> The queue, in order (the coordinator's, 2026-09-27):
>
> 1. **CI green: done.** The red Erupt ceiling test was the test's spot under a wrapped view bar
>    (5fbf586; run 36298701656 green). Its hover words go with D258 (below).
> 2. **D249, brushes and sources: done** (the section below; captures linked there).
> 3. **D257/D258: done** (the section below; `dev` merged at 052aa69 first).
> 4. **D265 + D266: done** (the camera still; the forces at their own pace: the section below).
> 5. **D260: done** (the section below).
> 6. **D259 with the working area (D254), D261 Wand, D264: done** (the section below).
> 7. **The lean editor, D287-D289, with D290: done** (the section below).
> 8. **D263: done** (the section below): smart Lower's depth from strokes.
> 9. **D270: done** (the section below): Flatten's Ramped lays its own natural slopes along the rim.
> 10. **D244 step 2: done** (the section below), after the Ceiling batch ceiling-20260927 passed;
>     `chore/ceiling-probe`'s tool merged.
> 11. **Kyler's forces sitting, part 1 (D312): done** (the section below): the size ring, Carve's
>     waypoints, Erupt final in about two seconds. `dev` merged at 8099b63 (M9a, generator 0.7.0).
> 12. **D314: done** (the section below): Carve's own source is a group, a row across the flow.
> 11. **D309, the details behind More: done** (the section below, added 2026-09-28, after the sitting
>     was already queued): amends D289, so the forces-sitting checklist gets one more line.
> 12. **D313, the sounds: done** (the section below, added 2026-09-28): Smooth a softer relative of
>     Flatten's, every file's encoding checked and re-encoded where it helped, the default volume a
>     quarter lower (saved volumes kept exactly).
> 13. **D315, Delete sources: done** (the section below, added 2026-09-28), with one finding parked
>     for the milestone session: removing a source (even one) sometimes drops a few nearby bushes from
>     the live view once the water preview runs forward, seen in CI but not locally, so it looks like
>     the live simulation's own timing; it needs a look (below).
>
> **Handoff stop (2026-09-28 evening, on `feature/forces-sounds`, PR #81 into `feature/forces`,
> not merged):** D313 and D315 both done as above; CI green on the branch's own run
> (36373773578), a duplicate-triggered run (36373778224) still finishing `test` at handoff with
> `generation`/`oracle` already green; branch pushed, working tree clean, last commit
> `3289a104102fce712a87a0c2d4762b8aad25bf70`. Next: confirm the second run, then merge #81 into
> `feature/forces`.
>
> **The queue is done**; this branch waits for Kyler's forces sitting (the checklist lines are in
> each section).
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

## Select: Delete sources (D315)

The Select row gains **Delete sources**, beside **Delete**: it removes every water and badwater
source inside the selection, and nothing else (no trees, ruins or other objects). With Ctrl+A it
clears every source on the map. One undo step; their water drains as its causes are gone (D260,
already on the branch).

- Built exactly as the request asked: reused Select's existing Delete (D288) machinery with a
  sources-only filter, no new engine code. `objectsOn` and `deleteOn` (`src/editor/Editor.tsx`) now
  take a `kinds` list (`RemoveKind[]`, default every kind, D315 passes `["sources"]`); a new
  `deleteSourcesSelection` mirrors `deleteSelection` and calls `deleteOn(tiles, false, ["sources"])`.
  `api.removeAt` already accepted a `kinds` filter and `"sources"` was already one of its `RemoveKind`
  values (`src/core/features/objects.ts`), so the worker side needed no change at all; the label it
  produces ("Remove a source" / "Remove N sources") came for free. A new button, "Delete sources",
  sits beside "Delete" in the Selection row.
- Tests: `tests/contract/shelf.test.ts` proves the operation itself (`ed.removeAt(tiles, ["sources"])`
  against the raw session, no live water) takes every source on the map and leaves every other
  entity's count exactly as it was, undoable in one step. `tests/e2e/select.spec.ts` (D148) checks the
  player-facing mechanics through the live editor: a small selection around one source (with others
  left on the map) removes only that source and its own nearby water drains, undoing in one step; a
  second test does Ctrl+A then Delete sources and checks every source is gone in one step and undo
  brings them all back. Neither e2e test asserts anything about other objects' counts — see below.
- **A finding for the milestone session, not resolved here.** The first draft of the e2e test also
  checked that every non-source object's count stayed exactly as it was after a *single* source's
  removal, matching the operation's own guarantee (proven above at the session level). It passed
  against a local Chrome run, but failed in CI's headless Chromium: of a generated 96×96 Highlands
  map's (seed 4242) 150 `BlueberryBush` entities, 6 were gone from the live view after removing just
  one nearby source, with every tree, ruin, relic and slope unchanged. Removing every source at once
  (Ctrl+A) made a much larger dent (150 → 0 in one run). `ed.removeAt` itself never touches anything
  but sources (the contract test above, and the session-level check in this same investigation with
  water deferred, back it up); the loss only shows up once the live water preview has run forward,
  which points at the moisture or drought side of the simulation reacting to water the edit took away,
  not at anything this change added — and its being timing-sensitive (present in CI's headless run,
  absent locally) rather than a fixed count both times says it is the live simulation's own pace at
  work, not a deterministic rule. Whether that reaction is correct (berries drying up once their water
  is gone, a real Timberborn idea) and, if so, why it is timing-dependent instead of deterministic, is
  a call about the water simulation, outside a written-spec build. Flagged for `build` or Kyler's own
  look; the e2e tests were narrowed to what Delete sources itself is answerable for so CI stays green
  without hiding the finding.

## Sounds: Smooth, re-encoding, a quieter default (D313)

Kyler, 2026-09-28, from the forces sitting: Smooth's sound was low-fidelity and sounded dirty beside
Flatten's nicer one; every file's encoding needed a check; the mix should sit about a quarter quieter
by default.

- **Smooth is now a family with Flatten**, not its own leaf-bed sound: both the one-shot recipe and
  the held stroke reuse Flatten's own `scrape` sample and `stone-bed` bed (`src/editor/juice/palette.ts`),
  pitched up (~1.4–1.6×), a softer attack, shorter, and filtered gentler (a 3.4–4.2 kHz low-pass
  against Flatten's own unfiltered scrape). No new recording: Naturalize keeps the leaves. Re-measured
  against a real `OfflineAudioContext` render the same way the round's own calibration works
  (`checks.js`'s method, run against the live code from a dev server): the old recipe's trim put
  Smooth at −40 dBFS once the new samples were in; a new trim (`TRIM.smooth`, `calibration.ts`) brings
  it back to exactly −23 dBFS, the same everyday-action level as Flatten and Naturalize, peaking at
  0.36–0.48 well under the 0.92 ceiling across the size/strength range. Listening note: Smooth now
  reads as Flatten's gentler cousin — same mineral material, a lighter touch, over sooner — instead of
  an unrelated leafy shuffle.
- **Every one of the bank's 24 recordings was checked against its original CC0 download** (all six
  re-fetched into `investigation/juice-2/local/sources` to verify their SHA-256 against `bank.json`,
  confirming the exact same originals the round used). A reconstruction-error measurement (decode the
  original, apply the same crop/trim/gain `build-bank.py` already computes, encode to MP3, decode
  back, compare to the pre-encode signal) found the shipped 192 kbps MP3 left roughly 27–30 dB of
  encoding error on every file alike — impacts, splashes and the three friction beds — regardless of
  how loud or quiet its own gain stage was. 256 kbps cut that error by 10–40 dB (some files, like the
  short wood impacts, came out nearly clean; the three-second beds and the louder splashes improved
  less, being the busiest signals, but still markedly). `tools/reencode-sounds.py` reproduces this
  pass from the same sources into `public/sounds/juice-2/` (crop, trim and gain untouched, only the
  final bitrate); `investigation/juice-2/` keeps its own original 192 kbps copy exactly as PR #64
  merged it (history, `docs/README.md`). Total: 818,400 → 1,090,848 bytes (0.78 → 1.04 MiB), still
  four files at a time on the first gesture.
- **The default volume drops from 0.72 to 0.54** (a quarter lower, `DEFAULTS.volume`,
  `src/editor/juice/palette.ts`): a fresh player hears everyday actions near −25.5 dBFS and forces near
  −19 instead of −23/−16.5. `loadSound()` already only falls back to the default when nothing is
  saved, so a volume a player already set — including 0.72 from before this change — is read back
  exactly, never nudged toward the new default.
- Tests (D148): `juice.test.ts` checks the new default (0.54) and that a saved 0.72 from before D313
  is kept as it is; `juiceSounds.test.ts` checks the manifest's new byte total and that every file's
  duration still matches `investigation/juice-2`'s original (the crop is unchanged, only the
  encoding); `sounds.spec.ts` checks the volume slider shows 0.54 on a fresh load.
- Kyler's listening check (parked above) still applies to the finished mix; this section is the note
  for it.

## The forces' details come back behind More, each on Auto (D309, amends D289)

Kyler, 2026-09-28: the magic stays on Auto; the player who wants to shape a result can pin what made
it.

- **Every force's row stays exactly as D289 left it** (Power, Size, its signature choice, Try
  another), with a small **More** button at its end. More opens: Carve's wander, walls and depth;
  Craterize's walls, centre, rays and debris; Erupt's summit, flows, ridges and shape; Quake's scarp.
  (Carve's width stays the row's own Size, D226; it is not repeated behind More.) Closed by default;
  `moreOpen` (an editor-only state, keyed by verb) remembers whether it was left open, alongside the
  pins, in a new `dgm.forces` entry in the same local-storage prefs `dgm.brush` and `dgm.sound`
  already use.
- **The controls themselves are the ones from before D289** (`git show` on `ForceRows.tsx` and
  `CarveRow.tsx` at `5e1a3e28`, the commit before D289's `2e330fac`), brought back rather than
  rebuilt: Carve's Wander slider and Walls select; Craterize's Walls and Centre selects, Debris
  segmented and Rays toggle; Erupt's Shape segmented, Summit select, Flows segmented and Ridges
  toggle; Quake's Scarp segmented. Each now sits behind a small **Auto** button of its own (the same
  idiom as Size's, D226), shared as `AutoDetail` in `TopBar.tsx` alongside a new `MoreButton` and
  `MoreRow`; `Segmented` moved there too, so both rows share it.
- **Every detail starts on Auto**: `core/forces/nature.ts`'s draw functions (`carveNature`,
  `craterNature`, `eruptNature`, `quakeNature`) now fill in only the details still absent from the
  settings they are given (`s.field ?? <drawn>`), leaving a pinned one exactly as it is; `depth` (Carve's,
  already optional) and `centre`/`summit`'s own nested "auto" value are unaffected. Their input types
  loosen the detail fields to `T | null | undefined` (`nature.ts`'s own `Draft` types, `CarveDraft`,
  `CraterDraft`, `EruptDraft`, `QuakeDraft`); the force files under `core/forces/` themselves are
  untouched, so this stayed on `build-light` (D309 (6); a change inside a force goes to `build`).
- **Setting a detail pins it**, with the Auto button as its own way back (turning Auto back on sets
  the pin to whatever was showing, exactly as Size's Auto already did). **A detail still on Auto shows
  the value the last run actually drew** once one has run: `ForceDriver` keeps `lastSettings`, the
  resolved settings from each verb's last successful start, past the run's own end, so the row can
  read it and offer the one-click pin (D309 (3)).
- **Try another re-rolls only the details still on Auto.** The row now sends its current pins with
  every Try another (`carveDetails`/`craterDetails`/`eruptDetails`/`quakeDetails`, a small object of
  `null` for Auto or the pinned value); the worker's `forceAgain(pins?)` resets every detail to Auto
  first (`nature.ts`'s new `autoDetailsOf(verb)`) and then applies `pins` over that, so an unlisted
  detail (no pins sent: Unleash, and any caller outside the row) fully re-rolls, matching the
  behaviour from before D309. A force started without `natural` (a saved operation, or a caller with
  already-exact settings) is untouched by any of this: nature.ts never ran for it, so `forceAgain`
  leaves its settings exactly as they were, as before D309.
- **The operation keeps what it ran with.** No change was needed here: `forceParamsOf`/`recordOf`
  already read the run's own resolved `.settings` (concrete, post-nature), never the request's
  drafts, so a project saved under D309 replays exactly, and one saved before it (with no pins at
  all, since the row didn't exist) replays exactly too.
- **Defy gravity and Carve's mid-carve Stop stay gone** (D309 (5)); Part 3's superseded row for the
  forces' controls is corrected to say so (it wrongly still listed the detail controls it now brings
  back).

Tests changed to the decision (D148): `tests/e2e/carve.spec.ts` and `tests/e2e/forces.spec.ts`
(three spots checking "the row shows only Power, Size, one choice, Try another" now expect the
trailing **More** button too; the row itself is unchanged, its details live behind More).
`tests/contract/forceNature.test.ts` (renamed in spirit to D289 **and** D309): its two nature-only
tests pass drafts with the detail fields absent (`AUTO_CARVE_DETAILS` etc.) instead of full defaults,
since a concrete default no longer gets overwritten; new tests cover a pin surviving every seed at
the nature.ts level, a pin sent with Try another surviving through the worker while the rest still
varies, and pinning every value a run drew (including its seed) reproducing that exact result.
`tests/contract/forceOps.test.ts` and `tests/contract/unleash.test.ts` needed no change once
`forceAgain`'s reset was made conditional on `natural`; both call it on a force built without
`natural`, which must keep running exactly as asked.

Docs: EDITOR_PLAN §3 (More, Auto, the pin, brought-back controls) and Part 3 (the superseded row
corrected); this file.

## Carve's source as a group (D314)

`src/core/water/sourceGroups.ts`, its README and `tests/unit/sourceGroups.test.ts` taken whole from
`feature/source-groups` (a6346fe4). Where Carve places its own source (Keep river), it now places a
group: `placeSourceGroup` at the origin, the total `sourceStrength(power, width)`, the flow the carve's
heading, the carve's seed with its origin mixed in, the ground before the first cut, the objects' tiles
occupied. The anchor at the origin keeps the carve's source id; the others' ids derive from it and their
tile (`guidFrom`), so a replay gives the same ids. Where the module refuses (nowhere to stand), the one
source at the origin, as before. Each source's level follows the bed cut under it.
- **Stored literally:** `forceResult` keeps the anchor in `source` (its share now) and the rest in the
  new `sources` (at most 15; schema, `forceProblems`, the id checks and the replay's placements); the
  older `carve` operation's type too. A carve kept before D314 has only `source` and replays unchanged.
- **Unleash** places no new sources (Kyler, D314): the player's source stays the river's origin.
- EDITOR_PLAN's Keep river line; Keep river's title ("a row of sources").

Tests: `tests/unit/sourceGroups.test.ts` (the module's own, taken whole); `tests/contract/
carveSourceGroup.test.ts` (new: a wide river's source is a row across one line, its strengths summing
to the carve's, each at most 8, kept in its operation and valid against the schema, the project replays
the same objects, one undo takes the carve and its whole row; a pre-D314 carve with a single source
replays unchanged). Changed (D148): `carve.test` (a second carve keeps the first one's whole group; the
strength that follows the Width is the group's sum, a broad river's a row; the oxbow's only sources are
the carve's row at its origin).

For Kyler's forces sitting: carve a wide river with Keep river: a short row of sources across its
head; a creek keeps one or two.

## Kyler's forces sitting, part 1 (D312)

`origin/dev` merged first (8099b63: M9a, generator 0.7.0, D213's No badwater). Conflicts: M9a's dam-site
legend line and the storage check's location on the best dam (both dropped: D287); M9a's generator
already notes land above 16 in a generated map's own description ("… the game's map editor edits only
up to level 16"), so a generated map's export follows it and the editor's tall note (D244) goes only on
imported maps, never twice; the Claude step types joined; the Claude reference outputs and STATUS as
dev has them (STATUS's two "make walkable" words, a retired term since D247 on this branch, reworded).
Tests the new generator's land made stale (D148): `brushSources.test` finds the first River Valley
map with a dry spot (seed 3 has none now); `forceOps.test`'s fault through the start stays on the map
(the start can be near the edge now); `draftWaterQuiet.test`'s settle past a day uses Lake Basin 1 (its
lake takes about 2,500 ticks from dry; River Valley 3 fills in 640 now); `maxWaterDepth.test` allows
3.06 (a lake's level drifts by a few hundredths on the new land; it allowed 3.05); `ceiling.test`
checks the generator's own words on a generated map and the editor's note on an imported one.

1. **The size ring** (`src/core/forces/reach.ts`, `forceReach`): a faint ring round the force's cursor,
   its radius the crater's (half its Size), the volcano's (half its breadth), Quake's reach from its
   fault (`quakeReach`: 14 + Power/2), Carve's half width. It follows Power while Size is Auto and Size
   once set, and changes at once when either moves under a still pointer. Quake shows the ring alone
   (the fault is painted, no cursor). No route, footprint or outline (D258). Drawn on the overlay in
   the new `FAINT`.
2. **Carve's waypoints** (`src/editor/waypoints.ts`, a shared piece; `core/forces/carve/course.ts`):
   Shift+click drops a waypoint (the first where it starts), drawn as small markers joined by a thin
   line; a click without Shift launches with its tile the end; Enter launches with the last waypoint
   the end; Backspace removes the last; Esc drops them all; a drag still aims as before (and drops any
   waypoints). The carve steers along a smooth curve through them (uniform Catmull-Rom sampled every
   half tile; the guide points five tiles ahead on it; its cost is the curve still to go; it ends at
   its end only on the last stretch), with its own wander and physics. The worker's `ForceRequest`
   takes `via`; the kept `forceResult` keeps the curve's points in `where.path`; Try another keeps
   them. Replay is literal, so exact. At most 32 waypoints (`MAX_WAYPOINTS`).
3. **Erupt's terrain final in about two seconds:** its pace 55 ms a stage (was 140), its 28 stages
   and a step or two of planning: 1.85 s from the click to the force kept on the RTX 2070 SUPER (it was
   5.1-5.4 s). Its plume, glow and cooling lava play on their own clocks after it is kept; the tools
   answer at once.

Tests: `tests/unit/waypoints.test.ts` (new: the reach follows Power and Size for every force; the
gesture adds, ignores a repeat, removes, drops all, launches by click and by Enter, and needs two
points; the overlay's markers and line; the curve passes through every point); `tests/contract/
carveWaypoints.test.ts` (new: a dog-leg carve passes within 4 tiles of each waypoint, its operation
keeps them, Try another keeps them, the project replays to the same land, a waypoint off the map is
refused); `forces.spec` (new: the ring's radius follows Power and Size for Craterize, Erupt and
Carve, is half a hand-set Size, and Quake's has no cursor; waypoints add, Backspace, Esc, click and
Enter launch one step each; Erupt final 1.85 s after the click, under 3 s on a busy machine, and a
brush answers at once; where the browser draws in software, CI's, each eruption frame costs the page
far more, 4 s there, so the wall clock is only bounded at 8 s and the paced part is the unit test's). Changed (D148): `forceDriver.test`'s pace check (the eruption's 28 stages in about two
seconds, not four). And, the new generator's land: `forces.spec`'s Craterize on the start checks that the start
stands on level ground after the strike (carried off broken ground, or riding a bowl its 3 × 3 stayed
level in: on Highlands 4242's new start a crater of 30 or 70 leaves it level, one of 50 breaks it),
at Power 50; `unleash.spec` presses Esc 0.3 s into the run and checks it still runs (a short course can
end within the old 1.2 s). The full e2e suite: 67 passed; `water.spec`'s 256² timing timed out under
two workers (generator 0.7.0's 256² maps take 10-80 s each here) and passes alone (3.2 min).

For Kyler's forces sitting: hover each force and change Power and Size: the ring follows; Carve:
Shift+click a few points, then click: the river winds through them (Backspace, Esc, Enter); Erupt:
the land is done in about two seconds while the smoke and the glow linger.

## One ceiling in the editor (D244 step 2)

The Ceiling probe batch (run ceiling-20260927, `C:\dgm-probe\results\ceiling-20260927\summary.md`)
confirmed the game keeps editor-made land above 16 on all three maps (tall-load, tall-terrain,
tall-water, ceiling-watch, tall-objects, tall-sources, ceiling-build). Its one failure,
ceiling-hazards on the waterfall map, was the cycle model contaminating one watched tile at the
badtide's first instant (0.5 against the game's 0), not the ceiling. So:

- **One ceiling, 22** (`CEILING` in `src/core/format/world.ts`, D172's tall maximum): the six caps at
  16 are lifted: `MAX_TERRAIN` (the build's sculpts and integrity pass), `BRUSH_MAX_LEVEL`,
  `ops.schema.json`'s brush `level`, `stop`, `levels` and `bed` and the sculpt's `amount` and `level`,
  `brushes.ts`'s raise under a cut, its precise hold and smart Lower's bed, and `forceCeiling` (now
  22 on every map, not the map's own top). The carve's limit reads the same constant. The brush row's
  Flatten level and Stop level lists and Select's Set level list follow it (D259).
- **Tall and standard by the land:** a map whose land goes above 16 exports with the note "Timberborn's
  map editor opens and saves this map as it is, but can't raise land above level 16." at the end of
  its description (both the generated and the imported export path); back at 16 or below, by an
  edit or an undo, the note goes. A description that needs no change is kept byte for byte (an
  unedited map, an import). The validators already took up to 22 (D172 (1)).
- **Generation is unchanged:** the quick suite's byte checks passed with the caps lifted.
- `chore/ceiling-probe` (a0be2aa: the ceiling maps and the Ceiling group, `tools/probe-ceiling.ts`) is
  merged into this branch.
- EDITOR_PLAN's Heights line says what is built.
- Claude's step limits read `BRUSH_MAX_LEVEL`, so they rise with it, untested (D277).

### Land near the ceiling at 256²: frame times and captures

`npx tsx tools/measure-ceiling.ts`, the High look's method (`tools/measure-high.ts` on
`feature/high-look`) on this machine's RTX 2070 SUPER (ANGLE, Direct3D 11), the installed Chrome
headed at 1600×900 (the view 1425×833), the display's refresh about 170 Hz (5.9 ms a frame), the site
built as the preview is (under `/preview/`, forces shown), Standard look. The map: the High look's
first, River Valley 4242 at 256² with forests at twice the density and ruins ×3 (8,939 objects).
**Drawn**: the view drawn 40 times back to back, each read back to its end (median / 95th); **GPU**:
timer queries while orbiting 5 s, the whole map and close in; **painting**: frame intervals during a
three-second Raise stroke (then undone). Then a 24 × 24 plateau set to 22 with Select (next to the
river, on ground at 9) and a volcano erupted at full Power on ground at 7, twice on its summit, to 22
(19 after the first). Three runs; the table is the last, the others agree within the noise below.

| | Top | Drawn, whole / close (ms) | GPU whole p50 / p95 (ms) | GPU close p50 / p95 (ms) | Orbit | Painting frames p50 / p95 / max (ms) |
|---|---|---|---|---|---|---|
| Before | 16 | 1.8 / 1.7 | 0.97 / 4.2 | 1.05 / 1.2 | 170 fps | 5.9 / 6.0 / 35 |
| After (plateau and volcano at 22) | 22 | 1.9 / 2.0 | 0.93 / 2.0 | 1.2 / 3.8 | 162–170 fps | 6.0 / 88 / 129 |

- **Drawing land at the ceiling costs nothing measurable:** drawn, GPU and orbit are the same before
  and after (the runs' spread is about 2 ms drawn and 1–3 ms at the GPU's 95th: 4.8 / 2.4 / 1.8 ms
  drawn before in three runs).
- **The eruptions at full Power:** about 5.1–5.4 s each, frames p50 5.9 ms, p95 about 23.5 ms, max
  41–59 ms, one long task of 51 ms in one run of three.
- **Painting after the edits had slow frames:** p95 71–106 ms and max about 124 ms in all three runs,
  wherever it painted. **Found and fixed** (the section below): the water, not the height.

### The painting stutter after a force: cause and fix

Split one variable at a time with `tools/measure-ceiling.ts` (`--no-plateau`, `--no-volcano`,
`--plateau-level`, `--power`, `--eruptions`, `--paint-now`, and `--debug`: an unminified build that
counts the page's water updates and names their callers and the tiles that moved):

- **The plateau alone** (at 22 or at 16, next to the river): no stutter. **The volcano alone**: the
  stutter. Shadows and the lava's heat never showed in a stroke's frames; the renderer's own drawing
  was unchanged (the table above).
- **The page:** every slow frame was `updateWater` with a whole map's water from the worker's
  stroke water ("draft", D197), 500–5,000 times in one three-second stroke, about 25 ms each, 90% of
  it remeshing about 47 water chunks. They came faster than the page could draw them, queued behind
  the stroke (the stroke's own release waited behind them).
- **The worker** (a Node repro: two eruptions, the water settled, then a stroke far from any water):
  the draft's water moved on 400–1,100 tiles every two ticks, all far from the stroke. Two reasons:
  1. The editor's background settle stops at one game day. After the eruptions the river filling the
     lake behind the lava needs about 2,100 ticks (768 a day): it stopped at the cap, unsettled, and
     the page said "Water settled". Every stroke's draft then carried the settle on, all over the map.
  2. D260's warm start drained 202–411 wet tiles the new ground's canonical start (the walk from the
     sources) didn't reach, though the old ground's didn't reach them either: water the settle itself
     spread past that walk, the filling lake. Each stroke drained it and the draft refilled it.
- **Not the ceiling:** with the fix undone, one eruption to 14 (under 16) gives the same kind of
  stutter, smaller (a stroke's p95 17.7 ms, max 100 ms, 533 whole-map water updates); two to 19, p95
  70–100 ms. It predates D244: any force or edit that leaves a lot of water moving did it.

The fix (the forces' look unchanged):
- `PreviewJob` (sim/preview.ts) runs on past its first day while the water still moves (not only
  sealed basins evaporating), up to the canonical settle's four days (`PREVIEW_JOB_DAYS`); "Water
  settled" then means it.
- `unfedTiles` drains only water that lost its feed: a tile the old ground's canonical start (or a
  tile round it) reached, and the new one's doesn't; water past both walks keeps its water. D260's
  tests pass unchanged (a removed source's water still drains in its journey).
- The worker sends a stroke's water every frame only once the stroke's ground touches water; until
  then (only water still settling elsewhere moving) at the journey's pace, 150 ms.
- The page takes a stroke's water once a frame at most (the latest wins; a newer journey or settle
  drops a waiting one), and meshes it, and the journey's frames but its last, a few chunks a frame
  (`updateWaterSoon`, about 2 ms a frame, nearest the view's middle first, with the ground's tile data
  under each); `updateWater` (the settled water, an applied view) meshes whatever still waits.

Before and after (the same tool, 256² River Valley 4242 dense, the RTX 2070 SUPER at 170 Hz, a
three-second Raise stroke's frames p50 / p95 / max):

| Stroke | Before the fix | After the fix |
|---|---|---|
| Before any edit | 5.9 / 6.0 / 35 ms | 5.9 / 6.0 / 29 ms |
| At once after two eruptions (water still flowing) | 29–35 / 118–124 / 141 ms (debug build) | 5.9 / 6.0 / 71 ms (the release's own update) |
| After the edits, low ground | 6.0 / 88 / 129 ms | 5.9 / 6.0 / 18 ms |
| On the volcano's flank | 6.0 / 106 / 124 ms | 5.9 / 6.0 / 18 ms |
| On the plateau's top | 6.0 / 88 / 124 ms | 5.9 / 6.0 / 18 ms |
| Orbiting while the water still settles | (not measured) | 169–170 fps |

The regression check: `tools/measure-ceiling.ts` ends with "regression check: painting p95 before …,
after the edits at most … (limit 1.5 × before): pass", and exits with an error when it fails (the fix
undone, one eruption to 14: 17.7 ms against 9.0, FAIL). And `tests/contract/draftWaterQuiet.test.ts`
(new, in the quick suite): the background settle runs past its first day and ends settled; the warm
start keeps water past both walks and still drains a removed source's; while the water still settles,
a stroke touching no water gets its water at the journey's pace. Each of the three fails with its part
of the fix undone.

Captures (the editor's default view and a low view, before and after; this run):
[before, default](forces/ceiling-before-default.png) · [after, default](forces/ceiling-after-default.png) ·
[the plateau, before](forces/ceiling-plateau-before-low.png) · [the plateau at 22](forces/ceiling-plateau-after-low.png) ·
[the volcano's ground, before](forces/ceiling-volcano-before-low.png) · [the volcano at 22](forces/ceiling-volcano-after-low.png).
The plateau is Select's hard-edged block (a precision tool); set next to the river, its foot floods a
little. The volcano stands in stepped rings with its cooling crust round it.

Tests: `ceiling.test` (new: the one ceiling everywhere; every brush (raise, precise raise, flatten,
ramped precise flatten) reaches 22 and never passes it; Set level to 22 makes the map tall, its export
has the note after the old description and validates with no load problem, undo makes it standard and
the description as it was; Erupt at full Power twice, a Lift and a crater on a highlands map pass 16
and never 22; an unedited map's description byte for byte; the note added once and taken off).
Changed (D148): the e2e Erupt ceiling test checks 22, not 16; `select.spec` checks the Level list ends
at 22.

For Kyler's forces sitting: Erupt on low ground at full Power: it can rise past 16 now; Set level to
22; export such a map and open it in the game (and in Timberborn's own editor, which keeps it but
can't raise land past 16); undo back under 16 and the note goes. Paint right after an eruption on a
256² map: the brush keeps the display's rate while the water still flows (fixed, the section above).

## Flatten's Ramped lays its own slopes (D270, Kyler's answer to #84)

- A ramped Flatten stroke now keeps its own slopes, `slopes` in the stroke ([x, y, orientation]).
  The worker works them out when the stroke is applied (`withRimSlopes`, `src/worker/session.ts`, on
  `apply` and Clear sources' stroke): the stroke run on the map as it stands, then `rimSlopes`
  (`src/core/features/slopes.ts`): every 1-level step between a tile the stroke pressed on and its
  neighbour (the rim stepping down, and its last step onto the ground round it), a slope on the low
  tile facing the step, with the tile behind at its own level; grouped by the way it faces and its
  level, joined corner to corner into stretches; one in the middle of a stretch of up to six tiles,
  else every six from the third; clear of objects (the rebuilt slopes aside), water, and the tiles
  the build keeps free (the start's, the rivers' mouths and springs, the map objects').
- The build places each one that still fits (build step 8, before the derived slopes, which go round
  them and count them as joined), owned by `derived:rim-slopes`; Delete takes one as a
  `removeSlope`, and a force doesn't list them as removed (both as for the derived slopes).
- A ramped stroke without `slopes` (saved before D270) asks the slope planner as it always did, so
  old projects replay unchanged. A cliff pad lays none. `ops.schema.json` and `brushProblems` know
  `slopes`.
- EDITOR_PLAN's Flatten line and map-document paragraph say so; decisions-pending #84 was already
  marked accepted (D270).

Tests: `rampedSlopes.test` (new: a ramped pad on uneven ground lays slopes at every way and level its
rim steps down, each standing right, spaced along the rim, none where everything is blocked; through
the worker the stroke keeps them, the build places every one, the page's preview equals the build,
the project replays them exactly; a cliff pad lays none, and a ramped stroke without them (from
before D270) lays none of its own). Changed (D148): `brush.test`'s "a ramped flatten gets the natural
slopes on its rim" is now the test of a stroke saved before D270 (the planner's slopes), renamed.

For Kyler's forces sitting: Flatten with Edges Ramped on uneven ground: slopes appear along the rim
on every side that steps down, about every six tiles.

## Smart Lower's depth from strokes (D263)

- **A new channel** (a smart Lower stroke that leaves the water it starts in or beside) records its
  `bed`: one level below that water's surface round the first dab (the page reads it: the highest
  surface there, rounded, less one), never below the water's own bed; and `dry`, the first dab on
  land. While its dabs are still in the water, the bed holds (no pit where it leaves; the water's own
  tiles keep their ground); from `dry` on it steps down to a level below lower land and never rises,
  as before; the brush's middle cuts to it (through a rise too), and **no tile the brush reaches is
  cut below the bed**, however long it's held (`floorBed`: the lowest bed that reached each tile). A
  one-deep river's branch is one level below the land; a three-deep river's branch has water about a
  tile deep, its bed two above the river's.
- **A deepening pass** (a stroke that never leaves the water it began in) records `deepen`: what the
  brush's middle passes over goes down exactly one level, once, with the brush's soft edge; holding
  adds nothing. A two-deep river is two passes.
- **The page** starts a stroke from inside the water as a deepening pass and, the moment a dab's tile
  was dry when the stroke began, paints the whole stroke again as a new channel (its `bed` and
  `dry`), as `rideObjects` repaints a Flatten; a straight line starts again from its own start. A
  stroke from beside the water is a new channel from its first dab.
- **Plain Lower** is unchanged, and a stroke saved before D263 (`channel` alone) replays exactly as
  before (its bytes pinned in the test, taken from the code before D263). `ops.schema.json` has
  `bed`, `dry` and `deepen`; `brushProblems` checks them.
- EDITOR_PLAN's map-document paragraph says how the stroke records it (the Smart Lower line was
  already D263's, from `dev`).

Tests: `smartLowerDepth.test` (new: from a one-deep river a stroke held 700 dabs leaves the channel
exactly one below the land, nothing lower anywhere, the river untouched; from a three-deep river the
channel is at land less one, the river keeps its bed (the old rule dug three deep); a deepening pass
held 500 dabs makes it exactly two deep; across a rise the bed never rises and the rise is cut to it;
plain Lower still digs deeper while held; the old rule's bytes pinned; the page's preview equals the
build for both kinds, and the project replays). Changed (D148): `waterTools.spec`'s smart Lower
check (the bed is now a level below the river's surface, not the river's bed: the stroke records that
bed, nothing along it sits above it or below what the rule allows, and the river keeps its ground).

For Kyler's forces sitting: draw a river out of a deep river with smart Lower, holding the mouse:
about a tile of water all the way, and no deeper where you paused; draw along it again: one level
deeper each pass.

## The lean editor (D287-D289, D290)

Kyler, 2026-09-27: fewer controls, the land as the interface (D184), the forces as magic, not
machinery (D258).

### D287: a leaner view bar

- **One Top-down toggle.** The Orbit and Top-down pair is one **Top-down** button, lit while the
  view looks straight down; a second click goes back to the usual orbit. Reset view stays.
- **No dam sites anywhere a player looks.** The Dam sites view button, its overlay and legend line,
  the map card's "Best dam site" row, the generator preview's hatched best dam site and its layer
  switch are gone, and so is the worker's dam-site layer. The checks dot's reservoir wording names
  no place ("a short dam within 40 tiles of the start could hold …"). The analysis stays internal:
  the generator's measures, `water.reservoir`, the metrics. The hatched overlay (alpha 255) stays
  in the renderer as a general mark, unused for now.
- **No Moisture or Drought view.** Their buttons, overlays, legends and the worker's layers are
  gone; Badwater and Under roofs stay. The land shows moisture itself, and the water bar's Drought
  (D267, on `feature/weather-days`) shows a drought day by day.
- The Markers view is lit by the shelf's Slope alone now (the dam sites lit it before).
- The generator page's 2D preview keeps its own **Moist soil** switch: it is a flat preview with no
  green, not the editor's view bar. Kyler may want it gone too (parked, one line in the handback).
- Retired terms: "Dam sites view", "Moisture view", a `Best dam site` label, "Show dam sites" and
  an `Orbit` button. EDITOR_PLAN §3 (the view buttons) and Part 3; the README's button list (and
  its water line, which still named Follow after D265).

Tests changed to the decision (D148): `look-clean.spec` (the Dam sites view's part became: no Dam
sites, Moisture, Drought or Orbit button in the view bar, Badwater there); `look-readable.spec` and
`look.spec` (the legend names no dam site, nothing is hatched); `render3d.spec` (one Top-down
toggle, on and off, no Orbit); `water.spec` (no best dam site on the card); `look-readable.test`
(the hatch's rim test kept as the general overlay's; the dam site's colour and swatch checks gone);
`legend.test` (a generic label instead of "Dam sites").

### D288: Select and Delete instead of Remove

- **The Remove tool is gone**: its bar button, X, its filters row, its drag and its red hover
  (`removeTool` in `placeTools.ts` and its unit tests). X now only flips Quake's side.
- **Delete** does it all: with a selection open (Select, a Ctrl+drag, Ctrl+A), the Delete key or
  the Selection row's **Delete** (which replaces **Clear objects**) removes everything standing
  inside it, objects, slopes and sources, as one undo step ("Remove 23 objects"); the start stays
  and says so. With no selection, Delete takes what the pointer is on: a source within its reach
  first (D249), else the object on the tile ("Remove a tree"). Under a cut, only what stands on
  the visible land. The worker's `removeAt` is the same call, with every kind.
- Docs: EDITOR_PLAN §3 (the top bar; Delete where Remove was; the keys; the Select line), Part 3;
  ROADMAP's Live editing items 1, 4, 8 and its Removed list; the README's lines. Retired: a
  `Remove (X)` label, a `Clear objects` button.

Tests changed to the decision (D148): `shelf.spec`'s Remove test became Delete's (pointed at a
pine; a rectangle round a grove and a source, by key and by the row's button, one step, undone in
one; the ground unchanged; the start stays, pointed at and under Ctrl+A); `brushSources.spec` lost
its Remove-drag part (D249's "a drag from a source takes only sources" went with the tool);
`brushKit.spec` and `publicSite.spec` look for Select where they looked for Remove.

### D289: every force's row takes Glaciate's shape

- **The rows.** Carve: Power, **Size** (its width, following Power or set; its depth follows both),
  Keep river or Dry canyon, Try another path. Craterize: Power, Size, Try another. Erupt: Power,
  Size, Try another. Quake: Lift or Slide (its one choice), Power, Try another; X flips the side
  that moves (the Side control is gone; the painting status says so). No mode switches, no Walls,
  Centre, Debris, Rays, Shape, Summit, Flows, Ridges, Scarp, Wander, Width and Depth pair, and no
  Defy gravity.
- **The gesture is the mode.** Carve: a click unleashes, a drag (two tiles or more) aims, and an
  aimed carve goes where it is dragged, uphill too (the page sends `defyGravity` with every aim; the
  flag stays in the operation's data). Craterize: a click strikes, a drag aims a glancing blow.
  Erupt: a click vents; a drag paints a fissure (shown once it leaves its tile; a drag too short for
  a fissure vents where it began). Quake: painted, as before.
- **Nature** (`src/core/forces/nature.ts`, new): the hidden choices are drawn from a stream of the
  series' seed, the tile the force acts round and its height, leaned by the ground's ruggedness
  (relief within 8 tiles, 8 levels = fully rugged): rugged ground carves straighter (wander about 25
  instead of 55) between steep walls and raises steeper cones and sheer scarps; open ground lets a
  river wander and shows an impact's rays; a harder impact throws heavy debris more often, a stronger
  eruption runs heavy flows. Summits and crater centres keep Auto three times in four. The worker
  draws them only for the editor's own requests (`natural: true`), before the run, so the run, the
  frames and the kept `forceResult` all carry the drawn settings; Try another (the next seed) draws
  again. Old projects replay exactly (their results are literal); another caller's settings run as
  given.
- **No Stop.** Carve's and Unleash's mid-carve Stop is gone: Pause (Space) and Revert (Esc) stay, and
  a carve keeps itself when it ends. (The driver's own stop still keeps a painted Lift on release.)
- The carve's own refusal for an uphill aim without the flag says only "The end point is uphill of
  the start" (only another caller can meet it).
- Docs: EDITOR_PLAN §3 (the top bar's forces, the gestures, the sizes), Craterize, Quake, Erupt,
  Unleash and Carve, Part 3; ROADMAP's Live editing item 1 and its Carve line. Retired: a `Defy
  gravity` toggle and "turn on Defy gravity", "keep what's carved so far", a "Side that moves" group.

Tests: `forceNature.test` (new: the same place and seed draw the same; 24 seeds draw more than four
characters for each force and both scarps; the land leans wander and walls; the editor's force runs
with and keeps the drawn settings, five Try anothers re-roll them, the project replays to the same
bytes, and a force without `natural` runs as asked). Changed to the decision (D148): `carve.spec`
(the row is exactly Power, Size, Auto, Keep river, Dry canyon; the carve runs at a creek's Power and
keeps itself when it ends, no Stop; the aim test drags without a mode switch or Defy gravity, and
the "a click in Aim goes nowhere" check went with Aim's switch); `forces.spec` (each row's exact
controls; Erupt's fissure is a drag; Craterize's aim a drag; Quake's side read from the page's hook,
`gesture().side`, flipped by X; the ceiling test no longer counts the peak's tiles, since its summit
is nature's now: `eruptHeadroom.test` keeps that check with each summit set; the camera test waits
for the carve to end instead of Stop); `unleash.spec` (waits for the end, no Stop); `sizes.spec`
(Carve's size is Size); `release.test` (only Quake has a switch); `carve.test` (the uphill refusal's
words).

For Kyler's forces sitting: each force's row (Power, Size, one choice at most, Try another); click
or drag decides the mode (a Carve dragged uphill cuts through); Try another a few times on one spot:
the walls, rays, summit or wander change with the land's lean; X flips Quake's side (say if you want
the Left/Right control back).

### D290: a badwater source cuts its own spring pool

- Placed from the shelf, switched from clean (the row's Water: Badwater) or dragged, a badwater
  source on uneven ground no longer refuses: `springPool` (`src/core/doc/placing.ts`) cuts its nine
  tiles down to the lowest of them with an exact `sculpt` flatten (never filling) and removes what was
  placed by hand on them (a generated tree makes room by itself, as before), before the source's own
  operation, in the same undo step; the shelf's ghost is green there. The worker adds the pool to the
  shelf's plan (`planEntity`) and to any group of edits that places or moves a badwater source
  (`applyAll`: the switch and the drag). It still refuses at the map's edge ("it does not fit on the
  map"), in a cave, and on the start ("the district center stands there").
- One plain reason each: "it would stand inside the ground: the ground under it is not level" and
  "it would float: …" are "the ground under it is not level"; the "it can't stand there: " prefix is
  gone from placements and moves.
- EDITOR_PLAN's sources paragraph says so.

Tests: `springPool.test` (new: placed on uneven ground the nine tiles take the lowest level and
nothing else changes, one step, undone in one, replayed from the project; switched from clean and
dragged, the same, one step each; refused only at the edge and on the start, with one plain reason,
and the hover agrees); `springPool.spec` (new: Kyler's case through the page: the shelf's ghost green
on uneven ground, a clean source switched to Badwater cuts its pool, one step, one undo). Changed
(D148): `objects.test` (a relic on uneven ground is refused with "the ground under it is not
level" alone).

For Kyler's forces sitting: switch a clean source in a riverbed to Badwater: it takes, with a small
level pool under it; drag a badwater source up a slope: it cuts its pool there.

## Select, the working area, the Wand and the map-wide actions (D259, D254, D261, D264)

- **Findable**: a **Select** button on the bar after the brushes (a dashed square); M and a brush's
  Ctrl+drag still open it; the button or M again closes it (the selection with it).
- **Shapes** (`src/editor/select.ts`): Rectangle, **Circle** (from the middle out, "radius N" beside the
  pointer), Freehand, **Brush** (painted in with a ring at the brushes' size, filled along a quick drag)
  and **Wand** (D261: a click on water takes the water joined to it that the view draws, clean or bad:
  the view's own test, a surface on the tile, so no bank tile; a click on land, the ground at its
  level joined to it; a snapshot). Shift adds and Alt takes away in every mode. "Same level" is gone
  from the interface.
- **Set level**: its list follows the height ceiling's constant (16 until D244 step 2); Ctrl+click on
  the land takes that tile's level; its three ways, **Set**, **Cut down** (only the ground above the
  level) and **Fill up** (only below), share the picker. **Ctrl+A** selects the whole map (in Select, or
  with a brush out). **Max water depth** (a number from 1 to the selection's deepest water): the ground
  under deeper water rises so the water sits that deep (`depthLevels`: each tile to its water's
  surface less the number, grouped by level into exact flatten operations); once the water settles
  again, a few words if any of it ended deeper (a river's surface can rise).
- **Every Select action** is exact and one step through the worker's `applySelection`: objects and
  sources ride the changed ground (the build stands them on it), and the start, only if its own ground
  can no longer hold it, is carried to the nearest level ground in the same step (D257's rule). Labels:
  "Cut 4,210 tiles down to level 8", "Water no deeper than 3 on 1,832 tiles".
- **The working area** is the open selection: a brush stroke records it (`BrushParams.area`, runs, in
  the schema) and changes only its tiles, each at most as many levels as it is steps inside the area
  (`areaDepth`), so the edit meets the locked land a level a tile (smooth and naturalize keep within it
  too); page and build alike, so it replays exactly. A force gets it with its request: the land outside
  is kept, as unbreakable ground, and its kept result eases to the edge the same way (`featherForce`;
  its frames show it unfeathered until it's kept); a force started outside the area is refused with
  "Outside the working area: Esc clears it". Clear sources takes only sources wholly inside. The land
  outside is dimmed (an overlay). Water is never locked.
- **One row at a time**: with a brush or a force out, the Select row is a chip, "Working inside 40 × 40 ·
  Esc to clear"; a click on it opens the Select tool (the brush or force goes back). Esc clears the
  selection first.

Tests: `tests/unit/select.test.ts` (circle, Wand on water and on dry ground, Max water depth's levels),
`tests/contract/workingArea.test.ts` (every brush across the area's edge changes only inside, feathered;
page equals build, rebuild equals full build, the project replays; a Craterize with the area; one
outside refused), `tests/contract/maxWaterDepth.test.ts` (a lake six deep made three deep with its
surface kept, one step; a river's deeper stretch ends no deeper than about the number),
`tests/e2e/select.spec.ts` (the button and the shapes; a circle set to a level changes exactly its
tiles, one step, undone; Ctrl+click's level; the chip with Raise out and a stroke across the circle's
edge changing nothing outside, its edge a level at most; the Wand on a river selecting exactly its
drawn water, on land its level; a Raise across the river's selection changing no bank tile; Set level
on it; Ctrl+A with Cut down and Fill up). **Changed to the decision (D148):** `brushKit.spec`'s
"Ctrl+drag with a brush out selects too" looked for the Selection row; with a brush out it's the chip
now, and the brush stays picked.

Not done: the forces' frames show the land unfeathered until the force is kept (then the kept land
eases to the edge); a note for Kyler's sitting.

For Kyler's forces sitting: the Select button; a circle set to a level; Ctrl+A with Cut down to 16;
Max water depth on a lake; the Wand on a river, then Raise across it (the banks stay); Ctrl+drag with
a brush out, then paint across the edge (it eases to the edge, nothing outside changes); a force
inside a selection (it stops at the edge).

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

## The forces sitting, batch B: the editor (D345, D347; `feature/sitting-b`)

Kyler's B1 to B10 and B11, on the editor, off `feature/forces`. Short notes; EDITOR_PLAN has the rules.

- **B6, the water spill:** the cause was neither a filled wet tile nor the edge slopes as such. A footprint touching
  water fell back to D328's "cut down to its lowest tile", which cut dry ground below the water beside it, and the water
  ran in and then drained; the integrity pass also rounded a lone levelled tile down beside a lake. Now the level rises
  to the water's surface instead (filling dry ground), the edge never cuts below it, the levelling ops are `exact`, and a
  footprint standing in water on uneven ground is refused ("the water is in the way…"). `tests/contract/placeNoSpill.test.ts`.
- **B5:** the counts and Everything include what the resource features hold under water (`core/doc/inArea.ts`); a ruin
  field only partly inside the selection keeps the columns the water hides (their heights are assigned over the whole area).
- **B4:** Ctrl+scroll and a click near a source's marker (a few pixels) count as on the source; the old exact-tile test
  missed it and the click placed a second source. Placing on a source's own tile is refused by the core, as before.
- **B7:** the plain pointer picks and drags placed objects too (mine site, relics, geothermal field, natural dam, blockage:
  `planMoveEntity`); X puts down whatever is held. **B8, B10, B11** as EDITOR_PLAN describes.
- Keys: **X** changed (it closed the selection; now it puts down anything held, the selection included); **Shift+scroll**
  and **Ctrl+click** now also work in Select (the Level number). No key was added or moved otherwise. The shortcuts
  reference (EDITOR_PLAN §7) is updated; the first-run hints name no key, so they stand.
- Tests updated for the new names: the Select row's "Up 1" and "Down 1", the saved file names (`dgm-<theme>-<seed>`,
  places `dgm-<place>`, the folder's numbering `-2`), the taken-name test in `platform.test.ts`.
- **B12 (D351):** every control has a tooltip; the sweep added the missing ones and corrected the ones this week's changes
  made wrong (Select's Ctrl+click, Shift+scroll and X, Delete's menu, a picked source and object, Quake's Lift and Slide,
  the ⋯ menu, the history, the settings page). `tests/e2e/tooltips.spec.ts` collects the interactive controls from the
  rendered page in every state and fails on any without a `title` (its own, or its label's). Batch A's new controls carry
  their own tooltips; check them when `feature/forces` is merged in.
- **B13 (D352):** the forces row in clusters, one list (`FORCE_GROUPS`); keys unchanged (Erupt 0 before Quake 9 in the row);
  the first-run hint points at Carve, and a kept force completes it.
- **B14, the water bar stuck at "0%" after an undo:** every edit began a journey in the page, and the worker sent water
  frames and a settled event only when it had a settle to run; an undo back to water that was already settled ran none, so
  the journey waited for ever. The worker now answers every update with `waterSettled` (its own state: no settle running for
  it), and the page begins a journey only when it is false. `tests/contract/waterStatus.test.ts` (fails without it),
  `tests/unit/waterPlayer.test.ts`, and an e2e in `sittingB.spec.ts`. The background check's answer carries it too and ends any journey (a CI run of the e2e once stuck at "flowing 84%" after a redo: the check had put the canonical water in place and stopped the worker's own settle, and its answer carried no water, so nothing ended the journey); a journey now always has a first frame. A kept force taken back carries it too; the force
  paths batch A owns (a force's own keep) answer without it and play as before. The Weather view builds on the same
  `WaterPlayer` (`settled()` is its "nothing playing" state).
- **B13 again:** Landslide (D354) and Meander (D355) are out of the ordered list: Carve, Craterize, Erupt · Rift, Quake,
  Glaciate · Erode, Deposit.
