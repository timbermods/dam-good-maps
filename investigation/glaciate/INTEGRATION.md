# Adoption proposal: Glaciate

Investigation only. Production files, the gallery and `investigation/README.md` are unchanged. The branch is held for Kyler to try the demo (D246); this document does not authorize adoption, merging or release.

## Fit to the shipping forces

Read against `feature/forces` at `cd9225cea5cdff18318b7d57c4ef2e3a70628dc2`, including `docs/progress/forces.md` Round 2 and `src/core/forces/{force,op,result,runs,objects,rock}.ts`. The demo imports **no code from that branch**. It reuses `dev`'s shared investigation map/object/rock services, actual chunk builders and editor materials; its operation/session adapters are local copies/extensions of the forces-core contract.

| Here | Proposed adoption |
| --- | --- |
| `model.ts`: `Valley`, `makePlan`, `reveal` | `src/core/forces/glaciate.ts`, a new run implementing the existing force run lifecycle |
| `session.ts` | Use the existing worker/session history and cancellation token; do not add a second history owner |
| `operation.ts` | Extend `op.ts`, `result.ts` and document schema/build handling, preserving older operations |
| `worker.ts` | Existing worker commands, dirty chunk queue and bounded water work |
| `effects.ts` | One pooled ice overlay in the editor's existing force effects owner |
| `audio.ts`, `bank.json` | Recipes in the single recorded-foley juice engine, reusing identical juice-2 assets |

Use D244's **22** ceiling everywhere, not the older per-map `forceCeiling()` still present in the fetched feature branch. Respect D207 layer limits, pinned objects, imported multi-run columns/caves, and document locks at the adapter boundary. This heightfield investigation refuses affected start/pinned footprints; it does not yet accept caves or layer selections. Preserve and trim volcanic material bits as the core does. Do not invent ice, sediment or fallen-log components in a `.timber` file.

The prototype's planner is synchronous in the worker. Port it to the existing slicer (rows/heap batches/object batches), preserving deterministic iteration order. Main-thread feedback begins with a local ice gather cue, then the worker supplies the path. An event epoch rejects old mesh batches after cancellation. Cache the pre-event visible state so Esc changes the view immediately, before worker acknowledgement. Route previews should use a cached drainage field invalidated by terrain edits; preview and click must use the same field and settings.

## Operation and schema

The executable prototype contract is `operation.ts`; `operation.schema.json` documents its JSON structure. It is the shared **`forceResult`** envelope, version 1, with `request.verb = "glaciate"`. Sorted literal old/new tuples store terrain, rock, water and contamination; full before/after entity lists, fallen metadata and geology accompany them. Whole-state fingerprints guard exact replay/undo. `request` records the settings and gesture; replay never calls the glacier. `lake` carries the basin initial water for a fresh settle.

```ts
request: {
  verb: "glaciate",
  settings: { mode: "flow" | "aim", power: 0..100,
    size: null | 4..64, meltwater: boolean, seed: uint32 },
  intent: { origin: tileIndex, end?: tileIndex }
}
lake: { tiles: number[], floor: number[], depth: number[], contamination: number[] }
```

`size:null` means Auto; Power changes depth and reach, manual Size only the trough width. The next variation seed is stored in saved studies. Try another plans from the original series base and records `replaces` pointing at the immediately preceding kept result; undo returns to that result. A cancelled variation consumes its seed. Input shape, sorted unique changes, bounds, source fingerprints and destination checksums are validated before accepting a result. Unknown entity components survive.

Production's compact `ForceResultParams` differs from this study envelope. Add `glaciate` to `Verb`/`VERBS`; extend the settings union and `ForceWhere` with the existing origin/end form. Build `tiles/heights/rock/removed/moved` through the existing literal extraction. Store the real new source with `source` and the union of basin records with `lake: RetainedWater` (already used by Carve). Do not store the animated ice mesh, timestep snapshots or morphology metrics in the document. Do retain the settled endpoint in the worker's normal history snapshot. Add a schema migration only if the serialized version needs one; existing operations must remain byte-for-byte replay compatible.

The production builder must collect retained water from **all** applicable result operations, in operation order, and pass it into `WaterModel.retained` before `canonicalRun`. Never replace a stored lake with a dry fresh solve on load, settle, undo or export. Feed the valley with the real head source when Meltwater is on; strength follows Size (0.75 + 0.16 × nominal width, capped at 8), not Power. Existing source settings remain real and editable. D239 Unleash on that source can therefore use the normal Carve action later; Glaciate introduces no second Unleash control. With Meltwater off, the tool adds no source or retained water; an existing river may still wet the changed terrain.

## Renderer and the two acts

