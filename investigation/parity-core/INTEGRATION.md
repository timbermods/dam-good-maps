# Adoption

The product proposal is [adoption.patch](adoption.patch), based exactly on dev
`514c9437133bf4743efa7f4eed60da7f840587ff`. It changes only core/data, format and simulation code,
its tests, the Python water reference and the relevant core/format documentation. This investigation
branch leaves every product file unchanged.

Apply in the intended adoption checkout after resolving any intervening cleanup changes:

```powershell
git apply --check investigation/parity-core/adoption.patch
git apply --binary investigation/parity-core/adoption.patch
npm ci --ignore-scripts --no-audit --no-fund
npm run typecheck
npx tsx tools/rust/build.ts --check
npx vitest run --project quick --maxWorkers 4 tests/contract/parityObjects.test.ts tests/unit/parity-data.test.ts tests/unit/parity-water.test.ts tests/unit/explosion.test.ts tests/unit/paint.test.ts tests/unit/format.test.ts tests/contract/ops.test.ts tests/contract/document.test.ts tests/contract/sourcesUnderEdits.test.ts tests/contract/editSequences.test.ts tests/unit/water-speedups.test.ts tests/unit/water.test.ts tests/unit/waterGame.test.ts tests/unit/rustWater.test.ts tests/unit/boundaries.test.ts
```

Rust 1.90.0 with wasm32-unknown-unknown and Python with numpy are needed for the source/Wasm and
independent-reference checks. Keep at most four workers and one long run at a time. No probe is part
of adoption. The patch's generated Wasm and small existing golden fixture are included; no bulk results are.

## Rust water switch

On this dev, RustWaterSim is not yet the default; the patch updates both active TypeScript and the
pre-M9b Rust binding. At `feature/rust-water-switch` **8cfb67fc**, the same WaterSim API is Rust-backed.
Carry these exact changes into that implementation when resolving the switch:

1. `rust/water/src/sim.rs`, `Sim::new`: initialize each limited emitter's seep_on to 0; other emitters
   start at 1. `update_seeps` already implements the 0.8/0.72 hysteresis.
2. `Sim::substep`, source loop immediately after `let add`: add the negative-strength branch from
   this patch. Before removing water, **also set `self.dold[i] = d0` when `game` is true**, as the switch's
   positive-source branch does. Preserve source/cell iteration and arithmetic order. A sink removes its
   own kind via `(C*d0 + contamination*add)/(d0+add)`, clamps contamination to [0,1], floors depth at 0,
   and clears contamination when dry.
3. Keep the seep cap in `src/core/sim/prefill.ts` `flowThrough`/`prefill`; both Wasm and native canonical
   water receive that prefill. Do not replace the switch's sealed-water/retained-water work with old parity code.
4. Keep data-driven cells and the object's coordinate as the seep anchor in `sim/model.ts`;
   `sim/fluidTime.ts` supplies timeline strengths. The existing Rust protocol already carries signed
   strength, contamination and seep limits; no protocol change is needed. At a weather/countdown boundary,
   update the simulator's existing emitters from the function's model before the next run. Apply the
   existing badtide contamination curve separately; this function controls activation, not that curve.
5. Rebuild `src/core/sim/waterWasm.ts` with `npx tsx tools/rust/build.ts`, then `--check`. Rebuild any native
   binary with `--native`. Do not use this patch's pre-switch Wasm after adopting the switch.
6. Update `tests/unit/parity-water.test.ts`: the switch deletes waterRust.ts. Compare its WaterSim
   against the preserved TypeScript reference or Python under both rules; retain the sink and warm
   seep-start cases. This patch's exact Rust comparisons currently use port rules because that is dev's
   Rust engine. The game-rule TypeScript/Python checks already pass separately.

The drain's emitting tile, back wall, badtide-only strength and file orientation are represented.
Its roofed cell/direction limiter is already described by sim/columns.ts; the heightfield Rust protocol
cannot represent it. Exact water under roofs needs the stacked-column solver (ceiling and direction
constraints), not another footprint guess. Explosion land/object removal is volumetric; its water
re-settle uses today's heightfield engine and returns the roofed count.

## Preserve on adoption

Do not change generator defaults, regenerate resources after edits, or replay old operations with new
defaults. New BadwaterSource plans carry strength 3 explicitly; historical no-component placements
remain at 1. Scatter placement records the actual entities and IDs, so reopening does not scatter again.
The corrected seep golden entry was regenerated from Python; no other fixture or digest was re-pinned.

[PAGE.md](PAGE.md) is the complete handoff for controls and core calls; no interface is carried over.
