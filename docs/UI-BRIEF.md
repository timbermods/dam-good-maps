# UI brief: The page is the editor

Kyler's decisions, 2026-09-29. One workspace is a core part of Dam Good Maps' identity: generation, editing and sculpting are seamless.

> Recorded as [PLAN.md §20](../PLAN.md#20-editor-decisions) D330, from Kyler's question-and-answer round on
> [UI-QUESTIONS.md](UI-QUESTIONS.md) (feedback item 23). Approved by Kyler on 2026-09-29; built right after the forces' release.

## 1. One workspace
One window for everything. The map fills it from the first visit. There is no separate editor, no expand button, no full-screen mode and no "Refine this map" step. The keys are the same everywhere; Esc means what it means today; keys are ignored while typing in a field. Phones are view-only (D185): the map, the panel and Your maps to browse, with no editing.

## 2. The rule
The panel is the map; the rows are the land. Everything about the map as a whole (choosing, comparing, keeping) lives in the side panel. Everything you do to the terrain lives in the rows over the map.

## 3. The side panel
Collapsible to a thin strip. Open on the first visit, then remembers how it was left. Top to bottom:
- **A switch: Generate · Real places · Pick a place.** Each shows its own controls here: the generator's settings with the Generate button; the Real places gallery with its search; Pick a place's search and framing square once it's built. A real place opens exactly like a generated map. The separate gallery page goes.
- **The candidates strip** (generated maps only; see §5).
- **The map card**, in four parts, nothing in it needing a scrollbar or a second glance: (1) the name; (2) one "how it plays" line; (3) the legend as one row of small icons with counts, only for what's on this map (water sources, badwater, mine sites, ruins, berries, trees and so on): hovering an icon names it and highlights those things on the land, clicking pins the highlight; (4) the numbers, compact on one line: trees within walking reach (with logs) and the five difficulty levers as small marks, with detail on hover. A real place's card carries its name, signature and credits instead of a seed. The collapsed Legend button and its first-visit hint go.
- **Your maps** (D234): recent and starred edited maps.

## 4. The rows and Save
- The rows over the map, top to bottom: the view bar; the tools (Raise, Lower, Flatten, Smooth, Naturalize, Select, and the Block tool at 3D step 3: the rows follow how a tool feels to use, D335); the forces (in three clusters by prominence, D352: Carve, Craterize, Erupt · Rift, Quake, Glaciate · Erode, Deposit; Erode joins them at 3D step 3); the active tool's settings with More. Where they sit and how they look is the design pass's, with one placement fixed by Kyler (D345, B3, 2026-09-29): **the level control (▾ ∞ ▴) sits at the top right, beside the compass, larger and easier to see, as in Timberborn's own editor, with Slow forces and Sound (a speaker icon, crossed out when muted) in a row under it** (they were in the view bar; Slow forces was called Watch until D361). A long settings row takes a second line, and a tool's More opens as a compact grid panel (D345, B2).
- **Save to Timberborn** is a primary button at the workspace's top-right, always visible whether the panel is open or collapsed, with the checks dot right beside it (its one-click fixes there). Download .timber and the project file are in the ⋯ menu.

## 5. Speed first
Time from Generate to an editable map matters more than choosing among candidates. Nothing ever makes the player wait for other candidates.
- The first candidate that passes the absolutes is shown at once, and is editable as soon as its land exists; the water fills in live, as after any edit (D158). If a check that needs settled water fails a moment later, it is fixed automatically (for example, a spring placed), never by replacing the map under the player's hands.
- If that map misses one of the three outcomes, the search continues quietly in the background, never slowing the editor. The first candidate meeting all three goes into the strip, never swapped in. A short notification only where the miss is relevant, naming what the new version has ("A version with its sea is ready"). Rare, never nagging.
- The strip is otherwise empty. More makes further versions in the background while the player keeps editing; they appear as they finish.
- Generate runs only when the Generate button is pressed (or Enter in the panel). A settings change never regenerates. The button shows a small dot when the settings differ from the shown map's.

## 6. Replacing a map
One rule for Generate, a candidate, a real place and a Your maps entry, with no dialog, and it must be quick. An unedited map is simply replaced. An edited one is already kept in Your maps (saved in the background, never waited on); undo brings it back instantly, since it's held in memory; a quiet note for a few seconds: "<map name> is in Your maps. Undo to bring it back."

Edits never replay onto new land (Kyler, D336): every Generate makes a new map, at any size or setting, and never carries the shown map's edits over; the edited map stays exactly as it was, one step away. There is no "keep my edits" button. An older map opens exactly as it was saved, with no rebuild that keeps its edits. Replaying edits onto the same land stays as it is: undo and redo, reopening a saved project, share links.

## 7. The first visit
One of a handful of ready-made 128² maps, generated by the current generator and checked like any release, picked at random and loaded instantly, with no generation. The panel is open, with one quiet hint pointing at the tools; no tour. Every Generate after that runs live. Generate's default size is 128².

## 8. Sources: Placed · None
A setting in the panel's water section, carried in share links. None generates the map as usual, then removes every water and badwater source and its water, keeping the dry valleys, basins and pits they carved, so the player places sources to their own taste. Trees stay as generated. Item 47's water must-haves don't apply to it; the checks dot says "No water source" as information, and Save to Timberborn still works.
Real places too (D331): applied when a place loads, with no rebuild. None removes every water and badwater source and its water, including the water floor's spring (D300), keeping the real riverbeds and lake basins as dry valleys.

## 9. After it's built
Kyler's editor UI audit of the built page, then the design pass (D236), which decides placement, styling and anything this brief leaves open.
