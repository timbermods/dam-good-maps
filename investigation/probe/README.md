# DGM Probe

An automatic in-game test runner for Dam Good Maps. A Timberborn mod plays each map as a new game, fast,
under forced weather, and records what the game does; a runner builds the job, launches the game, watches
it, and compares the records with the project's models.

- [REPORT.md](REPORT.md): what was built, the choices made and why.
- RESULTS.md: the first real batch (on the `investigation/probe` branch).
- [INTEGRATION.md](INTEGRATION.md): proposals for the repository and the milestone run.

## Run it

Needs Windows, Timberborn 1.1.2.4 from Steam, the .NET 8 SDK and Node 22 or later.

```sh
npm --prefix investigation/probe ci
npm --prefix investigation/probe test
npm --prefix investigation/probe run batch -- --smoke
```

Every launch needs Kyler's yes. Without `--confirmed-launch`, the batch prints what it would do (the maps,
the checks, the time, and that it launches Timberborn) and a one-time code, and launches nothing. After
the yes, run the same command with `--confirmed-launch <code> --run-id <id>` as printed. A code works
once, and only for the plan it was printed for.

- `--smoke`: one map (the M8 preview) for one game day, a few minutes.
- `--only m2-rv,cal-rv2` or `--group Calibration`: some games (`--job-only` lists them).
- The tall maps (terrain up to 22, PLAN §20 D172): make them with `npx tsx tools/probe-tall.ts` (it writes
  `C:\dgm-probe\tall\` and checks each map with both validators), then play them as the group
  `Tall maps`, with `--keep-mods`.
- The ceiling maps (land raised up to 22 in the editor, PLAN §20 D244): make them with
  `npx tsx tools/probe-ceiling.ts` (it writes `C:\dgm-probe\ceiling\`: tall maps edited in the editor's own
  worker with its limit raised to 22, each checked by both validators' export profile), then play them as the
  group `Ceiling`, with `--keep-mods`.
- The parity maps (PLAN §20 D337, D338, D339): make them with `npx tsx tools/probe-parity.ts` (it writes
  `C:\dgm-probe\parity\`: seven maps built in the editor's own core, one for each object the shelf gained, and their
  manifest `parity.json`), then play them as the group `Parity`, with `--keep-mods`. Like every launch it needs Kyler's yes
  in chat first (CLAUDE.md).
- Any `.timber` paths on the command line are added as games of their own, with a Normal drought.
- `--compare-only <run id>`: redo the verdicts and the contact sheet of a finished run. Add
  `--compare-to <name>` to write them to `results\<name>\` and `sheet\<name>.html` instead, leaving the run's
  own verdicts, summary and sheet as they were; it refuses when this checkout builds other maps than the run
  played.
- `--restore-only`: put the game's settings, logs and saves back after an interrupted run.
- `--keep-mods`: play with the installed mods (no setting is changed or restored; the loaded mods are recorded).
- `--compare-settings <export.reg> --reference <backup.reg>`: compare an export of the game's settings with a
  backup, value by value.
- `--backup-settings`: save a copy of the game's settings (the whole registry key as a `.reg` file, and the
  mods' on/off values in text) and print how to put it back by hand. It changes nothing.

A full batch waits until the machine is quiet (no tests, batches, benchmarks or headless browsers of
another session, and a low processor load). `--no-wait` skips the wait.

## What the game is compared with

- The model (`runner/model.ts`: the cycle model of `investigation/cycles`) starts from what the game loads:
  the file's water and the outflows the file stores, its momentum. A file that stores every outflow as `"0"`
  starts every river at rest, in the game and in the model.
- The start's water (`drought-start-water`, `m9a-badwater` and the sampled tiles) is the water the project's
  own `start.water` rule counts: clean water a pump reaches from a shore the start walks to within the
  difficulty's walk, and the whole bodies of water it belongs to.
- The wet-tile counts (`cal-timeline`) are judged as Kyler's D297 judges water (D302): a tile within 0.01 of
  the 0.05 wet line, in the game or the model, is left out of both counts.

## What stays on this machine

Everything the probe produces stays in `C:\dgm-probe\` (Kyler's decision, outside his Timberborn folders):
the job, the heartbeat, `results\` (one JSON file per map, whole-map snapshots, the game's logs),
`shots\` (the screenshots, never committed), `maps\` (the files played), `sheet\` (the HTML contact
sheet), `tall\` (the tall maps), `ceiling\` (the ceiling maps) and `runner\` (the backups a run restores
from). The game is told the folder with `-dgmprobeHome`; `DGM_PROBE_HOME` changes it.

## Safety

- The mod does nothing unless the game was started with `-dgmprobe` and `-dgmprobeHome <folder>` **and** a
  job file exists in that folder. A normal launch never has those arguments. It never writes inside
  `Documents\Timberborn`: given a folder there, it stays off.
- The game loads mods only from `Documents\Timberborn\Mods` (or the Steam Workshop), so DGM Probe is
  installed there just before the launch and removed right after it. It sorts after every other mod, so the
  game never rewrites the load order.
- The runner never launches the game while it is running. Before a launch it records the game's settings
  (the registry key), the Unity logs, the player data, every save file, and a copy of every other small file
  under `Documents\Timberborn`, the other mods' folders in `Mods` included. With `--keep-mods` it changes
  no setting. Afterwards it puts the logs, player data and any changed mod file back, deletes any save the
  probe's games made, and moves any other new file (an error report, a mod's session log) into the run's
  folder, removing the folders that leaves empty. Steam Cloud's `steam_autocloud.vdf` files change at
  every launch; they are reported, never put back. Last, after removing DGM Probe, it checks that nothing
  new is left anywhere in `Documents\Timberborn` (`leftovers.json` in the run's folder); if anything is,
  the run stops with exit code 6.
- Graphics and speed changes are made in memory only, during probe runs.

## Remove the mod

The runner removes it after every run. If a run was cut short:

1. Close Timberborn.
2. Delete the folder `Documents\Timberborn\Mods\DGMProbe`.
3. Optionally delete `C:\dgm-probe` (the results and screenshots).

## Files

- `mod/`: the mod (C#, built against the local game install, never published).
- `runner/`: the runner (TypeScript): `batch.ts` (the command), `catalog.ts` (the games and their checks),
  `jobs.ts`, `launch.ts` (Steam launch and watchdog), `compare.ts` (the verdicts), `model.ts` (the cycle
  model), `safety.ts` (snapshot and restore), `mods.ts`, `consent.ts`, `sheet.ts`, `summary.ts`, `test.ts`.
