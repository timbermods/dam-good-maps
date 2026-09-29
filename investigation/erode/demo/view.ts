// The demo's view: terrain as runs (core/mesher.ts) lit and textured in the style of the editor's
// Standard look (src/render3d: its palette, its sun from the north-west, its cool sky light, its
// stone walls with a pale ledge and a dark groove at every level, its soils and its water palette),
// with the undersides, cave ceilings and the insides of arches the heightfield view can't draw.
// The camera moves only when the player moves it (D265): right-drag orbits, middle-drag (or
// Shift + right-drag) pans, the wheel zooms, the arrow keys and WASD pan, Q and E turn.

import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { GROUND, LIGHT, LIVING_TREE, SKY, START, WALL } from "../../../src/render3d/palette";
import { WATER_GLSL } from "../../../src/render3d/waterPalette";
import { CHUNK, LIGHT_LEVELS, lightVolume, meshChunk, SUN_TILE, type ChunkMesh } from "../core/mesher";
import { LAYERS, Terrain } from "../core/terrain";
import type { Thing } from "../core/map";
import type { Pool } from "../core/water";

const glc = (c: readonly number[]) => `vec3(${c.map((v) => v.toFixed(3)).join(", ")})`;
/** Toward the sun in world space (X east, Y up, Z south). */
export const SUN = new THREE.Vector3(SUN_TILE[0], SUN_TILE[2], -SUN_TILE[1]).normalize();

const NOISE_GLSL = /* glsl */ `
  float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }
  float vnoise(vec2 c) {
    vec2 i = floor(c);
    vec2 u = fract(c);
    u = u * u * (3.0 - 2.0 * u);
    return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x), mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  float fbm(vec2 c) {
    return 0.55 * vnoise(c) + 0.3 * vnoise(c * 2.13 + 7.1) + 0.15 * vnoise(c * 4.37 + 3.3);
  }
  /** Cobbles: dark mortar between rounded stones (0 on the mortar, 0.5–1 on a stone). */
  float cobble(vec2 c) {
    vec2 n = floor(c);
    vec2 f = fract(c);
    float d1 = 9.0, d2 = 9.0, id = 0.0;
    for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
      vec2 g = vec2(float(i), float(j));
      vec2 o = vec2(hash12(n + g), hash12(n + g + 19.7)) * 0.8 + 0.1;
      float d = length(g + o - f);
      if (d < d1) { d2 = d1; d1 = d; id = hash12(n + g + 3.1); }
      else if (d < d2) d2 = d;
    }
    return smoothstep(0.0, 0.06, d2 - d1) * (0.5 + 0.5 * id);
  }
`;

