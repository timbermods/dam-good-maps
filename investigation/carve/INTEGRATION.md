# Live editing adoption proposal

This investigation changes no production editor, generator, schema or format.

## Transaction and exact history

Adopt carveResult v1 as a stored-result operation. Diagnostic inputs are mode,
origin/end tile, Power, Wander, nominal Width (null means follows Power),
unsigned 32-bit personality seed, Defy gravity, walls, dry/keep river, layers,
acknowledged step count and end reason. Authoritative output is:

- sorted [tile, before, after] whole-level terrain triples;
- complete before/after entity payloads, including the new source and objects removed;
- exact before/after Float64 water depth and contamination;
- convergence flag and total tick count;
- optional waterSolve method and pre-closure solve diagnostics.

Source creation belongs to the carve itself. Starting a run captures the base
before adding water. Stop retains its acknowledged prefix, then the repo
water solver settles it and one operation commits. Automatic completion does the same.
Esc or Undo restores the base and discards the transaction. Cancellation is
still available during the final solve. The demo worker uses an epoch checked
between slices, so stale chunks cannot reappear after cancellation.

Replay only assigns stored data. It never calls carving, RNG, geology or water.
Existing v1 result files continue to replay even with obsolete diagnostic settings.
The portable demo file includes its base map. In production use ID-keyed
entity patches with original ordering, binary terrain/water arrays in the
project archive, and a document/run revision on every message. Validate entity
identity and project schema at import; the demo's local file validation is
deliberately narrower than a production archive reader.

## Alternatives and their original land

A reroll starts from the series' original map, with identical intent/settings
and an incremented seed. The previously kept result is its transaction
before-state. Completing it commits one literal replacement operation;
undo/cancel returns that previous result, not the original uncarved map.
Each attempt consumes a seed even when cancelled. A new source click begins
a new series at seed 0, with the current map as its original land.

The demo keeps original map / intent / settings / next seed in a worker-side
WeakMap keyed by the result operation. Portable files add carveBase alongside
base: base is the undo target, carveBase the series' original map. A reroll
operation marks params.reroll=true. Exact replay needs only base and the
operation; another path additionally needs carveBase and the diagnostic intent.
Old ordinary result files with intent can use base as their original map.
The new settings are optional for compatibility; missing values use Wander 35,
linked Width and seed 0. Historical replay still never consults these defaults.

Production should persist a series ID and an original document revision, share
immutable base arrays across alternatives, and choose an archive retention
policy. Do not store a fresh full original map for every alternative in memory.
Changing sliders after a kept result prepares a new carve; Try another path
restores the kept result's settings, as its label promises the same carve.

Cache pre-run and final render chunks alongside data. The demo additionally
retains the series' original chunks and preserves the latest history pair
during a tentative transaction. Cancel restores the kept view immediately;
finishing/cancelling releases unused geometry. The latest undo/redo pair is
instant; older history can remesh from exact data. A reroll of older history
also rebuilds its original view if that cache was discarded. Production should
retain or page versions for its full history policy, with checks, soil and
overlays sharing document revisions.

## Force, water and consequences

CarveRun is an intentional fluvial force, not an extension of the game's
non-eroding water. Unleash combines inertia, downhill look-ahead and resistance.
Aim adds destination guidance with coherent lateral acceleration. Power sets
depth, penetration, work rate and finite travel budget. Low
force may run out or turn away; high force opens a route through ridges.
Defy gravity lowers the path ahead to a non-increasing grade.

Character lives in character.ts, separate from terrain work and game water.
Linked nominal width is 2.8 + 0.1 * Power tiles. An override scales incision
and work by sqrt(linkedWidth / overrideWidth): narrow slots concentrate power,
broad channels dilute it. Low effective power also caps total local incision,
so repeatedly overlapping a wide brush cannot excavate a ridge by accident.

Course guidance lives in course.ts. Aim points toward the endpoint. Unleash
reads M9 dev's drainage receiver field and downhill spill/distance potential.
Wander changes lateral amplitude and wavelength in distance units; the desired
heading swings around this independent guide. It never integrates another
turn into the guide. All values share a fixed 110° limit; inertia affects the
candidate score within that limit. Near an aimed endpoint, the swing tapers.

