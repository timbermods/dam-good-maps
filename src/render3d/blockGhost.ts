// The blocks an area stroke will add or take away, while it is dragged (the area brush, Timberborn's own
// editor's Terrain; Kyler, 2026-10-03): as in the game, a translucent block on every tile for each block
// Raise will add, stacked on the ground; for Lower, each block it will take away, red, drawn just outside
// the ground's own so they read as going. The land itself changes only when the stroke is let go. Each
// block shows its edges, so they read as blocks. Only drawn.
//
// The Block tool's live preview (3D step 3, D488) draws the same way from any cells: `BlockCells` takes the
// lists `blockFalls` returns (blocks to add, blocks to remove, blocks that would fall), one instanced mesh
// for each kind, rebuilt only when a list or the layer cut changes.

import { BoxGeometry, InstancedMesh, Matrix4, ShaderMaterial, type Scene } from "three";

/** A tile's change: its index, and its level before and after. */
export interface GhostTile {
  i: number;
  from: number;
  to: number;
}

/** More blocks than this are drawn as one column a tile (the same shape, without the seams). */
const MAX_BLOCKS = 65536;

type GhostKind = "raise" | "lower" | "fall" | "muted";

function ghostMaterial(kind: GhostKind): ShaderMaterial {
  return new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {},
    vertexShader: /* glsl */ `
      varying vec3 local;
      varying float span;
      void main() {
        local = position;
        span = length(instanceMatrix[1].xyz);
        gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 local;
      varying float span;
      void main() {
        // (near two of a block's faces at once is on its edge; up and down, the nearest level line: a
        // block's own face, or a column's seam between its blocks)
        vec3 d = 0.5 - abs(local);
        float level = (local.y + 0.5) * span;
        d.y = abs(level - floor(level + 0.5));
        float lo = min(d.x, min(d.y, d.z));
        float hi = max(d.x, max(d.y, d.z));
        float mid = d.x + d.y + d.z - lo - hi;
        float edge = 1.0 - smoothstep(0.025, 0.055, mid);
        ${
          kind === "lower"
            ? "vec3 fill = vec3(0.92, 0.26, 0.2); vec3 line = vec3(1.0, 0.42, 0.34); float a = 0.36;"
            : kind === "fall"
              ? "vec3 fill = vec3(0.86, 0.06, 0.07); vec3 line = vec3(1.0, 0.36, 0.3); float a = 0.62;"
              : kind === "muted"
                ? "vec3 fill = vec3(0.6, 0.62, 0.66); vec3 line = vec3(0.86, 0.87, 0.9); float a = 0.2;"
                : "vec3 fill = vec3(0.93, 0.96, 1.0); vec3 line = vec3(1.0); float a = 0.3;"
        }
        gl_FragColor = vec4(mix(fill, line, edge), mix(a, 0.9, edge));
      }`,
  });
}

export class BlockGhost {
  private mesh: InstancedMesh | null = null;
  private readonly box = new BoxGeometry(1, 1, 1);
  private readonly raise = ghostMaterial("raise");
  private readonly lower = ghostMaterial("lower");

  constructor(private readonly scene: Scene) {}

  /** The tiles' changes on a map `W` tiles across (null or empty: none). */
  set(tiles: readonly GhostTile[] | null, W: number): void {
    this.clear();
    if (!tiles?.length) return;
    let blocks = 0;
    for (const t of tiles) blocks += Math.abs(t.to - t.from);
    if (!blocks) return;
    const columns = blocks > MAX_BLOCKS;
    const n = columns ? tiles.length : blocks;
    const down = tiles.some((t) => t.to < t.from);
    const mesh = new InstancedMesh(this.box, down ? this.lower : this.raise, n);
    const m = new Matrix4();
    let k = 0;
    // (raised blocks a hair inside their tile, so the ground's top shows under them; blocks going a
    // hair outside the ground's own)
    const s = down ? 1.03 : 0.98;
    for (const t of tiles) {
      const x = (t.i % W) + 0.5;
      const z = -(Math.floor(t.i / W) + 0.5);
      const lo = Math.min(t.from, t.to);
      const hi = Math.max(t.from, t.to);
      if (hi === lo) continue;
      if (columns) {
        m.makeScale(s, hi - lo, s).setPosition(x, (lo + hi) / 2, z);
        mesh.setMatrixAt(k++, m);
        continue;
      }
      for (let l = lo; l < hi; l++) {
        m.makeScale(s, s, s).setPosition(x, l + 0.5, z);
        mesh.setMatrixAt(k++, m);
      }
    }
    mesh.count = k;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.frustumCulled = false;
    mesh.renderOrder = 9;
    mesh.name = "brush.blocks";
    this.scene.add(mesh);
    this.mesh = mesh;
  }

