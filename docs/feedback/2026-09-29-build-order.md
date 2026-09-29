# Kyler's build order for the forces-preview feedback (2026-09-29)

Kyler's build order for `docs/feedback/2026-09-28-forces-preview.md`, recorded word for word. It lifts the hold of the
same morning. PLAN §20 records it as D321–D326, one decision per batch.

---

For the milestone session (Kyler, 2026-09-29): the build order for my forces-preview feedback (docs/feedback/2026-09-28-forces-preview.md). This lifts the hold. Apply the standing rule (D316) throughout: short reports, real checks, nothing ceremonial. Before building any item, check what its branch already has, and extend it rather than rebuild it.

THIS MACHINE, THE NEXT THREE DAYS
This PC (Ryzen 9800X3D, 8 cores, 16 threads) is the machine until the dedicated one is back. I'll use it on and off, mostly to play Timberborn.
- All batches run in parallel: 1, 2, 3 and 5 from the start, with 4 and 6 beside them.
- Heavy jobs (M9b's generation batches, full suites, capture runs) run at normal priority and don't pause for me.
- Share the threads: set each job's workers and threads so the jobs running at once don't oversubscribe the 16.
- Probe batches only with my yes each time, and never while Timberborn is running.

RECORD
Record one D-number per batch, citing the item numbers; the feedback file keeps my words, so don't retype them into PLAN. Also record these answers:
- Flatten has no Ramped option: it's the game editor's absolute, hard-edged flatten, and walkable edges come from the shelf's Slope (amends D204, D270(3)).
- Precise is removed (item 37; retires item 8 and D193's hold-to-dig).
- Water shades: option (a) (settles D310).
- Items 24's and 47's numbers are computed in M9b but shown only in "The page is the editor", not in today's editor or card.
- Item 34 converts existing files rather than adding parallel ones (batch 6).
- Items 5, 10 and 28 apply in both looks (amends D242/D284's "Standard stays exactly as it is").
- Item 44 amends item 1 and D288 (the start can be deleted).
- Item 41 replaces the aim arrow and D312's waypoints.
- Item 29 amends D266.
- Item 22 amends D278 (1a): the first candidate that passes is the map and is never swapped.
Mark every amended decision as amended.

BATCH 1, THE FORCES (build, Opus 5.5 high, feature/forces)
Items 7, 13, 14, 17, 18, 25, 29, 30, 40, 41. In this order:
1. Items 29 and 30 as one rework of how a force's result is applied and animated.
2. Item 40 on the forces core, absorbing Erode round 6's Floor so there is one implementation.
3. Item 7.
4. Items 41 and 13: one shared freehand-path piece, lifted from Erode's sweep and replacing src/editor/waypoints.ts and the aim arrow.
5. Carve's 17, 25 and 18.
6. Erupt's 14.
Also item 27's check wherever a force places sources at an edge (Carve's source row, Glaciate's meltwater): the water flows into the map, never straight off it, using M9b's edge lip once batch 5 makes it callable. Item 25 is here, not on build-light, because it shares 17's panel. On item 18, the river's normal surface must sit just below the bank top so the banks never become a standing thin sheet. Erode and Spring get items 29 and 40 only through the core; nothing is built for them now.

BATCH 2, THE BRUSHES (build, Opus 5.5 high, its own worktree off feature/forces)
Item 15 first (31's Clear uses its fix), then 37, 2, 31 and 42. The stroke record changes once, for target, mode and sources, and old strokes replay exactly (D158). F-drag resize already exists (D205); item 37 adds the size readout. Shift+scroll currently sets a source's strength (D196): move it as item 37 allows and tell me where. Items 31 and 42 are here, not on build-light, because they share the stroke pipeline.

BATCH 3, SELECT, DELETE, SHELF, SHORTCUTS (build-light, Sonnet 5.5; its own worktree off feature/forces)
Items 11 with 32, 12, 1, 44, 6, 43, 16, 46, 20, then 9 last (structure only; the design pass styles it).
- This batch is D318(2)'s medium trial: say in one line whether medium matched high.
- It owns the key map. After batches 1 and 2 land, it updates the shortcuts reference and first-run hints once for everything.
- Merge into feature/forces in the order 3, 2, 1.
When all three are in, deploy the preview from feature/forces and send me one checklist for one sitting.

BATCH 4, THE LOOK (build-light, feature/high-look)
D310 option (a): darken the mine pit's earth a little, then badwater, then bring the clean shallows toward the game, keeping every readability rule. Then items 5, 10, 4 (with D231's three leftover foam issues) and 28, then badwater's calibration re-measured once. Item 3's verdict waits for my High look sitting.

BATCH 5, M9b (m9b-build, Opus 5.5 xhigh, feature/m9b)
The re-pin stays paused until every map-changing item is in; then one re-pin (D308). In this order:

1. The height budget, as one change: item 47's base raise (the deepest riverbed at least 3 levels above the map's floor) together with item 36 (Verticality 100 against Highest terrain, 22 where tall maps are allowed; wild but readable). It moves every map, so it goes first.

2. The trees and the start (item 26 and item 47's must-haves):
   - Item 26's main cause is the generator's own: resources.ts baseGroves plants the tree budget beyond a quarter of the moist land as dead groves on dry ground, to match the official maps' tree counts. Count only living trees toward the budget; dead trees stay rare and deliberate (a small drought-killed grove as a feature, or the start's fallback where truly needed). Re-base the "official amounts" resources measure and its test (the 0.5225 one) as a decision change (D148), never a weaker line. Report dead trees per theme as counts before and after, nothing more.
   - Item 47: mine sites at least 2 and reachable (the mineSites setting's minimum rises to 2; old links are normalised as 0 → 1 is today); berries enough for an Iron Teeth start; "no stairs" and enough level land at the start, using the starting-logs floor's walk, the same walk item 24's number uses (computed once).
   - Item 47's new intention is secondDistrict and obstaclePayoff combined (a district site behind a small early obstacle), not a new builder. Propose how close "close to the start" is, against secondDistrict's 60–120 tiles.
   - Badwater containment: measure with the existing cycle check (land reached per theme); fix only what it shows.

3. Item 27: the inflow edge lip and the mouth row already exist. Count M9b maps losing water off the map at a river's head, fix what remains, and make the lip callable for batch 1's forces and for Real places when it resumes (D319). Skip the M9a before-and-after count.

4. Candidates and speed (items 22 and 21):
   - The first candidate that meets the three outcomes is the map, shown at once and never swapped. Later passing candidates are kept as siblings for item 22's strip; More makes further siblings with the existing sibling logic.
   - Keep today's "Another like this" button until the strip exists in "The page is the editor".
   - Then fix the commonest failure reasons (the progress doc's are the starting point), run the remaining candidates in parallel within a memory cap, and show the land before the water fills in. A per-phase time breakdown only where a fix needs it. Propose targets to me from the numbers at 128² and 256².

5. The one re-pin: the progress doc's ten tests plus whatever these changes move, logged under "Tests updated" (D148).

6. Items 24's and 47's numbers as data only (the five levers and trees within walking reach); no display until "The page is the editor".

7. The release candidate: contact sheet, batches, chaos batch, then the pooled probe batch on my yes (never while Timberborn runs), then the review set.

Real places' parts of items 27 and 47 wait with D319.

BATCH 6, DOCUMENTS (routine, Sonnet 5.5 medium)
Now:
- item 33;
- item 23's short document of open design questions and known constraints for the UI round, including what these batches change. Tell me when it's ready.
At the forces release boundary, item 34, converted rather than added:
- STATUS §7's workstream table moves out to become docs/WORK.md, with claim-before-starting added;
- the progress docs' top notes become the hand-back notes, in a fixed short format;
- STATUS shrinks to its short summary, and its "Decisions since M8" section goes (PLAN §20 holds them);
- PLAN §20 splits one file per decision in the same pass as item 33's statuses;
- tests are renamed as the specification only when touched.

HELD
- #74 (Erode): don't merge; round 7 (roofs) is with Codex.
- Real places (D319).
- Items 19 and 45: later.

Log this in the Progress log in one line, and report as each batch lands.
