# High mode adoption proposals

Nothing here is integrated. Standard and Light should retain their current materials and
output. High should build on maplook2's calibrated water and soft shadows, with explicit
material/post-processing hooks instead of this demo's checked shader-string replacements
and private-field bridge. Keep each addition independently switchable for diagnosis.

## Lighting and finish

**Warm sunlight:** retain the measured palette and sun direction. Relative to Standard's
light uniforms, multiply the sun by (1.48, 1.30, 1.10) and sky fill by 0.97. This raises
direct light more than ambient light, so sunlit faces are warm and bright while local AO
and shadows retain depth. It is an independent switch, with no additional draw or texture.
When off, the original maplook2 shadow-light balance is restored.

**Ambient occlusion:** move the eight-direction, four-radius horizon calculation to a worker.
Cache one RGBA8 texel per tile: 64 KiB at 128², 256 KiB at 256². Recompute changed rectangles
plus an eight-tile border after sculpting, and tree/ruin footprints after placement or removal.
Multiply ambient light only, retaining direct sun and the existing narrow contact shading.
The canopy model is a soft footprint, not a traced crown. The field follows surface heights;
caves/overhangs keep existing shading and need a separate acceptance case before adoption.
Do not rebuild the whole field on every brush frame.

**Tone mapping and colour grade:** the current custom shaders author display RGB. This bridge
decodes that RGB, grades in linear light, applies 1.22 exposure and a peak-preserving shoulder,
and encodes once in a single full-resolution pass. The shoulder begins at linear peak 0.82,
scaling all channels together toward a bounded peak of 1. It retains the Neutral shoulder's
form but removes its darkening toe and whitening of highlights. There is no filmic wash.
The grade adds 6% linear-light saturation and a gentle warm highlight balance, retaining
sunny yellow-greens. Grading precedes the shoulder to avoid clipped warm highlights. The High finish
allows values above one before that pass. This is not a conversion to physically based HDR
lighting. Preserve the maplook2 colour anchors during product adoption by measuring final
framebuffer samples again; exposure and lighting deliberately brighten their final appearance.
Keep the captured-view regression: whole canvas, a shared map mask and sunny-green pixels
must each match or exceed Standard in mean brightness, linear luminance and saturation.
The test is a guard against a dull finish, not a substitute for judging the art direction.
The demo retains four-sample MSAA in its half-float render target. At the measured 719×637
pane that target needs roughly 25–27 MiB (multisampled colour/depth and resolve buffers),
in addition to the normal buffers. Avoid allocating it at all when both finish effects are off.

**Haze and sky:** use a clear blue sky and the same pale horizon for distant air. Haze starts
at max(64 tiles, 1.275 × camera-target distance), easing to at most 5.5% at
max(160 tiles, 3.38 × camera-target distance). Nearby land keeps its full colour and detail.
It is disabled in the top view. Clouds
are static, soft and confined above the horizon; a broad sun glow replaces a hard sun disc.
No cloud textures, bloom, depth-of-field blur or vignette. Keep map labels and overlays out
of the post pass in the product so their colours remain exact.

**Shadow cache:** this static-map demo refreshes maplook2's 2048² PCF map on map/sun changes.
Product invalidation must also cover terrain, entities, slice and any animated shadow casters.
The corner specimens use their own soft contact shadows and never enter the map shadow pass.
The demo excludes transparent fall ribbons; it keeps the current renderer's waterfall material.
Do not claim per-frame moving-tree shadows from this experiment.

## Terrain

**Rock strata:** retain the voxel geometry. Combine warped bedding, mineral grain, faint
fractures and the existing procedural stone field. Keep a quiet accent at each integer level;
Markers retains the stronger level lines. LOD filtering damps subpixel bedding with derivatives.
The prototype remains a diffuse shader; it adds no glossy rock or normal-map image assets.

**Soil edges:** widen the existing interpolation's grass and contamination transition, reducing
the noisy hard threshold. Neighbours still blend only at the same height; each tile centre
retains its own meaning. Water and cliff geometry, moisture bytes and contamination bytes
are unchanged. Contamination remains veins over grass or earth, including its existing glow.

**Colour variation:** add two restrained world-coordinate scales to the existing textures.
It changes albedo, not soil state. Keep it out of the height-colour view, and preserve the
established contaminated/dead/living cues. The pattern source is the repository's procedural
512² texture; this adds no downloaded textures and no per-frame texture upload.

## Measured costs

