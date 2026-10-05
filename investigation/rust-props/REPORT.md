F4 — Canonical water at 512² exceeds 45 s natively and in one Node Wasm call: flat floor 0, depth 22, partial dams 0.5, no sources (case 79); cases 87/95 also time out.
F1 — Carve's typed output contains deliberate NaN sentinels for absent strengthDepth/unleashedId (63/430 cases); the finite-sentinel adoption patch fixes these and Glaciate's equivalent optional source field.
F2 — Carve and Glaciate add WaterSource objects, including at Power 0 (83/430 cases); one-tile, empty-map cargo repros fail in native and Wasm.
F3 — All seven forces can leave terrain unchanged at physical limits, including Power 0; empty one-tile repros fail, with larger-map examples too (113 unchanged-height cases, 61 refusals).
Held on completed cases: no unexpected panic, heights within 0–22, repeat bytes and native/Wasm bytes identical for 430 force + 93 water inputs; water outputs finite.
Completed calls stayed below the declared 768 MiB allocation/linear-memory ceiling (native peak 299 MiB, Wasm 371 MiB); timed-out calls' final outputs/memory remain unverified.
Patch overlay: all 430 force outputs finite and byte-identical across native/Wasm; reduced finite-output cargo test and patched bridge typecheck pass; other failures remain.
Reproduce with `./investigation/rust-props/run-all.ps1` (~6–8 min); details, exact inputs and adoption steps: [README](README.md), [INTEGRATION](INTEGRATION.md), [summary](SUMMARY.json); bulk output stays in ignored `local/`.
