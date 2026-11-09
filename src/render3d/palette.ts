// The 3D view's colours (ROADMAP "Map look", PLAN §20 D86, D110, D114 and Kyler's clean look), in
// one place: the shaders and models read them and the legend shows the same swatches, so the legend
// always says what the scene shows. The clean view is as close to the game as we can make it with
// our own shaders (Kyler's reference screenshots, D334: follow Timberborn's references): moist ground
// a muted grass green (living plants grow), dry ground cracked earth in a warm brown drifting to mauve,
// contamination a layer over either (the game's dense network of thin rusty cracks, through earth and grass alike,
// with no glow), clean water a deep teal body darkening with depth, clear in
// the shallows (the water's own palette is waterPalette.ts, D177), and ground under water a dark
// wet bed; a toggle switches the ground to height colours.
// Walls are cobbled stone, lighter higher up as the game's cliffs. Colours are display values (the
// renderer outputs them without conversion).
//
// Readability follows the game's own (D334): its look and its cues, with no lightness gap or pattern
// beyond the game's. Grass reads apart from dry earth by its hue and its painted strokes, contamination by
// its rusty veins over either soil, badwater by its crimson, its dullness and its bubbles (and in
// High its pink caustics; in both, the game's orange glow of its shallow edges where partly bad). Clean water reads as water by its sheen and ripple crests and its see-through shallows, and in
// colour by its blue. Badwater is darker than clean water of the same depth, as the game's by day, darkening with depth as the game's
// (D496), and dull; water partly
// bad turns smoothly from one to the other over about a tile where they meet, greying as it turns as the
// game's does (a teal-grey, a grey, a dull red-brown, crimson), never in streaks, patches or purple
// (D177, D496). Living trees are dark, dead trees the game's weathered grey-brown wood, lighter. The walls, in the side light, are darker than the ground above them. The information
// layer (**Markers**) adds dam sites, hatched light and dark with a dark rim so they show on any
// ground or water, slope arrows and a pale line at every level.
//
// Pure TypeScript, no three.js: the unit tests and the page's legend read it too.

import { BADWATER, BADWATER_GLOW_COLOUR, badwaterBody, badwaterGlow, badwaterRamp, blendWater, cleanWaterBody, GAME_BADWATER, GAME_WATER, gameBadwaterColour, gameBadwaterEmission, gameCleanColour, HIGH_WATER, WATER, WATER_LIGHT, waterBody, type Rgb } from "./waterPalette";
import { WATER_ALBEDO } from "./waterTextures";
import { GAME_SOIL_TEXTURE } from "./soilTexture";
import { deadWood } from "./dying";

// The water's colours, opacity and blend live in waterPalette.ts (D177); they are re-exported here
// for the pages and tests that read the palette.
export { BADWATER, blendWater, badwaterBody, cleanWaterBody, WATER, WATER_BLEND, WATER_CALIBRATION, WATER_SURFACE, WATER_UI, waterBody, waterOpacity, waterTint, type Rgb } from "./waterPalette";

/** What colours the tops of the ground. */
export type GroundMode = "moisture" | "height";

/** A tile's ground, as its colour shows it. */
export type GroundKind = "moist" | "dry" | "contaminated" | "underwater";

/** How the game's terrain shows soil moisture (SoilMoistureSystem `UpdateDesertIntensity`, its `SoilMoistureMapSpec`
 *  blueprint: `DesertMoistureThreshold` 5, `MaxDesertIntensity` 0.7): its desert texture over all of a top at moisture 0,
 *  over (1 − m / threshold) × max of one at moisture m up to the threshold, none above (the shaders' `grassOf`; D135 as
 *  amended 2026-10-29). The game takes m unrounded, and so does ours: the tile data carries the desert intensity from the
 *  moisture byte (light.ts `desertByte`, read by the shaders' `grassAt`); only the run tops (caves' floors) take their
 *  whole level (`grassOf`), which is all their soil carries. */
export const DESERT = { threshold: 5, max: 0.7 } as const;

/** How the game's terrain blends its desert map at a point (its TerrainMaterialMapSpec: \`BlendingMargin\`,
 *  \`BlendingNoiseMultiplier\`, \`BlendingSoftness\`; the shaders' \`desertBlend\`), and its blending noise's statistics
 *  (`noiseMean`, `noiseSpread`: the `BlendingNoise` texture's texels, read raw from the game's `resources.assets`,
 *  2026-11-08; it is read at world × `BlendingNoiseScale` 0.2, so it repeats every five tiles, and most of its variance
 *  lies in features half a tile to two tiles across: 31 % at 0.5–1 cycles a tile, 46 % at 1–2, 13 % at 2–4). Ours
 *  (the shaders' `blendNoise`) is drawn to them: its mean, its spread and its scale. */
export const BLEND = { margin: 0.2, noise: 0.96, softness: 5.8, noiseMean: 0.473, noiseSpread: 0.081 } as const;

/** Five-point Gauss–Hermite nodes (in spreads from the mean) and weights: the mean of a function over the blending
 *  noise, for a look that draws no noise (the light look). */
export const NOISE_NODES: readonly (readonly [number, number])[] = (() => {
  const r = Math.sqrt(10);
  const nodes: [number, number][] = [
    [0, 8 / 15],
    [-Math.sqrt(5 - r), (7 + 2 * r) / 60],
    [Math.sqrt(5 - r), (7 + 2 * r) / 60],
    [-Math.sqrt(5 + r), (7 - 2 * r) / 60],
    [Math.sqrt(5 + r), (7 - 2 * r) / 60],
  ];
  // (rounded as the shaders write them, the weights summing to one, so a share held at 0 or 1 stays there exactly)
  const round = nodes.map(([x, w]): [number, number] => [Math.round(x * 1e6) / 1e6, Math.round(w * 1e6) / 1e6]);
  round[0][1] = Math.round((1 - round.slice(1).reduce((s, [, w]) => s + w, 0)) * 1e6) / 1e6;
  return round;
})();

/** The mean over the game's blending noise (`BLEND.noiseMean`, `noiseSpread`) of its blend, saturate((v + k × (n −
 *  mid) − 0.5) × softness + 0.5): the share a look without the noise (the light look) draws for a value v, as the
 *  game's noisy blend averages over the ground. The desert's share takes k `BLEND.noise`, mid 0.5, softness
 *  `BLEND.softness`; contamination's weight its own (`CONTAMINATION`). The shaders' `noiseMean` is the same. */
