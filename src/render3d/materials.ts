// The 3D view's shaders (Map look, PLAN §20 D86, D110 and D114; D45 before it), tuned to Kyler's
// in-game reference screenshots. One light for terrain, water and objects: a warm sun from the
// north-west (the 2D preview's hillshade direction) with soft shadows baked when the mesh is built
// (light.ts), a cool sky light (violet in the earth's shadows) dimmed by the sky each point sees,
// then a light blue-grey haze over distant ground and a warm grade. Shadows keep four fifths of the
// light, so the soils keep their order of lightness in shadow too (D114). Every texture is made by a shader:
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
import { CONTAMINATION as CT, CONTAMINATION_OUTLINE as OUTLINE, GROUND, HATCH, HEIGHT_RAMP, LIGHT, MINE, SKY, WALL, WATER_SURFACE as WS, type Rgb } from "./palette";
import { END, FALL_NEAR_PX, FALL_SHAPE, FALL_SPLASH } from "./falls";
import { WATER_GLSL } from "./waterPalette";
import { SHADOW_OFFSET, SHADOW_RES, SHADOW_SCALE } from "./light";

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
   *  pointer's water comes from (D196). */
  sourceTex: { value: DataTexture };
}

export function sceneUniforms(W: number, H: number, tile: DataTexture, light: DataTexture, overlay: DataTexture, marks: DataTexture, edges: DataTexture = overlayTexture(1, 1), sites: DataTexture = overlayTexture(1, 1)): SceneUniforms {
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
  };
}

const f = (v: number) => (Number.isInteger(v) ? `${v}.0` : String(v));
const glColor = (c: Rgb) => `vec3(${c.map((v) => f(Math.round(v * 1000) / 1000)).join(", ")})`;

/** The pattern texture: its size, and the cells of each pattern across it (each tiles). */
const PATTERN_SIZE = 512;
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
  const rt = new WebGLRenderTarget(PATTERN_SIZE, PATTERN_SIZE, { wrapS: RepeatWrapping, wrapT: RepeatWrapping, magFilter: LinearFilter, minFilter: LinearMipmapLinearFilter, generateMipmaps: true, depthBuffer: false });
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
        vec3 k = voronoi(vUv * kp, kp, vec2(1.0, 1.5), 0.75);
        float mortar = smoothstep(0.05, 0.16, k.y - k.x);
        float stone = mortar * (0.5 + 0.5 * k.z) * (0.9 + 0.2 * valueNoise(vUv * kp * 3.0, kp * 3.0));
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
  const bad = (i: number) => (tiles[i * 4 + 1] & 15) > 0;
  const wet = (i: number) => tiles[i * 4 + 3] > 0;
  const sides: [number, number, number][] = [[1, 0, 1], [-1, 0, 2], [0, 1, 4], [0, -1, 8]];
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const b = bad(i);
      let bits = 0;
      for (const [dx, dy, bit] of sides) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const j = ny * W + nx;
        if (bad(j) === b) continue;
        if (b ? !wet(i) : wet(j)) bits |= bit;
      }
      out[i * 4] = bits;
    }
  return out;
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
  /** After the ground's colour, before contamination is layered over it (c, g). */
  groundVariation?: string;
  /** Before groundColor returns (c: its colour with contamination; glow). */
  groundEnd?: string;
  /** After the ground's colour at a top (ground, soil, glow, d0, g). */
  groundTop?: string;
  /** In a wall, before its level lines (wc, n, along, y, k, shade). */
  wall?: string;
  /** How strong the wall's level lines are (an expression; Standard: `markers`). */
  wallLines?: string;
  /** After the light, before the overlays (c, light, n, h0, d0). */
  lit?: string;
  // the water
  /** Functions after the shared water palette's GLSL (they may use it). */
  waterDecl?: string;
  /** A water surface of its own, before clear water (c, alpha, foam, n, g, depth, cont, shore, V, lit). */
  water?: string;
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
  // the sky
  /** At the sky's end (c, d). */
  sky?: string;
}

const hook = (h: ShaderHooks | undefined, k: keyof ShaderHooks, standard = ""): string => h?.[k] ?? standard;

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
  hover: { value: Vector3 };
  /** 0: ground coloured by soil (moisture), 1: by height. */
  groundMode: { value: number };
}

