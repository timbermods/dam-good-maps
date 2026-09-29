# Integration: round-2 proposal

All changes relative to `8c975822c2691edef94ff4f96217167697a91177` are under `investigation/high-soul/`.
The PR inherits the High branch's ancestry. Product source and tests have not been edited.

## Adopt the source proposal

`proposal.mjs` is the executable specification: four product-module transforms with checked anchors.
`adoption.patch` is the generated source diff. On a checkout containing the base High work:

```powershell
git apply --check investigation/high-soul/adoption.patch
git apply investigation/high-soul/adoption.patch
```

These are instructions for the milestone session; this investigation only checked applicability. If the base moved,
port the sections instead of suppressing missing anchors. Then rebase the tests below and update the living look
specification, pending decisions and old palette/shader comments. The patch intentionally contains source changes only.

| Product file | Final proposal |
|---|---|
| `src/render3d/palette.ts` | Warm/mauve earth; grass low `[.445,.575,.28]`, high `[.415,.55,.265]`; olive stone; orange/cream ruins; stronger shared grass-vein glow. |
| `src/render3d/materials.ts` | 1024² original atlas with rounded stone relief; macro-warped soil sampling; jittered/rotated grass strokes and mottling; soft mortar/bevel shading; thin dark top rim and stronger contact occlusion; narrow irregular soil boundary, equal-height neighbours only; coloured, denser, lengthwise fall threads and much less white. |
| `src/render3d/waterPalette.ts` | Shared fall highlight inputs/macros. High shallow/body/deep `[.13,.29,.36] / [.08,.20,.28] / [.045,.12,.19]`, bad `[.32,.075,.062]`, grazing `[.07,.14,.23]`; pink badwater highlights. Standard surface-water inputs/calibration remain unchanged. |
| `src/render3d/high/shaders.ts` | Exposure 1.00; restrained grading, no grass-only exposure compensation; AO floor .40; soft flagstones also at map edge; orange-red contamination veins through either soil; broken two-phase caustics and current-aligned ribbons, rough-water coloured crests, depth preserved at grazing angles, red shore contact; tinted falls, blue cloudy close-view sky. |

Standard receives shared palette, atlas, terrain, ruin and fall changes. High alone gets its grade, AO, surface-water,
poison and sky hooks. Lite keeps its simple ground path. Existing switching/fallback browser checks still compile it.
The atlas grows from ~1.33 to ~5.33 MiB with mipmaps; anisotropy stays up to 16×. Macro warping and water detail add texture
reads; side faces add two bevel reads. There is no per-frame target, added mesh, downloaded texture or reference-derived
texture. Current direction/roughness still come from the existing surface-height estimate, not new fluid simulation.

## Accepted decisions

Kyler approved warm brown/mauve earth, orange ruins with cream, exposure 1.00, and the game's own badwater/contamination
cues. D324's neutral-only colours, D305's muted rust, the prior bright white fall treatment, the olive poison stain,
and cross-material/CVD lightness ordering are superseded for this adoption. D304/D310's narrow High depth span and
strict clean-over-bad ordering do not govern this High proposal. Do not brighten water or add hatching to satisfy them.
Keep the optional Markers' existing outlines. Standard's numerical calibration has not been remeasured or altered;
never claim it measures High. Simulations and High measurements are information only.

## Exact test rebases at adoption

Keep tests of geometry, bytes, rendering validity, soil semantics, overlays and water flow. Replace the following
appearance assertions explicitly; do not merely lower their old thresholds. These are the four round-1 failures:

1. **`tests/unit/look-clean.test.ts`, “colours dry ground a cool grey-brown, never reddish”.** Rename to warm/mauve earth.
   Replace both R−B < .17 and R−G < .09 loops with exact palette checks:
   `dry=[.48,.405,.35]`, `dryCool=[.46,.415,.445]`, `dryWarm=[.54,.44,.345]`, `crack=[.19,.14,.125]`.
   Check the three dry colours differ and the clean terrain shader uses all three with its crack network. No neutral-only cap.
2. **`tests/unit/look-mine-ruins.test.ts`, “rusty skeleton with beige panels … muted rust”.** Pin rust `#d4781f`, panel
   `#e3cf96`, far `#b86e30`; retain ivy `#405634`. The later `/^#[a-c]/` panel detector must also change: compare near
   colours against `cssColor(RUIN.panel * k)` for k=.95, .985, 1.02 (per-channel multiplication), rather than a hex prefix.
   Retain all A–E / kind loops, near/far LOD membership, near rust presence, far triangle range 10–20, far height 1/.72,
   rust-area fraction > .6, and triangle budgets. The lattice shader/footprint/variant tests remain intact.
3. **`tests/unit/look-readable.test.ts`, contamination “is a layer … reads in greyscale”.** Keep unchanged underlying
   `groundColor` for dry/moist soils at contamination 1/120/255, stain ≤ .2, nondecreasing reach/fine/glowDry/glowWet/cover,
   increasing dry-vein response, reach growth > .5, and fine-network endpoints 0/1. Remove the subsequent wet/dry, vein/soil,
   far-cover and ground/badwater luminance-gap/order block, not just its first > .2 assertion. Replace it with finite,
   bounded colours and a deterministic rendered 0/.5/1 contamination sequence on both dry soil and grass: zero has no
   orange-red veins; the other levels retain their base soil and increase vein coverage/glow. Run Standard and High,
   including High's enabled poison hook; don't use the CPU Standard helper as proof of High. Reuse `ground-veins`' four
   quadrants for visual comparison, without CVD separation thresholds or additional patterns.
