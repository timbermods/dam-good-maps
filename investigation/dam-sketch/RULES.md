# Rule evidence, in our own words

Existing evidence: PLAN §20 D383; FORMAT §4.3 water/momentum and §5 NaturalDam;
notes/navigation_ruins_entities §6; notes/water_and_soil Q2 and Q7;
terrain3d/GAME_RULES §3; rust-water INTEGRATION and PROFILE_REPORT.

The notes equate the player Dam with NaturalDam's 0.65 partial obstacle and Blockage
with a levee's full level. They do not give floodgate maxima or their support layout.
To close that gap, the installed Timberborn 1.1.2.4 blueprints and the following class
members were read in place. No game file, blueprint, asset or decompiled code is
included in this investigation, its generated outputs or the PR.

| Piece | Occupied height | Water barrier | Support |
|---|---:|---|---|
| Dam | 1 | 0.65 at its base | Ground or stackable; its top is stackable |
| Levee | 1 | One full level | Ground or stackable; its top is stackable |
| Floodgate | 3 | Selected height, 0 through 1 | Ground or stackable; not stackable on top |
| Double floodgate | 4 | Selected height, 0 through 2 | Same |
| Triple floodgate | 5 | Selected height, 0 through 3 | Same |

Both factions have those values. Blueprint evidence is the corresponding
Buildings/Landscaping template's BlockObjectSpec, FinishableWaterObstacleSpec,
FloodgateSpec and FinishableHorizontalWaterObstacleSpec.

WaterBuildings.Floodgate.SetHeight/ClampHeight/SetObstacleHeight: the selected height
is bounded by the template's maximum and used directly; zero removes its vertical
obstacle. The default initial height is maximum minus 0.35, but this engine requires
the selected height explicitly and never chooses that default for the player.
WaterObjects.WaterObstacle.AddToWaterService: the whole levels become full obstacles
and any remaining fractional level becomes a partial obstacle.
Finished player dams and gates also have a horizontal plane at their base. Stacking
dams therefore requires separate columns; filling the gap as solid would be wrong.

Partial barriers decay momentum below the crest and allow overflow above it; they
are not a guessed fixed flow rate. Above-crest flow, downhill entry from higher
ground, source-edge walls, saturation evaporation and both substeps are calculated
by the pinned game-rule implementation.

Notes Q7 supplies 768 ticks/day and the drought source shutoff. Evaporation continues;
the solver integrates it and all flow at every tick. A map file supplies no colony
population, authored farmland selection or future random weather calendar. Missing
values remain unknown. Weather frames can reproduce an existing calendar, its ramps,
source exceptions and badtide strengths; this tool never draws a replacement schedule.

Fidelity boundary: these are the existing validated binary64 ports of game rules,
not an execution of the game's float32 code. The stacked study's contamination model
and seep fade retain their documented limits. No new in-game calibration is claimed.
