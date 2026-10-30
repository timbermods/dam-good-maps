// The 3D view's colours (ROADMAP "Map look", PLAN §20 D86, D110, D114 and Kyler's clean look), in
// one place: the shaders and models read them and the legend shows the same swatches, so the legend
// always says what the scene shows. The clean view is as close to the game as we can make it with
// our own shaders (Kyler's reference screenshots, D334: follow Timberborn's references): moist ground
// a muted grass green (living plants grow), dry ground cracked earth in a warm brown drifting to mauve,
// contamination a layer over either (sparse orange-red fissures, wider and glowing a little more the
// more contaminated, through earth and grass alike), clean water a deep teal body darkening with depth, clear in
// the shallows (the water's own palette is waterPalette.ts, D177), and ground under water a dark
// wet bed; a toggle switches the ground to height colours.
// Walls are cobbled stone, lighter higher up as the game's cliffs. Colours are display values (the
// renderer outputs them without conversion).
//
// Readability follows the game's own (D334): its look and its cues, with no lightness gap or pattern
// beyond the game's. Grass reads apart from dry earth by its hue and its painted strokes, contamination by
// its orange-red veins over either soil, badwater by its crimson, its dullness and its bubbles (and in
// High its pink caustics and red contact at rock). Clean water reads as water by its glints and ripple crests and its see-through shallows, and in
// colour by its blue. Badwater is darker than clean water of the same depth in Standard, darkening with depth as the game's
// (D496), and dull; water partly
// bad turns smoothly from one to the other over a few tiles where they meet, greying as it turns as the
// game's does (a teal-grey, a grey, a dull red-brown, crimson), never in streaks, patches or purple
// (D177, D496). Living trees are dark, dead trees pale. The walls, in the side light, are darker than the ground above them. The information
// layer (**Markers**) adds dam sites, hatched light and dark with a dark rim so they show on any
// ground or water, slope arrows and a pale line at every level.
//
// Pure TypeScript, no three.js: the unit tests and the page's legend read it too.

import { BADWATER, WATER, waterBody, type Rgb } from "./waterPalette";

// The water's colours, opacity and blend live in waterPalette.ts (D177); they are re-exported here
// for the pages and tests that read the palette.
export { BADWATER, blendWater, badwaterBody, badwaterOpacity, cleanWaterBody, WATER, WATER_BLEND, WATER_CALIBRATION, WATER_SURFACE, WATER_UI, waterBody, waterOpacity, waterTint, type Rgb } from "./waterPalette";

/** What colours the tops of the ground. */
export type GroundMode = "moisture" | "height";

/** A tile's ground, as its colour shows it. */
export type GroundKind = "moist" | "dry" | "contaminated" | "underwater";

/** How the game's terrain shows soil moisture (SoilMoistureSystem `UpdateDesertIntensity`, its `SoilMoistureSimulatorSpec`
 *  blueprint): its desert texture over all of a top at moisture 0, over (1 − m / threshold) × max of one at moisture m up to
 *  the threshold, none above (the shaders' `grassOf`; D135 as amended 2026-10-29). */
export const DESERT = { threshold: 5, max: 0.7 } as const;

export const GROUND = {
  /** Dry ground: cracked earth in a warm brown, with dark cracks; plants die there. Broad patches
   *  drift between it, a cooler mauve and a warmer tan (D334, from Timberborn's references: the earth
   *  may be warm brown and mauve, amending D324's neutral grey-beige; D346: from above a little greyer and
   *  less saturated, a muted brown-mauve with grey patches, as the game's overview reads). Grass a muted green, darker
   *  and less yellow than it was (the game's L* 50-55 on screen, D324); it reads apart from dry earth
   *  as it does in the game, by hue and its painted strokes, with no lightness gap asked beyond the
   *  game's own (D334 (2); `look-readable.test.ts` reports the colour-blindness simulations as
   *  information).
   *  Calibrated to the game's textures (D497): the patterns' mean albedo, measured in the page with the light, the
   *  altitude ramp and the haze off (`tools/albedo-means.ts`), is the mean of the game's texture times its detail
   *  texture doubled (TerrainURP: base × GrassDetailsAlbedo × 2; GrassDetailsAlbedo's mean 140 makes that × 1.098): dry
   *  ground the `Desert` texture's 63/52/42 (TerrainMaterialMap.blueprint.json `DesertTexture`), so 69/57/46; grass
   *  the `Grass` texture's 67/73/25, so 74/80/27 (means of the 64² mips, 0–255, read raw as the game reads them in Gamma
   *  colour space). Each colour of a kind was scaled by the same factor per channel, so the patterns keep their shapes. */
  dry: [0.283, 0.234, 0.187] as Rgb,
  /** Dry ground's cooler, greyer patches. */
  dryCool: [0.271, 0.24, 0.223] as Rgb,
  /** Dry ground's warmer, browner patches. */
  dryWarm: [0.318, 0.255, 0.191] as Rgb,
  /** The cracks in dry ground. */
  crack: [0.116, 0.082, 0.064] as Rgb,
  /** Moist ground at the edge of the moist area (the least moisture): a muted grass green. */
  moistLow: [0.36, 0.377, 0.135] as Rgb,
  /** Moist ground by the water (the most moisture), a little deeper green. */
  moistHigh: [0.336, 0.361, 0.128] as Rgb,
  /** Contamination (badwater spoils the soil and plants die) in the light look, which draws no
   *  veins: a rust tint over dry earth... */
  contaminated: [0.4, 0.2, 0.14] as Rgb,
  /** ...and a dark red one over grass. */
  contaminatedWet: [0.34, 0.09, 0.06] as Rgb,
  /** The glow of the veins' cores (`CONTAMINATION`), added after the light. */
  contaminatedGlow: [0.96, 0.52, 0.2] as Rgb,
  /** Ground under water (seen through it). */
  underwater: [0.36, 0.38, 0.34] as Rgb,
} as const;