  clear(): void {
    if (!this.mesh) return;
    this.scene.remove(this.mesh);
    this.mesh.dispose();
    this.mesh = null;
  }

  dispose(): void {
    this.clear();
    this.box.dispose();
    this.raise.dispose();
    this.lower.dispose();
  }
}

/** A block: its tile (x, y) and layer (0 at the bottom), as the `blocks` operation names it. */
export type Cell = readonly [number, number, number];

/** The Block tool's preview: the lists `blockFalls` returns, less the reasons. */
export interface BlockPreview {
  added: readonly Cell[];
  removed: readonly Cell[];
  falls: readonly Cell[];
}

export type CellKind = "added" | "removed" | "falls";

/** How big each kind's blocks are drawn: added a hair inside their cell, so the ground shows under them;
 *  removed a hair outside the ground's own faces, so they read as going; falls a little more, so a block
 *  in both lists still shows both. Their colours (D335): falls solid red, the problem; while any fall, the
 *  action is refused and added and removed are drawn muted grey, as they will not happen; otherwise added
 *  translucent white and removed red, as the area brush's ghost. */
const CELL_SCALE: Record<CellKind, number> = { added: 0.98, removed: 1.03, falls: 1.05 };
const CELL_MATERIAL: Record<CellKind, GhostKind> = { added: "raise", removed: "lower", falls: "fall" };
const KINDS: readonly CellKind[] = ["added", "removed", "falls"];

/** Cells as x, y, layer in turn. */
export function packCells(cells: readonly Cell[]): Int32Array {
  const out = new Int32Array(Math.min(cells.length, MAX_BLOCKS) * 3);
  for (let i = 0; i < out.length / 3; i++) out.set(cells[i], i * 3);
  return out;
}

/** Write the instance matrices of packed cells below the layer cut (column-major, 16 numbers each: the scale on the
 *  diagonal, the cell's centre in world space, X = x + ½, Y = layer + ½, Z = −y − ½) into `out`, as many as it has
 *  room for; returns how many. A cell at or above `cut` is hidden by the cut, so it is left out. */
export function writeCellMatrices(cells: ArrayLike<number>, scale: number, cut: number | null, out: Float32Array): number {
  const room = Math.floor(out.length / 16);
  let k = 0;
  for (let i = 0; i + 2 < cells.length && k < room; i += 3) {
    if (cut !== null && cells[i + 2] >= cut) continue;
    const o = k++ * 16;
    out.fill(0, o, o + 16);
    out[o] = out[o + 5] = out[o + 10] = scale;
    out[o + 12] = cells[i] + 0.5;
    out[o + 13] = cells[i + 2] + 0.5;
    out[o + 14] = -(cells[i + 1] + 0.5);
    out[o + 15] = 1;
  }
  return k;
}

interface KindMesh {
  mesh: InstancedMesh | null;
  /** The cells last given, packed, and the cut they were drawn under. */
  cells: Int32Array;
  cut: number | null;
}

/** The Block tool's preview: one instanced mesh per kind, kept between previews (grown when a preview needs more
 *  room) and rewritten only when that kind's cells or the layer cut change. */
