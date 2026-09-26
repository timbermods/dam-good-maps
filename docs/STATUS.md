# Status

One page, rewritten at every step and stop. The summary below is for Kyler's return, most important first. The full
handover is [HANDOFF.md](HANDOFF.md); the running log is the "Progress log" issue
([#57](https://github.com/timbermods/dam-good-maps/issues/57)). Decisions are in
[PLAN.md §20](../PLAN.md#20-editor-decisions) (D1–D221), the order of work in [ROADMAP.md](../ROADMAP.md).

## Summary for Kyler (updated 2026-09-26, 12:45, after the takeover)

The milestone session moved to the dedicated computer on 2026-09-26 and started working through your brief.

### 1. Needs your decision or your eyes

1. **M9a's release** waits for your yes, once it's built and its probe batch has passed. Not ready yet.
2. **Real places (#35), the places to drop:** `C:\dgm-workshop\places\sheet.html` is on your main PC, not here. The D214
   water changes and the "Centre" titles go ahead without it; the drops and the release wait for you.

### 2. Released or merged

- **Merged into `dev`** (2026-09-26, the Live editing boundary):
  - [#60](https://github.com/timbermods/dam-good-maps/pull/60) Live editing: D212's two changes (Water source and Badwater
    source on the shelf; clear water only around a brush over water) and Carve re-ported to #47's final commit;
  - Codex's investigations #58 (juice sounds), #59 (the forces core), #47 (Carve), #51 (Craterize), #50 (Erupt) and #52
    (Quake). Together they add about 30 MB, mostly the GIF captures you reviewed (each under the few-MB line of D195).
- **Released: `live-editing-done`** ([#61](https://github.com/timbermods/dam-good-maps/pull/61), a7e0a9b; tagged at 985e1cf).
  The deploy and the live check passed. I opened the public site's editor in a browser: Water source and Badwater source
  are on the shelf and there are no forces; the preview shows the same editor with Carve. It also carries everything
  that was waiting on `dev` (resources #43, generator 0.6.2; #45; #38; #46; #32).

### 3. On the preview for you to try

<https://timbermods.github.io/dam-good-maps/preview/> → **Refine this map**: the released editor plus **Carve** (key 7),
from `feature/live-editing`. The four forces with the new juice sounds replace it on the preview once `feature/forces` is
ready.

### 4. Probe batches

None yet. The probe is set up here (runner tests pass, the mod builds against this install, your game settings are backed
up in `C:\dgm-probe\settings-backup\2026-09-26T19-19-16\`). The first batch will be M9a's 15 maps once its generator is
frozen (D218 lets it run without asking on this machine).

### 5. Defaults I chose

- **#69: the forces stay hidden on the public site** until you've tried them (D219), so Live editing can be released now with
  the Carve port inside it: the preview, the dev server and the tests show the forces group; one switch turns it on at the
  forces' release ([decisions-pending.md](decisions-pending.md)).
- **#70: oxbow lakes keep their water.** A fresh settle starts a sealed basin dry, so Carve's operation stores the water the
  bend held when it closed, and every settle and the export start the lake from it; the game then lets an unfed lake
  evaporate. Maps without such a lake are unchanged.
- **#71: small Live editing choices:** key 6 picks Water source; when a brush counts as over water; the clear water's tint,
  ripples and shoreline values; how far Claude's carve step searches.
- **#72:** the quiet dot's "water still changing" for an evaporating oxbow lake stays as it is.

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

### 7. Still running

- **M9a** in `DamGoodMaps-m9a` (an Opus 5.5 agent; first on the machine): the settings and test fixes, full batches, the
  contact sheet, the Claude suite re-tune, docs, CI, then the frozen generator's probe maps. The `.claude/agents/`
  definitions didn't load (this session started outside the repository folder), so it runs at this session's effort rather
  than a set xhigh.
- **Live editing** in `DamGoodMaps-live` (an Opus 5.5 agent): the Carve re-port to #47's final commit, the forces hidden on
  the public site (#69), D212's two changes, docs, captures and CI. Then I release it as `live-editing-done`.
- **Waiting their turn:** waterfalls (#53) after Live editing lands (both change the water renderer); Real places' D214
  rebuild after that (heavy on the machine, and M9a comes first); the forces after the Live editing release.
- Keeping the machine awake (`tools/keep-awake.ps1`, no settings changed).

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
- **D113** Frame pass after the M9 build, before the 3D stages (`frame-pass-done`).
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
- **D133** The Weather view with live water, after the 3D stages (`weather-view-done`).
- **D134** Keep M12 ready: each step adds tool entries and suite requests, and keeps the suite green.
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
  steer; precise edits and follow-ups stay operations (D145).
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
- D158: **Live editing**, alongside the M9 design: a triage first, then Cities-style terrain brushes and water that never blocks; tried by Kyler on `/preview/` (its shape tools removed by D182).
- D159: M11's heightmap import uses the survey's conversion pipeline (drainage rivers, sources, the start rules, the water rules).
- D160: later, after M11: "Pick a place" from a world map or coordinates, open elevation data only, with attribution.
- D161: the north-star journey: a striking place → Pick a place → the Weather view → Live editing → play; each step smooth, no gaps.
- D160/D175: Pick a place, the full experience (explore a 3D world map, frame a square with a live block preview, one click to build), right after M11 and before the refinement phase.
- D162: Save to Timberborn, soon: pick the Maps folder once, then save straight into it (Chrome, Edge).
- D163: later, proposed: a companion mod that lists and starts new Dam Good Maps maps from the game's menu.
- D164: starting wood: the start counts logs by species (oak 8, pine 2 plus resin, birch 1), not trees; "Minimum starting wood"; species as a generator lever.
- D165: Kyler's four intentions (start under a cliff with water below; a snaking river down a hill; a crater where rivers converge; a cliff waterfall into a large round lake), plus 10–15 candidates for him to pick.
- D166: Pick a place: real land, designed water; it never fails for lack of water, meets the start rules, and quietly tries other sizes, scales and offsets; #34 held until its designed-water follow-up is finished and green, then merged and adopted with this change.
- D167–D170: resources like the official maps: a mine site on every map (Mine sites 1–4), tree counts and living/dead share by size, groves and berry patches in clusters, ruins that vary; one shared baseline for the generator, Real places and Pick a place.
- D171: water sources start rivers: only at heads (edge inflows, springs), clustered for more flow, never inside an existing flow; a check flags any that are.
- D172: tall maps (up to 22): allowed in both validators once a probe batch confirms; a standard/tall option for Real places and Pick a place, dramatic places tall by default.
- D173: #33's exact-weather speedups and scheduling, adopted as Weather view proposals.
- D174: Real places review: 3D thumbnails with a crisp 2D top-down (two layouts to pick from), tighter framing, the survey patches may be re-downloaded, credits confirmed, three titles changed.
- D176: design timing: new interface uses the existing shared styles and components until the Frame pass; after it, the design records; M12 and M13 get the finish review, no second full design pass.
- D172 (1) confirmed: the tall-maps probe batch passed, so both validators allow heights up to 22 (built in the start and edge rules).
- D177: in the Standard look, badwater blends smoothly into clean water by contamination (toward #4B3C37), a soft gradient over several tiles, distinct in greyscale; consistent with #38's High look.
- D178: mine sites and ruins get models of our own: a sunken pit with a rusty frame and corner scaffolding; ruined scaffold towers with braces, panels and ivy on moist ground.
- D179: **Live editing is how you edit a map**, the editor's core principle: every tool live, water flowing visibly after every edit, brush shapes and a precise mode, one Select tool; no plan-confirm-place flow remains (its water tools, plant painting and object dragging became D184's smart Lower, Source and left shelf).
- #56: a failed Pick a place map is never shown; nearby choices that passed, or what to try.
- D180: Live editing additions: a smooth native camera (WASD, Q/E, Shift), Remove (first named Demolish), water-aware Ctrl-click sampling, player-set source strength, "let the water carve" (Carve since D194), water time controls with a "drought" button, and local-first water that always ends at the game's settled result (its drawn-river rules and natural or exact rivers removed by D184).
- D181: more for water: carving forms valleys (downcutting, slumping terraces, floodplains, deltas; steep or wide walls), moisture and grass spreading live from new water, a "badtide" button, optional water sounds of our own.
- D182: **the brush kit is the core of the editor**: the landform objects and their handles removed, no presets; terraces and ramps (now Flatten and Smooth options, D184), pen pressure and level lines; future tools brush-first (symmetry mirrors strokes, stamps are painted, carving is a brush).
- D183: live dimensions: a selection's size in tiles, a straight stroke's length, the level while flattening (D184 removed the other cursor readouts).
- D184: **the editor's design principles**: the land is the interface; a top bar (Raise, Lower, Flatten, Smooth, Naturalize | Source | Remove) with a small options row; water from smart Lower and Source, everything else emerging from the land; a left shelf of object icons with live ghosts; view buttons with overlays; a header with Save to Timberborn and one menu; a quiet status dot; drawn rivers and lakes removed; plain scroll zooms (strength on Shift+scroll since D196).
- D185–D187: the editor is desktop-first; the editor's Drought and Badtide buttons show each event, and the Weather view is the separate full-cycle timeline; Claude is a summoned chat box.
- D188: docs are part of done: living docs updated in the same PR, a drift check at each milestone boundary, a CI guard for retired terms, and a docs index (`docs/README.md`). EDITOR_PLAN.md now opens with the editor's vision.
- D189: design version 2's scope is frozen; anything new goes into the M9a, M9b or M9c builds.
- D190: #51–#53 decided (the defaults): world traits are candidate intentions; wet caves allowed in 3D-b; the no-clone distance picks candidates, the score breaks near ties.
- D191: Save to Timberborn never overwrites; a same-named map is saved as "Name (2)" with a quiet note.
- D192: Pick a place's signature water (#45) with ESA WorldCover, credited like the elevation data; hard cases offered with nearby alternatives.
- D193: hold to dig: in precise mode, holding Lower or Raise keeps working a level at a time, with an optional stop level.
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
- D210: M9a on Opus 5.5 at xhigh, M9b and M9c at high, routine work on Sonnet 5 at medium; M9a first when work competes.
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

In the order of work (HANDOFF.md §1; M9a first on the machine, D210):
- **M9a**, the generator from design version 2 (D209), on `feature/m9a` ([#56](https://github.com/timbermods/dam-good-maps/pull/56)):
  the settings and test fixes, full batches, the contact sheet, the Claude suite re-tune, docs and CI, then its probe batch.
- **Live editing** on `feature/live-editing`: the Carve port (WIP, green), then D212's two changes, then the
  `live-editing-done` release (approved).
- **Next:** the four forces (#47, #51, #50, #52; D216, D219) on one forces core, to the preview; waterfalls (#53, D215),
  then `look-waterfalls-done` (approved); Real places round 2 (#35, D214).
- **Held:** #54 (inside M9a, D213). Dependabot majors #24 and #25 wait for the upgrade step (D150).

## Waiting on Kyler

1. M9a's release, after its probe batch (the release needs your yes).
2. Try the forces on the preview once they're there; they're released after you've tried them (D219).
3. Real places: the places to drop, from the sheet on your main PC (D214).
4. Pending #66 (the candidate intentions), and any default the session chose while you were away
   ([decisions-pending.md](decisions-pending.md)).
5. Optional: the pending in-game checks ([ingame-log.md](ingame-log.md)).

## Where to look next

- [ROADMAP.md](../ROADMAP.md): the order of work, and each step's Blocking and Information lists.
- [PLAN.md §20](../PLAN.md#20-editor-decisions): every decision, D1–D221.
- [decisions-pending.md](decisions-pending.md): open questions with their defaults.
- [m9-design.md](m9-design.md): M9 design version 1.
- [ingame-log.md](ingame-log.md): in-game checks and the planned probe batches.
- [progress/README.md](progress/README.md): the record of each milestone and step, one file each.
- [progress/kyler-todo.md](progress/kyler-todo.md): what Kyler needs to do, with the exact steps.
