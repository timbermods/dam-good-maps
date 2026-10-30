// The 3D view's water in one place (PLAN §20 D177): clean water's and badwater's colours, their
// opacity by depth, how water turns from clean to bad with its badwater share (the contamination
// blend), and how the colours are calibrated on screen. The Standard look's water shader and its
// falls' shader (D201) read it through `WATER_GLSL` (generated from these values; the Light look
// runs the same shader code), the legend and the tests read the values, and Map look 2's High
// shader reads it too (`HIGH_WATER`, `HIGH_WATER_GLSL`: #38's own inputs, beside Standard's), so the looks never
// drift apart. No other module defines a water colour (tests/unit/water-palette.test.ts). The 2D preview and the map file's thumbnail keep their own
// schematic colours; they are not the 3D view.
//
// Badwater is #38's, as Kyler approved it (the High prototype at e63a3ff): a crimson, matte,
// murky body with darker troughs and subdued streaks, see-through as the game's water is at its shallow
// edges. Its on-screen colours are #38's calibration targets (`WATER_CALIBRATION`); the inputs here
// are calibrated so the Standard look lands on them. Colours are display values, before the light.
//
// Pure TypeScript, no three.js.

export type Rgb = readonly [number, number, number];

/** Badwater's crimson body (calibrated to #38's targets, then darkened a little by D324). D310 found
 *  that darkening it erased the mine pit's margin under it (`look-mine-ruins.test.ts`, Kyler's review
 *  of D177/D178, 2026-09-26: the pit stays at least 5 L* darker than badwater; they cleared it by
 *  0.4 L*), so it held. Kyler chose option (a) (D324): the pit's earth darkened first (from #373A34), then
 *  badwater (L* 29.3 to 25.6, about a tenth darker, nearer the game's own murky reading), then clean
 *  shallows brought down toward the game, every readability rule at its old strictness. Its
 *  `WATER_CALIBRATION` targets were re-measured once for it. */
const BAD_BODY: Rgb = [0.379, 0.18, 0.158];

export const WATER = {
  /** A fall's streaks: a lighter teal on clean water, orange-red on badwater, little white (D334,
   *  as Timberborn's references); and badwater's sheet in High. */
  fallTeal: [0.27, 0.64, 0.71] as Rgb,
  fallBad: [0.55, 0.15, 0.065] as Rgb,
  fallBadStreak: [0.87, 0.32, 0.12] as Rgb,
  /** Clean water, closer to the game's own shades (D304, sampled from Kyler's screenshot; `teal` and
   *  `navy` darkened further by D310, toward the game's own reading, while `shallow` and badwater
   *  hold the readability tests at their strictness before D304, never loosened). One consistent
   *  teal-blue body, a calmer surface with subtle ripples and glints, still see-through so the bed
   *  shows through. `teal` and `navy` sit close to the game's own reading (D310: within about 3 L*
   *  of the sampled #305965/#264A58 — `navy` almost exactly `#264A58`'s own lightness). `shallow`
   *  stays above that literal reading, by exactly what the readability rules need: it clears
   *  badwater's body by `look-readable.test.ts`'s raw margin (0.3, restored by D310) and
   *  `look-waterfalls.test.ts`'s colour-blind margin (D201, at least 20 L*). D324 (option (a)) darkened
   *  badwater and the mine pit's earth first (see `BAD_BODY`), which let it come down from L* 65.9 to
   *  58.8; it is as low as the margin allows. Water still reads as water by its shore foam, glints and
   *  ripples, not by a wide light-to-dark swing across its own depths. */
  shallow: [0.245, 0.602, 0.654] as Rgb,
  /** The ripples' lit crests, where they catch the sky: the lightest the water gets. */
  crest: [0.26, 0.5, 0.62] as Rgb,
  /** The body of water a level or so deep (D310: close to the game's own #305965). */
  teal: [0.128, 0.328, 0.356] as Rgb,
  /** The body of deep water: only a little darker than `teal` (D310, close to the game's own
   *  #264A58), not the old navy. */
  navy: [0.117, 0.298, 0.324] as Rgb,
  foam: [0.9, 0.94, 0.95] as Rgb,
  /** The sky the water reflects (clean water's pale flow streaks are this, a little darker). */
  sky: [0.6, 0.72, 0.84] as Rgb,
  /** Badwater's body a quarter level deep (#38's calibration depth), crimson, matte and murky;
   *  lighter on a film and darker deeper, as the game's (`BADWATER.ramp`, `badwaterBody`: D496), so it stays
   *  darker than clean water of the same depth. Unchanged by D310 (see `BAD_BODY`). */
  bad: BAD_BODY,
  /** The dark crimson under a badwater source's basin (not water: the basin's floor). */
  badDeep: [0.14, 0.066, 0.058] as Rgb,
  /** Badwater's darker troughs, in its mottled dark patches (`BADWATER.trough` of the way), and
   *  its subdued, lighter flow streaks; both in its shallows, darkening with depth as the body. */
  badTrough: [0.292, 0.143, 0.128] as Rgb,
  badStreak: [0.421, 0.234, 0.194] as Rgb,
  /** Badwater's slow glowing bubbles, denser the more of the water is bad. */
  badVein: [0.98, 0.5, 0.16] as Rgb,
  /** Foam on badwater: along its shores and below its falls. */
  badFoam: [0.66, 0.5, 0.36] as Rgb,
  /** Clear water (`CLEAR_WATER`): clean water's faint blue tint over the bed, and the soft bright
   *  line along its shore. */
  clearTint: [0.22, 0.53, 0.9] as Rgb,
  clearShore: [0.85, 0.94, 1.0] as Rgb,
} as const;

