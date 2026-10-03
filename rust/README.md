# The Rust ports

Dam Good Maps' Rust code (PLAN §20 D381, D401, D442). The interface and the rendering stay in TypeScript; the ports
compute the same bytes as the TypeScript they replace, natively (batch jobs) and as WebAssembly in every engine.

- `portable/`: the portable maths every port shares, the same bits as `src/core/math/portable.ts` (D401).
- `portable-check/`: one entry point over `portable/`, used only by the check below.
- `water/`: the water simulation, its settle, fed water and the canonical settle after the pre-fill (#156, ported
  from `src/core/sim/water.ts`). Its Wasm is committed in `src/core/sim/waterWasm.ts` and bound by
  `src/core/sim/rustWater.ts` and `waterRust.ts`; `water-batch` is the native binary for batch jobs. Not switched
  on yet: the app runs the TypeScript water until M9b is on dev, and the Rust is then re-ported to M9b's water.

**Setup.** Rust 1.90.0 and the `wasm32-unknown-unknown` target, pinned by `rust-toolchain.toml`: install rustup for your
user from https://rustup.rs (on Windows without Visual Studio's C++ tools, pick the host `x86_64-pc-windows-gnu`), then
run `rustup toolchain install` in the repository. `npm run setup:machine` says whether it's ready.

**Build.** `npx tsx tools/rust/build.ts [--native]` rebuilds the committed water Wasm (source paths written with
forward slashes, so every OS builds the same bytes) and, with `--native`, the batch binary; `--check` fails when the
committed Wasm differs from a fresh build.

**Check.** `npx tsx tools/rust/check.ts [--engines]` runs what CI's `rust` job runs: the maths guard over every `.rs`
file, strict builds for wasm32 and the host with their IR, assembly and Wasm audited (no libm, no FMA, no transcendental
intrinsics; `tools/rust/guard.mjs`), then `portable/` against `portable.ts` bit for bit, natively, in Node's
WebAssembly and, with `--engines`, in Chromium, Firefox and WebKit, and the Rust water's canonical settle the same
bytes natively, in Node's WebAssembly and in each engine. Cargo runs with `-j 4` (`--jobs N` changes it).

**Rules for a port.** Use `portable::` for anything beyond + − × ÷, comparisons, `floor`, `abs` and integer maths; never
`f64::sin` and the like, `mul_add`, or `%` on floats (use `portable::rem`). Native builds keep `rust/.cargo/config.toml`'s
flags (no FMA, x86-64-v2). Add each new crate to the workspace and to `CRATES` in `tools/rust/check.ts`, so its compiled
output is audited too. Changing the compiler, a target or a flag means re-running the check.
