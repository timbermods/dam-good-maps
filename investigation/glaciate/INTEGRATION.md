# Adoption proposal: Glaciate

## Round 4: polish

Investigation only; production files and the gallery are unchanged. Round 4 corrects river-bar grades, connected pool joins, inflow banks and the outgoing river, adds springs at eligible hanging mouths, and removes automatic camera movement. The 70% newly-buildable guardrail is retired. Net land remains an informational measurement. The sample still includes an over-wet random case, long side joins and extra wet cross-sections: consult [REPORT.md](REPORT.md) before adoption.

`model.ts` owns settings, original-map drainage, routes and staged reveal. `morphology.ts` owns excavation, the river, cirque, hanging mouths, scree, moraine, object sweep and measurements. There is no relief eligibility gate. Depth follows relief with a minimum three-level target, bounded by ground zero. Floors can be lowered further where an existing lower river would otherwise be dammed. This can produce walls deeper than half-relief; report that tradeoff rather than filling a separate deep drainage slot.

Flow follows a priority-flood parent field and broadens tight turns. In a flat neighbourhood, or for a too-short boundary route, a seeded choice seeks nearby lower ground or an edge. Variations preserve mountain routes; flat-ground direction is the explicit exception. Aim uses a direction-biased terrain route to the dragged endpoint. Auto Size rounds `8 + 36 * Power / 100`; reach is `mapWidth * (0.22 + 0.85 * Power / 100)`, shortened at mountain foot or boundary. Hard rock remains sheer; soft rock can receive narrow benches.

The main river uses a non-increasing profile sampled from the actual irregular bar field, applied across the river’s full raster width. Joining cuts cannot overwrite that main profile. Explicit shared-edge bridges keep diagonal river cells connected in the four-neighbour water solver. The outgoing reach steps down at the moraine and continues toward the original receiving edge; if the old drainage would re-enter an Aim trough, route outside the finished floor to that same edge.

Joining pools use short terrain searches within the trough to reach a draining channel at or below their datum. Recompute drainage connectivity before joining: an intervening pool can change an earlier reach. Nearby feeds can share a receiver. Banks account for the upstream side of a bar and the pool’s outlet, rather than local floor height alone. Surviving outside inflows use one receiving notch per original wet component. Potential flow also identifies dry outside terraces that can become wet. These are literal land changes; there is no water masking or altered water solver.

Original catchments identify hanging mouths. With Meltwater on, each selected mouth with adjacent high ground behind it receives an ordinary spring at its lip. Catchment and seed vary strengths, capped together at `max(0.25, riverRadius * 0.7)`. Absorbed clean river strength is never scaled down. Plunge pools remain a few tiles across. Some joins still exceed the requested few tiles, and some banks read as trenches; those are unresolved limits, not success criteria to redefine. Actual waterfall counts scan wet outside-to-inside cliff edges after simulation; adjacent pixels within five tiles form one fall. Main-river cascades and the outgoing river do not count as hanging falls.

## Objects and sources

Sweep all trees and other objects in the affected ground/river path. Keep surviving entities exactly where they were; do not pack trees onto the edges or retain columns on pillars. Unsupported old slopes are removed, not replaced. The one start is carried to the nearest unoccupied level 3×3 ground outside the trough, without checking entrance quality, water, wood or access. Do not repair the start or veto the finished force because editor start checks fail.

Measure swept source strength using the repository water-model rules, including active state and game strength caps. Sum clean flow into the cirque head and discard swept badwater strength. Meltwater adds the normal 0.65 head feed plus absorbed clean strength, as well as eligible hanging springs. If a combined head exceeds the game's eight-per-source limit, represent it as adjacent ordinary source entities in one cirque head, feeding the same river; never silently clamp away its flow. Sources outside the sweep remain unchanged.

Strength transfer alone is insufficient: the flat River Valley case redirects water to a nearer outlet and dries much of the old downstream course. The spring-origin case does retain downstream flow, but this is not yet a general guarantee. A future route/outlet design must preserve the receiving river connection without reintroducing long collector trenches or moving an outside source. Do not count drying that abandoned river as successful glacier-created land.

