# Flow arrows — round 2, feedback 45

Standalone demo on `investigation/flow-arrows`, based on high-look `8c975822`. Product modules are read-only imports; all authored changes stay here. Original generated maps and glyphs only, no Timberborn files.

## Run / regenerate

Use Node 24 (or a Vite 8 compatible version). From this directory:

```sh
npm ci
npm run generate
npm run dev
```

Open http://127.0.0.1:5184/. **Flow arrows starts off.** Choose High or Standard and either map, enable it, orbit/zoom, then try **Edit riverbed** / **Undo riverbed edit**. Enable reduced motion in your OS/browser to make the arrows stand still.

Fixtures are River Valley seed 4242 with defaults, and Delta seed 5 with badwater off to expose its three clean-water distributaries, both 128². Generation uses the existing `generate` and `buildMap`, saving original and lowered-5×5-riverbed results. Every snapshot now includes its own `settle.out` and settle depth. The edit button replaces water and flow together; it replays these real canonical results, not an interactive simulation.

**Rerun generation after updating from round 1.** Missing flow data disables arrows rather than guessing from the surface. `flow.ts` derives centre currents from opposing net face outflows divided by depth. Direction order and rate units follow `src/core/sim/water.ts`; rates are not divided by DT again. The retained field is the solver's balanced outflow momentum, not its unretained pre-balancing transport array. No surface-slope estimator is used.

The glyph is 22–27 CSS pixels long with a pale 2.8 px stroke and 1.2 px dark edge; placement starts 54–70 px apart. Faster current gives longer arrows, closer placement and faster drift (3–11 px/s, deliberately slowed/compressed). Arrows remain anchored to wet water, retire at banks/falls, and hide as whole glyphs behind terrain. At distant zoom a glyph may extend beyond a narrow channel's pixel width to preserve its readable shape. Entity footprints are avoided. Open centres preserve the view below; no opaque panel or depth writing.

## Captures / focused checks

With the server running, from a second terminal here:

```sh
npm run capture
```

Uses installed Microsoft Edge through Playwright with D3D11 and the product's GPU test hook to compare actual High/Standard. Normal use retains the product's fallback. Drift is frozen for reproducible captures. Each pair is downscaled from two 1440×1000 browser captures to 1728×600: **High left, Standard right**.

- [Default river overview](captures/river-overview.jpg)
- [Delta split channels](captures/delta-split.jpg)
- [Close view](captures/close-view.jpg)

The same command checks actual-flow direction/units, still and unavailable flow, edits/undo, six zoom distances, slow drift and reduced motion, and writes diagnostic views of the shallowest/deepest moving clean/bad water. Generated map/flow JSON, generator bundle, metadata, full-size screenshots, contrast sheet, Vite cache and smoke results stay in gitignored `local/`. Only the three small JPEG pairs are committed.

See [REPORT.md](REPORT.md) and [INTEGRATION.md](INTEGRATION.md).
