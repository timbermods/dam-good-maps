# Integration — round 3

Transfer retained `settle.out` and matching depth with every water revision, including previews; reject stale revisions. Commit water, current texture and rebuilt fleck paths together. No slope fallback.
Move surface advection into both looks' water-material hooks, preserving their palettes and existing shading; use the renderer's single clock and normal render scheduler. Replace this demo's string patches/private bridge with explicit hooks.
Add session view preference **Flow**, default false, to the view bar. It controls only flecks; surface motion stays on. No map/export/undo schema change. Remove the earlier arrow integration.
Own/dispose the current texture, trajectory texture and point draw in MapRenderer. Preserve CSS-pixel sizing and depth testing; build paths off-thread on water revisions if rebuild cost affects interactive painting.
Reduced motion: surface time at 2.5%, fleck time held. Native side/fall animation keeps its existing policy. Keep the balanced-momentum semantics explicit; exact transport requires retaining the solver's pre-balancing flux separately.
