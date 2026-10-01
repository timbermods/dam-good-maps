# Terrain in motion

**Method revised September 30 evening; no new qualified browser measurements yet.**
Gate on outside-process CPU only (≤25% for 60 seconds once, then continuous sampling), excluding
the harness/browser tree; retain top outside processes on discards. Native comparisons now use
median and worst of five fixed repeats. Firefox leaves the core gate until its Top-down setup
works reliably; timeout/WebGL loss are observed, root cause unproved. New core: **144 timing
pairs, 48 capture pairs, one hour**; none yet collected with this protocol. **42 tests pass**;
sampler ownership exclusion passes a two-sample functional check (not performance evidence).
The revised core gate reports **146 failures/missing evidence**.
October 1 **02:00–05:00 PDT**: Craterize Power 100 Fast, 256², both looks, five paired repeats.
Stop on any unqualified trial run; otherwise start the full proxy/High hour immediately,
then remaining core work. Historical evidence below keeps its original policy and invalid status.

**September 30 afternoon complete; PR #107 stays draft. No qualified comparison exists.**
Product source is untouched; adoption is based on `feature/forces` `9e14f189`.

10:30–13:30 PDT: **57 attempts: 44 CPU-discarded, 13 Firefox setup failures**. Continuous
telemetry: 1,851 in-window samples, CPU **1–85%, median 15%**; unrelated CPU 0.10–32.34%,
median 3.78%. All **45 qualification generations** passed 60.18–65.29 seconds at ≤25%;
requalification followed discards. No invalid samples or gaps over 30 seconds. Total CPU and
process estimates use different intervals; the discrepancy is unresolved. Other agents are
not an established cause. Cleanup finished **13:29:45**; no duplicate or late measurements.

| 256² configuration | Qualified timing pairs | Capture pairs | Discarded active CPU | Qualified p99/hitches |
|---|---:|---:|---:|---|
| Edge/native Standard | 0/36 | 0/12 | 12–84% | unavailable |
| Edge/native High | 0/36 | 0/12 | 7–85% | unavailable |
| Firefox/native Standard | 0/12 | 0/12 | 23–68% | unavailable |
| Firefox/native High | 0/12 | 0/12 | no active interval | unavailable |
| Edge/CPU proxy Standard | 0/12 | 0/12 | 23–56% | unavailable |
| Edge/CPU proxy High | 0/12 | 0/12 | 13–45% | unavailable |

Missing: **all 240 timing executions, 144 captures, one hour**. Craterize Fast reached every
configuration; brush reached Edge/native and Firefox/Standard. Other forces, Watch and abuse
never reached measurement. Firefox stalled waiting for a stable “Top-down” button; deadline
logs also show probe timeout and WebGL context loss, with cause unproved. The hour went first
on **Edge/proxy/High**, retried twice, discarded at **32%, 36%, 40% CPU** during its introductory
brush, before the hour loop. Never shortened. [afternoon-proof.json](afternoon-proof.json)
lists every failed attempt and missing phase/repeat. Morning evidence remains frozen and invalid.

PC: Ryzen 7 9800X3D, 16 threads, 61.6 GiB RAM, RTX 4080 SUPER; Edge 154, Firefox 146.0.1.
Proxy: Windows job cap 625/10000, one logical CPU aggregate, affinity 15 (four logical CPUs),
native GPU/RAM; no physical laptop. High fixture: `84fe4d36`.

Discarded diagnostics: **709 hitches, all causally unattributed**, 277 Edge long tasks; Firefox
Long Tasks unavailable. Fifteen hitches have no method overlap. Worst: **1,043.1 ms in a proxy
capture**; capture overhead is not pacing. Every event is retained in `local/afternoon-hitches/`.

All **1,251 full-resolution PNGs** decoded/compared; 13 change sheets and selected originals
inspected. High Craterize Fast visibly jumps **12 land levels in both builds**, over 78.2/71.2 ms.
This recorded pop is confirmed; normal-playback causality is unverified. The bright disk afterward
is the coded impact flash. Brush preview rectangles and water geometry flags remain candidates.
Morning's recorded stepped-water pop remains documented. Qualified holes/seams, chunk popping,
water contact/continuity, shadows/reflections, object following and flicker remain unverified.

PCM: **49.024 seconds, 13 labelled streams**, converted separately; five timestamp gaps
(96 ms total), no overlaps, nonfinite samples or clipping. Tap gaps are not verified audible
dropouts. Audible crackle/dropout, motion synchronization and sound ending remain unverified.
**No qualified GIF pair exists**; generation refuses. [afternoon-review.json](afternoon-review.json)
records inspection limits.

`adoption.patch`: frame scheduling, GPU-buffer reuse, lazy water blends, sound release and
shore/fall refreshes; improvement unproved. **39 tests**, both typechecks, patch and worker-byte
checks pass. Three discarded brush undo/redo sets match across builds; export-byte proof is
missing. Gate: **218 failures/missing evidence**. Calibration lacks three quiet baselines;
budgets stay provisional.

**Separate interface finding:** Highlands 4242 → Craterize Power 100 Fast → settle → Undo:
both builds show “Water flowing… 0%” despite settled worker, empty queue and “Ready to play”.
Untouched/nonblocking; status/interface lifecycle belong after **“The page is the editor”**.
`INTEGRATION.md` gives offline regeneration and future-force requirements. This one-window
follow-up stops; further measurements need another authorized window.
