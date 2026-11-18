# Testing the companion

For developers. The player text is [README.md](README.md).

## What runs without the game

`node mods/companion/scripts/test.mjs` runs the checks of the logic in `src/Core`: choosing the newest Dam Good Maps file,
reading the metadata, the settings file (a damaged one is never overwritten), the reload key, and the re-save check (a repeat save is a new file, `name-2`, `name-3`). It needs the .NET 8 SDK and nothing else.

`node mods/companion/scripts/build.mjs` builds the mod against the local game install and assembles
`mods/companion/dist/DGMCompanion`. It installs nothing.

## The in-game check

The DGM Probe runner's companion mode runs it (investigation/probe/README.md, "Companion mode" and "Safety"), on the
dedicated machine only (D218), and only while no game is running. It records the game's settings, logs, saves and every
file under `Documents\Timberborn`, installs the companion and DGM Probe for the run only, switches every other mod off,
launches the game through Steam with `-skipModManager -dgmcompanionTest <folder>` once per variant, then puts everything
back and checks that nothing is left (exit code 6 if anything is). Without that argument the test code does nothing.

The folder (`C:\dgm-probe\results\<run>\companion\<variant>\`) stands in for the Maps folder, so Kyler's maps are never read.
The test in the game (`src/Game/InGameTest.cs`):

1. In the main menu: with only a newer look-alike and an unreadable `dgm-` file in the folder there is no entry. It asks the
   runner for the maps (`dgm-lake-basin-3`, then the newer `dgm-river-valley-1`, both from the current generator); the entry
   then sits under New game, is the menu's own kind of button, names the newest map in a caption in the menu's text colour,
   and `menu.png` is taken.
2. It clicks the entry: a new game starts on `dgm-river-valley-1` with the remembered faction and difficulty, and the game
   asks for the settlement name.
3. In the game it presses the reload key (a real key press queued into the Input System): an untouched file says it has not
   been saved again. It asks the runner to save the map again as the app does, `dgm-river-valley-1-2`; the key then offers
   it, Keep playing carries on and the key works again, and Reload starts a new game on the `-2` file with the same faction
   and difficulty, asking the name again. The key there finds the file unchanged. It writes `result.json` and quits.

Run it from the repository root, after `npm --prefix investigation/probe ci`:

```
npm --prefix investigation/probe run batch -- --backup-settings
npm --prefix investigation/probe run batch -- --companion --companion-variants all
npm --prefix investigation/probe run batch -- --companion --companion-variants all --run-id <id> --confirmed-launch <code> --reference <backup .reg>
```

The variants are `named` (the remembered difficulty is one of the game's own), `custom` (a customised one) and `fresh`
(nothing remembered). Each variant's folder holds `result.json`, `events.log`, `menu-tree.txt` (the menu's elements),
`menu.png` (judge the entry's look from it) and the game's log; the run's `summary.md` has the verdicts.

## Results

First run, 2026-10-30, Timberborn 1.1.2.8 (the manifest's minimum is 1.1.2.4), on a busy machine:

- **`named` passed every check** (run `companion-2026-10-30-named`): the entry, the click, Iron Teeth on Hard, the name
  asked, the reload key on an unchanged file, the `-2` re-save offered, Keep playing, Reload onto `-2`, the name asked
  again. A key press queued while the window is in the background reaches the game, and the game accepts a new game
  started from inside a game. Settings matched the backup afterwards; nothing was left in `Documents\Timberborn`.
- **The look failed**: the entry was a plain `Button`, so the game drew no frame around it, and the caption was Unity's
  default dark text, nearly unreadable. Fixed: the entry is made as the New game button's own type (`LocalizableButton`,
  which draws the frame), and the caption takes the buttons' text colour. The test now checks both.
- **`custom` passed** with the look fixed (run `companion-2026-10-30-all`): Folktails on the customised difficulty, and
  the entry looks like the menu's own (its `menu.png`).
- **`fresh` failed on the test's own clock**: loading the game took two minutes, and the phase's 150 s counted the load.
  Fixed: a phase's clock starts again when its scene has loaded; the whole test may take 600 s, the runner waits 900 s.
  Every check up to then passed (Folktails on Normal, the first faction and the default difficulty). Not yet re-run.
- In that run, `named`'s game hung at startup before loading any mod (its log stops after the system information); in the
  next run the game did not start at all. Neither is the companion's: the machine was running other sessions' batches.
- The run whose game never started left the mod switches changed: the runner took the unmoved launch count for a view of
  the registry that is not the game's, and skipped the restore. Fixed in `runner/batch.ts`: when no launch started the
  game, the restore runs.

Still to run: `named` and `fresh` with these fixes, once the settings are back.
