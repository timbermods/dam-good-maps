# Editor decisions

These are the decisions in force, by topic, one file per topic. Every decision as recorded, with its reasons, date and amendments, is in [docs/archive/decisions.md](../archive/decisions.md); a number missing here is superseded or completed there.
A decision gets a number only when it is a rule that constrains future work (D470); model choices, which session does what and Kyler's verdict on one round go in STATUS or the Progress log, unnumbered. New decisions are written once, into their topic file, with the next free number (D529; only the milestone session hands out numbers) and a line added to this index; they move to the archive when superseded or completed.

Read this index, then [how-we-work.md](how-we-work.md), then only the topic files your task touches.

## [How we work (sessions, models, reviews, documents, merging, releases)](how-we-work.md)

- D526: A look or interaction change holds until planning has judged its sheet; no separate look agent
- D490: A session merges its own PR after a fresh reviewer approves it
- D489: Merge on review and quick checks; the full suites run on dev after the merge
- D488: The next three weeks: showcase-quality maps (amends D485's order)
- D485: The dam sketch out of the order
- D484: Claude completes the project without Kyler; only design-direction questions reach him
- D478: Page captures: only the latest checkpoint in docs/design
- D477: /preview/ always holds the page editor
- D470: Coordination, labels, the line, pings
- D468: Page session on Opus 5.5
- D460: Dependabot majors after M9b
- D454: No excess checks
- D115: Kyler's one rule, lighter process
- D117: The probe rule
- D218: Probe batches on the dedicated machine without asking
- D483: What a probe batch plays
- D148: Stale tests follow decisions
- D341: Green before merging
- D144: Contact sheet per step
- D150: Dependency updates
- D195: Investigations and large results
- D390: The hard document prune
- D188: Docs are part of done
- D221: Progress log and pinging Kyler
- D316: Compute and effort rule
- D301: The model plan
- D388: Two sessions, milestone and page
- D461: Coherence review session
- D462: Coherence review's eight decisions
- D463: Coherence cleanup as PRs
- D395: Page editor rebuilt fresh
- D396: The /preview/ slot
- D398: Renderer session for moving water
- D415: Renderer PR merges on Kyler's yes
- D436: Merge of #165
- D446: Moving water and Flow view adopted (amended: the foam in the Flow view alone, D497)
- D342: Editor architecture for M12
- D443: Renaming a map is not an operation
- D351: A tooltip on every control
- D450: Official-range tooltips
- D12: Site, Pages and CI
- D349: The order of work (amended by D481)
- D481: 3D Foundations starts ahead of the Weather view
- D283: Cut from the roadmap
- D225: What perfect means
- D379: AGPL licence
- D467: Decisions live by topic

## [The product and its principles](product.md)

- D108: Maps are created, not copied
- D111: No built dam walls
- D512: D111 reads as its check reads: a thick wandering ridge with a gorge, and rock sills, are landforms
- D151: No raised edge walls
- D13: Difficulty mismatch warned (superseded)
- D449: Designed for removed
- D161: The north-star player journey
- D5: One start, no symmetry
- D185: Desktop-first editor
- D208: Themes are optional leanings
- D200: Metal and badwater on every map

## [Core, files and validation](core.md)

- D499: ruins.fields is a target for generated ruins
- D491: Objects may stand in caves where the game allows them
- D475: No old-project compatibility until launch
- D455: Byte-exact reopening
- D456: Undo after reopen takes a whole step
- D1: Shared foundations, features first
- D15: Deterministic maths and schemas
- D36: Import normalization
- D35: Operation envelope
- D38: Entity edits in two passes
- D3: Validation classes and profiles
- D482: Slopes connect warns on imports, blocks on generated maps
- D57: Badwater contained check
- D75: Extras placement check
- D69: Map objects as features
- D190: Candidate intentions
- D8: Claude bridge and artifact edition

## [The generator](generator.md)

- D545: The start is picked for the level room it has, never at the cost of an Easy row: the places with Easy's room that keep the rows the pick before would keep, else those with at least its room, worth weighing the draw
- D547: Above 128² the land is drawn in rings: landforms at the map's scale, a plan of the land, nothing fine in the snap, slopes for a ringed land, bold walls for Highlands and Canyon; Lake Basin and Islands stay on 0.10.48's land; Highlands stands up (round 6): a few walled mesas on a gentle floor, the valley sunk in the middle; round 6b step 5: no badwater in the valley or the start's view, the channel winding, the notches gullies
- D544: No level's edge runs ruler-straight over a dozen tiles: the graded levels are read through a fine warp before rounding, the water's field left as it is
- D534: No course runs beside another: it joins the one it would run beside; Delta's arms step diagonally
- D543: An arch over a gorge is looked for along the heading its gorge runs at the crossing, a diagonal too; a course but the main river deep under a wall for half its gorge's wavelength winds as a gorge, unless on a Canyon land it cost the promise
- D539: A start spring's settle ends where it plainly won't settle; the spring is refused as the limit refuses it
- D542: A gorge (cut 3 levels or more at its water) winds at its map's scale under 128²: its meander's wavelength and taper by the narrower side's ratio to 128, never under half
- D536: The badwater ditch takes a gully's shape: down its fall line, wandering, 1 to 3 wide, stepped banks, at most 40 tiles, ending in water D476 and D498 let it join, at another gully, or at the edge last; a land with no gully site takes the ditch as before
- D533: The sea steps keep the sea below a course's last edge: an inflow's own edge is never lowered under the water standing on its course
- D540: A premise's plates are turned off the grid and their rims ragged by noise at every size; D518's 128² cap is gone
- D532: A course's water leaves only by its own way: pools only inside banks that hold them, never a raised lip; nothing beside a course lowered under its water; Delta courses join the fan by plan; no channel left under its reach downstream
- D527: Every move of a generator control changes the next map, or the control is greyed with its reason
- D520: The reach rule: a crossing between two bends under 5 wide is a ruled reach past five times its width; every other straight stretch, wider water and lakes at 12 rows
- D519: A premise map's moist floor falls as the map grows: 30 % at 128², 25 % at 192², 20 % at 256²
- D518: Contour edges and Canyon's side canyons: the levels' edges on warped contours, no one-level step straight over 8 tiles, ruin fields along the land, rises in nested rings, the premise plates turned and bent; Canyon's side canyons cut 3 levels by the wash pass (amended: Real places' ruin fields too, D535)
- D517: Dry washes and an old bed: one or two long winding dry channels a map where rain would run, with branches and fords, ending at water, in a dry hollow, or behind a lake's lip; none in the start's ground, no reach lost
- D516: Dead stands on the dry land: a floor of 28 per 1,000 dry tiles (the aim about 40) in a few old woods where forest was, pine and birch by the site, none in the start's walk
- D515: The start's floors are the map's, in one gate: a bench, walkable land, fast wood and a forester's plot
- D513: A premise map: no wading, squares only, one Probe run on clearing a Blockage before the ladder
- D511: Easy start is not offered with the lake stair until a variant keeps its promise
- D510: A premise's landmark fall is 6 or 7 levels
- D509: The themes stay Generate's default until three premises pass judging in the game
- D508: A library of premises: a problem with many structures, green judged by the ladder, wood by budget
- D507: The start frames the map: among starts that keep the rules, the one whose opening frame shows the most map
- D506: Showcase ranks by the opening picture's looks as well as the arc
- D504: Green over the whole 256² map: springs toward the land the soil's moisture leaves bare
- D503: 3D forms that read: arches seen through, overhangs two deep, on most themes
- D502: A landmark in the opening view on the default Generate
- D498: Badwater joins the main water's lower reach, never its signature water
- D495: Easy start: a calm, generous start, guaranteed (amends D211 for this setting)
- D493: The opening shot: the start turned so the game's first camera frames the landmark
- D480: The water story's reach counts the main water
- D476: Badwater joins the main water
- D471: Every setting makes a map
- D541: A map narrower than 96, under 128² of area, is drawn at its own scale from the first round; Highlands from the eighth (amends D471)
- D469: Badwater mixes with clean water
- D458: Lake Basin round 2 adopted
- D464: Lake Basin always reads as one
- D466: Settings experiments expected failures
- D85: Start requirements
- D224: Starting-logs floor
- D167: Resources like official maps
- D171: Sources start rivers
- D59: What the settings mean
- D26: Channel width
- D47: Set-piece builders
- D273: M9b's five outcomes
- D138: Intentions, maps feel authored
- D278: Candidate choice and speed
- D530: A land flooded by its own planned water is drawn again at the land stage; the river channel cut is deferred (D453)
- D363: Mine-site pads levelled
- D307: Floodplain floods
- D405: Small starts' hidden land
- D406: No worn way out
- D407: Islands and Delta block release
- D408: Islands and Delta templates retired
- D409: Islands' water cap
- D410: Island sea layouts return
- D411: Island start on any island
- D412: Delta upland and channels
- D416: Delta shape accepted
- D447: Delta water miss blocks release
- D417: Islands needs another round
- D423: Inland sea at most one in four
- D426: Safe layouts plus grown island
- D427: Grown-island sheet not accepted
- D428: Island start walkable tiles
- D429: Island start not required
- D430: Islands releases safe version
- D432: Islands release as it is
- D433: Islands at 96² known shortfall

