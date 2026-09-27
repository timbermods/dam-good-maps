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

three.js 0.186.0 is the same version as the repository (MIT). The tone mapping shoulder
is derived from three.js's `NeutralToneMapping` shader (the Khronos PBR Neutral curve),
with its toe and highlight desaturation removed for this bright stylised look,
credited in post.ts. Source: `node_modules/three/src/renderers/shaders/ShaderChunk/tonemapping_pars_fragment.glsl.js`,
installed at the pinned 0.186.0 version. The derivative's licence notice follows.

> The MIT License
>
> Copyright © 2010-2026 three.js authors
>
> Permission is hereby granted, free of charge, to any person obtaining a copy
> of this software and associated documentation files (the "Software"), to deal
> in the Software without restriction, including without limitation the rights
> to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
> copies of the Software, and to permit persons to whom the Software is
> furnished to do so, subject to the following conditions:
>
> The above copyright notice and this permission notice shall be included in
> all copies or substantial portions of the Software.
>
> THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
> IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
> FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
> AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
> LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
> OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
> THE SOFTWARE.
