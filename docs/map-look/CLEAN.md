# The clean look

Kyler's decision after Map look's third round (2026-09-25): the 3D view opens clean, as close to the
game as our own shaders and models can draw it, and everything that exists only to inform moves to
an information layer, off by default. The core meanings must still read in the clean view, in
colour, in greyscale and with colour blindness. This note says what changed, where to look for
each core meaning in the captures, and where readability needed a compromise. The captures are
listed in [clean/captures.md](clean/captures.md).

## What changed

**The clean view** (the default):

- Dry ground is cracked earth in the reference's grey-brown: broad patches, a few tiles to a dozen
  across, drift between a cooler grey, the base grey-brown and a warmer brown, and in lightness, so
  the ground varies from afar. The cracks are finer, and fainter from afar.
- Grass is a muted, yellowish green (second round). It varies within and between patches (lighter
  and deeper patches, darker blotches), has clumps with yellower tips and blades up close, and
  bleeds onto the earth in ragged edges.
- Water is a deep teal body that darkens to navy with depth (second round). It is clear toward its
  banks, where the bed shows through a light teal tint. Ripple crests catch the sky, glints
  sparkle, and a line of foam runs along the shore.
- Light reads from afar: shadows keep about three fifths of the light (they kept four fifths), the
  corners at the foot of walls are darker, and objects keep their pale sides pale.
- Walls are dark cobbled stone, every other level a shade darker, without the pale line at each
  level.