Eighteen terrain stages advance over three seconds; twelve retreat stages reveal water over two seconds (fifty logical force steps, six shown stages per second). Only changed integer terrain/water chunks are remeshed. This demo calls the shared view's `begin(false)` and supplies no morph/glide attributes: terrain never relies on the GPU morphs missing from the editor. Ice is ordinary overlay geometry with a small fragment shader clipping its advancing/retreating front. Terrain, water curtains, trees and lighting use the repository renderer.

A fallback requiring no new shader is the same ribbon partitioned into station strips, with visibility toggled at the existing effect pace. Reduced motion hides the overlay and camera effects while the terrain/result lifecycle remains cancellable. No camera shake. Refresh lighting at commit (the prototype keeps old lighting during the acts; that temporary mismatch is visible). Retain the normal final water solve: if it exceeds five seconds, show the quiet settling state. Do not speed up an incomplete solve to claim a five-second endpoint.

The moved trees retain species, components and real moved coordinates, staying upright as the game will show them. They do not acquire a render-only horizontal log pose. Existing shared-core fallen metadata is preserved on prior objects but is never invented for new Glaciate trees. Reconcile slopes after terrain and object movement, including unchanged tiles whose neighbours changed; remove disconnected chains to a fixed point, and refuse if a pinned slope would lose its connection. New source IDs use the repository's deterministic GUID builder.

## Controls and sound

Add **Glaciate** beside Carve, Craterize, Quake and Erupt in the forces group. Its row, in order: **Mode (Flow/Aim), Power, Size with Auto, Meltwater**, then **Try another**. Default: Flow, Power 60, Size Auto (22 tiles nominal), Meltwater on. Use the shared `SizeControl` convention: moving the slider sets it by hand; Auto restores following. No fifth control, no separate depth, speed, moraine or basin slider. Low-ground pointer message: **“No room to deepen here · widening and building moraines”**. Start refusal: **“Start here”**. Physical lack of deposition capacity is a quiet refusal, never lost material.

Use the existing global Sound switch and saved volume. Advance begins the stone-friction bed and low pitched wooden resonance; one crack at onset and another at 1.75 s; retreat begins the waterfall recording at 3 s. Schedule using the audio clock, tag all voices with the run ID, and stop them on Esc, undo, map changes and hidden-page events. Reuse juice-2's lazy decoding and drop late sounds rather than replaying them. The low resonance is a wood-foley stand-in, not a field recording of a glacier. Sources and all pitch/filter/gain/envelope edits are in `bank.json`. Speaker/headphone judgment remains a listening check.

## Claude readiness (D134)

Propose a bounded step `glaciate`: `{mode, origin:[x,y], end?, power?, size?, meltwater?, seed?}`. Defaults equal the UI. Limits: maps ≤256²; heightfield only; Power 0–100; Size null or 4–64 tiles; integral in-bounds origin/end; distinct Aim endpoints; seed 0–2³²−1. The caller cannot disable protection or override the ceiling. Refuse starts, affected pinned/locked objects, protected/cave columns, insufficient deposit capacity and invalid coordinates. Return changed bounds, source ID, below-outlet basin depths, deposit/cut ratio, low-ground notice and operation sequence, not a bulky map array.

Add request-suite cases for: a U-valley with three fed lakes; a pass between two valleys; a dry glacier; a small width at high Power; a flat-ground lobe; low ground; refused start; cancellation and reroll. Expectations must inspect literal terrain and water, not only a success string. Rerun the full existing reference suite during adoption; no Claude API key or model call is needed. M12 stays ready, not blocked on this investigation.

## Bring these tests across

Port `tests/core.ts`'s real-map determinism, literal replay, source/retained-water fresh settle, export water, empty top voxel layer, material ledger, measured floor sections, start/pinned refusal, dry mode and alternate-seed history. Bring `tests/export.ts`'s load/design checks, valid thumbnail, GUIDs, placements and slope connections. Port the browser tests for the real pointer gesture, cancel in both acts and no stale mesh return. Extend to cancel/commit races, interleaved brushes/source edits, stacked glaciers, layer limits, imported caves, schema rejection, keyboard redo, saved volume, hidden-page sound stop, both reduced-motion settings and actual in-game DGM Probe parity. The present tests verify file contents, not a Timberborn launch.

## Proposed investigation index row

| [Glaciate](glaciate/README.md) | Valley glacier: drainage-following Flow, ridge-crossing Aim, stepped retained lakes, conserved moraines and outwash; remeshed advance/retreat and recorded CC0 foley. [Report](glaciate/REPORT.md), [adoption](glaciate/INTEGRATION.md). Held for Kyler's demo try; includes explicit morphology and source-availability limits. | `investigation/glaciate` |
