# Finish the world

## Round 2, after Kyler's review

**Changed:** dark grey cut rock with subtle irregular beds; foam restricted to rough water; plain chipped relic stumps; murky, scummed badwater sources; earth/rock/grass slopes; moisture-driven plant stress and death; pale dusty drought soil; and an independently switchable, non-emissive High poison-soil proposal.

**Kept:** the soil cap and actual water section, fall crown/landing/rings/mist, district centre, ruins, mine, thorns, geothermal, natural dam, blockage and clean source. Existing simulation, dry-ground-only heat, slight badtide sky and Normal restoration remain. Standard retains its approved materials, including D242's orange contaminated ground.

The [capture index](CAPTURES.md) has 19 matched before/after views, each beside Standard, including the reviewed River Valley / seed 4242 / 128² / Dense / all-stages overview. Camera equality is asserted. Captures are small JPEGs; assets remain original repository or procedural work.

## Foam measurements

| Visible foam in the whole-map view | Before | After |
|---|---:|---:|
| 128² clean river surface | 49.43% | **5.85%** |
| 256² clean river surface | 26.54% | **3.10%** |
| 128² all water, including badwater | 43.94% | 5.14% |
| 256² all water, including badwater | 25.29% | 2.66% |

Coverage counts visible horizontal-water screen pixels with an actual shader foam coefficient of at least 0.12, at fixed camera/time and 696×559 pixels. It includes fall landing/crown coverage, excludes airborne mist/rings, and does not mistake reflections for foam. Clean river means contamination below 0.05; its denominators are identical before/after (11,734 and 8,995 pixels). All-water denominators change slightly where revised source geometry occludes water. [Before data](captures/round2/foam-before.json) · [After data](captures/round2/foam-after.json).

Remaining added foam lies in short fall tails, unusually fast reaches/narrowings and fast-water obstacle wakes. At 128² the separate fields cover 27 fall-tail, 9 rapid and 0 obstacle cells; at 256², 64, 98 and 18. These overlapping support counts are not pixel percentages. Approved #38 shore/fall foam remains. Ordinary water receives no new bubble pattern, foam or mottling; bubbles remain at landings.

Seven mechanics tests, TypeScript, build, all 15 browser presets and 25 independent toggles pass. Disabled High matches Standard exactly (0 / 1,556,256 differing channels). Both dense map sizes still render near the 165 fps browser/display cap.

## Run and scope

From the branch checkout:

```sh
npm --prefix investigation/maplook-finish run demo
```

The command installs this folder's locked dependencies and prints a free loopback URL. Node 22.12+ is required. Six generated terrain styles at 128²/256², seed and density controls, three Real places, synced cameras, individual effects, weather days and a frame-rate readout are included.

All four stages remain proposals. This folder builds on dev caf3f48 and local copies of the approved maplook3, vegetation and #38 look. Standard uses dev's renderer. Product files and simulator mechanics are unchanged.

## Choices behind the revisions

- **Rock:** use the cliff palette and its cut-face lighting. Irregular noise beds replace periodic bright stripes; exact cut geometry, soil cap and water levels stay intact.
- **Water:** measure speed relative to each connected river's median moving speed. Rapids start at 1.45× that median and reach full strength at 2.10×; fast obstacle wakes use a lower local threshold. Actual incoming falls seed tails bounded to 2.8 tiles, obstacles to 1.4 tiles. No channel-wide diffusion or surface bubble pattern remains.
- **Objects:** relics keep Standard's arrangement and uneven stump heights, with chipped edges and little rubble. Badwater uses the existing `badwaterBody` palette plus dull scum, without emission. Slopes keep their geometry and direction markers, gaining actual-moisture grass at the upper lip and terrain earth/rock colours.
- **Plants:** timers advance only at moisture exactly zero, reset on rewetting while alive, and switch to existing dead forms at death. Pine/Birch/Oak/Blueberry use 13/11/15/9 days multiplied by 0.9–1.1, from the repository's mechanics notes and cycles model. The preview uses a stable coordinate/species seed because the game's private random draw is absent from map data. It samples moisture at existing simulation boundaries (at most 0.125 day apart); it does not reproduce Unity's individual random death time. Saved dying progress and starting dead plants are respected; Normal restores starting forms. Day 9 in the captured 128² drought has 726 living plants drying and 26 newly dead. Moist plants stay green.
- **Ground:** zero-moisture exposed soil keeps cracks/straw but uses pale dusty earth. The separate “Poisoned soil (proposal)” switch replaces orange glow only on actually contaminated High terrain with dark olive/brown staining and veins; Standard is untouched.