See [performance.json](captures/performance.json) for presentation cadence: the 128² and
256² dense maps reach about 165 fps in Standard, High and the simultaneous comparison.
This is one RTX 4080 SUPER at 719×637 pixels per pane, DPR 1. Headless Chrome used the real
D3D11 GPU, not SwiftShader. No integrated/mobile GPU was measured.

The individual query times in that refresh-capped run varied strongly with scheduling and
GPU clocks; do not subtract them to claim precise costs. [gpu-profile.json](captures/gpu-profile.json)
instead uses 32 repeated draws per query, 4 warm-up pairs and 12 measured pairs with order
alternating. The table is the median paired difference, in **ms per draw**, at an overview.
It is a workload profile, not uncapped FPS. Values below 0.01 ms are within run noise here;
negative entries mean noise, not a performance benefit. Nothing in this table adds up to a
portable frame budget, and shader branching means costs overlap.

| Effect | 128² GPU Δ ms | 256² GPU Δ ms | Other cost / adoption note |
|---|---:|---:|---|
| Maplook2 water | −0.001 | +0.012 | Reuses flow field; unchanged palette constants |
| Cached soft-shadow sampling | +0.022 | +0.047 | 2048² colour/depth target, about 32 MiB; refresh costs excluded |
| Warm sunlight | −0.001 | +0.009 | Uniform values only; no added draw, texture or shader arithmetic |
| Ambient occlusion | +0.001 | +0.0002 | 24/86 ms one-time CPU bake; 64/256 KiB texture |
| Tone curve alone | +0.001 | +0.0003 | Shares pass with grade |
| Colour grade alone | +0.001 | +0.001 | Shares pass with tone curve |
| Tone + grade pass together | +0.069 | +0.027 | One full-resolution draw; about 25–27 MiB at measured pane size |
| Distance haze | −0.002 | +0.001 | Arithmetic in existing material pass; no extra texture |
| Sky | +0.003 | +0.002 | Replaces the existing sky shader; no extra draw |
| Rock strata | +0.005 | +0.013 | Existing pattern atlas; no geometry or image uploads |
| Soil-edge blend | +0.007 | +0.007 | Existing four same-height soil samples |
| Colour variation | +0.004 | +0.005 | Two extra pattern samples on the ground |
| Three specimens, total | 0.005 | 0.022 | Absolute GPU time in their small corner canvas; 6 draws, 8,196 triangles |
| Wind within specimens | +0.002 | +0.019 | Vertex arithmetic; separate-context scheduling/clocks affect these tiny samples |

The corner canvas is a presentation aid. Product vegetation should share the map renderer,
lighting and shadow passes. This demo keeps targets for reuse when toggles are off; it frees
them on disposal. Its AO bake is synchronous while loading. Product adoption should move it
to a worker and allocate optional targets lazily.

Choose automatic High using an actual warm rendering probe at the intended resolution and
memory budget, then fall back to Standard if sustained p95 frames exceed that device's budget.
Test at DPR 2 and at full-window size before setting defaults. Retain Light's software path.

## Full vegetation round

Treat the three specimens as an art-direction choice first. Next, build pine, birch and oak
at sapling, grown and dead stages, with 3–5 deterministic silhouettes per species. Pine gets
irregular branches and gaps; birch gets a slender marked trunk and light, broken foliage;
oak gets a broad crown and readable heavy limbs. Preserve species footprints and tree counts.

Batch instances by species/LOD. Aim initially for 600–1,200 triangles close up, 150–300 in
the middle distance, and a 40–80 triangle silhouette far away; these are budgets to test, not
measured promises. Merge bark and crown into shared geometry/materials, use seeded tint and
shape variation, and avoid per-tree draw calls or transparent leaf sorting. The three current
specimens are illustrative and deliberately more detailed than the proposed near budget.

Keep wind in a vertex shader, roots fixed, with a shared gust plus a per-instance phase.
Use the same displacement for colour and shadow passes. Honour pause and reduced motion.
Benchmark 10k trees with dense ruins on 256², close views and overview, on an integrated GPU
as well as this desktop GPU. Include transitions, dead-tree readability, picking/footprints,
editing updates and context restoration before replacing any map trees.

## Acceptance and limits

The current demo checks each effect, all-off Standard parity, two-way cameras, vegetation
motion/pause, nine matched colour comparisons and 15 generated/place cases. It is an art prototype, not a product-quality
renderer interface. The private hooks deliberately throw if upstream shaders change.
Final appeal still belongs to Kyler's eye against the game. No game assets or in-game captures
were accessed and no Timberborn process was launched.