export class BlockCells {
  private readonly box = new BoxGeometry(1, 1, 1);
  private readonly materials = {} as Record<CellKind, ShaderMaterial>;
  private readonly kinds = {} as Record<CellKind, KindMesh>;
  private readonly muted = ghostMaterial("muted");
  private cut: number | null = null;
  /** Blocks would fall: the action is refused, so what it would add and remove is drawn muted. */
  private refused = false;

  constructor(private readonly scene: Scene) {
    for (const k of KINDS) {
      this.materials[k] = ghostMaterial(CELL_MATERIAL[k]);
      this.kinds[k] = { mesh: null, cells: new Int32Array(0), cut: null };
    }
  }

  /** Show a preview (null puts it away) under a layer cut (null: none). Returns whether anything was rewritten. */
  set(p: BlockPreview | null, cut: number | null): boolean {
    this.cut = cut;
    const refused = !!p && p.falls.length > 0;
    let changed = refused !== this.refused;
    this.refused = refused;
    for (const k of KINDS) {
      changed = this.build(k, p ? p[k] : [], cut) || changed;
      this.restyle(k);
    }
    return changed;
  }

  /** The material a kind is drawn with now. */
  private restyle(kind: CellKind): void {
    const mesh = this.kinds[kind].mesh;
    if (mesh) mesh.material = this.refused && kind !== "falls" ? this.muted : this.materials[kind];
  }

  /** Whether the preview is drawn as refused (tests). */
  get isRefused(): boolean {
    return this.refused;
  }

  /** The layer cut moved: the preview as last given, under the new cut. */
  setCut(cut: number | null): boolean {
    if (cut === this.cut) return false;
    this.cut = cut;
    let changed = false;
    for (const k of KINDS) changed = this.build(k, null, cut) || changed;
    return changed;
  }

  /** The blocks drawn of each kind. */
  get drawn(): Record<CellKind, number> {
    const n = (k: CellKind) => (this.kinds[k].mesh?.visible ? this.kinds[k].mesh.count : 0);
    return { added: n("added"), removed: n("removed"), falls: n("falls") };
  }

  /** Rewrite one kind from `cells` (null: the cells it has), unless they and the cut are what it has. */
  private build(kind: CellKind, cells: readonly Cell[] | null, cut: number | null): boolean {
    const st = this.kinds[kind];
    if (cells) {
      const n = Math.min(cells.length, MAX_BLOCKS);
      let same = st.cut === cut && st.cells.length === n * 3;
      for (let i = 0; same && i < n; i++) same = st.cells[i * 3] === cells[i][0] && st.cells[i * 3 + 1] === cells[i][1] && st.cells[i * 3 + 2] === cells[i][2];
      if (same) return false;
      st.cells = packCells(cells);
    } else if (st.cut === cut) return false;
    const n = st.cells.length / 3;
    if (!st.mesh && !n) {
      st.cut = cut;
      return false;
    }
    if (!st.mesh || st.mesh.instanceMatrix.count < n) {
      if (st.mesh) {
        this.scene.remove(st.mesh);
        st.mesh.dispose();
      }
      const room = Math.min(MAX_BLOCKS, Math.max(64, 2 ** Math.ceil(Math.log2(Math.max(1, n)))));
      const mesh = new InstancedMesh(this.box, this.materials[kind], room);
      mesh.frustumCulled = false;
      mesh.renderOrder = 9;
      mesh.name = `blocks.${kind}`;
      this.scene.add(mesh);
      st.mesh = mesh;
    }
    st.mesh.count = writeCellMatrices(st.cells, CELL_SCALE[kind], cut, st.mesh.instanceMatrix.array as Float32Array);
    st.mesh.instanceMatrix.needsUpdate = true;
    st.mesh.visible = st.mesh.count > 0;
    st.cut = cut;
    return true;
  }

  dispose(): void {
    for (const k of KINDS) {
      const m = this.kinds[k].mesh;
      if (m) {
        this.scene.remove(m);
        m.dispose();
      }
      this.materials[k].dispose();
    }
    this.muted.dispose();
    this.box.dispose();
  }
}
