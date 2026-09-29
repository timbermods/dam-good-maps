# Select, Delete, the shelf and shortcuts (batch 3, D323, D328)

Branch `feature/select-shelf`, into `feature/forces`. Kyler's words for each item are in
`docs/feedback/2026-09-28-forces-preview.md` (on `dev`); the build order is `docs/feedback/2026-09-29-build-order.md`.

## Done

- **Item 11 with item 32.** Only a file dragged in from outside the page opens a file (`DropTarget`, Editor.tsx). The
  shelf drags with the page's own pointer handling (`Shelf.tsx`): the ghost follows the pointer, the drop places (the
  Start moves the start), and a drag that doesn't place always ends placement. One label beside the pointer for what is
  picked ("Move the start here" / "Place here" / the one reason), none with nothing picked; Esc or a right-click puts
  it away. D204's Flatten hint is one label too ("Move the start here").
- **Item 12.** An edge wall on an edited map is a warning with the one-click "Lower the wall" fix, one undo step; the
  generator and Real places still guarantee none (`editing` in `ValidateOptions`).
- **D328, placed objects fit the land.** `springPool` became `levelFootprint` (`core/doc/placing.ts`): every shelf
  object, and an opened map's start, cuts its footprint down to the lowest tile under it, in the placement's step.

## Next

Items 1, 44, 6, 43, 16, 46, 20, then 9 (structure only). After batches 1 and 2 land, one update of the shortcuts
reference and the first-run hints.

## Tests

`tests/contract/edgeWallEdit.test.ts`, `tests/contract/edges.test.ts`, `tests/contract/levelPlace.test.ts`,
`tests/e2e/shelf.spec.ts` (the drop, the labels, Esc and right-click, the shelf drag, the edge wall in the dot).
Updated: `shelf.spec.ts`'s first test no longer expects a second "Can't go here" label after a refused click.
