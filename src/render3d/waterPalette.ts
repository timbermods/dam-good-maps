// The 3D view's water in one place (PLAN §20 D177): clean water's and badwater's colours, their
// opacity by depth, how water turns from clean to bad with its badwater share (the contamination
// blend), and how the colours are calibrated on screen. The Standard look's water shader (its falls are the
// water's own vertical faces, D201 amended 2026-10-29) reads it through `WATER_GLSL` (generated from these values; the Light look
// runs the same shader code), the legend and the tests read the values, and Map look 2's High
// shader reads it too (`HIGH_WATER`, `HIGH_WATER_GLSL`: #38's own inputs, beside Standard's), so the looks never
// drift apart. No other module defines a water colour (tests/unit/water-palette.test.ts). The 2D preview and the map file's thumbnail keep their own
// schematic colours; they are not the 3D view.
//
// Badwater is the game's (`GAME_BADWATER`, Q9 P9): its formula's red-brown by a grimy pattern the flow carries, and
// its glowing lines; #38's calibrated crimson (`WATER.bad`, `WATER_CALIBRATION`) stays as the other choice the pixel
// judge weighs (`GAME_BADWATER.use`, by look) and for the film's and clear water's tints. Colours are display values, before
// the light.
//
// Pure TypeScript, no three.js.

export type Rgb = readonly [number, number, number];

/** Badwater's crimson body (calibrated to #38's targets, then darkened a little by D324: L* 29.3 to 25.6, nearer the
 *  game's own murky reading; its `WATER_CALIBRATION` targets were re-measured once for it). The mine pit's margin
 *  under it that held it then (D178, D324's option (a)) is gone: by day the game draws the pit the lighter (D496 as
 *  amended 2026-11-07, `look-mine-ruins.test.ts`). High's surface draws it (`GAME_BADWATER.use.high`); Standard
 *  takes the game's formula. */
const BAD_BODY: Rgb = [0.379, 0.18, 0.158];

