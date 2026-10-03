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
