# Evidence and reproductions

P1 means a startup failure or wrong simulation after a helper failure. P2 means an API correctness or lifecycle defect with a narrower trigger. Tests compare raw typed-array bytes, including old depth; no tolerance or performance threshold is used.

## F1 — mutable public water is not synchronized (P2)

Smallest reproduction: [water.ts](water.ts), `edited()`: 3 × 9, two threads, one completed slice, then change a wet tile's public depth, contamination and outgoing flow before the next slice. Baseline depth is `0.19638331008568383`; the one-thread result is `0.19645045582892573`. Threaded strips keep their previous water instead of accepting the public edit. [occupancy.ts](occupancy.ts) also checks wet→dry and dry→wet, before first run / after a run, with / without a `Dold` read, and subsequent continuation: all eight candidate cases are byte-identical; baseline fails each case either immediately or on continuation.

The patch detects direct water edits, reconstructs single-thread bookkeeping from the last committed water, then copies the edit. It permanently keeps that instance single-threaded, because rebuilding occupancy can itself change the established one-thread bytes. It flushes adopted evaporation modifiers before an edit. Floor, emitter strength and weather-scale changes continue to use parallel water. This is a documented public-array contract defect; this investigation did not establish a current player gesture that mutates these arrays directly.

## F2 — exceptional dispatch bypasses fallback (P2)

Smallest reproduction: [water.ts](water.ts), `dispatchFailure()`: one mock helper acknowledges `hello` and throws from subsequent `postMessage`. Baseline throws to the caller, leaves the pool intact and does not compute the slice. Candidate terminates the helper and retries on one thread with the same bytes. Initialization and run dispatch happened outside the recovery `try`; failed free dispatch could also escape disposal. The patch guards hello/init/run/free and continues cleanup if termination throws.

This injects an exceptional `HelperPort` dispatch, not a claim that posting to every closed native MessagePort throws. The failure contract must still tolerate exceptions from helper creation/transport.

## F3 — final-barrier failure retries partially committed carry (P1)

Smallest reproduction: [failure.ts](failure.ts) and [commit-failure.mjs](commit-failure.mjs): 3 × 9, two real Rust strips, one seep with on/off hysteresis, first slice at scale 0.08, second slice fails at the final commit barrier after the coordinator has written its owned seep row. The helper sets the same shared error/generation signals as failure handling. Baseline depth, contamination and old depth differ from one thread, despite reporting fallback to one thread. Outgoing flow happens to match in this fixture.

The public water still holds the slice's starting state, but shared private carry no longer does. The patch keeps the previous old depth and seep bits in private memory and adopts that checkpoint for retry. An exiting helper cannot race that checkpoint. Candidate depth, contamination, out and old depth all match. This is controlled fault injection at the actual Rust/shared-memory commit boundary; it does not rely on a naturally occurring OS worker crash.

## F4 — partial helper startup aborts the editor (P1)

Smallest reproduction: [startup.test.ts](startup.test.ts): isolated supported browser globals, eight cores; first water worker starts, second Worker constructor throws `SecurityError`. `createGenerator()` throws on baseline and the first worker is not terminated. Candidate creates a usable generator with no water helpers and terminates the first worker. The patch catches optional water-pool construction failure and releases workers/ports already made. Existing one-thread water fallback byte tests pass.

## F5 — weather cancellation omits disposal (P2)

Smallest reproduction: [weather.test.ts](weather.test.ts): generated 64 × 64 river-valley map, two real helpers, start/cancel eight weather runs and drain queued callbacks using fake timers. Baseline explicitly disposes zero simulations and retains eight helper jobs; candidate disposes eight and retains zero. Cancellation returns from the asynchronous weather loop without freeing its Rust simulation. The return-water PreviewJob has the same missing cleanup on exit.

The patch wraps both phases in `try/finally`. Baseline objects can eventually be freed by FinalizationRegistry; this is delayed release and memory growth between collections, not evidence of an immortal leak. Wasm allocations are not normal JS heap pressure, so waiting for GC is unsuitable session cleanup.

