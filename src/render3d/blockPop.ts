// The Block tool's blocks grow and crumble (D240: "raised blocks grow up with a tiny overshoot, lowered ones sink and
// crumble with a puff of dust"; D488: the rendering the Block tool needs). A moment of an edit already applied (D342):
// the map's land is the new land from the first frame, the pick, the water and the file see nothing else, and the next
// action never waits. Only the Block tool's edits play it (the renderer knows them, `blockEditSent`); a brush paints
// its land as it goes (D197) and the forces have their own moments.
//
// A block added grows out of the face it was added against (the rock it stands on, else the wall it juts from, else
// the roof it hangs under) in about a quarter of a second, a few hundredths past its size and back. It is drawn as the
// ground is drawn, with the look's own terrain material (D497: the game's look; the game's own editor sets a block at
// once, so the motion is ours, the look is the game's): while it grows the terrain's own faces of the block are left
// out (the terrain shader's `popCells`, the growing cells by key), and the faces it covers (the rock under it, the wall
// beside it) are drawn as they stood, so the ground never shows a hole. A block taken sinks into the ground below it,
// shrinking, in about four tenths of a second, the terrain material again, and a few puffs of its own wall's stone
// ground fine rise from where it was (Erode's dust: never white smoke) and fade in under a second.
//
// Off with reduced motion and in the light look (software drawing): the land is simply there (D240). At most
// `POP_CELLS` blocks grow at once and as many sink (D240: simultaneous pops capped); past that, a block is simply there.
// Fixed buffers: nothing is allocated while it plays, and nothing is drawn or asked for once it ends.

import {
  BufferAttribute,
  BufferGeometry,
  InstancedBufferAttribute,
  InstancedMesh,
  Mesh,
  Object3D,
  PlaneGeometry,
  ShaderMaterial,
  Vector4,
  type Material,
  type Scene,
} from "three";
import { WALL_CLOCK, type Clock } from "./clock";
import { wallColor } from "./palette";
import type { Cell } from "./blockGhost";

/** How long a block grows (ms), how long a taken one sinks, and how long its dust lasts. */
export const GROW_MS = 260;
export const SINK_MS = 420;
export const DUST_MS = 900;
/** The blocks that grow at once at most (the terrain shader's `popCells`: four to a vec4, 16 of them), and sink. */
export const POP_CELLS = 64;
const SINK_CELLS = 64;
/** Dust puffs from a block taken, and the pool. */
const PUFFS_PER_BLOCK = 5;
const DUST_POOL = 96;
/** The dust's colour against its wall's stone. */
const DUST_LIFT = 1.3;
/** How far a growing block's faces stand off its cell (blocks): off the grid, so the terrain shader, which leaves out
 *  the growing cells' faces on the grid, never leaves out these. */
const EPS = 0.006;

/** A block's size along its growth `t` of the way through (0–1): from nothing, a few hundredths past 1, settled at 1. */
export function growScale(t: number): number {
  if (t >= 1) return 1;
  const c1 = 1.2;
  const u = t - 1;
  return 1 + (c1 + 1) * u * u * u + c1 * u * u;
}

/** How far a taken block has sunk (levels) and its size across, `t` of the way through. */
export function sinkAt(t: number): { drop: number; size: number } {
  const k = Math.min(1, Math.max(0, t));
  return { drop: k * k, size: 1 - 0.35 * k };
}

/** The six ways from a cell (map steps x, y, layer): +x, −x, +y, −y, up, down. */
export const WAYS: readonly (readonly [number, number, number])[] = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
];
/** Each way as a world axis (0 X, 1 Y up, 2 Z) and its sign (world Z = −y). */
const WAY_AXIS = [0, 0, 2, 2, 1, 1];
const WAY_SIGN = [1, -1, -1, 1, 1, -1];

/** A growing block: its cell, the way to the rock it grows out of, its faces to draw (bit per way: air now, or a block
 *  growing too) and the faces it covers (bit per way: rock that is not growing, drawn on the grid as it stands while
 *  the block grows: the ground under it, the wall it juts from, a block of the same edit past the cap). */
