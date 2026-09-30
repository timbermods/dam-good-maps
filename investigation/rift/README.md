# Rift

Draw a fault band. A block of land drops between its sides; rivers can become lakes.
The standalone demo includes three gestures on original Dam Good Maps Highlands land at 128².

From the repository root:

```powershell
npm --prefix investigation/rift ci
npm --prefix investigation/rift run demo -- --port 5173
```

Open the printed localhost address. Select a case and **Try this Rift**, or draw anywhere.
Click for a short Rift. Wheel zooms; the camera stays still during the force.

**Power** sets the drop. **Size** sets opening width; a click also uses it for the short tear's
length. A drawn path sets its own length and shape. Size's **Auto** follows Power.
**More** contains Walls (Auto, Sheer, Stepped) and the shared Floor (1–22, Default 1).
Floor stays a rule, following the forces core; it has no Auto. Existing ground below it stays put.

**Watch** slows the drop fourfold. **Try another** replaces the last Rift with a new seed.
**Esc** cancels drawing or finishes playback. **Undo / Ctrl Z** restores everything at any time.
Hold **F** and drag horizontally to set Size; **{ / }** adjust Power.

Checks and regeneration:

```powershell
npm --prefix investigation/rift run typecheck
npm --prefix investigation/rift run build
npm --prefix investigation/rift run check
npm --prefix investigation/rift run samples
cd investigation/rift
node run.mjs sample-op.ts
npm run captures
```

Captures use the running localhost demo and headless Microsoft Edge. Set `RIFT_URL` to change
the address. Six 960×640 JPEGs and a 600px GIF are committed. Build outputs, dependencies and
bundled runners stay ignored; put any bulk results or additional frames in `local/`.

[Findings](REPORT.md) · [Adoption](INTEGRATION.md) · [Asset licences](ATTRIBUTION.md)
