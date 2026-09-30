# Assets and sources

All new geometry, fixtures, shader additions and captures are original work under this repository's
MIT license. Existing DGM terrain/water shaders and procedural patterns are imported unchanged;
Erode's mesher/light field and the named investigations' original case builders are read from pinned
Git snapshots. `prepare.mjs` and `INTEGRATION.md` identify their commits.

No Timberborn textures, meshes, sounds, game files or reference screenshots are included or sampled
as assets. `docs/look/reference/timberborn/` was comparison context only.

Three.js and gifenc are MIT; Sharp and Playwright are Apache-2.0. Their license files remain with
the packages installed by `npm ci`. The lockfile pins all dependencies. No external asset service
or generated bitmap texture is required.