/** Juice (D205): the dust a lowered stroke puffs up (a light, dry earth), and a source's splash
 *  (the editor's water-blue). A carve at work (D199): the foam surging round its head, the blocks
 *  crumbling at its front (the cut earth), and the muddy water along its last stretch. */
export const JUICE = {
  dust: [0.72, 0.65, 0.54] as Rgb,
  splash: [0.35, 0.82, 1.0] as Rgb,
  foam: [0.92, 0.96, 0.87] as Rgb,
  debris: [0.59, 0.51, 0.41] as Rgb,
  mud: [0.57, 0.5, 0.34] as Rgb,
  /** A badwater carve's surge (an unleashed badwater source, D239): murky, never the clean mud. */
  badMud: [0.36, 0.3, 0.2] as Rgb,
  /** The other forces (D202, D203, D206): an impact's dust, flash and falling streak and the
   *  blocks it throws; a fault's crack. */
  impactDust: [0.78, 0.7, 0.58] as Rgb,
  impactFlash: [1.0, 0.96, 0.84] as Rgb,
  streak: [1.0, 0.86, 0.53] as Rgb,
  rock: [0.45, 0.39, 0.3] as Rgb,
  crack: [0.2, 0.18, 0.16] as Rgb,
  /** An eruption's fresh rock (#367): the ground it raised, ash grey from dark basalt to pale ash,
   *  never the grass or earth it rose from, until its heat fades into the ground's own colours. */
  ashDark: [0.2, 0.198, 0.195] as Rgb,
  ashPale: [0.38, 0.372, 0.36] as Rgb,
  /** Glaciate's ice (D246, from investigation/glaciate `effects.ts`): its deep blue and its white. */
  iceDeep: [0.32, 0.66, 0.78] as Rgb,
  ice: [0.9, 0.97, 1.0] as Rgb,
  /** Erode's dust (D281): fine rock dust, the walls' olive-grey stone ground pale, and a warmer brown. */
  wearDust: [0.64, 0.62, 0.52] as Rgb,
  wearDustWarm: [0.62, 0.54, 0.43] as Rgb,
} as const;

/** Height colours (the toggle): the low and high ends of the ramp, as before Map look. */
export const HEIGHT_RAMP = { low: [0.478, 0.588, 0.329] as Rgb, high: [0.769, 0.698, 0.549] as Rgb } as const;

/** The block walls: cobbled stone, as the game's cliffs (D497): the stone and mortar calibrated so their pattern's
 *  mean albedo (`tools/albedo-means.ts`) is the game's `CliffDetail` texture's mean, 68/62/52, and tinted by height as
 *  the game's Cliff, CliffEdge and SlopeCliff materials tint it: `_SplatGradientMin` at level 0 to `_SplatGradientMax`
 *  at `ALTITUDE_RAMP.ceiling` (22), unclamped. With **Markers** on, a pale ledge over a dark groove between levels, so
 *  levels can be counted (an editing aid, untinted). */
export const WALL = {
  stone: [0.334, 0.307, 0.259] as Rgb,
  mortar: [0.108, 0.097, 0.085] as Rgb,
  ledge: [0.8, 0.78, 0.68] as Rgb,
  groove: [0.08, 0.08, 0.07] as Rgb,
  gradient: { min: [0.4157, 0.4314, 0.4745] as Rgb, max: [0.9412, 0.9255, 0.8941] as Rgb },
} as const;

/** Contamination as a layer, as in the game (Kyler, 2026-09-25; D334: the game's own look and cues):
 *  sparse, irregular orange-red fissures over the ground's own colour, through dry earth and grass
 *  alike, thick main cracks with thinner branches meeting at the same junctions, wider and glowing a
 *  little more the more contaminated; the ground between them keeps its own colour. The terrain
 *  shader reads these (`veinsOf`, the full looks; the light look tints instead, `GROUND.contaminated`). */
export const CONTAMINATION = {
  /** The veins' colour, over either soil. */
  vein: [0.52, 0.13, 0.035] as Rgb,
  /** How much of the soil under a vein its colour covers. */
  cover: 0.92,
  /** A vein's half-width, a share of the vein network's cell (about a tile and a half): its thinnest
   *  branch and its thickest main crack... */
  width: [0.007, 0.039] as const,
  /** ...times this, from the least to the most contamination. */
  widthByLevel: [0.65, 1] as const,
  /** The glow of a vein's core, at the least and the most contamination, and how strongly the glow
   *  shines (added after the light, so it shows in shade too). */
  glow: [0.16, 0.3] as const,
  glowAdd: 0.85,
  /** The contamination (0–1) by which the veins have come in fully (none at zero). */
  onset: 0.06,
} as const;

/** With **Markers** on, an outline where contaminated ground ends: a light line between dark
 *  edges, so it shows on grass, earth and at the water's edge, in any colours. */
export const CONTAMINATION_OUTLINE = { light: [1, 0.86, 0.6] as Rgb, dark: [0.1, 0.03, 0.02] as Rgb } as const;

