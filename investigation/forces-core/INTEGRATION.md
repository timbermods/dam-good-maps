# Live editing adoption — proposals only

This investigation changes no editor, generator, project format or shared renderer files.
Adoption belongs to the milestone session. It does not require merging the four prototype
branches to try this demo. D219/D220 now confirm all four for preview adoption, including
Quake’s Lift and Slide. Release remains gated on Kyler trying them. This task only opens
its investigation PR; it does not perform any milestone merges or preview publication.

## Proposed file layout

| Investigation | Proposed destination |
| --- | --- |
| core/map, random, rock, objects | src/core/forces/ |
| core/session, scheduler, water, operation | src/core/forces/ |
| verbs/* (terrain models and adapters) | src/core/forces/verbs/ |
| core/input, options | src/editor/forces/ |
| core/effects and verbs/*/effects | src/render3d/forces/ |
| core/meshes and demo/view | Extend the existing render3d chunk/view services |
| worker.ts | Commands in the existing editor worker, not a second map owner |
| demo/app | A thin force driver and options row in the Live editing page |

Resolve repository-relative imports during the move. Production src must not import investigation.
Use the existing three.js 0.186.0 instance. Remove replaced prototype plumbing, retaining the
pinned parity tests. The source list is SOURCES.json; the latest Quake includes painted Lift,
coalesced revisions, full 3–20 tile Slide transport and river-mouth reconnection.

The handoff describes a Carve port already in progress on feature/live-editing. Compare that
port with this implementation before moving files. Preserve its editor adapters and project
compatibility; replace duplicated services rather than adding another history or water owner.

## One operation and one history entry

core/operation.ts is the executable contract:

```ts
{
  op: "forceResult",
  params: {
    version: 1, model: "forces-core/1",
    id, request: { verb, settings, intent },
    W, H, maxHeight, before, after, replaces?,
    steps, settled, ticks,
    terrain: [[tile, oldHeight, newHeight], ...],
    rock: [[tile, oldVolcanicBits, newVolcanicBits], ...],
    water: [[tile, oldDepth, newDepth], ...],
    contamination: [[tile, oldFraction, newFraction], ...],
    entities: [beforeEntities, afterEntities],
    fallen: [beforePoses, afterPoses],
    layers: [beforeBeds, afterBeds]
  }
}
```

Changes are sorted, unique, bounded and literal. The fingerprints cover the entire terrain,
water, objects, fallen poses and geology, including untouched cells. Replay validates the
source state and assigns the stored destination values. Undo assigns the stored old values.
Neither path calls a force algorithm or a water solver. Unknown components remain on entities.

Propose registering forceResult in core/doc/ops.ts and ops.schema.json, LOG_OPS and the
document checker. MapSession should append it as one ordinary AppliedOp with seq, origin and
a label such as “Slide” or “Erupt”. Do not record animation fronts or painted revisions.
Do not send its literal result back through a generation rebuild that overwrites its water.

Try another starts from the original event input, while its undo returns to the previously
kept variation. replaces references that immediately preceding result. Persist the original
series base or reconstruct it by walking these references. Persist the next variation seed too:
cancelled attempts consume a seed. The demo’s save bundle demonstrates this without simulation.

Keep the editor’s normal dirty-region and snapshot machinery. The demo retains shared GPU
groups at each history position so Esc and undo can switch the visible map before worker
acknowledgement. Production should integrate this ownership with the editor’s cache budget.
An event token invalidates every queued mesh and lighting message after cancellation. An
action id handles Esc arriving just after its matching completion message. A cancelled new
event must never undo the force before it.

## Project files, regeneration and .timber

Persist geology and fallen poses beside the project’s stored base and in result operations.
The horizontal hardness stack is derived once on import; each tile additionally has 22 bits
of volcanic material, one per occupied level 0–21. Erupt adds hard material, excavation removes
exposed bits, Lift moves them vertically and Slide transports them with its source tiles.
Other editor brushes must maintain these bits when adopted. Never reroll geology.

Use an explicit project migration and keep format-3 solid runs, imported caves and overhangs
unchanged. This study is a heightfield core; it does not flatten or migrate voxel projects.
For multi-run columns, the initial editor adapter should protect those columns, until material
runs and stacked water are integrated with the 3D stages.

Keep the editor’s stored base across generator versions. On regeneration, preserve force
edits as constraints, or mark an incompatible result orphaned with its reason. A fingerprint
conflict must not silently rerun the force with a different result. Ordered interleaving with
ordinary brushes, source edits and placements needs editor contract tests.

The demo file is dgm-forces version 1, not a replacement for .damgoodmaps.json. Prototype-specific
saved bundles need an explicit converter when adopted; no existing project reader changes here.
The small samples/erupt-8.json shows the new envelope and a complete replay base.

Only existing terrain, entity and settled-water fields go into .timber. Hardness and fallen
poses are project metadata, never invented Timberborn components. Reuse the normal writer,
export validation and exactly 23 terrain layers, with layer 22 empty. No game launch is needed
to evaluate this investigation.

## Worker, water and rendering

Reuse the editor worker. Planning advances in four-row slices, meshing yields between chunks,
and settling advances two ticks per yield. MessageChannel avoids accumulated Windows timer
floors; periodic timer yields let input through. Individual kernel calls remain indivisible.
The renderer and pointer loop stay on the main thread. Quake has immediate local pen motion,
then actual source-to-destination GPU glides; reduced motion suppresses both.

All forces use the repository WaterSim. Carve keeps its moving muddy preview and two-stage
retained-oxbow solve. Craterize settles from the original water volume. Erupt and Quake finish
with canonicalRun. Preview timing may vary; saved endpoints do not. Never replace a stored
endpoint with a later canonical solve during undo or project loading.

Keep physical policies in the verbs: Carve excavates objects, impact/vent zones erase or topple,
and uplift/displacement carry survivors. Shared services own footprint transforms, cloning,
support reconciliation, persistence and fallen-pose cleanup. Quake retains its dry-start veto;
the other prototypes report flooding quietly. Direct strikes through the start are refused
with the same red cue and “Start here”.

Move pooled effects and camera preferences into one renderer owner. Keep surge, dust, radial
knockdown, cracks, plume, cooling, vertical growth and Slide glides. Render-only shake must be
applied after camera controls update, then removed, so it cannot drift the camera. Honor both
the system reduced-motion preference and the local motion switch, including changes mid-event.
Follow remains optional. Effects clear on undo, cancel and map load.

## Top bar and input

Use the distinct **Forces** group: **Carve · Craterize · Quake · Erupt**, between the brushes
and Remove. Water/Badwater sources remain on the shelf. Each options row begins with its mode
switch; OPTIONS in core/options.ts lists the full settings. Preserve Width, Wander, Defy gravity,
Dry canyon, all centres/summits, debris/flows, rays/ridges, scarp and recorded seed.

Click places a point event. Drag aims; painting grows a fault or fissure. Shift-click joins the
last point with a straight line. X flips Quake’s selected side, including while held. Esc cancels,
Ctrl+Z undoes, and release creates one operation. Queue subsequent painted strokes while the
preceding event settles. Stop keeps Carve’s current prefix; pause does not advance simulation.

Before adoption, run these tests plus the editor’s operation/schema, interleaved history,
format-3 roundtrip, export, keyboard/accessibility and reduced-motion browser suites. Keep the
45 pinned output comparisons and Quake’s random-stroke, wet-river, Lift and full-offset Slide
regressions. The demo’s Chrome measurements are evidence for this machine, not a universal FPS
guarantee.
