# Evidence and limits

## Cancel's recovery snapshot

`App.run` shows the making dialog before awaiting `snapshot()`, and only assigns `back.current` after the project reply and the Your maps flush. `cancelMaking` originally terminates the worker first, then reads `back.current`. On the first Generate, that ref is null while the snapshot is pending: the dialog disappears without remounting the editor, whose API still points at the terminated worker. On subsequent Generates a stale prior recovery entry can also be selected during this window.

The regression starts the actual `run` handler, holds its snapshot promise, calls the actual `cancelMaking`, then resolves the reply. The unmodified handler terminates the worker before the reply and never opens its recovery bytes. The candidate keeps the worker alive, restores those bytes in a new worker, and does not execute the stale Generate. There is no assertion about elapsed time.

The proposed regression extracts these two production functions via the TypeScript AST rather than copying their bodies. It mocks the outer page state and RPC boundary, so it does **not** validate Preact mounting, real Comlink termination, camera restoration, or actual map equality. The unrun Playwright script covers the actual page dialog and a post-cancel RPC.

## Save project's edit ordering

The page previews a brush stroke immediately. `useReady` commits it through `sendTerrain`; `sendTerrain` chains each stroke after the prior queued worker reply. A second stroke can therefore be visible while its worker call has not yet been sent. `useSave.exportProject` originally calls `api.project()` directly, bypassing that queue. It can snapshot the first stroke while the second is waiting. By comparison `saveMap` already uses `enqueue` for timber export.

The actual `useSave` implementation is loaded with a deferred edit queue and a worker project method that records the current revision. The unmodified export downloads revision 0 while the queued edit will create revision 1; the candidate downloads revision 1. The Playwright script uses two real Lower strokes and a held reply from the first, then checks the downloaded project's edit count. Reopening terrain/water equality has **not** been verified.

## Browser blocker

Playwright launch of installed Chrome returned `spawn EPERM`, including with Chrome's sandbox enabled and SwiftShader opt-in removed. An explicit isolated Chrome process launched by PowerShell exited before exposing its debugging port. Its local log ends with:

```text
FATAL:mojo\public\cpp\platform\platform_channel.cc:112
Check failed: . : Access is denied. (0x5)
```

The browser tool reported Chrome unavailable. The in-app fallback showed the initial `Raising the land…` page and was closed; it was not used to claim player coverage. No rendered 3D context was obtained, so neither hardware GPU nor software rendering was established. No Timberborn process was launched.

Vite initially failed on an optional `net use` child process. Its local, ignored dependency copy was adjusted to use native realpath without that lookup; this did not modify product files. Dependency install used `--ignore-scripts` with a clone-local npm cache. An unused happy-dom install was attempted while exploring a full component harness; no code or deliverable depends on happy-dom and package files are unchanged.

## Coverage still outstanding

- Ungated Generate/Cancel/Generate and Esc/tool keys during making.
- Editing, undoing and switching maps during water settling, force playback and weather computation.
- Undo/redo across Generate, Your maps switches, real places and deleting the open map; tools held across those transitions.
- Exact land/water round trips through project reopen, timber download/reopen, share link and Your maps.
- Smallest/largest supported sizes and window resizing with drawer and force open.
- Hardware GPU confirmation and renderer-only findings.

The excluded known issues (Your maps limit/unedited saves, day-box/Carve More layout, looks/layout) are not reported. No core settings sweep, broad suite, speed gate or timing test was run.
