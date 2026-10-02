# The page session's progress

"The page is the editor" with the design pass (D330, D384, D388), on `feature/page`. Design decisions are in
[DESIGN.md](../../DESIGN.md); this file is the work. The milestone session folds both into PLAN when the page merges.

## Checkpoints

Each ends on `/preview/` with one checklist for Kyler's sitting. `dev` is merged into `feature/page` at least at every
checkpoint.

| # | Checkpoint | State |
|---|---|---|
| – | The Editor.tsx split, its own PR into dev (#169), behaviour unchanged | done: merged into dev |
| 0 | The look: two directions as mockups on one real map | done: Lamplight's colours and theme accepted |
| 0b | Lamplight v2, then v3: five mockups answering Kyler's reviews | done: v3 accepted with six changes |
| 1 | One workspace: the map fills the window, the panel, the rows, the cluster, Save | in progress |
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

## Asked of the milestone session

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
