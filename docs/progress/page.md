# The page session's progress

"The page is the editor" with the design pass (D330, D384, D388), on `feature/page`. Design decisions are in
[DESIGN.md](../../DESIGN.md); this file is the work. The milestone session folds both into PLAN when the page merges.

## Handoff to the page session that builds (written 2026-10-03, the prototype session's last act)

What the next session needs to build. History is in the log below and in DESIGN.md.

### 1. Kyler's verdict on v8 (2026-10-02 19:32 to 19:37): approved for the build

Seven changes, which go into the build, not another prototype round:

1. **Scale:** no scale-up at any size (`?ui=1.0`). Remove the temporary `?ui` parameter and the 1800px scale-up.
2. **The right-hand column is 13px wider** (Slow forces takes the width; every row keeps the shared left and right
   edges, the legend panel included), so "Contaminated ground" and "Contamination edge" fit on one line at the panel's
   present paddings.
3. **The Badwater caption is one short line:** "Badwater: dark brown · Contaminated soil: light brown".
4. **The legend's "Markers on:" heading is all one weight.**
5. **The map's name.** The drawer's "New map" heading becomes an editable name field for the current map. A rename
   shows at once in the header's centred title and is kept in Your maps (the core's rename); Save to Timberborn and
   the downloaded .timber file use it. A newly generated map starts with a default name Kyler can change. The New map
   button in the header keeps its name.
6. **Your maps at the foot of the drawer:** the maps Kyler has recently edited (the core's Your maps,
   `src/core/library/yourMaps.ts`), each row with the map's name and its size ("128×128"), newest first, the current
   map marked; clicking a row opens that map. The list fills the drawer's space below the card and scrolls inside it
   when longer. The size comes from a field the milestone session is adding to Your maps' entries on dev; until it
   lands, build the row with the name only and add the size once it's on dev. No stars, thumbnails or other extras
   unless Kyler asks; the core's star (which keeps a map past the last 30) is among the open questions below.
7. **The legend panel is as tall as its content,** with the same padding at its foot as at its top: no empty space
   below the last line. It never runs past one gap above the water bar; only when the content is taller than that
   does it stop there and scroll inside.

**Every change Kyler asked for across v6, v7 and v8** (all of them are in the build; a later ruling supersedes an
earlier one where they meet):

- **The rule (v7, 17:36):** wherever Kyler hasn't asked for a change, the current editor on dev wins: layout,
  spacing, sizes, colours, states. Where the brief or DESIGN.md's v4 system conflicts with the current editor's look,
  the current editor wins. Anything unasked that differs from dev is a bug to fix before pinging.
- **The page:** the generated map opens in the editor at once; no settings page, no Refine step (D330).
- **The header (v7, then v8):** a named **New map** button alone at the left edge, above the palette column; it opens
  and closes the drawer and shows selected while the drawer is open. At the window's exact horizontal centre the
  map's info in the editor's title type: the name, and under it "seed 4242 · 128×128" (an opened file shows its
  size; if saving in the browser fails, that line says so there). Nothing ever overlaps: a name too long for the
  space truncates with an ellipsis and its tooltip holds the full name. No brand mark and no "Dam Good Maps"
  anywhere (v8 reversed v7's centred brand). On the right Undo, Redo, the checks dot **with its words beside it**,
  Save to Timberborn (the only lit control), Look, and **File** in place of ⋯ (Open…, Save project, Download
  .timber, Clear everything, History, About). No icon-only control anywhere.
- **The palette:** exactly the current editor's: one continuous two-column grid, the current order, no breaks.
- **The toolbar:** the current editor's rows, buttons, padding and gaps; the forces keep their icon discs at the
  current spacing; the options row as current with "More ⌄" at its right end, never wrapping; selected and lit states
  in the current mint; **Flow** among the view layers (the renderer session's toggle, D353: beside Markers, off by
  default, stored like Markers, tooltip "Show the water's currents", calls `renderer.setFlow(on)`).
- **The right column (v8):** one exact right edge for the level row, Slow forces and Sound, Legend, the legend panel
  and the water bar; the column's left edge is Slow forces'. Row 1: the level control (▾ ∞ ▴) is exactly Slow
  forces' width and the compass exactly Sound's width (round, centred in it), the same gap between them as between
  Slow forces and Sound. Row 3: a named **Legend** button spanning the column, the same height, corner radius, solid
  dark background and type as Slow forces, the same vertical gap, lit in the mint while the legend is open (like
  Minimap), a tooltip under the rule (D351, D361, D368). The legend panel opens and closes only by that button (the
  open state remembered); it sits under the button with the same gap, on the button's edges; it lies over the map:
  nothing resizes, the map doesn't move, no control shifts, it never covers a control; its content keeps today's
  look (swatches, the Markers heading, a click shows the line on the map); plus the build's changes 2 and 7 above.
  Gone: the full-height docked legend, its vertical tab, and `showLegend={layer !== "none"}`; no view layer opens,
  folds or brings in the legend; toggling any layer moves nothing. Badwater keeps its own caption at the bottom
  left as the layer's explanation, never overlapping anything (change 3 gives its words).
- **The legend's names (v8):** every line a name on one line, nothing of what it does in the game: Moist ground ·
  Dry ground · Contaminated ground · Ground height · Water · Badwater · Mixed water · Walls · Dead trees · Trees and
  bushes · Start · Slope · Ruins · Mine site · Water source · Badwater source · Geothermal field · Relic · Thorns ·
  Blockage · Other objects; the heading "Markers on:" with Slope arrows · Level lines · Contamination edge · Mine
  site outline. The notes ("From afar…", "Click a line…") are gone; each line's tooltip is "Show on the map". The
  same names wherever the legend appears, the generator's view included. Every line fits on one line without
  shrinking the type (change 2 makes the two widest fit).
- **The drawer (v7):** in the palette's place, at the width its contents need, with v6's contents: Theme, Seed,
  Size, Designed for, the six sections (Terrain, Water, Hazards, Resources, Advanced: start rules, Limits for this
  size), Generate, Surprise me, the map card (its premise leading, then the legend of what's on the map with
  counts); plus the name field (change 5) at its head and Your maps (change 6) at its foot. The toolbar, the minimap
  and the readout move right with it as one block, never hide; the top-right column and the water bar never change;
  the map doesn't move.
- **Solid chrome (v7):** every control has a solid background as on dev, the readout and the water bar included;
  the contrast test checks their words against it.
- **Pause water** (v7): "Pause water" / "Play water", shown unavailable while the water is settled, never hidden.
- **Scale:** none, at any size (change 1; v7's 1.2 and v8's 1.1 are gone).
- **Tests (v7, v8):** the layout test at the seven sizes (1280×720, 1366×768, 1440×900, 1536×864, 1920×1080,
  2560×1440, 3440×1440): no overlap with the drawer closed and open, the legend closed and open, and each view layer
  on; the centred info; the right column's shared edges to the pixel; toggling each layer moves nothing; solid
  backgrounds and WCAG AA. (Drop its `?ui` loop with change 1.)
- **Deliverables each round (v7, v8):** captures beside dev's editor (same map, Carve in hand, minimap on) at
  1440×900 and 1920×1080 in `docs/design/`; compare each with dev yourself and list every remaining difference with
  its reason before pinging; record decisions in DESIGN.md and here; ping with a toast and a Progress log comment.
  Don't wait on Kyler's replies for anything his message settles.

### 2. What the build is

The current editor's layout as it is on dev, with the v8 changes and the seven above, and the drawer for New map.
Nothing of v4's visual system comes back (§3).

**The v8 prototype** is `feature/page-proto`, cut from dev at `57dec313`, commits `6a580451` (v7), `b8ab0238`
(the layout test's solidity fix), `94392c45` (v8); it is what `/preview/` serves (the deploy workflow with
`preview_ref=feature/page-proto`). It is dev's code plus these files, and that is the shape the build should take:
dev's editor, changed only where Kyler asked.

Reusable as it is (prototype code, inert where it says so):
- `src/editor/Drawer.tsx`: the drawer's markup (fields, sections, Generate, Surprise me, the card with its legend
  counted from `info.features`). Inert: nothing is wired to the generator or the core. Its head becomes the name
  field and it gains Your maps (changes 5 and 6).