export function noiseMean(v: number, k: number, mid: number, softness: number): number {
  const a = (v + k * (BLEND.noiseMean - mid) - 0.5) * softness + 0.5;
  const b = k * BLEND.noiseSpread * softness;
  return NOISE_NODES.reduce((sum, [x, w]) => sum + w * Math.max(0, Math.min(1, a + x * b)), 0);
}

/** The game's ground albedo means (D497): its `Desert` and `Grass` textures' means at the 64² mip (62.5/52.2/41.7 and
 *  67.4/72.9/24.8, display 0–255, read raw) × its detail texture doubled (`GrassDetailsAlbedo`, mean 140.5: × 1.102).
 *  What our patterns' means are calibrated to (`GROUND`), and what the pixel judge draws the tops in to judge the light
 *  alone (materials.ts `GROUND_MEANS`). */
export const GAME_GROUND_MEAN = {
  dry: [0.2701, 0.2256, 0.1802] as Rgb,
  grass: [0.2913, 0.315, 0.1072] as Rgb,
} as const;

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
   *  colour space; every mip's mean is within 2 % of the top's). The patterns keep their mean at every distance, as a
   *  texture does through its mips (2026-11-08: the grass's strokes and the cracks had faded with distance, the
   *  grass 3.5 % darker and the earth 1.3 % lighter from the start shots' 70–110 away than at the 34 they were
   *  calibrated at). Each colour of a kind was scaled by the same factor per channel, so the patterns keep their shapes;
 *  recalibrated 2026-11-07 (`fix/water-light`), when the tool, which had left the post chain in, read 3–5 % low. */
  dry: [0.293, 0.242, 0.193] as Rgb,
  /** Dry ground's cooler, greyer patches. */
  dryCool: [0.281, 0.249, 0.23] as Rgb,
  /** Dry ground's warmer, browner patches. */
  dryWarm: [0.33, 0.264, 0.197] as Rgb,
  /** The cracks in dry ground. */
  crack: [0.12, 0.085, 0.066] as Rgb,
  /** Grass: a muted green, the same at every moisture, as the game's terrain shader draws it (TerrainURP: the `Grass`
   *  texture × its altitude ramp × the detail texture, with no moisture term; only the desert's share, by the game's
   *  desert intensity, changes with moisture). Until 2026-11-08 ours ran from a lighter green at the moist area's edge
   *  to one 7 % deeper by the water, which the game doesn't, so grass by the water read darker than the game's
   *  (`fix/land-tone`, docs/progress/3d-view.md). Calibrated as the rest (`tools/albedo-means.ts`, 34 and 100 away):
   *  the `Grass` texture's 67.4/72.9/24.8 at the mip the start shots read (64²) × the detail texture's 140.3/141.0/140.8
   *  doubled, so 74.2/80.6/27.4; measured after, Standard 74.4/80.8/27.5 near and 74.0/80.4/27.5 from afar (High from afar
   *  73.2/79.8/27.3). */
  grass: [0.371, 0.389, 0.133] as Rgb,
  /** Our old bed under water, drawn only with `materials.ts` `WATER_BED` 1 for the pixel judge: the game draws the
   *  ground under its water as it draws it dry (Q9 P14). */
  underwater: [0.36, 0.38, 0.34] as Rgb,
} as const;

const luma = (c: Rgb) => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
/** The game's grass (its terrain's Grass texture, mean): with ours as it was when the models took their colours (the
 *  grass by the water, 0.353/0.372/0.128, before `fix/land-tone` drew grass alike at every moisture) it gives how much
 *  lighter our albedo is than the game's, so a colour the game gives is drawn at our lightness, in the game's own hue
 *  (D135 as amended 2026-10-29: models in the game's colour). Held at that, so the ground's calibration never moves the
 *  models. */
export const GAME_GRASS: Rgb = [0.263, 0.285, 0.096];
export const ALBEDO_SCALE = luma([0.353, 0.372, 0.128]) / luma(GAME_GRASS);
/** A colour of the game's albedo as ours. */
export const asOurs = (c: Rgb): Rgb => [Math.min(1, c[0] * ALBEDO_SCALE), Math.min(1, c[1] * ALBEDO_SCALE), Math.min(1, c[2] * ALBEDO_SCALE)];
/** Trees and bushes as the game colours them: the grown models' foliage and bark (texture x vertex colour, means over
 *  their area, read from resources.assets), as ours. Olive and yellow-green, darker than the grass. The birch's bark is
 *  its white-vertex part (11.9 % of its area) without its dark marks, which our models draw as geometry of their own:
 *  its texels lighter than 0.3 (`tools/game-model-albedo.py BirchMature --above 0.3`: 76 % of the bark, where its
 *  texture parts, the marks below 0.2 and the light bark above 0.4 with only 3 % between), a light warm grey; the whole
 *  texture's mean, 0.525/0.474/0.392, would count the marks twice. Until 2026-11-08 ours was a near-white
 *  0.93/0.91/0.86 of our own, neutral where the game's is warm. */
export const TREE_COLOURS = {
  pine: asOurs([0.114, 0.181, 0.099]),
  birch: asOurs([0.174, 0.231, 0.099]),
  oak: asOurs([0.126, 0.176, 0.083]),
  bush: asOurs([0.153, 0.175, 0.088]),
  pineBark: asOurs([0.269, 0.183, 0.117]),
  oakBark: asOurs([0.21, 0.17, 0.103]),
  birchBark: asOurs([0.634, 0.579, 0.49]),
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
  stone: [0.347, 0.317, 0.267] as Rgb,
  mortar: [0.112, 0.1, 0.088] as Rgb,
  ledge: [0.8, 0.78, 0.68] as Rgb,
  groove: [0.08, 0.08, 0.07] as Rgb,
  gradient: { min: [0.4157, 0.4314, 0.4745] as Rgb, max: [0.9412, 0.9255, 0.8941] as Rgb },
} as const;

/** Contamination as a layer, as the game draws it (Kyler, 2026-09-25; D154 and D334 as amended 2026-11-07: the game's
 *  own look and cues). Its terrain shader (TerrainURP's ForwardLit, read from `resources.assets`; the `Grass` material's
 *  values) lays its `SoilContamination` texture over the ground's albedo, grass and dry earth alike, after the altitude
 *  ramp and before the light: lerp(albedo, the texture's colour × `_Contamination_Color` (1), weight × its alpha), with
 *  no emission. The texture (ours: soilTexture.ts, at its measured statistics) repeats every `repeat` tiles (world ×
 *  `_ProjectionUVScale` 1/16 × `_Contamination_Scale` 4): a dense network of thin cracks in a dark rust (`vein`,
 *  78/33/5) covering a fifth of the ground (`cover`). The weight: each tile's map value (decompiled
 *  `SoilContaminationSystem.GetMapSoilContamination`: 0 clean, else 1 − `mapMax` × (1 − c / `mapFull`) up to `mapFull`
 *  contaminated and 1 beyond; `SoilContaminationMap.blueprint`), blended across tiles by four taps `margin` round the
 *  point as the desert's share is (`_ContaminationBlendingMargin`), raised to `nonlinearity`, held at `least` once over
 *  0.01, then saturate((v + `noise` × (n − `noiseMid`) − 0.5) × `softness` + 0.5), n the ground's blending noise (the
 *  desert's own sample). So any contaminated ground over a fifth takes the whole pattern, the same at any level; the
 *  faintest shows it in patches; it ends in a noisy blend a fifth of a tile wide. The terrain shader reads these
 *  (`contaminationWeight` in GLSL, the full looks); the light look, which draws no patterns, takes its mean
 *  (`contaminationMean`). */
