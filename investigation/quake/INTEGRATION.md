# Quake in Live editing — proposals only

No editor, generator, format, shared renderer or simulation files change in this prototype.

## The tool

Put **Quake** beside **Carve** and **Craterize** in the visually distinct forces group between Source and Remove (D203). Press and drag to paint a fault; ground reacts behind the cursor, and release completes the rupture. The left side moves by default. Show that side with a faint tint and let **X** flip it during the stroke. A fault through the start is red with “Start here”. This brush grammar supersedes the initial side-pick prototype.

The small options row contains **Lift / Slide**, **Power**, **Sheer / Stepped**, **Side**, and **Try another**. Power controls displacement and shaking reach; stroke length controls the fault's extent. Selected Lift rises; the other side drops. Selected Slide moves 3–20 tiles along the stroke's coherent heading, while the opposite bank stays on its old course. Short strokes retain full Power around their ends before fading outside the block. Strength uses Shift+scroll under D196; ordinary scroll zooms. Keep camera follow/shake in view options and honor reduced motion.

## One shared forces core

Carve and the available Craterize code duplicate map snapshots, plain entity conversion, footprint iteration, deterministic personality storage, worker epochs, canonical settling, dirty chunks, clean materials, effect pools, rendering caches and saved result operations. Quake deliberately reuses these mechanisms within its own allowed folder. Extract them once when adopting the three prototypes; do not maintain three production copies.

| Proposed module | Shared responsibility | Prototype evidence |
| --- | --- | --- |
| `forces/state` | Immutable before state, typed terrain/water, entity identities, frozen hidden rock layers, fallen-tree view state | Carve snapshots; Craterize geology and fallen trees; Quake `engine.ts` |
| `forces/session` | Cancellation epochs, bounded worker slices, progress and active transaction; one completed operation | Carve worker; Quake `worker.ts` |
| `forces/brush` | Continuous surface picking, light smoothing, display-rate feedback, coalesced growing intent and queued strokes | Quake `brush.ts`, `app.ts`, streaming worker |
| `forces/result` | Literal sorted terrain changes, full object/water checkpoints, base fingerprints, versioned JSON replay | Carve result envelope; Craterize and Quake `operation.ts` |
| `forces/water` | Existing-water transport, live WaterSim, separate canonicalRun, final exact replacement | All three workers; Quake creates no source |
| `forces/view` | Dirty chunk queues, clean terrain/water/object shaders, frozen rock bands, cached immediate undo, camera hooks | Carve shell; Craterize fallen meshes; Quake `app.ts` / `meshes.ts` |
| `forces/moment` | Fixed instance pools, rupture/head events, reduced-motion gate, optional follow/shake | Carve surge pool; Quake `effects.ts` |

A force supplies a narrow adapter:

```ts
interface ForceAdapter<Settings, Intent, Plan> {
  validate(base: ForceMap, settings: Settings, intent: Intent): string | null;
  prepare(base: ForceMap, settings: Settings, intent: Intent): SlicedPlan<Plan>;
  advance(plan: Plan, step: number, live: ForceMap): ForceFrame;
  // The core owns live water, cancellation, rendering and the final transaction.
}
```

Carve's adapter advances its river head and owns its optional retained source. Craterize's adapter supplies its impact field and radial knockdown. Quake's supplies its seeded fault, signed block field and displacement. Keep these three force algorithms separate. There should be no “mode” switch containing all three algorithms in the core.

Freeze geology at map load. Personality changes replace the force from its original ground; they do not change geology or stack a second event. A cancelled alternative restores the previously kept version. Seeds, settings, intent, final terrain, objects and water belong to the operation. Undo/redo/replay assign stored results, never re-simulate them.

Expose `begin`, `update`, `end`, and `cancel` around that adapter. Each update replaces the intent inside one transaction; a worker's message cadence must never determine the saved terrain. Keep pen drawing independent of worker readiness, and retain subsequent strokes while the preceding result settles. Match the visible terrain's height/water bytes to each uploaded chunk before replacing its lighting. Share this plumbing rather than copying another event loop into each force.

Let `ForceFrame` optionally carry source-tile provenance and previous-to-final offsets for terrain, water and object instances. Slide's forward transport supplies these directly. The shared view interpolates the real displacement over 240 ms, carries interrupted motion between revisions, and preserves the clock during water remeshing. Rigid tile faces avoid bending a whole greedy rectangle across the fault. A temporary solid surface fills the opening under the glide. Only the view uses fractional positions; saved terrain and objects remain integer. Clear interpolation on Esc/undo and snap to final positions under reduced motion. Test actual source-to-destination correspondence and identifiable ridge/object movement; changed-height counts cannot establish that Slide worked.

## Water and objects

The live event carries existing water with moved ground. Slide forwards volumes and contamination mass into destinations and sums collisions; the quake itself adds none. Repository sources continue running with their original strengths. The intermediate WaterSim state is for watching; the operation receives canonicalRun's terrain/source-derived result, including its settled flag and tick count. Never export the intermediate water. Source-free water may disappear at canonical handover, consistent with the current repository contract.

Slide also connects the two displaced wet river mouths with a short cut along the fault, using the original riverbed level. Moving water alone cannot get through the intervening bank. Keep this channel rule in Quake's force adapter, and require a wet downstream route in both live and canonical checks. On changing brush revisions, remap the existing warm water between offsets, preserving volume and contamination mass even when the selected side flips.

Move objects with their original block before rebuilding the water model. Preserve ids and components; stamp rigid multi-tile supports and the start's entrance apron. Trees on the fault become dead entities with a fallen view pose, recorded in the result. At a boundary, terrain samples continue the nearest existing ground and objects remain in bounds; collisions resolve deterministically near the transported anchor. A completed result must keep a flat, dry start; this prototype reverts an event whose canonical water covers it. Resource reach remains a quiet consequence check, not an extra confirmation.

Fallen pose is prototype view metadata. Production adoption must decide whether to persist it in the project view schema or display ordinary dead trees after reopening; Timberborn's entity format has no matching fallen-pose field. Quake does not export `.timber` files itself.

## Responsiveness and adoption checks

Reuse the editor's worker and dirty-chunk queue. The prototype slices geometry planning by four rows, yields during meshing and every two water ticks, and uploads at most two chunks within a 3 ms scheduling budget per animation frame. MessageChannel yields need periodic timer yields so posted cancellation is not starved. A single mesh or water tick is still indivisible.

Keep a render cache at each undo position so undo appears before worker acknowledgement, and dispose shared geometry only after all referencing cache entries are released. Integrate this with the editor's history budget; the investigation keeps its small session history in memory. Cancel invalidates queued uploads by epoch and restores the saved texture/geometry state immediately.

Before adoption: register `quakeResult` in the document operation schema and migrations; connect editor dirty regions and history; test brush input during force settling; test keyboard/tool transitions, reduced-motion media changes, imported entities and taller-map caps; measure 256² on representative hardware. Run the existing editor export and replay suites. In-game export checks remain a separate, explicitly authorized probe task. No merge or production adoption is proposed as part of this PR.
