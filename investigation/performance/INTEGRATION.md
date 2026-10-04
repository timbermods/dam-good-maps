# Adoption contract

## Round 3: released large brush

Latest `dev` (`546fe9fa`) was merged into this branch (`92142148`). Product files match
release `e5a6bf35`. Product source remains read-only. Standard uses that release directly.
High is **unreleased**: `brush-look.mjs` integrates pinned presentation `84fe4d36` with
the current renderer in ignored files, retaining released editor/computation/workers.
Six explicit renderer conflict resolutions are guarded; fixture hashes are recorded.

`brush-adoption.patch` is a **one-file allocation experiment, not approved for adoption**.
It changes only `src/render3d/waterMesh.ts`: reusable typed vertex/index scratch buffers,
independently owned output arrays, exceptional scratch discarded above 8,192 quads.
Topology, easing, update order, sound and settle computation are unchanged.
The earlier broad `adoption.patch` below is **rejected round 2 history; do not apply it**.

Regenerate round 3 from this directory, Node 24 and the existing lockfiles:

```powershell
node brush-look.mjs
node brush-adoption.mjs
node brush-build.mjs before standard
node brush-build.mjs before high
node brush-build.mjs after standard
node brush-build.mjs after high
node ../../node_modules/vitest/vitest.mjs run --config brush-vitest.config.ts
node brush-typecheck.mjs
node brush-typecheck.mjs --high
node brush-run.mjs --profileCPU=true --history=true --look=standard
node brush-run.mjs --profileCPU=true --history=true --look=high
node brush-series.mjs before
node brush-series.mjs after
node brush-status.mjs
node gate.mjs --brush
node brush-profile-index.mjs
```

Timing requires five before and five after repeats **on both profiles** in both looks.
Each fresh browser runs Highlands 4242, 256², Raise Size 128, the same 16-move sweep,
then undo/redo; separate stage markers prevent attributing history pauses to painting.
No other force, abuse or hour measurements belong to this round. The existing optional
full suite remains available in the historical harness for later work.
Qualify unrelated CPU ≤25% for 60 seconds once, then sample continuously. A load-discarded
case resets qualification and repeats; 15 minutes without requalification stops the series.
Do not replace the five fixed repeats with faster runs. Profiles are diagnostic, excluded
from timing medians. The CPU proxy is the same one-logical-CPU Windows job quota and
four-logical-core affinity, with native GPU/RAM; it is not a physical laptop.

All raw traces/profiles, per-frame timings, snapshots, actual `.timber` exports, geometry
hashes, process ownership/load traces and frozen protocol copies stay ignored in
`local/round3/` and the referenced `local/sessions/`. `brush-audit.mjs` regenerates the
compact `brush-proof.json` without launching a browser. Frozen protocol must match
the current protocol; explicit browser start/end bounds must be enclosed by load samples.
Retries have unique attempt filenames. Earlier round 3 diagnostics lack complete bounds
and are excluded: all 40 timing executions remain required. For each profiler folder run
`node brush-profile.mjs local/round3/runs/<folder>` to regenerate task/stack attribution.
`node brush-profile-index.mjs` binds the compact `brush-attribution.json` to full ignored
raw profiles and lists every profiled hitch. The profiler aligns clocks from multiple independent task matches and reports elapsed **and thread
CPU time**. CPU sample fractions are estimates; residual waiting and unprofiled hitches
remain unattributed. Worker-bundle equality does not replace snapshot/export/geometry proof.

The focused gate requires all 20 pairs, every final snapshot/export/geometry byte equal,
after worst frame ≤50 ms and p99 ≤20 ms. Missing evidence fails. This threshold is a target,
not a claim that the old provisional broad budgets were calibrated. Failed or incomplete
evidence keeps PR #107 draft. Only the milestone session may adopt a successful patch.
Every later **Erode, Rift, Landslide, Meander and Deposit** must pass the same smoothness
harness before merging; force pops, long-session memory growth and abuse byte differences
remain separate next targets.

## Rejected round 2 history

This is an investigation, based on `feature/forces` at
`9e14f1895c386489928dda78f888fc79772ceef6`. Take only this investigation's commits.
The PR also carries the force branch's ancestors until they reach `dev`.

## Candidate

