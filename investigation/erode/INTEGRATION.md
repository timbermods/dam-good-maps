# Integration: how Erode and the mesher would be adopted

A proposal, not an instruction; nothing is adopted until Kyler has tried the demo. Erode hollows rock under a
roof, so it needs terrain above terrain: it lands with or after the 3D stages (terrain3d DESIGN §9), and its
mesher is one candidate for 3D-c's view.

Round 2 adds optional `ErodeSettings.details` (null = Auto, number = pinned), `ErodeInput.water`, and resolved `ErodePlan.details`/`wash`; retain resolved details with the operation and persist pins/More with editor preferences.
Round 2 supersedes the surface-preservation and 2–4-second assumptions below: washes and low lips lower surfaces (reconcile objects/start and re-settle water on adoption); the same 24 buckets finish in 0.65 seconds from gesture end, with lingering effects interrupted by the next gesture.

## What it needs first (3D-a)

- **Terrain as runs in the document.** The forces core's `ForceMap` holds `heights` only. Erode's land is one
  32-bit mask per tile (`core/terrain.ts`, the form terrain3d DESIGN §2.1 proposes), and its result changes
  masks, never heights. 3D-a's `TerrainData` (heights plus `runs`, format 3) is what carries it.
- **The support rule in the build.** `src/core/validate/checks.ts` has `unsupportedVoxels`; 3D-a makes it run on
  every map, not only on tiles with two floors (terrain3d INVENTORY, bug 1). Erode keeps the rule by
  construction; the build's check is the second line.
- **Water per air gap.** `core/water.ts` is a placeholder. 3D-a's stacked-column water replaces it; Erode then
  shows the settled water like every other force.

## Erode on the forces core

- **A staged run**, like Craterize, Erupt and Quake (`src/core/forces/runs.ts` on `feature/forces`): `planErode`
  is the plan (tens of milliseconds at 128², so one planning slice, or a few rows a step at 256²); its 24
  buckets are the stages, at Erode's own pace (D266), 2 to 4 seconds; `finishAll` assigns the final masks.
- **Its cue** for the effects and the sounds: phase `wear`, progress, the focus (`plan.focus`), and the blocks
  worn in the last stage (the demo spawns its dust and stones from them).
- **Its result is literal**: the changed tiles and their new masks (a runs form of `ForceResult`), one history
  entry, replayed by assignment. Objects: none are removed, since no surface changes; the start never needs
  carrying (D257), and a source's own ground is never worn.
- **Its inputs** are already the core's: the rock beds (`ForceMap.rockLayers`, `geology`), the seed (Try
  another is `nextSeed`), and `protectedGround` (the land above the layer showing, an imported map's caves),
  added to the `keep` mask with the emitters' ground.
- **Its row**: Power, Size with Auto (D226), Try another. Its gestures (D258): a click is one click; a drag is
  a painted stroke that stays visible as it's drawn. Each gesture point carries the level the pointer touched
  (the pick's voxel), which the core's gestures don't pass yet. No camera motion (D265).
- **Port**: `core/erode.ts` and `core/support.ts` move to `src/core/forces/erode/` nearly as they are; the
  `Terrain` class becomes 3D-a's runs module. A pinned case (the crater lip, its seed) proves the port, as
  `tools/carve-equiv.ts` does for Carve.

## The mesher in the product

- `core/mesher.ts` is terrain3d's `proto/mesher.ts` on the mask form: every face toward air, greedy per plane in
  32 × 32 chunks, undersides included, one path for heightfield and cave tiles alike. It would replace the
  per-voxel faces `src/render3d/mesh.ts` draws for cave columns (terrain3d INVENTORY §8) and, in 3D-c, the
  heightfield path too; an edit remeshes only its chunks.
- `lightVolume` (sky light walked through air, sun light marched toward the view's sun, two bytes a cell) becomes
  a 3D texture beside the view's baked shadow map; the terrain shader samples it half a cell in front of each
  face, so the Standard look keeps its colours and gains dim caves and overhang shadows. At 256² it is about
  3 MB; an edit relights only the box it touched (plus the shadow's reach down-sun).
- The demo's shader copies the Standard look's lighting formula and wall treatment; in the product the
  underside and cave-floor branches go into `src/render3d/materials.ts`'s terrain shader rather than a second
  shader.
- To measure when built: the full budgets (PLAN §14.2) at 256² on the integrated GPU, as terrain3d §7.4 says.
