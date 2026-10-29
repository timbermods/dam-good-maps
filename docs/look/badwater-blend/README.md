# Badwater blends into clean water (D177)

Before (dev) on the left, after (branch `look/badwater-blend`) on the right. Both are the Standard
look on our own generated maps, with the same camera and water time. No Real place has badwater, so
none is shown. Made with `tools/capture-badwater.ts`.

Badwater is #38's crimson, as Kyler approved it: matte and nearly opaque, with darker troughs and
subdued streaks. It is see-through only at its shallow edges, lighter on a film and darker with depth, as the game's (D496: the G ramp of its `_DepthGradients` texture; option A before it, close to the game's down to two levels).
Partly bad water turns as the game turns it (2026-10-29, read from Timberborn 1.1.2.8's water shader;
`investigation/notes/water_and_soil.md` Q8): one tint, smoothstep(0.01, 1, share) ^ 0.25, carries its
colour, opacity and dull surface toward badwater's, the colour mixed in linear light as the game mixes
it, so it greys as it turns: a darker teal-grey near the game's mixing zone (#2E444C) at a few percent,
a grey at a fifth, a dull red-brown at half, crimson when pure. It is never purple or mauve. (Before,
the hue turned along its own steeper path and 10% already read warm; the game greys first.) The
before-and-after at the game's opening camera: [docs/sheets/badwater-hue.jpg](../../sheets/badwater-hue.jpg). All the water's colours come from one shared palette,
`src/render3d/waterPalette.ts`.

| Image | What to look at |
|---|---|
| [tint-riverValley-4242-256-top.jpg](tint-riverValley-4242-256-top.jpg) | The river above the badwater ditches (37% bad), from above. It reads tainted, a warm red-brown, where dev drew blue water with dark blotches. |
| [tint-riverValley-4242-256-angled.jpg](tint-riverValley-4242-256-angled.jpg) | The same river at the default angle. |
| [riverValley-4242-256-top.jpg](riverValley-4242-256-top.jpg) | Where the ditches and the river meet clean water, from above. Each front is a soft gradient over a few tiles. |
| [riverValley-4242-256-angled.jpg](riverValley-4242-256-angled.jpg) | The same meeting at the default angle. The ditches are pure badwater, crimson and matte. |
| [delta-4242-256-top.jpg](delta-4242-256-top.jpg) | A badwater plume in the delta, from above: a smooth gradient, not a speckled band. |
| [delta-4242-256-angled.jpg](delta-4242-256-angled.jpg) | The same plume at the default angle. The deep channel is darker (option A). |
| [riverValley-5-128-top.jpg](riverValley-5-128-top.jpg) | 128² from above: badwater runs into the river and taints it gradually. |
| [riverValley-5-128-angled.jpg](riverValley-5-128-angled.jpg) | 128² at the default angle: the tainted river meets the clean river in a smooth gradient. |
| [delta-5-128-top.jpg](delta-5-128-top.jpg) | 128² from above: a badwater stream meets a clean channel and taints the water below it. |
| [delta-5-128-angled.jpg](delta-5-128-angled.jpg) | 128² at the default angle: the same meeting. |
| [greyscale.jpg](greyscale.jpg) | Every after view in greyscale: badwater and tainted water are darker than clean water, with no speckle. |
| [colour-blindness.jpg](colour-blindness.jpg) | The angled after views with deuteranopia, protanopia and tritanopia. |

## Colour on screen

`npx tsx tools/capture-badwater.ts --measure` measures with the method in `WATER_CALIBRATION`,
which is #38's colour check:
- a 64² bed of water, all one badwater share and depth, over a poisoned bed;
- drawn by the site's renderer on the GPU at 1440 × 940, 70° down, water held at 8 s;
- pixels in a central 240 × 96 patch sorted by r + 2g + b, and each band averaged.

It passes when every target lands within 2 codes.

| Pure badwater, 0.25 deep | #38's target (e63a3ff) | Standard, measured |
|---|---|---|
| Typical (45–55%) | #6E3431 [110, 52, 49] | #6E3431 [110, 52, 49] |
| Troughs (5–15%) | #5E2E2B [94, 46, 43] | #5E2E2B [94, 46, 43] |
| Streaks (96–98.5%) | #7C4538 [124, 69, 56] | #7C4538 [124, 69, 56] |
| Body (15–40%, not a target) | #6B3330 [107, 51, 48], as #38 measured it | #6B332F [107, 51, 47] |

Clean water's targets (Standard's approved look) land exactly too: #40626A, #21434F and #1D3545 at
0.25, 1.25 and 4.25 deep.

Body band by share and depth (measured before 2026-10-29, on the old blend):

| Depth | Clean | 10% bad | 25% bad | Half bad | Pure badwater |
|---|---|---|---|---|---|
| 0.25 | #40626A (L\* 39.3) | #65564B (37.7) | #714B43 (35.8) | #73403D (33.3) | #6B332F (28.6) |
| 0.8 | #254954 (28.8) | #483D35 (26.5) | #4E332F (24.4) | #4A2B2A (21.4) | #3E1E1C (15.6) |
| 1.25 | #21434F (26.3) | #413730 (23.8) | #432E2B (21.3) | #3F2525 (18.0) | #301716 (11.1) |
| 4.25 | #1D3545 (21.0) | #322C27 (18.5) | #342523 (16.3) | #2F1E1D (13.3) | #231110 (7.2) |

At 5% bad the water is the mixing zone's teal-grey (#37434B at 0.8 deep). At 10% it is a warm
brownish grey, red above blue by 11–26 codes.

- **Greyscale:** at every depth, water gets darker as more of it is bad.
- **Colour blindness:** tainted water and badwater are dark olive-brown against blue water with
  deuteranopia and protanopia. With tritanopia they are red against teal.
- **Clean water is unchanged:** a clean-water map draws the same pixels as dev in three views.
