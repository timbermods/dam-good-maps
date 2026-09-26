# Shared forces investigation

Work starts from dev at 4f1b8c6. Source commits are pinned in SOURCES.json.

## Decisions

- All changes stay in this directory. The four prototype branches are read-only references.
- Preserve the terrain algorithms and their seed arithmetic; extract common services around them.
- Keep the brush-first grammar and mode-first options rows. No editor changes or releases.
- New work explicitly includes Quake, overriding the older held-slot handoff for this investigation only.
- Large test output and baseline downloads stay in ignored local/.

## Steps

1. Read the project contracts, pin prototype sources, and isolate the investigation.

2. Extracted the four terrain models onto shared map, seed, object-footprint, rock, scheduling, water and exact-result history services. All 45 direct source comparisons pass, including every Carve step. Core checks cover all modes, replay, variation bases, start refusals and hard-lava interplay. Current dev renamed the start resource API to wood (D164); the legacy runner bridges that name and uses the wood target.

3. Built one toolbar demo, one worker and shared rendering/effects. Browser checks cover held Slide, X, queued strokes, start refusal, undo, variation and reduced motion. All five tested 256² modes kept frame p95 below 34 ms on this machine. Camera shake no longer feeds back into orbit controls.
