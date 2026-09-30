# Terrain in motion

**September 30 07:40–09:40 PDT window running; PR #107 stays draft pending evidence.**
Force base: `9e14f189`; product source is untouched.

The core covers 256², every force at full Power in Fast and Watch, a large brush stroke and
abuse, in High and Standard. Edge/native gets three before/after timing repeats; Firefox/native
and Edge/CPU proxy get one each: **72 case/configuration requirements, 120 paired repetitions**.
Visual/audio captures get one paired pass per case/configuration. Only **one hour session**
is required, on Edge/native/High. The larger 128²/Select/camera/cross-product suite stays optional
with `--suite=full`; it does not multiply required hours.

Qualification now requires **CPU ≤25% for 60 sampled seconds before every run**. A CPU spike
or missing telemetry invalidates the attempt; the window runner qualifies afresh and repeats it.
Frame, glitch, sound and final-byte targets are unchanged. Missing evidence still fails the gate.

PC: Ryzen 7 9800X3D, 16 threads, 61.6 GiB RAM, RTX 4080 SUPER. Proxy: Windows job cap
625/10000 of total CPU, one logical CPU aggregate for the harness/browser/worker tree,
four-core affinity; native GPU/RAM. This is a CPU proxy rather than a second physical machine.
Both looks use pinned renderer `84fe4d36` with force presentation additions in ignored copies.

| Qualified p99 / hitches, both looks | Edge | Firefox |
|---|---|---|
| Native PC | N/A | N/A |
| CPU proxy | N/A | Optional full mode |

Historical September 30 logging used the original **15%/five-minute rule**: 564 samples,
CPU 0–100%, median 16%, longest quiet stretch 143.927 s. No run qualified. The runner stopped
at 02:59, leaving the final 61 minutes unobserved; that scheduling fallback is repaired.
Those samples have not been recertified under the new policy (`window-proof.json`).

Inspection found 30 ms force scheduling, replaced GPU buffers, eager water blends, delayed
sound release, retained cancellation IDs and missed waterfall refreshes across chunks.
`adoption.patch` proposes presentation fixes. Improved smoothness remains unmeasured.
**25 adoption + seven harness tests pass**; typechecks pass and three computation bundles are
byte-identical. Earlier functional pairs matched final snapshots and redo; these are not timing proof.

No qualified captures or PCM exist. Seams, water contact/jumps, object motion, flicker,
sound synchronization and crackle/dropouts remain unverified; GIF generation refuses missing
pairs. Earlier diagnostic candidates are indexed in `evidence.json`. Firefox reports its missing
Long Tasks API as unavailable; its required compatibility pass still checks frame pacing, bytes
and visual/audio quality. Edge supplies the primary task oracle.

**Separate interface finding:** Highlands seed 4242, 128² Clean → Refine → Craterize,
Power 100 Fast → wait → Undo. Both builds in Edge/Firefox showed “Water flowing… 0%” while
the worker settled, the render queue emptied and checks said “Ready to play”. It is untouched,
nonblocking, and belongs to the interface pass after **“The page is the editor”**.

The morning runner starts the hour first, then paired shorter work across both looks/platforms.
Four initial attempts refused qualification without recording frames. Startup spikes now reset
the quiet minute without restarting the warmed browser; all waiting load samples are retained.
The 09:40 follow-up will replace this interim status with actual qualified coverage and numbers.
Remaining: core measurements and captures, visual/audio review and GIFs, the hour, export-byte
proof and budget calibration. Measurements end at 09:40 PDT.
`INTEGRATION.md` gives regeneration and the mandatory core gate for future forces.
