// The hollow under the pointer (D488: overhangs and caves read while editing; D487: the brushes shape a roof's top
// run). While an editing tool's cursor (a brush, a force's ring, the shelf's, the Block tool's blocks, Select's ring)
// is over ground with air under its top run, the air's footprint is drawn on the roof's top inside the cursor's
// reach, in the Caves layer's violet: a faint fill toned by how thick the roof is (the thinner, the stronger: a roof
// one block thick is about to be dug through), and a thin outline where the hollow ends. So a map maker painting on
// a plateau sees they are over a cave, how big it is, and how much roof is left.
//
// `hollowFootprint` is the plain question (which tiles in reach have air under their top run, and how thick the roof
// is); `HollowMarks` draws its answer, a few hundred quads in buffers that grow once. A map without terrain above
// terrain never asks it (the renderer checks its columns first) and never makes the marks.

import { BufferAttribute, BufferGeometry, Mesh, MeshBasicMaterial, type Scene } from "three";
import { plainMask, surfaceOfMask, topRunFloor } from "../core/terrain/runs";
import { WATER_UI } from "./palette";

/** Where a cursor reaches: its middle and radius in tiles (a square brush reaches its square). `aim`, when given, is the
 *  level the cursor works at (Select's ring on the run it aims at, the Block tool's blocks): a roof counts only where
 *  that level is in or on it, so a cursor inside a cave does not mark the roof over it. */
export interface HollowReach {
  x: number;
  y: number;
  radius: number;
  square?: boolean;
  aim?: number | null;
}

/** A tile with air under its top run: its top, the roof's underside (the top run's lowest layer) and the floor under
 *  the air (the top of the next run down, 0 for the map's floor). The roof is `top − underside` blocks thick, the air
 *  `underside − floor` high. */
export interface HollowTile {
  x: number;
  y: number;
  top: number;
  underside: number;
  floor: number;
}

/** The roof over a column, or null when the column has no air right under its top run (a plain column; air only between
 *  lower runs does not count, since the top run is what a brush shapes and what the pointer is over). */
export function roofOf(mask: number): { top: number; underside: number; floor: number } | null {
  if (mask === 0) return null;
  const underside = topRunFloor(mask);
  if (underside === 0) return null;
  return { top: surfaceOfMask(mask), underside, floor: surfaceOfMask(mask & plainMask(underside)) };
}

/** The tiles within `reach` (a tile counts when its middle does, as the brush's disc) whose column has air under its
 *  top run, in reading order. `listed(i)`: the tile's column is not plain (a quick test that skips plain tiles);
 *  `maskAt(i)`: its mask as drawn (under a layer cut, the voxels the cut leaves). */
export function hollowFootprint(W: number, H: number, listed: (i: number) => boolean, maskAt: (i: number) => number, reach: HollowReach): HollowTile[] {
  const out: HollowTile[] = [];
  const r = Math.max(0.5, reach.radius);
  const R2 = r * r;
  const x0 = Math.max(0, Math.floor(reach.x - r));
  const x1 = Math.min(W - 1, Math.floor(reach.x + r));
  const y0 = Math.max(0, Math.floor(reach.y - r));
  const y1 = Math.min(H - 1, Math.floor(reach.y + r));
  const aim = reach.aim ?? null;
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const dx = x + 0.5 - reach.x;
      const dy = y + 0.5 - reach.y;
      if ((reach.square ? Math.max(dx * dx, dy * dy) : dx * dx + dy * dy) >= R2) continue;
      const i = y * W + x;
      if (!listed(i)) continue;
      const m = maskAt(i);
      // (roofOf without its object: this runs on every pointer move over a cave map)
      const underside = m === 0 ? 0 : topRunFloor(m);
      if (underside === 0 || (aim !== null && aim < underside)) continue;
      out.push({ x, y, top: 32 - Math.clz32(m), underside, floor: surfaceOfMask(m & plainMask(underside)) });
    }
  return out;
}

