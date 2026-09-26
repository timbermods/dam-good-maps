# Adoption in Live editing — proposals only

Craterize gets its own top-bar button next to Carve, as D202 already specifies.
Nothing in this investigation changes the editor or its living plans.

## Interaction

Pick Craterize, then click for Strike. Aim captures the pointer at the impact
point; dragging sets travel direction and glancing angle. It must not orbit the
camera at the same time. Right drag still orbits. Keep Power in the small options
row; Size follows it until unchecked. Offer Steep/Terraced, Centre, Debris and
Rays together. Try another repeats the last intent on its original ground and
increments its stored personality seed. Restore that impact's settings in the
controls, even if the player has since changed them.

Draw the footprint on the land, following its height. Red plus “Start here”
means the hit is refused. Preserve the start's footprint and entrance margin
even when nearby debris crosses them. This prototype also protects existing
emitter footprints, keeping their exact entities, locations and strengths.

## One transaction

Adopt `craterizeResult`, version 1, alongside Carve's result operation.
It stores sorted [tile, before, after] triples, exact entities, fallen-tree poses,
water before/after, settings, intent, settle ticks and the personality seed.
Replay, undo and redo assign these values; they never run the impact again.
The prototype rejects stale terrain, object and water preconditions.

Keep the pre-impact map until the animation, water and final meshes all finish.
Esc and Undo cancel the entire transaction at every stage. Epochs discard stale
worker messages; a completion/cancellation race also restores the preceding
result. Main-thread GPU caches make the last result revert in the input event.
History here keeps 16 impacts and their view caches. The editor should use its
own history budget and persistence.

For Try another, distinguish “previously kept version” from “original impact
ground.” The former is the undo target; the latter is the simulation input.
Cancelled attempts still consume a seed. Saved bundles retain both maps so
portable replay can still try a new personality.

## Land and layers

Move the pure field model into a shared module only after approval. The impact
is a morphology model scaled for whole game levels, not a calibrated physical
simulation. Its size thresholds and glancing exaggeration are editing choices.
All sampling is deterministic; model advancement is independent of animation
time. The worker plans four terrain rows per yield.

Keep the wall profiles separate: Steep concentrates the drop into a short
cliff, while Terraced distributes it across four scarps and three broad benches.
Bowl retains a rounded inner floor. Rays follow curved paths with varying width,
broken lobes, tapering coverage and scattered secondary pits. Heavy uses wider
raised bands (one to three extra levels) and larger, closer secondary pits to
read as a starburst at map scale. Light keeps sparse one-level patches. Seeded
coverage preserves the feathered shape at integer heights. Unless the diameter reaches
65% of the shorter map side, ray lengths leave a margin before the map edges.

Carve's hard horizontal bed is reused, frozen at map load. A supplied shared
`rockLayers` array can replace the terrain-derived fallback. Each impact and
reroll then exposes the same geology. This prototype permits heights 0–22,
which occupy voxel layers 0–21 and leave layer 22 empty. Live editing must
also respect the document's own height limit and its stored voxel columns.
Do not flatten imported caves/overhangs to this heightfield adapter: extend
the operation to column deltas, or explicitly disable the prototype for those
documents until the voxel-aware path exists.

Fallen trees retain dead entity components and a separate radial pose for the
preview. Timberborn's known map-tree format has dead standing trees, not this
horizontal pose. Decide the export treatment explicitly before integration:
keep dead standing resources or remove them with a stated rule. This prototype
does not export a .timber file. Other objects whose ground changes are removed;
existing sources are retained and no source is created.

## Water

Feed the changed terrain and preserved sources into the repository's
`WaterSim` with the existing depth and contamination. The impact never invokes
prefill or adds water. `SettleRun` advances two ticks per slice on its fixed
schedule. A live mesh update every 128 ticks shows the response; the final
stored snapshot includes the stopping result. The capped result is explicitly
reported if it does not settle.

Use the editor's local-water scheduling for the first frames when integrating.
Its export path must still run the repository's canonical water checks.
The prototype's warm result deliberately preserves water already placed in an
isolated basin, even without a source; it is not advertised as canonical export
water. A debris dam is terrain: remove it with a terrain tool and the lake can
drain through the same simulation.

## Rendering and verification

Reuse the actual clean terrain, object, lighting and water shaders. The worker
builds dirty chunks and a union of before/after terrain faces. A shader morphs
those faces for 1.35 seconds after the incoming streak; final map values remain
integers. Lighting transitions with the land so rising ground does not acquire
cave shading or cast its future rim shadows early. Trees switch poses at impact.
Main-thread uploads have a two-chunk / 3 ms scheduling target.
Cache transitions share geometry where possible and release abandoned history.

The moment uses 64 dust instances, 32 chunks, a flash, a streak and a ring.
Compile those materials during loading. Camera shake and follow are opt-in.
Reduced motion skips deformation, effects, water animation and camera motion.
It never changes the saved result. This is bounded rendering work, not a claim
that every GPU has a guaranteed frame rate; validate using the visible FPS/p95
readout and the committed browser measurements.

Before adopting: run model/worker checks, validate the gestures and instant
history at 256², check the native export treatment of trees, and run the editor's
existing checks. Keep generated map data and test output out of source control.
