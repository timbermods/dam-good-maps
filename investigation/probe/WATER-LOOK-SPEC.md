# Probe spec: the water's look against the game (not run)

Prepared on 2026-10-29 for the next batch that planning starts; revised 2026-10-30 after #719's review and the
Badtide floor fit (`investigation/notes/water_and_soil.md` Q8). Nothing here launches Timberborn.

**The camera must be recorded.** The runner keeps each shot's pose id only (`Results.cs`); a pose can be rebuilt from
the id and the catalog (`runner/catalog.ts` `Pose`, `standardPoses`: deterministic per map). But the shots are not
taken at that camera: fitting the 2026-10-02 Badtide shots' cameras to each map's outline against the void round it
puts their vertical field of view at 31° to 37° and their distance 1.0 to 1.35 times the pose's (Q8, 2026-10-30), so
a tile projected with the pose lands a few tiles off. **For the probe owner:** ShotTaker's framing and
`standardPoses` disagree (field of view and distance); any analysis that ties pixels to tiles needs the real camera.
So this batch needs, as a prerequisite, the mod to write each shot's camera beside it: `<shot>.camera.json` with the
camera's view matrix (world to camera), its projection matrix, the screen size and the world's axes as the mod sees
them (Unity's x, y, z against the map's x, height, y). With that and the moment's snapshot (every tile's depth and
contamination), any pixel of a shot is tied to a tile.

## What it settles

1. **`BADWATER.floor`** (`src/render3d/waterPalette.ts`). This is the share of badwater's on-screen light that has
   no depth term: the game's reflection (F0 0.04) and its emissive detail. It is a stand-in of 0.37 (#713; 0.17 before
   it); the fit from the 2026-10-02 shots without their cameras gave no clear answer (0.44 with the pose's camera, 0.72
   with the outline-fitted ones; Q8).
2. **Clean water's depth darkening on screen.** The game's albedo × R × 2 goes near black by 3 levels, but the sky's
   reflection holds deep water up. Measuring that gives the reflection's share.
3. **The sky reflection, the sun's glint and the game's own highlight** at the game's smoothness, the soft-light of its
   gloss map, about 0.25 (0.15 contaminated): the brightening from fresnel at low angles, and the camera-tied highlight
   on the ripples (`WATER_SURFACE.highlight`).
4. **Waterfalls:** the fall's faces, their see-through (0.1 × (1 − d/5)) and that there is no whitewater, on a known
   fall.
5. **The shallow glow of partly bad water** (`BADWATER.glow`), on a film at about 20% bad.

## The map: WL1, "Two pools and a fall" (64²)

Written by a new `tools/probe-maps/waterlook.ts`, with a catalog entry (a `GameDef` with the poses below); both come
with the batch.

- **Ground** at level 8, grass, flat. No plants within 6 tiles of the water. The start is 20 tiles from either pool.
- **Clean pool** (x 6–25, y 6–25). Its floor is in five terraces, each 4 tiles wide, at depths of 0.25, 0.5, 1, 2
  and 3 levels below the surface (the floor at levels 7.75 → 5). A water source sits on the deepest terrace, set so
  the surface settles at level 8. A 3-tile sliver strip at its west edge has the floor at 7.9 (a 0.1 film).
- **Bad pool** (x 38–57, y 6–25): the same terraces and sliver, fed by a badwater source; it stays pure (1.0) at any
  weather. This is the synthetic badwater bed at known depths the floor needs: five depths, each 4 tiles wide, side
  by side under the same light. A one-tile dry wall separates it from the clean pool.
- **Mixed run** (x 26–37, y 30–33): an 0.5-deep channel where the two pools' overflows meet. It gives a gradient from
  0 to 1 bad. Its share at the shot time is read from the snapshot.
- **Fall** (x 20–44, y 44–60): a plateau at level 14 with a source of known strength (1.5). It pours over a straight
  6-tile lip into a pool at level 8 that is 1 level deep.
- **Shores:** the clean pool's south bank is grass; its east bank is dry ground (a dry patch made by keeping
  moisture off). This shows how the see-through and the edge look against bright and dark banks.

## Moments and settings