export const CONTAMINATION = {
  /** The pattern's colour in a crack and its mean over the texture (the game's, `GAME_SOIL_TEXTURE`), 0–1. */
  vein: GAME_SOIL_TEXTURE.vein.map((v) => v / 255) as unknown as Rgb,
  mean: GAME_SOIL_TEXTURE.mean.map((v) => v / 255) as unknown as Rgb,
  /** The share of the ground the cracks cover, and the pattern's mean alpha. */
  cover: GAME_SOIL_TEXTURE.cover,
  meanAlpha: GAME_SOIL_TEXTURE.meanAlpha,
  repeat: 4,
  mapMax: 0.9,
  mapFull: 0.2,
  margin: 0.2,
  nonlinearity: 0.65,
  least: 0.2,
  noise: 0.975,
  noiseMid: 0.45,
  softness: 18,
} as const;

/** The game's map value for a tile's soil contamination `c` (0–1; `CONTAMINATION`). */
export function contaminationMap(c: number): number {
  const C = CONTAMINATION;
  return c > 0 ? (c <= C.mapFull ? 1 - C.mapMax * (1 - c / C.mapFull) : 1) : 0;
}

/** The pattern's weight at a map value `m` (0–1, blended across tiles) and the blending noise `n` (0–1; its mean,
 *  the game's `BLEND.noiseMean`, by default), as the game's terrain shader works it (`CONTAMINATION`). */
export function contaminationWeight(m: number, n: number = BLEND.noiseMean): number {
  const C = CONTAMINATION;
  return Math.max(0, Math.min(1, (contaminationValue(m) + C.noise * (n - C.noiseMid) - 0.5) * C.softness + 0.5));
}

/** The map value as the weight takes it: raised to the nonlinearity, held at the least once over 0.01. */
function contaminationValue(m: number): number {
  const C = CONTAMINATION;
  const v = Math.max(0, m) ** C.nonlinearity;
  return v >= 0.01 ? Math.max(v, C.least) : v;
}

/** The pattern's weight at a map value `m`, averaged over the blending noise (`noiseMean`): the share of the ground
 *  the pattern takes there, as the light look, which draws no noise, shows it. */
export function contaminationWeightMean(m: number): number {
  const C = CONTAMINATION;
  return noiseMean(contaminationValue(m), C.noise, C.noiseMid, C.softness);
}

/** With **Markers** on, an outline where contaminated ground ends: a light line between dark
 *  edges, so it shows on grass, earth and at the water's edge, in any colours. */
export const CONTAMINATION_OUTLINE = { light: [1, 0.86, 0.6] as Rgb, dark: [0.1, 0.03, 0.02] as Rgb } as const;

/** A crack's middle over the soil `soil` (an albedo) at a soil contamination `level` (0–1) and the blending noise's
 *  middle: the game's rust over the soil by the pattern's weight; the soil itself at zero. */
export function contaminationVein(level: number, soil: Rgb): Rgb {
  const w = contaminationWeight(contaminationMap(level));
  return [0, 1, 2].map((i) => soil[i] + (CONTAMINATION.vein[i] - soil[i]) * w) as unknown as Rgb;
}

/** Contaminated ground at a soil contamination `level` over the soil `soil` as the pattern's mean shows it (its mips,
 *  from afar; the light look): the soil toward the pattern's mean colour by its mean alpha × the weight. */
export function contaminationMean(level: number, soil: Rgb): Rgb {
  const k = CONTAMINATION.meanAlpha * contaminationWeightMean(contaminationMap(level));
  return [0, 1, 2].map((i) => soil[i] + (CONTAMINATION.mean[i] - soil[i]) * k) as unknown as Rgb;
}

/** Contaminated ground as the light look draws it (no patterns: the pattern's mean, `contaminationMean`), over dry
 *  earth and over grass. */
export const CONTAMINATED_GROUND = {
  dry: contaminationMean(1, GROUND.dry),
  grass: contaminationMean(1, GROUND.grass),
} as const;

/** Dead trees: bare wood (no crown), the game's dead wood: the living bark weathered lighter and greyer, still lighter
 *  than the living crowns (dying.ts `DEAD_FORM`; the models' dead pine). */
export const DEAD_TREE: Rgb = deadWood("Pine", TREE_COLOURS.pineBark);

/** Living trees' crowns (the legend; each species has its own shade in the models). */
export const LIVING_TREE: Rgb = TREE_COLOURS.pine;

/** A hatched overlay (alpha 255): light stripes in the overlay's colour, dark stripes, and a
 *  dark rim round the hatched tiles. */
export const HATCH = { dark: [0.06, 0.05, 0.04] as Rgb } as const;

/** The layer cut's cap (D207: where solid rock crosses the cut): a section through rock, a cool slate darker than the
 *  ground's tops round it, hatched with lighter diagonal stripes (materials.ts, `capped`). */
export const CUT_CAP = { base: [0.25, 0.265, 0.3] as Rgb, line: [0.36, 0.375, 0.41] as Rgb } as const;

/** The water sources and seeps as the game colours them (D496): its models' albedo (texture × vertex colour, means over
 *  their area, read from resources.assets), at our lightness. A water source is an outcrop of dark rock; a badwater
 *  source a flat dark crater; a seep a stone slab round a pit heaped with rocks, its gaps dark teal (water) or rust
 *  orange (badwater). */
