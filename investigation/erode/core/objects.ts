import type { Thing } from "./map";
import type { Terrain } from "./terrain";

/** D257: remove objects with lost ground; carry the start to the nearest dry, level 3×3×5 site. */
export function settleThings(t: Terrain, original: Thing[], water?: ArrayLike<number>): Thing[] {
  const kept = original.filter(th => th.template !== "StartingLocation" && (th.z === 0 || t.solid(th.x, th.y, th.z - 1)));
  const occupied = new Set(kept.map(th => th.y * t.W + th.x));
  const valid = (x: number, y: number, z: number) => {
    if (x < 0 || y < 0 || x + 2 >= t.W || y + 2 >= t.H || z < 1) return false;
    for (let dy = 0; dy < 3; dy++) for (let dx = 0; dx < 3; dx++) {
      const i = (y + dy) * t.W + x + dx;
      if (!t.at(i, z - 1) || occupied.has(i) || (water?.[i] ?? 0) > 0.02) return false;
      for (let dz = 0; dz < 5; dz++) if (t.at(i, z + dz)) return false;
    }
    return true;
  };
  for (const start of original.filter(th => th.template === "StartingLocation")) {
    if (valid(start.x, start.y, start.z)) { kept.push(start); continue; }
    let best: Thing | undefined, distance = Infinity;
    for (let y = 0; y < t.H - 2; y++) for (let x = 0; x < t.W - 2; x++) {
      const runs = t.runs(y * t.W + x);
      for (let k = 1; k < runs.length; k += 2) {
        const z = runs[k], d = (x - start.x) ** 2 + (y - start.y) ** 2 + (z - start.z) ** 2;
        if (d < distance && valid(x, y, z)) { distance = d; best = { ...start, x, y, z }; }
      }
    }
    if (!best) throw new Error("No valid 3×3×5 ground remains for the start");
    kept.push(best);
  }
  return kept;
}
