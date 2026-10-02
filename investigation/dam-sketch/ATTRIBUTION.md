# Round-two provenance

New harness, optimizations, synthetic scene recipes and documents are original
Dam Good Maps investigation work, licensed AGPL-3.0-or-later as specified by this
folder's package.json. Captures depict only the original synthetic map renderer
and generated Dam Good Maps terrain/water; no Timberborn art is used.

The existing repository's MIT-licensed format, generator, priority flood and
stacked-water modules are imported without modifying product code. The private
Firefox preparation helper is reused from investigation/rust-analysis under the
repository's MIT licence. It applies two documented upstream Playwright debugger
properties to a private browser copy only. The
round-one engine is read from bb5723f8 for comparisons only under ignored local/.
Rust water is pinned to 2ebeea87; its source and binary stay under local/.

Harness dependencies: esbuild and fflate (MIT), Playwright (Apache-2.0),
TypeScript (Apache-2.0), Node.js and its type definitions (their distributed
licenses). Browser binaries, the corrected private Firefox copy and all dependency
trees stay outside tracked output. Runtime hashes identify what was measured.
No game files, blueprints, extracted art or decompiled game code are committed.