- **Temperate weather only.** Cycles are set so that no drought or badtide falls in the window. Take one moment at
  day 3, after the pools settle and the mixed run has a steady front, with a snapshot.
- **Water quality: a prerequisite, not yet possible.** The runner can't set it today: the mod's only graphics change
  is `GraphicsDimmer` (render scale, vsync, frame rate, in memory); nothing sets the game's graphics preset or
  `_HIGH_QUALITY_WATER_ENABLED`, and the runner never writes the game's settings. Two launches, **High** (the default
  preset) and **Low**, need a new probe-mod feature first: an in-memory water-quality switch (preferred), or a launch
  with that one setting backed up, changed and restored. Without it, the batch runs High only (the default), and the
  see-through share comes from the terraces' fit alone.
- **Time of day:** the mod has no clock hold (`GameDriver` only reads `DayProgress`), so the plan is to take every shot
  of a launch within one in-game hour of noon, the day progress logged with each.

## Poses (all fovY 40 as asked; the camera actually used is the one written beside each shot)

| id | target | yaw | pitch | distance | size | what for |
|---|---|---|---|---|---|---|
| `cal-clean` | clean pool centre, at the surface | −0.55 | 70° | 44 | 1440×940 | `WATER_CALIBRATION`'s method in-game: bands per terrace |
| `cal-bad` | bad pool centre | −0.55 | 70° | 44 | 1440×940 | the same for badwater: sets `BADWATER.floor` from the terraces' ratio |
| `game-clean` / `game-bad` | each pool | GAME_YAW | 55° | 40 | 1280×800 | the game's own angle |
| `low-clean` / `low-bad` | each pool | GAME_YAW + π/2 | 18° | 35 | 1280×800 | fresnel and the sky reflection at a low angle |
| `mixed` | the mixed run's middle | GAME_YAW | 55° | 25 | 1280×800 | the mix's colours by share (from the snapshot) |
| `fall-side` | the lip's middle, 3 levels down | across the fall | 15° | 30 | 1280×800 | the fall's faces and its landing |
| `fall-game` | the same | GAME_YAW | 55° | 40 | 1280×800 | the fall as players see it |
| `sun` | clean pool | the sun's azimuth + π | 35° | 30 | 1280×800 | the reflection and highlight looking toward the sun |

The sun's azimuth: the mod logs the main light's forward vector with each shot (with the camera file); the `sun` pose
is placed from it at run time (its yaw the light's horizontal direction turned by π, so the camera looks toward the
sun). Until the mod logs it, our own `LIGHT.sunAzimuth` (`src/render3d/palette.ts`) stands in, and the shot says so.

The same poses are then rendered by our page (`tools/capture-opening.ts`-style, both looks, with the camera from each
shot's file) for side-by-side sheets. That needs no game.

## What is read from the shots

- **Per terrace,** the band means as `WATER_CALIBRATION` takes them (5–15%, 15–40%, 45–55% and 96–98.5% of
  pixels by r + 2g + b), the terraces found by projecting their tiles with the shot's own camera.
- **The floor:** the bad pool's band means at 0.25 → 3 levels, fitted as `floor + (1 − floor) × G(d)/G(0.25)` (the
  raw `_DepthGradients` G), and against our render of the same map from the same camera (as Q8's method), so the
  see-through, the shadows and the sky's terms cancel.
- **Clean water:** the same fit with R × 2. Its residual is the reflection's share.
- **High against Low** on the same terrace, once the water-quality switch exists, isolates the see-through share's
  colour (Low shows no ground).
- **The mixed run:** colour against the snapshot's share. This checks `blendWater`, including the never-purple
  guard's 1.6-code deviation.
- **The fall and the highlight:** judged side by side with our renders, since there is nothing to fit.

## Tried without a new batch (2026-10-30)

The 2026-10-02 batch's Badtide shots (`C:\dgm-probe\shots\20261002-1610-batch\*-badtide2-end-water.jpg`) and their
snapshots (`C:\dgm-probe\results\20261002-1610-batch\*-badtide2-end.snapshot.json.gz`) were fitted for the floor with
the pose rebuilt from `standardPoses` and with cameras fitted to each map's outline. The two disagree by more than
either error bar (Q8), which is why the camera file above is a prerequisite.