From the repository root, `git apply --check investigation/performance/adoption.patch` verifies
the patch. Apply it only in the milestone session. `adoption.mjs` generates exactly the changes
used by the **after** build, checked against unique source anchors. The patch touches only
`forceDriver.ts`, `waterPlayer.ts`, `juice.ts` and `render3d/renderer.ts`.

- Align force showing with display frames; retain planned Watch duration, steps and final worker result.
- Release held audio beds on the final land cue; retain existing click-free fades and effects tails.
- Create water's 16 ending blends on access; their bytes and exact final callback stay the same.
- Reuse equal-sized terrain/water GPU buffers and eruption textures; dispose changed topology together.
- Refresh shores/falls two tiles across chunk boundaries on animated terrain, as whole terrain updates do.
- Release cancelled gesture bookkeeping after its worker drop completes.

No renderer interpolation, water clipping/following policy, interface change or settle acceleration
is adopted here. `water-design.gif` illustrates the outstanding water contact choice. It is a
schematic, not footage. A shared visual height field must drive ground, shores, objects, picking,
shadows and both looks together before that choice can be implemented without seams.

## Reproduce

Use Node 24 and the repository lockfile, then install the separate harness lockfile:

```powershell
npm ci --no-audit --no-fund
cd investigation/performance
npm ci --no-audit --no-fund
node prepare-look.mjs 84fe4d363cabb958429c07c02fc6a25738a360f8
node build.mjs before
node build.mjs after
node test.mjs
node --test metrics.test.mjs audio-worklet.test.mjs window-policy.test.mjs coverage.test.mjs drain.test.mjs continuous-load.test.mjs trial-plan.test.mjs
python audio.test.py
node typecheck.mjs
node run.mjs --mode=smoke --phase=after --sizes=128 --looks=standard --cases=craterize-fast,brush-large --repeats=1
node run.mjs --suite=core --phase=before
node run.mjs --suite=core --phase=after
node run.mjs --suite=core --mode=capture --phase=before
node run.mjs --suite=core --mode=capture --phase=after
node run.mjs --phase=after --hour --repeats=1
python gifs.py
node gate.mjs
```

All build outputs, raw events, per-frame PNGs, output PCM, full byte snapshots, one-hour streams and
GIFs go to gitignored `local/`. `python audio.py <capture-audio.jsonl>` regenerates a mono WAV and
gap index; select `--context-id=context-N` for labelled contexts. Overlaps refuse conversion
before creating output. Legacy unlabelled overlaps remain unverified.
`python water-design.py` regenerates the small committed schematic. Python needs Pillow.

`node window-summary.mjs` regenerates the September 30 load/coverage proof from the retained
`local/windows/2026-09-30-0200/window-status.json` and its `window-load.jsonl`; hashes bind the compact committed index
to those raw files. This is a historical index, not a way to reconstruct unrecorded CPU load.
For a separately authorized future window, pass UTC bounds explicitly:
`node window.mjs --start=<UTC-ISO> --end=<UTC-ISO>`. Expired windows are refused.
The 60-second gate resets on busy/invalid samples or logging gaps while keeping the warmed browser
open. Full waiting telemetry is retained separately from the qualifying suffix. Measured spikes
invalidate the attempt. Short work continues until the deadline if qualification misses the
full-hour start. Use `--hour-first=true` when the authorized window requires the hour first;
otherwise it goes last. Each window needs explicit authorized bounds.

Install the harness's matching Firefox with `node node_modules/playwright/cli.js install firefox`,
or use `--firefox-path=<matching-executable>`. Installed Edge is launched through its `msedge`
channel, in a separate context; existing tabs/settings are untouched. Functional smoke checks use
headless browsers so other agents' windows cannot suspend them; timing/capture runs use headful
browsers. Browser version, GPU,
software rendering and viewport are recorded. The harness pins Playwright 1.58.2 because this
machine's cached Firefox is revision 1509; this is separate from the product dependencies.