- A sky surrounds the map: blue overhead, paler at the horizon, soft clouds above and below. The
  map's sides go down below its lowest ground, so it is a block of land floating in the sky, as in
  the game. (The light look for software rendering clears to the sky's colour and draws no clouds.)
- Dead trees are bare trunks at their true size: a dead pine a tall pale pole with its top broken
  off, a dead birch a white fork, a dead oak a thick stump with pale broken limbs.
- Ruins are open scaffold towers again: weathered posts, rusty rails and braces, grey-brown decks,
  beige crates and sheets, ivy where the ground is moist.
- Slopes are stone ramps, without arrows.
- Geothermal fields (dark rock with glowing vents), relics (broken stone columns on a plinth),
  thorns (dark brambles) and blockages and natural dams (heaps of stones) are world objects; they
  were boxes.
- Nothing grows from afar, and dam sites are not drawn.

**The information layer** (**Markers**, off by default): dam sites (hatched light and dark), slope
arrows, a pale line at every wall level, an outline where contaminated ground ends (since the
contamination round), and dead trees, slope arrows and the start drawn larger from afar. The **Markers** button beside **Height colours** turns it on; the choice is remembered.
In the editor, the **Dam site** tool shows the dam sites with the markers while it is out, and puts
them away after; the **Slope** tool turns the markers on while it is out; **Show dam sites** turns
them on too. The legend lists the clean view's meanings, then the lines that show "With **Markers**
on". The generator's 3D preview draws its best dam site only with **Markers** on.

What did not change: generation, validation, the file format, the existing tests and `shade.ts`.

**Second round** (Kyler, 2026-09-25, after reviewing the first): water moves toward the game's deep
teal and navy, with clearer shallows; grass becomes a more muted, yellower green with visible
texture. Kyler accepted that clean water may be as dark as dry ground in greyscale or darker; it
reads as water by its shore foam, glints, ripples and see-through shallows. All the clean captures
were made again.

With Kyler's approval, the water test in `tests/unit/look-water-slopes.test.ts` now checks his new
rule instead of the third round's "water is lighter than dry ground": it is called "keeps badwater
clearly darker than clean water, which has shore foam, glints and see-through shallows". The ripple
crests' colour is `WATER.crest` (its old name `deep` stays as an alias for two older tests); the
water's body uses `WATER.teal` and `WATER.navy`.

## Contamination round: contaminated ground as a layer

Kyler, 2026-09-25: contaminated ground works as in the game, a layer on top of the ground, not a
replacement.

*Since 2026-11-07 (fix/ground-veins, D154 as amended that day) the veins below are the game's own: its pattern of
thin dark-rust cracks over about a fifth of the ground, the same at any level over a fifth, no glow; the light look
takes its mean. What follows records the round as it was; docs/progress/3d-view.md has the change.*

- **The ground keeps its own look.** Moist ground stays grass and dry ground stays cracked earth;
  close up, the soil between the veins is only a little stained (at most a fifth of the way to
  rust or to a sickly brown).
- **Red-orange veins run over it, denser and brighter as contamination rises.** At the least
  contamination a fifth of the vein network shows, at the most nearly all of it, and a second,
  finer network joins from about half-way; the veins glow brighter too. On dry earth its own cracks
  become the veins: rust rims round glowing orange cores. Through grass run dark red veins.
- **Wet and dry contaminated ground differ.** Grass with dark red veins against earth with glowing
  orange cracks.
- **It reads through the vein pattern.** In greyscale the veins are light lines on earth, where
  clean earth has dark cracks, and dark lines through grass. From afar, where the veins are too fine
  to see, they tint the ground instead: rust on earth, dark red on grass, the more the more
  contaminated. With protanopia and deuteranopia the veins stay dark lines through yellow grass and
  light lines on grey earth; with tritanopia the whole contaminated area turns pink-red.
- **No solid rust fill,** also in the light look for software rendering, which draws no patterns:
  there contamination tints the ground a quarter to a half of the way, rust on earth, dark red on
  grass.

**With Markers on, an outline where contaminated ground ends** (Kyler, after approving the
layer): a thin light line between dark edges traces the exact edge, so it shows on demand; the
clean view keeps its gradual fade. It uses the hover text's rule (any contamination at all is
contaminated ground), runs on the contaminated side of each edge (on the clean side where the
contaminated ground is under water, never along the map's edge), follows the terrain, and is
traced again whenever the soil or the water updates (`contaminationEdges`, from the terrain's tile
data). It is a few pixels wide, at most a quarter of a tile. The legend lists it under "With
**Markers** on". Captures: `docs/map-look/clean/contamination/edge-after-markers.jpg` and
`area-after-markers.jpg`, with greyscale versions; the Markers captures of the clean set were made
again with it. The walls' lip, the band of the top's ground along a wall's top edge, now shows the
top's own ground under contamination too (it was the rust).

The terrain shader reads the layer's settings (`CONTAMINATION` in `palette.ts`), and
`contaminationMap`, `contaminationWeight` and `contaminationVein` say what it draws (since 2026-11-07), for the
tests. Captures, before and after, with the after ones in greyscale and colour blindness:
`docs/map-look/clean/contamination/` (`<scene>-before.jpg`, `<scene>-after.jpg`,
`<scene>-after-<variant>.jpg`). The scenes: `wet` (contaminated grass), `dry` (contaminated dry
earth), `edge` (where contamination thins out), `badside` (badwater beside contaminated ground),
`area` (a contaminated area from further off) and `wide` (a wide band, wet and dry, from afar).
The clean captures were made again with the layer.

Three tests checked the old rust fill and were updated to the new rule (D148; logged in
`docs/progress/map-look.md`):

- `tests/unit/look-readable.test.ts`: "keep their order: dead trees, moist, dry, contaminated
  ground, badwater" is now "keep their order: dead trees, moist, dry ground, badwater", and a new
  test, "is a layer: the ground's own look stays under it, its veins grow denser and brighter with
  contamination, wet and dry contaminated ground differ, and it reads in greyscale", holds the
  contamination checks.
- `tests/unit/look.test.ts`: "maps soil to moist, dry, contaminated or under water, in the
  shader's order" now also checks that the colour under contamination is the soil's own ("...,
  keeping the ground's own colour under contamination"), and "keeps the meanings apart in
  brightness too (greyscale)" checks the veins instead of the rust fill ("...: grass, earth and its
  cracks, contamination's veins, water").

## Where to look for each core meaning

Positions are in pixels from the top-left corner of the capture (in `docs/map-look/clean/`); they
hold for its greyscale and colour-blind versions. Greyscale lightness (L\*) is the median over every
listed example in the clean captures of our maps.

| Meaning | Capture and position | What shows it | Greyscale L\* |
|---|---|---|---|
| Clean water | riverValley-128-start, 666, 441 (river); lakeBasin-128-start, 504, 577 (lake) | deep teal to navy; foam along the shore, glints, ripple crests; clear toward its banks | 31 |
| Badwater | riverValley-256-meets, 415, 370; riverValley-128-badwater, 480, 348 | near black-brown, dull, with brown streaks, no glints | 13 |
| Badwater meeting clean water | riverValley-256-meets, 482, 341 and 765, 353 | dark brown streaks and blotches drifting into the teal | between the two |
| Moist ground | riverValley-128-badwater, 515, 546 | muted yellowish grass with clumps | 60 |
| Dry ground | riverValley-128-badwater, 634, 411 | grey-brown cracked earth | 40 |
| Contaminated ground | riverValley-128-badwater, 474, 403 (earth); 511, 498 (grass) | the ground's own look under red-orange veins: glowing orange cracks on earth, dark red veins through grass | its ground's (40 earth, 55 grass); the veins light on earth, dark on grass |
| Living trees | riverValley-128-start, 382, 288 (oak) and 512, 247 (pine) | dark green crowns with shadows | dark |
| Dead trees | riverValley-128-badwater, 393, 309 (pines); riverValley-128-start, 197, 184 (oaks) | pale bare trunks and stumps, far lighter than living crowns | pale |
| The start | riverValley-128-start, 490, 355; riverValley-128-overview, 379, 409 | the lodge: red roof, pale walls and deck, yellow banner | light and dark together |

From light to dark in greyscale: dead trees, moist ground, dry ground, clean water, badwater;
living trees are dark. Contaminated ground keeps its ground's lightness and reads by its veins:
light lines on earth, dark lines through grass, and a darker tint from afar. With protanopia and
deuteranopia grass turns yellow, dry ground grey, clean water blue-grey and contamination's veins
dark olive; with tritanopia grass turns a pale grey-green, dry ground a greyish mauve,
contaminated ground pink-red and clean water teal. The markers captures (`*-markers.jpg`) show the information layer: dam sites at
riverValley-128-overview-markers 505, 408, slope arrows and the enlarged start and dead trees.

## Where readability needed a compromise

- **In greyscale, clean water reads by texture, not lightness.** Since the second round it is as
  dark as the game's: darker than dry ground (L\* 31 against 40). Up close its foam, glints and ripples tell it apart; in a view of the whole map a
  river reads by its shape and banks. Badwater stays about 18 L\* darker than clean water.
- **Grass is lighter than in the game.** The game's grass and dry ground are about as light as each
  other; ours differ by about 20 L\* (60 against 40), so moist and dry ground read in greyscale and
  with colour blindness. It is now muted and yellower, as in the game.
- **Contaminated ground reads by its veins, not its lightness.** Close up the vein pattern shows
  it in any colours. From afar the veins merge into a tint, clear at high contamination and faint
  where contamination is low: a lightly contaminated edge seen from afar reads only in colour.
- **Dead trees at their true size are specks in a view of the whole map.** They read as pale
  poles and stumps from the game's usual distance; from afar only **Markers** draws them larger.
  The same holds for the start on a 256 map: a small red and pale spot in the overview.
- **The sun stays in the north-west.** In the game the camera faces the lit side of things and
  shadows fall away from it; our baked shadows fall south-east (a tested direction), so objects
  face the camera with their shaded side. Objects keep more sky light, so pale trunks stay pale.
- **Dam sites need Markers.** The clean view has no hazard stripes; the **Dam site** tool and
  **Show dam sites** turn the markers on, and the preview's best dam site shows with **Markers**.

## Comparing with the game

A local page, never committed, shows each of Kyler's reference screenshots beside the clean view
of a comparable scene of our maps, the same scene in the third round's look, and a place for the
DGM Probe's in-game shot of our map: `C:\dgm-workshop\look\compare.html`. Its first section shows
the contamination round's scenes before and after, beside the matching screenshots, with the after
scenes in greyscale and colour blindness; the next shows the second round's water and grass. It links the screenshots where they are (`C:\dgm-reference\`) and
copies none.
