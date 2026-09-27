# Juice, round two

Based on dev `9e5e73a`. Only this folder changes. The first round is retained
unchanged for comparison. The branch is `investigation/juice-2`.

## Decisions

- The new brief supersedes round one's quiet/synthetic direction. Use recorded
  CC0 foley, clear attacks, fuller bodies and a clearly audible default mix.
- Treat Balatro as a reference for responsiveness and musical satisfaction, not
  a source of assets or a sound to copy. Pitch runs climb a bounded pentatonic
  ladder and reset after a pause. They never speed up into a machine gun.
- Preserve natural high frequencies at close distance. Use distance filtering
  deliberately, rather than lowpassing the entire sound palette.
- No dependency or package install is needed to run the demo. All shipped audio
  is local, compressed and documented in SOUNDS.md. Downloaded source archives
  and temporary analysis belong in the ignored local/ directory.
- Use an isolated checkout to preserve unrelated files in the shared workspace.
  A delivery copy of this folder will make the requested demo command work there.
- Read EDITOR_PLAN's principles and juice decision, PLAN §20 (including D181,
  D184, D205, D212 and D220), docs/PERFECT, and the first-round code and proposals.
  Live editing stays responsive and forgiving. This is an integration proposal;
  the user's folder/publishing restrictions override milestone release rules.

## Steps

1. Establish the branch and sound direction; verify permissive recording sources.
2. Build 24 CC0 recording assets (818,400 bytes) with source/author/licence and
   SHA-256 manifests. Preserve attacks; balance gain without flattening dynamics.
3. Build all 21 sound recipes, continuous recorded brush beds, bounded musical
   runs, phase hooks, distance filtering and a compressor/ceiling output stage.
4. Build the side-by-side demo with size/strength/distance, replay, a rising run,
   held painting and hillside/forest/craterize/eruption scenes. A keeps the original
   procedural engine and its 22% default; B starts at 72%. Master scales both.
5. Verify the browser mix and lifecycle; correct a silent friction-bed crop and
   a tall-panel scrolling issue. Document adoption hooks and current limitations.

## Run and checks

From the repository root, with Node 22 or newer (no install needed):

```sh
npm --prefix investigation/juice-2 run demo
npm --prefix investigation/juice-2 test
```

The demo prints a free loopback port. Open **Audio checks** to reproduce the
browser renders and lifecycle tests. `INTEGRATION.md` proposes how to replace
Live's current sound helper without changing its visual feedback.

- Five Node tests pass: recording hashes/size/provenance mapping, all recipes,
  pitch-run/reset behavior, force phases, distance/input bounds and server scope.
- Real browser renders pass at 44.1 and 48 kHz. At the reference seed and default
  controls, ordinary actions are within 0.08 dB of −23 dBFS strongest-400-ms RMS;
  forces are about −16.5, undo −25 and optional ambience −29. These are measured
  RMS proxies, **not LUFS claims**. `calibration.js` stores the reproducible trims.
- Round-two action renders are at least 21 dB above round one's original default
  under that same RMS measure. No clipping or non-finite output; clean tails.
  Eighteen overlapping maximum-power crater strikes at full master peak at 0.874.
- Distance 2 reduced a tree by 13 dB. Small/weak to large/strong raised earth by
  8.9 dB. Different seeds produce different audio.
- Browser lifecycle checks pass: silent construction, first-interaction decoding,
  ambience off, no stroke retriggers, bounded overload, shared force-phase cancel,
  mute, pause/resume and disposal. A 5,000-update burst took 0.5 ms and coalesced
  to one update on this machine. Warm cached loading took 37 ms.

The new bank is recorded foley, including processed firecracker and waterfall
textures for large forces. The tiny pitched resonance is a recorded bell. No
Balatro or Timberborn audio was used. All sources and processing are in SOUNDS.md.
Two inputs use public compressed HQ previews rather than lossless originals;
that tradeoff keeps the bank small and the provenance clear.

The checks establish functionality and signal behavior, not a human listening
verdict. Headphone/speaker audition and profiling inside the real Live editor
remain the milestone session's adoption checks. This PR only proposes integration.