/** The Block tool's reach: the square round the blocks a click would add or take away, a tile wider each way, aimed at
 *  their lowest layer (so blocks added on a cave's floor do not mark the roof over them); null for none. */
export function blockReach(cells: readonly (readonly [number, number, number])[]): HollowReach | null {
  if (!cells.length) return null;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  let aim = Infinity;
  for (const [x, y, z] of cells) {
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    x1 = Math.max(x1, x + 1);
    y1 = Math.max(y1, y + 1);
    aim = Math.min(aim, z);
  }
  return { x: (x0 + x1) / 2, y: (y0 + y1) / 2, radius: Math.max(x1 - x0, y1 - y0) / 2 + 1, square: true, aim };
}

/** How strongly a roof's footprint is filled, by its thickness in blocks: a roof one block thick the most (a stroke
 *  can take it no lower, D487), each block more a clear step fainter, to a quiet wash at five blocks and more. */
export function roofTone(thickness: number): number {
  return [0.5, 0.5, 0.37, 0.27, 0.19][Math.max(0, Math.min(5, thickness))] ?? 0.13;
}

/** The Caves layer's violet (`LAYER_COLORS.roofed`, 170 90 220), the fill's and the outline's colour. */
const VIOLET: readonly [number, number, number] = [170 / 255, 90 / 255, 220 / 255];
/** The outline: the violet lifted toward white so it holds on dark ground, with the brush ring's dark edge under it. */
const LINE: readonly [number, number, number] = [0.88, 0.76, 1.0];