/** `lite`: a lighter look for browsers that render in software: no patterns, shadows or soil
 *  blending. */
export function terrainMaterial(scene: SceneUniforms, lo: number, hi: number, lite = false, h?: ShaderHooks): ShaderMaterial {
  const own: TerrainUniforms = {
    heightRange: { value: new Vector2(lo, hi) },
    hover: { value: new Vector3(0, 0, 0) },
    groundMode: { value: 0 },
  };
  return new ShaderMaterial({
    defines: { LITE: lite ? 1 : 0 },
    uniforms: { ...scene, ...own } as unknown as Record<string, { value: unknown }>,
    vertexShader: /* glsl */ `
      uniform float slice;
      varying vec3 vWorld;
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
      uniform vec3 hover;
      uniform float groundMode;
      varying vec3 vWorld;
      varying vec3 vNormal;
      ${common(h)}
      vec4 tileAt(vec2 t) {
        t = clamp(t, vec2(0.0), mapSize - 1.0);
        return texture2D(tileTex, (t + 0.5) / mapSize);
      }
      float heightOf(vec4 d) { return floor(d.r * 255.0 + 0.5); }
      /** moisture level (0–15), contamination (0–15), under water (0/1), sky (0–1) */
      vec4 soilOf(vec4 d) {
        float g = floor(d.g * 255.0 + 0.5);
        float m = floor(g / 16.0);
        return vec4(m, g - m * 16.0, d.a > 0.002 ? 1.0 : 0.0, d.b);
      }
      vec3 heightColor(float z) {
        float t = clamp((z - heightRange.x) / max(1.0, heightRange.y - heightRange.x), 0.0, 1.0);
        return mix(${glColor(HEIGHT_RAMP.low)}, ${glColor(HEIGHT_RAMP.high)}, t);
      }
      /** The ground's colour from its soil (moist, moisture level, contaminated, under water) and
       *  its contamination level (0–1), and in glow the light of the contamination's veins. Noise
       *  shapes the edges between soils (grass bleeds onto the earth in patches) and their grain. */
      vec3 groundColor(vec4 s, vec2 g, float detail, float clev, out float glow) {
        #if LITE
          // (no patterns: contamination tints the ground a little, rust on earth, dark red on grass)
          glow = 0.0;
          vec3 lc = s.x > 0.5 ? mix(${glColor(GROUND.moistLow)}, ${glColor(GROUND.moistHigh)}, clamp((s.y - 1.0) / 9.0, 0.0, 1.0)) : ${glColor(GROUND.dry)};
          if (s.z > 0.5) lc = mix(lc, s.x > 0.5 ? ${glColor(GROUND.contaminatedWet)} : ${glColor(GROUND.contaminated)}, 0.25 + 0.3 * clev);
          return s.w > 0.5 ? ${glColor(GROUND.underwater)} : lc;
        #endif
        float n1 = vnoise(g * 1.3);
        float n2 = vnoise(g * 4.1 + 17.0);
        float n3 = vnoise(g * 19.0 + 5.0) - 0.5;
        // broad patches, a few tiles to a dozen across, that read from afar
        float b1 = vnoise(g * 0.09 + 31.0);
        float b2 = vnoise(g * 0.23 + 57.0);
        float b3 = vnoise(g * 0.55 + 83.0);
        vec2 dry = cracks(g * 1.9);
        vec2 rust = cracks(g * 1.2 + 11.3);
        // grass bleeds onto the earth in ragged patches
        float edge = (n1 - 0.5) * 0.5 + (n2 - 0.5) * 0.45 + (b3 - 0.5) * 0.4;
        float moist = ${hook(h, "moist", "smoothstep(0.42, 0.58, s.x + edge)")};
        float bad = ${hook(h, "bad", "smoothstep(0.4, 0.6, s.z + edge * 0.6)")};
        float wet = smoothstep(0.4, 0.6, s.w + (n1 - 0.5) * 0.2);
        // dry: cracked earth, grey-brown, drifting in broad patches to a cooler grey and a warmer
        // brown and in lightness; each plate its own shade; the crack network is broken here and
        // there, as real cracks are, and fainter from afar
        float open = smoothstep(0.2, 0.55, vnoise(g * 0.8 + 3.7));
        vec3 c = mix(${glColor(GROUND.dryCool)}, ${glColor(GROUND.dry)}, smoothstep(0.28, 0.68, b1));
        c = mix(c, ${glColor(GROUND.dryWarm)}, smoothstep(0.5, 0.8, b2) * 0.6);
        c *= (0.97 + 0.16 * (b3 - 0.5) + 0.08 * (n1 - 0.5)) * (0.96 + 0.05 * (dry.y - 0.5) + detail * 0.07 * n3);
        c = mix(c, ${glColor(GROUND.crack)}, dry.x * open * (0.4 + 0.25 * detail));
        // moist: grass, a muted yellowish green, deeper by the water, in lighter and deeper patches
        // and darker blotches; up close, clumps a few to a tile with yellower tips, and blades
        vec3 grass = mix(${glColor(GROUND.moistLow)}, ${glColor(GROUND.moistHigh)}, clamp((s.y - 1.0) / 9.0, 0.0, 1.0));
        grass = mix(grass, grass * vec3(0.86, 0.94, 0.86), smoothstep(0.45, 0.75, b2));
        float blot = smoothstep(0.62, 0.82, vnoise(g * 0.7 + 5.3));
        float tuft = vnoise(g * 3.3 + 21.0) - 0.5;
        float blade = vnoise(vec2(g.x * 9.0 + g.y * 3.0, g.y * 9.0 - g.x * 3.0) + 40.0) - 0.5;
        grass = mix(grass, grass * vec3(1.1, 1.04, 0.78), smoothstep(0.05, 0.35, tuft) * 0.6);
        float tex = 1.0 + 0.16 * tuft + (0.14 * blade + 0.2 * n3) * detail;
        c = mix(c, grass * (0.84 + 0.18 * b1 + 0.08 * (n1 - 0.5)) * tex * (1.0 - 0.12 * blot), moist);${hook(h, "groundVariation")}
        // contamination: a layer over the ground, as in the game (palette.ts's contaminationVeins
        // says the same, for the tests). The ground keeps its own look; red-orange veins run over
        // it, more of them and brighter the more contaminated: on dry earth its own cracks glow
        // orange in rust rims, through grass run dark red veins; a finer network joins the more
        // contaminated; the soil round them is stained a little; from afar, where the veins are too
        // fine to see, they tint the ground instead (rust on earth, dark red on grass)
        float lvl = clamp(clev, 0.0, 1.0);
        float reach = mix(${f(CT.reach[0])}, ${f(CT.reach[1])}, lvl);
        float gate = smoothstep(0.9 - reach, 1.1 - reach, vnoise(g * 0.9 + 61.0));
        vec2 fineNet = cracks(g * 3.1 + 7.7);
        float fine = smoothstep(${f(CT.fineFrom)}, 1.0, lvl);
        float onDry = bad * (1.0 - moist) * (1.0 - wet);
        float onGrass = bad * moist * (1.0 - wet);
        float veinD = max(dry.x * gate, fineNet.x * fine * 0.8) * onDry;
        float veinW = max(rust.x * gate, fineNet.x * fine * 0.7) * onGrass;
        float stain = mix(${f(CT.stain[0])}, ${f(CT.stain[1])}, lvl);
        // (the veins are a few hundredths of a tile wide: they fade once a pixel spans that much)
        float cover = mix(${f(CT.cover[0])}, ${f(CT.cover[1])}, lvl) * smoothstep(0.02, 0.1, fwidth(g.x));
        c = mix(c, mix(${glColor(GROUND.contaminated)}, ${glColor(GROUND.contaminatedGrass)}, moist), stain * bad * (1.0 - wet));
        c = mix(c, mix(${glColor(GROUND.contaminated)}, ${glColor(GROUND.contaminatedWet)}, moist), cover * bad * (1.0 - wet));
        c = mix(c, ${glColor(GROUND.contaminated)} * ${f(CT.rim)}, veinD);
        c = mix(c, ${glColor(GROUND.contaminatedWet)}, veinW);
        // (the glow is added after the light: the veins' cores, narrower than their rims)
        glow = smoothstep(0.4, 0.95, veinD) * mix(${f(CT.glowDry[0])}, ${f(CT.glowDry[1])}, lvl) + smoothstep(0.35, 0.9, veinW) * mix(${f(CT.glowWet[0])}, ${f(CT.glowWet[1])}, lvl);
${hook(h, "groundEnd")}        return mix(c, ${glColor(GROUND.underwater)} * (0.9 + 0.15 * n2), wet);
      }
      void main() {
        vec3 n = normalize(vNormal);
        vec3 p = vWorld - n * 0.01;
        vec2 g = vec2(p.x, -p.z);
        vec2 tile = floor(g);
        vec4 d0 = tileAt(tile);
        float h0 = heightOf(d0);
        float detail = 1.0 - smoothstep(0.04, 0.16, fwidth(g.x));
        float glow = 0.0;
        vec3 c;
        vec3 light;
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
          vec4 s0 = soilOf(d0);
          vec4 s1 = soilOf(dx);
          vec4 s2 = soilOf(dy);
          vec4 s3 = soilOf(dd);
          vec4 flags0 = vec4(step(0.5, s0.x), s0.x, step(0.5, s0.y), s0.z);
          vec4 flags1 = vec4(step(0.5, s1.x), s1.x, step(0.5, s1.y), s1.z);
          vec4 flags2 = vec4(step(0.5, s2.x), s2.x, step(0.5, s2.y), s2.z);
          vec4 flags3 = vec4(step(0.5, s3.x), s3.x, step(0.5, s3.y), s3.z);
          vec4 soil = flags0 * w00 + flags1 * w10 + flags2 * w01 + flags3 * w11;
          float sky = s0.w * w00 + s1.w * w10 + s2.w * w01 + s3.w * w11;
          float clev = (s0.y * w00 + s1.y * w10 + s2.y * w01 + s3.y * w11) / 15.0;
          vec3 ground = groundColor(soil, g, detail, clev, glow);${hook(h, "groundTop")}
          if (groundMode > 0.5) {
            c = heightColor(h0) * (0.96 + 0.08 * (vnoise(g * 9.0) - 0.5) * detail);
            glow = 0.0;
          } else c = ground;
          // contact shadow at the foot of higher neighbours, fading within half a tile
          float rx = 1.0 - smoothstep(0.0, 0.5, 0.5 - w.x);
          float ry = 1.0 - smoothstep(0.0, 0.5, 0.5 - w.y);
          float ox = min(max(hx - h0, 0.0), 2.0) * 0.5 * rx;
          float oy = min(max(hy - h0, 0.0), 2.0) * 0.5 * ry;
          float od = min(max(hd - h0, 0.0), 2.0) * 0.5 * rx * ry * (1.0 - max(step(0.5, hx - h0), step(0.5, hy - h0)));
          float ao = 1.0 - 0.55 * clamp(ox + oy + od - ox * oy, 0.0, 1.0);
          light = lightOf(n, mix(0.55, 1.0, sky), ao, sunLit(g, h0));
          if (vWorld.y < h0 - 0.5) {
            // a floor under an overhang (a cave's or a ledge's): the top's soil, never its water,
            // in the overhang's shade
            float none;
            c = groundMode > 0.5 ? heightColor(vWorld.y) : groundColor(vec4(soil.xyz, 0.0), g, detail, clev, none);
            glow = 0.0;
            light = lightOf(n, 0.6, 0.85, 0.0);
          }
        } else if (n.y < -0.5) {
          c = ${glColor(WALL.mortar)};
          light = lightOf(n, 0.5, 0.6, 0.0);
        } else {
          // a wall: dark cobbled stone, every other level a shade darker; with Markers, a pale ledge
          // at the top of each level over a dark groove at the foot of the next (each at least a
          // pixel wide, and gone where a level is under three pixels); a lip of the top's ground
          vec2 out2 = vec2(n.x, -n.z);
          vec2 air = floor(g + out2 * 0.5);
          float base = heightOf(tileAt(air));
          float y = vWorld.y;
          float level = floor(y + 0.001);
          float fy = y - level;
          float along = abs(n.x) > 0.5 ? g.y : g.x;
          #if LITE
            float k = 0.75;
          #else
            float k = cobble(vec2(along * 2.0, y * 2.0));
          #endif
          float shade = mix(${f(WALL.low)}, ${f(WALL.high)}, clamp(level / 16.0, 0.0, 1.0)) * (mod(level, 2.0) > 0.5 ? ${f(WALL.alternate)} : 1.0);
          vec3 wc = mix(${glColor(WALL.mortar)}, ${glColor(WALL.stone)} * shade * (0.78 + 0.44 * (k - 0.5)), smoothstep(0.1, 0.4, k));
${hook(h, "wall")}          float py = fwidth(y);
          float lines = (1.0 - smoothstep(0.22, 0.34, py)) * ${hook(h, "wallLines", "markers")};
          float lw = max(0.09, 1.2 * py);
          float gw = max(0.035, 0.8 * py);
          wc = mix(wc, ${glColor(WALL.ledge)} * shade, smoothstep(1.0 - lw - py * 0.5, 1.0 - lw + py * 0.5, fy) * lines);
          wc = mix(wc, ${glColor(WALL.groove)}, (1.0 - smoothstep(gw - py * 0.5, gw + py * 0.5, fy)) * lines);
          float lip = 1.0 - smoothstep(0.07, 0.13, h0 - y);
          vec4 s0 = soilOf(d0);
          vec3 top = groundMode > 0.5 ? heightColor(h0) : (s0.x > 0.5 ? ${glColor(GROUND.moistHigh)} : ${glColor(GROUND.dry)} * 0.85);
          c = mix(wc, top, lip * 0.9);
          float ao = mix(0.5, 1.0, smoothstep(0.0, 1.1, y - base));
          light = lightOf(n, 1.0, ao, sunLit(g + out2 * 0.26, y));
        }
        c *= light;
        // the glowing cracks of contaminated ground shine in shadow too
        c += ${glColor(GROUND.contaminatedGlow)} * glow * ${f(CT.glowAdd)};${hook(h, "lit")}
        vec4 o = texture2D(overlay, (tile + 0.5) / mapSize);
        if (o.a < 0.998) c = mix(c, o.rgb * (0.8 + 0.2 * min(light.g, 1.0)), o.a);
        else c = mix(c, o.rgb, (n.y > 0.5 ? float(LITE) : 0.5) * markers);
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
          // the slice's cut: the tops of columns taller than the layer, darker, with a fine hatch
          if (slice < 90.0 && h0 > slice + 0.5) {
            float hs = step(0.5, fract((g.x + g.y) * 3.0));
            c = mix(c, vec3(0.5, 0.47, 0.43), 0.6) * (0.86 + 0.14 * hs);
          }
          // level lines: a thin dark line on each tile edge where the ground steps down
          else if (levelLines > 0.5) {
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
        if (hover.z > 0.5 && tile == hover.xy) {
          vec2 fr = fract(vec2(p.x, -p.z));
          float edge = min(min(fr.x, 1.0 - fr.x), min(fr.y, 1.0 - fr.y));
          c = mix(c * 1.18, vec3(1.0), (1.0 - smoothstep(0.04, 0.09, edge)) * (n.y > 0.5 ? 0.85 : 0.0));
        }
        gl_FragColor = vec4(finish(c, vWorld), 1.0);
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
      varying vec2 vData;
      varying float vFlags;
      varying vec3 vNormal;
      varying vec3 vWorld;
      void main() {
        vData = wdata;
        vFlags = wflags;
        vNormal = normal;
        vec4 w = modelMatrix * vec4(position, 1.0);
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
      ${WATER_GLSL}${hook(h, "waterDecl")}
      /** The slope of the ripples (gentle, moving) at q. */
      vec2 ripple(vec2 q, float t) {
        float a1 = q.x * 1.3 + q.y * 0.35 + t * 1.1;
        float a2 = q.y * 1.7 - q.x * 0.4 - t * 0.9;
        float a3 = (q.x - q.y) * 2.9 + t * 1.7;
        return cos(a1) * vec2(1.3, 0.35) * 0.5 + cos(a2) * vec2(-0.4, 1.7) * 0.35 + cos(a3) * vec2(2.9, -2.9) * 0.12;
      }
      void main() {
        vec3 n = normalize(vNormal);
        float depth = vData.x;
        float cont = clamp(vData.y, 0.0, 1.0);
        vec2 g = vec2(vWorld.x, -vWorld.z);
        vec3 V = normalize(cameraPosition - vWorld);
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
        float alpha = cleanWaterAlpha(absorb);
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
            vec2 q2 = g * 1.6 + vec2(sin(g.y * 0.5), sin(g.x * 0.43)) * 1.5;
            vec2 sl = ripple(q2, t * slow) + 0.6 * ripple(q2 * 1.9 + 7.0, t * 1.3 * slow);
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
          // a thin line along the shore, and (clean water only) broken foam just off it
          foam += (1.0 - smoothstep(0.03, 0.08, shore)) * mix(${f(WS.shoreFoam)}, 0.45, bad);
          #if LITE
            foam += (1.0 - smoothstep(0.02, 0.1, lip)) * 0.5 * (1.0 - bad * 0.35);
          #else
            float fn = vnoise(g * 4.0 + vec2(t * 0.3, -t * 0.2));
            foam += (1.0 - smoothstep(0.06, 0.24 + 0.1 * fn, shore)) * smoothstep(0.4, 0.72, fn + 0.12) * ${f(WS.brokenFoam)} * (1.0 - bad);
            // the water breaks white over the brink, in a ragged line that runs with it
            float brink = vnoise(vec2((g.x + g.y) * 5.0, t * 1.6)) * 0.6 + vnoise(vec2((g.x - g.y) * 11.0, t * 2.3)) * 0.4;
            foam += (1.0 - smoothstep(0.02, 0.08 + 0.1 * brink, lip)) * (0.4 + 0.45 * brink) * (1.0 - bad * 0.35);
            // glints of light, and pale ripples drifting where it flows
            // (small and sparse, and gone where a pixel covers more than a few of them)
            float fine = 1.0 - smoothstep(0.03, 0.09, fwidth(g.x));
            glints = fine * smoothstep(0.8, 0.9, vnoise(g * 17.0 + vec2(t * 0.6, -t * 0.4)) * vnoise(g * 13.0 - vec2(t * 0.3, t * 0.7)) * 1.6);
            pale = smoothstep(0.6, 0.82, vnoise(vec2(g.x * 0.9 + g.y * 0.3, (g.y - g.x * 0.2) * 5.0) + vec2(t * 0.15, t * 0.5)));
            // badwater's slow glowing bubbles, denser the more of the water is bad
            if (bad > 0.01) bubbles = fine * smoothstep(0.93 - 0.1 * bad, 1.03 - 0.1 * bad, vnoise(g * 5.0 + vec2(t * 0.05, -t * 0.08))) * smoothstep(0.55, 0.8, vnoise(g * 1.3 - vec2(0.0, t * 0.04)));
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
${hook(h, "water")}        // clear water (D196, D212; waterPalette.ts CLEAR_WATER): all of it with T, else under and
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
          float oa = o.a < 0.998 ? o.a : o.a * markers * float(LITE);
          c = mix(c, o.rgb, oa * 0.85);
          alpha = mix(alpha, 1.0, oa * 0.6);
          vec4 hatch = hatchAt(g, o.rgb);
          c = mix(c, hatch.rgb, hatch.a);
          alpha = mix(alpha, 1.0, hatch.a);
        }
        // the game's layers: water above the slice is cut away
        if (vWorld.y > slice + 0.05) discard;
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
      uniform float viewHeight;${hook(h, "fallVertexDecl")}
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
      ${WATER_GLSL}
      void main() {
        // the game's layers: a fall above the slice is cut away
        if (vWorld.y > slice + 0.05) discard;
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
          c = foamColour;
          alpha = foam * FALL_FOAM;
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
          c = foamColour;
          alpha = foam * FALL_FOAM;
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
          float whiteStreak = smoothstep(0.55, 0.9, streak);
          float foam = clamp(whiteStreak * (0.22 + 0.3 * aerate) + lip * 0.7 + foot * (0.6 + 0.25 * streak), 0.0, 1.0);
          foam *= (1.0 - 0.3 * bad) * mix(0.7, 1.0, weak) * mix(1.0, 0.55, gentle);
          // a translucent body, clean water's light shallows or badwater's crimson, its streaks;
          // thicker where seen edge-on (where it curves over the brink, and at its ends)
          vec3 body = ${hook(h, "fallBody", "waterBlend(WATER_SHALLOW, badwaterBody(0.25), cont)")};
          vec3 streaks = mix(WATER_FOAM, badwaterShade(BADWATER_STREAK, 0.25), bad);
          c = mix(body, streaks, whiteStreak * 0.3) * light;
          c = mix(c, foamColour, foam);
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
      ${common(h)}
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
        gl_FragColor = vec4(finish(${hook(h, "objectFinal", "vColor * light")}, vWorld), 1.0);
      }
    `,
  });
}