export interface Grow {
  x: number;
  y: number;
  z: number;
  base: number;
  faces: number;
  covers: number;
  t0: number;
}

/** A sinking block: its cell and its faces to draw (bit per way: air now, so the blocks taken with it show their sides
 *  as they shrink apart). */
export interface Sink {
  x: number;
  y: number;
  z: number;
  faces: number;
  t0: number;
}

const NONE: { grows: Grow[]; sinks: Sink[] } = { grows: [], sinks: [] };
const cellKey = (x: number, y: number, z: number) => `${x},${y},${z}`;

/** The pops playing after an edit's cells land, against the land as it is now (`solid(x, y, z)`, false off the map and
 *  above the cut). `live`, the pops still playing: those the land now contradicts are dropped (a growing block that is
 *  air again, a sinking one that is rock again: an undo, a redo, other land), and the rest are reshaped in place. The
 *  edit's cells join them under the caps (`POP_CELLS` growing, as many sinking); past the caps a cell is simply there,
 *  drawn by the terrain at once, so a growing block's faces toward it are covers like any rock's, never a slit. A new
 *  block grows from the first way that is rock and not growing: down, then the sides, then up (none: up from its
 *  floor). */
export function popsOf(
  added: readonly Cell[],
  removed: readonly Cell[],
  solid: (x: number, y: number, z: number) => boolean,
  t0: number,
  live: { grows: Grow[]; sinks: Sink[] } = NONE,
): { grows: Grow[]; sinks: Sink[] } {
  const grows = live.grows.filter((g) => solid(g.x, g.y, g.z));
  const sinks = live.sinks.filter((b) => !solid(b.x, b.y, b.z));
  const growing = new Set(grows.map((g) => cellKey(g.x, g.y, g.z)));
  const fresh = grows.length;
  for (const [x, y, z] of added) {
    if (grows.length >= POP_CELLS) break;
    const k = cellKey(x, y, z);
    if (growing.has(k) || !solid(x, y, z)) continue;
    growing.add(k);
    grows.push({ x, y, z, base: -1, faces: 0, covers: 0, t0 });
  }
  const sinking = new Set(sinks.map((b) => cellKey(b.x, b.y, b.z)));
  for (const [x, y, z] of removed) {
    if (sinks.length >= SINK_CELLS) break;
    const k = cellKey(x, y, z);
    if (sinking.has(k) || solid(x, y, z)) continue;
    sinking.add(k);
    sinks.push({ x, y, z, faces: 0, t0 });
  }
  for (let n = 0; n < grows.length; n++) {
    const g = grows[n];
    let faces = 0;
    let covers = 0;
    for (let w = 0; w < 6; w++) {
      const [dx, dy, dz] = WAYS[w];
      const nx = g.x + dx;
      const ny = g.y + dy;
      const nz = g.z + dz;
      if (!solid(nx, ny, nz) || growing.has(cellKey(nx, ny, nz))) faces |= 1 << w;
      else covers |= 1 << w;
    }
    g.faces = faces;
    g.covers = covers;
    if (n < fresh) continue;
    g.base = 5;
    for (const w of BASE_ORDER)
      if (covers & (1 << w)) {
        g.base = w;
        break;
      }
  }
  for (const b of sinks) {
    let faces = 0;
    for (let w = 0; w < 6; w++) if (!solid(b.x + WAYS[w][0], b.y + WAYS[w][1], b.z + WAYS[w][2])) faces |= 1 << w;
    b.faces = faces;
  }
  return { grows, sinks };
}
/** The ways a block grows from, first found first: down, the sides, up. */
const BASE_ORDER = [5, 0, 1, 2, 3, 4];

/** Writes quads (position and normal, world) into fixed buffers. */
export class QuadWriter {
  readonly pos: Float32Array;
  readonly nrm: Float32Array;
  n = 0;

  constructor(readonly max: number) {
    this.pos = new Float32Array(max * 12);
    this.nrm = new Float32Array(max * 12);
  }

