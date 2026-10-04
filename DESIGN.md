# Dam Good Maps: the design

The look of the page (PLAN §20 D384), built with "The page is the editor" ([docs/UI-BRIEF.md](docs/UI-BRIEF.md)).
The page session records its design decisions here; the work is logged in
[docs/progress/page.md](docs/progress/page.md). Every later interface follows this document.

## Order of authority

1. The plans: `PLAN.md` §20, `EDITOR_PLAN.md`, `docs/UI-BRIEF.md`. They say what the page does.
2. **Meaning** (below): what each colour, mark, word and state tells the player.
3. The look. When a look rule and a meaning conflict, the meaning stays and the look changes.

## Three zones

- **Map:** the 3D view, its sky, overlays, markers, ghosts, rings and the compass. Its colours are the map's own
  (`src/render3d/`, `waterPalette.ts`); the design never styles it and puts nothing over it but controls.
- **Instruments:** everything used while working: the rows, the shelf, the top-right cluster, Save and the checks dot,
  the hover readout, the water bar, tooltips. Flat, calm, system UI face, tabular numbers with their units.
- **The panel:** the map as a whole (the switch, the settings, the candidates strip, the map card, Your maps). The one
  place the display face appears: the map's name.

## The direction: Lamplight

*Kyler accepted this look (v3 of its mockups, with six changes that are written in below) on 2026-10-02, then set
it aside the same day beside the current editor (17:36; "Set aside", below): the current editor's dark chrome,
layout and states win, and Lamplight's colours, wood tokens and Bitter are history. What survives is in "The
one-page editor" and the handoff in docs/progress/page.md.*

**The goal (Kyler).** The layout feels seamless and easy to understand: a new player knows what everything is and
where to find it at a glance, with nothing jumping, crowding or needing to be decoded.

**Thesis.** The map is a lit diorama on a workbench at dusk; the interface is the dim workshop around it. The land is
the brightest, most colourful thing on screen, and the controls recede into warm dark wood. One thing is lit.

**Why, against the brief and the High look.**
- "The map is the hero; the interface small and quiet" (D158): dark plates sit below the land's brightness, so the eye
  goes to the land.
- The High look is warm sunlight on green, teal and grey-brown land under a blue sky. Warm dark brown is the sky's
  complement and the land's shade: the plates read as part of the scene's shadow.
- It reads as Timberborn's kin (dark warm panels, cream text) without copying its interface.
- There is no hue accent: green and amber belong to the checks dot alone, and nothing in the interface borrows a
  water, badwater or contamination colour.

**The accepted mockups** (River Valley 4242 at 128², the High look). The page as built differs from them where
Kyler's six changes say so: the lines are centred, a settings section is a sheet, and the pinned legend line is Active:
[Carve in hand](docs/design/lamplight-v3-1-carve.jpg) ·
[a shelf object picked, its ghost on the map](docs/design/lamplight-v3-2-shelf.jpg) ·
[the Water settings open](docs/design/lamplight-v3-3-settings.jpg) ·
[the panel collapsed](docs/design/lamplight-v3-4-collapsed.jpg) ·
[Carve in hand at 1366×768](docs/design/lamplight-v3-5-carve-1366.jpg).

### Kyler's decisions (2026-10-02; the milestone session numbers them when the page merges)

- **Every tool has a visible name, always:** the brushes, the forces, the shelf's objects and the view bar's items.
  Undo, Redo and ⋯ stay icons, with tooltips naming them.
