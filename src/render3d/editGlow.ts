// What an edit just changed in 3D, shown for a moment (D488: caves and overhangs read clearly while editing; the
// usability audits: a block added to a cliff or dug into a wall is the same stone as its neighbours, so once it lands
// nobody can tell what changed). The faces the edit exposed glow in the Block tool's preview colours (D335): a block
// added, its open faces white; a block taken, the faces it left open in the hollow (the rock round it) red. Each face
// is outlined, so the change reads as blocks, then the whole glow fades out in about a second.
//
// What counts (the renderer works it out from each terrain update, no operation says it): every cell whose solid
// state differs between the columns drawn before and the update's, on tiles with terrain above terrain before or
// after (a Block dig or overhang, an Erode cave, a stroke or a Select action that reshapes a roof's top, their undo);
// on plain tiles only for the Block tool's edits (it says so as it sends one) and Erode's frames, since a brush paints
// its land live and the other forces have their own moments (D197, D240), and those are not doubled. Compare's flip to
// another version is not an edit and never glows. Only drawn; nothing per frame once it has faded.

import { BufferAttribute, BufferGeometry, DoubleSide, Mesh, ShaderMaterial, type Scene } from "three";
import type { Cell } from "./blockGhost";
import { LAYERS } from "./model";

/** A map's columns as an edit compares them: the heights, and the listed columns' masks over the whole map (0 on a
 *  plain tile, `model.ts` `columnMasks`; absent when no column is listed). */
export interface ColumnsState {
  heights: ArrayLike<number>;
  masks?: ArrayLike<number>;
}

/** The cells an edit changed: those that are solid now (added) and those that are air now (removed). */
export interface EditCells {
  added: Cell[];
  removed: Cell[];
}

/** A plain tile's column: solid from the floor up to its height. */
export const plainMask = (h: number): number => (h >= 31 ? 0x7fffffff : (1 << h) - 1);

/** Inside a rectangle. */
type Rect = { x0: number; y0: number; x1: number; y1: number };

/** The cells whose solid state differs between `was` and `now` (within `rect`, the whole map when null): on every tile
 *  listed (not one plain run) in either, from its masks; on plain tiles too when `plain` says so, from the heights. The
 *  masks are the stored ones, not reshaped to the heights, so a roof's top the page painted before the worker's columns
 *  came still counts as changed. Pure. */
export function editedCells(W: number, H: number, was: ColumnsState, now: ColumnsState, plain: boolean, rect: Rect | null = null): EditCells {
  const out: EditCells = { added: [], removed: [] };
  const x0 = Math.max(0, rect?.x0 ?? 0);
  const y0 = Math.max(0, rect?.y0 ?? 0);
  const x1 = Math.min(W - 1, rect?.x1 ?? W - 1);
  const y1 = Math.min(H - 1, rect?.y1 ?? H - 1);
  const wm = was.masks;
  const nm = now.masks;
  if (!wm && !nm && !plain) return out;
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const i = y * W + x;
      const a = wm ? wm[i] : 0;
      const b = nm ? nm[i] : 0;
      if (!a && !b && (!plain || was.heights[i] === now.heights[i])) continue;
      const before = a || plainMask(was.heights[i]);
      const after = b || plainMask(now.heights[i]);
      let d = (before ^ after) >>> 0;
      while (d) {
        const z = 31 - Math.clz32(d);
        d &= ~(1 << z);
        if (z >= LAYERS) continue;
        (after & (1 << z) ? out.added : out.removed).push([x, y, z]);
      }
    }
  return out;
}

/** The six sides of a cell: the step to the neighbour (x, y, layer). */
const SIDES: readonly (readonly [number, number, number])[] = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
];

/** The faces to glow, as quads: four corners each (x, y, z in world space: X = x, Y = layer, Z = −y), each corner's
 *  place on its face (0 or 1, twice) and its kind (0 added, 1 removed). */
export interface GlowFaces {
  positions: Float32Array;
  face: Float32Array;
  kind: Float32Array;
  added: number;
  removed: number;
}

/** How far a face is lifted off the rock it lies on, toward the air, so it never fights the terrain's own face. */
const LIFT = 0.012;

/** The faces the changed cells (keys `(y·W + x)·32 + layer`) leave open, against the columns as they are now
 *  (`maskAt(x, y)`): a cell solid now, its sides that face air (added, white); a cell that is air now, the sides of the
 *  rock round it that face into it (removed, red: the hollow's walls, floor and ceiling). Off the map is air, below
 *  the floor rock. Cells at or above the layer cut (and rock there) are hidden by the cut, so left out. Pure. */