export const LANDMARK = {
  rock: asOurs([0.19, 0.19, 0.16]),
  rockTop: asOurs([0.22, 0.21, 0.178]),
  rockLow: asOurs([0.161, 0.168, 0.144]),
  crater: asOurs([0.14, 0.13, 0.11]),
  craterDeep: asOurs([0.125, 0.112, 0.093]),
  craterRim: asOurs([0.183, 0.173, 0.154]),
  seepSlab: asOurs([0.23, 0.217, 0.182]),
  seepRock: asOurs([0.254, 0.236, 0.196]),
  seepGap: asOurs([0.116, 0.14, 0.123]),
  badSeepSlab: asOurs([0.18, 0.151, 0.122]),
  badSeepRock: asOurs([0.195, 0.165, 0.136]),
  /** Badwater's rust between a badwater seep's rocks: its texture's orange, a little brighter than the means. */
  badSeepGap: asOurs([0.24, 0.13, 0.05]),
} as const;

/** Ruins (Kyler's rounds, D178; D334: bright orange with cream, near and far, as Timberborn's
 *  references): ruined scaffold towers, one storey per level: thin orange posts, beams and braces
 *  (#D4781F), cream sacks and slab panels (#E3CF96) and, on moist ground, ivy (#405634, the brighter
 *  green on its clusters' edges) draped over about the lower half of the storeys, the sacks' middles
 *  showing through. From afar each storey is a block in the scaffolding's orange (what makes ruins
 *  read from afar), a cream panel set in where it has one. Both stand apart from contaminated ground. */
