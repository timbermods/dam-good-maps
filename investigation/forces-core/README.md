# Shared forces study

From the repository root:

```sh
npm --prefix investigation/forces-core run demo
```

The command installs this folder’s locked dependencies if needed, binds to a free loopback
port and prints its address. Pick a force, then click, drag or paint. Right-drag or middle-drag
moves the camera. Shift-click draws a straight line; X flips Quake’s side; Esc reverts.
Ctrl+Z/Ctrl+Y undo and redo. Save study preserves the literal results and variation seeds.

All four forces work on the same map. Try Erupt beside Craterize, Carve through a lifted
fault, or Carve across volcanic rock. The map picker includes 128² and 256² studies, generated
maps and the repository’s bundled real places.

```sh
npm --prefix investigation/forces-core run check
npm --prefix investigation/forces-core run test:browser
npm --prefix investigation/forces-core run test:legacy
npm --prefix investigation/forces-core run test:ported
```

The browser checks use installed Chrome. Legacy checks recreate the pinned sources in ignored
local/ and run their original Node assertions; the ported run substitutes the shared terrain
models. Missing pinned Git objects are fetched by commit id. Large baseline output stays local.

[REPORT.md](REPORT.md) records results and differences.
[INTEGRATION.md](INTEGRATION.md) proposes editor adoption.
