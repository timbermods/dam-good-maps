# Integration proposals

Nothing here is adopted into the editor. Phase 1's look is still unapproved. Start with High as an opt-in experiment; **retain today's Standard implementation** until both its appearance and equal-or-better speed are demonstrated on the target PCs. A lower triangle count alone cannot promise an unchanged frame budget.

## Models, map data and editor fit

Move the species registry and geometry builder behind an explicit model-provider interface when adoption is approved. A definition supplies near/far geometry, height, wind amplitude and palette regions. Pine, birch, oak and blueberry bushes share the same path; new species add a definition rather than a renderer branch. Preserve unrelated species such as Succulent and all non-vegetation objects on the current path.

Keep instancing and deterministic placement. Roots are offset no more than ±0.07 tiles; their thickest base plus size variation remains inside the owning tile. Crowns can slightly overhang naturally. Keep gameplay positions, footprints and picking on the tile. Wind never translates the root. This investigation changes no maps or export bytes.

Add a `growth: Float32Array` to the view contract, not inferred from tree height. Read `Growable.GrowthProgress` using the repository's `JsonFloat` rules; absent means mature. The investigation uses a sidecar keyed by template and coordinates because the production view only has `YOUNG`. The proposed scale is `0.18 + 0.82 * progress`, multiplied by 0.92–1.04 natural size variation. It makes young trees visibly small and preserves progress, but is **not a verified reproduction of the game's growth animation**. Confirm stage boundaries and relative heights by eye before adoption; keep the curve configurable. Do not read or copy game assets to implement it.

Use the same provider for `MapRenderer.thumbnail`, `setGhost` and map meshes. The demo's `specimen()` proves this for shelf icons and hover ghosts. Freeze icon/ghost wind, use the same palette and shading, tint placement validity, and exclude ghosts from the sun-depth pass. Production placement validation stays authoritative; the demo's occupied-tile tint is only an appearance example. Invalidate icon caches after tuning. Reuse geometries/materials, disposing only the owning cache, and keep the existing object-index mappings for highlight, removal and ground-following.

Keep the existing slice, overlays, marker semantics and footprint rules. The shared object shader retains slice discard and contact shading. The demo does not exercise live terrain painting, caves or sliced shadow casters. Before adoption, update instanced transforms incrementally on edited tiles, maintain object indices through LOD regrouping and apply the same slice clipping in the depth pass. Verify undo, placement, removal, terrain-following and forces at full editor frame rate; a standalone camera demo cannot establish that budget.

## Wind and soft shadows

Use one clock and one deformation function in the colour and depth vertex shaders. `wind.ts` varies phase and frequency per tile, applies a quadratic height weight and corrects the bent normal. There is no per-frame CPU tree transform. Dead wood and thumbnail/ghost instances have zero amplitude. Honour reduced motion; disable sway when hidden or under budget pressure.

The demo adapts Map look 2's 2048² sun depth texture, 25-tap PCF and receiver-plane correction. The existing shadow term is replaced, not multiplied twice. Both comparison panes have the same sun and sky, and the old pane still uses today's geometry. Water and falls do not cast opaque shadows. The depth pass reads the same wind instance attribute; missing attributes on existing objects have an explicit zero-motion default. Pixel tests verify that the shadow-depth output changes with moving crowns.

Cache depth when trees, terrain, sun and LOD partitions stay still. Invalidate it for changes to those inputs. Sway requires refresh while active, a potentially larger cost than the vertex arithmetic itself. A later design could separate cached static casters from dynamic vegetation, but that is not implemented here. Keep the map-wide shadow size as Map look 2 does; close-up shadows on 256² maps remain broad. A focused/cascaded shadow would be a separate proposal, not a hidden lighting dependency.

## Tuning to phase 1

Palette regions are pine, birch, oak, bush, bark, birch bark, dead wood, berries and bark marks. Colours are uniforms; geometry and instance buffers never need rebuilding for palette edits. The demo saves those colours plus roughness, leaf wrap, specular and ambient response as JSON. Its shader is the current custom display-referred shader: do not apply an extra sRGB conversion. A move to phase 1's linear/PBR materials must explicitly convert these swatches once and rejudge the result under the final tone mapping.

Tune in this order:

1. Fix phase 1's sun, exposure, tone mapping and terrain first. Use the same camera in both comparisons.
2. Set pine darkest/coolest, birch lightest/yellower, oak between them and bush dark with visible blue fruit. Keep dead wood pale and all living crowns separate from moist grass.
3. Judge the type lineup from directly above, then steep views and the forest edge. Silhouette must carry meaning even in greyscale; colour is a second cue.
4. Keep foliage matte (initial roughness 0.92, specular 0.045). Adjust wrap and ambient fill before increasing shine. There are no alpha cards or leaf textures to hide a lighting mismatch.
5. Check saplings, dead wood, shaded valleys, dry terrain and the three Real places. Save the palette JSON and regenerate captures under the chosen phase-1 settings.

## Performance and rollout gates

The far models are 30/28/36/28 triangles for pine/birch/oak/berries. Near models are 144/328/308/320. There are three near variants per species and one far silhouette. Instances choose near above 23 pixels per world unit and stay near down to 18, reducing threshold flicker. Offscreen casters use far geometry; they stay present for their shadows. Transitions are discrete, not a dither fade; check for visible pops on hardware. Variant identity, tint and transform stay stable across LOD changes.

The CPU loops over plants only when the camera/mode changes and uploads only when membership changes. Whole-species batching bounds draw calls independently of map size (up to 32 with near/far living/dead variants; eight far-only). It does not individually cull far offscreen trees. Four matrix/colour/wind/grow capacities per plant cost roughly 21 MiB at 52k trees, excluding the CPU entry objects, geometry and driver overhead. A static 2048² colour/depth shadow target adds roughly 32 MiB per pane. The paired demo owns two renderers; the product should own one.

See [REPORT.md](REPORT.md) and [the measurements](captures/verification.json) for the actual SwiftShader results. They do not prove hardware FPS. Near detail and soft-shadow invalidation make the measured proposal slower than today's model path; the far-only fallback is cheaper in that software sample. No Standard replacement is recommended on this evidence.

Before choosing High automatically, warm up a single full-size viewport on the dense 256² scene, then test the real editor during orbit, zoom and brush edits. On Kyler's PC require sustained **at least 60 fps**, with frame distributions and no edit stalls; compare today's models, new still models and new swaying models with identical lighting, resolution and map state. Use disjoint-safe GPU timers where available. Repeat on an integrated laptop. Keep Standard on today's renderer unless the new path is demonstrably no slower there, including CPU edits and memory pressure.

The prototype's single-view fallback first stops sway, then selects far-only geometry, DPR 1 and baked shadows after repeated p95 above 22 ms. It does not upgrade itself repeatedly, and never interprets paired FPS as a hardware rating. For production, add cooldowns, persisted user choice, context-loss recovery, allocation-failure fallback and a final return to the existing Light path if needed. The demo reports context loss and asks for reload; it does not implement the editor's recovery lifecycle.

The investigation uses a checked, in-memory Vite transform to force Standard on SwiftShader and a narrow bridge to private renderer fields. Those are test scaffolding. Replace them with supported extension points before integration; do not ship the investigation bridge or its forced software behaviour.