  /** The face of the world box [lo, hi] on `way`'s side, facing out along `way` (or back in, `inward`), wound
   *  counter-clockwise seen from the side it faces. */
  face(lo0: number, lo1: number, lo2: number, hi0: number, hi1: number, hi2: number, way: number, inward = false): void {
    if (this.n >= this.max) return;
    const k = WAY_AXIS[way];
    const s = WAY_SIGN[way];
    const facing = inward ? -s : s;
    const i = (k + 1) % 3;
    const j = (k + 2) % 3;
    const lo = BOX;
    const hi = BOX_HI;
    lo[0] = lo0;
    lo[1] = lo1;
    lo[2] = lo2;
    hi[0] = hi0;
    hi[1] = hi1;
    hi[2] = hi2;
    const plane = s > 0 ? hi[k] : lo[k];
    // (u along axis i, v along axis j: e_i × e_j = e_k, so (lo,lo) (hi,lo) (hi,hi) (lo,hi) faces +k; reversed for −k)
    const corners = facing > 0 ? CORNERS_UP : CORNERS_DOWN;
    let o = this.n * 12;
    for (let c = 0; c < 4; c++) {
      this.pos[o + k] = plane;
      this.pos[o + i] = corners[c * 2] ? hi[i] : lo[i];
      this.pos[o + j] = corners[c * 2 + 1] ? hi[j] : lo[j];
      this.nrm[o + k] = facing;
      this.nrm[o + i] = 0;
      this.nrm[o + j] = 0;
      o += 3;
    }
    this.n++;
  }
}
/** Scratch for a box's corners (nothing allocated a face). */
const BOX = new Float64Array(3);
const BOX_HI = new Float64Array(3);
const CORNERS_UP = [0, 0, 1, 0, 1, 1, 0, 1];
const CORNERS_DOWN = [0, 0, 0, 1, 1, 1, 1, 0];

/** The pops as they are at `now` into `out`: each growing block's box from the rock it grows out of, its covered faces as
 *  they stood, each sinking block's box. Returns whether any still plays. Pure but for `out`. */
export function writePops(out: QuadWriter, grows: readonly Grow[], sinks: readonly Sink[], now: number): boolean {
  out.n = 0;
  let any = false;
  for (let n = 0; n < grows.length; n++) {
    const g = grows[n];
    const t = (now - g.t0) / GROW_MS;
    if (t >= 1) continue;
    any = true;
    const s = growScale(Math.max(0, t));
    // the cell in world (X x..x+1, Y z..z+1, Z −y−1..−y), grown along the base's axis from the base's side, its faces a
    // hair off the grid
    let l0 = g.x - EPS;
    let l1 = g.z - EPS;
    let l2 = -g.y - 1 - EPS;
    let h0 = g.x + 1 + EPS;
    let h1 = g.z + 1 + EPS;
    let h2 = -g.y + EPS;
    const k = WAY_AXIS[g.base];
    const up = WAY_SIGN[g.base] > 0;
    const len = s + 2 * EPS;
    if (k === 0) {
      if (up) l0 = h0 - len;
      else h0 = l0 + len;
    } else if (k === 1) {
      if (up) l1 = h1 - len;
      else h1 = l1 + len;
    } else if (up) l2 = h2 - len;
    else h2 = l2 + len;
    for (let w = 0; w < 6; w++) if (g.faces & (1 << w)) out.face(l0, l1, l2, h0, h1, h2, w);
    // (the rock it covers, on the grid as it stood, facing into the cell)
    for (let w = 0; w < 6; w++) if (g.covers & (1 << w)) out.face(g.x, g.z, -g.y - 1, g.x + 1, g.z + 1, -g.y, w, true);
  }
  for (let n = 0; n < sinks.length; n++) {
    const b = sinks[n];
    const t = (now - b.t0) / SINK_MS;
    if (t >= 1) continue;
    any = true;
    const k = Math.max(0, t);
    // (sinkAt, inline: nothing allocated a frame)
    const drop = k * k;
    const size = 1 - 0.35 * k;
    const h = size / 2 + EPS;
    const cx = b.x + 0.5;
    const cz = -b.y - 0.5;
    const y0 = b.z - drop - EPS;
    for (let w = 0; w < 6; w++) if (b.faces & (1 << w)) out.face(cx - h, y0, cz - h, cx + h, y0 + size + 2 * EPS, cz + h, w);
  }
  return any;
}

