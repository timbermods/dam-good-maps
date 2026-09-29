# Integration: proposal only

Read `REPORT.md` and `READABILITY.md` first. This branch changes only `investigation/high-soul/` relative to
`8c975822c2691edef94ff4f96217167697a91177`. The PR targets dev as requested and necessarily inherits the High branch's
ancestry. Do not mistake inherited High changes for this investigation's edits.

## Exact adoption

`proposal.mjs` is the executable specification: four product-module transforms, with an error if an expected anchor
is absent. `adoption.patch` is their readable, generated diff. The milestone session can check/apply it on a checkout
containing the base High work with:

```powershell
git apply --check investigation/high-soul/adoption.patch
git apply investigation/high-soul/adoption.patch
```

These commands are instructions for the later adopting session; this investigation did not apply the patch to product
files. If the base has advanced, port the four sections rather than suppressing missing anchors. Then update the living
look documents, pending decisions, palette comments, and affected tests to the decisions Kyler actually makes.

| Product file | Changes to adopt |
|---|---|
| `src/render3d/palette.ts` | Warm/mauve earth, lime grass, olive stone/mortar, bright orange/cream near ruins and an orange far lattice; brighter contamination veins through grass. |
| `src/render3d/materials.ts` | 1024² pattern atlas (from 512²), preserving mipmaps and up to 16× anisotropy. Dry cracks 3.1 cells/unit, plate variation and grain; jittered painted grass strokes. Large warped cobbles, bevel shading, vertical joints, level grooves, narrow dark top lip and stronger contact occlusion. More opaque coloured fall sheets; foam reduced to streaks/edges. |
| `src/render3d/waterPalette.ts` | Shared fall highlight inputs/macros. High clean shallow/body/deep = `[.13,.29,.36] / [.08,.20,.28] / [.045,.12,.19]`; High bad = `[.32,.075,.062]`. Pink badwater highlights. Standard surface water/body/calibration remains as at the base. |
| `src/render3d/high/shaders.ts` | Exposure 1.00, less chroma suppression, no compensating grass dimmer; AO floor .40. Flagstones replace fine strata; map-edge rock keeps them. High poison restores veins rather than an olive stain. Advected caustic networks use the existing original crack atlas at two scales; red shore contact. Lower foam, orange-red badwater fall body, darker blue sky below with cloud coverage on both sides of the horizon. |

Standard takes the shared palette, atlas, terrain, ruins and fall changes. High's grading, ambient bake, surface-water
network and sky stay High-only. Standard's simple coloured fall still uses its existing shallow/body palette. The
software/lite renderer retains its simple ground path; the browser fallback/switching checks compile and exercise it,
but the detailed painted ground is the full renderer's path.

The atlas grows from about 1.33 MiB to 5.33 MiB including mipmaps (RGBA8). The stone bevel adds two atlas reads on side
faces. There is no new render target per frame, mesh expansion, downloaded texture or texture synthesized from a
reference image. The existing soft shadows, narrow soil transition and anisotropy fix are retained.

## Decisions for Kyler

These are proposals to supersede decisions, not silent corrections:

- **D324 item 10:** warm orange-brown/mauve earth, olive cliffs and brighter lime grass contradict neutral earth,
  blue-grey cliffs and the muted grass target. References 6–11 consistently separate painted tops from dark sides.
- **D304 / D310:** the wider High depth span contradicts the narrow calibrated ramp; its dark end does not preserve
  clean-over-bad lightness ordering. The Standard palette tests passing do not approve that change for High.
- **D177 / D178 / D324:** High badwater and fall inputs no longer share the earlier calibrated crimson appearance.
  The Standard mine-pit-versus-badwater margin still passes; High's altered inputs require an explicit screen-space
  recalibration before adoption. Do not change `WATER_CALIBRATION` to make an unmeasured target pass.
- **D305 and D178's near ruin colours:** orange scaffolding/cream panels replace muted far rust and the pinned near
  colours. The far lattice geometry stays. Reference 11 is the strongest evidence; rounded sacks are still missing.
- **D324 item 4 / D231 / #67 falls:** denser coloured sheets and much less white conflict with the stronger white
  crown/landing treatment. Reference 10 and the red fall in 8 support it; the present generated fall is only one narrow
  fall, not full validation of those two geometries.
- **D250 / #67 poison and D114 grass-vein contrast:** glowing red/orange veins replace the olive High stain and weaken
  the mandatory dark-on-grass contrast. References 6–8 support visible veins on both soils. Keep Markers' outline.
- **Pending #110:** exposure 1.00 replaces 1.22; the grass-only exposure compensation is removed with it.
- **#67 map-edge geology / #65 sky:** use the same flagstones at the edge, with clouds below as well as above. This
  deliberately gives up some sediment-bed variety for the reference's floating tiled landmass.

Day-by-day Badtide should reuse the same `groundColor`/contamination fields and vein response, fed from the displayed
simulation day's contamination. This proposal changes that response, not the simulation or its time controls. The
milestone must verify a dry/grass transition while scrubbing; no separate red haze overlay is proposed.

## Reproduce (from the repository root)

Requires the locked Node dependencies and installed Chrome (the same channel as the repository's browser tests).
Reference files must be available in the fetched dev commit. `prepare.mjs` extracts unmodified product snapshots and
references only under ignored `local/`. Vite applies the proposal in memory; it never edits repository `src/`.

```powershell
git fetch origin dev feature/high-look
node investigation/high-soul/prepare.mjs
npm ci --prefix investigation/high-soul/local --no-audit --no-fund
node investigation/high-soul/capture.mjs
node investigation/high-soul/compose.mjs
node investigation/high-soul/emit-patch.mjs
node investigation/high-soul/audit-water.mjs
$env:SOUL_BASELINE='1'
node investigation/high-soul/local/node_modules/vitest/vitest.mjs run --config investigation/high-soul/vitest.config.mjs
Remove-Item Env:SOUL_BASELINE
node investigation/high-soul/local/node_modules/vitest/vitest.mjs run --config investigation/high-soul/vitest.config.mjs
node investigation/high-soul/e2e.mjs
node investigation/high-soul/check-types.mjs
```

The proposal unit run intentionally exits nonzero for the listed decision conflicts. Treat any additional failure as a
regression to investigate. `local/tests-*.json`, `local/e2e.json`, `local/capture-manifest.json` and `local/build-*.json`
contain the full evidence. The manifest records cameras, GPU and build fingerprints; `--skip-build` refuses a stale
proposal. `views.json` fixes both pair cameras; generated-case cameras use the repository's own `capture-high.ts`
selection rules, with the Delta overview pulled back 25% to fit the full map at the references' panoramic aspect ratio.
Animation time is 12.5 s, 1600×670, DPR 1; delivered triptychs are downscaled to 640 px per column. The game exposure,
projection and material assets are not available, so no pixel-perfect match is claimed.

`fit-camera.mjs` and `fit-close.mjs` document the optional camera-fitting method. The stored views are the authoritative
capture inputs; do not rerun fitting when simply reproducing the delivered evidence. All references remain ignored;
only their downscaled comparison panels appear in the committed sheets, as authorized by the reference README.