Meltwater off adds no source or retained depth. It does not delete untouched outside sources or suppress their simulated inflow. Thus an otherwise source-free glacier is dry, but a trough crossed by a surviving outside river can remain wet; the supplied spring-off endpoint is now dry, but this is not a general promise that outside rivers disappear. Badwater from swept sources is never copied into the new head. This does not promise that unrelated outside badwater can never reach the result later.

Moraine, scree and stepped outwash use part of the cut; the rest is carried away. No volume-balancing fill should bury a mouth. Keep literal cut, deposit and carried-away accounting. The endpoint still obeys the map floor and the D244 height ceiling of 22.

## Literal operation and worker lifecycle

Keep `operation.ts` / `operation.schema.json`'s `forceResult` version-1 envelope. Settings still record an internal `mode` inferred from the gesture; there is no Mode UI. Sorted old/new tuples store terrain, rock, water and contamination, accompanied by whole old/new entity lists, fallen metadata and geology. Fingerprints guard replay and undo. Replay assigns recorded values and never reruns morphology. Unknown entity components survive.

Try another uses the original series base and actual next seed, with a `replaces` predecessor. Undo returns to the previous kept result. Import validates all operations before replacing current state. Adapt this into the editor's existing result, history and cancellation owners rather than adding another history system. Preserve the tarn's real `RetainedWater` through fresh solves, save/load, undo and export.

Port the synchronous planner into the editor's bounded worker slicer without changing deterministic iteration order. The demo commits 18 integer terrain stages over three seconds and 12 water-reveal stages during two seconds of retreat. Water can settle later. Every displayed height must match the literal endpoint before retreat ends. Epoch checks reject late meshes and completion after Esc; cached visible chunks restore the old view immediately.

## Renderer and controls

Use the repository chunk builder, materials and lighting. The local `view.ts` adds the editor's existing `fallTemplate` / `fallMaterial` pass to the older shared study viewer. Fall instances belong to their chunk groups, so snapshot retention, undo and disposal include them. There are no decorative waterfall sprites or separate water physics.

The camera never follows the tongue or exposed ground. Preserve position, target, orientation, FOV and zoom through force frames, settling, undo and map loading. Only player input and explicitly clicked view buttons change the pose. Browser tests compare it on every animation frame, including the recorded GIF.

The travelling tongue has fixed cross sections and moving streaks; its clock does not wait for water ticks. Terrain is ordinary changed integer chunks (`begin(false)`), without GPU morphs. Pointer-down shows a local ice gather immediately. On a six-pixel drag it becomes an Aim arrow; release selects Aim or Flow and starts the worker. The row contains **Power, Size with Auto, Meltwater, Try another**. No relief refusal or hover route/footprint is shown. Only a genuine physical limit can produce pointer text. Esc and map changes clear the arrow.

Keep the five recorded CC0 foley clips and their recipe. Stop voices on cancellation, undo, map change and hidden-page events. Respect global sound and reduced motion. The low resonance is pitched wood foley, not a glacier field recording. Provenance remains in `bank.json` / `ATTRIBUTION.md`.

## Verification to carry into a port

Keep dry 2×2-pad buildability and strict same-coordinate before/after new-land counts. Include all changed terrain, wet/dry transitions and non-plant footprints plus a pad collar; affected net must equal whole-map net. Keep random and modest-ground sampling independent of the planner. Guardrail failures are evidence, not failed determinism tests or reasons to change definitions.

Tests cover real mountain/flat/modest/spring cases; start-independent terrain; unchanged surviving objects; clean-strength accounting; badwater exclusion; no replacement sources when off; deterministic water scheduling; literal replay, undo/redo and atomic imports; physical bounds; material accounting; export water and structural file checks. Browser evidence covers all 24 endpoints, terrain timing, fixed camera frames, default click and both Aim drags, exact waterfall chunk restoration and cancellation through final settling. Start-specific export findings remain visible without repair.

The tall study adds a loader-only ordinary start to Round 1's unchanged objectless heightfield. No Timberborn launch or DGM Probe parity was performed. Caves, layer selections, very large imported maps, interleaved brushes and stacked glaciers remain outside this heightfield investigation. A production port must use the established editor command/schema/layer boundaries and rerun its existing suites.
