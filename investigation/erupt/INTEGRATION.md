# Proposal: four forces, one core

This is a proposal only. No editor button, document schema, exporter or production simulator is changed.
It extends Carve's integration proposal and the Craterize/Quake prototypes for the current D203/D206 plan.

## The editor

Put **Carve · Craterize · Quake · Erupt** in the distinct forces group beside Source.
Erupt is its own verb and top-bar button. The options row always begins with **Mode**:

| Tool | First control | Following controls |
|---|---|---|
| Carve | Unleash / Aim | Its existing complete options, including Power and river character |
| Craterize | Strike / Aim | Power, Size, Walls, Centre, Debris, Try another |
| Quake | Lift / Slide | Power, Scarp, Try another |
| Erupt | Vent / Fissure | Power, Shape, Summit, Flows and Ridges, Try another |

Keep the land dominant. A quiet red ring/line says “Start here”. Vent acts on pointer-down.
Fissure traces a continuous line, with bends; releasing begins one event. Keyboard arrows and Enter offer
the same gesture. Esc restores the complete pre-event view immediately. Undo while settling also cancels.
No confirmation dialog or terrain export is introduced by the force.

## Extract the foundation, then adopt adapters

Do not merge four worker loops or four copies of the demo UI into Live editing.
First extract the structures already proven by Carve and carried into Craterize, Quake and this study:

| Shared module | Responsibility |
|---|---|
| Force session | Idle, drawing, planning, changing, settling, committed; monotonic cancellation epoch |
| Intent and personality | Validated gesture, explicit seed, deterministic next seed, original reroll base |
| Patch operation | Whole-level terrain delta, material delta, entities/dead trees, exact before/after water |
| Geology | Map-fixed horizontal beds plus local deposited layers; query hardness at tile and occupied level |
| Object policy | Rotated footprint, protected start, riding rigid pads, force-specific destruction |
| Water journey | Preserve existing water during terrain motion; sliced repo simulation; canonical final result |
| Dirty chunks | Shared render mesh and lighting jobs, transferable buffers, bounded uploads per animation frame |
| View history | Retained GPU groups for instant cancel/undo, bounded memory and reference-counted disposal |
| Effects and camera | Pooled particles, shared motion preference, optional shake/follow, no effect work when off |
| Quiet checks | Background support, reachability, water and export checks, never blocking the gesture |

Each force supplies an adapter: validate intent, describe anatomy, advance a bounded plan slice, produce a
terrain stage, apply its object consequences, describe effect anchors. Carve retains its moving head and
river personality; Craterize supplies a depression and ejecta; Quake supplies displacement along a fault;
Erupt supplies uplift, collapse and hardened flows. They share the session, not their terrain equations.

Use a worker token on every message. Check it after each yield and before committing history. A newer
token invalidates queued mesh/lighting batches. Keep one pre-event snapshot, then record exactly one patch.
The demo demonstrates this with four-row planning slices, eight rise stages and chunk upload budgets.
The production scheduler should budget elapsed worker time and adapt the number of stage frames to workload.

Keep the visual tail separate from the editing transaction. Erupt's smoke, ash and surface heat continue
fading after uplift or water completion, without holding the controls; cancel, undo, load and replay clear
them immediately. Reduced motion jumps to the terrain result. Interpolated meshes must shade against the
same height reference as their lighting textures, so rising tops are never misclassified as dark cave floors.
Commit a new morph identity only when the complete chunk batch becomes visible. Warm particle shaders
during initial loading rather than at the first gesture.

Try another replaces the most recent force from its **original input terrain**. It is a fresh undo step:
undo returns to the kept personality. Cancelling consumes the attempted seed but restores the kept map.
Redo and saved replay assign recorded values; they never rerun terrain or water algorithms.

## Rock that survives every tool

The prototype retains Craterize's 23 horizontal hardness bands and adds a Uint32 bit mask per tile.
Bit z means fresh hard volcanic rock at occupied level z (0–21). Height 22 leaves the top layer empty.
Erupt records every newly raised solid level; older masks remain when eruptions overlap. Masks are included
in undo and saved replay. This costs 256 KiB for a 256² map before compression; operation records are sparse.

The vendored Carve adapter is the prior engine at b14e23f, with local hardness used for cutting and route cost.
Its dry comparison disables the old preview-water ribbon. It proves local rock affects the course without
editing Carve's branch. Production Carve should call the core hardness query, not copy this adapter.
Craterize excavates material runs; Quake translates them with displaced terrain. Raise/Lower/Flatten must
also update them. Cave/voxel work will need material runs beside solid runs, rather than a surface-only mask.
Add geology to the project format and operation schema with migration defaults; never store it in .timber
as an invented game component. Old maps derive their default horizontal beds once, independently of a force seed.

## Water and objects

Erupt's policy permits no new emitters and no water injection. Existing sources keep their settings and
horizontal footprints, riding the ground vertically. During rise, existing depth is carried onto the rising ground and WaterSim pushes it downhill;
the source is the only input, while evaporation and edge drainage remain the repo's own rules.
The final water comes from canonicalRun(modelFor(finalMap)), byte-equal to canonicalSettle.
The preview trajectory is intentionally not the final save state.

Rigid objects ride a supporting terrace across their transformed footprint. Trees close to a vent become
dead entities plus radial fallen visuals; objects in the immediate vent disappear. Production integration
should preserve existing unknown components and run the repo's normal object/support validator afterward.
The start and its small buffer retain their heights; a vent on that buffer or a fissure crossing it is refused.
Water can still flood a previously safe start: flag that as a quiet playability warning, not a dialog.

## Adoption checks

Keep the full settings of all four tools. Add no reduced substitute for Carve's river character.
Use the actual editor's rendering and undo system once the shared API exists. Test seeded replay,
interrupted settle, cancellation races, stale messages, imported object components, tall maps, edge clips,
overlap and regeneration replay across all adapters. Reuse the product's validators and canonical simulator.
Benchmark the actual 256² editor with the target GPU; this demo's frame timings are evidence for the design,
not a promise for every machine.
