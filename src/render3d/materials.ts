// The 3D view's shaders (Map look, PLAN §20 D86, D110 and D114; D45 before it), tuned to Kyler's
// in-game reference screenshots. One light for terrain, water and objects: a warm sun from the
// north-west (the 2D preview's hillshade direction) with soft shadows baked when the mesh is built
// (light.ts), a cool sky light (violet in the earth's shadows) dimmed by the sky each point sees,
// then a light blue-grey haze over distant ground and a warm grade. Shadows keep four fifths of the
// light, so the soils keep their order of lightness in shadow too (D114). Under a roof (a cave, an overhang, an
// arch) a terrain face takes the light of its own air instead, from the light volume (caveLight.ts): the sky
// walked in from the openings, never below 0.30, and the sun where a ray reaches it. Every texture is made by a shader:
// the patterns (value noise, the cracks of dry earth, the cobbles of the walls) are drawn once
// into a small tiling texture when the view starts (`drawPatterns`), so the view needs no image
// files, and reading them costs far less than computing them per pixel.
//
// - Terrain tops are coloured by soil (palette.ts): moist ground yellow-green grass whose edge
//   bleeds onto the earth in patches; dry ground cracked earth, grey-brown; contamination a layer
//   over either, the game's pattern of thin dark-rust cracks (soilTexture.ts) by the game's weight,
//   the same at any level over a fifth, no glow; a dark bed under water; or by height, with the
//   toggle. Soil blends between tiles of one height, never over a cliff, and every tile's middle
//   shows its own soil.
// - Walls are cobbled stone tinted by height as the game's cliffs (D497), and with Markers a pale
//   ledge over a dark groove between levels, at least a pixel wide at any zoom, so levels can be
//   counted; a lip of the top's ground.
// - Clean water is the game's colour by depth (its formula: waterPalette.ts GAME_WATER), its surface the game's
//   textures carried by the flow (waterTextures.ts) and lit as the game's, with the sun's sheen, no sparkle, no foam.
//   Falls are the water's own
//   vertical faces where it steps down, as the game draws them (D201 amended 2026-10-29): the water's
//   colour with its texture running down, nearly opaque, no whitewater.
//   Badwater is the game's too (its formula: waterPalette.ts GAME_BADWATER): a red-brown between near black and
//   crimson by a grimy pattern the flow carries, its glowing lines (an emissive detail) flowing with it, duller and
//   with its ripples twice as strong. Water partly bad turns from clean water to badwater with its badwater
//   share, blended between tiles as the game's (about a tile wide), by the game's tint, its hue turning
//   early from teal through a teal-grey and a warm brown to crimson, never purple, so where they meet the colour changes in a soft gradient, never in streaks or
//   patches, and a mixed river reads as poisoned; its glowing lines come in with it, brightest at a front, as the
//   game's. Every water colour and the water's opacity come from waterPalette.ts (`WATER_GLSL`, D177).
// - A per-tile overlay (selection, previews, layers) and the hovered tile stay on top. An overlay
//   tile with full alpha is hatched (dam sites): light stripes in its colour and dark stripes,
//   solid light when too small for stripes, and a dark rim just outside, so it shows on any
//   ground or water in any colours.
// - Objects that must read from afar (dead trees, slope arrows, the start) grow when they would
//   be smaller on screen than their minimum size, up to a limit of their own. A model's parts for
//   close up and for afar (ruins: the skeleton, panels and ivy close up, a solid block per storey
//   from afar) are drawn by the instance's size on screen.
// - With **Markers** on, an orange line between dark edges outlines each mine site's footprint from
//   just outside it, a few pixels wide from any distance (entities3d.ts `mineOutline`).
// Colours are display values: the renderer outputs them without conversion.

import {
  Color,
  Data3DTexture,
  DataTexture,
  DoubleSide,
  LinearFilter,
  LinearMipmapLinearFilter,
  Mesh,
  NearestFilter,
  OrthographicCamera,
  PlaneGeometry,
  RepeatWrapping,
  RGBAFormat,
  RGFormat,
  Scene,
  ShaderMaterial,
  UnsignedByteType,
  Vector2,
  Vector3,
  Vector4,
  WebGLRenderTarget,
  type Texture,
  type WebGLRenderer,
} from "three";
import { ALTITUDE_RAMP, BLEND, CONTAMINATION as CT, CONTAMINATION_OUTLINE as OUTLINE, CUT_CAP, DESERT, GAME_AMBIENT_SH, GAME_ENV, gameAmbient, GAME_FINISH, GAME_GROUND_MEAN, GAME_LIGHT, GROUND, HATCH, HEIGHT_RAMP, JUICE, LANDMARK, LIGHT, MINE, NOISE_NODES, GAME_SKY, WALL, WATER_SURFACE as WS, type Rgb } from "./palette";
import { GAME_BADWATER, GAME_WATER_SOURCE, WATER_GLSL, WATER_LIGHT, WATER_SHARE_BLEND, WATER_UI } from "./waterPalette";
import { DETAIL_FLAT, GAME_SOURCE_SHAPE, WATER_ALBEDO, WATER_FLOW_GLSL, WATER_TEXTURE_SIZE } from "./waterTextures";
import { GAME_SOIL_TEXTURE, SOIL_TEXTURE_SIZE } from "./soilTexture";
import { SHORE_FILM, SHORE_FILM_TERRAIN_GLSL, SHORE_FILM_VERTEX_GLSL } from "./shoreFilm";
import { EDGE_BAND, SHADOW_OFFSET, SHADOW_RES, SHADOW_SCALE, WATER_BYTE_FINE, WATER_BYTE_STEPS, type TileSpan } from "./light";
import { LIGHT_LEVELS, SUN_MARCH_STEP, SUN_MARCH_STEPS, type CaveLight } from "./caveLight";
import { CUT_SLACK, VIEW_TAN } from "./cutWater";
import { FALL } from "./waterMesh";
import { RUN_LEVELS, type RunSoil } from "./runSoil";
import { DITHER_GLSL, FADE_OFF, OBJECT_FADE_GLSL } from "./objectFade";
import { FALL_MASK_GLSL } from "./fallMask";
import { REFRACTION_GLSL, REFRACTION_INPUTS_GLSL, WATER_REFRACTION, refractionUniforms, type RefractionUniforms } from "./refraction";
import { VIEW_DEPTH_GLSL } from "./viewDepth";

const az = LIGHT.sunAzimuth;
const ce = Math.cos(LIGHT.sunElevation);
/** Toward the sun, in world space (X east, Y up, Z south). */
export const SUN = new Vector3(az[0] * ce, Math.sin(LIGHT.sunElevation), -az[1] * ce).normalize();

const color = (c: Rgb) => new Color(c[0], c[1], c[2]);

/** Uniforms every material shares: one object per value, so a change reaches them all. The refraction's (refraction.ts:
 *  the copy of the screen behind the water and its state) are the water's alone. */
export interface SceneUniforms extends RefractionUniforms {
  /** 1 while the frame before the grade is drawn for the bloom (bloom.ts, `BLOOM_SOURCE`). */
  bloomSource: { value: number };
  sunDir: { value: Vector3 };
  sunColor: { value: Color };
  skyColor: { value: Color };
  /** The fog's colour: the game's day fog, or a held hazard's (high/seasons.ts `FOG`). */
  hazeColor: { value: Color };
  /** The game's exponential fog's `unity_FogParams.x` (`GAME_FINISH.fogParam`; 0 looking straight down, where the game
   *  never looks). */
  fogDensity: { value: number };
  /** How much of the view depth the fog leaves out: past the game's farthest default zoom, the camera's distance beyond
   *  it (renderer.ts applyFog). */
  fogShift: { value: number };
  /** The camera's near plane: URP's fog counts the depth from it (UNITY_Z_0_FAR_FROM_CLIPSPACE). */
  fogNear: { value: number };
  /** The tints a highlighted object takes after the grade (renderer.ts highlightObjects: Remove's red, D184; a
   *  source's clear red, D249). */
  aidTint: { value: Vector3 };
  sourceTint: { value: Vector3 };
  time: { value: number };
  tileTex: { value: DataTexture };
  lightTex: { value: DataTexture };
  overlay: { value: DataTexture };
  /** Hatched overlay tiles and their neighbours (`hatchMarks`), and whether there are any. */
  marks: { value: DataTexture };
  hatching: { value: number };
  /** The information layer (**Markers**): 1 on, 0 off (the clean view). */
  markers: { value: number };
  /** Where the contamination outline runs (`contaminationEdges`), drawn with **Markers** on. */
  contamEdges: { value: DataTexture };
  /** Where the outline round mine sites runs (entities3d.ts `mineOutline`), with **Markers** on. */
  siteEdges: { value: DataTexture };
  mapSize: { value: Vector2 };
  /** The tiling patterns (drawPatterns). */
  patternTex: { value: Texture | null };
  /** The view's height in CSS pixels (objects' minimum sizes). */
  viewHeight: { value: number };
  /** Clear water (D196, D212): 1 makes all the water see-through (T; the bed, ledges and sources
   *  show), with badwater still plainly marked; 0 the normal look. */
  clearWater: { value: number };
  /** Clear water round the brush (D212): its middle (tiles), the radius it is clear to, and 1 while
   *  it paints a submerged bed (0: nowhere). */
  clearAround: { value: Vector4 };
  /** The layer the world is sliced at (D196, the game's layers): everything above it is cut away;
   *  99 shows it all. */
  slice: { value: number };
  /** Level lines (the brush kit's toggle): a thin line along every edge where the ground steps down. */
  levelLines: { value: number };
  /** Where the sources are (`sourceTiles`): R a clean source's middle tile, G a bad one's, B one the
   *  pointer's water comes from (D196), A one highlighted (D249: Remove's red, Clear sources' glow). */
  sourceTex: { value: DataTexture };
  /** 1 while a source is highlighted: the water over it turns its clear red (under water too). */
  sourceLit: { value: number };
  /** The water's current and smoothed contamination, one texel a tile (motion.ts, D353): RG the
   *  current as drawn (128 still), B the badwater share, A the game's waterfall mask (fallMask.ts: 0 dry, 1 + 254 × the
   *  mask wet); the moving water reads it in both looks. */
  flowTex: { value: DataTexture };
  /** The surface the water's flow carries (waterTextures.ts: RG the albedo's fields, BA the slopes), shared by the page
   *  (`waterSurfaceTexture`). */
  waterTex: { value: DataTexture };
  /** Badwater's pattern the flow carries (waterTextures.ts `makeBadwaterTexture`: R the base colour's, G the emissive
   *  detail's) and the still detail albedo (B, at its own tiling), shared by the page (`badwaterPatternTexture`). */
  badwaterTex: { value: DataTexture };
  /** Contaminated ground's pattern (soilTexture.ts: RGB its colour, A its cover), shared by the page
   *  (`soilPatternTexture`). */
  soilTex: { value: DataTexture };
  /** The light under roofs (caveLight.ts): RG a cell, the sky and the sun, and its size in cells
   *  (0, 0, 0 on a map with no air under a roof: the baked light everywhere). */
  caveTex: { value: Data3DTexture };
  caveSize: { value: Vector3 };
  /** At least the highest ground (caveLight.ts `highest`, kept as edits raise it): the sun's march
   *  under roofs has left the land above it. */
  caveTop: { value: number };
  /** The soil of the run tops below each tile's top (runSoil.ts): RG a cell, read only where the terrain's
   *  `RUN_SOIL` branch is compiled (a map with terrain above terrain); elsewhere the light volume's
   *  placeholder, never read. */
  runTex: { value: Data3DTexture };
  /** The flow and contamination of the water below each tile's surface water (caveCurrent.ts): RGBA a cell from level
   *  `caveFlowLevels.x`, `caveFlowLevels.y` levels (0: none, the flow texture everywhere), read only where the water's
   *  `CAVES` branch is compiled. */
  caveFlowTex: { value: Data3DTexture };
  caveFlowLevels: { value: Vector2 };
  /** The overlay on one run per tile (overlayRuns.ts: a selection taken on a cave's floor), RGBA a tile; read only on a
   *  map with terrain above terrain (the terrain's `CUTAWAY`, the water's `CAVES`), the placeholder elsewhere. */
  overlayRuns: { value: DataTexture };
  /** What the rest of such a tile's column takes instead of its overlay (the land outside the selection), 0–1. */
  overlayRest: { value: Vector4 };
  /** Objects faded round the pointer (objectFade.ts): the region's middle (tiles), its radius, and how it is drawn
   *  (`FADE_OFF`, `FADE_COVERAGE`, `FADE_DITHER`); read only by the objects' program. */
  objectFade: { value: Vector4 };
  /** 1 while the objects are hidden (objectFade.ts; all but the land's own shape), 0 otherwise. */
  objectHide: { value: number };
}

export function sceneUniforms(W: number, H: number, tile: DataTexture, light: DataTexture, overlay: DataTexture, marks: DataTexture, edges: DataTexture = overlayTexture(1, 1), sites: DataTexture = overlayTexture(1, 1)): SceneUniforms {
  const noCave = caveTexture(null);
  return {
    sunDir: { value: SUN.clone() },
    sunColor: { value: color(LIGHT.sun) },
    skyColor: { value: color(LIGHT.sky) },
    hazeColor: { value: color(LIGHT.haze) },
    fogDensity: { value: GAME_FINISH.fogParam },
    fogShift: { value: 0 },
    fogNear: { value: 0 },
    aidTint: { value: new Vector3(1.6, 0.35, 0.3) },
    sourceTint: { value: new Vector3(1.6, 0.35, 0.3) },
    time: { value: 0 },
    tileTex: { value: tile },
    lightTex: { value: light },
    overlay: { value: overlay },
    marks: { value: marks },
    hatching: { value: 0 },
    markers: { value: 0 },
    contamEdges: { value: edges },
    siteEdges: { value: sites },
    mapSize: { value: new Vector2(W, H) },
    patternTex: { value: null },
    viewHeight: { value: 800 },
    clearWater: { value: 0 },
    clearAround: { value: new Vector4(0, 0, 0, 0) },
    slice: { value: 99 },
    levelLines: { value: 0 },
    sourceTex: { value: overlayTexture(1, 1) },
    sourceLit: { value: 0 },
    flowTex: { value: stillFlow() },
    waterTex: { value: waterSurfaceTexture() },
    badwaterTex: { value: badwaterPatternTexture() },
    soilTex: { value: soilPatternTexture() },
    caveTex: { value: noCave },
    caveSize: { value: new Vector3(0, 0, 0) },
    caveTop: { value: 0 },
    runTex: { value: noCave },
    caveFlowTex: { value: noCaveCurrent() },
    caveFlowLevels: { value: new Vector2(0, 0) },
    overlayRuns: { value: overlayTexture(1, 1) },
    overlayRest: { value: new Vector4(0, 0, 0, 0) },
    objectFade: { value: new Vector4(0, 0, 0, FADE_OFF) },
    objectHide: { value: 0 },
    bloomSource: BLOOM_SOURCE,
    ...refractionUniforms(),
  };
}

/** The bloom's source pass (bloom.ts): 1 while the frame before the grade is drawn for it. One uniform every look
 *  material shares, as a view draws its frames one at a time. */
export const BLOOM_SOURCE = { value: 0 };

/** An eruption's lava as the terrain shader draws it (D206), by its cooling's age (s): its own light (an emission, `hot`
 *  turning to `cooled` over `cooling`), at most `most` of a pixel's colour, the ground under it darkening to a crust
 *  (× `crustTint`, over `crust`) that puts its light out, and the whole fading back into the ground (over `fade`). The
 *  bloom reads it too (bloom.ts `lavaSourceMax`, `LAVA_BLOOM_ENDS`), so the shader and the bloom's gate can't drift. */
export const LAVA = {
  hot: [3.2, 0.5, 0.02] as Rgb,
  cooled: [0.38, 0.028, 0.013] as Rgb,
  cooling: 3.6,
  crust: [2.0, 5.8] as readonly [number, number],
  crustTint: [0.49, 0.46, 0.43] as Rgb,
  fade: [3.3, 6.4] as readonly [number, number],
  most: 0.9,
} as const;

let noCaveFlow: Data3DTexture | null = null;
/** The cave current's placeholder (one still cell), shared: never read while `caveFlowLevels.y` is 0. */
export function noCaveCurrent(): Data3DTexture {
  return (noCaveFlow ??= caveCurrentTexture(new Uint8Array([128, 128, 0, 0]), 1, 1, 1));
}

/** The current of the water below each tile's surface water as a 3D texture (caveCurrent.ts), filtered across tiles
 *  as the flow texture is (the shader samples a level's middle, so levels never blend). */
export function caveCurrentTexture(data: Uint8Array, W: number, H: number, levels: number): Data3DTexture {
  const t = new Data3DTexture(data, W, H, levels);
  t.format = RGBAFormat;
  t.type = UnsignedByteType;
  t.magFilter = LinearFilter;
  t.minFilter = LinearFilter;
  t.unpackAlignment = 1;
  t.needsUpdate = true;
  return t;
}

/** The soil per run top as a 3D texture (runSoil.ts): read cell by cell (`texelFetch`), never filtered. */
export function runTexture(r: RunSoil): Data3DTexture {
  const t = new Data3DTexture(r.data, r.W, r.H, r.D);
  t.format = RGFormat;
  t.type = UnsignedByteType;
  t.magFilter = NearestFilter;
  t.minFilter = NearestFilter;
  t.unpackAlignment = 1;
  t.needsUpdate = true;
  return t;
}

/** The light under roofs as a 3D texture, filtered (a cave's light softens toward its rock); a single
 *  cell where a map has none. */
export function caveTexture(v: CaveLight | null): Data3DTexture {
  const t = v ? new Data3DTexture(v.data, v.W, v.H, LIGHT_LEVELS) : new Data3DTexture(new Uint8Array([255, 255]), 1, 1, 1);
  t.format = RGFormat;
  t.type = UnsignedByteType;
  t.magFilter = LinearFilter;
  t.minFilter = LinearFilter;
  t.unpackAlignment = 1;
  t.needsUpdate = true;
  return t;
}

let surfaceTex: DataTexture | null = null;
/** The surface the water's flow carries (waterTextures.ts), one for the page: flat at its mean (no ripples) until the
 *  bake worker has made it (`fillWaterTexture`). Repeating, mipmapped and filtered at a slant, as the game samples its
 *  own. */
export function waterSurfaceTexture(): DataTexture {
  if (surfaceTex) return surfaceTex;
  const n = WATER_TEXTURE_SIZE;
  const data = new Uint8Array(n * n * 4);
  const r = Math.round(WATER_ALBEDO.flat[0]);
  const g = Math.round(WATER_ALBEDO.flat[1]);
  for (let i = 0; i < n * n; i++) data.set([r, g, 128, 128], i * 4);
  const t = new DataTexture(data, n, n, RGBAFormat, UnsignedByteType);
  t.wrapS = t.wrapT = RepeatWrapping;
  t.magFilter = LinearFilter;
  t.minFilter = LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 8;
  t.needsUpdate = true;
  return (surfaceTex = t);
}

let badTex: DataTexture | null = null;
/** Badwater's pattern the flow carries (waterTextures.ts `makeBadwaterTexture`), with the still detail albedo in its B
 *  and the water sources' pattern in its A, one for the page: flat at their means until the bake worker has made it,
 *  sampled as the surface's. */
export function badwaterPatternTexture(): DataTexture {
  if (badTex) return badTex;
  const n = WATER_TEXTURE_SIZE;
  const data = new Uint8Array(n * n * 4);
  const r = Math.round(GAME_BADWATER.pattern[0] * 255);
  const g = Math.round(GAME_BADWATER.pattern[1] * 255);
  const a = Math.round(GAME_SOURCE_SHAPE.mean);
  for (let i = 0; i < n * n; i++) data.set([r, g, DETAIL_FLAT, a], i * 4);
  const t = new DataTexture(data, n, n, RGBAFormat, UnsignedByteType);
  t.wrapS = t.wrapT = RepeatWrapping;
  t.magFilter = LinearFilter;
  t.minFilter = LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 8;
  t.needsUpdate = true;
  return (badTex = t);
}

let soilTex: DataTexture | null = null;
/** The pattern contaminated ground takes (soilTexture.ts `makeSoilTexture`), one for the page: flat at the game's
 *  pattern's mean (its colour and alpha) until the bake worker has made it, sampled as the game samples its own
 *  (repeating, mipmapped, filtered at a slant). */
export function soilPatternTexture(): DataTexture {
  if (soilTex) return soilTex;
  const n = SOIL_TEXTURE_SIZE;
  const data = new Uint8Array(n * n * 4);
  const flat = [...GAME_SOIL_TEXTURE.mean.map(Math.round), Math.round(GAME_SOIL_TEXTURE.meanAlpha * 255)];
  for (let i = 0; i < n * n; i++) data.set(flat, i * 4);
  const t = new DataTexture(data, n, n, RGBAFormat, UnsignedByteType);
  t.wrapS = t.wrapT = RepeatWrapping;
  t.magFilter = LinearFilter;
  t.minFilter = LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 8;
  t.needsUpdate = true;
  return (soilTex = t);
}

/** The light look's patterns, the still detail albedo and the water sources' (bake.ts "detailTexture"), written into
 *  badwater's texture's B and A (its R and G stay at their means: the light look never reads them). */
export function fillDetailTexture(detail: Uint8Array, shape: Uint8Array): void {
  const b = badwaterPatternTexture();
  const data = b.image.data as Uint8Array;
  for (let i = 0; i < detail.length; i++) (data[i * 4 + 2] = detail[i]), (data[i * 4 + 3] = shape[i]);
  b.needsUpdate = true;
}

/** The bake worker's surface, badwater's pattern and contaminated ground's (high/bake.ts `waterTexture`) into the
 *  page's textures. */
