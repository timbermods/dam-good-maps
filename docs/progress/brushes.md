# Batch 2: the brushes (D322)

Branch `feature/brushes`, off `feature/forces` at 4c313b51; a draft PR into `feature/forces`, merged
by the milestone session in the order 3, 2, 1. Kyler's words are the spec:
`docs/feedback/2026-09-28-forces-preview.md` items 15, 37, 2, 31 and 42, and the batch 2 section of
`docs/feedback/2026-09-29-build-order.md`. EDITOR_PLAN §4 describes the brushes as built.

## Done

- **Item 15, Clear's ghost sources.** Found with a failing browser test: a Clear stroke that changes
  no ground (a Flatten at the ground's own level, a Smooth over flat land: Kyler's two brushes) was
  dropped by the page, so its sources stayed, glowing, with their water running. The page now sends
  such a stroke's clearing as one step (`unchanged` in `src/editor/brushes.ts`), exactly as a delete;
  the water drains through D260 as for any removed source. `tests/e2e/clearSources.spec.ts`; the
  stroke's own water after a clearing, `tests/contract/clearSourcesWater.test.ts`.
- **The stroke record, changed once** (`src/core/features/raster/brush.ts`, `ops.schema.json`):
  `target` (item 37), `mode` with `wet` and `bank` (item 2), `sources: "keep"` (item 31), and a
  size up to 128 (item 42). Strokes saved before replay exactly: 18 kinds of stroke (soft and precise,
  held and stopped, ramped with and without slopes, steps, smooth, walkable smooth, naturalize, smart
  Lower's channels and deepening, square, pen pressure, a working area, kept runs, riding pieces)
  recorded by the code before D322 at 70290a3e, alone and as a project, in
  `tests/fixtures/strokes-before-d322.*`; `tests/contract/strokesBeforeD322.test.ts` checks them
  byte for byte.
- **Item 37, the target level.** Raise, Lower and Flatten as the game's editor: exact, hard-edged,
  holding adds nothing; the target beside the pointer ("up to 8", "down to 5", "level 7") and as a
  plane over the ring; it follows the ground until Shift+scroll, Ctrl+click or the row's **Level**
  sets it, and stays until the tool changes or Esc; Free past either end. Precise, its hold and its
  stop, and Flatten's Ramped edges are gone (retired terms and interface patterns added). F-drag
  resize existed (D205); its size now shows beside the pointer while F is held, and letting go keeps
  it.
- **Item 2, Ground, Water and Both**, per brush, remembered; wet tiles fixed at the stroke's start
  from the map's own water; Ground's banks never lowered below their water's surface; smart Lower
  only in Both. `tests/e2e/brushModes.spec.ts`, `tests/contract/brushTarget.test.ts`.
- **Item 31, Sources: Ride · Keep · Clear**, per brush, remembered (an old shared Clear sources
  becomes Clear on every brush). Keep's ground is left out of the integrity pass, so it stays exactly.
- **Item 42, bigger brushes:** the slider, [ ] and F reach half the map's width; the ring's disc is
  laid a block of tiles at a time past a 24-tile radius.

## Keys and gestures (for batch 3's shortcuts reference and first-run hints)

- **Shift+scroll** with Raise, Lower or Flatten: the target level (past either end, Free, for Raise
  and Lower). With Smooth or Naturalize it stays the strength (D196).
- **Ctrl+scroll over a source**: its strength (moved from Shift+scroll, D196).
- **Ctrl+click on the land** with Raise, Lower or Flatten: the target (was Flatten's level and
  Precise's stop).
- **Esc** with a target set: it follows the ground again; the next Esc puts the brush away.
- **Hold F**, move, let go: the size, shown beside the pointer (a click still sets it).
- Unchanged: [ ] size (now up to half the map), { } strength, Shift+drag inverts Raise and Lower.

## Tests updated (D148)

- `brushKit.spec`: the precise hold with its stop became the target (Shift+scroll, a click cut
  exactly, vertical walls, Esc, Free); Ramped edges became their absence; Smooth's row has two
  toggles and the Mode and Sources choices.
- `brush.spec`: Ctrl+click sets Flatten's target; Shift+wheel's strength checked on Smooth.
- `brushSources.spec`: the Clear sources toggle became Sources, with Keep checked too.
- `waterTools.spec`: a source's strength with Ctrl+scroll. `waterView.spec`: strength on Smooth.
- `editor.spec`: the Lower stroke starts on the tile it lowers (its target is a level below where
  the stroke starts). `camera.spec`: the Level list's new name. `sizes.spec`: the size up to half
  the map, a whole-map Flatten in one click.
