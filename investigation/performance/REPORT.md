# Terrain in motion

**NOT READY for adoption.** Base: `feature/forces` `9e14f189`. Product source is untouched.

Code inspection found 30 ms force scheduling, repeated GPU geometry/texture replacement,
16 eager water blends, sound beds waiting for the keep round-trip, retained cancellation IDs,
and waterfall ground reads crossing a chunk boundary that animated updates did not refresh.
`adoption.patch` proposes frame-aligned showing, buffer reuse, lazy byte-identical blends,
motion-ending sound release, cancellation cleanup and the missing two-tile refresh.
These are tested candidates; smoother playback has **not** been measured.

PC: Ryzen 7 9800X3D, 16 threads, 61.6 GiB accessible RAM, RTX 4080 SUPER.
The quiet gate refused the baseline: CPU **85–93%**, hottest GPU engine **3.18–3.87%**.
Latest five CPU samples were **100%**; one GPU sample was unavailable. No qualified timing
was collected, so no before/after hitch count or frame-time improvement is claimed.

| Qualified before → after p99 / hitches | Edge 154.0.4258.37 | Firefox 146.0.1 |
|---|---|---|
| Native PC, Standard/High, 128²/256² | Awaiting quiet window | Awaiting quiet window |
| CPU proxy, Standard/High, 128²/256² | Awaiting quiet window | Awaiting quiet window |

Prepared both looks from pinned High commit `84fe4d36`, integrated with force presentation
additions in ignored copies. Both browsers' proxy has a Windows job cap of **625/10000** total
CPU (one logical CPU aggregate), four-core affinity, native GPU/RAM; it includes the isolated
harness and browser/worker tree. It is not a second physical machine. Firefox lacks the Long Tasks API.

Verification: **25 adoption tests + 3 harness tests**, zero type errors, three byte-identical
computation bundles. Craterize Fast, largest Raise stroke and whole-map Select Raise on
128² Clean have **6/6** matching before/after final snapshots across both browsers,
including exact redo. These are single functional smoke runs, not timing certification.
The integrated application typecheck also passes; force-base palette tests target a different look
revision. Edge's proposed High/CPU-proxy smoke passed with exact redo; Firefox's smoke was interrupted
before the window to release resources and remains unverified.

An unqualified 256² diagnostic capture flagged 60,097 below-ground water surfaces and
1,048,182 target/queued-mesh mismatches; these can be depth-occluded and are **not confirmed
pixel glitches**. Queue lag and later-frame water floors need frame review. Two PCM capture
gaps likewise do not establish audible dropout: the old tap omitted silent input quanta.
The corrected tap preserves silence and true clock gaps. Details: `evidence.json`; raw files stay local.
The [water-contact GIF](water-design.gif) proposes a shared visual height field; it is a schematic.

**Interface finding, separately owned:** generate Highlands, seed 4242, 128² Clean; Refine;
Craterize Power 100 Fast; wait; Undo. Both builds in Edge and Firefox showed
“Water flowing… 0%” while `whenWaterSettles()` resolved, render queue was empty and checks
said “Ready to play”. It is untouched and excluded from the smoothness gate. Record this
for the interface pass after **“The page is the editor”**.

The **September 30, 02:00–04:00 PDT** runner is armed; its five-minute load qualification and
discard/retry log are in `local/window-status.json` and `local/window-load.jsonl`. `WINDOW.md` records
the plan and regeneration. No window timing is claimed until qualification completes.

Still required: three quiet repeats, High/CPU-proxy coverage, hour sessions, qualified
worst-case/abuse GIFs, pixel/audio review, export-byte proof and measured budgets.
`INTEGRATION.md` gives regeneration and the future-force gate.
