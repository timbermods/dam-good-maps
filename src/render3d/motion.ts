// The moving water, in both looks (investigation/flow-arrows, D353): the water's current from the
// settle (current.ts) carried into
// - the flow texture every water material reads (`flowTex`; High's `hlFlow`): the surface's textures
//   move with the current, and High's rough water and light follow it;
// - always-on foam: faint threads along the current's lanes, wakes where a bank opens or narrows in
//   fast water, seams where two currents join, in each look's own foam colours, stronger in fast
//   water and gone where it is still;
// - the Flow view (off by default): a few glowing streaks travelling down the lanes, fast water's
//   longer and brighter, badwater's dim embers.
// All of it is made in the bake worker a moment after the water changes (at least once a second while
// it keeps changing), never on the page's thread: the page only hands the arrays to the GPU. Only
// drawn; nothing here reaches the water, a map or an operation.

import { BufferAttribute, BufferGeometry, DataTexture, DoubleSide, FloatType, LinearFilter, Mesh, NearestFilter, Points, RGBAFormat, ShaderMaterial, UnsignedByteType, Vector2, type Scene } from "three";
import type { SceneUniforms } from "./materials";
import type { SurfaceWater } from "./model";
import { DT, STEPS, type MotionShapes } from "./motionShapes";
import { outflowGrid } from "./current";
import type { Baker } from "./high/fields";
import type { RoughCounts } from "./high/flow";
import { HIGH_WATER, WATER } from "./waterPalette";

/** The flow follows the water this long after it changes (and at least this often while it does). */
const WATER_WAIT = 250;
const WATER_MOST = 1000;

const glsl = (c: readonly number[]) => `vec3(${c.map((v) => v.toFixed(3)).join(", ")})`;

function texture(W: number, H: number, fill: [number, number, number, number]): DataTexture {
  const data = new Uint8Array(W * H * 4);
  for (let i = 0; i < W * H; i++) data.set(fill, i * 4);
  const t = new DataTexture(data, W, H, RGBAFormat, UnsignedByteType);
  t.minFilter = t.magFilter = LinearFilter;
  t.needsUpdate = true;
  return t;
}

/** The foam ribbons: widened on screen to a pixel or two, a pulse running down each thread. */
function cueMaterial(u: SceneUniforms, high: { value: number }, viewport: { value: Vector2 }, dpr: { value: number }): ShaderMaterial {
  return new ShaderMaterial({
    transparent: true,
    depthTest: true,
    depthWrite: false,
    side: DoubleSide,
    forceSinglePass: true,
    uniforms: { time: u.time, slice: u.slice, high, viewport, dpr },
    vertexShader: /* glsl */ `
      uniform vec2 viewport;
      uniform float dpr;
      attribute vec3 direction;
      attribute vec4 detail;
      attribute vec4 energy;
      varying vec4 d;
      varying vec4 e;
      varying float y;
      void main() {
        vec4 clip = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        vec4 across = projectionMatrix * modelViewMatrix * vec4(position + direction * energy.w, 1.0);
        vec2 offset = (across.xy / across.w - clip.xy / clip.w) * viewport * 0.5;
        float pixels = clamp(length(offset), 0.72 * dpr, 1.8 * dpr);
        clip.xy += normalize(offset + vec2(0.00001)) * pixels * detail.y * 2.0 / viewport * clip.w;
        gl_Position = clip;
        d = detail;
        e = energy;
        y = position.y;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float time;
      uniform float high;
      uniform float slice;
      varying vec4 d;
      varying vec4 e;
      varying float y;
      void main() {
        // (the game's layers: water above the slice is cut away)
        if (y > slice + 0.05) discard;
        float phase = fract((d.x - time) / 10.0 + e.z);
        float body = smoothstep(0.0, 0.20, phase) * (1.0 - smoothstep(0.27, 0.34, phase));
        float tail = mix(0.25, 1.0, smoothstep(0.0, 0.23, phase));
        float line = exp(-3.0 * pow(d.y / max(tail, 0.25), 2.0));
        float signal = body;
        if (d.w > 0.5) {
          // a wake holds its place (gently breathing); a seam is a fainter steady line
          line = exp(-3.4 * d.y * d.y);
          signal = d.w > 1.5 ? 0.36 + body * 0.38 : 0.80 + 0.20 * sin(d.x * 2.4 - time * 1.7 + e.z * 6.28);
        }
        float alpha = line * signal * e.x * e.y;
        if (alpha < 0.006) discard;
        vec3 clean = mix(${glsl(WATER.foam)}, ${glsl(HIGH_WATER.foam)}, high);
        vec3 colour = mix(clean, mix(${glsl(WATER.badFoam)}, ${glsl(HIGH_WATER.badFoam)}, high), d.z);
        gl_FragColor = vec4(colour, alpha * mix(1.0, 0.72, d.z));
      }
    `,
  });
}

/** The Flow view's streaks: points travelling down their lane's path (a texture row), each a tapered
 *  streak with a dim upstream tail and a small rounded head. */
