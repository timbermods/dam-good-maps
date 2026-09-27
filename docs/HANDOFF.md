# Handoff: the milestone session

**Read this first if you're the new milestone session.** You start with no memory of the last one. This page says what's in
flight, what to do next, how things are run here, and the machine the session runs on (§9). Then read `CLAUDE.md`,
`docs/STATUS.md`, `EDITOR_PLAN.md` (before any editor work), `PLAN.md` §20 (every decision, D1–D299) and `ROADMAP.md`. Kyler
(he/him) owns the project and decides everything.

**History:** paused on 2026-09-26 on Kyler's main PC; resumed the same day on a dedicated computer (§9), with Kyler away.
While he is away: don't wait for him; choose the most sensible default consistent with his decisions, apply it if it's easy to
reverse, record it in `docs/decisions-pending.md` as a default you chose, and carry on; park anything hard to reverse. Release
only what he has approved (Live editing after D212, waterfalls after D215). No pings (he won't see them); the "Progress log"
issue (#57, D221) and the summary at the top of `docs/STATUS.md` are how he catches up.

## 1. Resume here: the order of work

**At the restart (2026-09-27):** start the milestone session in `C:\Users\krams\code\DamGoodMaps` at Opus 5.5, high
(D251), so `.claude/agents/` load; start `tools\keep-awake.ps1` (§9); send each kind of work to its definition (§7's table).
Nothing is running: every agent stopped at a clean point with everything pushed. The summary for Kyler is at the top of
`docs/STATUS.md`.

**The editor is where the magic happens; the generator provides the canvas** (D282). M9a keeps the machine first until
its own release; after that, the editor's work and M9b share it. Getting the forces to the preview for Kyler's sitting,
and then released, comes first among the work waiting for him.

**Until Kyler's Claude allowance resets, Tuesday 2026-09-29 8:00 PDT (D286):** more runs in parallel than D282 alone
would allow, each on its own branch and worktree (§2) so no piece redoes another's work: M9a keeps running (`m9a-build`);
the forces queue, the Drought and Badtide day strip, the Real places water fix and the Erode investigation keep running
(`build`); M9b starts now, on its own branch from `feature/m9a`'s frozen generator (`m9b-build`); the 3D stacked-column
water engine starts now, new modules only, on `build-xhigh` until the lapse, then `build`; the High look adoption starts
now (`build`); housekeeping runs on its own branch (`routine`); the milestone session keeps orchestrating, merging and
sequencing the machine. Heavy batches still run one at a time, M9a first; if M9a's review set or probe batch is delayed,
M9b or the High look pauses first. Nothing is released or merged into `dev` without Kyler's yes.

1. **M9a** (`m9a-build`, `feature/m9a` at 0f70fcb, #56), now under D252: merge `dev` in; build the start planting
   spread over the 20-tile walk, reading the land (D252 (1)); re-freeze the generator; finish the Normal batches (96²;
   128² Any, Canyon, Highlands, Lake Basin, Delta, Islands; 192² Lake Basin, Delta, Islands; about 1.5 hours; the
   commands are in the top note of `docs/progress/m9a.md`), then the summary into its Results, CI green on #56
   (0f70fcb's run was pending at the pause); rebuild the probe maps from the re-frozen generator. Then post the review
   set on #56 (D252 (2)): the contact sheet (every theme and Any, seeds 1–30 at 128²), the same seeds on 0.6.x beside
   it (`npm run sheet --compare`), 12 random maps in 3D from the editor's default view with the start visible, and the
   start-area sheet with added groves marked (dead ones distinct) and the count of starts with dead groves. **Wait for
   Kyler's yes on the review set** (D252, blocking) before release. Then **run its DGM Probe batch yourself** (D218):
   group M9a, 15 maps on the frozen generator in
   `C:\dgm-probe\maps\20260927-0424-batch`, about 93 minutes: `npm --prefix investigation/probe run batch -- --group M9a
   --keep-mods --run-id <id> --reference C:/dgm-probe/settings-backup/2026-09-26T19-19-16/Timberborn-settings.reg`, then the
   same with `--confirmed-launch <code>`. Then tag `m9a-done`. M9a takes the machine
   first (D210).
2. **Probe batches after M9a's** (D218): the **Ceiling** group (D244 step 1; `chore/ceiling-probe` at a0be2aa; maps in
   `C:\dgm-probe\ceiling\`; about 24 minutes; from `DamGoodMaps-ceiling`: `npm --prefix investigation/probe run batch
   -- --group Ceiling --keep-mods --run-id <id> --reference C:/dgm-probe/settings-backup/2026-09-26T19-19-16/Timberborn-settings.reg`,
   then `--confirmed-launch <code>`) and, optionally, the grey-area group (three Real
   places whose water keeps moving; commands in `docs/progress/real-places.md`). Report each in STATUS and #57. If either
   breaks play, stop and wait for Kyler.
3. **The forces** (`build`, `feature/forces` at c1438df; CI was pending at the pause): done: rounds 2 and 2b (Unleash, D239),
   D247 (Smooth without walkable), D248 (Level lines in the view bar), the `forceResult` draw. Left, in order: CI green (c1438df's red `forces.spec.ts:183` checked
   Erupt's fit words, which D258 removes); **D249** (Clear sources, sources ride the ground, easy removal; it starts at
   `keptTiles()` in `src/editor/Editor.tsx`); **D257, D258** (bound only by nature: the start carried, not refused; clean
   gestures: no drawn routes or previews, Aim an arrow); **D259** (Select findable; its selection is the working area,
   D254; **D261** Wand selects water; **D264** Select all, Set / Cut down / Fill up, Max water depth); **D260** (unfed
   water recedes at once); **D263** (smart Lower: depth from strokes, new channels about one tile deep); **D265** (no camera moves by itself); **D266**
   (the forces keep their own pace); then **D244 step 2** once the Ceiling batch passes (lift the six caps at 16: `MAX_TERRAIN`, `BRUSH_MAX_LEVEL`, ops.schema.json's
   brush level and stop, brushes.ts's layer-cut raise and precise hold, `forceCeiling`; merge `chore/ceiling-probe`'s tool;
   the tall note in plain words). Then deploy the preview from `feature/forces` and tell Kyler: his checklist for the
   sitting is in STATUS. Not released until he has tried it. The top note of `docs/progress/forces.md` has the detail.
4. **Drought and Badtide day by day** (D267, D268, D269: an edit ends the view; `build`; its own branch, `feature/weather-days`): based on `feature/forces`
   once the forces' water and camera work (D260, D265, D266) is pushed, so it doesn't conflict with them; it owns the water
   bar (the Speed control moves to the day strip). Merged separately, after the forces; on the preview for a sitting of
   its own, after Kyler's forces sitting (the preview shows one branch at a time).
5. **Then, on branches from `feature/forces`, combined for the preview** (`build`): placing objects by brush (D235) and
   the editor feeling alive (D240).
6. **Real places, round 2** (`build`, `feature/real-places-2` at 33f7050, #35, green): waits for Kyler's drops from the new
   review sheet and his answers (#80–#82, #84, #85); then the badwater stage once M9a is on `dev`; then
   `real-places-2-done`. The commands are in the top note of `docs/progress/real-places.md`.
7. **The page is the editor** (`build`; D232–D234, D237), after the forces round 2 and M9a's release, on the preview; then
   Kyler's editor UI audit, then the design pass straight after it (D236, D238).
8. **M9b** (`m9b-build`, xhigh, D262; M9c removed and folded into M9b, D278; `m9-build` stays defined but unused) in
   parallel with 7, taking the machine first (D236); read `docs/PERFECT.md` and D252 and D273–D278 first (D225): rewritten
   around D273's five outcomes, judged by Kyler's eye.
9. **The High look adoption (Map look 2)** (`build`, `feature/high-look`), moved up to right after the forces' release,
   alongside item 7 (D284; starting now under D286 (4)): #38, #65, #66 and #67 (D241, D242, D250), with the Frame pass's
   touch-up folded in (D283 (2)); High becomes the default where it runs smoothly, with a fallback to Standard, measured
   on this machine's RTX 2070 SUPER. Visible seasons waits for item 4 (Drought and Badtide) to merge (D286 (4)). Then the
   rest of `ROADMAP.md`, including the four terrain-above-terrain steps (D279–D281) and housekeeping (D283 (3)) — no
   longer a Frame pass, Map quality checkpoint or refinement-phase milestone (D283).

**Held:** #54 (inside M9a). Glaciate (#69) is merged (D292) and being adopted on `feature/glaciate` for Kyler's forces
sitting.

**Pending numbers across branches** (renumber at merge): `dev` has #69–#83; #80–#82, #84 and #85 belong to Real places (#35);
the forces branch's #84 (Flatten's ramped edges) becomes **#86** when it merges; M9a's #77–#80 become **#87–#90** when it
merges. The next free number is **#93**.

## 2. Work in flight (at the restart)

Worktrees are on this machine (§9), under `C:\Users\krams\code\`. The main clone `DamGoodMaps` is on `dev`.

| Work | Branch | PR | Worktree | Last commit | State |
|---|---|---|---|---|---|
| M9a, the new generator | `feature/m9a` | #56 | `DamGoodMaps-m9a` | 7d47546 | frozen generator with the floor; batches part-done; then its probe batch (§1) |
| The forces, Unleash, D247, D248 | `feature/forces` | none | `DamGoodMaps-forces` | f4609f6 | D249, then the ceiling, then the preview (§1) |
| The ceiling probe (D244 step 1) | `chore/ceiling-probe` | none | `DamGoodMaps-ceiling` | a0be2aa | maps and the Ceiling group ready; run after M9a's batch |
| Real places, round 2 | `feature/real-places-2` | #35 | `DamGoodMaps-places` | a4f9df3 | D245 rebuild done, new review sheet posted; waits for Kyler |
| Badwater on every map (D200) | `feature/badwater-source` | #54 | none | 5b1f3d6 | held, inside M9a (D213) |
| M9b, composition and variety | `feature/m9b` | none | `DamGoodMaps-m9b` | c765699 | starting from `feature/m9a`'s frozen generator, D273–D278 (D286 (2)) |
| The High look adoption | `feature/high-look` | none | `DamGoodMaps-high` | not pushed | Map look 2, moved up right after the forces' release (D284); starting now (D286 (4)) |
| Housekeeping | `chore/housekeeping` | none | `DamGoodMaps-house` | f6702f2 | #91 and D283 (3)'s small items; merges early so other branches pick it up (D286 (5)) |
| Terrain above terrain, step 1 (Foundations) | `feature/terrain3d-a` | none | `DamGoodMaps-3d` | 35911f1 | new modules only for now: the stacked-column water engine and the support-rule check (D286 (3)) |
| Erode (built by the session, not Codex) | `investigation/erode` | none | `DamGoodMaps-erode` | not pushed | held, like the other forces' investigations, until Kyler has tried it (D281) |
| Drought and Badtide day by day | `feature/weather-days` | none | `DamGoodMaps-weather` | not pushed | based on `feature/forces`; owns the water bar's day strip (D267) |
| Glaciate's adoption | `feature/glaciate` | none | `DamGoodMaps-glaciate` | not pushed | merged as an investigation (D292); adopted from `feature/forces` for Kyler's forces sitting |
| Kyler's review worktree | (not a work branch) | — | `DamGoodMaps-review` | — | where Kyler tries a branch before saying yes; not written to by any agent |

Finished, removable when convenient: `DamGoodMaps-live`, `DamGoodMaps-waterfalls`, `DamGoodMaps-fixes`,
`DamGoodMaps-nightly` and `DamGoodMaps-carve-check` (all merged). `main` is at a73b4b8 (`look-waterfalls-done`).

## 3. M9a in detail

> **History (the pause of 2026-09-26):** the current state is §1 and the top note of `docs/progress/m9a.md`.

**Spec:** `ROADMAP.md`, "M9. …", the block "Design version 2 is approved" and "M9a: terrain and water from processes";
`docs/m9-design.md` (§18 the staging); PLAN §20 D209–D211; the prototype in `investigation/generative/v2/` (port it; `src/`
must never import `investigation/`). Progress log: `docs/progress/m9a.md` (its top says what's WIP).

**Last pushed commit: 12beeb3** ("WIP: settings move their targets again on the M9a generator (heavy-tests still red)"), on
`feature/m9a`, PR #56 (draft). No M9a processes are left running.

**Done** (per its reports): the generator from design version 2's processes (genome and "Any", field, hydrology, settler,
badwater hollows, features read back, nothing stamped); "Any" (Surprise me) as the app default with a Verticality slider
(above 16 unlocked, D172); no ruler-straight rivers (a blocking straightness measure against real terrain and the official
maps, reported by the batch tool); project format 3 (runs + a stored field); `water.storage_possible` as information (#67)
and `terrain.dam_wall` in both validators; A1 and A2; generator 0.7.0; the natural narrows as an internal operation for M12
(#63); badwater merged in from #54 (D200, D213); seas' outlets sized to their flow (Islands 256² from ~67 s to ~15 s a map);
M12 tool entries (generate, landmarks, reach, placeNarrows); first batches 100% final (128², 20 seeds, all seven options).
Its probe group is prepared: `investigation/probe` catalogue group `M9a`, 15 maps, about 93 minutes
(`npm --prefix investigation/probe run batch -- --job-only --group M9a` previews it).

**Left** (its own estimates, machine time, one at a time):
1. **Settings and reshape tests green, 2–3 h.** Already passing at 12beeb3: Relief, Buildable land, Rivers (exact count),
   River style Straight and Braided, Lakes, Badwater distance, the no-badwater start rule, Water without stairs,
   Verticality (its experiment runs 10 → 90); Designed for's experiment moved to badwater distance under the stale-test rule
   (logged). Still failing on CI's seeds 1–4 at 96²: Drought reserve (1189 → 624, needs +200; passed on 8 seeds), Badwater
   off → high (0.55, needs 0.6), Berries near start (+28, needs +30), Designed for's new target (+6.5, needs +10); and two
   reshape tests (Lake Basin seed 13 leaves an object floating; River Valley seed 13's lake over a relic no longer plans).
   Then apply D211: Theme's Lake Basin water share becomes information until M9b; Start area becomes a preference ("prefer a
   roomy / tight start"), the map card shows the actual bench size, and its experiment becomes information.
2. **Re-seed the quick tests, 1–1.5 h:** `badwater.test` (Any seed 21's badwater is 10.5 tiles from the start, target 15),
   `objects.test` (the second-district and rise seeds), `validate.test` (`water.badwater_contained`), and re-pin
   `LIVE_SHA` in `look-mine-ruins.test`. CI is red until 1 and 2 are done; neither WIP push has been through CI yet (the last
   run, on eaa77a1, was green apart from heavy-tests).
3. **Full batches, 3–4 h:** six themes plus "Any" at 96², 128², 192² and 256², ≥ 98% final each (blocking), with the
   straightness stats.
4. **Contact sheet and "Any" measures, ~1 h:** `docs/sheets/m9a.png` (D144, with "Any").
5. ~~**Claude suite re-tune**~~: dropped (D277). All M12 work, its preparation included, is deferred while Kyler refines
   Dam Good Maps; the Claude suite leaves the regular checks and stays in the repository unmaintained until M12 begins.
6. **Docs, browser tests, final CI, 2–3 h:** the e2e determinism timeout and the Islands 256² preview timeout.
7. **D252 (before release):** the start planting spread over the 20-tile walk, reading the land (D252 (1)); then the
   review set posted on #56 (D252 (2)) and **Kyler's yes on it**, blocking; full detail in §1 item 1.
8. **The probe batch** from the frozen generator (rebuild its maps first), about 1½ hours in the game, **only after Kyler's
   yes in chat** (§7). Then tag `m9a-done` and release (§8).

**Next concrete step:** in `DamGoodMaps-m9a`, run the settings experiments on seeds 1–4 at 96²; give Drought reserve
`minSeeds: 8` or a stronger lean; find why the Badwater and Berries experiments dropped; look at Designed for's seed 2 (its
hard map keeps badwater 63 tiles off).

**Verified on this machine (2026-09-26):** at 12beeb3 the typecheck passes and the quick suite fails the same 7 tests as CI's
run 36260773489: `look-mine-ruins` (the pinned sha), four in `objects.test` (weir and plug, second district, ruins on a rise,
generated weir), `setpieces.test` (the on-river fall drop), and `validate.test` (`water.badwater_contained`). `badwater.test`
passes.

**M9a gotchas:** the old machine's helper scripts in `.scratch/` (gitignored) did **not** come across: `settings-run.ts` (ran
settings experiments by name, seed range and size), `one.ts`/`one2.ts` (one map and its checks), `sealevel.ts`, `thumb.ts`,
`run-batches.sh` (batches by `SIZES` and `SEEDS`), and the batch results. Rebuild what's needed; commit reusable ones under
`tools/` so they survive the next move. The settler now weighs the settings in the intentions' preference and
picks among starts within 70% of the best score, so seed-specific tests move. A background run started as
`cmd > file; cat file` shows nothing until it ends: read the file itself.

## 4. Live editing in detail

> **History:** Live editing was released (`live-editing-done`, #61); the forces continue on `feature/forces` (§1).

Spec: `EDITOR_PLAN.md` Part 1 (the vision), `ROADMAP.md` "Live editing", PLAN §20 D158, D179–D207, D212. Progress log:
`docs/progress/live-editing.md`. The preview at <https://timbermods.github.io/dam-good-maps/preview/> shows push 4
(59f826c): the top bar and brush kit, Flatten (D204), the left shelf with ghosts, Remove, the view buttons and the game's
layers (D207), the header with Save to Timberborn and the quiet dot, the minimap and camera bookmarks.

**Before `live-editing-done`** (D212): (1) sources move from the top bar to the left shelf as two items right after Start,
"Water source" and "Badwater source"; selecting a placed source still shows its strength; (2) clear water only under or
right around the brush, only while it's over tiles that already have water; on dry land the water stays normal; clear
water still reads as water (a faint blue tint, ripples, a soft bright shoreline, not pale grey glass); T toggles it for the
whole map. Defaults confirmed: R/F zoom gone, juice sounds on but quiet with an off switch, layers on Alt+middle-click and
Alt+click. Then Kyler's look, then the release (§8).

**The forces (D216, D219), after the release boundary:** merge #47, #51, #50 and #52 into `dev`; build Carve, Craterize,
Erupt and Quake on one shared forces core, a visually distinct group on the top bar, each options row starting with its mode
switch. Carve keeps its full set (D199, including Codex's varied bends and oxbow lakes; an unfed oxbow evaporating is correct
game physics). Erupt's plume billows bigger and darker at high power. Quake keeps both Lift and Slide. Preview only until
Kyler has tried them. The Carve port had started (WIP, see the commit below).

**The Carve port, WIP at b4d7c27** (pushed, marked WIP; CI went green on it after the pause, and the quick suite passes here:
587 tests; 59f826c is on the preview). Its note is at the top of `docs/progress/live-editing.md`.
- **Done:** the shared forces core (`src/core/forces/`: `force.ts`, `drainage.ts`); Carve's run ported from #47 (`carve/`:
  `character.ts`, `course.ts`, `oxbow.ts`, `run.ts`, checked step for step against the prototype with
  `.scratch/carve-equiv.ts`); the `carve` operation (stored literally, one undo step, Try another path via `replaces`);
  the worker's `carveStart/Advance/Stop/Cancel/Again`; the page (the Carve button next to Source on key 7, `CarveRow.tsx`
  with the mode switch first, `carveDriver.ts` paced by the water speed, Pause/Stop/Revert, the surge effects in
  `render3d/effects.ts`, the follow camera); Claude's `carve` step with requests B19–B21 (3/3 pass); tests
  (`tests/contract/carve.test.ts`, `tests/unit/carveDriver.test.ts`, `tests/e2e/carve.spec.ts`).
- **Important:** its merge of #47 (e5435b0) came **before** Codex pushed the two touches. #47 is now at **6b9d4e6** ("varied
  bends and oxbow lakes"). So: `git merge --no-ff origin/investigation/carve`, re-port `character.ts`, `course.ts`,
  `oxbow.ts` and `run.ts` (keep `liveWater()` and the stored `model`), re-run `.scratch/carve-equiv.ts`, add #47's tests for
  the touches (about 2–3 h).
- **Left:** check CI on b4d7c27 (`gh run list --branch feature/live-editing`) and fix any fallout (1–2 h); the full quick
  and e2e suites; EDITOR_PLAN §5's Carve bullet and the progress log (the `brushKit.spec` change under D148, the carve keys 7,
  Space, Esc/Ctrl+Z) (1 h); the full Claude reference re-run (125/138 before; 13 fail on `dev` too) (0.5 h); then the D212
  changes, Kyler's look on the preview, and the release. Craterize (#51) and Erupt (#50) then plug into the same forces core.
- **Gotchas:** e2e example `DGM_E2E_PORT=4791 npx playwright test tests/e2e/carve.spec.ts --workers=1`; the old
  machine's `.scratch/carve-equiv.ts`, `.scratch/pw-gpu.config.ts` (real GPU, effects on) and `.scratch/pw-soft.config.ts`
  (SwiftShader, effects off) didn't come across (gitignored): rebuild them if needed; e2e clicks
  must land on the canvas (with Aim picked the options row wraps over the map; `carve.spec` checks `elementFromPoint`); the
  Claude harness's `@anthropic-ai/sdk` typecheck errors are older and harmless (the SDK isn't installed).

## 5. Merged, released, held and waiting

- **Live on `main`:** M1–M8, Map look, Real places (first round), contaminated ground, mine sites and ruins, the start and edge
  rules, Save to Timberborn, the badwater blend (tags `m8-done` … `look-badwater-done`).
- **Merged into `dev`, not yet released:** resources like the official maps (#43, generator 0.6.2), Pick a place's
  signature water (#45), Map look 2's investigation (#38), the docs sweep and retired-terms guard (#46), design version 2
  (#32). They ship with the next release.
- **Held:** #54 (goes in with M9a, D213).
- **Merged at the Live editing boundary (2026-09-26):** #60 (Live editing), and the investigations #58 (juice), #59
  (forces core), #47 (Carve), #51 (Craterize), #50 (Erupt) and #52 (Quake); about 30 MB, mostly GIF captures Kyler reviewed.
- **Waiting on Kyler:** his picks of places to drop (§6); his look at each release candidate; #66.

## 6. Open questions and running tasks

- **Real places (#35):** Kyler sends the places to drop from `C:\dgm-workshop\places\sheet.html` (local). Apply D214 first:
  no sources at 8× the official strength (25 maps had them); keep strengths near the official range and move the start
  closer to water instead (as Pick a place's designed water does); drop any place that still can't work; replace the eleven
  "Centre" suffixes (and "Mahabaleshwar East, Western Ghats") with a real feature or direction ("North Rim", "Upper Valley").
  Then the badwater stage (`planMapResources` with `badwater`), once M9a is on `dev`; re-render and `npm run places -- --check`.
- **Waterfalls (#53):** D215: remove the V-shaped gap (one continuous sheet at L-shaped lips), more whitewater and splash at
  the landing; then release without another review unless it looks off. Known, older issue: where a Blockage raises the
  water floor, the 3D view draws water at ground level (a phantom small fall).
- **Quake (#52)** is ready with both Lift and Slide (D219, at a293e41): merge it with the other forces.
- **`investigation/maplook3`** (Codex, D228: phase 1 of a higher-fidelity High look): when its PR is open and green,
  merge it at a boundary as an investigation, proposals only, like #38; adopt nothing until Kyler has reviewed its demo
  and said which effects to keep (then they join Map look 2's High mode). Not pushed yet (2026-09-26).
- **`investigation/vegetation`** (#66) and **`investigation/maplook3`** (#65): approved by Kyler (D241, D242); merge them as
  investigations and adopt them into the High look in the Map look work (Map look 2).
- **`investigation/glaciate`** (Codex, D246: Glaciate, a new force): **#69 is merged** (round 4, D291, D292; 8ef9842)
  although its report missed the one-river condition; adopted on `feature/glaciate` from `feature/forces` (D292), with
  the floor's extra wet passages led into the main river during adoption, judged by Kyler's eye at the forces sitting.
- **`investigation/maplook-finish`** (#67, D243, D250): approved and merged (8ed950a); adopt it into High in the Map look
  work with #38, #65 and #66, plus D250's two additions (badtide withering; the RTX 2070 SUPER measurement).
- **Codex's second sound round** on `investigation/juice-2` (natural recorded sounds with a crisp, musical reward;
  Balatro as the reference; D226): merge it as proposals when green, hook it into Live editing's juice, and show it on
  the preview.
- **Codex tasks that reported (merged 2026-09-26):** `investigation/forces-core` (one core for the four forces) and `investigation/juice`
  (synthesised editor sounds). Merge each at a boundary once green and adopt it as proposals (D220): build the forces on the
  forces core if it has landed; hook the sounds into Live editing (on by default, quiet, with an off switch) and show them on
  the preview.
- **Pending decisions:** `docs/decisions-pending.md`'s #66 (the candidate intentions) is settled (D274). All are decided.
- **Held Dependabot majors:** #24 (TypeScript 7.0), #25 (@types/node 26), for a quiet housekeeping slot (D150, D283).

## 7. How things are run here

- **Progress log** (D221): a short, plain comment on [#57](https://github.com/timbermods/dam-good-maps/issues/57) each time
  a step finishes, something is released, a probe batch runs or something is parked for Kyler (what happened, links, what's
  next). `docs/STATUS.md` stays the full record, with its summary at the top.
- **Pings:** when Kyler asks for one, or something waits on him and he may have walked away: `powershell -NoProfile
  -ExecutionPolicy Bypass -File tools\notify.ps1 -Title "Dam Good Maps: <thing>" -Body "<where>"` (a Windows toast on this
  machine; the PushNotification tool is skipped while he is at the terminal) and a chat line such as "🔔🔔 … 🔔🔔".
- **Tests:** `npm run typecheck`, `npm run test:quick` (CI's PR checks), `npm run test:heavy` (nightly), `npx playwright test`
  (the installed Chrome, channel "chrome"; never `npx playwright install`; give each e2e run its own free port),
  `npm run oracle` (the Python validator, 0 disagreements), `npm run batch` (`tools/batch.ts`, ≥ 98% final blocks),
  `npm run places -- --check`. The Claude suite (`npx tsx investigation/claude/bin/reference.ts`, D134) is kept but
  unmaintained and left out of the regular checks while M12 is deferred (D277).
- **The preview:** `gh workflow run deploy.yml --ref main -f preview_ref=feature/live-editing`, then check
  <https://timbermods.github.io/dam-good-maps/preview/> (noindex). A normal deploy of `main` drops `/preview/`, so republish
  it after every release.
- **Releases** (CLAUDE.md, "Deploying"): tag a green `dev` commit (annotated tags; names in CLAUDE.md), push the tag and a
  `release/<name>` branch at it, open a PR into `main`, wait for its checks, merge **as a merge commit**, watch the push deploy
  (build, deploy, `live-check / live`), republish the preview, record it in `docs/STATUS.md` and the progress log.
  `tools/release.sh <tag> <commit> <PR body file> [<preview branch>] [--go]` does all of it (without `--go` it only
  checks and prints the steps). If the live check fails, revert the release merge on `main`.
- **Fixes for dev's own failing tests go to dev directly**, never only onto a feature branch (Kyler, 2026-09-26): the
  drowned-relic fix for issue #55 sat on the Real places branch for a day while dev's nightly failed.
- **Investigation PRs** (Codex's and others): merge at the next boundary as a merge commit once green, adopt their
  INTEGRATION.md as proposals; anything that conflicts with a decision becomes a pending decision with a default. Hold any PR
  Kyler says Codex is still working on.
- **DGM Probe** (`investigation/probe`): the only way Claude may launch Timberborn, and **only after Kyler's yes in chat for
  that batch, every time** (CLAUDE.md, D117). **On this machine only (§9), D218 lifts the ask:** run a batch whenever the plan
  calls for one, and report it in STATUS and on #57; everything else below still applies. Elsewhere, ask in one message: how
  many maps, which checks, how long, and that it launches Timberborn. Steam running, Timberborn closed, the machine quiet
  (the runner waits for it). Build the mod with `run build-mod -- --no-install` (without it, `build-mod` also installs the mod
  into `Documents\Timberborn\Mods`; the batch installs and removes it itself). Kyler plays with his installed
  mods (`--keep-mods`). Make a settings backup first (`--backup-settings`); pass it as `--reference <backup .reg>`. Running
  without `--confirmed-launch` prints the plan and a one-time code; after Kyler's yes, rerun with `--confirmed-launch <code>`.
  Results go to `C:\dgm-probe\` (never Documents). The runner restores his settings, logs and player data, moves anything the
  games created out of `Documents\Timberborn`, and stops with exit code 6 if anything new is left (`leftovers.json`). Example:
  `npm --prefix investigation/probe run batch -- --only <ids> --keep-mods --run-id <id> --confirmed-launch <code> --reference C:/dgm-probe/settings-backup/<stamp>/Timberborn-settings.reg`.
- **Decisions:** Kyler's decisions go into `PLAN.md` §20 (the next is D300), and into the living docs in the same change
  (D188: EDITOR_PLAN, PLAN, ROADMAP, CLAUDE.md, STATUS). The next pending number is #84 (#80–#82 are Real places' defaults on #35's branch). **Every review is measured against
  [docs/PERFECT.md](PERFECT.md)** (D225); read it before M9b. Defaults chosen while Kyler is away
  go into `docs/decisions-pending.md`, marked as a default the session chose.
- **Which work goes to which agent definition** (`.claude/agents/`, D210, D251). A session loads them only at its start,
  and only when it starts in `C:\Users\krams\code\DamGoodMaps`; start the milestone session there, at Opus 5.5, high.

  | Work | Definition | Model, effort |
  |---|---|---|
  | M9a, the new generator, until `m9a-done` | `m9a-build` | Opus 5.5, xhigh |
  | M9b, composition and variety (D262, D278, D286 (2)) | `m9b-build` | Opus 5.5, xhigh |
  | (none; M9c removed, D278) | `m9-build` (kept, unused) | Opus 5.5, high |
  | **Temporary, until Tuesday 2026-09-29 8:00 PDT (D286 (3)):** the 3D stacked-column water engine (step 1 of terrain above terrain) | `build-xhigh` | Opus 5.5, xhigh |
  | Everything else Claude builds: the forces and Unleash, the editor changes (D235, D240, D244, D247–D249), "The page is the editor" (D232–D234, D237), the Real places rebuild (D245), the Map look adoption (D241, D242, D250), Glaciate's adoption (D246), the Drought and Badtide day strip (D267), the Erode investigation (D281), and — once `build-xhigh` lapses — the 3D water engine's conversion work (D286 (3)) | `build` | Opus 5.5, high |
  | Routine: tests and test fixes, nightly failures, watching CI, contact sheets, docs sweeps, housekeeping (D283 (3), D286 (5)) | `routine` | Sonnet 5, medium |
  | The milestone session itself: orchestrating, merging, releasing, probe batches | (the session) | Opus 5.5, high |


## 8. Lessons from the last sessions

- Windows with Git Bash: use `MSYS_NO_PATHCONV=1` where paths get mangled; bash heredocs with apostrophes break the tool
  wrapper, so write scripts to files; foreground `sleep` chains are blocked (use background commands or until-loops).
  (The old machine's Store Python couldn't read `%LOCALAPPDATA%\Temp`; this machine's Python can.)
- Off-limits: Kyler's `Documents` folder (it holds secrets; never read it); his saves, settings and mods except through the
  probe runner; `C:\dgm-reference\` (his in-game screenshots: look, never copy, crop or commit); `C:\dgm-workshop\` (other
  creators' maps and local review pages: never commit); the decompiled game code in `investigation/decompiled/` and the
  official maps in `investigation/raw/` (gitignored; for answers only, never copied).
- **Shared machine:** agents stop only processes whose command line names their own worktree (one cleanup once killed another
  agent's batches); every e2e run needs its own free port (Playwright's `reuseExistingServer` silently tested another agent's
  build once). M9a first (D210).
- **Subagents:** if Kyler stops one, it can't be resumed: start a new one in the same worktree and tell it the exact state
  (running processes, last commit, what's left). Some hand back before their CI finishes; check the PR yourself.
- **Merges between steps that change generated maps** conflict on the generator version and the pinned seed-4242 sha
  (`tests/contract/look-mine-ruins.test.ts`); re-pin per D148 and bump the version (0.7.0 is M9a's).
- **The Claude suite** drifts whenever the generator changes; re-tuning it is suspended while M12 is deferred (D134, D277).
- **Repository size** (D195): investigations commit reports, code, small samples and a few captures; bulk results stay in a
  gitignored `local/` folder or a GitHub Release. #45 added about 98 MB before the rule; history isn't rewritten.
- **Retired terms** (`tools/retired-terms.json`, D188): CI fails if a retired name or retired interface text reappears in the
  living docs or `src/`; `pendingRemoval` is empty now.
- **The review rule:** no blind reviews; Kyler judges visual work from before/after captures (with greyscale and
  colour-blindness sheets). Only breakage, his decided principles and what a player feels block (D115, D145).
- **Where to look:** `docs/STATUS.md` (the current state and the morning summary), `docs/progress/` (one log per step),
  `docs/README.md` (which docs are living), `docs/CHAT-HANDOFF.md` (how Kyler's planning chat works).

## 9. This machine

A computer kept for this work (Kyler, 2026-09-26): always on, nobody plays on it. Windows 10 Pro 22H2 (19045), Ryzen 5 3600
(12 threads), 32 GB. User folder `C:\Users\krams`.

- **Repository:** `C:\Users\krams\code\DamGoodMaps` (on `dev`) and the worktrees in §2, beside it. Start sessions in the
  repository folder, so `.claude/agents/` load.
- **Tools** (per user, no administrator rights, installed 2026-09-26): Node 22.23.3 (`~\tools\node-v22.23.3-win-x64`,
  npm 10.9.9); Python 3.12.10 (`~\tools\python312`, python.org's NuGet build, with numpy and pillow from
  `prototype/requirements.txt`); the .NET 8 SDK 8.0.425 (`%LOCALAPPDATA%\Microsoft\dotnet`; the machine-wide
  `C:\Program Files\dotnet` has only SDK 3.1); ilspycmd 8.2.0.7535 (a .NET global tool); gh 2.101.0
  (`C:\Program Files\GitHub CLI`, logged in). They are on the user PATH and in `~/.bashrc`. The Bash tool doesn't read
  `~/.bashrc` by itself: start commands with `. ~/.bashrc;`. There is no PowerShell profile (it would live in `Documents`).
- **Timberborn:** Steam at `C:\Program Files (x86)\Steam`; the game at
  `C:\Program Files (x86)\Steam\steamapps\common\Timberborn`, version `1.1.2.4-52e959e-sw` (Steam build 25096761), the same
  build the repository was verified against (FORMAT.md). Keep Steam running; Timberborn stays closed unless the probe
  launches it.
- **Decompiled code:** `investigation/decompiled/` regenerated on 2026-09-26 with `investigation/decompile_all.sh` (497 files,
  about 2 minutes).
- **Official maps:** extracted with `investigation/extract_builtin_maps.py` and kept in `.scratch/official/` (19 official
  maps and 3 unnamed ones), deliberately not in `investigation/raw/builtin/`: the local-only tests there also expect the
  workshop copies (at least 30 maps), which live on Kyler's main PC, so with the official maps alone they would fail here.
- **Not on this machine:** `C:\dgm-workshop\` and `C:\dgm-reference\`. Work that needs them waits for Kyler's main PC.
- **DGM Probe:** results in `C:\dgm-probe\`; the settings backup is
  `C:\dgm-probe\settings-backup\2026-09-26T19-19-16\Timberborn-settings.reg`; the runner's tests pass and the mod builds
  against this install.
- **Staying awake:** the power plan (Ultimate Performance) never sleeps or hibernates on mains power. While working, run
  `powershell -NoProfile -ExecutionPolicy Bypass -File tools\keep-awake.ps1 96` in the background: it holds a "system
  required" request (as a video player does) and changes no settings.
- **Restarts:** automatic updates are off by policy (the last update is from 2023), so no update restart is scheduled or
  likely. Windows restarts itself after a system crash. After any restart: start a Claude Code session in the repository
  folder, read this page, start the keep-awake script, check `git worktree list` and §2, and if a probe batch was running,
  run `npm --prefix investigation/probe run restore` before anything else.
- **When the game updates:** recompute the starting-logs floor (D224) with `npx tsx tools/log-floor.ts --check` (then
  `--write`, and record the new floor in PLAN §20); regenerate `investigation/decompiled/`; note it in STATUS.
