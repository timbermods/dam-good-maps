# Adoption

Await Kyler's yes on [docs/sheets/delta-arms.png](../../docs/sheets/delta-arms.png). This PR contains an investigation and an adoption patch; it changes no product files.

The milestone session adopts [delta-arms.patch](delta-arms.patch) against dev `f1a87b54c933540b9dd20179216ba09ec734122b`:

```powershell
git apply investigation/delta-arms/delta-arms.patch
```

If dev has moved, port the same hunks into `src/core/land/hydro.ts`; the build script deliberately rejects changed source hooks. Preserve the `fan` / `g.theme === "delta"` guards. Do not copy study adapters into the product. The only new helper is Delta's terrain-guided course; reuse the existing portable math, stable MinHeap, meander, profile and bank-carving primitives.

Keep the seeded apex/outlet layout. Adopt the low-ground route, stronger independent wandering, variable narrow channels, eroded shoulders, optional flat-reach braid, common downstream bed and actual-ground apex incision together. The final Delta-only main-course correction prevents an arm crossing above the nominal apex from leaving the rest of that river dry. All shaping belongs in `planHydro`, before the land is shown (D348/D370).

The requested local comparison is green: promise 25→30/30, water 29→30/30, straightness 30→30/30, seeds 1–30 at 128². No timings or other checks were run. The baseline analyzer's blind spot and the water outcome's lack of per-arm sampling are reported separately, not patched. Broader settings/sizes were not checked; follow the milestone's normal adoption process on dev after visual approval.