function streakMaterial(u: SceneUniforms, viewport: { value: Vector2 }, dpr: { value: number }): ShaderMaterial {
  return new ShaderMaterial({
    transparent: true,
    depthTest: true,
    depthWrite: false,
    uniforms: { paths: { value: null }, rows: { value: 1 }, time: u.time, slice: u.slice, viewport, dpr },
    vertexShader: /* glsl */ `
      uniform sampler2D paths;
      uniform float rows;
      uniform float time;
      uniform float dpr;
      uniform vec2 viewport;
      attribute vec3 track;
      varying vec2 heading;
      varying float fade;
      varying float bad;
      varying float rush;
      varying float y;
      vec4 at(float k) { return texture2D(paths, vec2((k + 0.5) / ${STEPS}.0, (track.x + 0.5) / rows)); }
      void main() {
        float age = mod(time + track.z, track.y);
        float f = age / ${DT};
        float k = floor(f);
        vec4 a = at(k);
        vec4 b = at(min(k + 1.0, ${STEPS - 1}.0));
        vec4 p = mix(a, b, fract(f));
        vec4 clip = projectionMatrix * modelViewMatrix * vec4(p.xyz, 1.0);
        vec4 next = projectionMatrix * modelViewMatrix * vec4(b.xyz, 1.0);
        vec4 prev = projectionMatrix * modelViewMatrix * vec4(a.xyz, 1.0);
        vec2 direction = (next.xy / next.w - prev.xy / prev.w) * viewport;
        heading = length(direction) > 0.0001 ? normalize(direction) : vec2(1.0, 0.0);
        rush = smoothstep(0.1, 3.0, length(b.xz - a.xz) / ${DT});
        bad = p.w;
        y = p.y;
        float ends = min(0.6, track.y * ${DT});
        fade = smoothstep(0.0, ends, age) * smoothstep(0.0, ends, track.y - age);
        gl_Position = clip;
        gl_PointSize = mix(22.0, 40.0, rush) * dpr;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float slice;
      varying vec2 heading;
      varying float fade;
      varying float bad;
      varying float rush;
      varying float y;
      void main() {
        if (y > slice + 0.05) discard;
        vec2 p = gl_PointCoord - 0.5;
        p.y = -p.y;
        vec2 q = vec2(dot(p, heading), dot(p, vec2(-heading.y, heading.x)));
        // a long dim tail and a small rounded head: no dot, no arrowhead
        float along = smoothstep(-0.46, 0.24, q.x) * (1.0 - smoothstep(0.27, 0.37, q.x));
        float width = mix(0.025, 0.065, smoothstep(-0.43, 0.25, q.x));
        float core = exp(-pow(q.y / width, 2.0));
        float halo = exp(-pow(q.y / (width * 2.8), 2.0));
        float alpha = min(along * (core * 0.90 + halo * 0.20) * fade * mix(0.65, 1.0, rush) * mix(1.0, 0.85, bad), 0.86);
        if (alpha < 0.01) discard;
        gl_FragColor = vec4(mix(vec3(0.54, 0.89, 0.94), vec3(0.95, 0.43, 0.15), bad), alpha);
      }
    `,
  });
}

export class WaterMotion {
  /** The current as drawn (RG, 128 still) with the smoothed contamination (B); the rough water (R). */
  readonly flow: DataTexture;
  readonly rough: DataTexture;
  counts: RoughCounts = { falls: 0, rapids: 0, obstacles: 0, wet: 0 };
  stats = { lanes: 0, wakes: 0, seams: 0, streaks: 0, triangles: 0 };
  /** The last bake's time in the worker (information). */
  ms = 0;
  private readonly high = { value: 0 };
  private readonly viewport = { value: new Vector2(1, 1) };
  private readonly dpr = { value: 1 };
  private readonly cues: Mesh;
  private readonly streaks: Points;
  private flowOn = false;
  private latest = 0;
  private done = 0;
  private baked = false;
  private since = 0;
  private timer = 0;
  private pending: { heights: Uint8Array; surface: SurfaceWater } | null = null;
  private disposed = false;

  constructor(
    readonly W: number,
    readonly H: number,
    private readonly baker: Baker,
    private readonly scene: Scene,
    uniforms: SceneUniforms,
    private readonly changed: () => void,
  ) {
    this.flow = texture(W, H, [128, 128, 0, 255]);
    this.rough = texture(W, H, [0, 0, 0, 255]);
    this.cues = new Mesh(new BufferGeometry(), cueMaterial(uniforms, this.high, this.viewport, this.dpr));
    this.cues.frustumCulled = false;
    this.cues.renderOrder = 7;
    this.cues.name = "water.cues";
    this.streaks = new Points(new BufferGeometry(), streakMaterial(uniforms, this.viewport, this.dpr));
    this.streaks.frustumCulled = false;
    this.streaks.renderOrder = 8;
    this.streaks.name = "water.flow";
    this.streaks.visible = false;
    scene.add(this.cues, this.streaks);
  }

  /** Whether the last water asked for is drawn. */
  get ready(): boolean {
    return !this.timer && this.done === this.latest;
  }

