# Dam Good Maps roadmap

The open work, in one order, for both plans: the generator website ([PLAN.md](PLAN.md)) and the map editor with Claude
integration ([EDITOR_PLAN.md](EDITOR_PLAN.md)). Where either plan orders things differently, this file wins.

Finished steps (M1–M8, Map look, Real places, Start and edge rules, Resources, Badwater, Live editing, Map look 2,
Save to Timberborn, M9a), the overview and release points as they stood, and the full M12 plan are in
[docs/archive/roadmap.md](docs/archive/roadmap.md). What is in flight (branches, PRs, which session owns them) is in
[docs/STATUS.md](docs/STATUS.md); how to start and how things are run, in [docs/HANDOFF.md](docs/HANDOFF.md); the
decisions in force, in [docs/decisions/](docs/decisions/README.md).

## The order of work

Who builds what (D388, D398, D453, D463, D468, D470):

- **The milestone session** (Opus 5.5, high; the dedicated machine): everything but the page: the core, the water, the
  generator, the Codex adoptions and the documents. It merges and releases, and hands out decision numbers.
- **The page session** (Opus 5.5, high since 2026-10-03, D468; worktree `-page`, branch `feature/page`, PR #163): only
  "The page is the editor".
- **The renderer session** (Kyler's PC; its own branches): moving water, the Flow view and the High look; its PRs merge
  on green CI (D453).
- **Codex** (investigation branches): builds investigations; the milestone session adopts them.
- **Other Claude Code sessions Kyler starts**: the theme critique, the Islands rounds, the coherence cleanup.

Neither the page nor the milestone session touches the other's files: the page session owns the page, the editor's
interface, `Editor.tsx` and its split. Models and effort: D389. Messages between sessions go on the Coordination issue
(#236, D470); what waits for Kyler carries the `needs-kyler` label.

**0. In flight now** (2026-10-05; each line is a PR or branch and the session that owns it)

- **The generator queue** (milestone session, one re-pin at a time, each with its sheets for Kyler): Delta arms round 2
  (#325, generator 0.8.2) is merged; next **badwater joins the main water** (D476, `feature/badwater-joins`,
  generator 0.8.3), Lake Basin round 3 (#234, `feature/lake-basin-3`, with seeds 12 and 15 that have no lake, D464), River
  Valley round 2 (#244), Islands round 6 (#235), Canyon and Highlands (#261).
- **The page** (#163, `feature/page`; the page session): waits on Kyler's sitting on `/preview/` (the forces, Craterize, #275,
  #225) and green CI.
- **Forces play** (renderer session, worktree `DamGoodMaps-forces-play`): the lake-jump fix, then #312's worker part once the
  page part reaches dev with #163.
- **Codex** (investigation branches; Kyler decides each adoption): TypeScript 7 (`investigation/ts7`), generation speed
  (`investigation/gen-speed-3`), first load (`investigation/first-load`), the page hunt (#303).
- **The dam sketch, round 3** (#279, `investigation/dam-sketch-3`): parked until its adoption after the Weather view.
- **Merged since:** every force plays smoothly (#311), the forces share rust/water's kernel (#304), the checks in Rust (#321),
  the badwater line (#265, generator 0.8.1), Craterize clears and rides sources (#322), Naturalize rule 4 (#324), forces end
  the moment their land is final (#275), a source's highlight under its water (#225), shared object models (#323), #313's
  and #315's fixes (#319); before them Carve plays smoothly (#297), Carve's river follows its cut (#292) and Your maps keeps
  every map (#298). Decided today: forces can clear sources (D474), no old-project compatibility until launch (D475), badwater
  joins the main water (D476).
- **Held investigations and old drafts:** the theme critique (#211), Islands round 2 (#210), the performance audit (#152),
  scaling (#132) and the parked drafts (#73, #71, #35); STATUS has each one's state.
- **Next, after the generator queue:** custom map sizes, then the dam sketch.

**1. Released, and the coherence cleanup**

- **M9b** is released (`m9b-done`, 2026-10-04; `main` at b407656, generator 0.8.0). The release gate (D385–D387) passed.
- **The coherence cleanup** (done; D461–D463): all ten groups are merged into `dev`: 1 dead code (#213), 2 one flood (#214;
  Naturalize's replay unchanged, Kyler chose (b) on #243), 3 the forces' shared core (#221), 4 force planning into the core and
  one source-group id rule (#223), 5 the water (#226), 6 analysis and checks (#230), 7 the editor's planners and set pieces
  (#241), 8 generator duplicates (#258), 9 the worker's editing and checks (#262), 10 tools on the core (#264). No bytes,
  except Naturalize's strokes (#214) and the probe maps (#264).

**2. The Rust order** (D381, D442, D453; byte-identical in CI, no timing gates)

- **The water switch** (done, #212, D442 (b), D452): WaterSim in Rust everywhere, batch jobs native, the TypeScript water
  tagged (`ts-water-final`) and deleted. The stacked-column crate for terrain above terrain is merged too (#260, D448: the
  computation in `rust/water`, no wiring yet).
- **The Rust forces** (done, #254; #158, D400, D453): the planners are Rust (`rust/forces`), byte-identical to the TypeScript
  computation they replaced (tag `ts-forces-final`, then deleted); their byte fixtures run in CI's `rust` job. Rift and Deposit
  (#273) are adopted directly in Rust. The analysis' six kernels are Rust too (#157, D391), and the checks (done; #207,
  D465): `rust/checks`, byte-identical to the TypeScript they replaced (tag `ts-checks-final`, then deleted), their byte
  fixtures in CI's `rust` job. Codex's speed rounds (water, generation, forces) are byte-identical adoptions.

**3. The generator queue**, one re-pin at a time (D148, D308), each step with its sheets for Kyler

1. **The badwater line** (done, #265, generator 0.8.1; D469): badwater joins rivers and lakes, the start keeps clean, pumpable
   water (D85) and no badwater within 15 of it. Its Naturalize shortfalls are fixed (#324).
2. **Delta arms round 2** (done, #325, generator 0.8.2): #233's arms, adopted on dev.
3. **Badwater joins the main water** (D476, `feature/badwater-joins`, generator 0.8.3, `needs-kyler` for its sheets): on most
   maps a badwater course is routed into the theme's main water (Lake Basin's main lake; elsewhere `river/main`, Delta's
   trunk, Islands' sea); about 15 in 100 drain where the land takes them. Replaces #265's clean main water and the
   poisoned-main-river follow-up. Its sheets shade water by how bad it is. Seeds 1–20 at 128², badwater reaching the main
   water, dev → 0.8.3: River Valley 1 → 18, Delta 1 → 19, Lake Basin 5 → 18, Islands 16 → 19, Highlands 18 → 20, Canyon
   19 → 19, Any 20 → 20; 18 of 140 starts moved for it, never the land.
4. **Lake Basin round 3** (#234, `feature/lake-basin-3`, built and measured): drowned valley outlines; it also fixes seeds 12
   and 15, which have no lake on dev yet pass the promise (D464).
5. **River Valley round 2** (#244), **Islands round 6** (#235, `approved`; round 2 is #210), then **Canyon and Highlands**
   (#261, `approved`).

**4. Startup and the post-release list** (D367, D378, D380, D381)

- **Startup** part 1 (D367, D455): the core half is done (#222: a project carries its map and opens from it, with the replay
  compared byte for byte) and so is the renderer's warm-up (#208). Left: the checks start after the first editable frame, and
  the page autosaves again once the water settles (the page's half).
- **The page is the editor** (#163; D384, D388, D395): the page session, with Kyler's sittings at each checkpoint: the
  settings panel (option B) is built; the single-view generator waits on Kyler's pick between two mockups (`?gen=a`, `?gen=b`
  on `/preview/`); the area brush (#227, merged) joins Raise and Lower with the page's toggle. The `/preview/` slot is its (D396).
- **CI: a merge queue for `dev`** (done, #238, with lighter PR runs and timing steps out): the workflow is merged; the ruleset is Kyler's to create.
- **The roadmap canvas** (done, #190, #251, #259): live at `/roadmap/`, one column on a phone.
- **The post-release list**, then, in this order: the Dependabot majors (D460: TypeScript 7.0, @types/node 26, after M9b's
  release, with the nightly suite green); **"Designed for" removed from the core** (D449); byte-exact reopening's (a) with
  startup part 1 (D455); the land and its water change together under every force (done: D371, Carve #199 and #257, the rest #311); Glaciate in Fast (done, #203, D374); Shift+F resets what F changes; a
  Strength slider for Smooth and Naturalize (built in the page); trees on dried soil (D376); a Sources setting for every
  force (done, D474, #308, #322); batch jobs across all threads; startup part 2's service worker with multi-core
  water (D397; the multi-core water and the service worker's isolation are merged, #281; its caching remains); a Codex round on Canyon and Highlands at 96² (#232, merged, has its report; the round continues in #261). The renderer
  session's items on its own PRs: #219 the default view fits the map (done), #240 the High bake worker (done), #225 a
  source's highlight reads under its water (done); then renderer R1 from the performance audit (#152).
- **Open investigations** (the milestone session reads them; Kyler's yes adopts one): theme critique (#211), the performance audit (#152, approved), scaling (#132), parallel water (#130). The
  Codex adoptions are in their own section below.

**5. Then, in order**

1. **The parity batch** (D337–D339) with **Crop map to selection** (D340): the core is adopted from Codex's
   `investigation/parity-core` (#252, `feature/parity-core`); the page wires its shelf tiles and settings, and the old
   branch (#95) closes. Crop map to selection is still to build.
2. **The Weather view** (parked, #73): Drought and Badtide day by day, held for Kyler's sitting after the page (D349).
3. **Custom map sizes** (D357), then **the dam sketch tool** (D383).
4. **Pick a place**, after the design pass (D384).
5. **The four 3D steps** (terrain above terrain; #71 is the reference, never adopted in TypeScript, D448): the Rust water
   has the stacked-column engine (adopted, the computation alone, not wired in), then Foundations, the view, creating them (Erode in Rust, D438, and the Block tool),
   generation.
6. **Polish until mature:** the 20-second tour (D377) and **M13**, before collaborative editing's first users (D349).
7. **Collaborative editing** (D349), then **M12 (Claude)** (D277, D342), then **Later**.
8. **Housekeeping** has no place in the order: each item ships on its own when convenient. **Real places' second round**
   (parked, #35, D319) waits until Kyler says it resumes.

Every step that changes generated maps commits a contact sheet (CLAUDE.md).

## How the work is judged

- **Kyler's one rule** (Kyler, 2026-09-25; PLAN §20 D115, confirmed D145). Acceptance covers only what a player would
  notice or what would break. Only three kinds of thing block: **breakage** (maps failing in the game, files or share
  links changing, lost edits, crashes); **principles Kyler has already decided** (no built dam walls, D111; from the 3D
  stages, the support rule's 0 dropped voxels and nothing stamped); and **what a player feels** (the page never freezes,
  and a first result appears quickly while the rest streams in). No blind review
  rounds: for anything visual, Kyler is shown captures and decides. Stop and ask Kyler only for real decisions or real
  breakage; otherwise keep building, log the rest in [docs/STATUS.md](docs/STATUS.md), and show the result rather than
  measure it. Each step lists its acceptance as **Blocking** and **Information**; the no-built-dam-wall check (D111) and
  the support rule (0 dropped voxels) always block. Speed is judged by Kyler using the tool (D453); something that
  feels slow is a bug like any other.
- **In-game checks are deferred** (PLAN §20, D11). A step marked **in-game check** does not stop or wait: it lists the
  checks it would have needed in [docs/archive/ingame-log.md](docs/archive/ingame-log.md) as *pending*, with the files to play,
  and relies on the automated validation and tests. The one exception is a **DGM Probe batch** (D116, D117): an
  automated run of maps in the real game, launched only after Claude asks Kyler in chat and Kyler says yes, every time
  (CLAUDE.md, Standing rules). A step whose gate is a probe batch waits for it.
- **Effort** is the recommended Claude effort level for building a step: **xhigh** for architecture-setting or
  algorithm-heavy work, **high** for the rest.

**Sources the open steps build from** (what each investigation found and whether it was adopted:
[investigation/README.md](investigation/README.md)): terrain above terrain (D118–D127, [INTEGRATION.md](investigation/terrain3d/INTEGRATION.md),
[DESIGN.md](investigation/terrain3d/DESIGN.md), the 3D steps' text; **Erode**, D281, `investigation/erode`, built by the
milestone session, not Codex, and held until Kyler has tried it); the workshop study (D87,
[WORKSHOP-INTEGRATION.md](investigation/WORKSHOP-INTEGRATION.md): port only what a step needs, with tests; its recipes are
reference implementations, not code to ship; other creators' maps and per-map numbers stay in `C:\dgm-workshop`, never
committed); the Claude groundwork (D88–D96, [M12-INTEGRATION.md](investigation/claude/M12-INTEGRATION.md), for M12; its numbers
come from a self-played pilot, so re-measure with the real suite first); the techniques playbook (D131, proposals).

---

## The Codex adoptions

Approved by Kyler (2026-10-01 and 2026-10-02); the milestone session handles them in this order, merging each at a boundary
(only Codex's own commits where a branch started from an unreleased one).

**Merged as investigations**
- **Short join codes** (#150): the findings go into [docs/COLLAB-BRIEF.md](docs/COLLAB-BRIEF.md) (the codec; a QR code next;
  WebKit and cross-network still unverified).
- **The performance audit** (#152): its ranked roadmap guides the order of the speed work.
- **Small starts** (#153) and **generation speed** (#155), inside M9b's order. Round 1 is byte-identical (about 6% less CPU
  at 256²); round 2 about 12% fewer redraws with every quality share equal or better and zero must-pass failures. Adopt
  round 1, then round 2.
- **The smoothness investigation** (#107, merged as an investigation, D398): paused, since Kyler sees no large-brush freeze on his own machine (the 3–4 s stall
  is most likely an artefact of measuring under 100% load). Its harness and findings are merged; none of its fixes are adopted. Its
  harness (`tools/smooth/`) stays as a tool, run only when something feels slow (D453).

**To adopt**
- **The Rust water** (done, #212; #156, D381, D441, D442): the native build for batch jobs, and Rust in the browser in every engine
  (Chromium, Firefox and WebKit) at every size, with no corrected comparison against TypeScript; its TypeScript is tagged
  and deleted. Firefox's speed is not investigated and the Codex round on it is dropped (D440). Rust 1.90, the wasm32
  target and the Rust build join CI and the setup command first (item 3a).
- **The Rust analysis** (done; #157, D391, D453): adopted (D442 (d)) with its fixed six-kernel policy in every engine,
  Firefox included: `distanceFrom`, `walkDistance`, `landRegions`, `spillLevels`, `damSites` and `roomMap` run in Rust
  (`rust/analysis`), byte-identical to the TypeScript they replaced (tag `ts-analysis-final`, then deleted); their byte
  fixtures run in CI's `rust` job. The outcomes and M9b's descriptive rows stay on TypeScript (a TypeScript
  `distanceFrom` kept for them).
- **The Rust forces** (done, #254; #158, D400, D453): adopted (D442 (c)): the planners are Rust (`rust/forces`); the core keeps the
  request, Keep, the build's last touches, the record and the showing; the TypeScript computation is tag `ts-forces-final`
  and deleted. New forces (Erode first) are built directly in Rust on it, never in TypeScript first (D438). Round 1's lesson
  applies to every port: share the map in typed memory, one call per operation, never serialized.
- **Portable maths** (#171, D401): merged as an investigation; adopt a narrowed version: the one shared `portable.rs` for
  every Rust port, and the whole-source guard over `src/core/`, the workers and data-producing tools, as CI. Left out: the
  Vite plugin that rewrites Three.js and the renderer and camera parts (operations record their results, so picking
  maths never reaches a replay). Adopted first (D442 (a)), with no quiet-window timing (D441).
- **Rust threads** (#168, D402): merged as an investigation and parked. Threaded Rust stays experimental until wasm
  atomics are stable in Rust (Rust 1.90 still marks `+atomics` unstable); #130's design on the Rust water is the multi-core path.
- **Multi-core water** (done, #281, merged; #130's design; follow-ups on `fix/multicore-water-followups`): #130's strips with halo exchange,
  on several single-threaded instances of the Rust water's Wasm over a `SharedArrayBuffer` (`src/core/sim/parallel.ts`),
  byte-identical to one thread. Threads only where they help: 256² and up in Chromium and Firefox (Firefox's speed is
  not re-timed, D440, D441), about 8 threads at 256² and up to 16 at 512²; single-core at 128² and in
  WebKit. Its gate, the native `exp` and `hypot` calls made portable, is met (D401's guard). Costs: one
  first-visit reload through the one service worker (`public/sw.js`, D397; until hosting sends the headers itself; moving
  to Cloudflare Workers with Static Assets becomes worth doing then) and about 35 MiB at 512².
- **Scaling round 4** (#132): approved. Files about a quarter of round 3's (7 MiB at 256², 20 MiB at 512²), reopening about
  1–4 s, a single undo at any depth a few milliseconds or less. Adoption checks: a 100-step jump back (1.5–6 s today),
  memory over a long session, and native Safari storage.

**Speed rounds (done):** water speed (#290, the flow layout and the skipped wet-list rebuild, no SIMD) and forces speed half A
(#289) are merged; generation speed (#291) was closed unadopted: generation gets faster with the generator's Rust port after
the theme queue. Generation speed round 3 (#326, merged as a record) is not adopted: its patch saved 2.9% in total
(median 1.1%, some themes slower). It found that failed layouts take about half the generation time, and the only large
lever changes maps, so it belongs to a generator round if Kyler ever asks for one. Deposit's pillars (#301) and the merge review (#306), map switch speed (#316) and the saving review (#317) are
merged. The dam sketch engine: rounds 1 (#159) and 2 (#166) are merged as investigations, round 3 (#279) is parked (see its
section below).

**Verdicts to adopt (Kyler, 2026-10-05; the reports are merged as records):**
- **Page QA (#310):** F1 adopted, by the page session: saving and Download wait for a running force to finish and be kept.
  F2 not adopted: Your maps keeps every edited map, and there is no undo across maps. F3 adopted, but only folded into the
  next generator re-pin (the badwater rework's), never on its own.
- **Force playback (#312):** all three parts adopted once #311 merges: renderer.patch and worker.patch to the renderer session
  (forces play), page.patch to the page session; the page part lands before the worker part.
- **Custom sizes (#313):** a record. Its fieldData width fix (src/core/gen/generate.ts) is adopted (done, #319).
  Parked for when D357 starts: "every side from 4" conflicts with "absolutes never relax" (a 4-wide map can't hold a 5×5 mine
  site; a 4×4 map can't reach 178 logs). Kyler decides it then.
- **Long session (#315):** LS1 adopted (done, #319): backgroundCheck's unused canonical run is dropped
  (src/worker/session.ts).

## Parity core (done, #269; D337–D339)

Codex's core parity investigation (#252) adopted in #269, merged: the game's objects, settings and questions in the core with no
interface, for the page to build on. Its four game-fidelity changes are approved (#270).

## Rift and Deposit in Rust (done, #273; D438, D444)

Rift and conserved Deposit built directly in Rust (#268, merged as the investigation), adopted in #273, merged;
byte-identical in every engine, with their own contract tests. The page adds their controls and effects. Deposit's lone pillars and scattered tiles are with Codex (`investigation/deposit-pillars`).

## Badwater line, wave check, wider names (#265, D469)

The badwater line follows the land and joins rivers and lakes, a straightness check and wider names: generator 0.8.1, the
first re-pin of the generator queue. Done (Kyler approved the reworked sheets, 2026-10-05); its follow-ups are in the
generator queue above.

## Canyon and Highlands height (#261)

The height the eye sees on the 96² round: generator 0.9.0, renumbered if it merges after #265. Highlands is approved; a new
Canyon session (Opus 5.5) does one Canyon-only round: seed 27's gorge and the round's start lakes.

## Islands round 4 (#235)

On hold: Kyler judges the sheets and the 256² trade first. Round 2 is #210.

## Basin highlight (#225)

A source's highlight reads under its own water, in both looks. Fails the palette test (a hard-coded colour); the renderer
session fixes it. The renderer session also fixes #275's two `forcesSitting` failures.

## The Rust order (D381)

The exact core moves to Rust in this order (adopted ahead of the post-release list, D442; byte-identical in CI, no timing gates, D441, D453), each port byte-identical and tagged
before its TypeScript is deleted: (1) the water settle (above), and the stacked-column engine for terrain above terrain in the same crate (D448; adopted as computation only, wired in by Foundations); (2) the five released forces (their TypeScript tagged
`ts-forces-final`, then deleted); (3) the forces' planning, the analysis and the checks; (4) the Rift and Deposit
adopted directly in Rust, and every later force (Erode, future demos) built in Rust, each with a
watch rebuild in the dev server and, from its first commit, the same bytes in every engine (in CI with D366's check) and
its own contract tests (D444); (4b) the checks (done; #207, D465: `rust/checks`, tag `ts-checks-final`; one-line refusals, no TypeScript fallback); (5) the
generator, after M9b's release; (6) the editor's operations and undo, if the performance audit shows the boundary cost
justifies it. The interface and the rendering stay in TypeScript.

---

## The page is the editor, with the design pass (D232–D234, D384)

**The brief: [docs/UI-BRIEF.md](docs/UI-BRIEF.md) (D330).** It is what gets built, and supersedes the D233 description below
where they differ. Built by the page session (D388), rebuilt fresh on `feature/page` from `dev` (D395), together with the
split of the editor's giant files into feature folders (the page session owns `Editor.tsx` and its split), with Kyler's
sittings at each checkpoint. Two generator pieces come earlier, in M9b after its re-pin: Sources: None (brief §8) and the
automatic water fix for a map edited before its water settled (brief §5).

- **3D everywhere** (D232): the 2D toggle removed, with an automatic fallback for computers that can't run 3D well.
- **The landing page's map is the editor** (D233): editable right after Generate, the essentials around it (brushes, Water
  source and Badwater source, the forces), an expand button to the full editor in true full screen (Keyboard Lock in
  Chrome and Edge; the browser window elsewhere), Generate and settings changes undoable with a quiet note, a collapsed
  Legend button, Save to Timberborn from both, Real places opened the same way, view-only on phones.
- **Your maps** (D234): the last 30 edited maps in this browser, stars kept forever, reopened exactly as left, with rename,
  copy, undoable delete and a saved-to-Timberborn mark.
- The export row has no "Without pre-filled water" (D237): the capability stays internal (the worker, the tools, the probe
  and the tests).
- **Startup part 2** (D367, D397): the ready-made first-visit map picker and parallel loading. The one service worker (the
  caching and multi-core water's isolation) is the milestone session's, with multi-core water's adoption.
- Where **Remove unfed water** and **Fill** (D387) sit in the page is agreed with the milestone session through Kyler.

**The design pass** (D384, amending D349's placement, D236 and D113's visual-design line). It defines Dam Good Maps' own
look, guided by `docs/UI-BRIEF.md` and Timberborn's warmth as the High look carries it, using the impeccable-app-flow skill
(timbermods/.github, `claude-skills/impeccable-app-flow/`) as its process, and leaves a DESIGN.md and a MEANING.md behind:
the records every later interface follows (D176, D236). The timbermods "walnut lodge" palette may be borrowed from where it
fits but doesn't bind it. The frame's touch-up to the High look is done here, so the frame is styled once (D296). 3D's own
controls are designed when 3D arrives. From the workshop study (D87): the panel gains Variety and a **Surprise me** button
beside Generate; the map card names the premise and its landmark; copy uses the catalogue's words.

The page session records its design decisions in its own DESIGN.md and `docs/progress/page.md`; they are folded into PLAN
when its work merges (D388).

**Blocking:** breakage (no edit or map lost: expanding, returning, Generate over edits and Your maps keep every edit; undo
always brings the previous map back; storage failures said plainly) and what a player feels (expanding needs no reload; the
page never freezes; the editor never slows for the history).

---

## Startup: maps open fast (D367)

Codex's startup investigation (`investigation/startup`, #127), approved by Kyler on 2026-10-01: first-visit maps editable in
1.30–1.44 s median (1.59 s worst), cold on a typical connection, with byte identity and Save and export still gated.

1. **Part 1** (`build`, post-release list): a stored map opens from its stored state without rebuilding (legacy files and
   files with water still pending keep the rebuild fallback); this is also byte-exact reopening's (a) (D455): on reopen the
   log is replayed once and compared with the stored map, and if they match byte for byte undo below the save point works
   as normal, otherwise it stops at the save point, never an approximate replay; the renderer warms its shaders and GPU state while the map
   loads; the checks start after the first editable frame, every gate unchanged. The core half (the stored map, the replay
   rule, the replica's comparison; `src/core/doc/stored.ts`) is built on `feature/startup-part1`; the renderer's half and
   the page's start of the checks after the first editable frame are separate.
2. **Part 2**, split (D397): the page session builds the first-visit map picker and parallel loading, with "The page is the
   editor" (above); the milestone session builds the one service worker (the caching and multi-core water's isolation)
   with multi-core water's adoption.

Both parts add the investigation's CI check (the service worker's, the milestone session's).

## Carve's river is born as it cuts (D371)

Carve is built: while it cuts, the water front follows just behind the cutting edge from upstream and hands off to the real
simulation's water with no jump (#199), at a steady, slower pace so a breakthrough drains at a pace the eye follows
(#257; Kyler judges it on `/preview/`, #247 stays open for his eye). Its gate holds in `carveBornAsItCuts`: the keep's water
equals the last live water. What remains: the same approach for Glaciate's lakes, Craterize's crater lakes and the Rift's
captured rivers, using `investigation/performance`'s findings; and a check that both looks and reduced motion read calm.

## Follow-ups to the editor and the look

Not yet scheduled.
- **Alive, not mechanical** (D240): short, visual-only animations for the land (grow, sink and crumble, a ripple from the
  brush's centre, grass creeping over fresh earth, rock layers in new walls), the water (gliding surfaces, a foaming front,
  rising basins, bursting falls, wet sheen and damp ground, pulsing sources) and the moments (Generate's reveal, pops and
  topples, undo in reverse, a breathing brush ring, Save to Timberborn's send-off, optional cloud shadows); synced with the
  sounds; off with reduced motion; GPU effects with capped particles, measured on dense 256² maps and scaled down on weaker
  hardware. The final map and water never change.
- **The High look's tuning** (D334): Kyler tunes on real maps the channel water's marbled streaks and the vein junctions that
  widen abruptly. Pending #83: the new trees in Standard, only if they cost little on real hardware (D241). Optional, later:
  richer or higher-resolution textures, softened block edges and grass lips, full-resolution rendering and anti-aliasing, more
  detailed bush and ruin models, dry contaminated ground's cracks a little more visible from far away. Visible seasons
  (#67's stage, with D250's badtide withering) join the Weather view, so they aren't drawn twice (D286 (4)).

---

## The parity batch and Crop map to selection (D340)

The core is adopted from `investigation/parity-core` (#252): the objects, their options, sinks, scatter placement, the
core's blast questions and the fluid timeline (EDITOR_PLAN.md, the shelf). The page adds the shelf tiles, models and settings.
The decisions in docs/decisions/ are the spec; every item matches the game's rules, footprints and defaults from its data, never
guesses, with an original model in both looks, a label in Markers, exact save and load, and a sample in the next probe batch.
- **D337, the game's fluid editing tools:** Water Seep and Badwater Seep (2×2, stopping while the water over them is deeper
  than 0.8 m), Aquifer (3×3) and Ancient Aquifer Drill, Badtide Drain (1×3), a start delay for every origin but aquifers,
  negative strength (a sink), the game's strength ceilings (8 m³/s per emitting tile) and defaults (a new water source at 1).
- **D338, objects, ruins and natural resources:** the Unstable Core and the Reserve Pile, Warehouse and Tank; ruin and thorn
  fields painted as the generator grows them; Succulent; D235 finished for trees and bushes (strength sets density, an Age
  option, a "Mixed woods" item). Natural Overhangs come with the Block tool at 3D step 3.
- **D339, Unstable Cores, what you see is what you get:** the generator stays as it is; a selected core has a **Show after it
  goes off** toggle drawing the map as it will be after the explosion (a view only); the day-by-day view shows the core's
  moment in its timeline when the Weather view lands.
- **Crop map to selection** (D340): a Select action that makes the map exactly the selected rectangle (from 4×4 up to the
  map's size), as one undo step, with the full map kept in Your maps. Everything inside comes along exactly; at the new edge,
  rivers flow off it, a river's head gets M9b's edge lip, edge walls and a missing start show in the checks dot, and objects
  cut by the edge are removed. Recorded as an operation, so share links rebuild it; the name and "how it plays" line are
  re-read. D340 has the rule and its tests.

---

## M9b: composition and variety

Tag `m9b-done`: released 2026-10-04 (M9c folded in, D278; generator 0.8.0, `main` at b407656). **Read
[docs/PERFECT.md](docs/PERFECT.md) and D252 first** (D225, D252): five outcomes, judged by Kyler's eye against PERFECT, not
only by the batches and the measures (D273). The hand-over is in `docs/progress/m9b.md`.

What follows it: the generator queue ("The order of work", item 3: badwater, Delta arms round 2, Lake Basin round 3, then
an Islands round) and the small-start and 96² rounds, one re-pin at a time (D148). Islands shipped as the safe version
(D417, D429–D430), Delta with its fan tuned (D416, D447), Lake Basin round 2 on its merits (D453, D458).

**The agent guide** (Kyler, 2026-09-25; D142): how a Claude Code session generates, edits, validates and exports maps, and
runs the contact sheet and the DGM Probe (under the probe rule, D117). Waits with M12 (D277, D283 (4)).

- **Delivers, judged as five outcomes** (D273; the measures below are information, not gates):
  1. **A readable water story:** a map's water can be followed at a glance, from where it starts,
     into a main river or lake system, to where it leaves; a few tributaries, never a tangle of
     small channels (information: the main system's share of the map's water).
  2. **Themes keep their promise:** each theme's signature must emerge, checked like an
     intention; a candidate without it is not chosen. River Valley: a main river through a broad
     valley. Canyon: a river cut deep between cliffs for a real stretch. Highlands: high, rugged
     ground with plateaus and valleys among it. Lake Basin: big lakes that dominate the water.
     Delta: a river splitting into several channels as it reaches low ground. Islands: land
     broken by water into islands, in many different layouts — its sameness is fixed here
     (archipelagos across the whole map, a sea off one edge, island chains, atolls; D209). Any:
     no promise.
  3. **Every map has a character:** at least one standout intention on every map, and its
     one-line description (D278) says something specific about it.
  4. **Any handful differs:** across any six maps of a theme, different openings, water stories
     and standouts, no two alike (information: no-clone and no-archetype).
  5. **Nothing looks stamped:** no perfect circles (irregular crater rims and round lakes), no
     ruler-straight lines, no theme stuck in one template.
  6. **Chaos:** Any at Variety 100 and Verticality 100 meets the same five outcomes too — wild
     land, still readable water, still a describable map; the batch pass-rate rule holds there
     as well; every review set includes four such maps at 256² (D252).
- **Intentions** (D274, settles decisions-pending #66): Kyler's four (D165) and the seven already
  in the set, plus ten of design version 2 §6's fourteen candidates — the river loops back and
  leaves an oxbow lake; lakes step down the valley, each spilling into the next; the river splits
  around a big island and joins again below it; two waterfalls pour side by side over the same
  cliff; a long cliff splits the map into an upper and a lower world; side valleys hang above a
  wide valley floor, their streams falling in; two ways to grow (open farmland one way, wood and
  ruins up the cliffs the other); badwater spills through the richest land; a relic waits on a
  pinnacle; a plug holds back a lake. Left out: round bowls clustering, rice terraces, the
  strongest current far from home, the broad dry plateau over deep water. Each keeps Kyler's
  three principles (outcomes, failure allowed, many realizations, D138); one that almost never
  emerges leaves the set.
- **Simplifications** (D275): recipes are folded into intentions — one concept, checked by
  outcome; the named premises that aren't already intentions become intentions or are dropped.
  Flow-direction variety comes from rotating or mirroring each finished map into one of its 8
  orientations, not from separate machinery: all 8 appear, none over a quarter.
- **Candidate choice, names and Another like this** (D278, folded in from M9c): (a) the generator
  makes candidates until one meets the outcomes above (the theme's signature, at least one
  standout intention, readable water), within a capped number of attempts, showing the first
  candidate at once and progress after it, never a frozen wait; this replaces the 12-component
  score and K = 3; generation times at 128² and 256² are reported. (b) A name and a one-line "how
  it plays" description come from the map's standout intention and its read-back features, on
  the map card; outcome 3 above uses the description; names match the features on 30 hand-checked
  maps, 10 of them at Variety 100. (c) **Another like this:** one button on the generator page and
  in the editor makes one sibling per click (the same theme, settings and intentions, different
  land), with its own share link, never a clone (the no-clone check between siblings).
- **Deferred** (D276): difficulty through terrain (PERFECT's Challenge section) is not part of
  M9b; it moves to a later step with its own design. The starting-logs floor and the start's
  guards stay exactly as they are.
- **Also moved to M12, deferred with it** (D277, D278): the place resolver, the judgement-word
  table and river-course naming beyond what descriptions need (D84, D88); see M12 below.
- **Kept** (D276): the Variety setting and Surprise me; river-network variety through the
  intentions and outcome 1 above; the openings, the weather-cycle signature and the strategy axes
  as information; the dam-wall check as blocking; Surprise me and high Variety may reach high
  Verticality now and then, most maps never do (D132).
- Acceptance (D115, D252, D273): blocking: M6, the dam-wall check, finds no built wall; names
  match the features on 30 hand-checked maps (10 at Variety 100); the first candidate shows at
  once, with progress after it, and generating never feels stalled; Kyler's eye against PERFECT's
  Maps and Water sections on the review set (a contact sheet, 12 random maps in 3D, and the four
  Any maps at Variety 100 and Verticality 100 at 256², D252) — anything he names is fixed or
  explicitly accepted. Information: the design's measures M1–M5 on 200 seeds per theme at 128²,
  against their targets; the **permanent measures** (no clones, no archetypes, play variety, no
  approximation of workshop maps), reported on every milestone after M9 so no later milestone
  brings archetypes back unseen (design §10, §16; D112 (4); D278 (3)); in 100 seeds of each theme,
  all 8 orientations appear and none exceeds a quarter (D275).

---

## Real places, second round (parked, D319)

**Parked** by Kyler on 2026-09-29: changes still coming (the base raised so the deepest riverbed stands at least 3 levels
above the map's floor, item 47, settled by D331; and a lip at the edge beside a river's head, item 27) affect every rebuild, so
the one rebuild waits until they have settled. **Kyler says when it resumes.** The background conversion is stopped where it
stands (37 of 136 places converted under VERSION 11; the cache is attached to the draft release
`cache-real-places-2-v11`); [#35](https://github.com/timbermods/dam-good-maps/pull/35) stays open and unreleased, and its red CI is expected meanwhile.

When it resumes (PLAN §20 D155–D157, D300, D306), on branch `feature/real-places-2`, released as `real-places-2-done`:
short in-game descriptions with a link to a credits page; the maps built at deploy time and served as finished files; the
byte check nightly and in the release check; clean titles; 3D thumbnails rendered on a GPU and lazy-loaded; every place
rebuilt without perimeter walls, water free to drain, at 256² where the data allows with its signature as the focal point; and
the gallery grown to about 150 places. Kyler sees a contact sheet of the whole gallery and says if any should go.

**Meanwhile (D421, amended by D445, done):** the gallery shows every place; the 33 whose start reaches no fed water (the recorded
`start.water` fault, `src/core/places/place.ts`) carry the card note "No reachable water" until round 2 fixes them.
`tools/real-places.ts` runs again and the cards are re-rendered. Plants on dry soil and berry shortfalls wait for round 2.

**Blocking:** every map passes the validators and exports, the page works on desktop and phone, D151 (no edge walls), and the
starting-logs floor (D224, D227: at least 178 logs within 40 tiles' walk of the start). Only those, and the file playing
exactly as the editor shows it, gate a place (D245): a place is never dropped or moved to other land for a playability check;
its card notes, in a few plain words, only what would sink a player (no water a pump can reach, too little wood near the
start, water that keeps moving).

**Tall places** (D172): Real places and Pick a place get a height option, standard (up to 16) or tall (up to 22, top layer
empty); dramatic places default to tall. Tall versions come in the round after a probe batch confirms maps above 16 load and
keep their terrain, water and objects; each tall map's description notes that the in-game editor only edits up to level 16.

---

## Terrain above terrain (parked, D448): Foundations, the view, creating them, generation

Carving is a brush, live from the start (D179, D182; EDITOR_PLAN.md Part 1, §9).

**In four steps** (Kyler, PLAN §20 D279–D281, D286 (3)). The generator makes caves, overhangs and arches; the player
creates them with a force for the magic (**Erode**) and a **block tool** for precision; the water engine makes water under
roofs and between floors behave as in the game; the view draws it all. The design is `investigation/terrain3d/DESIGN.md`,
with the game's rules in `GAME_RULES.md`, the maps' use of caves in `MAPS.md`, and the repository's heightfield assumptions
in `INVENTORY.md`. Each step is released like a milestone. Steps run on `build` (Opus 5.5, high; D281: one definition for all
building, no new one for 3D) except where noted.

**Testing throughout is kept to what a player would see go wrong** (D279): water that isn't what the game does, generated
maps changing when they shouldn't, saved projects not opening, terrain the game would drop; no exhaustive measurement beyond
that.

### 1. Foundations (tag `3d-foundations-done`)

On its own branch `feature/terrain3d-a`, alongside M9b (M9a and M9b keep the machine first, D280 (1), D286 (1)–(3)).

**First, new modules only, no existing module changed** (D286 (3)), so it doesn't collide with the water and generator code
that M9b is changing: the stacked-column water engine as its own module (on #71 in TypeScript, kept as the reference and
never adopted: its Rust port is in the Rust water crate, `rust/water`'s stack modules, D448), verified against the game itself — a DGM Probe batch
of the test maps T1–T6 and the official cave maps' own saved water (asked under D117, when the machine is free) — with its
results saved as **golden fixtures that CI checks on every push**; and the support-rule check.

**After M9b has merged into `dev`** (the forces have): converting `core/terrain`, the build and the TypeScript validator to
runs, and wiring in the **Rust** stacked engine, which passes #71's golden fixtures natively, in Node's WebAssembly and in D366's engines (D448; the
one-column fast path is today's water unchanged) (`build`).

**No Python copy of the stacked water engine** (D279): 3D water is verified against the game, not a second engine kept in
step. The Python validator treats water under roofs as information, with a note pointing to D279; heightfield water keeps its
Python check exactly as today.

**Delivers**
1. Runs per tile (`core/terrain`) as the build's, the document's and the kept content's terrain,
   with `heights` derived (D119). Formats 1 and 2 convert on read.
2. Stacked-column water with the game's rules (air gaps, overlap flow, pressure ×8, the overflow
   cap, roofs, and the five edge rules today's port simplified), with a fast path for one-column
   tiles; the 3D pre-fill and the canonical settle; the multi-slot writer (D120).
3. Soil moisture and contamination per run top.
4. Checks:
   - the support rule on every map, and the build's rule pass (D121);
   - the floor graph in both validators (D122);
   - plant clearance and first-run placement;
   - floor-aware slope and start checks; `start.dry` applies the floor rule (water counts only at
     or above the start's floor) to water under roofs only, and open water keeps today's rule
     until it's measured (Housekeeping, below; Kyler, D145);
   - `walk.levels`, `terrain.dropped`, `water.sealed_source`;
   - `terrain.single_floor` retired for generated maps.
5. Imports: roofed water simulated (D100's exception retires); the cave cause of approximate
   water retires (D98). Caves stay locked to the brushes until step 3.
6. The Probe's test maps T1–T6 (DESIGN.md §8): written now, played to produce the golden fixtures
   above.

**Acceptance** (D280 (1), replacing the full-batch acceptance this step used to have)
- Blocking:
  - generated maps are unchanged except their water's last digits, checked on a sample of seeds per
    theme, not full batches;
  - the golden fixtures agree with the engine's own output on every push;
  - the support check and the floor-aware slope and start checks are fixed and tested;
  - an unedited import still exports byte for byte;
  - saved projects open with the same land, and their strokes replay exactly;
  - progress shows while water settles, and the page never stalls.
- Information: on the official cave maps, the canonical settle matches each map's own water at
  least as well as the investigation measured, and moisture per run matches the stored slots on at
  least 18 of 19.

**In-game check:** the golden-fixture probe batch, asked under D117. **Effort:** high (`build`).

### 2. The view (tag `3d-view-done`)

After the High look is adopted (Map look 2, released), so there is only one mesher to build (D280 (2)).

**Delivers**
1. One mesher for runs with undersides, in both looks, sky light and sun visibility in 3D, water
   per column, and Map look per run top (D126) — starting from the Erode investigation's mesher
   as a proposal (D280 (2), D281).
2. 3D picking and selections (the Select tool in 3D), and a level-slice cutaway.

**Acceptance**
- Blocking: unedited imports export byte for byte; the editor stays responsive (tool feedback
  within a frame, slower work in the background).

**In-game check:** none. **Effort:** high (`build`).

### 3. Creating them (tag `3d-creating-done`)

After the view (D280 (3)).

**Where the tools sit (D335, Kyler, 2026-09-29):** the Block tool (`investigation/block-tool`, D335) sits on the tools row with Raise, Lower, Flatten, Smooth, Naturalize and Select, not on the forces row, whatever code it's built on (the forces core included): the rows follow how a tool feels to use, and Block is a precise hand tool. Erode stays on the forces row.

**Delivers**
1. **Erode**, a new force, built directly in Rust on the adopted Rust forces (#158) once that adoption lands, never
   in TypeScript first (D438), checked as D444 defines (the same bytes in every engine in CI, its own contract tests), with its investigation (`investigation/erode`, D281) as the reference, on the
   forces core, under the forces' principles (D257: bound only by nature; D258: no predicted route
   or outline). Wind and water wear rock: a cave or alcove at a cliff's foot, an overhang where hard
   rock caps softer rock, an arch through a thin ridge; the land decides which; every shape obeys
   the support rule; a click or a drawn sweep; Power, Size, Try another; two to four seconds of
   dust and rubble with CC0 sounds. Built by the milestone session, not Codex (D281); held, like the
   other forces' investigations, until Kyler has tried it.
2. **A block tool**, for precision: point at a block's face and click to add a block against it,
   drag to paint a layer outward from that face; remove blocks to hollow a cave; sized like the
   brushes; shows at once any block the game's support rule would drop.
3. **The brushes, forces and every recorded stroke move onto runs** (moved here from step 1, D280
   (1)): on a map with no 3D forms a stroke gives the same terrain as before. This supersedes the
   plan for cave carving to extend the top bar's Carve force (D182, D184; that plan is dropped —
   Erode is the magic tool and the block tool is the precision one, D279).
4. Undo and generate-keeping-edits. Imported caves become editable (D40 retires).
5. Claude and 3D (deferred with M12, D277): new 3D forms would steer the generator, and precise
   carving would use the block tool; the words land whenever M12 resumes.

**Acceptance**
- Blocking:
  - every stroke's or force's result drops 0 voxels: what would fall shows live, and is refused
    with its reason;
  - undo restores the exact runs, and an incremental build equals a full build after random edits;
  - unedited imports export byte for byte;
  - the editor stays responsive: tool feedback within a frame, and slower work in the background.
- Information: a stroke committed (rasterize, remesh, re-light) ≤ 100 ms at 256²; a dirty-chunk
  remesh ≤ 5 ms; usability: "dig a tunnel between two valleys" and "cut away to see a cave" in under
  2 minutes without help.

**In-game check:** yes (a probe batch: T5, and T2 on edited maps). **Effort:** high (`build`).

### 4. Generation (tag `3d-generation-done`)

Once M9b has settled (D280 (4)).

**Delivers**
1. **3D features as intentions**, under Kyler's three principles (D138: outcomes, failure allowed,
   many realizations) — "a natural arch", "a cave with a spring in it", "an overhang shading the
   start" — grown by the processes below and checked like M9b's other intentions, not built from a
   fixed feature-kind list.
2. The processes (DESIGN.md §5.2), run on M9's fields and drainage:
   - tunnels between valleys on one level;
   - arches in fins;
   - sky bridges over gorges;
   - cliff paths of ledges;
   - cliffside caves;
   - undercut shelters;
   - overhanging cliffs;
   - spring caves;
   - underground rivers;
   - collapses.
3. Verticality (`vt`, in the spec, share links and the panel from M9a, D132) extends to these forms
   (PLAN §5.9's table; D123). Themes carry their own defaults.
4. Traversal: derived slopes on the floor graph, and rewards planned on stairs-only heights.
5. Relief to 22 at Verticality 70 and above comes with M9a, unlocked: the tall-maps probe batch
   passed (run 20260925-tall, D172).
6. NaturalOverhang bridges and badtide drains in cliff notches (from Later).
7. The 3D measures in the batch and the M9 measure suite.

**Acceptance**
- Blocking:
  - the rule pass drops 0 voxels on every batch map, and every 3D form comes from a process
    (nothing stamped);
  - every map passes `walk.levels`: the start and its first resources stand on land reachable
    without stairs;
  - at the default Verticality, relief stays within 16 (D132);
  - batches ≥ 98% final per theme and size at Verticality 20 and 80;
  - the same bytes for the same seed in Node and Chrome, and share links reproduce;
  - a whole generation shows progress and never feels stalled;
  - the Probe's batch (asked under D117): T1–T4 and T6 agree with the model within the tolerances
    stated before the run; and T7, like M9a's batch (D116): the Probe plays high-verticality maps,
    which load, keep their water and objects, and behave through droughts and badtides as the
    models predict, with nothing visibly broken in its screenshots. This step is released publicly
    only after the batch passes (Kyler, D145; it replaces Kyler's own play of two maps).
- Information:
  - first attempts (≥ 60% as a target);
  - at Verticality 20: at most 2 small 3D forms at 128², relief within 16; at 80: the median map has
    ≥ 5 forms of ≥ 3 kinds;
  - the M9 measures, with the 3D inputs;
  - a whole 128² generation ≤ 3 s at Verticality 80.

**In-game check:** yes (a probe batch). **Effort:** high (`build`).

---

## Weather view (parked, D349)

Closes step 1 of D349's order, after "The page is the editor" and the parity batch (Kyler, 2026-09-25; PLAN §20 D133, D253;
**slimmed by D285 (2)**: the separate timeline and its plain-language summary are dropped; the strategy axes are information
in M9b).

**Also required (D361):** the day-by-day view can stay on any chosen day (the drought's worst day, say) without cycling back
to the start, and steps forward and back one day at a time.

**Builds on** the editor's **Drought** and **Badtide** day-by-day buttons (D267, folding in D186's separate view): a day
strip, Speed, the start's-water marker and hover notes, on their own branch (`feature/weather-days`), merged separately
(D267 (9)). This step adds only the following on top of those buttons.

**Delivers**
1. **The drought line** (D269's proposal): every lake and river shows a faint line on its shore where its water will stand on
   the last day of a drought (the length set in the day strip); a lake that would dry out shows a faint dry tint over its bed;
   the start's water is marked a little more strongly. It updates in the background after each edit, like the checks, and
   never blocks: feedback from the land itself, not a readout (D184).
2. **The High look's contamination veins** in the Badtide view (which tiles are contaminated), **the Unstable Core's moment**
   in its timeline (D339), and the High look's **visible seasons** with D250's badtide withering, built on the day-by-day
   display (D286 (4)).

The map card says nothing about droughts or badtides (D472). Every claim traces to the model and a verified rule, and never
promises colony survival (the catalogue's limit: economic timing is unverified).

**Acceptance** (Kyler's one rule, D115)
- Blocking: no map file changes; the drought line traces to the model and the verified rules, updates in the background
  and never blocks editing.

**In-game check:** none beyond what D267's buttons already have. **Effort:** high.

**Release:** tagged `weather-view-done` and released like a milestone (CLAUDE.md, Deploying).

**Proposals adopted from PR #33** (D173): the bit-identical speedups to the cycle model, each re-proved step by step, and the
scheduling: the first drought first when it's on screen, a background start after generation, caching under the full input
hash, cancellable batches.

---

## Pick a place

One of the final features, after the design pass (Kyler, 2026-09-25; PLAN §20 D160, D166, D175, D255; **simplified** by D285
(3)). Desktop only; a phone version is not planned. A **Pick a place** page beside Generate and Real places. Its conversion
(real elevation to a Timberborn map: heights, rivers, sources, the start, the starting-logs floor) is built from Real places'
existing conversion, running in the browser (D255), to the design pass's records (D176, D236).

1. **Explore:** a 2D map with shaded relief drawn from the same AWS Terrarium elevation the conversion uses, and OpenFreeMap
   vector tiles for context (rivers, lakes, forests, roads, place names; no key, attribution shown). Search by place name
   with OpenStreetMap's Nominatim, on Enter only, within its usage policy; pasting coordinates (for example from Google
   Earth) stays available. No satellite imagery; never Google's data. A fallback tile source (for example VersaTiles or
   Maptoolkit) is planned in case OpenFreeMap changes.
2. **Frame:** a square shows exactly what the map will cover. Drag and rotate it; resizing it changes the scale (metres per
   tile) within sensible limits; its real size shows ("7.7 km across").
3. **Preview, built on release:** when the player lets go of the square (not live while dragging), the land inside is shown
   turned into Timberborn blocks at Timberborn's levels, so the player sees the map, not just the place, before building.
4. **Confirm with as little as possible:** map size (96, 128 or 256; default 256² at the scale that frames the place's
   signature, D306) and height (auto: tall when the relief deserves it, once the probe confirms tall maps). Scale,
   difficulty and water (designed by default) sit in an optional **More** drawer.
5. **One click, "Build my map":** a short progress strip (terrain, rivers, start, forests, checks), then the map in the usual
   3D view with its name (from the place, no "Near") and a "how it plays" line; everything works from there: the Weather
   view, Refine, Save to Timberborn, Download, and a share link that rebuilds exactly this map (it stores the place, the
   framing, the settings and the elevation data's version).
6. **The framed land is kept** (D245, D255): only correctness and the starting-logs floor gate the map; anything short of
   the preference checks ships with a plain note saying what it lacks. The quiet retries never replace the player's framing,
   size or scale to pass the preference checks; it may suggest nearby framings that would play better, which the player can
   take or ignore. Only a correctness failure makes it look elsewhere, and then it says so plainly.
7. **Credits** as in Real places (D155): a short credit and link in each map's in-game description, the full notices on the
   credits page, and any region-specific notice the data's provider requires; ESA WorldCover (observed water, CC BY 4.0,
   D192) is credited like the elevation data.

No "use my own heightmap" upload (D255). It follows every current rule: designed water (sources only where water begins,
D166, D171; the prototype from `investigation/pickplace`, #34, its INTEGRATION.md adopted as proposals; where
`investigation/pickplace-water2` differs, its designed water replaces #34's), no walls or rims (D151), maps may drain (D152),
Kyler's start requirements (D153, D164), and official-like trees, ruins, mines and clusters (D167–D170).

**Blocking:** breakage (the map passes the validators and exports; the share link rebuilds it exactly; attribution present;
no edge walls; the starting-logs floor, D224, D227) and what a player feels (the explore view and the live preview stay
smooth; progress while it builds; never a frozen page; never a failed attempt shown).

---

## Housekeeping (done when convenient, each with its test)

No milestone, no release, no gate (D283 (3)): each item is fixed when convenient, with its own test, on `chore/housekeeping`
(routine, Sonnet 5.5, medium, D286 (5)). The old refinement phase's containment items (the dam-site wall, the badwater box,
Lake Basin's rings, Canyon's narrows, the drawn rivers' banks) are superseded by M9a's processes and M9b's "nothing looks
stamped" (D273 outcome 5): nothing in the new generator's land is stamped, so it needs no separate naturalness pass.
- pending decision [#2](docs/decisions-pending.md): `plants.drought` warns on every River Valley map, because the berry
  bushes near the start grow on water that drains in a drought;
- pending decision [#12](docs/decisions-pending.md): narrow a generated fall's channel to 1–3 tiles above the drop, for water
  wheels;
- pending decision [#21](docs/decisions-pending.md): the measured targets that move less than their formulas (flat share,
  one-level share, cliff share);
- **the load checks** (Kyler, 2026-09-25): the validators' load-class checks that real maps fail even though the game loads
  them (12 of 32 investigation maps fail one; decisions-pending [#8](docs/decisions-pending.md)). Keep a load check only where
  the decompiled game really rejects or breaks the map; otherwise make it a warning. Change both validators together;
- **`start.dry` and lakeside starts** (Kyler, 2026-09-25; PLAN §20 D107, D145): should `start.dry` count only water standing
  at or above the start's ground, so a lakeside start like Beaverome's passes? Measure how many official, workshop and
  generated starts it changes before deciding. Until then the floor rule applies only to water under roofs (3D terrain
  step 1);
- **three stale capture tools** (`tools/capture-look.ts`, `capture-objects.ts`, `capture-saplings.ts`): they look for tabs
  retired since D184 and no longer run against today's interface; bring them up to date, or retire them if nothing uses
  them;
- **the held dependency upgrades** (PLAN §20 D150): TypeScript 7.0, `@types/node` 26, and any future major (list them with
  `npm outdated`), one at a time, each with the full nightly suite, at a quiet time and never mid-milestone.

Every blocking check keeps passing (`water.storage_possible` is information the generator prefers, #67); batches stay at 98%
or better; the Python oracle changes with the TypeScript, with 0 disagreements, wherever an item touches generated maps.

---

## M12. Claude integration (deferred)

**Deferred until Kyler resumes it** (D277; after collaborative editing, D342, D349). All work on M12 is deferred, its
preparation included: no step before M12 builds or maintains anything for Claude while Kyler refines Dam Good Maps: no new
tool entries, suite requests or reference-solution re-runs ("Keep M12 ready", D134, is suspended). The Claude reference suite
is out of the regular checks (CI, batches, release checks) and stays in the repository unmaintained; a test that depends on
it and breaks is skipped with a note pointing to D277, not fixed. The editor is built so M12 is easy later (D342: every
change is an operation; all editing logic runs headless in `src/core/`). **M12's first part, when it begins, is catching
Claude up to the tools as they are then.** The full plan as it stood, with its build items, file moves, corpus re-tune and
acceptance, is in [docs/archive/roadmap.md](docs/archive/roadmap.md) ("M12. Claude integration").

**The model** (Kyler, 2026-09-25; D139, D145 (7), D187, D256; EDITOR_PLAN.md, Claude integration):
- **A summoned chat box**, summoned with a key, which disappears when done; it never takes permanent space.
- **Claude steers whole-map generation** for character and new features ("describe the map you want" and its candidates),
  through intentions and settings, and uses the forces for local change ("make the north mountainous" becomes Quake's Lift or
  Erupt; "add a big waterfall" becomes Carve or Unleash); it checks the result with the analysis and reports honestly what
  emerged and what didn't. It never hand-builds the map.
- **Precise edits are brush-style operations only,** the editor's own: strokes, sources, placements from the shelf, Remove and
  the Select tool's actions. Never landform, river, lake, set-piece or resource-area objects (D182, D184).
- **A provider-neutral model layer** (D140): only a thin adapter talks to the model API; Claude is the default and the only
  provider built (bring-your-own-key).
- **Also here:** the agent guide (D142); the words moved out of M9 (D277, D278): river courses read from the actual flow, the
  place resolver (flow-relative places, never a compass assumption) and the judgement-word table (D84, D88), left in
  `investigation/claude/` until M12 resumes; the artifact edition; a Dam Good Maps MCP server after M12 (Later).

M12's new interface is built to the design pass's records (D176, D236), with the finish review on the new screens.
**Effort:** xhigh.

---

## The 20-second tour (D377)

In step 3, polish, with M13's help. A ghost cursor performs about 20 seconds of choreographed editing on the map in front of the player, to advertise the controls that can't be discovered by looking: hold F and move the mouse to size, hold F and scroll for Power, Shift+click for the opposite (Raise becomes Lower), Ctrl+click to take a level from the land. The sequence (Kyler's refinement, 2026-10-01): two forces only, so the rest stay a discovery: Carve (a river, grown with F and the mouse) and Craterize (a crater, its Power scrolled up with F); then the brushes' flow, which players will use most: Raise a hill and size it with F; Shift+click to lower; Ctrl+click a hilltop to take its level and Flatten a spot to it; Smooth the edges; then Save to Timberborn.

- The keys show on screen as they're pressed (F held, the scroll, Shift, Ctrl).
- Offered, never forced: the first visit's one quiet hint offers it ("Watch a 20-second tour"), and it's in the ⋯ menu. It plays on a temporary copy of the current map, so the player's map is untouched; Esc ends it at any moment.
- Built from stored gestures replayed (every edit is a deterministic operation, D158, D342), using the keyboard shortcuts rather than toolbar clicks where possible, so it survives layout changes.
- The same sequence is recorded once as a GIF and video for the website, the workshop page and posts.
- No click-Next walkthrough, and no second "More forces" tour. Per-tool "Show me" demos can come later on the same machinery.

## M13. Problem reports, shortcuts and help, a final performance pass

**Design** (D176): M13's new interface is built to the design records, with the finish review on the new screens; no second
full design pass. Slimmed by D285 (1): the formal usability tasks are dropped; versioned deploys and the mobile layouts move
to Later.

**Delivers**
- A shortcuts reference, a help page, an accessibility pass and a final performance pass. The
  first-run hints came with Live editing (D184).
- Install help, including the extract step of the artifact edition.
- A plain **Report a problem** link to the repository's GitHub issues, for bug reports (PLAN
  §2.3). The rating form and `tools/ratings.ts` are dropped (Kyler, 2026-09-25; D145, which
  supersedes the workshop study's two-question form, D87).

**Acceptance** (Kyler's one rule, D115)
- Blocking: the **Report a problem** link opens the repository's GitHub issues.
- Information: Lighthouse performance on desktop (≥ 90 as the target).

**In-game check:** none.

**Effort:** high.

---
---

## Custom map sizes (D357)

At the end of step 1, after the Weather view. Any width and height from the game's minimum (4) up to 512 on either
side: the standard sizes, a few named shapes ("Long river" 128×512, "Strip" 64×512, "Wide valley" 512×256) and custom
boxes; share links carry the exact size. The generator uses the shape (a long river along a long map, a chain of islands
down a strip, a canyon running its length, the start placed to suit the shape per theme), and item 47's must-haves scale
with the map while the absolutes never relax. Curves are checked at 512² too (rivers, coasts, Delta's arms): M9b's 256² check found river meanders in absolute tiles, so they don't straighten, but 512² couldn't be checked while MapSpec capped sizes at 256. What grows with area may take longer beyond the standard sizes; what the
player feels stays at the standard. The camera and minimap fit any shape. Beyond
256 on a side the setting warns that Timberborn's own editor can't open the map and the game may run slower; it never
refuses. **First, a probe batch** (on Kyler's YES, from the probe folder): 512×512, 128×512, 64×512 and 512×256 maps
loaded in the game, their water checked against our model, the practical limits
reported. PLAN §20 D357 has the whole decision.

- **The batch is ready:** the probe group `Sizes` (`investigation/probe/README.md`), with 256×256 and 399×399 as
  references. Our file writer and both validators' other load checks handle every size and shape already.
- **Our code's limits today,** all to lift when the feature is built: the MapSpec schema (48–256 a side,
  `src/core/spec/mapspec.schema.json`) and `MIN_SIDE`/`MAX_SIDE` (`src/core/spec/mapspec.ts`), which the generator,
  share links (`src/core/spec/codec.ts`) and the size boxes (`src/ui/SettingsPanel.tsx`) use; the load check
  `file.size` (4–256) in both validators (`src/core/validate/checks.ts`, `prototype/validate.py`); and FORMAT.md's
  "4–256 per axis".

## The dam sketch tool (D383)

At the end of step 1, after the Weather view (it needs the Rust water and "The page is the editor"). The player draws a
wall of any shape and height under the game's dam, levee and floodgate rules; the reservoir fills behind it, simulated
with the game-exact water; the tool shows the water held, the days of drought covered, the tiles needed and what it
floods. Nothing is suggested or guessed, and nothing is saved unless real objects are placed. Later, on the same engine:
the reservoir finder (each basin's storable water and the exact tiles to wall, every candidate checked by simulation),
replacing D287's guessed dam sites.

**Round 3** (#279, `investigation/dam-sketch-3`, 446c641a): the headless engine on the Rust water, parked until its adoption
after the Weather view. Two doubts to settle at adoption: "two stacked dams" holds exactly what one dam holds (18.207 m³, the
same dry-out day), and every wall change restarts the worker instead of cancelling inside it. Its patch to `rust/water` needs
reconciling with multi-core water (#281) and water speed (`investigation/water-speed`).

The engine (`investigation/dam-sketch`, #159) is merged as an investigation, not adopted (D392). Adopting it needs one
gate: a calibration probe batch on the dedicated machine: a few sketched walls (a dam, a levee, a floodgate, a stacked
wall) built in the game, comparing level, volume and dry-out day with the engine. Its Node numbers
(first preview 16 / 67 ms, full fill 0.67 / 2.94 s, under shared load) support a progressive fill, not an instant answer.

**Round 2** (#166, D403): merged as an investigation, not adopted; no round 3 before the release. When it resumes,
its stacked-dams scene (which predicts dry) is fixed first, and its calibration needs a Probe wall-building bridge.

## Collaborative editing (D349)

**The brief: [docs/COLLAB-BRIEF.md](docs/COLLAB-BRIEF.md) (D362, 2026-10-01).** It is what gets built. After the polish
(step 3 of D349's order); nothing is built before then. Two players edit one map live, sharing one ordered list of
operations; each browser rebuilds the map from it, so both see identical terrain and water (every change is a deterministic
operation, D158, D342).

- **Always through a relay, joined with a short room code** (D431, amends D362): every session goes through a managed TURN
  relay (Cloudflare Realtime TURN the candidate), with no direct peer-to-peer path; the relay sees only encrypted traffic.
  The host's **Invite** gives a short room code; the guest types or pastes it. A small serverless function (a Cloudflare
  Worker the candidate) hands out short-lived relay credentials and passes the connection setup, never carries map data and
  keeps nothing once connected. Codes are short-lived and single-use. If the relay or function is down, collaboration is
  unavailable and the page says so plainly; editing alone is unaffected. One player hosts and keeps the order of operations.
- **Open questions for when it starts:** undo with two people, and presence (the other player's cursor, tool and intended
  action).
- **Findings from Codex's spike** (`investigation/collab-spike`, #109): the two-code join worked (324-character codes; superseded by D431, as are the short-codes findings, #150); the
  maps stayed identical over 523 mixed edits; rejoining sends the host's current map plus the edits since, never a replay of
  the whole history; forces are ordered as gestures with their seeds and computed by each browser on the agreed map, never
  sent as precomputed results (a result worked out on an older map goes stale). Still unverified: connections across
  different networks over the internet (Kyler tests it himself).
- **Planned: area locks** (Kyler, 2026-09-30; to settle in the design Q&A). Each player can reserve parts of the map (for
  example half each), so the other player's operations can't change them. Open questions: locks protect land and objects
  from the other player's edits, but water still flows across borders as physics dictates; a force whose effect would reach
  into the other's area (a Carve drawn through both, an eruption near the line); how areas are claimed (drawn with Select's
  shapes), shown (a tint in each player's colour), released or offered to the other; and the default (the whole map shared
  until someone claims an area).

---

## Later

**A Rift force** (Kyler, 2026-09-29, from the forces sitting; D344): land cracking open and dropping, a rift valley or a fissure going down, the opposite of Erupt's ridge. Codex builds a demo on `investigation/rift` (from `feature/forces`, a PR into `dev`): held for Kyler's look when green, as Erode was; on his yes only Codex's own commits merge as an investigation (as #90 did); adoption onto the forces row after the forces release, scheduled with Kyler (2026-09-30).

**A Deposit force** (Kyler, 2026-09-30): an alluvial fan at a valley's mouth, its material taken from upstream.

Codex builds Deposit's demo on its own investigation branch (from `feature/forces`, a PR into `dev`): each held for Kyler's look when green, as the Rift was; on his yes only Codex's own commits merge as an investigation; adoption onto the forces row after the forces release, scheduled with Kyler.

The Rift and Deposit's core half is adopted in Rust (#268, #273: `rust/forces`, `core/forces/rift.ts` and `deposit.ts`, operations and checks); the page adds their controls and effects next.

**Difficulty through terrain, its own design** (Kyler, 2026-09-27; D276, deferred out of M9b).
PERFECT's Challenge section (a harder map makes trees, easy land and easy dam sites hard to come by
early, through interesting terrain; Hard slows expansion and never starves the start; the puzzle
pays off) is not part of M9b's five outcomes. It needs a design step of its own, the way M9 did
(D108, D109); the starting-logs floor and the start's guards stay exactly as they are until then.
`docs/archive/m9-design.md` §11's "difficulty as positions on the axes" is one proposal for it to consider.

**Versioned deploys and mobile layouts** (Kyler, 2026-09-27; D285 (1), moved out of M13): versioned
deploys at `/v/<version>/`, so an old-version link reproduces its file; and a mobile layout for the
generator page and the Real places gallery (the editor stays desktop-first, D185).

**The build time-lapse** (Kyler, 2026-09-26; PLAN §20 D205, moved out of M13 by D285 (4)): replay a
map's edit history at speed from the generated map, with a camera that glides to each edit, and save
it as a WebM video to share. The history is already a list of operations that replay exactly
(D158), so this reads it; it adds nothing to the editor's screen until used. Blocking, when built:
the replay matches the map exactly at its end; the page never freezes while recording.

**Later, proposed: a companion mod for one-click play** (Kyler, 2026-09-25; D163). A small mod
that lists newly saved Dam Good Maps maps in the game's main menu and starts one in one click,
building on what the DGM Probe mod already does to open a map. For Kyler's approval before it's
built.

**After M12: a Dam Good Maps MCP server** (Kyler, 2026-09-25; D141). M12's tools (generate, steer
with intentions, the forces, edit, validate, export) packaged as an MCP server, so Claude
Desktop, claude.ai or other MCP-capable assistants can build Timberborn maps with the same engine,
tools and steering principle as the app. A thin wrapper over M12's tool layer that inherits the
same honesty and "steer, don't hand-build" rules.

Each item below stays behind a feature flag until its own in-game check passes:
- seeps and an arid theme;
- aquifers;
- unstable cores out of Advanced;
- share links that carry small edit lists;
- flood challenges: 4 workshop maps start flooded or in a badwater sea; they need a challenge
  profile that relaxes `start.dry` and `water.no_flood`, with a warning.

No longer planned: touch support (the editor is desktop-first, D185; pen pressure on drawing
tablets came with Live editing); "make editable" detection for imported maps (the brushes edit
any map as it is, D182); and a shared online stamp gallery (D253 removed stamps).
