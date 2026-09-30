# Adoption

Base: feature/forces **9e14f189**. This PR into dev carries its unmerged history.
The milestone session should take only the Landslide investigation commit.

`landslide.ts` is a headless, yielding planner. It uses shared snapshots, integer seeded numbers,
Floor, footprints, start checks, rock bits, paths, the heap and WaterSim. Routing inside the
player's band permits only level or downhill steps. Integer cut blocks fund deposition;
limited capacity leaves excess on the slope. Existing deep river tiles receive less debris,
leaving lower spill saddles. Water starts from the old volume and runs the canonical SettleRun.

Adopt planning and literal changes through `forces/op.ts`, `forces/runs.ts` and the normal
worker/session transaction. Keep gesture IDs and stale-response cancellation. Use
`forceParamsOf/literalOf` and `pathRecord`; the demo's full entity snapshot is only an adapter.
Keep the document's existing start carry hook, integrity pass and working-area protections.
The standalone nearest-flat start adapter does not replace those shared product hooks.

Add Style Auto/Rockfall/Slump/Flow to More, with shared Floor. Power sets depth, Size sets
click reach, and a drawn band sets its extent. Use FreehandPath and showMs. Source identities,
strengths and object orientations survive transport. Reveal only after arrival; then warm
water without injecting volume. Esc finishes playback; undo cancels the whole transaction.
The lightweight renderer and moving chunks are demonstration code, not product shaders.

Port the conservation, downhill, replay, Floor, arrival, source, undo and lake checks.
Update living product docs only during adoption; this investigation changes no product files.
