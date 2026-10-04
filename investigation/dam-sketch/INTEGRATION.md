# Adopt after Rust water, Weather and the live/calibration gates

Round two starts from dev `c720cfe1` on `investigation/dam-sketch-2`; changes remain
in this folder. It was rebased onto dev `071aa068`; rebuilding confirmed the measured
worker/client bundle bytes stayed unchanged. Physics and stopping checks retain round-one
result bytes. Duplicate reporting scans/temporaries are removed and constant weather
forcing is applied once per frame. Keep supplied map/weather inputs immutable.
`round2-identity.json` and `round2-contracts.json` bind the replay evidence.

The harness uses one runtime per dedicated worker, eight fill ticks / 128 drought
ticks per publication, request IDs, cancellation/disposal and queued-change
coalescing. Draw the exact authored raster immediately; reject old result packets
and mark earlier water pending when the wall changes. Capped fills stay visibly
unsettled. Pool/worker lifetime is explicit.

`browser-timings.json`/CSV and `wall-change-timings.csv` replace the Node-only
responsiveness assumption. Markers are rAF canvas uploads, not compositor times.
Callback work, rAF intervals, reference drags and supported long tasks are recorded
separately. All cohorts exceed 20% CPU load: timings are provisional. Over-budget
callbacks and superseded previews leave the live gate open. Measure the actual
headed editor's texture/mesh uploads and presentation under low load. WebKit
evidence is Windows Playwright WebKit; installed Safari remains unverified.

At 256², measure the approved multi-core water path in Chromium/Firefox with pool
budgeting, startup/copies/cancellation and full byte replay. No alternate backend
or assumed speedup is installed here; Rust stepping remains the largest cost and
Rust threads are a separate investigation. Stacked water has its own performance gate.

`calibration.ts` writes six original scenes, predictions and a Probe schema-1 job
template without launching/installing anything. Probe lacks finished-wall placement
and initial-column restoration. Dedicated-machine staging must verify geometry,
gate selection, all initial columns and zero momentum first. CALIBRATION.md and
calibration-batch.json fix tolerances and observation clocks; every game field in
calibration-measurements.csv remains NOT RUN. Roof measurements include lower
columns/overflow. Binary64 replay alone does not establish “game-exact”.

README.md gives exact regeneration and D195 placement. Raw logs/profiles, source
archives, binaries, maps, dependencies and detailed columns remain in ignored
local/. ATTRIBUTION.md records provenance; package.json uses AGPL-3.0-or-later.

Base dev: `4aab909e23016902cbbe6ffaeddeece786176ab3`. All tracked changes are here.
The product's water engine, generator, map format and interface were only read.
The Rust runtime is pinned separately at `2ebeea87`; prepare materializes its
adapter/protocol/reference and optional crate only under ignored local/.

## Contract

`fromTimber(bytes, name, farmland?)` reads terrain, water, contamination, all stored
momentum, source order, start footprint and object footprints. Roofs, pressure and
directional drains use the stacked topology. Imported-map migration uses the
product's existing normalization. `MapSnapshot` also accepts the editor's arrays
directly. Treat the snapshot as immutable for the job's lifetime.

`Stroke` is an explicit tile-coordinate path and an explicit bottom-to-top stack.
Each piece is a dam, levee, or floodgate with both its maximum and selected height.
The returned four-connected raster is what the interface must display. A corner
tie advances x then y; repeated identical tiles count once. Different stacks at
the same tile are rejected. Unsupported foundations, emitter intersections,
nonstackable gates and the game's height ceiling are checked. Existing objects
overlapping the wall are returned as construction conflicts; nothing is demolished.
No levee support is inferred, no terrain is reshaped and no wall is suggested.

`new SketchJob(snapshot, strokes, weather?, fillTicks?)` creates independent wall
and unchanged-map simulations. Fill starts from the map's actual water and momentum,
with water intersecting full obstacles clipped away. Changed stacked columns
retain their overlapping water; unmatched momentum is discarded. This defines the
hypothetical initial scene, not a construction/demolition animation.

