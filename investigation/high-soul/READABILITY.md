# Readability evidence

All repository `tests/unit/look*.test.ts`, `tests/unit/brush-ring.test.ts`, `tests/unit/highLook.test.ts`, and
`tests/contract/look*.test.ts` were run unchanged against both module sets. Browser coverage includes every
`look*.spec.ts` and `render3d.spec.ts`, held to High except where a test explicitly switches looks.

Baseline: **120 passed**. Proposal: **116 passed, 4 failed**. Browser: **11 passed, none skipped**.
All product TypeScript sources also pass an in-memory typecheck with the repository's compiler options.
This is not a full unrelated generator/forces test run. `checks.json` records the suite totals and failure names;
full runner output remains in `local/`. Both Vite builds and all captured High/Standard shaders rendered successfully.

| Unit / contract suite | Proposal passed / total |
|---|---:|
| contract/look-mine-ruins | 2 / 2 |
| contract/look-waterfalls | 3 / 3 |
| contract/look | 2 / 2 |
| unit/brush-ring | 2 / 2 |
| unit/highLook | 21 / 21 |
| unit/look-badwater | 9 / 9 |
| unit/look-clean | 6 / 7 |
| unit/look-mine-ruins | 13 / 14 |
| unit/look-outline | 5 / 5 |
| unit/look-readable | 9 / 10 |
| unit/look-water-slopes | 5 / 5 |
| unit/look-waterfalls | 22 / 22 |
| unit/look | 17 / 18 |

## Every failing test, unchanged

| Test | Measured failure | Why the references ask otherwise |
|---|---|---|
| `look-clean`: “colours dry ground a cool grey-brown, never reddish” | Warm-patch R−B = .195; requires < .17. | References 6–11 have warm brown mixed with mauve earth. This deliberately rejects the neutral-only D324 target. |
| `look-mine-ruins`: near rusty skeleton / muted far lattice | New rust `#d4781f`; pinned old rust `#8d5631`. | Reference 11 shows much brighter orange framing and cream panels. The separate ruin-versus-contamination contrast test passes. |
| `look-readable`: contamination as a layer | First failing dry-vein minus wet-vein gap .157; requires > .2. | References 6–8 show orange/red veins through grass too. Brighter grass veins reduce the mandatory dark-on-grass separation. This grouped test also contains other contrast/order assertions; it is listed as failed as a whole, not claimed partially passed. |
| `look`: meanings apart in greyscale | Grass minus wet-vein gap .286 at the first failure; requires > .3. | Same deliberate bright-grass-vein conflict. It needs Kyler's decision, not a relaxed assertion hidden in this branch. |

Still passing: brush-ring contrast in greyscale and all three simulations, grass versus every dry patch, clear-water
versus clear-badwater contrast, mine/badwater/source separation, ruin/contamination separation, water blend continuity,
fall colour-blindness rules on the shared Standard palette, overlay/marker semantics, geometry and byte contracts.
No existing test was edited or threshold relaxed. A passing palette test does **not** imply that every shaded pixel
preserves its margin.

## High's dark-water gap (additional audit)

Most numerical water tests import `WATER`, while High draws its own `HIGH_WATER` inputs. `audit-water.mjs` applies the
proposal transform and the repository's linear-RGB Machado severity-1 matrices to those High inputs. Results are in
`high-water-audit.json`; these are body-colour checks before lighting, grading, alpha, caustics and foam, not GPU pixels.

| High input margin | Normal | Deuteranopia | Protanopia | Tritanopia |
|---|---:|---:|---:|---:|
| Shallow clean minus bad, L* | 12.47 | 9.16 | 18.21 | 12.99 |
| Deep clean minus deep bad, L* | −3.46 | −6.17 | 1.31 | −2.89 |
| Clean shallow-to-deep span, L* | 18.45 | 18.07 | 18.98 | 18.39 |

The analogous old shallow-over-bad rule of >20 L* fails in every simulation; raw-RGB shallow gap .135 also falls below
.3. At depth, the raw clean-over-bad gap is −.0019, below the existing >.05 order. The references' very dark navy pools
and visibly brighter red sheets motivate the proposal, but **this is a real accessibility trade-off, not a pass**.
The High fall's orange body likewise has no certified >20 L* margin. The new badwater input also invalidates assuming
Standard's mine-pit margin transfers to High. Before shipping, measure actual High swatches and shaded scene regions,
then have Kyler choose whether to preserve strict lightness ordering, add a distinct readable badwater pattern, or
accept the reference-led appearance. Do not claim that hue alone resolves it.

`captures/accessibility.jpg` shows all five proposed views in colour, greyscale, deuteranopia, protanopia and tritanopia.
The same transformations are applied in linear RGB after rendering. They are visual evidence, not substitute numerical
tests. Thin grass veins can lose contrast when downscaled; Markers' existing two-tone contamination outline still works.
Day-by-day Badtide contamination, a wide cascade and a badwater fall require dedicated adoption scenes; this report
makes no pass claim for those missing visual cases.

Browser renderer check on this machine: RTX 4080 SUPER / ANGLE D3D11, 256² build 297 ms, 165 fps orbit, p95 6.2 ms.
This is a smoke measurement under current machine load, not a before/after performance benchmark or a weak-GPU claim.