/** The editor's marks for water, not water itself: the brush ring's water-blue when smart Lower
 *  carves a bed the water follows (D198) and the thin dark outline every ring has, so it holds on
 *  bright shallows and pale ground (checked in greyscale and three colour-blindness simulations,
 *  tests/unit/brush-ring.test.ts); the glow of the sources feeding the water under the pointer
 *  (D196); and the clear red of the water over a highlighted source (D249: Remove's red, Clear
 *  sources' glow), so it reads under its own water. */
export const WATER_UI = {
  ring: [0.35, 0.82, 1.0] as Rgb,
  ringEdge: [0.0, 0.01, 0.03] as Rgb,
  sourceGlow: [1.0, 0.93, 0.55] as Rgb,
  sourceLit: [0.9, 0.12, 0.08] as Rgb,
} as const;

/** Clean water's surface, as the water shader draws it: foam along the shore and broken foam
 *  just off it, glints on the ripples, and shallows clear enough to see the bed through, the more
 *  so toward the banks. */
export const WATER_SURFACE = {
  /** Foam: the line along the shore, and the broken foam just off it. */
  shoreFoam: 0.7,
  brokenFoam: 0.6,
  /** Glints of light on the ripples (up close). */
  glints: 0.6,
  /** How much of the ground behind the water shows through it, as the game draws it (its PhysicalWaterURP's
   *  High-quality variant; `investigation/notes/water_and_soil.md` Q8): `seeThrough` of it where the water
   *  meets its floor (`_TransparencyDepth` 0.35 × `_TransparencyDepthModifier` 0.5), thinning in step with
   *  depth to none `seeThroughTo` levels deep (`_MaxDepth`); clean water and badwater alike, so the water is
   *  83% opaque at its very edge and opaque deep down (`waterSeeThrough`). The light look follows the game's
   *  Low quality, which shows no ground. The water's side at the map's edge. */
  seeThrough: 0.175,
  seeThroughTo: 5,
  /** The ground that shows behind the water, as the game shows it (`waterGroundBehind`): overlaid with the
   *  water's own colour by `behindTint` (`_TransparencyBlending`), then desaturated to `behindSaturation`
   *  (`_TransparencySaturation`, Rec. 709 luma), so it reads as the water's, darker and greyer than the
   *  ground in the open. On display values, as the game works them: it renders in Gamma colour space
   *  (`m_ActiveColorSpace` 0), so its shader maths never goes to linear light. */
  behindTint: 0.8,
  behindSaturation: 0.3,
  edge: 0.85,
  /** At a bank the water is this share of its depth, deepening over this far from it (tiles). */
  bank: 0.3,
  bankWidth: 0.45,
  /** How quickly clean water turns from its clear shallows to its teal body (per level), and
   *  between which depths the teal turns navy. */
  absorb: 4,
  navyFrom: 0.6,
  navyTo: 2.8,
  /** How strongly the ripples' crests, the sky's reflection, the pale flow streaks and the sun's
   *  glint show. */
  crest: 0.3,
  reflect: 0.35,
  pale: 0.22,
  spec: 0.5,
} as const;

/** The High look's water (Map look 2, D284; #38, investigation/maplook2 water.ts, as Kyler approved it at
 *  e63a3ff, D177; its body colours and badwater's highlights from Timberborn's references, D334):
 *  display values before the light. `WATER_CALIBRATION` measures the Standard look only; High's
 *  colours are judged from captures beside the references, and its tone curve and grade finish them. Clean water by depth (shallow, a
 *  level deep, deep), its crests' streaks from above, low down and at a grazing angle; badwater's
 *  body (water partly bad blends to it as the Standard look's does: `WATER_BLEND`, `waterBlend` in
 *  the GLSL); badwater's troughs and streaks as offsets on its body (they may be negative); the glints; foam; the water's side (a step down, the map's edge);
 *  its section at the map's edge (#67 stage 1); mist and splash rings (#67 stage 2). */