- `src/styles/page.css` (loaded last from `main.tsx`): the header (New map, the centred `.editor-title` capped by
  `--side-l`/`--side-r`, the actions), the checks' words, the view bar's room before the column, `--overlay` solid,
  the drawer, the block shift (`margin-left: calc(var(--drawer-w) - var(--shelf-w))` on the toolbar, view bar,
  minimap, readout, caption, start indicators), the right column (`.view3d-corner` with `bottom:` and four rows,
  `.corner-legend`, `.legend-panel` with `contain: inline-size`), the caption's place. Remove the `@media
  (min-width: 1800px)` zoom block (change 1); widen the column (change 2: the grid's first column is `auto`, sized
  by the level control, so give it `minmax(<today's width + 13px>, auto)` or set the level control's width); change
  `.legend-panel` from `align-self: stretch` to its content's height with a `max-height` to the gap above the water
  bar (change 7); keep the foot padding equal to the head's.
- `src/editor/Header.tsx`: the New map button, the centred title with its measuring effect, the File menu, the
  dot's words (`dotOf`). Remove nothing; add the rename's live title (change 5).
- `src/editor/session/useSession.ts` (`drawerOpen`), `src/editor/render/header.tsx`, `src/editor/render/editorView.tsx`
  (`drawer-open`, `<Drawer>`, `legendInCorner`, `legendOpen={false}`), `src/ui/App.tsx` (straight into the editor
  after a passed generation).
