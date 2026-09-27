# Finish the world

Run from the branch checkout:

```sh
npm --prefix investigation/maplook-finish run demo
```

The command installs this folder's locked dependencies and prints a free loopback URL. Node 22.12+ is required. Six generated terrain styles at 128²/256², seed and density controls, three Real places, synced cameras, individual effects, weather days and a frame-rate readout are included. [Capture index](CAPTURES.md).

All four stages are complete as proposals. This folder builds on dev caf3f48 and local copies of the approved maplook3, vegetation and #38 look. Standard uses dev's renderer. No product renderer, simulator or files outside this folder change.

1. **Diorama edge.** Soil caps and continuous geological beds reuse the exact cut faces and water columns. Clean and contaminated water retain their actual levels.
2. **Water finish.** World-space crown detail, irregular pool contact, small bubbles, bounded mist and rings, and soft foam from simulated flow and wet neighbours. Tiny hydraulic steps use the water-body colour to remove dotted white grid seams.
3. **Landmarks.** Original models/details for all requested families, with independent switches. Ruins keep the scaffold, pale panels, rust and moisture-gated ivy; the mine keeps its framed pit, corner platforms and roots. Transforms, footprints, slope direction and entrance cues come from Standard.
4. **Visible seasons.** Shared WaterSim and weather rules supply every daily water/soil snapshot. Added browning, cracks and straw affect only exposed tiles whose moisture is zero. Subpixel heat is confined to dry terrain; contaminated water and the slight badtide sky tint follow actual contamination. Normal restores the starting state.

The imported-map display wrapper retains stored water even during a weather run. The demo therefore reads live WaterSim arrays directly, using the editor's hazard duration, source curve, tick spacing and soil functions. Regression checks compare every day against those same mechanics. This investigation supports the included heightfield maps; multi-floor weather needs the product's proper integration adapter.

## Cost on this PC

RTX 4080 SUPER, Ryzen 7 9800X3D, Chrome 153, 1440×980 browser viewport, 696×559 pixels per pane at DPR 1. Dense River Valley seed 4242 has 7,154 plants and 1,235 ruin columns at 256².

Both 128² and 256² sustain **about 165 fps** with all stages on, including the paired view; 95th-percentile frame intervals are 6.2–6.3 ms. That is the display/browser cap, not an uncapped speed claim. [Frame measurements](captures/performance.json).

| Stage | Added GPU time / frame at 256² | One-time work at 256² |
|---|---:|---|
| Edge | ~0.012 ms | Material only; no extra draw or vertex |
| Water | Below measurement noise (~0.02 ms) in overview | 4.7 ms field/particle build; 1.25 MiB fields; two bounded draws |
| Landmarks | ~0.092 ms | 14.0 ms model build; replaces original batches |
| Seasons | ~0.005 ms in actual drought | 0.6 ms climate mask; 256 KiB; existing post pass |

GPU costs are seven alternating off/on samples of 16 completed draws, relative to the approved High foundation; seasons are measured over stages 1–3 in drought. Negative water deltas are noise, not a speedup. Costs depend on the view; a close waterfall puts more transparent pixels on screen. [Raw GPU samples](captures/gpu-cost.json). The inherited AO bake took 89.6 ms at map load and is not a per-frame stage cost.

Lower-cost mode reduces resolution, uses distant vegetation/object detail, and disables soft shadows, mist, rings and heat. High-only mode enters it after sustained frame-budget pressure. Manual controls remain available in the paired view. No weaker GPU was available for a hardware guarantee. Map generation and weather computation run in a worker; installing a new snapshot still rebuilds meshes and is separate from steady rendering.

## Verification and choices

TypeScript, production build and five mechanics tests pass. Browser checks cover all 15 landscape presets, all 23 stage-effect/family toggles, both camera-sync directions, shader errors and Normal restoration. Toggle comparisons allow observed GPU edge rounding: at most 2/255 in under 0.01% of channels, with unchanged-render drift recorded. With the foundation and stages disabled, High matches Standard exactly: **0 differing channels out of 1,556,256**. [Browser results](captures/verification.json).

Use an isolated checkout to preserve unrelated local work. Keep the simulator and map geometry authoritative, freeze paired captures at the same camera/time, and retain the approved foundation instead of redesigning it. All art is procedural or original repository art; [ASSETS.md](ASSETS.md) records provenance. Large generated results, dependencies and build output are ignored.

Four stage commits preserve the requested order. Adoption remains a proposal in [INTEGRATION.md](INTEGRATION.md). The publishing scope check runs the requested `git diff --name-only dev...HEAD` using isolated comparison refs for fetched dev, without moving the user's older checked-out dev branch.