## F6 — map switch/close retains a draft (P2)

Smallest reproduction: [close.test.ts](close.test.ts): open/refine a 64 × 64 map, start one draft stroke, allow its water job to start, then open another saved project or close the session. After queued work exits, baseline retains one helper job after either action; candidate retains zero. The global draft still owns the old map's PreviewJob. It remains reachable until a later draft action; this is not merely awaiting GC.

The patch gives opening and closing a shared disposal path: stop background water, release draft and force-water jobs, invalidate draft/weather tokens and clear stale force state. The regression directly establishes the draft retention; force-water cleanup is a related ownership correction from source inspection, not a separate observed finding.

## Attempts that came up clean

| Area | Correctness attempt and result |
| --- | --- |
| Threaded water | 128 size/thread fixtures, every requested thread count 1–16; 106 actually threaded, remaining cases legitimately capped/fell back. Widths 1, 7, 9, 17, 257, 512, 513; four-row and nondivisible strips, custom rectangles, dams, grouped sources and seeps. Every slice compares D/C/out/Dold/saturation; floor and strength change between slices; scales 1/0/0.35/1. No additional parity defect. |
| Helper fallback | Spawn denied, never ready and failure during run all use one thread with identical D/C/out/Dold. Exceptional dispatch and final commit are the distinct failures above. |
| Explicit simulation disposal | 40 replacements cycling 256/257 dimensions: every disposed helper job count is zero, water bytes match, main/helper Wasm memory reaches the same plateau after all shapes have warmed. This bounded test does not prove indefinite session memory behavior. |
| Wet-list shortcut/layout | Eight direct RustStrip sync variants: full/interior strips, game/port rules, unchanged/changed occupancy with changed depth/C/out/Dold (including signed zero). Compare with a rebuilt engine through eight further ticks: identical bytes. Native water-speed and stacked tests: 13 pass. No skip/layout defect found. |
| Force hoists/reused playback | Compare current force implementations with their six files before `4c28a6ed` (#289). 249 comparisons include Floor, working area/layer mask, each playback frame, final map, another seed and repeat on previously changed land; 34 matching refusals. Every successful frame/final typed-array byte digest matches. Deposit was not part of this adoption and is excluded. Existing force Floor/area/escape/operations/gaps contracts cover restoration and undo. No force-adoption defect found. |
| Browser isolation | Actual sw.js/isolation.ts on a local server without native isolation headers: Chromium and Firefox isolate after one reload (two navigations total); WebKit and Firefox with SW disabled remain one-thread. Explicit SW-blocked Chromium also remains one-thread. All browser water bytes match. |
| New deploy/resources | Version 1→2 fetches new bytes after update/reload in all four engines/configurations; no first-visit reload loop. Same-origin Gallery-like JSON/SVG and CORS fixture work. `/roadmap/` is outside isolation and can fetch the outside fixture. Source scan found Real places fetching same-origin data and no remote font dependency. This tests the SW's resource behavior, not a full production-deployment crawl or a third-party endpoint availability claim. |
| Firefox private | A Firefox private launch was attempted, but Playwright's created automation page still exposed SW and became isolated. Its bytes match; native private-window fallback is **not certified**. The explicitly SW-disabled Firefox test does certify that blocked-isolation path. |

Candidate validation: typecheck; three finding-specific Vitest regressions; the 128-case water matrix, eight occupancy/continuation cases and final-commit fault regression. Focused existing water/weather/force cancellation/live-water suites: 100 tests pass. Baseline focused suites: 107 tests; native water/stacked: 13. Standard test-runner durations are incidental output, not collected speed measurements or gates. No Timberborn probe, benchmark or GitHub PR review was run.

Reasonable calls: events arriving while a worker's synchronous slice runs are exercised at the next event-loop/slice boundary, through model/scale edits and session cancellation tests. A worker cannot process an editor message halfway through its synchronous JS call. No exhaustive map-size, arbitrary-depth, browser-native private-window or overnight soak claim is made. All numerical fixes preserve one-thread truth rather than changing its physics or Wasm binary.
