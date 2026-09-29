# Integration

Add a session view preference `flowArrows`, default false, beside the existing look controls; it is not map data and does not affect export or undo.
Let MapRenderer own one arrow mesh (replace the demo's private-scene bridge), setting visibility from that preference in both looks.
On setMap and every displayed water update, rebuild from that same SurfaceWater using the existing surfaceFlow result; commit water and arrows together so stale directions never linger.
Refresh the quiet material when the actual look changes, adjust close-view scale on camera changes, and dispose geometry/material with the renderer.
