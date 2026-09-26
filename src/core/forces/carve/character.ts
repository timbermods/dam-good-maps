// A carve's character (D199): its width, its swings (Wander) and the pools, rapids and falls along
// it, from its personality seed; and the map's own hard rock cores, which a wide river splits
// round and rejoins. Everything here reads distances along the course, never time, and the rock
// comes from the map alone, so trying another path never moves the geology.
//
// Ported from investigation/carve/character.ts (PR #47), kept to its structure so a later round of
// the prototype ports across as a diff.

import type { ForceMap, Lane } from "../force";
import type { CarveSettings } from "./run";

export interface Knob {
  x: number;
  y: number;
  radius: number;
}

/** The width a river of this Power takes when Width follows Power. */
export const naturalWidth = (power: number) => 2.8 + power * 0.1;

/** Stateless integer mixer; sampling order, frame rate and wall time are irrelevant. */
export function mixSeed(n: number): number {
  n = Math.imul(n ^ (n >>> 16), 0x21f0aaad);
  n = Math.imul(n ^ (n >>> 15), 0x735a2d97);
  return (n ^ (n >>> 15)) >>> 0;
}

export class RiverCharacter {
  readonly seed: number;
  readonly radius: number;
  readonly intensity: number;
  readonly wander: number;
  readonly knobs: Knob[] = [];
  readonly rock: Uint8Array;
  private phase: number;
  private phase2: number;

  constructor(m: ForceMap, s: CarveSettings, geology: number, origin: number, end?: number) {
    this.seed = mixSeed(geology ^ Math.imul(s.seed ?? 0, 0x9e3779b9) ^ origin ^ Math.imul(end ?? 0, 97));
    this.phase = (this.seed / 4294967296) * Math.PI * 2;
    this.phase2 = (mixSeed(this.seed) / 4294967296) * Math.PI * 2;
    const width = s.width ?? naturalWidth(s.power);
    this.radius = width / 2;
    this.wander = (s.wander ?? 35) / 100;
    // The same volume concentrated into a slot cuts deeper; a broad override spreads its work. Auto
    // width retains the existing power relationship.
    this.intensity = Math.sqrt(naturalWidth(s.power) / width);
    this.rock = new Uint8Array(m.W * m.H);
    if (!s.layers || width < 5) return;
    // Map-fixed resistant outcrops, not reroll-dependent random rubble. A 2+ tile core remains above
    // two channels; the optional layer stack supplies hardness.
    for (let gy = 12; gy < m.H - 8; gy += 24)
      for (let gx = 12; gx < m.W - 8; gx += 24) {
        const h = mixSeed(geology ^ Math.imul(gx, 73856093) ^ Math.imul(gy, 19349663));
        if (h % 100 > 48) continue;
        const x = gx + ((h >>> 8) % 9) - 4;
        const y = gy + ((h >>> 16) % 9) - 4;
        const radius = 1.6 + ((h >>> 24) % 6) * 0.2;
        const i = y * m.W + x;
        const level = m.heights[i];
        const hard = s.layers ? (m.rockLayers?.[level] ?? ((level + (geology % 4)) % 4 === 0 ? 1 : 0)) : 0;
        // Broad competent rock masses may retain a core even between hard lips.
        if ((!hard && h % 3 !== 0) || level < 3 || m.water.depth[i] > 0.1) continue;
        if (Math.hypot(x - (origin % m.W), y - Math.floor(origin / m.W)) < this.radius * 2 + radius + 7) continue;
        if (end !== undefined && Math.hypot(x - (end % m.W), y - Math.floor(end / m.W)) < this.radius + radius + 5) continue;
        this.knobs.push({ x, y, radius });
        for (let yy = Math.ceil(y - radius); yy <= Math.floor(y + radius); yy++)
          for (let xx = Math.ceil(x - radius); xx <= Math.floor(x + radius); xx++)
            if (xx >= 0 && yy >= 0 && xx < m.W && yy < m.H && Math.hypot(xx - x, yy - y) <= radius) this.rock[yy * m.W + xx] = 1;
      }
  }

  width(distance: number): number {
    // Smooth reaches at two scales, plus a short constriction preceding rapids.
    const reach = 0.99 + 0.24 * Math.sin(distance * 0.105 + this.phase) + 0.13 * Math.sin(distance * 0.037 + this.phase2);
    const throat = 1 - 0.17 * Math.pow(Math.max(0, Math.sin(distance * 0.19 + this.phase2)), 6);
    return Math.max(1.05, this.radius * reach * throat);
  }

  swing(progress: number, available = Infinity): number {
    // Width and wavelength are distances. All Wander values share the same navigation turn limit;
    // none integrates another turn into its guide.
    const amplitude = Math.min(0.7 + this.wander * (8 + this.radius * 5), available * 0.3);
    const wavelength = 95 * (1 - this.wander) + this.wander * (25 + this.radius * 3);
    const k = (2 * Math.PI) / wavelength;
    const phase = k * progress + this.phase;
    return Math.atan(amplitude * k * (Math.cos(phase) + 0.12 * Math.cos(phase * 0.5 + this.phase2)));
  }

  /** A seeded sequence of pools, single-level rapids and occasional two-level falls. */
  grade(distance: number, power: number): number {
    const first = 13 + (this.seed % 13);
    const spacing = 15 + (mixSeed(this.seed) % 14);
    if (distance < first) return 0;
    const reach = Math.floor((distance - first) / spacing);
    let drop = 0;
    for (let n = 0; n <= reach; n++) drop += power > 40 && mixSeed(this.seed + n * 97) % 4 === 0 ? 2 : 1;
    return drop;
  }

  lanes(x: number, y: number, dx: number, dy: number, width: number): { lanes: Lane[]; knob?: Knob } {
    let selected: Knob | undefined;
    let best = Infinity;
    const length = width * 1.2 + 7;
    for (const k of this.knobs) {
      const vx = k.x - x;
      const vy = k.y - y;
      const along = vx * dx + vy * dy;
      const side = -vx * dy + vy * dx;
      if (Math.abs(along) > length || Math.abs(side) > width + k.radius + 2) continue;
      const d = Math.hypot(vx, vy);
      if (d < best) {
        best = d;
        selected = k;
      }
    }
    if (!selected) return { lanes: [{ x, y, width }] };
    const along = (selected.x - x) * dx + (selected.y - y) * dy;
    const side = -(selected.x - x) * dy + (selected.y - y) * dx;
    const t = Math.max(0, 1 - Math.abs(along) / length);
    const ease = t * t * (3 - 2 * t);
    const branchWidth = Math.max(1.05, width * (1 - 0.56 * ease));
    const spread = (selected.radius + branchWidth + 0.9) * Math.sin((t * Math.PI) / 2);
    return {
      knob: selected,
      lanes: [-1, 1].map((sign) => {
        const offset = side * ease + spread * sign;
        return { x: x - dy * offset, y: y + dx * offset, width: branchWidth };
      }),
    };
  }
}
