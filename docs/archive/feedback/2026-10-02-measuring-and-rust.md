# Kyler's decisions on measuring, Firefox and the Rust adoptions (2026-10-02, evening)

Recorded as PLAN §20 D439–D442. Verbatim:

1. A standing rule: no multi-hour measurement runs (profiling sessions, long timing series, extra quiet windows) unless I say one is critical. Speed checks take minutes: the 6-cell smoothness check, or a short benchmark of the thing changed. Correctness and byte-identity checks run in CI or as needed. Put this in CLAUDE.md, HANDOFF and PERFECT.md. Tonight's 02:00 window runs as planned.

2. Firefox's policy (with the 6-cell gate decision and D366): Firefox works and computes exactly the same maps as every other engine, and nobody spends time making it fast.
   - Firefox stays in every correctness check: CI's three-engine determinism check (D366) and the identity checks of every Rust port. A Firefox mismatch is a real bug, found and fixed like any other.
   - Firefox's speed is never measured, tuned or investigated. D381's planned Codex round on Firefox's slowdown is dropped. Anything Firefox-specific in the measuring tools (its WebAssembly compiler prefs, debugger settings) stays only where a correctness check needs it.
   - Integrated GPUs aren't measured either. Before launch, I check the editor myself on a real modest laptop (D367's test); that stands in for any integrated-GPU measurement.

3. The Rust ports' speed re-timing gates are dropped: D391's re-time of the analysis before adoption (and its M9b batch comparison), D400's "provisional until a quiet window" for the forces' speed, D401's quiet-window timing before adopting portable maths, and the Rust water's corrected comparison against TypeScript. A port is adopted when it is byte-identical (D366's checks, in CI) and passes the 6-cell check where that applies. The Rust water runs in Rust in every engine (Chromium, Firefox and WebKit, every size), so its TypeScript can be tagged and deleted under D381.

4. The Rust adoptions move ahead of the post-release list, except what the release gate needs. Order:
   a. Rust 1.90, the wasm32 target and the Rust build into CI and the setup command, with portable.rs (#171, narrowed as D401 says);
   b. the Rust water (#156), native for batch jobs and in the browser;
   c. the forces (#158), as soon as Codex's corpus reads ready;
   d. the analysis (#157) and the generator, after M9b's release.
   Run it as one `build` sub-agent in its own worktree, in parallel with M9b, keeping CPU use reasonable while the page session runs its checks.

Update PLAN §20, PERFECT.md, ROADMAP (the order of work, the Codex adoptions and the Rust order) and HANDOFF to match. Report when the Rust toolchain is in CI and when each port lands on dev.
