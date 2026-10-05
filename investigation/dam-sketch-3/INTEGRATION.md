# Adoption contract

Base: dev `da106b9eb868404d26aa99566528f2f4e77b09ae`. This investigation changes no product file.
Apply `adoption.patch` from the repository root, then rebuild the embedded water with the normal
`tools/rust/build.ts` (Cargo -j 4). The patch adds `src/core/damSketch/` and Node-runtime Vitest
correctness scenes. It adds no interface, document operation, suggestion, weather generator or dependency.
The page session owns controls and display; only explicit real-object placement may write the document.
`make-adoption.mjs` regenerates the patch from the tested source and `kernel.patch`.

## Rust addition

The editor's existing `stack_*` ABI accepts natural dams but has no finished-player dam plane or
selected gate barrier. `kernel.patch` adds object code 12 (finished dam: partial 0.65 and a plane at
its base) and 13 (finished gate: strength field carries selected height 0..3). Gate whole levels use
the existing full-obstacle insertion, the fraction uses the existing height-limit map, and its base
uses the existing horizontal-plane insertion. Levees use the existing blockage code 1. The ABI
validates the two new codes and the gate range. No stepping expression, flow coefficient, source
rule, evaporation, contamination, pressure, direction rule or settle implementation changes.
The engine checks the gate template maximum, occupied height, support and placement separately.
Rebuild the shared module once after adoption; the editor and sketch then use this same kernel.
The investigation compiles a copied current crate with this patch under local/kernel/, with the
normal Wasm guard. There is no TypeScript physics fallback and no pinned historical water copy.

## API and map input

`loadKernel(bytes)` creates a worker-local kernel; `createJob(kernel, snapshot, strokes, options)`
returns `advance(tickBudget)`, `result()`, `cancel()` and `dispose()`. All outputs are detached data,
including slot-major water arrays, reservoir columns, held/total/control water, exact wall tiles and
piece counts, and wet/newly wet/exposed tiles. Use masks and typed water objects in editor model order:
0 inert, 1 blockage, 2 natural dam, 3/4/5 overhang 2/3/4, 6 drain, 7 clean source, 8 bad source,
9 clean seep, 10 bad seep, 11 aquifer, 12 finished dam, 13 finished gate. An object row is
[kind,x,y,z,rotation 0..3,flipped 0/1,delayed 0/1,strength]. Pass original terrain masks, not obstacle-raised floors.

The caller maps its current document/model to Snapshot; file parsing and editor controls stay with
existing code. Supply all non-water object footprints in `occupants`, with placed base, physical
height and whether the top is stackable. Water footprints are also checked by the compiler.
This implementation refuses overlapping construction instead of assuming demolition. A foundation
is the top terrain surface unless `baseZ` explicitly selects another supported surface (including a
cave floor or existing stackable object's top). It checks terrain collisions through occupied height.
A floodgate cannot support another piece; no missing supports are invented. Corner raster ties
advance x then y, and identical overlapping strokes count once. The caller displays returned tiles.

`water` is optional: absent means genuinely dry, present must contain the exact kernel's slot-major
depth, overflow, contamination, old depth and graph momentum arrays. Existing state survives unchanged
columns byte for byte; changing topology intersects old water with new air columns, clips solid-filled
water, carries overflow only on identical columns and drops momentum whose endpoints changed.
The Rust sync operation rebuilds active bookkeeping; the binding then restores supplied old depth,
which sync ordinarily resets. This defines a hypothetical instantaneous wall placement, not a build animation.
Map arrays, object order and options are cloned for the job; later caller mutations cannot alter it.
Saved retained/drained selections must already be materialized into the supplied water, as in the editor.

## Held water and drought

A directed minimax spill calculation labels columns whose outlet barrier this exact wall raises;
it never manufactures depth, water volume, a guessed fill time or wall candidates. It uses Rust's
column graph, column floors/ceilings, authored partial barriers, source boundaries and drain directions;
flat columns use their four neighbours. Wall tiles are excluded. Held water is the kernel's actual
depth plus pressure overflow on those columns, counted once. This replaces round 2's visible-head
comparison for stacked reservoirs. Roofed layers retain separate column IDs and exposed objects
are checked at their authored base inside the matching air column. Farmland absent means unknown.

Every 128 fill ticks, the previous stopping rule compares volume (<0.2% change) and columns whose
water changed by >0.005 (at most 0.5% of map tiles). It includes overflow. The default cap is six
days (768 ticks/day); reaching it without passing reports capped/unsettled. These are stopping criteria,
not a proof of equilibrium. Interim fields describe a transient fill, and include the current tick.

Drought requires explicit horizon, provenance, strengths and contamination in emitter order; absence
returns null. Preserve actual source exceptions/ramp choices in caller-supplied scenarios rather than
inventing a calendar. This first API handles one constant drought forcing interval; split intervals and
weather calendars belong to the later Weather integration. Coverage counts exact ticks to the first
empty observation on the fixed initially wet reservoir-column set. It stops at exhaustion or the
supplied horizon. A wet horizon is censored: display "at least N observed days". No population,
consumption, pump reach, intake location, clean-water threshold or random future weather is inferred.
This is hydrological persistence, not colony service coverage.

## Progress and ownership

`fillProgressively` publishes each 8-tick slice and yields between slices; AbortSignal cancels and
releases both simulations. One water tick is atomic. For wall changes use `createWorkerSession`:
provide a worker factory pointing to worker.ts, callback and error callback, then call replace with
{bytes,map,strokes,options}. Replacement terminates the old worker synchronously BEFORE creating the
new one; it increments generation and rejects late queued packets. This avoids waiting for a busy
worker to process a cancellation message. dispose/cancel terminates its current worker. Use one worker
per active sketch and keep total PC threads at four or fewer. No interface is included or measured.
Wasm initialization/errors surface as errors; there is no silent alternate solver.

## Evidence and remaining adoption gate

The Node scenes assert barriers, counts, floods, stacked gaps and drought exhaustion/censoring.
Byte checks compare independent direct calls to this kernel with sliced jobs for the same explicit
objects, and compare existing flat/roofed objects with the editor's unmodified embedded module.
Warm-state, cancellation, stale-message rejection and construction refusals are also checked.
The adopted tests continue to check direct-kernel identity; their editor module is regenerated on adoption.
Neither synthetic bytes nor the game-rule ports establish new in-game calibration. The five original
source-fed scenes and their exact tick/column predictions need the dedicated-machine batch specified
in CALIBRATION.md. Complex roofed reservoir inventory also retains that calibration boundary.
No browser timing or game launch is part of this delivery.
