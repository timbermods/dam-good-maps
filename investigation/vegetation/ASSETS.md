# Asset sources and licences

All new vegetation is original procedural geometry authored for this investigation in `models.ts`: pine, birch, oak, their variants, young forms, bare dead forms and blueberry bushes. No image textures, sounds, extracted game models or game files are used. Code and generated geometry use this repository's MIT licence.

The comparison imports the repository's original procedural models from `src/render3d/entities3d.ts` (MIT). Map look 2's shadow method is adapted from `investigation/maplook2/effects.ts` (MIT).

Generated terrain comes from the repository generator (MIT). Real-place terrain is read from the existing library, with no new downloaded assets. It retains the library's data licences and required notices from `src/core/places/attribution.ts` and `investigation/landscapes/ATTRIBUTION.md`, displayed in the demo. Those terrain licences are separate from the original vegetation models.

Captures are local renders of these models and repository maps, not game screenshots. Dependencies and licences: three.js (MIT), fflate (MIT), Vite (MIT), TypeScript (Apache-2.0), Playwright (Apache-2.0), tsx (MIT); exact versions are locked here.
