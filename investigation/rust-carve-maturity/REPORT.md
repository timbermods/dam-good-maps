Carve Maturity is built directly in typed Rust on dev `59483c63`; product files remain untouched, with no Rift/Deposit code in the adoption patch.
Young keeps all six Carve pins and all 30 existing force pins unchanged; the page's new default is Auto, which leans Mature on open ground (80%) and Young in rugged ground (Mature 15%).
Mature carves then ages new rivers, or directly ages an existing river: migrating bends, balanced point bars, a floodplain and genuine wet oxbows; aging adds no objects.
On Meander's young/narrow/long maps: 780/1,337/1,791 tiles aged, with 894/1,594/1,864 blocks cut and equally deposited; long keeps a 51-tile oxbow. The separate existing-river stroke ages 632 tiles and keeps 14 wet oxbow tiles.
Differences from the demo: portable maths and current game water, badwater courses supported, visible Power 0, and no copied TypeScript engine; deep new canyon bluffs can prevent further migration.
Local checks: 38 exact packed fixtures on native, Node-Wasm, Chromium, Firefox and WebKit; 20 map/record/playback checkpoints per JS target, strict arithmetic guards, typecheck and 195 tests in 25 relevant suites (see CHECKS.md).
Fixed the genuine oxbow's unsorted retained rows; undo, redo, project reopen and byte-identical Timber export/import are covered. No identity tolerances or speed measurements.
Reproduce: `node investigation/rust-carve-maturity/run.mjs --captures`; allow several minutes. Bulk builds, bundles, IR, maps and evidence stay ignored under `local/`; adoption/page wiring is in INTEGRATION.md.

[Young valley](captures/young.jpg) · [Between bluffs](captures/narrow.jpg) · [Long valley](captures/long.jpg) · [Along an existing river](captures/existing.jpg)
