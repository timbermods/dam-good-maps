# Terrain in motion

**September 30 morning window complete; PR #107 remains draft. No run qualified.**
Product source is untouched, based on `feature/forces` `9e14f189`.

07:40–09:40 PDT: **27 attempts; four refused qualification, 22 CPU-discarded, one cancelled
before measurement**. Twenty-two passed a 60.05–65.42 s quiet prefix (CPU 1–25%) before
measured CPU rose to 28–100%; sampled unrelated CPU at abort was only 0.38–4.14%.
385 dispatch samples: 0–45%, median 12%. Total CPU and per-process samples use different
intervals; their discrepancy is unresolved. Other agents are not an established cause.
The controller finished at 09:40:00; no late measurements were taken.

| Standard **and** High, 256² | Qualified timing pairs | Qualified capture pairs | Qualified p99 / hitches |
|---|---:|---:|---|
| Edge/native, three repeats | 0/72 | 0/24 | unavailable |
| Firefox/native, one pass | 0/24 | 0/24 | unavailable |
| Edge/CPU proxy, one pass | 0/24 | 0/24 | unavailable |

Every force at Power 100 in Fast/Watch, brush and abuse remain unqualified in both looks.
The full hour is **0/1**: two measured native attempts failed at 55%/35%; three proxy attempts
failed at 28%/32%/30%, during their introductory brush, before the hour loop. The single hour
was moved to the proxy explicitly; it was never shortened. Firefox, High core captures,
abuse and all after captures did not run: first-case retries starved the queue.

PC: Ryzen 7 9800X3D, 16 threads, 61.6 GiB RAM, RTX 4080 SUPER; Edge 154.
Proxy: Windows job CPU cap 625/10000, aggregate one logical CPU, four-core affinity;
native GPU/RAM, not a second physical machine. High fixture is pinned at `84fe4d36`.

Discarded diagnostics contain **628 hitches, all causally unattributed**, and 127 long tasks.
614 hitches overlap renderer/update calls; overlap is not proof. The worst frame was
1000.7 ms while its overlapping render call took 0.6 ms. Visibility was not recorded,
so background throttling remains a hypothesis. Every event is retained by `morning-audit.mjs`.

All **3,926 PNGs** were decoded and compared; selected full-resolution frames and the change
contact sheet were inspected. In the 16:19 UTC Standard recording, frames 4→5 show an abrupt
crater and stepped water bands: land changes by 12 and water by 5.27 over 990 ms.
This recorded pop is confirmed; normal-playback causality is unverified. Water geometry flags
are candidates, not pixel-proven hovering/penetration. Qualified seams/holes, chunk popping,
water contact/continuity, lighting/reflections, object following and flicker checks remain unverified.

PCM analysis covers **161.35 s in 17 files**: 18 timestamp gaps and nine overlaps, not verified
audible dropouts. Legacy streams lack context IDs; overlapping streams cannot be converted
faithfully. Sound synchronization, ending, crackle and dropout checks remain unverified.
No qualified GIF pair exists; generation refuses. A labelled before-only diagnostic GIF is local.

`adoption.patch` proposes frame scheduling, GPU-buffer reuse, lazy water blends, sound release
and waterfall refreshes. Improvement is unproved. Harness fixes preserve warm-up waits, catch
abort drain failures, rotate retries, label PCM contexts and record visibility. **37 tests pass**,
both typechecks pass, three computation bundles are byte-identical, patch/diff checks pass.
The core gate reports **218 failures/missing evidence**. Export-byte proof and calibration remain.

**Separate interface finding:** Highlands 4242 → Craterize Power 100 Fast → wait → Undo:
both builds show “Water flowing… 0%” despite settled worker, empty queue and “Ready to play”.
Untouched and nonblocking; interface lifecycle/status belongs after **“The page is the editor”**.

`INTEGRATION.md` gives regeneration and the mandatory gate for future forces. The current
per-case quiet waits alone require 384 minutes plus the hour; batching needs resolution before
another two-hour window. Budgets have not been relaxed. The one-window recurrence is stopped.

**Next authorized window:** 10:30–13:30 PDT. Continuous qualification now replaces the 384 minutes of per-case waiting: qualify once, retain sampling across cases, requalify only after a load-discarded case. All scaled coverage and budgets remain. Eleven harness regressions pass; the morning's zero qualified result is unchanged.
