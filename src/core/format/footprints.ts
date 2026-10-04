// Block footprints of every map template (investigation/notes/footprints.json, exported by
// tools/export-footprints.ts). A block's world cell is Coordinates + R(F(local)) (FORMAT.md §4.4).

import data from "../data/footprints.json" with { type: "json" };

export type Orientation = "Cw0" | "Cw90" | "Cw180" | "Cw270";
export const ORIENTATIONS: readonly Orientation[] = ["Cw0", "Cw90", "Cw180", "Cw270"];
export type MatterBelow = "ground" | "groundOrStackable" | "any" | "air" | "stackable";

export interface Footprint {
  size: [number, number, number];
  flippable: boolean;
  overridable: boolean;
  blocks: [number, number, number, MatterBelow, number, number, number][];
  entrance?: [number, number, number];
}

export const FOOTPRINTS = data as unknown as Record<string, Footprint>;

export const OCC = { Floor: 1, Bottom: 2, Top: 4, Corners: 8, Path: 16, Middle: 32, All: 63 } as const;

export function rotate(o: Orientation, x: number, y: number): [number, number] {
  switch (o) {
    case "Cw0": return [x, y];
    case "Cw90": return [y, -x];
    case "Cw180": return [-x, -y];
    case "Cw270": return [-y, x];
  }
}

export interface Placement {
  template: string;
  x: number;
  y: number;
  z: number;
  orientation: Orientation;
  flipped: boolean;
}

export interface WorldBlock {
  x: number;
  y: number;
  z: number;
  below: MatterBelow;
  flags: number;
  stackable: boolean;
  occupyAllBelow: boolean;
  localZ: number;
}

/** Occupied cells of a placed object (blocks with no occupation flags are skipped). */
export function worldBlocks(fp: Footprint, p: Placement): WorldBlock[] {
  const out: WorldBlock[] = [];
  const sx = fp.size[0];
  for (const [lx0, ly, lz, below, flags, stack, oab] of fp.blocks) {
    if (flags === 0) continue;
    const lx = p.flipped && fp.flippable ? sx - 1 - lx0 : lx0;
    const [dx, dy] = rotate(p.orientation, lx, ly);
    out.push({ x: p.x + dx, y: p.y + dy, z: p.z + lz, below, flags, stackable: !!stack, occupyAllBelow: !!oab, localZ: lz });
  }
  return out;
}

/** The 2-D tiles an object covers (every block with flags, projected). */
export function footprintTiles(template: string, p: Placement): [number, number][] {
  const fp = FOOTPRINTS[template];
  const seen = new Set<string>();
  const out: [number, number][] = [];
  for (const b of worldBlocks(fp, p)) {
    const k = `${b.x},${b.y}`;
    if (!seen.has(k)) {
      seen.add(k);
      out.push([b.x, b.y]);
    }
  }
  return out;
}

/** Coordinates for an Sx × Sy footprint whose rotated minimum corner is (mx, my)
 *  (notes/blocks_and_placement.md, rotated bounding box table). */
export function coordinatesForMinCorner(sx: number, sy: number, mx: number, my: number, o: Orientation): [number, number] {
  switch (o) {
    case "Cw0": return [mx, my];
    case "Cw90": return [mx, my + sx - 1];
    case "Cw180": return [mx + sx - 1, my + sy - 1];
    case "Cw270": return [mx + sy - 1, my];
  }
}

/** The middle tile of a StartingLocation (the district center's 3×3): its blocks at its own level,
 *  averaged and rounded. For a start at (x, y) that is (x+1, y+1) at Cw0, (x+1, y−1) at Cw90,
 *  (x−1, y−1) at Cw180 and (x−1, y+1) at Cw270. */
export function startMiddleTile(p: { x: number; y: number; z?: number; orientation: Orientation; flipped?: boolean }): [number, number] {
  const cells = worldBlocks(FOOTPRINTS.StartingLocation, { template: "StartingLocation", x: p.x, y: p.y, z: p.z ?? 0, orientation: p.orientation, flipped: !!p.flipped }).filter((b) => b.localZ === 0);
  let sumX = 0;
  let sumY = 0;
  for (const b of cells) {
    sumX += b.x;
    sumY += b.y;
  }
  return [Math.round(sumX / cells.length), Math.round(sumY / cells.length)];
}

/** The tile in front of a StartingLocation / district center door: local (1, −1), rotated. */
export function startEntranceTile(x: number, y: number, o: Orientation): [number, number] {
  const [dx, dy] = rotate(o, 1, -1);
  return [x + dx, y + dy];
}

/** High side of a Slope: Cw0 south (y−1), Cw90 west, Cw180 north, Cw270 east. */
export function slopeHighSide(o: Orientation): [number, number] {
  return rotate(o, 0, -1);
}
