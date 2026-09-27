# Adoption proposal

This investigation changes no product files. Adopt the stages independently after visual approval; use the existing High quality selection and leave Standard's materials and geometry alone. Keep the phase 1 / phase 2 / #38 foundation.

| Stage | Proposed integration | Measured 256² cost |
|---|---|---|
| 1 · Edge | Add explicit High terrain/water boundary hooks. Reuse outer faces and exact surface levels; expose geology, soil cap and water section separately. | ~0.012 ms/frame; no added geometry or draw |
| 2 · Water | Apply the continuous crown, irregular landing and bubble changes in the High fall shader. Supply a cached flow/shear field from the solver. Keep mist/rings in two bounded batches, clipped to real wet cells. | Overview difference below ~0.02 ms noise; 4.7 ms field/batch build |
| 3 · Landmarks | Add High procedural model factories using the existing entity transforms, footprint centres, grow attributes and near/far selection. Keep Standard's marker/entrance meshes. Preserve approved scaffold/panel/ivy and mine geometry. | ~0.092 ms/frame; 14 ms initial model build |
| 4 · Seasons | Feed actual preview snapshots into High materials. Send moisture, concentration, water depth and previous moisture in the same update; use dry exposed cells for browning/heat, actual concentration for water, and a small global sky tint only during contaminated badtide. | ~0.005 ms/frame in drought; 0.6 ms mask build |

These are view-dependent GPU deltas on an RTX 4080 SUPER at 696×559 pixels. The whole dense 256² paired demo measured about 165 fps at the browser/display cap. See [REPORT.md](REPORT.md) and the raw [frame](captures/performance.json) / [GPU](captures/gpu-cost.json) results. These measurements are for this proposal demo; product integration and larger viewports need their own measurement.

Do not copy the investigation's string replacement hooks or private renderer bridge into production. Give High explicit material hooks and share uniforms through the renderer. Keep all geometry in the renderer's ownership so disposal, picking, export, LOD and shadow invalidation are explicit.

Cache the edge material once. Rebuild the flow field after water/terrain changes, then update animated uniforms per frame. Cap mist at 2,048 particles and rings at 768; use no particle shadows. Keep river foam tied to actual flow around the map's real terrain obstacles, and avoid per-tile decorative curls. Validate close waterfall views as well as the overview because transparent fill increases there.

For landmarks, retain instancing and split the existing mixed dam/blockage batch only when their independent switches require it. Off must restore both the original geometry and per-instance tint. Cache model geometry across map changes and share it between compatible batches. Update ivy when actual moisture changes; do not rebuild every object at each weather day in the product. Original footprints, orientations, ruin occupancy, mine openings and slope arrows stay authoritative. Exercise every family at editing distance and in thumbnails before adoption.

Weather needs special care at the integration boundary. In this dev snapshot the imported-map display path can keep showing stored water while the live simulator advances. The demo's `weather.ts` reads live WaterSim arrays and follows the editor's exact normal-difficulty hazard duration, contamination curve, tick cadence, evaporation and soil functions. It does not alter WaterSim. The product should expose a shared weather-snapshot adapter rather than maintain two orchestration loops, and take difficulty from the actual map. Test both heightfield and multi-floor maps there; this demo explicitly supports heightfields. Keep Normal restoration and cancellation, and never infer dry ground from a timer or paint all water red.

The existing post pass carries depth for a dry-ground-only distortion below half a pixel. Disable heat for reduced-motion users and the lower-cost tier. Gate dry colour on actual zero moisture plus exposed ground, with nearest-sampled masks so a dry or polluted tile does not bleed into its neighbour. Do not add fabricated seasonal water heights or contamination fronts.

Carry over the demo's lower-cost controls: distant detail, reduced pixel ratio, no soft shadows, mist, rings or heat. The automatic fallback watches sustained frame intervals only in High-only mode, because paired Standard/High work would distort a product quality decision. Add recovery hysteresis in the editor's established quality controller. No weaker physical GPU was tested here.

Use `npm --prefix investigation/maplook-finish run check`, `build`, and `test` for static/mechanics checks. With the demo running, `verify`, `capture`, `bench`, and `profile` use locally installed Chrome via Playwright. Raw data and small JPEG evidence are checked in; dependencies, generated bundles and temporary output are ignored. No product document was changed because the user required folder-only work.
