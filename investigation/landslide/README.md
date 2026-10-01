# Landslide

> **Not adopted (Kyler, 2026-09-30, PLAN §20 D354).** The demo felt lame and semi-redundant: its scarp is what Quake
> and the Rift make, its debris is a lumpy Raise, and a natural dam can already be built with the shelf's Natural Dam or
> by raising ground across a river. It is kept for its findings: its checks that dammed lakes settle at a spillway may
> help D350's stuck basins (#150).

A hillside tears away, slides downhill and leaves a body and debris toe. A river can become a reservoir.
Three cases use original Dam Good Maps Canyon and Highlands land at 128².

From the repository root:

```powershell
npm --prefix investigation/landslide ci
npm --prefix investigation/landslide run demo -- --port 5175
```

Open the printed localhost address. Choose a case and **Try this Landslide**, or draw on the slope.
A click follows the steepest downhill direction. A drag sets the extent; its band shows while drawing.
The route can bend inside that band to avoid uphill ground. Wheel zooms; playback never moves the camera.

**Power** sets failure depth. **Size** sets click width and reach; a drag sets its own width and length.
**More** contains Style (**Auto**, **Rockfall**, **Slump**, **Flow**) and the shared **Floor** (1–22).
Auto reads slope, rock and water. Floor limits cutting; existing lower ground can receive debris.
Material stays on the map. If there is no room for it downhill, that part of the hillside stays attached.

**Watch** slows the slide fourfold. **Try another** replaces the last slide with a new seed.
**Esc** cancels drawing or finishes playback. **Undo / Ctrl Z** restores everything at any time.
Hold **F** and drag to set Size; **{ / }** adjust Power. Water continues after final land.

Checks and regeneration:

```powershell
npm --prefix investigation/landslide run typecheck
npm --prefix investigation/landslide run build
npm --prefix investigation/landslide run check
npm --prefix investigation/landslide run samples
cd investigation/landslide
node run.mjs sample-op.ts
$env:LANDSLIDE_URL='http://127.0.0.1:5175'
npm run captures
```

Captures use a running demo and headless Microsoft Edge: six 960×640 JPEGs and one small GIF.
Dependencies, build output and bundled runners stay ignored. Additional frames and bulk results go in `local/`.

[Findings](REPORT.md) · [Adoption](INTEGRATION.md) · [Asset licences](ATTRIBUTION.md)
