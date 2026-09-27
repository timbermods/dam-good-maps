# Proposed replacement in Live editing

This folder is an audition and a proposed audio adapter. Nothing in the editor,
forces core, renderer, persisted settings or product plans changes in this PR.
The latest brief supersedes the earlier investigation's quiet/synthetic sound
direction. Keep the first-round files as history and as the demo's A reference.

## What to adopt

Move `engine.js`, `palette.js`, `calibration.js`, `bank.json` and `audio/` together
into an editor audio module. Preserve the manifest-relative URLs when bundling;
copy the bank to a versioned public asset directory or have the build emit each
manifest entry. Retain `SOUNDS.md` with the assets. The sound bank is 818,400 bytes;
the demo, build tools, checks and A/B dependency are not runtime dependencies.

On dev `9e5e73a`, `src/editor/juice.ts` still synthesizes its own small sounds.
`Editor.tsx` creates one `Juice` and routes `feel()` calls through it. Replace
**that audio path** with one round-two `JuiceEngine` per editor lifetime; do not
run both mixes at once. Keep `renderer.puff`, `ripple`, `wiggle`, and registered
visual force touches. Reduced motion continues to govern visuals independently.

```js
const audio = new JuiceEngine({ settings: savedSound });
// Inside the first trusted pointerdown/keydown handler; never await in editing.
void audio.unlock();
// After a successful placement, not on a ghost or rejected candidate:
audio.play('tree', { size: .4, strength: .5, distance, pan });
// On editor teardown:
void audio.dispose();
```

Construction creates no AudioContext and plays nothing. First interaction starts
asynchronous local decoding with four concurrent requests. Events before readiness
are discarded, never replayed as a late burst. Audio failure must never prevent
an edit. Keep the bank/context alive across tool changes; close on unmount.

## Map accepted editor events to material

| Current hook / action | Proposed sound call |
| --- | --- |
| `PainterHost.painting(true)` plus first `feel` confirming changed land | `start(selectedBrush, params, strokeId)` once |
| Later `PainterHost.feel` / pointer movement | `update(strokeId, {size, strength, distance, pan, activity})` |
| `painting(false)`, pointer cancel, lost capture, tool change, blur, Esc | `stop(strokeId)`; invalidate controller callbacks |
| Raise / Lower / Flatten / Smooth / Naturalize / Remove | Explicit `raise / lower / flatten / smooth / naturalize / remove`; split today's generic `shape` |
| Accepted tree / berry bush / ruin / mine site / start placement | `play('tree' / 'berry' / 'ruin' / 'mine' / 'start', params)` |
| Accepted source placement, including moved/painted source result | `play('water' / 'badwater', params)` based on actual source type |
| Successful undo | Cancel the active stroke/force, then `play('undo')` once |

`Editor.tsx` currently emits generic `place` and `source`; derive material from
the already-selected entity/source, not tile count. Tree/bush brush batches get
at most one accent per accepted batch (roughly 100–160 ms), with a quiet leaf
texture for the held gesture if wanted: use `start('naturalize', …, foliageId)`.
Never emit an impact for every entity or voxel. Engine limits are a backstop,
not a replacement for this batching. `activity: 0` fades an idle/no-change stroke;
stop it after an idle grace period. Restart only when land actually changes.

Suppressed edits, hover, hydration, replay, export and a failed undo stay silent.
Separate audio randomness from map generation seeds and the undo data model.

## Forces follow the visible simulation

Keep the forces core deterministic and free of Web Audio. `CarveDriver` currently
calls `host.feel` from `show(ForceFrame)` when `head.cut > 0`. Start one `carve`
texture at the first changed frame, update it from head position/width and actual
cut activity, and release it when the run finishes, is kept or is dropped.
Never restart the torrent at every frame.

Craterize, Quake and Erupt should expose **semantic phase changes** in their
visible run/controller events; current `ForceFrame` does not claim to provide
them. Do not infer those moments from an arbitrary UI timeout. Proposed mapping:

| Force moment | Proposed audio |
| --- | --- |
| Craterize approach / collision / visible falling debris | `play('craterize', p, {id: runId, phase: 'incoming' / 'impact' / 'debris'})` once per transition |
| Quake fault opens | `play('quake', p)`; begin `start('quake', p, runId)` only if a longer rumble is needed |
| Quake Slide starts | `play('slide', p)`; `start('slide', p, runId)` for an extended moving fault |
| Erupt pressure / rising plume / lava cooling | `play('erupt', p, {id: runId, phase: 'rumble' / 'plume' / 'cool'})` once per transition |
| Force completes or is cancelled | `stop(runId)` and cancel pending controller events; `stopAll()` for editor-wide cancellation |

Phases may append under one run ID while its previous layers are playing.
`stop(runId)` fades all those layers, including scheduled debris. Use separate
IDs for concurrent runs. For a very long plume, sustain `erupt` under a separate
bed ID, release it at cooling, and play `cool` under the run ID. Do not layer a
full one-shot recipe *and* its phase calls. The demo's no-phase calls deliberately
schedule a complete miniature performance; those timings are audition timings.

## Scale, distance and settings

All size, strength and activity inputs are normalized 0–1. Map the editor's brush
diameter and force power monotonically into that range; catastrophe reaches 1.
The mix grows with size/strength and gets slightly lower in pitch. Per-event
`distance` is 0–8; derive it from source-to-camera distance in world units divided
by a chosen reference distance (proposal: 64 tiles). `pan` is −1…1. Update active
events when the camera moves. `setDistance(extraDistance)` adds a global zoom-out
component; do not count the same camera distance twice. Existing tails respond
as well as strokes. Close sounds retain detail up to 18 kHz; distance attenuates
and lowers the cutoff with smooth AudioParam changes.

Proposed fresh defaults: **sound on, volume 0.72, water ambience off**. One master
slider and one off switch, inside the existing settings UI. The demo persists
its own `dgm.juice2.demo` key; it does not touch Live's `dgm.sound`.
Map saved Live `{on, volume}` to `{enabled, volume}` and keep the user's explicit
off/volume preferences. Do not silently raise an existing saved volume to 0.72.
Decide any one-time migration in the milestone session. Ambience stays opt-in;
when enabled, sustain one nearby waterfall/stream bed, update distance and stop
when no water feature is audible. Avoid one loop per waterfall tile.

Runs rise through 0, 2, 4 and 7 semitones and reset after 850 ms without that
action. Held strokes rise gently over 2.6 s and stop at the fifth. Variants also
change sample, onset spacing, playback rate and texture offset. On/off and
visibility changes cancel active sounds, and resume never replays old events.

## Budget and adoption gate

The browser's native buffer-source audio thread plays predecoded recordings;
there is no per-frame PCM synthesis, grain timer or audio worklet download.
Held beds use pre-crossfaded loops, with no impact retrigger on `update`.
Latest-value coalescing bounds pointer updates to one per animation frame.
At most 72 sample sources, 20 event groups, four sustained groups and ten accents
per second (six-token burst) are admitted. Excess accents are dropped immediately.
The compressor softens overload; a bounded waveshaper has a sample ceiling below
0.92, followed by a master gain clamped to 0–1. No reverb cloud hides transients.

Browser checks cover both common sample rates, output bounds, material balance,
distance, scaling, phase cancellation, burst updates and lifecycle. Before adopting,
listen on headphones and speakers, and profile a real 256² Live edit with forces
running. Those perceptual and editor frame-budget checks are still milestone work;
an isolated audition cannot prove zero dropped frames in every editor/browser.