/** The terrain shader's growing cells (materials.ts `popCells`): each cell's key x + 256 y + 65536 z, four to a vec4,
 *  −1 where none; and how many, and the box round them (map x, y, layer). */
export interface PopUniforms {
  popCells: { value: Vector4[] };
  popCount: { value: number };
  popLo: { value: Vector4 };
  popHi: { value: Vector4 };
}

export function popUniforms(): PopUniforms {
  return {
    popCells: { value: Array.from({ length: POP_CELLS / 4 }, () => new Vector4(-1, -1, -1, -1)) },
    popCount: { value: 0 },
    popLo: { value: new Vector4() },
    popHi: { value: new Vector4() },
  };
}

/** The growing cells into `u` (none: count 0, the shader's test skipped). */
export function setPopCells(u: PopUniforms, grows: readonly Grow[], now: number): void {
  let n = 0;
  const lo = u.popLo.value.set(1e9, 1e9, 1e9, 0);
  const hi = u.popHi.value.set(-1e9, -1e9, -1e9, 0);
  const cells = u.popCells.value;
  for (let i = 0; i < cells.length; i++) cells[i].set(-1, -1, -1, -1);
  for (let i = 0; i < grows.length; i++) {
    const g = grows[i];
    if (now - g.t0 >= GROW_MS || n >= POP_CELLS) continue;
    const v = cells[n >> 2];
    v.setComponent(n & 3, g.x + 256 * g.y + 65536 * g.z);
    lo.set(Math.min(lo.x, g.x), Math.min(lo.y, g.y), Math.min(lo.z, g.z), 0);
    hi.set(Math.max(hi.x, g.x), Math.max(hi.y, g.y), Math.max(hi.z, g.z), 0);
    n++;
  }
  u.popCount.value = n;
}

/** The GLSL the terrain's fragment shader runs first: a fragment of a face of a growing cell, on the grid, is left out
 *  (the pop draws the block as it grows). Needs `vWorld` and `vNormal`. */
export const POP_GLSL = /* glsl */ `
        if (popCount > 0.5) {
          vec3 pn = normalize(vNormal);
          vec3 pq = vWorld - pn * 0.5;
          vec3 pv = floor(vec3(pq.x, -pq.z, pq.y));
          float pl = dot(vWorld, abs(pn));
          if (abs(pl - floor(pl + 0.5)) < 0.002 && all(greaterThanEqual(pv, popLo.xyz)) && all(lessThanEqual(pv, popHi.xyz))) {
            float pk = pv.x + 256.0 * pv.y + 65536.0 * pv.z;
            for (int i = 0; i < ${POP_CELLS / 4}; i++) {
              if (float(i * 4) >= popCount) break;
              if (any(equal(popCells[i], vec4(pk)))) discard;
            }
          }
        }
`;

/** The uniforms' declarations for the terrain's fragment shader. */
export const POP_UNIFORMS_GLSL = /* glsl */ `
      uniform vec4 popCells[${POP_CELLS / 4}];
      uniform float popCount;
      uniform vec4 popLo;
      uniform vec4 popHi;
`;

/** A dust puff's floats: origin (x, y, z), drift (x, y, z), born (ms), colour (r, g, b), size, alive (0 free), and the
 *  cell it rose from (x, y, z). */
const PUFF_F = 15;