After eight moves without sufficient progress, the course straightens.
Every candidate must beat the cost from 16 moves ago; otherwise the force
ends as power spent instead of circling. This is endpoint distance for Aim,
and interpolated spill level plus drainage distance for Unleash, so whole-level
flats and hollows still have a downstream direction. Segment intersection
checks reject crossing old head paths and previously cut shortcuts.
The 909-case sweep tests the heading bound, every rolling progress window,
termination and segment intersections, including the linked-width defaults.

At Wander 85+, sufficient power may cut one detected narrow neck per run.
oxbow.ts requires one long bend on one side of its shortcut. A route-only
look-ahead using the same deterministic guidance reserves two transverse
mouth bars before work begins. It stops at the first eligible cutoff or route
end. It does not advance terrain or presentation time; actual changes still
start near the source. Measured constructor work was about 20 ms at 256² in
the flat study, off the main thread; production should slice this preparation
as well if larger maps or guidance changes increase it.

Mouth deposition uses a separate whole-level sediment thickness. Scour below
a bar and equal sediment infill happen in one model step, leaving its net
surface unchanged. Gross cut and deposited counts include this exchange;
their difference still equals net terrain loss. This is a deliberate
unresolved scour-and-fill approximation to retain the one-direction-per-tile
rule. It is not a simulation of a mouth visibly cutting down and later rising.
The crescent scours below both bars while the shortcut takes the live river.
All exposed changes retain integer work, extrema rejection and start safety.

Six-station curvature gives each bend an outward-shifted cut bank and up to
two levels of extra outer scour. Inner shelves remain shallower; straights
contract between bends. Split lanes and VFX use the same profile. Geology and
the progress guard are unchanged.

For sealed lakes, water.ts detects the low connected component between the
bars and rejects one connected to the shortcut or source. It runs the repo's
canonical solve on the pre-closure terrain with the real source, then retains
only that simulated water in the isolated component. Everything else starts
with the final terrain's normal prefill. The repo's WaterSim + SettleRun then
settles the whole map in two-tick worker slices, with unchanged evaporation
and convergence rules. Preview ribbon depths never enter this solve; no
extra source or prescribed lake level is used. Dry canyon uses canonicalRun.

This is a history-aware initial state, not canonical terrain-and-sources-only
water. A fresh canonical solve cannot remember an isolated lake. Adoption
therefore needs an explicit retained-water policy for edit/save/export: store
and validate the lake's initial water (or the literal settled result), then
use the repo simulation. Today's production canonical export would empty it.
Do not silently change that production contract as part of this investigation.
Replay already stores exact Float64 results and needs no new simulation.
The optional waterSolve diagnostic records retained-oxbow and pre-closure
convergence/ticks; old v1 operations still replay unchanged.

The closed lake evaporates, so it may never pass a strict steady-water test
while it still contains water. Keep the repo's four-day limit and settled=false
when reached; the capture does reach that limit with a full crescent remaining.
The tests also run 256 extra repo ticks and verify retention. Never disable
evaporation or relax convergence merely to make the indicator green.

The personality mixer remains stateless. Width and grade vary by course
distance; lateral swing phase advances with forward progress. No decision
depends on wall time or effects.

Map-derived competent outcrops are independent of personality seeds. Eligible
wide reaches divide into two smoothly separated lanes and then rejoin, leaving
a multi-tile core. The same lanes drive excavation, preview water and VFX.
This is deliberately stylized: it is not a bank-migration or sediment sorting
solver. Test actual connected channels and unchanged cores, not just a split
event counter. The preview uses an indexed set of channel cells, avoiding a
full path rescan on each frame.

The front reveals whole-level cuts, then the trailing bank targets mature into
steep walls or wider terraces. Horizontal hard layers delay work and make
benches. Proposal rejection prevents new isolated one-tile extrema. Fixed tile
signs prevent oscillating cut/fill. Debris accumulates at the moving front and
builds a coherent receiving fan/delta outside its open central channel.

The live force ribbon is a visual preview. Existing water also advances in
WaterSim as terrain changes, so drainage is visible. Completion replaces
the preview with the repository solve described above. Preserve and show
settled=false if its existing limit is hit. A retained source may fill a closed
endpoint basin into a lake. Never fake a permanently downhill water surface.
D199 on current dev specifies a retained source following Width. The demo maps
nominal width to strength 0.5 + 7.5 * clamp((width - 2.8) / 10, 0, 1), capped
at the repo's maximum 8. Linked Width therefore retains the former Power
relationship; a custom slot leaves less water, a broad override leaves more.
Use nominal Width, not the fluctuating downstream reach width, for this source.
Dry canyon adds no source; existing water sources remain unless carved away.

