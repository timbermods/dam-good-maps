# Lake Basin variety: milestone hand-back

Await Kyler's yes on the [30-seed comparison sheet](../../docs/sheets/lake-basin-variety-128.jpg).
This investigation PR does not alter product code. Do not merge or adopt automatically.

Base: `dev` at `65e0aab24742caa7c419349a41a6ef480b603896` (M9b released, D458 and D464 in).
`adoption.patch` changes only `src/core/land/lakeBasin.ts`; it contains zero-context hunks so
that the patch itself has no trailing whitespace. After Kyler accepts the composition, the
milestone session can apply it to that base:

```powershell
git apply --unidiff-zero investigation/lake-basin-variety/adoption.patch
```

If `dev` has moved, port the change into that one module, preserving intervening work.
`prototype.ts` is the same implementation with investigation-relative imports. Product
code must never import it. The existing `generate.ts` call runs the shaping after settings
and intentions, before `makeField`, orientation, snapping and the first land display.
No additional callback or operation after display is needed (D348, D370).

Keep D464's unconditional Lake Basin entry point. Composition uses seed plus sibling
variation, independently of retries. Explicit Rivers (including zero) and the existing
Lakes budget lean remain respected. No shared field, drainage, rasterizer, water settle,
read-back, placement or validation changes belong to this patch.

Validation here is deliberately limited to Normal, preset Lake Basin, 128², seeds 1–30:
`measures.ts` promise/water read-back and `straight.ts`. Settings, other dimensions,
other themes, difficulty and siblings have not been batch-tested in this investigation.
The milestone session owns any further adoption validation after Kyler's yes.

Regenerate from the pinned base with locked dependencies installed:

```powershell
npm ci --ignore-scripts --no-audit --no-fund
node investigation/lake-basin-variety/audit.cjs before
node investigation/lake-basin-variety/audit.cjs after
python investigation/lake-basin-variety/sheet.py after
node node_modules/vitest/vitest.mjs run tests/unit/straight.test.ts --project quick
```

The audit loads `investigation/m9b/measures.ts` in memory, disables its clocks and CPU
sampling, removes its timing fields and batch driver, and captures the same generated
map for the 256 px image and settled channel reading. Only the after run substitutes
`prototype.ts` for Lake Basin shaping. All bulk results and individual images stay in
`investigation/lake-basin-variety/local/` (D195). Python needs Pillow for the sheet.
Run as a small local batch; no speed measurements are collected or reported.