The imported-map display wrapper can retain stored water during weather. The demo reads live WaterSim arrays using the editor's hazard duration, source curve, tick spacing and soil functions. Regression checks compare every day against those mechanics. This investigation supports the included heightfield maps; multi-floor weather needs the product's integration adapter.

## Cost on this PC

RTX 4080 SUPER, Ryzen 7 9800X3D, Chrome 153, 1440×980 browser viewport, 696×559 pixels per pane at DPR 1. Dense River Valley seed 4242 has 7,154 plants and 1,235 ruin columns at 256².

Both 128² and 256² sustain **about 165 fps** with all stages on, including the paired view and drought; 95th-percentile frame intervals are 6.2 ms. That is the display/browser cap, not an uncapped speed claim. [Frame measurements](captures/performance.json).

| Stage | Added GPU time / frame at 256² | One-time work at 256² |
|---|---:|---|
| Edge | Within noise (−0.015 ms measured) | Material only; no extra draw or vertex |
| Water | 0.047 ms | 12.4 ms field/particle build; 1.25 MiB fields; two bounded draws |
| Landmarks | 0.154 ms | 13.3 ms model build; replaces original batches |
| Seasons | 0.626 ms in actual drought | 0.8 ms climate mask; 256 KiB; existing post pass |

GPU costs are seven alternating off/on samples of 16 completed draws, relative to the approved High foundation; seasons are measured over stages 1–3 in drought and include the plant treatment. Medians fluctuate with GPU clocks and view; negative deltas are noise, not speedups. A close waterfall shades more transparent pixels. [Raw GPU samples](captures/gpu-cost.json). The inherited AO bake took 112.8 ms at map load, separate from per-frame costs. Round-one [frame](captures/round2/performance-before.json) and [GPU](captures/round2/gpu-cost-before.json) data are retained for comparison.

Lower-cost mode reduces resolution, uses distant vegetation/object detail, and disables soft shadows, mist, rings and heat. High-only mode enters it after sustained frame-budget pressure. Manual controls remain in the paired view. No weaker GPU was available for a hardware guarantee. Generation and weather computation run in a worker; installing a snapshot still rebuilds meshes, separate from steady rendering. Plant death uses reserved live/dead instance batches instead of rebuilding every plant model.

## Verification and adoption

Browser checks cover all 15 landscape presets, 25 effect/family toggles, both camera-sync directions, shader errors and Normal restoration. Toggle restoration permits observed GPU edge rounding: at most 2/255 in under 0.01% of channels, with unchanged-render drift recorded. The explicit disabled-High/Standard comparison remains exact. [Browser results](captures/verification.json).

Mechanics tests cover daily simulator parity, clean disconnected basins, input immutability, cancellation, dry-only masks, calm/relative-speed/obstacle/fall-tail foam, and plant drying/death/rewetting. Asset provenance is in [ASSETS.md](ASSETS.md); adoption remains a proposal in [INTEGRATION.md](INTEGRATION.md).

The publishing scope check runs `git diff --name-only dev...HEAD` using isolated comparison refs for fetched dev, without moving the user's older checked-out dev branch. All changes stay under `investigation/maplook-finish/`; dependencies, build output and large generated results are ignored.
