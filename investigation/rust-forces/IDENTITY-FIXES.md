# Exact identity fixes

Historical round-3 pilot evidence is retired (D453/D454).

Current oracle: cleanup/4-force-planning a516e43d, after merged M9b.

- Wasm cold arena creation previously expanded absent rock layers to 23 zeros, while native preserved an empty array; Carve differed (68 vs 74 steps). Preserve the exact supplied rock-layer length in both targets. The cold descriptor uses the codec's binary64 numeric representation.
- Used-ID sets were absent from cold fixture import. Encode their ordered contents and use typed ID sets for source collision checks. Compare diagnostic bytes directly for native/typed reconstruction; no tolerance or normalization of numbers.
- Group 4's source member IDs, starting/used-ID collision protection, finished Glaciate planning and removed edge hook replace their stale upstream versions.
- M9b defaults and the current sealed-lake relevel/restoration algorithm replace the stale oracle behavior. Shared portable arithmetic is unchanged.

Failure inputs/results stay under ignored local/adoption/. Existing-suite native failures now retain unique input/expected/actual files by input hash. Product-only suite failures are reported separately; product source stays read-only.
