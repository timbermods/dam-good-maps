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
//   shows its own soil. Contact shadows darken the ground at the foot of higher neighbours.
// - Walls are grey-green stone in faint cobbles: every other level a shade darker, and a pale
//   ledge over a dark groove between levels, at least a pixel wide at any zoom, so levels can be
//   counted; a lip of the top's ground.
// - Water is light teal where shallow (see-through near the shore) and blue where deep, lighter
//   than dry ground at any depth, with glints, pale ripples that move, and foam along shores and
//   along the brink where a fall pours over. Falls (D201, falls.ts) leave the lip and arc down as a
//   translucent ribbon with thickness, streaks rushing down it, white at the lip, with whitewater
//   where they land; the cliff shows through between the streaks.
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
import { CONTAMINATION as CT, CONTAMINATION_OUTLINE as OUTLINE, CUT_CAP, GROUND, HATCH, HEIGHT_RAMP, JUICE, LIGHT, MINE, SKY, WALL, WATER_SURFACE as WS, type Rgb } from "./palette";
import { END, FALL_NEAR_PX, FALL_SHAPE, FALL_SPLASH } from "./falls";
import { WATER_GLSL } from "./waterPalette";
import { SHADOW_OFFSET, SHADOW_RES, SHADOW_SCALE, WATER_BYTE_FINE, WATER_BYTE_STEPS, type TileSpan } from "./light";
import { CAVE_SKY_FLOOR, LIGHT_LEVELS, type CaveLight } from "./caveLight";
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
  hazeColor: { value: Color };
  /** World distance where the haze starts and where it is full. */
  hazeRange: { value: Vector2 };
  hazeAmount: { value: number };
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
    hazeRange: { value: new Vector2(200, 600) },
    hazeAmount: { value: 0.16 },
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
  /** A factor on the sky's light (`lightOf`, the objects' light): the ambient occlusion. */
  skyLight?: string;
  /** finish(): the haze (replacing the Standard line), and the last step (replacing the clamp). */
  haze?: string;
  finishEnd?: string;
  // the terrain
  /** Where grass meets earth, and where contamination ends (expressions). */
  moist?: string;
  bad?: string;
  /** At the start of groundColor, before the pattern warp (g): to keep the tile's own coordinates and, where the Weather
   *  view's heat shimmer is on, to move g by less than half a pixel. */
  groundStart?: string;
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
  /** In a wall, before its level lines (wc, n, along, y, k, shade). */
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
  /** Statements that put the look's occlusion of the sky on a face under a roof (`sky`, from `cave`,
   *  n): the same as on the open ground at the roof line its light comes in by (`caveMouth`), so it
   *  never steps there or rises inward. Standard: none. */
  caveSky?: string;
  // the water
  /** Functions after the shared water palette's GLSL (they may use it). */
  waterDecl?: string;
  /** A water surface of its own, before clear water (c, alpha, foam, n, g, depth, cont, shore, V, lit). */
  water?: string;
  /** True (an expression) where `water` draws the surface itself: the Standard surface's textures are then
   *  drawn once where they are, not carried by the current twice over (D353; the High look's own water). */
  waterOwnSurface?: string;
  // falls
  fallVertexDecl?: string;
  /** Before the fall's vertex is placed (p, kind, land). */
  fallVertex?: string;
  /** The fall's normal (an expression). */
  fallNormal?: string;
  /** Before the crown's billows are read (b1, b2, g, t). */
  crownNoise?: string;
  /** Before the crown's colour (foam, swirl, up, bil). */
  crownFoam?: string;
  /** The sheet's translucent body colour (an expression; Standard: clean water's `WATER_SHALLOW`). */
  fallBody?: string;
  /** After the splash's froth (broken, tail, froth, g, t). */
  splashFroth?: string;
  /** Before the splash's colour (foam, g, t). */
  splashFoam?: string;
  /** Before clear water on a fall (alpha, kind, g, t). */
  fallEnd?: string;
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
 *  and falls' on a map with terrain above terrain (`CAVES`). */
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

/** Objects and falls under a roof (3D view, item 7; only on a map with terrain above terrain, `CAVES`): the light of
 *  the air a point stands in, from the light volume, as the ground round it takes it. x the sky, y the sun (0–1), z 1
 *  where that air is under a roof; elsewhere z is 0 and the open air's light stands. */