export function glowFaces(keys: Iterable<number>, W: number, H: number, maskAt: (x: number, y: number) => number, cut: number | null = null): GlowFaces {
  const quads: number[] = [];
  let added = 0;
  let removed = 0;
  const top = cut ?? LAYERS;
  const solid = (x: number, y: number, z: number) => (z < 0 ? true : z >= top || x < 0 || y < 0 || x >= W || y >= H ? false : ((maskAt(x, y) >>> z) & 1) === 1);
  for (const key of keys) {
    const z = key & 31;
    const i = (key - z) / 32;
    const x = i % W;
    const y = (i - x) / W;
    if (z >= top) continue;
    const now = solid(x, y, z);
    for (let s = 0; s < 6; s++) {
      const [dx, dy, dz] = SIDES[s];
      const other = solid(x + dx, y + dy, z + dz);
      // (a block now: its sides open to the air; air now: the rock round it, facing in)
      if (now === other) continue;
      quads.push(x, y, z, s, now ? 0 : 1);
      if (now) added++;
      else removed++;
    }
  }
  const n = quads.length / 5;
  const positions = new Float32Array(n * 12);
  const face = new Float32Array(n * 8);
  const kind = new Float32Array(n * 4);
  for (let q = 0; q < n; q++) {
    const x = quads[q * 5];
    const y = quads[q * 5 + 1];
    const z = quads[q * 5 + 2];
    const s = quads[q * 5 + 3];
    const k = quads[q * 5 + 4];
    const [dx, dy, dz] = SIDES[s];
    // (the plane between the cell and its neighbour on side s, lifted toward the air: out of an added block, into
    // the hollow a removed one left)
    const lift = k === 0 ? LIFT : -LIFT;
    // the four corners in cell space (x, y, layer), along the plane's two other axes
    const c: number[][] = [];
    for (const [u, v] of [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ]) {
      if (dx) c.push([x + (dx > 0 ? 1 : 0) + dx * lift, y + u, z + v]);
      else if (dy) c.push([x + u, y + (dy > 0 ? 1 : 0) + dy * lift, z + v]);
      else c.push([x + u, y + v, z + (dz > 0 ? 1 : 0) + dz * lift]);
    }
    for (let j = 0; j < 4; j++) {
      positions[q * 12 + j * 3] = c[j][0];
      positions[q * 12 + j * 3 + 1] = c[j][2];
      positions[q * 12 + j * 3 + 2] = -c[j][1];
      face[q * 8 + j * 2] = j === 1 || j === 2 ? 1 : 0;
      face[q * 8 + j * 2 + 1] = j >= 2 ? 1 : 0;
      kind[q * 4 + j] = k;
    }
  }
  return { positions, face, kind, added, removed };
}

/** How long the glow holds at full before it fades, and how long the fade takes (seconds). */
export const GLOW_HOLD = 0.25;
export const GLOW_FADE = 0.85;
/** With reduced motion: shown still at this strength, for this long, then gone (no fade). */
const STILL_MS = 1000;
const STILL_FADE = 0.85;
/** The most a frame moves the glow's clock (ms): a page held seconds (the first cave's light and shaders) never eats it, a slow frame still moves it on. */
const MAX_STEP_MS = 250;
/** At most this many cells glow at once (a big Erode or a whole-map action: the first ones). */
const MAX_CELLS = 20000;

/** The glow's strength at `t` seconds after the last change: full, then easing out to nothing. */
export function glowFade(t: number): number {
  if (t <= GLOW_HOLD) return 1;
  const u = Math.min(1, (t - GLOW_HOLD) / GLOW_FADE);
  return 1 - u * u * (3 - 2 * u);
}

function glowMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    uniforms: { fade: { value: 1 } },
    vertexShader: /* glsl */ `
      attribute vec2 face;
      attribute float kind;
      varying vec2 vFace;
      varying float vKind;
      void main() {
        vFace = face;
        vKind = kind;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform float fade;
      varying vec2 vFace;
      varying float vKind;
      void main() {
        // (near the face's border: its outline, so the change reads as blocks)
        vec2 d = min(vFace, 1.0 - vFace);
        float edge = 1.0 - smoothstep(0.035, 0.075, min(d.x, d.y));
        // added: the Block tool's white; removed: its red (D335)
        vec3 fill = mix(vec3(0.93, 0.96, 1.0), vec3(0.95, 0.3, 0.24), vKind);
        vec3 line = mix(vec3(1.0), vec3(1.0, 0.5, 0.42), vKind);
        float a = mix(mix(0.34, 0.4, vKind), 0.9, edge) * fade;
        gl_FragColor = vec4(mix(fill, line, edge), a);
      }`,
  });
}

