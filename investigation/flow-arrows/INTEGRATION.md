# Integration

Add a session view preference `flowArrows`, default false, beside look controls; no map/export/undo schema change.
Transfer the settle's retained `out` and matching depth with each displayed water revision, including preview results; reject stale revisions and show no arrows when flow is absent. Do not substitute surface slope.
Let MapRenderer own FlowArrows instead of the demo's private scene/camera bridge, updating water and flow in one commit.
Keep CSS-pixel sizing/spacing and whole-glyph occlusion in both looks; resample on camera changes, stop drift for reduced motion, and dispose the overlay with the renderer.
