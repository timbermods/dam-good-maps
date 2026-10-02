# UI questions: "The page is the editor"

The open design questions and known constraints for Kyler's question-and-answer round on the combined page (feedback
item 23, D326). Nothing of the page is built until that round is held and Kyler approves the written UI brief that comes
from it. The decisions are in [PLAN.md §20](../../PLAN.md#20-editor-decisions); the plan is in
[EDITOR_PLAN.md](../../EDITOR_PLAN.md) (§7, §8) and [ROADMAP.md](../../ROADMAP.md) ("The page is the editor"). Feedback item numbers
are in [the forces-preview feedback](feedback/2026-09-28-forces-preview.md) and
[the build order](feedback/2026-09-29-build-order.md).

## What the page must hold (decided)

- **One window** (item 23; D233). After Generate the map is already editable: no "Refine this map" step, no separate screen.
  In the code today the generator page still opens the editor from a "Refine this map" button (`src/ui/App.tsx`).
- **3D is the only view** (D232): the 2D toggle goes; Top-down and the minimap cover it; a fallback for computers that can't run 3D.
- **Only the essentials around the map** (D233 (1)): the brushes, Water source, Badwater source and the forces. The rest
  (the full shelf, the view buttons, layers) is in the expanded editor.
- **An expand button** in the map's bottom-right corner opens the full editor in full screen with the same map and edits
  (D233 (2)). Keyboard Lock keeps Esc working in Chrome and Edge; Firefox and Safari fill the window instead.
- **Generate over edits is undoable** with a quiet note; a setting change regenerates, also undoable (D233 (3)).
- **A collapsed Legend button** with a first-visit hint (D233 (4)).
- **Save to Timberborn** from the page and full screen; **Real places** open the same way; **phones** are view-only (D233 (5), D185).
- **Your maps** (D234): the last 30 edited maps in this browser, stars kept forever, reopened as left; a row on the landing
  page and in the editor's "..." menu.
- **"Without pre-filled water" leaves the page** (D237).
- **Desktop first** (D185); the design pass follows Kyler's editor UI audit of the combined page (D236, D283).

## What the forces sitting and the feedback batches change

- **The shelf has four rows** (item 9, D323): the view bar, the tools (Raise, Lower, Flatten, Smooth, Naturalize, Select),
  the forces (Carve, Craterize, Quake, Erupt, Glaciate), then the active tool's settings with More (D309). Batch 3 builds the
  structure; the design pass styles it.
- **The forces' details sit behind More, each on Auto** (D309), with a size ring at the cursor (D312 (1)). Freehand paths
  replace the aim arrow and the waypoints (item 41, D321).
- **Watch** (item 29, D321): one toggle in the view bar beside Sound; off means Fast (land final in about two seconds).
  It is not the water bar's replay button that exists today, and not the water's pace (D268).
- **The candidates strip** (item 22, D325, D329): the first map that passes the absolutes shows at once, editable, and never swaps; if it misses one of the three outcomes, a background search adds the first version meeting all three, with a short notification where the miss matters; More makes further siblings on demand. It replaces the "Another like this" button, which M9b keeps until the strip exists (it is not on `dev` yet).
- **Two numbers as information** (items 24 and 47, D325): trees within walking reach with their logs, updating live as the
  player edits, and the five difficulty levers. M9b computes them; they are shown only here, not in today's editor or card.
- **Select's actions and Delete's menu** (items 1, 6, 43, 44; D323): Whole map, per-type Delete with counts, the start
  deletable (amends D288), Clear everything in the "..." menu. Delete sources (D315) folds into the Delete menu.
- **Generate always rolls a new seed** (item 20): a typed seed pins it, shown by a lock; the Dice button goes.
- **The key map** (items 16, 46 and batches 1 and 2, D322, D323): Z undo, C redo, X closes the selection (Quake's flip
  moves); Shift+scroll no longer sets a source's strength (D322). Batch 3 updates the shortcuts reference and first-run
  hints once. EDITOR_PLAN §7's keys still list "X Remove", which D288 removed.

## Questions for the round

Kyler answered these in his round on 2026-09-29: [UI-BRIEF.md](../UI-BRIEF.md) (D330).

1. Which controls are "the essentials" on the page: does each force get a row there, or one Forces button that opens the shelf? **Answered: [UI-BRIEF.md](../UI-BRIEF.md) §1, §4.**
2. Where do settings live once the page is the editor: a panel beside the map, a drawer, or the expanded editor? What
   happens to today's settings panel next to a live map? **Answered: [UI-BRIEF.md](../UI-BRIEF.md) §3.**
3. Where does the candidates strip sit, and how many thumbnails show before More? Does opening one keep the shown map's edits? **Answered: [UI-BRIEF.md](../UI-BRIEF.md) §3, §5, §6.**
4. What does the page show about the map beyond its card: the checks dot, the two numbers, the five levers? Which are
   always visible, which on hover, which in the expanded editor? **Answered: [UI-BRIEF.md](../UI-BRIEF.md) §3, §4.**
5. Watch beside Sound in the view bar: is the view bar on the page, or only in the expanded editor? What is the page's
   equivalent of Fast and Watch? **Answered: [UI-BRIEF.md](../UI-BRIEF.md) §1, §4.**
6. Which keys work on the page, and which only in full screen? Does Esc mean the same in both? **Answered: [UI-BRIEF.md](../UI-BRIEF.md) §1.**
7. How does "Your maps" sit next to the candidates strip and the settings, so a player can tell a saved edit from a sibling? **Answered: [UI-BRIEF.md](../UI-BRIEF.md) §3, §6.**
8. What does Generate do to a map the player has edited, given the undo note: is the note enough, or does it need Your maps' safety net as well? **Answered: [UI-BRIEF.md](../UI-BRIEF.md) §6.**
9. Real places open in the same window: what changes for a place (its signature, its credits, no seed)? **Answered: [UI-BRIEF.md](../UI-BRIEF.md) §3.**
10. What does the first visit teach: one hint, the Legend hint, first-run hints, or none? Who owns the shortcuts reference? **Answered: [UI-BRIEF.md](../UI-BRIEF.md) §7 (the shortcuts reference stays with batch 3, D323).**
11. Phones are view-only: does the page show the strip, the numbers and Your maps there? **Answered: [UI-BRIEF.md](../UI-BRIEF.md) §1.**
12. Which pieces go to the design pass (D236) and which the brief must fix first? **Answered: [UI-BRIEF.md](../UI-BRIEF.md) §9.**
