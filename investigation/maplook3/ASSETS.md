# Assets and provenance

All new art is procedural code in this directory: rock strata, mineral grain, soil variation,
sky and clouds, and the pine, birch and oak sketch. No textures, models, sounds or screenshots
are taken from Timberborn. No external image or sound assets are used.

The comparison imports this repository's original Standard renderer and maplook2 water/flow
code (repository MIT licence). Numeric colour references come from maplook2/REPORT.md;
no game files are accessed. Captures show only this demo.

Real places use the repository's existing terrain datasets, not art textures. Attribution is
shown in the demo using src/core/places/attribution.ts; the upstream dataset notices remain
applicable. Generated maps come from the repository generator and are not committed.

three.js 0.186.0 is the same version as the repository (MIT). The neutral tone mapping curve
is derived from three.js's PBRNeutralToneMapping shader, credited in post.ts.
