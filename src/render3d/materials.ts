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
//   over either, red-orange veins that grow denser and brighter with it (dry earth's own cracks
//   glow orange, dark red veins run through grass); a dark bed under water; or by height, with the
//   toggle. Soil blends between tiles of one height, never over a cliff, and every tile's middle
//   shows its own soil.
// - Walls are cobbled stone tinted by height as the game's cliffs (D497), and with Markers a pale
//   ledge over a dark groove between levels, at least a pixel wide at any zoom, so levels can be
//   counted; a lip of the top's ground.
// - Water is light teal where shallow (a little of the ground behind showing) and blue where deep, lighter
//   than dry ground at any depth, with glints and pale ripples that move, no foam. Falls are the water's own
//   vertical faces where it steps down, as the game draws them (D201 amended 2026-10-29): the water's
//   colour with its texture running down, nearly opaque, no whitewater.
//   Badwater is darker than clean water of the same depth and duller, with the same ripples and
//   slow glowing bubbles. Water partly bad turns from clean water to badwater with its badwater
//   share, blended over a few tiles by the water mesh: it darkens in proportion, and its hue turns
//   early from teal through a teal-grey and a warm brown to crimson, never purple, so where they meet the colour changes in a soft gradient, never in streaks or
//   patches, and a mixed river reads as poisoned; the dull surface and the bubbles come in with
//   it. Every water colour and the water's opacity come from waterPalette.ts (`WATER_GLSL`, D177).
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
import { ALTITUDE_RAMP, BLEND, CONTAMINATION as CT, CONTAMINATION_OUTLINE as OUTLINE, CUT_CAP, DESERT, GAME_AMBIENT_SH, GAME_ENV, gameAmbient, GAME_FINISH, GAME_LIGHT, GROUND, HATCH, HEIGHT_RAMP, JUICE, LIGHT, MINE, SKY, WALL, WATER_SURFACE as WS, type Rgb } from "./palette";
import { WATER_GLSL } from "./waterPalette";
import { SHADOW_OFFSET, SHADOW_RES, SHADOW_SCALE, WATER_BYTE_FINE, WATER_BYTE_STEPS, type TileSpan } from "./light";
import { LIGHT_LEVELS, type CaveLight } from "./caveLight";
import { CUT_SLACK } from "./cutWater";
import { RUN_LEVELS, type RunSoil } from "./runSoil";

const az = LIGHT.sunAzimuth;
const ce = Math.cos(LIGHT.sunElevation);
/** Toward the sun, in world space (X east, Y up, Z south). */
export const SUN = new Vector3(az[0] * ce, Math.sin(LIGHT.sunElevation), -az[1] * ce).normalize();

const color = (c: Rgb) => new Color(c[0], c[1], c[2]);

/** Uniforms every material shares: one object per value, so a change reaches them all. */
export interface SceneUniforms {
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
   *  current as drawn (128 still), B the badwater share; the moving water reads it in both looks. */
  flowTex: { value: DataTexture };
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
  /** The current and rough water of the water below each tile's surface water (caveCurrent.ts): RGBA a cell from level
   *  `caveFlowLevels.x`, `caveFlowLevels.y` levels (0: none, the flow texture everywhere), read only where the water's
   *  `CAVES` branch is compiled. */
  caveFlowTex: { value: Data3DTexture };
  caveFlowLevels: { value: Vector2 };
  /** The overlay on one run per tile (overlayRuns.ts: a selection taken on a cave's floor), RGBA a tile; read only on a
   *  map with terrain above terrain (the terrain's `CUTAWAY`, the water's `CAVES`), the placeholder elsewhere. */
  overlayRuns: { value: DataTexture };
  /** What the rest of such a tile's column takes instead of its overlay (the land outside the selection), 0–1. */
  overlayRest: { value: Vector4 };
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
    caveTex: { value: noCave },
    caveSize: { value: new Vector3(0, 0, 0) },
    caveTop: { value: 0 },
    runTex: { value: noCave },
    caveFlowTex: { value: noCaveCurrent() },
    caveFlowLevels: { value: new Vector2(0, 0) },
    overlayRuns: { value: overlayTexture(1, 1) },
    overlayRest: { value: new Vector4(0, 0, 0, 0) },
  };
}

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

/** A flow texture with no current (until a map's arrives). */
function stillFlow(): DataTexture {
  const t = new DataTexture(new Uint8Array([128, 128, 0, 255]), 1, 1, RGBAFormat, UnsignedByteType);
  t.needsUpdate = true;
  return t;
}

