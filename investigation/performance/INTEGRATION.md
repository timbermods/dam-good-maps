# Adoption contract

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