/** The contamination layer at a contamination level (0–1), as the terrain shader draws it: how
 *  much of it has come in (0 at zero contamination), its veins' width as a share of their widest,
 *  and the glow of their cores. */
export function contaminationVeins(level: number): { onset: number; width: number; glow: number } {
  const C = CONTAMINATION;
  const l = Math.max(0, Math.min(1, level));
  const lerp = (r: readonly [number, number]) => r[0] + (r[1] - r[0]) * l;
  return { onset: smooth(0, C.onset, l), width: lerp(C.widthByLevel), glow: lerp(C.glow) };
}

/** A vein's core as drawn in full light over the soil `soil` (a ground colour), at a contamination
 *  level (0–1): the vein's orange-red over the soil, with its glow; the soil itself at zero. */
export function contaminationVein(level: number, soil: Rgb): Rgb {
  const v = contaminationVeins(level);
  const k = CONTAMINATION.cover * v.onset;
  const glow = CONTAMINATION.glowAdd * v.glow * v.onset;
  const at = (i: number) => Math.min(1, soil[i] + (CONTAMINATION.vein[i] - soil[i]) * k + glow * GROUND.contaminatedGlow[i]);
  return [at(0), at(1), at(2)];
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Dead trees: bare, pale wood (no crown), so they read as dead in any colours; the models use a
 *  greyer tone of it, so dead trees sit back in the landscape. */
export const DEAD_TREE: Rgb = [0.82, 0.78, 0.72];

/** Living trees' crowns (the legend; each species has its own shade in the models). */
export const LIVING_TREE: Rgb = [0.11, 0.27, 0.15];

/** A hatched overlay (alpha 255): light stripes in the overlay's colour, dark stripes, and a
 *  dark rim round the hatched tiles. */
export const HATCH = { dark: [0.06, 0.05, 0.04] as Rgb } as const;

/** The layer cut's cap (D207: where solid rock crosses the cut): a section through rock, a cool slate darker than the
 *  ground's tops round it, hatched with lighter diagonal stripes (materials.ts, `capped`). */
export const CUT_CAP = { base: [0.25, 0.265, 0.3] as Rgb, line: [0.36, 0.375, 0.41] as Rgb } as const;

/** The start: a timber lodge with pale walls, a dark roof and a yellow banner on a pale deck. */
export const START = {
  walls: [0.86, 0.78, 0.62] as Rgb,
  roof: [0.42, 0.13, 0.09] as Rgb,
  deck: [0.74, 0.62, 0.44] as Rgb,
  banner: [1.0, 0.82, 0.16] as Rgb,
} as const;

/** Ruins (Kyler's rounds, D178; D334: bright orange with cream, near and far, as Timberborn's
 *  references): ruined scaffold towers, one storey per level: thin orange posts, beams and braces
 *  (#D4781F), cream sacks and slab panels (#E3CF96) and, on moist ground, ivy (#405634, the brighter
 *  green on its clusters' edges) draped over about the lower half of the storeys, the sacks' middles
 *  showing through. From afar each storey is a block in the scaffolding's orange (what makes ruins
 *  read from afar), a cream panel set in where it has one. Both stand apart from contaminated ground. */
export const RUIN = {
  rust: [0.83, 0.47, 0.12] as Rgb,
  panel: [0.89, 0.81, 0.59] as Rgb,
  ivy: [0.251, 0.337, 0.204] as Rgb,
  /** The ivy's brighter leaves, on its clusters' edges. */
  leaf: [0.36, 0.5, 0.24] as Rgb,
  /** The far block's own colour (D305; D334: the near skeleton's orange as seen from afar, a little
   *  darker, #B86E30, not D305's muted rust), apart from contaminated ground in lightness
   *  (`look-water-slopes.test.ts`). Both the far block's four faces and its top use it; the lattice
   *  pattern (materials.ts, `RUIN_LATTICE_SCALE`) is what tells it apart from a solid box. */
  far: [0.72, 0.43, 0.19] as Rgb,
} as const;

/** Slopes: a stone ramp; with **Markers** on, a pale arrow rimmed dark points uphill. */
export const SLOPE = { ramp: [0.5, 0.46, 0.4] as Rgb, side: [0.3, 0.31, 0.28] as Rgb, arrow: [0.97, 0.93, 0.78] as Rgb, rim: [0.14, 0.1, 0.07] as Rgb } as const;

/** Geothermal fields: a mound of dark rock with vents glowing orange. */
export const GEOTHERMAL: Rgb = [0.82, 0.48, 0.16];
export const GEOTHERMAL_ROCK: Rgb = [0.27, 0.26, 0.25];

/** Relics: weathered pale stone, broken columns on a plinth. */
export const RELIC_STONE: Rgb = [0.66, 0.62, 0.54];

/** Thorns: a low, dark red-brown bramble. */
export const THORNS: Rgb = [0.34, 0.16, 0.14];

/** The sky round the map: blue overhead, paler toward the horizon (the haze is the horizon's
 *  colour, so distant ground fades into it). */
export const SKY = { zenith: [0.36, 0.55, 0.8] as Rgb, horizon: [0.64, 0.75, 0.87] as Rgb, below: [0.46, 0.6, 0.77] as Rgb, cloud: [0.93, 0.95, 0.97] as Rgb } as const;

/** Mine sites (Kyler's rounds, D178; his colours, measured in the game; the pit's earth a little darker
 *  since D324): a rusty frame in a dull
 *  brown-orange (#844D2F) round the edge of the 5 × 5 footprint, and a pit with real depth filling
 *  the rest, its earth a dark grey-brown with roots, rubble and cracks; scaffold towers on the
 *  frame's corners with pale wooden platforms, crates and planks (#A78E65). With **Markers** on, an
 *  orange line between dark edges outlines the footprint, a few pixels wide from any distance. */
export const MINE = {
  /** The pit as it shows in its shade (about #2F312C: Kyler's #373A34 darkened a little by D324, option (a),
   *  to keep it 5 L* under the darker badwater): the legend's colour. */
  pit: [0.184, 0.193, 0.173] as Rgb,
  /** The pit's earth as the model colours it: lit only by the sky down there, it shows about as
   *  `pit`. The walls' topsoil is browner and lighter, with a pale seam, and the earth darkens
   *  toward the floor; the floor darkens toward its edges. */
  earthTop: [0.561, 0.493, 0.383] as Rgb,
  earth: [0.476, 0.468, 0.391] as Rgb,
  earthLow: [0.365, 0.365, 0.315] as Rgb,
  seam: [0.578, 0.544, 0.451] as Rgb,
  floor: [0.365, 0.383, 0.315] as Rgb,
  floorEdge: [0.289, 0.297, 0.255] as Rgb,
  crack: [0.16, 0.16, 0.15] as Rgb,
  floorCrack: [0.24, 0.24, 0.21] as Rgb,
  /** The shaft in the pit's floor. */
  shaft: [0.2, 0.2, 0.18] as Rgb,
  root: [0.34, 0.25, 0.17] as Rgb,
  rootPale: [0.74, 0.64, 0.48] as Rgb,
  rubble: [[0.62, 0.58, 0.5], [0.44, 0.41, 0.36], [0.72, 0.67, 0.58]] as readonly Rgb[],
  ladder: [0.52, 0.42, 0.29] as Rgb,
  rope: [0.22, 0.17, 0.12] as Rgb,
  frame: [0.518, 0.302, 0.184] as Rgb,
  wood: [0.655, 0.557, 0.396] as Rgb,
  /** **Markers**: the outline round the footprint. */
  outline: [1.0, 0.56, 0.18] as Rgb,
  outlineDark: [0.1, 0.05, 0.02] as Rgb,
} as const;

/** The light: a warm sun from the north-west, a cool sky (violet in the shadows of the earth),
 *  and the game's cyan fog as a haze over distant ground. */
export const LIGHT = {
  /** Toward the sun before any camera turns it: west and north (x east, y north). The sun then turns with the
   *  camera (light.ts `sunOfYaw`), at the game's height: Sun.blueprint.json, the day's `SunXAngle` 45°. */
  sunAzimuth: [-Math.SQRT1_2, Math.SQRT1_2] as const,
  sunElevation: (45 * Math.PI) / 180,
  /** How far the game's sun turns past the camera (Sun.blueprint.json `RotateWithCameraOffset`, degrees). */
  sunFollow: 40,
  /** The sun's disc and the sky's scatter soften shadows: two sweeps, this far either side. */
  penumbra: (6 * Math.PI) / 180,
  sun: [1.0, 0.95, 0.86] as Rgb,
  sky: [0.63, 0.64, 0.72] as Rgb,
  /** The haze: the game's temperate daytime fog (`Sun.blueprint` `DayColors.TemperateWeatherFog`; a held hazard's in
   *  high/seasons.ts `FOG`). */
  haze: [0.4470589, 0.7607844, 0.8235295] as Rgb,
} as const;

/** The game's altitude colour ramps (D497; `tools/altitude-ramp.ts` reads them from the game's `resources.assets`,
 *  Timberborn 1.1.2.8): TerrainURP multiplies the ground's colour (grass and dry ground, before contamination is laid
 *  over it; not fields, not cliffs) by twice the ramp's texel (texel / 255, read raw in Gamma colour space) at the
 *  ground's height over `ceiling` (Configurations/TerrainMaterialMap.blueprint.json `AltitudeCeiling`), the grass's ramp
 *  on grass and the desert's on dry ground. Each a 32 × 1 RGB24 texture, filtered, mirrored past the ceiling. */
export const ALTITUDE_RAMP = {
  ceiling: 22,
  grass: [[112, 125, 133], [114, 126, 134], [112, 128, 139], [118, 126, 133], [126, 125, 125], [126, 129, 127], [125, 131, 133], [125, 132, 136], [121, 135, 136], [124, 138, 134], [126, 138, 136], [129, 140, 141], [137, 138, 134], [144, 139, 129], [145, 142, 131], [143, 142, 135], [141, 142, 140], [142, 142, 138], [150, 143, 128], [154, 144, 125], [149, 145, 134], [146, 143, 145], [149, 143, 142], [155, 146, 135], [133, 127, 128], [134, 128, 128], [133, 129, 129], [127, 124, 123], [133, 129, 130], [120, 118, 121], [119, 121, 124], [117, 126, 130]] as readonly (readonly [number, number, number])[],
  desert: [[123, 140, 150], [125, 141, 149], [126, 141, 150], [125, 139, 156], [139, 133, 139], [149, 134, 128], [144, 139, 137], [139, 139, 149], [134, 137, 156], [136, 138, 152], [150, 138, 131], [152, 139, 124], [142, 139, 138], [132, 135, 158], [135, 137, 153], [144, 140, 136], [148, 138, 136], [147, 138, 135], [146, 140, 136], [146, 141, 136], [146, 140, 136], [144, 138, 138], [141, 141, 140], [136, 147, 153], [134, 152, 159], [138, 151, 155], [135, 150, 163], [145, 145, 152], [159, 144, 137], [157, 149, 144], [151, 150, 155], [148, 149, 162]] as readonly (readonly [number, number, number])[],
} as const;

/** The game's light (Timberborn 1.1.2.8), as its terrain shader takes it (TerrainURP's ForwardLit program, read from the
 *  game's `resources.assets`): the game renders in Gamma colour space (`globalgamemanagers` PlayerSettings
 *  m_ActiveColorSpace 0), so its lighting works on display values. A face's colour is its albedo × `diffuse` × (the
 *  ambient by its normal + the sun × max(n·L, 0) × its shadow), with a little specular left out. The ambient is Unity's
 *  Trilight (decompiled `Timberborn.SkySystem` `Sun`; the day's colours in `Configurations/Sun.blueprint.json`: the sky's
 *  from above, the equator's from the side, the ground's from below) as Unity's ambient probe, irradiance SH
 *  (`GAME_AMBIENT_SH`), turned back to display values (URP's `SampleSH` under Gamma). The sun is its colour × its intensity, 1.1, at full shadow strength. `diffuse` is URP's
 *  0.96 − 0.96 × `_Metallic` (0.05 on the terrain's materials). */
export const GAME_LIGHT = {
  sky: [0.6239606, 0.6307573, 0.9734455] as Rgb,
  equator: [1, 1, 1] as Rgb,
  ground: [0.2831488, 0.2269659, 0.3712378] as Rgb,
  sun: [1.1, 1.1 * 0.9625, 1.1 * 0.85] as Rgb,
  diffuse: 0.96 - 0.96 * 0.05,
} as const;

/** A colour as a level top in full sun shows it in the game's light (`GAME_LIGHT`: the sky's ambient from above and the
 *  sun at `LIGHT.sunElevation`), before the altitude ramp: what the screen shows of a ground albedo. */
export function sunlitTop(c: Rgb): Rgb {
  const up = Math.sin(LIGHT.sunElevation);
  const ambient = gameAmbient(1);
  return [0, 1, 2].map((k) => c[k] * GAME_LIGHT.diffuse * (ambient[k] + GAME_LIGHT.sun[k] * up)) as unknown as Rgb;
}

/** The game's finish (D497), after the light: its scene's settings (`level2`'s RenderSettings, read raw) and its
 *  post-processing (the `Rendering/Volume` profile; the URP asset grades in LDR). Every look draws it.
 *  - The fog: Unity's exponential fog (`m_FogMode` 2) as URP draws it (its FOG_EXP programs in TerrainURP:
 *    `exp2(-unity_FogParams.x × the view depth)`, `unity_FogParams.x` = density / √ln 2, so `exp(-0.83 × density ×
 *    depth)`), toward the day's fog colour (`Sun.blueprint` `TemperateWeatherFog`, a held hazard's
 *    `HazardousWeatherFogs`: high/seasons.ts `FOG`). `fogParam` is that `unity_FogParams.x`.
 *  - The reflection probe's strength (`m_ReflectionIntensity`), on every environment reflection (`GAME_ENV`).
 *  - The post chain, as URP's uber pass grades in LDR under Gamma colour space: to linear, × 2^`postExposure`
 *    (ColorAdjustments; the game's Brightness setting at its default adds none), Neutral tonemapping (Tonemapping), then
 *    the LUT: `contrast` round ACEScc's mid grey in LogC and `saturation` round the luminance (ColorAdjustments
 *    +14 and +3), back to display values. Bloom (threshold 1.5) only touches highlights and is not drawn.
 *  `m_AmbientIntensity` (1.2) is not applied: Unity uses it for a skybox's ambient only (its Lighting window offers it
 *  only there), and the game sets Trilight. */
export const GAME_FINISH = {
  fogDensity: 0.003,
  fogParam: 0.003 / Math.sqrt(Math.LN2),
  /** The game's farthest default zoom's camera distance (core/analysis/opening.ts: 32 × 1.3^6, zoom 6): the fog is the
   *  game's up to it, and from farther out held at what it shows there (an editing view the game doesn't have). */
  fogFarthest: 32 * 1.3 ** 6,
  reflectionIntensity: 0.65,
  postExposure: 0.15,
  contrast: 1.14,
  saturation: 1.03,
} as const;

/** The game's reflection probe at its roughest mip (`tools/reflection-probe.ts`: the Cubemap
 *  "TimberbornEnvironmentRelfectionProbe" in `sharedassets1.assets`, mip 6, what URP samples at perceptual roughness 1),
 *  straight up, toward the horizon (its four side faces) and straight down; display values, before
 *  `GAME_FINISH.reflectionIntensity`. */
export const GAME_ENV = {
  up: [0.414, 0.504, 0.632] as Rgb,
  side: [0.397, 0.47, 0.54] as Rgb,
  down: [0.328, 0.374, 0.368] as Rgb,
} as const;

/** The game's Trilight colours in linear values (sRGB decoded), which the probe blends. */
const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toDisplay = (c: number) => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);
export const GAME_AMBIENT_LINEAR = {
  sky: GAME_LIGHT.sky.map(toLinear) as unknown as Rgb,
  equator: GAME_LIGHT.equator.map(toLinear) as unknown as Rgb,
  ground: GAME_LIGHT.ground.map(toLinear) as unknown as Rgb,
} as const;

