# Dedicated-machine calibration needs (NOT RUN)

Use the five original recipes written by `node predictions.ts` in local/calibration/:
a dam, a levee, a double floodgate at selected height 1.50, two stacked dams, and a levee topped
with a dam. Every wall spans x=6..9 at y=9 on terrain floor 1; the channel, source, terrain masks,
finished piece positions, initial columns and exact predicted checkpoints are in each recipe.
The source is a finished clean source at (7,3,1), strength 0.10; the scene starts dry with zero momentum.
There is no colony consumption. During filling the source stays on; after the exact predicted
fill tick, switch its strength to zero. This is a controlled drought observation, not a random calendar.

Round 2 had NO emitter and an initial head 2.9 in the upper channel. Rust reproduces its dry result:
the initial pulse spills through the still-open lower dam gap, and the residual water evaporates during
the fill observation. It is not a two-level solid wall and the dry result was not a Rust/TypeScript
reporting mismatch. Preserve the unfed-pulse Node regression; calibrate the corrected source-fed
fill-then-shutoff recipe. Verify separate [1,2) and [2,34) air columns at the stacked wall before stepping.

The dedicated session needs a bridge that places and finishes real player buildings, selects gate
height, applies/verifies the exact source strength and restores prescribed initial water/momentum.
The existing Probe actions cannot stage finished walls or that state. It also needs a deterministic
source-shutoff action at the recipe's fill tick. Do not run a terrain-only file as if the wall existed.
This delivery supplies the engine's geometry/state recipes, not guessed game save components or a
pretend executable Probe job. Kyler's authorized batch and game-derived scene files stay there.

Before the first tick, record every column floor/ceiling/depth/overflow, zero momentum, finished
object x/y/z and selected gate height, plus the source. Reject a staging mismatch. Compare early
fill checkpoints, the exact fill tick (1024/768/1024/1024/1152 respectively) and the source-off drought.
Freeze the fill-time initially wet measurementColumns; never shrink the mask during dry-out.
Record every 8 ticks until the first empty mask, with whole-map snapshots at fill and daily checks.
Record all stacked columns and overflow; a visible top-column snapshot is insufficient. Water volume
is depth + overflow once, and a column's visible level is floor + depth. Exposure is checked at its
own authored base. A missing pressure observation is not a pass.

Predeclared tolerances retained from round 2: each column level ±0.01, held volume
±max(0.05 m³, 1%), dry-out day bracket ±8/768 day. Compare each observation with the supplied
exact-clock prediction. "Dry" means zero depth/overflow on the fixed mask, not the pump threshold.
Record missing observations as not measurable; all game outcomes are currently NOT RUN.
The 90-day wet horizon is censored, never treated as an exact lifetime. No probe run was made here.
