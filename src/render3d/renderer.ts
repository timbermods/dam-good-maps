// The one 3D renderer (PLAN §3, EDITOR_PLAN §8), used by the generator's 3D preview and by the
// editor. It draws a map view: terrain in 32×32 chunks (only dirty chunks are remeshed after an
// edit), a voxel mesher for columns with caves or overhangs, translucent water surfaces, and
// instanced objects. It has an orbit camera and a top-down view (north up), picks tiles against
// the heightfield, and renders when something changed, and while water moves. Waterfalls (D201) are
// instances of one small template per chunk (falls.ts), listed when the chunk's water is meshed.
//
// Map look (D86): the ground is coloured by soil (or by height, `setGroundMode`); the light is
// baked when the mesh is built (light.ts: sky visibility, soft sun shadows) into two textures the
// shaders read with the per-tile overlay; the default camera looks as the game's does, 30° east of
// north and 70° down. The water's surface moves (at 30 frames a second at most) unless the viewer
// prefers reduced motion, the browser renders in software, or the view is hidden. A browser that
// renders in software gets a lighter look: no multisampling, no patterns or shadows, soil without
// blending, and models of a few triangles. A mine site's pit is cut into the terrain's tops (its
// model draws the pit), again wherever the objects change.
//
// The look (Map look 2, PLAN §20 D284): Standard, as above; High (render3d/high), the same scene
// drawn with the High materials, chosen automatically where it runs smoothly and falling back to
// Standard where it doesn't (high/fallback.ts); the light look where the browser draws in software.
// The Standard materials are never changed by High: switching swaps the materials the meshes use.
//
// Controls: left drag orbits (pans in the top-down view), right drag pans, the wheel zooms. On the
// focused canvas: W A S D or the arrows pan, Q and E turn, + and − zoom (F is the brush's resize,
// R the shelf's rotate).

import {
  BufferGeometry,
  BufferAttribute,
  Color,
  InstancedBufferGeometry,
  InstancedInterleavedBuffer,
  InterleavedBufferAttribute,
  Mesh,
  OrthographicCamera,
  PerspectiveCamera,
  PlaneGeometry,
  Raycaster,
  Scene,
  Sphere,
  Vector2,
  Vector3,
  WebGLRenderer,
  type DataTexture,
  type Group,
  type InstancedMesh,
  type ShaderMaterial,
  WebGLRenderTarget,
  Box3,
  LinearSRGBColorSpace,
  LinearFilter,
  ColorManagement,
} from "three";
import { BrushCursor, ForceRing, type BrushCursorState } from "./brushCursor";
import { Effects, Surge, type SurgeHead, type SurgePoint } from "./effects";
import { ForceEffects, type ForceMoment } from "./forces";
import { buildEntities, disposeGroup, mineCutout, mineOutline } from "./entities3d";
import { objectCasters, shadowMap, shadowPairRect, SKY_REACH, skyVisibility, skyVisibilityRect, tileData, tileDataRect } from "./light";
import { FALL_STRIDE, fallTemplate } from "./falls";
import { contaminationEdges, drawPatterns, fallMaterial, hatchMarks, lightTexture, overlayTexture, objectMaterial, sceneUniforms, skyMaterial, terrainMaterial, tileTexture, waterMaterial, type SceneUniforms } from "./materials";
import { changedRect, chunkCount, dirtyChunks, meshChunk, CHUNK, type TerrainSource } from "./mesh";
import { columnMap, NO_VARIANT, surfaceWater, type EntityView, type MapView, type SoilView, type SurfaceWater, type WaterView } from "./model";
import { SKY, type GroundMode } from "./palette";
import { pickHeightfield, pickPlane, type Ray, type TileHit } from "./pick";
import { changedWaterChunks, lowerByTile, meshWaterChunk } from "./waterMesh";
import { effectsFrom, HIGH_EFFECTS, LOWER_PIXELS, type HighEffectKey, type HighEffects, allEffects } from "./high/effects";
import { LIMITS, LookGovernor, saveChoice, savedChoice, savedOff, saveOff, savedVerdict, saveVerdict, startTier, type GovernorLimits, type LookChoice, type Tier } from "./high/fallback";
import { HighLook, type HighMaterials } from "./high/highLook";
import { Baker } from "./high/fields";
import { WaterMotion } from "./motion";
import { glideStep, STILL, wanted, type Glide } from "./cameraGlide";
import { focusLost } from "./focusLost";

ColorManagement.enabled = false;

export type ViewMode = "orbit" | "top";

/** The look drawn: High, High's lower-cost tier, Standard, or the light look (software). */
export type Look = Tier | "light";

/** A highlighted source's tint (Remove's red on a source, Clear sources' glow, D249): its blue made
 *  a clear red. */
const SOURCE_GLOW: [number, number, number] = [3, 0.3, 0.2];

export interface ViewState {
  mode: ViewMode;
  /** Turn around the target: 0 looks north. */
  yaw: number;
  /** Angle above the horizon. */
  pitch: number;
  distance: number;
  target: [number, number, number];
}

export interface BuildStats {
  /** Meshing and upload, to the first frame drawn. */
  ms: number;
  meshMs: number;
  chunks: number;
  terrainQuads: number;
  waterQuads: number;
  /** Waterfalls (falls.ts): one instance each. */
  falls: number;
  instances: number;
}

export interface FrameStats {
  frames: number;
  seconds: number;
  fps: number;
  /** Time between frames (ms): median, 95th and 99th percentile, worst. */
  p50: number;
  p95: number;
  p99: number;
  max: number;
  /** Frames that took longer than 1/60 s. */
  over60: number;
  /** CPU time of one render call (ms), median and 95th percentile. */
  cpuP50: number;
  cpuP95: number;
  /** GPU time per frame (ms) from timer queries, when the browser offers them. */
  gpuP50: number | null;
  gpuP95: number | null;
}

/** A tool that takes left-button drags over the map (the editor's handles and drawing tools). */
/** A wheel's turn: with Shift, browsers turn it sideways (deltaX). */
export function wheelDelta(ev: WheelEvent): number {
  return ev.deltaY || ev.deltaX;
}

export interface PointerTool {
  /** Return true to take this drag. */
  down(hit: TileHit | null, ev: PointerEvent): boolean;
  move(hit: TileHit | null, ev: PointerEvent): void;
  up(hit: TileHit | null, ev: PointerEvent): void;
  /** The pointer moved over the map with no button down (a brush follows it). */
  hover?(hit: TileHit | null, ev: PointerEvent): void;
  /** The wheel turned over the map: return true to take it (Shift+wheel sets a brush's strength). */
  wheel?(ev: WheelEvent): boolean;
  /** The drag was lost (the pointer went away without a release). */
  cancel?(): void;
  /** It takes Alt+click and Alt+drag itself (the Select tool's subtract), instead of the layer pick. */
  wantsAlt?: boolean;
  /** It points at the water's surface over water, where the cursor is seen (the forces, D321 item
   *  13), not at the bed under it. */
  surface?: boolean;
}

interface MapState {
  W: number;
  H: number;
  heights: Uint8Array;
  source: TerrainSource;
  water: WaterView;
  surface: SurfaceWater;
  entities: EntityView;
  soil: SoilView | null;
  /** Baked: sky visibility per tile, and the terrain shader's tile data. */
  sky: Uint8Array;
  tiles: Uint8Array;
}

const PITCH_MIN = 0.18;
/** How long a frame may spend meshing a stroke's water (updateWaterSoon). */
const WATER_MESH_BUDGET_MS = 2;
const PITCH_MAX = 1.5;
/** The game's default camera: turned 30° east of north, 70° down (Map look, D86). */
export const DEFAULT_YAW = -Math.PI / 6;
export const DEFAULT_PITCH = (70 * Math.PI) / 180;
/** Frames a second of the water's movement when nothing else asks for a frame. */
const WATER_FPS = 30;

/** Whether the browser draws WebGL in software (no GPU, or one it won't use): asked of a throwaway
 *  context before the view's own is made, so the view can be made lighter for it. */
export function softwareRendering(): boolean {
  try {
    const c = document.createElement("canvas");
    const g = (c.getContext("webgl2") ?? c.getContext("webgl")) as WebGLRenderingContext | null;
    if (!g) return false;
    const e = g.getExtension("WEBGL_debug_renderer_info");
    const name = String(e ? g.getParameter(e.UNMASKED_RENDERER_WEBGL) : g.getParameter(g.RENDERER));
    g.getExtension("WEBGL_lose_context")?.loseContext();
    return /SwiftShader|llvmpipe|Software|Basic Render/i.test(name);
  } catch {
    return false;
  }
}

/** Test hooks for the look (tests/e2e/look-high.spec.ts), set before the view is made: `gpu`
 *  treats a browser drawing in software as if it had a GPU (CI's has none), so the High look and its
 *  fallback can be tried there; `limits` replaces the fallback's limits (fewer frames to wait);
 *  `cost` reports every frame as costing that many milliseconds (`simulateFrameCost`). */
declare global {
  interface Window {
    dgmLookTest?: { gpu?: boolean; limits?: Partial<GovernorLimits>; cost?: number };
  }
}

/** The window's size in device pixels: what the automatic look remembers its verdict by (the view
 *  fills most of it). */
function screenPixels(): number {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  return Math.round(window.innerWidth * window.innerHeight * dpr * dpr);
}

/** Timberborn's camera keys: WASD and the arrows move, Q and E turn. */
const CAMERA_KEYS = new Set(["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright", "q", "e"]);

