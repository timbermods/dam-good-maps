# Status

One page, rewritten at every step and stop. The summary below is for Kyler's return, most important first. The full
handover is [HANDOFF.md](HANDOFF.md); the running log is the "Progress log" issue
([#57](https://github.com/timbermods/dam-good-maps/issues/57)). Decisions are in
[PLAN.md §20](../PLAN.md#20-editor-decisions) (D1–D342), the order of work in [ROADMAP.md](../ROADMAP.md).

## Summary for Kyler (updated 2026-09-27, evening: paused for Tuesday)

Paused at about 21:00 PDT on 2026-09-27, when your allowance ran out; a fresh session resumes on **Tuesday 2026-09-29 at 8:01
PDT** from [HANDOFF.md §1](HANDOFF.md#1-resume-here-the-order-of-work). Every agent stopped at a clean point with everything
pushed; nothing is running. **M9a is released** (`m9a-done`, [#80](https://github.com/timbermods/dam-good-maps/pull/80)). Your
decisions since the restart (D252–D315) are recorded below and in the living docs.

**Today (2026-09-29), resumed on Kyler's main PC:** items 35, 38 and 39 applied (D316–D318). Your build order lifted the hold and is recorded as D321–D326 (`docs/feedback/2026-09-29-build-order.md`): six batches, all started today and running in parallel: the forces (`feature/forces`, `build`), the brushes (`feature/brushes`, `build`), Select, the shelf and shortcuts (`feature/select-shelf`, `build-light-medium`), the look (`feature/high-look`, `build-light`), M9b (`feature/m9b`, `m9b-build`) and documents (`dev`, `routine`). Batches 2 and 3 merge into `feature/forces` in the order 3, 2, 1; then you get one checklist for one sitting. **Held:** #74 (Erode; round 7, roofs, is with Codex), Real places (D319), items 19 and 45. **One forces branch (D320).**

### 1. Needs your decision or your eyes

1. **Done 2026-09-29: items 35, 38 and 39 applied** (D316–D318). The standing rule is at the top of `CLAUDE.md` and
   of HANDOFF; every definition in `.claude/agents/` names its full model id (`claude-opus-5-5` or `claude-sonnet-5-5`,
   efforts unchanged); Claude Code resolves "sonnet" to Sonnet 5.5 here (checked 2026-09-29); §7's table is the model plan in force. `build-light`'s first feedback batch tries medium on
   the well-specified items (D318 (2)).
2. Done with item 1: the models (item 38, D317).
3. Done with item 1: model and task suitability (item 39, D318).
4. **The six batches** (your build order, D321–D326; each batch's branch, worktree and model in [HANDOFF.md §1](HANDOFF.md#1-resume-here-the-order-of-work) item 4): forces, brushes, Select and the shelf, the look, M9b, documents. Item 34 (WORK.md, hand-back notes, one file per decision) comes at the forces release boundary.
5. **Item 33's documents are written** (D326): `docs/HISTORY.md`, `docs/progress-log/`, `docs/chats/`. The per-decision statuses come with item 34.
6. **The UI brief is approved** (D330, `docs/UI-BRIEF.md`): built right after the forces' release on `build`.
7. **The water shades (D310): settled, option (a)** (D324, batch 4): darken the mine pit's earth, then badwater, then the clean shallows toward the game, keeping every readability rule. Your look sitting comes after.
8. **The forces sitting, with your changes from it (D312–D315): on the preview on Tuesday.** Everything is built on three
<!-- retired-terms:allow -->   branches: the size ring, Carve's and Glaciate's waypoints, Erupt final in about two seconds (D312, `feature/forces`); Smooth's<!-- /retired-terms:allow -->
   softer sound, re-encoded sounds and a quieter default (D313), and **Delete sources** on the Select row (D315)
   (`feature/forces-sounds`, #81); Glaciate's meltwater springs in groups (D314, `feature/glaciate`, #76). Carve's own source is a row too (D314; Unleash places none). Tuesday's
   first job is to merge them and refresh the preview; you'll get a toast. Your checklist is below (items 21–23 are the new ones).
   One finding for your eye: after Delete sources, the live view sometimes loses a few blueberry bushes once the water preview
   runs on (seen in CI's headless browser, not in Chrome; the operation itself is exact and tested). A `build` agent looks at it on
   Tuesday.
9. **M9b** (#70, held for your eye, D252, D273): the grouped sources are in (springs in groups; an edge river's mouth is the rule's row); badwater ditches no longer run ruler-straight, and the sea's rim wanders, so no sea is square. Its tests are being re-pinned (half done: 765 pass; 9 are bound to maps the groups changed, and one resources measure reads 0.5225 against its line under 0.52, to look at first). Then its release candidate (D308): full batches, one pooled probe
   batch, and the review set for you.
   - **The game's water rules (D311, accepted):** M9b uses them for open-ground water; the pooled probe batch at the release
     candidate checks the water against the game itself.
   - **#134 follows D290:** on a narrow river mouth, the editor's badwater toggle moves the badwater group along the channel to
     the nearest spot where its pool fits, rather than refusing.
   - **Your feedback items 21, 22, 24, 26, 27, 36 and 47 are batch 5** (D325; its order is in `docs/feedback/2026-09-29-build-order.md`).
10. **Real places (#35): the rebuild is running in stages, no sheet for you (D300).** The grouped-sources rule is wired
   into the conversion (VERSION 11): river heads and lake springs in rows, the water floor's spring as a group,
   badwater grouped. 37 of 136 places are converted; the other 99 take about 1.5–3 hours on Tuesday. Then my own check
   (the blocking list, "No water a pump can reach" at 0, the stripes gone on 42, 48, 116 and 118) and the release,
   `real-places-2-done`. CI on #35 is red until then: the tests are for the new rules, the committed gallery still
   D271's. From item 47, real places take only what never changes the real land (D331; PERFECT.md's Real places section); item 27 still waits with D319.
11. **Erode (#74): merged into `dev` as an investigation (be2342a2), rounds 2–9 at 47c02e67, approved by you; adoption at 3D step 3 (D281).** Earlier notes, kept as history: You approved round 2 ("magical, almost
   perfect") and round 3 (89305ca6) landed and you approved its flat-ground wash. Round 4 is with Codex now,
   narrow: washes across uneven ground, and telling a wash sweep from a cliff sweep. Next: wait for round 4; the
   automatic support check at 0 dropped voxels; then hold #74 for your look; merge as an investigation on your
   yes; adoption at 3D step 3 under the forces' rules.
12. **Drought and Badtide, day by day** ([#73](https://github.com/timbermods/dam-good-maps/pull/73), CI green; held for a sitting of
   its own after the forces sitting; its checklist is at the end of `docs/progress/weather-days.md`). The day strip follows the game
   within 5%; D307's flooded floor says so on hover. Two findings: on water-rich maps the last day takes 16–48 s to work out at 128²
   (default #124: the strip opens at once and shows each day as it's worked out); most starts on rivers lose their water on day 1 of
   a drought (the game's rule; it bears on PERFECT's "the start survives its first cycles" and may belong in M9b). Its defaults
   #120–#125.
13. **The High look** ([#75](https://github.com/timbermods/dam-good-maps/pull/75), held; D284): Standard beside High, with greyscale and
   colour-blind sheets, in `docs/look/high/` on `feature/high-look`; 25 effects, each switchable; High by default with a fallback.
   My read: warmer and richer, the dead trees far better; the grass quite saturated and yellow; the water calmer, losing Standard's
   glints; from far away the poisoned soil is a dark olive stain, harder to spot than Standard's red glow (its own switch,
   `poison`). Its defaults #110–#117. The capture-tool audit is done (seven tools pinned to Standard, b62188ba); three of them no
   longer run against today's interface and are on the housekeeping list. It goes on the preview after the forces' release.
14. **Pending defaults you can overrule** (`docs/decisions-pending.md`): #110–#117 (High look), #120–#125 (day by day), #134
   (M9b, above). Everything else is answered.
15. **"The page is the editor" (feedback item 23):** it follows the forces' release without delay, as one window for the
    generator and the editor. Nothing of it is built until Kyler has held a question-and-answer round on the UI vision in
    the planning chat and approved the written UI brief that comes from it; first, prepare a short document in `docs/` of
    the open design questions and the known constraints (what the page must hold, the decisions recorded about it, what
    the forces sitting and the feedback items changed) and tell Kyler when it's ready. It also draws item 22's strip and
    item 24's number.

### For Kyler: plan conflicts

None open: the frame's touch-up (the sweep's one conflict) is settled by D296.

### Your checklist for the forces sitting (on the preview from `feature/glaciate`; refreshed on Tuesday with D312–D315)

One sitting on <https://timbermods.github.io/dam-good-maps/preview/> → **Refine this map**:
1. **Erupt** (D226): steep and broad at high power (a peak, never a flat mesa; cones on the flanks; it completes); on low
   ground and on high ground once the one ceiling (D244) is in.
2. **Power and size apart:** Carve's Width and new **Depth**, Craterize's **Size**, Erupt's **Size**.
3. **Quake:** Lift and Slide; Lift on a high map once the ceiling is in.
4. **Unleash on a source** (D239): select a source, **Unleash** (or U); from a pool; drag to aim; Try another.
5. **Brushes and sources** (D249): raise land over a group of sources with **Clear sources** on (they glow red and go with
   the stroke) and off (they ride the ground: no pits, no pillars); hover near a source with any tool and press Delete; a
   Remove drag that starts on a source takes only sources. Captures of both strokes will be in the forces' progress log.
6. **Brushes:** the size number and slider in the options row (D226); Smooth without its walkable option (D247); **Level
   lines** now in the view bar beside Height colours, working with any tool (D248).
7. **The shelf:** Water source, Badwater source, Start, Pine, … (D226).
8. **Sounds:** louder by default; #64's recorded sounds for every action and force.
9. From the ceiling probe (D244), what the probe can't do:
   - the camera close to a summit (the volcano's peak, the 256² plateau): no dipping into the peak; the layer slider
     shows and hides the top levels;
   - building on the upper slopes (paths, stairs, a lodge, a pump, a tank at levels 17–22): builders reach them (stairs
     are likely needed); stacking at 22 stops at level 32;
   - the waterfall from 21 in play (dries in a drought, turns bad in a badtide);
   - Timberborn's own map editor, two minutes: open a Ceiling map, save it under a new name, reopen: the summit stays 22.
   The maps are in `C:\dgm-probe\ceiling\`.
10. **Bound only by nature** (D257): run Carve, Craterize, Erupt and Quake straight through the start: each completes, and
    the start lands on the nearest level ground; the checks dot says what broke, and its one-click fixes mend it.
11. **Clean gestures** (D258): no route line, outline or footprint on the land before or during a force; Unleash, Strike,
    Vent and Unleash on a source start on one click; Aim is a drag with only a thin arrow, gone as the force starts;
    Quake's fault and Erupt's fissure still show as you draw them.
12. **Select** (D259): its button on the bar; Circle and Brush shapes; Set level up to the ceiling and Ctrl+click for the
    level; then, with a selection open, paint and use a force: nothing changes outside it, the edge meets the locked land
    without a cliff, water still flows across; Ctrl+drag with a brush out, then keep painting; one row (the chip), Esc to
    clear. **Wand** (D261): click a river, trim it to one stretch with Alt, then Raise, Smooth or Set level its bed: the
    banks don't change, and the bed shows through clear water.
13. **Water recedes** (D260): remove one of two sources feeding a wide sheet on flat raised land, then the other: the
    water settles to what's fed, then drains, within a second or two; the removed source's marker and label go at once.
14. **Smart Lower** (D263): hold a stroke out of a river across flat land, pausing on the way: the new channel's water is
    about one tile deep all along, with no pit where it leaves; draw along it again: two deep. Plain Lower away from water
    still digs deeper while held.
15. **Map-wide Select actions** (D264): Ctrl+A, 16, **Cut down** on a tall map (nothing left above 16, nothing lower
    touched); **Fill up** on a hollow; Wand a deep lake, **Max water depth** 3 (the same surface, 3 deep); the same on a
    river (about 3 deep, and the report says so if any stayed deeper); each one undo step with its label.
16. **The lean editor** (D287–D289): one Top-down toggle; no Dam sites, Moisture or Drought views; no Remove tool (Select, then
    Delete: objects and sources go, the start stays; point at one thing and press Delete); each force's row is Power, Size, at most one
    choice (Carve: river or dry canyon) and Try another, which varies the rest; Carve aimed through a rise.
17. **Badwater on a riverbed** (D290): switch a source in an uneven river to badwater: it cuts a small level pool and stands; undo brings back
    the ground and the clean source.
18. **Glaciate** (D291, D292; `feature/glaciate`, on the preview with the forces): press **-**; a click on high ground flows down a
    valley, a drag aims through a ridge with only the arrow; the ice gathers, advances for three seconds and melts back for two, the
    camera still; Power, Size, Meltwater, Try another, and More (benches, steps, tarn, scree, each on Auto until pinned); the floor reads as one river (measured with round 4's details; a click draws its own: say if the floor ever reads as more than one river) (Canyon 10, click 22,22, and your
    cross-valley drag 24,80 → 96,36); undo and Esc take it back at once. The floor's before and after: `docs/progress/glaciate/`.
19. **The camera stays put** (D265): Carve, Unleash and Erupt run without the view moving; no Follow anywhere.
20. **The forces' pace** (D266): Erupt swells in about four seconds, Carve runs as tuned, whatever the water's speed.
21. **More, on each force** (D309, once built; the preview will be refreshed): open More; every detail says Auto; run a force and see
    the values it took; pin one and Try another: the pinned detail stays, the others vary; pin all the shown values and it repeats.
22. **From your sitting** (D312, D313; once built, the preview refreshed): the faint size ring on every force, growing with Power and
<!-- retired-terms:allow -->    Size; Shift+click waypoints for Carve and Glaciate (Enter or a click launches, Backspace removes, Esc cancels); Erupt's land final<!-- /retired-terms:allow -->
    in about two seconds; Smooth's softer sound beside Flatten's; the quieter default volume.
23. **Delete sources** (D315, once built): Ctrl+A, then Delete sources: every source goes, every tree and ruin stays, the water drains;
    undo brings them all back.

### 2. Released or merged

- **Released: `m9a-done`** ([#80](https://github.com/timbermods/dam-good-maps/pull/80), `main` a4af2bb0; tagged at c31a77e, the merge of
  #56). Generator 0.7.0: maps grown from design version 2's processes, Any (Surprise me) as the default, starts that don't look alike,
  the starting-logs floor, start water fed or lasting (D302), the settled water's flows stored in the file. Also carried: #63, #69
  (Glaciate's investigation), #72 (housekeeping). The deploy and the live check passed.
- **Merged into `dev`** (2026-09-26, the Live editing boundary):
  - [#60](https://github.com/timbermods/dam-good-maps/pull/60) Live editing: D212's two changes (Water source and Badwater
    source on the shelf; clear water only around a brush over water) and Carve re-ported to #47's final commit;
  - Codex's investigations #58 (juice sounds), #59 (the forces core), #47 (Carve), #51 (Craterize), #50 (Erupt) and #52
    (Quake). Together they add about 30 MB, mostly the GIF captures you reviewed (each under the few-MB line of D195).
- **Real places round 2 built** ([#35](https://github.com/timbermods/dam-good-maps/pull/35), 1101e31): D214's rivers, not floods
  (the 4× and 8× strengths gone: 148 places at 2×, 2 at 3.75×, capped near the official maps' range; 11 starts moved to the
  water; 54 places with fewer, larger rivers); none dropped (34 took another row of their region); the 12 "Centre" titles
  renamed (Colca Canyon South Rim, Samosir (Lake Toba), Cuernos del Paine, Kate's Point (Western Ghats), …); the
  starting-logs floor met on every place (69 got groves: river banks, across streams, side valleys, plateaus).
- **Merged into `dev`:** #65 (Map look 3, phase 1) and #66 (vegetation) as investigations, both approved (D241, D242), to
  be adopted into the High look in the Map look work; #64 (the second sound round, CC0 recordings) as proposals.
- **Merged into `dev`:** [#63](https://github.com/timbermods/dam-good-maps/pull/63), your D222 changes: a drying oxbow lake no
  longer counts as "water still changing" (#72; every generated map and the live-check pin byte-identical, the oracle 0
  disagreements), and the waterfalls' foam is soft white water (the crack-pattern lace gone; also the glassy panes at the
  foot of wide falls). Captures: `docs/look/waterfalls/d222-foam-*.jpg`. Honest read: up close the froth is a little milky
  rather than bubbly. They reach the public site with the next release you approve; the forces preview gets them first.
  #77 and #78 accepted; the three remaining foam issues are queued for the next waterfall look pass (D231).
- **Merged into `dev`:** [#53](https://github.com/timbermods/dam-good-maps/pull/53) waterfalls (D201, D215): the V-shaped gap is
  gone (an L-shaped lip is one sheet wrapping its corner, a staircase lip one zigzag sheet), with a wider white splash and a
  crown of whitewater where falls land. Captures, before and after: `docs/look/waterfalls/d215-*.jpg`. My read: nothing
  looks broken; close up, the foam lace's dark bubble cells read a little like cracked tiles, which is a matter of taste
  for you. **Released as `look-waterfalls-done`** ([#62](https://github.com/timbermods/dam-good-maps/pull/62), a73b4b8;
  tagged at ee83466); the deploy and the live check passed.
- **Released: `live-editing-done`** ([#61](https://github.com/timbermods/dam-good-maps/pull/61), a7e0a9b; tagged at 985e1cf).
  The deploy and the live check passed. I opened the public site's editor in a browser: Water source and Badwater source
  are on the shelf and there are no forces; the preview shows the same editor with Carve. It also carries everything
  that was waiting on `dev` (resources #43, generator 0.6.2; #45; #38; #46; #32).

### 3. On the preview for you to try

<https://timbermods.github.io/dam-good-maps/preview/> shows `feature/glaciate` (the forces and Glaciate, before D312–D315).
Tuesday's session refreshes it with the forces sitting's changes and tells you.

### 4. Probe batches (2026-09-27, all with your installed mods; every restore clean)

- **2026-09-29, on Kyler's main PC, on his YES** (settings backed up to `C:dgm-probesettings-backup6-09-29T22-36-02`; registry unchanged, nothing left behind; only Steam's `steam_autocloud.vdf` files changed):
  - **M9b** (`m9b-20260929b`, `feature/m9b` at 7695e6a8, 18 maps): 14 pass every check, both 256² chaos maps included. The two Sources: None maps fail only the water check's handling of an empty map (0/0 wet tiles). River Valley and Lake Basin 128² seed 2 diverge from the game from day 7, when the water refills after the drought (the model refills more); with M9b.
  - **3D, T1–T6** (`terrain3d-20260929`, `feature/terrain3d-a` at 24b88b9b, with the support check's timing fix): every check passes; walking and pumps not measurable, as before. Erode had no in-game maps yet.

1. **M9a** (`20260927-0853-batch`, 15 maps, 40 min): **98 passed, 5 failed**, so no tag yet. Every map loads; objects, terrain and the
   tall map pass. The cause of most failures, found by M9a: our files write the water's flows as zero (as the official maps ship),
   so the game resets the water's momentum at load; our own simulation restarted that way reproduces the game's first day exactly,
   and with its flows kept the water holds. On Delta 128² that reset re-routes the side channels (water: 78.5% of wet tiles within
   0.1 after a day, needs 95%), and it explains the model mismatches on the Hard and weir maps. **The fix, being built:** write the
   settled flows into the file (every map's bytes change, no decision does), then the whole M9a group again. Left for you only if
   they persist: Delta's wet-tile count after the drought (thin sheets near the wet line, volume within 0.8%), and badwater lingering
   in a side pool 42 tiles from the start after the drought on Any 128² (the start's water stays clean).
2. **Ceiling** (`ceiling-20260927`, 3 maps): the game keeps editor-made land above 16 (loads, heights, water, objects, sources at
   19–21, building): D244 step 2 is being built. One failure, not about height: on the waterfall map the badtide model contaminates one
   watched tile a moment before the game does (0.5 against 0); the whole map agrees within 0.7%.
3. **Terrain 3D** (`terrain3d-20260927`, T1–T6): cave water, soil under roofs, plants and a start under a roof, and the 256² high
   landscape all match the game. T1's support check failed only at the load instant: the game drops exactly the 24 voxels our rule
   predicts, but half a day after loading, not at the load; the check is being moved to after the drop and the fixtures marked verified.
4. Optional: the Real places grey area, after D271's water fix.

Runner note: its "machine quiet" check reads 0% because Windows' CPU counter isn't available here, so it doesn't really measure;
the other agents paused by hand.

### 5. Defaults I chose (your answers: D222)

#69, #70, #71 and #73 are confirmed; #72 is changed (below, being built). #74, #75 and #76 are answered too (D226, D227). New: #77 and #78 (the #72 and foam details, #63).

- **#69: the forces stay hidden on the public site** until you've tried them (D219), so Live editing can be released now with
  the Carve port inside it: the preview, the dev server and the tests show the forces group; one switch turns it on at the
  forces' release ([decisions-pending.md](decisions-pending.md)).
- **#70: oxbow lakes keep their water.** A fresh settle starts a sealed basin dry, so Carve's operation stores the water the
  bend held when it closed, and every settle and the export start the lake from it; the game then lets an unfed lake
  evaporate. Maps without such a lake are unchanged.
- **#71: small Live editing choices:** key 6 picks Water source; when a brush counts as over water; the clear water's tint,
  ripples and shoreline values; how far Claude's carve step searches.
- **#72:** the quiet dot's "water still changing" for an evaporating oxbow lake stays as it is.
- **#73: waterfalls' details:** corners are a mitre (a sharp fold like the cliff's own corner) rather than a rounded sweep,
  which would overlap on staircase lips; the whitewater sizes and a crown in the Standard look (mist and spray stay for
  the High look); one streak pace everywhere; a clean fall keeps 0.3 of its opacity under clear water.

### 6. What failed or got stuck, and what I did

- **The old machine's `.scratch/` helpers didn't come across** (gitignored): M9a's `settings-run.ts`, `one.ts` and
  `run-batches.sh`, Live editing's `carve-equiv.ts` and GPU/soft Playwright configs, `notify.ps1`, and their saved results.
  I'll rebuild what the work needs, and commit reusable ones under `tools/`.
- **The Python installer (MSI) failed** in this shell (Windows Installer couldn't read its own cache). I used python.org's
  NuGet build of the same Python 3.12.10 instead, signed by the Python Software Foundation.
- **My slip, fixed within a minute:** the probe's `build-mod` also installs the mod into `Documents\Timberborn\Mods` unless
  told `--no-install`. I removed the `DGMProbe` folder at once; Timberborn wasn't running, and your other mods weren't
  touched. HANDOFF now says to build with `--no-install`.
- **Timberborn was open when I arrived;** you closed it (12:05).

### 7. Workstreams at the pause (2026-09-27, evening; models by D301)

Nothing is running. Every branch is committed, pushed and clean; the next steps are in [HANDOFF.md §1](HANDOFF.md#1-resume-here-the-order-of-work).

| Workstream | Branch (worktree), last commit | Agent, model | State and next step |
|---|---|---|---|
| The forces (batch 1, D321, D327) | `feature/forces` (`-forces`, #77) | `build`, Opus 5.5 high | started 2026-09-29 |
| The brushes (batch 2, D322) | `feature/brushes` (`-brushes`) | `build`, Opus 5.5 high | started 2026-09-29; merges into the forces |
| Select, shelf, shortcuts (batch 3, D323, D328) | `feature/select-shelf` (`-select`) | `build-light-medium`, Sonnet 5.5 medium | started 2026-09-29; merges first; the medium trial |
| M9b (batch 5, D325, D329; D273–D278, D298, D308, D311, D314) | `feature/m9b` (`-m9b`, #70), 66146f34 | `m9b-build`, Opus 5.5 xhigh | re-pin half done (quick suite 765 passed, 10 failed: 9 map-bound, one resources measure at 0.5225 against < 0.52); next: merge `dev` (M9a), re-seed six tests, re-pin 4242, then the release candidate |
| Real places, round 2 (D271, D300, D306, D314) | `feature/real-places-2` (`-places`, #35), cbaf6cf6 | `build`, Opus 5.5 high; release on `build-light` | grouped sources wired (VERSION 11); 37 of 136 converted; next: `npx tsx tools/places-convert.ts --threads 3` (1.5–3 h), check, release |
| Grouped sources, the rule (D314) | `feature/source-groups` (`-groups`, #79), a6346fe4 | — | merges into `dev` with the first branch that carries it; the investigation #78 is merged (685d9b18) |
| The look (batch 4, D324; D284, D304, D305, D310) | `feature/high-look` (`-high`, #75) | `build-light`, Sonnet 5.5 high | built 2026-09-29 (86eddaea, CI green); held for your High look sitting (captures in `docs/look/high/d324-*.jpg`) |
| Drought and Badtide, day by day | `feature/weather-days` (`-weather`, #73), 5bb13406 | `build`, then `build-light` | held for its own sitting |
| The Erode investigation (D281) | `investigation/erode` (#74), 47c02e67 | Codex | merged into `dev` as an investigation (be2342a2), rounds 2–9 approved by you; adoption at 3D step 3 |
| 3D foundations: new modules | `feature/terrain3d-a` (`-3d`, #71), 24b88b9b | `build` | verified in the game; the wiring waits for the forces and M9b on `dev` |
| Orchestrating, merging, releasing, probe batches | `dev` | the session, Opus 5.5 high | background scripts do the waiting |

Nothing merges into `dev` or is released without your yes, except housekeeping and investigations at a boundary.

## The takeover, 2026-09-26

**This computer** (details in [HANDOFF.md §9](HANDOFF.md#9-this-machine)): Windows 10 Pro 22H2, Ryzen 5 3600, 32 GB.
- **Tools installed** (per user, official sources, no administrator rights, no system settings changed): Node 22.23.3,
  Python 3.12.10 with numpy and pillow, the .NET 8 SDK 8.0.425, ilspycmd 8.2. Git and gh were here (gh logged in).
- **Repository and worktrees** under `C:\Users\krams\code\`: `DamGoodMaps` (dev), `-m9a`, `-live`, `-waterfalls`,
  `-places`, and `-carve-check` (#47, detached, for checks); `npm ci` in each.
- **Timberborn** 1.1.2.4-52e959e-sw (Steam build 25096761) at `C:\Program Files (x86)\Steam\steamapps\common\Timberborn`:
  the same build the repository was verified against, so nothing our code relies on changed. `investigation/decompiled/`
  regenerated from it (497 files).
- **Sleep and restarts:** the power plan never sleeps or hibernates on mains power. Automatic updates are off by policy
  (last update 2023), so no update restart is scheduled or likely. Windows restarts itself after a crash; HANDOFF §9 says
  how to resume.
- **Not here:** `C:\dgm-workshop` and `C:\dgm-reference`. The local-only official-map tests stay skipped here, as on CI.

**The starting point, checked against HANDOFF.md:**

| What | Handoff | Found | Local checks |
|---|---|---|---|
| `dev` | 4f1b8c6 | 4f1b8c6 | CI green |
| `main` | 8995cee | 8995cee | |
| M9a (`feature/m9a`, #56) | 12beeb3, CI red until settings and test fixes | 12beeb3, CI red | typecheck passes; quick suite: 7 failures, the same 7 as CI (below) |
| Live editing (`feature/live-editing`) | b4d7c27, CI not yet seen green | b4d7c27, **CI green** | typecheck passes; quick suite all green (587 tests) |
| Carve (#47) | 6b9d4e6 | 6b9d4e6, CI green | typecheck passes; quick suite green (420); its own tests and typecheck pass |
| Quake (#52) | 4e8115a, held | **a293e41**, Codex's Slide round done, CI green | ready (D219) |
| Craterize #51, Erupt #50, waterfalls #53, places #35 | 2f4963c, 89c6842, b00b2fc, a59c051 | the same, CI green | |
| `investigation/forces-core`, `investigation/juice` | expected from Codex | not pushed yet | |

**M9a's 7 quick-suite failures at 12beeb3** (identical here and on CI): `look-mine-ruins` (the pinned sha256); in
`objects.test`: the weir and plug, the second district's site, ruins on a rise, the generated weir; `setpieces.test`: the
on-river fall's drop; `validate.test`: `water.badwater_contained`. Differences from the handoff's list: `badwater.test`
passes, and the `setpieces` and two weir tests weren't listed.

## Decisions since M8

Every decision Kyler sent since `m8-done`, in the version in force.

- **D107** Beaverome is off M8's approximate-water list; `start.dry` stays as built, and lakeside
  starts are a Refinement item, measured first; 3D-a applies the floor rule only under roofs
  (D145).
- **Refinement: the load checks** keep a load check only where the game really rejects or breaks
  the map; otherwise a warning.
- **D108** Product principle: maps are created, never copied, never a few archetypes with noise.
- **D109** An M9 design step comes before M9 (its gate is D112's).
- **D110** Map look as built from Kyler's reference (dry ground's colour: D135).
- **D111** No built dam walls, anywhere; `water.storage_possible` replaces `water.reservoir`.
- **D112** Kyler approves M9 design version 2 by judgement, from the measures (information), the
  simulated play and ten briefs; the dam-wall check blocks; the permanent measures run after M9.
- **M9a's contact-sheet command** `npm run sheet`: a tool for Kyler's eyes, not a gate.
- **D113** Frame pass after the M9 build, before the 3D stages (`frame-pass-done`). Amended by D253
  (M10 and M11 removed).
- **D114** Map look's first fix round (its marks and enlarged objects: D135's information layer).
- **D115** Kyler's one rule: only breakage, Kyler's decided principles and what a player feels
  block; measures and budgets are information; Kyler decides visual work from captures; stop
  only for real decisions or breakage. (It replaces the first note on a lighter process.)
  ROADMAP's Blocking and Information lists stand; the dam-wall check and the support rule always
  block; CI's timing tests become reported numbers (D145).
- **D116** M9a's in-game gate is a DGM Probe batch, not Kyler's play test; 3D-b's too, T7
  included (D145).
- **D117** The probe rule: the Probe may launch Timberborn only after Kyler's yes in chat, every
  batch (CLAUDE.md).
- **D118–D127** Real 3D terrain is essential: P3D-1 to P3D-9 adopted (runs per tile, stacked
  water, the support rule, the floor graph, Verticality, the 3D stages after the Frame pass,
  editing caves, one mesher, the Probe for 3D). I-1: format 3 stores runs from M9a.
- **D128** No approximation: at most 10% of a theme's maps under the workshop's p10 distance.
- **D129** The audit: A1 and A2 into M9a; A3 and A4 onto the Refinement list.
- **D130** The simulation speedups, as proposals, in M9a's build plan, each proved bit for bit.
- **D131** The techniques playbook, as proposals for M9 and the 3D design.
- **D132** Verticality (`vt`) beside Variety, in M9a; above 16 only at 70 and above, locked until
  a probe batch confirms it; 3D-b extends it to 3D forms (D145); vertical and traversable;
  measured in design version 2.
- **D133** The Weather view with live water, after the 3D stages (`weather-view-done`). Amended by
  D253 (now right before the refinement phase, not M10).
- **D134** Keep M12 ready: each step adds tool entries and suite requests, and keeps the suite green.
  Amended by D256 (no longer names M10 or M11).
- **D135** Map look: a clean default look close to the game, and an information layer; Kyler
  approves the appeal from captures.
- **D136** Real places: a gallery of 88 real-terrain maps, right after Map look
  (`real-places-done`).
- **D137** The workshop ratings are dropped; the score is a mild tiebreaker; in-site feedback is
  proposed for M9c. M13's rating form is dropped too; a plain "report a problem" link stays
  (D145).
- **D138** Maps feel authored: one or two intentions per map, under three principles.
- **D139** Claude steers the generator and never hand-builds the map; "describe the map you want"
  in M12. New landforms, water features, dam opportunities and character requests ("harsher")
  steer; precise edits and follow-ups stay operations (D145). Amended by D256: whole-map generation
  for character and new features, the forces for local change; that tool is gone (D253).
- **D140** M12's model layer is provider-neutral; Claude is the only provider built.
- **D141** A Dam Good Maps MCP server, after M12.
- **D142** The agent guide, after M9a.
- **D143** Variations of this map, in M9c.
- **D144** A contact-sheet image at every map-changing step, in `docs/sheets/`.
- **D145** Kyler's answers to the eight flags, folded into the lines above. Also: M9a, M9b and M9c
  are approved as M9's stages; what goes into each waits for design version 2.
- **Design version 2** is being built on `investigation/generative-v2` (PR #32).
- D146: a **Map quality checkpoint** after the M9 build: contact sheets, a probe batch (asked first), the measures as information, the weakest patterns; tuning rounds until Kyler says go.
- D147: **Map look 2: water and shadows** before the Frame pass: a High mode with a proper water shader and soft sun shadows only; today's textures stay; AO, grading, richer textures and models later, optional.
- D148: tests a decision made stale are updated to the current decision, renamed and logged, without asking; never weakened.
- D149: the DGM Probe's integration, adopted as proposals; Kyler decided its two conflicts: results go to `C:\dgm-probe\`, and the probe batch alone is M9a's gate.
- D150: dependency updates: Actions and minor or patch npm updates merged when CI is green; majors held for a deliberate upgrade step (refinement); one weekly Dependabot pull request per ecosystem.
- D151: no edge walls (extends D111); a blocking check.
- D152: maps don't have to hold their water; no walls or rims; the settle check accepts a steady flow off the map.
- D153: start water counts over natural slopes within 12 / 20 / 28 tiles (amends D85).
- D154: contaminated ground is a layer of crack veins over the ground's own look.
- D155–D157: Real places, second round: short descriptions with a credits page, deploy-time files, clean titles, 3D thumbnails, no walls, about 150 places.
- D158: **Live editing**, alongside the M9 design: a triage first, then Cities-style terrain brushes and water that never blocks; tried by Kyler on `/preview/` (its shape tools removed by D182). Amended by D253 (M10 and M11 removed).
- D159: M11's heightmap import uses the survey's conversion pipeline (drainage rivers, sources, the start rules, the water rules). Superseded by D255 (built from Real places' conversion instead).
- D160: later, after M11: "Pick a place" from a world map or coordinates, open elevation data only, with attribution. Amended by D253, D255.
- D161: the north-star journey: a striking place → Pick a place → the Weather view → Live editing → play; each step smooth, no gaps.
- D160/D175: Pick a place, the full experience (explore a 3D world map, frame a square with a live block preview, one click to build), right after M11 and before the refinement phase. Amended by D255 (no longer waits for M11).
- D162: Save to Timberborn, soon: pick the Maps folder once, then save straight into it (Chrome, Edge).
- D163: later, proposed: a companion mod that lists and starts new Dam Good Maps maps from the game's menu.
- D164: starting wood: the start counts logs by species (oak 8, pine 2 plus resin, birch 1), not trees; "Minimum starting wood"; species as a generator lever.
- D165: Kyler's four intentions (start under a cliff with water below; a snaking river down a hill; a crater where rivers converge; a cliff waterfall into a large round lake), plus 10–15 candidates for him to pick.
- D166: Pick a place: real land, designed water; it never fails for lack of water, meets the start rules, and quietly tries other sizes, scales and offsets; #34 held until its designed-water follow-up is finished and green, then merged and adopted with this change. Amended by D255 (the quiet retries never replace the player's framing, size or scale).
- D167–D170: resources like the official maps: a mine site on every map (Mine sites 1–4), tree counts and living/dead share by size, groves and berry patches in clusters, ruins that vary; one shared baseline for the generator, Real places and Pick a place.
- D171: water sources start rivers: only at heads (edge inflows, springs), clustered for more flow, never inside an existing flow; a check flags any that are.
- D172: tall maps (up to 22): allowed in both validators once a probe batch confirms; a standard/tall option for Real places and Pick a place, dramatic places tall by default.
- D173: #33's exact-weather speedups and scheduling, adopted as Weather view proposals.
- D174: Real places review: 3D thumbnails with a crisp 2D top-down (two layouts to pick from), tighter framing, the survey patches may be re-downloaded, credits confirmed, three titles changed.
- D176: design timing: new interface uses the existing shared styles and components until the Frame pass; after it, the design records; M12 and M13 get the finish review, no second full design pass.
- D172 (1) confirmed: the tall-maps probe batch passed, so both validators allow heights up to 22 (built in the start and edge rules).
- D177: in the Standard look, badwater blends smoothly into clean water by contamination (toward #4B3C37), a soft gradient over several tiles, distinct in greyscale; consistent with #38's High look.
- D178: mine sites and ruins get models of our own: a sunken pit with a rusty frame and corner scaffolding; ruined scaffold towers with braces, panels and ivy on moist ground.
<!-- retired-terms:allow -->
- D179: **Live editing is how you edit a map**, the editor's core principle: every tool live, water flowing visibly after every edit, brush shapes and a precise mode, one Select tool; no plan-confirm-place flow remains (its water tools, plant painting and object dragging became D184's smart Lower, Source and left shelf). Its precise mode retired by D322 (the target level).
<!-- /retired-terms:allow -->
- #56: a failed Pick a place map is never shown; nearby choices that passed, or what to try.
- D180: Live editing additions: a smooth native camera (WASD, Q/E, Shift), Remove (first named Demolish), water-aware Ctrl-click sampling, player-set source strength, "let the water carve" (Carve since D194), water time controls with a "drought" button, and local-first water that always ends at the game's settled result (its drawn-river rules and natural or exact rivers removed by D184).
- D181: more for water: carving forms valleys (downcutting, slumping terraces, floodplains, deltas; steep or wide walls), moisture and grass spreading live from new water, a "badtide" button, optional water sounds of our own.
- D182: **the brush kit is the core of the editor**: the landform objects and their handles removed, no presets; terraces and ramps (now Flatten and Smooth options, D184), pen pressure and level lines; future tools brush-first (carving is a brush). Amended by D253 (symmetry and stamps removed).
- D183: live dimensions: a selection's size in tiles, a straight stroke's length, the level while flattening (D184 removed the other cursor readouts).
- D184: **the editor's design principles**: the land is the interface; a top bar (Raise, Lower, Flatten, Smooth, Naturalize | Source | Remove) with a small options row; water from smart Lower and Source, everything else emerging from the land; a left shelf of object icons with live ghosts; view buttons with overlays; a header with Save to Timberborn and one menu; a quiet status dot; drawn rivers and lakes removed; plain scroll zooms (strength on Shift+scroll since D196).
- D185–D187: the editor is desktop-first; the editor's Drought and Badtide buttons show each event, and the Weather view is the separate full-cycle timeline; Claude is a summoned chat box.
- D188: docs are part of done: living docs updated in the same PR, a drift check at each milestone boundary, a CI guard for retired terms, and a docs index (`docs/README.md`). EDITOR_PLAN.md now opens with the editor's vision.
- D189: design version 2's scope is frozen; anything new goes into the M9a, M9b or M9c builds.
- D190: #51–#53 decided (the defaults): world traits are candidate intentions; wet caves allowed in 3D-b; the no-clone distance picks candidates, the score breaks near ties.
- D191: Save to Timberborn never overwrites; a same-named map is saved as "Name (2)" with a quiet note.
- D192: Pick a place's signature water (#45) with ESA WorldCover, credited like the elevation data; hard cases offered with nearby alternatives.
<!-- retired-terms:allow -->
- D193: hold to dig: in precise mode, holding Lower or Raise keeps working a level at a time, with an optional stop level. Retired by D322 (the target level).
<!-- /retired-terms:allow -->
- D194: Carve becomes a force of nature with its own top-bar button next to Source; PR #47 held until Kyler says it's ready.
- D195: investigations commit reports, code, small samples and a few captures; large generated results stay out of git (a gitignored `local/` folder or a GitHub Release), with how to regenerate them.
- D196: water is never an object (no river selection or panel; flow and clean or bad belong to sources); sources always findable; clear water while a tool is picked or with T; Alt+scroll slices layers and Shift+scroll sets strength, as in the game (replaces #58); water in the hover readout.
- D197: water near an edit moves within a frame or two; a speed control (slower, normal, faster, instant), brisk by default; the final water is always the game's settled result.
- D199: Carve's full feature set (Unleash and Aim, Defy gravity, Power, Width, Wander, variation, Try another path, Steep or Wide walls, Keep river or Dry canyon, a following camera with effects, Stop and instant undo), kept whole when #47 lands.
- D200: at least one permanent badwater source on every map (generated, Real places, Pick a place), placed naturally at the per-difficulty distance, counts and strengths like the official maps. A "No badwater" option makes a peaceful map (badtides still happen).
- D201: waterfalls with shape and volume in the Standard look (an arcing translucent ribbon, foam at the lip, whitewater below, cascades as small falls); mist and spray in Map look 2's High mode.
- D202: Craterize, a giant-impact tool with its own button next to Carve; its prototype (`investigation/craterize`) is held until Kyler says it's ready.
- D203: Quake (a fault line: Lift or Slide, Power, Sheer or Stepped scarp) joins Carve and Craterize in a visually distinct forces group on the top bar; all three share one forces core; its prototype is held until Kyler says it's ready.
- D204: Flatten from the stroke's start, cut and fill, Cliff or Ramped edges, a "start fits here" hint, objects ride the ground; and the principle "tools read intent".
- D205: drag to resize the brush (hold F), juice with optional quiet sounds, a minimap (on at 256²), camera bookmarks (Ctrl+Shift+1–9, Shift+1–9); a build time-lapse near M13.
- D206: Erupt (a volcano: Vent or Fissure, Power, Steep or Broad, a summit, flows) joins the forces; every force's options row starts with its mode switch; all four share one forces core; its prototype is held until Kyler says it's ready.
- D207: visible layers identical to Timberborn: a compact layer widget, slicing, the layer pick, tools acting on the visible land; Esc never resets the slice.
- D208 (for M9b): themes become optional leanings; the default is "Any" (Surprise me), combining landforms, water and intentions freely; measured for coherence, playability and no archetype clusters.
- D209: design version 2 approved; M9a builds it with "Any" as the default and no ruler-straight rivers; M9b fixes Islands' sameness and raises Kyler's crater and waterfall-lake intentions; pending #59–#68 decided (#66 later).
- D210: M9a on Opus 5.5 at xhigh, M9b and M9c at high, routine work on Sonnet 5.5 at medium; M9a first when work competes.
- D211: M9a's settings: Lake Basin's water share is information until M9b; Start area is a preference ("prefer a roomy / tight start"), and the map card shows the actual bench size.
- D212: Live editing's two changes before release: sources on the left shelf (Water source, Badwater source, after Start); clear water only under and around the brush over water, still reading as water; defaults confirmed.
- D213: #54 goes in with M9a; removing the last badwater spring switches the map to No badwater.
- D214: Real places: strengths near the official range, the start moved closer to water, places that can't work dropped; "Centre" titles renamed.
- D215: waterfalls: no V-shaped gap, more whitewater and splash; then released.
- D216: Carve, Craterize and Erupt ready; one shared forces core. D217: 3D carving is smarter Lower and Raise.
- D218: on the dedicated machine only, probe batches run without asking first; reported in STATUS.
- D219: Quake is ready with both Lift and Slide; all four forces go to the preview, released after Kyler tries them.
- D220: Codex's forces-core and juice investigations merged once green and adopted as proposals.
- D221: a "Progress log" issue (#57) gets a short comment at each step, release, probe batch or parked item.
- D222: #69–#71 and #73 confirmed; #72 changed (evaporation from sealed basins isn't "water still changing"); the waterfalls' foam softened to soft white water; the Real places review sheet as an image on #35.
- D224: **the starting-logs floor**, 167 logs for 1.1.2.4 (Iron Teeth's worst route to a Forester, 99, plus a pump and a Barrack, 52, plus 10%), computed from the game's blueprints by `tools/log-floor.ts`; blocking for generated maps, Real places and Pick a place; applied in M9a.
- D225: **[PERFECT.md](PERFECT.md)**, what perfect means: the yardstick for every review.
- **D244 step 1, prepared** (branch `chore/ceiling-probe`, a0be2aa): three editor-made tall maps in `C:\dgm-probe\ceiling\` (a volcano from level 4 to a summit at 22 with a stream at its foot; a waterfall from 21 into the river; a 256² plateau raised to 22), each passing both validators, and a "Ceiling" probe group (about 24 minutes). The batch runs right after M9a's (M9a first). Found on the way: **the editor clips edited land above 16 back to 16 even on a tall map** (the build's integrity pass, `MAX_TERRAIN`, and five other places), on dev and the released editor too, so a force on a tall map ends in a flat mesa at 16; step 2 lifts all six. **Timberborn's own map editor keeps land above 16** when it opens and saves a map (the same loader as a game; its save packs every voxel); its brushes only can't raise above 16, and its absolute-height brush cuts tall land down where painted. So the tall note can say, plainly: "Timberborn's map editor opens and saves this map as it is, but can't raise land above level 16."
- **Glaciate (#69):** open and green, held (D246): Kyler has it in another round of feedback and changes with Codex.
- D315: the Select row gains Delete sources: every source in the selection (Ctrl+A: the map), nothing else, one undo step.
- D314: sources in rows and clusters as in the official maps (the investigation #78; the rule `src/core/water/sourceGroups.ts`, #79): a row across the flow for clean water, single or a close pair for badwater; wired into the generator (M9b), Real places, Carve's source and Glaciate's meltwater. The shelf's source stays single, and Unleash carves from the source it was given (no row at its head).
- D313: Smooth's sound a softer relative of Flatten's; over-compressed sounds re-encoded; the default volume a quarter lower (saved volumes kept).
<!-- retired-terms:allow -->- D312: a force's size ring at the cursor; Shift+click waypoints for Carve and Glaciate; Erupt's terrain final in ~2 s.<!-- /retired-terms:allow -->
- D311: the game's water rules in M9b accepted where thin sheets form less; the pooled probe checks against the game.
- D310: clean water and badwater's floor darken together toward the game; the readability tests restored; bubbles and texture help the faintest badwater.
- D309: the forces' details come back behind a More button, each on Auto (nature's pick), pinnable; after a run each Auto detail shows its value with one click to pin it; Try another re-rolls only Auto. On feature/forces (`build-light`).
- D308: consolidation: the game's water, edge-spill and soil rules land together in M9b (one re-pin, one set of batches); in-game checks pooled into one probe batch at M9b's release candidate; M9b's full batches only at its release candidate; review sets only when your eye is needed.
- D307: a floodplain floods, as the game plays it: the floor rule and the channels stay; the day strip's hover says "Floods when the river refills"; M9b's default (b) reverted.
- D306: Real places rebuilt at 256² with each signature centred at its current scale and its full height range (the edges compressed); Pick a place's square defaults to 256²; the tall versions next round.
- D305: a ruin seen from afar reads as the same ruin: the far version in the skeleton's muted rust with a lattice, the swap unnoticeable while orbiting; on `feature/high-look` (`build-light`).
- D304: clean water's shades fitted to the game's own (sampled from your screenshot): one teal-blue body, deep only a little darker, shallows never grey; badwater unchanged; on `feature/high-look` (`build-light`).
- D303: the game's edge-spill rule adopted everywhere with D293's switch (#125).
- D302: M9a released once the tall maps' reopen check is clean and no start meets `start.water` only through a sealed puddle (else the rule is fixed first); wet-tile counts judged as D297; the side pool and Delta's flats go to M9b.
- D301 (in force now, by your correction): Opus where judgment is the product (M9b at xhigh; the forces, Glaciate, 3D, the High look's and Erode's adoption and the session at high), Sonnet 5.5 high (`build-light`) for written specs, `routine` as now, background scripts for waiting; `build-xhigh` removed; D286's temporary rules ended, its workstreams continue.
- D300: Real places finished without another sheet: the bed lowered under real water, most of the tilt taken out, a water floor (a small natural spring near the start where a place has no water), #94 accepted; checked by the session; then badwater after M9a, and the release.
- D299: the generator page's Moist soil switch stays until "The page is the editor"; Quake's Left/Right control stays gone (X flips the side).
- D298: the game's own soil rules adopted in M9b (with the Python moisture check); M9b reports plants moved or changed and generation times.
- D297: D295's line reads on the new depth under the game's rules.
- D296: the frame's touch-up to the High look is done in the design pass; the High look adoption changes no interface styling.
- D295: thin-sheet flips are the game's result: a tile may change wet/dry only within 0.01 of the wet line, volume within 0.1%.
- D294: yes to M9a (probe batch, then `m9a-done`); M9b starts from the review set's shortfalls; #90 accepted.
- D293: one water model everywhere, the game's: the Python check gets the game's evaporation rule when the stacked engine is wired in; heightfield water unchanged until then.
- D292: Glaciate merged as it is (#69, 8ef9842); adopted on `feature/glaciate`, its floor's water led into one river, for your sitting.
- D291: Glaciate's round 4 pre-approved: merged when its report shows one river on the floor (wet share under 15%, one wet passage) and no camera motion, with CI green; then adopted on its own branch from the forces, for your sitting.
- D290: a badwater source on uneven ground cuts its 3×3 down to the lowest tile (a small spring pool) instead of refusing; refusals give one plain reason. On feature/forces.
- D289: every force's row is Power, Size, at most one signature choice, Try another; Carve's Defy gravity and keep-carved button gone. On feature/forces.
- D288: the Remove tool goes; Select and Delete remove a selection's objects and sources (never the start). On feature/forces.
- D287: one Top-down toggle; no Dam sites, Moisture or Drought views. On feature/forces.
- D286 (ended early by D301): more in parallel: M9b starts (m9b-build, xhigh), the High look adoption starts (build), housekeeping (routine), the 3D foundations only as new modules (the stacked water engine at xhigh, the support check); the conversion to runs after the forces and M9b merge (that order stays). Nothing merges into dev without your yes.
- D285: slimmed: M13 (a problem link, shortcuts and help, a performance pass; versioned deploys and mobile layouts to Later), the Weather step (the drought line and a map-card line), Pick a place (a 2D shaded-relief map, the preview on release, desktop only); the time-lapse to Later.
- D284: the High look is adopted right after the forces' release, alongside "The page is the editor", and becomes the default where it runs smoothly (fallback to Standard, measured on the RTX 2070 SUPER).
- D283: cut: the Map quality checkpoint, the Frame pass as a step, the refinement phase as a milestone (its small items become housekeeping), the agent guide (waits with M12).
- D282: the editor is where the magic happens; the generator provides the canvas. M9a keeps the machine until its release; then the editor's work and M9b share it. The forces' preview and release come first among the work waiting for you.
- D281: 3D is built on `build`; the Erode investigation (caves, overhangs, arches by a force) is built by the session on `investigation/erode`, held until you try it.
- D280: 3D in four steps: foundations now (runs, the stacked water engine, the support and floor checks, T1–T6), then the view (after the High look), then creating (Erode, a block tool, brushes onto runs), then generation (after M9b).
- D279: 3D's scope (generated and player-made caves, overhangs and arches; water as in the game); tested only for what a player would see go wrong; no Python copy of the stacked water: verified in game by the probe, then golden fixtures.
- D278: M9c removed; into M9b: candidates chosen by the five outcomes (the score and K = 3 gone), names and a "how it plays" line, Another like this; the place resolver and judgement words move to M12 (deferred); votes, score-params and the old premises dropped.
- D277: all M12 work is deferred while you refine Dam Good Maps: no Claude steps, suite requests or re-runs; the Claude suite leaves the regular checks (kept, unmaintained); M12 stays last and starts by catching Claude up.
- D276: M9b defers difficulty through terrain to a later step of its own; the floor and the start's guards unchanged; Variety, Surprise me, the dam-wall check and M12 readiness kept.
- D275: M9b folds recipes into intentions; flow-direction variety from the 8 orientations (all appear, none over a quarter).
- D274: M9b's intentions: your four, the seven in the set, and ten candidates added (oxbow, stepped lakes, split round an island, twin falls, the long cliff, hanging valleys, two ways to grow, badwater through the richest land, a relic on a pinnacle, a plug holding a lake); four left out; settles #66.
- D273: M9b is done when five outcomes hold by your eye (a readable water story, themes keep their promise, every map has a character, any handful differs, nothing looks stamped), Any at Variety and Verticality 100 included (four such maps at 256² in every review set).
- D272: PERFECT's Real places gains your third line: "It's a canvas to reimagine: every tool and force works on it like any map, so a player can put a crater in Yosemite Valley and build a mega dam."
- D271: Real places: 15 places dropped; the water follows the real place (observed rivers and lakes; dry places stay dry; D214's fewer, larger rivers where it keeps moving), then a new sheet with 9 held places and 5 for your eye; badwater after your answer.
- D270: your answers: #84 taken (Ramped lays its own slopes); #81, #82, #87, #88, #91, #92, #93 accepted; #85 except its last line (D271); #89 only for the generator and Claude, never the brushes, forces or Select; #90 held for the review set's dead groves.
- D269: an edit while a hazard is shown ends the hazard view (D267's live update dropped); a drought line on the shores is proposed for the Weather step.
- D268: Speed belongs to the day strip alone; the water bar has no speed control, and water after an edit plays at the normal pace.
- D267: Drought and Badtide day by day (the worst day at once, a day strip, the start's-water marker); the Weather view folded into them. On its own branch, for a sitting of its own.
- D266: every force plays at its own pace, whatever the water's speed. On feature/forces.
- D265: the camera only moves when the player moves it (an accessibility rule): every follow removed, now and later. On feature/forces.
- D264: Select all (Ctrl+A); Set level's Set, Cut down and Fill up; Max water depth (the ground under deeper water is raised, the water re-settles); precision tools, one undo step each, clearly labelled. On feature/forces.
- D263: smart Lower's depth comes from strokes, not holding: a new channel's water is about one tile deep (its bed one level below the water it leaves, no pit), a stroke along a channel deepens it one level; plain Lower unchanged. On feature/forces.
- D262: M9b runs at xhigh on its own definition, `m9b-build`; M9c stays on `m9-build` at high.
- D261: Select's Same level becomes Wand, which also selects a river's or lake's visible water (a snapshot), so a bed can be reshaped without touching the banks. On feature/forces.
- D260: water no source feeds recedes at once, as part of the edit's own journey (stored oxbow lakes stay while their hollow holds them); a removed source's marker and label go at once. On feature/forces, for your forces sitting.
- D259: Select is findable (a bar button; Circle and Brush shapes; Set level to the ceiling; Ctrl+click for the level) and its open selection is the working area: tools work only inside it, a feathered edge, the forces treat the outside as rock; Ctrl+drag with a brush fences and keeps painting; one row, a chip. On feature/forces.
- D258: clean, magic gestures: no force draws a predicted route, outline or footprint; click modes are one click; Aim is a drag with only a thin arrow; drawn strokes (Quake's fault, Erupt's fissure) stay visible. On feature/forces.
- D257: the forces are bound only by nature: they never refuse or reshape for playability; the checks dot and its one-click fixes make the result fit a good start; the start is carried to the nearest valid level ground. On feature/forces.
- D256: M12 works through whole maps and the forces: no regrowing or locking areas; "make the north mountainous" is Quake or Erupt, "add a big waterfall" Carve or Unleash; the brushes for precise edits.
- D255: Pick a place takes over the conversion (from Real places', in the browser); the framed land is kept (D245's rule, with notes); retries never replace the player's framing, size or scale; no heightmap upload planned.
- D254: the working area (amended by D259: it is Select's selection).
- D253: M10 and M11 removed: no symmetry, stamps, regrowing an area, or locks; Naturalize's checks kept as tests; the steps after them follow the Weather view.
- D252: M9 is judged by your eye against PERFECT before each stage's release: starts stop looking alike (M9a); a review set on #56 before M9a's release; M9b's and M9c's acceptance adds your eye as blocking.
- D251: every task on its own agent definition's model and effort.
- D250: Map look phase 3, "Finish the world" (#67), approved as revised in round 2 and merged (8ed950a; 10 MB, 94 capture JPEGs from the two review rounds, all original); adopted into High with #38, #65 and #66, plus badtide withering on poisoned soil and a cost measurement on this machine's RTX 2070 SUPER.
- D249: the terrain brushes get **Clear sources** (off by default; the sources under the ring glow red and go with the stroke); with it off, sources ride the ground (no pits or pillars); sources are easy to hit (within about two tiles, any tool) and Delete removes the targeted one; a Remove drag starting on a source takes only sources. On feature/forces, for your forces sitting.
- D248: Level lines moves from the brush options row to the view bar, beside Height colours (a view switch, working with any tool). On feature/forces, for your forces sitting.
- D247: Smooth's walkable option removed (it only nominated ground to the slope planner, so usually nothing happened where the player painted); the shelf's Slope puts a slope exactly where wanted; saved strokes still replay exactly; Flatten's ramped edges checked. On feature/forces, for your forces sitting.
- D246: Glaciate, a new force (a valley made glacial: a level floor, a chain of lakes, hanging valleys, moraines; Flow or Aim, Power, Size, Meltwater, Try another); Codex's `investigation/glaciate` is held until you've tried its demo, then built on the forces core after round 2.
- D245: Real places are kept on their own land (amends D214): only the correctness checks and the starting-logs floor gate a place; its card notes only no pumpable water in reach, too little wood near the start, or water that keeps moving; the grey area answered: unsettled water is preference, not correctness. The 34 changed places get their best version, second maps go back to their centre, a new review sheet.
- D244: one height ceiling in the editor on every map (D172's tall maximum) for the brushes, the forces and Claude's steps; a map above 16 becomes tall and standard again at 16 or below; generation unchanged; Erupt's round-2 fit kept. Step 1, an in-game probe check of editor-made tall maps, before building; then built with Unleash, on the preview.
- D243: Codex's Map look phase 3, "finish the world" (`investigation/maplook-finish`), is merged as proposals only when green; nothing adopted until Kyler reviews its stages.
- D241, D242: #66's vegetation and #65's Map look 3 (phase 1) approved; both adopted into the High look in the Map look work with #38's water and soft shadows (warm sunlight, ambient occlusion, colour-preserving tone mapping and grade, distance haze, sky, rock strata, soil edges, colour variation; the new trees tuned to this lighting); each effect switchable; Standard unchanged; High measured on dense 256² maps before release. The new trees in Standard only if cheap on a real GPU (#83).
- D240: the editor feels alive: short, visual-only animations for land, water and moments (Generate's reveal, pops, undo in reverse, Save to Timberborn's send-off), synced sounds, off with reduced motion, GPU effects scaled down on weaker hardware; the final map and water unchanged. After the forces round 2, alongside D235.
- D239: Unleash on water sources: a selected source's small Unleash action (or U) carves its own river with Carve's engine, breaking out of a pool at its rim's lowest point; strength sets width, a quick Power; one undo step. On the preview with or right after the forces round 2.
- D237: "Without pre-filled water" leaves the player's page (folded into D233); the capability stays internal for the probe and tests.
- D236: the design pass comes straight after your editor UI audit of the combined page; M9b and M9c run in parallel with "The page is the editor" and take the machine first. #79's defaults accepted (D238): the Frame pass is a light update after Map look 2 from the design pass's records; the refinement phase gets its own `refinement-done` tag. Amended by D255 (Pick a place no longer waits for M11).
- D235: scatter-type shelf items (trees, bushes, ruins, thorns) place like a brush, as in Cities: Skylines: size and density, natural scatter, gap filling, an amber warning on dry ground, an Age option for trees, a click still places one; unique landmarks stay single. Scheduled after the forces round 2, on the preview.
- D232–D234: 3D everywhere; the landing page's map is the editor (essentials around it, a full-screen editor behind an expand button, undoable Generate, a Legend button); Your maps (the last 30 edited maps in this browser). Scheduled after the forces round 2 and M9a's release; then your editor UI audit, then the design pass.
- D231: #63 accepted (#77, #78); the crown's per-tile curls, the fall's straight edge at the pool and the milky froth are queued for the next waterfall look pass (Map look 2 or 3).
- D230: Codex's `investigation/vegetation` (the higher-fidelity look's phase 2) is merged as proposals only when green, like maplook3; nothing adopted until Kyler reviews both demos.
- D229: the floor's wood is met in varied, natural ways within the 40-tile walk (groves along a river, a forest across a stream, oaks on a plateau, pines in a side valley), never the same forest beside every start; M9a's sheets are checked for converging starts.
- D228: Codex's `investigation/maplook3` (a higher-fidelity High look, phase 1) is merged as proposals only when green; nothing adopted until Kyler reviews its demo.
- D227: the floor, amended: the Breeding Pod joins the essentials (**178 logs** for 1.1.2.4), counted within about 40 tiles' walk ("can I survive"); Minimum starting wood within 20 tiles ("how comfortable"): Easy 250, Normal 200, Hard none beyond the floor.
- D226: the forces' review: Erupt fixed to the demo (a peak within its headroom, cones on the flanks, it always completes); Power and size separate in every force (Carve's Depth, Craterize's and Erupt's Size); the brush size in the options row; the shelf reads Water source, Badwater source, Start, Pine; sounds louder; #74 accepted.
- D223: a seed's candidates: the best wins by the quality score; variety breaks near ties only; only true near-duplicates are rejected, resemblance is information (replaces #53's default).

## Done and released

- **Resources like the official maps** (#43, D167–D170, generator 0.6.2) are merged into `dev`; they ship with
  the next release.
- **Merged investigations:** #45 (Pick a place's signature water, D192) and #38 (Map look 2), adopted as
  proposals for their steps.
- **Save to Timberborn** is live (`save-to-timberborn-done`, #40, D162, D191).
- **Mine sites and ruins** are live (`look-mine-ruins-done`, #42, D178).
- **Badwater blending** is live (`look-badwater-done`, #41, D177): tainted water turns warm red-brown through
  the game's mixing grey, never purple; one shared water palette.
- **The start and edge rules** are live (`start-edge-rules-done`, #44, released in PR #48, live check passed):
  no edge walls, start water over natural slopes, starting wood in logs, sources start rivers, heights up to 22.
- **The preview workflow** is live (`preview-workflow-done`, PR #39, live check passed):
  <https://timbermods.github.io/dam-good-maps/preview/> shows Live editing (noindex).
- **Real places** is live (`real-places-done`, PR #31, live check passed): 85 real-terrain maps.
- **#34** (Pick a place, designed water) is merged; its proposals are adopted for Pick a place (D166).
- **#33** (exact-weather speedups) is merged; its proposals are adopted (D173).
- **The DGM Probe** (PR #18) is merged; its INTEGRATION.md is adopted as proposals (D149).
- **Contaminated ground as a layer** is live (`look-contamination-done`, PR #36, live check passed).
- **M1–M8 and Map look** are live: <https://timbermods.github.io/dam-good-maps/> (`m8-done`, live check
  passed).
- **Map look** is live (`map-look-done`, PR #22, live check passed): the clean look Kyler
  approved, with a **Markers** layer off by default.
- Merged investigations: workshop (#4), Claude groundwork (#5), cycles (#10, #15), mechanics,
  verified (#11), names (#12), audit (#13), M9 design version 1 (#14), landscapes (#16), simspeed
  (#17), techniques (#19), terrain 3D (#20).
- Repo improvements (#21): PR checks fail only on breakage, timings are reported, heavy suites
  run nightly, an investigation index with an import guard, Dependabot and CodeQL.

## Running

Nothing, at the pause for Tuesday (2026-09-27, evening). The order of work is in [HANDOFF.md §1](HANDOFF.md#1-resume-here-the-order-of-work).

## Waiting on Kyler

See the summary's section 1.

## Where to look next

- [ROADMAP.md](../ROADMAP.md): the order of work, and each step's Blocking and Information lists.
- [PLAN.md §20](../PLAN.md#20-editor-decisions): every decision, D1–D342.
- [decisions-pending.md](decisions-pending.md): open questions with their defaults.
- [m9-design.md](m9-design.md): M9 design version 1.
- [ingame-log.md](ingame-log.md): in-game checks and the planned probe batches.
- [progress/README.md](progress/README.md): the record of each milestone and step, one file each.
- [progress/kyler-todo.md](progress/kyler-todo.md): what Kyler needs to do, with the exact steps.