/** The game's ambient as Unity's ambient probe holds it (D497): irradiance SH. Unity renders the Trilight gradient as an
 *  environment (the equator's colour at the horizon, toward the sky's straight up and the ground's straight down,
 *  blended in linear values by the direction's height), projects it to L2 spherical harmonics and bakes in the clamped
 *  cosine's convolution (A0 = π, A1 = 2π/3, A2 = π/4), so URP's SampleSH returns the diffuse light by the normal. The
 *  gradient depends on the height alone, so only the zonal terms remain: by the normal's height y, in linear values,
 *  `E(y) = c0 + c1 y + c2 (3y² − 1)` (the integrals of the gradient against P0, P1, P2 over [−1, 1], each times
 *  (2l + 1) / 2 and its A_l / π). The engine's own projection is not in the game's files; a frame capture of the SH the
 *  game uploads (unity_SHAr..SHC) is still to check it, fix forward. */
export const GAME_AMBIENT_SH = (() => {
  const { sky, equator: eq, ground } = GAME_AMBIENT_LINEAR;
  const c = (k: number) => {
    const i0 = 2 * eq[k] + (sky[k] - eq[k]) / 2 + (ground[k] - eq[k]) / 2;
    const i1 = (sky[k] - ground[k]) / 3;
    const i2 = (sky[k] + ground[k] - 2 * eq[k]) / 8;
    return [i0 / 2, i1, (5 / 16) * i2];
  };
  const [r, g, b] = [c(0), c(1), c(2)];
  return { c0: [r[0], g[0], b[0]] as Rgb, c1: [r[1], g[1], b[1]] as Rgb, c2: [r[2], g[2], b[2]] as Rgb };
})();