const TERRAIN_VERT = /* glsl */ `
  out vec3 vPos;
  out vec3 vN;
  void main() {
    vPos = position;
    vN = normal;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const TERRAIN_FRAG = /* glsl */ `
  precision highp float;
  precision highp sampler3D;
  uniform sampler3D lightTex;
  uniform sampler2D tileTex;
  uniform vec2 mapSize;
  uniform float rock[${LAYERS}];
  uniform vec3 sunDir;
  uniform vec3 camPos;
  in vec3 vPos;
  in vec3 vN;
  out vec4 fragColor;
  ${NOISE_GLSL}
  void main() {
    vec3 n = normalize(vN);
    vec3 tp = vec3(vPos.x, -vPos.z, vPos.y);
    vec3 tn = vec3(n.x, -n.z, n.y);
    vec3 lp = tp + tn * 0.5;
    vec2 L = texture(lightTex, vec3(lp.x / mapSize.x, lp.y / mapSize.y, lp.z / ${LIGHT_LEVELS}.0)).rg;
    vec2 tile = floor(tp.xy - tn.xy * 0.5);
    vec4 T = texture(tileTex, (tile + 0.5) / mapSize);
    float surface = floor(T.r * 255.0 / 10.0 + 0.5);
    float moist = T.g;
    vec3 col;
    if (tn.z > 0.5) {
      // a top: the soil on open ground, bare rock on a cave floor
      bool roofed = tp.z < surface - 0.01;
      float patches = fbm(tp.xy * 0.23);
      if (roofed) {
        col = mix(${glc(GROUND.dryCool)}, ${glc(WALL.stone)}, 0.55) * (0.85 + 0.25 * fbm(tp.xy * 1.7));
      } else if (moist > 0.5) {
        col = mix(${glc(GROUND.moistLow)}, ${glc(GROUND.moistHigh)}, smoothstep(0.35, 0.7, patches));
        col *= 0.9 + 0.18 * vnoise(tp.xy * 3.1);
      } else {
        col = mix(${glc(GROUND.dryCool)}, ${glc(GROUND.dryWarm)}, smoothstep(0.3, 0.75, patches));
        col = mix(col, ${glc(GROUND.dry)}, 0.4);
        float crack = 1.0 - smoothstep(0.0, 0.07, abs(fbm(tp.xy * 1.3) - 0.5));
        col = mix(col, ${glc(GROUND.crack)}, crack * 0.22);
      }
      // the lip of the top's ground over a wall
      vec2 f = fract(tp.xy);
      float edge = min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y));
      col *= 0.96 + 0.04 * smoothstep(0.0, 0.08, edge);
    } else if (tn.z < -0.5) {
      // an underside: a cave's ceiling, the roof of an overhang, the inside of an arch
      float level = floor(tp.z + 0.5);
      bool hard = rock[int(clamp(level, 0.0, ${LAYERS - 1}.0))] > 0.5;
      float k = cobble(tp.xy * vec2(3.0, 3.0) + 11.0);
      vec3 stone = (hard ? vec3(0.47, 0.45, 0.4) : ${glc(WALL.stone)}) * 0.92;
      col = mix(${glc(WALL.mortar)}, stone * (0.84 + 0.3 * (k - 0.5)), 0.45 + 0.55 * smoothstep(0.05, 0.3, k));
    } else {
      // a wall, as the editor draws it: dark cobbled stone, every other level a shade darker, and a
      // lip of the top's ground; the hard beds a paler, warmer stone, so the caprock reads
      float level = floor(tp.z + 0.001);
      bool hard = rock[int(clamp(level, 0.0, ${LAYERS - 1}.0))] > 0.5;
      float along = abs(tn.x) > 0.5 ? tp.y : tp.x;
      float k = cobble(vec2(along * 3.2, tp.z * 4.4) + (hard ? 17.0 : 0.0));
      float shade = mix(${WALL.low.toFixed(3)}, ${WALL.high.toFixed(3)}, clamp(level / 16.0, 0.0, 1.0)) * (mod(level, 2.0) > 0.5 ? ${WALL.alternate.toFixed(3)} : 1.0);
      vec3 stone = hard ? vec3(0.5, 0.47, 0.41) : ${glc(WALL.stone)};
      col = mix(${glc(WALL.mortar)}, stone * shade * (0.84 + 0.3 * (k - 0.5)), 0.6 + 0.4 * smoothstep(0.05, 0.3, k));
      float lip = 1.0 - smoothstep(0.07, 0.13, surface - tp.z);
      vec3 topc = moist > 0.5 ? ${glc(GROUND.moistHigh)} : ${glc(GROUND.dry)} * 0.85;
      col = mix(col, topc, lip * 0.9);
    }
    // the light (the editor's lightOf): the cool sky, dimmed by the sky each point sees (caves,
    // undersides, corners), and the warm sun where it reaches
    float sky = L.r;
    float sun = L.g;
    float ndl = max(dot(n, sunDir), 0.0);
    float ao = mix(0.35, 1.0, sky);
    vec3 light = ${glc(LIGHT.sky)} * (0.7 + 0.3 * n.y) * ao * mix(0.45, 1.0, sky) + ${glc(LIGHT.sun)} * 0.55 * ndl * sun;
    // light thrown up from the ground onto undersides and ceilings
    light += vec3(0.62, 0.56, 0.47) * 0.32 * max(0.0, -n.y) * mix(0.35, 1.0, sky);
    col *= light;
    // the finish: blue-grey haze far off and the warm grade
    float dist = length(vPos - camPos);
    col = mix(col, ${glc(LIGHT.haze)}, 0.16 * smoothstep(200.0, 600.0, dist));
    col *= vec3(1.01, 1.0, 0.98);
    float l = dot(col, vec3(0.299, 0.587, 0.114));
    col = clamp(mix(vec3(l), col, 1.03), 0.0, 1.0);
    fragColor = vec4(col, 1.0);
  }
