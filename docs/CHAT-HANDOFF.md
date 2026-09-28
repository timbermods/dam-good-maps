# Chat handoff: how Kyler and his planning chat work
Read this first, then docs/PERFECT.md (the yardstick), docs/STATUS.md (its summary for Kyler), EDITOR_PLAN.md, PLAN.md §20 (every decision) and docs/HANDOFF.md, all from github.com/timbermods/dam-good-maps (public). Past planning chats are searchable: use them for detail on any decision.

## Roles
- Kyler decides everything; his eye is the final judge. It's a one-person passion project with no launch date: realising his vision matters more than speed (docs/PERFECT.md).
- The planning chat (claude.ai) is his advisor and reviewer: it reads the repo, branches, PRs and captures itself, gives brutally honest and specific feedback, and writes the exact prompts he sends elsewhere.
- The milestone session (Claude Code, Opus 5.5 at xhigh) runs on a dedicated, always-on computer with Timberborn installed. It's the only session that changes dev, merges and releases. It may run DGM Probe batches there without asking (D218); releases still need Kyler's approval. It logs each step in the "Progress log" issue (#57).
- Codex tasks (GPT-6 Astra at xhigh) build prototypes on their own investigation branches; the milestone session merges them as proposals.

## How the planning chat works
- Check-ins: git fetch the repo (all branches), read the summary at the top of docs/STATUS.md, the Progress log issue, recent commits and open PRs, and view captures with git show. Prefer git over the GitHub REST API, which rate-limits quickly from shared addresses.
- Be brutally honest and specific; say when something is fluff or overengineering; praise only what earns it. Kyler can't be sent images he can't see; look at captures before judging them.
- Code blocks are the exact text Kyler sends; prose is for him. Each prompt stands on its own and says where it goes. Never assume a prompt was sent until Kyler says "sent".
- Codex prompts start with HARD RULES: the authorization to push one named branch and open one PR; no merges, approvals, auto-merge, other branches, tags or releases; work only in its own folder; large generated results out of git; original or clearly licensed assets only (nothing from the game's files); a git diff check before the PR; "don't wait for my replies". Each new Codex branch gets an adoption note for the milestone session.
- Kyler batches hands-on reviews into single sittings: collect what's ready on the preview and give him one checklist.
- Models: Codex on Astra at xhigh; Claude builds on Opus 5.5 (xhigh for the hardest, high otherwise; the main session ideally at high); Sonnet 5 at medium for routine work.

## Kyler's principles and taste
docs/PERFECT.md is the yardstick. In short: maps designed by nature, genuinely varied, with character, inviting building, and playing exactly right; water is the heart (the result of sources and land, what you see is what you get); the editor is a painter's studio (the land is the interface, few tools, things just work, simpler is better, nothing ruler-straight or stamped); the forces pass the magic bar; challenge comes from terrain, never starving the start. Trust his eye over numbers; match the game where players have muscle memory; no hand-holding.

## State at handoff (2026-09-27, evening)

### 1. Decisions since D244
- **D244**: one height ceiling in the editor, on every map; a map becomes "tall" by its height, not by a choice, and is validated and exported accordingly.
- **D245, D271, D272, D300, D306, D314(3)**: Real places' rules settled in stages. A place keeps its own land; only correctness and the starting-logs floor gate it; everyday advisories get no note (D245). The D245 sheet's drops are listed, and a place's water follows the real place instead of the conversion's old choices (D271). Real places is a canvas to reimagine like any map (D272, a new PERFECT line). The rebuild lowers the bed under real water, takes out the overall tilt, and adds a water floor (a spring where a place has none); finished without another review sheet (D300). The rebuild is at 256², the signature centred and given the full height range (D306). The rebuild stays paused until the grouped-sources rule is wired into its conversion (D314(3)), then it's the one rebuild, with the badwater stage and release.
- **D246, D291, D292**: Glaciate, a new force that carves glacial valleys (D246). Its round 4 is pre-approved by conditions (D291) and, when those conditions were missed, merged as it is anyway, with its floor's water finished during adoption (D292).
- **D247, D270(3)**: Smooth's "Make walkable" option is removed; Flatten's Ramped edges lay their own natural slopes instead (D270(3)).
- **D248**: Level lines moves from the brush options row to the view bar, beside Height colours.
- **D249**: brush changes and water sources: a Clear sources brush option, sources riding the ground under a brush stroke, easy targeting near a source, and Delete removing a targeted source.
- **D250**: Map look phase 3, "Finish the world", approved and adopted into the High look alongside #38, #65 and #66.
- **D251, D301**: every kind of work gets the model and effort meant for it. D251 set the first table (`m9a-build`, `m9-build`, `routine`, `build`); D301 replaces it with the standing model plan — Opus 5.5 xhigh where judgment is the product (M9b), Opus 5.5 high (`build`) for the forces, 3D and anything touching water or the generator, Sonnet 5 high (`build-light`) for building from a written spec, Sonnet 5 medium (`routine`) for recording and housekeeping, and background scripts for waiting. D301 is in force now.
- **D252, D282, D294**: M9 is the soul of the product, each stage judged by Kyler's eye against PERFECT before release (D252). Reframed: the editor is where the magic happens, the generator provides the canvas (D282). M9a is approved on its review set; M9b starts from that set's shortfalls (D294).
- **D253**: M10 and M11 are removed (symmetry, stamps, regenerate area, locks); Naturalize's own rules and the naturalness measurement stay as information.
- **D254, D259**: a working area was proposed (D254), then replaced: the Select tool's own selection is the working area, with a feathered edge and the forces treating locked land as unbreakable rock (D259).
- **D255, D306(4)**: Pick a place takes over the heightmap conversion from the removed M11, following Real places' keep-the-land rule; its framing square defaults to 256² (D306(4)).
- **D256**: M12 (Claude) works through whole-map generation and the forces for local change; it no longer locks or regrows areas.
- **D257**: the forces are bound only by nature (never refuse or reshape for playability); the editor makes the result compatible with a good start (the checks dot, one-click fixes, the start carried to safe ground).
- **D258, D312**: no force draws a predicted route or preview; every click mode is one click, Aim is a drag with a plain arrow (D258). The forces' sitting adds a size ring at the cursor and waypoints for Carve and Glaciate; Erupt's terrain finishes in about two seconds (D312).
- **D259, D261, D264**: Select gets its own button and more shapes, and is the working area (D259); its Same level becomes Wand, which also selects water (D261); Select all, Set level's three ways (Set, Cut down, Fill up) and Max water depth are added (D264).
- **D260**: water no source feeds recedes at once, and a removed source's marker disappears immediately, in line with "what you see is what you get".
- **D262, D278**: M9b runs at xhigh like M9a, on its own `m9b-build` definition (D262). M9c is removed; its useful parts (candidate choice by outcomes, names and descriptions, Another like this) fold into M9b (D278).
- **D263**: smart Lower's depth comes from strokes, not from holding the mouse; new channels are about one tile deep, a deepening pass lowers a bed by exactly one level.
- **D265**: the camera never moves by itself, anywhere (accessibility, not preference); Follow and every automatic camera motion are removed.
- **D266**: every force plays at its own designed pace, regardless of the water's speed setting.
- **D267, D268, D269, D307**: Drought and Badtide become a day-by-day view with a day strip, folding in the Weather view (D267); Speed moves to belong only to the day strip (D268); an edit ends the hazard view instead of updating it live (D269); a floodplain that floods after a drought or badtide is correct, and the day strip's hover says so (D307).
- **D270**: Kyler's answers to a batch of pending defaults, including Ramped's own slopes (3) and accepting #87–#93 as they stood.
- **D273–D277, D278**: M9b is rewritten around five outcomes judged by Kyler's eye — readable water, themes keeping their promise, every map having a character, any handful differing, nothing looking stamped, and chaos still meeting them (D273); its intentions set is picked from design version 2's candidates (D274); recipes fold into intentions and orientation variety comes from rotating/mirroring finished maps (D275); difficulty-through-terrain is deferred, the rest of the plan kept (D276); all M12 preparation is deferred until M12 begins (D277, withdrawing D276's "keep M12 ready"); M9c is removed and folds into M9b (D278).
- **D279–D286**: the 3D terrain work. Full scope and testing against the game itself, with golden fixtures and no second Python water engine (D279); four steps — foundations, the view, creating them, generation (D280); built on `build`, with the Erode investigation also on `build` to save Kyler's Codex allowance (D281); the editor-is-the-magic framing (D282, see above); the Map quality checkpoint, the Frame pass and most of the refinement phase are cut, folded into M9a/M9b or housekeeping (D283); the High look moves to right after the forces' release and becomes the default where it runs smoothly (D284); M13, the Weather step, Pick a place and the build time-lapse are slimmed, with some pieces moved to Later (D285); a temporary rule let more work run in parallel until Kyler's allowance reset, ended early by D301 (D286).
- **D287–D290**: a leaner view bar — Orbit/Top-down becomes one toggle, Dam sites and the Moisture/Drought views are removed (D287); the Remove tool is removed, Select plus Delete removes things (D288); every force's row becomes Power, Size, one signature choice, Try another (D289; amended by D309, see below); a badwater source never refuses for uneven ground, it cuts its own small spring pool instead (D290).
- **D293, D295, D297, D298, D303, D308, D311**: one water model everywhere, the game's own — added to the Python checker too once the stacked engine is wired in (D293); the 3D acceptance line allows thin-sheet flips within 0.01 of the wet line and 0.1% volume (D295, clarified by D297); the game's soil rules are adopted in M9b, not at 3D wiring (D298); the game's edge-spill rule is adopted everywhere (D303); the water, soil and edge-spill rule changes land together in M9b as one switch, with pooled probe batches and review sets only when Kyler's eye is needed (D308); the departure from D297's line on thin spreading sheets is accepted, checked against the game by the pooled probe (D311).
- **D294**: M9a is approved on its review set; M9b takes the set's shortfalls as its starting list.
- **D296**: the frame is styled once, in the design pass, not again with the High look adoption.
- **D299**: two small answers — the generator page keeps its own Moist soil switch until "The page is the editor"; Quake's Left/Right control stays gone (X flips the side).
- **D302**: M9a's release condition — the tall-maps reopen check clean, and no start relying on a sealed puddle alone; if any exist, the rule is fixed first.
- **D304, D305, D310**: Map look fixes — clean water's shades are fitted closer to the game's, approximately, from an in-game screenshot (D304); a ruin seen from afar reads as the same ruin (a darker, muted rust with a lattice pattern) (D305); clean water and badwater's floor are darkened together toward the game, restoring the readability tests D304 had loosened (D310).
- **D309**: the forces' detail controls come back behind a "More" button, each starting on Auto, with a way to pin a value.
- **D313**: Smooth gets a softer relative of Flatten's sound; sounds are checked for over-compression; default volume is about a quarter lower.
- **D314**: water sources come in rows and clusters, as the official maps do; a rule (`src/core/water/sourceGroups.ts`) applies everywhere sources are placed automatically — the generator, Real places, Carve's source, Glaciate's meltwater. **D314's answer: Unleash places no new sources, so it gets no row at its head** and carves from the source it was given; the row rule only applies where a tool places sources itself.
- **D315**: Select gains "Delete sources", clearing every source (and only sources) inside the selection, or the whole map with Ctrl+A.

### 2. What's live
`main` is at a4af2bb0 with M9a released as `m9a-done` (2026-09-27; release PR #80; generator 0.7.0; the deploy and live check passed), plus everything released before it. See docs/STATUS.md, "Released or merged", for the full list.

### 3. What's held for Kyler
- The forces sitting (`feature/forces` #77, the sounds branch #81, Glaciate on `feature/glaciate` #76); the preview is built from `feature/glaciate`.
- M9b (#70), judged by Kyler's eye (D252, D273).
- The High look (#75) and the water shades choice (D310: options (a)/(b)/(c); the session's pick is (a)).
- Drought and Badtide, day by day (#73).
- Erode (#74).
- Real places: the grouped-sources rule (D314) is now wired into its conversion (VERSION 11); the one rebuild stopped at the pause with 37 of 136 places done. It finishes on Tuesday and releases without another review sheet (D300).

### 4. What's next
See docs/HANDOFF.md §1 for the resume order and docs/STATUS.md §1 for everything waiting on Kyler. In short: get the forces sitting's changes onto the preview and tell Kyler; finish M9b's re-pin, then its release candidate (D308); finish Real places' one rebuild (99 places left), check it, and release it.