The default **core** gate uses 256², Standard and High: every force at Power 100 using its
natural Auto size in Fast and Watch, the largest Raise stroke, and seeded abuse (interruptions,
ten rapid undos and successive forces). Undo/redo accompanies each case. Edge/native needs
five before/after timing repeats; Edge/CPU proxy needs one pass. Firefox is deferred from the
core gate: 13 afternoon setups stalled waiting for a stable Top-down button; probe timeout and
WebGL context loss were logged, but their cause is unproved. It stays in optional full mode
until setup is reliable. Core is 12 cases × four configurations: **48 requirements, 144 paired
timing repetitions**. There is
one paired visual/audio capture per case/configuration, separate from pacing so capture overhead
cannot masquerade as a frame-time result. The only required hour session is Edge/CPU-proxy/High,
256², after-build, with matched start/end references and the existing mixed-edit sequence.

The optional **full** suite retains 128²/256², all browser/profile combinations, three repeats,
seven large Select actions, and orbit/zoom during a force. It does not multiply hour sessions.
Use `--suite=full` on run.mjs and gate.mjs; missing full-suite evidence does not block the core gate.
For a selected configuration, `--repeats=1 --repeat-start=2` records one distinct repeat; matching
before/after repeat numbers pair the same seeded abuse. Valid repeats can accumulate across windows.
High and Standard use a read-only presentation integration of the pinned `feature/high-look`
commit `84fe4d363cabb958429c07c02fc6a25738a360f8` with force-base rendering additions. Before building,
run `node prepare-look.mjs 84fe4d363cabb958429c07c02fc6a25738a360f8`; the unique four renderer
conflicts are resolved in ignored copies by retaining both import/type declarations, High's
render hooks and material disposal, and force-effect disposal. `look-source.json` binds the files.
This integration is only a comparison fixture, not another adoption patch or a branch merge.
Both browsers' laptop profile uses a Windows job hard cap of **625/10000 of total CPU capacity**
on this 16-thread PC: one logical CPU in aggregate for the isolated harness and inherited browser
tree, with affinity mask 15 (four logical CPUs). GPU and RAM remain native. It includes worker CPU,
and is a constrained CPU proxy, not a physical laptop. The helper restores affinity and releases
the job between cases. No other process or machine power settings are changed.

## Evidence and budgets

`load.ps1` qualifies **once at other-process CPU ≤25% for 60 consecutive sampled seconds**, then records
continuously while cases run back to back. Only a load-discarded run invalidates that lease;
window.mjs requeues that individual phase/repeat and requalifies while time remains. Missing
samples, missing process-tree ownership, gaps over 30 seconds, unbracketed active intervals,
or other-process CPU above 25%
discard a run. Warm-up and initial byte extraction precede its active interval. GPU load is
diagnostic, including unavailable readings. Do not terminate other agents to obtain quiet
numbers. The harness/controller, its sampler, measured browser/workers and inherited children
are excluded by the sampled process tree. Total CPU is diagnostic only. Every sample retains
the top 15 outside processes by CPU; load discards bind those lists to the run manifest and full
trace. Smoke checks and the sampler's two-sample functional check are not performance evidence.

Native pacing judgments use fixed repeats 1–5, reporting the median and worst of their p99,
maximum frame time, hitches and long tasks. Never choose the fastest five or discard a slow
measured run. Worst-run hitch/visual/byte budgets still hold; median numbers cannot hide an
outlier. The single CPU-proxy pass is explicitly reported as one pass, without five-run certainty.

Pacing runs record every display-frame delta, every renderer method interval and available long
tasks; captures separately copy **every actual rendered frame** and diagnose stale terrain tops,
water below ground, water/state mismatches and per-tile movement jumps. Those geometry checks do
not prove the absence of topology holes, reflections, lighting flicker, cave issues or perceptual
jitter. Capture overhead is excluded from pacing. Overlapping method spans record context;
every hitch remains **unattributed** unless separate evidence demonstrates its cause.
Byte extraction after idle is labelled as harness overhead: all its frame/task records remain in
raw data and the summary's instrumentation section, excluded from interaction pacing budgets.

`budgets.json` contains **provisional targets**, not thresholds derived from uncollected numbers.
`gate.mjs` fails for missing repeats, unsupported requested coverage, any hitch/task/glitch, byte
differences, missing visual/audio oracles, and the missing single hour session.
Edge supplies the mandatory Long Tasks oracle. Firefox's compatibility pass must still pass
frame pacing (including >50 ms stalls), byte and visual/audio checks; unavailable Long Tasks
entries are reported as unavailable, never zero. That API absence alone does not block the core gate.
The hour run streams raw events so instrumentation does not retain an hour's events in page memory.
Its load log records private and working memory; owned browser processes supply before/end private
memory on both browsers, alongside GPU counts and the heap estimate where the browser exposes it.
Memory and pacing limits remain provisional until quiet runs establish a useful noise envelope.

