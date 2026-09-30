# Integration — round 4

Transfer retained `settle.out` and matching depth with every water revision, including previews; reject stale revisions. Commit water, current texture, shared paths and cue geometry together. No slope fallback.
Keep Round 3 advection in both water-material hooks. Add foam/wake/seam ribbons using the shared water palettes; use the renderer's single clock and scheduler. Replace this demo's private bridge/string patches with explicit hooks.
Add session view preference **Flow**, default false, to the view bar. It controls only the sparse tapered streaks; surface motion and restrained foam/wakes stay on. No map/export/undo schema change.
Own and dispose `CurrentPaths`, ribbon geometry and the trajectory texture with MapRenderer. Build paths once per water revision; move preparation to the water worker for interactive adoption. Keep pixel sizing and depth testing. Avoid seeding a second independent particle cloud.
Reduced motion: surface/cue time at 2.5%, streak time held. Native side/fall animation retains its existing policy. Keep balanced-momentum semantics explicit; exact transport needs the solver's pre-balancing flux retained separately.

## Added by Kyler at approval (2026-09-30, rounds 1–4 at 5e3dc29a)

- **Item 45 is this:** the moving water (surface advection, foam threads, wakes and joining seams) in both looks' water,
  always on, and the optional **Flow** view on the view bar (cool light on clean water, warm embers on badwater).
- **The Flow view's paths are built in the water worker, never synchronously on the main thread.** The demo's 36 ms
  rebuild at 256² is a visible hitch.
- **It passes the smoothness harness (`investigation/performance`) before it merges.**
