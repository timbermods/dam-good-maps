# Adoption at 3D step 3

This investigation is held for Kyler's look. The milestone session adopts it alongside Erode after the shared
3D view, per D279–D281 / D335. No product or Erode file is changed here. Base: `dev` at `d743dbcb`.

## Shared modules, not a second terrain engine

`core/block.ts` imports Erode's `Terrain`, `support`, `settleThings` and `waterPools`. `demo/view.ts` subclasses
Erode's `View`, so its picking, greedy chunk mesher, materials and camera are unchanged. The adapter adds the
square ghosts, visible-level mask, object clipping, and height-texture updates (Erode's original update path
assumed stable surface heights). `core/cases.ts` replays the pinned Canyon Erode operation before Block editing.

Move the small Block transaction/footprint layer onto the milestone's shared runs document and shared support
validator. Keep one validator and one mesher for both tools. Replace the explicitly approximate water adapter
with step 1's stacked-column simulation; snapshot objects/start and water with the document's transaction.
Dirty chunks update immediately; the demo defers full lighting by 320 ms after the latest edit. Adopt the
renderer-owned dirty lighting schedule and ghost batching, rather than the demo's scene traversal.

## Tool row and input

- One **Block** tool beside the terrain brushes/Erode; row: **Size**, number and slider, 1–8. No Power or Auto.
- Route normal click to add and Shift to remove, before the general brush handling. Ray picks supply integer
  voxel coordinates and the outward axis normal, including undersides and the visible slice's cut tops.
- A drag latches that plane, size/mode and initial gesture snapshot. Interpolate crossed cells on the plane;
  do not re-pick newly built faces. Each footprint is an atomic step. Earlier accepted steps in a drag/hold
  remain until release, undo, or Esc; a refused step changes no terrain, object or history state.
- A stationary Shift-wall hold previews its *next* inward step throughout the 240 ms interval. Stop on refusal,
  empty rock, Shift release, button release, pointer cancellation, or focus loss. Never catch up missed ticks.
- The complete square is refused at bedrock, map edges, the layer limit or height 22. Occupied additions and
  already empty removals are no-ops shown as such. Even sizes bias toward the positive in-plane axes.
- Support-check the entire hypothetical result, including hidden terrain. Paint every unsupported voxel red,
  including existing roofs that would lose support; give the one-line reason. No deletion cascade, support
  insertion, footprint trimming, or alternative result. A revision token prevents applying a stale preview.
- Use the shared undo transaction: one click/drag/hold, exact cancel, Ctrl+Z/Ctrl+Y. The camera is outside history.

**Current key overlaps:** `src/editor/Editor.tsx` already owns F-resize, [ / ], Shift inversion, Esc and undo/redo;
extend its tool dispatch rather than registering competing global handlers. Ctrl+drag belongs to Select and
Ctrl+click to level sampling; the demo reserves those and makes no edit. Alt+click / Alt+middle-click belong to
layer picking; the demo uses only the slider and reserves Alt-left. Shift+right-drag remains camera pan. No new
letter or number is assigned to select Block. The editor's previous precise-brush hold was retired by D322;
this hold is specific to D335's Block walls, not a restoration of that mode. While resizing, disable editing;
while painting, keep the camera still. The demo's navigation matches Erode, not a new product keymap.

## Recorded operations and checks to keep

`Operation` version 1 stores gesture kind, resolved stamps (face/normal, size, mode, visible level), literal
`[tile, beforeMask, afterMask]` changes and, only when they changed, the resulting objects/start. An omitted
`things` field means keep the current objects. History keeps the before snapshot.
`replay()` verifies the previous masks and assigns the literal after masks; it does not rerun pointer picking,
timers or support heuristics. Integrate this as a versioned editor operation, keeping previous operations'
replay unchanged. Derive water deterministically through the shared engine. Redo restores the snapshot.

Keep the pinned [nine-step tunnel operation](checks/tunnel-operations.json), the 864-gesture sweep against the
independent terrain3d support oracle, and the real-input tests in `scripts/captures.ts`. The sweep also adds a
one-block supported shelf on each heightfield so it can test all six normals, including ceilings, on real land.
Run the milestone's edited-map probe cases when separately authorized; this demo never launches Timberborn.

## Sound (added by Kyler at approval, 2026-09-29)

The Block tool has its own sounds in the product, through the editor's sound system (its volume and the Sound
switch, D313), from CC0 recordings: a stone set-down when adding, a chip when removing, and a rhythmic chip per
block while a Shift-hold digs, never harsh when repeated a hundred times. Refused actions make no sound. The
recordings and their licences are listed with the editor's other sounds.

## Where it sits (Kyler, 2026-09-29, D335)

On the tools row, with Raise, Lower, Flatten, Smooth, Naturalize and Select, not on the forces row, whatever code it
is built on (the forces core included): the rows follow how a tool feels to use, and Block is a precise hand tool,
like the brushes. Erode stays on the forces row.
