# Flow arrows — feedback 45

Small standalone demo, based on `feature/high-look` at `8c975822`.
All authored changes live here; product modules are imported read-only. No game files or assets are used.

## Run

Use Node 24 (or a Vite 8 compatible Node version). From this directory:

```sh
npm ci
npm run generate
npm run dev
```

Open http://127.0.0.1:5184/. Flow arrows starts **off**. Choose either map and either look, enable the toggle, orbit/zoom, and try **Edit riverbed** / **Undo riverbed edit**.
The edit lowers a 5 × 5 riverbed patch by two blocks. Generation saves both canonical product-pipeline results; the button applies those snapshots immediately. It is a bounded edit demonstration, not an editor or a new simulation.

Fixtures: River Valley seed 4242, default settings; Delta seed 5 with badwater off so its three clean-water distributaries are visible. Both are 128 × 128. The generator uses the product's `generate` and `buildMap`; arrows use `surfaceWater` and the unchanged `high/flow.ts` estimator.

## Regenerate the three captures

With the server running, in a second terminal in this directory:

```sh
npm run capture
```

The capture script uses installed Microsoft Edge through Playwright (Windows, D3D11). It explicitly enables the renderer's existing GPU test hook so the High comparison is not downgraded by software detection. The ordinary demo keeps the product's normal fallback behavior; its footer reports the actual look.

Each JPEG is a 1728 × 600 pair, **High left / Standard right**, downscaled from two 1440 × 1000 browser captures. River overview uses the product's default camera; Delta frames the split; the close view frames the riverbed edit location. The arrows are enabled for all three.

- [River overview](captures/river-overview.jpg)
- [Delta split channels](captures/delta-split.jpg)
- [Close view](captures/close-view.jpg)

Generated map snapshots, bundled generator, feature metadata, full-size captures, Vite cache and smoke results stay in gitignored `local/`. Recreate them with the commands above. Only the three small JPEGs are committed.

See [REPORT.md](REPORT.md) and [INTEGRATION.md](INTEGRATION.md).
