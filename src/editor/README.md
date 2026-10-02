# The editor's code

`Editor.tsx` is a thin shell: one component that makes a bag, calls one slice hook per feature in a fixed order and
returns the markup (`render/editorView.tsx`). What was one closure is now the bag: every state, ref and function the
features share is a member of it.

## The bag (read before changing a slice)

- `Editor` makes a **fresh bag every render** (`const ed = {} as Ed`) and each slice hook adds its part:
  `Object.assign(ed, useXxx(ed, props))`. Never keep the bag in a ref or reuse it: a closure made in one render must
  keep seeing that render's state and functions, as one component's closure always did.
- A slice returns the members other slices use. Its `XxxSlice` interface, written out by hand in its file, lists them
  with their types; `Ed` (`ed.ts`) is the intersection of all of them.
- **The order of the calls in `Editor.tsx` is the order of the hooks.** Effects run in declaration order, so moving an
  effect or a slice changes when it runs. Add new state and effects to the slice they belong to, not in between.
- Reaching another slice: members of a slice that **ran earlier** are destructured at the top of the hook
  (`const { run, info } = ed;`). Members of a slice that **runs later** are read as `ed.name`, only inside a function
  that runs after the render (an effect, a handler, a callback), never while the component renders: they aren't there
  yet, and the type checker can't tell. Whatever runs during render, with what it calls, stays in one slice.
- The markup is plain functions of the bag called inline (`header(ed, props)`), not components, so the vnode tree is
  one.

## Folders

- `session/` the state the page holds, the queue to the worker, the page's copy of the map (`mirror.ts`).
- `paint/` the brushes: strokes, undo and redo, picking a tool.
- `view/` the objects under the pointer, the overlay, the renderer becoming ready, the view kept in step.
- `sources/` water sources: placing, moving, the wheel, the markers, removing.
- `start/` the start: moving it, its check, the "fits here" hint.
- `shelf/` the shelf: the ghost under the pointer, placing, the footprint check.
- `remove/` Delete.
- `forces/` the forces: their settings, a force at work, their gestures.
- `rows/` the top bar's rows (the source picked, the shelf item, the force).
- `selection/` the Select tool.
- `keyboard/` the keyboard.
- `testHook/` `window.dgmEditor` for the browser tests.
- `save/` export and save.
- `prefs/` what the viewer last used, kept in `localStorage`.
- `render/` the markup.
- `juice/` the sounds and the land's effects. The files beside this one (`brushes.ts`, `select.ts`, `features.ts`,
  `TopBar.tsx` and the rest) are the editor's helpers, which the slices use.