- `src/ui/View3D.tsx`: `legendInCorner` (the Legend button and panel in the corner grid; the docked aside stays for
  the generator's view, unused by the page), the Flow toggle, the lines' tooltips, the "Markers on:" heading (make
  it one weight: change 4). `src/editor/WaterBar.tsx`: "Pause water", the `--water-bar-h` measure the column reads.
- `src/render3d/palette.ts` and `src/ui/legendMap.ts`: the names and their keys (a table by exact name).
- `src/editor/panels.tsx` `LayerLegend`: give it change 3's one line.
- `src/main.tsx`: remove the `?ui` block (change 1).
- `tests/e2e/layout.spec.ts`: the whole test; drop the `SCALES` loop. The unit and e2e tests re-pinned to the
  names (`tests/unit/look*.test.ts`, `legend.test.ts`; `tests/e2e/look*.spec.ts`, `legend.spec.ts`).
- `.scratch` on the proto worktree (`C:\Users\krams\code\DamGoodMaps-split`, gitignored): `look8.ts` (the
  captures), `measure8.ts` (the header's widths), `zoom7*.ts`, `proto*.py` (the edits as scripts). The dev captures
  for side-by-sides are in this clone's `.scratch/mock/` (`dev-editor-*.png`, `dev-badwater-legend-*.png`,
  `capture-dev*.ts`, served from the proto worktree's `.scratch/dist` build of dev); `compose8.py` makes the
  composites.

**Where to build it.** `feature/page` (PR #163) carries the v4 workspace (`src/page/`, `src/styles/lamplight.css`),
which Kyler set aside, over a restyled editor. The build should not start from that. Recommended: start the build
branch from `feature/page-proto` (dev plus the v8 files), port the kept pieces from `feature/page` (§4), and point
PR #163 at it or open a new PR into dev; the v4 workspace files and `lamplight.css` do not come over. Merge dev first
(`feature/page-proto` is 11 dev commits behind, no conflicts expected; `feature/page` conflicts with dev in
`tests/e2e/sources.spec.ts`, `tests/e2e/tooltips.spec.ts` and `tools/bench-brush.ts`).

### 3. Set aside from v4: do not bring these back

Kyler rejected them on sight beside the current editor (DESIGN.md, "Set aside"), or they died with v6–v8:
- the floating plates (the rows' plate, the Save plate, the map/view plates, the panel column at 316px, the one-width
  right column at 196px, the compass plate, the water plate) and the v5 token set (plate and cell measurements, the
  wood colours, `cream`, the 12px grid);
- the grouped shelf and the shelf on the right (the palette stays docked on the left, exactly dev's);
- translucent controls (every control is solid, as on dev);
- the colour roles: "one accent for lit, Save only", *action* for Generate, *selected* dimmer than lit, the quiet
  cell; the current editor's mint for selected and lit is the rule;
- the brand mark and "Dam Good Maps" in the header (v7's centred brand too), and Bitter as a wordmark face;
- the view layers as pills, the forces' own band, the thin-at-rest plates that brighten on hover, the moments
  (v4 §6), the "always a tool in hand" fourth line as mocked (see §4 on Select);
- the chrome's scale-up on large screens (1.2, then 1.1: none);
- the docked legend with its vertical tab, the legend opened by a view layer, and the legend's descriptive labels;
- the map card's ratings (0b), the generation settings as sheets over the panel (v3), the panel collapsing to a strip;
- the phone editing layout (v4-10..15): D185 holds (phones view-only) until Kyler says otherwise.

### 4. Kept from v4, and where it lives

- **The no-overlap and contrast tests:** `tests/e2e/layout.spec.ts` on `feature/page-proto` (v8; the complete one).
- **Select always in hand** (v4-01, Kyler's choice at the v4 verdict: Select held when a map opens, Esc and X return
  to it, a drag on the land marks an area, the right button and keys turn the view): a ruling and a mockup only; no
  code exists on either branch. Build it in the paint slice (`src/editor/paint/`) when the editor's rows are wired.
- **The checks list with Fix and Show:** dev's own (`src/editor/Header.tsx` `ChecksDot`, `src/editor/panels.tsx`
  `Items` with `onFix`/`onShow`); the page adds the dot's words beside it (v7).
- **File and its items:** the proto's `Header.tsx` (Open…, Save project, Download .timber, Clear everything, History,
  About); the mockups also had Copy link, which Kyler never ruled on (open question).
- **The nine states** (DESIGN.md, "The states", mockups 27–35, drawn in the v4 system): the first visit before a map
  exists; generating (editing never waits); a map with problems (the dot's words and the list with Fix and Show);
  a settings sheet (now a drawer section); the File menu; a force in hand with More; a selection with Select's line;
  placing an object; a tooltip with its key cap. Which carry over: their content and behaviour (what each state
  shows and allows). Which need redoing in the current look: all nine as pictures; none of the v4 drawings is a
  reference for how they look. Pause water unavailable while settled carries over as built.
- **The brush worker patch** (the milestone session's `docs/progress/naturalize/brushes-coalesce.patch`, from
  `feature/naturalize` 647e45e1): applied on `feature/page` as `e97c8254` (pointer moves queue their points, one dab
  per frame, the draft after the frame). It is not on `feature/page-proto`; apply it to the build branch (`git
  apply --check` passed on dev at the time) and rerun `brush.spec`, `brushKit.spec`, `brushModes.spec`,
  `forceKeys.spec`. `tools/bench-brush.ts` changed on the Naturalize branch and is the milestone session's: after the
  patch its input-to-frame attribution reads zero samples; Kyler said leave it to them.
- **The core wiring** on `feature/page` (`src/page/settings.tsx`, `Workspace.tsx`, `App.tsx`): the settings model
  to a spec, Generate running the generator and replacing the map in the editor, the share link generating straight
  into the editor, Open… and the file drop. The settings model and the generate-and-replace flow are reusable logic
  behind the drawer; the workspace's layout is not.
- **The D380 measurements** (production builds, this machine, not a quiet window; the PR needs a quiet-window run
  before it merges): the new page at checkpoint 1: Generate 3.0–4.0 s at 128² and 26–43 s at 256²; opening the map
  in the editor 0.1 s and 0.4–0.6 s; the first frame 0.65 s and 1.7 s. Old page vs new, the same way: no slowdown;
  the new page is a little faster to editable because the editor's code loads beside the generation. Brush
  benchmark (256² Raise, same GPU, three runs each, alternating): input-to-frame p50 8.0–8.2 ms old vs 7.1–8.1 ms
  new; p95 10.1–10.7 vs 9.3–9.8; frame p99 6.0 ms both; commit after release 445–597 ms old vs 345–433 ms new; undo
  17–23 ms both; 0 stroke mismatches both (the new page's stroke covered 1,493 tiles against 1,375: a bigger canvas).
  The committed 2026-09-26 baseline (RTX 4080 SUPER, 1,011 tiles) was p50 4.5 / p95 7.2 ms, commit 162 ms, undo
  8.4 ms; these runs were on a different GPU, so compare old against new, not against the baseline. The measuring
  script is `docs/progress/compare.ts` on `feature/page`.

### 5. Where the branches stand

- **`feature/page`** (PR #163 into dev, draft, head `2e026884` + this handoff): 44 commits over dev. Built: the v4
  workspace (set aside), the Editor.tsx split (merged to dev separately as #169), the two renderer edits (§6),
  Bitter via `@fontsource/bitter` with its OFL licence (set aside with the brand; remove when the build lands),
  the brush patch (`e97c8254`), the old page's unused files removed (`7c75c6a1`), retired terms "Refine this map"
  and "Back to settings" (`4fc09a0a`), the tests moved to the one-window page (`tests/e2e/open.ts`,
  `tools/wait-editor.ts`), EDITOR_PLAN §3's screen section, DESIGN.md and this file, the mockups and captures in
  `docs/design/` (v3, v4 01–35, v6, v8). CI: the `test` job fails on the retired-terms test, two comments in the
  milestone session's files (`src/worker/api.ts:93`, `src/worker/session.ts:915` say "Refine this map"); reported
  to the milestone session, not fixed by this branch. Mergeable: CONFLICTING with dev (the three files above).
  Uncommitted work: none.
- **`feature/page-proto`** (`94392c45`, pushed; on `/preview/`): dev at `57dec313` plus the v8 prototype. The drawer
  is inert (Generate does nothing; no generator, core or state wiring). Tests: `layout.spec.ts` green at the seven
  sizes in every state (8.5 min); the unit suite 1,213 passed, 15 skipped, one failed: the heavy
  `tests/contract/properties.test.ts` "the max preset (256²), seed 304, any › random operations…" hit its 640 s
  timeout while the e2e run and the captures loaded the machine; a timeout, not a logic failure, in the core (the
  milestone's); rerun it in a quiet window. The e2e specs that open the generator's view (`look*`, `legend`,
  `viewAndHeader`'s refine helper and the rest of the milestone's e2e suite) are not run on this branch: the page
  has no generator view, so they need the one-window opening (`tests/e2e/open.ts` on `feature/page`). Uncommitted
  work: none (`.scratch/` is gitignored).
- `/preview/` is the page session's slot (D396); the deploy workflow's `preview_ref` republishes it.

### 6. What this work changes outside the editor, and why

- `src/render3d/renderer.ts` (on `feature/page`, `858d1f70`; Kyler's yes for these two functions only):
  `frameMap()` reads `--frame-left/top/right/bottom` (registered with `@property`) so the default view and Reset
  view fit the whole map in the space the page's panels leave; `thumbnail()` frames each shelf picture tight to the
  object with a pixel-alpha second pass, Slope viewed from below its ramp, so the pictures fill their tiles. With the
  v8 layout the drawer lies over the map and nothing resizes, so `frameMap`'s insets may no longer be needed: keep
  the function reading them, pass none, and drop the change if the build never sets them. `thumbnail()` stays (the
  drawer's card and the palette use the pictures).
- `src/render3d/palette.ts` (on `feature/page-proto`): the legend's labels are the names Kyler gave; nothing else.
  `src/ui/legendMap.ts`: the keys by exact name. `src/ui/View3D.tsx`: the Legend-in-corner prop, the Flow toggle,
  the lines' tooltips, the heading; the docked aside stays for `Preview3D`. The renderer session's branch touches
  none of these; the milestone session owns `src/render3d/` otherwise, so say so in the PR.

### 7. Open questions only Kyler can answer, each with the proposed default

1. **The header below 1,219px** (the centred info meets a side group; 1,395px while the dot says "Checking, as the
   water flows"; "Dam Good Map" with a ten-digit seed 1,263px and 1,439px). Default: the info drops its second
   line first, then the name ellipsizes down to about 80px; below about 1,000px the dot's words give way to the dot
   alone. Nothing built until he says.
2. **Your maps' star** (the core keeps the last 30 unstarred maps; a star keeps one for good; `YourMapsStore.star`).
   Default: no star in the row (he said no extras); a map's 31st-oldest drops silently; add the star later as a
   small named control in the row if he wants it.
3. **A new map's default name** (change 5). Default: the theme's name as today ("River Valley"), a renamed map
   keeping its name through Generate only if the seed and settings are unchanged; a new generation gets the theme's
   name again.
4. **What Generate does to an edited map** (checkpoint 2's question): default: the current map is already in Your
   maps (saved on every edit), so Generate replaces it without asking, and the row in Your maps brings it back.
5. **Copy link in File** (in the v4 states, never ruled): default: include it (the share link is the page's way to
   send a map), after Download .timber.
6. **The drawer's width** (352px in the prototype, "the width its contents need"): default: keep 352px; Your maps'
   rows truncate their names with an ellipsis before the size.
7. **Phones** (D185): default: view-only stays; the drawer and the editor's rows are not laid out for phones.
8. **The generator's view** (`Preview3D` with the docked legend) is dead code once the page opens every map in the
   editor: default: remove it with the old page's files in the build's PR, with the milestone session's agreement.

## Checkpoints

Each ends on `/preview/` with one checklist for Kyler's sitting. `dev` is merged into `feature/page` at least at every
checkpoint.

| # | Checkpoint | State |
|---|---|---|
| – | The Editor.tsx split, its own PR into dev (#169), behaviour unchanged | done: merged into dev |
| 0 | The look: two directions as mockups on one real map | done: Lamplight's colours and theme accepted |
| 0b | Lamplight v2, then v3: five mockups answering Kyler's reviews | done: v3 accepted with six changes |
| 1 | One workspace: the map fills the window, the panel, the rows, the cluster, Save | on /preview/; its second mockup round (v4) waits for Kyler's verdict |
| 2 | The panel is the map: the map card, Generate's dot and lock, the candidates strip | waits for M9b's candidate events (else after 3 and 4) |
| 3 | Your maps and replacing a map | |
| 4 | Real places in the panel (Pick a place stays out of the switch until it's built) | |
| 5 | The readout and the small things | |
| 6 | First visit and startup part 2's page side | |
| 7 | Phones and fallbacks | |
| 8 | Finish | |

## Kyler's rulings (2026-10-02)

- **No checkpoint's look is built until Kyler has accepted its mockup** (checkpoint 0 review; this replaces "the
  page session picks and carries on"). Only the Editor.tsx split carries on meanwhile.
- The direction is Lamplight: its colours and theme are accepted.
- Every tool has a visible name, always: the brushes, the forces, the shelf's objects, the view bar's toggles.
- Keys appear only on hover, as the tooltip's key cap (D351); none on the buttons.
- Slow forces is a button reading "Slow forces", exactly as wide as the level control and directly under it,
  edges aligned; Sound sits directly under the compass, centred on it.
- The shelf moves to the right, directly under Sound, on the cluster's two edges; its objects stay small renders
  drawn by the view (D184), each with its name; it fits at 1366×768 clear of the water bar (grouped or
  scrolling, names kept). This replaces EDITOR_PLAN's "left shelf"; the milestone session numbers it.
- Every generation setting (Terrain, Water, Hazards, Resources, Advanced: start rules, Limits for this size) is in
  the panel's Generate side, under its real name ("Designed for").
- The rows read as one instrument with one left edge; picked and primary get different treatments; the wordmark
  isn't in the display face; the legend isn't boxed tags; the levers are readable; the cluster has one height and
  one gap.
- **Checkpoint 0b review** (the goal: seamless and easy to understand; a new player knows what everything is and
  where to find it at a glance, with nothing jumping, crowding or needing to be decoded):
  - *For the milestone session to number (changes UI-BRIEF §3's difficulty levers):* the map card has no
    ratings; every legend picture has its count and name, in aligned columns, only for what's on this map;
    hover still highlights and a click still pins; the trees in reach and logs line stays.
  - *For the milestone session to number (changes D352's force clusters):* the rows have no clusters and no
    dividers; every row is one evenly spaced line from the left, in the order the items have now.
  - The panel never changes shape or jumps: the settings have a fixed area that scrolls inside itself, and
    everything below stays where it is in every state.
  - Undo, Redo and ⋯ stay icons, with tooltips naming them. Your maps may scroll at 768px. Variety appears when
    M9b brings the setting.
- **Lamplight v3 accepted, with six changes built into checkpoint 1 and judged on the real page** (no new mockup
  round): (1) the tools, the forces and the fourth line centred in the plate, the view bar as it is; (2) a
  settings section opens as a sheet over the panel's lower part at its full remaining height, closing back to
  the list, nothing underneath moving; (3) the pinned legend item gets the picked treatment (the dark well with
  the cream bar); (4) the view draws every shelf and legend picture at its real size, Slope's showing its ramp;
  (5) Generate reads as a button to press, never as disabled; (6) the view bar at 1366 wide on a map with roofed
  water is checked on a real roofed map.
- The message strip's × ("Dismiss") has the tooltip "Dismiss this message".
- **After checkpoint 1's sitting** (no visual change is built until its mockup is accepted): (1) the empty fourth
  line goes: mock "always a tool in hand" (Select held by default, Esc returning to it), and a better answer
  beside it if there is one; (2) a phone layout (portrait 402×874 and landscape): the map fills the screen, one
  bottom bar with Generate, Tools and Save or Share, sheets for the panel, settings and shelf, every control
  named, 44px targets, nothing depending on a tooltip, safe areas and Safari's moving toolbar respected, and what
  a phone can and can't do said; (3) 1280×800 and 1024×768: nothing collides from 1024 up, fixed plate widths
  dropped where they cause it; (4) hierarchy in the rows: camera actions apart from overlays, an overlay's on-state
  readable at a glance, the forces with their own treatment, the active tool unmistakable, Generate a button
  without Save's light; (5) the chrome recedes and brightens on hover or use, and the shelf opening only while
  placing is shown beside the shelf as now, to choose; (6) the moments, a line each: a new map arriving (the land
  rising into place), sheets, tools; easing over 150–200 ms, off with reduced motion.
- Meaning is a section of DESIGN.md, not its own document.
- The Editor.tsx split goes first, as its own PR into dev, merged by the milestone session.
- Pick a place stays out of the switch until it's built. If M9b isn't in when checkpoint 2 is due, 3 and 4 go first.

## Asked of the page session

- **The Flow toggle** (renderer session, D353): a view toggle beside Markers, in both looks and not in High's effects
  list; off by default, a preference stored like Markers; it shows or hides only the Flow view's lanes; tooltip
  "Show the water's currents"; it calls `renderer.setFlow(on)`, which arrives with the renderer's PR (`?flow=on`
  until then). Placed at checkpoint 1.
- `src/editor/waterPlayer.ts` and `waterJourney.ts` stay where they are, exports unchanged, until the renderer's PR
  has merged.

- **Remove unfed water and Fill** (the milestone session, #167 on dev; `src/core/doc/waterEdits.ts`: `unfedWater`,
  `planFill`): where the two controls go isn't decided. They go into checkpoint 2's mockup, labelled, with their
  tooltips; Kyler accepts the placement before they are built.

## Asked of the milestone session

- **A rename operation in the core** (the build, change 5; Kyler has asked the milestone session, 2026-10-02): until it
  is on dev the page keeps a renamed map's name in Your maps and names its saved .timber and project files with it
  (`namedFile`), while the document's own name (`meta.name`) stays the generator's. Once it lands, the drawer's
  name field sends the operation instead.
- M9b's candidate events (the strip), Sources: Placed · None and the automatic water fix (checkpoint 2).
- A signal that the water under the pointer changed, for the hover readout (checkpoint 5).
- The engines for Remove unfed water and Fill (checkpoint 5).
- The service worker (checkpoint 6).

## Log

- **2026-10-02, checkpoint 0.** Two directions mocked on River Valley 4242 at 128² in the High look
  (`docs/design/direction-a-lamplight.jpg`, `direction-b-fieldnotes.jpg`). Chosen: Lamplight (DESIGN.md says why).
  The design skill (`timbermods/.github`, `claude-skills/impeccable-app-flow`) is followed as a process, adapted: the
  page is built fresh, so there is no "before" look to freeze; its hard limits hold (no map changes, no `src/core/`
  edits by the design, state never by colour alone, test hooks kept).
- **2026-10-02, checkpoint 0b.** Lamplight v2, five mockups (`docs/design/lamplight-v2-*.jpg`), DESIGN.md at v2.
  What changed from v1: every tool, force, view toggle and shelf object is named; the rows are one 608px plate;
  the shelf is a named list on the right under the cluster, with the view's own renders; Lit is Save to Timberborn
  alone, with In hand and On as separate treatments; the panel holds every generation setting (six sections, one
  open at a time, only the settings scrolling); the legend uses the view's pictures unboxed and the levers are
  words; the cluster is one height and one gap. Four points are open for Kyler (DESIGN.md, "Open for Kyler").
- **2026-10-02, Lamplight v3** (`docs/design/lamplight-v3-*.jpg`; v2's images removed). What changed: the card's
  ratings are gone and the legend is picture, count, name in two aligned columns; the rows are evenly spaced
  lines with no dividers, always four lines tall; the panel's parts have fixed places, with the settings as an
  accordion in a fixed area that scrolls inside itself; the view bar's two actions are buttons and an on toggle
  is a well with a bar; pictures are 28px; Generate is the panel's main button; the default view fits the whole
  map in the free space, open and collapsed. One limit noted in DESIGN.md: Under roofs at 1366 wide.
- **2026-10-02, checkpoint 1 on /preview/** (https://timbermods.github.io/dam-good-maps/preview/). Built: the one
  workspace (`src/page/`), the panel with every setting and its sheets, the rows' plate, the Save plate, the cluster,
  the shelf on the right, in Lamplight (`src/styles/lamplight.css`). Kyler's six changes are in. Two edits in
  `src/render3d/renderer.ts`, with Kyler's yes: `frameMap()` fits the map in the space the page's panels leave
  (`--frame-left` and the rest), and `thumbnail()` fills its picture with the object (Slope from below its ramp).
  Bitter 700 comes from `@fontsource/bitter`, its licence in `public/licences/`.
  - Ruling 6 checked on the official Canyon map (Hollows has no water under roofs): the ninth toggle shows from the
    moment the map opens, the view bar takes a second line, and no other plate moves. The rows' plate is 622px at
    every window width, and at 1366 wide it ends exactly 12px short of the Save plate.
  - Measured on the production build (this machine, tests running beside it, so not quiet): Generate 3.0–4.0 s at
    128² and 26–43 s at 256²; opening it in the editor 0.1 s and 0.4–0.6 s; the first frame 0.65 s and 1.7 s. The
    old page and the brush benchmark are measured the same way, in a quiet window, before the PR merges (D380).
  - Still open: the browser tests' move to the new page (a Sonnet agent, its own worktree); EDITOR_PLAN's screen
    section; the old page's unused files.

- **2026-10-02, the build begins** (Kyler's answers to §7's questions 1–6). Step 0: `archive/page-v4` pushed (the
  v4 head, `a9d4d99b`, kept for good); the build starts from `feature/page-proto` with dev merged in, on a local
  branch until `feature/page` is reset onto it (the reset and force-push were held back by a permission check and
  wait for Kyler). Kept from v4: `thumbnail()`, the browser tests' one-window opening (`tests/e2e/open.ts`,
  `tools/wait-editor.ts`), the retired terms, DESIGN.md, this file, `docs/design/`. Naturalize's worker patch
  applied. Then the seven changes; the drawer wired (the page owns the map in `src/ui/App.tsx`; the drawer's
  settings are dev's fields in `src/editor/drawer/settings.tsx`; the old settings page's files are gone); the name;
  Your maps; File; the address as the share link; the header's narrow widths; Select in hand.

## Checkpoint 1: the sitting's checklist

On https://timbermods.github.io/dam-good-maps/preview/ (a first visit generates a map; that takes a few seconds).

1. **One window.** The map fills the window and is editable at once. There is no Refine button, no second screen.
2. **The rows.** One plate: the view bar, the tools, the forces, and a fourth line. Tools, forces and the fourth line
   are centred; the view bar starts at the left. Pick Carve, then Raise, then Mine site on the shelf: the plate keeps
   its width and its place; a long settings row takes a second line.
3. **Names and keys.** Every tool, force, view item and shelf object shows its name. Keys appear only in tooltips.
4. **Top right.** Save to Timberborn is the only lit thing. Under it: the level control and the compass; Slow forces
   exactly under the level control; Sound under the compass; the shelf under them, on the same two edges.
5. **The shelf's pictures.** Each fills its tile and can be recognised; Slope shows its ramp.
6. **The panel.** Theme, Size, Seed, Designed for; six sections. Open Water: it comes up as a sheet over the lower
   part, nothing above it moves, its head goes back. Change a setting: Generate gets its dot. Generate reads as a
   button to press.
7. **Generate.** Press it: the button says what it is doing, then the new map replaces the old one in the same
   window. With edits on the map it asks first (until Your maps exists, checkpoint 3).
8. **The default view.** A new map, and Reset view, fit the whole map in the free space, with the panel open and
   collapsed. Collapsing the panel leaves the camera alone.
9. **The panel collapsed.** A thin strip with the map's name; the rows move beside it; Save stays where it is.
10. **At 1366×768.** The rows end exactly 12px short of the Save plate; the shelf ends above the look's plate.
11. **A map with water under roofs** (open the official Canyon with ⋯ → Open…): Under roofs is in the view bar from
    the start, the bar is two lines, nothing else moves.

Not in this checkpoint, so not to judge yet: the versions strip, the legend and trees line (2), Your maps and the
question before replacing an edited map (3), Real places in the panel (4), the readout's live refresh and the first
run's hints' final form (5), the first visit's ready-made map (6), phones (7).
- **2026-10-02, the v4 mockups** (`docs/design/lamplight-v4-*.jpg`, fifteen; DESIGN.md, "Proposed after
  checkpoint 1's sitting"). One set for Kyler's six notes: Select in hand and an alternative; the phone in
  portrait and landscape with its sheets; 1280 and 1024 wide; the rows' hierarchy; the plates at rest and in use,
  with the shelf both ways; the moments in words. It also proposes one width for the whole right column, which
  removes the wide Save plate. Nothing of it is built.
- **2026-10-02, the reversal.** Kyler set the floating-plate layout aside after seeing it beside the current editor,
  and asked for the one-page editor rebuilt on the current editor's skeleton with its dark chrome, keeping the
  system's tokens, roles, tests, Select in hand, the checks list, File, the brush patch and the D380 work (DESIGN.md,
  "Set aside"). Two mockups for where the generator goes (a drawer in the palette's place; two views switched in the
  header), each beside the current editor captured from dev at 1440×900 and 1920×1080: `docs/design/editor-v6-*`.
  Nothing visual is built until he chooses.
- **2026-10-02, the prototype** (`feature/page-proto`, cut from dev; `docs/design/editor-v7-*`: dev beside the
  prototype at 1440×900 and 1920×1080, drawer closed and open). Kyler chose option 1, the New map drawer, and
  asked for one clickable prototype built from dev's editor code with only the listed changes; it is on
  `/preview/`. The rule from here: where Kyler hasn't asked for a change, dev's editor wins; the v4 system's tokens,
  colour roles and grouped shelf are set aside (DESIGN.md, "The one-page editor"). `tests/e2e/layout.spec.ts`
  checks no overlap, the brand's centre, solid backgrounds and WCAG AA at the seven sizes, drawer closed and open.
  - The brand (152px) clears both side groups from 1,242px wide while the dot says "Ready to play" (the right
    group is 525px, the left 219px); the dot's longest words, "Checking, as the water flows", widen the right group
    to 613px, and then it clears from 1,418px. Proposal for narrower windows, not built: below 1,420px the brand
    keeps only its mark at the centre; below about 1,000px the mark joins the left block after the name.
  - The toolbar's longest row (the view bar, 771px at 1×) fits on one line with the drawer closed at every size
    covered; with the drawer open it fits from about 1,316px wide (at 1440×900 it ends 10px short of the top-right
    group), and wraps onto two lines below that, as dev's does on narrow windows. Reported, not changed.
- **2026-10-02, v8** (`feature/page-proto`; `docs/design/editor-v8-*`: dev beside the prototype at 1440×900 and
  1920×1080, drawer closed and open, Badwater on with the legend open at both sizes, and the right column at 2×).
  Kyler's four changes to v7 (18:18): the scale-up from 1800px is 1.1 and `?ui=` lets him try 1.0, 1.05, 1.1 and
  1.15 (temporary); the brand is gone and the map's name and "seed · size" sit at the window's centre in the
  editor's title type, capped so they never reach the side groups (a long name truncates, its tooltip holds it);
  the right column lines up to the pixel with a named Legend button and the legend panel under it over the map,
  the docked legend gone; the legend's lines are names only (DESIGN.md, "The one-page editor"). The layout test
  now also checks the centred info, the column's shared edges (within a tenth of a pixel), that toggling each
  view layer moves nothing, the legend closed and open, and the four `?ui` values from 1800px wide.
  - The centred info clears both groups from 1,219px wide ("River Valley", "Ready to play") and from 1,395px with
    the checks' longest words; "Dam Good Map" with a ten-digit seed, 1,263px and 1,439px. Proposal for narrower
    windows, not built: below those widths the info drops its second line first, then the name ellipsizes down to
    about 80px; below about 1,000px the dot's words give way to the dot alone.
  - Two legend lines are wider than the column and are cut at its edge (DESIGN.md says which, with the fix that
    keeps the type). Reported, not changed.
  - Tests renamed for the new names: `look.test.ts` "the legend names each colour…"; `look-clean.test.ts` pins the
    four marker lines by name; the e2e specs that read the legend's words (`look`, `look-clean`, `look-readable`,
    `legend`) carry the new words, though they open the generator's view, which the one-page prototype no longer
    shows (they run against dev's layout, the milestone's).

## The build's checkpoint (2026-10-03): the sitting's checklist

On https://timbermods.github.io/dam-good-maps/preview/ (from `feature/page`); captures beside dev in
`docs/design/editor-build-*` (1440×900 and 1920×1080, drawer closed and open, Badwater with the legend).

1. **Scale and column.** No scale-up at any size; the right column is 13px wider and every legend line fits on one
   line.
2. **Legend.** Open it with **Legend**: as tall as its lines, the same space at its foot as its head; "Markers on:"
   one weight; the Badwater caption is one line.
3. **Name.** New map → **Name**: type a name; the header follows at once; a blank name is refused in the core's
   words; Save to Timberborn and Download .timber use it; no undo step.
4. **Your maps.** At the drawer's foot: name and size, newest first, the open map marked; a click opens one.
5. **Generate.** The drawer's settings and sections (each a sheet over the lower part) work as dev's did; Generate
   replaces the open map without asking, named for its theme, and the old one stays in Your maps.
6. **File and the address.** File holds Open…, Save project, Download .timber, Clear everything, History, About;
   the address is always the open map's share link; a reload brings the open map back.
7. **The header narrower than 1,219px.** The second line goes first, then the name ellipsizes; below 1,000px the dot
   stands alone.
8. **Select in hand.** Held from the start; a drag on the land marks an area, a click clears it; Esc and X return
   to Select; a click picks an object and a drag then moves it; a drag starting on an unpicked object marks an
   area; sources and the start drag as on dev.

Where it still differs from dev, each asked for: the header (New map, the centred info, the dot's words, File);
Flow; Pause water; solid readout and water bar; the right column (13px wider, Legend, the legend panel, the
names); the drawer; Select's line in the toolbar whenever nothing else is in hand; the palette's pictures framed
tight (`thumbnail()`). At 900px tall Your maps sits below the fold, and the drawer scrolls to it.

## Kyler's sitting on the build (2026-10-03)

His eight points are in DESIGN.md ("Kyler's sitting on the build"). Built the same night (`7fc6fa85`): the one left
column, the header (Maps, the title renamed in place through `setName`, "Seed"), the drawer's new order with the
sections in place and Your maps as picture tiles, Difficulty for "Designed for", no lines under settings, the height
slice. Also: a new map joins Your maps a moment after it opens, not while the editor opens (the suspected cause of
the 256² preview's timeout under load; to be measured). Open: the two flakes at their cause (D341); the D380 timings
in a slot Kyler names.

### The two flakes (D341), 2026-10-03

- **look-high, "the Standard look is the same after High":** not the page. Two still frames of the Standard look,
  the clock and the view held (`setClock`, `resetView`, `renderNow`), differ on wet tiles only, by 1–3 colour levels:
  10–95 channel values a pair on dev's own build (`b302c938`) and 1–58 on the page's, on this machine's GPU. The test
  takes one pair's noise as its floor (`Math.max(again.share, 1e-5)`), so it fails whenever the later pair happens
  to be noisier. The cause is in `src/render3d/`'s water drawing (something in it changes between frames with the
  clock held); asked of the renderer or milestone session through Kyler. Not changed here.
- **The 256² Islands preview spec timing out under load:** the page wrote a new map's project into Your maps at
  once, holding up the worker while the editor opened; a new map now joins Your maps a few seconds after it opens.
  It has not timed out since (three full runs); D380's timings will show whether the page opens as fast as dev.

### Asked of Kyler: selecting without waiting on the worker (2026-10-03)

Stopped, as asked: the page's copy of the objects (`EntityView` in `src/render3d/model.ts`, sent by the worker) has
each object's template, place, orientation, flags and strength, but **not its id**. Every edit a picked source's
row makes (its strength, clean or bad, Delete) and a picked object's Delete name the object by id, so a selection
taken from the page's copy can't act. What it needs: the entity id in the view (one string per object, or an index
the worker resolves), which is `src/worker/`'s and `src/core/`'s.

## The second build checkpoint (2026-10-03): the sitting's checklist

On /preview/ (from `feature/page`); captures beside dev in `docs/design/editor-build2-*`.

1. **The left column.** Maps swaps the palette (four to a row) for the drawer in one 352px column; nothing else moves.
2. **The title.** Click the map's name: it edits in place; Enter or leaving saves, Esc cancels; a blank name says "A
   map needs a name"; Undo stays as it was. The line under it reads "Seed 4242 · 128×128".
3. **The drawer.** Generate and Surprise me stay at the top while the rest scrolls; the counts; Theme and Seed; Size;
   the sections open in place, several at once; Your maps as picture tiles, two to a row.
4. **Difficulty** in place of Designed for; no line under any setting; point at one for the official maps' range.
5. **The height slice.** ▾ value ▴, one width; down from ∞ goes to the map's highest ground, up runs to 22 then ∞; a
   click on the value is ∞.
6. **No notices strip.** Remove the last badwater spring: the quiet dot's list says "No badwater".

## Layout 2 built (2026-10-03, Kyler's yes to round 8 with the Legend)

Built on `feature/page` as DESIGN.md's "the design to build" with Kyler's two refinements (the legend's objects
with the objects menu's pictures; one fixed row height, 17px, so the fullest legend fits at 1920×1080 above the
minimap, never scrolling). What the mockups left open is in DESIGN.md, "Layout 2 as built". Also in this round:
- **Selecting never waits on the worker:** a click on an object or a source takes its record (id, template, place,
  strength) from the page's own copy (`EntityView.ids`, #200), found by the same footprints the worker's
  `entitiesAt` uses (`useSourcePointer.ts` `entitiesHere`); the worker answers only where an object has no id.
- **The warm-up (#208):** the page starts `prepareRenderer()` as the first map starts loading; the view takes the
  warmed renderer and its canvas in place of a new one, and a page left with no map drops it.
- **The camera insets (#206):** `src/editor/view/insets.ts` measures how far the top row, the Show column, the bar
  with its settings and the objects menu reach into the view and keeps the renderer's insets up to date; a new map is
  framed within them; setting them never moves the camera.
- Tests: `layout.spec.ts` rewritten for Layout 2 at its two sizes (the places, the settings on the bar's cells, the
  fullest legend fitting); the specs that named the old controls moved to the new names (the Show column's
  checkboxes, Map Generator, the bar's one toolbar, Try another). Renamed, as the rule allows: brushKit's "the top
  bar and the brush kit…" (now "the bar and the brush kit…, Lines in the Show column"), selectRow's "four rows…"
  (now "one bar at the bottom…"), viewAndHeader's top-right test (now the three-column grid), legend.spec's Legend
  test. The tests that expected every generated map to be called "River Valley" read the name M9b gives it.

## Kyler's sitting on Layout 2 as built (2026-10-03): three changes

1. **The bottom-left group:** the coordinates, the readout, then the minimap at the foot, level with the bar's and the
   objects list's; 32px plates, 6px apart. Its top at its tallest is where the minimap's top was, so the fullest legend
   still fits at 1920×1080 (437px, unchanged).
2. **Object settings leave the bar** for a window directly above the objects list, on its edges, 6px between; an object
   picked shows no row above the bar (Select's row gives way while one is picked on the map).
3. **The insets** take the window (with the list) and the bottom-left group (the minimap reaches furthest left).

`layout.spec.ts` checks the group, the window's edges and gap in both pickings, no row above the bar, and the list
never moving. Full browser suite: 130 of 131; the one is dev's own look-high highlight failure (reported before).

## Kyler's four fixes (2026-10-03)

1. **Slow Surprise me presses:** about 40 presses at 128² and 256², timed, the long ones traced. Every slow press is the
   generator's time in the worker (several layouts, and at 256² the start's placement and the water), reported to
   Kyler seed by seed. The page's part, fixed: the editor threw its 3D renderer away and made another for every map
   (a WebGL context lost and made again, every program compiled again), and built the features' tile index as the
   map opened; the renderer is now kept from map to map and the index built when first read. At 256² the main
   thread's work at opening fell from about 0.6 s to 0.26 s (all in the renderer's `setMap`, `contaminationEdges`
   most of it). No main-thread work during the generation itself; nothing piling up but the editor's own operations
   while the worker generated, which the modal now stops.
2. **The making modal** with a real Cancel (the worker ends; the open map comes back from its project saved just
   before, in a new worker, its history and view as they were).
3. **This source** in one line: "1.45 of 5.79 water/s".
4. **No focus ring on the map from the mouse.**

## Your maps' menu and the counts (2026-10-03)

Right-click on a map in Your maps: Download .timber file, Rename (in place), Delete (asked once). A closed map's
.timber comes from its project in a worker of its own; a closed map renamed opens under its new name. The counts
under "On this map", Forests now Trees (living trees, edits included). Your maps' columns are equal halves now (a
long name had widened its column).

**Kyler's audit ask (settings a key or the wheel changes, with no control):** Smooth's and Naturalize's strength
(Shift+scroll, [ ], F+scroll; 1–10), Quake's side (V), and the object's turn before placing (R). Everything else a key
or the wheel sets has its control (a brush's Size, Raise/Lower/Flatten's Level, a force's Power and Size, Select's
Level, the height slice, a source's Strength).

## Two fixes to the bar's settings (2026-10-04)

1. **No text caret, no text selection** on the page's controls and labels (the editor and its dialogs); only real text
   fields take a caret (`page.css`, the last rule).
2. **Select keeps one layout:** with nothing selected it shows the same two rows as with a selection, greyed until
   there is one (DESIGN.md, "Layout 2 as built"). Captures: `docs/design/select-none-*.jpg`, `select-selection-*.jpg`.

## The map generator: mockups A and B, and what lands now (2026-10-04)

- **Now, for both:** the generator lies over the map (opening it never resizes the map); the title, the water row and
  the bar centre on the window to the pixel (the bar now 880px, an even width); every dialog centred, its words and
  buttons centred.
- **Mockups:** A, the sheet, and B, the board, built on the real page behind `?gen=a` and `?gen=b` (the default stays
  the 352px panel until Kyler picks); every setting through the new shared `src/editor/generator/fields.tsx`.
  Captures: `docs/design/gen-{a,b}-{collapsed,open,open-long-name}-{1920x1080,2560x1440}.jpg`, the inventory table and
  the changes for a yes on the mockups page (`docs/design/layout2.html`).
- **Changes for a yes:** the species mix as one bar of four shares; Difficulty's numbers as sliders; shorter option
  words (Badwater Off; Start area Tight and Roomy; Unstable cores); Reset settings on Theme's line.
- **Open:** Your maps' own panel isn't drawn in the mockups (only its tab, or its header button in B).
- **Tests:** `layout.spec.ts`'s open-panel checks now hold Kyler's overlay (the panel at the window's left edge between
  the header and the bar, everything else in its place; nothing under the panel clicked) instead of the left side
  moving with a narrowed map. Full browser suite: 129 of 131 before that update; the two left were layout.spec (now
  passing) and dev's own look-high highlight failure; a shelf label test failed once and passed on rerun.

## The map generator built: A, the sheet, with Kyler's changes (2026-10-04)

Kyler picked A with five changes: the panel ends above the bar's settings (748px at both sizes; each setting on one
line, two columns); no tabs, Map Generator and Your maps as named header buttons, the left side's controls back on
the margin; yes to the four changes (the species mix bar with its names, Difficulty's sliders, the shorter words,
Reset settings on Theme's line); 640px at both sizes; Speed in the water row a segmented choice. Built for real:
`src/editor/generator/` (the panel, Your maps, the fields, the hints, the model); the old drawer, its sections, B and
`?gen=` are gone. The panel starts under the top row, since the wider water row reaches over it at 1920×1080. The
specs moved to the new controls (`open.ts`'s `pick`, `openYourMaps`, `setWaterSpeed`; the sections always show);
`layout.spec.ts` now holds the open panel clear of every control still showing. "Limits for this size" joins the
retired terms. Captures: `docs/design/generator-{closed,open}-{1920x1080,2560x1440}.jpg`.
Tests: full browser suite 129 of 131 (dev's look-high highlight failure; the 256² water timing test hit its limit
while the unit suite ran alongside and passed alone). Unit quick suite: `carveBornAsItCuts.test.ts`'s two tests fail
on feature/page's commit before this build too (no core file changed here); for the milestone session.

## Nothing hides when a panel opens (Kyler, 2026-10-04)

dev merged into feature/page (a2010cd4: the Rust water and forces on /preview/). Then: the map generator and Your
maps open beside the Show column (6px right of it) instead of at the window's edge, and nothing hides. The Show
column, the key under it and the legend are one width (190px); the overlays' captions moved from beside their rows
into that key (with Legend ticked, a caption heads the legend). The coordinates and the readout sit beside the minimap
at its foot. Under roofs' caption is shorter, so it fits the column. `layout.spec.ts` now requires every piece to keep
its place and show when a panel opens.

## Kyler's answers on what the page was missing (2026-10-04)

1. **Deselect** in Select's first row (cell 11), greyed with nothing selected, Esc and X in its tooltip.
2. **Real places** in the header between Map Generator and Your maps, opening in the same box: the gallery's places
   three across and three down, each picture, whole name and size, scrolling for more; a click opens the place
   (`src/editor/generator/RealPlaces.tsx`, the page's own `openPlace`).
3. Copy seed and settings as text stays out.
Kyler approved merging the page into dev once this is on /preview/.

**The Show column to the right** (Kyler, same pass): under Top-down at its width, the key and the legend under it
(right edges on the column's); the panels back on the left margin. Not under Reset view too: at 1920×1080 a source's
object window rises beside Reset view to about 269px from the top. The camera's right inset takes the column.

**Replaced, Kyler's change of mind:** the Show toggles in one row at the top left (34px clear of the water row at
1920×1080); Legend alone at the top right beside Top-down, the legend and the overlays' keys under it; Under roofs
beside Legend (no room in the row at 1920×1080); the panels on the left margin under the row.

**Kyler's four fixes (2026-10-04):** the top band one height (36px) with one top and bottom at both sizes, the compass
included; the panels one gap under the band at 2560×1440 too; Reset settings its own 13px button under Surprise me;
Real places' names without "Near".
Top-down and Reset view are 129px so the camera group stays 310px wide with the 36px compass. No map here shows Under
roofs: none of the 22 official maps has roofed water, so its capture waits for a map that does.

**Kyler's next three (2026-10-04):** the coordinates and the readout stacked directly above the minimap (the readout
never cut off: it wraps past 500px); the minimap's view outline gone; Legend centred in the gap between the water row
and Top-down, the legend centred under it. The coordinates above the minimap reach up to 826px at 1920×1080, so the
generator (and Your maps and Real places) is 684px tall now, its lines 25px, ending at 807px. Rift and Deposit wait
for the milestone session's word that #268's adoption is in dev.

## Weather days held, and the generator's top in three rows (2026-10-04)

- **Weather:** Drought and Badtide hold their last day; ◀ Day N ▶ (and ← →) steps from Day 0 to past the default
  length; an edit while held re-runs from its settled water and shows the same day; the readout reads the day;
  Speed, Skip and Replay greyed. The worker (`src/worker/session.ts`, `showWeatherDay`) keeps each day's water and
  soil, answers any kept day at once and simulates further days on request; no return run. Times at 128² on this
  machine: Drought's 9 days 0.3 s, Badtide's 8 days about 2 s, a further day under 0.1 s, a re-run after an edit
  about 1.6 s. The pressed Drought and Badtide are lit in the mint (the row's plate colour had covered the fill).
  `waterFlow.spec.ts` runs at 1920×1080 now (at 1400px the wider row meets the Show row).
- **Generator top:** three rows (Name 24ch and Seed, then Generate; Theme, then Surprise me; Size, then Reset
  settings); the freed row back to the settings, lines 27px; the panel 692px, ending 11px above the coordinates.

## Kyler's five fixes (2026-10-04)

1. **The generator's top row:** Name and Seed two fields one gap apart, the seed's box sized to 4294967295 with Keep
   after it, the name box the rest; the name box, Theme's and Size's choices start at 80px and end at 471px (one
   label column). Size's options equal; Custom holds the width and height in its place.
2. **No Speed** in the water row; the water plays at Normal (the test hook sets the pace for tests).
3. **Weather:** each hazard's days kept until the map changes (switching is instant); both worked out in the
   background once the water has settled and Kyler has been idle 1.5 s, stopped by any press or key (first click
   instant after that: under 10 ms).
4. **Any size:** the band lays itself out (`useBandLayout.ts`): at 1400px the water row goes to a second line; the
   panels and the legend size to their room. `layout.spec.ts` checks nothing overlaps at 1400×900, 1366×768 and
   1280×800 too; `waterFlow.spec.ts` is back at 1400×900.
5. **The water row's status** greyed while a day is held.

## Legend at narrow widths, and the weather straight to its day (2026-10-04)

1. With the water row on the second line (1300 and 1400 wide), Legend is the Show row's last toggle, 4px after
   Badwater; its open legend hangs under the second line, clear of a panel open at the left. 1920 and 2560 unchanged.
   `layout.spec.ts` checks 1300×900 too; `legend.spec.ts` runs at 1920×1080 (its centring check is for that band).
2. The day box reads the day asked for at once, with a quiet fill until it shows; the background starts the moment
   the water settles (Drought, then Badtide), stops on any press and resumes when the press ends with the water
   settled; only each day's water is kept, the ground worked out for the day shown. On a fresh 256² map both
   hazards are ready in about 0.1 s of the click, even straight after it opens.

## Rift, Deposit and Carve's Maturity on the page; the reopen test's flake (2026-10-04)

- **Merged dev** (multi-core water #281, Rift and Deposit #273, Maturity #278): the held weather days run on the core's
  `HazardRun` (held without an end), and the water's helper threads end with the editor's worker.
- **The bar, 13 cells:** Carve, Craterize, Erupt, Rift, Quake, Glaciate, Deposit. Every cell one width: 76px where
  there is room, narrower in whole pixels where not (65 at 1280, 67 at 1300, 74 at 1400), clear of the minimap and the
  objects menu by 15–19px; the dock on whole pixels. Every tool's settings re-spread over 13 cells; nothing clipped at
  1280–2560. Captures: `docs/design/forces-{rift,deposit,carve-maturity}-*.png`.
- **Rift and Deposit:** Power, Size (Auto follows Power: the Rust formulas, `riftWidth`, `depositWidth`), Walls or
  Channels with Auto, Floor, Try another; a click or a drawn line (Rift's band its Size, Deposit's its line); sounds
  from the bank; no keys yet (the number row is full). Their effects on the land are the renderer's.
- **Maturity** in Carve's settings: Young (default) and Mature with the Auto word; remembered with the pins.
- **The reopen test** (`editor.spec.ts`, the next visit opens the map left open) left the page after a fixed 2.5 s;
  the save waits 1.5 s of quiet, then the worker and the write, so on a loaded machine it hadn't landed. It now waits
  on `window.dgm.kept(version)`: the open map's last save took that version and was written, nothing waiting.

## The water row without its journey controls, a typed day, no Maturity (2026-10-04)

- **Water row:** Pause water, Skip and Replay gone (with the player's pause and replay and the row's greyed-plate
  style); the row is the status, Drought, Badtide and the day box, 4px apart, centred as before. "Pause water" is a
  retired term.
- **Typed day:** a double-click on the day box while a hazard is shown puts a field in its place (62×28, the box's
  own), 0 to 99; Enter or clicking away shows the day (`holdWeatherDay`, the path ◀ ▶ take), Esc cancels. No hazard
  shown: nothing. Tooltip "Type a day" with a Double-click key cap.
- **Maturity** gone from Carve's settings and prefs; Carve's rows now share every edge (3, 6, 9, 11, 13 cells).
- Captures: `docs/design/water-row-{held,typing}-{1300x900,1920x1080,2560x1440}.png`, `forces-carve-1920x1080.png`.

## One water status, the typed day in its box, nothing cut off (2026-10-04)

- **"Water settled" gone from the row;** the header's dot says "Settling…" while the water plays into place (and for
  the checks' own settle), as it says "Checking the map" and "Ready to play". Tests wait on `dgmEditor.waterSettled()`;
  sittingB's B14 test is renamed to what it checks now (the water's state, no bar words).
- **The typed day:** the field was always in the box; what Kyler saw was the tooltip, opening on the field's focus as a
  box under the day box, its pointer the stray arrow. No tooltip while a day is typed.
- **Nothing cut off:** every setting measured with its longest value and Auto, every tool, at 62 and 76px cells. Carve's
  Wander gets 3 cells (row 1: Power 2, Size 2, What it leaves 3, Wander 3, Walls 3; row 2 as before), and Select's
  buttons 4px padding ("Cut down" was 1px short at 62px). `layout.spec.ts` now checks this for every tool.

## Your maps: only edited maps, selection, Rename and Delete (2026-10-05)

- **Kept maps (D330):** a map joins Your maps at its first operation applied (its version moving after it opened)
  or a rename; bookmarks alone don't. Once kept it stays kept. No 4-second save; Generate saves the open map first
  only when kept, and Cancel brings an unkept one back from memory. Tests that expected every map kept now count
  `.ym-tile`; viewAndHeader's bookmarks test checks bookmarks alone don't keep a map, then that an edit does.
- **Selection:** Ctrl-click toggles, Shift-click a range, a plain click opens and clears; a tint and a check mark.
- **Heading row:** new (there was none): "Your maps", Rename and Delete; Delete asks "Delete <name>?" or
  "Delete N maps?". The confirm dialog now sets its focus itself (autoFocus worked once a page) and Esc cancels it.
- **Delete key:** decided by what is under the pointer when it's pressed, or a tile focused with Tab.
- "Undo to get <name> back" after a Generate doesn't exist in the page; only Cancel does.

## Three settings rows and the forces' Sources (2026-10-05)

- Kyler chose a third row for every tool (one height kept): 175px, rows of 53px (a plate's name, gap and control
  exactly; 54 left the map generator a pixel short at 1920×1080). Every force's Try another at cells 10–13 across rows 2
  and 3; the brushes two settings a row (Brush alone on the third row without Flatten's Steps); Select's actions over
  rows 2 and 3. Sources (Ride, Clear; Clear by default) in every force, remembered per force, sent as
  `settings.sources` (D474), Try another sending the row's choice. Checked in Chrome: Clear removes a struck source,
  Ride keeps it.
- The readout over the minimap is kept left of the settings (it wraps instead; it reached under them at 1920 with a
  long readout); the panels reserve two readout lines where it is narrow; their room is measured against the dock's
  pieces, not its whole width (the first run's hints sit centred, not under the panels).

## Rows sharing their edges, Your maps' names in full (2026-10-05)

- Every tool's rows share their edges (the planning chat's review of 96f36792): the forces on cells 3, 6 and 9 with Try
  another at 10–13 over rows 2 and 3; the brushes on 6; Select on 3, 6, 9 and 11 (Fill up moves to row 3). `layout.spec.ts`
  checks it for every tool.
- Your maps' names: Real places' form, two lines kept for the name (17px each: 16 left a 1px overflow) and the size on
  its own line; all 365 names the generator can make fit at 1920 and 2560, every tile 206px tall. A renamed name longer
  than two lines ends in an ellipsis.
- The delete dialog's Enter already deleted (checked with the Your maps push).