export const HIGH_WATER = {
  /** Clean water by depth, from Timberborn's references (D334): a teal shallow, a darker body and a
   *  navy deep, which keeps its depth at a grazing angle too; badwater a deep crimson. Readability
   *  follows the game's (D334 (2)): deep clean water may be as dark as badwater, which reads by its
   *  colour, dullness, pink highlights, bubbles and red contact at rock, not by a lightness gap. */
  shallow: [0.13, 0.29, 0.36] as Rgb,
  body: [0.08, 0.20, 0.28] as Rgb,
  deep: [0.045, 0.12, 0.19] as Rgb,
  streakAbove: [45 / 255, 83 / 255, 96 / 255] as Rgb,
  streakLow: [56 / 255, 86 / 255, 98 / 255] as Rgb,
  grazing: [0.07, 0.14, 0.23] as Rgb,
  streakGrazing: [82.5 / 255, 127.5 / 255, 137 / 255] as Rgb,
  bad: [0.32, 0.075, 0.062] as Rgb,
  badTrough: [-18.5 / 255, -7 / 255, -6 / 255] as Rgb,
  badStreak: [10.5 / 255, 13 / 255, 4.5 / 255] as Rgb,
  glint: [0.97, 0.985, 1.0] as Rgb,
  badGlint: [0.86, 0.58, 0.55] as Rgb,
  foam: [0.9, 0.96, 0.98] as Rgb,
  badFoam: [0.31, 0.17, 0.085] as Rgb,
  sideShallow: [0.13, 0.58, 0.6] as Rgb,
  sideBody: [0.045, 0.36, 0.48] as Rgb,
  sideDeep: [0.025, 0.16, 0.3] as Rgb,
  sideBad: [0.19, 0.064, 0.034] as Rgb,
  sideBadDeep: [0.06, 0.022, 0.018] as Rgb,
  section: [0.18, 0.5, 0.55] as Rgb,
  sectionDeep: [0.075, 0.23, 0.3] as Rgb,
  sectionBad: [0.38, 0.14, 0.095] as Rgb,
  mist: [0.85, 0.94, 0.95] as Rgb,
  badMist: [0.67, 0.54, 0.36] as Rgb,
  ring: [0.8, 0.94, 0.93] as Rgb,
  badRing: [0.62, 0.45, 0.28] as Rgb,
} as const;

/** Clear water (D196, D212): the water see-through, so the bed, ledges and sources show; under and
 *  right round the brush while it paints a submerged bed, or the whole map with T. Clean water
 *  still reads as water: a faint blue tint (`WATER.clearTint`), its ripples catching the light and
 *  a soft bright line along its shore (`WATER.clearShore`), never pale grey glass. Badwater keeps
 *  its own crimson, murky and darker than the bed, its dull troughs and its slow glowing bubbles;
 *  never a hatching (D324, feedback item 5): it stays apart from clean water in greyscale and every
 *  colour-blindness by lightness, colour and texture (`look-readable.test.ts`). */
export const CLEAR_WATER = {
  /** Clean water's opacity, and how much more its ripples' crests and glints take. */
  opacity: 0.13,
  ripple: 0.1,
  /** How far the crests turn toward the shore's light. */
  rippleLight: 0.3,
  /** The line along the shore: its opacity, and its width (a share of a tile). */
  shoreOpacity: 0.6,
  shoreWidth: 0.2,
  /** Badwater's opacity: murky enough to stay darker than the bed it lies on. */
  badOpacity: 0.72,
  /** Round the brush, the clear water fades back to normal over this many tiles. */
  fade: 1.5,
  /** A clean fall, its splash and its crown keep this share of their opacity (D201): a faint veil of
   *  streaks and foam, so the cliff behind it and the bed below show; a badwater fall keeps its
   *  colour, at most `badOpacity` opaque. */
  fall: 0.3,
} as const;

/** Badwater's depth, opacity and surface. */
export const BADWATER = {
  /** The depth (levels) #38 calibrated badwater's colour at (`WATER_CALIBRATION`): `WATER.bad` there. */
  shallow: 0.25,
  /** How badwater's lightness goes with depth, as the game's (D496): Timberborn 1.1.2.8's PhysicalWaterURP
   *  multiplies its contaminated colour by the G channel of its `_DepthGradients` texture, sampled at depth
   *  / `_MaxDepth` (5 levels). Fitted at the cited depths: from `shallow`, luminance falls by e^-`first`
   *  a level down to `knee` levels deep (and rises as much above it, on a film), then by e^-`beyond` a
   *  level: 0.61 of it at half a level, 0.43 at one, 0.19 at two, 0.08 at three. */
  ramp: { first: 1.98, knee: 0.5, beyond: 0.8 },
  /** The share of badwater's light on screen that the ramp leaves alone (`badwaterBody`): the game lights
   *  its surface with a reflection that has no depth in it (metallic 0, so F0 0.04, about 0.6 of clean
   *  water's) and adds an emissive detail with no depth in it either, so deep badwater never goes black.
   *  0.17, option A's own floor, until an in-game measurement of a shallow and a deep badwater pool sets
   *  it. */
  floor: 0.17,
  /** Its opacity is the water's (`WATER_SURFACE.seeThrough`: the game shows the ground behind badwater as
   *  it does behind clean water); at the map's edge, the water's side. */
  side: 0.95,
  /** Its matte surface (#38's): how far the troughs and the subdued flow streaks turn toward their
   *  colours, and how little of the sky's reflection, the sun's glint and the glints shows (a
   *  twelfth of clean water's glints and glint, and a trace of the sky), and its bubbles' glow. */
  trough: 1,
  streak: 1,
  reflect: 0.03,
  spec: 0.04,
  glints: 0.028,
  bubbles: 0.55,
} as const;

/** Waterfalls (D201): how see-through a fall is between its streaks and on them (clean water),
 *  badwater's (murky), and its foam; the inner face shows `inner` of its opacity,
 *  behind the outer one. A fall's colours are the water's: clean water's light teal shallows with
 *  lighter teal streaks, badwater's crimson body with orange-red ones, little white (D334: the
 *  sheet well opaque, as the game's), and water partly bad between them by the blend (`WATER_BLEND`). */
export const WATER_FALL = {
  clear: 0.76,
  streak: 0.94,
  bad: 0.9,
  foam: 0.95,
  inner: 0.6,
  /** The whitewater where a fall lands (its crown and splash): how opaque, a share of `foam`, and
   *  how much of it is white over the water's own teal or crimson (D334: little white). */
  whitewater: 0.46,
  whitewaterTint: 0.2,
} as const;

