# Kyler's verdicts on Codex's four branches (2026-10-02)

Recorded as PLAN §20 D400–D403. Verbatim:

- Rust forces (#158): round 2's speed is accepted, provisional until a quiet window. Adoption waits for round 3's identity corpus (2,000 per force and size for native and Node-Wasm, 500 per browser engine) and the open gates. Nothing to do until then.
- Portable maths (#171): adopt a narrowed version. Take the one shared portable.rs for every Rust port, and the whole-source guard over src/core, workers and data-producing tools, as CI. Leave out the Vite plugin that rewrites Three.js and the renderer and camera parts: operations record their results, so picking maths never reaches a replay. Adopt only after a quiet-window timing shows no slowdown (D380). Merge it as an investigation now.
- Rust threads (#168): merge as an investigation, park it. Threaded Rust stays experimental until wasm atomics are stable in Rust. The TypeScript parallel water (#130) remains the multi-core path.
- Dam sketch round 2 (#166): merge as an investigation, not adopted. No round 3 before the release. Its calibration needs a Probe wall-building bridge, and its stacked-dams scene (which predicts dry) is fixed first when it resumes.
