- F1 / P2: public water-state edits lose byte identity; fixed in adoption.patch (edited instances stay single-threaded).
- F2 / P2: exceptional helper dispatch escapes fallback; fixed in adoption.patch.
- F3 / P1: helper failure during final commit corrupts retry carry; fixed in adoption.patch.
- F4 / P1: denied helper construction aborts generator startup and strands earlier helpers; fixed in adoption.patch.
- F5 / P2: cancelled weather retains helper jobs until garbage collection; fixed in adoption.patch.
- F6 / P2: map switch/close retains a paused draft water job; fixed in adoption.patch.
- Service worker/isolation: no defect found in deploy, first-visit, resource and fallback checks; native Firefox private-window coverage is incomplete.
- Water wet-list/layout and force hoists: no defect found in direct Rust sync and pre-adoption playback byte comparisons.

Base: dev `790f8da1d3db73b2c4edf11c8cc7c58de49c4b8c`. Product files are unchanged. All six fixes are proposals in the [adoption patch](adoption.patch), verified in an ignored copy; none has been applied to this branch's product.

[DETAILS.md](DETAILS.md) contains severity, smallest reproductions, evidence and coverage limits. [INTEGRATION.md](INTEGRATION.md) contains adoption and rerun instructions. Each finding has a runnable regression here. Bulk evidence, browser archives and candidate source remain in ignored `local/` (D195).
