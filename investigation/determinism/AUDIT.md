# Audit at 32aee5cf

`AUDIT.tsv` is the complete AST inventory: 1,930 relevant sites in core, worker and editor,
including 360 native approximate functions or exponentiations, 117 sorts and 51 reductions.
`node audit.mjs` regenerates it; comments do not count as calls. Not every site changes a map.

| Path | Finding | Decision |
| --- | --- | --- |
| `core/math/detmath.ts`, `rng.ts`, `hash.ts` | Existing sine/cosine/exp polynomials, integer seeded streams and hashed IDs already have fixed evaluation order. | Reuse them; preserve their results. |
| `core/land/{field,genome,hydro,intentions,levels}.ts`, `gen/` | Many square roots; `genome.ts:746` uses native `log2` for reserve settings. Terrain processes, drainage and settling feed later placement. | Replace approximate math, including `sqrt`; default-theme samples cannot exercise every setting. |
| `core/features/{geometry,route,setpieces,raster/terrain}.ts`, `doc/{tools,placing}.ts` | Native distances affect raster bounds, arc positions, object fit and placement decisions. | Use the same math helpers as forces. |
| `core/features/raster/brush.ts:192` | Brush falloff is integer arithmetic on squared quarter-tile distances. Naturalize uses seeded integer noise; neighbour visits and dab order are fixed. | Keep its arithmetic/order. Test soft, target, square and long strokes through the session. |
| `core/forces/carve/` | Native sin/cos/atan/atan2/hypot/pow/sqrt affect headings, course, widths, necks and bank cuts. | Replace all, including `**` expressions. Integer exponents also have implementation-approximated semantics in JS. |
| `core/forces/{craterize,erupt,quake}.ts`, `glaciate/`, `path.ts`, `result.ts` | Native trig, exp, fractional powers and distances affect shape, route, flow and fallen directions. Quantizing terrain and rounding operation directions often hides low-bit differences. | Compare raw state and the persisted result separately; do not use rounding as a determinism fix. |
| `core/sim/{water,prefill,moisture,contamination,model}.ts` | Water uses row/tile/direction loops and sequential reductions. Prefill visits emitters in entity order. No unseeded random or approximate functions in the solver. | Keep this order; never parallelize/reassociate sums without proving equivalence. |
| `core/sim/weather.ts:37` | Badtide forcing uses native exp; contamination can enter the otherwise deterministic solver. | Replace the forcing too. Fixed tick inputs are required; wall-clock previews are not identical operation inputs. |
| `core/features/raster/resources.ts:86` | Species keys are sorted before weights and seeded per-tile draws. Resource order and tie keys are explicit. | Preserve ordering; no change proposed. |
| `core/math/grid.ts:76` | MinHeap ties break by tile index. Other arrays/typed arrays sort numerically or lexicographically with stable equal groups. | Equal scores alone are not a cross-engine bug: modern JS requires stable sort. |
| `core/gen/weir.ts:39` | ID comparator returns +1 even when IDs equal. It is not reflexive; sort's consistency contract is violated. | Return 0 on equality. Different valid IDs keep exactly the same ordering. |
| `core/forces/quake.ts:402`, `gen/generate.ts:816`, other score sorts in TSV | Some equal scores rely on original input order. Inputs are deterministic arrays, so stable sort preserves it. | Retain original-index ties. Sorting instead by ID would change collision winners and need a re-pin. |
| Maps, Sets, object enumeration throughout TSV | JS defines Map/Set insertion order and own-property enumeration order; these are not unordered collections. No localeCompare calls found in the audited paths. | Keep feature/entity/operation insertion order as protocol data. Never assume separately assembled collections have the same order. |
| `core/forces/runs.ts`, `glaciate/run.ts`, `carve/play.ts`, `worker/session.ts` | Clock budgets split planning, but do not choose the plan. Staged `steps` includes the number of planning calls; worker stores it at `session.ts:2469`. Early skip and normal completion can store different counts. | Persist deterministic `r.total`, not planning-call count. Test exaggerated clock budgets. Carve's physics steps are fixed, distinct from these planning calls. |
| `worker/session.ts:1450,1657,1666,2115,2125`, `editor/features.ts:526` | UUIDs for newly placed objects, starts and Carve sources. | Existing replay is safe because IDs are in the operation. Collaborative gestures need one agreed operation identity, then derived IDs. |
| `editor/brushes.ts:582`, `Editor.tsx:1511,1542` | Naturalize's initial seed is sampled with Math.random. | Record/broadcast that seed before execution, as current brush operations do. Do not independently sample on peers. |
| `editor/{Editor,brushes}.tsx/.ts` | Native distances decide tap/drag classification, path resampling and dab spacing. Pointer event timing, coalescing and 3D picking can also differ. These construct the operation; replay consumes its recorded coordinates/dabs. | Host sends normalized world-coordinate gestures and the selected mode, or the completed brush operation. If peers repeat gesture-to-op conversion, move its geometry to core and use portable math. Never replay raw screen/pointer events independently. |
| `editor/juice/` | Random sound/effect variation is presentation only. | Leave it out of the deterministic state. |
| `core/format/{json,timber}.ts`, JPEG vendor | Number formatting and property order are explicit. ZIP timestamps are overwritten from a fixed map timestamp; JPEG clocks measure duration only. | Hash actual `.timber` bytes too. Do not hash UI timings or unrelated project metadata. |

Same input means identical ordered features/entities/operations, terrain, retained water, source state,
force settings, seed, keep mask and gesture coordinates. An equal visible surface with different hidden
rock, water momentum or raw object data is insufficient. A future collaboration protocol must also
agree which water snapshot a gesture reads; asynchronously sampled preview water is not shared input.

The language permits approximate [Math functions](https://tc39.es/ecma262/multipage/numbers-and-dates.html#sec-math.sqrt)
and [exponentiation](https://tc39.es/ecma262/multipage/ecmascript-data-types-and-values.html#sec-numeric-types-number-exponentiate).
[Stable sort](https://tc39.es/ecma262/multipage/indexed-collections.html#sec-array.prototype.sort) and
insertion order have defined semantics. WebAssembly's [floating-point rules](https://webassembly.github.io/spec/core/exec/numerics.html#op-fsqrt)
provide correctly rounded square root; NaN payloads are deliberately excluded from map state.