export function fillWaterTexture(data: Uint8Array, bad: Uint8Array, soil: Uint8Array): void {
  const t = waterSurfaceTexture();
  (t.image.data as Uint8Array).set(data);
  t.needsUpdate = true;
  const b = badwaterPatternTexture();
  (b.image.data as Uint8Array).set(bad);
  b.needsUpdate = true;
  const s = soilPatternTexture();
  (s.image.data as Uint8Array).set(soil);
  s.needsUpdate = true;
}

/** A flow texture with no current (until a map's arrives). */
function stillFlow(): DataTexture {
  const t = new DataTexture(new Uint8Array([128, 128, 0, 0]), 1, 1, RGBAFormat, UnsignedByteType);
  t.needsUpdate = true;
  return t;
}

const f = (v: number) => (Number.isInteger(v) ? `${v}.0` : String(v));
const glColor = (c: Rgb) => `vec3(${c.map((v) => f(Math.round(v * 1000) / 1000)).join(", ")})`;
/** A colour or coefficients to six places (the ambient's SH, which can be small or negative). */
const glColor3 = (c: Rgb) => `vec3(${c.map((v) => f(Math.round(v * 1e6) / 1e6)).join(", ")})`;

/** The game's light on its water (palette.ts GAME_LIGHT; Q9 P15) in display values, as the terrain's gameLight: the
 *  ambient probe by the normal, turned back to display values, and the sun by its shadow, times the diffuse share
 *  (`gameWaterDiffuse`: the terrain's 0.912, or the water's own at its metallic 0, 0.96, where the look draws the terms
 *  #839 held back, waterPalette.ts WATER_LIGHT.held; High's hook sets its own); and clean water's colour by the game's
 *  formula under it (waterPalette.ts GAME_WATER, `gameCleanColour`) × the albedo, over the light the caller multiplies
 *  by (`light`), so the product is the game's, overlaid with the game's still detail albedo where the look draws it
 *  (`gameWaterDetail`, WATER_LIGHT.detail; `waterDetail`, its texture's colour here). `GAME_SUN_COLOUR` is the game's `_MainLightColor`, on its highlight and
 *  glint where the look draws the game's light (WATER_LIGHT.game). Both looks' water. */
const GAME_WATER_LIGHT = /* glsl */ `#define GAME_SUN_COLOUR ${glColor(GAME_LIGHT.sun)}
      #if WATER_HELD
        float gameWaterDiffuse = ${f(WATER_LIGHT.diffuse)};
      #else
        float gameWaterDiffuse = ${f(GAME_LIGHT.diffuse)};
      #endif
      vec3 gameWaterLight(vec3 n, float sun) {
        vec3 sh = max(${glColor3(GAME_AMBIENT_SH.c0)} + ${glColor3(GAME_AMBIENT_SH.c1)} * n.y + ${glColor3(GAME_AMBIENT_SH.c2)} * (3.0 * n.y * n.y - 1.0), vec3(0.0));
        vec3 ambient = mix(sh * 12.92, 1.055 * pow(sh, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), sh));
        return gameWaterDiffuse * (ambient + ${glColor(GAME_LIGHT.sun)} * max(dot(n, sunDir), 0.0) * sun);
      }
      /** Whether clean water's colour × albedo is overlaid with the game's still detail albedo (Q9 P6), \`waterDetail\`
       *  (waterPalette.ts WATER_LIGHT.detail; High's hook sets its own). */
      float gameWaterDetail = float(WATER_DETAIL);
      vec3 gameWaterFormula(float depth, vec3 albedo, vec3 n, float sun, vec3 light) {
        vec3 a = gameCleanColour(depth) * albedo;
        a = mix(a, waterDetailOverlay(a), gameWaterDetail);
        // (over a water source, the game's own pattern lifts it: Q9 P7, waterPalette.ts GAME_WATER_SOURCE)
        a = waterSourceLift(a);
        return a * gameWaterLight(n, sun) / max(light, 0.001);
      }`;

/** A source the pointer's water comes from (D196): its model takes the glow its water does (the water's colour mixed
 *  0.45 toward `WATER_UI.sourceGlow`), as a tint of its rock's main colour, so a source's rock in the middle of its
 *  glowing water glows with it. */
const shine = (rock: readonly number[]): Rgb => [0, 1, 2].map((j) => 0.55 + (0.45 * WATER_UI.sourceGlow[j]) / rock[j]) as unknown as Rgb;

/** The tints an editing aid puts on an object after the grade (objectMaterial), by index: 0 the highlight's
 *  (`aidTint`, Remove's red), 1 a source's (`sourceTint`), 2–4 the placement ghost's where it fits, warns or is refused
 *  (D184), 5–6 a water or badwater source's glow when the pointer's water comes from it (D196). renderer.ts writes the
 *  object's instance colour as −colour − 10 × index. */
export const AID_TINT = {
  highlight: 0,
  source: 1,
  ghost: { fits: 2, warns: 3, refused: 4 },
  glow: { WaterSource: 5, BadwaterSource: 6 },
  fits: [0.7, 1.3, 0.7] as Rgb,
  warns: [1.4, 1.1, 0.5] as Rgb,
  refused: [1.5, 0.55, 0.5] as Rgb,
  waterGlow: shine(LANDMARK.rock),
  badwaterGlow: shine(LANDMARK.crater),
} as const;

/** The grass's painted strokes' mean (groundColor's `painted × (0.08 + bladeHash × 0.16)`, one stroke a cell, its
 *  width 0.08 across, fading over 0.18–0.42 along, from a point 0.2–0.8 into its cell, turned by its hash), over the
 *  cell and its hash, with the stroke widened by `aa` (its edge's smoothstep, a pixel's footprint across it): what the
 *  strokes give the grass on average. */
export function paintedMean(aa: number, n = 48): number {
  const smooth = (a: number, b: number, x: number) => {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };
  const H = 64;
  let sum = 0;
  for (let i = 0; i < H; i++) {
    const h = (i + 0.5) / H;
    const turn = h * 6.28318;
    const [cx, cy] = [0.2 + h * 0.6, 0.2 + ((h * 13.7) % 1) * 0.6];
    const [co, si] = [Math.cos(turn), Math.sin(turn)];
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        const [dx, dy] = [(x + 0.5) / n - cx, (y + 0.5) / n - cy];
        // (GLSL's mat2(a, b, c, d) × v is (a v.x + c v.y, b v.x + d v.y))
        const [bx, by] = [co * dx + si * dy, -si * dx + co * dy];
        const u = Math.abs(bx + by * 0.25);
        const across = aa > 0 ? 1 - smooth(0.04, 0.04 + aa, u) : u < 0.04 ? 1 : 0;
        sum += across * (1 - smooth(0.18, 0.42, Math.abs(by))) * (0.08 + h * 0.16);
      }
  }
  return sum / (H * n * n);
}

/** The strokes' mean, drawn sharp: what they fade to from afar, so the grass's mean holds at every distance as a
 *  texture's does through its mips (the game's, D497). */
export const PAINTED_MEAN = Math.round(paintedMean(0) * 1e5) / 1e5;

/** Widened by a pixel's footprint `aa` (so a stroke stays legible up close, at a grazing view too), a stroke covers
 *  more of its cell: its mean grows by PAINTED_MEAN × 12.5 aa / (1 + k aa²) (0.08 + aa across instead of 0.08, less
 *  where the widened stroke runs out of its cell), which groundColor takes off the grass, so its mean holds. k is
 *  fitted at aa 0.8 (within 2 % of paintedMean from 0.025 to 1.2, look-clean.test.ts). */
export const STROKE_WIDEN_K = (() => {
  const a = 0.8;
  const grow = paintedMean(a) / paintedMean(0) - 1;
  return Math.round(((12.5 * a) / grow - 1) / (a * a) * 1e3) / 1e3;
})();

/** The blending noise's gain (`blendNoise`): the game's spread over our two octaves' own (0.7 and 0.3 of value noise at
 *  3 and 6 cells a tile, whose spread is 0.163), so ours spreads as the game's `BlendingNoise` does (palette.ts BLEND). */
const BLEND_NOISE_GAIN = Math.round((BLEND.noiseSpread / 0.163) * 1e3) / 1e3;
/** Dry ground's own broad shade (`groundColor`): a value noise a few tiles across scaling its lightness by up to this
 *  much either way, so its patches vary over 2 to 8 tiles as the game's `Desert` texture × its detail texture do (the
 *  luma's spread over blocks of ¼, 1, 4 and 8 tiles: 9.4, 7.7, 5.3 and 3.4 % of its mean; tools/ground-variation.ts). */
const DRY_BROAD = 0.29;
/** Grass's broad shade: its lightness by this much either way over a dozen tiles, its mean held (the game's `Grass`
 *  texture × its detail texture vary over 1, 4 and 8 tiles by 9.1, 5.7 and 3.6 % of their mean; ours by 10.3, 8.0 and
 *  6.8 % until 2026-11-08, when this was 0.27, and dark patches of it read as the grass's own colour on the start shots). */
const GRASS_BROAD = 0.15;

/** The pattern texture: its size, and the cells of each pattern across it (each tiles). */
const PATTERN_SIZE = 1024;
const NOISE_CELLS = 64;
const CRACK_CELLS = 16;
const COBBLE_CELLS: [number, number] = [16, 24];

/** Draw the patterns the shaders read into a tiling texture, once (the same shader always draws
 *  the same texture):
 *  - R: value noise, a hash on a 64-cell lattice that wraps, smoothly interpolated;
 *  - G: cracks, the edges between the plates of a warped Voronoi pattern, 16 plates across;
 *  - B: cobbles, stones in a stretched Voronoi pattern (16 × 24 across) with dark mortar between
 *    them: 0 on the mortar, 0.5–1 on a stone by its shade;
 *  - A: each crack plate's own shade. */