Protect only the start's footprint plus support margin. Remove other objects
when any supporting footprint tile changes. The demo reuses checkStartAt and
walkRegions for immediate resource status and start reach, using Normal
difficulty thresholds because standalone map inputs have no live project rules.
Production must pass the document's actual rules and complete validator report.
Failures are visible consequences, never carve vetoes. The live status is a
preview until canonical water and soil are ready.

## Worker and rendering

One outstanding model step; pause withholds requests and speed changes their
presentation rate. Ten acknowledged steps mean one carve second on every PC.
Stop stores the acknowledged count. The front may receive 50% extra display
time at breakthroughs/falls when Follow is on; this changes no model state.

The worker builds one 32² chunk between yields; each water stage advances two
ticks between yields. Checks, moisture, sky and shadow baking run off-thread
with yields between stages. These stages and a model step are indivisible;
measure them at 256² rather than treating the upload budget as a hard deadline.
The main thread uploads at most two chunks with a 3 ms scheduling target.
Use captures/checks.json for CPU evidence, never as rendered frame-rate evidence.

The demo directly uses the editor's clean terrainMaterial, waterMaterial,
objectMaterial, drawPatterns, tileData, shadowMap, meshers and entity models.
A fixed pool of 96 whitewater instances and 48 debris/dust instances accompanies
a short muddy ribbon. Reduced-motion settings turn off the effects, water
animation, follow camera and dramatic timing. No model decisions depend on VFX.

For Live editing, retain immediate camera, cursor and brush previews. Put
painting ahead of water work; resolve terrain conflicts by document/run
revision instead of copying the standalone demo's busy/disabled controls.
Index entities and dirty geometry by footprint/chunk. Validate painting
responsiveness, memory and 256² FPS on the user's hardware after integration.

## M9 alignment and PR #32

Read-only source: investigation/generative-v2 at
c77026b271519290ab6dd9b4a9c29890e822fd2f. V2 files live under
investigation/generative/v2/, not an investigation/generative-v2 directory.
No commits from that branch were merged or cherry-picked into this worktree.
The fetched dev now contains PR #32 via f04674d. Its field.ts, levels.ts,
hydro.ts and terrain.ts match the read-only c77026b snapshot used here.

The new force aligns with v2 field.ts resistance: incision is multiplied by
(1 - 0.85 * hardness), bank retreat by (1 - 0.8 * hardness). Its whole-level
benches and rejection of isolated extrema align with levels.ts. Falls and
knickpoints align with hydro.ts's landform goals. Its driven front, grade,
debris budget, sign locks and transaction lifecycle are new. It does not claim
to reuse v2's complete implicit stream-power solver or uplift/weather pipeline.

Direct reuse from dev: M9's generateProto for seeds; places decoding; waterModel,
WaterSim and canonicalRun; clean rendering; editor start checks and walking.
The course guide also directly reuses dev's M9 drainage priority flood. It
supplies downstream direction and progress on flats, not the carving work.
Canonical water retains the repo's separate source-aware priority flood.

With PR #32 now merged, these adoption steps remain proposals:

1. Extract a shared geology query and resistance constants into core. Persist
   the generator's layer stack and competent outcrop field as map metadata.
   Replace the prototype hash/grid outcrops with that shared geology query;
   changing a river personality must never reroll the underlying rock.
2. Feed level-dependent geology into v2 erodeHard and weather. Its current
   caprock mask is two-dimensional; extend it through elevation for common
   hard lips, canyon benches and tilted regional beds.
3. Adopt the promoted shared drainage API for the progress guide. Use the
   promoted M9 generator for the same capture seeds and rerun outcomes;
   do not promise identical v1/v2 maps.
4. Keep offline elevation rescaling and bidirectional cleanup out of live runs.
   Preserve v2 format-3 columns/caves until a voxel-aware carve can edit them;
   today's prototype accepts heightfields only.
5. Keep all stored result operations literal. Merging M9 requires no historical
   erosion replay or migration of already-carved terrain.

These are proposals only. Hardware visual acceptance and real editor painting
are still required before adopting the worker and rendering schedule.
