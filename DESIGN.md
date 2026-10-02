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

## The direction: Lamplight (v3)

*Kyler accepted Lamplight's colours and theme at checkpoint 0; v3 answers his second review. Nothing is built until
he accepts a checkpoint's mockup.*

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

**Mockups** (River Valley 4242 at 128², the High look; the shelf's and legend's pictures are the view's own renders).
The first three share one framing, so flipping between them shows that nothing moves:
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

### Two treatments, and buttons

| Treatment | Looks like | Used for |
|---|---|---|
| **Lit** | cream fill, dark ink, a soft warm glow | the primary action, and nothing else |
| **Active** | a dark well, cream words, a cream bar beneath | what is held (a tool, a force, a shelf object) and what is on (a view toggle); a pinned legend line has the bar |
| A button | a raised piece of the wood | something that acts when pressed: Top-down, Reset view, Try another, More, Drought, Badtide |

A choice among a few (the switch, Designed for, Keep river · Dry canyon) is a segmented control: the chosen side is
raised. The shown version in the strip has a plain cream ring. Nothing changes weight when it becomes active, so
nothing shifts.

**The primary action while editing is Save to Timberborn,** top right, and it is the only lit thing on the screen.
**Generate is the panel's main button:** tall, full width of its line, bold, lighter wood with a cream outline, with
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
  4. **The settings area:** an accordion in a fixed area that scrolls inside itself. Terrain, Water, Hazards,
     Resources, Advanced: start rules and Limits for this size are six lines, each with a chevron; one opens at a
     time, its fields directly under its own name, and the area scrolls to it. All six names show when none is open.
     Reset to the theme's settings is the list's last line. Sources: Placed · None is Water's first field (brief §8).
  5. Generate, and Surprise me.
  6. The versions strip (its place is kept when it is empty; More is always there).
  7. The map card: the name (Bitter 700, one line); the "how it plays" line (two lines); the legend, four lines in
     two aligned columns of picture, count, name (hover highlights those things on the land, a click pins the line);
     trees in reach with their logs.
  8. Your maps takes what height is left and scrolls inside itself (at 768px high only its heading shows first).
- **The rows** are one plate with one left edge beside the panel, four lines divided by hairlines: the view bar, the
  tools, the forces, and what is held. Every line starts at the left with equal gaps. The plate is as wide as its
  widest line (the view bar, 615px) and always four lines tall: the last shows the held tool's settings, or the held
  object's name and what to do with it.
  - **The view bar** is the quietest line (12px). Top-down and Reset view are buttons; the rest are toggles: plain
    quiet words when off, Active when on.
- **Top right:** Undo, Redo and ⋯, the checks dot with its words, Save to Timberborn. Beneath, the cluster as a grid
  of two columns: the level control (132px) and the compass (38px) in the corner; Slow forces under the level
  control, Sound under the compass.
- **The shelf** hangs under the cluster at the same width (176px): one object per line, a 28px picture then its name,
  in five groups divided by hairlines. The view draws each picture to fill its tile. Fifteen objects fit at 1366×768
  above the water bar; when more arrive it scrolls inside itself, names kept.
- **Bottom left:** the hover readout. **Bottom right:** the water's status with Drought and Badtide.
- **The default view fits the whole map in the free space:** right of the panel, left of the shelf, under the rows
  and above the bottom bars, for the layout as it is when a map opens or Reset view is pressed. Collapsing or opening
  the panel never moves the camera by itself (D265).

At 1366×768 the rows end 19px short of Save's plate. A map with roofed water adds an Under roofs toggle, which
doesn't fit there: at that width the view bar then drops Minimap to its end and scrolls sideways inside the plate.
This is checked on a real roofed map at checkpoint 1.

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
- The mockups' pictures are the shelf's present renders enlarged; the build has the view draw them at 28px.

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