/** The dust's material: a soft disc facing the eye, its own colour and alpha (forces.ts Erode's dust, the same drawing). */
export function popDustMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    vertexShader: /* glsl */ `
      attribute float dustAlpha; attribute vec3 dustColor;
      varying vec2 uvD; varying float alphaD; varying vec3 colorD;
      void main() {
        uvD = uv; alphaD = dustAlpha; colorD = dustColor;
        vec4 p = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        p.xy += position.xy * instanceMatrix[0][0];
        // (drawn a little toward the eye, so a puff by a wall is not cut square by it)
        p.z += instanceMatrix[0][0] * 0.3;
        gl_Position = projectionMatrix * p;
      }`,
    fragmentShader: /* glsl */ `
      varying vec2 uvD; varying float alphaD; varying vec3 colorD;
      void main() {
        vec2 p = uvD * 2.0 - 1.0;
        float r = dot(p, p);
        if (r > 1.0) discard;
        float a = alphaD * (1.0 - r) * (1.0 - r);
        if (a < 0.004) discard;
        gl_FragColor = vec4(colorD * (0.93 + 0.12 * p.y), a);
      }`,
  });
}

/** A repeatable 0–1 from k. */
const hash = (k: number) => {
  const s = Math.sin(k * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};

/** The edit glow's added faces' strength while blocks grow (editGlow.ts `rise`): nothing in the newest growth's first
 *  quarter, coming in over its middle, full from three quarters on and when nothing grows, so the white outline frames
 *  the block once it has a size to frame and never veils it small. The glow's own faces, colours and clock are its
 *  own. */
export function glowRiseAt(grows: readonly Grow[], now: number): number {
  let t = 1;
  for (let n = 0; n < grows.length; n++) t = Math.min(t, Math.max(0, (now - grows[n].t0) / GROW_MS));
  const u = Math.min(1, Math.max(0, (t - 0.25) / 0.5));
  return u * u * (3 - 2 * u);
}

export class BlockPops {
  private readonly writer = new QuadWriter((POP_CELLS + SINK_CELLS) * 6);
  private readonly geo = new BufferGeometry();
  private readonly mesh: Mesh;
  private grows: Grow[] = [];
  private sinks: Sink[] = [];
  private readonly dustAlpha = new Float32Array(DUST_POOL);
  private readonly dustColor = new Float32Array(DUST_POOL * 3);
  private readonly dustGeo = new PlaneGeometry(2, 2);
  private readonly dust: InstancedMesh;
  private readonly puffs = new Float32Array(DUST_POOL * PUFF_F);
  private readonly dummy = new Object3D();
  private nextPuff = 0;
  private seq = 0;
  private frame = 0;
  private live = false;

  /** `terrain()`: the look's terrain material now; `uniforms`: the terrain materials' pop uniforms, shared;
   *  `glowRise`: the edit glow's `rise` (its added faces come in as the blocks grow: `glowRiseAt`). */
  constructor(
    scene: Scene,
    private readonly terrain: () => Material,
    private readonly uniforms: PopUniforms,
    dustMaterial: ShaderMaterial,
    private readonly render: () => void,
    private readonly clock: Clock = WALL_CLOCK,
    private readonly glowRise: { value: number } = { value: 1 },
  ) {
    this.geo.setAttribute("position", new BufferAttribute(this.writer.pos, 3));
    this.geo.setAttribute("normal", new BufferAttribute(this.writer.nrm, 3));
    const idx = new Uint16Array(this.writer.max * 6);
    for (let q = 0; q < this.writer.max; q++) {
      const v = q * 4;
      idx[q * 6] = v;
      idx[q * 6 + 1] = v + 1;
      idx[q * 6 + 2] = v + 2;
      idx[q * 6 + 3] = v;
      idx[q * 6 + 4] = v + 2;
      idx[q * 6 + 5] = v + 3;
    }
    this.geo.setIndex(new BufferAttribute(idx, 1));
    this.geo.setDrawRange(0, 0);
    this.mesh = new Mesh(this.geo, terrain());
    this.mesh.frustumCulled = false;
    this.mesh.matrixAutoUpdate = false;
    this.mesh.visible = false;
    this.mesh.name = "block.pops";
    scene.add(this.mesh);
    this.dustGeo.setAttribute("dustAlpha", new InstancedBufferAttribute(this.dustAlpha, 1));
    this.dustGeo.setAttribute("dustColor", new InstancedBufferAttribute(this.dustColor, 3));
    this.dust = new InstancedMesh(this.dustGeo, dustMaterial, DUST_POOL);
    this.dust.frustumCulled = false;
    this.dust.renderOrder = 6;
    this.dust.visible = false;
    this.dust.count = 0;
    scene.add(this.dust);
  }

  /** An edit's blocks landed (the land already the new land): `solid` the land as it is now (off the map and above the
   *  cut: false). */
  add(added: readonly Cell[], removed: readonly Cell[], solid: (x: number, y: number, z: number) => boolean): void {
    const now = this.clock.now();
    // (blocks still growing or sinking from the last edits go on, reshaped to this land, under the caps)
    const was = new Set(this.sinks);
    const p = popsOf(added, removed, solid, now, this.playingAt(now));
    this.grows = p.grows;
    this.sinks = p.sinks;
    for (const s of p.sinks) if (!was.has(s)) this.puff(s, now);
    if (!this.live && !p.grows.length && !p.sinks.length) return;
    this.live = true;
    this.advance();
    this.render();
    if (!this.clock.driven && !this.frame) this.frame = requestAnimationFrame(this.tick);
  }

  /** The land changed by anything but a Block edit (an undo, a redo, a brush, a version flipped to): the pops it
   *  contradicts stop at once, a growing block that is air again and a sinking one that is rock again with its dust,
   *  and the rest are reshaped to it (`popsOf`). */
  reconcile(solid: (x: number, y: number, z: number) => boolean): void {
    if (!this.live) return;
    const now = this.clock.now();
    const p = popsOf([], [], solid, now, this.playingAt(now));
    this.grows = p.grows;
    this.sinks = p.sinks;
    const f = this.puffs;
    for (let o = 0; o < f.length; o += PUFF_F) if (f[o + 11] && solid(f[o + 12], f[o + 13], f[o + 14])) f[o + 11] = 0;
    this.advance();
    this.render();
  }

  /** Whether anything plays (the pops or their dust). */
  get playing(): boolean {
    return this.live;
  }

  /** The pops still playing at `now`. */
  private playingAt(now: number): { grows: Grow[]; sinks: Sink[] } {
    return { grows: this.grows.filter((g) => now - g.t0 < GROW_MS), sinks: this.sinks.filter((s) => now - s.t0 < SINK_MS) };
  }

  /** A block taken's dust: a few puffs of its own wall's stone from where it was. */
  private puff(s: Sink, now: number): void {
    // (the stone ground fine reads a little lighter than its shaded wall)
    const [r, g, b] = wallColor(s.z).map((c) => Math.min(1, c * DUST_LIFT));
    for (let k = 0; k < PUFFS_PER_BLOCK; k++) {
      const i = this.nextPuff;
      this.nextPuff = (this.nextPuff + 1) % DUST_POOL;
      const h = (this.seq = (this.seq + 1) % 100000);
      const a = hash(h) * Math.PI * 2;
      const o = i * PUFF_F;
      const f = this.puffs;
      // (from the top of where it was, round its edge: the block itself sinks through its middle)
      f[o] = s.x + 0.5 + 0.45 * Math.cos(a);
      f[o + 1] = s.z + 0.85 + 0.25 * hash(h + 1);
      f[o + 2] = -s.y - 0.5 + 0.45 * Math.sin(a);
      f[o + 3] = 0.35 * Math.cos(a);
      f[o + 4] = 0.55 + 0.35 * hash(h + 2);
      f[o + 5] = 0.35 * Math.sin(a);
      f[o + 6] = now + 40 * k;
      f[o + 7] = r;
      f[o + 8] = g;
      f[o + 9] = b;
      f[o + 10] = 0.6 + 0.25 * hash(h + 3);
      f[o + 11] = 1;
      f[o + 12] = s.x;
      f[o + 13] = s.y;
      f[o + 14] = s.z;
    }
  }

  /** The pops and the dust as they are at the clock's time now (nothing once they are over); whether any still plays. */
  advance(): boolean {
    if (!this.live) return false;
    const now = this.clock.now();
    const mat = this.terrain();
    if (this.mesh.material !== mat) this.mesh.material = mat;
    const any = writePops(this.writer, this.grows, this.sinks, now);
    setPopCells(this.uniforms, this.grows, now);
    this.glowRise.value = glowRiseAt(this.grows, now);
    const n = this.writer.n;
    this.geo.setDrawRange(0, n * 6);
    for (let a = 0; a < 2; a++) {
      const attr = this.geo.getAttribute(a ? "normal" : "position") as BufferAttribute;
      attr.clearUpdateRanges();
      attr.addUpdateRange(0, Math.max(1, n * 12));
      attr.needsUpdate = true;
    }
    this.mesh.visible = n > 0;
    // the dust: each puff rising and spreading, slowing, growing and fading
    let d = 0;
    const f = this.puffs;
    for (let i = 0; i < DUST_POOL; i++) {
      const o = i * PUFF_F;
      if (!f[o + 11]) continue;
      const age = (now - f[o + 6]) / 1000;
      const t = age / (DUST_MS / 1000);
      if (t >= 1) {
        f[o + 11] = 0;
        continue;
      }
      if (t < 0) continue;
      const go = (1 - Math.exp(-2.2 * age)) / 2.2;
      this.dummy.position.set(f[o] + f[o + 3] * go, f[o + 1] + f[o + 4] * go, f[o + 2] + f[o + 5] * go);
      this.dummy.scale.setScalar(f[o + 10] * (0.7 + 0.9 * t));
      this.dummy.updateMatrix();
      this.dust.setMatrixAt(d, this.dummy.matrix);
      this.dustAlpha[d] = 0.95 * Math.min(1, t * 6) * (1 - t) * (1 - t);
      this.dustColor[d * 3] = f[o + 7];
      this.dustColor[d * 3 + 1] = f[o + 8];
      this.dustColor[d * 3 + 2] = f[o + 9];
      d++;
    }
    this.dust.count = d;
    this.dust.visible = d > 0;
    if (d) {
      this.dust.instanceMatrix.needsUpdate = true;
      (this.dustGeo.getAttribute("dustAlpha") as InstancedBufferAttribute).needsUpdate = true;
      (this.dustGeo.getAttribute("dustColor") as InstancedBufferAttribute).needsUpdate = true;
    }
    if (!any && !d) {
      this.live = false;
      this.grows = [];
      this.sinks = [];
      this.uniforms.popCount.value = 0;
      this.glowRise.value = 1;
      this.mesh.visible = false;
    }
    return this.live;
  }

  private readonly tick = (): void => {
    this.frame = 0;
    const on = this.advance();
    this.render();
    if (on) this.frame = requestAnimationFrame(this.tick);
  };

  /** What plays now (tests): the blocks growing and sinking, the quads drawn and the puffs. */
  get drawn(): { grows: number; sinks: number; quads: number; puffs: number } {
    if (!this.live) return { grows: 0, sinks: 0, quads: 0, puffs: 0 };
    return { grows: this.uniforms.popCount.value, sinks: this.sinks.length, quads: this.writer.n, puffs: this.dust.count };
  }

  /** Put away at once (a new map, the layer cut moved). */
  clear(): void {
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.live = false;
    this.grows = [];
    this.sinks = [];
    this.puffs.fill(0);
    this.uniforms.popCount.value = 0;
    this.glowRise.value = 1;
    this.mesh.visible = false;
    this.dust.visible = false;
    this.dust.count = 0;
  }

  dispose(): void {
    this.clear();
    this.mesh.removeFromParent();
    this.dust.removeFromParent();
    this.geo.dispose();
    this.dustGeo.dispose();
    this.dust.dispose();
  }
}
