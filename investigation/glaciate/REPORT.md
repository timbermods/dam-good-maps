# Glaciate: a valley glacier force

**The default result reads as a chain of broad, stepped lakes, distinct from the tested wide Carve.** The valley-wall treatment still belongs to the same visual family. This is a held investigation for Kyler to try, not an unconditional magic-bar pass or an editor release.

![Glaciate and Round 2 Carve on the same valley](captures/carve-comparison.png)

The comparison uses River Valley seed 18, 128², exactly the same untouched terrain and head (64,16). Glaciate: Flow, Power 60, Size Auto, Meltwater on, seed 891. Carve: **Power 100, Width 24 (maximum), Depth 12 (maximum), Steep walls, Wander 5**, Keep river, seed 891. The comparison oracle reads the pinned Round 2 code at cd9225c into ignored local storage; Glaciate itself does not depend on that branch. [Exact comparison settings and measurements](checks/comparison.json).

| What differs in this valley | Glaciate | Carve |
| --- | ---: | ---: |
| Excavated cells below their actual drainage outlet | 1083 | 6 |
| Excavated blocks | 9,187 | 18,334 |
| Deposited blocks | 9,187 | 0 |
| Changed terrain cells, including deposition | 8,360 | 2,647 |

At block scale, **the cliffs and broad cuts can look alike**. Glaciate's reliable visual distinction here is the intervening outlets and retained lakes. Its receiving ground and moraines broaden the edited region, but a dry or single-basin glacier can still read like a wide Carve. Carve already has sediment fans and retained oxbows in other settings; this is not a claim that deposition or lakes are exclusive to Glaciate. In this particular comparison Carve runs to the map edge and exports its sediment; Glaciate keeps all of it on the map. The whole-valley-versus-channel distinction is weaker than the stepped-lake distinction and needs Kyler's eye.

## The two acts

![Actual default-control browser recording](captures/two-acts.gif)

[Contact sheet](captures/two-acts.png) · [Full default result](captures/default.png). The recording begins with an actual player click at default settings, placed from Top view so the intended high-ground tile is not occluded, then returns to the angled view. It is a sampled recording of the live WebGL renderer, not a CPU illustration. The final hold shows the fully settled endpoint. Captions on the contact sheet record actual logical stage times.

Ice gathers immediately at the pointer. A connected translucent ribbon advances down the chosen valley; integer terrain chunks change under it. Retreat clips the ribbon back from the snout towards the head, revealing water along the valley. Nominal pace: **3 seconds advance + 2 seconds retreat**, with 18 and 12 shown terrain stages. Main-thread overlays animate between stages. The actual 256² endpoint, including planning and final water solve, took **6.8 seconds** here; the status explicitly shows settling if the water outlasts the acts. There is no hidden terrain morph or promise that every machine finishes the solve in five seconds.

## What was built and why

- **Flow** follows a priority-flood drainage route already present in the map. A short running average removes grid stairs, retaining broad bends. The path is independent of the variation seed. The snout stops before the boundary where practical, preserving room for receiving ground. Hover uses the same drainage cache; flat ground previews a lobe.
- **Aim** follows the drag through intervening high ground, with a mild seeded bend. It can cross a ridge and make a U-shaped pass. It currently lacks a saddle-finding refinement, so it is straighter and more canal-like than Flow.
- A cirque scours the first part of the route. Broad cross sections have a level central bed with steep shoulders. The longitudinal profile alternates depressed basins and higher outlets; outlet datums step downhill where the input valley has enough fall. Actual basins are measured by a second priority flood, not assumed from the recipe.
- **Power** sets reach and excavation depth. **Size** follows Power (Auto) or stays at the manually selected 4–64 tile width. Default Power 60 gives nominal width 22. **Meltwater** adds a real source at the head, with strength following Size. No fifth force control was added. Sound, motion and camera are view controls outside the row.
- Cut blocks are counted, then deposited into an irregular curved terminal ridge, lateral strips and receiving ground. Any remaining material spreads in a bounded outer apron. No material is silently exported or deleted; insufficient capacity refuses the gesture. Deposits never exceed 22. On low ground, excavation is floor-clamped, the footprint widens by 35%, and the pointer says **“No room to deepen here · widening and building moraines.”**
- A locally flat head produces a shallow lobe and enclosing deposition. Trees are moved to free edge/moraine tiles without overlapping existing plants. Their IDs, species, components and actual exported coordinates survive. No new render-only fallen-log pose is used. Unsupported non-plants follow the excavation/support policy; affected starts and pinned objects refuse the whole event.
- Basins get a stored RetainedWater record. Both a fresh canonical settle and export start from that water; the head source feeds the chain when Meltwater is on. The canonical game-model solve supplies the final displayed water. Turning Meltwater off adds no source or retained fill; pre-existing rivers may still wet the result.
- One literal forceResult stores terrain, objects, water, contamination and rock changes. Esc/undo restores the whole state. Try another plans on the original series base and records the new seed; undo returns to the previous variation, and cancelled variations consume a seed. Save/open replays literal endpoints without rerunning the algorithm.

