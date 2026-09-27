# Finish the world

Run `npm --prefix investigation/maplook-finish run demo`. It installs this folder's locked dependencies and prints a free loopback URL.

Based on dev caf3f48, with local copies of the approved phase 1 / phase 2 / #38 look. Standard imports dev's renderer. No product files change. The folder-only instruction takes precedence over changing living product documents; adoption is proposed in INTEGRATION.md.

Choices: keep the simulator and map geometry authoritative; all detail is procedural. Use an isolated checkout to preserve unrelated work. Separate stage switches from effect switches. Capture identical cameras and water time. Measure the current machine, not a guessed hardware budget.

Stage 1: cross-section materials reuse the exact outer faces and water columns. Geological beds run in world coordinates; a soil cap follows the actual surface. No added mesh or fake water level.

Stages 2–4 and verification are in progress.


Stage 2: world-space crown detail, a dissolving pool contact, small circular bubbles, mist and expanding rings. River foam reads a smoothed turbulence envelope from simulated velocity and actual wet neighbours. Tiny water-height steps share their neighbours' body colour, removing bright dotted tile seams. Paired old/new tall-fall, landing and river-rock captures pass Chrome shader checks. Mist and rings each add one bounded draw; measurements follow.


Stage 3: original roof shingles, log courses, windows and a start banner; fluted and broken relic columns; dark vent stones; thorn canes; a stone-and-wood natural dam; blockage boulders; spring bowls; and worn slopes. Ruins retain their approved scaffold, pale panels and moisture-gated ivy, with gussets and bolts. The mine retains its real framed pit, roots and corner platforms, with pulley and joinery detail. Each object family can be switched off. All 13 object types have side/top paired captures; TypeScript and browser shader checks pass.


Stage 4: daily Drought/Badtide snapshots use WaterSim, hazardDays, badtideContamination and the editor's exact tick and soil rules. The unedited-import wrapper pins displayed water, so the demo reads live simulator arrays directly (regression-tested). Soil browns/cracks and former grass yellows only on truly dry, exposed tiles. Heat is a subpixel dry-ground distortion; sky tint is slight and only in a badtide. Clean disconnected basins stay clean. Normal restores the original arrays. Five mechanics tests pass. Matched normal, day-9 drought and day-4 badtide captures are included.