export const RUIN = {
  rust: [0.83, 0.47, 0.12] as Rgb,
  /** The cream sacks and slab panels: the game's ruins' lightest colour, at our lightness (D496; the brightest tenth of
   *  RuinColumnA..E's area, weighted clusters of `tools/game-model-albedo.py`'s samples: 0.507/0.430/0.272). Until
   *  2026-11-08 #E3CF96, half again the game's, its lit faces over the bloom's knee. */
  panel: asOurs([0.507, 0.43, 0.272]),
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

/** The game's sky (D497): its camera's Skybox material (`resources.assets` "Skybox", shader path 1816, its pixel program
 *  read with D3DDisassemble), drawn without fog and graded by the post chain like the rest of the frame.
 *  - `day`: its colour by the view's height, the strip "DayCycleSkybox_8k_Manual" at `_DayProgress` 0.2 (the day:
 *    `SkyboxPositioner.blueprint.json`), straight down to straight up evenly (`tools/game-sky.ts`; display values).
 *  - `clouds`: its clouds, added in the sun's colour (`_MainLightColor`) within a band round the horizon: full from
 *    −13.5° to +18°, gone by −36° and +36° (`_SkyStart`, `_SkyEnd`, of the height 0 down to 1 up). The shader's
 *    constants are read from its own table (each property's name and offset in UnityPerMaterial): cloud =
 *    clamp(shape + `_DensityOffset`) − (1 − detail) × (1 − shape)^`_DetailErosion`, ^`_DensityPower`, × `_Blending`,
 *    the shape the weighted channels (`_ShapeWeights`) of its 128³ `Skybox_ShapeNoise` at `_ShapeScale` of the view's
 *    direction, the detail (`_DetailWeights`) of its 64³ `Skybox_DetailNoise` at `_DetailScale` (both ARGB: the
 *    detail's alpha, constant, takes the weight 0). The game reads them from those textures; ours are our own value
 *    noise, an octave a channel at the textures' own scales (their channels' correlation lengths), spread
 *    (`spread`) so the field comes out as the game's, worked out from its decoded textures over the band: a mean 0.016,
 *    13% over 0.05, the 99th percentile 0.17, its features about 4° across (its autocorrelation 0.44 at 4°, ours
 *    0.47). They drift at their `_ShapeMovemenSpeed` and `_DetailMovementSpeed` round the vertical: ours stand still,
 *    so the sky needs no frames of its own. */
export const GAME_SKY = {
  day: [[0.201, 0.345, 0.494], [0.202, 0.346, 0.495], [0.203, 0.346, 0.495], [0.203, 0.346, 0.496], [0.203, 0.346, 0.496], [0.204, 0.347, 0.496], [0.204, 0.347, 0.496], [0.204, 0.347, 0.497], [0.204, 0.347, 0.497], [0.204, 0.347, 0.497], [0.204, 0.347, 0.497], [0.204, 0.347, 0.498], [0.205, 0.347, 0.498], [0.205, 0.346, 0.498], [0.205, 0.346, 0.498], [0.205, 0.346, 0.498], [0.205, 0.346, 0.498], [0.205, 0.345, 0.498], [0.205, 0.345, 0.498], [0.205, 0.345, 0.498], [0.205, 0.344, 0.498], [0.205, 0.344, 0.498], [0.205, 0.344, 0.498], [0.204, 0.344, 0.498], [0.204, 0.344, 0.498], [0.203, 0.344, 0.498], [0.202, 0.344, 0.498], [0.202, 0.344, 0.498], [0.202, 0.344, 0.498], [0.202, 0.344, 0.498], [0.202, 0.344, 0.498], [0.201, 0.344, 0.499], [0.202, 0.344, 0.499], [0.202, 0.344, 0.499], [0.202, 0.344, 0.499], [0.203, 0.344, 0.5], [0.204, 0.344, 0.5], [0.205, 0.344, 0.501], [0.209, 0.343, 0.503], [0.211, 0.344, 0.505], [0.214, 0.346, 0.508], [0.217, 0.349, 0.512], [0.22, 0.353, 0.516], [0.225, 0.358, 0.522], [0.229, 0.364, 0.528], [0.235, 0.371, 0.535], [0.241, 0.38, 0.543], [0.248, 0.389, 0.552], [0.255, 0.399, 0.563], [0.264, 0.411, 0.574], [0.276, 0.425, 0.587], [0.291, 0.442, 0.602], [0.308, 0.462, 0.618], [0.327, 0.484, 0.637], [0.345, 0.506, 0.656], [0.364, 0.529, 0.675], [0.382, 0.552, 0.696], [0.401, 0.574, 0.716], [0.417, 0.596, 0.736], [0.434, 0.617, 0.756], [0.449, 0.637, 0.775], [0.463, 0.656, 0.793], [0.493, 0.701, 0.841], [0.519, 0.74, 0.884], [0.536, 0.767, 0.917], [0.543, 0.778, 0.937], [0.543, 0.773, 0.939], [0.526, 0.752, 0.941], [0.501, 0.719, 0.936], [0.472, 0.676, 0.922], [0.458, 0.658, 0.916], [0.444, 0.641, 0.91], [0.429, 0.622, 0.904], [0.413, 0.603, 0.897], [0.397, 0.584, 0.891], [0.38, 0.564, 0.884], [0.363, 0.544, 0.877], [0.346, 0.525, 0.87], [0.329, 0.506, 0.863], [0.313, 0.489, 0.856], [0.298, 0.473, 0.849], [0.284, 0.458, 0.842], [0.267, 0.436, 0.828], [0.25, 0.416, 0.811], [0.234, 0.397, 0.792], [0.218, 0.381, 0.772], [0.204, 0.366, 0.749], [0.189, 0.353, 0.726], [0.185, 0.349, 0.719], [0.182, 0.348, 0.716], [0.18, 0.346, 0.713], [0.178, 0.345, 0.71], [0.176, 0.343, 0.708], [0.174, 0.342, 0.705], [0.174, 0.34, 0.702], [0.173, 0.339, 0.7], [0.173, 0.337, 0.697], [0.172, 0.336, 0.694], [0.172, 0.334, 0.692], [0.171, 0.333, 0.689], [0.17, 0.332, 0.686], [0.169, 0.33, 0.683], [0.169, 0.329, 0.681], [0.168, 0.328, 0.678], [0.167, 0.326, 0.675], [0.166, 0.325, 0.673], [0.165, 0.324, 0.67], [0.164, 0.323, 0.667], [0.163, 0.322, 0.664], [0.163, 0.321, 0.662], [0.162, 0.319, 0.659], [0.161, 0.318, 0.656], [0.16, 0.317, 0.654], [0.158, 0.316, 0.651], [0.158, 0.315, 0.648], [0.157, 0.314, 0.646], [0.155, 0.313, 0.643], [0.154, 0.312, 0.641], [0.153, 0.311, 0.638], [0.152, 0.31, 0.636], [0.151, 0.309, 0.633], [0.15, 0.308, 0.631], [0.148, 0.307, 0.628], [0.147, 0.306, 0.626], [0.146, 0.306, 0.624], [0.145, 0.305, 0.621], [0.144, 0.304, 0.619], [0.143, 0.303, 0.617], [0.142, 0.302, 0.614], [0.14, 0.301, 0.612], [0.139, 0.3, 0.61], [0.138, 0.299, 0.608], [0.137, 0.298, 0.605], [0.136, 0.297, 0.603], [0.135, 0.297, 0.601], [0.134, 0.295, 0.599], [0.133, 0.295, 0.597], [0.131, 0.294, 0.596], [0.13, 0.293, 0.594], [0.13, 0.292, 0.592], [0.129, 0.291, 0.59], [0.128, 0.29, 0.589], [0.127, 0.289, 0.587], [0.126, 0.287, 0.585], [0.124, 0.286, 0.583]] as readonly Rgb[],
  clouds: {
    shapeScale: [1, 3, 1],
    shapeOctaves: [5, 16, 16, 32],
    shapeWeights: [1, 0.5, 0.3, 0.1],
    detailScale: [6, 12, 6],
    detailOctaves: [8, 16, 32],
    detailWeights: [1, 0.5, 0.3],
    spread: 0.76,
    densityOffset: -0.475,
    erosion: 1.6,
    densityPower: 0.8,
    blending: 0.7,
    start: [0.3, 0.425],
    end: [0.6, 0.7],
  },
} as const;

/** The game's post chain on a display colour (materials.ts `gamePost`, for what no shader draws: the light look's
 *  background). */
export function gamePostRgb(c: Rgb): Rgb {
  const lin = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  const disp = (v: number) => (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055);
  const curve = (x: number) => (x * (0.2 * x + 0.24 * 0.29) + 0.272 * 0.02) / (x * (0.2 * x + 0.29) + 0.272 * 0.3) - 0.02 / 0.3;
  const white = 1 / curve(5.3);
  const logC = (x: number) => (x > 0.011361 ? 0.244161 * Math.log10(5.555556 * x + 0.047996) + 0.386036 : 5.301883 * x + 0.092819);
  const fromLogC = (x: number) => (x > 5.301883 * 0.011361 + 0.092819 ? (10 ** ((x - 0.386036) / 0.244161) - 0.047996) / 5.555556 : (x - 0.092819) / 5.301883);
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  const l = c.map((v) => clamp(curve(lin(Math.max(0, v)) * 2 ** GAME_FINISH.postExposure * white) * white)).map((v) => clamp(fromLogC((logC(v) - 0.4135884) * GAME_FINISH.contrast + 0.4135884)));
  const y = 0.2126729 * l[0] + 0.7151522 * l[1] + 0.072175 * l[2];
  return l.map((v) => disp(clamp(y + GAME_FINISH.saturation * (v - y)))) as unknown as Rgb;
}

/** The post chain undone (materials.ts `gamePostInverse`): the display colour a graded one came from, where no step
 *  clipped it. The water reads the screen behind it graded, where the game's opaque texture holds it before the grade
 *  (refraction.ts). Saturation round the luminance keeps the luminance, the contrast is linear in LogC, and the
 *  Neutral curve is a ratio of quadratics, so each step is solved exactly. */
export function gamePostInverseRgb(c: Rgb): Rgb {
  const lin = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  const disp = (v: number) => (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055);
  const curve = (x: number) => (x * (0.2 * x + 0.24 * 0.29) + 0.272 * 0.02) / (x * (0.2 * x + 0.29) + 0.272 * 0.3) - 0.02 / 0.3;
  const white = 1 / curve(5.3);
  const logC = (x: number) => (x > 0.011361 ? 0.244161 * Math.log10(5.555556 * x + 0.047996) + 0.386036 : 5.301883 * x + 0.092819);
  const fromLogC = (x: number) => (x > 5.301883 * 0.011361 + 0.092819 ? (10 ** ((x - 0.386036) / 0.244161) - 0.047996) / 5.555556 : (x - 0.092819) / 5.301883);
  // (the Neutral curve's x for y: y' × (0.2x² + 0.29x + 0.0816) = 0.2x² + 0.0696x + 0.00544, its positive root)
  const uncurve = (y: number) => {
    const t = Math.min(y, 0.93) + 0.02 / 0.3;
    const a = 0.2 * t - 0.2;
    const b = 0.29 * t - 0.24 * 0.29;
    const k = 0.272 * 0.3 * t - 0.272 * 0.02;
    return Math.max(0, (b + Math.sqrt(Math.max(0, b * b - 4 * a * k))) / (-2 * a));
  };
  const s = c.map((v) => lin(Math.min(1, Math.max(0, v))));
  const y = 0.2126729 * s[0] + 0.7151522 * s[1] + 0.072175 * s[2];
  return s
    .map((v) => Math.max(0, y + (v - y) / GAME_FINISH.saturation))
    .map((v) => Math.max(0, fromLogC((logC(v) - 0.4135884) / GAME_FINISH.contrast + 0.4135884)))
    .map((v) => disp(uncurve(v / white) / white / 2 ** GAME_FINISH.postExposure)) as unknown as Rgb;
}

/** Mine sites (Kyler's rounds, D178; his colours, measured in the game; the pit's earth a little darker
 *  since D324): a rusty frame in a dull
 *  brown-orange (#844D2F) round the edge of the 5 × 5 footprint, and a pit with real depth filling
 *  the rest, its earth a dark grey-brown with roots, rubble and cracks; scaffold towers on the
 *  frame's corners with pale wooden platforms, crates and planks (#A78E65). With **Markers** on, an
 *  orange line between dark edges outlines the footprint, a few pixels wide from any distance. */
export const MINE = {
  /** The pit as it shows in its shade (about #2F312C: Kyler's #373A34 darkened a little by D324, option (a), to keep
   *  it 5 L* under #38's crimson, a margin that went on 2026-11-07, D496: by day the game draws the pit lighter than
   *  badwater, as this is): the legend's colour. */
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
  /** The ground the game's round pit leaves in its square's corners: its albedo there (UndergroundRuins.Model, the
   *  up-facing corners' mean, 0.355, 0.285, 0.195) as ours. */
  ledge: asOurs([0.355, 0.285, 0.195]),
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
  /** The baked shadow's sweeps (Standard's) take the sun this far higher and lower: none. The game's shadow edge is a
   *  shadow map's few texels (one cascade, its soft filter), the same width under a cliff of one level or ten, not an
   *  angle that widens with the drop; its probe frames read 0.3–0.4 of a tile under cliffs of 2 to 10 levels alike
   *  (`tools/shadow-edge-check.py`; docs/progress/3d-view.md, "Grass in the game's light"). 6° until 2026-11-08, then
   *  2° for a day; the width is `edge`. */
  penumbra: 0,
  /** The baked shadow's edge: the ground, along the sun's way, over which a shadow turns to sun (tiles), the same at
   *  any drop: the game's in play. Its probe frames read about 1.4 of their shadow map's texels (0.35 here read as theirs
   *  through the same measure, `tools/shadow-edge-check.py`), and in play the default preset's map (4096) over a
   *  shadow distance of at most 150 makes a texel 0.057 of a tile, so 1.4 texels / sin 45° = 0.11 along the sun's way
   *  (docs/progress/3d-view.md, "Grass in the game's light"). The shader keeps it at least a pixel wide. */
  edge: 0.11,
  sun: [1.0, 0.95, 0.86] as Rgb,
  sky: [0.63, 0.64, 0.72] as Rgb,
  /** The haze: the game's temperate daytime fog (`Sun.blueprint` `DayColors.TemperateWeatherFog`; a held hazard's in
   *  high/seasons.ts `FOG`). */
  haze: [0.4470589, 0.7607844, 0.8235295] as Rgb,
} as const;

/** The start: the game's map-editor marker (StartingLocation.Model, D496), a lantern tower of pale grey stone. Its
 *  texture is a neutral grey that shades its parts, and its material (EnvironmentURP, `StartingLocationMaterial`)
 *  multiplies it by `_Color` 0.5, so the game's albedo is half the texture's grey: area-weighted means read from its model
 *  (`tools/game-model-albedo.py`: the texture walls and shaft 0.79, cornice, gallery and cap 0.84, the roof the lightest at
 *  0.96, the lantern's inside and the openings about 0.36; the whole model 0.265), drawn at our lightness (`asOurs`, D178,
 *  D496), as the trees take the game's own colour in every look. (Until 2026-11-08 the texture's greys stood in for the
 *  albedo, twice the game's: a near-white tower that outshone everything round it.) */
export const START = {
  stone: asOurs([0.395, 0.395, 0.395]),
  trim: asOurs([0.42, 0.42, 0.42]),
  roof: asOurs([0.4815, 0.4815, 0.4815]),
  dark: asOurs([0.18, 0.18, 0.18]),
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
 *  from above, the equator's from the side, the ground's from below) as the ambient probe the engine makes of it
 *  (`GAME_AMBIENT_SH`, captured from the running game), turned to display values (URP's `SampleSH` under Gamma). The sun is its colour × its intensity, 1.1, at full shadow strength. `diffuse` is URP's
 *  0.96 − 0.96 × `_Metallic` (0.05 on the terrain's materials). The water takes it too, though its own metallic is 0
 *  (clean water's `WaterMetalAndGloss` red, badwater's `_Contamination_Metallic`), which gives 0.96: the water draws
 *  that where its look draws the game's light on it (waterPalette.ts WATER_LIGHT.held; fix/water-sky, with the
 *  detail overlay that was clean water's excess, docs/progress/3d-view.md). */
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

/** Water `depth` levels deep with a badwater share (0–1) as the shipped shaders show it on open water in full sun, before
 *  its reflection, glint and the finish (materials.ts `waterMaterial`, both looks): clean water by the game's formula
 *  × the albedo's mean, badwater by the game's formula at its pattern's mean, in the game's light (`sunlitTop`),
 *  blended by the game's tint, with badwater's emissive detail at its means on top (unless `glow` is false: the body
 *  alone, before every term added after the light); or our own calibrated colours in the Standard look's light where
 *  `GAME_WATER.use` or `GAME_BADWATER.use.standard` is off. It is the Standard look's unless `look` is "high": High draws
 *  clean water by the same formula and badwater by its own choice (`GAME_BADWATER.use.high`): the formula, or its
 *  crimson (`HIGH_WATER.bad` by the game's ramp, as `measuredSurfaceWater`), a display colour its light leaves as it
 *  is on open water in full sun. The game's light as each look draws it (waterPalette.ts WATER_LIGHT: the water's diffuse
 *  share, clean water's detail overlay) is in it. The legend and the look tests read it. */
export function waterShown(depth: number, share = 0, glow = true, look: "standard" | "high" = "standard"): Rgb {
  const up = Math.sin(LIGHT.sunElevation);
  const ours = (c: Rgb): Rgb => [0, 1, 2].map((k) => c[k] * (LIGHT.sky[k] * 1.2 + LIGHT.sun[k] * 0.3 * up)) as unknown as Rgb;
  const g = gameCleanColour(depth);
  // (the game's light on the water as the look draws it, WATER_LIGHT: the water's own diffuse share, and clean water's
  // detail overlay at the detail texture's mean)
  const lit = (c: Rgb): Rgb => sunlitTop(c).map((v) => (v * (WATER_LIGHT.held[look] ? WATER_LIGHT.diffuse : GAME_LIGHT.diffuse)) / GAME_LIGHT.diffuse) as unknown as Rgb;
  const overlay = (a: number, d: number) => (a < 0.5 ? 2 * a * d : 1 - 2 * (1 - a) * (1 - d));
  const albedo = [0, 1, 2].map((k) => g[k] * WATER_ALBEDO.mean[k]);
  const detailed = (WATER_LIGHT.detail[look] ? albedo.map((a, k) => overlay(a, GAME_BADWATER.detail[k])) : albedo) as unknown as Rgb;
  const clean = GAME_WATER.use ? lit(detailed) : ours(cleanWaterBody(depth));
  if (!(share > 0)) return clean;
  const k = BADWATER.floor + (1 - BADWATER.floor) * badwaterRamp(depth);
  const highBad = (): Rgb => badwaterGlow(HIGH_WATER.bad.map((v) => v * k) as unknown as Rgb, HIGH_WATER.bad, depth, share);
  const bad = GAME_BADWATER.use[look] ? lit(gameBadwaterColour(depth, share)) : look === "high" ? highBad() : ours(badwaterGlow(badwaterBody(depth), WATER.bad, depth, share));
  const e = glow ? gameBadwaterEmission(share) : ([0, 0, 0] as unknown as Rgb);
  const m = blendWater(clean, bad, share);
  return [0, 1, 2].map((k) => m[k] + e[k]) as unknown as Rgb;
}

/** The game's finish (D497), after the light: its scene's settings (`level2`'s RenderSettings, read raw) and its
 *  post-processing (the `Rendering/Volume` profile; the URP asset grades in LDR). Every look draws it.
 *  - The fog: Unity's exponential fog (`m_FogMode` 2) as URP draws it (its FOG_EXP programs in TerrainURP:
 *    `exp2(-unity_FogParams.x × the view depth)`, `unity_FogParams.x` = density / √ln 2, so `exp(-0.83 × density ×
 *    depth)`), toward the day's fog colour (`Sun.blueprint` `TemperateWeatherFog`, a held hazard's
 *    `HazardousWeatherFogs`: high/seasons.ts `FOG`). `fogParam` is that `unity_FogParams.x`.
 *  - The reflection probe's strength, on every environment reflection (`GAME_ENV`): 1, what the game's
 *    `Sun.UpdateColors` sets `RenderSettings.reflectionIntensity` to every frame (decompiled `Timberborn.SkySystem`: the
 *    day stage's `ReflectionsIntensity`, 1.0 at all four stages in `Sun.blueprint`), over the scene's saved
 *    `m_ReflectionIntensity` 0.65, which never shows in play.
 *  - The post chain, as URP's uber pass grades in LDR under Gamma colour space: to linear, × 2^`postExposure`
 *    (ColorAdjustments; the game's Brightness setting at its default adds none), Neutral tonemapping (Tonemapping), then
 *    the LUT: `contrast` round ACEScc's mid grey in LogC and `saturation` round the luminance (ColorAdjustments
 *    +14 and +3), back to display values. The game's bloom is added before the exposure (D497 amended 2026-11-08,
 *    render3d/bloom.ts `GAME_BLOOM`, `tools/game-bloom.py`), in Standard and High.
 *  `m_AmbientIntensity` (1.2) is not applied (D497): the game sets Trilight (decompiled `Sun`: the mode when it loads,
 *  the three colours every frame) and never sets `RenderSettings.ambientIntensity`; Unity applies the multiplier to a
 *  skybox's ambient only (its Lighting window offers it only there), which is Unity's behaviour, not the decompile's. */
export const GAME_FINISH = {
  fogDensity: 0.003,
  fogParam: 0.003 / Math.sqrt(Math.LN2),
  /** The game's farthest default zoom's camera distance (core/analysis/opening.ts: 32 × 1.3^6, zoom 6): the fog is the
   *  game's up to it, and from farther out held at what it shows there (an editing view the game doesn't have). */
  fogFarthest: 32 * 1.3 ** 6,
  reflectionIntensity: 1,
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

/** The game's ambient as Unity's ambient probe holds it (D497), captured from the running game (DGM Probe 0.3.3,
 *  `RenderSettings.ambientProbe`, run 20261109-2110-smoke; investigation/notes/game-ambient-probe.md). The engine makes
 *  the probe of a Trilight from its three colours in linear values (sRGB decoded), and the probe it holds is the light
 *  itself: `SphericalHarmonicsL2.Evaluate` and URP's SampleSH return its polynomial by the normal, which URP turns to
 *  display values under Gamma. A Trilight's depends on the normal's height y alone:
 *  `E(y) = c0 + c1 y + c2 (3y² − 1)`, with c0 = (4 equator + sky + ground) / 6, c1 = √6/9 (sky − ground) and
 *  c2 = 5/96 (sky + ground − 2 equator), exact to 1e-7 on the day's, the sunset's and the night's colours alike. (It is
 *  not the gradient's projection we had worked out, which lit shade about a tenth darker.) */
export const GAME_AMBIENT_SH = trilightSH(GAME_AMBIENT_LINEAR.sky, GAME_AMBIENT_LINEAR.equator, GAME_AMBIENT_LINEAR.ground);

/** Any Trilight's ambient probe as the engine makes it (its colours in linear values), as `GAME_AMBIENT_SH` takes the
 *  day's; the pixel judge takes another time of day's with it (tools/game-day-light.ts). */
export function trilightSH(sky: Rgb, eq: Rgb, ground: Rgb): { c0: Rgb; c1: Rgb; c2: Rgb } {
  const c = (k: number) => [(4 * eq[k] + sky[k] + ground[k]) / 6, (Math.sqrt(6) / 9) * (sky[k] - ground[k]), (5 / 96) * (sky[k] + ground[k] - 2 * eq[k])];
  const [r, g, b] = [c(0), c(1), c(2)];
  return { c0: [r[0], g[0], b[0]] as Rgb, c1: [r[1], g[1], b[1]] as Rgb, c2: [r[2], g[2], b[2]] as Rgb };
}

/** The game's ambient on a face whose normal has height y, in display values (`GAME_AMBIENT_SH`, or another SH, as
 *  SampleSH returns it under Gamma colour space). */
export function gameAmbient(y: number, sh: { c0: Rgb; c1: Rgb; c2: Rgb } = GAME_AMBIENT_SH): Rgb {
  const { c0, c1, c2 } = sh;
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

/** The ground's base colour (before light and texture) for soil bytes, in moisture mode; the
 *  shader's `groundColor` does the same per pixel. Contamination is a layer drawn over it (its
 *  veins, `contaminationWeight` × the pattern's alpha): the ground under and between them keeps its own colour. */
export function groundColor(moisture: number, contamination: number, underwater: boolean): Rgb {
  switch (groundKind(moisture, contamination, underwater)) {
    case "underwater":
      return GROUND.underwater;
    case "contaminated":
      return groundColor(moisture, 0, false);
    case "moist":
      // (the game's grass, the same at every moisture: GROUND.grass)
      return GROUND.grass;
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
          { swatch: l(GROUND.grass), label: "Moist ground" },
          { swatch: cracks(sunlitTop(GROUND.dry), sunlitTop(GROUND.crack)), label: "Dry ground" },
          {
            // the game's rusty veins over the ground, dry earth and grass alike, as a sunlit top shows them
            swatch: icon(
              `<rect width="12" height="16" fill="${l(GROUND.dry)}"/><rect x="12" width="12" height="16" fill="${l(GROUND.grass)}"/>` +
                `<path d="M0 4 L5 6 L4 11 L9 13 M5 6 L11 3" stroke="${l(CONTAMINATION.vein)}" stroke-width="1.3" fill="none"/>` +
                `<path d="M12 5 L17 7 L16 12 L22 14 M17 7 L23 3" stroke="${l(CONTAMINATION.vein)}" stroke-width="1.3" fill="none"/>`,
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
    // badwater as it shows a level deep, its glowing lines round its cells (Q9 P9)
    { swatch: icon(`<path d="M0 9 Q4 5 9 7 T17 4 L24 6 M9 7 L11 15 M17 4 L19 0" stroke="${c(BADWATER_GLOW_COLOUR)}" stroke-width="0.9" fill="none" opacity="0.8"/>`, c(waterShown(1, 1))), label: "Badwater" },
    { swatch: walls, label: "Walls" },
    { swatch: cssColor(DEAD_TREE), label: "Dead trees" },
  ];
}

/** The legend's lines for water mixed with badwater and for what stands on the map: trees, the
 *  start, slopes, ruins and the other objects, each as its model looks from above. */
export function objectLegend(): LegendEntry[] {
  const c = cssColor;
  const grass = c(sunlitTop(GROUND.grass));
  const dry = c(sunlitTop(GROUND.dry));
  return [
    {
      // clean water turning to badwater as the game turns it (teal-grey, grey, dull red-brown, crimson;
      // D496), as it shows a level deep, with badwater's glowing lines toward its end
      swatch:
        icon(`<path d="M14 9 Q17 6 20 8 T24 7 M20 8 L21 14" stroke="${c(BADWATER_GLOW_COLOUR)}" stroke-width="0.9" fill="none" opacity="0.8"/>`) +
        `, linear-gradient(90deg, ${[0, 0.25, 0.5, 0.75, 1].map((share) => c(waterShown(1, share))).join(", ")})`,
      label: "Mixed water",
    },
    {
      swatch: icon(`<circle cx="7" cy="8" r="5" fill="${c(LIVING_TREE)}"/><path d="M16 2 L21 14 H11Z" fill="${c(TREE_COLOURS.pine)}"/>`, grass),
      label: "Trees and bushes",
    },
    {
      swatch: icon(
        // the lantern tower: its walled base, the roof, the shaft, the lantern and the cap
        `<rect x="5" y="11" width="14" height="5" fill="${c(START.stone)}"/><rect x="4" y="10" width="16" height="1.3" fill="${c(START.trim)}"/>` +
          `<path d="M4.5 10 L8.5 7.5 L15.5 7.5 L19.5 10Z" fill="${c(START.roof)}"/><path d="M9 7.5 L10 3.6 L14 3.6 L15 7.5Z" fill="${c(START.stone)}"/>` +
          `<rect x="9" y="3" width="6" height="0.9" fill="${c(START.trim)}"/><rect x="10.6" y="1.4" width="2.8" height="1.6" fill="${c(START.dark)}"/><path d="M9.6 1.4 L12 0 L14.4 1.4Z" fill="${c(START.trim)}"/>` +
          `<rect x="11" y="13" width="2" height="3" fill="${c(START.dark)}"/>`,
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
      // the rusty frame round the footprint, the pit filling it, its corners pale ground, rusty posts round its lip
      swatch: icon(
        `<rect x="4" y="1" width="16" height="14" fill="${c(MINE.frame)}"/><rect x="5.3" y="2.3" width="13.4" height="11.4" fill="${c(MINE.pit)}"/>` +
          `<rect x="5.3" y="2.3" width="3" height="3" fill="${c(MINE.wood)}"/><rect x="15.7" y="2.3" width="3" height="3" fill="${c(MINE.wood)}"/><rect x="5.3" y="10.7" width="3" height="3" fill="${c(MINE.wood)}"/><rect x="15.7" y="10.7" width="3" height="3" fill="${c(MINE.wood)}"/>` +
          `<rect x="8.3" y="2.3" width="7.4" height="0.8" fill="${c(MINE.frame)}"/><rect x="8.3" y="12.9" width="7.4" height="0.8" fill="${c(MINE.frame)}"/><rect x="5.3" y="5.3" width="0.8" height="5.4" fill="${c(MINE.frame)}"/><rect x="17.9" y="5.3" width="0.8" height="5.4" fill="${c(MINE.frame)}"/>`,
        dry,
      ),
      label: "Mine site",
    },
    {
      // the outcrop of dark rock in the water it gives
      swatch: icon(`<circle cx="12" cy="8" r="7" fill="${c([0.32, 0.62, 0.95])}"/><path d="M8 11 L9 6 L12 3.5 L15.5 5.5 L16.5 10.5 L13 12.5Z" fill="${c(LANDMARK.rock)}"/><path d="M9 6 L12 3.5 L15.5 5.5 L12 7Z" fill="${c(LANDMARK.rockTop)}"/>`, dry) + `, ${dry}`,
      label: "Water source",
    },
    {
      // the flat dark crater, darker in its middle, low stones round its rim
      swatch: icon(`<circle cx="12" cy="8" r="7" fill="${c(LANDMARK.crater)}"/><circle cx="12" cy="8" r="4.5" fill="${c(LANDMARK.craterDeep)}"/><circle cx="12" cy="8" r="2" fill="${c([0.17, 0.155, 0.13])}"/>` +
        `<circle cx="5.5" cy="6" r="0.9" fill="${c(LANDMARK.craterRim)}"/><circle cx="17.5" cy="11" r="0.9" fill="${c(LANDMARK.craterRim)}"/><circle cx="14" cy="1.6" r="0.8" fill="${c(LANDMARK.craterRim)}"/><circle cx="9" cy="14.3" r="0.8" fill="${c(LANDMARK.craterRim)}"/>`, dry),
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
        `<rect width="12" height="16" fill="${c(GROUND.dry)}"/><rect x="12" width="12" height="16" fill="${c(GROUND.grass)}"/>` +
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