## Real terrain, not a roomy study map

All standard inputs are unmodified outputs from **the editor's src/core/gen/generate.ts path** at the fetched dev base: River Valley 18 at 96² and 128², Highlands 7 at 128² and 256², and Delta 39 at 128². Every generation passes its own validation on the first attempt. They contain the actual trees, objects, start and water. Their full ranges are 0–16 depending on map, not a manufactured level-3 platform. [Map generation record](checks/maps.json).

Two requested inputs are unavailable in the fetched repository: **the dev editor has no Verticality control**, and **River Coe is not present in public/real-places**. The picker therefore labels the tall case honestly: the existing v2 generator's VT85 unlocked pre-build pipeline, Highlands 7, 128², range 0–18. It has no product object/source build and does not count as an editor VT85 acceptance test. River Coe is omitted, not substituted. Yosemite is not used.

![Generated glacier alongside the available real glacial valleys](captures/gallery-comparison.png)

Lauterbrunnen 256², Hooker Valley 128² and Glencoe 96² are the unchanged bundled heightfields, with normalized camera framing. They are terrain references, not photographs or identical physical scales. They load with their bundled objects and a dry water state in this study viewer. Glencoe's broad valley composition is the clearest reference; Glaciate's regular chain of basins is more emphatic, while its surrounding slopes remain less naturally composed than the best real-place terrain. [Elevation provenance](ATTRIBUTION.md).

![Aim, lobe, low ground and tall terrain](captures/edge-cases.png)

![Power low, default and high on the same gesture](captures/power.png)

Power comparison: Flow at (96,32), River Valley 18, 128², Power 15/60/95, Auto size. The default hero gesture reaches the protected start at high Power and correctly refuses, so the whole Power comparison uses this second gesture instead. Size stays automatic in all three.

![Original and three Try anothers](captures/alternatives.png)

The alternatives share the exact original map, gesture and settings. Seeds are the LCG successors of 891, stored with each operation. The lake depths, step positions and moraine details change; the underlying valley route stays the same.

## Measurements

Material is counted as the sum of positive/negative final height differences, in whole blocks. Every accepted case below has deposited/cut **1.000**. Outwash is the number of deposited blocks inside the forward receiving-ground region; it is **not** a buildable-area count. Floor width is the median contiguous equal-height run across sampled normal cross sections. Cross range is their median max-minus-min elevation. Flat share is the fraction of core cells whose four cardinal neighbours share their level; it includes submerged floor.