- **Keys appear only on hover,** as the key cap at the end of the tooltip (D351). No key caps on buttons.
- **The shelf is on the right,** directly under the top-right cluster and on its two edges (this replaces
  EDITOR_PLAN's "left shelf"). Its objects are small renders of their models in the map's look, drawn by the view
  (D184), each with its name.
- **Slow forces is a button that says "Slow forces",** exactly as wide as the level control and directly under it;
  Sound sits directly under the compass.
- **The panel's Generate side holds every generation setting,** under its real name ("Designed for").
- **The map card has no difficulty ratings** (this changes UI-BRIEF §3's five levers). Its legend names everything:
  picture, count, name, in aligned columns, only for what's on this map.
- **The rows have no clusters and no dividers** (this changes D352's three force clusters): every row is one evenly
  spaced line from the left, in the order the items have now.
- **The panel never changes shape or jumps:** every part has a fixed place in every state.
- **A settings section opens as a sheet** over the panel's lower part (the versions strip, the card and Your maps),
  at the panel's full remaining height, and closes back to the list of sections. Nothing under it moves.
- **The tools, the forces and what is held are centred in the rows' plate;** the view bar stays at the left.
- **Every shelf and legend picture is drawn by the view at its real size,** never enlarged; Slope's shows its ramp.

### Two treatments, and buttons

| Treatment | Looks like | Used for |
|---|---|---|
| **Lit** | cream fill, dark ink, a soft warm glow | the primary action, and nothing else |
| **Active** | a dark well, cream words, a cream bar beneath | what is held (a tool, a force, a shelf object), what is on (a view toggle), the open settings section, a pinned legend line |
| A button | a raised piece of the wood | something that acts when pressed: Top-down, Reset view, Try another, More, Drought, Badtide |

A choice among a few (the switch, Designed for, Keep river · Dry canyon) is a segmented control: the chosen side is
raised. The shown version in the strip has a plain cream ring. Nothing changes weight when it becomes active, so
nothing shifts.

**The primary action while editing is Save to Timberborn,** top right, and it is the only lit thing on the screen.
**Generate is the panel's main button:** tall, bold, lighter wood with a cream outline and a raised edge that
presses down, so it reads as a button to press and never as disabled (while a map is made it says what it is doing);
Surprise me beside it as a plain underlined word; a small cream dot on it when the settings differ from the shown
map. With the panel collapsed nothing changes: Save stays lit in the same place, and Generate comes back with the
panel (it runs only from its button or Enter in the panel, brief §5).

### Layout

One height (38px) and one gap (6px) for every plate outside the panel; everything sits 12px from the window's edge.

- **The panel** (340px, a plate inset from the edge; it collapses to a 44px strip that still names the map, set
  vertically). Every part has a fixed place and height, in every state:
  1. "Dam Good Maps" in the system face, and the collapse button.
  2. The switch: Generate · Real places.
  3. Theme, Size, Seed and Designed for, two to a line, each under its name.
  4. **The sections:** Terrain, Water, Hazards, Resources, Advanced: start rules and Limits for this size, six
     lines that always show, each with a chevron pointing on. One opens as a sheet over the panel's lower part, at
     its full remaining height, with every field under its real name and its official-maps line; the sheet's head
     names the section, goes back to the list (Esc too) and holds Reset all to the theme's. The open section's line
     is Active. Sources: Placed · None will be Water's first field (brief §8, with M9b).
  5. Generate, and Surprise me.
  6. The versions strip (its place is kept when it is empty; More is always there).
  7. The map card: the name (Bitter 700, one line); the "how it plays" line (two lines); the legend, four lines in
     two aligned columns of picture, count, name (hover highlights those things on the land, a click pins the line);
     trees in reach with their logs.
  8. Your maps takes what height is left and scrolls inside itself (at 768px high only its heading shows first).
- **The rows** are one plate with one left edge beside the panel, four lines divided by hairlines: the view bar, the
  tools, the forces, and what is held. Every line is evenly spaced, with no clusters or dividers; the view bar
  starts at the left, and the tools, the forces and what is held are centred. The view bar alone sets the plate's
  width (615px); the other lines wrap inside it and never widen it. The plate is always at least four lines tall:
  the last shows the held tool's settings (a long row takes a second line, D345), the held object's name and what
  to do with it, or, with nothing held, "Pick a tool, a force or an object". The first run's hints sit under the
  plate, never in it.
  - **The view bar** is the quietest line (12px). Top-down and Reset view are buttons; the rest are toggles: plain
    quiet words when off, Active when on.
- **Top right:** Undo, Redo and ⋯, the checks dot with its words, Save to Timberborn. Beneath, the cluster as a grid
  of two columns: the level control (132px) and the compass (38px) in the corner; Slow forces under the level
  control, Sound under the compass.
- **The shelf** hangs under the cluster at the same width (176px): one object per line, a 28px picture then its name,
  in five groups divided by hairlines. The view draws each picture to fill its tile. Fifteen objects fit at 1366×768
  above the water bar; when more arrive it scrolls inside itself, names kept.
- **Bottom left:** the hover readout. **Bottom right:** the water bar (its status, Pause, Speed, Skip, Replay,
  Drought, Badtide), and above it the look's menu as a small plate.
- **The default view fits the whole map in the free space:** right of the panel, left of the shelf, under the rows
  and above the bottom bars, for the layout as it is when a map opens or Reset view is pressed. Collapsing or opening
  the panel never moves the camera by itself (D265).

At 1366×768 the rows end 19px short of Save's plate. A map with roofed water adds an Under roofs toggle, which
doesn't fit on the line there: the plate stops 12px short of Save and the view bar takes a second line. Checked at
checkpoint 1 with the ninth toggle put in by hand; no map with roofed water was on the machine.

### Tokens

| Token | Value | Use |
|---|---|---|
| `--wood` | `#2b221c` at 94% | plates and the panel |
| `--well` | `#1a1410` | wells: fields, slider tracks, segmented controls, Active |
| `--raised` | `#46392f` | buttons, the chosen side of a segmented control |
| `--main` | `#6a5646` with a `--cream-2` outline | Generate |
| `--rule` | `#54453a` | hairlines |
| `--cream` / `-2` / `-3` | `#f3e6cc` / `#cdbfa6` / `#9d907c` | words: primary, secondary, quiet |
| `--lit` / `--lit-ink` | `#f6e7c1` / `#2a2019` | Lit |
| `--ok` / `--warn` | `#7fc46b` / `#f0a63a` | the checks dot, always with its words |

**Type.** The system UI face, 13px, tabular numbers. The map's name: Bitter 700 (OFL, self-hosted, one weight).

### Still to come

- Variety joins Theme, Size, Seed and Designed for when M9b brings the setting.
- The shelf's pictures at their real size, and the default view fitted to the free space, need two small changes
  in the renderer (`thumbnail()`'s framing, `frameMap()`'s insets); until then the pictures are the present renders
  and the view is centred in the window.
- The map's name is in Bitter once its font file is in the repository; until then it falls back to Georgia.
- The versions strip, the legend and the trees line (checkpoint 2) and Your maps (checkpoint 3) are not built yet;
  the card shows the name, the map's premise and a quiet line of facts.

## Proposed after checkpoint 1's sitting (v4): set aside

*History. Kyler set the floating-plate layout aside on 2026-10-02 ("Set aside", below); of this round only Select
in hand (1) is kept, as a ruling to build on the current editor; the phone layout waits on D185.*

Kyler's six notes on the preview (2026-10-02) and what the mockups propose for each. All on River Valley 4242 at
128², the High look, framed by the page's own fit; the backdrops are the real page's renders.

**1. Never an empty fourth line: always a tool in hand.**
- [Select in hand](docs/design/lamplight-v4-01-select-in-hand-at-rest.jpg) (Kyler's proposal, and the one
  recommended): Select is held when a map opens; Esc and X return to it; the fourth line shows how it marks
  (Rectangle, Circle, Freehand, Brush, Wand) and Whole map. What it changes: a drag on the land marks an area, where
  today it turns the view (the right button, Q and E and the keys still do, as in Timberborn); a click on an object
  still picks it, so the plain pointer's work is folded into Select.
- [The alternative](docs/design/lamplight-v4-02-alternative-three-lines.jpg): nothing held, and no fourth line. The
  plate is three lines; a tool's settings ease in under them when it is picked. Nothing changes in how a drag
  works, but the plate changes height.

**2. The phone** (402×874 and 874×402; iPhone, Safari).
- [Portrait](docs/design/lamplight-v4-10-phone-portrait.jpg): the map fills the screen under the status bar and
  Safari's bar. One bottom bar, above Safari's: Generate, Tools, Share, each named, 52px tall. The map's name and its
  checks are one pill at the top (a tap opens the map's card, legend and Your maps as a sheet); the compass beside
  it. A held tool shows as one strip above the bar with its main setting and Put away.
- Bottom sheets: [Tools](docs/design/lamplight-v4-11-phone-tools.jpg) (Tools, Forces, Objects, View: named buttons
  56px tall, each with a line saying what it is, since nothing can depend on a tooltip),
  [Generate](docs/design/lamplight-v4-12-phone-generate.jpg) (the settings as 48px rows, the sections behind More
  settings) and [Share](docs/design/lamplight-v4-13-phone-share.jpg).
- [Landscape](docs/design/lamplight-v4-14-phone-landscape.jpg): the bar becomes a rail on the right, clear of the
  camera island and the home bar; sheets come [from the right](docs/design/lamplight-v4-15-phone-landscape-tools.jpg).
- Sizes come from `100dvh` and `env(safe-area-inset-*)`, with `viewport-fit=cover`, so the bars follow Safari's
  moving toolbar and nothing sits under the island or the home bar.
- **What a phone can do:** make a map, look round it (one finger turns, two move and zoom), turn the view's layers
  on, read the card, use the forces and the brushes with one finger while one is held, place objects with a tap,
  share the link, download the file. **What it can't:** Save to Timberborn (Safari has no folder access and the
  game isn't on phones), keys, the hover readout (a long press shows it), pen pressure. **Share replaces Save** as
  the lit button: send the link to open on a computer, download the .timber to Files, or save the project.
- Two things for Kyler: editing on a phone changes D185 (phones were view-only); and no phone has been measured:
  the look falls back by itself, but the forces' speed on a phone is unknown.

**3. Widths.** [1280×800](docs/design/lamplight-v4-07-at-1280x800.jpg),
[1024×768](docs/design/lamplight-v4-08-at-1024x768.jpg),
[1024 with the panel open](docs/design/lamplight-v4-09-at-1024-panel-open.jpg).
- The right column is one width (176px) for everything: Save to Timberborn; Undo, Redo, ⋯ and the checks; the level
  control and compass; Slow forces and Sound; the shelf. The wide Save plate is gone, so nothing beside the rows can
  collide with them.
- The rows' plate is as wide as its lines, never fixed, and never wider than the space between the panel and the
  right column: its lines wrap inside it before it can touch anything.
- Under 1280 wide the panel is a drawer: a strip that opens over the map and closes again, so the rows keep their
  room. From 1280 up it sits beside the rows as now.
- The look's menu moves beside the water bar on the bottom line, so the shelf has the column to itself.

**4. Hierarchy in the rows** ([Carve in hand](docs/design/lamplight-v4-03-carve-in-hand-rows-in-use.jpg)).
- The view line is what the map shows: each layer a ticked box with its name, filled when on, readable at a glance.
  The camera's two actions, Top-down and Reset view, are buttons set apart at the line's end behind a hairline.
- The tools are quiet: icon and name.
- The forces have their own band: a warmer ground, lit icons with a glow, brighter and heavier names.
- The tool in hand has a cream ring round a dark well, with bright words: one ring on the screen.
- Generate is tan leather with dark words and an edge that presses down: plainly a button, and not Save's light.

**5. Let the map lead.**
- [At rest](docs/design/lamplight-v4-01-select-in-hand-at-rest.jpg) every plate thins to three-quarters wood with
  quieter words, and Save's glow halves; the tool in hand keeps its ring. A plate comes back to full under the
  pointer, while it has the focus, and while it is in use
  ([the rows in use](docs/design/lamplight-v4-03-carve-in-hand-rows-in-use.jpg));
  [everything bright](docs/design/lamplight-v4-04-before-everything-bright.jpg) is how it is today.
- The shelf, to choose between: always open, as now (any image above), or
  [closed to one button, Place objects](docs/design/lamplight-v4-05-shelf-closed.jpg), opening
  [while placing](docs/design/lamplight-v4-06-shelf-while-placing.jpg) and closing when the object is put away.

**6. The moments.** Nothing pops; every change eases over 150–200 ms; with reduced motion they happen at once.
- A new map arrives: the old land sinks away as the new land rises into place from flat, the water flowing in after
  it and the trees last, about 1.5 s in all; a click skips it (D240). The interface doesn't move while it happens.
- A sheet opens: it slides up over the panel's lower part and fades in over 180 ms; it closes the same way down.
- A tool is picked: the ring moves to it and the fourth line's settings cross-fade over 150 ms; the plate keeps its
  size.
- A plate wakes: its wood and words ease to full over 150 ms under the pointer, and back over 400 ms after it leaves.
- The panel collapses: it narrows to its strip over 200 ms and the rows slide beside it; the camera stays where it is.
- The shelf, if it opens only while placing: it unrolls downward over 180 ms.

## The one-page editor: the current editor's skeleton, refined (Kyler's verdict, 2026-10-02 17:36)

**Status (2026-10-02 19:32): v8 approved for the build, with seven changes that go into the build; the build is on
`feature/page`** (its decisions below, "The build") (the handoff in
docs/progress/page.md lists them in full): no scale-up at any size and the `?ui` parameter removed; the right column
13px wider so every legend line fits; the Badwater caption one line, "Badwater: dark brown · Contaminated soil:
light brown"; the "Markers on:" heading one weight; the drawer's head an editable name field for the current map
(kept in Your maps, used by Save to Timberborn and the .timber file; a new map starts with a default name); Your
maps at the drawer's foot (name and size, newest first, the current map marked, a click opens it; no stars or
thumbnails); the legend panel as tall as its content with equal padding top and foot, scrolling only when taller
than the room above the water bar. Where this section says otherwise, the verdict wins.

**Kyler's sitting on the build (2026-10-03); where it meets "The build" below, this wins:**
- **One left column, one width:** the palette and the Maps drawer share the left column at 352px, wide enough for
  the drawer. Opening or closing the drawer swaps what the column shows; nothing else moves or changes size (the
  map, the toolbars, the minimap, the readout, the right column). The palette shows four tools to a row, each with
  its picture and name. Nothing overlaps at any window size.
- **The header:** the button is **Maps**. The map's title is renamed in place: a click turns it into a field at
  exactly its place, size and font; Enter or leaving saves through the core (`MapSession.setName`), Esc cancels; a
  blank name is refused in the core's words, said in the title's second line; a rename is never an undo step
  (D443). Its tooltip is "Rename". The second line reads "Seed 4242 · 128×128". There is no name field in the
  drawer.
- **The Maps drawer,** top to bottom: Generate and Surprise me pinned at the top; under them, scrolling as one
  panel: what is on the map (picture, number, name; no description); Theme and Seed; Size; the sections Terrain,
  Water, Hazards, Resources, Difficulty, Limits for this size, each opening in place under its own row (several
  at once, only the rows below moving down); Your maps as square tiles, two to a row, each the map's stored 64px
  picture with its name and size under it, newest first, the open map marked, a click opening it.
- **Difficulty replaces "Designed for":** no Easy/Normal/Hard. "Advanced: start rules" is **Difficulty**: Starting
  wood, Max walk to water, Starting berries, Start area, No ruins within, at Normal's values. Every map is made for
  Normal until the milestone session removes difficulty from the core after M9b's release.
- **No explanations under settings:** no grey line under any setting. Where the line gave the official maps' range,
  it is in the setting's tooltip as a short phrase after its purpose ("… · Official maps: 9–15").
- **The height slice:** one control, ▾ value ▴, at one fixed width. The value runs up to 22 (the game's highest
  terrain), then ∞, on every map; the first step down from ∞ goes to the map's highest ground less one, as the
  game's does (amended after the second checkpoint); up runs through every level to 22, then ∞; a click on the value shows the whole world. There is no
  separate ∞ button. Alt+scroll and Alt+middle-click on the map keep the game's own stepping.
- **After the second checkpoint (Kyler, 2026-10-03):** the counts above Theme always show all five kinds, zeros
  too, so nothing below moves when the map changes; the seed's lock is a named toggle, **Keep**, always there, so
  the seed field keeps its width; Your maps' tiles end on the drawer's right edge; Generate and Surprise me split
  where Theme and Seed do; Generate always says "Generate" (its progress while busy, at the same size); the title's
  rename is a clean field of exactly the title's size, with no outline bars; the dot says its count once ("3 things
  to look at"); its list has no lines under its headings and no checks' ids.
- **No notices strip (amends D213's quiet line):** the strip under the map is gone, since it changed the page's size
  and the player knows what they did. When the map's last badwater spring goes, the quiet dot's list says "No
  badwater" under Good to know, not counted; an opened file's import flags are in the list with their fixes, counted
  with its other items. The session's notices, the import change count and the import warnings are shown nowhere.
- **The two flakes** (D341): look-high's "Standard after High" and the 256² Islands preview are fixed at their
  cause before #163 merges.

**Layout 2 mockups (2026-10-03): the design to build.** Kyler's Layout 2, settled over eight rounds of mockups on
2026-10-03, for 2560×1440 and 1920×1080 only (smaller windows are not designed). Captures of the real page
rearranged (River Valley 4242 at 128², three states at both sizes): [docs/design/layout2.html](docs/design/layout2.html).
- **The header:** at the left, **Map Generator** opens and closes the left panel: a tinted button (the mint at 12%
  behind it, a mint outline at 60%), a small folded-map icon in the mint and the name in the heading's weight; lit
  like the toggles (mint fill, dark ink) while the panel is open. At rest Save to Timberborn stays the only filled
  control. The rest of the header as now.
- **The left panel** (352px, the drawer's look; closed, the map takes the whole window): Generate and Surprise me
  pinned at the top; under them, scrolling as one: **Name** (the drawer's field, full width, the same name as the
  title), Theme and Seed (with Keep), Size, the sections Terrain, Water, Hazards, Resources, Difficulty, Limits for
  this size (each opening in place), the counts (Mine sites, Berry patches, Ruin fields, Forests, Rivers), then
  **Your maps**: two to a row, each the map's whole picture in a square box about 142px wide (never cropped: a
  map that isn't square sits centred in it), its name and size under it, the open map marked. The pictures are the
  core's top-down thumbnail at 256px (`thumbnailPixels(…, 256)`), scaled to the box; the core never enlarges, so a
  128² map's picture is 128px.
- **Top left of the map:** the Show toggles as one column of rows, one width, left edges aligned: Heights, Lines,
  Markers, Flow, See-through, Badwater (Under roofs added when a map has roofs), then **Legend**, last. Each row has a
  14px square checkbox
  at the left of its name (a 1.5px quiet border, 3px corners; ticked: the mint fill with a dark tick), as in
  Timberborn's settings; the row itself is never lit, and a click anywhere on it toggles it; several can be on. An
  overlay's legend sits beside its row while it is on (Heights: "Ground height", the ramp, the map's lowest and
  highest level).
- **The Legend,** ticked, is the key to the normal view: the legend panel as the page draws it (the ground colours,
  Water, Badwater, Mixed water where present, Walls, Dead trees, Trees and bushes, every object on the map, and under
  "Markers on:" the markers' meanings), directly under the Show column, its left edge on the column's, as wide as
  its longest line (183px on River Valley 4242), down to 8px above the minimap at most. Its rows are 20px, even,
  at the legend's own type size; content taller than the room scrolls inside it. At 1920×1080 River Valley 4242's 21
  lines need 456px of the 472px there (16px to spare); at 2560×1440 there are 832px.
- **Top middle:** the water controls in one row, centred in the map area: Water settled (plain text), Pause water,
  Speed, Skip, Replay, Drought, Badtide, each control floating on its own. An unavailable one (Pause water, Skip and
  Replay while the water is settled) has a fainter plate (the plate's colour at 38%, no shadow) and fainter words
  (42%); available ones are unchanged.
- **Top right:** the camera group (Top-down, Reset view, the compass), then the height slice, Slow forces and the
  sound under them, as a three-column grid 310px wide (the sound under the compass).
- **Bottom right: the objects,** a menu always shown, with no headings: one object per row, its picture then its
  name, in this order: Start, Water source, Badwater source, Natural dam, Pine, Birch, Oak, Berry bush, Ruin, Mine
  site, Relic, Slope, Thorns, Blockage, Geothermal field; on one panel 166px wide and 492px tall. Rows are 30px tall,
  2px apart, the pictures 28px, 8px before the name, every picture and name on one line down the list. The panel's
  right edge is on the page's 10px margin (the top-right controls' too) and its bottom level with the bar's bottom.
  Picking an object lights its row in the mint, as the bar lights a tool.
- **Bottom left:** the minimap, under it the coordinates ("X 60 · Y 66 · Z 10", the game's order), then the readout.
- **Bottom middle:** one bar, centred in the map area: Select, Raise, Lower, Flatten, Smooth, Naturalize, a hairline,
  Carve, Craterize, Erupt, Quake, Glaciate; eleven 76px cells, icon above name, keys only in tooltips. The held
  tool's settings sit directly above it at its exact width, on a grid whose columns are the bar's cells: each group
  spans whole cells, its label above its control, on one row:
  - **Select:** How to select 6 (cells 1–6, one shape per cell, icon above its name: Rectangle, Circle, Freehand,
    Brush, Wand, Whole map); in cells 7–11, with no heading, "Drag on the map" then Shift and Alt as key caps
    ("Shift adds · Alt takes away"), centred across and down. No close button.
  - **Raise** and the other brushes: Size 1 · Level 3 · Mode 2 · Sources 2 · Brush 3 (Square, Straight lines).
  - **Carve** and the other forces: Power 3 · Size 3 (with Auto) · What it leaves 3 · More 2.
  - **An object** (a source): Next source 3 (its strength).
  - **More** opens upward inside the panel: its settings take further rows of the same grid above the first, each
    group on whole cells; the bar never moves.

Where it doesn't fit, and what the mockups do:
- **The Legend at 1920×1080** has 16px to spare on River Valley 4242 (21 lines). A map with more lines (Mixed
  water, Blockage, Other objects, Under roofs' row in the column) passes the room and scrolls inside the panel; each
  line more takes 20px.
- **The objects menu** clears everything at both sizes, panel open or closed, with Raise's settings too: it starts
  168px right of the bar and its settings at 1920×1080 with the panel open (344px closed; 488px and 664px at
  2560×1440), 405px below the top-right controls at 1920×1080 (765px at 2560×1440). It lies over the map's lower
  right corner, and the default view doesn't make room for it.
- **The objects menu needs a panel behind it** for its rows; every control floats without one.
- **Select has no close button:** the selection closes with Esc or X only (its tooltip held those keys).
- **Your maps at 1920×1080:** with five maps the panel scrolls by 178px, so the third row of pictures starts below
  the fold. At 2560×1440 nothing scrolls. A 128² map's stored picture is 128px, shown slightly enlarged in its box.
- **"Water settled"** is plain text over the map's sky, with a dark text shadow so it reads.
- **The minimap** sits 38px higher than on dev (86px from the bottom, not 48) to make room for the coordinates' line
  between it and the readout; the coordinates take the readout's plate.
- **The camera:** opening or closing the panel widens or narrows the map area, and the bar and the water row
  re-centre in it; the mockups frame the map afresh in each state, while the build keeps the camera still (D265).
  The default view should fit the map between the water row and the bar, which needs insets in `frameMap()`.
- **"Brush"** heads Raise's Square and Straight lines, which have no name of their own as a group.
- **The coordinates repeat the readout's height** ("Z 10" over "Height 10, dry soil"); the readout could drop its
  height.

**Layout 2 as built (2026-10-03, Kyler's yes to round 8 with the Legend).** As the design above, with Kyler's two
refinements and what the mockups left open:
- **The legend** shows each object with the objects menu's own picture (Trees and bushes with the pine's); the ground
  colours, the water and the markers keep their swatches. Its rows are one height on every map, 17px: the fullest
  legend (20 lines, "Markers on:" and its 4 lines, with Under roofs added to the Show column) needs 437px at
  1920×1080, exactly the room above the minimap (its tallest, 168px, less 8px). It is one width (190px, its longest
  line's), never scrolls, never changes shape, never overlaps the minimap; on a map with fewer lines it is shorter.
- **The settings, option B** (Kyler's pick, 2026-10-03, with his five fixes): one panel at the bar's width, 120px
  for every tool, two rows on one grid of the bar's own 11 cells, every setting a plate on whole cells (its edges on
  the bar's cells, 2px between plates), no empty cells, More gone. One number look (a slider, its value at the right
  of its name), one choice look (segmented; toggles as Off and On), Auto one word in one place; Auto's pick outlined
  (a hollow knob on an unfilled slider, an outlined option), the player's filled; names 13px, one size, brighter;
  no keys written in the panel (Select's "Shift adds · Alt takes away" moved to its shapes' tooltips; a force at
  work's "Esc to skip · Ctrl+Z to undo" to Revert's). New: Smooth's and Naturalize's Strength, Quake's Side, Steps
  (Off, 2, 3, 4) for Flatten; the area brush waits on #227 to join Brush. The panel's 120px is set by Carve, the
  fullest (nine settings and Try another, five plates a row). The rest of this item describes the build before.
- **The settings on the bar's cells:** each group keeps its place on every tool of its kind, an empty place left
  empty, so nothing jumps between tools: Smooth and Naturalize (no Level) give Size cells 1–4; Flatten's In steps
  takes cells 9–11 of the row above; Quake (no Size) has its Lift or Slide in the choice's cells 7–9; Glaciate's
  choice is Meltwater, under "Water". **Try another** (Carve's too, no longer "Try another path") sits beside More in
  cells 10–11. More's details are three cells each (Debris and Flows four, Benches and Steps five), the Floor last.
  A force at work: its status 1–5, Pause 6 (Carve), the keys 7–9, Revert 10–11.
- **Select, one layout with or without a selection** (Kyler, 2026-10-04): row 1 the six shapes (cells 1–6) and the
  size ("13 × 13 tiles"; "Drag on the map to select" before a selection) in cells 7–11; row 2 Level 1–2, Up 1, Down 1,
  Flatten, Cut down, Fill up, Delete (its menu opening upward), Max water depth 9–10 and Apply 11, greyed until there
  is a selection (Max water depth and Apply until it holds water deeper than 1). Selecting changes only what is
  enabled, never the layout.
- **No text caret and no text selection** on any control or label (Kyler, 2026-10-04); only a real text field (the
  Name, the Seed, a rename) takes a caret.
- **An object's settings leave the bar** (Kyler's sitting, 2026-10-03): they sit in a small window directly above
  the objects list, its edges on the list's, 6px between them (the page's gap between plates), the list's own panel
  look, each name above its control as on the bar. It shows only while an object is picked and its height follows
  what that object has; the list never moves. Picked in the list: a source's Next source and Pointing at; a ruin's
  Height; a relic's Size. Picked on the map: a source's Strength, This source, Water, Power (Unleash's), then Unleash
  and Remove side by side and, after an unleash, Try another; a picked object's Delete. Put it down (×) sits on the
  first name's line at the window's right, or after the controls where the first has no name. The bar's settings
  row is for the tools only: an object picked shows no row above the bar (Select's own row gives way while one is
  picked on the map). "Drag it to move it" is gone. At 1920×1080 a source picked on the map takes 267px (303 with
  Try another), clear of the camera group.
- **The overlays' captions** sit beside their rows while on: Heights' "Ground height" with the ramp and the map's
  lowest and highest level; Badwater's and Under roofs' one-line captions.
- **The minimap is always shown** (the mockups have no Minimap toggle); its toggle is gone.
- **The bottom-left group** (Kyler's sitting, 2026-10-03): the coordinates, the readout under them, then the minimap
  at the foot, on the page's 10px margin, the minimap's bottom level with the bar's and the objects list's; each
  plate 32px, 6px between them, so nothing moves as they show. At its tallest (a square map's 168px minimap) its top
  is 254px above the map's foot, where the minimap's top was before, so the fullest legend still fits at 1920×1080
  with the same 437px.
- **The map generator lies over the map** (Kyler, 2026-10-04): opening it never resizes the map. The panel sits at
  the window's left edge, vertically centred between the header (10px below it) and the bar (11px above it, so the
  room is an even number of pixels and a centred panel sits on whole pixels), over whatever is there while it is open.
  The map area is the whole window, so the title, the water row and the bar all centre on the window (960 and 1280,
  to the pixel; the bar's hairline column is 14px so the bar is 880px, an even width). The camera's insets are the
  top row (the water row and the camera group), the Show column and the bottom-left group (the left: whichever
  reaches further), the bar with its settings, and the objects list with a picked object's window, each as far as it
  reaches plus 8px (`src/editor/view/insets.ts`), kept up to date as they change; setting them never moves the camera.
- **The map generator's two structures** (mockups, 2026-10-04, for Kyler's pick; `?gen=a`, `?gen=b`;
  [docs/design/layout2.html](docs/design/layout2.html)): 640px at both sizes, every setting showing, nothing
  scrolling, every setting through `src/editor/generator/fields.tsx` in the bar's control language. **A, the sheet:**
  a title block (Name, Generate and Surprise me; Theme; Seed and Size), then the five groups in three columns (Terrain
  and Difficulty, Water and Hazards, Resources and On this map); two named tabs on the left edge (Map Generator, Your
  maps). **B, the board:** the bar's 76px cells eight across, the first column Generate, Surprise me and the groups'
  names as tools' cells; one tab on the left edge, Your maps in the header, On this map a line at the foot. In both
  the tabs sit flush on the window's edge, 32px wide and 152px tall, and the left side's controls (the Show column,
  the coordinates, the readout, the minimap) stand 42px from the edge to clear them. 640px rather than a third of the
  window at 2560×1440 (853px): the controls are the bar's sizes, with no scale-up, so more width would only stretch
  the sliders and cover more map. "Limits for this size" goes; nothing else is cut.
- **Dialogs** (Kyler, 2026-10-04): every one centred on the window, its buttons centred in it; a dialog of words (a
  map being made, a question such as "Delete <name>?", About) has its words centred too. The export dialog's lists of
  checks stay left-aligned.
- **The first-run hints** sit above the bar's settings and say "Carve below" and "on the right".
- **A map being made** (Generate, Surprise me, Another like this; Kyler, 2026-10-03): the page's dialog over the editor,
  400px, one line of the generator's own words ("Running the rivers…") and **Cancel** (Esc too); nothing else can be
  clicked or started meanwhile. Cancel ends the generator's worker and opens the map that was open again in a new one,
  from its project saved just before (its edits, history and view as they were; "Opening your map…" meanwhile). A
  failed map turns the dialog into its words and Close. Generate's button no longer says what is happening.
- **This source** in the object window is one line, a control's height: "1.45 water/s", or in a row "1.45 of 5.79
  water/s" (this source's, of the row's); Pointing at the same.
- **No focus ring on the map from the mouse:** a click on the map after a key no longer outlines it; Tab still does.
- **Your maps' right-click menu** (Kyler, 2026-10-03): on any map, open or not, the File menu's look at the pointer,
  kept on screen, closed by Esc or a click elsewhere: **Download .timber file** (a closed map's made from its project
  in a worker of its own), **Rename** (in place, on the name's own box, font and size; Enter or clicking away
  renames, Esc cancels; the open map's is the title's rename, D443; a closed map's name is the one it opens with),
  **Delete** (asked once, "Delete <name>?"; the open map gives way to the next map in Your maps, or a new Surprise me
  map when none is left). The browser's own menu doesn't open on the pictures. Your maps' two columns are now equal
  halves whatever the names (a long name widened its column, and a rename made it jump).
- **Turn** (Kyler, 2026-10-03): an object that turns has its Turn in the object window, 0°, 90°, 180° and 270°, the
  one R steps through.
- **Every field shows its whole value:** Theme, Seed (with Keep) and Size each take a full row (a ten-digit seed, or a
  word up to 24 letters, fits), and the map's Name wraps onto more lines when it is long.
- **Your maps under a solid scrollbar:** with Windows' solid scrollbar showing (15px), every picture stays clear of
  it (the columns are equal halves inside the panel's own room).
- **The counts** sit under a small "On this map" label, Your maps' style; Forests became **Trees**: every living tree
  on the map as it is, edits included (dead ones aren't counted), with thousands separators.
- **Opening a map is lighter** (Kyler's slow presses, 2026-10-03): the editor keeps its 3D renderer from one map to the
  next (it was thrown away and made again, its programs compiled again, on every map), and the features' tile index
  is built when first read, not as the map opens. At 256² the main thread's work as a map opens fell from about 0.6 s
  to 0.26 s (the renderer's own `setMap`).

**The build (2026-10-02, after the v8 verdict; Kyler's answers to the handoff's questions, 2026-10-02):**
- **The header below 1,219px:** the info's second line goes first, then the name ellipsizes down to about 80px;
  below about 1,000px the checks' words give way to the dot alone.
- **The drawer is 352px wide.** Its head is the map's **Name**, a field like the drawer's others (the small label,
  the input at the old heading's size and weight). Your maps' rows show the name, ellipsized before the size, and
  the size ("128×128") once dev's entries carry it; no star. The open map's row has the mint bar at its left and
  its name in the heading's weight; a click on another row opens it.
- **A settings section** opens as a sheet over the drawer's lower part (the card and Your maps), its back button
  naming the section, its fields dev's settings page's (names, bands, guards), "Reset to the theme's settings" at
  its foot; the name, the basics, the section list and Generate stay where they are.
- **Generate** reads as dev's: "Generate", "Generate (settings changed)", the stage's words while a map is made.
  Every Generate names the new map for its theme ("River Valley"; "Dam Good Map" for Any) and replaces the open map
  without asking; the open map is in Your maps already. The only question left is when this browser can't keep
  Your maps and the map has edits.
- **File** holds exactly Open…, Save project, Download .timber, Clear everything, History, About. There is no Copy
  link: the address is always the open map's share link, so the browser's own address is the link.
- **About** is the page's dialog: the generator's version, the licence, the credits, the unofficial line, Source
  and Close.
- **Select always in hand:** held when a map opens, Esc and X return to it, a drag on the land marks an area, a plain
  click clears the selection. A source and the start are pressed and dragged as on dev. An object (a tree, a ruin, a
  mine site) is picked with a click and then moved with a drag; a drag that starts on an object not picked marks an
  area, so a forest can be selected (on dev a drag on any object moved it at once). The toolbar holds Select's line
  whenever nothing else is in hand. Alt takes tiles away only
  from a selection; with none, Alt+click picks a tile's layer as everywhere (D207).
- **The mouse with Select in hand (Kyler, 2026-10-02):** as on dev: a left-drag on the land marks an area, the middle
  button turns the view, the right button pans; the keys turn and move it. This replaces v4-01's "the right button
  turns the view".
- **Phones** stay view-only (D185).

**The rule.** Wherever Kyler hasn't asked for a change, the current editor on dev wins: layout, spacing, sizes,
colours and states. Where this document's v4 system conflicts with the current editor's look, the current editor
wins. **Set aside from the v4 system:** its tokens (the plate and cell measurements, the wood colours), its colour
roles beyond "one accent for lit, Save only" and "one for selected" (both the current editor's mint), and the grouped
shelf. **Kept:** the type scale's spirit (the editor's own sizes), the icon family as the editor draws it, the
no-overlap and contrast tests, Select in hand, the checks list, File, the brush worker patch, the core wiring and the
D380 work.

**The prototype** (`feature/page-proto`, from dev's editor code with only the changes below; on `/preview/`):
- The page opens the generated map in the editor at once; there is no settings page.
- **The header (v8, Kyler 18:18):** a named **New map** button alone at the left edge, above the palette column,
  shown selected while the drawer is open; the map's info at the window's exact horizontal centre, in the editor's
  own title type: the name on the first line and under it "seed 4242 · 128×128" (an opened file shows its size; if
  saving in the browser fails, that line says so instead). The info never overlaps either side group: the header
  measures how far each group reaches and caps the info's width between them, so a name too long truncates with an
  ellipsis and its tooltip holds the full name. On the right Undo, Redo, the checks dot with its words, Save to
  Timberborn (the only lit control), Look, and **File** (Open…, Save project, Download .timber, Clear everything,
  History, About). No brand mark or name anywhere (Kyler, 2026-10-02 18:18). The info clears both groups from
  1,219px wide ("River Valley", "Ready to play") and 1,395px with the checks' longest words; "Dam Good Map" with a
  ten-digit seed from 1,263px and 1,439px. Narrower windows are not yet designed (the proposal is in
  docs/progress/page.md).
- **The palette:** exactly the current editor's, one two-column grid in its order, no breaks.
- **The toolbar:** the current editor's rows, buttons, padding and gaps, with Flow among the view layers; the forces
  keep their icons; the options row is the current one, one line, More at its end.
- **The right column (v8):** one exact right edge for the level row, Slow forces and Sound, **Legend**, the legend
  panel and the water bar, and one left edge, Slow forces'. Row 1: the level control is Slow forces' width, the
  compass Sound's (round, centred in it), the same gap between them as between Slow forces and Sound. Row 3: a
  named **Legend** button spanning the column, the same height, corners, solid background and type as Slow forces,
  the same gap, lit in the mint while the legend is open (like Minimap). The legend panel opens and closes only by
  that button (the open state remembered; the editor starts it closed); it sits under the button with the same gap,
  on the button's edges, down to the same gap above the water bar; it lies over the map, so nothing resizes, the map
  doesn't move and no control shifts, and it never covers a control; its lines keep today's look (swatches, the
  "Markers on:" heading, a click shows the line's things on the map); content taller than the panel scrolls inside
  it. The docked full-height legend, its vertical tab and the view layers' hold on it are gone: no layer opens or
  moves the legend, and toggling any layer moves nothing. Badwater keeps its caption at the lower left as the
  layer's explanation, above the minimap's place, over nothing.
- **The legend's names (v8):** every line is a name on one line, nothing of what it does in the game: Moist ground ·
  Dry ground · Contaminated ground · Ground height · Water · Badwater · Mixed water · Walls · Dead trees · Trees and
  bushes · Start · Slope · Ruins · Mine site · Water source · Badwater source · Geothermal field · Relic · Thorns ·
  Blockage · Other objects; under "Markers on:": Slope arrows · Level lines · Contamination edge · Mine site
  outline. Each line's tooltip is "Show on the map"; the notes about far-off drawing and clicking are gone. The same
  names serve wherever the legend appears. **Two lines are wider than the column** at the panel's present paddings
  (the column is 164px at 1×, the text has 108px): "Contaminated ground" needs 121px and "Contamination edge" 112px;
  they are cut at the panel's edge, not wrapped or shrunk, until Kyler decides. The cheapest fix that keeps the type:
  the panel's padding 8→4px and each line's 4→2px, which frees 12px and fits "Contamination edge"; "Contaminated
  ground" also needs the swatch's gap 8→6px, or the column 13px wider.
- **The drawer:** in the palette's place at the width its contents need (352px), with Theme, Seed, Size, Designed
  for, the six sections, Generate, Surprise me and the map card. The palette stays beneath it, so the map's area and
  the map never move; the toolbar, the minimap and the readout keep their place to the drawer's right edge and move
  with it as one block; the top-right group and the water bar never change.
- **Solid chrome:** every control on the map (the readout and the water bar too) has the panel's solid background.
- **Large screens:** no scale-up at any size (Kyler, 19:32: `?ui=1.0`; v7's 1.2 and v8's 1.1 overshot). The
  prototype's `?ui` parameter and its 1800px rule go in the build.
- Pause water shows unavailable while the water is settled, never hidden.

**Where the prototype still differs from dev, each with its reason** (the rest is dev by construction):
1. The header's left block, centre and right group, as asked.
2. Flow in the view bar, as asked (D353).
3. "Pause water", unavailable when settled, as asked.
4. The checks' words beside the dot, as asked.
5. The readout and the water bar on a solid background, as asked (dev's were 95% translucent).
6. The view bar wraps before the top-right cluster instead of running under it at 1280 wide (a bug the no-overlap
   test found; dev reserved room for the compass alone).
7. In the prototype only: the chrome at 1.1× from 1800px wide; the build has no scale-up (19:32), so at 1920 the
   map sits exactly where dev's does.
8. The right column: the Legend button, the legend panel over the map and no docked legend, as asked; the legend's
   names, as asked; the Badwater caption moved up above the minimap's place so it overlaps nothing (it sat on the
   readout's and the minimap's spot on dev).

## Set aside: the floating plates (Kyler, 2026-10-02)

Side by side with the current editor, the floating-plate layout (v4 and its system round, mockups 01–35) was worse:
controls scattered over seven plates, chunky cells that ate the map, wood plates competing with the terrain, and
alignment that never settled. It is set aside. **The current editor's layout is kept** and refined on its own
skeleton: the docked header strip (the brand mark, the map's name and its facts on the left; Undo, Redo, the checks
with their Fix/Show list, Save to Timberborn as the only lit control, Look and File on the right); the object palette
docked on the left (pictures with their names beneath, in groups); the compact toolbar top-left (the view layers,
the tools, the forces with their own treatment, the options; every control named, keys only in tooltips); the level
control, Slow forces and Sound top-right; the minimap bottom-left; the readout where it is; its dark chrome, so the
map leads. Its flaws are fixed: it scales up on large screens, the header's right end isn't crowded, the options row
isn't cramped. Kept from the plates round (as amended at 17:36 and 19:32: the tokens and colour roles are set aside too): the
no-overlap and contrast tests, Select in hand, the checks list, "File", the brush worker patch, the core wiring and
the D380 work.

**Where the generator goes** is Kyler's choice between two mockups (`docs/design/editor-v6-*`, each beside the
current editor at 1440×900 and 1920×1080): (1) "New map" in the header opens a full-height drawer on the left in
the palette's place, lying over the map's left edge without moving the view, the minimap hidden while it is open,
one click closing it; (2) two views of one page switched in the header, "New map" and "Edit", the generator view
with the settings column, a large preview, the card and the versions strip. In both, a share link still generates
and opens straight in the editor.

Where the refined editor departs from the current one, as first proposed with the v6 mockups: the brand mark and
the facts line in the header, "File" for ⋯, the checks' words beside the dot, the view layers as pills, the forces'
own band, a second line for the options row, Pause water unavailable rather than hidden, the colour roles. Of these
Kyler kept only the facts line, "File", the checks' words and Pause water (17:36); the brand mark went at 18:18; the
pills, the band, the second line and the colour roles are set aside (the current editor wins). The sections below
record the plates round as history.

## The system (v5, proposed with the v4 mockups 22–26): one set of tokens for every plate

*History: set aside with the plates (2026-10-02). Its states' content (below) carries over; their look does not.*

**Measurements.** One plate radius (10px), one cell radius (6px), one plate padding (4px), one cell height (32px),
one cell gap (4px), one icon size (16px) with one gap to its label (6px), 12px from the window's edge and between
plates. The right column is 196px; every row in it is one full-width cell or two equal halves. The panel's column is
316px. Every plate and cell takes these from the tokens, so nothing drifts by a pixel.

**The cell.** One style for every control in every plate: a faint fill at rest (`cream` at 6%), stronger on hover
(14%), *selected* when on. A label is centred; arrows and chevrons sit at the cell's edges; an icon is one size,
before the label, with the fixed gap. A field is a well (`#1a1410`) with the same height and radius. A segmented
choice is cells in a well, the chosen one *selected*. A tab is underlined, never segmented.

**Colour roles, strictly.**

| Role | Colour | Used for |
|---|---|---|
| lit | `#fff3d6` to `#e6d0a0`, with its glow, dark ink | Save to Timberborn, and nothing else |
| action | `#b9966a` to `#9e7d52`, dark ink | Generate, and nothing else |
| selected | `#b5a583`, dark ink, bold (clearly dimmer than lit) | an on-state: Normal, Keep river, Markers, the tool in hand, the shelf object held |
| quiet | the cell's faint fill, `cream-2` words | everything else |
| words | `cream` `#f3e6cc`, `cream-2` `#cdbfa6`, `quiet` `#ab9e89` | primary, secondary, labels and notes |
| the checks | `ok` `#7fc46b`, `warn` `#f0a63a` | the dot, always with its words |

**Type scale.** Three sizes, two weights: 12px (labels, the view layers, notes), 13px (every control and line of
text), 15px (Save, Generate, the map's name in Bitter 700). Weights 400 and 600 (700 for the name only).

**Icons.** One family: 16px, 1.7px stroke, round caps, optically centred, for the tools, the view plate, Undo,
Redo, Sound and More. The forces' icons sit on a *selected* disc, dark when the force is held.

**The right column**, top to bottom: the map plate (Save lit, full width; Undo | Redo; File; "● Ready to play"),
the view plate ("∨ Level: All ∧"; Top-down | Reset view; Slow forces; Look: High), and Place objects, with the
shelf under it as a two-column grid of compact cells (picture, then the name on up to two lines) flowing in group
order with no breaks, an odd last object on a full row, ending on a whole row with a chevron saying there is more.
An icon-only cell is always a square of the cell height. **The top line:** the brand bar, the rows, a small plate
holding the compass (an indicator, not a control) and Sound's square (a speaker, green when on, red and struck
through when off, named in its tooltip), and Save, sharing one top edge and one first-row centre; the compass plate
sits midway between the rows and the right column. The bottom right holds only the water plate. Generate and Surprise
me are two cells of one height, Generate in *action*.

**The states** (mockups 27–35, all at 1440×900): the first visit before a map exists (the map area empty, a centred
plate saying what is being made with its progress, every cell quiet until the land exists); generating (the Generate
cell shows the stage with its progress inside it, the map dims under a plate saying the new land rises into place
when it is ready; editing never waits); a map with problems ("3 to look at" with the amber dot, and its list under
the map plate: Fix these first, Worth a look, each line with Fix and Show cells); a settings sheet; the File menu
(Open…, Save project, Download the .timber file, Copy link, History, About); a force in hand with its More panel as
further lines of the same plate; a selection with Select's line (what is marked, Level with Set, Cut down and Fill
up, Up 1, Down 1, Delete, Take away every object, Crop map); placing an object (the ghost's footprint in the ok green,
"Place here" in the system's note, the shelf cell selected); a tooltip with its key cap. The water plate reads "Pause
water", shown unavailable while the water is settled, never hidden. Everything drawn on the map (the brush ring, a
ghost's label, a force's ring) uses the system's type, colours and radii.

**The brand.** The panel's bar reads "◆ Dam Good Maps · <map name>": a small mark of our own (two logs over a
wave, drawn as a 14px line icon; no game assets), the brand in Bitter in the quiet colour, then the map's name in
Bitter, ending with an ellipsis when long; the same open or collapsed.

## The direction not taken: Field notes

Kept as a record ([docs/design/direction-b-fieldnotes.jpg](docs/design/direction-b-fieldnotes.jpg)).

**Thesis.** The page is a naturalist's journal lying beside the land: the panel is the journal's page about this map
(its name in an italic serif, its "how it plays" line as the entry, your maps as prints pasted in), and the land's
tools lie in a canvas tool roll along the bottom, the picked one pulled up out of its pocket.

**Its best case.** The most character of the two, and the clearest telling of the brief's rule: the paper is the map,
the roll is the land. Tool names are always visible. A bottom dock is where Timberborn players expect tools.

**Why not chosen.** Cream paper is the brightest thing on screen and pulls the eye off the land, against "the map is
the hero"; a full-height paper column against a saturated sky reads as a second scene. The tool roll is the most
skeuomorphic element in either direction, and it moves the tools away from the brief's top-to-bottom rows. It needs a
hue accent (pencil blue) that sits near the water's.

## Meaning

What the player must be able to read, whatever the look. A change to any row is a meaning change: listed in the PR
and approved by Kyler. Rows are added as each checkpoint builds its part.

**The map.** Everything the 3D view draws keeps its colours and marks in both looks (D135, D154, D334): land by
moisture, water and badwater from the one water palette, contamination as veins, objects as their models, the ghost's
green, amber and red with its one label, rings and bands for brushes and forces. The interface never reuses one of
these colours for something else.

**States, always with words.**

| Meaning | Carried by |
|---|---|
| Ready to play (every check passes) | a green dot and the words "Ready to play" beside Save |
| Something needs a look | an amber dot and its words ("2 things to look at"); clicking lists each problem and highlights it on the map (never a pop-up) |
| Settings differ from the shown map | a small dot on Generate (D330), with the tooltip saying so |
| Held (a tool, a force, a shelf object) | Active; also `aria-pressed` |
| The primary action (Save to Timberborn) | Lit, on a button with a verb |
| A view toggle that is on | Active; also `aria-pressed` |
| An open settings section | its chevron turned down, its name in cream, its fields under it; `aria-expanded` |
| A pinned legend line | the cream bar under its name; `aria-pressed` |
| What is on this map | the legend: picture, count and name for each kind |
| The water's state | words: "Water flowing… n%", "Water settled" (the worker's real state, D345 B14) |
| A refusal | one plain line of words by the pointer or in the row, never only a disabled control |
| Starred, saved to Timberborn (Your maps) | a filled star; the words "saved to Timberborn" |

**Words.** Tool, force, view and menu names are those in `EDITOR_PLAN.md` and UI-BRIEF, exactly. Every control has a
tooltip: a short purpose phrase, then its key as a small key cap (D351). Numbers show their unit.

**Contracts a restyle never breaks.** Share links, project files, Your maps' storage, saved file names, the worker's
API, every pinned hash, and every role and accessible name the tests use.
