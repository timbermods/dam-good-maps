// The drought line on the map (the Weather view, D133, D269): the faint waterline of the drought's last day along
// every lake and river, and a faint dry tint where one dries out completely (geometry in droughtLineGeometry.ts).
// One mesh made once per line, so drawing it costs the frame nothing; it is drawn after the water (which does not
// write depth), so it shows through today's water where that stands higher, and the land hides it where it is
// behind a bank. The same mesh serves both looks. Only drawn.

import { BufferAttribute, BufferGeometry, DoubleSide, Mesh, MeshBasicMaterial, type Scene } from "three";
import type { DroughtLine } from "../core/sim/droughtLine";
import { droughtLineGeometry } from "./droughtLineGeometry";

export class DroughtLineLayer {
  private mesh: Mesh | null = null;
  private readonly material = new MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  private hidden = false;

  constructor(private readonly scene: Scene) {}

  /** Draw `line` on ground `heights` (null, a refused line or one with nothing on it: nothing). */
  set(line: DroughtLine | null, heights: ArrayLike<number>): void {
    this.clear();
    if (!line || line.refused || (!line.line.count && !line.bed.count)) return;
    const g = droughtLineGeometry(line, heights);
    if (!g.indices.length) return;
    const geo = new BufferGeometry();
    geo.setAttribute("position", new BufferAttribute(g.positions, 3));
    geo.setAttribute("color", new BufferAttribute(g.colors, 4));
    geo.setIndex(new BufferAttribute(g.indices, 1));
    geo.computeBoundingSphere();
    const mesh = new Mesh(geo, this.material);
    mesh.frustumCulled = false;
    mesh.matrixAutoUpdate = false;
    mesh.renderOrder = 4;
    mesh.name = "droughtLine";
    mesh.visible = !this.hidden;
    this.scene.add(mesh);
    this.mesh = mesh;
  }

  /** Whether a line is on the map. */
  get showing(): boolean {
    return !!this.mesh;
  }

  /** Put it away without dropping it (the cut-away layers show the world cut, which the line is not drawn for). */
  setHidden(hidden: boolean): void {
    this.hidden = hidden;
    if (this.mesh) this.mesh.visible = !hidden;
  }

  clear(): void {
    if (!this.mesh) return;
    this.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.mesh = null;
  }

  dispose(): void {
    this.clear();
    this.material.dispose();
  }
}
