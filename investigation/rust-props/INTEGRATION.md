# Adoption

The investigation adds no product imports and leaves the existing Rust workspace and product files unchanged.
Its only proposed repair is [adoption.patch](adoption.patch), for F1's non-finite optional output sentinels.

Apply from the repository root with `git apply investigation/rust-props/adoption.patch`.
The patch changes three **output** geometry sentinels to -1: Carve strength depth, Carve unleashed-source
ID, and Glaciate hanging-source ID. Their valid values are nonnegative. The corresponding TypeScript
bridge reads a negative value as null; decoded player-facing records keep their prior meanings.
Input command NaNs for Auto are outside the output contract and are unchanged by this repair.

Rust and the bridge must be adopted together, then regenerate the embedded forces Wasm with
`npx tsx tools/rust/build.ts`. Do not ship the bridge against the old embedded module: NaN would no
longer be recognized as a missing field. Cold packed records are unchanged; the typed geometry bytes
deliberately change. Run the port's usual identity checks and relevant bridge/playback tests after
regenerating the module; re-pin only if an existing pin actually changes.

Verified in an ignored local overlay: the finite-output repro passes; all 430 force cases become
finite, retain native/Wasm/repeat identity, and preserve their changed-height, new-ID and refusal
counts. The patched bridge typechecks. The overlay compiles real path dependencies; it does not edit
the tracked product. `SUMMARY.json` records those results. Patch applicability was checked against the base.

To repeat that check, copy `rust/` and this investigation into an ignored local overlay that preserves
their relative paths, apply the patch there, and run the same native/Wasm force commands from the copied
investigation. Run the finite-output test explicitly with `--ignored`. Application-level runtime
bridge/playback checks are still an adoption step; this investigation did not regenerate tracked Wasm.

F2 source creation, F3 saturated/no-effect forces, and F4 long canonical settle have no behavioral
repair in this patch. Keep their failing tests enabled explicitly while designing those changes.
Owners should reconcile the requested no-new-source rule with the older Carve river/Glaciate meltwater
rules, define a physical-limit adaptation that visibly belongs to each force, and optimize the slow
water case without truncating its settle or changing its bytes.
