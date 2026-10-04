# Round 2 research notes

The accepted candidate and its measured results are identified by BASE.json and EVIDENCE.json after the complete gates. Trial JSONL and candidate builds stay under ignored local/. A faster trial is excluded whenever an outcome cell declines or a must-pass map fails.

Trials considered: early planned-outcome checks; re-planning a Canyon course on its shaped field; deeper initial Canyon courses; stronger adaptive hydrology; medium-basin outlet capacity; protecting the existing river course while choosing an outlet; exact pre-fill and settled mine reachability; reusing a prepared fallback start.

Excluded experiments included integer-terrain routing (outcome loss), broad adaptive hydrology (outcome loss), rejecting every suspect pre-fill story (many valid planned lakes read poorly until settled), and widening without considering the existing river course. A strict Canyon pre-fill screen improved outcomes but required more redraws. Outlet protection must influence route selection as well as which tiles may be cut; protecting a route after choosing it can leave insufficient capacity.

An option collision in the trial builder made early modes containing “twopass” also select two prepared starts. These trials are exploratory evidence with **two starts**, not isolated evidence about outlet shaping or a four-start adoption. The builder now matches the “two” token exactly. Qualifying gates, timings and browser evidence must be regenerated with the actual adoption source; earlier partial sweeps and timings are excluded. To reproduce an affected exploratory mode with the corrected builder, include the explicit “two” token.

A pure coordinate-lattice noise cache also passed exact FBM comparisons but was slower in five repeated microbenchmarks (median thread CPU 140 ms versus 94 ms). It is excluded; this does not estimate generation savings. The microbenchmark is noise-bench.mjs; raw results remain local/.

Run prototype.mjs with a named mode to regenerate a trial. GEN_ROUND2_CANDIDATE=local/<trial>-candidate puts it in isolated ignored files; pass the same value to matrix.mjs. Sources are substituted only in virtual builds. Use a fresh --prefix and retain its manifest. An interrupted or rejected trial never supplies an adoption timing claim.

The four-start preflight variant passed the outcome gates but delayed first land on suspected medium basins by doing a canonical settle before commitment. It is excluded from final timings and browser evidence. The accepted replacement preserves the original first-land boundary and tries gentler clean inflows into a rising basin after commitment, without changing terrain. Both 256² River Valley and Lake Basin retained their baseline shares over all 40 seeds with zero failures or changed shown tiles.

Adding one course replan to both themes reduced redraws but failed River Valley's quality gate (31/40 versus 32/40); Lake Basin qualified (24/40 versus 23/40, 63 versus 69 field redraws). The accepted candidate limits this extra plan to Lake Basin and the course-leaving failure. Raising the River Valley planned floor by 25% on planned-promise failures changed none of the 40 results, so that dormant mechanism is excluded. Protected outlet-routing trials also failed the outcome gates. No physical-solver or stopping-cap change is included.