const SIDES: readonly (readonly [number, number])[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

export class HollowMarks {
  readonly mesh: Mesh;
  private pos = new Float32Array(256 * 12);
  private col = new Float32Array(256 * 16);
  private readonly geo = new BufferGeometry();
  /** What was drawn last (tests): the tiles filled and the outline's pieces. */
  drawn = { tiles: 0, edges: 0 };

  constructor(scene: Scene) {
    this.bind(256);
    const mat = new MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    this.mesh = new Mesh(this.geo, mat);
    this.mesh.frustumCulled = false;
    // (over the brush's disc, so the violet reads the same under every brush's tint; under a target's plane)
    this.mesh.renderOrder = 5.5;
    this.mesh.visible = false;
    scene.add(this.mesh);
  }

  private bind(quads: number): void {
    if (this.pos.length < quads * 12) {
      // (the old buffers' GPU copies go with them)
      this.geo.dispose();
      this.pos = new Float32Array(quads * 12);
      this.col = new Float32Array(quads * 16);
    }
    const n = this.pos.length / 12;
    const idx = new Uint32Array(n * 6);
    for (let q = 0; q < n; q++) {
      const v = q * 4;
      idx[q * 6] = v;
      idx[q * 6 + 1] = v + 1;
      idx[q * 6 + 2] = v + 2;
      idx[q * 6 + 3] = v;
      idx[q * 6 + 4] = v + 2;
      idx[q * 6 + 5] = v + 3;
    }
    this.geo.setAttribute("position", new BufferAttribute(this.pos, 3));
    this.geo.setAttribute("color", new BufferAttribute(this.col, 4));
    this.geo.setIndex(new BufferAttribute(idx, 1));
  }

  /** Draw `tiles` (from `hollowFootprint` for `reach`), each outlined where its neighbour has no air under its top run
   *  (`hollowAt(x, y)`); null or none hides the marks. */
  set(tiles: readonly HollowTile[] | null, reach: HollowReach | null, hollowAt: (x: number, y: number) => boolean): void {
    if (!tiles?.length || !reach) {
      this.mesh.visible = false;
      this.drawn = { tiles: 0, edges: 0 };
      return;
    }
    // a fill and at most four outline pieces (each with its dark edge) a tile
    const need = tiles.length * 9;
    if (this.pos.length < need * 12) this.bind(Math.max(need, (this.pos.length / 12) * 2));
    const pos = this.pos;
    const col = this.col;
    let q = 0;
    const quad = (x0: number, y0: number, x1: number, y1: number, h: number, c: readonly number[], a: number) => {
      const p = q * 12;
      pos[p] = x0;
      pos[p + 1] = h;
      pos[p + 2] = -y0;
      pos[p + 3] = x1;
      pos[p + 4] = h;
      pos[p + 5] = -y0;
      pos[p + 6] = x1;
      pos[p + 7] = h;
      pos[p + 8] = -y1;
      pos[p + 9] = x0;
      pos[p + 10] = h;
      pos[p + 11] = -y1;
      for (let o = q * 16, end = o + 16; o < end; o += 4) {
        col[o] = c[0];
        col[o + 1] = c[1];
        col[o + 2] = c[2];
        col[o + 3] = a;
      }
      q++;
    };
    const r = Math.max(0.5, reach.radius);
    const edge = WATER_UI.ringEdge;
    // the fill, a little fainter toward the cursor's edge so it sits inside the ring
    for (const t of tiles) {
      const d = Math.min(1, Math.hypot(t.x + 0.5 - reach.x, t.y + 0.5 - reach.y) / r);
      quad(t.x, t.y, t.x + 1, t.y + 1, t.top + 0.035, VIOLET, roofTone(t.top - t.underside) * (1 - 0.35 * d * d));
    }
    const fills = q;
    // the outline where the hollow ends: on the roof's own top, just inside its edge, over a dark edge
    const w = 0.07;
    const e = w + 0.035;
    let edges = 0;
    // (a neighbour in the footprint is hollow: only the footprint's own border asks `hollowAt`)
    let bx0 = Infinity;
    let by0 = Infinity;
    let bx1 = -Infinity;
    let by1 = -Infinity;
    for (const t of tiles) (bx0 = Math.min(bx0, t.x)), (by0 = Math.min(by0, t.y)), (bx1 = Math.max(bx1, t.x)), (by1 = Math.max(by1, t.y));
    const bw = bx1 - bx0 + 1;
    const inside = new Uint8Array(bw * (by1 - by0 + 1));
    for (const t of tiles) inside[(t.y - by0) * bw + t.x - bx0] = 1;
    const hollow = (x: number, y: number) => (x >= bx0 && x <= bx1 && y >= by0 && y <= by1 && inside[(y - by0) * bw + x - bx0] === 1) || hollowAt(x, y);
    for (const pass of [0, 1])
      for (const t of tiles)
        for (const [dx, dy] of SIDES) {
          if (hollow(t.x + dx, t.y + dy)) continue;
          const h = t.top + (pass ? 0.045 : 0.04);
          const c = pass ? LINE : edge;
          const a = pass ? 0.9 : 0.55;
          const g = pass ? w : e;
          // (along the side, from corner to corner, its width inward from the edge)
          if (dx === 1) quad(t.x + 1 - g, t.y, t.x + 1, t.y + 1, h, c, a);
          else if (dx === -1) quad(t.x, t.y, t.x + g, t.y + 1, h, c, a);
          else if (dy === 1) quad(t.x, t.y + 1 - g, t.x + 1, t.y + 1, h, c, a);
          else quad(t.x, t.y, t.x + 1, t.y + g, h, c, a);
          if (pass) edges++;
        }
    this.geo.setDrawRange(0, q * 6);
    for (const [name, per] of [["position", 12], ["color", 16]] as const) {
      const attr = this.geo.getAttribute(name) as BufferAttribute;
      attr.clearUpdateRanges();
      attr.addUpdateRange(0, Math.max(1, q) * per);
      attr.needsUpdate = true;
    }
    this.mesh.visible = q > 0;
    this.drawn = { tiles: fills, edges };
  }

  dispose(): void {
    this.geo.dispose();
    (this.mesh.material as MeshBasicMaterial).dispose();
  }
}
