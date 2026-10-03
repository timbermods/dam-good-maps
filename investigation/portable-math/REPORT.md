# Portable maths everywhere

Adoption patches only; product files were never edited. Experiment: M9b e292cefe. Dev oracle: 4aab909e; latest dev checked: b4c211b0.

The initial M9b fractional Weather probe reproduces WebKit's difference; dev/D366 does not. Latest M9b 523f6d58 now contains the same fix. The 840-map proof stays pinned to the initial head. The cause is badtideContamination's shape, src/core/sim/weather.ts: at day .35, tick 22, x=-2.5500000000000003, native exp(-x) differs by one low bit (40299d3cb4fe0800 versus WebKit …0801). That changes forcing by one ULP and propagates to 13 contamination frames. Exact term bits are in RESULTS.json.

All adopted ordered bytes/raw binary64 bits match in Chromium 145, Firefox 146 and WebKit 26 on Windows x64:

- 840 M9b generation cases (including 2 existing quality refusals), water on every regenerated model, 19 original official archives, and 12 golden terrains under both water rules.
- Thread counts 1,2,3,4,7,8,16; every-tick forced golden dispatch; analysis/validation/export contracts; 27 complete Weather scenarios plus the fractional probe.
- 316 dev force/editor/session cases, 54 M9b Carve cases, 396 gestures, 1,512 actual camera/ray/picking cases per revision and 58 evaluated-script checks.
- 47,074 shared Rust vectors per native/browser target, eight strict native/Wasm builds, exact sqrt fallback, dependency traps and all 40 planted guard rejections.

CHANGES.json identifies changed cases; RESULTS.json re-pins their outputs. Generation components: {"firefox":{"features":35,"built":35},"webkit":{"features":36,"built":36}}; exports stay identical. Official/golden and batch aggregates stay identical. Carve changes 54 heads and 13 metrics, preserving maps/records. Firefox/WebKit change 3 legacy and 27 dev fractional Editor lengths. All 756 orbit-camera cases change per revision. Current dev forces/sessions stay identical. Weather changes 3 standard probe frames per engine and 4 fractional frames in Chromium/Firefox or 15 in WebKit. Full-state scenarios changed: {"chromium":27,"firefox":27,"webkit":27}.

Whole-source adoption leaves zero native maths references: 356/256 product/batch and 504 Three references audited, plus Rust sqrt/remainder sites. INTEGRATION.md records source pins, input/presentation boundaries and actual-source CI. The optional product quick suite has 836 passes, 15 identical baseline failures and 13 skips.

All 27 Firefox timings use the corrected optimizing tier and individual CPU sampling. Every timing is provisional (46.5–85.3% mean CPU); no speed claim. Large raw results remain in ignored local/.