/** Water of any depth draws as water, as the game draws it: a film is the same water as its body, not a faint
 *  tint over its ground (a wide sheet a tenth of a level deep, Delta 128² seed 2's, read as a green slab when it
 *  was one). In play the game draws every water tile with its opaque material; its High-quality variant shows the
 *  ground behind only as a small, water-tinted, desaturated share that thins with depth, the same for a film as
 *  for shallows (`investigation/notes/water_and_soil.md` Q8), and its Low variant shows none. Only a sliver `to`
 *  levels deep or less fades in (`waterFilm`, a smoothstep on the water's own depth): our own anti-aliasing of a
 *  shore's very edge, where the game clips hard at the floor. Both looks and the ground under the water read this
 *  one curve:
 *  - the water's opacity goes from `clean` (clean water) or `bad` (badwater, still murkier than clean
 *    water at the same depth) at no depth to its body's own opacity at `to`;
 *  - its shore foam keeps `foam` of itself on a film (a faint edge, not a pond's foam line);
 *  - the ground under it keeps its own soil, seen as through a coloured filter (`waterFilmGround`):
 *    its own detail (its lightness, and `keep` of its own hue under clean water, none under
 *    badwater) in the water's hue, clean water's shallow teal, badwater's crimson or the blend
 *    between them by the badwater share (`WATER_BLEND`, so mixed water passes the game's teal-grey and a
 *    muted warm grey-brown, never purple or mauve-grey; the ground's own hue goes as soon as any of it is bad),
 *    `gain` of the ground's lightness (clean, bad); the bed's
 *    own colour comes in along the same curve. So the hue is the water's at any depth. */
export const WATER_FILM = {
  to: 0.03,
  clean: 0.14,
  bad: 0.62,
  foam: 0.3,
  keep: 0.4,
  gain: [0.8, 0.45] as readonly [number, number],
  /** The crimson the ground takes under a badwater film: `WATER.bad` a touch cooler, as the ground's
   *  light is warmer than the water's, so the film lands on the body's own crimson hue. */
  badTint: [0.38, 0.14, 0.16] as Rgb,
  /** The same in the High look, cooler again for its warmer sun and grade (judged from captures beside
   *  its badwater's body). */
  highBadTint: [0.36, 0.1, 0.19] as Rgb,
} as const;

/** How far water `depth` levels deep has built from a film to its body: 0 with no depth, 1 at
 *  `WATER_FILM.to` and deeper. */
export function waterFilm(depth: number): number {
  return smooth(0, WATER_FILM.to, depth);
}

/** Display lightness weights (the film's filter keeps the ground's lightness in the water's hue). */
const DISPLAY_LUMA: Rgb = [0.2126, 0.7152, 0.0722];

/** The ground (a display colour) seen through a film of water with this badwater share (0-1), as the
 *  terrain shader draws it under thin water (`WATER_FILM`): its own detail in the water's hue. */
export function waterFilmGround(ground: Rgb, share: number, bad: Rgb = WATER_FILM.badTint): Rgb {
  const F = WATER_FILM;
  const m = waterTint(share);
  const tint = blendWater(WATER.shallow, bad, share);
  const tl = Math.max(1e-5, DISPLAY_LUMA[0] * tint[0] + DISPLAY_LUMA[1] * tint[1] + DISPLAY_LUMA[2] * tint[2]);
  const gl = DISPLAY_LUMA[0] * ground[0] + DISPLAY_LUMA[1] * ground[1] + DISPLAY_LUMA[2] * ground[2];
  const keep = F.keep * (1 - m) ** 4;
  const gain = F.gain[0] + (F.gain[1] - F.gain[0]) * m;
  return [0, 1, 2].map((k) => Math.max(0, Math.min(1, (gl + (ground[k] - gl) * keep) * (tint[k] / tl) * gain))) as unknown as Rgb;
}

/** How water turns from clean to bad with its badwater share `s` (0–1, blended between tiles by the water
 *  mesh), as the game draws it: Timberborn 1.1.2.8's water shader (`PhysicalWaterURP`, read from the game's
 *  own files) mixes the water's colour toward badwater's by one tint, smoothstep(`from`, `to`, s) ^ `power`
 *  (its material's `_MinContaminationThreshold`, `_MaxContaminationThreshold` and
 *  `_ContaminationNonlinearity`), and turns its surface matte by the same tint. So here the one tint
 *  (`waterTint`) carries everything toward badwater's look:
 *  - the colour, as the game mixes its colours: straight in linear light, so it greys as it turns rather
 *    than keeping its strength. Its lightness goes by the tint; its colour turns as the game's own two
 *    colours' mix turns, the game's clean water colour being `weight` times as light as its contaminated
 *    one (its material's `_Color` against `_Base_Contamination_Color_A` to `_B` at their middle, at
 *    `_Base_Contamination_Intensity_Low`), so both looks turn at the game's pace whatever their own
 *    colours' lightness. Under a hundredth bad the water is clean; a twentieth is a quarter of the way,
 *    a darker teal-grey (about the game's measured mixing zone, #2E444C); a tenth two fifths; a fifth
 *    over half, a grey; half bad over four fifths, a dull red-brown;
 *  - its opacity (the game's water is opaque at any share; ours keeps clean water see-through and
 *    badwater murky, and turns between them by the tint);
 *  - its dull surface: fewer glints and crests, badwater's troughs, streaks, foam and bubbles.
 *  The game's straight mix crosses a grey with a breath of mauve in it; ours never leans purple (D154):
 *  once red rises over green, blue stays under green, by `lean` of the gap (less near badwater, none at
 *  it), so the way from teal-grey to crimson is a muted warm grey-brown. While red is still under green,
 *  blue may sit over green by `room` times the gap, so clean water's own blue is never touched. */