| Case | Cut blocks | Deposit/cut | Measured floor width | Cross range, levels | Flat core share | Basin depths below outlet | Outwash blocks |
| --- | ---: | ---: | ---: | ---: | ---: | --- | ---: |
| default | 9,187 | 1.000 | 16 | 1 | 67.8% | 2, 2, 4 | 1615 |
| small-map | 7,822 | 1.000 | 15 | 1 | 68.3% | 1, 5 | 381 |
| side-valleys | 9,735 | 1.000 | 18 | 1 | 70.4% | 1, 1, 1, 1 | 1224 |
| large-map | 12,352 | 1.000 | 17 | 0 | 68.3% | 2, 1, 2, 2, 2, 1, 2, 1 | 1605 |
| lobe | 1,427 | 1.000 | 25 | 0 | 95.8% | 1 | 650 |
| low-ground | 4,094 | 1.000 | 25 | 0 | 84.3% | 2 | 1141 |
| tall | 5,187 | 1.000 | 11 | 2 | 66.9% | 4, 3, 4, 2, 1, 2 | 15 |
| aim | 11,882 | 1.000 | 18 | 1 | 71.5% | 4 | 1943 |
| power-low | 574 | 1.000 | 8 | 0 | 36.1% | 1, 3, 3 | 50 |
| power-default | 5,368 | 1.000 | 19 | 0 | 73.1% | 2, 4 | 0 |
| power-high | 11,850 | 1.000 | 25 | 2 | 79.4% | 3 | 0 |
| another-1 | 7,472 | 1.000 | 17 | 1 | 66.8% | 3, 1, 3 | 1615 |
| another-2 | 9,522 | 1.000 | 17 | 1 | 66.8% | 3, 2, 1, 4 | 1615 |
| another-3 | 7,171 | 1.000 | 16 | 2 | 65.2% | 2, 2, 2 | 1615 |

The default's basins, measured against their true flood spill level:

| Basin | Lowest floor | Outlet | Below outlet | Cells | Head-source feed reachable |
| --- | ---: | ---: | ---: | ---: | --- |
| 1 | 6 | 8 | 2 | 354 | yes |
| 2 | 4 | 6 | 2 | 137 | yes |
| 3 | 2 | 6 | 4 | 592 | yes |

Every case's individual basin records, including all outlet heights, are in [checks/core.json](checks/core.json). Tests separately remove other sources and verify the head source can reach each basin in the prefill routing. They also run the canonical water model to convergence and compare fresh solves, rather than treating that routing check as a water simulation.

Centreline straightness uses polyline length / endpoint chord. Default Flow: **1.3009** for the trough and **1.3009** for the route it followed. These are equal because the trough retains that route's geometry. This proves no further straightening by the cross-section model; it does **not** prove that a priority-flood route is always the best geographic valley centreline. Aim's reference is the aimed curve itself and is not an existing-valley straightness measurement.

At 256² (Highlands 7, 80/112, default settings), installed Chrome **153.0.8010.48**, 1200×820, headless, renderer **ANGLE (NVIDIA, NVIDIA GeForce RTX 4080 SUPER (0x00002702) Direct3D11 vs_5_0 ps_5_0, D3D11)**. Sound is warmed and on. This is a separate run with no screenshots or GIF compression during measurement. Frame intervals come from requestAnimationFrame; these are browser measurements on this host, not in-game FPS or a universal hardware promise.

| Interval | Frames | Median ms | p95 ms | Worst ms |
| --- | ---: | ---: | ---: | ---: |
| Advance | 590 | 6.1 | 6.2 | 8.1 |
| Retreat | 326 | 6.1 | 6.2 | 11.2 |
| Entire run incl. planning/settle | 1125 | 6.1 | 6.2 | 11.2 |

**Long tasks: 0**. Worker planning: **573.4 ms**; first terrain mesh commit: **749.6 ms** after input; full endpoint: **6848.2 ms**, water settled in **1920 ticks**. The immediate local gathering overlay precedes that mesh commit. [Raw browser evidence](checks/browser.json). Worker MessageChannel yields avoid nested timer delays; terrain stages are deliberately coarser than overlay frames.