/** The game's ambient on a face whose normal has height y, in display values (`GAME_AMBIENT_SH`, as SampleSH returns it
 *  under Gamma colour space). */
export function gameAmbient(y: number): Rgb {
  const { c0, c1, c2 } = GAME_AMBIENT_SH;
  return [0, 1, 2].map((k) => toDisplay(Math.max(0, c0[k] + c1[k] * y + c2[k] * (3 * y * y - 1)))) as unknown as Rgb;
}

/** Soil moisture (the game's levels, 0–16) and contamination (0–1) as bytes: 0 stays 0, and any
 *  moisture or contamination at all stays above 0 (moist soil is where living plants grow). */
export function moistureByte(m: number): number {
  if (!(m > 0)) return 0;
  return Math.min(255, Math.max(1, Math.round(m * 15)));
}

export function contaminationByte(c: number): number {
  if (!(c > 0)) return 0;
  return Math.min(255, Math.max(1, Math.round(c * 255)));
}

/** A tile's ground kind from its soil bytes: under water first, then contaminated (plants die
 *  even on moist soil), then moist or dry. The shader follows the same order. */
export function groundKind(moisture: number, contamination: number, underwater: boolean): GroundKind {
  if (underwater) return "underwater";
  if (contamination > 0) return "contaminated";
  return moisture > 0 ? "moist" : "dry";
}

