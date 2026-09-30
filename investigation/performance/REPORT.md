# Terrain in motion

**NOT READY; PR #107 remains draft.** Force base: `9e14f189`. Product source is untouched.

Inspection found 30 ms force scheduling, repeated GPU geometry/texture replacement,
16 eager water blends, sound beds waiting for keep, retained cancelled gestures and missed
waterfall refreshes across chunk boundaries. `adoption.patch` proposes frame-aligned showing,
buffer reuse, lazy identical blends, motion-ending sound release and the two cleanup fixes.
Improved smoothness has **not** been measured.

PC: Ryzen 7 9800X3D, 16 threads, 61.6 GiB RAM, RTX 4080 SUPER. During September 30's
**02:00–02:58:57 PDT** logging, 564 CPU samples ranged **0–100%, median 16%**; 272 were
≤15%. The longest consecutive sampled quiet stretch was **143.927 s**, at 02:51:14–02:53:38,
short of the required 300 s. **No interaction, capture or hour run started.**

The runner stopped at **02:59:02** after reserving the full hour last. This was a harness
scheduling gap: it should have continued qualifying shorter work until 04:00 when an hour
could no longer fit. That fallback is now fixed and tested. The final **61 minutes are
unobserved**; their load cannot be inferred. CPU causes were not logged in this wait phase.
`window-proof.json` records the results and raw-file hashes; `node window-summary.mjs` regenerates it.

| Qualified p99 / hitches, 128² and 256², Standard and High | Edge 154.0.4258.37 | Firefox 146.0.1 |
|---|---|---|
| Native PC | N/A: no qualified runs | N/A: no qualified runs |
| CPU-constrained proxy | N/A: no qualified runs | N/A: no qualified runs |

Both looks use pinned High renderer `84fe4d36` with force presentation additions in ignored
copies. Proxy: Windows job cap **625/10000** of total CPU, one logical CPU aggregate for the
isolated harness/browser/worker tree, affinity mask 15; GPU/RAM stay native. It is not a
second physical machine. Firefox's Long Tasks API is unavailable.

Verification: **25 adoption + 5 harness tests pass**, base and integrated application
typechecks pass, three computation worker bundles remain byte-identical. Earlier 128² Clean
functional pairs have **6/6** identical final snapshots and exact redo across both browsers.
Edge's proposed High/proxy smoke passed; Firefox's was interrupted before the window.
These are functional checks, not qualified timing evidence.

No qualified PNGs or PCM exist. Hitch counts and visible/audio glitch counts are **unknown**;
terrain seams, chunk popping, water contact/jumps, shadows/reflections, objects, flicker,
sound synchronization and crackle/dropouts remain unverified. GIF generation correctly refuses
missing paired captures. Earlier unqualified geometry flags and legacy PCM gaps are diagnostic
candidates, not confirmed glitches (`evidence.json`). `water-design.gif` is a schematic proposal.

**Separate interface finding:** Highlands, seed 4242, 128² Clean → Refine → Craterize,
Power 100 Fast → wait → Undo. Both builds in Edge/Firefox showed “Water flowing… 0%” while
the worker settled, the render queue emptied and checks said “Ready to play”. Leave this
readout for the interface pass after **“The page is the editor”**; it does not block this harness.

Remaining: all 320 scenario/configuration pairs with three before/after repeats (including
abuse), qualified captures/GIFs and visual/audio review, all 16 configurations' hour repetitions,
complete export-byte proof and measured budget calibration. Gate: **337 missing-evidence failures**.
`INTEGRATION.md` gives regeneration and the same mandatory gate for future forces.
