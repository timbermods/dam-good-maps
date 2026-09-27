# Finish the world

Run `npm --prefix investigation/maplook-finish run demo`. It installs this folder's locked dependencies and prints a free loopback URL.

Based on dev caf3f48, with local copies of the approved phase 1 / phase 2 / #38 look. Standard imports dev's renderer. No product files change. The folder-only instruction takes precedence over changing living product documents; adoption is proposed in INTEGRATION.md.

Choices: keep the simulator and map geometry authoritative; all detail is procedural. Use an isolated checkout to preserve unrelated work. Separate stage switches from effect switches. Capture identical cameras and water time. Measure the current machine, not a guessed hardware budget.

Stage 1: cross-section materials reuse the exact outer faces and water columns. Geological beds run in world coordinates; a soil cap follows the actual surface. No added mesh or fake water level.

Stages 2–4 and verification are in progress.