/** The glow: one mesh of the changed cells' faces, rebuilt when an edit lands (a new change joins the cells still
 *  glowing, and they all start over), its strength a uniform while it fades. */
export class EditGlow {
  private readonly geo = new BufferGeometry();
  private readonly mat = glowMaterial();
  private readonly mesh = new Mesh(this.geo, this.mat);
  /** The cells glowing, as `glowFaces` keys. */
  private cells = new Set<number>();
  private frame = 0;
  private faces = { added: 0, removed: 0 };

  constructor(
    scene: Scene,
    private readonly render: () => void,
  ) {
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 8;
    this.mesh.visible = false;
    this.mesh.name = "edit.glow";
    scene.add(this.mesh);
  }

  /** An edit's cells (`editedCells`) landed: they glow with any still glowing, against the columns as they are now
   *  (`maskAt`), under the layer cut. `still` (reduced motion): shown for a moment without fading. */
  show(cells: EditCells, W: number, H: number, maskAt: (x: number, y: number) => number, cut: number | null, still: boolean): void {
    if (!this.mesh.visible) this.cells.clear();
    for (const list of [cells.added, cells.removed])
      for (const [x, y, z] of list) {
        if (this.cells.size >= MAX_CELLS) break;
        this.cells.add((y * W + x) * 32 + z);
      }
    const f = glowFaces(this.cells, W, H, maskAt, cut);
    this.faces = { added: f.added, removed: f.removed };
    if (!f.added && !f.removed) return this.clear();
    const n = f.positions.length / 12;
    const idx = new Uint32Array(n * 6);
    for (let q = 0; q < n; q++) idx.set([q * 4, q * 4 + 1, q * 4 + 2, q * 4, q * 4 + 2, q * 4 + 3], q * 6);
    this.geo.dispose();
    this.geo.setAttribute("position", new BufferAttribute(f.positions, 3));
    this.geo.setAttribute("face", new BufferAttribute(f.face, 2));
    this.geo.setAttribute("kind", new BufferAttribute(f.kind, 1));
    this.geo.setIndex(new BufferAttribute(idx, 1));
    this.mesh.visible = true;
    this.age = 0;
    this.last = -1;
    this.still = still;
    this.mat.uniforms.fade.value = still ? STILL_FADE : 1;
    cancelAnimationFrame(this.frame);
    this.frame = requestAnimationFrame(this.tick);
    this.render();
  }

  private still = false;
  /** How long it has been shown (seconds), and when the last frame came. */
  private age = 0;
  private last = -1;

  private readonly tick = (): void => {
    this.frame = 0;
    // (its clock runs with the frames drawn, at most a frame's worth a frame: the first cave on a map builds its light
    // and compiles its shaders first, which can hold the page for seconds, and the glow must not be over unseen)
    const now = performance.now();
    if (this.last >= 0) this.age += Math.min(now - this.last, MAX_STEP_MS) / 1000;
    this.last = now;
    if (this.still) {
      // (reduced motion: no fade, only gone a moment later; nothing drawn in between)
      if (this.age * 1000 >= STILL_MS) {
        this.clear();
        this.render();
      } else this.frame = requestAnimationFrame(this.tick);
      return;
    }
    const f = glowFade(this.age);
    if (f <= 0) {
      this.clear();
      this.render();
      return;
    }
    this.mat.uniforms.fade.value = f;
    this.render();
    this.frame = requestAnimationFrame(this.tick);
  };

  /** Put it away at once (a new map, the layer cut moved). */
  clear(): void {
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.mesh.visible = false;
    this.cells.clear();
    this.faces = { added: 0, removed: 0 };
    // (its buffers go from the GPU too; the next glow sets new ones)
    this.geo.dispose();
  }

  /** What glows now (tests): the faces of each kind and the strength (0 when nothing does). */
  get drawn(): { added: number; removed: number; fade: number } {
    return this.mesh.visible ? { ...this.faces, fade: this.mat.uniforms.fade.value as number } : { added: 0, removed: 0, fade: 0 };
  }

  dispose(): void {
    this.clear();
    this.mesh.removeFromParent();
    this.geo.dispose();
    this.mat.dispose();
  }
}
