# Adoption on dev

Base: **ac5a8b224483f87ab7917565d036d6c9c695d986** (Rust forces adopted, #254). Product files on this branch are unchanged. Adopt [adoption.patch](adoption.patch); do not import investigation code into the product or copy the old TypeScript demo planners.

1. On the milestone's dev branch, run `git apply --check --whitespace=error-all investigation/rust-rift-deposit/adoption.patch`, then `git apply investigation/rust-rift-deposit/adoption.patch`. If dev has advanced, reconcile the source patch before applying it; the pinned export is reproducible with `prepare.py`/`adopt.py`.
2. Set `DGM_CARGO_JOBS=8`, run `npx tsx tools/rust/build.ts --native`, and commit the regenerated `src/core/forces/rust/forcesWasm.ts` there. The existing Rust watch rebuild handles both new `.rs` modules. Portable arithmetic, native/Wasm toolchain and the five adopted operations are reused.
3. Run `npm run typecheck`, the quick force suites, `npx tsx tools/rust/check.ts --engines --jobs 8`, and `npx tsx tools/determinism/run.ts --smoke --only /rift/,/deposit/ --serial --no-timings`. Then run full product CI on the adoption PR. The investigation-only PR does not substitute for it.

The patch adds typed opcodes 6/7, flat geometry/arrival/channel tapes and the area-depth buffer; one `forces_plan` call per operation. JSON/value handling is confined to existing cold metadata and fixture/debug output. TypeScript validates settings and plays Rust's records. Deposit applies all caps before balancing, so it skips independent final weathering and the later feather pass; Rift caps its drop before playback. The core's existing literal history, undo, worker water handoff and start-carry transaction are retained. The diagnostic renderers use standard warm water, never the old demo's bespoke settle loop.

Page needs only:

- **Rift:** `mode: "drop"`, Power 0–100 (default 70), Size Auto or 4–64 (width), Walls Auto/Sheer/Stepped, Floor Default=1 or 1–22, unsigned seed. `RIFT_DEFAULTS`/`RiftRun` in `src/core/forces/rift.ts`.
- **Deposit:** `mode: "fan"`, Power 0–100 (default 70), Size Auto or 4–64, Channels Auto/Few/Many, the same Floor and seed. `DEPOSIT_DEFAULTS`/`DepositRun` in `src/core/forces/deposit.ts`.
- Send `{ verb, settings, path: Point[], cut, area?, natural? }` to the existing worker `forceStart`/core `planForce`; one point is a click, a path is Rift's fault or Deposit's direction/reach. Keep through existing `keptForceParams`. Auto resolves through core `natureOf`; Try another changes the seed.
- Wire the terrain-following stroke band, shared shortcuts/pins/Floor, Fast/Slow/Esc/undo, and `ForceCue.rift` or `.deposit`. Core playback has 21/40 fixed steps respectively; the shared page pace supplies Fast's roughly two seconds. Add crack/drop and sediment/water effects and existing licensed sounds; no camera motion. Extend the legacy effects test for the new page effects when they exist.
