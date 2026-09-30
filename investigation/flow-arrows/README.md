# Water in motion — round 4

Standalone investigation on high-look **84fe4d36**, including the “Timberborn's soul” proposal. Product modules are read-only imports; all authored files are here. Original procedural content only, no Timberborn files.

## Run and regenerate

From this directory, with Node 24:

```sh
npm ci
npm run generate
npm run dev
```

Open http://127.0.0.1:5184/. Both looks retain Round 3's moving surface. Faint foam lines, bank wakes and joining seams are always on in moving water. **Flow starts off**; it adds sparse, glowing streaks with a dim upstream tail and a rounded downstream head. They follow separated current lanes, rather than covering the river with dots. Fast water carries longer, brighter streaks; badwater carries dimmer orange embers. OS/browser reduced motion slows surface motion and foam to 2.5% and holds the Flow streaks still.

Choose a map/look, try Overview and Close view, then Edit riverbed/Undo. Fixtures are River Valley 4242 and Delta 42 at 128², plus River Valley 4242 at 256² for timing. Delta disables badwater to expose its two distributaries. Bed edits preserve the generated field and rerun `buildMap`.

**Wrong-way source edit** cuts an original level-bed meandering reach through the generated valley. Moving its source from west to east swaps the solver's source wall and open outlet, then runs the existing `canonicalSettle` again. All cues reverse with it. The badwater case settles that reach with a contaminated source. These are controlled diagnostic edits, not saved playable maps. The demo replays real settled snapshots; it does not invent physics or flip display vectors.

## How the layers work

- `flow.ts`: opposing net faces of `settle.out`, divided by matching depth. Rates are not divided by DT again. This is retained balanced momentum, not the unretained raw transport flux. Missing flow means no advection or added cues; no slope fallback.
- `surface.ts`: Round 3's advection of the existing water formulas, retaining palettes, textures, shore/depth masks and transparency. Two fading phases avoid visible resets.
- `paths.ts`: shared wet-only midpoint traces, separated by a claimed corridor. The same lane repeatedly carries streaks. Bank openings/narrowings place wakes; opposing inward cross-currents qualify joining seams. Quiet lakes produce none.
- `flecks.ts`: one GPU draw of asymmetric streaks. Their footprint varies from 22–40 CSS pixels with speed, making them distinct from native glints; actual travel still follows the settled current. Depth testing, translucent heads (alpha capped at 0.86) and soft tails preserve the world beneath.
- `cues.ts`: one ribbon mesh for flowing foam, short curved wake pairs and faint seams. Foam colours come from each look's existing water palette. Cues are stronger in fast water and vanish in still water.

Water, shared paths and both GPU layers replace together before rendering the edited snapshot. Paths are prepared only on water changes; animation updates uniforms, with no per-frame particle simulation. See [INTEGRATION.md](INTEGRATION.md).

## Captures and focused checks

With the server running, in another terminal here:

```sh
npm run capture
npm run benchmark
```

Requires installed Microsoft Edge. Playwright uses D3D11 and the product's GPU test hook. GIFs and matching JPEGs are downscaled **High left / Standard right**. River and wrong-way use the default overview; Delta frames its forks. The wrong-way GIF first reverses the source with Flow off, then repeats with Flow on.

- [River surface](captures/river-overview.gif) · [still](captures/river-overview.jpg)
- [Delta split channels](captures/delta-split.gif) · [still](captures/delta-split.jpg)
- [Wrong-way edit](captures/wrong-way.gif) · [still](captures/wrong-way.jpg)
- [Badwater](captures/badwater.gif) · [still](captures/badwater.jpg)
- [Paused foam lines and wakes, Flow OFF](captures/foam-wakes.jpg)

Checks cover current sign/units, still/missing flow, wet downstream paths, reduced streak count, edit/undo, default-off and reduced motion. The benchmark compares original shaders with no cues against all Round 4 layers, using equal orbits in ABBA order. [REPORT.md](REPORT.md) gives measurements and limits.

Maps, flow arrays, full-size captures, frame sequences, bundles, caches and raw timings stay in gitignored `local/`; the commands above regenerate them. Only compact GIF/JPEG comparisons are committed. The demo owns one animation clock and holds unrelated scenery at a reference time for reproducible recordings.
