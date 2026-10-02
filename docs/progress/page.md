# The page session's progress

"The page is the editor" with the design pass (D330, D384, D388), on `feature/page`. Design decisions are in
[DESIGN.md](../../DESIGN.md); this file is the work. The milestone session folds both into PLAN when the page merges.

## Checkpoints

Each ends on `/preview/` with one checklist for Kyler's sitting. `dev` is merged into `feature/page` at least at every
checkpoint.

| # | Checkpoint | State |
|---|---|---|
| – | The Editor.tsx split, its own PR into dev (`feature/editor-split`), behaviour unchanged | in progress |
| 0 | The look: two directions as mockups on one real map; the page session picks and carries on | done: Lamplight |
| 1 | One workspace: the map fills the window, the panel, the rows, the cluster, Save | next |
| 2 | The panel is the map: the map card, Generate's dot and lock, the candidates strip | waits for M9b's candidate events (else after 3 and 4) |
| 3 | Your maps and replacing a map | |
| 4 | Real places in the panel (Pick a place stays out of the switch until it's built) | |
| 5 | The readout and the small things | |
| 6 | First visit and startup part 2's page side | |
| 7 | Phones and fallbacks | |
| 8 | Finish | |

## Kyler's rulings (2026-10-02)

- Checkpoint 0 is two genuinely different directions, each a static mockup on the same real map; the page session
  chooses and carries on, and switches if Kyler picks the other.
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
