// The blocks an area stroke will add or take away, while it is dragged (the area brush, Timberborn's own
// editor's Terrain; Kyler, 2026-10-03): as in the game, a translucent block on every tile for each block
// Raise will add, stacked on the ground; for Lower, each block it will take away, red, drawn just outside
// the ground's own so they read as going. The land itself changes only when the stroke is let go. Each
// block shows its edges, so they read as blocks. Only drawn.

import { BoxGeometry, InstancedMesh, Matrix4, ShaderMaterial, type Scene } from "three";

/** A tile's change: its index, and its level before and after. */
export interface GhostTile {
  i: number;
  from: number;
  to: number;
}

/** More blocks than this are drawn as one column a tile (the same shape, without the seams). */
const MAX_BLOCKS = 65536;

function ghostMaterial(lower: boolean): ShaderMaterial {
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
        ${lower ? "vec3 fill = vec3(0.92, 0.26, 0.2); vec3 line = vec3(1.0, 0.42, 0.34); float a = 0.36;" : "vec3 fill = vec3(0.93, 0.96, 1.0); vec3 line = vec3(1.0); float a = 0.3;"}
        gl_FragColor = vec4(mix(fill, line, edge), mix(a, 0.9, edge));
      }`,
  });
}

export class BlockGhost {
  private mesh: InstancedMesh | null = null;
  private readonly box = new BoxGeometry(1, 1, 1);
  private readonly raise = ghostMaterial(false);
  private readonly lower = ghostMaterial(true);

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