const f = (v: number) => (Number.isInteger(v) ? `${v}.0` : String(v));
const glColor = (c: Rgb) => `vec3(${c.map((v) => f(Math.round(v * 1000) / 1000)).join(", ")})`;
/** A colour or coefficients to six places (the ambient's SH, which can be small or negative). */
const glColor3 = (c: Rgb) => `vec3(${c.map((v) => f(Math.round(v * 1e6) / 1e6)).join(", ")})`;

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
  /** Where grass meets earth, and where contamination ends (expressions). */
  moist?: string;
  bad?: string;
  /** After the ground's colour, before contamination is layered over it (c, g). */
  groundVariation?: string;
  /** Before groundColor returns (c: its colour with contamination; glow). */
  groundEnd?: string;
  /** After the ground's colour at a top (ground, soil, glow, d0, g). */
  groundTop?: string;
  /** The crimson the ground takes under a badwater film (a vec3; waterPalette.ts WATER_FILM). */
  filmBad?: string;
  /** The badwater share of the water over ground point g (a float; the flow texture's blue). High reads its own flow
   *  texture, the same texture: a second sampler of it would take High's terrain past the 16 a fragment shader is sure
   *  to have (WebGL 2's least, ANGLE's on Direct3D 11) on a map with terrain above terrain, and it would not link. */
  filmShare?: string;
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
  /** True (an expression) where `water` draws the surface itself: the Standard surface's textures are then
   *  drawn once where they are, not carried by the current twice over (D353; the High look's own water). */
  waterOwnSurface?: string;
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
   *  and `lit`, the look's own sun shadow there; Standard: the volume's sun). */
  roofedSun?: string;
  // the sky
  /** At the sky's end (c, d). */
  sky?: string;
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
 *  its own column's current and rough water from the cave current's volume (caveCurrent.ts), at the level it stands
 *  in, filtered across tiles at that level. `waterOwnFlow` holds it for the fragment (RG the current as the flow
 *  texture packs it, B the rough water, A 1), A 0 where the flow texture stands (each tile's surface water). */
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
  /** How lit a point at height z above tile position g is (the baked sun shadow, soft). */
  float ${h?.sunLit ? "bakedSunLit" : "sunLit"}(vec2 g, float z) {
    #if LITE
      return 1.0;
    #endif
    vec4 s = texture2D(lightTex, g / mapSize);
    float hi = s.r * ${f(255 / SHADOW_SCALE)} - ${f(SHADOW_OFFSET)};
    float lo = s.g * ${f(255 / SHADOW_SCALE)} - ${f(SHADOW_OFFSET)};
    return clamp((z - hi) / max(0.05, lo - hi), 0.0, 1.0);
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
   *  chain; with the light a surface gives off itself (an eruption's lava, as URP's emission) added after the fog, which
   *  never washes it out, before the post chain. Editing aids go on after it all (D497: their own channel). */
  vec3 finishLit(vec3 c, vec3 emission, vec3 world) {
    float depth = max(-(viewMatrix * vec4(world, 1.0)).z - fogNear - fogShift, 0.0);
    c = mix(hazeColor, c, exp2(-fogDensity * depth));
    return gamePost(c + emission);
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
  vec3 gpCurve(vec3 x) { return (x * (0.2 * x + 0.24 * 0.29) + 0.272 * 0.02) / (x * (0.2 * x + 0.29) + 0.272 * 0.3) - 0.02 / 0.3; }
  vec3 gpLogC(vec3 x) { return mix(5.301883 * x + 0.092819, 0.244161 * log2(max(5.555556 * x + 0.047996, 1e-6)) * 0.30103 + 0.386036, step(vec3(0.011361), x)); }
  vec3 gpFromLogC(vec3 x) { return mix((x - 0.092819) / 5.301883, (pow(vec3(10.0), (x - 0.386036) / 0.244161) - 0.047996) / 5.555556, step(vec3(5.301883 * 0.011361 + 0.092819), x)); }
  vec3 gamePost(vec3 display) {
    vec3 d = max(display, vec3(0.0));
    vec3 c = mix(d / 12.92, pow((d + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), d)) * ${f(Math.round(2 ** GAME_FINISH.postExposure * 1e6) / 1e6)};
    float white = 1.0 / gpCurve(vec3(5.3)).x;
    c = clamp(gpCurve(c * white) * white, 0.0, 1.0);
    c = clamp(gpFromLogC((gpLogC(c) - 0.4135884) * ${f(GAME_FINISH.contrast)} + 0.4135884), 0.0, 1.0);
    float l = dot(c, vec3(0.2126729, 0.7151522, 0.072175));
    c = clamp(vec3(l) + ${f(GAME_FINISH.saturation)} * (c - vec3(l)), 0.0, 1.0);
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
      /** The sun on a point under a roof: a ray marched toward the sun through the voxels (open air and
       *  roofed air alike, so it passes under an overhang as the light does); rock stops it, and once it is
       *  over the map's highest ground (kept as edits raise it) the baked shadow there decides (the objects' shadows); a ray still
       *  among the land after its run takes the volume's own sun. */
      float caveSunMarch(vec3 world, vec3 n, float fallback) {
        vec3 dir = vec3(sunDir.x, -sunDir.z, sunDir.y);
        vec3 q = vec3(world.x, -world.z, world.y) + vec3(n.x, -n.z, n.y) * 0.02;
        float clear = min(caveTop, caveSize.z);
        for (int k = 0; k < 80; k++) {
          q += dir * 0.3;
          if (q.x < 0.0 || q.y < 0.0 || q.x >= caveSize.x || q.y >= caveSize.y) return 1.0;
          if (q.z >= clear) return sunLit(q.xy, q.z);
          vec3 cell = floor(q);
          if (cell.z < heightOf(tileAt(cell.xy)) && texelFetch(caveTex, ivec3(cell), 0).r < 0.001) return 0.0;
        }
        return fallback;
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
          float inside = ${hook(h, "caveSun", "caveSunMarch(vWorld, n, cave.y)")};
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
      /** moisture level (0–15), contamination (0–15), under water (0/1), sky (0–1). Under water only where the water's
       *  surface is drawn (cutWater.ts bedAtCut): a layer cut takes away the water standing above it, and a top whose water
       *  it took whole (the top at the cut or above it) is then a top like any other, not a bed seen through water; under
       *  a top below the cut the water is drawn up to the cut over it, a bed. */
      vec4 soilOf(vec4 d) {
        float g = floor(d.g * 255.0 + 0.5);
        float m = floor(g / 16.0);
        bool drawn = waterSurfaceOf(d) <= slice + ${f(CUT_SLACK)} || heightOf(d) < slice;
        return vec4(m, g - m * 16.0, d.a > 0.002 && drawn ? 1.0 : 0.0, d.b);
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
      /** How much of the bed's own colour the ground under water takes (groundColor): 1 under water past
       *  a sliver's depth, less under a sliver at a shore's edge, whose ground keeps its own soil, seen through
       *  the water's coloured filter (waterPalette.ts WATER_FILM, waterFilmGround). Set round a top's
       *  groundColor; 1 everywhere else. */
      float groundBed = 1.0;
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
        /** The soil of the ground at level z of tile t as soilOf gives it (no sky), and in \`here\` whether there is
         *  ground there to blend toward: a run top below the tile's top, or the tile's own top. */
        vec4 groundAt(vec2 t, float z, out float here) {
          vec2 r = runAt(t, z);
          here = 1.0;
          if (r.y > 0.5) {
            float m = floor(r.x / 16.0);
            return vec4(m, r.x - m * 16.0, r.y > 1.5 ? 1.0 : 0.0, 0.0);
          }
          vec4 d = tileAt(t);
          if (t.x >= 0.0 && t.y >= 0.0 && t.x < mapSize.x && t.y < mapSize.y && heightOf(d) == z) return soilOf(d);
          here = 0.0;
          return vec4(0.0);
        }
      #endif
      vec3 heightColor(float z) {
        float t = clamp((z - heightRange.x) / max(1.0, heightRange.y - heightRange.x), 0.0, 1.0);
        return mix(${glColor(HEIGHT_RAMP.low)}, ${glColor(HEIGHT_RAMP.high)}, t);
      }
      /** How much of the ground at tile point g is the game's desert (TerrainURP's ForwardLit program, read from its
       *  DXBC): four taps \`BLEND_MARGIN\` round the point, each the desert of the tile it falls in (\`desert\`: this tile,
       *  the neighbour toward the nearest corner across x, across y, and the diagonal; a tile whose top is at another
       *  level counts as desert, as the game's map holds 1 there), weighted by how far the tap lies from the nearest
       *  tile corner (|dx| × |dz|); then the game's noise (here our own, the game's being a texture at world × 0.2) and its
       *  softness: saturate((f + 0.96 (n − 0.5) − 0.5) × 5.8 + 0.5). So a tile's share shows as patches of grass and
       *  earth, and the change between tiles is a noisy blend a fifth of a tile wide. */
      float desertBlend(vec2 g, vec4 desert) {
        vec2 corner = floor(g + 0.5);
        vec2 tile = floor(g);
        float sum = 0.0;
        float weight = 0.0;
        for (int k = 0; k < 4; k++) {
          vec2 q = g + ${f(BLEND.margin)} * vec2(k == 0 || k == 2 ? -1.0 : 1.0, k < 2 ? -1.0 : 1.0);
          vec2 off = floor(q) - tile;
          float dsr = off.x != 0.0 ? (off.y != 0.0 ? desert.w : desert.y) : (off.y != 0.0 ? desert.z : desert.x);
          float wq = abs(q.x - corner.x) * abs(q.y - corner.y);
          sum += wq * dsr;
          weight += wq;
        }
        float n = 0.5 + 0.6 * (0.62 * vnoise(g * 0.8 + vec2(3.1, 11.7)) + 0.38 * vnoise(g * 2.1 + vec2(17.3, 5.9)) - 0.5);
        return clamp((sum / max(weight, 1e-4) + ${f(BLEND.noise)} * (n - 0.5) - 0.5) * ${f(BLEND.softness)} + 0.5, 0.0, 1.0);
      }
      /** Contamination's veins at field point q and contamination level lvl (0–1), as in the game
       *  (D334): sparse, irregular orange-red fissures, the edges of a coarse jittered cell field
       *  (about a tile and a half across), some edges dropped, the kept ones thick main cracks or
       *  thinner branches. Returns the stroke (x) and its narrower glowing core (y), antialiased;
       *  none at zero contamination. World-anchored, so the veins never reseed as the level changes.
       *  (Kyler tunes the few junctions that widen abruptly on real maps: the two smoothsteps on
       *  importance set which edges are kept and how wide.) The field's point q (veinPoint) and the
       *  antialiasing width aa (veinAA) come from the caller, worked out before its branch on the soil:
       *  derivatives (fwidth, a mipmapped pattern's level) need every pixel of a quad, and a pixel that
       *  skips the branch would leave its neighbours an undefined value, a vein's edge that changes from
       *  frame to frame. */
      vec2 veinPoint(vec2 p) {
        return p * 0.67 + vec2(vnoise(p * 2.7 + 5.0), vnoise(p * 3.1 + 23.0)) * 0.15;
      }
      float veinAA(vec2 q) {
        return max(0.001, max(fwidth(q.x), fwidth(q.y)) * 0.55);
      }
      vec2 veinsOf(vec2 q, float aa, float lvl) {
        vec2 cell = floor(q), f = fract(q);
        float first = 9.0, second = 9.0, id1 = 0.0, id2 = 0.0;
        for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
          vec2 off = vec2(float(x), float(y)), id = cell + off;
          vec2 rnd = fract(sin(vec2(dot(id, vec2(127.1, 311.7)), dot(id, vec2(269.5, 183.3)))) * 43758.5453);
          float tag = fract(sin(dot(id, vec2(91.7, 37.1))) * 17213.371);
          float d = length(off + 0.10 + rnd * 0.80 - f);
          if (d < first) { second = first; id2 = id1; first = d; id1 = tag; }
          else if (d < second) { second = d; id2 = tag; }
        }
        // (the two cells either side of an edge agree on its importance: dropping edges opens the
        // net, and the main cracks and thinner branches kept meet at the same junctions)
        float importance = fract(sin((id1 + id2) * 173.71) * 31741.13);
        float present = smoothstep(0.42, 0.47, importance);
        float width = mix(${f(CT.width[0])}, ${f(CT.width[1])}, smoothstep(0.54, 0.84, importance)) * mix(${f(CT.widthByLevel[0])}, ${f(CT.widthByLevel[1])}, lvl);
        float distance = (second - first) * 0.5;
        float rim = 1.0 - smoothstep(width, width + aa, distance);
        float core = 1.0 - smoothstep(width * 0.14, width * 0.48 + aa, distance);
        return vec2(rim, core) * present * smoothstep(0.0, ${f(CT.onset)}, lvl);
      }
      /** The last groundColor's ground and glow as they are with no water on it (its soil's under-water flag clear). */
      vec3 groundDry;
      float groundDryGlow;
      /** The ground's colour from its soil (moist, moisture level, contaminated, under water) and
       *  its contamination level (0–1), and in glow the light of the contamination's veins; groundDry, the same
       *  without the water. */
      vec3 groundColor(vec4 s, vec2 g, float detail, float clev, out float glow) {
        #if LITE
          // (no patterns: contamination tints the ground a little, rust on earth, dark red on grass)
          glow = 0.0;
          // (the game's ground: the grass's colour and ramp blended into the desert's by the tile's grass share)
          vec3 lc = mix(${glColor(GROUND.dry)} * altitudeOf(vWorld.y, 0.0), mix(${glColor(GROUND.moistLow)}, ${glColor(GROUND.moistHigh)}, clamp((s.y - 1.0) / 9.0, 0.0, 1.0)) * altitudeOf(vWorld.y, 1.0), s.x);
          if (s.z > 0.5) lc = mix(lc, mix(${glColor(GROUND.contaminated)}, ${glColor(GROUND.contaminatedWet)}, s.x), 0.25 + 0.3 * clev);
          return mix(lc, ${glColor(GROUND.underwater)}, step(0.5, s.w) * groundBed);
        #endif
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
        // grass meets the earth along the tile's edge
        // (a slight wobble along the tile's edge only: the soil itself changes there, not in ragged patches)
        float edge = ((n1 - 0.5) * 0.5 + (n2 - 0.5) * 0.45 + (b3 - 0.5) * 0.4) * 0.22;
        // (the grass's share of the point: s.x, the game's per tile, blended across the narrow band at the tile's edge)
        float moist = ${hook(h, "moist", "clamp(s.x, 0.0, 1.0)")};
        float bad = ${hook(h, "bad", "smoothstep(0.4, 0.6, s.z + edge * 0.6)")};
        float wet = smoothstep(0.4, 0.6, s.w + (n1 - 0.5) * 0.2);
        // (under a film the ground keeps its own soil, seen through the film's filter in main: WATER_FILM)
        float bed = wet * groundBed;
        // dry: cracked earth, warm brown, drifting in broad patches to a cooler mauve and a warmer
        // tan and in lightness (D334); each plate its own shade, the cracks a fine, dark network
        vec3 c = mix(${glColor(GROUND.dryCool)}, ${glColor(GROUND.dry)}, smoothstep(0.28, 0.68, b1));
        c = mix(c, ${glColor(GROUND.dryWarm)}, smoothstep(0.32, 0.72, b2) * 0.85);
        c *= (0.97 + 0.16 * (b3 - 0.5) + 0.08 * (n1 - 0.5)) * (0.96 + 0.22 * (dry.y - 0.5) + detail * 0.20 * n3);
        c = mix(c, ${glColor(GROUND.crack)}, dry.x * (0.58 + 0.20 * detail));
        // moist: grass, a muted green, deeper by the water, in lighter and deeper patches and darker
        // blotches; up close, clumps a few to a tile and painted strokes, jittered and turned, so the
        // pattern never repeats in rows
        vec3 grass = mix(${glColor(GROUND.moistLow)}, ${glColor(GROUND.moistHigh)}, clamp((s.y - 1.0) / 9.0, 0.0, 1.0));
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
        float painted = (1.0 - smoothstep(0.04, 0.04 + bladeAA, abs(bf.x + bf.y * 0.25))) * (1.0 - smoothstep(0.18, 0.42, abs(bf.y)));
        float tex = 0.91 + 0.31 * tuft + painted * (0.08 + bladeHash * 0.16) * detail + 0.09 * blade * detail;
        c = mix(c, grass * (0.80 + 0.27 * b1 + 0.14 * (n1 - 0.5)) * tex * (1.0 - 0.19 * blot), moist);${hook(h, "groundVariation")}
        // the game's altitude ramp, the grass's on grass and the desert's on dry ground, before contamination's veins
        c *= altitudeOf(vWorld.y, moist);
        float lvl = clamp(clev, 0.0, 1.0);
        // contamination: a layer over the ground, as in the game (palette.ts's CONTAMINATION says
        // the same, for the tests): orange-red veins over either soil, its own colour between them
        // (the veins' point and antialiasing width for every pixel, before the branch: veinsOf)
        vec2 vein = vec2(0.0);
        vec2 veinQ = veinPoint(g);
        float veinWidth = veinAA(veinQ);
        if (bad > 0.0${h?.groundTop ? "" : " && wet < 1.0"}) vein = veinsOf(veinQ, veinWidth, lvl) * bad;
        // the ground as it is with no water on it (the High look's poisoned bed shows it through polluted water)
        groundDry = mix(c, ${glColor(CT.vein)}, vein.x * ${f(CT.cover)});
        groundDryGlow = vein.y * mix(${f(CT.glow[0])}, ${f(CT.glow[1])}, lvl);
        vein *= 1.0 - wet;
        c = mix(c, ${glColor(CT.vein)}, vein.x * ${f(CT.cover)});
        // (the glow is added after the light: the veins' cores, narrower than their strokes)
        glow = vein.y * mix(${f(CT.glow[0])}, ${f(CT.glow[1])}, lvl);
${hook(h, "groundEnd")}        return mix(c, ${glColor(GROUND.underwater)} * (0.9 + 0.15 * n2), bed);
      }
      void main() {
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
        float glow = 0.0;
        vec3 c;
        vec3 light;
        float sunHere = 0.0;
        if (n.y > 0.5) {
          // the tile and its three neighbours toward this point (the light look: the tile alone)
          vec2 fr = g - tile;
          vec2 sd = vec2(fr.x < 0.5 ? -1.0 : 1.0, fr.y < 0.5 ? -1.0 : 1.0);
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
            // (the light look: the tile alone, so the blend below comes to the tile's own soil, level and film;
            // worked out once, without the edge's wobble (D135: no soil blending), which software would pay for
            // on every pixel)
            vec2 ws = smoothstep(vec2(0.5 - bandW), vec2(0.5 + bandW), w);
            vec4 s0 = soilOf(d0);
            vec4 soil = vec4(grassOf(s0.x), s0.x, step(0.5, s0.y), s0.z);
            float clev = s0.y / 15.0;
            groundBed = s0.z > 0.0 ? waterFilm(waterDepthOf(d0)) : 1.0;
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
            vec4 flags0 = vec4(grassOf(s0.x), s0.x, step(0.5, s0.y), s0.z);
            vec4 flags1 = vec4(grassOf(s1.x), s1.x, step(0.5, s1.y), s1.z);
            vec4 flags2 = vec4(grassOf(s2.x), s2.x, step(0.5, s2.y), s2.z);
            vec4 flags3 = vec4(grassOf(s3.x), s3.x, step(0.5, s3.y), s3.z);
            vec4 soil = flags0 * v00 + flags1 * v10 + flags2 * v01 + flags3 * v11;
            // the grass's share as the game draws it: its desert map's noisy blend (desertBlend)
            soil.x = 1.0 - desertBlend(g, vec4(1.0 - flags0.x, sx > 0.5 ? 1.0 - flags1.x : 1.0, sy > 0.5 ? 1.0 - flags2.x : 1.0, hd == h0 ? 1.0 - flags3.x : 1.0));
            float clev = (s0.y * w00 + s1.y * w10 + s2.y * w01 + s3.y * w11) / 15.0;
            // the bed under thin water (WATER_FILM): its depth's film curve, blended over the wet tiles round
            // the point only (a pond's bed holds to its shore)
            vec4 under = vec4(s0.z * w00, s1.z * w10, s2.z * w01, s3.z * w11);
            float underSum = under.x + under.y + under.z + under.w;
            groundBed = underSum > 0.0001 ? dot(under, vec4(waterFilm(waterDepthOf(d0)), waterFilm(waterDepthOf(dx)), waterFilm(waterDepthOf(dy)), waterFilm(waterDepthOf(dd)))) / underSum : 1.0;
          #endif
          vec3 ground = groundColor(soil, g, detail, clev, glow);${hook(h, "groundTop")}

          // under a film the ground is seen through the water as through a coloured filter (WATER_FILM): its
          // own detail in the water's hue, teal, crimson or between them by the water's badwater share
          float filmOver = smoothstep(0.4, 0.6, soil.w) * (1.0 - groundBed);
          // (and the light of the bed's veins, where a look draws them under polluted water, is half seen through it)
          if (filmOver > 0.0) {
            ground = mix(ground, waterFilmGround(ground, ${hook(h, "filmShare", "texture2D(flowTex, g / mapSize).b")}, ${hook(h, "filmBad", "WATER_FILM_BAD_TINT")}), filmOver);
            glow *= 1.0 - 0.5 * filmOver;
          }
          #if !LITE
            // the ground behind the water past a sliver shows as the game's High quality shows it: overlaid with
            // the water's own colour there and desaturated (WATER_SURFACE.behindTint); the water's opacity sets how
            // much of it shows. Clear water (an editing aid) shows the bed as it is.
            float clrBehind = clearWater;
            if (clearAround.w > 0.5) clrBehind = max(clrBehind, 1.0 - smoothstep(clearAround.z, clearAround.z + CLEAR_FADE, length(g - clearAround.xy)));
            float behind = smoothstep(0.4, 0.6, soil.w) * groundBed * (1.0 - clrBehind);
            if (behind > 0.0) {
              float bd = waterDepthOf(d0);
              vec3 wc = waterBlend(cleanWaterBody(bd, waterAbsorb(bd)), badwaterBody(bd), ${hook(h, "filmShare", "texture2D(flowTex, g / mapSize).b")});
              ground = mix(ground, waterGroundBehind(ground, wc), behind);
            }
          #endif
          groundBed = 1.0;
          // an eruption's fresh rock reads as rock, never the grass or earth it rose from (#367)
          float fresh = freshRock(tile, h0);
          ground = mix(ground, ashOf(g), fresh);
          glow *= 1.0 - fresh;
          if (groundMode > 0.5) {
            c = heightColor(h0) * (0.96 + 0.08 * (vnoise(g * 9.0) - 0.5) * detail);
            glow = 0.0;
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
            // in the overhang's shade
            float none;
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
                floorSoil = vec4(grassOf(q0.x), q0.x, step(0.5, q0.y), q0.z) * u00 + vec4(grassOf(q1.x), q1.x, step(0.5, q1.y), q1.z) * u10
                  + vec4(grassOf(q2.x), q2.x, step(0.5, q2.y), q2.z) * u01 + vec4(grassOf(q3.x), q3.x, step(0.5, q3.y), q3.z) * u11;
                #if !LITE
                  // the game's desert map is 3D: a cave's floor blends as a top does, at its own level
                  floorSoil.x = 1.0 - desertBlend(g, vec4(1.0 - grassOf(q0.x), rx1 > 0.5 ? 1.0 - grassOf(q1.x) : 1.0,
                    ry1 > 0.5 ? 1.0 - grassOf(q2.x) : 1.0, rd1 > 0.5 ? 1.0 - grassOf(q3.x) : 1.0));
                #endif
                floorLevel = (q0.y * z00 + q1.y * z10 + q2.y * z01 + q3.y * z11) / 15.0;
              }
              c = groundMode > 0.5 ? heightColor(vWorld.y) : groundColor(floorSoil, g, detail, floorLevel, none);

            #else
              c = groundMode > 0.5 ? heightColor(vWorld.y) : groundColor(vec4(soil.xyz, 0.0), g, detail, clev, none);
            #endif
            glow = 0.0;
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
          wc = mix(wc, ${glColor(WALL.ledge)}, smoothstep(1.0 - lw - py * 0.5, 1.0 - lw + py * 0.5, fy) * lines);
          wc = mix(wc, ${glColor(WALL.groove)}, (1.0 - smoothstep(gw - py * 0.5, gw + py * 0.5, fy)) * lines);
          float lip = ceiling ? 0.0 : 1.0 - smoothstep(0.07, 0.13, h0 - y);
          vec4 s0 = soilOf(d0);
          vec3 top = groundMode > 0.5 ? heightColor(h0) : mix(${glColor(GROUND.dry)} * 0.85, ${glColor(GROUND.moistHigh)}, grassOf(s0.x));
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
        // the glowing cracks of contaminated ground shine in shadow too
        c += ${glColor(GROUND.contaminatedGlow)} * glow * ${f(CT.glowAdd)};${hook(h, "lit")}
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
        // tonemap the strong orange it is, and never fogged)
        vec3 emission = vec3(0.0);
        vec2 eAt = vec2(vWorld.x, -vWorld.z);
        bool eWall = abs(n.y) < 0.5 && (eAt.x < 0.01 || eAt.y < 0.01 || eAt.x > mapSize.x - 0.01 || eAt.y > mapSize.y - 0.01);
        if (eruptionAge >= 0.0 && !eWall) {
          vec4 e = texture2D(eruptionMask, eAt / mapSize);
          float arrival = smoothstep(e.a * 1.1, e.a * 1.1 + 0.55, eruptionAge);
          float cooling = smoothstep(0.0, 3.6, coolingAge);
          float crust = smoothstep(2.0, 5.8, coolingAge);
          float fade = 1.0 - smoothstep(3.3, 6.4, coolingAge);
          float cracks = pow(1.0 - abs(sin(vWorld.x * 2.8 + sin(vWorld.z * 1.2) * 2.6 + vWorld.z * 1.6)), 12.0);
          float hot = max(e.r * (0.56 + 0.44 * cracks), e.g * cracks);
          float k = hot * arrival * fade * 0.9;
          // (the crust is the ground darkened; the rest of the lava is its own light)
          c *= 1.0 - k + k * crust * vec3(0.49, 0.46, 0.43);
          emission = mix(vec3(3.2, 0.5, 0.02), vec3(0.38, 0.028, 0.013), cooling) * k * (1.0 - crust);
          float ash = e.b * smoothstep(0.5, 2.4, eruptionAge) * (1.0 - smoothstep(0.5, 6.0, coolingAge)) * 0.24 * max(0.0, n.y);
          c = mix(c, vec3(0.52, 0.49, 0.45), ash);
          emission *= 1.0 - ash;
        }
        // the look as the game draws it, fogged and graded; the editing aids after it, in their own channel (D497)
        c = finishLit(c, emission, vWorld);
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
        gl_FragColor = vec4(c, 1.0);
        #if CUTAWAY
          if (cutGone) discard;
        #endif
      }
    `,
  });
}

export function waterMaterial(scene: SceneUniforms, lite = false, h?: ShaderHooks): ShaderMaterial {
  return new ShaderMaterial({
    defines: { LITE: lite ? 1 : 0 },
    uniforms: scene as unknown as Record<string, { value: unknown }>,
    vertexShader: /* glsl */ `
      attribute vec2 wdata;
      attribute float wflags;
      attribute vec2 wcut;
      uniform float slice;
      varying vec2 vData;
      varying float vFlags;
      varying vec3 vNormal;
      varying vec3 vWorld;
      void main() {
        vData = wdata;
        vFlags = wflags;
        vNormal = normal;
        vec4 w = modelMatrix * vec4(position, 1.0);
        // the game's layers (D207, cutWater.ts): a column standing over the cut with its floor below it is sliced, its
        // top lying on the cut, shallower by what the cut took off, its sides stopping there; one whose floor is at
        // the cut or above it is gone (the fragment shader drops its top over the cut, and its sides fold flat here:
        // a side hanging below its floor, to lower water in front of a cliff, would leave a sliver under the cut)
        float surface = normal.y > 0.5 ? w.y : wcut.x + wdata.x;
        if (surface > slice + ${f(CUT_SLACK)} && wcut.x >= slice && normal.y < 0.5) w.y = surface;
        if (surface > slice + ${f(CUT_SLACK)} && wcut.x < slice) {
          float over = surface - slice;
          w.y = min(w.y, slice);
          if (normal.y > 0.5) {
            vData.x = max(0.0, wdata.x - over * wcut.y);
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
      ${common(h)}
      ${WATER_GLSL}${CAVE_FLOW}${hook(h, "waterDecl")}${CAVE_POINT}
      #ifdef CAVES
      ${OVERLAY_RUN}
      #endif
      /** The slope of the ripples (gentle, moving) at q. */
      vec2 ripple(vec2 q, float t) {
        float a1 = q.x * 1.3 + q.y * 0.35 + t * 1.1;
        float a2 = q.y * 1.7 - q.x * 0.4 - t * 0.9;
        float a3 = (q.x - q.y) * 2.9 + t * 1.7;
        return cos(a1) * vec2(1.3, 0.35) * 0.5 + cos(a2) * vec2(-0.4, 1.7) * 0.35 + cos(a3) * vec2(2.9, -2.9) * 0.12;
      }
      /** The water's current here as drawn (tiles a second; motion.ts), 0 where still. */
      vec2 waterCurrent(vec2 g) { return (texture2D(flowTex, g / mapSize).rg * 255.0 - 128.0) / 63.5; }
      /** The textures the current carries, at p: the broken foam's noise, the pale streaks, badwater's
       *  mottled light and dark patches and its bubbles (the ripples and glints stay where they are: a few
       *  noise lookups twice over, not the whole surface, which a modest GPU felt). */
      void flowingAt(vec2 p, float t, float bad, float fine, out float fn, out float pale, out float bubbles, out float dark) {
        fn = vnoise(p * 4.0 + vec2(t * 0.3, -t * 0.2));
        // clean water's pale streaks run along the flow; badwater's light and dark are mottled patches, as
        // the game's contaminated surface is a pattern of patches flowing with the water, never streaks
        // that read as rain (each thresholded before they mix, so the light keeps its coverage when half bad)
        pale = smoothstep(0.6, 0.82, vnoise(vec2(p.x * 0.9 + p.y * 0.3, (p.y - p.x * 0.2) * 5.0) + vec2(t * 0.15, t * 0.5)));
        dark = 0.0;
        bubbles = 0.0;
        if (bad > 0.01) {
          float light = vnoise(p * 1.4 + vec2(t * 0.05, t * 0.08)) * 0.6 + vnoise(p * 3.3 - vec2(t * 0.04, -t * 0.06)) * 0.4;
          pale = mix(pale, smoothstep(0.6, 0.82, light + 0.06), bad);
          float mottle = vnoise(p * 1.1 + vec2(t * 0.03, -t * 0.04)) * 0.6 + vnoise(p * 2.7 - vec2(t * 0.05, t * 0.02)) * 0.4;
          dark = 1.0 - smoothstep(0.3, 0.46, mottle);
          bubbles = fine * smoothstep(0.93 - 0.1 * bad, 1.03 - 0.1 * bad, vnoise(p * 5.0 + vec2(t * 0.05, -t * 0.08))) * smoothstep(0.55, 0.8, vnoise(p * 1.3 - vec2(0.0, t * 0.04)));
        }
      }
      void main() {
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
        float t = time;
        // the badwater share, blended between tiles by the mesh: the water turns from clean water to
        // badwater with it, smoothly, never in streaks or patches, by the game's own tint (waterPalette.ts
        // WATER_BLEND): its colour (waterBlend), its opacity and its dull surface, foam and bubbles
        float bad = waterTint(cont);
        // how far this point is from the tile's shores (1 in open water): the water shallows toward
        // its banks
        vec2 fr = fract(g);
        float shore = 1.0;
        if (bitOf(vFlags, 1.0) > 0.5) shore = min(shore, 1.0 - fr.x);
        if (bitOf(vFlags, 2.0) > 0.5) shore = min(shore, fr.x);
        if (bitOf(vFlags, 4.0) > 0.5) shore = min(shore, 1.0 - fr.y);
        if (bitOf(vFlags, 8.0) > 0.5) shore = min(shore, fr.y);
        if (n.y < 0.5) shore = 1.0;
        // (waterPalette.ts's waterBody and waterOpacity say the same, for the tests)
        float d = waterSeenDepth(depth, shore);
        // clean water: clear in the shallows (the bed shows through a light teal tint), a deep teal
        // body a level or so deep, navy where deep; badwater murky, the game's
        // crimson, lighter on a film and darker deeper by the game's _DepthGradients ramp (D496)
        float absorb = waterAbsorb(d);
        vec3 murky = badwaterGlow(badwaterBody(depth), BADWATER_BODY, d, cont);
        vec3 body = cleanWaterBody(d, absorb);
        // a sliver at a shore's very edge is a faint tint over its own ground, building to the body by
        // WATER_FILM.to deep (waterPalette.ts WATER_FILM; our anti-aliasing): its own depth, not the bank's
        float film = waterFilm(depth);
        float alpha = mix(WATER_FILM_CLEAN, cleanWaterAlpha(d), film);
        float foam = 0.0;
        float glints = 0.0;
        // the gloss's slow variation, as the game's two panned samples of its gloss map (WATER_SURFACE.smoothness)
        float gloss = 0.5;
        float pale = 0.0;
        float bubbles = 0.0;
        float crest = 0.0;
        float trough = 0.0;
        vec3 N = n;
        if (n.y > 0.5) {
          #if !LITE
            float slow = mix(1.0, 0.5, bad);
            // (small and sparse, and gone where a pixel covers more than a few of them)
            float fine = 1.0 - smoothstep(0.03, 0.09, fwidth(g.x));
            // everything on the surface moves with the water's current, as the game's albedo and normals do
            // (D353; its flow map, two phases): drawn at two points carried back along it, each fading in as the
            // other is carried furthest, so neither is seen to start again; still water draws them where they are
            float fn;
            vec2 drift = waterCurrent(g) * 0.65;
            #ifdef CAVES
              if (waterOwnFlow.a > 0.5) drift = (waterOwnFlow.rg * 255.0 - 128.0) / 63.5 * 0.65;
            #endif
            float dark;
            vec2 p1 = g;
            vec2 p2 = g;
            float blend = 0.0;
            if (dot(drift, drift) < 1e-6 || (${hook(h, "waterOwnSurface", "false")})) flowingAt(g, t, bad, fine, fn, pale, bubbles, dark);
            else {
              float phase = fract(t / 12.0);
              float second = fract(t / 12.0 + 0.5);
              blend = abs(phase * 2.0 - 1.0);
              p1 = g - drift * (phase * 12.0);
              p2 = g - drift * (second * 12.0);
              float fn2, pale2, bubbles2, dark2;
              flowingAt(p1, t, bad, fine, fn, pale, bubbles, dark);
              flowingAt(p2, t, bad, fine, fn2, pale2, bubbles2, dark2);
              fn = mix(fn, fn2, blend);
              pale = mix(pale, pale2, blend);
              bubbles = mix(bubbles, bubbles2, blend);
              dark = mix(dark, dark2, blend);
            }
            // the ripples (the surface's normals) and the glints, carried the same way
            vec2 q1 = p1 * 1.6 + vec2(sin(p1.y * 0.5), sin(p1.x * 0.43)) * 1.5;
            vec2 sl = ripple(q1, t * slow) + 0.6 * ripple(q1 * 1.9 + 7.0, t * 1.3 * slow);
            if (blend > 0.0) {
              vec2 qb = p2 * 1.6 + vec2(sin(p2.y * 0.5), sin(p2.x * 0.43)) * 1.5;
              sl = mix(sl, ripple(qb, t * slow) + 0.6 * ripple(qb * 1.9 + 7.0, t * 1.3 * slow), blend);
            }
            gloss = (vnoise(p1 * 0.5 + vec2(t * 0.010, t * 0.007)) + vnoise(p1 * 0.37 - vec2(t * 0.008, t * 0.012))) * 0.5;
            // small glints (D154): a few to a tile, each a few pixels across, gathered in the patches of
            // ripples that catch the sun, not a static of specks all over (gone where a glint would be
            // under two pixels)
            float sparkle = 1.0 - smoothstep(0.035, 0.08, fwidth(g.x));
            float sunPatch = smoothstep(0.4, 0.75, vnoise(g * 0.45 + vec2(t * 0.03, -t * 0.02)));
            glints = sparkle * sunPatch * smoothstep(0.84, 0.93, vnoise(p1 * 9.0 + vec2(t * 0.6, -t * 0.4)) * vnoise(p1 * 7.1 - vec2(t * 0.3, t * 0.7)) * 1.6);
            if (blend > 0.0) glints = mix(glints, sparkle * sunPatch * smoothstep(0.84, 0.93, vnoise(p2 * 9.0 + vec2(t * 0.6, -t * 0.4)) * vnoise(p2 * 7.1 - vec2(t * 0.3, t * 0.7)) * 1.6), blend);
            // calmer from afar, where a pixel spans a ripple (no shimmer)
            float near = 1.0 - smoothstep(0.08, 0.25, fwidth(g.x));
            float calm = 0.07 * near;
            N = normalize(vec3(sl.x * calm, 1.0, -sl.y * calm));
            // the ripples' crests catch the sky: a light teal texture on the dark body (clean water;
            // badwater is dull)
            crest = smoothstep(0.1, 0.85, 0.5 + 0.42 * (sl.x * 0.7 - sl.y * 0.5)) * near * (1.0 - bad);
            // badwater's troughs: its darker patches, carried by the current (flowingAt), as the game's
            // contaminated pattern, not the ripples' parallel bands
            trough = dark * near * bad;
          #endif
          // badwater's opacity (the water's, as the game's: WATER_SURFACE.seeThrough), by how bad it is
          alpha = mix(alpha, badwaterAlpha(depth, shore), bad);
          #if LITE
            // (the light look follows the game's Low quality: no ground behind the water)
            alpha = max(alpha, film);
          #endif
          // no foam along the shore or over a brink, as the game draws none (its water shader has no foam)
        } else {
          // the water's side, and a fall: where the water steps down, as the game draws its falls, the water mesh's
          // own vertical face in the water's own colour, its texture running down it (the game's flow map carries
          // its detail down the face), nearly opaque: the ground behind shows by WATER_SURFACE.fallSeeThrough
          // (its _TransparencyWaterfallDepth); no whitewater, no foam. At the map's edge, the water's side
          float along = abs(n.x) > 0.5 ? g.y : g.x;
          #if LITE
            float s = 0.5;
          #else
            float s = vnoise(vec2(along * 6.0, vWorld.y * 1.3 + t * 2.4)) * 0.6 + vnoise(vec2(along * 13.0, vWorld.y * 2.7 + t * 3.3)) * 0.4;
          #endif
          bool edge = vFlags > 254.5;
          float drop = edge ? 0.0 : vFlags / 30.0;
          // its detail: the light parts of the running texture, as the pale streaks on the surface
          pale = smoothstep(0.45, 0.75, s);
          // the game's face sees the cliff right behind it: the colour of the water at its shallowest
          body = cleanWaterBody(0.05, waterAbsorb(0.05));
          murky = badwaterBody(0.05);
          alpha = edge ? mix(WATER_EDGE, BADWATER_SIDE, bad) : (1.0 - WATER_FALL_SEE_THROUGH) * smoothstep(0.02, 0.06, drop);
          if (alpha < 0.01) discard;
        }
        foam = clamp(foam, 0.0, 1.0);
        vec3 c = waterBlend(body, murky, cont);
        float lit = sunLit(g, vWorld.y);
        vec3 light = skyColor * 1.2 + sunColor * 0.3 * max(dot(N, sunDir), 0.0) * lit;
        // the game's own highlight on the ripples, added to the colour before its light (and again after it)
        vec3 highlight = sunColor * waterCameraHighlight(N, V, bad) * step(0.5, n.y);
        c += highlight;
        c *= light;
        c = mix(c, WATER_CREST * light, crest * WATER_CREST_AMOUNT);
        c = mix(c, badwaterShade(BADWATER_TROUGH, depth) * light, trough * BADWATER_TROUGH_AMOUNT);
        // the sky's reflection, stronger at low angles; pale ripples; the sun's glint and glints
        // (none on a fall: a sheet seen edge-on would mirror the sky in patches)
        // (the game's URP lighting at the water's smoothness, clean water's about 0.25 to badwater's 0.15: the sky
        // added on top, as URP's environment term)
        float smoothness = mix(clamp(WATER_SMOOTHNESS + (gloss - 0.5) * WATER_SMOOTHNESS_SPREAD, 0.0, 1.0), BADWATER_SMOOTHNESS, bad);
        float fres = waterSkyReflect(dot(N, V), smoothness) * step(0.5, n.y);
        c += WATER_SKY * fres;
        // (the highlight's emission: unlit, unshadowed)
        c += highlight;
        // pale streaks where it flows (badwater's brownish, so it reads as a flowing liquid too): each
        // by its own share, so water partly bad never takes a pale pink haze between the two
        c = mix(c, WATER_PALE, pale * WATER_PALE_AMOUNT * (1.0 - bad));
        c = mix(c, badwaterShade(BADWATER_STREAK, depth), pale * BADWATER_STREAK_AMOUNT * bad);
        float spec = waterSunGlint(N, V, sunDir, smoothness) * lit * step(0.5, n.y);
        // a film keeps at most a faint sheen of glints: they come in with its body (WATER_FILM), so a glint
        // never turns a film's faint tint into a solid fleck
        glints *= film;
        c += sunColor * (spec + glints * ${f(WS.glints)} * mix(1.0, BADWATER_GLINTS, bad) * (0.3 + 0.7 * lit));
        c += BADWATER_VEIN * bubbles * bad * BADWATER_BUBBLES;
        c = mix(c, mix(WATER_FOAM, BADWATER_FOAM, bad) * (0.8 + 0.2 * lit), foam);
        // (foam and glints only ever make the water more opaque: deep water and the light look stay opaque)
        if (n.y > 0.5) alpha = max(alpha, mix(alpha, 0.95, max(foam, glints * 0.6)));
${hook(h, "water")}        #ifdef CAVES
          // under a roof, the light of the air it stands in, as objects and falls there take it: the open air's sky
          // (D497), and the sun only where the volume's ray reaches
          if (cave.z > 0.5) {
            float ndlRoofed = max(dot(N, sunDir), 0.0);
            vec3 open = skyColor * 1.2 + sunColor * 0.3 * ndlRoofed * lit;
            vec3 under = skyColor * 1.2 + sunColor * 0.3 * ndlRoofed * cave.y;
            c *= under / max(open, 0.001);
          }
        #endif
        // clear water (D196, D212; waterPalette.ts CLEAR_WATER): all of it with T, else under and
        // right round the brush while it paints a submerged bed, fading back over a tile or two.
        // Clean water keeps a faint blue tint over the bed, its ripples and a soft bright line along
        // its shore; badwater keeps its colour, murky and half see-through, with its dull troughs
        // and slow glowing bubbles (never a hatching: it reads by lightness, colour and texture, D324)
        float clr = clearWater;
        if (clearAround.w > 0.5) clr = max(clr, 1.0 - smoothstep(clearAround.z, clearAround.z + CLEAR_FADE, length(g - clearAround.xy)));
        if (clr > 0.001) {
          float badish = max(bad, smoothstep(0.05, 0.5, cont));
          vec3 bc = mix(murky, badwaterShade(BADWATER_TROUGH, depth), trough * BADWATER_TROUGH_AMOUNT);
          bc += BADWATER_VEIN * bubbles * BADWATER_BUBBLES;
          vec3 cc = c;
          float ca = alpha * mix(0.35, 0.7, badish);
          if (n.y > 0.5) {
            float line = 1.0 - smoothstep(0.0, CLEAR_SHORE_WIDTH, shore);
            cc = WATER_CLEAR_TINT * light;
            cc = mix(cc, WATER_CLEAR_SHORE * light, crest * CLEAR_RIPPLE_LIGHT);
            cc += WATER_SKY * waterSkyReflect(dot(N, V), WATER_SMOOTHNESS);
            cc += sunColor * (waterSunGlint(N, V, sunDir, WATER_SMOOTHNESS) * lit + glints * ${f(WS.glints * 0.5)} * (0.3 + 0.7 * lit));
            cc = mix(cc, WATER_FOAM * (0.8 + 0.2 * lit), foam * 0.6);
            cc = mix(cc, WATER_CLEAR_SHORE * (0.85 + 0.15 * lit), line);
            ca = min(0.9, CLEAR_OPACITY + CLEAR_RIPPLE * crest + 0.15 * glints + CLEAR_SHORE_OPACITY * line + 0.3 * foam);
            ca = mix(ca, CLEAR_BAD_OPACITY, badish);
          }
          c = mix(c, mix(cc, bc, badish), clr);
          alpha = mix(alpha, ca, clr);
        }
        // the water as the game draws it, fogged and graded; the editing aids after it, in their own channel (D497):
        // the selection, the sources' wells and the pointer's source's glow (D196), a highlighted source (D249)
        c = finish(c, vWorld);
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
        // every source wells up (D196): rings spreading from it and a few bubbles, on the water over
        // it, so it is found even deep under water; brighter while the pointer's water comes from it
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
              float ph = fract(time * 0.35 + (sq.x * 0.37 + sq.y * 0.61));
              float ph2 = fract(ph + 0.5);
              float ring = (1.0 - smoothstep(0.0, 0.07, abs(d - ph * 1.4))) * (1.0 - ph) + (1.0 - smoothstep(0.0, 0.07, abs(d - ph2 * 1.4))) * (1.0 - ph2);
              float bub = step(0.9, vnoise((g - sq) * 9.0 + vec2(0.0, -time * 1.6))) * (1.0 - smoothstep(0.08, 0.4, d));
              float here = max(ring * 0.8, bub) * (1.0 - smoothstep(1.1, 1.5, d));
              up = max(up, here);
              badSrc = max(badSrc, sv.g * here);
              hl = max(hl, sv.b * (1.0 - smoothstep(0.25, 1.2, d)) * (0.55 + 0.45 * sin(time * 3.0)));
            }
          vec3 uc = mix(WATER_FOAM, BADWATER_FOAM, step(0.01, badSrc));
          c = mix(c, uc, up * 0.55);
          alpha = max(alpha, mix(alpha, 0.85, up * 0.5));
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
        gl_FragColor = vec4(c, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
  });
}

/** The sky round the map, drawn behind everything: blue overhead, paler toward the horizon, a
 *  hazy blue below it, where the map floats, with soft clouds above and below. */
export function skyMaterial(h?: ShaderHooks): ShaderMaterial {
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
      float h2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float vn(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(h2(i), h2(i + vec2(1.0, 0.0)), f.x), mix(h2(i + vec2(0.0, 1.0)), h2(i + vec2(1.0, 1.0)), f.x), f.y);
      }
      void main() {
        vec3 d = normalize(vDir);
        vec3 up = mix(${glColor(SKY.horizon)}, ${glColor(SKY.zenith)}, pow(smoothstep(0.0, 0.5, d.y), 0.7));
        vec3 down = mix(${glColor(SKY.horizon)}, ${glColor(SKY.below)}, smoothstep(0.0, 0.4, -d.y));
        vec3 c = d.y > 0.0 ? up : down;
        // soft clouds on a layer above and one below (the map floats in the sky)
        vec2 q = d.xz / max(abs(d.y), 0.08) * 1.6;
        float n = vn(q) * 0.55 + vn(q * 2.3 + 7.1) * 0.3 + vn(q * 5.1 + 3.3) * 0.15;
        float cloud = smoothstep(0.52, 0.8, n) * smoothstep(0.02, 0.2, abs(d.y));
        c = mix(c, ${glColor(SKY.cloud)}, cloud * 0.75);${hook(h, "sky")}
        // (the game's post chain grades the whole frame, the sky too)
        gl_FragColor = vec4(gamePost(c), 1.0);
      }
    `,
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
 *  textures mipmapped). The view's canvas has no alpha, so the coverage is all alpha does. */
export function objectMaterial(scene: SceneUniforms, lite = false, h?: ShaderHooks): ShaderMaterial {
  return new ShaderMaterial({
    alphaToCoverage: !lite,
    defines: { LITE: lite ? 1 : 0 },
    uniforms: scene as unknown as Record<string, { value: unknown }>,
    vertexShader: /* glsl */ `
      attribute vec3 pcolor;
      attribute vec3 grow;
      attribute float lod;
      uniform float viewHeight;
      uniform float markers;
      uniform vec3 aidTint;
      uniform vec3 sourceTint;${hook(h, "objectVertexDecl")}
      varying vec3 vAid;
      varying vec3 vColor;
      varying vec3 vNormal;
      varying vec3 vWorld;
      varying float vFoot;
      varying float vLod;
      void main() {
        mat4 m = modelMatrix * instanceMatrix;
        vLod = lod;
${hook(h, "objectVertex")}        vNormal = normalize(mat3(m) * ${hook(h, "objectNormal", "normal")});
        vColor = ${hook(h, "objectColor", "pcolor")};
        vAid = vec3(1.0);
        #ifdef USE_INSTANCING_COLOR
          // (a highlighted object's colour comes negative, its highlight tinting it after the grade: renderer.ts
          // highlightObjects; a source's, less 10 more, takes the sources' tint)
          vec3 ic = instanceColor;
          if (ic.r < -5.0) {
            ic = -ic - 10.0;
            vAid = sourceTint;
          } else if (ic.r < 0.0) {
            ic = -ic;
            vAid = aidTint;
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
            float k = clamp(grow.x / perUnit, 1.0, grow.z);
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
      ${common(h)}${CAVE_POINT}
      void main() {
        // the game's layers: what stands above the slice is cut away
        if (vWorld.y > slice + 0.02) discard;
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
          if (cave.z > 0.5) light = skyColor * 1.15 * (0.8 + 0.2 * n.y) * ao + sunColor * 0.5 * ndl * ${hook(h, "roofedSun", "cave.y")};
        #endif
        // (the object as the game draws it, fogged and graded; a highlight, an editing aid, tints it after: D497)
        gl_FragColor = vec4(min(finish((${hook(h, "objectFinal", "vColor * light")}) * inside, vWorld) * vAid, 1.0), coverage);
      }
    `,
  });
}
