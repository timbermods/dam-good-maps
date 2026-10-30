# Probe spec: the water's look against the game (not run)

Prepared on 2026-10-29 for the next batch that planning starts. Nothing here launches Timberborn. The runner already
records every camera. A pose is target, yaw, pitch, distance and vertical field of view (`runner/catalog.ts` `Pose`),
and each moment's snapshot gives every tile's depth and contamination. So any pixel of a shot can be tied to a tile.

## What it settles

1. **`BADWATER.floor`** (`src/render3d/waterPalette.ts`). This is the share of badwater's on-screen light that has
   no depth term: the game's reflection (F0 0.04) and its emissive detail. It is now a stand-in of 0.37.
2. **Clean water's depth darkening on screen.** The game's albedo × R × 2 goes near black by 3 levels, but the sky's
   reflection holds deep water up. Measuring that gives the reflection's share.
3. **The sun glint and the sky reflection** at the game's GGX smoothness of 0.672 (0.15 contaminated): the size
   and strength of the highlight, and the brightening from fresnel at low angles.
4. **Waterfalls:** the fall's faces, their see-through (0.1 × (1 − d/5)) and any whitewater, on a known fall.
5. **The shallow glow of partly bad water** (`BADWATER.glow`), on a film at about 20% bad.

## The map: WL1, "Two pools and a fall" (64², written by a new `tools/probe-maps/waterlook.ts`)

- **Ground** at level 8, grass, flat. No plants within 6 tiles of the water. The start is 20 tiles from either pool.
- **Clean pool** (x 6–25, y 6–25). Its floor is in five terraces, each 4 tiles wide, at depths of 0.25, 0.5, 1, 2
  and 3 levels below the surface (the floor at levels 7.75 → 5). A water source sits on the deepest terrace, set so
  the surface settles at level 8. A 3-tile sliver strip at its west edge has the floor at 7.9 (a 0.1 film).
- **Bad pool** (x 38–57, y 6–25): the same terraces and sliver, fed by a badwater source. It stays pure (1.0) at any
  weather. A one-tile dry wall separates it from the clean pool.
- **Mixed run** (x 26–37, y 30–33): an 0.5-deep channel where the two pools' overflows meet. It gives a gradient from
  0 to 1 bad. Its share at the shot time is read from the snapshot.
- **Fall** (x 20–44, y 44–60): a plateau at level 14 with a source of known strength (1.5). It pours over a straight
  6-tile lip into a pool at level 8 that is 1 level deep.
- **Shores:** the clean pool's south bank is grass; its east bank is dry ground (a dry patch made by keeping
  moisture off). This shows how the see-through and the edge look against bright and dark banks.

## Moments and settings

- **Temperate weather only.** Cycles are set so that no drought or badtide falls in the window. Take one moment at
  day 3, after the pools settle and the mixed run has a steady front, with a snapshot.
- **Water quality:** two launches, **High** (the default preset, `_HIGH_QUALITY_WATER_ENABLED`) and **Low**. This
  separates the see-through share from the rest. Graphics settings are backed up and restored, as every batch does.
- **Time of day:** fixed at noon in both launches. If the probe can't hold the clock, take the shots within one
  in-game hour.

## Poses (all fovY 40)

| id | target | yaw | pitch | distance | size | what for |
|---|---|---|---|---|---|---|
| `cal-clean` | clean pool centre, at the surface | −0.55 | 70° | 44 | 1440×940 | `WATER_CALIBRATION`'s method in-game: bands per terrace |
| `cal-bad` | bad pool centre | −0.55 | 70° | 44 | 1440×940 | the same for badwater: sets `BADWATER.floor` from the terraces' ratio |
| `game-clean` / `game-bad` | each pool | GAME_YAW | 55° | 40 | 1280×800 | the game's own angle |
| `low-clean` / `low-bad` | each pool | GAME_YAW + π/2 | 18° | 35 | 1280×800 | fresnel and the sky reflection at a low angle |
| `mixed` | the mixed run's middle | GAME_YAW | 55° | 25 | 1280×800 | the mix's colours by share (from the snapshot) |
| `fall-side` | the lip's middle, 3 levels down | across the fall | 15° | 30 | 1280×800 | the fall's faces and its landing |
| `fall-game` | the same | GAME_YAW | 55° | 40 | 1280×800 | the fall as players see it |
| `sun` | clean pool, aimed at the sun's reflection | the sun's azimuth + π | 35° | 30 | 1280×800 | the GGX glint |

The same poses are then rendered by our page (`tools/capture-opening.ts`-style, both looks) for side-by-side
sheets. That needs no game.

## What is read from the shots

- **Per terrace,** the band means as `WATER_CALIBRATION` takes them (5–15%, 15–40%, 45–55% and 96–98.5% of
  pixels by r + 2g + b).
- **The floor:** the bad pool's band means at 0.25 → 3 levels, fitted as `floor + (1 − floor) × G(d)/G(0.25)` (the
  raw `_DepthGradients` G).
- **Clean water:** the same fit with R × 2. Its residual is the reflection's share.
- **High against Low** on the same terrace isolates the see-through share's colour (Low shows no ground).
- **The mixed run:** colour against the snapshot's share. This checks `blendWater`, including the never-purple
  guard's 1.6-code deviation.
- **The fall and the glint:** judged side by side with our renders, since there is nothing to fit.

## Already possible without a new batch

The 2026-10-02 batch's Badtide shots (`C:\dgm-probe\shots\20261002-1610-batch\*-badtide2-end-water.jpg`) used the
standard `water` pose (`catalog.ts` `standardPoses`). Their snapshots
(`C:\dgm-probe\results\20261002-1610-batch\*-badtide2-end.snapshot.json.gz`) hold every tile's depth and
contamination (0.5–1.0 at that moment). Projecting each wet tile into the shot ties pixels to depths. That gives a
first fit of the floor from shots that already exist, with no new probe run. The lighting is the Badtide grade's, so
WL1 is still needed for the calibration.