Morning completion: `node morning-audit.mjs` audits every 07:40–09:40 manifest and full load
trace (archived controller logs: `local/windows/2026-09-30-0740/`), writes `morning-proof.json`, and binds all source files through ignored
`local/morning-evidence.json`. Individual hitches/tasks/candidate flags stay in
`local/morning-hitches/`. `python review-morning.py` (Pillow + NumPy) decodes and compares
every frame, regenerates the contact sheet and labelled **unqualified, before-only** diagnostic
GIF; `morning-review.json` records the limits of human inspection. Neither offline command
launches measurements. Raw files are retained locally; regeneration cannot recover missing data.

Post-window harness repairs rotate busy retries instead of starving later cases, catch capture
drain failures during intentional abort, and record visibility/focus and PCM context IDs.
These changes have regression/syntax checks but no new qualified browser validation.
All recorded morning attempts remain invalid; source hashes are not recertified.
The superseding continuous lease removes the historical 384 minutes of per-case waiting.
Kyler subsequently changed rejection to outside-process CPU only: the old total-CPU policy
could disqualify the tested workload itself. Historical measurements remain invalid under their
original protocol; they are never recertified. Firefox setup stalls still need diagnosis.

For each scenario, retain final typed-array bytes, object data and feature snapshots before and
after, plus undo/redo snapshots. Add export-file byte comparison before adoption; current snapshots
alone are not a proof that every exported field is identical. Do not relax budgets to hide failures.

Before making this an adoption gate, validate the integrated High fixture and the CPU proxy,
calibrate frame budgets from three quiet baselines,
complete frame/audio inspection and end-versus-start memory/pacing comparisons, and record oracle
results with matching `captureHashes`, all `requiredManualOracles` checked, zero glitch/dropout/
crackle counts and `heldTextureReleaseMsMax`. Frame PNGs, timestamp JSON, PCM and raw events are
bound by `captureHash`; gate rejection preserves unreviewed evidence as unverified.
`ci-workflow.yml` is a dedicated-runner adoption example, not an
installed workflow or a claim that this investigation passes CI. Interface lifecycle defects belong
to the interface's own pass after **“The page is the editor”**. The known 0% water-status readout
after undo is recorded as an outside-scope finding; history completion waits for the worker and
render queue, without making this readout a smoothness failure or modifying the interface.

**Every force adopted later—Erode, Rift, Landslide, Meander and Deposit—must pass this same harness
before it merges.** Register its actual gestures; unknown/missing force coverage must fail.

## Superseding continuous qualification (September 30, 10:30–13:30 PDT)

Historical afternoon policy qualified once on total CPU, retained continuous samples, and
requalified only after discards. Its frozen protocol files now live beside its archived session;
the offline afternoon audit reads those bytes, not the superseding policy. Private-memory start
evidence comes from the current browser sample, rather than an old qualification prefix.

Afternoon completion: `node afternoon-audit.mjs` freezes finished controller status/log and the
actual continuous session into `local/windows/2026-09-30-1030/`. It audits **every** manifest,
all 45 original generations/waits, full active traces and bracketing samples, recomputes
protocol/source/build hashes, and binds raw files through `local/afternoon-evidence.json`.
`afternoon-proof.json` gives exact missing phase/repeat coverage; individual events stay in
`local/afternoon-hitches/`. Aborted runs without final timestamps cannot prove complete intervals.
Historical `window-load.jsonl` is never afternoon telemetry. Source hashes must match for
regeneration; missing raw evidence cannot be reconstructed by these offline commands.

`python review-afternoon.py` (Pillow + NumPy) decodes/compares all original pixels and regenerates
13 change sheets plus separate `audio.py --context-id` WAVs in `local/afternoon-review/`.
`afternoon-review.json` records which originals were visually inspected, numeric PCM findings
and every unverified oracle. No qualified pair exists, so `python gifs.py` refuses GIF creation.
These commands launch no browser or measurement. Keep budgets.json unchanged: its provisional
status is part of the measured protocol hash. Calibration needs three actual quiet baselines
and a migration preserving that fingerprint; editing status alone would stale all observations.

