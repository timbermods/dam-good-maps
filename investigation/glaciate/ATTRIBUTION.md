# Asset provenance

No assets were extracted from Timberborn. The ice ribbon, UI, terrain algorithm and captures are original work for this investigation. Code and existing procedural terrain/object models are covered by the repository's [MIT licence](../../LICENSE), copyright 2026 Timbermods. Dependencies retain their own licences in the locked npm packages (Three.js, fflate, esbuild, Vite, TypeScript, Playwright, gifenc and the canvas tooling).

## Recorded sound

All five files in `audio/` are **CC0 1.0 recordings**, copied byte-for-byte from the already attributed `investigation/juice-2/audio/` bank. Total: **299,164 bytes**. [bank.json](bank.json) lists each file, original source filenames, source/input and output SHA-256 hashes, author, primary source URL, licence, original edits and every Glaciate runtime edit. `scripts/manifest.ts` reproduces the manifest and verifies each hash.

| Files | Author | Source / licence evidence | Use |
| --- | --- | --- | --- |
| `crack-a.mp3`, `crack-b.mp3` | Independent.nu; uploaded by qubodup | [35 wooden cracks/hits/destructions, CC0](https://opengameart.org/content/35-wooden-crackshitsdestructions) | Slowed cracks/creaks |
| `stone-bed.mp3`, `wood-body.mp3` | Kenney | [Impact Sounds, CC0](https://kenney.nl/assets/impact-sounds) | Recorded friction and a low pitched resonance |
| `waterfall.mp3` | Tom_Kaszuba | [Waterfall sound, CC0](https://freesound.org/people/Tom_Kaszuba/sounds/660255/) | Retreat/meltwater |

Primary source pages were checked again on 2026-09-26 (local date). The Freesound input is the source's public compressed preview, not a lossless master. The earlier bank's complete download/edit trail is in [juice-2/SOUNDS.md](../juice-2/SOUNDS.md). [CC0 legal text](https://creativecommons.org/publicdomain/zero/1.0/legalcode).

No new synthesis or generated noise is mixed in. Browser playback changes rate, applies a low-pass filter, envelopes and mixes the recordings through a compressor at the same nominal 0.72 master as juice-2. The low wood loop is a designed glacier-groan **stand-in**, not a claimed glacier field recording. This keeps licence provenance clear; the sonic likeness still needs a listening judgment.

## Maps and screenshots

`maps/*.json.gz` are original outputs of this repository's generator, with seeds and exact generation path in [checks/maps.json](checks/maps.json). The standard fixtures are unchanged outputs from `src/core/gen/generate.ts`; the tall fixture reproduces the existing `generative/v2/unlocked.ts` pre-build pipeline, without a product build or new hand-drawn terrain.

The gallery comparison and picker reuse the bundled **Near Lauterbrunnen, Near Aoraki Hooker Valley and Near Glencoe** elevation maps. The maps are resampled, cropped and fitted to whole levels, with repository-planned resources. They are interpretations at Timberborn scale, not replicas. Their providers do not endorse these maps. Source: [Terrain Tiles on the Registry of Open Data on AWS](https://registry.opendata.aws/terrain-tiles/). Full terms and modifications: [landscapes/ATTRIBUTION.md](../landscapes/ATTRIBUTION.md). This investigation makes no additional remote elevation download. The following provider notices apply to every derived gallery screenshot:

> ArcticDEM terrain data DEM(s) were created from DigitalGlobe, Inc., imagery and funded under National Science Foundation awards 1043681, 1559691, and 1542736.
>
> Australia terrain data © Commonwealth of Australia (Geoscience Australia) 2017.
>
> Austria terrain data © offene Daten Österreichs – Digitales Geländemodell (DGM) Österreich.
>
> Canada terrain data contains information licensed under the Open Government Licence – Canada.
>
> Europe terrain data produced using Copernicus data and information funded by the European Union - EU-DEM layers.
>
> Global ETOPO1 terrain data U.S. National Oceanic and Atmospheric Administration.
>
> Mexico terrain data source: INEGI, Continental relief, 2016.
>
> New Zealand terrain data Copyright 2011 Crown copyright (c) Land Information New Zealand and the New Zealand Government (All rights reserved).
>
> Norway terrain data © Kartverket.
>
> United Kingdom terrain data © Environment Agency copyright and/or database right 2015. All rights reserved.
>
> United States 3DEP (formerly NED) and global GMTED2010 and SRTM terrain data courtesy of the U.S. Geological Survey.

Captures are taken from the live WebGL demo by `tests/browser.ts`; panel captions/composition and GIF encoding use the local canvas tooling. They are not AI illustrations or game screenshots. The real-place maps are shown unchanged, and the generated Glaciate result is explicitly labelled separately.

Round 3 adds the original Canyon 10 generator snapshot. Its waterfall pass uses the repository's existing `src/render3d/falls.ts` geometry and `fallMaterial`, under the same MIT licence; no game waterfall asset is used. The tall Round 1 heightfield is unchanged. Its loader now adds one ordinary start on already level ground to exercise the one-start contract, without adding terrain, resources or access repairs. Six random high-ground inputs and three modest-ground inputs are selected from the original fixtures before any glacier planning.
