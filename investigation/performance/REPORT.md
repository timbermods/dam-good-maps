# Terrain in motion

**October 1 complete; PR #107 stays draft. Qualification works; smoothness fails.**
Product source is untouched. The adoption patch (frame scheduling, buffer reuse, lazy water
blends, sound release, shore/fall refreshes) is **not ready to adopt**.

02:00–05:00 PDT: started 02:01:57, cleanup finished 04:59:45; no late measurements.
Trial qualified 20/20 executions. All 72 manifests audited: **67 qualified**, two outside-load
discards, two harness heap failures, one deadline abort. This gives **25/144 timing pairs,
6/48 capture pairs, one full hour**. Three quiet prefixes passed 60.565/64.731/66.023 seconds;
full trace/bracketing, hashes and foreground checked. [overnight-proof.json](overnight-proof.json)
records exact missing phases/repeats and every run's load.

PC: Ryzen 7 9800X3D, 16 threads, 61.6 GiB RAM, RTX 4080 SUPER; Edge 154.0.4258.48.
Proxy: Windows job cap 625/10000 (one logical CPU aggregate), affinity 15/four logical CPUs,
native GPU/RAM; **not a physical laptop**. High fixture `84fe4d36`. Across 1,525 continuous
samples: other CPU 0–32.35%, median 1.36%; total CPU 0–100%, median 34%; no >30-second gaps.
Only outside CPU rejects runs. Qualified short-work load below is min/median/max.

| Configuration | Timing pairs | Captures | Other CPU % | Total CPU % |
|---|---:|---:|---|---|
| Edge/native Standard | 11/60 | 2/12 | 0/1.66/12.81 | 4/33/93 |
| Edge/native High | 10/60 | 2/12 | 0.19/1.65/15.56 | 2/29/81 |
| Edge/proxy Standard | 2/12 | 1/12 | 0/1.56/17.44 | 11/34/88 |
| Edge/proxy High | 2/12 | 1/12 | 0.10/1.16/5.04 | 18/52/88 |

Native **fixed repeats 1–5**, median/worst before → proposal; capture overhead excluded:

| 256² Power100 case | p99 ms | Hitches/run | Worst frame ms |
|---|---|---|---|
| Standard Craterize Fast | 8.7/8.7 → 8.7/8.8 | 12/15 → 10/10 | 71.1 → 61.8 |
| High Craterize Fast | 8.7/8.8 → 8.7/8.7 | 13/14 → 11/13 | 102.0 → 99.3 |
| Standard large brush | 38.0/46.0 → 38.8/76.0 | 51/55 → 51/62 | 2759.6 → 4154.9 |
| High large brush | 68.1/75.6 → 69.2/70.9 | 53/64 → 56/59 | 3838.8 → 8050.4 |

Proxy **one pass**: Craterize p99 Standard 381.7→379.9 ms, High 396.5→387.4;
brush Standard 400.3→390.5, High 398.2→391.9. Hitches respectively 93→107, 123→104,
212→189, 215→171; no five-run certainty. Standard/native abuse pair 1: p99 24.0→33.8 ms,
hitches 40→43, worst 5295.6→1283.2 ms. Before repeat 2 qualified (23.7 ms/41 hitches);
after 2 hit cleanup, repeats 3–5 missing. Qualified short timings: **2,633 hitches/531 long tasks**.
Every hitch remains causally unattributed; method overlap is context only. All events are retained
in `local/overnight-hitches/`. Improvement is unconvincing; brush worst cases regress.

Hour retry: **3,613.4 seconds**, 121 edits, 43 raw chunks recomputed: 8,226 hitches/1,660 tasks.
Matched brush references: p99 388.6→384.7 ms, hitches 142→134; geometries 223→236,
textures 15→16; private memory **576.4→1046.9 MB (+81.6%)**. Other CPU 0–12.84%, median
0.96%; total 0–97%, median 35%. All 192,917 streamed frames visible/focused. Budgets fail;
memory-growth cause is unproved. The final reference discards about **57.61 seconds** of
remaining mixed-edit events; the hour elapsed, but complete event coverage is unverified.

First hour discarded at 02:25:19, outside CPU **32.35%**: chrome PID36236 13.31%, ChatGPT
PID30744 12.82%, chrome PID35568 2.04%. Standard before capture discarded at 02:27:22,
**26.85%**: chrome PID10664 13.47%, chrome PID36236 7.70%, claude PID1696 2.41%.
Top-15 lists retained; process overlap does not establish hitch causality. Proxy brush captures
(Standard/after, High/before) exited 134; logs prove Node heap exhaustion near 4 GiB.
Their unfinished manifests are invalid.

All **15,860 PNGs** decoded/compared; 18 change sheets and 14 full-resolution originals inspected.
Pixel-confirmed Craterize pops persist: High/native before/after across 88.3/93.1 ms;
Standard/proxy across 314.5/83.3 ms. Abuse shows terrain/water jumps across 59.9/206.5 ms.
Ordinary-playback causality remains unproved. Later impact flash/brush preview planes are
intentional. **15,141,826 qualified geometry flags are repeated candidates, not confirmed glitches.**
Six qualified GIF pairs cover both looks, abuse and brushes, using actual frame timestamps;
media stays ignored locally. [overnight-review.json](overnight-review.json) gives inspection limits.

Qualified PCM: **757.883 seconds/15 labelled streams**; no nonfinite samples or clipping observed.
Eight qualified WAVs converted, seven refused overlapping blocks (18 overlaps); sixteen tap gaps
are not proved audible dropouts. Waveforms do not certify listening. Exhaustive holes/seams/chunks,
water contact/continuity, shadows/lighting/reflections, object following and flicker remain unverified;
so do audible crackle/dropout, motion synchronization and ≤150 ms held release.

**Bytes:** 29/31 paired final snapshots match; both abuse timing/capture pairs differ.
Timing abuse changes 183 height bytes, water count 11959→11942, entities 3679→3680.
Timed interruptions can select different edits; cause is unproved, so identity blocks adoption.
Actual redo checks and all 15 completed capture digests match. Complete export-byte proof is
missing; worker equality cannot substitute. [overnight-validation.json](overnight-validation.json)
records actual differences.

Remaining: **237 timing executions/81 captures**: Carve, Quake, Erupt, Glaciate both speeds,
Craterize Watch, remaining abuse, missing capture phases. Firefox deferred: 13 prior stable
Top-down setup stalls; probe timeout/WebGL loss observed, root cause unproved. Optional full gaps
are nonblocking. **42 tests**, both typechecks, patch and worker-byte checks pass; gate reports
**170 failures/missing checks**. Budgets stay provisional with measured fingerprint preserved;
calibration cannot hide faults. INTEGRATION.md gives regeneration/future-force requirements.

**Separate interface finding:** Highlands 4242 → Craterize Power100 Fast → settle → Undo:
both builds show “Water flowing… 0%” despite settled worker, empty queue and “Ready to play”.
Untouched/nonblocking; status/lifecycle belong after **“The page is the editor”**.
Automation pauses; no new window assumed.