`advance(n)` executes at most n actual ticks and publishes a result. Keep slices
small in a worker; `cancel()` releases both simulations and leaves a readable final
cancelled result. `dispose()` releases completed jobs. Do not install a new runtime
as a response to timing. Wasm initialization failure throws; no benchmark silently
falls back. Without install, the pinned TypeScript heightfield solver can be used
explicitly. Rust traps must discard and replay the entire original job.

Heightfields use resident Rust state and its active cells: no whole-grid transfer
on each drought tick. Every memory view is reacquired; no view survives a possible
arena growth. Interleaved allocations and disposal are checked. Dam stacks, roofs
and high walls use the existing TypeScript stacked simulation. Those cases need
their own browser performance gate; no Rust stacked speed claim is made.

## Meaning of results

Total water and counterfactual water are actual simulated volumes at the same tick.
Additional water is their difference and may be negative. The heightfield reservoir
mask is the exact set of tiles whose spill threshold the specified wall raises,
excluding wall tiles; priority flood supplies only this mask, never water depth or
a volume estimate. Its wet connected components report actual depth sums and actual
surface ranges. A moving surface is not averaged into a guessed single level.
Stacked results use positively changed simulated heads instead of a heightfield
capacity calculation; treat those as affected-water components, not a proven
maximum-storage inventory for complex roofed basins.

Floods include all wet tiles and tiles newly wet relative to the evolving control.
Start and explicit farmland are checked at the terrain surface. Objects are checked
at their placed base inside the correct air column, so a roof separates exposure.
These are water-exposure flags, not plant-death predictions. Farmland absent means
`null`, never all moist or fertile ground. Construction conflicts remain separate.

Settling checks every 128 ticks: volume change below 0.2% and no more than 0.5% of
tiles changing depth by more than 0.005, capped at six days. A capped fill is explicitly
unsettled. Results during filling are transient; the interface must show that state.
These are the port's stopping criteria, not a mathematical claim of equilibrium.

## Weather

`WeatherInput` requires a provenance label and ordered frames: integer tick count,
weather kind, and each emitter's actual strength and contamination in model order.
One-tick frames reproduce ramps; identical forcing can be compressed. The Weather
view should provide its existing calendar/forcing, including source exceptions.
Do not call a seeded random weather generator and claim it is the map's own future.
No weather input gives `drought: null`.

One contiguous drought is reported per job. Coverage is measured until the first
tick with no water left on the initially impounded wet tiles. It is a hydrological
measure: no intake location, pump reach, colony demand, cleanliness threshold or
industrial consumption is invented. A finite horizon with water remaining is
right-censored: show “at least N observed days”, never an exact lifetime.
The demo supplies the documented nine-day Normal maximum as an explicit scenario,
not a calendar stored in its maps.

## Adoption gates

Keep the sketch as worker-local ephemeral state. Only a separate explicit real-object
placement action may write the document, through the existing operation pipeline.
Pass job IDs through messages and discard cancelled/stale results.
Render the drawn wall immediately while simulation progresses. Full fill and weather
times in benchmarks.json must not be presented as a one-frame computation.
Repeat the actual editor's smoothness/presentation harness under low CPU load
before adoption. The round-two headless measurements have callback overruns and
do not establish the strict live-frame gate.

The binary64 engine has the previous investigations' float32-game, seep-frame-fade
and contamination-diffusion limits. Forcing is explicit, not a full colony simulator.
The Rust heightfield fast path assumes the open 34 ceiling is never reached; high
walls dispatch to stacked columns, but other ceiling-reaching inputs must also use
the stacked model. Roofed real-map parity and arbitrary construction state remapping
need a dedicated game-calibration batch before claiming complete game fidelity.
The included synthetic roof/stack checks do not replace that batch.

Regeneration: README commands; checks.json, browser-checks.json, benchmarks.json
and live-benchmarks.json preserve round one. Round-two timing, identity, load,
reference-drag and calibration files are separate.
Large maps, HTML, bundles, binaries and source/dependency provenance remain in local/.
