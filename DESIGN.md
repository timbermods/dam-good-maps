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

## The direction: Lamplight (v2)

*Kyler accepted Lamplight's colours and theme at checkpoint 0 and asked for this second round (0b). Nothing is built
until he accepts a checkpoint's mockup.*

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

**Mockups** (River Valley 4242 at 128², the High look; the shelf's and legend's pictures are the view's own renders):
[Carve in hand](docs/design/lamplight-v2-1-carve.jpg) ·
[a shelf object picked, its ghost on the map](docs/design/lamplight-v2-2-shelf.jpg) ·
[a settings section open](docs/design/lamplight-v2-3-settings.jpg) ·
[the panel collapsed](docs/design/lamplight-v2-4-collapsed.jpg) ·
[Carve in hand at 1366×768](docs/design/lamplight-v2-5-carve-1366.jpg).

### Kyler's decisions (checkpoint 0 review, 2026-10-02; the milestone session numbers them when the page merges)

- **Every tool has a visible name, always:** the brushes, the forces, the shelf's objects and the view bar's toggles.
  No interface of icons only a regular can read.
- **Keys appear only on hover,** as the key cap at the end of the tooltip (D351). No key caps on buttons.
- **The shelf is on the right,** directly under the top-right cluster and on its two edges (this replaces
  EDITOR_PLAN's "left shelf"). Its objects are small renders of their models in the map's look, drawn by the view
  (D184), each with its name.
- **Slow forces is a button that says "Slow forces",** exactly as wide as the level control and directly under it;
  Sound sits directly under the compass.
- **The panel's Generate side holds every generation setting,** under its real name ("Designed for").

### Three treatments, never mixed

| Treatment | Looks like | Used for |
|---|---|---|
| **Lit** | cream fill, dark ink, a soft warm glow | the primary action, and nothing else |
| **In hand** | a dark well, cream bold words, a cream bar beneath | what is held: the tool, the force or the shelf object |
| **On** | cream words and the cream bar, no well | a toggle that is on (view bar), the open settings section, a pinned legend picture |

A choice among a few (the switch, Designed for, Keep river · Dry canyon) is a segmented control: the chosen side is a
raised piece of the same wood. The shown version in the strip has a plain cream ring.

**The primary action while editing is Save to Timberborn,** top right, and it is the only lit thing on the screen.
Generate is the panel's strongest button but unlit (raised wood, bold, a cream outline; a small cream dot when the
settings differ from the shown map). With the panel collapsed nothing changes: Save stays lit in the same place, and
Generate comes back with the panel (it runs only from its button or Enter in the panel, brief §5).

### Layout

One height (38px) and one gap (6px) for every plate outside the panel; everything sits 12px from the window's edge.

- **The panel** (328px, a plate inset from the edge; it collapses to a 44px strip that still names the map, set
  vertically). Top to bottom: "Dam Good Maps" in the system face (the display face is the map's name only); the
  switch; the settings; Generate and Surprise me; the versions strip; the map card; Your maps.
  - **Settings:** Theme, Seed, Size and Designed for always show. Terrain, Water, Hazards, Resources, Advanced: start
    rules and Limits for this size are six names in two columns; one opens at a time, beneath them, with every field
    under its real name and its official-maps line. Only the settings scroll when an open section is tall: Generate,
    the strip and the card never move out of sight. Sources: Placed · None is the Water section's first field
    (brief §8).
  - **The map card:** the name (Bitter 700); the "how it plays" line; the legend as the view's own small pictures
    with counts, unboxed (hover names one and highlights it on the land; a click pins it: On); trees in reach with
    their logs; the five levers, each named, with its grade as a word ("Metal: harder").
- **The rows** are one plate (608px) with one left edge beside the panel, four rows divided by hairlines: the view
  bar (names only, the quietest), the tools, the forces in their clusters, and the held tool's settings (that row is
  there only while a tool is held). Each row fills the plate's width, so the plate has one right edge too.
- **Top right:** Undo, Redo and ⋯, the checks dot with its words, Save to Timberborn. Beneath, the cluster as a grid
  of two columns: the level control (132px) and the compass (38px) in the corner; Slow forces under the level
  control, Sound under the compass.
- **The shelf** hangs under the cluster at the same width (176px): one object per line, picture then name, in five
  groups divided by hairlines (the sources; the start; plants; ruins, the mine site and relics; the land's pieces).
  Fifteen objects fit at 1366×768 above the water bar; when more arrive it scrolls inside itself, names kept.
- **Bottom left:** the hover readout. **Bottom right:** the water's status with Drought and Badtide.

### Tokens

| Token | Value | Use |
|---|---|---|
| `--wood` | `#2b221c` at 94% | plates and the panel |
| `--well` | `#1f1813` | wells: fields, slider tracks, segmented controls, In hand |
| `--raised` | `#443730` | quiet buttons, the chosen side of a segmented control |
| `--rule` | `#54453a` | hairlines |
| `--cream` / `-2` / `-3` | `#f3e6cc` / `#cdbfa6` / `#9d907c` | words: primary, secondary, quiet |
| `--lit` / `--lit-ink` | `#f6e7c1` / `#2a2019` | Lit |
| `--ok` / `--warn` | `#7fc46b` / `#f0a63a` | the checks dot, always with its words |

**Type.** The system UI face, 13px, tabular numbers. The map's name: Bitter 700 (OFL, self-hosted, one weight).

### Open for Kyler in this round

- The levers take their own line under the trees: named, with a word each, they don't fit on the trees' line
  (brief §3 says "compact on one line").
- Undo, Redo and ⋯ stay icons, as the brief says ("Undo and Redo icons and a ⋯ menu"); their tooltips name them.
- At 768px high, with a versions strip showing, Your maps is reached by scrolling the panel.
- Variety isn't in the mockup: the setting arrives with M9b.

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
| All checks pass | a green dot and its words beside Save |
| Something needs a look | an amber dot and its words; clicking lists each problem and highlights it on the map (never a pop-up) |
| Settings differ from the shown map | a small dot on Generate (D330), with the tooltip saying so |
| Held (a tool, a force, a shelf object) | In hand; also `aria-pressed` |
| The primary action (Save to Timberborn) | Lit, on a button with a verb |
| A toggle that is on, an open section, a pinned legend picture | On; also `aria-pressed` or `aria-expanded` |
| A lever's grade | its word: easier, middling, harder |
| The water's state | words: "Water flowing… n%", "Water settled" (the worker's real state, D345 B14) |
| A refusal | one plain line of words by the pointer or in the row, never only a disabled control |
| Starred, saved to Timberborn (Your maps) | a filled star; the words "saved to Timberborn" |

**Words.** Tool, force, view and menu names are those in `EDITOR_PLAN.md` and UI-BRIEF, exactly. Every control has a
tooltip: a short purpose phrase, then its key as a small key cap (D351). Numbers show their unit.

**Contracts a restyle never breaks.** Share links, project files, Your maps' storage, saved file names, the worker's
API, every pinned hash, and every role and accessible name the tests use.