const CAVE_POINT = /* glsl */ `
      #ifdef CAVES
      ${CAVE_AIR}
      vec3 caveAirAt(vec3 world) {
        if (caveSize.z < 0.5) return vec3(1.0, 1.0, 0.0);
        vec3 q = vec3(world.x, -world.z, world.y);
        if (!roofedAir(floor(q))) return vec3(1.0, 1.0, 0.0);
        return vec3(textureLod(caveTex, q / caveSize, 0.0).rg, 1.0);
      }
      /** How far into a cave a point's air is, from its sky: 0 at a mouth, where the volume holds the open ground's sky,
       *  1 deep in. */
      float roofedDeep(float sky) {
        return 1.0 - smoothstep(${f(CAVE_SKY_FLOOR)}, 0.8, sky);
      }
      /** An object's share of the sky under a roof: all of it at a mouth (as in open air, where an object takes the
       *  whole sky), a cave's least deep in. */
      float roofedSky(float sky) {
        return mix(1.0, ${f(CAVE_SKY_FLOOR)}, roofedDeep(sky));
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
const common = (h?: ShaderHooks) => /* glsl */ `
  uniform vec3 sunDir;
  uniform vec3 sunColor;
  uniform vec3 skyColor;
  uniform vec3 hazeColor;
  uniform vec2 hazeRange;
  uniform float hazeAmount;
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
  /** Sky light and sun light on a surface: shadows keep about three fifths of the light on the
   *  ground, with a violet cast (moist ground in shadow still stays lighter than dry ground in
   *  sun), so shadows read from afar as in the game. */
  vec3 lightOf(vec3 n, float sky, float ao, float lit) {
    float ndl = max(dot(n, sunDir), 0.0);
    return skyColor * ${hook(h, "skyLight")}1.0 * (0.7 + 0.3 * n.y) * ao * sky + sunColor * 0.55 * ndl * lit * mix(1.0, ao, 0.35);
  }
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
   *  \`paintOverlay\`'s \`edge\`): at tile position g, with \`px\` the size of a pixel in tiles, how much of a line lies here along the sides where the tile beside it is not of the same footprint,
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
    if (!sameOverlay(tile + vec2(1.0, 0.0), o)) e = min(e, 1.0 - fr.x);
    if (!sameOverlay(tile - vec2(1.0, 0.0), o)) e = min(e, fr.x);
    if (!sameOverlay(tile + vec2(0.0, 1.0), o)) e = min(e, 1.0 - fr.y);
    if (!sameOverlay(tile - vec2(0.0, 1.0), o)) e = min(e, fr.y);
    float w = max(0.06, 1.5 * px);
    return 1.0 - smoothstep(w, w + px, e);
  }
  vec3 overlayEdgeColor(vec4 o) {
    return clamp(o.rgb * 1.4 + 0.3, 0.0, 1.0);
  }
  /** The blue-grey haze over distant ground, and the warm grade. */
  vec3 finish(vec3 c, vec3 world) {
    float d = distance(world, cameraPosition);
    ${hook(h, "haze", "c = mix(c, hazeColor, hazeAmount * smoothstep(hazeRange.x, hazeRange.y, d));")}
    c *= vec3(1.01, 1.0, 0.98);
    float l = dot(c, vec3(0.299, 0.587, 0.114));
    c = mix(vec3(l), c, 1.03);
    ${hook(h, "finishEnd", "return clamp(c, 0.0, 1.0);")}
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
      ${CAVE_AIR}      /** The light of the air a face looks into, half a cell along its normal (caveLight.ts, whose
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
      /** The roof line a face under a roof takes its light from: walked from its cell toward the brightest
       *  neighbour (the volume's sky rises toward its opening), up to the first cell beside open air.
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
      /** The light on a face in air under a roof: the volume's sky with the look's occlusion of the sky,
       *  deeper in never below a cave's least (caveLight.ts CAVE_SKY_FLOOR) so a cave reads, murky but never
       *  near-black, and its sun. Both carry on from the open ground at the roof line the air opens by
       *  (caveMouth): the sun there fades to the cave's own over the first 0.6 of a tile and never exceeds
       *  it inside, so the light never steps at the line or rises inward. */
      vec3 caveLightOf(vec3 n, vec3 cave, float sunHere, float ao) {
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
        float sky = cave.x;${hook(h, "caveSky")}
        // (deeper in, the sky's light comes bounced off the rock round it: the walls and the ceiling take nearly a
        // floor's share, as the open ground's faces take theirs at the mouth; and the least holds there, not at the
        // mouth, where the open ground's own light, its occlusion with it, carries on)
        float bounce = 1.0 - smoothstep(${f(CAVE_SKY_FLOOR)}, 0.8, cave.x);
        float facing = mix(0.7 + 0.3 * n.y, 0.85 + 0.15 * n.y, bounce);
        return skyColor * facing * max(${f(CAVE_SKY_FLOOR)} * bounce, sky) * ao + sunColor * 0.55 * ndl * sun * mix(1.0, ao, 0.35);
      }
      /** Rock at a cell (a tile and a level) of the light volume: in the map, and no air there. */
      float rockAt(vec2 t, float z) {
        if (t.x < 0.0 || t.y < 0.0 || t.x >= caveSize.x || t.y >= caveSize.y) return 0.0;
        return texelFetch(caveTex, ivec3(vec3(t, z)), 0).r < 0.001 ? 1.0 : 0.0;
      }
      /** How many levels of rock stand at a neighbour from a floor's level up (0–2): the height of its
       *  wall, as a top's contact shadow reads it. */
      float wallAt(vec2 t, float z) {
        float k = rockAt(t, z);
        return k > 0.5 ? 1.0 + rockAt(t, z + 1.0) : 0.0;
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
      /** How much of the bed's own colour the ground under water takes (groundColor): 1 under water of
       *  a quarter level or more, less under a film, whose ground keeps its own soil, seen through the
       *  film's coloured filter (waterPalette.ts WATER_FILM, waterFilmGround). Set round a top's
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
          vec3 lc = s.x > 0.5 ? mix(${glColor(GROUND.moistLow)}, ${glColor(GROUND.moistHigh)}, clamp((s.y - 1.0) / 9.0, 0.0, 1.0)) : ${glColor(GROUND.dry)};
          if (s.z > 0.5) lc = mix(lc, s.x > 0.5 ? ${glColor(GROUND.contaminatedWet)} : ${glColor(GROUND.contaminated)}, 0.25 + 0.3 * clev);
          return mix(lc, ${glColor(GROUND.underwater)}, step(0.5, s.w) * groundBed);
        #endif
${hook(h, "groundStart")}        // (the patterns are read through a broad warp, so their repeat never shows from afar)
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
        float moist = ${hook(h, "moist", "smoothstep(0.42, 0.58, s.x + edge)")};
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
        // (a cave floor's contact shadow at the foot of the rock beside it, as the open ground's)
        float caveAo = 1.0;
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
            // (the light look: the tile alone, so the blend below comes to the tile's own soil, sky, level and film;
            // worked out once, without the edge's wobble (D135: no soil blending), which software would pay for
            // on every pixel)
            vec2 ws = smoothstep(vec2(0.5 - bandW), vec2(0.5 + bandW), w);
            vec4 s0 = soilOf(d0);
            vec4 soil = vec4(step(0.5, s0.x), s0.x, step(0.5, s0.y), s0.z);
            float sky = s0.w;
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
            vec4 flags0 = vec4(step(0.5, s0.x), s0.x, step(0.5, s0.y), s0.z);
            vec4 flags1 = vec4(step(0.5, s1.x), s1.x, step(0.5, s1.y), s1.z);
            vec4 flags2 = vec4(step(0.5, s2.x), s2.x, step(0.5, s2.y), s2.z);
            vec4 flags3 = vec4(step(0.5, s3.x), s3.x, step(0.5, s3.y), s3.z);
            vec4 soil = flags0 * v00 + flags1 * v10 + flags2 * v01 + flags3 * v11;
            float sky = s0.w * w00 + s1.w * w10 + s2.w * w01 + s3.w * w11;
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
          groundBed = 1.0;
          // an eruption's fresh rock reads as rock, never the grass or earth it rose from (#367)
          float fresh = freshRock(tile, h0);
          ground = mix(ground, ashOf(g), fresh);
          glow *= 1.0 - fresh;
          if (groundMode > 0.5) {
            c = heightColor(h0) * (0.96 + 0.08 * (vnoise(g * 9.0) - 0.5) * detail);
            glow = 0.0;
          } else {
            // a thin darker rim where grass meets earth, painted as the game's is
            float rim = 1.0 - smoothstep(0.06, 0.24, abs(soil.x - 0.5));
            c = ground * (1.0 - rim * 0.22);
          }
          // contact shadow at the foot of higher neighbours, fading within half a tile
          float rx = 1.0 - smoothstep(0.0, 0.5, 0.5 - w.x);
          float ry = 1.0 - smoothstep(0.0, 0.5, 0.5 - w.y);
          // (a neighbour whose air at this level is under a roof is a cave's mouth, not a wall: no contact
          // shadow toward it)
          #if LITE
            // (the light look's neighbours are the tile itself: no contact shadow, no lip)
            float ao = 1.0;
          #else
            float ax = hx;
            float ay = hy;
            float ad = hd;
            if (caveSize.z > 0.5) {
              if (roofedAir(vec3(tile + vec2(sd.x, 0.0), h0))) ax = h0;
              if (roofedAir(vec3(tile + vec2(0.0, sd.y), h0))) ay = h0;
              if (roofedAir(vec3(tile + sd, h0))) ad = h0;
            }
            float ox = min(max(ax - h0, 0.0), 2.0) * 0.5 * rx;
            float oy = min(max(ay - h0, 0.0), 2.0) * 0.5 * ry;
            float od = min(max(ad - h0, 0.0), 2.0) * 0.5 * rx * ry * (1.0 - max(step(0.5, ax - h0), step(0.5, ay - h0)));
            // a thin dark line along the top of a drop, and a deeper contact shadow at a wall's foot
            float topLip = max(step(0.5, h0 - hx) * (1.0 - smoothstep(0.025, max(0.06, fwidth(g.x)), 0.5 - w.x)), step(0.5, h0 - hy) * (1.0 - smoothstep(0.025, max(0.06, fwidth(g.y)), 0.5 - w.y)));
            c *= 1.0 - topLip * 0.30;
            float ao = 1.0 - 0.75 * clamp(ox + oy + od - ox * oy, 0.0, 1.0);
          #endif
          sunHere = sunLit(g, h0);
          light = lightOf(n, mix(0.55, 1.0, sky), ao, sunHere);
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
                floorSoil = vec4(step(0.5, q0.x), q0.x, step(0.5, q0.y), q0.z) * u00 + vec4(step(0.5, q1.x), q1.x, step(0.5, q1.y), q1.z) * u10
                  + vec4(step(0.5, q2.x), q2.x, step(0.5, q2.y), q2.z) * u01 + vec4(step(0.5, q3.x), q3.x, step(0.5, q3.y), q3.z) * u11;
                floorLevel = (q0.y * z00 + q1.y * z10 + q2.y * z01 + q3.y * z11) / 15.0;
              }
              c = groundMode > 0.5 ? heightColor(vWorld.y) : groundColor(floorSoil, g, detail, floorLevel, none);
            #else
              c = groundMode > 0.5 ? heightColor(vWorld.y) : groundColor(vec4(soil.xyz, 0.0), g, detail, clev, none);
            #endif
            glow = 0.0;
            light = lightOf(n, 0.6, 0.85, 0.0);
            if (caveSize.z > 0.5) {
              float zf = floor(vWorld.y + 0.5);
              float kx = wallAt(tile + vec2(sd.x, 0.0), zf);
              float ky = wallAt(tile + vec2(0.0, sd.y), zf);
              float kd = wallAt(tile + sd, zf);
              float cx = kx * 0.5 * rx;
              float cy = ky * 0.5 * ry;
              float cd = kd * 0.5 * rx * ry * (1.0 - max(step(0.5, kx), step(0.5, ky)));
              caveAo = 1.0 - 0.75 * clamp(cx + cy + cd - cx * cy, 0.0, 1.0);
            }
          }
        } else {
          // a wall: olive-grey cobbled stone (D334), every other level a shade darker; with Markers, a pale ledge
          // at the top of each level over a dark groove at the foot of the next (each at least a
          // pixel wide, and gone where a level is under three pixels); a lip of the top's ground.
          // A ceiling (a run's underside, only on a map with terrain above terrain) is the same stone laid on the
          // level plane, at the same scale: its stones along x, its courses along y, so it never stretches; the
          // level lines, the seams between levels and the lip are the walls' alone.
          bool ceiling = n.y < -0.5;
          vec2 out2 = vec2(n.x, -n.z);
          vec2 air = floor(g + out2 * 0.5);
          float base = heightOf(tileAt(air));
          float y = ceiling ? g.y : vWorld.y;
          float level = floor(vWorld.y + 0.001);
          float fy = y - level;
          float along = abs(n.x) > 0.5 ? g.y : g.x;
          #if LITE
            float k = 0.75;
          #else
            float k = cobble(vec2(along * 1.5 + (vnoise(vec2(along * 0.7, y)) - 0.5) * 0.35, y * 1.6));
          #endif
          float shade = mix(${f(WALL.low)}, ${f(WALL.high)}, clamp(level / 16.0, 0.0, 1.0)) * (mod(level, 2.0) > 0.5 ? ${f(WALL.alternate)} : 1.0);
          vec3 wc = mix(${glColor(WALL.mortar)}, ${glColor(WALL.stone)} * shade * (0.78 + 0.44 * (k - 0.5)), smoothstep(0.1, 0.4, k));
${hook(h, "wall")}          float py = fwidth(y);
          float lines = ceiling ? 0.0 : (1.0 - smoothstep(0.22, 0.34, py)) * ${hook(h, "wallLines", "markers")};
          float lw = max(0.09, 1.2 * py);
          float gw = max(0.035, 0.8 * py);
          wc = mix(wc, ${glColor(WALL.ledge)} * shade, smoothstep(1.0 - lw - py * 0.5, 1.0 - lw + py * 0.5, fy) * lines);
          wc = mix(wc, ${glColor(WALL.groove)}, (1.0 - smoothstep(gw - py * 0.5, gw + py * 0.5, fy)) * lines);
          float lip = ceiling ? 0.0 : 1.0 - smoothstep(0.07, 0.13, h0 - y);
          vec4 s0 = soilOf(d0);
          vec3 top = groundMode > 0.5 ? heightColor(h0) : (s0.x > 0.5 ? ${glColor(GROUND.moistHigh)} : ${glColor(GROUND.dry)} * 0.85);
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
          if (ceiling) light = lightOf(n, 0.5, 0.6, 0.0);
          else {
            float ao = mix(0.5, 1.0, smoothstep(0.0, 1.1, y - base));
            sunHere = sunLit(g + out2 * 0.26, y);
            light = lightOf(n, 1.0, ao, sunHere);
          }
        }
        // a face whose air is under a roof (a cave's floor, walls and ceiling, under an overhang or
        // an arch) takes that air's own light, not its tile top's
        vec3 cave = caveAt(vWorld, n);
        if (cave.z > 0.5) light = caveLightOf(n, cave, sunHere, caveAo);
        c *= light;
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
        // an eruption's heat (D206): the vents and the flows glow, cool to a dark crust, and the
        // crust fades back into the ground; ash dusts the slopes round it
        // (not on the map's outer walls: the mask's edge would stretch down them)
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
          vec3 lava = mix(vec3(1.65, 0.47, 0.035), vec3(0.38, 0.028, 0.013), cooling);
          lava = mix(lava, c * vec3(0.49, 0.46, 0.43), crust);
          c = mix(c, lava, hot * arrival * fade * 0.9);
          float ash = e.b * smoothstep(0.5, 2.4, eruptionAge) * (1.0 - smoothstep(0.5, 6.0, coolingAge));
          c = mix(c, vec3(0.52, 0.49, 0.45), ash * 0.24 * max(0.0, n.y));
        }
        gl_FragColor = vec4(finish(c, vWorld), 1.0);
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
            // (its shores only: a fall into it or over its brink is gone with the water over the cut, fallSheetCut)
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
      /** The textures the current carries, at p: the broken foam's noise, the pale streaks and
       *  badwater's bubbles (the ripples and glints stay where they are: a few noise lookups twice over,
       *  not the whole surface, which a modest GPU felt). */
      void flowingAt(vec2 p, float t, float bad, float fine, out float fn, out float pale, out float bubbles) {
        fn = vnoise(p * 4.0 + vec2(t * 0.3, -t * 0.2));
        pale = smoothstep(0.6, 0.82, vnoise(vec2(p.x * 0.9 + p.y * 0.3, (p.y - p.x * 0.2) * 5.0) + vec2(t * 0.15, t * 0.5)));
        bubbles = bad > 0.01 ? fine * smoothstep(0.93 - 0.1 * bad, 1.03 - 0.1 * bad, vnoise(p * 5.0 + vec2(t * 0.05, -t * 0.08))) * smoothstep(0.55, 0.8, vnoise(p * 1.3 - vec2(0.0, t * 0.04))) : 0.0;
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
        // badwater with it, smoothly, never in streaks or patches (waterPalette.ts WATER_BLEND):
        // its colour (waterBlend), its opacity (waterMurk) and its dull surface, foam and bubbles
        float bad = waterDull(cont);
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
        // body a level or so deep, navy where deep; badwater murky and nearly opaque at any depth,
        // the game's red-brown in its shallows, darker deeper
        float absorb = waterAbsorb(d);
        vec3 murky = badwaterBody(depth);
        vec3 body = cleanWaterBody(d, absorb);
        // a film (a tenth of a level deep or less) is a faint tint over its own ground, building to the
        // body by a quarter of a level deep (waterPalette.ts WATER_FILM): its own depth, not the bank's
        float film = waterFilm(depth);
        float alpha = mix(WATER_FILM_CLEAN, cleanWaterAlpha(absorb), film);
        float foam = 0.0;
        float glints = 0.0;
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
            vec2 q2 = g * 1.6 + vec2(sin(g.y * 0.5), sin(g.x * 0.43)) * 1.5;
            vec2 sl = ripple(q2, t * slow) + 0.6 * ripple(q2 * 1.9 + 7.0, t * 1.3 * slow);
            glints = fine * smoothstep(0.8, 0.9, vnoise(g * 17.0 + vec2(t * 0.6, -t * 0.4)) * vnoise(g * 13.0 - vec2(t * 0.3, t * 0.7)) * 1.6);
            // the foam and pale streaks move with the water's current (D353): drawn at two points
            // carried back along it, each fading in as the other is carried furthest, so neither is
            // seen to start again; still water draws them where they are, as always
            float fn;
            vec2 drift = waterCurrent(g) * 0.65;
            #ifdef CAVES
              if (waterOwnFlow.a > 0.5) drift = (waterOwnFlow.rg * 255.0 - 128.0) / 63.5 * 0.65;
            #endif
            if (dot(drift, drift) < 1e-6 || (${hook(h, "waterOwnSurface", "false")})) flowingAt(g, t, bad, fine, fn, pale, bubbles);
            else {
              float phase = fract(t / 12.0);
              float second = fract(t / 12.0 + 0.5);
              float blend = abs(phase * 2.0 - 1.0);
              float fn2, pale2, bubbles2;
              flowingAt(g - drift * (phase * 12.0), t, bad, fine, fn, pale, bubbles);
              flowingAt(g - drift * (second * 12.0), t, bad, fine, fn2, pale2, bubbles2);
              fn = mix(fn, fn2, blend);
              pale = mix(pale, pale2, blend);
              bubbles = mix(bubbles, bubbles2, blend);
            }
            // calmer from afar, where a pixel spans a ripple (no shimmer)
            float near = 1.0 - smoothstep(0.08, 0.25, fwidth(g.x));
            float calm = 0.07 * near;
            N = normalize(vec3(sl.x * calm, 1.0, -sl.y * calm));
            // the ripples' crests catch the sky: a light teal texture on the dark body (clean water;
            // badwater is dull)
            crest = smoothstep(0.1, 0.85, 0.5 + 0.42 * (sl.x * 0.7 - sl.y * 0.5)) * near * (1.0 - bad);
            // badwater's troughs: the ripples' low parts
            trough = (1.0 - smoothstep(0.15, 0.5, 0.5 + 0.42 * (sl.x * 0.7 - sl.y * 0.5))) * near * bad;
          #endif
          // badwater's opacity (nearly opaque but at its shallow edges), by how bad it is
          alpha = mix(alpha, badwaterAlpha(depth, shore, waterGrazing(V, N)), waterMurk(cont));
          // foam where the water meets the shore, and along the brink where a fall pours over (the
          // whitewater where a fall lands is the fall's own splash: fallMaterial)
          float lip = 1.0;
          if (bitOf(vFlags, 256.0) > 0.5) lip = min(lip, 1.0 - fr.x);
          if (bitOf(vFlags, 512.0) > 0.5) lip = min(lip, fr.x);
          if (bitOf(vFlags, 1024.0) > 0.5) lip = min(lip, 1.0 - fr.y);
          if (bitOf(vFlags, 2048.0) > 0.5) lip = min(lip, fr.y);
          // a thin line along the shore, and (clean water only) broken foam just off it; a film keeps a
          // faint edge, not a pond's foam line
          float filmFoam = mix(WATER_FILM_FOAM, 1.0, film);
          foam += (1.0 - smoothstep(0.03, 0.08, shore)) * mix(${f(WS.shoreFoam)}, 0.45, bad) * filmFoam;
          #if LITE
            foam += (1.0 - smoothstep(0.02, 0.1, lip)) * 0.5 * (1.0 - bad * 0.35);
          #else
            foam += (1.0 - smoothstep(0.06, 0.24 + 0.1 * fn, shore)) * smoothstep(0.4, 0.72, fn + 0.12) * ${f(WS.brokenFoam)} * (1.0 - bad) * filmFoam;
            // the water breaks white over the brink, in a ragged line that runs with it
            float brink = vnoise(vec2((g.x + g.y) * 5.0, t * 1.6)) * 0.6 + vnoise(vec2((g.x - g.y) * 11.0, t * 2.3)) * 0.4;
            foam += (1.0 - smoothstep(0.02, 0.08 + 0.1 * brink, lip)) * (0.4 + 0.45 * brink) * (1.0 - bad * 0.35);
            // (the glints of light, the pale ripples where it flows and badwater's slow glowing bubbles,
            // denser the more of the water is bad: surfaceAt, above)
          #endif
        } else {
          // the water's side: a small step down to lower water streams a little (a fall pours from
          // its lip instead: fallMaterial); against lower ground or at the map's edge, the water's
          // side; see-through between the streaks, so the cliff behind it shows
          float along = abs(n.x) > 0.5 ? g.y : g.x;
          #if LITE
            float s = 0.6;
          #else
            float s = vnoise(vec2(along * 6.0, vWorld.y * 1.3 + t * 2.4)) * 0.6 + vnoise(vec2(along * 13.0, vWorld.y * 2.7 + t * 3.3)) * 0.4;
          #endif
          bool edge = vFlags > 254.5;
          float drop = edge ? 0.0 : vFlags / 30.0;
          float streak = smoothstep(0.35, 0.65, s);
          foam = (0.3 + 0.6 * streak) * smoothstep(0.12, 0.5, drop) * (1.0 - bad * 0.6);
          // a veil of streaks (badwater's dark, with brown streaks) that the cliff shows through; a
          // small step between two waters is barely there; the map's edge shows the water's side
          alpha = edge ? mix(WATER_EDGE, BADWATER_SIDE, bad) : mix(0.16, 0.55, streak) * smoothstep(0.08, 0.25, drop);
          if (alpha < 0.01) discard;
        }
        foam = clamp(foam, 0.0, 1.0);
        vec3 c = waterBlend(body, murky, cont);
        float lit = sunLit(g, vWorld.y);
        vec3 light = skyColor * 1.2 + sunColor * 0.3 * max(dot(N, sunDir), 0.0) * lit;
        c *= light;
        c = mix(c, WATER_CREST * light, crest * WATER_CREST_AMOUNT);
        c = mix(c, badwaterShade(BADWATER_TROUGH, depth) * light, trough * BADWATER_TROUGH_AMOUNT);
        // the sky's reflection, stronger at low angles; pale ripples; the sun's glint and glints
        // (none on a fall: a sheet seen edge-on would mirror the sky in patches)
        float fres = pow(1.0 - max(dot(N, V), 0.0), 4.0) * step(0.5, n.y);
        c = mix(c, WATER_SKY, fres * mix(WATER_REFLECT, BADWATER_REFLECT, bad));
        // pale streaks where it flows (badwater's brownish, so it reads as a flowing liquid too)
        c = mix(c, mix(WATER_PALE, badwaterShade(BADWATER_STREAK, depth), bad), pale * mix(WATER_PALE_AMOUNT, BADWATER_STREAK_AMOUNT, bad));
        float spec = pow(max(dot(reflect(-sunDir, N), V), 0.0), 90.0) * lit;
        c += sunColor * (spec * mix(WATER_SPEC, BADWATER_SPEC, bad) + glints * ${f(WS.glints)} * mix(1.0, BADWATER_GLINTS, bad) * (0.3 + 0.7 * lit));
        c += BADWATER_VEIN * bubbles * bad * BADWATER_BUBBLES;
        c = mix(c, mix(WATER_FOAM, BADWATER_FOAM, bad) * (0.8 + 0.2 * lit), foam);
        if (n.y > 0.5) alpha = mix(alpha, 0.95, max(foam, glints * 0.6));
${hook(h, "water")}        #ifdef CAVES
          // under a roof, the light of the air it stands in, as objects and falls there take it: all the sky at a
          // mouth, a cave's least deep in, and the sun the open air's at a mouth, fading to the cave's own going in
          if (cave.z > 0.5) {
            float ndlRoofed = max(dot(N, sunDir), 0.0);
            vec3 open = skyColor * 1.2 + sunColor * 0.3 * ndlRoofed * lit;
            vec3 under = skyColor * 1.2 * roofedSky(cave.x) + sunColor * 0.3 * ndlRoofed * mix(lit, cave.y, roofedDeep(cave.x));
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
            cc = mix(cc, WATER_SKY, fres * WATER_REFLECT);
            cc += sunColor * (spec * WATER_SPEC + glints * ${f(WS.glints * 0.5)} * (0.3 + 0.7 * lit));
            cc = mix(cc, WATER_FOAM * (0.8 + 0.2 * lit), foam * 0.6);
            cc = mix(cc, WATER_CLEAR_SHORE * (0.85 + 0.15 * lit), line);
            ca = min(0.9, CLEAR_OPACITY + CLEAR_RIPPLE * crest + 0.15 * glints + CLEAR_SHORE_OPACITY * line + 0.3 * foam);
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
          alpha = mix(alpha, 0.85, up * 0.5);
          c = mix(c, WATER_SOURCE_GLOW, hl * 0.45);
          alpha = mix(alpha, 0.9, hl * 0.4);
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
          alpha = mix(alpha, 0.97, lit * 0.9);
        }
        gl_FragColor = vec4(finish(c, vWorld), alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
  });
}

/** Waterfalls (D201, D215; falls.ts): each fall an instance of the shared template (`fallTemplate`),
 *  bent here into its arc. Close up, a ribbon with thickness: its outer face a parabola from the
 *  lip to the pool, its inner face inside it, closed at a free end; from afar (a tile under
 *  FALL_NEAR_PX pixels; always in the light look) a single sheet. Where the lip turns a corner, the
 *  ribbon runs on round an outer corner and stops short at an inner one, meeting the next side's on
 *  the corner's diagonal (falls.ts `END`), so the sheet is one. Streaks rush down it, stretching as
 *  the water speeds up (at one pace everywhere, so lips side by side never slide apart); it breaks
 *  white at the lip, whitens as it falls, churns white at its foot, and frays at a free end. Clean
 *  water is see-through between the streaks (the cliff shows), badwater murky; every colour and
 *  opacity comes from waterPalette.ts (`WATER_GLSL`, `WATER_FALL`, `CLEAR_WATER`). Where it lands,
 *  whitewater: a splash on the pool churning from the foot of the cliff out past the impact line,
 *  and a crown billowing up along the impact line (close up), more for stronger and taller falls, in
 *  the landing zone only; soft white water, with no cells of dark water between patches of foam
 *  (D222: they read as cracked tiles). Clear water (D196, D212) turns a fall to a faint veil; the
 *  game's layers cut it at the slice. */
export function fallMaterial(scene: SceneUniforms, lite = false, h?: ShaderHooks): ShaderMaterial {
  const inset = FALL_SHAPE.inset;
  const S = FALL_SPLASH;
  return new ShaderMaterial({
    defines: { LITE: lite ? 1 : 0 },
    uniforms: scene as unknown as Record<string, { value: unknown }>,
    vertexShader: /* glsl */ `
      attribute vec4 rib;
      attribute vec4 fA;
      attribute vec4 fTop;
      attribute vec4 fShape;
      attribute vec4 fMore;
      uniform float viewHeight;
      uniform float slice;${hook(h, "fallVertexDecl")}
      varying vec4 vRib;
      varying vec4 vFall;
      varying vec4 vEdge;
      varying vec2 vEnds;
      varying vec3 vNormal;
      varying vec3 vWorld;
      /** How far an end runs on past its corner when the water has come o out from the lip
       *  (falls.ts endAlong): on round an outer corner (turn 1), back short of an inner one (turn
       *  -1, by at most "most"), not at all straight on or at a free end. */
      float endRun(float turn, float o, float most) {
        return turn > 0.5 ? o : turn < -0.5 ? -min(o, most) : 0.0;
      }
      void main() {
        // the side (east, west, north, south) and how each end goes on (falls.ts END)
        float k = mod(fA.z, 4.0);
        float endA = mod(floor(fA.z / 4.0 + 0.01), 4.0);
        float endB = floor(fA.z / 16.0 + 0.01);
        float freeA = abs(endA - ${f(END.free)}) < 0.5 ? 1.0 : 0.0;
        float freeB = abs(endB - ${f(END.free)}) < 0.5 ? 1.0 : 0.0;
        float turnA = abs(endA - ${f(END.outward)}) < 0.5 ? 1.0 : abs(endA - ${f(END.inward)}) < 0.5 ? -1.0 : 0.0;
        float turnB = abs(endB - ${f(END.outward)}) < 0.5 ? 1.0 : abs(endB - ${f(END.inward)}) < 0.5 ? -1.0 : 0.0;
        float most = turnA < -0.5 && turnB < -0.5 ? ${f(END.bothInward)} : ${f(END.inwardMost)};
        vec3 O = k < 0.5 ? vec3(1.0, 0.0, 0.0) : k < 1.5 ? vec3(-1.0, 0.0, 0.0) : k < 2.5 ? vec3(0.0, 0.0, -1.0) : vec3(0.0, 0.0, 1.0);
        vec3 Y = vec3(0.0, 1.0, 0.0);
        vec3 T = cross(Y, O);
        vec3 corner = vec3(fA.x, 0.0, fA.y);
        float u = rib.x;
        float w = rib.y;
        float inner = rib.z;
        float kind = rib.w;
        // close up or from afar: the pixels a tile takes on screen at the lip
        vec4 at = projectionMatrix * viewMatrix * modelMatrix * vec4(corner + T * 0.5 + Y * fTop.x, 1.0);
        float perUnit = 0.5 * viewHeight * projectionMatrix[1][1] / max(at.w, 0.001);
        #if LITE
          bool near = false;
        #else
          bool near = perUnit >= ${f(FALL_NEAR_PX)};
        #endif
        // the parts of the other view, and the ends where the sheet runs on: out of the clip volume
        bool off = kind < 2.5 ? (!near || (kind > 0.5 && kind < 1.5 && freeA < 0.5) || (kind > 1.5 && freeB < 0.5)) : kind < 3.5 ? near : kind > 4.5 ? !near : false;
        // the game's layers (D207, cutWater.ts fallSheetCut): a fall whose lip stands over the cut is gone, its landing
        // kept where its pool is below the cut (the fragment shader drops what stands over it)
        if (kind < 3.5 && max(fTop.x, fTop.y) > slice + ${f(CUT_SLACK)}) off = true;
        if (off) {
          vRib = vec4(0.0);
          vFall = vec4(0.0);
          vEdge = vec4(0.0);
          vEnds = vec2(0.0);
          vNormal = Y;
          vWorld = vec3(0.0);
          gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
          return;
        }
        float top = mix(fTop.x, fTop.y, u);
        float land = mix(fTop.z, fTop.w, u);
        float X = max(mix(fShape.x, fShape.y, u), 0.0001);
        float th = mix(fShape.z, fShape.w, u);
        float h = max(top - land, 0.01);
        float flow = mix(fA.w, fMore.w, u);
        float bad = mix(fMore.x, fMore.y, u);
        float roomB = floor(fMore.z / 4.0 + 0.01);
        float room = mix(fMore.z - 4.0 * roomB, roomB, u);
        float strength = clamp(sqrt(flow), 0.25, 1.6);
        // along the lip, in tiles, continuous from one fall to the next along a side
        float base = dot(corner, T);
        // a free end stands a little in from the tile's corner, and a thin trickle well in: it
        // narrows
        float narrow = ${f(inset)} + ${f(FALL_SHAPE.narrow)} * (1.0 - smoothstep(0.05, 0.5, flow));
        float ea = freeA * narrow;
        float eb = freeB * narrow;
        vec3 p;
        vec3 n;
        if (kind > 4.5) {
          // the crown: an arch of whitewater over the impact line, from its foot toward the cliff
          // (never behind it) over its top to its foot out on the pool (never past the pool)
          float r = min(${f(S.crown[3])}, ${f(S.crown[0])} + ${f(S.crown[1])} * strength + ${f(S.crown[2])} * min(h, 8.0));
          r *= mix(${f(S.crownTrickle)}, 1.0, smoothstep(0.05, 0.45, flow));
          float rb = max(0.0, min(r, X - ${f(S.back)}));
          float rf = max(0.0, min(r, room - ${f(S.edge)} - X));
          float ch = min(${f(S.crownTall)} * r, ${f(S.crownOfDrop)} * h);
          float ang = w * 3.14159265;
          float cs = cos(ang);
          float sn = sin(ang);
          float o = X - (cs > 0.0 ? rb : rf) * cs;
          float ue = u < 0.5 ? ea - endRun(turnA, o, most) : 1.0 - eb + endRun(turnB, o, most);
          p = corner + T * ue + O * o + Y * (land + 0.012 + ch * sn);
          n = normalize(O * (-cs / max(r, 0.01)) + Y * (sn / max(ch, 0.01)));
          vRib = vec4(base + ue, w, sn, kind);
          vFall = vec4(flow, h, r, bad);
          vEdge = vec4(0.0, freeA, freeB, 0.0);
          vEnds = vec2(ue - ea, 1.0 - eb - ue);
        } else if (kind > 3.5) {
          // the splash on the pool: from the foot of the cliff out past the impact line, and past a
          // free end, never past the pool
          float spread = ${f(S.base)} + ${f(S.reach)} * X + ${f(S.drop)} * min(h, 6.0);
          float o0 = ${f(S.back)};
          float o1 = max(o0 + 0.05, min(room - ${f(S.edge)}, X + spread));
          float o = mix(o0, o1, w);
          float sa = ea - freeA * ${f(S.side)} - endRun(turnA, o, most);
          float sb = 1.0 - eb + freeB * ${f(S.side)} + endRun(turnB, o, most);
          float us = u < 0.5 ? sa : sb;
          p = corner + T * us + O * o + Y * (land + 0.012);
          n = Y;
          vRib = vec4(base + us, o - X, w, kind);
          vFall = vec4(flow, h, spread, bad);
          vEdge = vec4(o1 - o, freeA, freeB, X);
          vEnds = vec2(us - sa, sb - us);
        } else {
          // the arc (falls.ts arcPoint): the outer face a parabola from the lip, level there, to the
          // landing; the inner a thickness inside it, thinning as it falls, never behind the cliff
          // or below the pool
          vec2 tang = normalize(vec2(X, -2.0 * h * w));
          vec2 nout = vec2(-tang.y, tang.x);
          vec2 q = vec2(X * w, top - h * w * w);
          q -= nout * th * (1.0 - ${f(FALL_SHAPE.thinning)} * w) * inner;
          q.x = max(q.x, 0.0);
          q.y = max(q.y, land);
          float o = q.x + ${f(FALL_SHAPE.off)};
          // its ends: at a free end (and its closing face) inset; round a corner, on to the
          // corner's diagonal (falls.ts endAlong)
          float ue = kind > 0.5 && kind < 2.5 ? (u < 0.5 ? ea : 1.0 - eb) : (u < 0.5 ? ea - endRun(turnA, o, most) : 1.0 - eb + endRun(turnB, o, most));
          p = corner + T * ue + O * o + Y * q.y;
          vec3 no = O * nout.x + Y * nout.y;
          n = kind < 0.5 ? (inner > 0.5 ? -no : no) : kind < 1.5 ? -T : kind < 2.5 ? T : no;
          // how far down the arc: its length from the lip (falls.ts arcLength)
          float r = sqrt(X * X + 4.0 * h * h * w * w);
          float arc = 0.5 * (w * r + X * X / (2.0 * h) * asinh(2.0 * h * w / X));
          vRib = vec4(base + ue, arc, q.y - land, kind);
          vFall = vec4(flow, h, X, bad);
          vEdge = vec4(inner, freeA, freeB, 0.0);
          vEnds = vec2(ue - ea, 1.0 - eb - ue);
        }
${hook(h, "fallVertex")}        vNormal = n;
        vec4 wp = modelMatrix * vec4(p, 1.0);
        vWorld = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec4 vRib;
      varying vec4 vFall;
      varying vec4 vEdge;
      varying vec2 vEnds;
      varying vec3 vNormal;
      varying vec3 vWorld;
      ${common(h)}
      ${WATER_GLSL}${CAVE_POINT}
      void main() {
        // the game's layers: a fall above the slice is cut away (one whose lip stands over it keeps only its landing:
        // the vertex shader)
        if (vWorld.y > slice + ${f(CUT_SLACK)}) discard;
        float kind = vRib.w;
        float along = vRib.x;
        float flow = vFall.x;
        float h = vFall.y;
        float cont = clamp(vFall.w, 0.0, 1.0);
        float bad = waterDull(cont);
        float t = time;
        vec2 g = vec2(vWorld.x, -vWorld.z);
        vec3 N = ${hook(h, "fallNormal", "normalize(vNormal)")};
        vec3 V = normalize(cameraPosition - vWorld);
        if (dot(N, V) < 0.0) N = -N;
        float lit = sunLit(g, vWorld.y);
        vec3 light = skyColor * 1.15 + sunColor * 0.4 * max(dot(N, sunDir), 0.0) * lit;
        #ifdef CAVES
          // a fall under a roof: the light of the air it pours through
          vec3 cave = caveAirAt(vWorld);
          // (the sun the open air's at a mouth, fading to the cave's own going in, as the ground's does)
          if (cave.z > 0.5) light = skyColor * 1.15 * roofedSky(cave.x) + sunColor * 0.4 * max(dot(N, sunDir), 0.0) * mix(lit, ${hook(h, "roofedSun", "cave.y")}, roofedDeep(cave.x));
        #endif
        float strength = clamp(sqrt(flow), 0.25, 1.6);
        float weak = smoothstep(0.05, 0.45, flow);
        // the patterns fade to their mean where a pixel spans several (no shimmer from afar)
        float fine = 1.0 - smoothstep(0.06, 0.25, fwidth(along));
        // how far in from a free end
        float end = min(mix(9.0, vEnds.x, vEdge.y), mix(9.0, vEnds.y, vEdge.z));
        // (white water stays bright in the cliff's shadow: it catches the sky)
        vec3 foamColour = mix(WATER_FOAM, BADWATER_FOAM, bad) * (0.92 + 0.08 * lit);
        // whitewater where it lands: more for stronger and taller falls
        float amount = clamp(0.78 + 0.2 * strength + 0.04 * min(h, 6.0), 0.75, 1.0) * (1.0 - 0.3 * bad);
        // (D324, feedback items 4 and 2: a one-level spill is gentle, and each step of a cascade holds
        // its whitewater down, so steps never stack into a white wall)
        float gentle = 1.0 - smoothstep(1.0, 2.2, h);
        amount *= mix(0.86, 0.5, gentle);
        vec3 c;
        float alpha;
        if (kind > 4.5) {
          // the crown: whitewater thrown up and out along the impact line, billowing, with spray
          // rising from it, ragged at its top
          float swirl = vRib.y;
          float up = vRib.z;
          #if LITE
            float bil = 0.6;
            float spray = 0.5;
          #else
            float b1 = vnoise(vec2(along * 5.0, swirl * 5.0 - t * 1.4 - up * 1.5));
            float b2 = vnoise(vec2(along * 12.0 + 3.7, swirl * 11.0 - t * 2.6 + up * 3.0));
${hook(h, "crownNoise")}            float bil = mix(0.6, 0.6 * b1 + 0.4 * b2, fine);
            float spray = mix(0.5, vnoise(vec2(along * 15.0 + 1.3, up * 2.2 - t * 2.4)), fine);
          #endif
          // (soft-edged billows, D222: never hard cells with the pool showing between them)
          float foam = smoothstep(0.02 + 0.4 * up, 0.34 + 0.42 * up, bil);
          foam = max(foam, (1.0 - smoothstep(0.0, 0.4, up)) * (0.55 + 0.45 * bil));
          foam = max(foam, smoothstep(0.52, 0.78, spray) * (1.0 - smoothstep(0.35, 1.0, up)) * 0.85) * amount;
          // (ragged at a free end)
          foam *= smoothstep(0.0, 0.25, end + 0.15 * (bil - 0.6)) * mix(0.7, 1.0, weak);${hook(h, "crownFoam")}
          c = mix(waterBlend(WATER_TEAL, BADWATER_BODY, cont), foamColour, FALL_WHITEWATER_TINT);
          alpha = foam * FALL_FOAM * FALL_WHITEWATER;
        } else if (kind > 3.5) {
          // the splash: white along the impact line (its edge ragged), churning back to the foot of
          // the cliff, and soft white water drifting out past it, thinning as it goes and fading
          // at its edges. Soft all through (D222): a milky froth, denser and thinner in soft
          // patches, never cells with dark water between them (they read as cracked tiles)
          float d = vRib.y;
          float X = vEdge.w;
          float spread = vFall.z;
          #if LITE
            float churn = 0.6;
            float blot = 0.6;
            float ragged = 0.5;
          #else
            float churn = vnoise(vec2(along * 4.0, d * 4.0 - t * 1.3)) * 0.6 + vnoise(vec2(along * 9.0 + 5.0, d * 9.0 - t * 2.1)) * 0.4;
            churn = mix(0.6, churn, fine);
            float blot = mix(0.6, vnoise(vec2(along * 1.7 + 4.0, d * 1.9 - t * 0.45)), fine);
            float ragged = mix(0.5, vnoise(vec2(along * 2.3, 3.7 + t * 0.25)), fine);
          #endif
          float cw = (0.4 + 0.35 * strength) * (0.7 + 0.6 * ragged);
          float core = 1.0 - smoothstep(0.4 * cw, cw, abs(d));
          float tail = d > 0.0 ? 1.0 - smoothstep(0.1 * spread, spread, d) : 1.0 - 0.35 * smoothstep(0.0, X + 0.05, -d);
          float froth = smoothstep(${f(S.froth[0])}, ${f(S.froth[1])}, 0.55 * blot + 0.45 * churn);
          float broken = pow(tail, 0.7) * mix(${f(S.frothFloor)}, 1.0, froth);${hook(h, "splashFroth")}
          float foam = (core * (0.85 + 0.15 * churn) + (1.0 - core) * broken) * amount;
          // (fading at its edges: raggedly past a free end, toward the cliff, and at its outer edge)
          foam *= smoothstep(0.0, 0.32, end + 0.25 * (0.55 * blot + 0.45 * churn - 0.6)) * smoothstep(0.0, 0.1, d + X - ${f(S.back)}) * smoothstep(0.0, 0.3, vEdge.x);${hook(h, "splashFoam")}
          c = mix(waterBlend(WATER_TEAL, BADWATER_BODY, cont), foamColour, FALL_WHITEWATER_TINT);
          alpha = foam * FALL_FOAM * FALL_WHITEWATER;
        } else {
          float arc = vRib.y;
          float above = vRib.z;
          // the water speeds up as it falls: the streaks stretch and rush down it
          float phi = 2.0 * (sqrt(arc + 0.3) - ${f(Math.round(Math.sqrt(0.3) * 1e6) / 1e6)});
          #if LITE
            float streak = 0.55;
            float rag = 0.5;
          #else
            // long strands, fine across the fall
            float s1 = vnoise(vec2(along * 9.0, phi * 1.4 - t * 3.4));
            float s2 = vnoise(vec2(along * 23.0 + 3.1, phi * 2.6 - t * 4.8));
            float streak = mix(0.55, smoothstep(0.32, 0.7, 0.55 * s1 + 0.45 * s2), fine);
            float rag = mix(0.5, vnoise(vec2(along * 6.0 + 11.0, t * 0.7)), fine);
          #endif
          // white where it breaks over the brink (a ragged band), whiter as it falls, and churning
          // white at its foot; a thin trickle less so
          float lip = 1.0 - smoothstep(0.08 + 0.1 * rag, 0.3 + 0.2 * rag + 0.1 * strength, arc);
          float aerate = smoothstep(0.2, 2.0, arc);
          float foot = 1.0 - smoothstep(0.05, 0.55 + 0.35 * strength, above);
          // (D324: the falling sheet reads as teal water first, its white only in streaks, at the brink
          // and at the foot; never a white curtain)
          float whiteStreak = smoothstep(0.43, 0.82, streak);
          #if !LITE
            // (and fine threads along it, as the game's falls have)
            float thread = vnoise(vec2(along * 37.0 + sin(phi * 1.2) * 0.5, phi * 0.46 - t * 2.3));
            whiteStreak = clamp(whiteStreak * 0.68 + smoothstep(0.48, 0.76, thread) * 0.55, 0.0, 1.0);
          #endif
          float foam = clamp(whiteStreak * (0.22 + 0.3 * aerate) + lip * 0.7 + foot * (0.6 + 0.25 * streak), 0.0, 1.0);
          foam *= (1.0 - 0.3 * bad) * mix(0.7, 1.0, weak) * mix(1.0, 0.55, gentle);
          // a body, clean water's light shallows or badwater's crimson, its streaks a lighter teal
          // (orange-red on badwater), little white (D334); thicker where seen edge-on (where it
          // curves over the brink, and at its ends)
          vec3 body = ${hook(h, "fallBody", "waterBlend(WATER_SHALLOW, badwaterBody(0.25), cont)")};
          c = mix(body, mix(FALL_TEAL, FALL_BAD_STREAK, bad), whiteStreak * 0.78) * light;
          c = mix(c, foamColour, foam * 0.18);
          float edgeOn = 1.0 - max(dot(N, V), 0.0);
          alpha = mix(FALL_CLEAR, FALL_STREAK, streak);
          alpha = mix(alpha, BADWATER_FALL, waterMurk(cont));
          alpha = mix(alpha, FALL_FOAM, foam);
          alpha = mix(alpha, 1.0, edgeOn * edgeOn * 0.5) * mix(0.6, 1.0, weak);
          // the inner face, behind the outer; a free end frays
          alpha *= mix(1.0, FALL_INNER, vEdge.x);
          alpha *= kind > 0.5 && kind < 2.5 ? 0.8 : mix(0.6, 1.0, smoothstep(0.0, 0.15, end));
        }
${hook(h, "fallEnd")}        // clear water (D196, D212; waterPalette.ts CLEAR_WATER), as the water has it: all of it with
        // T, else round the brush while it paints a submerged bed. A clean fall turns to a faint
        // veil (the cliff and the bed show); a badwater fall keeps its colour, half see-through
        float clr = clearWater;
        if (clearAround.w > 0.5) clr = max(clr, 1.0 - smoothstep(clearAround.z, clearAround.z + CLEAR_FADE, length(g - clearAround.xy)));
        if (clr > 0.001) {
          float badish = max(bad, smoothstep(0.05, 0.5, cont));
          alpha = mix(alpha, mix(alpha * CLEAR_FALL, min(alpha, CLEAR_BAD_OPACITY), badish), clr);
        }
        if (alpha < 0.01) discard;
        gl_FragColor = vec4(finish(c, vWorld), alpha);
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
      varying vec3 vDir;${hook(h, "decl")}
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
        gl_FragColor = vec4(c, 1.0);
      }
    `,
    depthTest: false,
    depthWrite: false,
  });
}

/** Where a model's parts for close up give way to its parts for afar (`lod`, entities3d.ts): at this
 *  many pixels a unit of the model takes on screen (a ruin's storey from afar is a lattice of open
 *  cells in the near skeleton's own muted colour, D305, not a solid painted block). */
export const RUIN_NEAR_PX = 9;

/** The far ruin block's lattice (D305): cells this many to a world unit, on whichever two axes
 *  aren't the face's normal (so it reads consistently on every face, without UVs). */
export const RUIN_LATTICE_SCALE = 3.2;

/** Instanced objects: each vertex's own colour times the instance's tint, lit like the terrain,
 *  darker toward the model's foot, and in the terrain's shadow where it stands in one. An
 *  instance with a minimum size (`grow`: pixels a unit of the model must take at least, how far
 *  it rises for each time it grows, and the most it grows) is drawn larger when it would be
 *  smaller. A vertex's `lod` says which view its part belongs to: 0 any, 1 close up (a unit of the
 *  model takes RUIN_NEAR_PX pixels or more), 2 from afar; the others are dropped (the light look
 *  draws every part it has: its models have none for afar). */
export function objectMaterial(scene: SceneUniforms, lite = false, h?: ShaderHooks): ShaderMaterial {
  return new ShaderMaterial({
    defines: { LITE: lite ? 1 : 0 },
    uniforms: scene as unknown as Record<string, { value: unknown }>,
    vertexShader: /* glsl */ `
      attribute vec3 pcolor;
      attribute vec3 grow;
      attribute float lod;
      uniform float viewHeight;
      uniform float markers;${hook(h, "objectVertexDecl")}
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
        #ifdef USE_INSTANCING_COLOR
          vColor *= instanceColor;
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
      varying vec3 vNormal;
      varying vec3 vWorld;
      varying float vFoot;
      varying float vLod;
      ${common(h)}${CAVE_POINT}
      void main() {
        // the game's layers: what stands above the slice is cut away
        if (vWorld.y > slice + 0.02) discard;
        // a ruin's far block (D305): a lattice of open cells so it reads as a framework, not a
        // solid box, from any face (the two world axes across the face, whichever the normal
        // isn't closest to; cheap, no extra geometry or UVs)
        if (vLod > 1.5) {
          vec3 an = abs(normalize(vNormal));
          vec2 uv = an.x >= an.y && an.x >= an.z ? vWorld.yz : (an.y >= an.z ? vWorld.xz : vWorld.xy);
          float strut = 0.16;
          bool onStrut = fract(uv.x * ${f(RUIN_LATTICE_SCALE)}) < strut || fract(uv.y * ${f(RUIN_LATTICE_SCALE)}) < strut;
          if (!onStrut) discard;
        }
        vec3 n = normalize(vNormal);
        float ao = mix(0.72, 1.0, smoothstep(0.0, 0.45, vFoot));
        float lit = sunLit(vec2(vWorld.x, -vWorld.z), vWorld.y);
        // soft (wrapped) sun light, kinder to leaves
        float ndl = clamp(${hook(h, "objectSun", "dot(n, sunDir) * 0.75 + 0.25")}, 0.0, 1.0);
        vec3 light = skyColor * ${hook(h, "skyLight")}1.15 * (0.8 + 0.2 * n.y) * ao + sunColor * 0.5 * ndl * lit;
        #ifdef CAVES
          // under a roof (a tree, a ruin, a source, a slope in a cave or under an overhang): the light of the air it
          // stands in, as the ground round it takes it (roofedSky), deeper in never below a cave's least
          vec3 cave = caveAirAt(vWorld + n * 0.05);
          // (the sun the open air's at a mouth, fading to the cave's own going in, as the ground's does)
          if (cave.z > 0.5) light = skyColor * 1.15 * (0.8 + 0.2 * n.y) * ao * max(${f(CAVE_SKY_FLOOR)} * roofedDeep(cave.x), ${hook(h, "skyLight")}roofedSky(cave.x)) + sunColor * 0.5 * ndl * mix(lit, ${hook(h, "roofedSun", "cave.y")}, roofedDeep(cave.x));
        #endif
        gl_FragColor = vec4(finish(${hook(h, "objectFinal", "vColor * light")}, vWorld), 1.0);
      }
    `,
  });
}
