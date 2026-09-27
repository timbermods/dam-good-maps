# Map look 3 · phase 1

```sh
npm --prefix investigation/maplook3 run demo
```

Run from the repository root with Node 22.12+. First run installs this folder's locked
dependencies. Open the free loopback port printed at start. Drag either map; cameras stay
synced. Every new effect has its own switch. **Measure this map** tests Standard, High and
both views, then offers the measurements as JSON.

## Result

High builds on maplook2's calibrated water and soft shadows. It adds soft ambient occlusion,
a restrained neutral tone curve and colour grade, gentle distance haze, a warmer sky,
stratified rock, softer soil boundaries and subtle colour variation. Integer levels and
contamination's crack layer stay readable. Three original tree specimens show the proposed
direction, with root-anchored wind. The map's existing trees are unchanged.

Standard imports the current renderer. With every addition off, High matches it exactly:
**zero differences across 1,832,012 framebuffer channels**. The comparison forces full
Standard on software WebGL, as maplook2 did; the product's Light selection is untouched.

All art is procedural. No game files or game screenshots were accessed. See [ASSETS.md](ASSETS.md).
Everything is confined to this folder, based on dev `7360e32`; adoption remains a proposal.

## Captures

Standard is left, High right, at the same camera and water time (8 seconds).

| Overview | Details |
|---|---|
| [128²](captures/overview-128.jpg), [256²](captures/overview-256.jpg) | [Cliff](captures/cliff.jpg), [forest edge](captures/forest-edge.jpg) |
| [Demo controls](captures/demo.jpg), [tree sketch](captures/vegetation.jpg) | [Riverbank](captures/riverbank.jpg), [contaminated ground](captures/contaminated-ground.jpg) |
| Real places | [Victoria Falls](captures/real-victoria.jpg), [Yosemite](captures/real-yosemite.jpg), [Danube Delta](captures/real-danube.jpg) |

JPEGs are 1440 pixels across or smaller, about 11–175 KB each. Larger generated results,
dependencies and builds are ignored.

## Speed

Measured in installed Chrome 153 on an RTX 4080 SUPER / Ryzen 7 9800X3D, Windows, DPR 1,
719×637 pixels per map. Dense River Valley seed 4242 uses 200% forests and 300% ruins.
Two orbit runs per case, each with 700 ms warm-up and 2.2 seconds measured:

| Map | Trees, living + dead | Living trees | Ruins | Standard | High | Both together |
|---|---:|---:|---:|---:|---:|---:|
| 128² | 3,219 | 1,009 | 874 | 164.9 fps | 164.9 fps | 164.9 fps |
| 256² | 6,859 | 2,006 | 1,235 | 164.9 fps | 164.9 fps | 164.9 fps |

High's p95 frame interval was 6.2–6.3 ms. Forest close-ups also reached 164.9 fps. These
results hit the roughly 165 Hz cap; they are not a promise for slower GPUs or larger panes.
[Raw frame measurements](captures/performance.json) include all switches and hardware details.

Individual GPU queries varied at that cap, so a second test used paired 32-draw batches.
The shared tone/grade pass cost about 0.042/0.022 ms at 128²/256²; cached shadow sampling
about 0.018/0.023 ms; the three specimens about 0.007/0.006 ms. Other individual median differences
were under 0.01 ms and within run noise. AO's one-time map bake took 23/114 ms and used
64/256 KiB. [Per-effect costs and limits](INTEGRATION.md#measured-costs) explain the method;
[raw paired results](captures/gpu-profile.json) retain negative/noisy differences too.

## Checks and decisions

TypeScript and production compilation pass. Browser checks load all six generated themes
at both sizes and three Real places, with no page/shader errors. They check every map effect,
Standard preservation, both-direction camera input, and wind on/off. [Verification](captures/verification.json).

With the demo running, `npm --prefix investigation/maplook3 run verify` refreshes captures;
`run bench` measures frame rates and `run profile` measures paired GPU costs. These use the
installed Chrome. `run check` and `run build` check compilation. The built bundle is a
compilation check; Real-place loading is supplied by the local demo server.

AO is a stable terrain-horizon and canopy-footprint approximation, not SSAO. Static shadows
are cached. Neither is ready for live terrain edits without invalidation work. The grade is
a bridge for the renderer's display-space materials, not a physical HDR conversion.
The corner sketch has 8,196 triangles; a full vegetation round needs instancing and LODs.

Work used an isolated checkout to preserve unrelated local files. This task's folder-only
rule takes precedence over updating living product docs. [INTEGRATION.md](INTEGRATION.md)
contains the adoption and vegetation proposals; no product behaviour has changed.

The scope script runs `git diff --name-only dev...HEAD` with temporary comparison refs from
fetched `origin/dev` and this branch. It also compares against `origin/dev` directly, leaving
the original checkout's older, checked-out `dev` reference alone.

## Steps committed

1. Read CLAUDE.md, PERFECT.md, PLAN §20, EDITOR_PLAN.md, maplook2 and the renderer; scaffolded.
2. Added ambient light, post-processing, sky/haze and cached maplook2 shadows.
3. Added terrain materials and the synchronized worker-backed map comparison.
4. Added pine, birch and oak specimens with wind; corrected issues found by visual checks.
5. Measured both sizes and individual costs; added repeatable checks and small captures.
6. Wrote the integration proposals and checked the folder boundary before publishing the PR.
