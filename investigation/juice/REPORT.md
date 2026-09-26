# Juice investigation

Started from `dev` at `4f1b8c6`. All changes belong to this folder.

## Decisions

- Follow EDITOR_PLAN's quiet interface and PLAN §20 D181, D184, D205 and D212:
  action sounds on at 22%; water ambience off. The user's publishing and folder
  rules override the repository's milestone release and living-doc instructions.
- Use only original procedural synthesis in a Web Audio AudioWorklet. No audio
  assets, recordings, downloads, dependencies or game sounds.
- Use one sustained texture per stroke, with smooth changes in pressure and
  distance. Force sounds have phases so the eventual core can drive their timing.
- Keep this a standalone proposal. The milestone session owns editor integration.
- Use a separate local checkout because the original workspace has unrelated
  untracked investigations that overlap current dev. Those files stay untouched.

## Steps

1. Read project guidance, choose the audio architecture and create this isolated
   package. The demo will run with `npm --prefix investigation/juice run demo`.
2. Build the procedural engine: 21 sounds, including both Quake modes and two
   water ambiences. Layer filtered noise and damped tones; vary pitch, timing,
   tone and grain. Bound the mix at 64 layers and four sustained groups.
3. Build the sound garden, replay/size/strength/distance controls, hold-to-paint,
   keyboard access and three context sequences. The package needs no install.
   Stop, Esc, losing focus and leaving the page release sounds and cancel cues.

## Try it

From the repository root, with Node 22 or newer:

```sh
npm --prefix investigation/juice run demo
```

Open the localhost address printed at startup (the OS chooses a free port).
Click a palette sound, replay it, or hold/drag on the garden. The controls apply
to every sound; camera distance also changes ongoing sounds. Waterfall and Stream
can be auditioned individually without enabling ongoing ambience.

## Checks and limits

`npm --prefix investigation/juice test` checks variation, audibility, quieter and
softer distance, size/power, sustained strokes, event storms, cancellation,
force phases, malformed values, mute and cleanup at 44.1/48 kHz. All nine pass.
`npm --prefix investigation/juice run bench` renders ten seconds of dense audio
without creating an audio file. Initial Node 24 / 48 kHz run: 52 layers, 1.72 s
CPU wall time, 0.92 ms p99 per 128-frame block (2.67 ms available).

The demo's **Under the hood → Run browser checks** uses the real AudioWorklet.
Initial Chromium 153 / Windows / 48 kHz run passed all lifecycle/output checks:
13.5 ms first unlock, 0.515 maximum sample at full volume, RAF p99 8.7 ms,
maximum 9.7 ms. These are measured audio-demo results, not a guarantee for every
device or proof of the future 256² editor's frame budget. Integration should
profile real painting and forces beside water/render work. Speaker/headphone
listening and subjective tuning remain the milestone audition.

No production files, media assets or package dependencies were added. The
integration and settings changes in INTEGRATION.md are proposals only.
