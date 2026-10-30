// The drought line on the map (the Weather view, D133, D269; an editing aid, drawn in its own channel, never a change
// of the land's look): the faint waterline of the drought's last day along
// every lake and river, and a faint dry tint where one dries out completely (geometry in droughtLineGeometry.ts).
// Two meshes made once per line, so drawing them costs the frame nothing, shared by both looks:
// - the tint is drawn before the water (which does not write depth), so today's water veils it the way it veils the
//   ground, and the land hides it as it hides anything;
// - the line is drawn after the water, so it shows through today's water where that stands higher (fainter there,
//   `UNDER_WATER`: never bright lines across a lake), and the land
//   hides it where it is behind a bank. Its vertex shader widens it about its middle line to at least `LINE_MIN_PX`
//   on screen (up close it is its own width), so it never shimmers as dots when the camera pulls out.
// Only drawn.

import { BufferAttribute, BufferGeometry, DoubleSide, Mesh, ShaderMaterial, Vector2, Vector3, type Scene } from "three";
import type { DroughtLine } from "../core/sim/droughtLine";
import { droughtLineGeometry, LINE_MIN_PX, TINT_ALPHA, TINT_COLOR, type QuadBuffers } from "./droughtLineGeometry";

const lineMaterial = (): ShaderMaterial =>
  new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    uniforms: { viewH: { value: 1 }, minPx: { value: LINE_MIN_PX } },
    vertexShader: /* glsl */ `
      uniform float viewH;
      uniform float minPx;
      attribute vec3 center;
      attribute float width;
      attribute vec4 lineColor;
      varying vec4 vColor;
      void main() {
        // a pixel's size in the world at the strip (perspective or orthographic), and the widening that makes the strip
        // at least minPx wide about its middle line
        vec4 clip = projectionMatrix * modelViewMatrix * vec4(center, 1.0);
        float pixel = 2.0 * clip.w / (projectionMatrix[1][1] * viewH);
        float s = max(1.0, minPx * pixel / width);
        vColor = lineColor;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(center + (position - center) * s, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      varying vec4 vColor;
      void main() { gl_FragColor = vColor; }`,
  });

/** The tint: its colour with the opacity the look gives it (`setHigh`): High's near-opaque water hides it, so it is
 *  stronger there. The vertices carry 1 on the start's water, else 0, in the alpha. */
const tintMaterial = (): ShaderMaterial =>
  new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    uniforms: { rgb: { value: new Vector3(...TINT_COLOR) }, alpha: { value: new Vector2(TINT_ALPHA.standard.other, TINT_ALPHA.standard.start) } },
    vertexShader: /* glsl */ `
      attribute vec4 lineColor;
      uniform vec2 alpha;
      varying float vA;
      void main() {
        vA = mix(alpha.x, alpha.y, lineColor.a);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 rgb;
      varying float vA;
      void main() { gl_FragColor = vec4(rgb, vA); }`,
  });

/** The line's and the tint's materials (meshes without a normal): the renderer compiles a copy of them ahead of the
 *  first line drawn (programs.ts). */
export function droughtLineMaterials(): ShaderMaterial[] {
  return [lineMaterial(), tintMaterial()];
}

function geometry(b: QuadBuffers, extra?: { centers: Float32Array; widths: Float32Array }): BufferGeometry {
  const geo = new BufferGeometry();
  geo.setAttribute("position", new BufferAttribute(b.positions, 3));
  geo.setAttribute("lineColor", new BufferAttribute(b.colors, 4));
  if (extra) {
    geo.setAttribute("center", new BufferAttribute(extra.centers, 3));
    geo.setAttribute("width", new BufferAttribute(extra.widths, 1));
  }
  geo.setIndex(new BufferAttribute(b.indices, 1));
  return geo;
}

export class DroughtLineLayer {
  private line: Mesh | null = null;
  private tint: Mesh | null = null;
  private readonly lineMat = lineMaterial();
  private readonly tintMat = tintMaterial();
  private hidden = false;
  /** The line drawn now, and the one a terrain change put away (its ground is gone: it is never drawn again). */
  private current: DroughtLine | null = null;
  private retired: DroughtLine | null = null;
  private readonly size = new Vector2();

  constructor(private readonly scene: Scene) {
    // (the line's width in pixels is the drawing buffer's height)
    this.lineMat.onBeforeRender = (renderer) => {
      renderer.getDrawingBufferSize(this.size);
      this.lineMat.uniforms.viewH.value = Math.max(1, this.size.y);
    };
  }

  /** Draw `line` on ground `heights` (null, a refused line or one with nothing on it: nothing). The line already
   *  drawn, or one put away by a terrain change, is left as it is. */
  set(line: DroughtLine | null, heights: ArrayLike<number>): void {
    if (line && (line === this.current || line === this.retired)) return;
    this.clear();
    this.retired = null;
    if (!line || line.refused || (!line.line.count && !line.bed.count)) return;
    const g = droughtLineGeometry(line, heights);
    this.current = line;
    if (g.tint.quads) {
      const mesh = new Mesh(geometry(g.tint), this.tintMat);
      this.add(mesh, 1, "droughtTint");
      this.tint = mesh;
    }
    if (g.line.quads) {
      const mesh = new Mesh(geometry(g.line, g.line), this.lineMat);
      this.add(mesh, 4, "droughtLine");
      this.line = mesh;
    }
  }

  private add(mesh: Mesh, order: number, name: string): void {
    mesh.frustumCulled = false;
    mesh.matrixAutoUpdate = false;
    mesh.renderOrder = order;
    mesh.name = name;
    mesh.visible = !this.hidden;
    this.scene.add(mesh);
  }

  /** Whether a line is on the map. */
  get showing(): boolean {
    return !!this.line || !!this.tint;
  }

  /** The quads drawn now, of the line and of the tint (tests): none while it is hidden. */
  get drawn(): { line: number; tint: number } {
    const n = (m: Mesh | null) => (m && m.visible && m.parent ? (m.geometry.index?.count ?? 0) / 6 : 0);
    return { line: n(this.line), tint: n(this.tint) };
  }

  /** The tint's strength for the look (High's water hides more of it): a uniform, so no rebuild. */
  setHigh(high: boolean): void {
    const a = high ? TINT_ALPHA.high : TINT_ALPHA.standard;
    (this.tintMat.uniforms.alpha.value as Vector2).set(a.other, a.start);
  }

  /** Put it away without dropping it (the cut-away layers show the world cut, which the line is not drawn for). */
  setHidden(hidden: boolean): void {
    this.hidden = hidden;
    if (this.line) this.line.visible = !hidden;
    if (this.tint) this.tint.visible = !hidden;
  }

  /** Put it away for good: the land under it changed, so this line is not the map's any more. */
  retire(): void {
    if (this.current) this.retired = this.current;
    this.clear();
  }

  clear(): void {
    for (const m of [this.line, this.tint]) {
      if (!m) continue;
      this.scene.remove(m);
      m.geometry.dispose();
    }
    this.line = this.tint = null;
    this.current = null;
  }

  dispose(): void {
    this.clear();
    this.lineMat.dispose();
    this.tintMat.dispose();
  }
}
