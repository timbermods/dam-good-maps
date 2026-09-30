# Water in motion — round 3

Standalone investigation on high-look **84fe4d36**, including the “Timberborn's soul” proposal. All authored files are here; product modules are read-only imports. Original procedural content only; no Timberborn files.

## Run and regenerate

From this directory, with Node 24:

```sh
npm ci
npm run generate
npm run dev
```

Open http://127.0.0.1:5184/. The existing water surface moves in both looks; **Flow starts off**. Toggle Flow for small drifting light flecks. Try Overview, Close view, and Edit riverbed/Undo. OS/browser reduced motion slows surface advection to 2.5% and holds the flecks still.

Fixtures use the current product generator: River Valley 4242 and Delta **42**, both 128², plus River Valley 4242 at 256² for timing. Delta disables badwater so its two distributaries are clear. Seed 5 from round 2 no longer produced the required forks with this generator. Bed edits preserve the generated field and rerun `buildMap`.

**Wrong-way source edit** cuts an original level-bed meandering reach through the generated valley. Moving its source from the west boundary to the east swaps the solver's source wall and open outlet, then runs the existing `canonicalSettle` again. Both surface motion and Flow reverse. The badwater case settles the same reach with a contaminated source. These are controlled diagnostic edits, not saved playable maps. The demo replays real settled snapshots; it does not run a new simulation or flip display vectors.

`flow.ts` derives current from opposing net faces of `settle.out` and the same snapshot's depth. Rates are not divided by DT again. This is the solver's retained balanced momentum, not the unretained raw transport flux. Missing flow means no advection or flecks; there is no surface-slope fallback.

`surface.ts` changes the sampling coordinates of existing water formulas, retaining their palettes, depth/shore masks, texture functions and transparency. Two fading phases avoid visible resets. `flecks.ts` prepares wet-only midpoint trajectories on a water update; one GPU point draw plays them. Their soft 9-CSS-pixel footprint stays readable across zooms, with soft translucent edges and depth testing. Density follows current speed; paths follow bends, join and separate without authored routes. This is bounded visual advection, not fluid-particle simulation.

## Moving captures and checks

With the server running, in another terminal here:

```sh
npm run capture
node benchmark.mjs
```

Requires installed Microsoft Edge. Playwright uses D3D11 and the product's GPU test hook. The four GIFs and matching JPEGs are downscaled **High left / Standard right**. River and wrong-way cases use the default overview camera; Delta frames its actual forks. The wrong-way GIF shows source relocation first with surface motion alone, then with Flow enabled.

- [River surface](captures/river-overview.gif) · [still](captures/river-overview.jpg)
- [Delta split channels](captures/delta-split.gif) · [still](captures/delta-split.jpg)
- [Wrong-way edit](captures/wrong-way.gif) · [still](captures/wrong-way.jpg)
- [Badwater](captures/badwater.gif) · [still](captures/badwater.jpg)

The capture command also checks flow sign/units, still/missing flow, atomic edit replacement, undo, default-off and reduced motion, and saves a close-up locally. The benchmark compares original shaders/no flecks against both layers, with equal orbit paths and an ABBA order. See [REPORT.md](REPORT.md) for measured numbers and limits; [INTEGRATION.md](INTEGRATION.md) for adoption.

Maps, flow arrays, full-size captures, frame sequences, bundles, caches and raw timings stay in gitignored `local/`. Regenerate all of them with the commands above. Only compact GIF/JPEG pairs are committed. The demo owns one animation clock; unrelated scenery is held at a reference time for reproducible recordings.
