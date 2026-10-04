// Embedded in land/hydro.ts by build.mjs; uses that module's deterministic primitives.
// Each accepted fan keeps its apex/outlet slots. Inside that fan, seek the low ground.
function deltaCourse(from: Point, to: Point, E: Float64Array, W: number, H: number, gap: number, seed: number, protect: Uint8Array | null): Point[] {
  const end: Point = [clamp(to[0], 0, W - 1), clamp(to[1], 0, H - 1)];
  const start = Math.round(from[1]) * W + Math.round(from[0]);
  const goal = Math.round(end[1]) * W + Math.round(end[0]);
  const vx = end[0] - from[0], vy = end[1] - from[1];
  const L2 = vx * vx + vy * vy, L = portable.sqrt(L2) || 1;
  if (L < 8) return [from, to];
  const room = clamp(gap * 0.24, 3.5, 7);
  const costs = new Float64Array(W * H).fill(Infinity);
  const parent = new Int32Array(W * H).fill(-1);
  const heap = new MinHeap();costs[start] = 0;heap.push(0, start);
  while (heap.size) {
    const i = heap.pop(), cost = heap.lastKey;
    if (cost !== costs[i]) continue;
    if (i === goal) break;
    const x = i % W, y = Math.floor(i / W);
    const t0 = ((x - from[0]) * vx + (y - from[1]) * vy) / L2;
    for (const [dx, dy] of DIRS8) {
      const xx = x + dx, yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
      const j = yy * W + xx;
      if (protect?.[j]) continue;
      const t = ((xx - from[0]) * vx + (yy - from[1]) * vy) / L2;
      const off = ((xx - from[0]) * vy - (yy - from[1]) * vx) / L;
      const r = 2 + room * 4 * clamp(t, 0, 1) * (1 - clamp(t, 0, 1));
      if (t < -0.02 || t > 1.02 || t < t0 - 0.012 || Math.abs(off) > r) continue;
      // Elevation and uphill work decide on relief; independent noise breaks ties on flats.
      const rise = Math.max(0, E[j] - E[i]);
      const grade = E[start] + clamp(t, 0, 1) * (E[goal] - E[start]);
      const terrain = Math.max(0, E[j] - grade);
      const step = (dx && dy ? portable.sqrt(2) : 1) * (1 + 2.5 * rise + 0.5 * terrain + 0.6 * (1 + fbm(seed, xx, yy, 11, 2)) + 0.15 * off * off / (r * r));
      const c = cost + step;
      if (c < costs[j]) {costs[j] = c;parent[j] = i;heap.push(c, j);}
    }
  }
  if (parent[goal] < 0) return [from, to];
  const path: Point[] = [];
  for (let i = goal; i >= 0; i = parent[i]) {path.push([i % W, Math.floor(i / W)]);if (i === start) break;}
  path.reverse();path[0] = from;path.push(to);
  return smoothPath(path, 2, 1);
}