`;

const WATER_VERT = /* glsl */ `
  in float aDepth;
  in float aUnder;
  out vec3 vPos;
  out float vDepth;
  out float vUnder;
  void main() {
    vPos = position;
    vDepth = aDepth;
    vUnder = aUnder;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const WATER_FRAG = /* glsl */ `
  precision highp float;
  precision highp sampler3D;
  uniform sampler3D lightTex;
  uniform vec2 mapSize;
  uniform float time;
  uniform vec3 sunDir;
  in vec3 vPos;
  in float vDepth;
  in float vUnder;
  out vec4 fragColor;
  ${NOISE_GLSL}
  ${WATER_GLSL}
  void main() {
    vec3 tp = vec3(vPos.x, -vPos.z, vPos.y);
    vec2 L = texture(lightTex, vec3(tp.x / mapSize.x, tp.y / mapSize.y, (tp.z + 0.3) / ${LIGHT_LEVELS}.0)).rg;
    float a = waterAbsorb(vDepth);
    vec3 col = cleanWaterBody(vDepth, a);
    float rip = vnoise(tp.xy * 1.7 + vec2(time * 0.35, time * 0.21)) * vnoise(tp.xy * 2.9 - vec2(time * 0.27, -time * 0.4));
    col = mix(col, WATER_CREST, smoothstep(0.35, 0.75, rip) * 0.35);
    float light = mix(0.22, 1.0, L.r) * (0.75 + 0.25 * L.g);
    col *= light * 1.05;
    fragColor = vec4(col, cleanWaterAlpha(a));
  }
`;

const DUST_VERT = /* glsl */ `
  in float aSize;
  in float aAlpha;
  in float aShade;
  out float vAlpha;
  out float vShade;
  uniform float scale;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * scale / -mv.z;
    vAlpha = aAlpha;
    vShade = aShade;
    gl_Position = projectionMatrix * mv;
  }
`;
const DUST_FRAG = /* glsl */ `
  precision highp float;
  in float vAlpha;
  in float vShade;
  out vec4 fragColor;
  void main() {
    vec2 p = gl_PointCoord * 2.0 - 1.0;
    float r = dot(p, p);
    if (r > 1.0) discard;
    float a = vAlpha * (1.0 - r) * (1.0 - r);
    fragColor = vec4(vec3(0.72, 0.65, 0.54) * vShade, a);
  }
`;

export interface CameraPose {
  target: [number, number, number];
  yaw: number;
  pitch: number;
  distance: number;
  /** Vertical field of view in degrees (45 when absent); wider for views from inside the rock. */
  fov?: number;
}

/** A point on the land: the voxel hit and the air cell in front of the face. */
export interface Hit {
  x: number;
  y: number;
  z: number;
  /** The face's outward normal in tile space. */
  nx: number;
  ny: number;
  nz: number;
  /** The world point. */
  point: THREE.Vector3;
}

export class View {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(45, 1, 0.05, 2000);
  pose: CameraPose = { target: [64, 8, -64], yaw: -0.6, pitch: 0.7, distance: 120 };
  terrain: Terrain | null = null;
  private chunks = new Map<string, THREE.Mesh>();
  private light: Uint8Array | null = null;
  private lightTex: THREE.Data3DTexture | null = null;
  private tileTex: THREE.DataTexture | null = null;
  private tileData: Uint8Array | null = null;
  private terrainMat: THREE.ShaderMaterial | null = null;
  private waterMat: THREE.ShaderMaterial | null = null;
  private waterMesh: THREE.Mesh | null = null;
  private thingGroup = new THREE.Group();
  readonly effects = new THREE.Group();
  private cursor: THREE.Mesh;
  private stroke: Line2 | null = null;
  private strokeMat: LineMaterial;
  readonly time = { value: 0 };
  W = 128;
  H = 128;

  constructor(readonly canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    this.scene.background = this.skyTexture();
    this.scene.add(this.thingGroup, this.effects);
    const hemi = new THREE.HemisphereLight(new THREE.Color(...LIGHT.sky), new THREE.Color(0.35, 0.33, 0.28), 1.1);
    const sun = new THREE.DirectionalLight(new THREE.Color(...LIGHT.sun), 1.9);
    sun.position.copy(SUN).multiplyScalar(100);
    this.scene.add(hemi, sun);
    const ring = new THREE.RingGeometry(0.55, 0.8, 32);
    this.cursor = new THREE.Mesh(ring, new THREE.MeshBasicMaterial({ color: 0xfff4d6, transparent: true, opacity: 0.85, depthTest: false, side: THREE.DoubleSide }));
    this.cursor.renderOrder = 10;
    this.cursor.visible = false;
    this.scene.add(this.cursor);
    this.strokeMat = new LineMaterial({ color: 0xfff1cf, linewidth: 3, transparent: true, opacity: 0.9, depthTest: false });
  }

  private skyTexture(): THREE.Texture {
    const c = document.createElement("canvas");
    c.width = 2;
    c.height = 256;
    const g = c.getContext("2d")!;
    const grad = g.createLinearGradient(0, 0, 0, 256);
    const css = (v: readonly number[]) => `rgb(${v.map((k) => Math.round(k * 255)).join(",")})`;
    grad.addColorStop(0, css(SKY.zenith));
    grad.addColorStop(0.55, css(SKY.horizon));
    grad.addColorStop(1, css(SKY.below));
    g.fillStyle = grad;
    g.fillRect(0, 0, 2, 256);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.LinearSRGBColorSpace;
    return t;
  }

  resize(): void {
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
    this.strokeMat.resolution.set(w, h);
  }

  // ---------------------------------------------------------------------------- the land

  setLand(t: Terrain, rock: number[], moist: Uint8Array): void {
    this.terrain = t;
    this.W = t.W;
    this.H = t.H;
    for (const m of this.chunks.values()) (this.scene.remove(m), m.geometry.dispose());
    this.chunks.clear();
    this.light = lightVolume(t);
    this.lightTex?.dispose();
    this.lightTex = new THREE.Data3DTexture(this.light, t.W, t.H, LIGHT_LEVELS);
    this.lightTex.format = THREE.RGFormat;
    this.lightTex.type = THREE.UnsignedByteType;
    this.lightTex.minFilter = this.lightTex.magFilter = THREE.LinearFilter;
    this.lightTex.wrapS = this.lightTex.wrapT = this.lightTex.wrapR = THREE.ClampToEdgeWrapping;
    this.lightTex.unpackAlignment = 1;
    this.lightTex.needsUpdate = true;
    this.tileData = new Uint8Array(t.N * 4);
    for (let i = 0; i < t.N; i++) {
      this.tileData[i * 4] = t.surface(i) * 10;
      this.tileData[i * 4 + 1] = moist[i] ? 255 : 0;
    }
    this.tileTex?.dispose();
    this.tileTex = new THREE.DataTexture(this.tileData, t.W, t.H, THREE.RGBAFormat);
    this.tileTex.minFilter = this.tileTex.magFilter = THREE.NearestFilter;
    this.tileTex.needsUpdate = true;
    this.terrainMat?.dispose();
    this.terrainMat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: TERRAIN_VERT,
      fragmentShader: TERRAIN_FRAG,
      uniforms: {
        lightTex: { value: this.lightTex },
        tileTex: { value: this.tileTex },
        mapSize: { value: new THREE.Vector2(t.W, t.H) },
        rock: { value: rock.slice(0, LAYERS) },
        sunDir: { value: SUN },
        camPos: { value: this.camera.position },
      },
    });
    this.waterMat?.dispose();
    this.waterMat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: WATER_VERT,
      fragmentShader: WATER_FRAG,
      transparent: true,
      depthWrite: false,
      uniforms: { lightTex: { value: this.lightTex }, mapSize: { value: new THREE.Vector2(t.W, t.H) }, time: this.time, sunDir: { value: SUN } },
    });
    for (let cy = 0; cy < Math.ceil(t.H / CHUNK); cy++) for (let cx = 0; cx < Math.ceil(t.W / CHUNK); cx++) this.meshChunkAt(cx, cy);
  }

  private meshChunkAt(cx: number, cy: number): void {
    const t = this.terrain!;
    const key = `${cx},${cy}`;
    const m: ChunkMesh = meshChunk(t, cx, cy);
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(m.positions, 3));
    g.setAttribute("normal", new THREE.BufferAttribute(m.normals, 3, true));
    g.setIndex(new THREE.BufferAttribute(m.indices, 1));
    const old = this.chunks.get(key);
    if (old) {
      old.geometry.dispose();
      old.geometry = g;
      return;
    }
    const mesh = new THREE.Mesh(g, this.terrainMat!);
    mesh.frustumCulled = false;
    this.scene.add(mesh);
    this.chunks.set(key, mesh);
  }

  /** The land changed in `box` (tiles): remesh its chunks; relight it when `relight`. */
  update(box: { x0: number; y0: number; x1: number; y1: number }, relight: boolean): void {
    const t = this.terrain!;
    const cx0 = Math.max(0, Math.floor((box.x0 - 1) / CHUNK)), cx1 = Math.min(Math.ceil(t.W / CHUNK) - 1, Math.floor((box.x1 + 1) / CHUNK));
    const cy0 = Math.max(0, Math.floor((box.y0 - 1) / CHUNK)), cy1 = Math.min(Math.ceil(t.H / CHUNK) - 1, Math.floor((box.y1 + 1) / CHUNK));
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) this.meshChunkAt(cx, cy);
    if (relight) {
      lightVolume(t, this.light!, box);
      this.lightTex!.needsUpdate = true;
    }
  }

  /** Rock just worn away (voxels z·N + tile): its cells take the light of the air beside them at
   *  once (a step dimmer, no sun), so a new opening never shows black before the next relight. */
  openCells(voxels: ArrayLike<number>): void {
    const t = this.terrain!, L = this.light!;
    const { W, H, N } = t;
    for (let pass = 0; pass < 2; pass++)
      for (let k = 0; k < voxels.length; k++) {
        const v = voxels[k];
        const z = Math.floor(v / N), i = v - z * N, x = i % W, y = (i - x) / W;
        let best = 0;
        const nb = [x > 0 ? v - 1 : -1, x < W - 1 ? v + 1 : -1, y > 0 ? v - W : -1, y < H - 1 ? v + W : -1, v + N, z > 0 ? v - N : -1];
        for (const n of nb) if (n >= 0 && n < N * LIGHT_LEVELS) best = Math.max(best, L[n * 2]);
        L[v * 2] = Math.max(L[v * 2], Math.max(64, best - 26));
      }
    this.lightTex!.needsUpdate = true;
  }

  relightAll(): void {
    lightVolume(this.terrain!, this.light!);
    this.lightTex!.needsUpdate = true;
  }

  // ---------------------------------------------------------------------------- water

  setWater(pools: Pool[]): void {
    if (this.waterMesh) {
      this.scene.remove(this.waterMesh);
      this.waterMesh.geometry.dispose();
      this.waterMesh = null;
    }
    const t = this.terrain!;
    const W = t.W;
    const pos: number[] = [], depth: number[] = [], under: number[] = [], idx: number[] = [];
    // merge each run of wet tiles along x at one level (a few quads per lake instead of thousands)
    const byRow = new Map<string, Pool[]>();
    for (const p of pools) {
      const y = Math.floor(p.tile / W);
      const k = `${y}:${p.level.toFixed(3)}:${p.under ? 1 : 0}`;
      const list = byRow.get(k) ?? [];
      list.push(p);
      byRow.set(k, list);
    }
    const quad = (x0: number, x1: number, y: number, L: number, d0: number, d1: number, u: number) => {
      const b = pos.length / 3;
      pos.push(x0, L, -y, x1, L, -y, x1, L, -(y + 1), x0, L, -(y + 1));
      depth.push(d0, d1, d1, d0);
      under.push(u, u, u, u);
      idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
    };
    for (const list of byRow.values()) {
      list.sort((a, b) => a.tile - b.tile);
      for (const p of list) {
        const x = p.tile % W, y = Math.floor(p.tile / W);
        quad(x, x + 1, y, p.level, p.level - p.floor, p.level - p.floor, p.under ? 1 : 0);
      }
    }
    // the water's side at the map's edge
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("aDepth", new THREE.Float32BufferAttribute(depth, 1));
    g.setAttribute("aUnder", new THREE.Float32BufferAttribute(under, 1));
    g.setIndex(idx);
    this.waterMesh = new THREE.Mesh(g, this.waterMat!);
    this.waterMesh.renderOrder = 2;
    this.waterMesh.frustumCulled = false;
    this.scene.add(this.waterMesh);
  }

  // ---------------------------------------------------------------------------- objects

  setThings(things: Thing[]): void {
    for (const c of [...this.thingGroup.children]) {
      this.thingGroup.remove(c);
      (c as THREE.Mesh).geometry?.dispose();
    }
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    const tint = (g0: THREE.BufferGeometry, c: readonly number[]) => {
      const g = g0.index ? g0.toNonIndexed() : g0;
      g.deleteAttribute("uv");
      const n = g.getAttribute("position").count;
      const col = new Float32Array(n * 3);
      for (let k = 0; k < n; k++) col.set(c, k * 3);
      g.setAttribute("color", new THREE.BufferAttribute(col, 3));
      return g;
    };
    const trunk = [0.36, 0.27, 0.19];
    const pine = mergeGeometries([
      tint(new THREE.CylinderGeometry(0.07, 0.09, 0.8, 5).translate(0, 0.4, 0), trunk),
      tint(new THREE.ConeGeometry(0.42, 1.5, 7).translate(0, 1.35, 0), [LIVING_TREE[0] * 1.2, LIVING_TREE[1] * 1.15, LIVING_TREE[2] * 1.1]),
      tint(new THREE.ConeGeometry(0.32, 1.0, 7).translate(0, 2.0, 0), [LIVING_TREE[0] * 1.3, LIVING_TREE[1] * 1.25, LIVING_TREE[2] * 1.15]),
    ])!;
    const leafy = mergeGeometries([
      tint(new THREE.CylinderGeometry(0.07, 0.1, 1.0, 5).translate(0, 0.5, 0), trunk),
      tint(new THREE.IcosahedronGeometry(0.55, 0).translate(0, 1.45, 0), [0.2, 0.4, 0.17]),
    ])!;
    const bush = tint(new THREE.IcosahedronGeometry(0.3, 0).translate(0, 0.25, 0), [0.22, 0.38, 0.16]);
    const block = tint(new THREE.BoxGeometry(0.8, 0.9, 0.8).translate(0, 0.45, 0), [0.55, 0.52, 0.46]);
    const source = tint(new THREE.CylinderGeometry(0.18, 0.18, 0.7, 8).translate(0, 0.35, 0), [0.4, 0.75, 0.95]);
    const start = mergeGeometries([
      tint(new THREE.BoxGeometry(2.4, 1.4, 2.4).translate(0, 0.7, 0), START.walls),
      tint(new THREE.ConeGeometry(1.9, 1.1, 4).rotateY(Math.PI / 4).translate(0, 1.95, 0), START.roof),
    ])!;
    const groups: Record<string, { geo: THREE.BufferGeometry; list: Thing[] }> = {
      pine: { geo: pine, list: [] },
      leafy: { geo: leafy, list: [] },
      bush: { geo: bush, list: [] },
      block: { geo: block, list: [] },
      source: { geo: source, list: [] },
      start: { geo: start, list: [] },
    };
    for (const th of things) {
      const k = th.template === "Pine" ? "pine" : /^(Oak|Birch|Maple|Chestnut|Mangrove)$/.test(th.template) ? "leafy" : /Bush/.test(th.template) ? "bush" : /Source|Seep|Aquifer/.test(th.template) ? "source" : th.template === "StartingLocation" ? "start" : th.template === "Slope" ? "" : "block";
      if (k) groups[k].list.push(th);
    }
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    for (const [k, g] of Object.entries(groups)) {
      if (!g.list.length) continue;
      const im = new THREE.InstancedMesh(g.geo, mat, g.list.length);
      g.list.forEach((th, n) => {
        const h = (Math.sin(th.x * 12.9898 + th.y * 78.233) * 43758.5453) % 1;
        const s = k === "start" ? 1 : 0.85 + 0.3 * Math.abs(h);
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), h * 6.28);
        const off = k === "start" ? 1.5 : 0.5;
        m4.compose(new THREE.Vector3(th.x + off, th.z, -(th.y + off)), q, new THREE.Vector3(s, s, s));
        im.setMatrixAt(n, m4);
      });
      im.frustumCulled = false;
      this.thingGroup.add(im);
    }
  }

  // ---------------------------------------------------------------------------- the gesture

  showCursor(hit: Hit | null): void {
    if (!hit) {
      this.cursor.visible = false;
      return;
    }
    this.cursor.visible = true;
    this.cursor.position.copy(hit.point);
    const n = new THREE.Vector3(hit.nx, hit.nz, -hit.ny);
    this.cursor.position.addScaledVector(n, 0.04);
    this.cursor.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
  }

  /** The painted stroke, as it's drawn (the gesture itself, D258 (4)); null clears it. */
  showStroke(points: THREE.Vector3[] | null): void {
    if (this.stroke) {
      this.scene.remove(this.stroke);
      this.stroke.geometry.dispose();
      this.stroke = null;
    }
    if (!points || points.length < 2) return;
    const g = new LineGeometry();
    g.setPositions(points.flatMap((p) => [p.x, p.y + 0.08, p.z]));
    this.stroke = new Line2(g, this.strokeMat);
    this.stroke.renderOrder = 11;
    this.scene.add(this.stroke);
  }

  // ---------------------------------------------------------------------------- the camera

  applyPose(): void {
    const p = this.pose;
    const fov = p.fov ?? 45;
    if (this.camera.fov !== fov) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
    const t = new THREE.Vector3(...p.target);
    const c = Math.cos(p.pitch);
    this.camera.position.set(t.x + p.distance * c * Math.sin(p.yaw), t.y + p.distance * Math.sin(p.pitch), t.z + p.distance * c * Math.cos(p.yaw));
    this.camera.lookAt(t);
  }

  orbit(dx: number, dy: number): void {
    this.pose.yaw -= dx * 0.006;
    this.pose.pitch = Math.max(-0.7, Math.min(1.5, this.pose.pitch + dy * 0.005));
  }

  pan(dx: number, dy: number): void {
    const s = this.pose.distance * 0.0016;
    const right = new THREE.Vector3(Math.cos(this.pose.yaw), 0, -Math.sin(this.pose.yaw));
    const fwd = new THREE.Vector3(-Math.sin(this.pose.yaw), 0, -Math.cos(this.pose.yaw));
    const t = this.pose.target;
    t[0] += -right.x * dx * s + fwd.x * dy * s;
    t[2] += -right.z * dx * s + fwd.z * dy * s;
  }

  zoom(delta: number): void {
    this.pose.distance = Math.max(1.2, Math.min(400, this.pose.distance * Math.exp(delta * 0.0012)));
  }

  // ---------------------------------------------------------------------------- picking

  /** The land under a screen point: a voxel walk along the ray (tile space). */
  pick(clientX: number, clientY: number): Hit | null {
    const t = this.terrain;
    if (!t) return null;
    const r = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    const o = ray.ray.origin, d = ray.ray.direction;
    // tile space: x, y = −Z, z = Y
    const O = [o.x, -o.z, o.y], D = [d.x, -d.z, d.y];
    const size = [t.W, t.H, LAYERS];
    // enter the box [0, W) × [0, H) × [−1, LAYERS)
    let tmin = 0, tmax = 1e9;
    const lo = [0, 0, -1];
    for (let a = 0; a < 3; a++) {
      if (Math.abs(D[a]) < 1e-9) {
        if (O[a] < lo[a] || O[a] > size[a]) return null;
        continue;
      }
      let t1 = (lo[a] - O[a]) / D[a], t2 = (size[a] - O[a]) / D[a];
      if (t1 > t2) [t1, t2] = [t2, t1];
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
    }
    if (tmin > tmax) return null;
    const P = O.map((v, a) => v + D[a] * (tmin + 1e-6));
    const cell = P.map((v, a) => Math.min(size[a] - 1, Math.max(a === 2 ? -1 : 0, Math.floor(v))));
    const step = D.map((v) => (v > 0 ? 1 : -1));
    const tMax = D.map((v, a) => (Math.abs(v) < 1e-12 ? 1e9 : ((v > 0 ? cell[a] + 1 : cell[a]) - O[a]) / v));
    const tDelta = D.map((v) => (Math.abs(v) < 1e-12 ? 1e9 : Math.abs(1 / v)));
    let axis = -1;
    for (let k = 0; k < 2000; k++) {
      const [x, y, z] = cell;
      if (x < 0 || y < 0 || x >= t.W || y >= t.H || z >= LAYERS) return null;
      if (t.solid(x, y, z)) {
        const n = [0, 0, 0];
        if (axis >= 0) n[axis] = -step[axis];
        else n[2] = 1;
        const tt = axis >= 0 ? tMax[axis] - tDelta[axis] : tmin;
        const p = O.map((v, a) => v + D[a] * tt);
        return { x, y, z, nx: n[0], ny: n[1], nz: n[2], point: new THREE.Vector3(p[0], p[2], -p[1]) };
      }
      axis = tMax[0] < tMax[1] ? (tMax[0] < tMax[2] ? 0 : 2) : tMax[1] < tMax[2] ? 1 : 2;
      cell[axis] += step[axis];
      tMax[axis] += tDelta[axis];
    }
    return null;
  }

  render(): void {
    this.applyPose();
    this.renderer.render(this.scene, this.camera);
  }

  // dust material, for effects.ts
  dustMaterial(): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: DUST_VERT,
      fragmentShader: DUST_FRAG,
      transparent: true,
      depthWrite: false,
      uniforms: { scale: { value: 600 } },
    });
  }
}