## [Water](water.md)

- D494: Remove unfed water on caves works on columns
- D472: No drought or badtide on the map card
- D457: Imported map's water kept
- D27: The canonical settle
- D120: One water model, stacked columns
- D350: Water that won't settle
- D99: The editor's water (its warm start amended by D538)
- D538: A wet tile beside an edit keeps its water and momentum in the preview's warm start (amends D99)
- D98: Approximate water on imports
- D133: Weather: Drought and Badtide

## [The editor and its tools](editor.md)

- D505: The time-lapse's camera is the video's, never the player's
- D492: Toggling top-down keeps the zoom and the spot being looked at
- D487: The brushes on caves and overhangs: the top run only, nothing left that would fall (amended: the forces leave the roof-holding ground)
- D459: Naturalize sound
- D158: Live editing
- D182: The brush kit
- D399: Naturalize land algorithm
- D404: Trees follow moisture after edits
- D425: No edit adds an object
- D479: Naturalize rule 5, scree at a cliff's foot (amended: new strokes record rule 6, D514)
- D514: Naturalize rule 6, a repeated stroke converges
- D418: Naturalize keeps wet ground
- D419: Naturalize weathered dab by dab
- D422: Naturalize in the worker
- D424: Naturalize round 4 accepted
- D184: Controls
- D265: Camera moves only when moved
- D347: Hover readout
- D249: Sources (amended: the upwelling with Markers only, D497)
- D337: Parity with game's fluid tools
- D259: Select and the working area
- D340: Crop map to selection
- D394: Fill on retained water
- D413: Sealed evaporating basin settled
- D235: The shelf
- D330: The page is the editor
- D240: The editor feels alive
- D205: Minimap and more

