# Quake

From the repository root:

```sh
npm --prefix investigation/quake run demo
```

The launcher installs its own dependencies if needed and prints a free local port.

Press and drag to paint a fault. The ground moves as you draw; release to finish.
The left side moves by default. Press **X** mid-stroke to flip it, or choose **Side**.
Choose Lift or Slide, Power, and Sheer or Stepped. Try another keeps the same stroke and changes its personality.

Slide moves the selected block **3–20 tiles**, gliding while you draw. Choose **Study · Slide · river, ridge & ruins · 128²** and paint across the middle to see the river jog and ridge offset clearly. The river's connecting channel stays wet downstream.
Append `?slide` to the printed demo URL to open that study with Slide at Power 100.

To reproduce the Slide recording, open `/browser-slide.html` in the running demo and click **Run Slide checks**, then run `node investigation/quake/run.mjs capture-slide.ts` from the repository root.

Esc or Undo reverts the whole event, including water. Right-drag orbits, middle-drag pans, scroll zooms, and WASD moves the camera.
Saved quakes replay their exact results. **View & saved quakes → Capture view** saves a local JPEG and browser timing measurements in the gitignored `local/` folder.

See [REPORT.md](REPORT.md) for captures and checks, and [INTEGRATION.md](INTEGRATION.md) for the proposed shared forces core.