export class MapRenderer {
  readonly canvas: HTMLCanvasElement;
  private gl: WebGLRenderer;
  private scene = new Scene();
  private persp = new PerspectiveCamera(40, 1, 0.5, 4000);
  private ortho = new OrthographicCamera(-1, 1, 1, -1, 0.1, 4000);
  private raycaster = new Raycaster();
  private view: ViewState = { mode: "orbit", yaw: 0, pitch: 0.9, distance: 200, target: [0, 0, 0] };
  private map: MapState | null = null;
  private terrain = new Map<string, Mesh>();
  private water = new Map<string, Mesh>();
  /** Each chunk's falls: instances of the fall template (falls.ts). */
  private falls = new Map<string, Mesh>();
  private readonly fallShape = fallTemplate();
  private objects: Group | null = null;
  /** The ground the objects stand on as built (the map's last heights from the worker); plants
   *  and ruins follow the ground painted or dragged over theirs (live editing). */
  private objectGround: Uint8Array | null = null;
  private objectsMoved = false;
  private overlay: DataTexture | null = null;
  private marks: DataTexture | null = null;
  /** Where the contamination outline runs (**Markers**): `contaminationEdges` of the tile data. */
  private edges: DataTexture | null = null;
  /** Where the outline round mine sites runs (**Markers**): `mineOutline` of the objects. */
  private sites: DataTexture | null = null;
  /** Where the sources are, for their upwelling (D196). */
  private sourceTiles: DataTexture | null = null;
  /** The sources whose water the pointer is over (tile indices of their middles). */
  private sourceGlow: readonly number[] = [];
  private tileTex: DataTexture | null = null;
  private lightTex: DataTexture | null = null;
  private uniforms: SceneUniforms;
  private patterns: WebGLRenderTarget;
  private terrainMat: ShaderMaterial;
  private waterMat: ShaderMaterial;
  private fallMat: ShaderMaterial;
  private objectMat: ShaderMaterial;
  private skyMat: ShaderMaterial;
  /** The Standard look's materials (the ones above while the look is Standard). */
  private std: HighMaterials;
  /** The High look while it is drawn (render3d/high). */
  private high: HighLook | null = null;
  /** The renderer's bake worker (the moving water's fields and shapes, High's occlusion). */
  private bakerOwn: Baker | null = null;
  /** The moving water (motion.ts, D353): its flow texture, foam and the Flow view's streaks. */
  private waterMotion: WaterMotion | null = null;
  /** The Flow view (off by default): the current's streaks over the water. */
  private flowOn = false;
  private lookNow: Look = "standard";
  private choice: LookChoice = "auto";
  private chosenEffects: HighEffects = allEffects();
  private governor: LookGovernor | null = null;
  /** Frame costs for the governor: GPU timer queries in flight, or (without them) every fourth frame
   *  timed to its end. */
  private costTimer: { ext: { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number } | null; pending: WebGLQuery[]; frame: number } | null = null;
  /** A frame cost to report instead of the measured one (tests of the fallback), or null. */
  private simulatedCost: number | null = window.dgmLookTest?.cost ?? null;
  /** The GPU's name (the automatic choice remembers its verdict per GPU). */
  private gpuName = "";
  private sky: Mesh;
  /** The map's base: its sides carried down below the lowest ground, so the map is a block of land. */
  private skirt: Mesh | null = null;
  private ground: GroundMode = "moisture";
  private markersOn = false;
  /** A fixed moment of the water's movement (captures, tests), or null: it moves. */
  private clock: number | null = null;
  private readonly t0 = performance.now();
  private animTimer = 0;
  private software = false;
  private reducedMotion = false;
  private inView = true;
  private seen: IntersectionObserver | null = null;
  private lastViewKey = "";
  private frame = 0;
  private resize: ResizeObserver;
  private disposed = false;
  private drag: { kind: "orbit" | "pan" | "tool"; x: number; y: number; id: number; moved: number; button: number } | null = null;
  private listeners: [EventTarget, string, EventListener, AddEventListenerOptions?][] = [];
  /** The camera keys held (Timberborn's: WASD and the arrows move, Q and E turn, Shift is faster),
   *  and the camera's speed now: it moves every frame while they are held, easing in and gliding to
   *  a stop. */
  private held = new Set<string>();
  private glide: Glide = { ...STILL };
  private glideFrame = 0;
  private glideAt = 0;
  private cpuTimes: number[] = [];
  private timer: { ext: { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number }; pending: { q: WebGLQuery }[]; times: number[] } | null = null;
  private recording = false;
  tool: PointerTool | null = null;
  onView: ((v: ViewState) => void) | null = null;
  onHover: ((hit: TileHit | null) => void) | null = null;
  /** A left click (a press and release without dragging) on the map. */
  onClick: ((hit: TileHit | null, ev: PointerEvent) => void) | null = null;
  /** Before the tool and the camera: something under the pointer that a left-drag moves (a water
   *  source, D184), as a pointer tool for that drag, or null. */
  grab: ((hit: TileHit | null, ev: PointerEvent) => PointerTool | null) | null = null;
  /** Before the tool and the camera: a wheel over something it changes (Shift+scroll over a
   *  source sets its strength); true when used. */
  onWheel: ((ev: WheelEvent, hit: TileHit | null) => boolean) | null = null;
  /** The drag a grab started (its own pointer tool). */
  private grabbed: PointerTool | null = null;
  /** The map drawn changed (its terrain, water, soil or objects): the legend reads it again. */
  onMapChange: (() => void) | null = null;
  lastBuild: BuildStats | null = null;
  /** Tiles the page points to (the legend's highlight), drawn over the page's own overlay. */
  private highlight: Uint8Array | null = null;
  /** The page's overlay as it painted it, without the highlight. */
  private pageOverlay: Uint8Array | null = null;
  /** The brush under the cursor (live editing), made on first use. */
  private cursor: BrushCursor | null = null;
  private ring: ForceRing | null = null;
  /** A force's ring as last shown (tests). */
  forceRingState: { x: number; y: number; r: number; marker?: boolean } | null = null;
  /** The sun's shadows wait while a brush paints when they cannot be redone round it. */
  private shadowsStale = false;
  private shadowChanged = false;
  /** The shadow tops of the whole map (redone round each change), and the objects' casters. */
  private tops: { hi: Float32Array; lo: Float32Array } | null = null;
  private casters: Float32Array | null | undefined = undefined;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    // a browser that draws in software gets the light look, without multisampling (D110)
    this.software = softwareRendering() && !window.dgmLookTest?.gpu;
    this.gl = new WebGLRenderer({ canvas, antialias: !this.software, powerPreference: "high-performance" });
    this.gl.outputColorSpace = LinearSRGBColorSpace;
    this.gl.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    // the sky round the map (the light look clears to its colour below the horizon instead)
    this.gl.setClearColor(new Color(...SKY.below));
    this.scene.background = null;
    // placeholder textures until a map arrives; every material shares these uniforms
    const one = () => tileTexture(1, 1, new Uint8Array(4));
    this.uniforms = sceneUniforms(1, 1, one(), lightTexture(1, 1, new Uint8Array(16)), one(), one());
    this.patterns = drawPatterns(this.gl);
    this.uniforms.patternTex.value = this.patterns.texture;
    this.terrainMat = terrainMaterial(this.uniforms, 0, 1, this.software);
    this.waterMat = waterMaterial(this.uniforms, this.software);
    this.fallMat = fallMaterial(this.uniforms, this.software);
    this.objectMat = objectMaterial(this.uniforms, this.software);
    this.skyMat = skyMaterial();
    this.std = { terrain: this.terrainMat, water: this.waterMat, fall: this.fallMat, object: this.objectMat, sky: this.skyMat };
    this.sky = new Mesh(new PlaneGeometry(2, 2), this.skyMat);
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -1000;
    if (!this.software) this.scene.add(this.sky);
    this.lookNow = this.software ? "light" : "standard";
    // the Flow view from the address (?flow=on) until the page has its switch (D353)
    try {
      this.flowOn = new URLSearchParams(window.location.search).get("flow") === "on";
    } catch {
      this.flowOn = false;
    }
    const motion = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    this.reducedMotion = !!motion?.matches;
    motion?.addEventListener?.("change", () => {
      this.reducedMotion = motion.matches;
      // (the High look's wind stops and starts with it)
      this.high?.setEffects(this.chosenEffects, this.lookNow === "lower");
      this.requestRender();
    });
    if (typeof IntersectionObserver !== "undefined") {
      this.seen = new IntersectionObserver((entries) => {
        this.inView = entries.some((e) => e.isIntersecting);
        this.requestRender();
      });
      this.seen.observe(canvas);
    }
    this.resize = new ResizeObserver(() => this.fit());
    this.resize.observe(canvas);
    this.fit();
    this.bindInput();
    if (!this.software) {
      this.gpuName = this.gpu().renderer;
      this.chosenEffects = effectsFrom(savedOff());
      this.setLookChoice(savedChoice(), false);
    }
  }

  /** WebGL context info: the GPU the browser uses (for the benchmark report). */
  gpu(): { renderer: string; vendor: string } {
    const ctx = this.gl.getContext();
    const ext = ctx.getExtension("WEBGL_debug_renderer_info");
    return {
      renderer: String(ext ? ctx.getParameter(ext.UNMASKED_RENDERER_WEBGL) : ctx.getParameter(ctx.RENDERER)),
      vendor: String(ext ? ctx.getParameter(ext.UNMASKED_VENDOR_WEBGL) : ctx.getParameter(ctx.VENDOR)),
    };
  }

  /** What colours the ground's tops: soil (as in the game) or height. */
  setGroundMode(mode: GroundMode): void {
    this.ground = mode;
    (this.terrainMat.uniforms.groundMode as { value: number }).value = mode === "height" ? 1 : 0;
    this.requestRender();
  }

  get groundMode(): GroundMode {
    return this.ground;
  }

  /** The information layer (**Markers**): dam sites, slope arrows, level lines, far-off objects
   *  drawn larger. Off: the clean view. */
  setMarkers(on: boolean): void {
    this.markersOn = on;
    this.uniforms.markers.value = on ? 1 : 0;
    this.showMarkerObjects();
    this.requestRender();
    this.onMarkers?.(on);
  }

  /** Told when **Markers** turns on or off (the editor shows every source then, D196). */
  onMarkers: ((on: boolean) => void) | null = null;

  get markers(): boolean {
    return this.markersOn;
  }

  /** Clear water (D196, D212): all the water see-through (T, or Clear water), so the bed, ledges
   *  and sources show; badwater still plainly marked. Round the brush it is clear on its own while
   *  the brush paints a submerged bed (`clearNear`). */
  setClearWater(on: boolean): void {
    if ((this.uniforms.clearWater.value > 0.5) === on) return;
    this.uniforms.clearWater.value = on ? 1 : 0;
    this.requestRender();
  }

  get clearWater(): boolean {
    return this.uniforms.clearWater.value > 0.5;
  }

  /** The game's layers (D196): cut the world away above `level` (null shows it all). */
  setSlice(level: number | null): void {
    const v = level === null ? 99 : Math.max(0, Math.min(40, Math.round(level)));
    if (this.uniforms.slice.value === v) return;
    this.uniforms.slice.value = v;
    this.sliced = null;
    this.requestRender();
    this.onSlice?.(level === null ? null : v);
  }

  /** One layer up (1) or down (-1), as the game steps them (D207, `LevelVisibilityService`): down
   *  from the whole world, the first layer that hides anything (the map's top, less one); up past
   *  it, the whole world again; never below 0. */
  stepSlice(dir: 1 | -1): void {
    const m = this.map;
    if (!m) return;
    const hiding = this.topHiding();
    const now = this.slice;
    if (now === null) {
      if (dir < 0) this.setSlice(hiding);
      return;
    }
    const next = now + dir;
    this.setSlice(next > hiding ? null : Math.max(0, next));
  }

  /** The highest layer that hides anything: the map's highest ground, less one. */
  topHiding(): number {
    const m = this.map;
    if (!m) return 0;
    let top = 0;
    for (let i = 0; i < m.heights.length; i++) if (m.heights[i] > top) top = m.heights[i];
    return Math.max(0, top - 1);
  }

  /** The game's layer pick (D207, `LevelVisibilityPicker`): on a tile below the layer showing, the
   *  world is cut at that tile's level; on one at it (or with the whole world showing, never), the
   *  whole world shows again. The tile's level is its visible top. */
  pickSlice(hit: TileHit): void {
    const m = this.map;
    if (!m) return;
    const cut = this.slice;
    const level = Math.min(m.heights[hit.y * m.W + hit.x], cut ?? 99);
    this.setSlice(cut === null || level < cut ? level : null);
  }

  /** The layer the world is cut at, or null. */
  get slice(): number | null {
    const v = this.uniforms.slice.value;
    return v >= 99 ? null : v;
  }

  /** Told when the layer changes (the page says which layer is showing). */
  onSlice: ((level: number | null) => void) | null = null;
  /** The heights as the slice shows them (picking lands on the cut). */
  private sliced: Uint8Array | null = null;

  /** The sources whose water the pointer is over glow (D196): their middle tiles, or none. */
  setSourceGlow(tiles: readonly number[]): void {
    if (tiles.length === this.sourceGlow.length && tiles.every((t, k) => t === this.sourceGlow[k])) return;
    this.sourceGlow = tiles.slice();
    this.markSources();
  }

  /** The sources' texture: where each clean or bad source's middle is, and which glow. */
  private markSources(): void {
    const m = this.map;
    const t = this.sourceTiles;
    if (!m || !t) return;
    const d = t.image.data as Uint8Array;
    d.fill(0);
    const e = m.entities;
    for (let k = 0; k < e.count; k++) {
      const name = e.templates[e.template[k]];
      if (name !== "WaterSource" && name !== "BadwaterSource") continue;
      // a badwater source's middle: one tile in from its corner, turned with it
      let x = e.x[k];
      let y = e.y[k];
      if (name === "BadwaterSource") {
        const o = e.orientation[k];
        x += o === 0 || o === 1 ? 1 : -1;
        y += o === 0 || o === 3 ? 1 : -1;
      }
      if (x < 0 || y < 0 || x >= m.W || y >= m.H) continue;
      d[(y * m.W + x) * 4 + (name === "WaterSource" ? 0 : 1)] = 255;
    }
    for (const i of this.sourceGlow) if (i >= 0 && i < m.W * m.H) d[i * 4 + 2] = 255;
    t.needsUpdate = true;
    this.requestRender();
  }

  get levelLines(): boolean {
    return this.uniforms.levelLines.value > 0.5;
  }

  /** Level lines (the brush kit's toggle): a thin line where the ground steps down. */
  setLevelLines(on: boolean): void {
    this.uniforms.levelLines.value = on ? 1 : 0;
    this.requestRender();
  }

  private showMarkerObjects(): void {
    for (const c of this.objects?.children ?? []) if (c.name === "Slope.mark" || c.name === "Slope.mark.lite") c.visible = this.markersOn;
  }

  /** Hold the water's movement at a moment (seconds), or let it move again (null). */
  setClock(t: number | null): void {
    this.clock = t;
    this.requestRender();
  }

  /** Whether the water moves on screen now. */
  get animated(): boolean {
    const m = this.map;
    return !!m && (m.water.count > 0 || !!this.high?.animates) && this.clock === null && !this.recording && !this.reducedMotion && !this.software && this.inView && !document.hidden;
  }

  // -------------------------------------------------------------------------------------- the look

  private lookListeners = new Set<(look: Look) => void>();

  /** Be told when the look drawn or the High effects change (the view, the look's menu); returns
   *  the way to stop. */
  listenLook(fn: (look: Look) => void): () => void {
    this.lookListeners.add(fn);
    return () => this.lookListeners.delete(fn);
  }

  private tellLook(): void {
    for (const fn of this.lookListeners) fn(this.lookNow);
  }

  /** The look drawn now. */
  get look(): Look {
    return this.lookNow;
  }

  /** The player's choice: automatic (High where it runs smoothly, D284), or High or Standard. */
  get lookChoice(): LookChoice {
    return this.choice;
  }

  /** Whether the High look can be drawn at all (not in software, with WebGL 2). */
  get canHigh(): boolean {
    return !this.software && this.gl.capabilities.isWebGL2 && this.gl.capabilities.maxTextureSize >= 2048;
  }

  /** Choose the look: automatic starts in High (or where it settled last time on this GPU at about
   *  this size) and steps down if frames stay slow; High and Standard hold. Saved unless `save` is
   *  false. */
  setLookChoice(c: LookChoice, save = true): void {
    if (this.software) return;
    this.choice = c;
    if (save) saveChoice(c);
    // (choosing automatic again gives High another try)
    if (save && c === "auto") saveVerdict(null);
    if (c === "standard" || !this.canHigh) {
      this.governor = null;
      this.applyLook("standard");
      return;
    }
    if (c === "high") {
      this.governor = null;
      this.applyLook("high");
      return;
    }
    const tier = startTier(this.gpuName, screenPixels());
    this.governor = new LookGovernor(tier, { ...LIMITS, ...window.dgmLookTest?.limits });
    this.governor.hold(performance.now());
    this.applyLook(tier);
  }

  /** The High effects the player chose (all on unless switched off; the lower-cost tier drops some
   *  more while it is on). */
  get highEffects(): HighEffects {
    return { ...this.chosenEffects };
  }

  /** The effects in force in the High look now (null: not High). */
  get highEffectsNow(): HighEffects | null {
    return this.high ? { ...this.high.effects } : null;
  }

  /** Switch one High effect. Saved. */
  setHighEffect(key: HighEffectKey, on: boolean): void {
    this.chosenEffects = { ...this.chosenEffects, [key]: on };
    saveOff(HIGH_EFFECTS.filter((e) => !this.chosenEffects[e.key]).map((e) => e.key));
    this.high?.setEffects(this.chosenEffects, this.lookNow === "lower");
    this.requestRender();
    this.tellLook();
  }

  /** Whether the High look has all it needs for the map drawn (its fields come from a worker a
   *  moment after the map): true when not High. */
  get highSettled(): boolean {
    return (this.high ? this.high.settled : true) && (this.waterMotion?.ready ?? true);
  }

  /** The renderer's bake worker, made when first needed. */
  private get baker(): Baker {
    return (this.bakerOwn ??= new Baker());
  }

  /** The Flow view: the water's current shown as streaks travelling down its lanes (the moving
   *  surface and its foam stay either way). */
  setFlow(on: boolean): void {
    this.flowOn = on;
    this.waterMotion?.setFlow(on);
    this.requestRender();
  }

  get flow(): boolean {
    return this.flowOn;
  }

  /** The moving water's numbers (lanes, wakes, streaks; the worker's time), or null. */
  get motionStats(): (WaterMotion["stats"] & { ms: number }) | null {
    return this.waterMotion ? { ...this.waterMotion.stats, ms: this.waterMotion.ms } : null;
  }

  /** The High look's numbers (the menu's details, the measurements), or null. */
  get highStats(): HighLook["stats"] | null {
    return this.high ? this.high.stats : null;
  }

  /** The governor's last window of frame costs (ms, 95th percentile), or null. */
  get frameCost(): number | null {
    return this.governor ? this.governor.lastP95 : null;
  }

  /** Draw a tier as it is, held, whatever the frames cost (the measurements: tools/measure-high.ts). */
  holdTier(tier: Tier): void {
    if (this.software) return;
    this.choice = tier === "standard" ? "standard" : "high";
    this.governor = null;
    this.applyLook(tier);
  }

  /** Report this frame cost instead of the measured one (the fallback's tests), or measure again. */
  simulateFrameCost(ms: number | null): void {
    this.simulatedCost = ms;
    this.requestRender();
  }

  /** Draw with the High materials, High's lower-cost tier, or the Standard ones. */
  private applyLook(tier: Tier): void {
    if (this.software) return;
    if (tier !== "standard" && !this.high) {
      try {
        this.high = new HighLook({
          gl: this.gl,
          scene: this.scene,
          uniforms: this.uniforms,
          requestRender: () => this.requestRender(),
          motion: () => !this.reducedMotion,
          falls: () => this.falls.values(),
          casters: () => this.shadowCasters(),
          groundOffset: (x, y) => this.groundOffset(x, y),
          baker: this.baker,
          flow: () => {
            const m = this.waterMotion;
            return m ? { flow: m.flow, rough: m.rough, ready: m.ready, ms: m.ms } : { flow: this.uniforms.flowTex.value, rough: null, ready: true, ms: 0 };
          },
        });
        this.high.shareTerrainUniforms(this.std.terrain);
      } catch (e) {
        console.warn("The High look could not start; drawing the Standard look.", e);
        this.high?.dispose();
        this.high = null;
        tier = "standard";
      }
    }
    const was = this.lookNow;
    this.lookNow = tier;
    this.waterMotion?.setHigh(tier !== "standard");
    if (tier === "standard") {
      if (this.high) {
        this.useMaterials(this.std);
        this.high.dispose();
        this.high = null;
        // today's models back (the High look hid those it replaced)
        for (const c of this.objects?.children ?? []) c.visible = true;
        this.showMarkerObjects();
      }
    } else {
      const high = this.high!;
      high.setEffects(this.chosenEffects, tier === "lower");
      if (was === "standard" || was === "light") {
        this.useMaterials(high.materials);
        const m = this.map;
        if (m) {
          high.setMap(m.W, m.H, m.heights, m.surface, m.entities);
          if (this.objects) high.objectsBuilt(this.objects, m.entities);
        }
      }
    }
    this.gl.setPixelRatio(Math.min(2, window.devicePixelRatio || 1) * (tier === "lower" ? LOWER_PIXELS : 1));
    this.fit();
    this.thumbs.clear();
    if (this.ghost) {
      // (made again in the new look at the next move)
      this.scene.remove(this.ghost.group);
      this.ghost.undo?.();
      disposeGroup(this.ghost.group);
      this.ghost = null;
    }
    this.governor?.hold(performance.now());
    this.requestRender();
    if (was !== tier) this.tellLook();
  }

  /** Every mesh drawn with the look's materials takes these. */
  private useMaterials(m: HighMaterials): void {
    const swap = (from: ShaderMaterial, to: ShaderMaterial) => (mesh: Mesh) => {
      if (mesh.material === from) mesh.material = to;
      else if (Array.isArray(mesh.material)) mesh.material = mesh.material.map((x) => (x === from ? to : x));
    };
    const terrain = swap(this.terrainMat, m.terrain);
    for (const mesh of this.terrain.values()) terrain(mesh);
    if (this.skirt) terrain(this.skirt);
    const water = swap(this.waterMat, m.water);
    for (const mesh of this.water.values()) water(mesh);
    const fall = swap(this.fallMat, m.fall);
    for (const mesh of this.falls.values()) fall(mesh);
    swap(this.skyMat, m.sky)(this.sky);
    const object = swap(this.objectMat, m.object);
    for (const c of this.objects?.children ?? []) object(c as Mesh);
    this.terrainMat = m.terrain;
    this.waterMat = m.water;
    this.fallMat = m.fall;
    this.objectMat = m.object;
    this.skyMat = m.sky;
  }

  /** What casts a shadow in the High look: the terrain, the map's base, the objects. */
  private *shadowCasters(): Iterable<Mesh> {
    yield* this.terrain.values();
    if (this.skirt) yield this.skirt;
    for (const c of this.objects?.children ?? []) yield c as Mesh;
  }

  /** How far the ground under a tile moved from the map's (a brush painting). */
  private groundOffset(x: number, y: number): number {
    const m = this.map;
    const g = this.objectGround;
    if (!m || !g || x < 0 || y < 0 || x >= m.W || y >= m.H) return 0;
    const i = y * m.W + x;
    return m.heights[i] - g[i];
  }

  private probeTimer = 0;
  /** A quick first reading of the automatic look (once a session, a second after the first map):
   *  the view drawn five times as it is (the same picture), each timed to the GPU's end. Frames far too slow for High
   *  step down at once, without the governor's wait; the governor watches every frame after it. */
  private scheduleProbe(): void {
    if (!this.governor || this.probed || this.lookNow === "standard" || this.lookNow === "light") return;
    clearTimeout(this.probeTimer);
    this.probeTimer = window.setTimeout(() => {
      if (this.disposed || !this.governor || !this.map || this.lookNow === "standard") return;
      this.probed = true;
      const ctx = this.gl.getContext();
      const one = new Uint8Array(4);
      const times: number[] = [];
      for (let k = 0; k < 5; k++) {
        const t0 = performance.now();
        this.renderNow();
        // (reading a pixel waits for the frame to be drawn: finish() may not, in some browsers)
        ctx.readPixels(0, 0, 1, 1, ctx.RGBA, ctx.UNSIGNED_BYTE, one);
        times.push(this.simulatedCost ?? performance.now() - t0);
      }
      const tier = this.governor.probe(times);
      if (tier !== this.lookNow) {
        saveVerdict({ gpu: this.gpuName, pixels: screenPixels(), tier });
        this.applyLook(tier);
      }
    }, 1000);
  }
  private probed = false;

  /** One frame's cost for the governor (automatic look only). */
  private sampleCost(ms: number): void {
    const gov = this.governor;
    if (!gov || this.lookNow === "standard" || this.lookNow === "light") return;
    const before = gov.tier;
    const tier = gov.sample(this.simulatedCost ?? ms, performance.now());
    if (tier === before) return;
    saveVerdict({ gpu: this.gpuName, pixels: screenPixels(), tier });
    this.applyLook(tier);
  }

  private beginCost(): WebGLQuery | null {
    if (!this.governor || this.lookNow === "standard" || this.lookNow === "light" || this.recording) return null;
    const ctx = this.gl.getContext() as WebGL2RenderingContext;
    if (!this.costTimer) this.costTimer = { ext: ctx.getExtension("EXT_disjoint_timer_query_webgl2") as { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number } | null, pending: [], frame: 0 };
    const t = this.costTimer;
    t.frame++;
    if (this.simulatedCost !== null) {
      this.sampleCost(this.simulatedCost);
      return null;
    }
    if (!t.ext || t.pending.length > 4) return null;
    const q = ctx.createQuery();
    if (q) ctx.beginQuery(t.ext.TIME_ELAPSED_EXT, q);
    return q;
  }

  private endCost(q: WebGLQuery | null, cpuStart: number): void {
    const t = this.costTimer;
    if (!t || !this.governor || this.simulatedCost !== null) return;
    const ctx = this.gl.getContext() as WebGL2RenderingContext;
    if (q && t.ext) {
      ctx.endQuery(t.ext.TIME_ELAPSED_EXT);
      t.pending.push(q);
    } else if (!t.ext && t.frame % 4 === 0) {
      // no timer queries: every fourth frame, timed to the GPU's end of it (a pixel read waits for it)
      ctx.readPixels(0, 0, 1, 1, ctx.RGBA, ctx.UNSIGNED_BYTE, new Uint8Array(4));
      this.sampleCost(performance.now() - cpuStart);
    }
    if (!t.ext) return;
    const disjoint = ctx.getParameter(t.ext.GPU_DISJOINT_EXT);
    while (t.pending.length) {
      const p = t.pending[0];
      if (!ctx.getQueryParameter(p, ctx.QUERY_RESULT_AVAILABLE)) break;
      const ns = ctx.getQueryParameter(p, ctx.QUERY_RESULT) as number;
      ctx.deleteQuery(p);
      t.pending.shift();
      if (!disjoint) this.sampleCost(ns / 1e6);
    }
  }

  // ------------------------------------------------------------------------------ map building

  /** Build everything for a new map and draw the first frame. */
  setMap(v: MapView, keepView = false): BuildStats {
    const t0 = performance.now();
    this.clearMap();
    this.waterQueue.clear();
    const { W, H, heights } = v;
    // (a mine site's pit: the terrain leaves its tops out, and the site's model draws the pit)
    const source: TerrainSource = { W, H, heights, columns: columnMap(v.columns), cutout: mineCutout(v.entities, W, H) };
    const surface = surfaceWater(W, H, v.water);
    const sky = skyVisibility(W, H, heights);
    const soil = v.soil ?? null;
    const tiles = tileData(W, H, heights, sky, soil, surface);
    this.map = { W, H, heights, source, water: v.water, surface, entities: v.entities, soil, sky, tiles };
    this.objectGround = heights.slice();
    let lo = 255;
    let hi = 0;
    for (let i = 0; i < heights.length; i++) {
      if (heights[i] < lo) lo = heights[i];
      if (heights[i] > hi) hi = heights[i];
    }
    this.overlay = overlayTexture(W, H);
    this.marks = overlayTexture(W, H);
    this.edges = overlayTexture(W, H);
    contaminationEdges(W, H, tiles, this.edges.image.data as Uint8Array);
    this.sites = overlayTexture(W, H);
    this.sourceTiles = overlayTexture(W, H);
    this.tileTex = tileTexture(W, H, tiles);
    this.casters = objectCasters(W, H, v.entities);
    this.tops = { hi: new Float32Array(0), lo: new Float32Array(0) };
    this.lightTex = lightTexture(W, H, shadowMap(W, H, heights, this.casters, this.tops));
    const u = this.uniforms;
    u.overlay.value = this.overlay;
    u.marks.value = this.marks;
    u.contamEdges.value = this.edges;
    u.siteEdges.value = this.sites;
    u.sourceTex.value = this.sourceTiles;
    u.hatching.value = 0;
    u.tileTex.value = this.tileTex;
    u.lightTex.value = this.lightTex;
    u.mapSize.value.set(W, H);
    (this.terrainMat.uniforms.heightRange.value as Vector2).set(lo, hi);
    const { nx, ny } = chunkCount(W, H);
    let terrainQuads = 0;
    for (let cy = 0; cy < ny; cy++) for (let cx = 0; cx < nx; cx++) terrainQuads += this.meshTerrain(cx, cy);
    const waterQuads = this.meshAllWater();
    const falls = this.fallCount();
    this.skirt = this.buildSkirt(W, H, lo);
    if (!this.software) {
      this.waterMotion = new WaterMotion(W, H, this.baker, this.scene, u, () => this.requestRender());
      this.waterMotion.setHigh(this.lookNow !== "standard");
      this.waterMotion.setFlow(this.flowOn);
      u.flowTex.value = this.waterMotion.flow;
      this.waterMotion.waterChanged(heights, surface, true);
    }
    this.high?.setMap(W, H, heights, surface, v.entities);
    this.governor?.hold(performance.now());
    const instances = this.setEntitiesInner(v.entities);
    const meshMs = performance.now() - t0;
    if (!keepView) this.resetView();
    this.renderNow();
    // wait for the GPU to finish the first frame
    const ctx = this.gl.getContext();
    ctx.readPixels(0, 0, 1, 1, ctx.RGBA, ctx.UNSIGNED_BYTE, new Uint8Array(4));
    const ms = performance.now() - t0;
    this.lastBuild = { ms, meshMs, chunks: nx * ny, terrainQuads, waterQuads, falls, instances };
    this.scheduleProbe();
    this.highlight = null;
    this.pageOverlay = null;
    this.onMapChange?.();
    return this.lastBuild;
  }

  /** The map as drawn (read only): the legend reads what is on it. */
  mapState(): { W: number; H: number; heights: Uint8Array; surface: SurfaceWater; soil: SoilView | null; entities: EntityView } | null {
    const m = this.map;
    return m ? { W: m.W, H: m.H, heights: m.heights, surface: m.surface, soil: m.soil, entities: m.entities } : null;
  }

  /** The map's sides carried from level 0 down to three levels below its lowest ground, and its
   *  bottom, in the walls' stone. */
  private buildSkirt(W: number, H: number, lo: number): Mesh {
    const b = Math.min(0, lo) - 3;
    // east, west, north (−Z), south (+Z), each wound to face outward; and the bottom, facing down
    const quads: number[][] = [
      [W, 0, 0, W, b, 0, W, b, -H, W, 0, -H],
      [0, 0, -H, 0, b, -H, 0, b, 0, 0, 0, 0],
      [W, 0, -H, W, b, -H, 0, b, -H, 0, 0, -H],
      [0, 0, 0, 0, b, 0, W, b, 0, W, 0, 0],
      [0, b, 0, 0, b, -H, W, b, -H, W, b, 0],
    ];
    const normals = [[1, 0, 0], [-1, 0, 0], [0, 0, -1], [0, 0, 1], [0, -1, 0]];
    const pos: number[] = [];
    const nrm: number[] = [];
    const idx: number[] = [];
    quads.forEach((q, k) => {
      pos.push(...q);
      for (let v = 0; v < 4; v++) nrm.push(...normals[k].map((n) => n * 127));
      idx.push(k * 4, k * 4 + 1, k * 4 + 2, k * 4, k * 4 + 2, k * 4 + 3);
    });
    const g = new BufferGeometry();
    g.setAttribute("position", new BufferAttribute(new Float32Array(pos), 3));
    g.setAttribute("normal", new BufferAttribute(new Int8Array(nrm), 3, true));
    g.setIndex(idx);
    g.computeBoundingSphere();
    const mesh = new Mesh(g, this.terrainMat);
    mesh.matrixAutoUpdate = false;
    this.scene.add(mesh);
    return mesh;
  }

  private clearMap(): void {
    if (this.skirt) this.dropMesh(this.skirt);
    this.skirt = null;
    for (const m of this.terrain.values()) this.dropMesh(m);
    for (const m of this.water.values()) this.dropMesh(m);
    for (const m of this.falls.values()) this.dropMesh(m);
    this.terrain.clear();
    this.water.clear();
    this.falls.clear();
    if (this.objects) {
      this.scene.remove(this.objects);
      disposeGroup(this.objects);
      this.objects = null;
    }
    this.overlay?.dispose();
    this.marks?.dispose();
    this.edges?.dispose();
    this.sites?.dispose();
    this.sourceTiles?.dispose();
    this.sourceTiles = null;
    this.tileTex?.dispose();
    this.lightTex?.dispose();
    this.overlay = this.marks = this.edges = this.sites = this.tileTex = this.lightTex = null;
    this.map = null;
    this.waterMotion?.dispose();
    this.waterMotion = null;
    this.forceFx?.clear();
    this.setHeat(null);
  }

  private dropMesh(m: Mesh): void {
    this.scene.remove(m);
    m.geometry.dispose();
  }

  private meshTerrain(cx: number, cy: number): number {
    const key = `${cx},${cy}`;
    const old = this.terrain.get(key);
    if (old) this.dropMesh(old);
    this.terrain.delete(key);
    const d = meshChunk(this.map!.source, cx, cy);
    if (!d.quads) return 0;
    const g = new BufferGeometry();
    g.setAttribute("position", new BufferAttribute(d.positions, 3));
    g.setAttribute("normal", new BufferAttribute(d.normals, 3, true));
    g.setIndex(new BufferAttribute(d.indices, 1));
    g.computeBoundingSphere();
    const mesh = new Mesh(g, this.terrainMat);
    mesh.matrixAutoUpdate = false;
    this.scene.add(mesh);
    this.terrain.set(key, mesh);
    return d.quads;
  }

  private meshWater(cx: number, cy: number, lower: Map<number, number[]> | null): number {
    const key = `${cx},${cy}`;
    const old = this.water.get(key);
    if (old) this.dropMesh(old);
    this.water.delete(key);
    const m = this.map!;
    const d = meshWaterChunk(m.W, m.H, m.heights, m.surface, m.water, lower, cx, cy);
    this.meshFalls(key, d.falls, d.fallCount);
    if (!d.quads) return 0;
    const g = new BufferGeometry();
    g.setAttribute("position", new BufferAttribute(d.positions, 3));
    g.setAttribute("normal", new BufferAttribute(d.normals, 3, true));
    g.setAttribute("wdata", new BufferAttribute(d.data, 2));
    g.setAttribute("wflags", new BufferAttribute(d.flags, 1));
    g.setIndex(new BufferAttribute(d.indices, 1));
    g.computeBoundingSphere();
    const mesh = new Mesh(g, this.waterMat);
    mesh.matrixAutoUpdate = false;
    mesh.renderOrder = 2;
    this.scene.add(mesh);
    this.water.set(key, mesh);
    return d.quads;
  }

  /** A chunk's falls: one instance each of the shared template, its 16 floats in one buffer. */
  private meshFalls(key: string, data: Float32Array, count: number): void {
    const old = this.falls.get(key);
    if (old) this.dropMesh(old);
    this.falls.delete(key);
    if (!count) return;
    const g = new InstancedBufferGeometry();
    // (the template's arrays are shared; each chunk has its own buffers of them, so dropping one
    // chunk's falls never frees another's)
    g.setAttribute("rib", new BufferAttribute(this.fallShape.rib, 4));
    g.setIndex(new BufferAttribute(this.fallShape.index, 1));
    const buf = new InstancedInterleavedBuffer(data, FALL_STRIDE);
    g.setAttribute("fA", new InterleavedBufferAttribute(buf, 4, 0));
    g.setAttribute("fTop", new InterleavedBufferAttribute(buf, 4, 4));
    g.setAttribute("fShape", new InterleavedBufferAttribute(buf, 4, 8));
    g.setAttribute("fMore", new InterleavedBufferAttribute(buf, 4, 12));
    g.instanceCount = count;
    // the bounds: every lip's corner, from its landing to its top, and as far out as a fall reaches
    // (and runs on round a corner, D215)
    let x0 = Infinity;
    let x1 = -Infinity;
    let y0 = Infinity;
    let y1 = -Infinity;
    let z0 = Infinity;
    let z1 = -Infinity;
    for (let k = 0; k < count; k++) {
      const o = k * FALL_STRIDE;
      x0 = Math.min(x0, data[o]);
      x1 = Math.max(x1, data[o]);
      z0 = Math.min(z0, data[o + 1]);
      z1 = Math.max(z1, data[o + 1]);
      y0 = Math.min(y0, data[o + 6], data[o + 7]);
      y1 = Math.max(y1, data[o + 4], data[o + 5]);
    }
    const pad = 4.5;
    const c = new Vector3((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    g.boundingSphere = new Sphere(c, Math.hypot((x1 - x0) / 2 + pad, (y1 - y0) / 2 + 0.1, (z1 - z0) / 2 + pad));
    // a layer at a time for every fall (the splashes, the crowns' backs, the ribbons, the crowns'
    // fronts and the far sheets), so no fall's whitewater blends over its neighbour's ribbon (D222)
    for (const [start, n] of this.fallShape.layers) g.addGroup(start, n, 0);
    const mesh = new Mesh(g, [this.fallMat]);
    mesh.matrixAutoUpdate = false;
    // after the water's tops, so a fall draws over the pool it lands in
    mesh.renderOrder = 3;
    this.scene.add(mesh);
    this.falls.set(key, mesh);
  }

  private fallCount(): number {
    let n = 0;
    for (const m of this.falls.values()) n += (m.geometry as InstancedBufferGeometry).instanceCount;
    return n;
  }

  private meshAllWater(): number {
    const m = this.map!;
    const lower = lowerByTile(m.surface, m.water);
    const { nx, ny } = chunkCount(m.W, m.H);
    let quads = 0;
    for (let cy = 0; cy < ny; cy++) for (let cx = 0; cx < nx; cx++) quads += this.meshWater(cx, cy, lower);
    return quads;
  }

  /** Bake the sun's shadows again (the ground or the objects that cast them changed): round the
   *  objects that changed when the ground did not, else the whole map. */
  private bakeShadows(onlyCasters = false): void {
    const m = this.map;
    if (!m || !this.lightTex) return;
    const casters = objectCasters(m.W, m.H, m.entities);
    const rect = onlyCasters && this.tops ? castersChanged(this.casters, casters, m.W, m.H) : undefined;
    this.casters = casters;
    if (rect === null) return;
    if (rect && this.tops) shadowPairRect(this.tops, this.lightTex.image.data as Uint8Array, m.W, m.H, m.heights, casters, rect.x0, rect.y0, rect.x1, rect.y1);
    else {
      this.tops = { hi: new Float32Array(0), lo: new Float32Array(0) };
      (this.lightTex.image.data as Uint8Array).set(shadowMap(m.W, m.H, m.heights, casters, this.tops));
    }
    this.lightTex.needsUpdate = true;
  }

  /** The terrain shader's tile data again (heights, soil, sky, water). */
  private bakeTiles(): void {
    const m = this.map;
    if (!m || !this.tileTex) return;
    tileData(m.W, m.H, m.heights, m.sky, m.soil, m.surface, m.tiles);
    this.tileTex.needsUpdate = true;
    if (this.edges) {
      contaminationEdges(m.W, m.H, m.tiles, this.edges.image.data as Uint8Array);
      this.edges.needsUpdate = true;
    }
  }

  private setEntitiesInner(e: EntityView): number {
    if (this.objects) {
      this.high?.releaseObjects();
      this.scene.remove(this.objects);
      disposeGroup(this.objects);
    }
    const { group, instances } = buildEntities(e, this.objectMat, this.map?.soil ?? null, this.map?.W ?? 0, this.software);
    this.objectsMoved = false;
    // (a highlight belonged to the objects as they were)
    this.lit = [];
    group.renderOrder = 1;
    this.objects = group;
    this.scene.add(group);
    this.showMarkerObjects();
    const m = this.map!;
    m.entities = e;
    this.high?.objectsBuilt(group, e);
    // mine sites: the pits' cutouts (remesh the chunks where they changed) and their outline
    const cut = mineCutout(e, m.W, m.H);
    const old = m.source.cutout ?? new Map<number, number>();
    const changed = new Set<string>();
    for (const [i, z] of cut) if (old.get(i) !== z) changed.add(`${Math.floor((i % m.W) / CHUNK)},${Math.floor(Math.floor(i / m.W) / CHUNK)}`);
    for (const [i, z] of old) if (cut.get(i) !== z) changed.add(`${Math.floor((i % m.W) / CHUNK)},${Math.floor(Math.floor(i / m.W) / CHUNK)}`);
    m.source = { ...m.source, cutout: cut };
    for (const key of changed) {
      const [cx, cy] = key.split(",").map(Number);
      this.meshTerrain(cx, cy);
    }
    if (this.sites) {
      mineOutline(e, m.W, m.H, this.sites.image.data as Uint8Array);
      this.sites.needsUpdate = true;
    }
    this.markSources();
    return instances;
  }

  /** New terrain heights: remesh the chunks the change touches. Returns how many were remeshed. */
  updateTerrain(heights: Uint8Array): number {
    const m = this.map;
    if (!m) return 0;
    const rect = changedRect(m.W, m.H, m.heights, heights);
    m.heights = heights;
    m.source = { ...m.source, heights };
    // the map's own heights: its objects stand where it has them (new ones follow in updateEntities)
    this.objectGround = heights.slice();
    this.settleObjects();
    // (the game's rule: a layer above everything the map could hide shows the whole world)
    if (this.slice !== null && this.slice > this.topHiding()) this.setSlice(null);
    if (!rect) return 0;
    const chunks = dirtyChunks(m.W, m.H, rect);
    for (const [cx, cy] of chunks) this.meshTerrain(cx, cy);
    // the light round what changed: the sky each tile sees, the tile data, the shadows (the same
    // bytes as baking the whole map); and the water's shores there
    const r = SKY_REACH;
    skyVisibilityRect(m.W, m.H, heights, m.sky, rect.x0 - r, rect.y0 - r, rect.x1 + r, rect.y1 + r);
    if (this.tileTex) {
      tileDataRect(m.W, m.H, heights, m.sky, m.soil, m.surface, m.tiles, rect.x0 - r, rect.y0 - r, rect.x1 + r, rect.y1 + r);
      this.tileTex.needsUpdate = true;
      // (the contamination outline reads the tile data)
      if (this.edges) {
        contaminationEdges(m.W, m.H, m.tiles, this.edges.image.data as Uint8Array);
        this.edges.needsUpdate = true;
      }
    }
    if (this.tops && this.lightTex && this.casters !== undefined) {
      shadowPairRect(this.tops, this.lightTex.image.data as Uint8Array, m.W, m.H, heights, this.casters, rect.x0, rect.y0, rect.x1, rect.y1);
      this.lightTex.needsUpdate = true;
    } else this.bakeShadows();
    if (m.water.count) {
      // (a fall reads the ground two tiles round its lip: the chunks a tile further)
      const lower = lowerByTile(m.surface, m.water);
      for (const [cx, cy] of dirtyChunks(m.W, m.H, { x0: rect.x0 - 1, y0: rect.y0 - 1, x1: rect.x1 + 1, y1: rect.y1 + 1 })) this.meshWater(cx, cy, lower);
      this.high?.waterChanged(m.surface);
      this.waterMotion?.waterChanged(heights, m.surface);
    }
    this.high?.terrainChanged(heights, rect);
    this.requestRender();
    this.onMapChange?.();
    return chunks.length;
  }

  /** New water: remesh the chunks whose water changed. */
  updateWater(water: WaterView): number {
    const m = this.map;
    if (!m) return 0;
    const surface = surfaceWater(m.W, m.H, water);
    const changed = changedWaterChunks(m.W, m.H, m.surface, surface, m.surface.lower.length, surface.lower.length);
    m.water = water;
    m.surface = surface;
    const lower = lowerByTile(surface, water);
    // (a stroke's chunks still waiting are meshed now too, on this water)
    for (const key of this.waterQueue) changed.add(key);
    this.waterQueue.clear();
    for (const key of changed) {
      const [cx, cy] = key.split(",").map(Number);
      this.meshWater(cx, cy, lower);
    }
    // (the water round the brush may have come or gone)
    this.updateClearAround();
    this.bakeTiles();
    this.high?.waterChanged(surface);
    this.waterMotion?.waterChanged(m.heights, surface);
    this.requestRender();
    this.onMapChange?.();
    return changed.size;
  }

  /** Water chunks a stroke's water changed, still to mesh (`updateWaterSoon`). */
  private readonly waterQueue = new Set<string>();

  /** A stroke's water (live editing, D197): the map's water now (the hover, picking and the brush's
   *  clear water read it at once), and its changed chunks meshed a few milliseconds' worth a frame,
   *  nearest the view's middle first, with the ground's tile data under them. While a stroke is
   *  painted the water can move all over the map (a lake still filling after a force): meshing every
   *  changed chunk in the frame it came cost the page a frame each time (D244's measurements). An
   *  `updateWater` meshes whatever still waits. With caves, the whole path at once. */
  updateWaterSoon(water: WaterView): number {
    const m = this.map;
    if (!m) return 0;
    const surface = surfaceWater(m.W, m.H, water);
    if (m.surface.lower.length || surface.lower.length) return this.updateWater(water);
    const changed = changedWaterChunks(m.W, m.H, m.surface, surface, 0, 0);
    m.water = water;
    m.surface = surface;
    for (const key of changed) this.waterQueue.add(key);
    this.waterMotion?.waterChanged(m.heights, surface);
    this.updateClearAround();
    this.requestRender();
    this.onMapChange?.();
    return changed.size;
  }

  /** Mesh waiting water chunks for at most `budget` ms, nearest the view's middle first. */
  private drainWater(budget: number): void {
    const m = this.map;
    if (!m) {
      this.waterQueue.clear();
      return;
    }
    const t0 = performance.now();
    const tx = this.view.target[0] / CHUNK;
    const ty = -this.view.target[2] / CHUNK;
    const keys = [...this.waterQueue].map((k) => {
      const [cx, cy] = k.split(",").map(Number);
      return { k, cx, cy, d: (cx + 0.5 - tx) ** 2 + (cy + 0.5 - ty) ** 2 };
    });
    keys.sort((a, b) => a.d - b.d);
    let baked = false;
    for (const { k, cx, cy } of keys) {
      if (baked && performance.now() - t0 > budget) break;
      this.waterQueue.delete(k);
      this.meshWater(cx, cy, null);
      // the ground under it: its tile data (the water over each top)
      if (this.tileTex) {
        tileDataRect(m.W, m.H, m.heights, m.sky, m.soil, m.surface, m.tiles, cx * CHUNK - 1, cy * CHUNK - 1, (cx + 1) * CHUNK, (cy + 1) * CHUNK);
        this.tileTex.needsUpdate = true;
      }
      baked = true;
    }
  }

  /** New soil (moisture and contamination follow the water): the ground's colours. */
  updateSoil(soil: SoilView): void {
    const m = this.map;
    if (!m) return;
    m.soil = soil;
    this.bakeTiles();
    this.requestRender();
    this.onMapChange?.();
  }

  updateEntities(e: EntityView): void {
    if (!this.map) return;
    this.setEntitiesInner(e);
    this.bakeShadows(true);
    this.requestRender();
    this.onMapChange?.();
  }

  /** Heights changed inside `rect` only (a brush painting): remesh the chunks there, and the sky
   *  and tile data round it; the sun's shadows wait for `refreshShadows` (they reach far). The
   *  cheap path, fit for every frame: about a millisecond for a large brush at 256². */
  updateTerrainRect(heights: Uint8Array, rect: { x0: number; y0: number; x1: number; y1: number }): number {
    const m = this.map;
    if (!m) return 0;
    m.heights = heights;
    m.source = { ...m.source, heights };
    const chunks = dirtyChunks(m.W, m.H, rect);
    for (const [cx, cy] of chunks) this.meshTerrain(cx, cy);
    const r = SKY_REACH;
    skyVisibilityRect(m.W, m.H, heights, m.sky, rect.x0 - r, rect.y0 - r, rect.x1 + r, rect.y1 + r);
    if (this.tileTex) {
      tileDataRect(m.W, m.H, heights, m.sky, m.soil, m.surface, m.tiles, rect.x0 - r, rect.y0 - r, rect.x1 + r, rect.y1 + r);
      this.tileTex.needsUpdate = true;
    }
    if (m.water.count) {
      const lower = lowerByTile(m.surface, m.water);
      for (const [cx, cy] of chunks) this.meshWater(cx, cy, lower);
    }
    // the sun's shadows round what changed (they reach south-east of it)
    if (this.tops && this.lightTex && this.casters !== undefined) {
      shadowPairRect(this.tops, this.lightTex.image.data as Uint8Array, m.W, m.H, heights, this.casters, rect.x0, rect.y0, rect.x1, rect.y1);
      this.lightTex.needsUpdate = true;
    } else this.shadowsStale = true;
    this.shadowChanged = true;
    this.followGround(heights, rect);
    this.high?.terrainChanged(heights, rect);
    this.requestRender();
    return chunks.length;
  }

  // ------------------------------------------------------------------------------------ the shelf

  /** The tile under the pointer, as the last move over the map found it (null: off the map): a tool
   *  picked while the pointer rests on the map shows itself there at once. */
  hoverHit: TileHit | null = null;

  private ghost: { group: Group; key: string; undo?: () => void } | null = null;
  private thumbs = new Map<string, string>();
  private lit: { mesh: InstancedMesh; i: number; color: [number, number, number] }[] = [];

  /** The ghost of an object being placed (the left shelf, D184): the object itself, its footprint's
   *  corner at tile (x, y) on the ground at `z`, tinted green where it fits, red where it doesn't
   *  (null: not known yet); null puts it away. */
  setGhost(g: { template: string; x: number; y: number; z: number; orientation: number; ok: boolean | "warn" | null } | null): void {
    if (!g) {
      if (this.ghost) {
        this.scene.remove(this.ghost.group);
        this.ghost.undo?.();
        disposeGroup(this.ghost.group);
        this.ghost = null;
        this.updateClearAround();
        this.requestRender();
      }
      return;
    }
    const key = `${g.template}|${g.orientation}|${g.ok}`;
    if (!this.ghost || this.ghost.key !== key) {
      if (this.ghost) {
        this.scene.remove(this.ghost.group);
        this.ghost.undo?.();
        disposeGroup(this.ghost.group);
      }
      const one = oneObject(g.template, g.orientation);
      const { group } = buildEntities(one, this.objectMat, null, 0, this.software);
      // (the High look's own models, D241: the ghost shows what will be placed)
      const undo = this.high?.decorate(group, one);
      const tint: [number, number, number] | null = g.ok === null ? null : g.ok === "warn" ? [1.4, 1.1, 0.5] : g.ok ? [0.7, 1.3, 0.7] : [1.5, 0.55, 0.5];
      if (tint)
        for (const c of group.children) {
          const col = (c as InstancedMesh).instanceColor;
          if (!col) continue;
          const a = col.array as Float32Array;
          for (let k = 0; k < a.length; k++) a[k] = Math.min(2, a[k] * tint[k % 3]);
          col.needsUpdate = true;
        }
      group.renderOrder = 2;
      this.scene.add(group);
      this.ghost = { group, key, undo };
    }
    this.ghost.group.position.set(g.x, g.z, -g.y);
    this.updateClearAround();
    this.requestRender();
  }

  /** A small picture of an object in the map's look, as a data URL (the shelf's icons), made once
   *  per object; null when there is no view to draw it with. */
  thumbnail(template: string, px = 56): string | null {
    const had = this.thumbs.get(template);
    if (had) return had;
    if (this.disposed || typeof document === "undefined") return null;
    const one = oneObject(template, 0);
    const { group } = buildEntities(one, this.objectMat, null, 0, this.software);
    const undo = this.high?.decorate(group, one);
    // high above the map, where no shadow falls
    group.position.set(0, 40, 0);
    const scene = new Scene();
    scene.add(group);
    group.updateMatrixWorld(true);
    const box = new Box3();
    for (const c of group.children) {
      const m = c as InstancedMesh;
      m.computeBoundingBox();
      if (m.boundingBox) box.union(m.boundingBox.clone().applyMatrix4(m.matrixWorld));
    }
    if (box.isEmpty()) {
      undo?.();
      disposeGroup(group);
      return null;
    }
    const centre = box.getCenter(new Vector3());
    const size = box.getSize(new Vector3());
    const r = Math.max(0.6, 0.5 * Math.hypot(size.x, size.y, size.z));
    const cam = new PerspectiveCamera(30, 1, 0.1, 200);
    const dir = new Vector3(0.8, 0.75, 1).normalize();
    cam.position.copy(centre).addScaledVector(dir, r / Math.sin((15 * Math.PI) / 180));
    cam.lookAt(centre);
    const rt = new WebGLRenderTarget(px, px);
    const was = { target: this.gl.getRenderTarget(), slice: this.uniforms.slice.value, alpha: this.gl.getClearAlpha(), color: this.gl.getClearColor(new Color()) };
    this.uniforms.slice.value = 99;
    this.gl.setRenderTarget(rt);
    this.gl.setClearColor(0x000000, 0);
    this.gl.clear();
    this.gl.render(scene, cam);
    const pixels = new Uint8Array(px * px * 4);
    this.gl.readRenderTargetPixels(rt, 0, 0, px, px, pixels);
    this.gl.setRenderTarget(was.target);
    this.gl.setClearColor(was.color, was.alpha);
    this.uniforms.slice.value = was.slice;
    rt.dispose();
    undo?.();
    disposeGroup(group);
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = px;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    const img = ctx.createImageData(px, px);
    // (the render target's rows run bottom up)
    for (let y = 0; y < px; y++) img.data.set(pixels.subarray((px - 1 - y) * px * 4, (px - y) * px * 4), y * px * 4);
    ctx.putImageData(img, 0, 0);
    const url = canvas.toDataURL();
    this.thumbs.set(template, url);
    this.requestRender();
    return url;
  }

  /** Objects on these tiles show in a colour (Remove's red under the pointer, D184); null puts them
   *  back as they are. */
  highlightObjects(tiles: readonly number[] | null, color: [number, number, number] = [1.6, 0.35, 0.3]): void {
    for (const l of this.lit) {
      const a = l.mesh.instanceColor!.array as Float32Array;
      a.set(l.color, l.i * 3);
      l.mesh.instanceColor!.needsUpdate = true;
    }
    this.lit = [];
    const m = this.map;
    if (m && this.objects && tiles?.length) {
      const want = new Set(tiles);
      for (const c of this.objects.children) {
        const mesh = c as InstancedMesh;
        const own = mesh.userData.objects as Int32Array | undefined;
        if (!own || !mesh.instanceColor) continue;
        const a = mesh.instanceColor.array as Float32Array;
        for (let i = 0; i < own.length; i++) {
          const k = own[i];
          if (k < 0 || !want.has(m.entities.y[k] * m.W + m.entities.x[k])) continue;
          this.lit.push({ mesh, i, color: [a[i * 3], a[i * 3 + 1], a[i * 3 + 2]] });
          // (a source's blue would only darken: it turns a clear red, D249)
          const t = m.entities.templates[m.entities.template[k]];
          const c = t === "WaterSource" || t === "BadwaterSource" ? SOURCE_GLOW : color;
          for (let j = 0; j < 3; j++) a[i * 3 + j] = Math.min(2, a[i * 3 + j] * c[j]);
          mesh.instanceColor.needsUpdate = true;
        }
      }
    }
    this.requestRender();
  }

  // ------------------------------------------------------------------------------------ juice

  private effects: Effects | null = null;

  /** Whether the land's little effects play (D205): not with reduced motion, not in software. */
  get juicy(): boolean {
    return !this.reducedMotion && !this.software && !!this.map;
  }

  /** Motion is welcome (not reduced): a force's camera may follow it (D199). */
  get motion(): boolean {
    return !this.reducedMotion;
  }

  private surge: Surge | null = null;
  private forceFx: ForceEffects | null = null;

  /** A force's moment (D202, D203, D206): an impact, a fault's crack, an eruption's plume; the
   *  effects play on their own clocks. Not with reduced motion, not in software. */
  setForceMoment(m: ForceMoment): void {
    if (!this.juicy || m.verb === "carve") return;
    this.forceFxOf().set(m);
  }

  /** The force was kept: its tails play out (dust settling, lava cooling). */
  forceDone(): void {
    this.forceFx?.finish();
  }

  /** Esc, undo: a force's effects and its heat go at once. */
  clearForce(): void {
    this.forceFx?.clear();
    this.setHeat(null);
  }

  private forceFxOf(): ForceEffects {
    return (this.forceFx ??= new ForceEffects(this.scene, () => this.requestRender(), (x, y) => {
      const m = this.map;
      if (!m) return 0;
      const i = Math.max(0, Math.min(m.H - 1, Math.round(y))) * m.W + Math.max(0, Math.min(m.W - 1, Math.round(x)));
      return m.heights[i];
    }));
  }

  /** An eruption's heat on the ground (D206): its mask (RGBA a tile, core/forces/runs.ts), or null. */
  setHeat(mask: Uint8Array | null): void {
    const u = this.terrainMat?.uniforms;
    if (!u?.eruptionMask) return;
    const m = this.map;
    const old = u.eruptionMask.value as DataTexture;
    if (!mask || !m || mask.length !== m.W * m.H * 4 || this.software) {
      u.eruptionAge.value = -1;
      if (old.image.width !== 1) {
        old.dispose();
        u.eruptionMask.value = overlayTexture(1, 1);
      }
      return;
    }
    old.dispose();
    const t = overlayTexture(m.W, m.H);
    (t.image.data as Uint8Array).set(mask);
    t.magFilter = t.minFilter = LinearFilter;
    t.needsUpdate = true;
    u.eruptionMask.value = t;
    this.requestRender();
  }

  /** A force's head at work (a carve's surge, D199), on the ground shown; null puts it away. Not
   *  with reduced motion, not in software. */
  setSurge(head: SurgeHead | null, trail: readonly SurgePoint[] = []): void {
    const m = this.map;
    if (!head || !m || !this.juicy) {
      this.surge?.set(null, [], new Uint8Array(1), 1);
      return;
    }
    (this.surge ??= new Surge(this.scene, () => this.requestRender())).set(head, trail, m.heights, m.W);
  }

  /** Where tile (x, y) is in the view, for a sound (D220, D226): its distance (0 near, 1 far) and its
   *  pan (−1 left, 1 right). What is on screen is what is being edited: it plays at nearly its full
   *  level at any zoom (the camera's own distance made every sound far, a whisper, at the usual
   *  views); only what is off screen fades and softens, the further off the more. */
  soundPlace(x: number, y: number): { distance: number; pan: number } {
    const m = this.map;
    if (!m) return { distance: 0, pan: 0 };
    const i = Math.max(0, Math.min(m.H - 1, Math.round(y))) * m.W + Math.max(0, Math.min(m.W - 1, Math.round(x)));
    const p = new Vector3(x + 0.5, m.heights[i], -(y + 0.5));
    const ndc = p.project(this.camera());
    const off = Math.max(Math.abs(ndc.x), Math.abs(ndc.y));
    return { distance: Number.isFinite(off) && ndc.z <= 1 ? Math.max(0, Math.min(1, (off - 0.8) / 1.5)) : 1, pan: Number.isFinite(ndc.x) ? Math.max(-1, Math.min(1, ndc.x)) : 0 };
  }

  /** A puff of dust where ground was lowered at tile (x, y), `size` tiles across. */
  puff(x: number, y: number, size: number): void {
    const m = this.map;
    if (!this.juicy || !m || x < 0 || y < 0 || x >= m.W || y >= m.H) return;
    (this.effects ??= new Effects(this.scene, () => this.requestRender())).puff(x, y, m.heights[y * m.W + x], size);
  }

  /** Rings spreading on the water at tile (x, y) (a source starting). */
  ripple(x: number, y: number): void {
    const m = this.map;
    if (!this.juicy || !m || x < 0 || y < 0 || x >= m.W || y >= m.H) return;
    const i = y * m.W + x;
    const s = m.surface.surface[i];
    (this.effects ??= new Effects(this.scene, () => this.requestRender())).ripple(x, y, s === s ? s : m.heights[i]);
  }

  /** A pop and a little wiggle for the objects on these tiles (a placed object): they grow from a
   *  little smaller, overshoot and settle, in about a third of a second. */
  wiggle(tiles: readonly number[]): void {
    const m = this.map;
    const objects = this.objects;
    if (!this.juicy || !m || !objects || !tiles.length) return;
    const want = new Set(tiles);
    const e = m.entities;
    const items: { mesh: InstancedMesh; i: number; base: Float32Array }[] = [];
    for (const c of objects.children) {
      const mesh = c as InstancedMesh;
      const own = mesh.userData.objects as Int32Array | undefined;
      if (!own) continue;
      const a = mesh.instanceMatrix.array as Float32Array;
      for (let i = 0; i < own.length; i++) {
        const k = own[i];
        if (k >= 0 && want.has(e.y[k] * m.W + e.x[k])) items.push({ mesh, i, base: a.slice(i * 16, i * 16 + 16) });
      }
    }
    if (!items.length) return;
    const t0 = performance.now();
    const step = () => {
      // (the objects rebuilt meanwhile: the new ones stand as built)
      if (this.disposed || this.objects !== objects) return;
      const t = Math.min(1, (performance.now() - t0) / 360);
      const s = 1 - 0.3 * Math.cos(3 * Math.PI * t) * (1 - t) ** 2;
      for (const it of items) {
        const a = it.mesh.instanceMatrix.array as Float32Array;
        for (const j of [0, 1, 2, 4, 5, 6, 8, 9, 10]) a[it.i * 16 + j] = it.base[j] * s;
        it.mesh.instanceMatrix.needsUpdate = true;
      }
      this.requestRender();
      if (t < 1) requestAnimationFrame(step);
    };
    step();
  }

  /** Plants and ruins on the tiles of `rect` stand on the ground shown there: each moves by as
   *  much as its ground moved from the map's (a brush painting, a shape dragged). The worker's next
   *  map puts every object where the map has it (updateTerrain, updateEntities). */
  private followGround(heights: Uint8Array, rect: { x0: number; y0: number; x1: number; y1: number }): void {
    const m = this.map;
    const g = this.objectGround;
    if (!m || !g || !this.objects) return;
    const e = m.entities;
    for (const c of this.objects.children) {
      const mesh = c as InstancedMesh;
      const follows = mesh.userData.follows as Int32Array | undefined;
      const ty0 = mesh.userData.ty0 as Float32Array | undefined;
      if (!follows || !ty0) continue;
      const a = mesh.instanceMatrix.array as Float32Array;
      let moved = false;
      for (let i = 0; i < follows.length; i++) {
        const k = follows[i];
        if (k < 0) continue;
        const x = e.x[k];
        const y = e.y[k];
        if (x < rect.x0 || x > rect.x1 || y < rect.y0 || y > rect.y1) continue;
        const t = y * m.W + x;
        const ty = Math.fround(ty0[i] + heights[t] - g[t]);
        if (a[i * 16 + 13] !== ty) {
          a[i * 16 + 13] = ty;
          moved = true;
        }
      }
      if (moved) {
        mesh.instanceMatrix.needsUpdate = true;
        this.objectsMoved = true;
      }
    }
  }

  /** Every object back where the map has it. */
  private settleObjects(): void {
    if (!this.objectsMoved || !this.objects) return;
    this.objectsMoved = false;
    for (const c of this.objects.children) {
      const mesh = c as InstancedMesh;
      const ty0 = mesh.userData.ty0 as Float32Array | undefined;
      if (!ty0) continue;
      const a = mesh.instanceMatrix.array as Float32Array;
      for (let i = 0; i < ty0.length; i++) a[i * 16 + 13] = ty0[i];
      mesh.instanceMatrix.needsUpdate = true;
    }
  }

  /** After a brush has painted: the shadows, if they waited, and the legend. */
  refreshShadows(): void {
    if (this.shadowsStale) {
      this.shadowsStale = false;
      this.bakeShadows();
    }
    if (!this.shadowChanged) return;
    this.shadowChanged = false;
    this.requestRender();
    this.onMapChange?.();
  }

  /** The brush under the cursor, as last shown (tests). */
  brushCursorState: BrushCursorState | null = null;

  /** Show the brush under the cursor (null hides it). */
  setBrushCursor(s: BrushCursorState | null): void {
    const m = this.map;
    if (!m) return;
    this.brushCursorState = s;
    this.updateClearAround();
    if (!this.cursor) {
      if (!s) return;
      this.cursor = new BrushCursor(this.scene);
    }
    this.cursor.set(s, m.heights, m.W, m.H);
    this.requestRender();
  }

  /** A force's size at the cursor (D312, D321 item 13): one calm ring on the water's surface over
   *  water, on the ground elsewhere; `marker`, only a small dot where the cursor is (D368 (2)); null
   *  hides it. */
  setForceRing(s: { x: number; y: number; r: number; marker?: boolean } | null): void {
    const m = this.map;
    if (!m) return;
    this.forceRingState = s;
    if (!this.ring) {
      if (!s) return;
      this.ring = new ForceRing(this.scene);
    }
    const level = (tx: number, ty: number) => {
      const i = ty * m.W + tx;
      const top = this.slice === null ? m.heights[i] : Math.min(m.heights[i], this.slice);
      return m.surface.depth[i] > 0.05 && this.slice === null ? Math.max(top, m.surface.surface[i]) : top;
    };
    this.ring.set(s, level, m.W, m.H);
    this.requestRender();
  }

  /** Where the water is clear round the pointer (D212): the middle and radius, or null (tests). */
  clearNear: { x: number; y: number; radius: number } | null = null;

  /** Clear water round the brush (D212): the water under and right round the brush turns
   *  see-through while the brush is over water already there (painting a submerged bed: at least
   *  half the tiles at its middle are wet); working on dry land leaves the water as it is. The
   *  shelf's ghost does the same over the tile under the pointer (placing on a bed). */
  private updateClearAround(): void {
    const m = this.map;
    const b = this.brushCursorState;
    const h = this.hoverHit;
    const at = b ? { x: b.x, y: b.y, r: b.radius } : this.ghost && h ? { x: h.x + 0.5, y: h.y + 0.5, r: 1.5 } : null;
    let on = false;
    if (m && at) {
      const core = Math.max(0.75, at.r * 0.4);
      let n = 0;
      let wet = 0;
      for (let y = Math.max(0, Math.floor(at.y - core)); y <= Math.min(m.H - 1, Math.floor(at.y + core)); y++)
        for (let x = Math.max(0, Math.floor(at.x - core)); x <= Math.min(m.W - 1, Math.floor(at.x + core)); x++) {
          if ((x + 0.5 - at.x) ** 2 + (y + 0.5 - at.y) ** 2 > core * core) continue;
          n++;
          if (m.surface.depth[y * m.W + x] > 0.05) wet++;
        }
      on = n > 0 && wet * 2 >= n;
    }
    const u = this.uniforms.clearAround.value;
    const next = on && at ? { x: at.x, y: at.y, radius: at.r + 0.5 } : null;
    const was = this.clearNear;
    if (was === next || (was && next && was.x === next.x && was.y === next.y && was.radius === next.radius)) return;
    this.clearNear = next;
    if (next) u.set(next.x, next.y, next.radius, 1);
    else u.w = 0;
    this.requestRender();
  }

  /** Remesh every terrain chunk the renderer would touch for the tiles in rect (tests). */
  remeshRect(rect: { x0: number; y0: number; x1: number; y1: number }): number {
    const m = this.map;
    if (!m) return 0;
    const chunks = dirtyChunks(m.W, m.H, rect);
    for (const [cx, cy] of chunks) this.meshTerrain(cx, cy);
    this.requestRender();
    return chunks.length;
  }

  // --------------------------------------------------------------------------------- overlays

  /** The overlay's RGBA bytes (tile (x, y) at (y·W + x)·4): write, then `commitOverlay`. A tile
   *  with alpha 255 is drawn hatched with a dark rim (dam sites); any other alpha tints it. */
  overlayData(): Uint8Array | null {
    return (this.overlay?.image.data as Uint8Array | undefined) ?? null;
  }

  commitOverlay(): void {
    const m = this.map;
    if (!this.overlay || !this.marks || !m) return;
    const data = this.overlay.image.data as Uint8Array;
    // the page's own paint, kept apart from the highlight drawn over it
    if (!this.pageOverlay || this.pageOverlay.length !== data.length) this.pageOverlay = new Uint8Array(data.length);
    this.pageOverlay.set(data);
    if (this.highlight) paintHighlight(data, m.W, m.H, this.highlight);
    this.overlay.needsUpdate = true;
    const marks = hatchMarks(m.W, m.H, this.overlay.image.data as Uint8Array, this.marks.image.data as Uint8Array);
    let any = 0;
    for (let i = 0; i < marks.length && !any; i += 4) any = marks[i] | marks[i + 1];
    this.uniforms.hatching.value = any ? 1 : 0;
    this.marks.needsUpdate = true;
    this.requestRender();
  }

  /** Point to tiles on the map (the legend: "these are the dam sites"), until cleared with null.
   *  Drawn over the page's overlay: a light tint, their edge brighter. */
  setHighlight(tiles: ArrayLike<number> | null): void {
    const m = this.map;
    if (!m || !this.overlay) return;
    const data = this.overlay.image.data as Uint8Array;
    if (!this.pageOverlay) {
      this.pageOverlay = new Uint8Array(data.length);
      this.pageOverlay.set(data);
    }
    if (tiles && tiles.length) {
      const h = new Uint8Array(m.W * m.H);
      for (let k = 0; k < tiles.length; k++) h[tiles[k]] = 1;
      this.highlight = h;
    } else this.highlight = null;
    data.set(this.pageOverlay);
    this.commitOverlay();
  }

  get highlighted(): boolean {
    return this.highlight !== null;
  }

  setHoverTile(x: number | null, y = 0): void {
    const u = this.terrainMat.uniforms.hover;
    const v = u.value as Vector3;
    if (x === null) {
      if (v.z === 0) return;
      v.set(0, 0, 0);
    } else {
      if (v.z === 1 && v.x === x && v.y === y) return;
      v.set(x, y, 1);
    }
    this.requestRender();
  }

  // ---------------------------------------------------------------------------------- camera

  getView(): ViewState {
    return { ...this.view, target: [...this.view.target] as [number, number, number] };
  }

  setView(v: Partial<ViewState>): void {
    this.view = { ...this.view, ...v };
    this.view.pitch = Math.min(PITCH_MAX, Math.max(PITCH_MIN, this.view.pitch));
    this.requestRender();
  }

  setMode(mode: ViewMode): void {
    this.setView({ mode });
    // (a view switched to frames the whole map, centred: D345, B1)
    this.frameMap();
    this.requestRender();
  }

  private glideFrameTo = 0;
  /** Glide smoothly to a view (a camera bookmark, D205): target, turn, tilt and zoom eased there in
   *  about half a second (at once with reduced motion); a top-down or orbit view switches at once. */
  glideTo(to: ViewState, ms = 600): void {
    cancelAnimationFrame(this.glideFrameTo);
    const from = this.getView();
    if (this.reducedMotion || ms <= 0) {
      this.setView({ ...to, target: [...to.target] as [number, number, number] });
      return;
    }
    // (the shorter way round)
    let dyaw = to.yaw - from.yaw;
    while (dyaw > Math.PI) dyaw -= 2 * Math.PI;
    while (dyaw < -Math.PI) dyaw += 2 * Math.PI;
    const t0 = performance.now();
    const step = () => {
      const t = Math.min(1, (performance.now() - t0) / ms);
      const e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
      this.setView({
        mode: to.mode,
        yaw: from.yaw + dyaw * e,
        pitch: from.pitch + (to.pitch - from.pitch) * e,
        distance: Math.exp(Math.log(from.distance) + (Math.log(to.distance) - Math.log(from.distance)) * e),
        target: [0, 1, 2].map((k) => from.target[k] + (to.target[k] - from.target[k]) * e) as [number, number, number],
      });
      if (t < 1 && !this.disposed) this.glideFrameTo = requestAnimationFrame(step);
    };
    step();
  }

  resetView(): void {
    const m = this.map;
    if (!m) return;
    let sum = 0;
    for (let i = 0; i < m.heights.length; i++) sum += m.heights[i];
    const mean = sum / m.heights.length;
    const span = Math.max(m.W, m.H);
    this.view = { ...this.view, yaw: DEFAULT_YAW, pitch: DEFAULT_PITCH, distance: span * 1.6, target: [m.W / 2, mean, -m.H / 2] };
    this.frameMap();
    this.requestRender();
  }

  /** The map waits to be framed until the canvas has a size. */
  private framePending = false;

  /** Frame the map in the view (D345, B1): the whole map inside the canvas with a margin, its middle at
   *  the canvas's middle, whatever the view (orbit or top-down) and however big the window. The map's
   *  four corners are projected; the distance scales to fit them and the target moves to centre them. */
  frameMap(): void {
    const m = this.map;
    if (!m) return;
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    if (!w || !h) {
      this.framePending = true;
      return;
    }
    this.framePending = false;
    let sum = 0;
    for (let i = 0; i < m.heights.length; i++) sum += m.heights[i];
    const level = sum / m.heights.length;
    const corners: [number, number][] = [[0, 0], [m.W, 0], [0, m.H], [m.W, m.H]];
    const box = () => {
      let x0 = Infinity;
      let y0 = Infinity;
      let x1 = -Infinity;
      let y1 = -Infinity;
      for (const [x, y] of corners) {
        const p = this.project(x, level, -y);
        x0 = Math.min(x0, p.x);
        x1 = Math.max(x1, p.x);
        y0 = Math.min(y0, p.y);
        y1 = Math.max(y1, p.y);
      }
      return { x0, y0, x1, y1 };
    };
    const r = this.canvas.getBoundingClientRect();
    for (let pass = 0; pass < 4; pass++) {
      let b = box();
      const s = Math.max((b.x1 - b.x0) / (w * 0.86), (b.y1 - b.y0) / (h * 0.86));
      if (Number.isFinite(s) && s > 0) this.view.distance = Math.min(this.view.distance * s, Math.max(m.W, m.H) * 6);
      b = box();
      const at = this.pickAtLevel(r.left + (b.x0 + b.x1) / 2, r.top + (b.y0 + b.y1) / 2, level);
      const mid = this.pickAtLevel(r.left + w / 2, r.top + h / 2, level);
      if (!at || !mid) break;
      this.view.target = [this.view.target[0] + at.point[0] - mid.point[0], this.view.target[1], this.view.target[2] + at.point[2] - mid.point[2]];
    }
  }

  private camera(): PerspectiveCamera | OrthographicCamera {
    return this.view.mode === "top" ? this.ortho : this.persp;
  }

  private placeCamera(): void {
    const v = this.view;
    const [tx, ty, tz] = v.target;
    const w = this.canvas.clientWidth || 1;
    const h = this.canvas.clientHeight || 1;
    const aspect = w / h;
    if (v.mode === "top") {
      const half = v.distance * 0.42;
      this.ortho.left = -half * aspect;
      this.ortho.right = half * aspect;
      this.ortho.top = half;
      this.ortho.bottom = -half;
      this.ortho.position.set(tx, 200, tz);
      this.ortho.up.set(0, 0, -1);
      this.ortho.lookAt(tx, 0, tz);
      this.ortho.updateProjectionMatrix();
    } else {
      const cp = Math.cos(v.pitch);
      this.persp.aspect = aspect;
      this.persp.position.set(tx + Math.sin(v.yaw) * cp * v.distance, ty + Math.sin(v.pitch) * v.distance, tz + Math.cos(v.yaw) * cp * v.distance);
      this.persp.up.set(0, 1, 0);
      this.persp.lookAt(tx, ty, tz);
      this.persp.far = v.distance * 4 + 1000;
      this.persp.updateProjectionMatrix();
    }
    // a light haze beyond the point looked at, none from straight above
    const u = this.uniforms;
    u.viewHeight.value = h;
    u.hazeAmount.value = v.mode === "top" ? 0 : 0.24;
    u.hazeRange.value.set(v.distance * 0.85, v.distance * 2.6);
  }

  // --------------------------------------------------------------------------------- rendering

  requestRender(): void {
    if (this.frame || this.disposed) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.renderNow();
    });
  }

  renderNow(): void {
    if (this.disposed) return;
    // a stroke's water still to mesh: a few milliseconds of it a frame (updateWaterSoon)
    if (this.waterQueue.size) {
      this.drainWater(WATER_MESH_BUDGET_MS);
      if (this.waterQueue.size) this.requestRender();
    }
    this.placeCamera();
    this.uniforms.time.value = this.clock ?? (performance.now() - this.t0) / 1000;
    const t0 = performance.now();
    // a force's heat on the ground (the camera never shakes, D265)
    const fx = this.forceFx;
    const heat = fx && !this.reducedMotion ? fx.heat(t0) : null;
    const u = this.terrainMat.uniforms;
    if (u.eruptionAge) {
      u.eruptionAge.value = heat ? heat.age : -1;
      u.coolingAge.value = heat ? heat.cooling : 0;
    }
    const cam = this.camera();
    const q = this.beginGpuTimer();
    const cost = this.beginCost();
    this.high?.beforeRender(cam, this.canvas.clientHeight || 1, this.uniforms.time.value);
    this.waterMotion?.beforeRender(this.canvas.clientWidth || 1, this.canvas.clientHeight || 1, this.gl.getPixelRatio());
    this.gl.render(this.scene, cam);
    this.endCost(cost, t0);
    this.endGpuTimer(q);
    if (this.recording) this.cpuTimes.push(performance.now() - t0);
    // tell the page only when the view moved (the water's frames do not)
    const v = this.view;
    const key = `${v.mode} ${v.yaw} ${v.pitch} ${v.distance} ${v.target.join(" ")} ${this.canvas.clientWidth}x${this.canvas.clientHeight}`;
    if (key !== this.lastViewKey) {
      this.lastViewKey = key;
      this.onView?.(this.getView());
    }
    if (this.animated && !this.animTimer) {
      this.animTimer = window.setTimeout(() => {
        this.animTimer = 0;
        this.requestRender();
      }, 1000 / WATER_FPS);
    }
  }

  private fit(): void {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    if (!w || !h) return;
    this.gl.setSize(w, h, false);
    // (frames right after a resize don't count toward the automatic look's verdict)
    this.governor?.hold(performance.now());
    if (this.framePending) this.frameMap();
    this.requestRender();
  }

  // -------------------------------------------------------------------------------- picking

  rayAt(clientX: number, clientY: number): Ray {
    const r = this.canvas.getBoundingClientRect();
    const ndc = new Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    this.placeCamera();
    this.raycaster.setFromCamera(ndc, this.camera());
    const o = this.raycaster.ray.origin;
    const d = this.raycaster.ray.direction;
    return { origin: [o.x, o.y, o.z], direction: [d.x, d.y, d.z] };
  }

  /** What the camera sees of the ground (the minimap's outline, D205): the view's four corners on
   *  the level the camera looks at, in tiles (x east, y north), far corners held to a few map
   *  widths when the view looks over the horizon. */
  groundFootprint(): [number, number][] {
    const m = this.map;
    const r = this.canvas.getBoundingClientRect();
    if (!m || !r.width || !r.height) return [];
    const level = this.view.target[1];
    const far = 3 * Math.max(m.W, m.H);
    const corners: [number, number][] = [
      [r.left, r.top],
      [r.right, r.top],
      [r.right, r.bottom],
      [r.left, r.bottom],
    ];
    return corners.map(([cx, cy]) => {
      const ray = this.rayAt(cx, cy);
      const [ox, oy, oz] = ray.origin;
      const [dx, dy, dz] = ray.direction;
      let t = dy < -1e-6 ? (level - oy) / dy : far;
      if (!(t > 0) || t > far) t = far;
      return [ox + dx * t, -(oz + dz * t)] as [number, number];
    });
  }

  /** The tile under a point on the screen. */
  pick(clientX: number, clientY: number): TileHit | null {
    const m = this.map;
    if (!m) return null;
    const cut = this.slice;
    if (cut === null) return pickHeightfield(this.rayAt(clientX, clientY), m.W, m.H, m.heights);
    // under a slice, the ray lands on the cut
    if (!this.sliced || this.sliced.length !== m.heights.length) this.sliced = new Uint8Array(m.heights.length);
    for (let i = 0; i < m.heights.length; i++) this.sliced[i] = Math.min(m.heights[i], cut);
    return pickHeightfield(this.rayAt(clientX, clientY), m.W, m.H, this.sliced);
  }

  /** The tile under a point on the screen as it is seen: over water, where the ray meets the water's
   *  surface (D321, item 13: a force's cursor is where the pointer is, not on the bed below). */
  pickSurface(clientX: number, clientY: number): TileHit | null {
    const hit = this.pick(clientX, clientY);
    const m = this.map;
    if (!hit || !m || this.slice !== null) return hit;
    const i = hit.y * m.W + hit.x;
    if (!(m.surface.depth[i] > 0.05)) return hit;
    const p = pickPlane(this.rayAt(clientX, clientY), m.surface.surface[i]);
    if (!p || p.x < 0 || p.y < 0 || p.x >= m.W || p.y >= m.H) return hit;
    return { x: p.x, y: p.y, point: p.point, face: "top", t: hit.t };
  }

  /** The tile under the pointer for a tool (the water's surface for one that asks for it). */
  private pickFor(t: PointerTool | null, clientX: number, clientY: number): TileHit | null {
    return t?.surface ? this.pickSurface(clientX, clientY) : this.pick(clientX, clientY);
  }

  /** The tile under a point on the screen, on a level plane (steady while dragging). */
  pickAtLevel(clientX: number, clientY: number, level: number): { x: number; y: number; point: [number, number, number] } | null {
    return pickPlane(this.rayAt(clientX, clientY), level);
  }

  /** Screen position (CSS px, relative to the canvas) of a world point, and whether it is in view. */
  project(X: number, Y: number, Z: number): { x: number; y: number; visible: boolean } {
    this.placeCamera();
    const v = new Vector3(X, Y, Z).project(this.camera());
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    return { x: ((v.x + 1) / 2) * w, y: ((1 - v.y) / 2) * h, visible: v.z > -1 && v.z < 1 && Math.abs(v.x) <= 1 && Math.abs(v.y) <= 1 };
  }

  /** Client coordinates of a tile's top centre (tests drive the pointer with it). */
  tileToClient(x: number, y: number): { x: number; y: number; visible: boolean } {
    const m = this.map;
    const h = m ? m.heights[y * m.W + x] : 0;
    const p = this.project(x + 0.5, h, -(y + 0.5));
    const r = this.canvas.getBoundingClientRect();
    return { x: p.x + r.left, y: p.y + r.top, visible: p.visible };
  }

  heightAt(x: number, y: number): number {
    const m = this.map;
    return m && x >= 0 && y >= 0 && x < m.W && y < m.H ? m.heights[y * m.W + x] : 0;
  }

  get size(): { W: number; H: number } | null {
    return this.map ? { W: this.map.W, H: this.map.H } : null;
  }

  // ---------------------------------------------------------------------------------- input

  private on(target: EventTarget, type: string, fn: EventListener, opts?: AddEventListenerOptions): void {
    target.addEventListener(type, fn, opts);
    this.listeners.push([target, type, fn, opts]);
  }

  private bindInput(): void {
    const c = this.canvas;
    c.tabIndex = 0;
    this.on(c, "contextmenu", (e) => e.preventDefault());
    // (a pointer made up by a script has no capture to take: the drag works without it)
    const capture = (id: number) => {
      try {
        c.setPointerCapture(id);
      } catch {
        /* no such pointer */
      }
    };
    this.on(c, "pointerdown", (e) => {
      const ev = e as PointerEvent;
      c.focus({ preventScroll: true });
      // Alt+middle-click (the game's), or Alt+click: the clicked tile's layer (again: the whole world)
      if ((ev.button === 1 || (ev.button === 0 && !this.tool?.wantsAlt)) && ev.altKey && this.map) {
        ev.preventDefault();
        const hit = this.pick(ev.clientX, ev.clientY);
        if (hit) this.pickSlice(hit);
        return;
      }
      const grab = ev.button === 0 && this.grab ? this.grab(this.pick(ev.clientX, ev.clientY), ev) : null;
      if (grab) {
        this.grabbed = grab;
        this.drag = { kind: "tool", x: ev.clientX, y: ev.clientY, id: ev.pointerId, moved: 0, button: 0 };
        capture(ev.pointerId);
        return;
      }
      if (ev.button === 0 && this.tool) {
        const hit = this.pickFor(this.tool, ev.clientX, ev.clientY);
        if (this.tool.down(hit, ev)) {
          this.drag = { kind: "tool", x: ev.clientX, y: ev.clientY, id: ev.pointerId, moved: 0, button: 0 };
          capture(ev.pointerId);
          return;
        }
      }
      const kind = ev.button === 2 || ev.button === 1 || ev.shiftKey || this.view.mode === "top" ? "pan" : "orbit";
      this.drag = { kind: ev.button === 1 && this.view.mode === "orbit" ? "orbit" : kind, x: ev.clientX, y: ev.clientY, id: ev.pointerId, moved: 0, button: ev.button };
      capture(ev.pointerId);
    });
    this.on(c, "pointermove", (e) => {
      const ev = e as PointerEvent;
      const d = this.drag;
      if (d && d.id === ev.pointerId) {
        const dx = ev.clientX - d.x;
        const dy = ev.clientY - d.y;
        d.x = ev.clientX;
        d.y = ev.clientY;
        d.moved += Math.abs(dx) + Math.abs(dy);
        if (d.kind !== "tool" && d.moved < 4) return;
        if (d.kind === "tool") {
          const t = this.grabbed ?? this.tool;
          t?.move(this.pickFor(t, ev.clientX, ev.clientY), ev);
        }
        else if (d.kind === "orbit") this.setView({ yaw: this.view.yaw - dx * 0.006, pitch: this.view.pitch + dy * 0.005 });
        else this.panPixels(dx, dy);
        return;
      }
      const hit = this.pick(ev.clientX, ev.clientY);
      this.hoverHit = hit;
      this.setHoverTile(hit ? hit.x : null, hit?.y ?? 0);
      this.tool?.hover?.(this.tool.surface ? this.pickSurface(ev.clientX, ev.clientY) : hit, ev);
      this.onHover?.(hit);
    });
    const end = (e: Event) => {
      const ev = e as PointerEvent;
      const d = this.drag;
      if (!d || d.id !== ev.pointerId) return;
      this.drag = null;
      if (c.hasPointerCapture(ev.pointerId)) c.releasePointerCapture(ev.pointerId);
      if (d.kind === "tool") {
        const t = this.grabbed ?? this.tool;
        this.grabbed = null;
        if (ev.type === "pointercancel" && t?.cancel) t.cancel();
        else t?.up(this.pickFor(t ?? null, ev.clientX, ev.clientY), ev);
      } else if (d.button === 0 && d.moved < 4 && ev.type === "pointerup") this.onClick?.(this.pick(ev.clientX, ev.clientY), ev);
    };
    this.on(c, "pointerup", end);
    this.on(c, "pointercancel", end);
    this.on(c, "pointerleave", (e) => {
      if (this.drag) return;
      this.hoverHit = null;
      this.setHoverTile(null);
      this.tool?.hover?.(null, e as PointerEvent);
      this.onHover?.(null);
    });
    this.on(
      c,
      "wheel",
      (e) => {
        const ev = e as WheelEvent;
        ev.preventDefault();
        if (this.onWheel?.(ev, this.pick(ev.clientX, ev.clientY))) return;
        if (this.tool?.wheel?.(ev)) return;
        // Alt+scroll: the game's layers, the world cut away from the top down
        if (ev.altKey) {
          this.stepSlice(wheelDelta(ev) < 0 ? 1 : -1);
          return;
        }
        this.zoom(Math.exp(wheelDelta(ev) * 0.0012));
      },
      { passive: false },
    );
    // the camera keys work anywhere on the page but in a text field, a slider or a list (a toggle
    // just clicked keeps them), and never with Ctrl, Alt or Cmd (those are the editor's shortcuts)
    const typing = (t: EventTarget | null) => {
      const el = t as HTMLElement | null;
      if (el?.tagName === "INPUT") return !["checkbox", "radio", "button"].includes((el as HTMLInputElement).type);
      return !!el && (el.tagName === "SELECT" || el.tagName === "TEXTAREA" || el.isContentEditable);
    };
    this.on(window, "keydown", (e) => {
      const ev = e as KeyboardEvent;
      if (ev.ctrlKey || ev.metaKey || ev.altKey || ev.defaultPrevented || typing(ev.target) || !this.map || !this.canvas.isConnected) return;
      // a key the page has claimed for itself (Select's Up and Down, D323 item 6) is not the camera's
      if (this.claimKey?.(ev)) return;
      const k = ev.key.toLowerCase();
      if (CAMERA_KEYS.has(k)) {
        ev.preventDefault();
        this.held.add(k);
        this.glide.fast = ev.shiftKey;
        this.startGlide();
        return;
      }
      if (k === "+" || k === "=") this.zoom(1 / 1.15);
      else if (k === "-") this.zoom(1.15);
      else return;
      ev.preventDefault();
    });
    this.on(window, "keyup", (e) => {
      const ev = e as KeyboardEvent;
      this.held.delete(ev.key.toLowerCase());
      if (ev.key === "Shift") this.glide.fast = false;
    });
    // the window loses focus: no key, Shift or mouse button is held any more, and a stroke or gesture
    // in progress ends as a released button ends it (D361, item 5)
    this.on(window, "blur", () => {
      focusLost(this.held, this.glide, this.drag, (d) => end({ type: d.kind === "tool" ? "pointerup" : "pointercancel", pointerId: d.id, clientX: d.x, clientY: d.y, button: 0, shiftKey: false, ctrlKey: false, altKey: false, metaKey: false } as unknown as Event));
    });
  }

  /** The camera keys' glide now (tests): its speed on each axis, Shift, and whether it is still
   *  moving (a frame is waiting). */
  cameraGlide(): Glide & { gliding: boolean } {
    return { ...this.glide, gliding: this.glideFrame !== 0 };
  }

  /** Keys the page claims from the camera for now (true: it takes this one). */
  claimKey: ((ev: KeyboardEvent) => boolean) | null = null;

  /** Move the camera every frame while its keys are held: a quick ease-in to full speed, a short
   *  glide to a stop; the speed follows the zoom (slower up close), and Shift is faster. */
  private startGlide(): void {
    if (this.glideFrame) return;
    this.glideAt = performance.now();
    const step = () => {
      this.glideFrame = 0;
      if (this.disposed) return;
      const now = performance.now();
      const h = this.held;
      // (cameraGlide.ts: eased in and out, a screen's height in about 1.4 s, Shift 2.5 times that)
      const s = glideStep(this.glide, wanted(h, this.view.mode === "orbit"), (now - this.glideAt) / 1000);
      this.glideAt = now;
      this.glide = s.glide;
      if (s.moving) {
        const screen = this.canvas.clientHeight || 600;
        this.panPixels(s.pan.x * screen, s.pan.y * screen);
        if (s.yaw) this.setView({ yaw: this.view.yaw + s.yaw });
      }
      if (s.moving || h.size) this.glideFrame = requestAnimationFrame(step);
      else this.glide = { ...STILL };
    };
    this.glideFrame = requestAnimationFrame(step);
  }

  zoom(factor: number): void {
    const m = this.map;
    const span = m ? Math.max(m.W, m.H) : 256;
    this.setView({ distance: Math.min(span * 3, Math.max(6, this.view.distance * factor)) });
  }

  /** Move the view as if the map were dragged by (dx, dy) pixels. */
  panPixels(dx: number, dy: number): void {
    const v = this.view;
    const h = this.canvas.clientHeight || 1;
    const perPixel = v.mode === "top" ? (v.distance * 0.84) / h : (v.distance * 0.75) / h;
    const yaw = v.mode === "top" ? 0 : v.yaw;
    // screen right and screen up, on the ground
    const rx = Math.cos(yaw);
    const rz = -Math.sin(yaw);
    const fx = -Math.sin(yaw);
    const fz = -Math.cos(yaw);
    const [tx, ty, tz] = v.target;
    const m = this.map;
    let nx = tx - rx * dx * perPixel + fx * dy * perPixel;
    let nz = tz - rz * dx * perPixel + fz * dy * perPixel;
    if (m) {
      nx = Math.min(m.W, Math.max(0, nx));
      nz = Math.min(0, Math.max(-m.H, nz));
    }
    this.setView({ target: [nx, ty, nz] });
  }

  // ------------------------------------------------------------------------------ measuring

  private beginGpuTimer(): WebGLQuery | null {
    if (!this.recording || !this.timer) return null;
    const ctx = this.gl.getContext() as WebGL2RenderingContext;
    const q = ctx.createQuery();
    if (!q) return null;
    ctx.beginQuery(this.timer.ext.TIME_ELAPSED_EXT, q);
    return q;
  }

  private endGpuTimer(q: WebGLQuery | null): void {
    if (!q || !this.timer) return;
    const ctx = this.gl.getContext() as WebGL2RenderingContext;
    ctx.endQuery(this.timer.ext.TIME_ELAPSED_EXT);
    this.timer.pending.push({ q });
    this.collectGpu();
  }

  private collectGpu(): void {
    const t = this.timer;
    if (!t) return;
    const ctx = this.gl.getContext() as WebGL2RenderingContext;
    const disjoint = ctx.getParameter(t.ext.GPU_DISJOINT_EXT);
    while (t.pending.length) {
      const { q } = t.pending[0];
      if (!ctx.getQueryParameter(q, ctx.QUERY_RESULT_AVAILABLE)) break;
      const ns = ctx.getQueryParameter(q, ctx.QUERY_RESULT) as number;
      if (!disjoint) t.times.push(ns / 1e6);
      ctx.deleteQuery(q);
      t.pending.shift();
    }
  }

  /** Orbit the camera once around the map for `ms` and measure every frame (the fps benchmark). */
  benchOrbit(ms: number, turnMs = 8000): Promise<FrameStats> {
    const ctx = this.gl.getContext() as WebGL2RenderingContext;
    const ext = ctx.getExtension("EXT_disjoint_timer_query_webgl2") as { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number } | null;
    this.timer = ext ? { ext, pending: [], times: [] } : null;
    this.cpuTimes = [];
    this.recording = true;
    const deltas: number[] = [];
    const yaw0 = this.view.yaw;
    return new Promise((resolve) => {
      let start = 0;
      let last = 0;
      const step = (now: number) => {
        if (!start) {
          start = now;
          last = now;
        } else {
          deltas.push(now - last);
          last = now;
        }
        this.view.yaw = yaw0 + ((now - start) / turnMs) * Math.PI * 2;
        this.renderNow();
        if (now - start < ms) requestAnimationFrame(step);
        else {
          this.recording = false;
          const settle = () => {
            this.collectGpu();
            const pct = (a: number[], p: number) => {
              if (!a.length) return 0;
              const s = [...a].sort((x, y) => x - y);
              return s[Math.min(s.length - 1, Math.floor(p * s.length))];
            };
            const gpu = this.timer?.times ?? [];
            const seconds = (last - start) / 1000;
            resolve({
              frames: deltas.length,
              seconds,
              fps: deltas.length / seconds,
              p50: pct(deltas, 0.5),
              p95: pct(deltas, 0.95),
              p99: pct(deltas, 0.99),
              max: Math.max(...deltas),
              over60: deltas.filter((d) => d > 1000 / 60 + 1).length,
              cpuP50: pct(this.cpuTimes, 0.5),
              cpuP95: pct(this.cpuTimes, 0.95),
              gpuP50: gpu.length ? pct(gpu, 0.5) : null,
              gpuP95: gpu.length ? pct(gpu, 0.95) : null,
            });
            this.timer = null;
          };
          setTimeout(settle, 200);
        }
      };
      requestAnimationFrame(step);
    });
  }

  /** Triangles and draw calls of the last frame. */
  info(): { triangles: number; calls: number; chunks: number; waterChunks: number; falls: number } {
    return { triangles: this.gl.info.render.triangles, calls: this.gl.info.render.calls, chunks: this.terrain.size, waterChunks: this.water.size, falls: this.fallCount() };
  }

  dispose(): void {
    this.disposed = true;
    if (this.frame) cancelAnimationFrame(this.frame);
    clearTimeout(this.animTimer);
    clearTimeout(this.probeTimer);
    this.resize.disconnect();
    this.seen?.disconnect();
    for (const [target, type, fn, opts] of this.listeners) target.removeEventListener(type, fn, opts);
    cancelAnimationFrame(this.glideFrame);
    this.clearMap();
    this.cursor?.dispose();
    this.ring?.dispose();
    this.effects?.dispose();
    this.surge?.dispose();
    this.forceFx?.dispose();
    this.high?.dispose();
    this.high = null;
    this.bakerOwn?.dispose();
    for (const m of Object.values(this.std)) m.dispose();
    this.sky.geometry.dispose();
    this.patterns.dispose();
    this.gl.dispose();
    // free the context now: browsers keep only a few, and the editor opens a view per map
    this.gl.forceContextLoss();
  }
}