## [The forces](forces.md)

- D531: The forces' last step never drops ground the force only brushed down its cliff: a tile it would drop goes with the ground beside it within two levels
- D500: A Carve with a Depth keeps its channel falling, or is refused
- D474: Forces can clear sources
- D473: Carve's aging setting removed
- D257: The forces
- D258: Clean, magic gestures
- D344: Pace and animation
- D199: Carve
- D202: Craterize
- D352: The forces row's order
- D378: Forces and High look follow-ups

## [The look](look.md)

- D497: Terrain is lit as the game lights it (amends D280 (2), D135)
- D496: Badwater's colour follows the game (amends D154)
- D135: The 3D view's look (amended: no mist or splash rings at falls)
- D154: Contaminated ground layer (amended: falls as the game draws them, D201; as the water below's slope, 2026-11-08; the water's depth along the view, 2026-11-09; thin water as water, no film, 2026-11-09)
- D178: Mine sites and ruins models
- D114: Readability rules

## [Real places and Pick a place](real-places.md)

- D136: Real places gallery (amended: names without "Near", D522)
- D245: Real places kept on their land
- D420: No map keeps unfed water
- D421: Gallery hides unfed starts (amended)
- D445: Gallery shows every place
- D535: Real places' ruins lie along the land, laid as the generator lays its own (with D518)
- D521: Real places built under the game's water rules (D311's conversion carried out)
- D522: Real places' names without "Near", in the id and link too (amends D136)
- D537: Real places' films by share, mended after the springs' search or the place keeps its build; one spring where no real water lies; springs gone together
- D166: Pick a place

## [3D terrain](3d-terrain.md)

- D118: Real 3D terrain is essential
- D280: Four steps of 3D terrain
- D132: Verticality setting

## [Performance and the Rust order](performance-rust.md)

- D33: Budgets
- D435: Smoothness gate
- D381: The Rust order
- D391: Rust analysis adopted
- D393: Firefox re-timing (dropped)
- D400: Rust forces
- D437: Rust forces identity corpus
- D438: New forces built in Rust
- D444: New Rust forces' loop and check
- D465: Rust checks port
- D448: Stacked-column water engine
- D401: Portable maths
- D439: No multi-hour measurement runs
- D440: Firefox correct, not fast
- D441: Speed re-timing gates dropped
- D452: TypeScript water deletion and spike.spec
- D442: Rust adoptions order
- D402: Rust threads parked
- D366: Cross-browser determinism
- D367: Startup, maps open fast
- D397: Startup part 2 split
- D453: Timing and measurement work cut

## [Collaboration](collaboration.md)

- D486: Collaborative editing ships complete, between real peers
- D362: Collaborative editing
- D431: Managed TURN relay

## [Claude (M12, deferred)](claude.md)

- D501: The MCP server comes ahead of M12
- D84: M12 compound requests
- D139: Claude steers the generator
- D277: All M12 work deferred

## [Future and deferred](future.md)

- D357: Custom map sizes
- D383: Dam sketch tool
- D392: Dam sketch engine
- D403: Dam sketch round 2
- D285: Later: build time-lapse
