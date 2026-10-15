# Testing the companion

For developers. The player text is [README.md](README.md).

## What runs without the game

`node mods/companion/scripts/test.mjs` runs the checks of the logic in `src/Core`: choosing the newest Dam Good Maps file,
reading the metadata, the settings file, the reload key and the changed-file check. It needs the .NET 8 SDK and nothing else.

`node mods/companion/scripts/build.mjs` builds the mod against the local game install and assembles
`mods/companion/dist/DGMCompanion`. It installs nothing.

## The in-game check (the DGM Probe runner's companion mode)

`node investigation/probe/run.cjs runner/batch.ts --companion` (from the repository root, `npm --prefix investigation/probe ci`
first) is the in-game check; see investigation/probe/README.md, "Companion mode". It is the runner's, on its safety (settings,
logs and saves recorded and put back, leftovers check, DGM Probe and the companion installed for the run only, results in
`C:\dgm-probe\results\<run>\`), on the dedicated machine only (D218) and while no game is running. The game side is
`src/Game/InGameTest.cs`, switched on by `-dgmcompanionTest <folder>` (without it the test code does nothing).

Per launch (one per remembered-settings variant: `named`, `custom`, `fresh`), the runner makes a scratch folder standing in
for the Maps folder (the player's own is never read) holding a newer look-alike (not from Dam Good Maps) and a newest
unreadable `dgm-` file, and the game's test checks:

1. With no Dam Good Maps map in the folder the main menu has no entry; the `userMapsDirectory` the mod would read in a
   normal launch is `Documents\Timberborn\Maps`.
2. The runner then writes two maps the current generator makes (`dgm-river-valley-1`, newest, and an older
   `dgm-lake-basin-3`); the entry appears with the newest map's name and size.
3. A click starts the newest Dam Good Maps map (not the look-alike or the broken file) with the remembered faction and
   difficulty (a named one, a customised one, or the first unlocked faction and the default); the game asks for the
   settlement name.
4. The reload key with the file untouched says it has not been saved again.
5. The runner writes `dgm-river-valley-1-2.timber` (the app's re-save); the reload key offers it, Keep playing keeps the
   game and the key works again, Reload starts a new game on the `-2` file with the same faction and difficulty, the name
   is asked again, and the key then says it has not been saved again.
6. After the game quits the runner checks nothing outside `DGMCompanion` changed (`leftovers()` empty, the settings
   restored exactly) and that the companion remembered the faction.

Results are in `results\<run>\companion.json` and `summary.md`; each variant's folder has `events.log`, `result.json`,
`menu-tree.txt`, `menu.png` (judge the entry's look from it) and the game's log lines. `npm --prefix investigation/probe run
test:companion` checks the runner's side against a stand-in game, without Timberborn.

Still open until it has run: where the entry sits and how it looks in the menu, whether a key press queued while the window is
in the background reaches the game, whether the game accepts a new game started from inside a game, and whether the
settlement-name prompt is found the way `UiProbe.SettlementPrompt` looks for it.
