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
node build.mjs before
node build.mjs after
node test.mjs
node --test metrics.test.mjs audio-worklet.test.mjs window-policy.test.mjs
node typecheck.mjs
node run.mjs --mode=smoke --phase=after --browsers=edge,firefox --profiles=native --sizes=128 --looks=clean --cases=craterize-fast,brush-large,select-raise --repeats=1
node run.mjs --phase=before --repeats=3
node run.mjs --phase=after --repeats=3
node run.mjs --mode=capture --phase=before --sizes=256 --cases=craterize-fast,abuse --repeats=3
node run.mjs --mode=capture --phase=after --sizes=256 --cases=craterize-fast,abuse --repeats=3
node run.mjs --phase=after --cases=craterize-fast --hour --repeats=3
python gifs.py
node gate.mjs
```

All build outputs, raw events, per-frame PNGs, output PCM, full byte snapshots, one-hour streams and
GIFs go to gitignored `local/`. `python audio.py <capture-audio.jsonl>` regenerates a mono WAV and
gap index. `python water-design.py` regenerates the small committed schematic. Python needs Pillow.

`node window-summary.mjs` regenerates the September 30 load/coverage proof from the retained
`local/window-status.json` and `local/window-load.jsonl`; hashes bind the compact committed index
to those raw files. This is a historical index, not a way to reconstruct unrecorded CPU load.
For a separately authorized future window, pass UTC bounds explicitly:
`node window.mjs --start=<UTC-ISO> --end=<UTC-ISO>`. Expired windows are refused.
The five-minute gate resets on busy/invalid samples or logging gaps. Short work continues until
the deadline if qualification misses the full-hour start; an hour that does start stays last.

Install the harness's matching Firefox with `node node_modules/playwright/cli.js install firefox`,
or use `--firefox-path=<matching-executable>`. Installed Edge is launched through its `msedge`
channel, in a separate context; existing tabs/settings are untouched. Functional smoke checks use
headless browsers so other agents' windows cannot suspend them; timing/capture runs use headful
browsers. Browser version, GPU,
software rendering and viewport are recorded. The harness pins Playwright 1.58.2 because this
machine's cached Firefox is revision 1509; this is separate from the product dependencies.

The matrix includes all five current forces at Power 100 using their natural Auto size, Fast and
Watch, largest supported Raise stroke, seven whole-map Select actions, undo/redo of each, camera
orbit/zoom, seeded interruptions/ten rapid undos/successive forces, and mixed one-hour sessions.
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

`load.ps1` samples five times before and after each non-smoke run (CPU ≤15%, hottest GPU engine
≤20%). During runs it logs process CPU and descendants of the harness; unrelated activity above
15%, or total sampled CPU above 15%, invalidates the run. Unknown GPU load also refuses qualification. Do not terminate other
agents to obtain quiet numbers. Smoke runs exercise functionality only and supply no timing summary.

Pacing runs record every display-frame delta, every renderer method interval and available long
tasks; captures separately copy **every actual rendered frame** and diagnose stale terrain tops,
water below ground, water/state mismatches and per-tile movement jumps. Those geometry checks do
not prove the absence of topology holes, reflections, lighting flicker, cave issues or perceptual
jitter. Capture overhead is excluded from pacing. Every detected hitch has overlapping method
spans; an unexplained pause is retained as **unattributed**, never assigned a speculative cause.
Byte extraction after idle is labelled as harness overhead: all its frame/task records remain in
raw data and the summary's instrumentation section, excluded from interaction pacing budgets.

`budgets.json` contains **provisional targets**, not thresholds derived from uncollected numbers.
`gate.mjs` fails for missing repeats, unsupported requested coverage, any hitch/task/glitch, byte
differences, missing visual/audio oracles, and missing three-hour evidence per configuration.
Firefox lacks the Long Tasks API here; that is unavailable evidence, not zero tasks.
The hour run streams raw events so instrumentation does not retain an hour's events in page memory.
Its load log records private and working memory; owned browser processes supply before/end private
memory on both browsers, alongside GPU counts and the heap estimate where the browser exposes it.
Memory and pacing limits remain provisional until quiet runs establish a useful noise envelope.

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
