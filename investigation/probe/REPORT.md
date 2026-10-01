# DGM Probe: report

**Status, 2026-09-25:** built and tested without the game (the runner's tests, a stand-in game for the
watchdog, the comparisons fed with the model's own output), then three smoke runs of the M8 preview map, each
launched after Kyler's yes. The third, with his installed mods (`--keep-mods`), is the clean one: unattended
from launch to quit, every check passed, and his settings, read from outside afterwards, matched his backup
but for Unity's own per-launch values. The first two loaded his mods too: the runner's mod switches could
not reach the game from the Code tab's shell (decision 8). The full batch has not run yet.
[RESULTS.md](RESULTS.md) follows it.

## Decisions

Each open choice, what was chosen, and why.

1. **No Harmony.** The mod uses only the game's own services, injected through its dependency
   container, and reads two private fields (the panel stack's list, the camera's zoom constants). It
   needs no other mod, so it can run with every other mod switched off.
2. **Weather through the game's own weather services.** The first cycle comes from the new game's
   settings: a copy of the difficulty's `GameModeSpec` whose ranges have equal ends and whose badtide
   chance is 0 or 1. Each later cycle is set in a `CycleEndedEvent` handler, which the game calls before
   it draws the next cycle (`TemperateWeatherDurationService.Initialize`, `DroughtWeather.Initialize`,
   `BadtideWeather.Initialize`). The game then runs all its own rules, the drought's early source ramp
   included. Changing durations mid-cycle by reflection was rejected: the hazard start event fires on one
   exact day and would be skipped.
3. **Speed 99.** It is the developers' own fastest speed (`SpeedControlPanel`, x99), set through
   `SpeedManager.ChangeSpeed`. A tick is the same at any speed, so the records do not depend on it. The
   mod slows to 7 shortly before a screenshot, so the pause lands within a few ticks of its moment, and
   steps down if frames take over 2.5 s.
4. **Records inside the game's tick.** A tickable singleton samples tiles, takes whole-map snapshots and
   polls plant deaths (every 8 ticks), so a moment is caught at its first tick whatever the speed.
5. **Graphics down in memory only.** Render scale 0.5, no vertical sync and 30 frames a second while time
   runs; put back for screenshots and at the end of each map. The game's graphics settings live in the
   registry and are never written.
6. **Screenshots without the interface.** The game's camera is moved to each pose through
   `CameraService`, then a second camera made from the game's camera prefab (as the save thumbnails are)
   copies it and renders into an image of the pose's size, with the UI layer left out. Our 3D view's
   poses are reproduced exactly: the same target, direction and 40° vertical field of view.
7. **Two keys to start.** The mod acts only when the game is launched with `-dgmprobe` and a job file
   exists. A job file left behind can never take over a normal launch.
8. **With the installed mods, for now** (Kyler, 2026-09-25). The runner can switch every other mod off in the
   game's settings for a run and put the key back exactly (--keep-mods off). From the Code tab's shell it
   cannot: that shell, sandboxed or not, sees a private copy of the registry, so its switches never reach the
   Steam-launched game (two smoke runs loaded all of Kyler's mods). Kyler chose to run with his mods, which are
   mostly his own: --keep-mods changes no setting, records the loaded mods in every result, and the summary
   says the numbers are the game with those mods. The runner also stops if it cannot see Unity's launch count
   move, so it never reports a restore it could not make.
   Kyler, 2026-09-25: his installed mods don't touch water, soil, plants or weather timing, so `--keep-mods` is
   fine for every check, the weather calibration included.
8b. **DGM Probe sorts after every other mod.** The game's mod sorter rewrites the load order of mods whose
   position moves; a new mod sorting in among Kyler's moved Harmony and BobHousingOptimize. The manifest lists
   optional mods that never exist, so the sorter places DGM Probe last and moves nothing. The runner also takes
   DGM Probe out of the Mods folder after each run.
9. **No saves.** `Autosaver.Suspend()` blocks the periodic and the exit saves, and the probe returns to the
   menu with `OpenMainMenu` (no exit save). The runner still records every save file before a launch and
   deletes any new one afterwards, in case a crash writes one.
10. **Maps played from the probe's own folder** (`MapFileReference.FromDisk`), never from the player's
    Maps folder.
11. **A normal colony start.** Each map starts with the difficulty's own beavers, so the start check sees
    what a player sees. If they die and the game-over box appears, the probe closes it like any panel that
    pauses the game, and records it.
12. **Consent for every launch** (Kyler, 2026-09-25). A run without a code prints the plan and a one-time
    code tied to that plan; the launch needs it back.
13. **The cycle model from its branch.** `model.ts`, `weather.ts`, `game-water.ts` and `game-soil.ts` are
    taken from `investigation/cycles-exact` at `a9cdb86` into the ignored `.cache/`, their `src/` imports
    pointed at this checkout. The model starts from the file's stored water and soil, as the game does,
    and runs the same forced weather.
14. **D5's plug removed by the probe.** Beavers are not directed, so the probe deletes the three Blockage
    tiles itself (`EntityService.Delete`), as a finished demolition would, and watches the lake.
15. **High terrain maps made from our own maps** (Kyler, 2026-09-25): River Valley 96² and Canyon 128²
    raised 5 levels (terrain up to 21), and a Highlands map with a stepped mesa to level 21 carrying a
    spring, trees and a bush. Their water is re-settled with the project's own export.
16. **Only pending checks.** The batch reads `docs/ingame-log.md` and leaves out checks already played.
17. **Everything in `C:\dgm-probe`** (Kyler's decision #54, 2026-09-25). The runner passes the folder with
    `-dgmprobeHome`; the mod stays off without it, or when it points inside `Documents\Timberborn`. Only
    DGM Probe itself must sit in `Documents\Timberborn\Mods` during a run: the game loads user mods from
    that folder alone (`UserFolderModsProvider` on `UserDataFolder.Folder`, which no launch argument
    changes).
18. **Mods' own files put back.** With `--keep-mods` the player's mods run too, and some write to
    `Documents\Timberborn` (Late Game Performance rewrites `unity-markers.txt` at launch; Performance Log
    starts a session folder per game). The runner copies every file there up to 8 MB before the launch,
    the other mods' folders in `Mods` included, and puts back any that changed; new files move to the
    run's folder and the folders they leave empty are removed. Steam Cloud's `steam_autocloud.vdf` files
    are reported, never put back. After DGM Probe is removed, a final listing must show nothing new
    anywhere in `Documents\Timberborn` (`leftovers.json`); otherwise the run stops with exit code 6
    (Kyler, 2026-09-25: the runner removes anything it creates in his Timberborn folder).
19. **Tall maps** (PLAN §20 D172): `tools/probe-tall.ts` writes four maps up to level 22 (the top layer
    empty) to `C:\dgm-probe\tall`, pre-filled with the canonical settle and checked by both validators'
    load checks (all pass but `terrain.max_height`, the limit under test). The `Tall maps` group checks
    terrain voxel for voxel (the game's terrain columns against the file's), stored water at the load and
    after a day (on the whole map and above 16), every object, the start at 22, the sources above 16, the
    water flowing and standing above 16, and the screenshots by eye.
20. **Ceiling maps** (PLAN §20 D244, step 1: play near the top before the one ceiling is built):
    `tools/probe-ceiling.ts` opens D172-style tall maps in the editor's own worker, as a player opens a
    .timber, and edits them with its operations (Erupt, the Flatten and Raise brushes, the shelf's water
    source), then exports them as the page does. The ceiling isn't built, so the editing runs in a child
    process whose loader raises the editor's limit of 16 to 22 (the build's integrity pass, the brushes, a
    brush's level in the operation schema); nothing else changes. The `Ceiling` group plays them for 8.5 days
    (a 2-day drought and a 2-day badtide) and checks the load, the terrain voxel for voxel, the stored water
    and the water the editor settled near its edits, the objects, the sources above 16, the hazards against
    the cycle model, and the ground and objects on the land the editor raised. The probe cannot place
    buildings, so building on the slopes stays on Kyler's hands-on checklist.
20. **Each group made outside the repository writes its own maps** (Kyler, 2026-09-30). A group declares its writer in
    the catalog; `batch --group <name>` (or `--only` with its ids) calls it in the runner's own process before it
    plans: every map is built, compared by sha256 with the file on disk and rewritten if it differs, so a stale map is
    never planned, and the plan lists every map written. The launch code covers those bytes. The four probe-folder
    commands in Kyler's allow rules then cover every group; `tools/probe-<group>.ts` stays as a wrapper to run a writer
    by hand. `Tall maps` and `Sizes` have writers; `Parity` has one on its branch (`feature/parity` 881164b6); `Terrain 3D` needs one when it merges.
21. **Frame times and load time** (PLAN §20 D357 (9), DGM Probe 0.2.1). A game with `perf` runs timed phases after its
    first day: one speed each (normal, the fastest, the probe's), a camera pan over the whole map at the game's own zoom,
    the player's graphics, nothing else recorded meanwhile. Frames are timed with `Time.unscaledDeltaTime` inside the
    mod; the speed reached is game seconds per real second. The load time runs from `StartNewGame` to the game's
    interface. The Sizes group uses them; any group can.