/** The rectangle of tiles whose shadow casters differ (null: none; undefined: all of them). */
function castersChanged(a: Float32Array | null | undefined, b: Float32Array | null, W: number, H: number): { x0: number; y0: number; x1: number; y1: number } | null | undefined {
  if (a === undefined) return undefined;
  if (!a && !b) return null;
  let x0 = W;
  let y0 = H;
  let x1 = -1;
  let y1 = -1;
  for (let i = 0; i < W * H; i++) {
    if ((a ? a[i] : 0) === (b ? b[i] : 0)) continue;
    const x = i % W;
    const y = (i - x) / W;
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  return x1 < 0 ? null : { x0, y0, x1, y1 };
}

/** The legend's highlight over the overlay: the tiles lightly tinted, their edge strongly. */
function paintHighlight(data: Uint8Array, W: number, H: number, h: Uint8Array): void {
  for (let i = 0; i < h.length; i++) {
    if (!h[i]) continue;
    const x = i % W;
    const y = (i - x) / W;
    const edge = x === 0 || y === 0 || x === W - 1 || y === H - 1 || !h[i - 1] || !h[i + 1] || !h[i - W] || !h[i + W];
    const o = i * 4;
    data[o] = 40;
    data[o + 1] = edge ? 150 : 200;
    data[o + 2] = 255;
    data[o + 3] = edge ? 230 : 120;
  }
}

export { CHUNK };
export type { TileHit };

/** One object on its own, its Coordinates at (0, 0) on the ground at 0 (the shelf's ghost and icons). */
function oneObject(template: string, orientation: number): EntityView {
  return {
    count: 1,
    templates: [template],
    owners: ["shelf"],
    template: Uint16Array.of(0),
    x: Int16Array.of(0),
    y: Int16Array.of(0),
    z: Int16Array.of(0),
    orientation: Uint8Array.of(orientation & 3),
    flags: Uint8Array.of(0),
    owner: Uint16Array.of(0),
    variant: Uint8Array.of(NO_VARIANT),
    strength: Float32Array.of(0),
  };
}
