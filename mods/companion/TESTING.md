# Testing the companion

For developers. The player text is [README.md](README.md).

## What runs without the game

`node mods/companion/scripts/test.mjs` runs the checks of the logic in `src/Core`: choosing the newest Dam Good Maps file,
reading the metadata, the settings file (a damaged one is never overwritten), the reload key, and the re-save check (a repeat save is a new file, `name-2`, `name-3`). It needs the .NET 8 SDK and nothing else.

`node mods/companion/scripts/build.mjs` builds the mod against the local game install and assembles
`mods/companion/dist/DGMCompanion`. It installs nothing.

## The in-game check (not yet run)

`scripts/ingame-test.ts` does what the DGM Probe runner does (investigation/probe/README.md, "Safety"), on the dedicated
machine only (D218), and only while no game is running:

1. Builds the mod and makes four maps in a scratch folder under `C:\dgm-companion-test`: two from the generator, one newer
   look-alike that is not from Dam Good Maps, one newest unreadable `dgm-` file. Kyler's Maps folder is never read.
2. Records the game's settings, logs, player data, saves and every file under `Documents\Timberborn`, installs the mod there
   for the run, and switches every other mod off for the run.
3. Launches the game through Steam with `-skipModManager -dgmcompanionTest <scratch folder>`. Without that argument the test
   code does nothing.
4. The mod, in the game, clicks its own menu entry and expects the second generated map, plays it, presses the reload key
   (a real key press queued into the Input System) with the file untouched, with it saved again (answers Keep playing, then
   Reload), and checks the reloaded game. A `-2` re-save of the played map is not in this script yet; the milestone's run adds it, then quits and writes `result.json`.
5. Removes the mod, puts everything back and checks that nothing is left under `Documents\Timberborn`.

Run it from the repository root, after `npm --prefix investigation/probe ci`:

```
node investigation/probe/run.cjs ../../mods/companion/scripts/ingame-test.ts --variant named
```

`--variant` is `named` (the remembered difficulty is one of the game's own), `custom` (a customised one) or `fresh` (nothing
remembered). `--no-launch` only builds and makes the maps. Results are in `C:\dgm-companion-test\last`: `result.json`,
`events.log`, `menu-tree.txt` (the menu's elements) and `menu.png` (judge the entry's look from it).

Still open until it has run: where the entry sits and how it looks in the menu, whether a key press queued while the window is
in the background reaches the game, and whether the game accepts a new game started from inside a game.
