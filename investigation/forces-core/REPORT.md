# Shared forces investigation

Started from dev `4f1b8c6`, rebased onto `0f4fe9f` after its documentation-only update.
The four source commits are pinned in SOURCES.json.
All work stays in this directory; the prototype branches remain reference sources.

Run from the repository root:

```sh
npm --prefix investigation/forces-core run demo
```

It installs this folder’s locked dependencies if needed and prints a free local port.
The demo puts Carve, Craterize, Quake and Erupt on one map, with mode-first options.
It uses the repository’s three.js 0.186.0.

## What is shared

One worker and sliced scheduler own the map, live water, planning and mesh updates.
One session owns seeds, Try another, cancellation and result history. Each completed
force stores one literal operation: terrain, water, contamination, objects, fallen
poses and hidden rock. Undo and replay assign those values without simulation.
Cached render groups make visible undo and cancellation immediate.

The core also owns geology, volcanic material, object footprints and support,
input grammar, start refusal, effects coordination and camera preferences.
The verbs retain their terrain formulas and physical object responses. Quake retains
painted Lift and full 3–20 tile Slide, including source transport and river reconnection.
System reduced motion overrides animation, shake and follow. Heights stay within 0–22.

## Evidence

- 45 pinned-source comparisons pass byte for byte, including every tested Carve step.
- All 14 original Node suites pass, both against their pinned sources and with the
  extracted models substituted. This includes Quake’s 1,200 random painted strokes,
  1,600 Slide cases, wet rivers, worker tests and generated/real-place maps.
- 15 core checks cover seeds, exact undo/replay, cancellation, start protection,
  hard lava, rock transport and Carve cutting a Quake cliff.
- Eight real-worker checks cover interleaved history, cancellation races, coalesced
  paint, full Slide glides and atomic project loading.
- Nine shared-browser checks cover all four tools, held and queued strokes, variation,
  refusal, undo, reduced motion and 256² interaction. No browser or shader errors.
- Type checking and production build pass. Original separate browser harnesses were
  replaced by the shared-demo checks; their Node assertions remain intact.

The latest Chrome run on this machine measured 8.1–8.5 ms frame p95 at 256², with
no recorded long tasks in the four measured strike/Lift/Slide cases. Cached visual
Esc took 0.4 ms. The worker’s first acknowledged full frame took 386 ms and restored
meshes took 283 ms; cached display restoration does not wait for them. These are
local measurements, not a universal frame-rate guarantee.

Small results are in checks/, with one replay sample and three captures.
Large generated maps, baseline copies, bundles and dependencies are ignored.

## Differences and decisions

- The old per-prototype save envelopes become one versioned `forceResult` operation
  and `dgm-forces` study bundle. Existing project readers are unchanged; adoption
  needs an explicit converter.
- Erupt bundled an older Carve engine. The common demo uses the latest Carve and
  adds volcanic hardness to it. In Erupt’s archived rock test, hard-lava crossings
  change from 13 to 14, still below the soft control’s 29; hard cut volume changes
  from 1,010 to 1,126. This is the deliberate choice of one current Carve engine.
  The latest Carve’s non-volcanic parity cases remain exact. The new core’s separate
  hard-rock case crosses 13 lava stations versus 29 without hardness.
- Volcanic rock now persists across every force, moves with Lift/Slide and is trimmed
  by excavation. Object support and fallen-pose cleanup are shared. These new
  cross-force interactions had no four-tool baseline.
- Preview timing, pooled effects, cancellation and camera ownership are shared.
  Final water keeps each original policy: Carve’s retained oxbows, Craterize’s
  original volume, and canonical Erupt/Quake settlement. Quake retains its dry-start
  veto; the other prototypes retain their quiet flooding warning.
- Current dev renamed the start-resource API from trees to wood (D164). The legacy
  runner bridges that API and its target; zero-resource assertions stay unchanged.
- The updated D219/D220 handoff confirms all four forces, including Lift and Slide,
  are ready for preview adoption. Release still waits for Kyler to try them. This
  task authorizes only its branch push and one open PR, so no progress-log comment,
  merge, preview publication or release is made.

INTEGRATION.md proposes the Live editing layout, operation/project migration,
worker ownership and top-bar group. It changes no editor files. This is a heightfield
study: production adoption must protect multi-run cave columns until a voxel adapter
exists. No game launch or production deployment was performed.

The work was committed in four steps: source pins, core and verbs, shared demo,
then verification and adoption notes. Scope is checked against fetched dev before
the single authorized branch push and PR; the original local dev checkout is preserved.