  /** The Flow view's streaks on or off (the foam stays either way). */
  setFlow(on: boolean): void {
    this.flowOn = on;
    this.streaks.visible = on && this.stats.streaks > 0;
  }

  /** Each look's own foam colours. */
  setHigh(high: boolean): void {
    this.high.value = high ? 1 : 0;
  }

  /** The water changed: its flow and shapes follow a moment later (`now`: at once, a new map). */
  waterChanged(heights: Uint8Array, surface: SurfaceWater, now = false): void {
    if (this.disposed) return;
    this.pending = { heights, surface };
    if (!this.baked) {
      // (a new map's contamination shows at once, unsmoothed, until its first bake arrives)
      const f = this.flow.image.data as Uint8Array;
      for (let i = 0; i < this.W * this.H; i++) f[i * 4 + 2] = Math.round(Math.max(0, Math.min(1, surface.contamination[i] || 0)) * 255);
      this.flow.needsUpdate = true;
    }
    if (now) return this.bake();
    const t = performance.now();
    if (!this.timer) this.since = t;
    clearTimeout(this.timer);
    const wait = Math.max(0, Math.min(WATER_WAIT, this.since + WATER_MOST - t));
    this.timer = window.setTimeout(() => {
      this.timer = 0;
      this.bake();
    }, wait);
  }

  private bake(): void {
    const p = this.pending;
    if (!p || this.disposed) return;
    this.pending = null;
    const id = ++this.latest;
    const sw = p.surface;
    // (copies the worker takes over: the view keeps its own)
    const copy: SurfaceWater = { surface: sw.surface.slice(), floor: sw.floor.slice(), depth: sw.depth.slice(), contamination: sw.contamination.slice(), top: new Int32Array(0), outflow: null, lower: [] };
    const heights = p.heights.slice();
    // (the outflows four a tile: the worker works out the current from them)
    const out = outflowGrid(this.W, this.H, sw);
    const transfer = [copy.surface, copy.floor, copy.depth, copy.contamination, heights, ...(out ? [out] : [])].map((a) => a.buffer as ArrayBuffer);
    void this.baker.run({ kind: "flow", W: this.W, H: this.H, heights, sw: copy, out }, transfer).then((r) => {
      if (id !== this.latest || r.kind !== "flow" || this.disposed) return;
      this.done = id;
      (this.flow.image.data as Uint8Array).set(r.flow);
      (this.rough.image.data as Uint8Array).set(r.rough);
      this.flow.needsUpdate = true;
      this.rough.needsUpdate = true;
      this.counts = r.counts;
      this.ms = r.ms;
      this.baked = true;
      this.setShapes(r.shapes);
      this.changed();
    });
  }

  private setShapes(s: MotionShapes): void {
    const cues = new BufferGeometry();
    cues.setAttribute("position", new BufferAttribute(s.cues.position, 3));
    cues.setAttribute("direction", new BufferAttribute(s.cues.direction, 3));
    cues.setAttribute("detail", new BufferAttribute(s.cues.detail, 4));
    cues.setAttribute("energy", new BufferAttribute(s.cues.energy, 4));
    this.cues.geometry.dispose();
    this.cues.geometry = cues;
    const streaks = new BufferGeometry();
    streaks.setAttribute("position", new BufferAttribute(s.streaks.position, 3));
    streaks.setAttribute("track", new BufferAttribute(s.streaks.track, 3));
    this.streaks.geometry.dispose();
    this.streaks.geometry = streaks;
    const m = this.streaks.material as ShaderMaterial;
    const paths = new DataTexture(s.streaks.paths, STEPS, s.streaks.rows, RGBAFormat, FloatType);
    paths.minFilter = paths.magFilter = NearestFilter;
    paths.needsUpdate = true;
    (m.uniforms.paths.value as DataTexture | null)?.dispose();
    m.uniforms.paths.value = paths;
    m.uniforms.rows.value = s.streaks.rows;
    this.stats = s.stats;
    this.streaks.visible = this.flowOn && s.stats.streaks > 0;
  }

  /** Before each frame: the view's size in pixels (the ribbons and streaks keep a size on screen). */
  beforeRender(width: number, height: number, pixelRatio: number): void {
    this.viewport.value.set(width * pixelRatio, height * pixelRatio);
    this.dpr.value = pixelRatio;
  }

  /** Whether anything of it is on screen that moves (the renderer keeps drawing). */
  get animates(): boolean {
    return this.stats.triangles > 0 || this.streaks.visible;
  }

  /** Off the scene, its work stopped, its materials kept (a new map's own compile to the same programs
   *  while these live, so they are reused, not compiled again); `dispose` lets them go. */
  retire(): void {
    this.disposed = true;
    this.latest = -1;
    clearTimeout(this.timer);
    this.scene.remove(this.cues, this.streaks);
  }

  dispose(): void {
    this.retire();
    this.cues.geometry.dispose();
    (this.cues.material as ShaderMaterial).dispose();
    this.streaks.geometry.dispose();
    const m = this.streaks.material as ShaderMaterial;
    (m.uniforms.paths.value as DataTexture | null)?.dispose();
    m.dispose();
    this.flow.dispose();
    this.rough.dispose();
  }
}