export const WATER_BLEND = { from: 0.01, to: 1, power: 0.25, weight: 2.6, lean: 0.5, room: 4 } as const;

/** How the water's colours are measured on screen, as #38's colour check does
 *  (investigation/maplook2/colour-check.mjs), and what they should measure. `npx tsx
 *  tools/capture-badwater.ts --measure` runs it: a bed of water one badwater share and one depth
 *  all over, its soil as contaminated as the water, drawn by the site's renderer on the GPU (a
 *  browser that draws in software gets the Light look), the camera orbiting at `pitch` (70° down,
 *  or lower), yaw −0.55 and 44 away, the water held at 8 s; the central patch's pixels sorted by
 *  r + 2g + b and each band's mean. Every target must land within `tolerance`. */
export const WATER_CALIBRATION = {
  method: {
    viewport: [1440, 940] as readonly [number, number],
    bed: 64,
    yaw: -0.55,
    distance: 44,
    time: 8,
    patch: [240, 96] as readonly [number, number],
    bands: { trough: [0.05, 0.15], body: [0.15, 0.4], typical: [0.45, 0.55], streak: [0.96, 0.985] } as Record<string, readonly [number, number]>,
    /** Codes a measured band may be off its target, per channel. */
    tolerance: 2,
  },
  /** On-screen targets (0–255): badwater's were #38's, as Kyler approved them (its check:colour
   *  at e63a3ff: the typical texture, the troughs and the streaks of pure badwater a quarter level
   *  deep over a poisoned bed: [110, 52, 49], [94, 46, 43], [124, 69, 56]) and were re-measured
   *  once after D324's option (a) darkened badwater a little (with the land's colours moved too);
   *  clean water's are the Standard look as approved, re-measured after D304 fitted clean water's
   *  shades closer to the game's own, after D310 darkened `teal` and `navy` further and after D324
   *  brought `shallow` down, and all of them after #692 let the ground behind show by the game's share
   *  (`WATER_SURFACE.seeThrough`: badwater's poisoned bed now shows a sixth through it) and again once that
   *  ground showed as the game shows it, overlaid with the water's colour and desaturated (`behindTint`), 2026-10-29
   *  (they hold it still, until the next approved change). Measured with the
   *  Standard look held (`dgm.look` forced to `standard` before opening the page): a capable GPU
   *  picks High by itself once it exists, and `tools/capture-badwater.ts --measure` was found
   *  silently measuring High's water instead, drifting from these targets by the two looks' own
   *  difference, not a real change to Standard (found investigating the drift, D304's addition; the
   *  fix is in the tool, not here). */
  targets: [
    { name: "badwater, a quarter level deep, 70° down (#38)", share: 1, depth: 0.25, pitch: 1.22, bands: { typical: [91, 47, 43], trough: [79, 42, 39], streak: [101, 59, 49] } },
    { name: "clean water, a quarter level deep, 70° down", share: 0, depth: 0.25, pitch: 1.22, bands: { body: [50, 106, 122] } },
    { name: "clean water, 1.25 deep, 70° down", share: 0, depth: 1.25, pitch: 1.22, bands: { body: [39, 84, 98] } },
    { name: "clean water, 4.25 deep, 70° down", share: 0, depth: 4.25, pitch: 1.22, bands: { body: [35, 82, 96] } },
  ] as readonly { name: string; share: number; depth: number; pitch: number; bands: Record<string, readonly [number, number, number]> }[],
  /** The ground level under a bed of water this deep (so the camera sees the same scene as #38's). */
  floor(depth: number): number {
    return depth <= 0.25 ? 8 : depth <= 1.25 ? 7 : 4;
  },
} as const;

// ------------------------------------------------------------------------------ the colours

/** Luminance weights (Rec. 709, linear light). */
const luma = (c: Rgb) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
/** Display values to linear light and back (sRGB). */
const toLinear = (c: Rgb): Rgb => c.map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)) as unknown as Rgb;
const toDisplay = (c: Rgb): Rgb => c.map((v) => (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055)) as unknown as Rgb;
const mixRgb = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const smooth = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Clean water's depth as its colour and opacity see it, `fromBank` tiles from a bank. */
function seenDepth(depth: number, fromBank: number): number {
  const S = WATER_SURFACE;
  return depth * (S.bank + (1 - S.bank) * smooth(0, S.bankWidth, fromBank));
}

const absorbed = (d: number) => 1 - Math.exp(-d * WATER_SURFACE.absorb);

/** Clean water's body `depth` levels deep, `fromBank` tiles from a bank (open water by default). */
export function cleanWaterBody(depth: number, fromBank = 1): Rgb {
  const S = WATER_SURFACE;
  const d = seenDepth(depth, fromBank);
  return mixRgb(mixRgb(WATER.shallow, WATER.teal, absorbed(d)), WATER.navy, smooth(S.navyFrom, S.navyTo, d));
}

