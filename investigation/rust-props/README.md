# Rust property investigation

Base: `72257712cf51c9e60d80c2e2deffb4bf246be754` (`dev`). Read [REPORT.md](REPORT.md) first.
This independent Cargo workspace links the project's `rust/forces` or `rust/water` by path.
The two features must be built separately: their existing `water_*` exports collide if linked together.
It uses Rust 1.90.0, the repository's native floating-point flags, and no registry dependencies.
The fixture values reuse the product's JSON value type; the binary encoder/decoder and properties are independent.

## Run

From the repository root in PowerShell:

```powershell
./investigation/rust-props/run-all.ps1
```

The script builds sequentially with `cargo -j 4`, runs serial native tests and Node WebAssembly comparisons,
and saves generated logs/results below `local/`. It caps Node's V8 pool and UV pool at one and uses one
Wasm worker and one native child at a time. Allow approximately 6–8 minutes, including three native and
Wasm watchdogs. No source changes, workspace additions, Wasm embedding, or product imports are needed.

Individual failing properties are real positive assertions, ignored by default because this investigation
ships repros, not product fixes. Run them explicitly (the commands intentionally fail on the base):

```powershell
cd investigation/rust-props
cargo test --release -j 4 --target-dir target/forces --test properties -- --ignored --test-threads=1
cargo test --release -j 4 --no-default-features --features water --target-dir target/water --test properties -- --ignored --test-threads=1
```

For one native/Node comparison, after building, use `node --v8-pool-size=1 run.mjs --start=420 --end=421`.
For the reduced timeout: `node --v8-pool-size=1 run.mjs --water --start=79 --end=80 --once`.
Case IDs are stable; `src/lib.rs::specs()` is the force input manifest and `water_case()` the water manifest.
`PROPS_DIAG=1` makes the native force runner print the exact non-finite descriptor slot/index.

## Coverage and assertions

430 force inputs: 168 explicit boundary combinations, 112 size combinations, 140 seeded cases, and
10 reduced repros. Seeded cases start at `0x0356d368`, with the recorded LCG in `next()`; force seeds
are part of each Spec. Dimensions include 1², 2², 3×5, 17², 64², 96², 127×129, 257×255 and 512².
The tiny sizes exercise the public API; they are not a claim about selectable editor sizes.
Heights cover 0, 1, 10, 22, slopes and seeded integer terrain. Both Power endpoints, intermediate Power,
each force's Size endpoints, corners/edges/interior, click/drawn modes, and pinned detail alternatives
are represented. Carve's independent Width and Depth endpoints are represented. Wet maps, badwater,
and up to 32 pre-existing clean/badwater sources are included.

96 water inputs combine eight dimensions with twelve variants: dry/full-water/mixed depth, height
limits, clean/badwater, multiple sources, ordinary emitters and limited seeps, partial dams, both rule
modes, edge-spill modes, source scale 0/1, bounded tick runs and canonical settles. This covers the
single simulation and its canonical settle. Strips and Rust analysis are excluded; stacked-water
behavior is not a property target in this investigation.

The runner compares the exact cold packed result plus actual typed floating-point output bytes twice
natively (fresh processes) and twice in a retained Node Wasm instance. Commands and unused input-path
capacity are excluded from output checks. All optional output fields are included: their deliberately
chosen NaN sentinels still violate the requested strict finite-output contract. This is an ABI issue,
not evidence that terrain or water became NaN. No sentinels are silently normalized in the comparison.
Raw descriptor slices use their declared element types (the early, discarded checker misread integer
arrays as f64; its mismatches were harness errors, not project failures).

The geometry and water arrays must be finite; heights must stay in [0,22]; new entity IDs must not
appear. Existing objects may ride the ground. Changed-height counts are a conservative screen for
visible terrain effects, not an image comparison. The seven individual no-effect repros use dry,
empty terrain, so their lack of terrain change is not masked by object movement or water visuals.
There is no claim that the finite sample exhausts every setting combination or proves a global bound.

The declared resource thresholds are 45 seconds per native call / Wasm watchdog and 768 MiB of live
Rust allocation requests or Wasm linear memory. Repeat pairs of successful calls share a 45-second
Wasm watchdog; case 79 was additionally confirmed with one Wasm call. The meter includes fixture
encoding/serialization, not just the hot planner; allocator overhead and the Node heap are excluded.
Successful Wasm calls free their output between repeats. Neither a timeout nor a missing native hash
counts as identity success. Final memory and bytes of timed-out calls cannot be certified.

## Failure inputs and interpretation

| Failure | Reduced input / cargo test | Explanation |
| --- | --- | --- |
| F4 | Water case 79 / `largest_wet_canonical_returns_within_45_seconds` | 512²; floor 0, dam height 0.5 on each tile, depth 22, contamination 0; no emitters, retained lakes or drained tiles; game=false, edgeSpill=true. Removing the dam plane reduced a diagnostic call to about eight seconds in Wasm, so the partial-obstacle plane is necessary to this slow repro. Map size/time is machine-dependent; this is a watchdog violation, not a proof of nontermination. |
| F1 | Force case 420 / `carve_outputs_are_finite_on_one_tile` | 1², height 1, Power 0, Unleash, seed 0, empty objects/water. Geometry slot 18 indices 1 and 10 are missing `strengthDepth` and `unleashedId` encoded as NaN. |
| F2 | Cases 421–422 / `carve_never_adds_a_source_on_one_tile`, `glaciate_never_adds_a_source_on_one_tile` | 1², height 10, Power 0, Unleash or Flow/Meltwater, seed 0, no existing entities. Both introduce WaterSource IDs. |
| F3 | Cases 423–429 / seven named visible-effect tests | Carve/Glaciate/Rift/Deposit at floor 1; Craterize at floor 0; Erupt at ceiling 22; Quake Slide on uniform ceiling 22. Power 0, seed 0, minimum Size. Larger cases also fail; these are the smallest positive API maps. |

F2 creation is deliberate in `new_water_entity`, Carve's planned groups and `glacier_add_source`.
F3 reflects physical-limit saturation and explicit "no room"/"nothing to take" refusals. The code
and older source/meltwater rules conflict with the stricter properties requested here. A terrain
bump or deleting sources after simulation would conceal the failure while changing force behavior;
no such patch is proposed. F4 needs performance work that preserves the simulation's bytes; no small,
proven safe optimization was identified. The isolated F1 ABI repair is supplied in `adoption.patch`.

The final [SUMMARY.json](SUMMARY.json) contains compact verified counts. Intermediate logs, binaries,
the patch verification overlay, and large generated results remain ignored under `local/` or `target/` (D195).