Sound: five recorded CC0 foley files, 299,164 bytes, with an off switch. The actual recipe rendered through OfflineAudioContext measures **-17.1 dBFS** in the strongest non-overlapping 100 ms window and **-6.1 dBFS** sample peak at master 0.72. That is close to juice-2's force loudness target, with ample peak headroom. This is a signal measurement, not a listening approval. The low groan is pitched wood foley, not a glacier field recording. [Audio evidence](checks/audio.json), [manifest](bank.json).

## Verification and honest limits

The model suite passes **301 assertions**, plus **12 schema/malformed-input checks**. It covers same-seed determinism, untouched inputs, full material accounting, floor/ceiling bounds, basin outlets and source feed, fresh retained-water settle, literal JSON replay, cancelled advance/retreat, one-step undo/redo, portable saved history, alternate seeds, the protected start, dry mode, pinned objects, atomic invalid import and exported water tokens. The browser checks exercise a real default-control click, exact undo, Esc during each act and final settling, no late completion after cancellation, gallery loading and no uncaught browser exceptions. Typecheck and Vite build pass; Vite reports the expected standalone bundle-size advisory. [Schema checks](checks/schema.json).

The investigation remains short of a complete production acceptance:

1. **Outwash is not guaranteed at every gesture.** The Power 60/95 comparison's head points towards ground with no suitable forward fan region; its material goes into ridges/apron instead. The hero and main 256² case do make receiving ground. Improve terminal placement and contiguous fan grading before claiming every glacier creates a broad flat building plain.
2. **Hanging valleys are inherited, not comprehensively detected.** Existing wet tributary crossings become falls when the trough lowers them. The recorded count is crossing tiles, not independent waterfalls. Dry side-valley morphology and guaranteed stream reconnection need a dedicated tributary detector; this model does not manufacture decorative falls detached from real water.
3. **Whole-valley naturalism is uneven.** Tall or narrow input valleys can retain irregular shelves in the nominal floor. High Power can merge basins into one large lake; the mild Aim bend still reads rather straight. The circular lobe and outer apron can look stamped. No fifth control is justified: improve automatic land reading, not the row.
4. **The five-second moment is a target, not the full solve duration.** The worker plan and canonical water can outlast it, especially at 256². Lighting is refreshed at commit, so old shadows/soil tint can linger during the acts. No unsupported GPU terrain morph hides this limitation.
5. **No in-game probe was run.** Export roundtrips verify actual terrain/objects/water fields and layer 22 stays empty. All 13 standard-map endpoints also pass the repository's export load/design checks, including the 960×540 JPEG, GUIDs, placements and slope connections. The tall pre-build's only failure is its missing start; the demo refuses its .timber download and allows Save study instead. [Export validation](checks/export.json). These checks do not establish Timberborn loading, building access, drought survival or long-term water behaviour. The stored game source follows normal game simulation; the demo never pins a perpetual lake surface.
6. The tall editor acceptance and River Coe reference remain unavailable as described above. The demo's imports are investigation scaffolding, not a finished production adapter. Caves, layer cuts, arbitrary locked regions and mixed production edit history belong to adoption tests.
7. Speaker/headphone balance and the glacier likeness of the groan await a human listening check. Sounds asked for before lazy decoding are dropped, following Round 2; the first-ever click can miss its onset accent.

An **ice-sheet mode** could be a later investigation for broad multi-valley coverage. It is deliberately not built here. This round stays a valley glacier with one flat-ground lobe fallback.

## Delivery boundary

[README](README.md) runs the demo. [INTEGRATION](INTEGRATION.md) proposes the shared-core port, operation/schema, top-bar button and four-control row, sound cues, bounded Claude glaciate step (D134), tests and investigation-index row. [ATTRIBUTION](ATTRIBUTION.md) lists every asset/source and edit.

All implementation, assets, measurements and documentation are under investigation/glaciate/. Standard inputs are committed compressed; large results and the pinned comparison bundle stay in gitignored local/. Captures total **5.27 MiB**, largest **1.60 MiB**, well under the 30 MB folder budget. The only authorized remote branch is investigation/glaciate and the only PR targets dev. Nothing is merged, approved, released or deployed by this task.
