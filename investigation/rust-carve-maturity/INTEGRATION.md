# Carve Maturity adoption

Base: `59483c63eb3e687944cbea585fb4f51c2019e7ca` (current dev when work began, after `38be0905`).
Product files are unchanged on this investigation branch. [adoption.patch](adoption.patch) adds Maturity to the **five-force** `rust/forces` crate; it includes no Rift or Deposit implementation from #268.

On Kyler's yes, the milestone session applies the source patch to dev, resolves any intervening source drift, then rebuilds the embedded Wasm with `DGM_CARGO_JOBS=8 npx tsx tools/rust/build.ts --native`. The generated `src/core/forces/rust/forcesWasm.ts` belongs in the adoption commit; binaries, IR, fixture payloads and exported maps do not. Run the relevant checks in [CHECKS.md](CHECKS.md); adoption CI runs in full on dev. Never merge this investigation as though its patch were already applied.

The page needs one **Maturity** control in Carve's More:

| Label | Core value | Behaviour |
| --- | --- | --- |
| Young | `"young"` | Today's Carve; its full output and old pins are unchanged. |
| Mature | `"mature"` | Carve new ground, then age that course; on an existing wet source-to-edge river, age the selected course directly. |
| Auto | `null` (also accepts `"auto"`) | Resolve once from the ground and seed; keep the resolved setting with the literal operation. |

Default for the new control: **Auto**. The existing `DEFAULTS`/missing field remains Young so saved callers and old tests keep their exact bytes. `AUTO_CARVE_DETAILS` includes `maturity:null`; core `natureOf`/`carveNature` resolves it. Flat/open ground picks Mature for 80% of seeds, decreasing linearly to 15% at eight levels of local relief. A separate integer hash preserves all old Auto draws.

Use the existing `planForce`/CarveRun, CarvePlay and literal `forceResult` calls; pass Maturity in Carve settings. No new verb, IDs policy, sound, control implementation or independent Meander operation is introduced. Save the resulting operation, not a request to recompute it on reopening. Existing river sources and their strengths remain unchanged; aging adds no objects. New wet carves retain Young's existing Keep river source rule (D199); Dry canyon creates none.

Power controls age rounds (12 gentle rounds at zero, 80 at 100). Width shapes a new carve; an existing river keeps its inferred width while its banks and bends migrate. Aimed existing-river gestures bound the aged stretch; a click ages its traced course. Keep, Floor and high bluffs limit migration, and every accepted age increment balances integer cuts and fills. A deeply cut new canyon can have no room for an age increment while still keeping its visible Young cut. This is shown by a core contract and is the main limit to review.

The Rust engine is newly written, using Meander's approved curvature, point bars, floodplain and real neck-cutoff behaviour as reference. It uses the shared portable arithmetic, typed arrays/structs and the existing one-operation arena. Playback reverses only a new carve's Young prefix when drawn from its lower end; age increments play forwards. Genuine pre-closure water is retained in sorted aligned rows, so the existing operation, undo, project and Timber paths keep the oxbow.

Reproduce without touching product files: `node investigation/rust-carve-maturity/run.mjs --captures` (Rust 1.90, wasm32 target, Node, Python, installed Playwright engines; set `PW_CHANNEL=chrome` for installed Chrome). It exports this clone's pinned inputs into ignored `local/workspace`, builds/checks sequentially with at most eight workers and collects no speed samples. Everything generated remains under `local/`; only four small reviewed captures are committed. Allow several minutes for local builds and relevant suites, longer for a fresh dependency install.