/** How badwater's lightness at this depth compares with its lightness `BADWATER.shallow` deep, as the
 *  game's (`BADWATER.ramp`): 1 there, more on a film, less deeper. */
export function badwaterRamp(depth: number): number {
  const R = BADWATER.ramp;
  const d = Math.max(0, depth);
  return Math.exp(-R.first * (Math.min(d, R.knee) - BADWATER.shallow) - R.beyond * Math.max(0, d - R.knee));
}

/** Badwater's body `depth` levels deep: `WATER.bad` at `BADWATER.shallow`, its light by the game's ramp
 *  (`badwaterRamp`, in linear light) but for the share that has no depth in it (`BADWATER.floor`). */
export function badwaterBody(depth: number): Rgb {
  const k = BADWATER.floor + (1 - BADWATER.floor) * badwaterRamp(depth);
  return toDisplay(toLinear(WATER.bad).map((v) => v * k) as unknown as Rgb);
}

/** How far water with this badwater share (0–1) has turned toward badwater's look (`WATER_BLEND`): 0 when
 *  clean (and under a hundredth bad), 1 when pure badwater. */
export function waterTint(share: number): number {
  const B = WATER_BLEND;
  return share > 0 ? Math.min(1, smooth(B.from, B.to, share) ** B.power) : 0;
}

/** Water between a clean colour and a bad one at a badwater share, as `WATER_BLEND` says, in linear
 *  light: its lightness by the tint, its colour as the game's mix turns, blue kept from leaning purple. */
export function blendWater(clean: Rgb, bad: Rgb, share: number): Rgb {
  if (!(share > 0)) return clean;
  if (share >= 1) return bad;
  const B = WATER_BLEND;
  const k = waterTint(share);
  const cl = toLinear(clean);
  const bl = toLinear(bad);
  const yc = Math.max(luma(cl), 1e-5);
  const yb = Math.max(luma(bl), 1e-5);
  const y = yc + (yb - yc) * k;
  const w = k / (B.weight * (1 - k) + k);
  const m = [0, 1, 2].map((i) => y * (cl[i] / yc + (bl[i] / yb - cl[i] / yc) * w));
  m[2] = Math.min(m[2], m[1] + (m[1] - m[0]) * (m[0] < m[1] ? B.room : B.lean * (1 - k)));
  return toDisplay(m as unknown as Rgb);
}

/** The body colour of water `depth` levels deep, `fromBank` tiles from a bank (open water by
 *  default), clean (false), pure badwater (true) or with a badwater share (0–1): before the light,
 *  the ripples, the foam and the glints (as the shader). */
export function waterBody(depth: number, bad: boolean | number, fromBank = 1): Rgb {
  const share = bad === true ? 1 : bad === false ? 0 : bad;
  return blendWater(cleanWaterBody(depth, fromBank), badwaterBody(depth), share);
}

/** The water's opacity where it is `depth` levels deep over its floor (seen depth), as the game draws it
 *  (`WATER_SURFACE.seeThrough`): the ground behind shows by `seeThrough` at the floor, none
 *  `seeThroughTo` deep. */
export function waterSeeThrough(depth: number): number {
  const S = WATER_SURFACE;
  return 1 - S.seeThrough * Math.max(0, 1 - depth / S.seeThroughTo);
}

/** The ground (a display colour) as it shows behind water of this colour, as the game's High quality draws
 *  it (`WATER_SURFACE.behindTint`, `behindSaturation`): on display values (the game renders in Gamma colour
 *  space), overlaid with the water's colour, then desaturated. */
export function waterGroundBehind(ground: Rgb, water: Rgb): Rgb {
  const S = WATER_SURFACE;
  const m = ground.map((v, i) => v + ((v <= 0.5 ? 2 * v * water[i] : 1 - 2 * (1 - v) * (1 - water[i])) - v) * S.behindTint);
  const y = luma(m as unknown as Rgb);
  return m.map((v) => Math.max(0, Math.min(1, y + (v - y) * S.behindSaturation))) as unknown as Rgb;
}

/** Badwater's opacity `depth` levels deep, `fromBank` tiles from a bank: the water's, a crimson tint on a
 *  sliver (`WATER_FILM`). */
export function badwaterOpacity(depth: number, fromBank = 1): number {
  const body = waterSeeThrough(seenDepth(depth, fromBank));
  const film = Math.min(WATER_FILM.bad, body);
  return film + (body - film) * waterFilm(depth);
}

/** The water's opacity `depth` levels deep and `fromBank` tiles from a bank, with a badwater share
 *  (clean by default), as the game's (`waterSeeThrough`), a faint tint on a sliver (`WATER_FILM`;
 *  as the shader, before foam and glints). */
export function waterOpacity(depth: number, fromBank = 1, share = 0): number {
  const body = waterSeeThrough(seenDepth(depth, fromBank));
  const clean = WATER_FILM.clean + (body - WATER_FILM.clean) * waterFilm(depth);
  return clean + (badwaterOpacity(depth, fromBank) - clean) * waterTint(share);
}

// ------------------------------------------------------------------------------ the shader's copy

const f = (v: number) => (Number.isInteger(v) ? `${v}.0` : String(v));
const glColor = (c: Rgb) => `vec3(${c.map((v) => f(Math.round(v * 1000) / 1000)).join(", ")})`;

