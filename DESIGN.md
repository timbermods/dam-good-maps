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

*Chosen by the page session at checkpoint 0; Kyler may pick Field notes instead, and the page switches.*

**Thesis.** The map is a lit diorama on a workbench at dusk; the interface is the dim workshop around it. The land is
the brightest, most colourful thing on screen, and the controls recede into warm dark wood until one is in use: the
tool in your hand, and the one thing ready to do next, are lit as if under the lamp.

**Why, against the brief and the High look.**
- "The map is the hero; the interface small and quiet" (D158): dark plates sit below the land's brightness, so the eye
  goes to the land. Light surfaces would be the brightest things on screen.
- The High look is warm sunlight on green, teal and grey-brown land under a blue sky. Warm dark brown is the sky's
  complement and the land's shade: the plates read as part of the scene's shadow, not a second scene.
- It reads as Timberborn's kin (dark warm panels, cream text) without copying its interface.
- State colours stay unambiguous: there is no hue accent. "Lit" is warm cream light, so green and amber belong to the
  checks dot alone, and nothing in the interface borrows a water, badwater or contamination colour.

**The signature: lit.** One treatment (cream fill, dark ink, a soft warm glow) marks exactly two things: what is
picked (the active tool, the active switch side, the shown candidate, a pinned legend icon) and the primary action
(Generate, Save to Timberborn). Everything else is unlit. Under reduced motion nothing changes: the glow doesn't move.

**Tokens** (first values; tuned at checkpoint 1 on the real page).

| Token | Value | Use |
|---|---|---|
| `--wood` | `#2b221c` at 93% | plates and the panel |
| `--wood-well` | `#1f1813` | wells: segmented controls, fields, slider tracks |
| `--wood-raised` | `#443730` | quiet buttons, a toggle that is on |
| `--rule` | `#54453a` | hairlines and separators |
| `--cream` / `-2` / `-3` | `#f3e6cc` / `#cdbfa6` / `#9d907c` | text: primary, secondary, quiet |
| `--lit` / `--lit-ink` | `#f6e7c1` / `#2a2019` | the lit treatment |
| `--ok` / `--warn` | `#7fc46b` / `#f0a63a` | the checks dot, always with its words |

**Type.** Instruments: the system UI face, 13px, tabular numbers. The map's name: Bitter 700 (OFL, self-hosted, one
weight). Nothing else uses the display face.

**Layout** (mockup: [docs/design/direction-a-lamplight.jpg](docs/design/direction-a-lamplight.jpg)).
- The panel is a plate on the left, inset from the window's edge so the sky shows round it; it collapses to a thin
  strip.
- The four rows stack at the map's top left in the brief's order: the view bar (small, quietest), the tools, the
  forces, the active tool's settings. The picked tool shows its name; the others are icons with tooltips.
- The shelf is a two-column strip under the rows.
- Top right: Undo, Redo, ⋯, the checks dot with its words, Save to Timberborn; beneath, the compass in the corner,
  the level control beside it, Slow forces and Sound on the cluster's edges (D345 B3, D368 (5)).
- Bottom left: the hover readout. Bottom right: the water's status with Drought and Badtide.

## The other direction: Field notes

Kept as the alternative ([docs/design/direction-b-fieldnotes.jpg](docs/design/direction-b-fieldnotes.jpg)).

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
| Picked (tool, switch side, candidate, pinned legend icon) | the lit treatment; also `aria-pressed` or `aria-selected` |
| Primary action | the lit treatment on a button with a verb |
| A toggle that is on (view bar) | a raised well and brighter icon; `aria-pressed` |
| The water's state | words: "Water flowing… n%", "Water settled" (the worker's real state, D345 B14) |
| A refusal | one plain line of words by the pointer or in the row, never only a disabled control |
| Starred, saved to Timberborn (Your maps) | a filled star; the words "saved to Timberborn" |

**Words.** Tool, force, view and menu names are those in `EDITOR_PLAN.md` and UI-BRIEF, exactly. Every control has a
tooltip: a short purpose phrase, then its key as a small key cap (D351). Numbers show their unit.

**Contracts a restyle never breaks.** Share links, project files, Your maps' storage, saved file names, the worker's
API, every pinned hash, and every role and accessible name the tests use.
