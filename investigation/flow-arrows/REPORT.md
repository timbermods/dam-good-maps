# Flow report

## Round 4

Flow now uses separated current lanes and asymmetric glowing streaks: **47 instead of 387** marks in River Valley, **19 instead of 299** on badwater. Fast water makes longer, brighter streaks; clean water carries cool light, badwater dim orange embers. Heads stay translucent and tails point upstream, distinct from native sparkle.

Always-on foam threads follow those currents. Curved wake pairs mark wet bank shoulders/narrowings; inward currents on both sides qualify joining seams. They use each look's existing foam palette and vanish with zero flow. Round 3 surface advection, settled outflows, atomic water updates and reduced motion remain intact.

Four refreshed High/Standard GIF/still pairs plus the paused **Flow-off foam/wakes** pair are included. Wet/downstream paths, zero-flow suppression, reduced density, edit/undo, default-off and reduced motion passed; no browser/shader errors. The benchmark fixture now has a separate filename from timing output.

256² River Valley, RTX 4080 SUPER, Edge/D3D11, 1440×960, DPR 1; warm-up then two four-second runs per state in ABBA order, matching orbits. Original means unmodified water shaders with all added cues off.

| Look | Original FPS | All layers FPS | Original GPU medians | All layers GPU medians |
|---|---:|---:|---:|---:|
| High | 164.9 | 164.9 | 0.63–0.68 ms | 0.84–0.88 ms |
| Standard | 164.9 | 164.9 | 0.48–0.91 ms | 0.46–0.70 ms |

All-layer frame p95: 6.1–6.2 ms; CPU medians: 0.6–0.9 ms. GPU timing variation is reported rather than claimed away. This measures steady rendering on this machine; weaker hardware is unmeasured.

Limits: bank wakes/seams are local visual cues, not simulated waves; decorative submerged objects without a water-mask footprint receive no dedicated wake. Snapshot replay and synchronous path preparation (36 ms at 256² here, outside the steady-render timing) remain demo shortcuts; adoption should build paths in the water worker. Large results stay in ignored `local/`; README regenerates them. Product code is unchanged.

<details>
<summary>Earlier round reports — historical</summary>

## Round 3

Arrows are removed. Both looks now advect their existing water patterns with the matching `settle.out` current; palettes, shading formulas and transparency stay intact. Flow is off by default and adds translucent, screen-sized flecks on GPU-played wet trajectories. Reduced motion slows the surface to 2.5% and holds flecks still. Water and both flow resources replace together after an edit.

Four High/Standard GIF/still pairs show the default river overview, Delta 42's two distributaries, badwater and an actual source reversal. The controlled reach is settled separately in each direction: mean east–west current **+1.77 / −1.78**. Its GIF demonstrates reversal first with surface alone, then with Flow. Close-up, edit/undo, sign/rate units, still/missing flow and reduced-motion checks passed; no browser/shader errors.

256² River Valley, Edge/D3D11, RTX 4080 SUPER, 1440×960, DPR 1: two four-second runs per state in ABBA order, same orbit, after warm-up. Baseline is the original water shader with Flow off.

| Look | Baseline FPS | Both layers FPS | Baseline GPU median range | Both GPU median range |
|---|---:|---:|---:|---:|
| High | 164.9 | 164.9 | 0.59–0.99 ms | 0.62–0.88 ms |
| Standard | 164.9 | 164.9 | 0.22–0.82 ms | 0.55–0.58 ms |

Frame p95 was 6.2 ms throughout; both-layer CPU medians 0.4–0.5 ms. No visible frame-rate cost on this machine. GPU variation prevents claiming zero cost; weaker hardware is unmeasured.

Limits: this replays settled edit snapshots. The retained field is balanced momentum, not exact transport flux. Surface advection can stretch at sharp current changes; flecks fade at banks/falls and restart, rather than travelling down waterfalls. Production needs explicit shader hooks and revision-matched worker data. Large results stay in ignored `local/`; README regenerates everything. Product code is unchanged.

<details>
<summary>Round 2 history — superseded by Round 3</summary>

# Round 2 report

Round 1's faint world-sized strokes and slope estimate are superseded. Pale arrows with a dark edge now stay 22–27 CSS pixels long at every tested zoom, with 54–70 px initial spacing. The default overview shows 16 clear arrows instead of 60 faint ones; Delta split and river close captures show 25 and 24. Both looks use the same legibility standard.

Direction, relative speed and drift now come from each water snapshot's retained `settle.out`, using net opposing face currents and matching depth. There is no slope fallback. Still water gets no arrows; unavailable flow gets none. Important distinction: the stored field is the simulation's balanced outflow momentum; it does not retain the raw pre-balancing transport array. This is simulation-derived current, not a claim of exact volumetric velocity. Display drift is deliberately slowed to 3–11 px/s and stops with reduced motion.

Verified in Edge: reversed retained outflows on level water, rate units, zero/missing flow, atomic water/flow edit replacement and undo, six camera distances (6–384), direction of drift and reduced-motion stillness; no browser errors. Visually checked all three regenerated High/Standard pairs and the shallowest/deepest moving clean/bad water diagnostics. Regenerate with the README commands; larger results remain in ignored `local/`.

Limits: a screen-sized glyph can extend past a distant narrow bank; whole-glyph terrain occlusion preserves its arrowhead, and entity footprints are avoided. Small residual currents below 0.04 are suppressed. Camera changes reseed placement. The button replays canonical edit snapshots; production needs revision-matched worker updates and a renderer-owned hook. Product code and water appearance remain unchanged. No game files or broad test suite.

</details>

</details>