export function drawPatterns(gl: WebGLRenderer): WebGLRenderTarget {
  // anisotropic filtering at the renderer's maximum (at most 16×, at least 8× where it has that): ground and
  // rock seen at a slant stay detailed instead of settling on a blurrier mip level
  const rt = new WebGLRenderTarget(PATTERN_SIZE, PATTERN_SIZE, { wrapS: RepeatWrapping, wrapT: RepeatWrapping, magFilter: LinearFilter, minFilter: LinearMipmapLinearFilter, generateMipmaps: true, depthBuffer: false, anisotropy: Math.min(16, gl.capabilities.getMaxAnisotropy()) });
  const mat = new ShaderMaterial({
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position.xy, 0.0, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec2 vUv;
      float hash12(vec2 p, vec2 period) {
        p = mod(p, period);
        vec3 p3 = fract(vec3(p.xyx) * 0.1031);
        p3 += dot(p3, p3.yzx + 33.33);
        return fract((p3.x + p3.y) * p3.z);
      }
      vec2 hash22(vec2 p, vec2 period) {
        p = mod(p, period);
        vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.103, 0.0973));
        p3 += dot(p3, p3.yzx + 33.33);
        return fract((p3.xx + p3.yz) * p3.zy);
      }
      float valueNoise(vec2 c, vec2 period) {
        vec2 i = floor(c);
        vec2 u = fract(c);
        u = u * u * (3.0 - 2.0 * u);
        return mix(mix(hash12(i, period), hash12(i + vec2(1.0, 0.0), period), u.x), mix(hash12(i + vec2(0.0, 1.0), period), hash12(i + vec2(1.0, 1.0), period), u.x), u.y);
      }
      /** Distances to the nearest and second-nearest feature points (in a stretched metric), and
       *  the nearest cell's own random value. */
      vec3 voronoi(vec2 x, vec2 period, vec2 stretch, float jitter) {
        vec2 n = floor(x);
        vec2 fr = fract(x);
        float f1 = 9.0;
        float f2 = 9.0;
        float id = 0.0;
        for (int j = -1; j <= 1; j++)
          for (int i = -1; i <= 1; i++) {
            vec2 g = vec2(float(i), float(j));
            vec2 o = 0.5 + (hash22(n + g, period) - 0.5) * jitter;
            vec2 r = (g + o - fr) * stretch;
            float d = dot(r, r);
            if (d < f1) {
              f2 = f1;
              f1 = d;
              id = hash12(n + g + 17.0, period);
            } else if (d < f2) f2 = d;
          }
        return vec3(sqrt(f1), sqrt(f2), id);
      }
      void main() {
        // value noise, half a texel in so its lattice lies on texel centres
        vec2 np = vec2(${f(NOISE_CELLS)});
        float noise = valueNoise(vUv * np - 0.5 * np / ${f(PATTERN_SIZE)}, np);
        // cracks: a warped Voronoi's edges, thinner and fainter here and there
        vec2 cp = vec2(${f(CRACK_CELLS)});
        vec2 c = vUv * cp;
        vec2 warp = vec2(valueNoise(c * 0.5, cp * 0.5), valueNoise(c * 0.5 + 19.0, cp * 0.5)) - 0.5;
        vec3 v = voronoi(c + warp * 0.7, cp, vec2(1.0), 0.9);
        float width = 0.04 + 0.05 * valueNoise(c * 2.0 + 7.0, cp * 2.0);
        float crack = 1.0 - smoothstep(width * 0.4, width, v.y - v.x);
        // cobbles: wider than tall, mortar between them
        vec2 kp = vec2(${f(COBBLE_CELLS[0])}, ${f(COBBLE_CELLS[1])});
        vec2 stoneP = vUv * kp;
        stoneP += vec2(valueNoise(stoneP * 0.25, kp * 0.25), valueNoise(stoneP * 0.5 + 31.0, kp * 0.5)) * 0.65;
        vec2 stoneCell = floor(stoneP), stoneFr = fract(stoneP);
        float first = 9.0, second = 9.0, stoneId = 0.0, face = 0.0;
        for (int sy = -1; sy <= 1; sy++) for (int sx = -1; sx <= 1; sx++) {
          vec2 off = vec2(float(sx), float(sy)), id = stoneCell + off;
          float seed = hash12(id + 11.0, kp);
          vec2 delta = (off + 0.5 + (hash22(id, kp) - 0.5) * 0.96 - stoneFr) * vec2(1.0, 1.28);
          float distance = length(delta) + (seed < 0.16 ? 3.0 : 0.0);
          if (distance < first) {
            second = first; first = distance; stoneId = seed;
            face = dot(delta, normalize(hash22(id + 47.0, kp) - 0.5)) * 0.42;
          } else second = min(second, distance);
        }
        vec3 k = vec3(first, second, stoneId);
        float mortar = smoothstep(0.012, 0.19, k.y - k.x);
        float stone = mortar * clamp(0.70 + 0.25 * k.z + face - k.x * 0.07, 0.38, 1.0);
        gl_FragColor = vec4(noise, crack, clamp(stone, 0.0, 1.0), v.z);
      }
    `,
    depthTest: false,
    depthWrite: false,
  });
  const quad = new Mesh(new PlaneGeometry(2, 2), mat);
  const scene = new Scene();
  scene.add(quad);
  const before = gl.getRenderTarget();
  gl.setRenderTarget(rt);
  gl.render(scene, new OrthographicCamera(-1, 1, 1, -1, 0, 1));
  gl.setRenderTarget(before);
  quad.geometry.dispose();
  mat.dispose();
  return rt;
}

export function overlayTexture(W: number, H: number): DataTexture {
  const t = new DataTexture(new Uint8Array(W * H * 4), W, H, RGBAFormat, UnsignedByteType);
  t.magFilter = NearestFilter;
  t.minFilter = NearestFilter;
  t.needsUpdate = true;
  return t;
}

/** Where the overlay is hatched (alpha 255: dam sites), for the shaders, RGBA bytes (W × H): R bit
 *  1 the tile is hatched, bits 2, 4, 8, 16 its east, west, north and south neighbour is; G bits
 *  1, 2, 4, 8 its north-east, north-west, south-east and south-west neighbour is (for the rim
 *  round the corners). */
export function hatchMarks(W: number, H: number, overlay: Uint8Array, into?: Uint8Array): Uint8Array {
  const out = into ?? new Uint8Array(W * H * 4);
  out.fill(0);
  let any = false;
  for (let i = 3; i < overlay.length && !any; i += 4) any = overlay[i] === 255;
  if (!any) return out;
  const at = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && overlay[(y * W + x) * 4 + 3] === 255;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const o = (y * W + x) * 4;
      out[o] = (at(x, y) ? 1 : 0) | (at(x + 1, y) ? 2 : 0) | (at(x - 1, y) ? 4 : 0) | (at(x, y + 1) ? 8 : 0) | (at(x, y - 1) ? 16 : 0);
      out[o + 1] = (at(x + 1, y + 1) ? 1 : 0) | (at(x - 1, y + 1) ? 2 : 0) | (at(x + 1, y - 1) ? 4 : 0) | (at(x - 1, y - 1) ? 8 : 0);
    }
  return out;
}

/** Where the contamination outline runs (**Markers**), RGBA bytes (W × H): R bits 1, 2, 4, 8 the
 *  tile's east, west, north and south edge, where contaminated ground ends. A tile is contaminated
 *  with any contamination at all (the hover text's and the legend's rule). The outline is drawn on
 *  the side that shows: the contaminated tile's, or the clean tile's where the contaminated one is
 *  under water; never along the map's edge. Read from the terrain's tile data (light.ts
 *  `tileData`: G's low nibble the contamination, A the water over the top), so it follows every
 *  soil and water update. */
export function contaminationEdges(W: number, H: number, tiles: Uint8Array, into?: Uint8Array): Uint8Array {
  const out = into ?? new Uint8Array(W * H * 4);
  out.fill(0);
  contaminationEdgesRect(W, H, tiles, out, 0, 0, W - 1, H - 1);
  return out;
}

/** The outline's tiles x0…x1 × y0…y1 only, into `out` (the same bytes as the whole map's). A tile's outline reads the tile
 *  data of that tile and its four neighbours: after a change to tile data, redo the changed tiles and one tile round them. */
export function contaminationEdgesRect(W: number, H: number, tiles: Uint8Array, out: Uint8Array, x0: number, y0: number, x1: number, y1: number): void {
  const xa = Math.max(0, x0);
  const xb = Math.min(W - 1, x1);
  for (let y = Math.max(0, y0); y <= Math.min(H - 1, y1); y++)
    for (let x = xa; x <= xb; x++) {
      const i = y * W + x;
      const b = (tiles[i * 4 + 1] & 15) > 0;
      const wetHere = tiles[i * 4 + 3] > 0;
      let bits = 0;
      // (a side counts when the neighbour differs in contamination: the dirty tile's side where it is dry, else the dirty neighbour's wet side)
      if (x + 1 < W) {
        const j = i + 1;
        if ((tiles[j * 4 + 1] & 15) > 0 !== b && (b ? !wetHere : tiles[j * 4 + 3] > 0)) bits |= 1;
      }
      if (x > 0) {
        const j = i - 1;
        if ((tiles[j * 4 + 1] & 15) > 0 !== b && (b ? !wetHere : tiles[j * 4 + 3] > 0)) bits |= 2;
      }
      if (y + 1 < H) {
        const j = i + W;
        if ((tiles[j * 4 + 1] & 15) > 0 !== b && (b ? !wetHere : tiles[j * 4 + 3] > 0)) bits |= 4;
      }
      if (y > 0) {
        const j = i - W;
        if ((tiles[j * 4 + 1] & 15) > 0 !== b && (b ? !wetHere : tiles[j * 4 + 3] > 0)) bits |= 8;
      }
      out[i * 4] = bits;
    }
}

let edgeLo = new Int32Array(0);
let edgeHi = new Int32Array(0);

/** The outline redone where tile data changed: round each run of tiles (`TileChanges.edgeRows`: tiles that became or stopped
 *  being wet or contaminated), one tile further and a row either side. Returns the rows redone, for the GPU. The same bytes
 *  as `contaminationEdges` of the whole map. */
export function redoContaminationEdges(W: number, H: number, tiles: Uint8Array, out: Uint8Array, spans: readonly TileSpan[]): TileSpan[] {
  if (!spans.length) return [];
  // (the rows' bounds, kept between calls: a water update calls this many times a second)
  if (edgeLo.length < H) {
    edgeLo = new Int32Array(H);
    edgeHi = new Int32Array(H);
  }
  const lo = edgeLo.fill(W, 0, H);
  const hi = edgeHi.fill(-1, 0, H);
  for (const s of spans)
    for (let y = Math.max(0, s.y - 1); y <= Math.min(H - 1, s.y + 1); y++) {
      lo[y] = Math.min(lo[y], s.x0 - 1);
      hi[y] = Math.max(hi[y], s.x1 + 1);
    }
  const done: TileSpan[] = [];
  for (let y = 0; y < H; y++) {
    if (hi[y] < 0) continue;
    contaminationEdgesRect(W, H, tiles, out, lo[y], y, hi[y], y);
    done.push({ y, x0: Math.max(0, lo[y]), x1: Math.min(W - 1, hi[y]) });
  }
  return done;
}

/** The terrain shader's per-tile data (light.ts `tileData`): nearest, one texel per tile. */
export function tileTexture(W: number, H: number, data: Uint8Array): DataTexture {
  const t = new DataTexture(data, W, H, RGBAFormat, UnsignedByteType);
  t.magFilter = NearestFilter;
  t.minFilter = NearestFilter;
  t.needsUpdate = true;
  return t;
}

/** The shadow map (light.ts `shadowMap`): filtered, SHADOW_RES texels per tile. */
export function lightTexture(W: number, H: number, data: Uint8Array): DataTexture {
  const t = new DataTexture(data, W * SHADOW_RES, H * SHADOW_RES, RGBAFormat, UnsignedByteType);
  t.magFilter = LinearFilter;
  t.minFilter = LinearFilter;
  t.needsUpdate = true;
  return t;
}

/** The High look's additions to a shader (render3d/high, PLAN §20 D242, D250, D284): GLSL put in at
 *  named points of the shaders below. Without them (the Standard and light looks) every point is
 *  empty or holds the Standard code itself, so those shaders are exactly as they were: the Standard
 *  look stays the same to the pixel. Each point is named for what it changes. */
export interface ShaderHooks {
  /** Uniforms and functions, after the shared GLSL. */
  decl?: string;
  /** A sun shadow of its own: `float sunLit(vec2 g, float z)` (the baked one is kept as
   *  `bakedSunLit`, for when the effect is off). */
  sunLit?: string;
  // the terrain
  /** Where grass meets earth (an expression). */
  moist?: string;
  /** After the ground's colour, before contamination is layered over it (c, g). */
  groundVariation?: string;
  /** Before groundColor returns (c: its colour with contamination). */
  groundEnd?: string;
  /** The badwater share of the water over ground point g (a float; the flow texture's blue). High reads its own flow
   *  texture, the same texture: a second sampler of it would take High's terrain past the 16 a fragment shader is sure
   *  to have (WebGL 2's least, ANGLE's on Direct3D 11) on a map with terrain above terrain, and it would not link. */
  behindShare?: string;
  /** The flow texture's RG at a tile corner P (tiles; a vec2), for a still film's outline (shoreFilm.ts): High reads its
   *  own flow texture, the same texture, for the same reason as `behindShare`. */
  shoreFlow?: string;
  /** In a wall, before its level lines (wc, n, along, y, k, cliffTint). */
  wall?: string;
  /** How strong the wall's level lines are (an expression; Standard: `markers`). */
  wallLines?: string;
  /** After the light, before the overlays (c, light, n, h0, d0). */
  lit?: string;
  /** The sun on a face whose air is under a roof (an expression of `cave`, the light volume's sky in
   *  x and sun in y, and `sunHere`, the look's own sun shadow at the point). Standard: a ray marched
   *  through the volume until it meets rock or comes out under the open sky's baked shadow
   *  (`caveSunMarch`), so the sun carries on across a cave's roof line and in as far as it reaches. */
  caveSun?: string;
  /** The sun on the open ground at a cave's roof line (an expression of `mouth`, the point just outside
   *  it, world space; Standard: the baked shadow there). */
  caveSunOpen?: string;
  // the water
  /** Functions after the shared water palette's GLSL (they may use it). */
  waterDecl?: string;
  /** A water surface of its own, before clear water (c, alpha, foam, n, g, depth, cont, shore, V, lit). */
  water?: string;
  // objects
  objectVertexDecl?: string;
  /** The object's normal and its position before placing (expressions of position and normal). */
  objectNormal?: string;
  objectPosition?: string;
  /** Its colour (an expression; Standard: `pcolor`). */
  objectColor?: string;
  /** Before `vec3 p = position;` */
  objectVertex?: string;
  /** The wrapped sun light (an expression; Standard: `dot(n, sunDir) * 0.75 + 0.25`). */
  objectSun?: string;
  /** Its final colour before the finish (an expression; Standard: `vColor * light`). */
  objectFinal?: string;
  /** The sun on an object or a fall under a roof (an expression of `cave`, the light volume's sky in x and sun in y,
   *  and `lit`, the look's own sun shadow there; Standard: the march toward the sun through the volume, `sunMarchAt`). */
  roofedSun?: string;
}

const hook = (h: ShaderHooks | undefined, k: keyof ShaderHooks, standard = ""): string => h?.[k] ?? standard;

/** Shared GLSL: a tile's data, and the light volume's roofed air (caveLight.ts): the terrain's, and the objects'
 *  and the water's on a map with terrain above terrain (`CAVES`). */
const CAVE_AIR = /* glsl */ `vec4 tileAt(vec2 t) {
        t = clamp(t, vec2(0.0), mapSize - 1.0);
        return texture2D(tileTex, (t + 0.5) / mapSize);
      }
      float heightOf(vec4 d) { return floor(d.r * 255.0 + 0.5); }
      uniform highp sampler3D caveTex;
      uniform vec3 caveSize;
      uniform float caveTop;
      /** Whether a cell (a tile and a level) is air under a roof: in the map, below its tile's top, not
       *  rock (caveLight.ts). */
      bool roofedAir(vec3 cell) {
        if (any(lessThan(cell, vec3(0.0))) || any(greaterThanEqual(cell, caveSize))) return false;
        if (cell.z >= heightOf(tileAt(cell.xy))) return false;
        return texelFetch(caveTex, ivec3(cell), 0).r > 0.001;
      }
      /** The sun at a point under a roof (tile coordinates: x, y, level; caveLight.ts \`sunMarch\` mirrors it): a ray
       *  marched toward the sun through the volume (open air and roofed air alike, so it passes under an overhang as the
       *  light does), whichever way the sun stands as it turns with the camera. The volume is read filtered, its air 1
       *  and its rock 0 blended between cells' middles, and the ray keeps the least it meets: a shadow's edge is soft
       *  over about a voxel instead of stepping with them. Its first step is a hashed fraction of the step, so the
       *  steps' banding becomes a fine grain. Once over the map's highest ground (kept as edits raise it) the baked
       *  shadow there decides (the objects' shadows); \`SUN_MARCH_STEPS\` reach that from the lowest level. */
      float sunMarch(vec3 q) {
        vec3 dir = vec3(sunDir.x, -sunDir.z, sunDir.y);
        float clear = min(caveTop, caveSize.z);
        float lit = 1.0;
        q += dir * ${f(SUN_MARCH_STEP)} * fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
        for (int k = 0; k < ${SUN_MARCH_STEPS}; k++) {
          if (q.x < 0.0 || q.y < 0.0 || q.x >= caveSize.x || q.y >= caveSize.y) return lit;
          if (q.z >= clear) return lit * sunLit(q.xy, q.z);
          lit = min(lit, textureLod(caveTex, q / caveSize, 0.0).r);
          if (lit < 0.004) return 0.0;
          q += dir * ${f(SUN_MARCH_STEP)};
        }
        return lit * sunLit(q.xy, q.z);
      }
      /** sunMarch at a point in the air (an object's, the water's): from half a level up, the middle of its cell's air. */
      float sunMarchAt(vec3 world) {
        return sunMarch(vec3(world.x, -world.z, world.y + 0.5));
      }
`;

/** Shared GLSL: the overlay on one run (overlayRuns.ts), on a map with terrain above terrain only. */
const OVERLAY_RUN = /* glsl */ `uniform sampler2D overlayRuns;
      uniform vec4 overlayRest;
      /** The overlay o of tile t at height y, where the overlay names one run of the tile (a selection taken on a
       *  cave's floor, a ledge under an overhang): o on that run's top (or the cut capping it) and walls (face 1 a
       *  top, 0 a wall, -1 an underside) and on the water over it (face 2), overlayRest on the rest of the column. */
      vec4 overlayOnRun(vec4 o, vec2 t, float y, float face) {
        vec4 r = floor(texture2D(overlayRuns, (t + 0.5) / mapSize) * 255.0 + 0.5);
        if (r.x < 0.5) return o;
        bool on = face > 1.5 ? y > r.y - 0.05 && y < r.w + 0.05
          : face > 0.5 ? y > min(r.z + 1.0, r.y) - 0.01 && y < r.y + 0.01
          : face > -0.5 && y > r.z - 0.01 && y < r.y + 0.01;
        return on ? o : overlayRest;
      }
`;

/** Objects and water under a roof (3D view, item 7; only on a map with terrain above terrain, `CAVES`): the air a point
 *  stands in, from the light volume: y the sun (0–1), z 1 where that air is under a roof; elsewhere z is 0. Under a
 *  roof they take the open air's sky (D497: the game's ambient is unoccluded) and the sun only where it reaches (the
 *  volume's, or the look's own shadow of the real meshes). */
const CAVE_POINT = /* glsl */ `
      #ifdef CAVES
      ${CAVE_AIR}
      vec3 caveAirAt(vec3 world) {
        if (caveSize.z < 0.5) return vec3(1.0, 1.0, 0.0);
        vec3 q = vec3(world.x, -world.z, world.y);
        if (!roofedAir(floor(q))) return vec3(1.0, 1.0, 0.0);
        return vec3(textureLod(caveTex, q / caveSize, 0.0).rg, 1.0);
      }
      #endif`;

/** Water below its tile's surface water (a cave's under a wet roof; only on a map with terrain above terrain, `CAVES`):
 *  its own column's flow and contamination from the cave current's volume (caveCurrent.ts), at the level it stands
 *  in, filtered across tiles at that level. `waterOwnFlow` holds it for the fragment (RG the current as the flow
 *  texture packs it, B its smoothed contamination, A 1), A 0 where the flow texture stands (each tile's surface water). */
const CAVE_FLOW = /* glsl */ `
      #ifdef CAVES
      uniform highp sampler3D caveFlowTex;
      uniform vec2 caveFlowLevels;
      vec4 waterOwnFlow = vec4(0.0);
      vec4 ownFlowAt(vec3 world) {
        if (caveFlowLevels.y < 0.5) return vec4(0.0);
        vec3 q = vec3(world.x, -world.z, world.y - caveFlowLevels.x);
        vec3 cell = floor(q);
        if (any(lessThan(cell, vec3(0.0))) || any(greaterThanEqual(cell, vec3(mapSize, caveFlowLevels.y)))) return vec4(0.0);
        if (texelFetch(caveFlowTex, ivec3(cell), 0).a < 0.5) return vec4(0.0);
        return vec4(textureLod(caveFlowTex, vec3(q.xy / mapSize, (cell.z + 0.5) / caveFlowLevels.y), 0.0).rgb, 1.0);
      }
      #endif`;

/** The sun shadow's change across a pixel (`sunPx`), from the world position's: the height's own and, as a shadow's top
 *  falls tan(elevation) a tile along the sun's way, the ground's. Run at the top of a main, outside any branch. */
const SUN_PX_GLSL = /* glsl */ `sunPx = fwidth(vWorld.y) + ${f(Math.tan(LIGHT.sunElevation))} * max(fwidth(vWorld.x), fwidth(vWorld.z));`;

/** Shared GLSL: the scene's uniforms, the patterns, the baked shadow, the light and the finish. */
const common = (h?: ShaderHooks) => /* glsl */ `${GAME_POST_GLSL}
  uniform vec3 sunDir;
  uniform vec3 sunColor;
  uniform vec3 skyColor;
  uniform vec3 hazeColor;
  uniform float fogDensity;
  uniform float fogShift;
  uniform float fogNear;
  uniform float time;
  uniform sampler2D tileTex;
  uniform sampler2D lightTex;
  uniform sampler2D overlay;
  uniform sampler2D marks;
  uniform float hatching;
  uniform float markers;
  uniform sampler2D contamEdges;
  uniform sampler2D soilTex;
  uniform sampler2D siteEdges;
  uniform vec2 mapSize;
  uniform sampler2D patternTex;
  uniform float clearWater;
  uniform vec4 clearAround;
  uniform float slice;
  uniform float levelLines;
  uniform sampler2D sourceTex;
  uniform float sourceLit;
  uniform sampler2D flowTex;

  float bitOf(float v, float b) { return mod(floor(v / b + 0.001), 2.0); }

  /** How much of a tile's top is grass at moisture level m (its soil nibble, the game's levels), as the game's terrain
   *  draws it (SoilMoistureSystem \`UpdateDesertIntensity\`; \`DesertMoistureThreshold\` 5, \`MaxDesertIntensity\` 0.7 in
   *  its blueprint): its desert texture over all of a dry tile (moisture 0), over (1 − m/5) × 0.7 of one at moisture 0
   *  to 5, none above, so green thins toward the edge of the water's reach, and through a drought. (Before the hooks'
   *  declarations: High's slope reads it too.) */
  float grassOf(float m) {
    return m < 0.5 ? 0.0 : 1.0 - ${f(DESERT.max)} * max(0.0, 1.0 - m / ${f(DESERT.threshold)});
  }

  /** Value noise, one cell per unit of p. */
  float vnoise(vec2 p) {
    return texture2D(patternTex, p * ${f(1 / NOISE_CELLS)}).r;
  }
  /** Cracks (g: 1 on a crack) and the plate's shade (a), one plate per unit of p. */
  vec2 cracks(vec2 p) {
    return texture2D(patternTex, p * ${f(1 / CRACK_CELLS)}).ga;
  }
  /** Cobbles: 0 on the mortar, 0.5–1 on a stone; p in stones along and courses up. */
  float cobble(vec2 p) {
    return texture2D(patternTex, p / vec2(${f(COBBLE_CELLS[0])}, ${f(COBBLE_CELLS[1])})).b;
  }
  /** How far a point's height above its shadow's top changes across this pixel (levels): set at the top of each main
   *  that shades the sun (\`SUN_PX_GLSL\`), 0 where none does. */
  float sunPx = 0.0;
  /** How lit a point at height z above tile position g is (the baked sun shadow, soft over a constant width of
   *  ground, light.ts \`litFraction\`; never narrower than a pixel, so a far view's edge does not step). */
  float ${h?.sunLit ? "bakedSunLit" : "sunLit"}(vec2 g, float z) {
    #if LITE
      return 1.0;
    #endif
    vec4 s = texture2D(lightTex, g / mapSize);
    float hi = s.r * ${f(255 / SHADOW_SCALE)} - ${f(SHADOW_OFFSET)};
    float lo = s.g * ${f(255 / SHADOW_SCALE)} - ${f(SHADOW_OFFSET)};
    return clamp((z - 0.5 * (hi + lo)) / max(${f(EDGE_BAND)}, sunPx) + 0.5, 0.0, 1.0);
  }${hook(h, "decl")}${hook(h, "sunLit")}
  /** A hatched overlay (dam sites) at tile position g: inside, light stripes in the tile's
   *  overlay colour and dark stripes (solid light where a stripe would be under two pixels); just
   *  outside, a dark rim at least a pixel wide. Returns the colour and its weight. */
  vec4 hatchAt(vec2 g, vec3 col) {
    // (the light look draws a hatched tile plain, in its colour: the overlay's own mix; the clean
    // view, with Markers off, none at all)
    if (LITE == 1 || hatching < 0.5 || markers < 0.5) return vec4(0.0);
    vec2 tile = floor(g);
    vec4 m = texture2D(marks, (tile + 0.5) / mapSize);
    float r = floor(m.r * 255.0 + 0.5);
    float d = floor(m.g * 255.0 + 0.5);
    if (r < 0.5 && d < 0.5) return vec4(0.0);
    vec2 fr = g - tile;
    float px = max(fwidth(g.x), fwidth(g.y));
    if (bitOf(r, 1.0) > 0.5) {
      // diagonal stripes, a light one through each tile's middle and dark ones across its corners
      float s = abs(fract(g.x + g.y) - 0.5) * 2.0;
      float stripe = (1.0 - smoothstep(0.5 - px * 3.0, 0.5 + px * 3.0, s)) * (1.0 - smoothstep(0.08, 0.14, px));
      return vec4(mix(col, ${glColor(HATCH.dark)}, stripe), 1.0);
    }
    float e = 9.0;
    if (bitOf(r, 2.0) > 0.5) e = min(e, 1.0 - fr.x);
    if (bitOf(r, 4.0) > 0.5) e = min(e, fr.x);
    if (bitOf(r, 8.0) > 0.5) e = min(e, 1.0 - fr.y);
    if (bitOf(r, 16.0) > 0.5) e = min(e, fr.y);
    if (bitOf(d, 1.0) > 0.5) e = min(e, length(vec2(1.0 - fr.x, 1.0 - fr.y)));
    if (bitOf(d, 2.0) > 0.5) e = min(e, length(vec2(fr.x, 1.0 - fr.y)));
    if (bitOf(d, 4.0) > 0.5) e = min(e, length(vec2(1.0 - fr.x, fr.y)));
    if (bitOf(d, 8.0) > 0.5) e = min(e, length(fr));
    float w = max(0.12, 1.1 * px);
    return vec4(${glColor(HATCH.dark)}, 1.0 - smoothstep(w, w + px, e));
  }
  /** A footprint's edge (the shelf's ghost, the start: an overlay painted with an odd alpha below 255, tools.ts
   *  \`paintOverlay\`'s \`edge\`): at tile position g, with \`px\` the size of a pixel in tiles, how much of a line lies here along the sides where the tile beside it is not of the same footprint
   *  (and round an inward corner),
   *  about a sixteenth of a tile wide and never under a pixel and a half. Drawn in a light tint of the fill
   *  (\`overlayEdgeColor\`): a lighter edge on a darker fill of one hue, calm on grass, rock, sand and water. */
  bool sameOverlay(vec2 t, vec4 o) {
    vec4 n = texture2D(overlay, (t + 0.5) / mapSize);
    return all(lessThan(abs(n - o), vec4(0.5 / 255.0)));
  }
  float overlayEdge(vec2 g, vec4 o, float px) {
    float a = floor(o.a * 255.0 + 0.5);
    if (a > 254.5 || mod(a, 2.0) < 0.5) return 0.0;
    vec2 tile = floor(g);
    vec2 fr = g - tile;
    float e = 9.0;
    bool east = sameOverlay(tile + vec2(1.0, 0.0), o);
    bool west = sameOverlay(tile - vec2(1.0, 0.0), o);
    bool north = sameOverlay(tile + vec2(0.0, 1.0), o);
    bool south = sameOverlay(tile - vec2(0.0, 1.0), o);
    if (!east) e = min(e, 1.0 - fr.x);
    if (!west) e = min(e, fr.x);
    if (!north) e = min(e, 1.0 - fr.y);
    if (!south) e = min(e, fr.y);
    // an inward corner (both sides in the footprint, the tile between them not): the line turns round it
    if (east && north && !sameOverlay(tile + vec2(1.0, 1.0), o)) e = min(e, max(1.0 - fr.x, 1.0 - fr.y));
    if (west && north && !sameOverlay(tile + vec2(-1.0, 1.0), o)) e = min(e, max(fr.x, 1.0 - fr.y));
    if (east && south && !sameOverlay(tile + vec2(1.0, -1.0), o)) e = min(e, max(1.0 - fr.x, fr.y));
    if (west && south && !sameOverlay(tile - vec2(1.0, 1.0), o)) e = min(e, max(fr.x, fr.y));
    float w = max(0.06, 1.5 * px);
    return 1.0 - smoothstep(w, w + px, e);
  }
  vec3 overlayEdgeColor(vec4 o) {
    return clamp(o.rgb * 1.4 + 0.3, 0.0, 1.0);
  }
  /** The game's finish (palette.ts GAME_FINISH): its exponential fog by the view depth (URP's FOG_EXP), then its post
   *  chain; with the light a surface gives off itself (an eruption's lava, as URP's emission) added to its colour
   *  first, so the fog takes it with distance as it takes everything (URP's MixFog after the emission). Editing aids go
   *  on after it all (D497: their own channel). */
  vec3 finishLit(vec3 c, vec3 emission, vec3 world) {
    float depth = max(-(viewMatrix * vec4(world, 1.0)).z - fogNear - fogShift, 0.0);
    return gamePost(mix(hazeColor, c + emission, exp2(-fogDensity * depth)));
  }
  vec3 finish(vec3 c, vec3 world) {
    return finishLit(c, vec3(0.0), world);
  }
`;

/** The game's post chain (palette.ts GAME_FINISH), as URP's uber pass grades in LDR under Gamma colour space: the
 *  display colour to linear, its exposure, Neutral tonemapping (URP's NeutralTonemap), then its LUT's contrast round
 *  ACEScc's mid grey in LogC (ALEXA LogC, URP's LinearToLogC/LogCToLinear) and saturation round the luminance, back to
 *  display values. */
export const GAME_POST_GLSL = /* glsl */ `
  /** 1 while the frame before the grade is drawn for the bloom (bloom.ts): a look material writes gpSource, the
   *  colour gamePost was last given (the look, fogged, before the post chain and any editing aid), in place of its
   *  graded colour. */
  uniform float bloomSource;
  vec3 gpSource;
  vec3 gpCurve(vec3 x) { return (x * (0.2 * x + 0.24 * 0.29) + 0.272 * 0.02) / (x * (0.2 * x + 0.29) + 0.272 * 0.3) - 0.02 / 0.3; }
  vec3 gpLogC(vec3 x) { return mix(5.301883 * x + 0.092819, 0.244161 * log2(max(5.555556 * x + 0.047996, 1e-6)) * 0.30103 + 0.386036, step(vec3(0.011361), x)); }
  vec3 gpFromLogC(vec3 x) { return mix((x - 0.092819) / 5.301883, (pow(vec3(10.0), (x - 0.386036) / 0.244161) - 0.047996) / 5.555556, step(vec3(5.301883 * 0.011361 + 0.092819), x)); }
  vec3 gamePost(vec3 display) {
    vec3 d = max(display, vec3(0.0));
    gpSource = d;
    vec3 c = mix(d / 12.92, pow((d + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), d)) * ${f(Math.round(2 ** GAME_FINISH.postExposure * 1e6) / 1e6)};
    float white = 1.0 / gpCurve(vec3(5.3)).x;
    c = clamp(gpCurve(c * white) * white, 0.0, 1.0);
    c = clamp(gpFromLogC((gpLogC(c) - 0.4135884) * ${f(GAME_FINISH.contrast)} + 0.4135884), 0.0, 1.0);
    float l = dot(c, vec3(0.2126729, 0.7151522, 0.072175));
    c = clamp(vec3(l) + ${f(GAME_FINISH.saturation)} * (c - vec3(l)), 0.0, 1.0);
    return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c));
  }
  /** The post chain undone (palette.ts gamePostInverseRgb): the display colour a graded one came from, each step solved
   *  exactly (the Neutral curve by its positive root). */
  vec3 gamePostInverse(vec3 graded) {
    vec3 g = clamp(graded, 0.0, 1.0);
    vec3 c = mix(g / 12.92, pow((g + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), g));
    float l = dot(c, vec3(0.2126729, 0.7151522, 0.072175));
    c = max(vec3(l) + (c - vec3(l)) / ${f(GAME_FINISH.saturation)}, 0.0);
    c = max(gpFromLogC((gpLogC(c) - 0.4135884) / ${f(GAME_FINISH.contrast)} + 0.4135884), 0.0);
    float white = 1.0 / gpCurve(vec3(5.3)).x;
    vec3 t = min(c / white, 0.93) + 0.02 / 0.3;
    vec3 a = 0.2 * t - 0.2;
    vec3 b = 0.29 * t - 0.24 * 0.29;
    vec3 k = 0.272 * 0.3 * t - 0.272 * 0.02;
    c = max((b + sqrt(max(b * b - 4.0 * a * k, 0.0))) / (-2.0 * a), 0.0) / white / ${f(Math.round(2 ** GAME_FINISH.postExposure * 1e6) / 1e6)};
    return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c));
  }
`;

export interface TerrainUniforms {
  heightRange: { value: Vector2 };
  /** x, y of the hovered tile; z 1 when one is hovered; w the level of the run whose top lights up (-1: every top of the tile). */
  hover: { value: Vector4 };
  /** 0: ground coloured by soil (moisture), 1: by height. */
  groundMode: { value: number };
  /** An eruption's heat on the ground (D206; forces.ts): its mask (RGBA a tile: vents, flows'
   *  cracks, dust, when the heat arrives), its age in seconds (below 0: none) and its cooling. */
  eruptionMask: { value: DataTexture };
  /** The ground's heights when that heat came (R a tile; G 255 where known): what rose above them since is
   *  its fresh rock (#367). */
  eruptionBase: { value: DataTexture };
  eruptionAge: { value: number };
  coolingAge: { value: number };
}

/** `lite`: a lighter look for browsers that render in software: no patterns, shadows or soil
 *  blending. */
export function terrainMaterial(scene: SceneUniforms, lo: number, hi: number, lite = false, h?: ShaderHooks): ShaderMaterial {
  const own: TerrainUniforms = {
    heightRange: { value: new Vector2(lo, hi) },
    hover: { value: new Vector4(0, 0, 0, -1) },
    groundMode: { value: 0 },
    eruptionMask: { value: overlayTexture(1, 1) },
    eruptionBase: { value: overlayTexture(1, 1) },
    eruptionAge: { value: -1 },
    coolingAge: { value: 0 },
  };
  return new ShaderMaterial({
    // CUTAWAY (the renderer's `setCutaway`): 1 on a map with terrain above terrain, where the layer cut opens
    // what it folds over air (cutaway.ts); 0 elsewhere, the same program as before it
    defines: { LITE: lite ? 1 : 0, CUTAWAY: 0 },
    uniforms: { ...scene, ...own } as unknown as Record<string, { value: unknown }>,
    vertexShader: /* glsl */ `
      uniform float slice;
      // (centroid: on a pixel a face only partly covers, the multisampled edge of the map's outer faces
      // seen edge-on, the point is taken inside the face, never projected far past it, where the
      // patterns drawn from it, the soil cap's roots among them, come out different from draw to draw)
      centroid varying vec3 vWorld;
      varying vec3 vNormal;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        // the game's layers: the ground above the slice is cut away (its walls fold down, its tops
        // lie on the cut)
        w.y = min(w.y, slice);
        vWorld = w.xyz;
        vNormal = normal;
        gl_Position = projectionMatrix * viewMatrix * w;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec2 heightRange;
      uniform vec4 hover;
      uniform float groundMode;
      uniform sampler2D eruptionMask;
      uniform sampler2D eruptionBase;
      uniform float eruptionAge;
      uniform float coolingAge;
      /** y: 1 while the frame's water overlays what shows behind it itself, from its copy of the screen (refraction.ts). */
      uniform vec4 refractView;
      centroid varying vec3 vWorld;
      varying vec3 vNormal;
      ${common(h)}
      #if CUTAWAY
      ${OVERLAY_RUN}
      #endif
      ${CAVE_AIR}      /** The game's light on a face (palette.ts GAME_LIGHT), in display values as the game works in Gamma colour
       *  space: Unity's ambient probe by its normal (palette.ts GAME_AMBIENT_SH: irradiance SH, turned back to display values), and the sun
       *  by its shadow (\`sun\`, 0–1), times the diffuse share. A factor on the face's display colour. */
      vec3 toDisplay(vec3 c) { return mix(c * 12.92, 1.055 * pow(max(c, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c)); }
      /** The sun the last face lit took (gameLight's \`sun\`), for its specular. */
      float gameSunNow = 0.0;
      vec3 gameLight(vec3 n, float sun) {
        gameSunNow = sun;
        // (the terrain's faces face up, down or sideways: there the SH's display values are constants; any other normal
        // works them out)
        vec3 ambient = n.y > 0.999 ? ${glColor3(gameAmbient(1))} : n.y < -0.999 ? ${glColor3(gameAmbient(-1))} : abs(n.y) < 0.001 ? ${glColor3(gameAmbient(0))}
          : toDisplay(max(${glColor3(GAME_AMBIENT_SH.c0)} + ${glColor3(GAME_AMBIENT_SH.c1)} * n.y + ${glColor3(GAME_AMBIENT_SH.c2)} * (3.0 * n.y * n.y - 1.0), vec3(0.0)));
        return ${f(GAME_LIGHT.diffuse)} * (ambient + ${glColor(GAME_LIGHT.sun)} * max(dot(n, sunDir), 0.0) * sun);
      }
      /** What URP's lit shader adds to the diffuse light (the terrain's materials: _Metallic 0.05, smoothness 0 on the
       *  ground and 0.05 on its cliffs): the environment's reflection (the game's probe at its roughest mip,
       *  palette.ts GAME_ENV, by the reflected direction, × m_ReflectionIntensity, × 1 / (roughness² + 1) × the
       *  Fresnel blend toward the grazing term) and the sun's GGX highlight by its shadow. */
      vec3 gameSpecular(vec3 n, vec3 albedo, float smoothness) {
        vec3 v = normalize(cameraPosition - vWorld);
        float pr = 1.0 - smoothness;
        float r = max(pr * pr, 0.0078125);
        float r2 = max(r * r, 6.103515625e-5);
        vec3 f0 = mix(vec3(0.04), albedo, 0.05);
        float grazing = clamp(smoothness + ${f(Math.round((1 - GAME_LIGHT.diffuse) * 1e6) / 1e6)}, 0.0, 1.0);
        float fresnel = pow(1.0 - clamp(dot(n, v), 0.0, 1.0), 4.0);
        vec3 rd = reflect(-v, n);
        vec3 env = rd.y >= 0.0 ? mix(${glColor(GAME_ENV.side)}, ${glColor(GAME_ENV.up)}, rd.y) : mix(${glColor(GAME_ENV.side)}, ${glColor(GAME_ENV.down)}, -rd.y);
        vec3 c = env * ${f(GAME_FINISH.reflectionIntensity)} / (r2 + 1.0) * mix(f0, vec3(grazing), fresnel);
        vec3 hv = normalize(sunDir + v);
        float nh = clamp(dot(n, hv), 0.0, 1.0);
        float lh = clamp(dot(sunDir, hv), 0.0, 1.0);
        float d = nh * nh * (r2 - 1.0) + 1.00001;
        float spec = r2 / (d * d * max(0.1, lh * lh) * (r * 4.0 + 2.0));
        return c + f0 * spec * ${glColor(GAME_LIGHT.sun)} * max(dot(n, sunDir), 0.0) * gameSunNow;
      }
      /** The game's altitude ramps (palette.ts ALTITUDE_RAMP, as multipliers: twice the texel), read as its texture is,
       *  32 texels over the ground's height up to the ceiling, filtered between them. */
      const vec3 ALT_GRASS[32] = vec3[32](vec3(0.8784, 0.9804, 1.0431), vec3(0.8941, 0.9882, 1.051), vec3(0.8784, 1.0039, 1.0902), vec3(0.9255, 0.9882, 1.0431), vec3(0.9882, 0.9804, 0.9804), vec3(0.9882, 1.0118, 0.9961), vec3(0.9804, 1.0275, 1.0431), vec3(0.9804, 1.0353, 1.0667), vec3(0.949, 1.0588, 1.0667), vec3(0.9725, 1.0824, 1.051), vec3(0.9882, 1.0824, 1.0667), vec3(1.0118, 1.098, 1.1059), vec3(1.0745, 1.0824, 1.051), vec3(1.1294, 1.0902, 1.0118), vec3(1.1373, 1.1137, 1.0275), vec3(1.1216, 1.1137, 1.0588), vec3(1.1059, 1.1137, 1.098), vec3(1.1137, 1.1137, 1.0824), vec3(1.1765, 1.1216, 1.0039), vec3(1.2078, 1.1294, 0.9804), vec3(1.1686, 1.1373, 1.051), vec3(1.1451, 1.1216, 1.1373), vec3(1.1686, 1.1216, 1.1137), vec3(1.2157, 1.1451, 1.0588), vec3(1.0431, 0.9961, 1.0039), vec3(1.051, 1.0039, 1.0039), vec3(1.0431, 1.0118, 1.0118), vec3(0.9961, 0.9725, 0.9647), vec3(1.0431, 1.0118, 1.0196), vec3(0.9412, 0.9255, 0.949), vec3(0.9333, 0.949, 0.9725), vec3(0.9176, 0.9882, 1.0196));
      const vec3 ALT_DESERT[32] = vec3[32](vec3(0.9647, 1.098, 1.1765), vec3(0.9804, 1.1059, 1.1686), vec3(0.9882, 1.1059, 1.1765), vec3(0.9804, 1.0902, 1.2235), vec3(1.0902, 1.0431, 1.0902), vec3(1.1686, 1.051, 1.0039), vec3(1.1294, 1.0902, 1.0745), vec3(1.0902, 1.0902, 1.1686), vec3(1.051, 1.0745, 1.2235), vec3(1.0667, 1.0824, 1.1922), vec3(1.1765, 1.0824, 1.0275), vec3(1.1922, 1.0902, 0.9725), vec3(1.1137, 1.0902, 1.0824), vec3(1.0353, 1.0588, 1.2392), vec3(1.0588, 1.0745, 1.2), vec3(1.1294, 1.098, 1.0667), vec3(1.1608, 1.0824, 1.0667), vec3(1.1529, 1.0824, 1.0588), vec3(1.1451, 1.098, 1.0667), vec3(1.1451, 1.1059, 1.0667), vec3(1.1451, 1.098, 1.0667), vec3(1.1294, 1.0824, 1.0824), vec3(1.1059, 1.1059, 1.098), vec3(1.0667, 1.1529, 1.2), vec3(1.051, 1.1922, 1.2471), vec3(1.0824, 1.1843, 1.2157), vec3(1.0588, 1.1765, 1.2784), vec3(1.1373, 1.1373, 1.1922), vec3(1.2471, 1.1294, 1.0745), vec3(1.2314, 1.1686, 1.1294), vec3(1.1843, 1.1765, 1.2157), vec3(1.1608, 1.1686, 1.2706));
      vec3 altitudeOf(float y, float grass) {
        // (mirrored past the ceiling, as the texture wraps)
        float h = abs(y / ${f(ALTITUDE_RAMP.ceiling)});
        h = 1.0 - abs(1.0 - mod(h, 2.0));
        float u = h * 32.0 - 0.5;
        int a = int(clamp(floor(u), 0.0, 31.0));
        int b = int(clamp(floor(u) + 1.0, 0.0, 31.0));
        float t = clamp(u - floor(u), 0.0, 1.0);
        return mix(mix(ALT_DESERT[a], ALT_DESERT[b], t), mix(ALT_GRASS[a], ALT_GRASS[b], t), grass);
      }
      /** The light of the air a face looks into, half a cell along its normal (caveLight.ts, whose
       *  caveSample does the same): x the sky, y the sun (0–1), z 1 where that air is under a roof. In
       *  open air, in rock (the slice's cut), outside the map and on a map without roofs z is 0, and
       *  the baked light stands. */
      vec3 caveAt(vec3 world, vec3 n) {
        if (caveSize.z < 0.5) return vec3(1.0, 1.0, 0.0);
        vec3 q = vec3(world.x, -world.z, world.y) + vec3(n.x, -n.z, n.y) * 0.5;
        if (!roofedAir(floor(q))) return vec3(1.0, 1.0, 0.0);
        return vec3(textureLod(caveTex, q / caveSize, 0.0).rg, 1.0);
      }
      /** The sun on a face under a roof (sunMarch from a hair off the face). */
      float caveSunMarch(vec3 world, vec3 n) {
        // (from the middle of the air cell the face looks into: the filtered volume reads a face itself as half rock)
        return sunMarch(vec3(world.x, -world.z, world.y) + vec3(n.x, -n.z, n.y) * 0.5);
      }
      /** The roof line a face under a roof takes its sun from: the open side nearest the face, from its cell (the
       *  volume holds no light that rises toward an opening since D497, so only a cell beside open air finds one).
       *  xyz the point just outside that line on the open ground (world space; along the line, the
       *  face's own place as far as that cell reaches), w 1 when found. */
      vec4 caveMouth(vec3 world, vec3 n) {
        vec3 q = vec3(world.x, -world.z, world.y) + vec3(n.x, -n.z, n.y) * 0.5;
        vec3 c = floor(q);
        for (int k = 0; k < 10; k++) {
          float here = texelFetch(caveTex, ivec3(c), 0).r;
          float best = here;
          vec2 to = vec2(0.0);
          // (of the open sides, the one nearest the face's point)
          vec2 p = clamp(q.xy, c.xy, c.xy + 1.0);
          float near = 9.0;
          vec2 side = vec2(0.0);
          float sideTop = 0.0;
          for (int d = 0; d < 4; d++) {
            vec2 o = d == 0 ? vec2(1.0, 0.0) : d == 1 ? vec2(-1.0, 0.0) : d == 2 ? vec2(0.0, 1.0) : vec2(0.0, -1.0);
            vec3 nc = c + vec3(o, 0.0);
            if (nc.x < 0.0 || nc.y < 0.0 || nc.x >= caveSize.x || nc.y >= caveSize.y) continue;
            float top = heightOf(tileAt(nc.xy));
            if (nc.z >= top) {
              float dist = o.x > 0.5 ? c.x + 1.0 - p.x : o.x < -0.5 ? p.x - c.x : o.y > 0.5 ? c.y + 1.0 - p.y : p.y - c.y;
              if (dist < near) {
                near = dist;
                side = o;
                sideTop = top;
              }
              continue;
            }
            float r = texelFetch(caveTex, ivec3(nc), 0).r;
            if (r > best) {
              best = r;
              to = o;
            }
          }
          if (near < 9.0) {
            if (side.x != 0.0) p.x = c.x + 0.5 + side.x * 0.52;
            else p.y = c.y + 0.5 + side.y * 0.52;
            return vec4(p.x, max(sideTop, c.z), -p.y, 1.0);
          }
          if (best <= here) break;
          c += vec3(to, 0.0);
        }
        return vec4(world, 0.0);
      }
      /** The light on a face in air under a roof, as the game lights it (D497): the same light as open ground's
       *  (gameLight: the Trilight probe by the face's normal, unoccluded by the roof), and the sun only where it reaches,
       *  carried on from the open ground at the roof line the air opens by (caveMouth): the sun there fades to the cave's
       *  own over the first 0.6 of a tile and never exceeds it inside, so the light never steps at the line. */
      vec3 caveLightOf(vec3 n, vec3 cave, float sunHere) {
        float ndl = max(dot(n, sunDir), 0.0);
        vec4 mouth = caveMouth(vWorld, n);
        float sun = 0.0;
        if (ndl > 0.0) {
          float inside = ${hook(h, "caveSun", "caveSunMarch(vWorld, n)")};
          sun = inside;
          if (mouth.w > 0.5) {
            float open = ${hook(h, "caveSunOpen", "sunLit(vec2(mouth.x, -mouth.z), mouth.y)")};
            float d = length(vWorld.xz - mouth.xz);
            sun = mix(open, min(inside, open), smoothstep(0.0, 0.6, d));
          }
        }
        // (as the game lights it: the ambient by the normal, unoccluded by the roof, and the sun only where it reaches)
        return gameLight(n, sun);
      }
      /** How much of tile t's ground at y is an eruption's fresh rock (#367): what rose above the ground
       *  its heat came to, until the heat fades with the crust (0–1). */
      float freshRock(vec2 t, float y) {
        if (eruptionAge < 0.0) return 0.0;
        vec4 b = texture2D(eruptionBase, (clamp(t, vec2(0.0), mapSize - 1.0) + 0.5) / mapSize);
        return step(0.5, b.g) * step(floor(b.r * 255.0 + 0.5) + 0.05, y) * (1.0 - smoothstep(4.4, 6.4, coolingAge));
      }
      /** Fresh volcanic rock's colour at ground point g: ash grey in broad patches of dark basalt and
       *  pale ash, with a fine grain. */
      vec3 ashOf(vec2 g) {
        float b = vnoise(g * 0.41 + 7.0);
        float f = vnoise(g * 5.3 + 3.0);
        return mix(${glColor(JUICE.ashDark)}, ${glColor(JUICE.ashPale)}, smoothstep(0.22, 0.78, b)) * (0.9 + 0.2 * f);
      }
      /** The surface of the water over a tile's top (light.ts waterByte: steps of a sixtieth to three levels deep, whole
       *  levels deeper, its surface then at most 0.05 over the one this gives). */
      float waterSurfaceOf(vec4 d) {
        float wb = floor(d.a * 255.0 + 0.5);
        return heightOf(d) + (wb <= ${f(WATER_BYTE_FINE)} ? (wb - 1.0) / ${f(WATER_BYTE_STEPS)} : wb - ${f(WATER_BYTE_FINE - 3)});
      }
      /** moisture level (0–15), contamination (0–15), under water (0/1), the game's desert intensity (0–1, light.ts
       *  \`desertByte\`, from the moisture unrounded; grassAt). Under water only where the water's
       *  surface is drawn (cutWater.ts bedAtCut): a layer cut takes away the water standing above it, and a top whose water
       *  it took whole (the top at the cut or above it) is then a top like any other, not a bed seen through water; under
       *  a top below the cut the water is drawn up to the cut over it, a bed. */
      vec4 soilOf(vec4 d) {
        float g = floor(d.g * 255.0 + 0.5);
        float m = floor(g / 16.0);
        bool drawn = waterSurfaceOf(d) <= slice + ${f(CUT_SLACK)} || heightOf(d) < slice;
        return vec4(m, g - m * 16.0, d.a > 0.002 && drawn ? 1.0 : 0.0, d.b);
      }
      /** How much of a tile's top is grass, from its soilOf: one less the game's desert intensity, which the tile data
       *  carries from the moisture unrounded (light.ts \`desertByte\`; \`grassOf\` takes the whole level, for the run
       *  tops' soil, which has only that). */
      float grassAt(vec4 s) {
        return 1.0 - s.w;
      }
      ${WATER_GLSL}
      /** The depth of the water drawn over a tile's top (light.ts waterByte; three levels for any deeper): under a layer
       *  cut through it, to the cut (cutWater.ts surfaceAtCut). */
      float waterDepthOf(vec4 d) {
        float wb = floor(d.a * 255.0 + 0.5);
        if (wb < 0.5) return 0.0;
        float depth = min(3.0, (wb - 1.0) / ${f(WATER_BYTE_STEPS)});
        return waterSurfaceOf(d) > slice + ${f(CUT_SLACK)} ? min(depth, max(0.0, slice - heightOf(d))) : depth;
      }
      ${SHORE_FILM_TERRAIN_GLSL}
      /** A tile's water as a still film drawn back from the shore (shoreFilm.ts, Q9 V3): its depth as its water byte reads
       *  it, or −1 where it has no water on its top or is too deep to draw back (0.1 or more). */
      float shoreFilmDepth(vec4 d) {
        float wb = floor(d.a * 255.0 + 0.5);
        return wb > 0.5 && wb < ${f(1 + 0.1 * WATER_BYTE_STEPS - 0.5)} ? (wb - 1.0) / ${f(WATER_BYTE_STEPS)} : -1.0;
      }
      /** The flow's share of the shift at a tile corner P (tiles), as the water's vertex shader reads it there. */
      float shoreFilmFlowAt(vec2 P) {
        vec2 e = (${hook(h, "shoreFlow", "texture2D(flowTex, P / mapSize).rg")} * 255.0 - 128.0) / 127.0;
        return max(0.0, 1.0 - 100.0 * length(e * abs(e)));
      }
      /** How much of a film's wet a dry tile beside it keeps (a neighbour's data d, the flow's share fc at the corner
       *  they share): none where the film is drawn back there, all where its water flows or is deeper. */
      float shoreFilmKeep(vec4 d, float fc) {
        float depth = shoreFilmDepth(d);
        return depth < 0.0 ? 1.0 : 1.0 - clamp(10.0 * clamp(${f(SHORE_FILM.depth[0])} - ${f(SHORE_FILM.depth[1])} * depth, 0.0, 1.0) * fc, 0.0, 1.0);
      }
      /** How much of the point fr of tile \`tile\` (its data d0) lies under its water's drawn top: 0 on the ground a still
       *  film draws back from, the outline the water's mesh and vertex shader give it; \`px\` a pixel (tiles). */
      float shoreFilmOwn(vec2 tile, vec4 d0, vec2 fr, float px) {
        float depth = shoreFilmDepth(d0);
        if (depth < 0.0) return 1.0;
        // (a side is open where its tile has no water on its top; tileAt holds to the map, so the map's edge is not)
        vec4 open = vec4(tileAt(tile + vec2(1.0, 0.0)).a, tileAt(tile + vec2(-1.0, 0.0)).a, tileAt(tile + vec2(0.0, 1.0)).a, tileAt(tile + vec2(0.0, -1.0)).a);
        open = vec4(lessThan(open, vec4(0.002)));
        if (dot(open, vec4(1.0)) < 0.5) return 1.0;
        #if LITE
          // (the light look's water stands still: its flow texture is the still one)
          vec4 flow = vec4(1.0);
        #else
          vec4 flow = vec4(shoreFilmFlowAt(tile), shoreFilmFlowAt(tile + vec2(1.0, 0.0)), shoreFilmFlowAt(tile + vec2(1.0, 1.0)), shoreFilmFlowAt(tile + vec2(0.0, 1.0)));
        #endif
        return shoreFilmInside(depth, open, flow, fr, px);
      }
      #ifdef RUN_SOIL
        // the soil of the run tops below each tile's top (runSoil.ts; only on a map with terrain above terrain)
        uniform highp sampler3D runTex;
        /** A run top's cell at tile t and level z: x its soil byte (the tile data's G), y 1 a run top, 2 one
         *  under water, 0 none (outside the map too). Under a layer cut a run top at the cut or above it has no water
         *  drawn over it (cutWater.ts bedAtCut; its water stands over the cut, but for a film a hair deep). */
        vec2 runAt(vec2 t, float z) {
          if (t.x < 0.0 || t.y < 0.0 || t.x >= mapSize.x || t.y >= mapSize.y || z < 0.0 || z >= ${f(RUN_LEVELS)}) return vec2(0.0);
          vec2 r = floor(texelFetch(runTex, ivec3(vec3(t, z)), 0).rg * 255.0 + 0.5);
          return r.y > 1.5 && z >= slice ? vec2(r.x, 1.0) : r;
        }
        /** The soil of the ground at level z of tile t as soilOf gives it (w its desert intensity: a run top's from its
         *  whole level, all its soil carries), and in \`here\` whether there is ground there to blend toward: a run top
         *  below the tile's top, or the tile's own top. */
        vec4 groundAt(vec2 t, float z, out float here) {
          vec2 r = runAt(t, z);
          here = 1.0;
          if (r.y > 0.5) {
            float m = floor(r.x / 16.0);
            return vec4(m, r.x - m * 16.0, r.y > 1.5 ? 1.0 : 0.0, 1.0 - grassOf(m));
          }
          vec4 d = tileAt(t);
          if (t.x >= 0.0 && t.y >= 0.0 && t.x < mapSize.x && t.y < mapSize.y && heightOf(d) == z) return soilOf(d);
          here = 0.0;
          return vec4(0.0);
        }
        /** The desert intensity at level z of tile t where a run top stands there (a cave's floor beside an open top at
         *  its level: the game's desert map is 3D, so a top's tap across the edge reads that floor), else \`other\`. */
        float runDesert(vec2 t, float z, float other) {
          vec2 r = runAt(t, z);
          return r.y > 0.5 ? 1.0 - grassOf(floor(r.x / 16.0)) : other;
        }
      #endif
      vec3 heightColor(float z) {
        float t = clamp((z - heightRange.x) / max(1.0, heightRange.y - heightRange.x), 0.0, 1.0);
        return mix(${glColor(HEIGHT_RAMP.low)}, ${glColor(HEIGHT_RAMP.high)}, t);
      }
      /** The game's blend of a value across the tiles round tile point g (TerrainURP's ForwardLit program, read from its
       *  DXBC; the desert's share and contamination's map take it alike): four taps \`BLEND_MARGIN\` round the point, each
       *  the value of the tile it falls in (\`v\`: this tile, the neighbour toward the nearest corner across x, across y,
       *  and the diagonal), weighted by how far the tap lies from the nearest tile corner (|dx| × |dz|). */
      float tapBlend(vec2 g, vec4 v) {
        vec2 corner = floor(g + 0.5);
        vec2 tile = floor(g);
        float sum = 0.0;
        float weight = 0.0;
        for (int k = 0; k < 4; k++) {
          vec2 q = g + ${f(BLEND.margin)} * vec2(k == 0 || k == 2 ? -1.0 : 1.0, k < 2 ? -1.0 : 1.0);
          vec2 off = floor(q) - tile;
          float vq = off.x != 0.0 ? (off.y != 0.0 ? v.w : v.y) : (off.y != 0.0 ? v.z : v.x);
          float wq = abs(q.x - corner.x) * abs(q.y - corner.y);
          sum += wq * vq;
          weight += wq;
        }
        return sum / max(weight, 1e-4);
      }
      /** The ground's blending noise (the game's \`_BlendingNoise\`, a texture at world × 0.2; here our own at its
       *  statistics, palette.ts BLEND: its mean, its spread and features half a tile to two tiles across), 0–1: the
       *  desert's share and contamination's weight read the same sample. */
      float blendNoise(vec2 g) {
        return ${f(BLEND.noiseMean)} + ${f(BLEND_NOISE_GAIN)} * (0.7 * vnoise(g * 3.0 + vec2(3.1, 11.7)) + 0.3 * vnoise(g * 6.0 + vec2(17.3, 5.9)) - 0.5);
      }
      /** How much of the ground at tile point g is the game's desert: the tiles' desert (\`desert\`, as tapBlend takes
       *  them; a tile whose top is at another level counts as desert, as the game's map holds 1 there) blended by
       *  tapBlend, then the game's noise and its softness: saturate((f + 0.96 (n − 0.5) − 0.5) × 5.8 + 0.5). So a tile's
       *  share shows as patches of grass and earth, and the change between tiles is a noisy blend a fifth of a tile wide. */
      float desertBlend(vec2 g, vec4 desert) {
        return clamp((tapBlend(g, desert) + ${f(BLEND.noise)} * (blendNoise(g) - 0.5) - 0.5) * ${f(BLEND.softness)} + 0.5, 0.0, 1.0);
      }
      /** A tile's contamination map value from its soil's contamination (0–1), as the game's
       *  (palette.ts contaminationMap). */
      float contaminationMapOf(float c) {
        return c > 0.0 ? (c <= ${f(CT.mapFull)} ? 1.0 - ${f(CT.mapMax)} * (1.0 - c / ${f(CT.mapFull)}) : 1.0) : 0.0;
      }
      /** The weight contamination's pattern takes at map value m (blended across the tiles) and blending noise n, as the
       *  game's (palette.ts CONTAMINATION, contaminationWeight). */
      float contaminationWeight(float m, float n) {
        float v = pow(max(m, 0.0), ${f(CT.nonlinearity)});
        v = v >= 0.01 ? max(v, ${f(CT.least)}) : v;
        return clamp((v + ${f(CT.noise)} * (n - ${f(CT.noiseMid)}) - 0.5) * ${f(CT.softness)} + 0.5, 0.0, 1.0);
      }
      /** The mean over the game's blending noise of its blend saturate((v + k (n − mid) − 0.5) × softness + 0.5)
       *  (palette.ts noiseMean: five Gauss–Hermite nodes at its mean and spread), for the light look, which draws no
       *  noise: the share of the ground the noisy blend gives v on average. */
      float noiseMean(float v, float k, float mid, float softness) {
        float a = (v + k * (${f(BLEND.noiseMean)} - mid) - 0.5) * softness + 0.5;
        float b = k * ${f(BLEND.noiseSpread)} * softness;
        return ${NOISE_NODES.map(([x, w]) => `${f(w)} * clamp(a + ${f(x)} * b, 0.0, 1.0)`).join(" + ")};
      }
      /** The desert's share of a tile's top at its intensity d, averaged over the noise (the light look). */
      float desertMean(float d) {
        return noiseMean(d, ${f(BLEND.noise)}, 0.5, ${f(BLEND.softness)});
      }
      /** Contamination's weight at map value m, averaged over the noise (the light look; palette.ts
       *  contaminationWeightMean). */
      float contaminationWeightMean(float m) {
        float v = pow(max(m, 0.0), ${f(CT.nonlinearity)});
        v = v >= 0.01 ? max(v, ${f(CT.least)}) : v;
        return noiseMean(v, ${f(CT.noise)}, ${f(CT.noiseMid)}, ${f(CT.softness)});
      }
      /** Contamination's map value at the point a top's groundColor draws, blended across its tiles (tapBlend) by the
       *  caller; below 0 where the caller has none (groundColor then takes its level's own). */
      float contamMap = -1.0;
      /** 1: every top drawn at the game's texture means (palette.ts GAME_GROUND_MEAN) in place of our patterns, for
       *  the pixel judge alone (tools/water-pixel-judge.ts --define GROUND_MEANS): the light judged without the
       *  patterns' sampling, ours or the game's, at a few clusters of tiles. */
      #define GROUND_MEANS 0
      /** The ground's colour from its soil (moist, moisture level, contaminated, under water) and
       *  its contamination level (0–1). */
      vec3 groundColor(vec4 s, vec2 g, float detail, float clev) {
        #if LITE
          // (the game's ground: the grass's colour and ramp blended into the desert's by the tile's grass share)
          vec3 lc = mix(${glColor(GROUND.dry)} * altitudeOf(vWorld.y, 0.0), ${glColor(GROUND.grass)} * altitudeOf(vWorld.y, 1.0), s.x);
          // (no patterns: contamination's pattern at its mean, as the game's mips show it from afar, at its weight's mean
          // over the blending noise, palette.ts contaminationMean)
          lc = mix(lc, ${glColor(CT.mean)}, ${f(Math.round(CT.meanAlpha * 1e4) / 1e4)} * contaminationWeightMean(contaminationMapOf(clev)));
          return mix(lc, ${glColor(GROUND.underwater)}, step(0.5, s.w));
        #endif
        // contamination's pattern, world-anchored as the game's (its repeat \`CT.repeat\` tiles; read before the warp below,
        // and before any branch, as a mipmapped read needs every pixel of its quad)
        vec4 soilPattern = texture2D(soilTex, g / ${f(CT.repeat)});
        float soilNoise = blendNoise(g);
        // (the patterns are read through a broad warp, so their repeat never shows from afar)
        vec2 macroUV = mat2(0.8, -0.6, 0.6, 0.8) * g * 0.037;
        vec2 patternWarp = vec2(vnoise(macroUV + 23.7), vnoise(macroUV * 1.73 + 91.2)) - 0.5;
        g += patternWarp * 3.2;
        float n1 = vnoise(g * 1.3);
        float n2 = vnoise(g * 4.1 + 17.0);
        float n3 = vnoise(g * 19.0 + 5.0) - 0.5;
        // broad patches, a few tiles to a dozen across, that read from afar
        float b1 = vnoise(g * 0.09 + 31.0);
        float b2 = vnoise(g * 0.23 + 57.0);
        float b3 = vnoise(g * 0.55 + 83.0);
        vec2 dry = cracks(g * 3.1);
        // (the grass's share of the point: s.x, the game's per tile, blended across the narrow band at the tile's edge)
        float moist = ${hook(h, "moist", "clamp(s.x, 0.0, 1.0)")};
        float wet = smoothstep(0.4, 0.6, s.w + (n1 - 0.5) * 0.2);
        // (the bed under water of any depth, as the game's terrain draws its ground with no input from the water)
        float bed = wet;
        // dry: cracked earth, warm brown, drifting in broad patches to a cooler mauve and a warmer
        // tan and in lightness (D334); each plate its own shade, the cracks a fine, dark network
        vec3 c = mix(${glColor(GROUND.dryCool)}, ${glColor(GROUND.dry)}, smoothstep(0.28, 0.68, b1));
        c = mix(c, ${glColor(GROUND.dryWarm)}, smoothstep(0.32, 0.72, b2) * 0.85);
        // (and its broad shade, over a few tiles, as the game's desert texture varies: DRY_BROAD)
        float b4 = vnoise(g * 0.23 + 131.0);
        c *= (0.97 + 0.16 * (b3 - 0.5) + 0.08 * (n1 - 0.5) + ${f(DRY_BROAD)} * (b4 - 0.5)) * (0.96 + 0.22 * (dry.y - 0.5) + detail * 0.20 * n3);
        // (the cracks as deep from afar as near: their texture's mips keep their mean, as the game's textures do)
        c = mix(c, ${glColor(GROUND.crack)}, dry.x * 0.78);
        // moist: grass, a muted green the same at every moisture (the game's), in lighter and deeper patches and
        // darker blotches; up close, clumps a few to a tile and painted strokes, jittered and turned, so the pattern
        // never repeats in rows
        vec3 grass = ${glColor(GROUND.grass)};
        grass = mix(grass, grass * vec3(0.86, 0.94, 0.86), smoothstep(0.45, 0.75, b2));
        float blot = smoothstep(0.62, 0.82, vnoise(g * 0.7 + 5.3));
        float tuft = vnoise(g * 3.3 + 21.0) - 0.5;
        float blade = vnoise(vec2(g.x * 9.0 + g.y * 3.0, g.y * 9.0 - g.x * 3.0) + 40.0) - 0.5;
        grass = mix(grass, grass * vec3(1.035, 1.045, 0.97), smoothstep(0.05, 0.35, tuft) * 0.6);
        vec2 bladeUV = mat2(0.91, -0.415, 0.415, 0.91) * g * 7.0;
        bladeUV += vec2(vnoise(g * 2.7), vnoise(g * 2.1 + 41.0)) * 2.0;
        vec2 bladeCell = floor(bladeUV);
        float bladeHash = fract(sin(dot(bladeCell, vec2(127.1, 311.7))) * 43758.5453);
        float bladeTurn = bladeHash * 6.28318;
        vec2 bf = fract(bladeUV) - vec2(0.20 + bladeHash * 0.6, 0.20 + fract(bladeHash * 13.7) * 0.6);
        bf = mat2(cos(bladeTurn), -sin(bladeTurn), sin(bladeTurn), cos(bladeTurn)) * bf;
        float bladeAA = max(0.025, max(fwidth(bladeUV.x), fwidth(bladeUV.y)));
        // (the stroke widened by a pixel's footprint, so it reads up close and at a grazing view; the area that adds
        // taken off the whole, so the strokes' mean is PAINTED_MEAN at every footprint, and from afar, where the cells
        // shrink under a pixel, they fade to it: the grass's mean the same at every distance, STROKE_WIDEN_K)
        float painted = (1.0 - smoothstep(0.04, 0.04 + bladeAA, abs(bf.x + bf.y * 0.25))) * (1.0 - smoothstep(0.18, 0.42, abs(bf.y)));
        float widened = ${f(Math.round(PAINTED_MEAN * 12.5 * 1e6) / 1e6)} * bladeAA / (1.0 + ${f(STROKE_WIDEN_K)} * bladeAA * bladeAA);
        float tex = 0.91 + 0.31 * tuft + mix(${f(PAINTED_MEAN)}, painted * (0.08 + bladeHash * 0.16) - widened, detail) + 0.09 * blade * detail;
        c = mix(c, grass * (${f(0.935 - GRASS_BROAD / 2)} + ${f(GRASS_BROAD)} * b1 + 0.14 * (n1 - 0.5)) * tex * (1.0 - 0.19 * blot), moist);${hook(h, "groundVariation")}
        #if GROUND_MEANS
          c = mix(${glColor(GAME_GROUND_MEAN.dry)}, ${glColor(GAME_GROUND_MEAN.grass)}, moist);
        #endif
        // the game's altitude ramp, the grass's on grass and the desert's on dry ground, before contamination's veins
        c *= altitudeOf(vWorld.y, moist);
        // contamination: a layer over the ground, as the game's terrain shader lays it (palette.ts CONTAMINATION says the
        // same, for the tests): its pattern's rust over either soil by the pattern's alpha × the weight its map value (the
        // caller's blend across the tiles, or this level's own) and the blending noise give, with no glow
        float vein = contaminationWeight(contamMap >= 0.0 ? contamMap : contaminationMapOf(clamp(clev, 0.0, 1.0)), soilNoise) * soilPattern.a;
        c = mix(c, soilPattern.rgb, vein * (1.0 - wet));
${hook(h, "groundEnd")}        return mix(c, ${glColor(GROUND.underwater)} * (0.9 + 0.15 * n2), bed);
      }
      void main() {
        ${SUN_PX_GLSL}
        vec3 n = normalize(vNormal);
        vec3 p = vWorld - n * 0.01;
        vec2 g = vec2(p.x, -p.z);
        vec2 tile = floor(g);
        vec4 d0 = tileAt(tile);
        float h0 = heightOf(d0);
        #if CUTAWAY
          // the cutaway (D207, cutaway.ts cutFace): what the cut folded onto it over air (a roof's top and
          // underside above a cave) is not there, so the cave shows through the cut; its light stays the unsliced
          // terrain's (the volume is not sliced). (Dropped at the end, after every derivative the pixels round it take.)
          bool cutGone = slice < 90.0 && abs(n.y) > 0.5 && abs(vWorld.y - slice) < 0.001 && slice >= 1.0 && roofedAir(vec3(tile, slice - 1.0));
        #endif
        float detail = 1.0 - smoothstep(0.04, 0.16, fwidth(g.x));
        // (the cut's hatch: its lines' coordinate and how far it moves a pixel, taken outside any branch)
        float capU = (g.x + g.y) * 3.0;
        float capPx = max(fwidth(capU), 0.0001);
        vec3 c;
        vec3 light;
        float sunHere = 0.0;
        // (Markers' ledge and groove on a wall, an editing aid: put on after the grade)
        float ledge = 0.0;
        float groove = 0.0;
        if (n.y > 0.5) {
          // the tile and its three neighbours toward this point (the light look: the tile alone)
          vec2 fr = g - tile;
          vec2 sd = vec2(fr.x < 0.5 ? -1.0 : 1.0, fr.y < 0.5 ? -1.0 : 1.0);
          float filmPx = max(max(fwidth(g.x), fwidth(g.y)), 0.002);
          #if LITE
            vec4 dx = d0;
            vec4 dy = d0;
            vec4 dd = d0;
          #else
            vec4 dx = tileAt(tile + vec2(sd.x, 0.0));
            vec4 dy = tileAt(tile + vec2(0.0, sd.y));
            vec4 dd = tileAt(tile + sd);
          #endif
          float hx = heightOf(dx);
          float hy = heightOf(dy);
          float hd = heightOf(dd);
          vec2 w = abs(fr - 0.5);
          // soil blends toward neighbours of the same height only (never over a cliff)
          float sx = hx == h0 ? 1.0 : 0.0;
          float sy = hy == h0 ? 1.0 : 0.0;
          float sg = hd == h0 ? sx * sy : 0.0;
          float w10 = w.x * (1.0 - w.y) * sx;
          float w01 = (1.0 - w.x) * w.y * sy;
          float w11 = w.x * w.y * sg;
          float w00 = 1.0 - w10 - w01 - w11;
          // the soil changes at the tile's edge, as in the game: a narrow, deliberate transition (about a
          // pixel, at least a twenty-fifth of a tile) instead of a blend across the whole tile, wobbling
          // a little along the edge (the same wobble seen from both tiles, so it stays continuous); the
          // light and the contamination's level (shading) keep the smooth weights above
          float bandW = max(0.04, 1.5 * max(fwidth(g.x), fwidth(g.y)));
          #if LITE
            // (the light look: the tile alone, so the blend below comes to the tile's own soil and level;
            // worked out once, without the edge's wobble (D135: no soil blending), which software would pay for
            // on every pixel)
            vec2 ws = smoothstep(vec2(0.5 - bandW), vec2(0.5 + bandW), w);
            vec4 s0 = soilOf(d0);
            // (the grass's share the game's noisy blend gives the tile's desert intensity on average: desertMean)
            vec4 soil = vec4(1.0 - desertMean(s0.w), s0.x, step(0.5, s0.y), s0.z);
            // (a still film's water drawn back from the shore leaves dry ground: shoreFilm.ts)
            if (soil.w > 0.0) soil.w *= shoreFilmOwn(tile, d0, fr, filmPx);
            float clev = s0.y / 15.0;
          #else
            vec2 edgeWave = vec2(vnoise(g * 6.7 + 17.0), vnoise(g * 5.3 + 47.0)) - 0.5;
            vec2 ws = smoothstep(vec2(0.5 - bandW), vec2(0.5 + bandW), w + edgeWave * sd * 0.105);
            float v10 = ws.x * (1.0 - ws.y) * sx;
            float v01 = (1.0 - ws.x) * ws.y * sy;
            float v11 = ws.x * ws.y * sg;
            float v00 = 1.0 - v10 - v01 - v11;
            vec4 s0 = soilOf(d0);
            vec4 s1 = soilOf(dx);
            vec4 s2 = soilOf(dy);
            vec4 s3 = soilOf(dd);
            vec4 flags0 = vec4(grassAt(s0), s0.x, step(0.5, s0.y), s0.z);
            vec4 flags1 = vec4(grassAt(s1), s1.x, step(0.5, s1.y), s1.z);
            vec4 flags2 = vec4(grassAt(s2), s2.x, step(0.5, s2.y), s2.z);
            vec4 flags3 = vec4(grassAt(s3), s3.x, step(0.5, s3.y), s3.z);
            vec4 soil = flags0 * v00 + flags1 * v10 + flags2 * v01 + flags3 * v11;
            // a still film's water drawn back from the shore leaves the ground there dry (shoreFilm.ts, Q9 V3): on its own
            // tile, off the outline its mesh is drawn to; on a dry tile beside it, none of its wet blends over
            if (flags0.w > 0.5) soil.w *= shoreFilmOwn(tile, d0, fr, filmPx);
            else if (soil.w > 0.0) {
              // (the flow's share at the corner the four tiles share, as the water's vertex shader reads it there)
              float fc = shoreFilmFlowAt(tile + step(vec2(0.5), fr));
              soil.w = flags1.w * v10 * shoreFilmKeep(dx, fc) + flags2.w * v01 * shoreFilmKeep(dy, fc) + flags3.w * v11 * shoreFilmKeep(dd, fc);
            }
            // the grass's share as the game draws it: its desert map's noisy blend (desertBlend)
            vec4 desertTaps = vec4(1.0 - flags0.x, sx > 0.5 ? 1.0 - flags1.x : 1.0, sy > 0.5 ? 1.0 - flags2.x : 1.0, hd == h0 ? 1.0 - flags3.x : 1.0);
            #ifdef RUN_SOIL
              // (a neighbour whose top is at another level counts as desert unless a cave's floor stands at this level in
              // it, which the tap reads as the floor's own blend reads this top: no seam at a cave's mouth)
              if (sx < 0.5) desertTaps.y = runDesert(tile + vec2(sd.x, 0.0), h0, 1.0);
              if (sy < 0.5) desertTaps.z = runDesert(tile + vec2(0.0, sd.y), h0, 1.0);
              if (hd != h0) desertTaps.w = runDesert(tile + sd, h0, 1.0);
            #endif
            soil.x = 1.0 - desertBlend(g, desertTaps);
            float clev = (s0.y * w00 + s1.y * w10 + s2.y * w01 + s3.y * w11) / 15.0;
            // contamination's map value as the game blends it (a tile at another level holds none at this one)
            contamMap = tapBlend(g, vec4(contaminationMapOf(s0.y / 15.0), sx > 0.5 ? contaminationMapOf(s1.y / 15.0) : 0.0,
              sy > 0.5 ? contaminationMapOf(s2.y / 15.0) : 0.0, hd == h0 ? contaminationMapOf(s3.y / 15.0) : 0.0));
          #endif
          vec3 ground = groundColor(soil, g, detail, clev);
          #if !LITE
            // the ground behind the water shows as the game's High quality shows it: overlaid with
            // the water's own colour there and desaturated (WATER_SURFACE.behindTint); the water's opacity sets how
            // much of it shows. Clear water (an editing aid) shows the bed as it is. Only where the frame's water
            // doesn't do it itself, as the game's does, from its copy of the screen (refraction.ts: a browser drawing
            // in software, a picture), so it is never put on twice
            float clrBehind = clearWater;
            if (clearAround.w > 0.5) clrBehind = max(clrBehind, 1.0 - smoothstep(clearAround.z, clearAround.z + CLEAR_FADE, length(g - clearAround.xy)));
            float behind = smoothstep(0.4, 0.6, soil.w) * (1.0 - clrBehind) * (1.0 - refractView.y);
            if (behind > 0.0) {
              float bd = waterDepthOf(d0);
              vec3 wc = waterBlend(cleanWaterBody(bd, waterAbsorb(bd)), badwaterBody(bd), ${hook(h, "behindShare", "texture2D(flowTex, g / mapSize).b")});
              ground = mix(ground, waterGroundBehind(ground, wc), behind);
            }
          #endif
          // an eruption's fresh rock reads as rock, never the grass or earth it rose from (#367)
          float fresh = freshRock(tile, h0);
          ground = mix(ground, ashOf(g), fresh);
          if (groundMode > 0.5) {
            c = heightColor(h0) * (0.96 + 0.08 * (vnoise(g * 9.0) - 0.5) * detail);
          } else {
            // (no rim where grass meets earth: the game blends its grass into its desert by the share alone)
            c = ground;
          }
          #if LITE == 0
            // a thin dark line along the top of a drop, as the game's blocks draw their edges (the light look's
            // neighbours are the tile itself: no lip)
            float topLip = max(step(0.5, h0 - hx) * (1.0 - smoothstep(0.025, max(0.06, fwidth(g.x)), 0.5 - w.x)), step(0.5, h0 - hy) * (1.0 - smoothstep(0.025, max(0.06, fwidth(g.y)), 0.5 - w.y)));
            c *= 1.0 - topLip * 0.30;
          #endif
          sunHere = sunLit(g, h0);
          light = gameLight(n, sunHere);
          if (vWorld.y < h0 - 0.5) {
            // a floor under an overhang (a cave's or a ledge's): the top's soil, never its water,
            // in the overhang's shade (its own contamination, not the top's blend)
            contamMap = -1.0;
            #ifdef RUN_SOIL
              // its own run top's soil and water where the worker sent it (runSoil.ts), blending toward the
              // ground at the same level round it as a top blends toward neighbours of its height; where no run
              // top is (a cap at a layer cut) the top's, as before
              vec4 floorSoil = vec4(soil.xyz, 0.0);
              float floorLevel = clev;
              float zr = floor(vWorld.y + 0.5);
              if (runAt(tile, zr).y > 0.5) {
                float r0;
                float rx1;
                float ry1;
                float rd1;
                vec4 q0 = groundAt(tile, zr, r0);
                vec4 q1 = groundAt(tile + vec2(sd.x, 0.0), zr, rx1);
                vec4 q2 = groundAt(tile + vec2(0.0, sd.y), zr, ry1);
                vec4 q3 = groundAt(tile + sd, zr, rd1);
                float rd = rd1 * rx1 * ry1;
                float u10 = ws.x * (1.0 - ws.y) * rx1;
                float u01 = (1.0 - ws.x) * ws.y * ry1;
                float u11 = ws.x * ws.y * rd;
                float u00 = 1.0 - u10 - u01 - u11;
                float z10 = w.x * (1.0 - w.y) * rx1;
                float z01 = (1.0 - w.x) * w.y * ry1;
                float z11 = w.x * w.y * rd;
                float z00 = 1.0 - z10 - z01 - z11;
                // (each its desert intensity, groundAt's w: an open top's from its moisture unrounded, as the top itself
                // takes it, so the floor and the top meet without a seam)
                floorSoil = vec4(1.0 - q0.w, q0.x, step(0.5, q0.y), q0.z) * u00 + vec4(1.0 - q1.w, q1.x, step(0.5, q1.y), q1.z) * u10
                  + vec4(1.0 - q2.w, q2.x, step(0.5, q2.y), q2.z) * u01 + vec4(1.0 - q3.w, q3.x, step(0.5, q3.y), q3.z) * u11;
                #if LITE
                  floorSoil.x = 1.0 - desertMean(1.0 - floorSoil.x);
                #else
                  // the game's desert map is 3D: a cave's floor blends as a top does, at its own level
                  floorSoil.x = 1.0 - desertBlend(g, vec4(q0.w, rx1 > 0.5 ? q1.w : 1.0, ry1 > 0.5 ? q2.w : 1.0, rd1 > 0.5 ? q3.w : 1.0));
                #endif
                floorLevel = (q0.y * z00 + q1.y * z10 + q2.y * z01 + q3.y * z11) / 15.0;
              }
              c = groundMode > 0.5 ? heightColor(vWorld.y) : groundColor(floorSoil, g, detail, floorLevel);

            #else
              c = groundMode > 0.5 ? heightColor(vWorld.y) : groundColor(vec4(soil.xyz, 0.0), g, detail, clev);
            #endif
            light = gameLight(n, 0.0);
          }
        } else {
          // a wall: cobbled stone (D334), tinted by height as the game's cliffs (D497); with Markers, a pale ledge
          // at the top of each level over a dark groove at the foot of the next (each at least a
          // pixel wide, and gone where a level is under three pixels); a lip of the top's ground.
          // A ceiling (a run's underside, only on a map with terrain above terrain) is the same stone laid on the
          // level plane, at the same scale: its stones along x, its courses along y, so it never stretches; the
          // level lines, the seams between levels and the lip are the walls' alone.
          bool ceiling = n.y < -0.5;
          vec2 out2 = vec2(n.x, -n.z);
          float y = ceiling ? g.y : vWorld.y;
          float level = floor(vWorld.y + 0.001);
          float fy = y - level;
          float along = abs(n.x) > 0.5 ? g.y : g.x;
          #if LITE
            float k = 0.75;
          #else
            float k = cobble(vec2(along * 1.5 + (vnoise(vec2(along * 0.7, y)) - 0.5) * 0.35, y * 1.6));
          #endif
          // (the game's cliff gradient: its stone tinted from _SplatGradientMin at level 0 to _SplatGradientMax at 22)
          vec3 cliffTint = mix(${glColor(WALL.gradient.min)}, ${glColor(WALL.gradient.max)}, vWorld.y / ${f(ALTITUDE_RAMP.ceiling)});
          vec3 wc = mix(${glColor(WALL.mortar)}, ${glColor(WALL.stone)} * (0.78 + 0.44 * (k - 0.5)), smoothstep(0.1, 0.4, k)) * cliffTint;
${hook(h, "wall")}          float py = fwidth(y);
          float lines = ceiling ? 0.0 : (1.0 - smoothstep(0.22, 0.34, py)) * ${hook(h, "wallLines", "markers")};
          float lw = max(0.09, 1.2 * py);
          float gw = max(0.035, 0.8 * py);
          ledge = smoothstep(1.0 - lw - py * 0.5, 1.0 - lw + py * 0.5, fy) * lines;
          groove = (1.0 - smoothstep(gw - py * 0.5, gw + py * 0.5, fy)) * lines;
          float lip = ceiling ? 0.0 : 1.0 - smoothstep(0.07, 0.13, h0 - y);
          vec4 s0 = soilOf(d0);
          vec3 top = groundMode > 0.5 ? heightColor(h0) : mix(${glColor(GROUND.dry)} * 0.85, ${glColor(GROUND.grass)}, grassAt(s0));
          // (an eruption's fresh rock: its cliffs dark basalt, its lip ash)
          float freshWall = freshRock(tile, vWorld.y);
          wc = mix(wc, ${glColor(JUICE.ashDark)} * (0.62 + 0.5 * k), freshWall * 0.7);
          if (groundMode < 0.5) top = mix(top, ${glColor(JUICE.ashPale)} * 0.85, freshRock(tile, h0));
          vec2 stoneUV = vec2(along * 1.5 + (vnoise(vec2(along * 0.7, y)) - 0.5) * 0.35, y * 1.6);
          #if LITE
            // (the light look draws no stone pattern, D135: no bevel or cracks either)
            float bevel = 0.0;
          #else
            float bevel = cobble(stoneUV + vec2(0.055, 0.075)) - cobble(stoneUV - vec2(0.055, 0.075));
          #endif
          wc *= 1.0 + clamp(bevel * 0.62, -0.10, 0.13);
          float seamAA = max(0.012, fwidth(y));
          float seam = ceiling ? 0.0 : (1.0 - smoothstep(0.025, 0.025 + seamAA, min(fy, 1.0 - fy))) * (1.0 - smoothstep(0.25, 0.6, seamAA));
          #if LITE
            float vertical = 0.0;
          #else
            float vertical = cracks(vec2(along * 0.43, y * 0.11)).x;
          #endif
          wc *= (1.0 - 0.18 * seam) * (1.0 - 0.10 * vertical);
          c = mix(wc, top * 0.58, lip * 0.55);
          #if !LITE
            // a wall under the water in front of it (a bank's foot, a step in the bed) shows through the water as the
            // ground behind does, as the game's High quality shows whatever lies behind (P13): overlaid with the water's
            // own colour at the depth the view sees there, its surface over this point (viewDepth.ts: at the foot of a
            // bank facing the camera, the band's), and desaturated. Clear water (an editing aid) shows it as it is.
            // Only where the frame's water doesn't do it itself (refraction.ts), as for the ground under it
            if (!ceiling && refractView.y < 0.5) {
              vec2 wt = tile + out2;
              vec4 dw = tileAt(wt);
              float wd = waterDepthOf(dw);
              float bd = heightOf(dw) + wd - vWorld.y;
              float clrWall = clearWater;
              if (clearAround.w > 0.5) clrWall = max(clrWall, 1.0 - smoothstep(clearAround.z, clearAround.z + CLEAR_FADE, length(g - clearAround.xy)));
              if (wd > 0.0 && bd > 0.0 && clrWall < 0.999) {
                vec2 g = wt + 0.5;
                vec3 ww = waterBlend(cleanWaterBody(bd, waterAbsorb(bd)), badwaterBody(bd), ${hook(h, "behindShare", "texture2D(flowTex, g / mapSize).b")});
                c = mix(c, waterGroundBehind(c, ww), 1.0 - clrWall);
              }
            }
          #endif
          if (ceiling) light = gameLight(n, 0.0);
          else {
            sunHere = sunLit(g + out2 * 0.26, y);
            light = gameLight(n, sunHere);
          }
        }
        // a face whose air is under a roof (a cave's floor, walls and ceiling, under an overhang or
        // an arch) takes that air's own light, not its tile top's
        vec3 cave = caveAt(vWorld, n);
        if (cave.z > 0.5) light = caveLightOf(n, cave, sunHere);
        vec3 albedo = c;
        c *= light;
        // (the light look, drawn in software, leaves out the specular: a few hundredths of the light, a third of its frame)
        #if LITE == 0
        c += gameSpecular(n, albedo, n.y > 0.5 ? 0.0 : 0.05);
        #endif
${hook(h, "lit")}
        // the slice's cut (D207): the tops of columns taller than the layer (with terrain above terrain, only the cap
        // where solid rock crosses the cut, not a cave's floor below it) are a section through rock, not ground: a cool
        // slate, darker than the tops round it, with a diagonal hatch. Close up three lines a tile; farther out every
        // other line fades away as the lines close in, so they stay some seven pixels apart and the cut never blurs
        // into a flat colour like the ground's. Its light is the unsliced top's, softened. (The overlays go on it as on
        // any top.)
        bool capped = n.y > 0.5 && slice < 90.0 && h0 > slice + 0.5
        #if CUTAWAY
          && abs(vWorld.y - slice) < 0.001 && !roofedAir(vec3(tile, slice))
        #endif
        ;
        if (capped) {
          float lv = max(0.0, log2(capPx * 7.0));
          float p0 = exp2(floor(lv));
          float l0 = 1.0 - smoothstep(0.25 - 0.75 * capPx / p0, 0.25 + 0.75 * capPx / p0, abs(fract(capU / p0 + 0.5) - 0.5));
          float p1 = p0 * 2.0;
          float l1 = 1.0 - smoothstep(0.25 - 0.75 * capPx / p1, 0.25 + 0.75 * capPx / p1, abs(fract(capU / p1 + 0.5) - 0.5));
          float line = mix(l0, l1, smoothstep(0.15, 0.85, fract(lv)));
          float lum = clamp(dot(light, vec3(0.299, 0.587, 0.114)), 0.0, 1.3);
          c = mix(${glColor(CUT_CAP.base)}, ${glColor(CUT_CAP.line)}, line) * (0.72 + 0.28 * lum);
        }
        // an eruption's heat (D206): the vents and the flows glow, cool to a dark crust, and the
        // crust fades back into the ground; ash dusts the slopes round it
        // (not on the map's outer walls: the mask's edge would stretch down them)
        // (the lava's glow is its own light, as a URP emission: bright enough to come through the post chain's Neutral
        // tonemap the strong orange it is, and fogged with distance as everything is)
        vec3 emission = vec3(0.0);
        vec2 eAt = vec2(vWorld.x, -vWorld.z);
        bool eWall = abs(n.y) < 0.5 && (eAt.x < 0.01 || eAt.y < 0.01 || eAt.x > mapSize.x - 0.01 || eAt.y > mapSize.y - 0.01);
        if (eruptionAge >= 0.0 && !eWall) {
          vec4 e = texture2D(eruptionMask, eAt / mapSize);
          float arrival = smoothstep(e.a * 1.1, e.a * 1.1 + 0.55, eruptionAge);
          float cooling = smoothstep(0.0, ${f(LAVA.cooling)}, coolingAge);
          float crust = smoothstep(${f(LAVA.crust[0])}, ${f(LAVA.crust[1])}, coolingAge);
          float fade = 1.0 - smoothstep(${f(LAVA.fade[0])}, ${f(LAVA.fade[1])}, coolingAge);
          float cracks = pow(1.0 - abs(sin(vWorld.x * 2.8 + sin(vWorld.z * 1.2) * 2.6 + vWorld.z * 1.6)), 12.0);
          float hot = max(e.r * (0.56 + 0.44 * cracks), e.g * cracks);
          float k = hot * arrival * fade * ${f(LAVA.most)};
          // (the crust is the ground darkened; the rest of the lava is its own light)
          c *= 1.0 - k + k * crust * ${glColor3(LAVA.crustTint)};
          emission = mix(${glColor3(LAVA.hot)}, ${glColor3(LAVA.cooled)}, cooling) * k * (1.0 - crust);
          float ash = e.b * smoothstep(0.5, 2.4, eruptionAge) * (1.0 - smoothstep(0.5, 6.0, coolingAge)) * 0.24 * max(0.0, n.y);
          c = mix(c, vec3(0.52, 0.49, 0.45), ash);
          emission *= 1.0 - ash;
        }
        // the look as the game draws it, fogged and graded; the editing aids after it, in their own channel (D497)
        c = finishLit(c, emission, vWorld);
        c = mix(c, ${glColor(WALL.ledge)}, ledge);
        c = mix(c, ${glColor(WALL.groove)}, groove);
        vec4 o = texture2D(overlay, (tile + 0.5) / mapSize);
        #if CUTAWAY
          // (a selection taken on a run is drawn on that run, the rest of the column as the land outside it)
          o = overlayOnRun(o, tile, vWorld.y, n.y > 0.5 ? 1.0 : n.y < -0.5 ? -1.0 : 0.0);
        #endif
        if (o.a < 0.998) c = mix(c, o.rgb * (0.8 + 0.2 * min(light.g, 1.0)), o.a);
        else c = mix(c, o.rgb, (n.y > 0.5 ? float(LITE) : 0.5) * markers);
        // a footprint's edge, on its tops
        float footEdge = n.y > 0.5 ? overlayEdge(g, o, max(max(fwidth(g.x), fwidth(g.y)), 0.002)) : 0.0;
        c = mix(c, overlayEdgeColor(o) * (0.85 + 0.15 * min(light.g, 1.0)), footEdge);
        bool footprint = mod(floor(o.a * 255.0 + 0.5), 2.0) > 0.5 && o.a < 0.998;
        if (n.y > 0.5) {
          vec4 hatch = hatchAt(g, o.rgb * (0.88 + 0.12 * min(light.g, 1.0)));
          c = mix(c, hatch.rgb, hatch.a);
        }
        // Markers: an outline where contaminated ground ends (contaminationEdges), a light line
        // between dark edges, a few pixels wide (at most a quarter of a tile)
        if (markers > 0.5 && n.y > 0.5 && vWorld.y > h0 - 0.5) {
          float eb = floor(texture2D(contamEdges, (tile + 0.5) / mapSize).r * 255.0 + 0.5);
          if (eb > 0.5) {
            vec2 fo = fract(g);
            float e = 9.0;
            if (bitOf(eb, 1.0) > 0.5) e = min(e, 1.0 - fo.x);
            if (bitOf(eb, 2.0) > 0.5) e = min(e, fo.x);
            if (bitOf(eb, 4.0) > 0.5) e = min(e, 1.0 - fo.y);
            if (bitOf(eb, 8.0) > 0.5) e = min(e, fo.y);
            float s = e / min(max(max(fwidth(g.x), fwidth(g.y)), 0.004), 0.07);
            c = mix(c, ${glColor(OUTLINE.dark)}, 1.0 - smoothstep(3.1, 3.7, s));
            c = mix(c, ${glColor(OUTLINE.light)}, smoothstep(0.7, 1.2, s) * (1.0 - smoothstep(2.3, 2.8, s)));
          }
          // the outline round a mine site's footprint (mineOutline), on the tiles just outside it
          // (the footprint's own tops are the pit's): an orange line between dark edges, a few
          // pixels wide from any distance (from afar it fills most of a tile's width round the
          // site, so the site reads in a view of the whole map), turning round its corners
          vec4 st = texture2D(siteEdges, (tile + 0.5) / mapSize);
          float sb = floor(st.r * 255.0 + 0.5);
          float sc = floor(st.g * 255.0 + 0.5);
          if (sb > 0.5 || sc > 0.5) {
            vec2 fo = fract(g);
            float e = 9.0;
            if (bitOf(sb, 1.0) > 0.5) e = min(e, 1.0 - fo.x);
            if (bitOf(sb, 2.0) > 0.5) e = min(e, fo.x);
            if (bitOf(sb, 4.0) > 0.5) e = min(e, 1.0 - fo.y);
            if (bitOf(sb, 8.0) > 0.5) e = min(e, fo.y);
            if (bitOf(sc, 1.0) > 0.5) e = min(e, length(vec2(1.0) - fo));
            if (bitOf(sc, 2.0) > 0.5) e = min(e, length(vec2(fo.x, 1.0 - fo.y)));
            if (bitOf(sc, 4.0) > 0.5) e = min(e, length(vec2(1.0 - fo.x, fo.y)));
            if (bitOf(sc, 8.0) > 0.5) e = min(e, length(fo));
            float s = e / min(max(max(fwidth(g.x), fwidth(g.y)), 0.004), 0.25);
            c = mix(c, ${glColor(MINE.outlineDark)}, 1.0 - smoothstep(3.3, 3.9, s));
            c = mix(c, ${glColor(MINE.outline)}, smoothstep(0.7, 1.2, s) * (1.0 - smoothstep(2.5, 3.0, s)));
          }
        }
        if (n.y > 0.5) {
          // level lines: a thin dark line on each tile edge where the ground steps down (not on the cut)
          if (!capped && levelLines > 0.5) {
            vec2 fo = fract(g);
            float e = 9.0;
            if (heightOf(tileAt(tile + vec2(1.0, 0.0))) < h0) e = min(e, 1.0 - fo.x);
            if (heightOf(tileAt(tile + vec2(-1.0, 0.0))) < h0) e = min(e, fo.x);
            if (heightOf(tileAt(tile + vec2(0.0, 1.0))) < h0) e = min(e, 1.0 - fo.y);
            if (heightOf(tileAt(tile + vec2(0.0, -1.0))) < h0) e = min(e, fo.y);
            float px = max(fwidth(g.x), 0.002);
            float lw = max(0.04, 1.2 * px);
            c = mix(c, ${glColor(WALL.groove)}, (1.0 - smoothstep(lw, lw + px, e)) * 0.8);
          }
        }
        // (on a footprint its own edge marks it: no white square over it)
        if (hover.z > 0.5 && tile == hover.xy && !footprint && (hover.w < 0.0 || n.y < 0.5 || abs(vWorld.y - hover.w) < 0.02)) {
          vec2 fr = fract(vec2(p.x, -p.z));
          float edge = min(min(fr.x, 1.0 - fr.x), min(fr.y, 1.0 - fr.y));
          c = mix(c * 1.18, vec3(1.0), (1.0 - smoothstep(0.04, 0.09, edge)) * (n.y > 0.5 ? 0.85 : 0.0));
        }
        gl_FragColor = bloomSource > 0.5 ? vec4(gpSource, 1.0) : vec4(c, 1.0);
        #if CUTAWAY
          if (cutGone) discard;
        #endif
      }
    `,
  });
}

/** Where the game's own pattern lies over a source (Q9 P7) in the sources' texture's R (renderer.ts `markSources`,
 *  sourceMarks.ts), as the game's `_WaterSourceMask` gives each tile its place in its source's footprint: each tile of a
 *  running badwater source's 3 × 3 `square` + its column + 3 × its row (from the footprint's least x and y, in the
 *  map's axes), each of a seep's 2 × 2 `seep` + its column + 2 × its row. All under a half, the rings' threshold
 *  (a water source's own tile is 255). */
export const SOURCE_FOOTPRINT = { square: 1, seep: 10 } as const;

/** The game's own pattern over the water sources (Q9 P7, waterPalette.ts GAME_WATER_SOURCE), GLSL for the water's
 *  fragment shader: at point g (tiles), 0–1, from its tile's place in a footprint (`SOURCE_FOOTPRINT`, one read of
 *  the sources' texture) and the pattern in badwater's texture's A, sampled at its top mip (the angle's seam would pick
 *  the smallest). */
const WATER_SOURCE_GLSL = /* glsl */ `
      float waterSourcePattern(vec2 g) {
        float code = floor(texture2D(sourceTex, (floor(g) + 0.5) / mapSize).r * 255.0 + 0.5) - ${f(SOURCE_FOOTPRINT.square)};
        if (code < -0.5 || code > ${f(SOURCE_FOOTPRINT.seep + 3 - SOURCE_FOOTPRINT.square)} + 0.5) return 0.0;
        // (its column and row in the footprint, and the footprint's size)
        float n = code < ${f(SOURCE_FOOTPRINT.seep - SOURCE_FOOTPRINT.square)} - 0.5 ? 3.0 : 2.0;
        code -= n > 2.5 ? 0.0 : ${f(SOURCE_FOOTPRINT.seep - SOURCE_FOOTPRINT.square)};
        vec2 cell = vec2(mod(code, n), floor(code / n + 0.01));
        vec2 v = (cell + fract(g)) / n - 0.5;
        float r = length(v);
        float k = max(1.0 - 2.0 * r, 0.0);
        if (k <= 0.0) return 0.0;
        float shape = textureLod(badwaterTex, vec2(2.0 * r - ${f(GAME_WATER_SOURCE.scroll)} * time, atan(v.y, v.x) * ${f(Math.round((1 / (2 * Math.PI)) * 1e6) / 1e6)}), 0.0).a;
        float k2 = k * k;
        return clamp(8.0 * shape * k2 + min(1.0, 2.5 * k2 * k2 * k2), 0.0, 1.0);
      }
`;

export function waterMaterial(scene: SceneUniforms, lite = false, h?: ShaderHooks): ShaderMaterial {
  return new ShaderMaterial({
    // (the game's refraction where this look follows its high-quality water: refraction.ts WATER_REFRACTION.looks; the
    // High look's material is the one with hooks)
    defines: { LITE: lite ? 1 : 0, WATER_REFRACTS: !lite && WATER_REFRACTION.looks[h ? "high" : "standard"] ? 1 : 0 },
    uniforms: scene as unknown as Record<string, { value: unknown }>,
    vertexShader: /* glsl */ `
      attribute vec2 wdata;
      attribute float wflags;
      attribute vec2 wcut;
      attribute vec2 wshore;
      uniform float slice;
      uniform sampler2D flowTex;
      uniform vec2 mapSize;
      varying vec2 vData;
      varying float vFlags;
      varying vec3 vNormal;
      varying vec3 vWorld;
      varying float vFloor;
      ${SHORE_FILM_VERTEX_GLSL}
      void main() {
        vData = wdata;
        vFlags = wflags;
        vFloor = wcut.x;
        vNormal = normal;
        vec4 w = modelMatrix * vec4(position, 1.0);
        // a still film drawn back from the shore, as the game's vertex shader moves it (shoreFilm.ts, Q9 V3): the mesh's
        // shift × the depth's share, × the flow's share at its corner here
        if (wshore.x != 0.0 || wshore.y != 0.0) {
          vec2 shift = wshore * shoreFilmFlow(vec2(w.x, -w.z));
          w.x += shift.x;
          w.z -= shift.y;
        }
        // the game's layers (D207, cutWater.ts): a column standing over the cut with its floor below it is sliced, its
        // top lying on the cut, shallower by what the cut took off, its sides stopping there; one whose floor is at
        // the cut or above it is gone (the fragment shader drops its top over the cut, and its sides fold flat here:
        // a side hanging below its floor, to lower water in front of a cliff, would leave a sliver under the cut),
        // but for a side as tall as a fall (toward lower dry ground), which keeps its part below the cut in front of the
        // cliff, as the game's layers do. A fall itself is the slope of the water below it, a top (fallSlope.ts): each
        // vertex sliced by its own height and floor
        // (a side's vertex by its own height where that stands over its column's surface: a slope's edge, a skirt)
        float colTop = wcut.x + wdata.x;
        float surface = normal.y > 0.5 ? w.y : max(colTop, w.y);
        if (surface > slice + ${f(CUT_SLACK)} && wcut.x >= slice && normal.y < 0.5) w.y = wflags < 254.5 && wflags > ${f(FALL * 30 - 0.5)} ? min(w.y, slice) : colTop;
        if (surface > slice + ${f(CUT_SLACK)} && wcut.x < slice) {
          float over = surface - slice;
          float h0 = w.y;
          w.y = min(w.y, slice);
          if (normal.y > 0.5) {
            // (a fall's slope vertex, its cut share under -0.5: the depth seen from the cut, against the cliff or into
            // the upper water to its floor, cutWater.ts cutSlopeDepth)
            if (wcut.y < -0.5) {
              float v = -1.0 - wcut.y;
              float back = h0 - (mod(v, 64.0) - 0.5);
              vData.x = max(0.05, min(slice - wcut.x, max(v > 63.75 ? ${f(VIEW_TAN / 3)} : 0.0, slice - back)));
            } else vData.x = max(0.0, wdata.x - over * wcut.y);
            // (its shores only)
            vFlags = mod(wflags, 16.0);
          } else {
            vData.x = slice - wcut.x;
            // (a side's drop, but at the map's edge: shorter by what the cut took off)
            if (wflags < 254.5) vFlags = max(0.0, wflags - over * 30.0);
          }
        }
        vWorld = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec2 vData;
      varying float vFlags;
      varying vec3 vNormal;
      varying vec3 vWorld;
      varying float vFloor;
      ${common(h)}
      ${WATER_GLSL}${WATER_FLOW_GLSL}${CAVE_FLOW}
      ${GAME_WATER_LIGHT}
      ${FALL_MASK_GLSL}
      ${REFRACTION_INPUTS_GLSL}
      #if WATER_REFRACTS
      ${REFRACTION_GLSL}
      #endif
${hook(h, "waterDecl")}${CAVE_POINT}
      #ifdef CAVES
      ${OVERLAY_RUN}
      #endif
      /** The flow the water's textures ride here (the game's, high/bake.ts flowByte), 0 where still. */
      vec2 waterFlow(vec2 g) { return waterFlowOf(texture2D(flowTex, g / mapSize).rg); }
      /** The badwater share at g as the game blends it between tiles (waterPalette.ts WATER_SHARE_BLEND, Q9 P9): each
       *  tile's own in the flow texture's B, dry tiles left out by its A, about a tile wide across a front, its margin
       *  wobbled by our own noise in place of the game's margin noise (the light look: the margin's widest). */
      float waterShareAt(vec2 g) {
        #if LITE
          return waterShareFrom(flowTex, mapSize, g, 1.0);
        #else
          return waterShareFrom(flowTex, mapSize, g, vnoise((g + ${f(WATER_SHARE_BLEND.noiseSpeed)} * time) * ${f(WATER_SHARE_BLEND.noiseScale)}));
        #endif
      }
${WATER_SOURCE_GLSL}${VIEW_DEPTH_GLSL}
      void main() {
        ${SUN_PX_GLSL}
        vec3 n = normalize(vNormal);
        float depth = vData.x;
        float cont = clamp(vData.y, 0.0, 1.0);
        vec2 g = vec2(vWorld.x, -vWorld.z);
        vec3 V = normalize(cameraPosition - vWorld);
        // water under a roof (3D view, part 4; only on a map with terrain above terrain, CAVES): the air it stands in
        // (just inside it), from the light volume: x the sky, y the sun, z 1 under a roof
        float waterRoofed = 0.0;
        #ifdef CAVES
          vec3 inWater = vWorld - n * (n.y > 0.5 ? min(0.01, max(depth, 0.0) * 0.5) : 0.005);
          vec3 cave = caveAirAt(inWater);
          waterRoofed = cave.z;
          // (water below its tile's surface water: its own column's current, not the water's seen from above)
          waterOwnFlow = ownFlowAt(inWater);
        #endif
        // the badwater share on the water's top as the game blends it between tiles (WATER_SHARE_BLEND): a front about
        // a tile wide, clean water a tile from badwater clean; a fall's face and the water's side keep the mesh's share
        // (a side its own tile's, D154), and water under a roof its own column's
        // (water below its tile's surface water by its own current too, so it never reads the top water's while the light
        // volume is not there yet)
        bool ownShare = waterRoofed > 0.5;
        #ifdef CAVES
          ownShare = ownShare || waterOwnFlow.a > 0.5;
        #endif
        if (n.y > 0.5 && !ownShare) cont = waterShareAt(g);
        // the game's still detail albedo here (Q9 P6), which clean water's colour × its albedo and badwater's base colour
        // are overlaid with: at xz × 0.015, not carried by the flow, in every look (the game's Low quality draws it too)
        waterDetail = waterDetailAt(g);
        // the game's own pattern over a seep or a badwater source (Q9 P7), on the water's top over it, in every look (the
        // game's Low quality draws it too); under our rings and bubbles (D249, with Markers on), an editing aid drawn after it
        waterSource = n.y > 0.5 ? waterSourcePattern(g) : 0.0;
        // the game's waterfall mask here (fallMask.ts, Q9 P1: on the water a fall lands in), which takes off its camera
        // highlight and its refraction and shows less of the ground behind; none in the light look (the game's Low
        // quality makes none) nor on water below its tile's surface water (the mask is the surface water's)
        #if !LITE
          waterFall = waterFallMask(g);
          #ifdef CAVES
            if (waterOwnFlow.a > 0.5) waterFall = 0.0;
          #endif
        #endif
        float t = time;
        // the badwater share, blended between tiles as the game's (above): the water turns from clean water to
        // badwater with it, smoothly, never in streaks or patches, by the game's own tint (waterPalette.ts
        // WATER_BLEND): its colour (waterBlend), its opacity and its dull surface
        float bad = waterTint(cont);
        // how far this point is from the tile's shores (1 in open water): the refraction's reach and the clear water's
        // line along its shore (an editing aid)
        vec2 fr = fract(g);
        float shore = 1.0;
        if (bitOf(vFlags, 1.0) > 0.5) shore = min(shore, 1.0 - fr.x);
        if (bitOf(vFlags, 2.0) > 0.5) shore = min(shore, fr.x);
        if (bitOf(vFlags, 4.0) > 0.5) shore = min(shore, 1.0 - fr.y);
        if (bitOf(vFlags, 8.0) > 0.5) shore = min(shore, fr.y);
        if (n.y < 0.5) shore = 1.0;
        // the depth the water is coloured and seen through by, as the game reads it (viewDepth.ts, Q9 P3): on its top,
        // what the view sees under the surface down to the ground, so it falls to none at the foot of a bank facing the
        // camera, over about 0.7 tile a level at the game's 55°, and stays whole to a bank the view passes over. A side
        // of the water (a skirt between two tops, a fall's slope's side) reads it the same way from just inside its
        // column, as the game's skirt, drawn by the same program, reads the depth buffer behind it: a fall's side as dark
        // as its face. The section at the map's edge keeps its own (waterPalette.ts's waterBody and waterOpacity take it
        // as given, for the tests).
        float d = n.y < 0.5 && vFlags > 254.5 ? depth : waterViewDepth(n.y > 0.5 ? g : g - vec2(n.x, -n.z) * 0.002, vWorld.y, vFloor);
        // clean water: clear in the shallows (the bed shows through a light teal tint), a deep teal
        // body a level or so deep, navy where deep; badwater murky, the game's
        // crimson, lighter on a film and darker deeper by the game's _DepthGradients ramp (D496)
        float absorb = waterAbsorb(d);
        vec3 murky = badwaterGlow(badwaterBody(d), BADWATER_BODY, d, cont);
        vec3 body = cleanWaterBody(d, absorb);
        float bodyDepth = d;
        // water of any depth is water, clean or bad, as the game's: its see-through by the depth seen (waterPalette.ts
        // waterOpacity; no film, D154 as amended 2026-11-09)
        float alpha = cleanWaterAlpha(d);
        float foam = 0.0;
        // the gloss's slow variation, as the game's two panned samples of its gloss map (WATER_SURFACE.smoothness)
        float gloss = 0.5;
        // badwater's pattern the flow carries (Q9 P9: R its base colour's, G its emissive detail's; the light look, as the
        // game's Low quality, flat at its mean)
        vec2 bpat = BADWATER_PATTERN_FLAT;
        vec3 N = n;
        // (the normal the game's camera highlight takes: the surface's × its _NormalBoost, where N is the one its light
        // takes, unboosted: waterTextures.ts waterFlowNormal)
        vec3 Nh = n;
        // the surface the flow carries, as the game draws it (Q9 P5, P11; waterTextures.ts): two phases of its textures
        // riding each column's outflow, the albedo multiplying the colour and the ripples the surface's normal (on a
        // fall's slope, a top, sampled at the world's xz, so they stretch down it, as the game's); on the water's
        // side, the water's over its lip (half a tile back), so its detail runs on from the top's. Both looks draw
        // from this one sample. (The light look, as the game's Low quality, draws them flat: their mean.)
        vec4 surf = vec4(${f(Math.round((WATER_ALBEDO.flat[0] / 255) * 1e5) / 1e5)}, ${f(Math.round((WATER_ALBEDO.flat[1] / 255) * 1e5) / 1e5)}, 0.50196, 0.50196);
        vec2 pa = g;
        vec2 pb = g;
        float pw = 0.0;
        #if !LITE
          vec2 flow = waterFlow(n.y > 0.5 ? g : g - vec2(n.x, -n.z) * 0.5);
          #ifdef CAVES
            if (waterOwnFlow.a > 0.5) flow = waterFlowOf(waterOwnFlow.rg);
          #endif
          waterPhases(g, flow, t, pa, pb, pw);
          surf = waterSurfaceAt(pa, pb, pw);
          bpat = badwaterPatternAt(pa, pb, pw);
        #endif
        vec3 albedo = waterAlbedo(surf);
        if (n.y > 0.5) {
          #if !LITE
            N = waterFlowNormal(surf, cont, 1.0);
            Nh = waterFlowNormal(surf, cont, WATER_NORMAL_BOOST);
            gloss = (vnoise(g * 0.5 + vec2(t * 0.010, t * 0.007)) + vnoise(g * 0.37 - vec2(t * 0.008, t * 0.012))) * 0.5;
          #endif
          #if LITE
            // (the light look follows the game's Low quality: no ground behind the water)
            alpha = 1.0;
          #endif
          // no foam along the shore or over a brink, as the game draws none (its water shader has no foam)
        } else {
          // the water's side: a skirt between two tops, or a fall's slope's side over lower dry ground (a fall is the
          // slope of the water below it, drawn as a top, fallSlope.ts). The game's skirt is its top's mesh dropped,
          // drawn by the same program with the same up normal, so it is the surface going on: coloured and seen
          // through by the depth seen behind it (d, above), the waterfall mask's see-through where a fall lands; no
          // light or dark line marks it, no whitewater, no foam. At the map's edge, the water's section
          bool edge = vFlags > 254.5;
          float drop = edge ? 0.0 : vFlags / 30.0;
          if (!edge) {
            N *= 0.0;
            N.y = 1.0;
            Nh = N;
            #if !LITE
              N = waterFlowNormal(surf, cont, 1.0);
              Nh = waterFlowNormal(surf, cont, WATER_NORMAL_BOOST);
              gloss = (vnoise(g * 0.5 + vec2(t * 0.010, t * 0.007)) + vnoise(g * 0.37 - vec2(t * 0.008, t * 0.012))) * 0.5;
            #endif
            #if LITE
              // (the light look follows the game's Low quality: no ground behind the water)
              alpha = 1.0;
            #endif
          } else {
            // the section: the colour of the water at its shallowest, its detail the albedo the flow carries over its lip
            body = cleanWaterBody(0.05, waterAbsorb(0.05));
            bodyDepth = 0.05;
            // (partly bad: the game's glow of its shallowest, as the surface's)
            murky = badwaterGlow(badwaterBody(0.05), BADWATER_BODY, 0.05, cont);
          }
          alpha = edge ? mix(WATER_EDGE, BADWATER_SIDE, bad) : alpha * smoothstep(0.02, 0.06, drop);
          if (alpha < 0.01) discard;
        }
        foam = clamp(foam, 0.0, 1.0);
        float lit = sunLit(g, vWorld.y);
        vec3 light = skyColor * 1.2 + sunColor * 0.3 * max(dot(N, sunDir), 0.0) * lit;
        // clean water's colour × the albedo the flow carries: our calibrated colour × the albedo over its mean (its
        // variation alone, so the calibration to the game's screen holds), or the game's own formula (Q9 P4) × the
        // albedo, lit as the game lights it (its ambient probe by the normal and its sun: palette.ts GAME_LIGHT),
        // whichever the pixel judge found closer to the game's shots (waterPalette.ts GAME_WATER.use)
        #if WATER_FORMULA
          body = gameWaterFormula(bodyDepth, albedo, N, lit, light);
        #else
          body *= albedo / WATER_ALBEDO_MEAN;
        #endif
        // badwater the same way (Q9 P9): the game's contaminated colour (its base between near black and crimson by the
        // pattern's R, × its depth ramp's G, the shallow glow) lit as the game lights it, or our calibrated crimson × the
        // pattern's variation over its mean, whichever the pixel judge found closer to the game's frames in this look
        // (waterPalette.ts GAME_BADWATER.use.standard; High's surface takes its own, .high)
        #if BADWATER_FORMULA
          murky = gameBadwaterColour(bodyDepth, cont, bpat.x) * gameWaterLight(N, lit) / max(light, 0.001);
        #else
          murky *= badwaterPatternShade(bpat.x);
        #endif
        vec3 c = waterBlend(body, murky, cont);
        // (the game's albedo here and its diffuse light, which P13 puts on what shows behind the water: refraction.ts)
        behindLight = gameWaterLight(N, lit);
        behindAlbedo = c * light / max(behindLight, 0.001);
        // the game's own highlight on the ripples, added to the colour before its light (and again after it); none on
        // the map edge's section nor on a fall's slope and where it lands (the game's waterfall mask takes it off, Q9 P1 and P12, ps 814-862). Where
        // the look draws the game's light (waterPalette.ts WATER_LIGHT.game), in the game's sun colour and lit by the
        // game's light, as its albedo is
        #if WATER_GAME_LIGHT
          vec3 highlight = GAME_SUN_COLOUR * waterCameraHighlight(Nh, V, bad) * step(0.5, Nh.y) * (1.0 - waterFall);
          c *= light;
          c += highlight * gameWaterLight(N, lit);
        #else
          vec3 highlight = sunColor * waterCameraHighlight(Nh, V, bad) * step(0.5, Nh.y) * (1.0 - waterFall);
          c += highlight;
          c *= light;
        #endif
        // (the lit albedo with its highlight: what the game's see-through takes its share of, P13; the reflection, the
        // glint and the emission below go on top of the whole, unscaled: refraction.ts)
        behindBase = c;
        // the sky's reflection, stronger at low angles, and the sun's glint (no sparkle of our own: the game's water
        // shader has none, its sheen is the sun's specular at its smoothness, D496's rule); the water's side lit the
        // same way, as the game lights every pixel of its water
        // (the game's URP lighting at the water's smoothness, clean water's about 0.25 to badwater's 0.15: the sky
        // added on top, as URP's environment term)
        // (badwater's toward its own by the tint × the pattern's R, as the game's)
        float smoothness = mix(clamp(WATER_SMOOTHNESS + (gloss - 0.5) * WATER_SMOOTHNESS_SPREAD, 0.0, 1.0), BADWATER_SMOOTHNESS, bad * bpat.x);
        // (the game's, WATER_LIGHT.game: its probe by the reflected direction, the head-on part where WATER_LIGHT.held,
        // and the glint in its sun's colour)
        #if WATER_GAME_LIGHT
          c += waterEnvironment(N, V, smoothness, float(WATER_HELD));
        #else
          c += WATER_SKY * waterSkyReflect(dot(N, V), smoothness);
        #endif
        // (the highlight's emission: unlit, unshadowed)
        c += highlight;
        float spec = waterSunGlint(N, V, sunDir, smoothness) * lit;
        #if WATER_GAME_LIGHT
          c += GAME_SUN_COLOUR * spec;
        #else
          c += sunColor * spec;
        #endif
        // badwater's emissive detail (Q9 P9): the pattern's G, its glowing lines, unlit, carried by the flow (none on the
        // light look's flat surface but its mean)
        vec3 emission = gameBadwaterEmission(cont, bpat.y, g);
        c += emission;
        c = mix(c, mix(WATER_FOAM, BADWATER_FOAM, bad) * (0.8 + 0.2 * lit), foam);
        // (foam only ever makes the water more opaque: deep water and the light look stay opaque)
        if (n.y > 0.5) alpha = max(alpha, mix(alpha, 0.95, foam));
        // badwater as this look draws it, lit, with its glowing lines: what the clear water's veil keeps of it (below);
        // a look that draws its own badwater (High's hook) sets its own here
        vec3 clearBad = murky * light + emission;
${hook(h, "water")}        #ifdef CAVES
          // under a roof, the light of the air it stands in, as objects and falls there take it: the open air's sky
          // (D497), and the sun only where the volume's ray reaches
          if (cave.z > 0.5) {
            float ndlRoofed = max(dot(N, sunDir), 0.0);
            vec3 open = skyColor * 1.2 + sunColor * 0.3 * ndlRoofed * lit;
            vec3 under = skyColor * 1.2 + sunColor * 0.3 * ndlRoofed * sunMarchAt(inWater);
            c *= under / max(open, 0.001);
            behindLight *= under / max(open, 0.001);
            behindBase *= under / max(open, 0.001);
          }
        #endif
        // clear water (D196, D212; waterPalette.ts CLEAR_WATER): all of it with T, else under and
        // right round the brush while it paints a submerged bed, fading back over a tile or two.
        // Clean water keeps a faint blue tint over the bed, its ripples and a soft bright line along
        // its shore; badwater keeps its colour, murky and half see-through, with its glowing lines
        // (never a hatching: it reads by lightness, colour and texture, D324)
        // the water as the game draws it, fogged and graded; the editing aids after it, in their own channel (D497):
        // the clear water's veil (D196, D212), the selection, the sources' wells and the pointer's source's glow (D196),
        // a highlighted source (D249)
        float lookAlpha = alpha;
        // where the frame makes the copy of what is behind the water (refraction.ts, Q9 P13, P2), the game's composite,
        // opaque: the lit albedo with P13's share of the ground behind in place of its own, the reflection, the glint and
        // the emission on top, fogged and graded once; else the water alone, blended over the screen
        #if WATER_REFRACTS
          vec4 composite = waterComposite(c, g, vWorld, alpha, shore);
          c = composite.rgb;
          alpha = composite.a;
        #else
          c = finish(c, vWorld);
        #endif
        float clr = clearWater;
        if (clearAround.w > 0.5) clr = max(clr, 1.0 - smoothstep(clearAround.z, clearAround.z + CLEAR_FADE, length(g - clearAround.xy)));
        if (clr > 0.001) {
          float badish = max(bad, smoothstep(0.05, 0.5, cont));
          vec3 bc = clearBad;
          vec3 cc = c;
          // (by the water's own opacity, not the composite's)
          float ca = lookAlpha * mix(0.35, 0.7, badish);
          if (n.y > 0.5) {
            float line = 1.0 - smoothstep(0.0, CLEAR_SHORE_WIDTH, shore);
            cc = WATER_CLEAR_TINT * light;
            // (its ripples: the flow's light network catching the light, an editing aid's own channel)
            float ripple = smoothstep(0.35, 0.8, surf.r) * (1.0 - bad);
            cc = mix(cc, WATER_CLEAR_SHORE * light, ripple * CLEAR_RIPPLE_LIGHT);
            cc += WATER_SKY * waterSkyReflect(dot(N, V), WATER_SMOOTHNESS);
            cc += sunColor * waterSunGlint(N, V, sunDir, WATER_SMOOTHNESS) * lit;
            cc = mix(cc, WATER_FOAM * (0.8 + 0.2 * lit), foam * 0.6);
            cc = mix(cc, WATER_CLEAR_SHORE * (0.85 + 0.15 * lit), line);
            ca = min(0.9, CLEAR_OPACITY + CLEAR_RIPPLE * ripple + CLEAR_SHORE_OPACITY * line + 0.3 * foam);
            ca = mix(ca, CLEAR_BAD_OPACITY, badish);
          }
          c = mix(c, mix(cc, bc, badish), clr);
          alpha = mix(alpha, ca, clr);
        }
        if (n.y > 0.5) {
          vec4 o = texture2D(overlay, (floor(g) + 0.5) / mapSize);
          #ifdef CAVES
            o = overlayOnRun(o, floor(g), vWorld.y, 2.0);
          #endif
          float oa = o.a < 0.998 ? o.a : o.a * markers * float(LITE);
          c = mix(c, o.rgb, oa * 0.85);
          alpha = mix(alpha, 1.0, oa * 0.6);
          float footEdge = overlayEdge(g, o, max(max(fwidth(g.x), fwidth(g.y)), 0.002));
          c = mix(c, overlayEdgeColor(o), footEdge);
          alpha = mix(alpha, 1.0, footEdge);
          vec4 hatch = hatchAt(g, o.rgb);
          c = mix(c, hatch.rgb, hatch.a);
          alpha = mix(alpha, 1.0, hatch.a);
        }
        // the game's layers: water above the slice is cut away (a column sliced by it lies on it: the vertex shader)
        if (vWorld.y > slice + ${f(CUT_SLACK)}) discard;
        // every source wells up with Markers on (D249, D497: an editing aid in the information layer, never the
        // look; the game draws nothing over a plain source): rings spreading from it and a few bubbles, on the water
        // over it, so it is found even deep under water; with Markers off the water over it is the plain surface;
        // brighter while the pointer's water comes from it (the hover's own channel, with or without Markers)
        #if !LITE
        if (n.y > 0.5) {
          vec2 st = floor(g);
          float up = 0.0;
          float hl = 0.0;
          float badSrc = 0.0;
          for (int dy = -1; dy <= 1; dy++)
            for (int dx = -1; dx <= 1; dx++) {
              vec2 sq = st + vec2(float(dx), float(dy));
              vec4 sv = texture2D(sourceTex, (sq + 0.5) / mapSize);
              if (sv.r + sv.g < 0.5) continue;
              float d = length(g - sq - 0.5);
              if (markers > 0.5) {
                float ph = fract(time * 0.35 + (sq.x * 0.37 + sq.y * 0.61));
                float ph2 = fract(ph + 0.5);
                float ring = (1.0 - smoothstep(0.0, 0.07, abs(d - ph * 1.4))) * (1.0 - ph) + (1.0 - smoothstep(0.0, 0.07, abs(d - ph2 * 1.4))) * (1.0 - ph2);
                float bub = step(0.9, vnoise((g - sq) * 9.0 + vec2(0.0, -time * 1.6))) * (1.0 - smoothstep(0.08, 0.4, d));
                float here = max(ring * 0.8, bub) * (1.0 - smoothstep(1.1, 1.5, d));
                up = max(up, here);
                badSrc = max(badSrc, sv.g * here);
              }
              hl = max(hl, sv.b * (1.0 - smoothstep(0.25, 1.2, d)) * (0.55 + 0.45 * sin(time * 3.0)));
            }
          if (markers > 0.5) {
            vec3 uc = mix(WATER_FOAM, BADWATER_FOAM, step(0.01, badSrc));
            c = mix(c, uc, up * 0.55);
            alpha = max(alpha, mix(alpha, 0.85, up * 0.5));
          }
          c = mix(c, WATER_SOURCE_GLOW, hl * 0.45);
          alpha = max(alpha, mix(alpha, 0.9, hl * 0.4));
        }
        #endif
        // a highlighted source reads under its own water too (D249; Kyler, 2026-10-03: a settled source
        // usually sits under its water): the water over its basin, a clean one's tile or a bad one's
        // three by three, turns the same clear red its model does
        if (sourceLit > 0.5 && n.y > 0.5) {
          vec2 st = floor(g);
          float lit = 0.0;
          for (int dy = -1; dy <= 1; dy++)
            for (int dx = -1; dx <= 1; dx++) {
              vec2 sq = st + vec2(float(dx), float(dy));
              vec4 sv = texture2D(sourceTex, (sq + 0.5) / mapSize);
              if (sv.a < 0.5) continue;
              vec2 q = abs(g - sq - 0.5);
              float reach = sv.g > 0.5 ? 1.5 : 0.5;
              lit = max(lit, 1.0 - smoothstep(reach - 0.06, reach + 0.04, max(q.x, q.y)));
            }
          c = mix(c, WATER_SOURCE_LIT, lit * 0.9);
          alpha = max(alpha, mix(alpha, 0.97, lit * 0.9));
        }
        gl_FragColor = bloomSource > 0.5 ? vec4(gpSource, lookAlpha) : vec4(c, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
  });
}

/** The sky round the map, drawn behind everything, as the game draws its skybox (palette.ts GAME_SKY): the day's colour
 *  by the view's height, and its clouds in a band round the horizon in the sun's colour; no fog (Unity's skybox takes
 *  none), and the post chain like the rest of the frame. */
export function skyMaterial(h?: ShaderHooks): ShaderMaterial {
  const C = GAME_SKY.clouds;
  const n = GAME_SKY.day.length;
  const sw = C.shapeWeights.reduce((a, b) => a + b, 0);
  const dw = C.detailWeights.reduce((a, b) => a + b, 0);
  const oct = (o: number, k: number, scale: readonly number[], w: number, sum: number) => `${f(w / sum)} * (0.52 + (vn3(p${scale === C.shapeScale ? "s" : "d"} * ${f(o)} + ${f(k * 17.31 + 0.37)}) - 0.5) * ${f(C.spread)})`;
  return new ShaderMaterial({
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vec4 v = inverse(projectionMatrix) * vec4(position.xy, 1.0, 1.0);
        vDir = transpose(mat3(viewMatrix)) * (v.xyz / v.w);
        gl_Position = vec4(position.xy, 0.9999, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vDir;${GAME_POST_GLSL}${hook(h, "decl")}
      const vec3 SKY_DAY[${n}] = vec3[${n}](${GAME_SKY.day.map((c) => glColor(c as unknown as Rgb)).join(", ")});
      float h3(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
      /** Value noise in 3D, one cell per unit of p. */
      float vn3(vec3 p) {
        vec3 i = floor(p);
        vec3 t = fract(p);
        t = t * t * (3.0 - 2.0 * t);
        return mix(mix(mix(h3(i), h3(i + vec3(1.0, 0.0, 0.0)), t.x), mix(h3(i + vec3(0.0, 1.0, 0.0)), h3(i + vec3(1.0, 1.0, 0.0)), t.x), t.y),
                   mix(mix(h3(i + vec3(0.0, 0.0, 1.0)), h3(i + vec3(1.0, 0.0, 1.0)), t.x), mix(h3(i + vec3(0.0, 1.0, 1.0)), h3(i + vec3(1.0, 1.0, 1.0)), t.x), t.y), t.z);
      }
      void main() {
        vec3 d = normalize(vDir);
        // the view's height, 0 straight down to 1 straight up, as the game's strip is read
        float e = asin(clamp(d.y, -1.0, 1.0)) / 3.14159265 + 0.5;
        float u = e * ${f(n - 1)};
        int k = int(min(floor(u), ${f(n - 2)}));
        vec3 c = mix(SKY_DAY[k], SKY_DAY[k + 1], u - float(k));
        // the clouds: the shape less its erosion by the detail, within the band round the horizon, in the sun's colour
        float band = smoothstep(${f(C.start[0])}, ${f(C.start[1])}, e) * (1.0 - smoothstep(${f(C.end[0])}, ${f(C.end[1])}, e));
        if (band > 0.0) {
          vec3 ps = d * vec3(${C.shapeScale.map(f).join(", ")});
          vec3 pd = d * vec3(${C.detailScale.map(f).join(", ")});
          float shape = ${C.shapeOctaves.map((o, k) => oct(o, k, C.shapeScale, C.shapeWeights[k], sw)).join(" + ")};
          float detail = ${C.detailOctaves.map((o, k) => oct(o, k + 4, C.detailScale, C.detailWeights[k], dw)).join(" + ")};
          float cloud = clamp(shape + ${f(C.densityOffset)}, 0.0, 1.0) - (1.0 - detail) * pow(1.0 - shape, ${f(C.erosion)});
          cloud = clamp(pow(max(cloud, 0.0), ${f(C.densityPower)}) * ${f(C.blending)}, 0.0, 1.0) * band;
          c += cloud * ${glColor(GAME_LIGHT.sun)};
        }
        // (the game's post chain grades the whole frame, the sky too)
        gl_FragColor = vec4(bloomSource > 0.5 ? c : gamePost(c), 1.0);
      }
    `,
    uniforms: { bloomSource: BLOOM_SOURCE },
    depthTest: false,
    depthWrite: false,
  });
}

/** Where a model's parts for close up give way to its parts for afar (`lod`, entities3d.ts): at this
 *  many pixels a unit of the model takes on screen (a ruin's storey from afar is a lattice of open
 *  cells in the near skeleton's own colour, D305, not a solid painted block). */
export const RUIN_NEAR_PX = 9;

/** The far ruin block's lattice (D305): cells this many to a world unit, on whichever two axes
 *  aren't the face's normal (so it reads consistently on every face, without UVs). */
export const RUIN_LATTICE_SCALE = 3.2;
/** The share of a lattice cell's width its struts take, on each axis (the cells' middles take (1 − this)²). */
export const RUIN_LATTICE_STRUT = 0.28;
/** A far ruin's cells show the column's inside: the skeleton's back faces, braces and sacks in its own shade,
 *  this dark, covering this much of what lies behind (the near skeleton seen from afar lets little through). */
export const RUIN_INSIDE_SHADE = 0.68;
export const RUIN_INSIDE_COVER = 0.75;

/** Instanced objects: each vertex's own colour times the instance's tint, lit like the terrain,
 *  darker toward the model's foot, and in the terrain's shadow where it stands in one. An
 *  instance with a minimum size (`grow`: pixels a unit of the model must take at least, how far
 *  it rises for each time it grows, and the most it grows) is drawn larger when it would be
 *  smaller. A vertex's `lod` says which view its part belongs to: 0 any, 1 close up (a unit of the
 *  model takes RUIN_NEAR_PX pixels or more), 2 from afar, 3 from afar as a lattice (a far ruin
 *  block's frame); the others are dropped (the light look draws every part it has: its models have
 *  none for afar). The lattice is filtered to the pixel: each pixel takes the share of it the struts
 *  cover (box-filtered over the pixel's footprint, as a mipmap would) as alpha to coverage, so a far
 *  ruin never breaks into noise however small its cells are on screen; it settles to an even veil of
 *  its colour (D305, D334; the game's ruins are one textured model whatever the distance, its
 *  textures mipmapped). */
export function objectMaterial(scene: SceneUniforms, lite = false, h?: ShaderHooks): ShaderMaterial {
  return new ShaderMaterial({
    alphaToCoverage: !lite,
    defines: { LITE: lite ? 1 : 0 },
    uniforms: scene as unknown as Record<string, { value: unknown }>,
    vertexShader: /* glsl */ `
      attribute vec3 pcolor;
      attribute vec3 grow;
      attribute float lod;
      #if LITE
        // (the light look's batches are baked into one mesh: each vertex carries its object's place)
        attribute vec2 origin;
      #endif
      uniform float viewHeight;
      uniform float markers;
      uniform vec3 aidTint;
      uniform vec3 sourceTint;${OBJECT_FADE_GLSL}${hook(h, "objectVertexDecl")}
      varying vec3 vAid;
      varying vec3 vColor;
      varying float vFade;
      varying vec3 vNormal;
      varying vec3 vWorld;
      varying float vFoot;
      varying float vLod;
      void main() {
        mat4 m = modelMatrix * instanceMatrix;
        vLod = lod;
        // seeing the land behind objects (objectFade.ts): the whole object by its place, in tiles (never the land's own
        // shape)
        vFade = 1.0;
        if (objectFade.w > 0.5 || objectHide > 0.5) {
          #if LITE
            vec3 at = (modelMatrix * vec4(origin.x, 0.0, origin.y, 1.0)).xyz;
          #else
            vec3 at = m[3].xyz;
          #endif
          vFade = objectShowsAt(vec2(at.x, -at.z), grow);
        }
${hook(h, "objectVertex")}        vNormal = normalize(mat3(m) * ${hook(h, "objectNormal", "normal")});
        vColor = ${hook(h, "objectColor", "pcolor")};
        vAid = vec3(1.0);
        #ifdef USE_INSTANCING_COLOR
          // (an object an editing aid tints comes negative, less 10 times its tint's index (materials.ts AID_TINT), and
          // takes that tint after the grade: renderer.ts highlightObjects, setGhost)
          vec3 ic = instanceColor;
          if (ic.r < 0.0) {
            float k = floor(-ic.r / 10.0);
            ic = -ic - 10.0 * k;
            vAid = k < 0.5 ? aidTint : k < 1.5 ? sourceTint : k < 2.5 ? ${glColor(AID_TINT.fits)} : k < 3.5 ? ${glColor(AID_TINT.warns)} : k < 4.5 ? ${glColor(AID_TINT.refused)} : k < 5.5 ? ${glColor(AID_TINT.waterGlow)} : ${glColor(AID_TINT.badwaterGlow)};
          }
          vColor *= ic;
        #endif
        vFoot = position.y;
        vec3 p = ${hook(h, "objectPosition", "position")};
        #if !LITE
        if (lod > 0.5 || (grow.x > 0.0 && markers > 0.5)) {
          vec4 o = projectionMatrix * viewMatrix * m * vec4(0.0, 0.0, 0.0, 1.0);
          float perUnit = 0.5 * viewHeight * projectionMatrix[1][1] / max(o.w, 0.001);
          // a part for the other view: out of the clip volume (dropped)
          if (lod > 0.5 && (lod < 1.5) != (perUnit >= ${f(RUIN_NEAR_PX)})) {
            vWorld = vec3(0.0);
            gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
            return;
          }
          if (grow.x > 0.0 && markers > 0.5) {
            float k = clamp(grow.x / perUnit, 1.0, abs(grow.z)); // (negative for an editing aid: objectFade.ts)
            p = p * k + vec3(0.0, grow.y * (k - 1.0), 0.0);
          }
        }
        #endif
        vec4 w = m * vec4(p, 1.0);
        vWorld = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vColor;
      varying vec3 vAid;
      varying vec3 vNormal;
      varying vec3 vWorld;
      varying float vFoot;
      varying float vLod;
      varying float vFade;
      uniform vec4 objectFade;
      ${common(h)}${CAVE_POINT}${DITHER_GLSL}
      void main() {
        ${SUN_PX_GLSL}
        // the game's layers: what stands above the slice is cut away
        if (vWorld.y > slice + 0.02) discard;
        // hidden, or faded round the pointer where it is drawn by a dither (objectFade.ts)
        if (vFade <= 0.0 || (vFade < 1.0 && objectFade.w > 1.5 && vFade <= ditherAt(gl_FragCoord.xy))) discard;
        // (the bloom's source has no coverage to fade by: a faded object there by the dither, as much of it as shows)
        if (bloomSource > 0.5 && vFade < 1.0 && vFade <= ditherAt(gl_FragCoord.xy)) discard;
        // a ruin's far block's frame (D305): a lattice of open cells so it reads as a framework, not a
        // solid box, from any face (the two world axes across the face, whichever the normal isn't
        // closest to; no extra geometry or UVs), filtered to the pixel: the struts' share of the
        // pixel's footprint on each axis (the integral of the strut pulses over it), as coverage
        // (its cells are a few pixels at most wherever it is drawn: thresholded, they broke into
        // orange noise). (The derivatives before any branch.)
        float coverage = 1.0;
        float inside = 1.0;
        #if !LITE
        vec3 an = abs(normalize(vNormal));
        vec2 cells = (an.x >= an.y && an.x >= an.z ? vWorld.yz : (an.y >= an.z ? vWorld.xz : vWorld.xy)) * ${f(RUIN_LATTICE_SCALE)};
        vec2 foot = max(fwidth(cells), vec2(1e-3));
        if (vLod > 2.5) {
          vec2 hi = cells + 0.5 * foot;
          vec2 lo = cells - 0.5 * foot;
          vec2 struts = (floor(hi) * ${f(RUIN_LATTICE_STRUT)} + min(fract(hi), vec2(${f(RUIN_LATTICE_STRUT)})) - floor(lo) * ${f(RUIN_LATTICE_STRUT)} - min(fract(lo), vec2(${f(RUIN_LATTICE_STRUT)}))) / foot;
          float strut = 1.0 - (1.0 - clamp(struts.x, 0.0, 1.0)) * (1.0 - clamp(struts.y, 0.0, 1.0));
          // a cell shows the column's inside, darker and letting a little through
          coverage = strut + (1.0 - strut) * ${f(RUIN_INSIDE_COVER)};
          inside = mix(${f(RUIN_INSIDE_SHADE)}, 1.0, strut / coverage);
        }
        #endif
        vec3 n = normalize(vNormal);
        float ao = mix(0.72, 1.0, smoothstep(0.0, 0.45, vFoot));
        float lit = sunLit(vec2(vWorld.x, -vWorld.z), vWorld.y);
        // soft (wrapped) sun light, kinder to leaves
        float ndl = clamp(${hook(h, "objectSun", "dot(n, sunDir) * 0.75 + 0.25")}, 0.0, 1.0);
        vec3 light = skyColor * 1.15 * (0.8 + 0.2 * n.y) * ao + sunColor * 0.5 * ndl * lit;
        #ifdef CAVES
          // under a roof (a tree, a ruin, a source, a slope in a cave or under an overhang): the open air's sky (D497),
          // and the sun only where it reaches
          vec3 cave = caveAirAt(vWorld + n * 0.05);
          if (cave.z > 0.5) light = skyColor * 1.15 * (0.8 + 0.2 * n.y) * ao + sunColor * 0.5 * ndl * ${hook(h, "roofedSun", "sunMarchAt(vWorld)")};
        #endif
        // (faded round the pointer, as coverage: that share of the pixel's samples)
        if (objectFade.w > 0.5 && objectFade.w < 1.5) coverage *= vFade;
        // (the object as the game draws it, fogged and graded; a highlight, an editing aid, tints it after: D497)
        vec3 graded = finish((${hook(h, "objectFinal", "vColor * light")}) * inside, vWorld);
        gl_FragColor = bloomSource > 0.5 ? vec4(gpSource, coverage) : vec4(min(graded * vAid, 1.0), coverage);
      }
    `,
  });
}
