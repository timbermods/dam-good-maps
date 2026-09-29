# Round 2 report

Round 1's faint world-sized strokes and slope estimate are superseded. Pale arrows with a dark edge now stay 22–27 CSS pixels long at every tested zoom, with 54–70 px initial spacing. The default overview shows 16 clear arrows instead of 60 faint ones; Delta split and river close captures show 25 and 24. Both looks use the same legibility standard.

Direction, relative speed and drift now come from each water snapshot's retained `settle.out`, using net opposing face currents and matching depth. There is no slope fallback. Still water gets no arrows; unavailable flow gets none. Important distinction: the stored field is the simulation's balanced outflow momentum; it does not retain the raw pre-balancing transport array. This is simulation-derived current, not a claim of exact volumetric velocity. Display drift is deliberately slowed to 3–11 px/s and stops with reduced motion.

Verified in Edge: reversed retained outflows on level water, rate units, zero/missing flow, atomic water/flow edit replacement and undo, six camera distances (6–384), direction of drift and reduced-motion stillness; no browser errors. Visually checked all three regenerated High/Standard pairs and the shallowest/deepest moving clean/bad water diagnostics. Regenerate with the README commands; larger results remain in ignored `local/`.

Limits: a screen-sized glyph can extend past a distant narrow bank; whole-glyph terrain occlusion preserves its arrowhead, and entity footprints are avoided. Small residual currents below 0.04 are suppressed. Camera changes reseed placement. The button replays canonical edit snapshots; production needs revision-matched worker updates and a renderer-owned hook. Product code and water appearance remain unchanged. No game files or broad test suite.