function mixRgb(a: Rgb, b: Rgb, t: number): Rgb {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/** The ground's base colour (before light and texture) for soil bytes, in moisture mode; the
 *  shader's `groundColor` does the same per pixel. Contamination is a layer drawn over it (its
 *  veins, `contaminationVeins`): the ground under and between them keeps its own colour. */
export function groundColor(moisture: number, contamination: number, underwater: boolean): Rgb {
  switch (groundKind(moisture, contamination, underwater)) {
    case "underwater":
      return GROUND.underwater;
    case "contaminated":
      return groundColor(moisture, 0, false);
    case "moist":
      // the game's moisture levels: 1 at the moist area's edge, 10 and up by the water
      return mixRgb(GROUND.moistLow, GROUND.moistHigh, Math.max(0, Math.min(1, (Math.round(moisture / 15) - 1) / 9)));
    default:
      return GROUND.dry;
  }
}

/** The wall's tint at height y (levels), as the game's cliffs: `WALL.gradient` from level 0 to 22, unclamped. */
export function cliffTint(y: number): Rgb {
  const t = y / 22;
  const { min, max } = WALL.gradient;
  return [min[0] + (max[0] - min[0]) * t, min[1] + (max[1] - min[1]) * t, min[2] + (max[2] - min[2]) * t];
}

/** The wall colour of a level (0 = the lowest the map can have, 22 the highest): the stone, tinted by the game's cliff
 *  gradient at the level's middle. */
export function wallColor(level: number): Rgb {
  const k = cliffTint(level + 0.5);
  return [WALL.stone[0] * k[0], WALL.stone[1] * k[1], WALL.stone[2] * k[2]];
}

export function cssColor(c: Rgb): string {
  const h = (v: number) =>
    Math.round(Math.max(0, Math.min(1, v)) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${h(c[0])}${h(c[1])}${h(c[2])}`;
}

export interface LegendEntry {
  /** CSS background for the swatch (a colour, a gradient or a small picture). */
  swatch: string;
  label: string;
  /** Shown only with **Markers** on (the information layer). */
  markers?: boolean;
}

/** A small picture (24 × 16) as a CSS background. */
function icon(body: string, ground = "#00000000"): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 16"><rect width="24" height="16" fill="${ground}"/>${body}</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") center / 100% 100% no-repeat`;
}

/** What the 3D view's colours mean for the ground, the water and the walls, for its legend. Every label is a
 *  name on one line, with nothing of what it does in the game (Timberborn players know; Kyler, 2026-10-02). */
export function legendEntries(mode: GroundMode): LegendEntry[] {
  const c = cssColor;
  // (the ground and the walls as a sunlit top shows them: their colours are albedos the game's light multiplies, D497)
  const l = (x: Rgb) => cssColor(sunlitTop(x));
  const cracks = (base: Rgb, line: Rgb, w = 1.5) => `repeating-linear-gradient(60deg, ${c(base)} 0 4px, ${c(line)} 4px ${4 + w}px, ${c(base)} ${4 + w}px 10px)`;
  const ground: LegendEntry[] =
    mode === "moisture"
      ? [
          { swatch: `linear-gradient(90deg, ${l(GROUND.moistLow)}, ${l(GROUND.moistHigh)})`, label: "Moist ground" },
          { swatch: cracks(sunlitTop(GROUND.dry), sunlitTop(GROUND.crack)), label: "Dry ground" },
          {
            // orange-red veins over the ground, dry earth and grass alike
            swatch: icon(
              `<rect width="12" height="16" fill="${l(GROUND.dry)}"/><rect x="12" width="12" height="16" fill="${l(GROUND.moistLow)}"/>` +
                `<path d="M0 4 L5 6 L4 11 L9 13 M5 6 L11 3" stroke="${c(CONTAMINATION.vein)}" stroke-width="1.3" fill="none"/>` +
                `<path d="M12 5 L17 7 L16 12 L22 14 M17 7 L23 3" stroke="${c(CONTAMINATION.vein)}" stroke-width="1.3" fill="none"/>`,
            ),
            label: "Contaminated ground",
          },
        ]
      : [{ swatch: `linear-gradient(90deg, ${c(HEIGHT_RAMP.low)}, ${c(HEIGHT_RAMP.high)})`, label: "Ground height" }];
  // walls: two levels of cobbled stone, the upper lighter (the game's cliff gradient)
  const cobbles = (y: number) => [2, 9, 16].map((x, k) => `<rect x="${x + (y % 2) * 3}" y="${y + 1 + (k % 2)}" width="5" height="3" rx="1" fill="${l(WALL.mortar)}" opacity="0.5"/>`).join("");
  const walls = icon(`<rect width="24" height="8" fill="${l(wallColor(14))}"/><rect y="8" width="24" height="8" fill="${l(wallColor(6))}"/>` + cobbles(0) + cobbles(9));
  return [
    ...ground,
    { swatch: `linear-gradient(90deg, ${c(WATER.foam)} 0 2px, ${c(WATER.shallow)} 2px, ${c(WATER.teal)} 45%, ${c(WATER.navy)})`, label: "Water" },
    { swatch: icon(`<path d="M0 7 Q6 4 12 7 T24 7" stroke="${c(WATER.badStreak)}" stroke-width="1.2" fill="none"/><circle cx="17" cy="11" r="1.3" fill="${c(WATER.badVein)}"/>`, c(WATER.bad)), label: "Badwater" },
    { swatch: walls, label: "Walls" },
    { swatch: cssColor(DEAD_TREE), label: "Dead trees" },
  ];
}

/** The legend's lines for water mixed with badwater and for what stands on the map: trees, the
 *  start, slopes, ruins and the other objects, each as its model looks from above. */
export function objectLegend(): LegendEntry[] {
  const c = cssColor;
  const grass = c(sunlitTop(GROUND.moistLow));
  const dry = c(sunlitTop(GROUND.dry));
  return [
    {
      // clean water turning to badwater as the game turns it (teal-grey, grey, dull red-brown, crimson;
      // D496), with badwater's bubbles at its end
      swatch:
        icon(`<circle cx="18" cy="6" r="1.1" fill="${c(WATER.badVein)}"/><circle cx="21.5" cy="11" r="1.1" fill="${c(WATER.badVein)}"/>`) +
        `, linear-gradient(90deg, ${[0, 0.25, 0.5, 0.75, 1].map((share) => c(waterBody(BADWATER.shallow, share))).join(", ")})`,
      label: "Mixed water",
    },
    {
      swatch: icon(`<circle cx="7" cy="8" r="5" fill="${c(LIVING_TREE)}"/><path d="M16 2 L21 14 H11Z" fill="${c([0.11, 0.28, 0.17])}"/>`, grass),
      label: "Trees and bushes",
    },
    {
      swatch: icon(
        `<rect x="3" y="3" width="18" height="12" fill="${c(START.deck)}"/><rect x="6" y="5" width="12" height="8" fill="${c(START.walls)}"/><path d="M5 8 L12 4 L19 8 L19 11 L5 11Z" fill="${c(START.roof)}"/>` +
          `<rect x="3" y="0" width="1" height="9" fill="#3a2a1c"/><rect x="4" y="0.5" width="6" height="3.5" fill="${c(START.banner)}" stroke="#000" stroke-width="0.5"/>`,
        dry,
      ),
      label: "Start",
    },
    {
      swatch: icon(`<path d="M3 14 L12 3 L21 14Z" fill="${c(SLOPE.ramp)}"/><path d="M3 14 L21 14 L21 15 L3 15Z" fill="${c(SLOPE.side)}"/>`, dry),
      label: "Slope",
    },
    {
      // a rusty skeleton with beige panels, one askew, its top storey partly there
      swatch: icon(
        `<rect x="8.3" y="9.6" width="7.4" height="5.6" fill="${c(RUIN.panel)}"/><rect x="9" y="4.4" width="5" height="4.2" fill="${c(RUIN.panel)}" transform="rotate(-9 11.5 6.5)"/>` +
          `<rect x="7" y="3" width="1.3" height="13" fill="${c(RUIN.rust)}"/><rect x="15.7" y="0.5" width="1.3" height="15.5" fill="${c(RUIN.rust)}"/><rect x="7" y="8.6" width="10" height="1.1" fill="${c(RUIN.rust)}"/>` +
          `<path d="M8 8.6 L16 1.5" stroke="${c(RUIN.rust)}" stroke-width="0.9"/>`,
        dry,
      ),
      label: "Ruins",
    },
    {
      // the rusty frame round the footprint, the pit filling it, pale platforms on the frame's
      // corners, beams across
      swatch: icon(
        `<rect x="4" y="1" width="16" height="14" fill="${c(MINE.frame)}"/><rect x="5.3" y="2.3" width="13.4" height="11.4" fill="${c(MINE.pit)}"/>` +
          `<rect x="4" y="1" width="3.6" height="3.4" fill="${c(MINE.wood)}"/><rect x="16.4" y="1" width="3.6" height="3.4" fill="${c(MINE.wood)}"/><rect x="4" y="11.6" width="3.6" height="3.4" fill="${c(MINE.wood)}"/><rect x="16.4" y="11.6" width="3.6" height="3.4" fill="${c(MINE.wood)}"/>` +
          `<rect x="4" y="6.2" width="16" height="0.9" fill="${c(MINE.frame)}"/><rect x="4" y="8.9" width="16" height="0.9" fill="${c(MINE.frame)}"/>`,
        dry,
      ),
      label: "Mine site",
    },
    {
      swatch: icon(`<circle cx="12" cy="8" r="6" fill="#77746d"/><circle cx="12" cy="8" r="4.2" fill="${c([0.32, 0.62, 0.95])}"/>`, dry) + `, ${dry}`,
      label: "Water source",
    },
    {
      swatch: icon(`<circle cx="12" cy="8" r="7" fill="#33261f"/><path d="M12 8 m-4 0 a4 4 0 1 1 4 4" stroke="${c([0.5, 0.3, 0.18])}" stroke-width="1.6" fill="none"/>`, dry),
      label: "Badwater source",
    },
    {
      swatch: icon(`<ellipse cx="12" cy="9" rx="10" ry="5" fill="${c(GEOTHERMAL_ROCK)}"/><circle cx="8" cy="8" r="1.6" fill="${c(GEOTHERMAL)}"/><circle cx="15" cy="10" r="1.6" fill="${c(GEOTHERMAL)}"/>`, dry),
      label: "Geothermal field",
    },
    {
      swatch: icon(`<rect x="3" y="11" width="18" height="3" fill="${c(RELIC_STONE)}"/><rect x="6" y="3" width="3" height="8" fill="${c(RELIC_STONE)}"/><rect x="14" y="6" width="3" height="5" fill="${c(RELIC_STONE)}"/>`, dry),
      label: "Relic",
    },
    { swatch: icon(`<path d="M4 13 L7 5 L9 12 L12 3 L14 12 L17 6 L20 13Z" fill="${c(THORNS)}"/>`, dry), label: "Thorns" },
    { swatch: icon(`<circle cx="9" cy="10" r="4" fill="#858380"/><circle cx="15" cy="11" r="3.5" fill="#6f6d6a"/><circle cx="12" cy="6" r="3" fill="#9a9894"/>`, dry), label: "Blockage" },
    { swatch: icon(`<rect x="7" y="4" width="10" height="9" fill="#858380"/>`, dry), label: "Other objects" },
    // the information layer
    {
      swatch: icon(`<rect x="4" y="1" width="16" height="14" fill="${c(SLOPE.ramp)}"/><path d="M12 2 L18 8 L14.2 8 L14.2 14 L9.8 14 L9.8 8 L6 8Z" fill="${c(SLOPE.arrow)}" stroke="${c(SLOPE.rim)}" stroke-width="1.2"/>`, dry),
      label: "Slope arrows",
      markers: true,
    },
    {
      swatch: icon(`<rect width="24" height="16" fill="${c(sunlitTop(wallColor(5)))}"/><rect y="5" width="24" height="1.6" fill="${c(WALL.ledge)}"/><rect y="6.6" width="24" height="0.8" fill="${c(WALL.groove)}"/><rect y="12" width="24" height="1.6" fill="${c(WALL.ledge)}"/><rect y="13.6" width="24" height="0.8" fill="${c(WALL.groove)}"/>`),
      label: "Wall levels",
      markers: true,
    },
    {
      swatch: icon(
        `<rect width="12" height="16" fill="${c(GROUND.dry)}"/><rect x="12" width="12" height="16" fill="${c(GROUND.moistLow)}"/>` +
          `<path d="M2 4 L8 6 L7 11" stroke="${c(CONTAMINATION.vein)}" stroke-width="1.1" fill="none"/>` +
          `<rect x="10" width="4" height="16" fill="${c(CONTAMINATION_OUTLINE.dark)}"/><rect x="11" width="2" height="16" fill="${c(CONTAMINATION_OUTLINE.light)}"/>`,
      ),
      label: "Contamination edge",
      markers: true,
    },
    {
      swatch: icon(`<rect x="4" y="1" width="16" height="14" fill="${c(MINE.outlineDark)}"/><rect x="5" y="2" width="14" height="12" fill="${c(MINE.outline)}"/><rect x="7" y="4" width="10" height="8" fill="${c(MINE.outlineDark)}"/><rect x="8" y="5" width="8" height="6" fill="${c(MINE.pit)}"/>`, dry),
      label: "Mine site outline",
      markers: true,
    },
  ];
}