/** The film's curve and numbers in GLSL, for the water's shaders and the ground's (the bed under thin
 *  water); part of `WATER_GLSL`. */
export const WATER_FILM_GLSL = /* glsl */ `
  #define WATER_FILM_CLEAN ${f(WATER_FILM.clean)}
  #define WATER_FILM_BAD ${f(WATER_FILM.bad)}
  #define WATER_FILM_FOAM ${f(WATER_FILM.foam)}
  /** How far water this deep has built from a film to its body (waterPalette.ts waterFilm). */
  float waterFilm(float depth) {
    return smoothstep(0.0, ${f(WATER_FILM.to)}, depth);
  }
`;

/** The High look's water colours in GLSL (`HIGH_WATER`): HW_ and the key in capitals. */
export const HIGH_WATER_GLSL = Object.entries(HIGH_WATER)
  .map(([k, c]) => `  #define HW_${k.replace(/[A-Z]/g, (m) => "_" + m).toUpperCase()} vec3(${c.map((v) => f(Math.round(v * 1e6) / 1e6)).join(", ")})`)
  .join("\n");

/** The same values and functions in GLSL, for every water shader: the colours as constants, and
 *  clean water's body and opacity, badwater's, and the blend between them. */
export const WATER_GLSL = /* glsl */ `
${WATER_FILM_GLSL}  #define WATER_SHALLOW ${glColor(WATER.shallow)}
  #define WATER_CREST ${glColor(WATER.crest)}
  #define FALL_TEAL ${glColor(WATER.fallTeal)}
  #define FALL_BAD ${glColor(WATER.fallBad)}
  #define FALL_BAD_STREAK ${glColor(WATER.fallBadStreak)}
  #define WATER_TEAL ${glColor(WATER.teal)}
  #define WATER_NAVY ${glColor(WATER.navy)}
  #define WATER_FOAM ${glColor(WATER.foam)}
  #define WATER_SKY ${glColor(WATER.sky)}
  #define WATER_PALE (WATER_SKY * 0.85)
  #define BADWATER_BODY ${glColor(WATER.bad)}
  #define BADWATER_DEEP ${glColor(WATER.badDeep)}
  #define BADWATER_TROUGH ${glColor(WATER.badTrough)}
  #define BADWATER_STREAK ${glColor(WATER.badStreak)}
  #define BADWATER_VEIN ${glColor(WATER.badVein)}
  #define BADWATER_FOAM ${glColor(WATER.badFoam)}
  #define WATER_SOURCE_GLOW ${glColor(WATER_UI.sourceGlow)}
  #define WATER_SOURCE_LIT ${glColor(WATER_UI.sourceLit)}
  #define WATER_CLEAR_TINT ${glColor(WATER.clearTint)}
  #define WATER_CLEAR_SHORE ${glColor(WATER.clearShore)}
  #define CLEAR_OPACITY ${f(CLEAR_WATER.opacity)}
  #define CLEAR_RIPPLE ${f(CLEAR_WATER.ripple)}
  #define CLEAR_RIPPLE_LIGHT ${f(CLEAR_WATER.rippleLight)}
  #define CLEAR_SHORE_OPACITY ${f(CLEAR_WATER.shoreOpacity)}
  #define CLEAR_SHORE_WIDTH ${f(CLEAR_WATER.shoreWidth)}
  #define CLEAR_BAD_OPACITY ${f(CLEAR_WATER.badOpacity)}
  #define CLEAR_FADE ${f(CLEAR_WATER.fade)}
  #define CLEAR_FALL ${f(CLEAR_WATER.fall)}
  #define WATER_CREST_AMOUNT ${f(WATER_SURFACE.crest)}
  #define WATER_REFLECT ${f(WATER_SURFACE.reflect)}
  #define WATER_PALE_AMOUNT ${f(WATER_SURFACE.pale)}
  #define WATER_SPEC ${f(WATER_SURFACE.spec)}
  #define WATER_EDGE ${f(WATER_SURFACE.edge)}
  #define BADWATER_TROUGH_AMOUNT ${f(BADWATER.trough)}
  #define BADWATER_STREAK_AMOUNT ${f(BADWATER.streak)}
  #define BADWATER_REFLECT ${f(BADWATER.reflect)}
  #define BADWATER_SPEC ${f(BADWATER.spec)}
  #define BADWATER_GLINTS ${f(BADWATER.glints)}
  #define BADWATER_BUBBLES ${f(BADWATER.bubbles)}
  #define BADWATER_SIDE ${f(BADWATER.side)}
  #define FALL_CLEAR ${f(WATER_FALL.clear)}
  #define FALL_STREAK ${f(WATER_FALL.streak)}
  #define FALL_FOAM ${f(WATER_FALL.foam)}
  #define FALL_WHITEWATER ${f(WATER_FALL.whitewater)}
  #define FALL_WHITEWATER_TINT ${f(WATER_FALL.whitewaterTint)}
  #define FALL_INNER ${f(WATER_FALL.inner)}
  #define BADWATER_FALL ${f(WATER_FALL.bad)}
  /** Clean water's depth as its colour and opacity see it, by how far the point is from a shore. */
  float waterSeenDepth(float depth, float shore) {
    return depth * mix(${f(WATER_SURFACE.bank)}, 1.0, smoothstep(0.0, ${f(WATER_SURFACE.bankWidth)}, shore));
  }
  float waterAbsorb(float d) {
    return 1.0 - exp(-d * ${f(WATER_SURFACE.absorb)});
  }
  vec3 cleanWaterBody(float d, float absorb) {
    return mix(mix(WATER_SHALLOW, WATER_TEAL, absorb), WATER_NAVY, smoothstep(${f(WATER_SURFACE.navyFrom)}, ${f(WATER_SURFACE.navyTo)}, d));
  }
  /** The water's opacity this deep over its floor, as the game's (waterPalette.ts waterSeeThrough). */
  float cleanWaterAlpha(float d) {
    return 1.0 - ${f(WATER_SURFACE.seeThrough)} * max(0.0, 1.0 - d / ${f(WATER_SURFACE.seeThroughTo)});
  }
  vec3 waterToLinear(vec3 c) {
    return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c));
  }
  vec3 waterToDisplay(vec3 v) {
    return mix(v * 12.92, 1.055 * pow(v, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, v));
  }
  /** Badwater's body at a depth (waterPalette.ts badwaterBody, badwaterRamp): its lightness by the game's
   *  _DepthGradients ramp. */
  vec3 badwaterBody(float depth) {
    float d = max(depth, 0.0);
    float k = ${f(BADWATER.floor)} + ${f(1 - BADWATER.floor)} * exp(-${f(BADWATER.ramp.first)} * (min(d, ${f(BADWATER.ramp.knee)}) - ${f(BADWATER.shallow)}) - ${f(BADWATER.ramp.beyond)} * max(0.0, d - ${f(BADWATER.ramp.knee)}));
    return waterToDisplay(waterToLinear(BADWATER_BODY) * k);
  }
  /** A badwater colour (its troughs, its streaks) darkened with depth as its body is. */
  vec3 badwaterShade(vec3 c, float depth) {
    return c * badwaterBody(depth) / BADWATER_BODY;
  }
  /** The ground as it shows behind water of this colour, as the game's (waterPalette.ts waterGroundBehind):
   *  on display values (the game renders in Gamma colour space). */
  vec3 waterGroundBehind(vec3 ground, vec3 water) {
    vec3 m = mix(ground, mix(2.0 * ground * water, 1.0 - 2.0 * (1.0 - ground) * (1.0 - water), step(0.5, ground)), ${f(WATER_SURFACE.behindTint)});
    float y = dot(m, vec3(0.2126, 0.7152, 0.0722));
    return clamp(mix(vec3(y), m, ${f(WATER_SURFACE.behindSaturation)}), 0.0, 1.0);
  }
  /** Badwater's opacity (waterPalette.ts badwaterOpacity): the water's, a crimson tint on a sliver. */
  float badwaterAlpha(float depth, float shore) {
    float body = cleanWaterAlpha(waterSeenDepth(depth, shore));
    return mix(min(WATER_FILM_BAD, body), body, waterFilm(depth));
  }
  /** How far water with this badwater share has turned toward badwater's look (waterPalette.ts waterTint). */
  float waterTint(float s) {
    return s > 0.0 ? min(1.0, pow(smoothstep(${f(WATER_BLEND.from)}, ${f(WATER_BLEND.to)}, s), ${f(WATER_BLEND.power)})) : 0.0;
  }
  /** Water between clean and bad at a badwater share (waterPalette.ts blendWater), in linear light: its
   *  lightness by the tint, its colour as the game's own turns, blue kept from leaning purple. */
  vec3 waterBlend(vec3 clean, vec3 bad, float s) {
    if (s <= 0.0) return clean;
    if (s >= 1.0) return bad;
    float k = waterTint(s);
    vec3 cl = waterToLinear(clean);
    vec3 bl = waterToLinear(bad);
    vec3 lw = vec3(0.2126, 0.7152, 0.0722);
    float yc = max(dot(cl, lw), 0.00001);
    float yb = max(dot(bl, lw), 0.00001);
    float w = k / (${f(WATER_BLEND.weight)} * (1.0 - k) + k);
    vec3 m = mix(yc, yb, k) * mix(cl / yc, bl / yb, w);
    m.b = min(m.b, m.g + (m.g - m.r) * (m.r < m.g ? ${f(WATER_BLEND.room)} : ${f(WATER_BLEND.lean)} * (1.0 - k)));
    return waterToDisplay(m);
  }
  /** The ground seen through a film of water with this badwater share, as through a coloured filter
   *  (waterPalette.ts waterFilmGround): its own detail in the water's hue. */
  #define WATER_FILM_BAD_TINT ${glColor(WATER_FILM.badTint)}
  #define WATER_FILM_HIGH_BAD_TINT ${glColor(WATER_FILM.highBadTint)}
  vec3 waterFilmGround(vec3 ground, float s, vec3 bad) {
    float m = waterTint(s);
    vec3 tint = waterBlend(WATER_SHALLOW, bad, s);
    vec3 dl = vec3(${DISPLAY_LUMA.map(f).join(", ")});
    float gl = dot(ground, dl);
    vec3 base = mix(vec3(gl), ground, ${f(WATER_FILM.keep)} * pow(1.0 - m, 4.0));
    return clamp(base * tint / max(dot(tint, dl), 0.00001) * mix(${f(WATER_FILM.gain[0])}, ${f(WATER_FILM.gain[1])}, m), 0.0, 1.0);
  }
`;