4. **`tests/unit/look.test.ts`, “keeps the meanings apart in brightness too”.** Replace that whole grouped appearance
   test (grass/dry, crack/dry, glow/rust, wet/dry-vein and clean/bad-water gaps) with semantic checks: dry remains cracked
   earth, moist remains the two grass inputs, zero contamination has no vein contribution, positive contamination uses
   orange-red veins through either soil, and water darkens with depth at fixed look/camera/light. Test the Standard and
   High depth functions separately; retain exact clean/bad endpoints and continuity of the shared mixing function.
   Add rendered High depth evidence at identical camera/light settings (the study currently measures 31.2 vs 52.0);
   require only deep < shallow, not this particular numeric gap or any clean-vs-bad order. Existing byte, legend, model,
   fall-flow and marker tests are independent and stay.

Less neon grass exposes **two additional superseded rules** in round 2; 114/120 is expected until these are rebased too:

5. **`look-readable`, “keep their order: dead trees, moist, dry ground, badwater”.** Remove the grass/dry .1, dry/bad .15,
   clean/bad-at-every-depth .05 and clean-shallow/bad .3 assertions. Replace ground/water ordering with palette/semantic
   checks and depth checks as above. Keep the unrelated dead-tree/living-tree and dam-site/hatch checks (and existing
   brush/marker tests); do not weaken those to conceal a regression.
6. **`look-readable`, “tell every grass from every patch … 10 L* and 18 in Lab”.** Replace the min-gap pass/fail loop
   with an information-only matrix of the same grass/dry combinations and severity-1 simulations. Check transforms
   produce finite, bounded display colours, and pin the accepted grass/earth inputs. Use both the scene and targeted
   comparison sheets to assess appearance; require no L* or Lab gap.

During adoption, also reclassify old *passing* clean-vs-bad CVD/gap assertions in `look-badwater`, `look-waterfalls` and
`look-readable` as informational where they enforce the superseded rule. Preserve physical/semantic checks, endpoints,
continuity, no extra stripes, bubbles, and valid rendering. Add a High rendered cue check for pink moving caustics,
bubbles and red contact at rock; these should follow the game and must not become an arbitrary pattern-density rule.

## Remaining adoption work

Rounded sacks need new geometry: replace selected cream panel boxes (currently .03 thick in `entities3d.ts:storey`)
with shallow convex pouches, a pinched/tied upper edge and a soft seam; keep each variant's tile/storey footprint and
orange frame. Give their front a few broad normal planes and retain a flat far LOD. A material-only puff on those flat
rectangles would leave the silhouette and shadows wrong, so no fake sack geometry or material is included here.

The soil boundary can wobble in colour, but cliff/block outlines remain the terrain's grid. Sculpted stone silhouettes,
broader rolling water detail and less regular close grass remain possible refinements; the report does not claim parity.
For Badtide, feed the displayed day's contamination into the existing soil fields and verify veins on dry/grass ground
while scrubbing. Static fixture coverage is not a test of the time controls.

## Reproduce from the repository root

Requires locked Node dependencies and installed Chrome. `prepare.mjs` extracts untouched source and comparison-only
references from pinned commits into ignored `local/`. Vite transforms the snapshot in memory, never repository `src/`.

```powershell
git fetch origin dev feature/high-look
node investigation/high-soul/prepare.mjs
npm ci --prefix investigation/high-soul/local --no-audit --no-fund
node investigation/high-soul/capture.mjs
node investigation/high-soul/capture-fixtures.mjs --skip-build
node investigation/high-soul/compose.mjs
node investigation/high-soul/emit-patch.mjs
node investigation/high-soul/audit-water.mjs
$env:SOUL_BASELINE='1'
node investigation/high-soul/local/node_modules/vitest/vitest.mjs run --config investigation/high-soul/vitest.config.mjs
Remove-Item Env:SOUL_BASELINE
node investigation/high-soul/local/node_modules/vitest/vitest.mjs run --config investigation/high-soul/vitest.config.mjs
node investigation/high-soul/e2e.mjs
node investigation/high-soul/check-types.mjs
node investigation/high-soul/summarize.mjs
git diff --check
git apply --check investigation/high-soul/adoption.patch
```

The proposal unit command exits nonzero for the six listed conflicts. Investigate any other failure. Full runner JSON,
builds, original maps/references and raw captures stay in `local/`; do not stage them. Only compact `checks.json`, the
input audit, code/patch, reports and eleven JPEG sheets are committed. `summarize.mjs` rebuilds the compact evidence.

`views.json` preserves both pair cameras. Generated cases use `capture-high.ts`'s selection rules, with Delta pulled
back 25%. `fixtures.mjs` creates original deterministic material-study arrays; they are not simulation results or altered
pair-map terrain. Both manifests record views, errors and build signatures; `--skip-build` rejects stale proposal builds.
Captures use 12.5 s, 1600×670, DPR 1; triptychs use 640 px/column, CVD sheets 384. Dry/grass are left/right in the soil
study, contaminated/clean back/front; water is clean/bad left/right, shallow/deep back/front. Game material assets, exposure metadata
and saved game camera are unavailable, so no pixel-perfect comparison is claimed. Optional `fit-*.mjs` records round 1's
camera fitting; don't rerun it for reproduction. Reference panels are allowed by the reference README; no reference
pixels are sampled by any renderer or used to create textures.