export const WATER = {
  /** Clean water, closer to the game's own shades (D304, sampled from Kyler's screenshot; `teal` and
   *  `navy` darkened further by D310, toward the game's own reading, while `shallow` and badwater
   *  hold the readability tests at their strictness before D304, never loosened). One consistent
   *  teal-blue body, a calmer surface with subtle ripples, still see-through so the bed
   *  shows through. `teal` and `navy` sit close to the game's own reading (D310: within about 3 L*
   *  of the sampled #305965/#264A58 — `navy` almost exactly `#264A58`'s own lightness). `shallow`
   *  stays above that literal reading, by exactly what the readability rules need: it clears
   *  badwater's body by `look-readable.test.ts`'s raw margin (0.3, restored by D310) and
   *  `look-waterfalls.test.ts`'s colour-blind margin (D201, at least 20 L*). D324 (option (a)) darkened
   *  badwater and the mine pit's earth first (see `BAD_BODY`), which let it come down from L* 65.9 to
   *  58.8; it is as low as the margin allows. Water still reads as water by its sheen and
   *  ripples, not by a wide light-to-dark swing across its own depths. */
  shallow: [0.245, 0.602, 0.654] as Rgb,
  /** The body of water a level or so deep (D310: close to the game's own #305965). */
  teal: [0.128, 0.328, 0.356] as Rgb,
  /** The body of deep water: only a little darker than `teal` (D310, close to the game's own
   *  #264A58), not the old navy. */
  navy: [0.117, 0.298, 0.324] as Rgb,
  foam: [0.9, 0.94, 0.95] as Rgb,
  /** The sky the water reflects: the game's reflection
   *  probe (`tools/reflection-probe.ts`) at the mip URP reads for the water's smoothness (perceptual roughness 0.75:
   *  0.75 × (1.7 − 0.7 × 0.75) × 6, mip 5.29, between its mips 5 and 6), toward a reflection 60° up (the view's
   *  pitch): its side faces' mean blended toward its top face's by 0.87. */
  sky: [0.402, 0.492, 0.617] as Rgb,
  /** Badwater's body a quarter level deep (#38's calibration depth), crimson, matte and murky;
   *  lighter on a film and darker deeper, as the game's (`BADWATER.ramp`, `badwaterBody`: D496); darker than clean
   *  water of the same depth, as the game's by day (D496 amended 2026-11-07). Unchanged by D310 (see `BAD_BODY`). */
  bad: BAD_BODY,
  /** The dark crimson under a badwater source's basin (not water: the basin's floor). */
  badDeep: [0.14, 0.066, 0.058] as Rgb,
  /** Foam on badwater (a source's welling water; the Flow view's threads). */
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

/** Clean water's surface, as the water shader draws it: the sun's sheen at the game's smoothness, and shallows
 *  showing a little of the bed, the more so toward the banks; its detail and ripples are the textures the flow carries
 *  (waterTextures.ts, Q9 P5). No foam along the shore, no glints, pale streaks or crests of our own: the game's water
 *  shader has none (amended 2026-10-29 and 2026-11-07, planning, D496's rule; the glints read as white specks, stars,
 *  on a wide river: showcase craft's look gap 4; the streaks and crests, Q9's terms ours only, D496 and D497 over
 *  D334). */
export const WATER_SURFACE = {
  /** How much of the ground behind the water shows through it, as the game draws it (its PhysicalWaterURP's
   *  High-quality variant; `investigation/notes/water_and_soil.md` Q8): `seeThrough` of it where the water
   *  meets its floor (`_TransparencyDepth` 0.35 × `_TransparencyDepthModifier` 0.5), thinning in step with
   *  depth to none `seeThroughTo` levels deep (`_MaxDepth`); clean water and badwater alike, so the water is
   *  83% opaque at its very edge and opaque deep down (`waterSeeThrough`). The light look follows the game's
   *  Low quality, which shows no ground. The water's side at the map's edge. */
  seeThrough: 0.175,
  seeThroughTo: 5,
  /** A fall's: the game draws a fall as the water mesh's own vertical face where the water steps down, with the same
   *  material as the surface, and where its waterfall mask lies (its FindWaterfalls pass: the tile a fall lands in,
   *  fallMask.ts, Q9 P1) shows the ground behind by `_TransparencyWaterfallDepth` 0.2 × `_TransparencyDepthModifier`
   *  0.5 in place of `seeThrough`'s 0.35: `fallSeeThrough` of it, the cliff right behind a face (D201 amended
   *  2026-10-29), thinning with depth on the water the fall lands in as `seeThrough` does (`waterSeeThrough`). */
  fallSeeThrough: 0.1,
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
  /** The sky's reflection and the sun's glint, as the game lights its water (URP, GGX, in Gamma colour space). Its
   *  smoothness is not the material's `_Smoothness` (0.672, a leftover the BRDF never reads) but the soft-light of
   *  its `WaterMetalAndGloss` texture's alpha at two panned samples: about `smoothness` (median 0.25; 0.15 to 0.44
   *  between the 5th and 95th percentiles). We draw our own slow noise with that spread (`smoothnessSpread` × the
   *  noise's swing round its middle), panned the same way, not the game's texture. Its metallic is 0 (the texture's
   *  red), so `f0` 0.04. The sky's reflection is added on top (URP's environment term), by the game's probe in the
   *  reflected direction with its head-on part where the look draws the game's light (`WATER_LIGHT`,
   *  `waterEnvironment`, `WATER_PROBE`); otherwise `reflection` × sky × (saturate(smoothness + f0) − f0) × (1 − N·V)^4
   *  / (1 + roughness²) (`waterSkyReflect`), `reflection` the game's reflection intensity, 1 (palette.ts
   *  `GAME_FINISH.reflectionIntensity`, kept here as a number: palette.ts imports this file) and `WATER.sky` its probe
   *  toward 60° up. The sun's glint is URP's GGX specular term × f0 (`waterSunGlint`), a faint sheen at this roughness. */
  smoothness: 0.25,
  smoothnessSpread: 0.6,
  f0: 0.04,
  reflection: 1,
  /** The game's own highlight (its PhysicalWaterURP, p036 791–835): a light tied to the camera, along its forward
   *  direction turned `horizon` of the way to the horizontal (`_LightHorizonBias`) and down by `tilt`
   *  (`_LightTilt`), its reflection off the ripples' normals to the eye raised to `exponent`, × (fresnel ^
   *  `fresnelPower` × 0.5 + 0.5), × the wrapped light (saturate(N·L) + `wrap`) / (1 + `wrap`), × (1 − |N.y|³)
   *  (only on the ripples' slopes), × `clean` to `bad` by the tint (`waterCameraHighlight`). It lands on slopes
   *  facing away from the camera. × the sun's colour, the game adds it twice: to the albedo, lit, and to the
   *  emission, unlit and unshadowed. */
  highlight: { exponent: 150, fresnelPower: 5, horizon: 0.9, tilt: 0.2, wrap: 0.4, clean: 1.1, bad: 0.4 },
} as const;

/** The game's reflection probe as its water reads it (Q9 P15; `tools/reflection-probe.ts`, read from the game's
 *  `sharedassets1.assets` "TimberbornEnvironmentRelfectionProbe", the `unity_SpecCube0` its water samples): URP samples
 *  it by the reflected direction, reflect(−V, N), at mip pr × (1.7 − 0.7 pr) × 6 (pr = 1 − smoothness: 3.7 to 6 for
 *  the water's gloss, its smoothness 0 to 0.55, 5.6 for badwater's), so its colour turns with the view: the horizon's haze, lighter, at a grazing
 *  look, the zenith's blue from above, the ground's darker colours where a ripple turns the reflection down. Its mips 3,
 *  4, 5 and 6 (`colours`, in that order) at each height of the reflected direction (`heights`, straight between; display
 *  values, as the game works in Gamma colour space), round the whole turn: the probe's own turn round the vertical is
 *  not the editor's, and its four side faces differ by about a tenth. The probe is baked and the same at every hour:
 *  the game's day only scales it by `RenderSettings.reflectionIntensity`, its day stage's 1 at every stage. */
export const WATER_PROBE = {
  heights: [-1, -0.5, 0, 0.15, 0.35, 0.6, 1],
  mips: [3, 4, 5, 6],
  colours: [
    [[0.155, 0.17, 0.13], [0.335, 0.378, 0.323], [0.548, 0.63, 0.685], [0.544, 0.644, 0.746], [0.468, 0.572, 0.711], [0.388, 0.485, 0.635], [0.314, 0.397, 0.548]],
    [[0.192, 0.218, 0.166], [0.363, 0.411, 0.391], [0.488, 0.571, 0.632], [0.496, 0.585, 0.675], [0.467, 0.565, 0.683], [0.413, 0.508, 0.644], [0.337, 0.423, 0.572]],
    [[0.249, 0.281, 0.235], [0.384, 0.44, 0.445], [0.448, 0.53, 0.585], [0.457, 0.545, 0.615], [0.452, 0.544, 0.637], [0.431, 0.524, 0.645], [0.368, 0.462, 0.609]],
    [[0.328, 0.374, 0.368], [0.377, 0.44, 0.481], [0.397, 0.47, 0.54], [0.403, 0.48, 0.561], [0.413, 0.495, 0.59], [0.416, 0.5, 0.603], [0.414, 0.504, 0.632]],
  ] as readonly (readonly Rgb[])[],
} as const;

/** The game's light on its water (Q9 P15, ps 905-1251: URP Lit at the water's metallic 0, in Gamma colour space), and
 *  which of its terms each look draws. The game: diffuse = albedo × 0.96 (URP's 0.96 × (1 − metallic)) × (the ambient
 *  probe's SH by the normal, turned to display values, + the sun's colour × N·L × its shadow); the environment = the
 *  probe (`WATER_PROBE`) by the reflected direction × the reflection intensity (1) × (f0 + (grazing − f0) ×
 *  (1 − N·V)^4) / (1 + roughness²), f0 0.04, grazing saturate(smoothness + 0.04), roughness (1 − smoothness)²; the
 *  sun's GGX: f0 × roughness² / (d² × max(0.1, (L·H)²) × (4 roughness + 2)), d = (N·H)² (roughness² − 1) + 1, × the
 *  sun's colour × N·L × its shadow; the emission (the camera highlight × the sun's colour, badwater's glowing lines)
 *  unlit; then the fog. The albedo it lights is the water's colour with the camera highlight in it (× the sun's colour)
 *  and the ground behind mixed in (P13).
 *  - `game` (by look): the environment by the reflected direction from the probe, the sun's GGX, and the sun's colour
 *    the game's on the highlight and the glint (its `_MainLightColor`: palette.ts GAME_LIGHT.sun), the highlight lit by
 *    the game's light; off, the look's light as before: Standard the sky's reflection from one probe colour toward 60°
 *    up (`WATER.sky`) and the glint in our own sun's colour, High none.
 *  - `held` (by look): the two terms #839 held back, the diffuse share at the water's own metallic 0 (`diffuse`, where
 *    the terrain's 0.912 is at 0.05) and the environment's head-on part (× f0); off, 0.912 and the grazing part alone.
 *  - `detail` (by look): the still detail albedo over clean water's colour (Q9 P6, ps 462-477: the clean colour ×
 *    the albedo, overlaid with the detail texture, as badwater's base colour is), which darkens and cools it to about
 *    0.55/0.70/0.75 of itself on average; its pattern since fix/water-detail (waterTextures.ts `makeDetailField`, at
 *    xz × 0.015, not carried by the flow; the light look draws it too, as the game's Low quality does), its mean
 *    (`GAME_BADWATER.detail`) before; off, the colour × the albedo alone.
 *  The pixel judge (tools/water-pixel-judge.ts --define WATER_GAME_LIGHT,WATER_HELD,WATER_DETAIL) compares each against
 *  the game's frames, per look, and each look takes what reads nearest the game over all its water (`judged`; a
 *  difference under the judge's 0.1 goes to the more of the game's own terms): all three in both looks. The game's
 *  light alone moved clean water further from the game's, as its excess was P6's missing overlay; with it, clean
 *  water and badwater both read nearer than on dev. */
export const WATER_LIGHT = {
  game: { standard: true, high: true } as const,
  held: { standard: true, high: true } as const,
  detail: { standard: true, high: true } as const,
  diffuse: 0.96,
  /** The judge's numbers (fix/water-sky; RMS distance to the game's pixels, display RGB 0–255; the sixteen day-lit start
   *  shots, each in its shot's light, `--water all`): clean water (37,853 tiles) and pure badwater (172), by look, for
   *  the light as on dev (`dev`: every switch off), the game's terms without the two #839 held (`game`), with them
   *  (`full`), P6's detail alone on dev's light (`detail`), and all three (`all`). High's badwater is its crimson but in
   *  `all`, which ships with the formula (`GAME_BADWATER.use`; 14.5 with the crimson). */
  judged: {
    standard: { clean: { dev: 13.1, game: 13.1, full: 15.7, detail: 10.0, all: 10.0 }, bad: { dev: 15.4, game: 15.5, full: 14.2, detail: 15.4, all: 14.2 } },
    high: { clean: { dev: 12.2, game: 13.0, full: 15.6, detail: 10.7, all: 9.9 }, bad: { dev: 14.6, game: 14.2, full: 14.5, detail: 14.6, all: 15.0 } },
    tiles: { clean: 37853, bad: 172 },
  },
  gap: {
    /** Clean water against pure badwater a level or two deep by day, on screen (D496): the judge's L* on the six
     *  day-lit start shots with badwater in view, the game's and each look's, and the spread of the game's own shots
     *  (clean water 31.0 to 33.5 on three, badwater 27.0 and 27.9 on two), which bounds the gap the game's frames allow:
     *  3.1 to 6.5 (D496's 4.2; 4.7 on these frames). The judge prints it for the shipped build against those frames
     *  (tools/water-pixel-judge.ts, "the gap by day"). Standard's 6.3 is within it, near its top (dev's 6.5 sat on it);
     *  High's 7.1 is not (7.3 on dev): its formula's badwater reads 2.2 L* under the game's by day, about 1 under
     *  Standard's, which is still to find. Both since fix/water-detail (P6's pattern; the probe from mip 3). */
    game: { clean: 32.2, bad: 27.5, cleanShots: [31.0, 33.5], badShots: [27.0, 27.9] },
    standard: { clean: 32.5, bad: 26.2 },
    high: { clean: 32.4, bad: 25.3 },
    tiles: { clean: 2336, bad: 73 },
  },
} as const;

/** The High look's water (Map look 2, D284; #38, investigation/maplook2 water.ts, as Kyler approved it at
 *  e63a3ff, D177; its body colours from Timberborn's references, D334): display values before the light.
 *  `WATER_CALIBRATION` measures the Standard look only; High's colours are judged from captures beside the
 *  references. Clean water by depth (shallow, a level deep, deep; its grazing and streak colours went with Q9's
 *  terms ours only, D496 and D497 over D334's own water terms); badwater's
 *  body (water partly bad blends to it as the Standard look's does: `WATER_BLEND`, `waterBlend` in
 *  the GLSL); foam; the water's side (a step down, the map's edge);
 *  its section at the map's edge (#67 stage 1). */
export const HIGH_WATER = {
  /** Clean water by depth, from Timberborn's references (D334): a teal shallow, a darker body and a
   *  navy deep, which keeps its depth at a grazing angle too; badwater a deep crimson. Readability
   *  follows the game's (D334 (2)): deep clean water may be as dark as badwater, which reads by its
   *  colour, dullness, glowing lines and the orange glow of its shallow edges, not by a lightness gap. */
  shallow: [0.13, 0.29, 0.36] as Rgb,
  body: [0.08, 0.20, 0.28] as Rgb,
  deep: [0.045, 0.12, 0.19] as Rgb,
  bad: [0.32, 0.075, 0.062] as Rgb,
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
} as const;

/** Clean water's colour as the game works it (Q9 P4; ps 348-352): lerp(`color` (`_Color` #446C71), `atMaxDepth`
 *  (`_AlbedoAtMaxDepth` #000F48), u) × the `_DepthGradients` texture's R at u × 2, u = depth / `maxDepth` (5 levels),
 *  on display values; then × the flow's albedo (waterTextures.ts) and lit. `ramp`: R (0–255) at depths in levels, as
 *  `tools/game-water-shader.py --textures` measures it (the texture's bilinear filtering included), read between them
 *  in straight lines. `use`: whether the looks draw clean water by it (true) or by their own calibrated colours
 *  (false, `cleanWaterBody`, `HIGH_WATER`, × the albedo over its mean): the pixel judge (tools/water-pixel-judge.ts)
 *  compares the two against the game's own shots and the closer ships: the formula, 15.0 from the game's pixels against
 *  our colour's 38.4 in Standard (High 14.9 against 20.8; dev 42.5 and 25.1), the RMS distance in display RGB over the
 *  8,574 clean tiles of six probe shots (River Valley, Lake Basin and Highlands, two seeds each). */
export const GAME_WATER = {
  use: true,
  color: [0x44 / 255, 0x6c / 255, 0x71 / 255] as Rgb,
  atMaxDepth: [0, 0x0f / 255, 0x48 / 255] as Rgb,
  maxDepth: 5,
  ramp: [
    [0, 245],
    [0.1, 238.7],
    [0.25, 196.3],
    [0.5, 157.4],
    [0.75, 144.9],
    [1, 133.7],
    [1.5, 111.3],
    [2, 90.2],
    [2.5, 69.0],
    [3, 50.8],
    [3.5, 32.6],
    [4, 18.5],
    [4.5, 4.1],
    [5, 0],
  ] as readonly (readonly [number, number])[],
} as const;

/** The `_DepthGradients` R ramp (0–1) at a depth (`GAME_WATER.ramp`). */
export function gameDepthR(depth: number): number {
  const r = GAME_WATER.ramp;
  const d = Math.max(0, Math.min(GAME_WATER.maxDepth, depth));
  for (let i = 1; i < r.length; i++) if (d <= r[i][0]) return (r[i - 1][1] + ((r[i][1] - r[i - 1][1]) * (d - r[i - 1][0])) / (r[i][0] - r[i - 1][0])) / 255;
  return r[r.length - 1][1] / 255;
}

/** Clean water's colour by the game's formula (`GAME_WATER`), before its albedo and light. */
export function gameCleanColour(depth: number): Rgb {
  const G = GAME_WATER;
  const u = Math.max(0, Math.min(1, depth / G.maxDepth));
  const k = gameDepthR(depth) * 2;
  return [0, 1, 2].map((i) => (G.color[i] + (G.atMaxDepth[i] - G.color[i]) * u) * k) as unknown as Rgb;
}

/** Badwater's colour as the game works it (Q9 P9; ps 640-790; its material `PhysicalWater_Opaque`), on display values:
 *  - the contaminated colour: lerp(`colorA` (`_Base_Contamination_Color_A`), `colorB` (`_B`), the pattern's R (the
 *    flow carries it: waterTextures.ts `makeBadwaterTexture`)) × an intensity, `intensity[0]` (`_Base_Contamination_
 *    Intensity_Low`) up to `intensityFrom` bad, easing to `intensity[1]` (`_High`) at pure badwater; overlaid with the
 *    still detail albedo (P6: the shaders' `waterDetail`, its pattern, waterTextures.ts `makeDetailField`; `detail` its
 *    mean, which the mirrors take; `detailOverlay` says whether the overlay is drawn) by 1 − c / 2; × the `_DepthGradients` texture's G at the depth (`ramp`); the shallow glow
 *    toward itself × (3, 1.5, 0) (`BADWATER.glow`);
 *  - mixed into clean water's albedo by the tint (`WATER_BLEND`), and lit as clean water is;
 *  - an emissive detail, unlit: lerp(`glowA` (`_Detail_Contamination_Color_A`), `glowB`, the noise's mean
 *    `glowNoise`) × the pattern's G × a modulation on a `gridTiles`-tile grid (d² + c × 0.1, held between `grid`, d a
 *    point's distance to the grid's nearest node in cells) × the tint × `glowIntensity[0]` (`_Detail_Contamination_
 *    Intensity_Low`) easing to `glowIntensity[1]` (`_High`) by `glowIntensityTo` bad;
 *  - its smoothness toward `BADWATER.smoothness` by the tint × the pattern's R; its normals × (1 + c).
 *  `use`: whether each look draws badwater's colour by it (true) or by its own calibrated crimson × the pattern's
 *  variation (false, `WATER.bad` in Standard, `HIGH_WATER.bad` in High, × the ramp, `BADWATER.floor`); the pattern,
 *  the emissive detail and the smoothness follow the game either way. The pixel judge (tools/water-pixel-judge.ts
 *  --water all) compares the two against the game's own badwater frames, each drawn in the game's light at the frame's
 *  hour (its land within the spread of the game's own), and each look takes whichever is closer in that look
 *  (`judged`; split by look 2026-11-07, planning on #236: one palette still feeds both looks, D154, but the two looks
 *  light their water apart, so the judge's choice can differ). The formula is closer in both looks since the game's
 *  light on the water (fix/water-sky; High drew its crimson before, which by day alone still reads a little nearer).
 *  Both keep the game's order by day, badwater darker than clean water of the same depth (D496 as amended
 *  2026-11-07). The formula's body is a near-black crimson (L* 3 a level deep, lit) that the sky's reflection, the
 *  see-through and the fog lift on screen to a dull grey-brown: the game's frames show by day a near-neutral grey
 *  (about 72/69/66), at sunrise and sunset a red-brown (about 82/62/55). */
export const GAME_BADWATER = {
  use: { standard: true, high: true } as const,
  /** The judge's numbers (RMS distance to the game's pixels, display RGB 0–255) for pure badwater, ours (our crimson)
   *  and the formula, by look: at the frames' hours (the six Islands and Badtide end shots, five at sunrise and one
   *  near sunset, 4,592 tiles) and by day (the sixteen day-lit start shots, six with badwater in view, 172 tiles), in
   *  the game's light on its water (`WATER_LIGHT`, fix/water-sky). */
  judged: {
    atHour: { standard: { ours: 19.9, formula: 7.1 }, high: { ours: 11.6, formula: 7.5 }, tiles: 4592 },
    day: { standard: { ours: 20.7, formula: 14.2 }, high: { ours: 14.5, formula: 15.0 }, tiles: 172 },
  },
  colorA: [0.02, 0.01993, 0.0196] as Rgb,
  colorB: [0.5, 0.1223, 0.04481] as Rgb,
  intensity: [1.75, 1] as readonly [number, number],
  intensityFrom: 0.6,
  detail: [69.7 / 255, 88.7 / 255, 95.3 / 255] as Rgb,
  detailOverlay: true,
  glowA: [0.851, 0.564, 0.3255] as Rgb,
  glowB: [0.88, 0.6111, 0.396] as Rgb,
  glowNoise: 119.4 / 255,
  glowIntensity: [4.5, 1.2] as readonly [number, number],
  glowIntensityTo: 0.4,
  gridTiles: 10,
  grid: [0.25, 0.55] as readonly [number, number],
  /** The pattern's means (R, G; waterTextures.ts `GAME_BADWATER_TEXTURE`), the flat surface's (the light look's). */
  pattern: [122.1 / 255, 19.6 / 255] as readonly [number, number],
  /** The grid's modulation's mean over a cell at pure badwater (d² + 0.1, held to `grid`). */
  gridMean: 0.302,
  /** `_DepthGradients` G (0–255) at depths in levels (`tools/game-water-shader.py --textures`), straight between. */
  ramp: [
    [0, 245],
    [0.1, 238.7],
    [0.25, 196.3],
    [0.5, 157.4],
    [0.75, 144.9],
    [1, 133.7],
    [1.5, 111.3],
    [2, 90.2],
    [2.5, 70.0],
    [3, 59.9],
    [3.5, 50.3],
    [4, 41.7],
    [4.5, 29.5],
    [5, 22.0],
  ] as readonly (readonly [number, number])[],
} as const;

/** Badwater's glowing lines' colour, its emissive detail's (`_Detail_Contamination_Color_A` toward `_B` by its noise's
 *  mean), for the legend. */
export const BADWATER_GLOW_COLOUR = GAME_BADWATER.glowA.map((a, i) => a + (GAME_BADWATER.glowB[i] - a) * GAME_BADWATER.glowNoise) as unknown as Rgb;

/** The `_DepthGradients` G ramp (0–1) at a depth (`GAME_BADWATER.ramp`). */
export function gameDepthG(depth: number): number {
  const r = GAME_BADWATER.ramp;
  const d = Math.max(0, Math.min(GAME_WATER.maxDepth, depth));
  for (let i = 1; i < r.length; i++) if (d <= r[i][0]) return (r[i - 1][1] + ((r[i][1] - r[i - 1][1]) * (d - r[i - 1][0])) / (r[i][0] - r[i - 1][0])) / 255;
  return r[r.length - 1][1] / 255;
}

/** Badwater's contaminated colour by the game's formula (`GAME_BADWATER`), `depth` levels deep, `c` bad (0–1), at a
 *  pattern R (0–1; its mean by default): before the blend into clean water and the light. */
export function gameBadwaterColour(depth: number, c: number, pattern: number = GAME_BADWATER.pattern[0]): Rgb {
  const B = GAME_BADWATER;
  const k = B.intensity[0] + (B.intensity[1] - B.intensity[0]) * Math.max(0, Math.min(1, (c - B.intensityFrom) / (1 - B.intensityFrom)));
  const col = [0, 1, 2].map((i) => (B.colorA[i] + (B.colorB[i] - B.colorA[i]) * pattern) * k);
  const over = col.map((v, i) => (v <= 0.5 ? 2 * v * B.detail[i] : 1 - 2 * (1 - v) * (1 - B.detail[i])));
  const mixed = B.detailOverlay ? col.map((v, i) => v + (over[i] - v) * (1 - c / 2)) : col;
  const g = gameDepthG(depth);
  const G = BADWATER.glow;
  const w = g ** G.power * Math.max(0, Math.min(1, 1 - c / G.upTo));
  return mixed.map((v, i) => v * g + (v * G.tint[i] - v * g) * w) as unknown as Rgb;
}

/** Badwater's emissive detail by the game's formula (`GAME_BADWATER`), `c` bad, at a pattern G (0–1) and the grid's
 *  modulation (its mean at pure badwater by default): unlit, added after the light. */
export function gameBadwaterEmission(c: number, pattern: number = GAME_BADWATER.pattern[1], grid: number = GAME_BADWATER.gridMean): Rgb {
  const B = GAME_BADWATER;
  const k = B.glowIntensity[0] + (B.glowIntensity[1] - B.glowIntensity[0]) * Math.min(1, Math.max(0, c) / B.glowIntensityTo);
  const s = pattern * grid * waterTint(c) * k;
  return [0, 1, 2].map((i) => (B.glowA[i] + (B.glowB[i] - B.glowA[i]) * B.glowNoise) * s) as unknown as Rgb;
}

/** Clear water (D196, D212): the water see-through, so the bed, ledges and sources show; under and
 *  right round the brush while it paints a submerged bed, or the whole map with T. Clean water
 *  still reads as water: a faint blue tint (`WATER.clearTint`), its ripples catching the light and
 *  a soft bright line along its shore (`WATER.clearShore`), never pale grey glass. Badwater keeps
 *  its own colour, murky and darker than the bed, and its glowing lines;
 *  never a hatching (D324, feedback item 5): it stays apart from clean water in greyscale and every
 *  colour-blindness by lightness, colour and texture (`look-readable.test.ts`). */
export const CLEAR_WATER = {
  /** Clean water's opacity, and how much more its ripples' crests take. */
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
} as const;

/** Badwater's depth, opacity and surface. */
export const BADWATER = {
  /** The depth (levels) #38 calibrated badwater's colour at (`WATER_CALIBRATION`): `WATER.bad` there. */
  shallow: 0.25,
  /** How badwater's lightness goes with depth, as the game's (D496): Timberborn 1.1.2.8's PhysicalWaterURP
   *  multiplies its contaminated colour by the G channel of its `_DepthGradients` texture, sampled at depth
   *  / `_MaxDepth` (5 levels), raw: the game renders in Gamma colour space, so the texture's values multiply
   *  the display colour as they are stored. Fitted at the cited depths: from `shallow`, the colour falls by
   *  e^-`first` a level down to `knee` levels deep (and rises as much above it, on a film), then by e^-`beyond`
   *  a level: 0.80 of it at half a level, 0.68 at one, 0.46 at two, 0.31 at three. */
  ramp: { first: 0.88, knee: 0.5, beyond: 0.39 },
  /** The share of badwater's light on screen that the ramp leaves alone (`badwaterBody`): the game lights
   *  its surface with a reflection that has no depth in it (metallic 0, so F0 0.04, about 0.6 of clean
   *  water's) and adds an emissive detail with no depth in it either, so deep badwater never goes black.
   *  On display values, as the game's Gamma maths: 0.37, option A's own floor (`badDeep` over `bad`), a stand-in
   *  until an in-game measurement of a shallow and a deep badwater pool sets it. */
  floor: 0.37,
  /** The glow of shallow water partly bad, as the game's (its PhysicalWaterURP: the contaminated colour goes
   *  toward itself × `tint` (red × 3, green × 1.5, no blue) by G ^ `power` × saturate(1 − share / `upTo`), G the
   *  `_DepthGradients` value at the depth, `atShallow` of it `shallow` deep): an orange glow on films and the
   *  shallowest edges of water partly bad, gone half a level down and in water `upTo` bad or worse. */
  glow: { tint: [3, 1.5, 0] as readonly [number, number, number], power: 10, upTo: 0.6, atShallow: 197.3 / 255 },
  /** Its opacity is the water's (`WATER_SURFACE.seeThrough`: the game shows the ground behind badwater as
   *  it does behind clean water); at the map's edge, the water's side. */
  side: 0.95,
  /** Its matte surface's smoothness, the game's (`_Contamination_Smoothness` 0.15, reached by the tint × its pattern's
   *  R: the sky and the sun's glint by the same lighting as clean water's, `WATER_SURFACE.smoothness`). */
  smoothness: 0.15,
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
 *  - the colour, as the game mixes its colours: straight, on display values (the game renders in Gamma
 *    colour space, so its lerp never goes to linear light), so it greys as it turns rather than keeping its
 *    strength. Under a hundredth bad the water is clean; a twentieth is a quarter of the way,
 *    a darker teal-grey (about the game's measured mixing zone, #2E444C); a tenth two fifths; a fifth
 *    over half, a grey; half bad over four fifths, a dull red-brown;
 *  - its opacity (the game's water is opaque at any share; ours keeps clean water see-through and
 *    badwater murky, and turns between them by the tint);
 *  - its dull surface, its smoothness, and badwater's glowing lines (its emissive detail, `GAME_BADWATER`).
 *  The game's straight mix crosses a grey with a breath of mauve in it; ours never leans purple (D154):
 *  once red rises over green, blue stays under green, by `lean` of the gap (less near badwater, none at
 *  it), so the way from teal-grey to crimson is a muted warm grey-brown. While red is still under green,
 *  blue may sit over green by `room` times the gap, so clean water's own blue is never touched. */
export const WATER_BLEND = { from: 0.01, to: 1, power: 0.25, lean: 0.5, room: 4 } as const;

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

/** Luminance weights (Rec. 709), on display values as the game works them (the ground behind the water, #707). */
const luma = (c: Rgb) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
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

/** Badwater's body `depth` levels deep: `WATER.bad` at `BADWATER.shallow`, scaled by the game's ramp
 *  (`badwaterRamp`, on display values as the game's Gamma maths) but for the share that has no depth in it
 *  (`BADWATER.floor`). */
export function badwaterBody(depth: number): Rgb {
  const k = BADWATER.floor + (1 - BADWATER.floor) * badwaterRamp(depth);
  return [WATER.bad[0] * k, WATER.bad[1] * k, WATER.bad[2] * k];
}

/** A badwater colour (`body`, from its base colour `base`) `depth` levels deep with this badwater share, with
 *  the game's glow of shallow water partly bad (`BADWATER.glow`). */
export function badwaterGlow(body: Rgb, base: Rgb, depth: number, share: number): Rgb {
  const G = BADWATER.glow;
  const w = (G.atShallow * badwaterRamp(depth)) ** G.power * Math.max(0, Math.min(1, 1 - share / G.upTo));
  if (!(w > 0)) return body;
  // (the game mixes toward the target unclamped: its red channel past 1 on a film)
  return [0, 1, 2].map((i) => body[i] + ((base[i] / G.atShallow) * G.tint[i] - body[i]) * w) as unknown as Rgb;
}

/** How far water with this badwater share (0–1) has turned toward badwater's look (`WATER_BLEND`): 0 when
 *  clean (and under a hundredth bad), 1 when pure badwater. */
export function waterTint(share: number): number {
  const B = WATER_BLEND;
  return share > 0 ? Math.min(1, smooth(B.from, B.to, share) ** B.power) : 0;
}

/** Water between a clean colour and a bad one at a badwater share, as `WATER_BLEND` says: straight, on display
 *  values, by the tint (the game's mix, in Gamma colour space), blue kept from leaning purple. */
export function blendWater(clean: Rgb, bad: Rgb, share: number): Rgb {
  if (!(share > 0)) return clean;
  if (share >= 1) return bad;
  const B = WATER_BLEND;
  const k = waterTint(share);
  const m = mixRgb(clean, bad, k) as [number, number, number];
  m[2] = Math.min(m[2], m[1] + (m[1] - m[0]) * (m[0] < m[1] ? B.room : B.lean * (1 - k)));
  return m;
}

/** The body colour of water `depth` levels deep, `fromBank` tiles from a bank (open water by
 *  default), clean (false), pure badwater (true) or with a badwater share (0–1): before the light,
 *  the ripples and the foam (as the shader). */
export function waterBody(depth: number, bad: boolean | number, fromBank = 1): Rgb {
  const share = bad === true ? 1 : bad === false ? 0 : bad;
  return blendWater(cleanWaterBody(depth, fromBank), badwaterGlow(badwaterBody(depth), WATER.bad, seenDepth(depth, fromBank), share), share);
}

/** The water's opacity where it is `depth` levels deep over its floor (seen depth), as the game draws it
 *  (`WATER_SURFACE.seeThrough`): the ground behind shows by `seeThrough` at the floor, none
 *  `seeThroughTo` deep; by `fallSeeThrough` where the game's waterfall mask `fall` is whole (fallMask.ts, Q9 P1:
 *  lerp(0.35, 0.2, w) × 0.5). */
export function waterSeeThrough(depth: number, fall = 0): number {
  const S = WATER_SURFACE;
  return 1 - (S.seeThrough + (S.fallSeeThrough - S.seeThrough) * fall) * Math.max(0, 1 - depth / S.seeThroughTo);
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
 *  as the shader, before foam). */
export function waterOpacity(depth: number, fromBank = 1, share = 0): number {
  const body = waterSeeThrough(seenDepth(depth, fromBank));
  const clean = WATER_FILM.clean + (body - WATER_FILM.clean) * waterFilm(depth);
  return clean + (badwaterOpacity(depth, fromBank) - clean) * waterTint(share);
}

// ------------------------------------------------------------------------------ the shader's copy

const f = (v: number) => (Number.isInteger(v) ? `${v}.0` : String(v));
const glColor = (c: Rgb) => `vec3(${c.map((v) => f(Math.round(v * 1000) / 1000)).join(", ")})`;
const glColor5 = (c: Rgb) => `vec3(${c.map((v) => f(Math.round(v * 1e5) / 1e5)).join(", ")})`;

/** A ramp (0–255 at depths in levels, straight between) as GLSL setting float `v` from float `d` (clamped already). */
function rampGlsl(ramp: readonly (readonly [number, number])[], v: string): string {
  const r5 = (x: number) => f(Math.round(x * 1e5) / 1e5);
  return [
    `    float ${v} = ${r5(ramp[ramp.length - 1][1] / 255)};`,
    ...ramp.slice(1).map(([d, x], i) => {
      const [d0, x0] = ramp[i];
      return `    ${i ? "else " : ""}if (d <= ${f(d)}) ${v} = mix(${r5(x0 / 255)}, ${r5(x / 255)}, (d - ${f(d0)}) / ${r5(d - d0)});`;
    }),
  ].join("\n");
}

/** The film's curve and numbers in GLSL, for the water's shaders and the ground's (the bed under thin
 *  water); part of `WATER_GLSL`. */
export const WATER_FILM_GLSL = /* glsl */ `
  #define WATER_FILM_CLEAN ${f(WATER_FILM.clean)}
  #define WATER_FILM_BAD ${f(WATER_FILM.bad)}
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
  #define WATER_TEAL ${glColor(WATER.teal)}
  #define WATER_NAVY ${glColor(WATER.navy)}
  #define WATER_FOAM ${glColor(WATER.foam)}
  #define WATER_SKY ${glColor(WATER.sky)}
  #define BADWATER_BODY ${glColor(WATER.bad)}
  #define BADWATER_DEEP ${glColor(WATER.badDeep)}
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
  #define WATER_EDGE ${f(WATER_SURFACE.edge)}
  #define WATER_SMOOTHNESS ${f(WATER_SURFACE.smoothness)}
  #define WATER_SMOOTHNESS_SPREAD ${f(WATER_SURFACE.smoothnessSpread)}
  #define BADWATER_SMOOTHNESS ${f(BADWATER.smoothness)}
  /** The sky's reflection's weight at a smoothness, as the game's URP environment term (waterPalette.ts
   *  WATER_SURFACE.smoothness): the part that rises toward the grazing angle. */
  float waterSkyReflect(float NoV, float smoothness) {
    float pr = 1.0 - smoothness;
    float r = max(pr * pr, 0.0078125);
    return ${f(WATER_SURFACE.reflection)} * (clamp(smoothness + ${f(WATER_SURFACE.f0)}, 0.0, 1.0) - ${f(WATER_SURFACE.f0)}) * pow(1.0 - clamp(NoV, 0.0, 1.0), 4.0) / (1.0 + r * r);
  }
  /** Which of the game's light terms on its water each look draws (waterPalette.ts WATER_LIGHT: \`game\`, \`held\`). */
  #define WATER_GAME_LIGHT ${WATER_LIGHT.game.standard ? 1 : 0}
  #define WATER_GAME_LIGHT_HIGH ${WATER_LIGHT.game.high ? 1 : 0}
  #define WATER_HELD ${WATER_LIGHT.held.standard ? 1 : 0}
  #define WATER_HELD_HIGH ${WATER_LIGHT.held.high ? 1 : 0}
  #define WATER_DETAIL ${WATER_LIGHT.detail.standard ? 1 : 0}
  #define WATER_DETAIL_HIGH ${WATER_LIGHT.detail.high ? 1 : 0}
  /** The game's still detail albedo here (Q9 P6: its \`PhysicalWaterDetailAlbedo\` at xz × 0.015, not carried by the
   *  flow): the water's shader sets it from its texture (waterTextures.ts \`waterDetailAt\`) before it colours a pixel;
   *  the texture's mean (GAME_BADWATER.detail) until then, and in any shader that doesn't. */
  vec3 waterDetail = ${glColor5(GAME_BADWATER.detail)};
  /** The game's still detail albedo's overlay (Q9 P6, ps 462-477: overlay(colour × albedo, the detail), per channel):
   *  × 2 × the detail where the colour is under a half, a screen above. */
  vec3 waterDetailOverlay(vec3 a) {
    return mix(2.0 * a * waterDetail, 1.0 - 2.0 * (1.0 - a) * (1.0 - waterDetail), step(0.5, a));
  }
  /** The game's reflection probe by a direction, at the mip URP reads for a smoothness (waterPalette.ts WATER_PROBE). */
  vec3 waterProbeAt(vec3 rd, float smoothness) {
    float pr = 1.0 - smoothness;
    float mip = clamp(pr * (1.7 - 0.7 * pr) * 6.0, ${f(WATER_PROBE.mips[0])}, ${f(WATER_PROBE.mips[WATER_PROBE.mips.length - 1])});
    float y = clamp(rd.y / max(length(rd), 0.0001), -1.0, 1.0);
${WATER_PROBE.mips.map((m, k) => `    vec3 m${m} = ${glColor(WATER_PROBE.colours[k][WATER_PROBE.heights.length - 1])};`).join("\n")}
${WATER_PROBE.heights
  .slice(1)
  .map((h, i) => {
    const h0 = WATER_PROBE.heights[i];
    const seg = (k: number) => `m${WATER_PROBE.mips[k]} = mix(${glColor(WATER_PROBE.colours[k][i])}, ${glColor(WATER_PROBE.colours[k][i + 1])}, t);`;
    return `    ${i ? "else " : ""}if (y <= ${f(h)}) { float t = (y - ${f(h0)}) / ${f(Math.round((h - h0) * 1e5) / 1e5)}; ${WATER_PROBE.mips.map((_, k) => seg(k)).join(" ")} }`;
  })
  .join("\n")}
${WATER_PROBE.mips
  .slice(1, -1)
  .map((m, k) => `    if (mip < ${f(m)}) return mix(m${WATER_PROBE.mips[k]}, m${m}, mip - ${f(WATER_PROBE.mips[k])});`)
  .join("\n")}
    return mix(m${WATER_PROBE.mips[WATER_PROBE.mips.length - 2]}, m${WATER_PROBE.mips[WATER_PROBE.mips.length - 1]}, mip - ${f(WATER_PROBE.mips[WATER_PROBE.mips.length - 2])});
  }
  /** The game's environment term on its water (waterPalette.ts WATER_LIGHT): the probe by the reflected direction ×
   *  the reflection intensity × (f0 × \`headOn\` + (grazing − f0) × (1 − N·V)^4) / (1 + roughness²); \`headOn\` 1 the
   *  game's, 0 its grazing part alone (WATER_LIGHT.held). */
  vec3 waterEnvironment(vec3 N, vec3 V, float smoothness, float headOn) {
    float pr = 1.0 - smoothness;
    float r = max(pr * pr, 0.0078125);
    float fresnel = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 4.0);
    float grazing = clamp(smoothness + ${f(WATER_SURFACE.f0)}, 0.0, 1.0);
    return ${f(WATER_SURFACE.reflection)} * waterProbeAt(reflect(-V, N), smoothness) * (${f(WATER_SURFACE.f0)} * headOn + (grazing - ${f(WATER_SURFACE.f0)}) * fresnel) / (1.0 + r * r);
  }
  /** The game's own highlight on the ripples (waterPalette.ts WATER_SURFACE.highlight), at a tint; the caller
   *  adds it × the sun's colour twice, before the light and after it. */
  float waterCameraHighlight(vec3 N, vec3 V, float tint) {
    // (the camera's forward direction: the view matrix's third row is its back axis)
    vec3 F = -normalize(vec3(viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2]));
    vec3 Fh = normalize(vec3(F.x, 0.0, F.z) + vec3(0.00001, 0.0, 0.0));
    vec3 Lc = normalize(mix(F, Fh, ${f(WATER_SURFACE.highlight.horizon)}) - vec3(0.0, ${f(WATER_SURFACE.highlight.tilt)}, 0.0));
    float spec = pow(clamp(dot(reflect(-Lc, N), V), 0.0, 1.0), ${f(WATER_SURFACE.highlight.exponent)});
    float fres = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), ${f(WATER_SURFACE.highlight.fresnelPower)});
    float wrap = clamp((clamp(dot(N, Lc), 0.0, 1.0) + ${f(WATER_SURFACE.highlight.wrap)}) / ${f(1 + WATER_SURFACE.highlight.wrap)}, 0.0, 1.0);
    float slope = max(0.0, 1.0 - pow(abs(N.y), 3.0));
    return wrap * (fres * 0.5 + 0.5) * spec * slope * mix(${f(WATER_SURFACE.highlight.clean)}, ${f(WATER_SURFACE.highlight.bad)}, tint);
  }
  /** The sun's glint at a smoothness, as the game's URP GGX specular term (× f0 and N·L; the caller multiplies
   *  by the sun's colour and its shadow). */
  float waterSunGlint(vec3 N, vec3 V, vec3 L, float smoothness) {
    float pr = 1.0 - smoothness;
    float r = max(pr * pr, 0.0078125);
    float r2 = r * r;
    vec3 H = normalize(L + V);
    float NoH = clamp(dot(N, H), 0.0, 1.0);
    float LoH = clamp(dot(L, H), 0.0, 1.0);
    float d = NoH * NoH * (r2 - 1.0) + 1.00001;
    return r2 / (d * d * max(0.1, LoH * LoH) * (4.0 * r + 2.0)) * ${f(WATER_SURFACE.f0)} * max(dot(N, L), 0.0);
  }
  #define BADWATER_SIDE ${f(BADWATER.side)}
  #define WATER_FALL_SEE_THROUGH ${f(WATER_SURFACE.fallSeeThrough)}
  /** Clean water's colour by the game's formula (waterPalette.ts GAME_WATER, gameCleanColour), before its albedo and
   *  light. */
  #define WATER_FORMULA ${GAME_WATER.use ? 1 : 0}
  vec3 gameCleanColour(float depth) {
    float d = clamp(depth, 0.0, ${f(GAME_WATER.maxDepth)});
${rampGlsl(GAME_WATER.ramp, "r")}
    return mix(${glColor(GAME_WATER.color)}, ${glColor(GAME_WATER.atMaxDepth)}, d / ${f(GAME_WATER.maxDepth)}) * r * 2.0;
  }
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
  /** The game's waterfall mask here (fallMask.ts, Q9 P1): the water's shader sets it before it colours a pixel of a
   *  look that follows the game's high-quality water; 0 in any shader that doesn't. */
  float waterFall = 0.0;
  /** The water's opacity this deep over its floor, as the game's (waterPalette.ts waterSeeThrough), by the waterfall
   *  mask (\`waterFall\`). */
  float cleanWaterAlpha(float d) {
    return 1.0 - mix(${f(WATER_SURFACE.seeThrough)}, ${f(WATER_SURFACE.fallSeeThrough)}, waterFall) * max(0.0, 1.0 - d / ${f(WATER_SURFACE.seeThroughTo)});
  }
  /** How light badwater is at a depth, against its colour BADWATER.shallow deep (waterPalette.ts badwaterBody):
   *  the game's _DepthGradients ramp but for the share with no depth in it, on display values. Both looks. */
  float badwaterLight(float depth) {
    float d = max(depth, 0.0);
    return ${f(BADWATER.floor)} + ${f(1 - BADWATER.floor)} * exp(-${f(BADWATER.ramp.first)} * (min(d, ${f(BADWATER.ramp.knee)}) - ${f(BADWATER.shallow)}) - ${f(BADWATER.ramp.beyond)} * max(0.0, d - ${f(BADWATER.ramp.knee)}));
  }
  /** Badwater's body at a depth (waterPalette.ts badwaterBody, badwaterRamp): its lightness by the game's
   *  _DepthGradients ramp. */
  vec3 badwaterBody(float depth) {
    return BADWATER_BODY * badwaterLight(depth);
  }
  /** The game's glow of shallow water partly bad (waterPalette.ts badwaterGlow): a badwater colour (body, from its
   *  base colour) toward base × (3, 1.5, 0) by G ^ 10 × saturate(1 − share / 0.6). */
  vec3 badwaterGlow(vec3 body, vec3 base, float depth, float s) {
    float d = max(depth, 0.0);
    float g = ${f(BADWATER.glow.atShallow)} * exp(-${f(BADWATER.ramp.first)} * (min(d, ${f(BADWATER.ramp.knee)}) - ${f(BADWATER.shallow)}) - ${f(BADWATER.ramp.beyond)} * max(0.0, d - ${f(BADWATER.ramp.knee)}));
    float w = pow(g, ${f(BADWATER.glow.power)}) * clamp(1.0 - s / ${f(BADWATER.glow.upTo)}, 0.0, 1.0);
    return mix(body, base / ${f(BADWATER.glow.atShallow)} * vec3(${BADWATER.glow.tint.map(f).join(", ")}), w);
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
  /** Water between clean and bad at a badwater share (waterPalette.ts blendWater): straight, on display values,
   *  by the tint (the game's mix), blue kept from leaning purple. */
  vec3 waterBlend(vec3 clean, vec3 bad, float s) {
    if (s <= 0.0) return clean;
    if (s >= 1.0) return bad;
    float k = waterTint(s);
    vec3 m = mix(clean, bad, k);
    m.b = min(m.b, m.g + (m.g - m.r) * (m.r < m.g ? ${f(WATER_BLEND.room)} : ${f(WATER_BLEND.lean)} * (1.0 - k)));
    return m;
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
  /** Badwater by the game's formula (waterPalette.ts GAME_BADWATER, gameBadwaterColour, gameBadwaterEmission): its
   *  contaminated colour at a depth, a share c and a pattern R, before the blend and the light; its emissive detail at a
   *  share, a pattern G and a point g (tiles), unlit. */
  #define BADWATER_FORMULA ${GAME_BADWATER.use.standard ? 1 : 0}
  #define BADWATER_FORMULA_HIGH ${GAME_BADWATER.use.high ? 1 : 0}
  #define BADWATER_DETAIL ${GAME_BADWATER.detailOverlay ? 1 : 0}
  #define BADWATER_PATTERN_FLAT vec2(${GAME_BADWATER.pattern.map((v) => f(Math.round(v * 1e5) / 1e5)).join(", ")})
  float gameDepthG(float depth) {
    float d = clamp(depth, 0.0, ${f(GAME_WATER.maxDepth)});
${rampGlsl(GAME_BADWATER.ramp, "g")}
    return g;
  }
  vec3 gameBadwaterColour(float depth, float c, float pattern) {
    float k = mix(${f(GAME_BADWATER.intensity[0])}, ${f(GAME_BADWATER.intensity[1])}, clamp((c - ${f(GAME_BADWATER.intensityFrom)}) / ${f(Math.round((1 - GAME_BADWATER.intensityFrom) * 1e5) / 1e5)}, 0.0, 1.0));
    vec3 col = mix(${glColor5(GAME_BADWATER.colorA)}, ${glColor5(GAME_BADWATER.colorB)}, pattern) * k;
    vec3 over = waterDetailOverlay(col);
    #if BADWATER_DETAIL
      col = mix(col, over, 1.0 - c * 0.5);
    #endif
    float g = gameDepthG(depth);
    float w = pow(g, ${f(BADWATER.glow.power)}) * clamp(1.0 - c / ${f(BADWATER.glow.upTo)}, 0.0, 1.0);
    return mix(col * g, col * vec3(${BADWATER.glow.tint.map(f).join(", ")}), w);
  }
  /** Our crimson's variation by the pattern (a look whose GAME_BADWATER.use is false): the game's base colour at a
   *  pattern R over it at the pattern's mean. */
  vec3 badwaterPatternShade(float pattern) {
    return mix(${glColor5(GAME_BADWATER.colorA)}, ${glColor5(GAME_BADWATER.colorB)}, pattern) / mix(${glColor5(GAME_BADWATER.colorA)}, ${glColor5(GAME_BADWATER.colorB)}, BADWATER_PATTERN_FLAT.x);
  }
  vec3 gameBadwaterEmission(float c, float pattern, vec2 g) {
    vec2 q = fract(g / ${f(GAME_BADWATER.gridTiles)} + vec2(0.5, 0.0));
    vec2 e = min(q, 1.0 - q);
    float grid = clamp(dot(e, e) + c * 0.1, ${f(GAME_BADWATER.grid[0])}, ${f(GAME_BADWATER.grid[1])});
    float k = mix(${f(GAME_BADWATER.glowIntensity[0])}, ${f(GAME_BADWATER.glowIntensity[1])}, clamp(c / ${f(GAME_BADWATER.glowIntensityTo)}, 0.0, 1.0));
    return ${glColor5(GAME_BADWATER.glowA.map((a, i) => a + (GAME_BADWATER.glowB[i] - a) * GAME_BADWATER.glowNoise) as unknown as Rgb)} * pattern * grid * waterTint(c) * k;
  }
`;
