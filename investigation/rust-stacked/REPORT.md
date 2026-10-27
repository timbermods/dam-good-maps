# D448: stacked-column water in Rust

The adoption patch ports #71's water computation into `rust/water`. All eight frozen fixtures match the reference water hashes, native Rust and Node-Wasm match every exposed byte, and the two cheap D366 stacked cases match in Chromium, Firefox, WebKit and Node. No fixture disagreement was found.

This branch adds only this report, `INTEGRATION.md` and `adoption.patch`. Its product tree is unchanged from the Rust-water-switch base. The patch is the handoff; it is not applied to the branch. The TypeScript stacked engine is never adopted.

## Sources and scope

Read D448, D381, D366 and D444 in the base's `PLAN.md` section 20, and D195's investigation rules. Rechecked them in dev's newly split `docs/decisions/performance-rust.md` before publication; they are unchanged. The base is `feature/rust-water-switch`, `6bc18ffc38d212861c9b0d22acb75edf82a66021`. The behavioural reference is `feature/terrain3d-a`, `24b88b9b`, including `stack.ts`, `stackModel.ts`, `stackPrefill.ts`, `columns.ts`, the three water test files and `stackMaps.ts`, `tests/golden/terrain3d.json`, and `investigation/terrain3d/GAME_RULES.md` and `DESIGN.md`.

The port covers water gaps and terrain-run geometry; water-affecting object footprints, rotation and flipping; sources, seeps and aquifers; sideways connections and reverse edges; roof pressure and overflow; evaporation and contamination; prefill, retained water, saturation, and canonical settling in arbitrary tick slices. Its arithmetic order follows the reference, with portable maths from `rust/portable`. The general stacked loop replaces the reference's per-tile loop specialization without changing fixture bytes.

`stack_engine` chooses the representation. An open, single-column model uses the existing `sim::Sim` and `settle::CanonicalRun`. Their source, the old Wasm ABI, native protocol and portable crate remain unchanged. Flat prefill, stored water and drained tiles also preserve today's results. Roofs, stacked gaps or directional barriers require the stacked representation. A natural dam that the old flat model can represent remains eligible for the flat path.

The file-format writer, terrain support cascade, renderer, editor wiring, soil wetting and plant validation are outside this port. The fixture named `t4-soil` checks its water state; it does not imply a soil engine was ported.

## Fixture results

The small frozen fixture file in the patch stores exact numeric input bytes compressed with gzip, original water hashes and full-field hashes. Inputs are the reference scenes at water-settle time, after its support filtering where applicable. It does not contain a TypeScript simulation. The native example's disk encoding is a test transport only; the runtime ABI uses typed memory.

| Fixture | Settled ticks | Native = Node-Wasm = reference water |
| --- | ---: | --- |
| t1-support | 0 (no settle) | yes |
| t2-walking | 128 | yes |
| t3-cave-water | 2176 | yes |
| t4-soil | 2048 | yes |
| t5-plants | 512 | yes |
| t6-heights | 1280 | yes |
| cave-valley | 384 | yes |
| lake-cave | 512 | yes |

The reference's game checks cover T1/T2 terrain, T3/T4 water and soil, T5 terrain/plants/start and T6 terrain and water. The two additional cave maps are deterministic reference cases. This investigation did not rerun the game and does not extend that provenance. There was no case where the TypeScript water needed to be corrected to satisfy a game-verified golden. Golden water hashes and settle pins were not changed.

Native versus Node compares all 20 original exposed fields and five status values, including geometry, graph, momentum and saturation, rather than only rounded water. Slices of 37 ticks produce the same entire state as the unsliced runs for both cave maps.

## Final verification

Run against the isolated adopted tree inside this clone's ignored `local/adoption/`:

- Rust semantic contracts: 12 passed, four test threads. Coverage includes flat solver bit identity in both rule modes, sealed cavities, sideways pressure, object geometry, flipped seeps, contamination, retained water, sliced settling, edited state and malformed/stale input.
- Existing water suites plus stacked ABI contracts: 112 passed, one existing local game-save test skipped, at most four Vitest workers. Existing digest and pin assertions passed; none were edited.
- Strict Rust audit: all 15 Rust source files and optimized native/Wasm IR, assembly and Wasm passed. All 47,063 portable vectors and 19 existing flat canonical settles matched native and Node-Wasm bytes.
- Eight stacked fixture cases passed native/Node identity and original golden water hashes.
- Existing D366 runner, `--smoke --only stacked-water --no-timing --serial`: cave-valley and lake-cave passed, zero mismatches and zero errors. Chromium 145.0.7632.6, Firefox 146.0.1, WebKit 26.0, Node v24.13.0. Each engine checked both complete fixture states.
- Full TypeScript typecheck passed. Final Wasm passed the existing opcode guard.
- `git apply --check` passed for the adoption patch against the switch base.

The browser run used an isolated Playwright-core 1.58.2 runner to match already installed browser binaries. No shared browser installation was changed. No speed measurements or timing scripts were run or added. Cargo used `-j 4`, tests stayed at four workers or fewer, and long checks ran sequentially.

## Runtime boundary and foundations handoff

The engine owns aligned typed buffers and returns opaque handles. A map is filled through typed views; build, run, prefill, canonical begin, canonical advance, edited-state synchronization and saturation each have one operation call. There is no serialized map or per-tile foreign call. Geometry and graph views are snapshots, so caller writes cannot corrupt internal indices. Invalid dimensions, masks, object codes, nonfinite values, malformed native arrays, stale handles and unknown operations produce a plain one-line refusal. See `INTEGRATION.md` for the complete ABI.

The foundations step must supply supported terrain as 23-layer occupancy masks, preserve object order and classify water-affecting objects explicitly, and map run-indexed retained water into the engine's tile/floor rows. It must keep water gaps distinct from soil terrain runs, bind the returned slot-major water to run-aware map state, and drive sliced settling in the existing worker. It must reacquire views after memory growth or rebuilding and release handles when maps close. The existing D444 Vite watcher already watches every `.rs` under `rust/`; the new modules require no new watcher.

Today's flat unfed/drained-water rule is supported through the drained input mask. #71 defines no corresponding stacked drained-tile policy: a nonempty drained mask on a stacked model refuses with `Drained tiles need the flat water rules.` Foundations must retain #71's stacked retained-water semantics, or define and separately verify a stacked unfed-removal rule before using that input there. This refusal does not affect any reference fixture.

Before publication, dev was refreshed to `3f16eedeabaaaa5974f09913ff9f0b75d7232baf`. Its history does not contain "The Rust water switched on", so the requested switch base was retained without rebasing onto dev.

## Local artifacts and reproduction (D195)

Expanded reference inputs, native outputs, browser summaries, build products, dependencies and the validation tree stay in `investigation/rust-stacked/local/`, which is ignored. Only the three small handoff files are committed. `INTEGRATION.md` gives the commands to recreate the checks and their inputs. With dependencies and Rust targets installed, budget a few minutes for this small correctness corpus; that is a planning estimate, not a measured speed result. The corpus has eight fixture settles and two browser cases, with no measurement or gate scripts in this folder.