## October 1 trial and conditional continuation

Authorized **02:00–05:00 PDT (09:00–12:00 UTC)**, following September 30 evening's instruction:
`node window.mjs --suite=core --trial-first=true --start=2026-10-01T09:00:00Z --end=2026-10-01T12:00:00Z`.
Trial choice: Craterize Power 100 Fast on 256² in Standard/High, Edge/native, five paired
before/after timing repeats (20 executions). It uses a fresh protocol hash. No capture overhead
is included in this qualification trial; core captures follow separately if it passes.
These repeat IDs count toward core coverage. One failed/missing trial run stops the controller
without starting the core or hour; retain the top outside processes and wait for Kyler.
Initial qualification may wait up to ten minutes; failure also stops. A qualified but slow run
counts and remains in the five-run median/worst, with budget violations reported.
After all 20 qualify, the full proxy/High hour goes immediately next, then remaining core work.
The existing 65-minute reservation prevents shortening or starting an hour too late.
Continue short work only inside the authorized bounds; missing coverage keeps the PR draft.

## October 1 completion and regeneration

Outside-process trial passed qualification; core **fails adoption**: 25/144 timing pairs,
6/48 captures, one hour; pacing/memory failures and abuse byte differences. Do not adopt the
patch or mark PR ready from qualification/worker equality. Export identity, remaining core,
calibration and visual/audio oracles are missing. Firefox stays deferred; optional full mode
is preserved. Every later Erode, Rift, Landslide, Meander and Deposit must still pass the
same complete core harness before it merges.

Offline commands from this directory, using retained ignored data:
```
node --max-old-space-size=8192 overnight-audit.mjs
node --max-old-space-size=8192 overnight-validation.mjs
python review-overnight.py
python gifs.py --proof overnight-proof.json --output local/overnight-gifs
node --max-old-space-size=8192 gate.mjs
```
`overnight-proof.json` binds original controller/session/protocol/run sources through
`local/overnight-evidence.json`; every hitch/task/candidate stays in `local/overnight-hitches/`.
Hour chunks are recomputed and matched; `overnight-validation.json` checks actual redo bytes,
completed capture digests, paired snapshots and full-hour foreground. Frozen source is
`local/windows/2026-10-01-0200/`; never substitute historical load logs. Existing source/build
hashes must match; missing raw evidence cannot be regenerated. Do not rebuild/change measured
files before preserving their original provenance.

`review-overnight.py` (Pillow/NumPy) decodes/compares every original full-resolution PNG and
converts each labelled PCM context via `audio.py --context-id`, rejecting overlaps before
writing output. Change sheets do not certify all perceptual oracles; unavailable listening
remains unverified. GIFs include only offline-audited qualified pairs, using original timestamps
with 10 ms GIF quantization and held frames; originals remain authoritative. Raw/media stay local.
Readiness needs all requested oracles; unavailable evidence is never zero faults.

Two proxy brush captures exhausted the harness Node heap, leaving invalid `running` manifests.
Future captures need bounded/streamed candidate events with a **new** protocol fingerprint;
raising heap limits alone is not a demonstrated fix. Seven qualified PCM streams overlap and
need recording diagnosis. Wall-clock abuse ends with different bytes/history; resolve timing/
cancellation determinism and prove full export identity before adoption. No post-window change
silently recertifies these runs. The offline gate compacts summaries without retaining every
candidate object. Budgets.json remains unchanged: calibration needs supported repeated baselines
and a migration preserving this measured fingerprint; observed hitch/byte faults cannot be hidden.

The hour's final reference starts with an unsaved `drainEvents()`, discarding about 57.61 seconds
of mixed-edit events. Elapsed time is complete; event coverage is not. Future recording must save
that tail before the reference and supply an auditable `longSession.eventCoverageComplete` marker.
Gate rejects its absence. This needs a new recording fingerprint and validation; no current hour
is recertified. The offline audit reports the estimate from elapsed time minus first/last streamed
wall-clock boundaries; it is not a precise per-frame coverage proof.
