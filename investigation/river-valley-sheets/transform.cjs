// River Valley-only source transformations. Fail if the pinned dev anchors change.
module.exports = (file, source) => {
  if (!file.replaceAll('\\','/').endsWith('/src/core/land/hydro.ts')) return source;
  source = source.replaceAll('\r\n','\n');
  const replace = (a,b) => { if (source.split(a).length !== 2) throw new Error('Missing/ambiguous adoption anchor: '+a); source=source.replace(a,b); };
  replace('const st = stamp(path, W, H, Math.ceil(width / 2 + g.hydro.floor * 1.5 + 3 + (natural ? width * 0.15 : 0)));', `// An intentional plugged lake keeps its impoundment; it is a distinct water feature.
    const valleyMain = g.theme === "riverValley" && !g.intentions.includes("plug-lake") && rid === featureId(seed, "river", "river/main");
    const st = stamp(path, W, H, Math.ceil(width / 2 + g.hydro.floor * 1.5 + 3 + (natural ? width * 0.15 : 0)));`);
  replace('const lk = hollow(ci, maxSill);', `// A flat valley's trunk stays below its upstream bed when it crosses a hollow.
        const lk = hollow(ci, valleyMain ? Math.min(maxSill, run + 1) : maxSill);`);
  replace('run = lakes[inLake].outletBed;', 'run = valleyMain ? Math.min(run, lakes[inLake].outletBed) : lakes[inLake].outletBed;');
  replace('return { rivers, water, lakes, falls, arms, flowTotal };', `// The trunk can drain a lake while later rivers are carved. River Valley keeps that
  // lake's closed core, rather than a broad spent shelf marked as standing water.
  // Compact ponds and oxbows keep their outline; intentional plugged lakes keep their storage.
  if (natural && g.theme === "riverValley" && !g.intentions.includes("plug-lake")) {
    const spill = drainage(h, W, H, { eight: false }).filled;
    let trimmed = false;
    for (const lk of lakes) {
      const shelf = lk.tiles.filter((i) => h[i] >= spill[i]);
      if (shelf.length <= 0.02 * N) continue;
      lk.tiles = lk.tiles.filter((i) => h[i] < spill[i]);
      if (lk.tiles.length) lk.outletBed = Math.min(lk.outletBed, lk.tiles.reduce((lo, i) => Math.min(lo, spill[i]), Infinity) - 1);
      trimmed = true;
    }
    if (trimmed) {
      for (let i = 0; i < N; i++) if (water[i] === 2) water[i] = 3;
      for (const lk of lakes) for (const i of lk.tiles) water[i] = 2;
      for (const m of exits.values()) carve(stamp(m.path, W, H, Math.ceil(m.width / 2 + 3)), m.prof, m.L, m.n, m.half, 0);
      for (let k = lakes.length - 1; k >= 0; k--) if (lakes[k].tiles.length < 6) lakes.splice(k, 1);
    }
  }
  return { rivers, water, lakes, falls, arms, flowTotal };`);
  replace('if (cells.length < (alongUp ? 8 : 12)) return false;', `if (cells.length < (alongUp ? 8 : 12)) return false;
    // A default valley trunk crosses the land; a short corner course cannot stand for it.
    if (natural && g.theme === "riverValley" && !g.hydro.exactInflows && !g.hydro.noInflows && !g.intentions.includes("upper-lower") && heads.length === 0) {
      if (hd.kind !== "edge") return false;
      let x0 = W, y0 = H, x1 = 0, y1 = 0;
      for (const i of cells) { const x = i % W, y = Math.floor(i / W); x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
      if (Math.max(x1 - x0, y1 - y0) < 0.5 * side) return false;
    }`);
  replace('export function planHydro(E:', 'function planHydroSingle(E:');
  replace('export type { Rng };', `/** River Valley tries two courses around a drawn cliff and retains the stronger split.
 *  Both use the same field; only existing ground is carved, before the land stage. */
export function planHydro(E: Float64Array, h: Uint8Array, g: Genome, seed: number, W: number, H: number, attempt: number, opts: HydroOptions = {}): Hydro {
  const cliffDraw = g.theme === "riverValley" && opts.meander !== false && !g.hydro.exactInflows && (g.intentions.includes("upper-lower") || g.intentions.includes("under-cliff"));
  if (!cliffDraw) return planHydroSingle(E, h, g, seed, W, H, attempt, opts);
  // A full-map escarpment remains a split; stairs can connect its worlds.
  if (g.intentions.includes("upper-lower")) g.ramps = Math.min(g.ramps, 0.1);
  const original = h.slice();
  const first = planHydroSingle(E, h, g, seed, W, H, attempt, opts);
  const alternateH = original.slice();
  const alternate = planHydroSingle(E, alternateH, g, seed, W, H, attempt + 1, opts);
  const span = (ground: Uint8Array): number => {
    const top = new Uint8Array(W * H), seen = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const xx = x + dx, yy = y + dy;
        if (xx >= 0 && yy >= 0 && xx < W && yy < H && ground[i] - ground[yy * W + xx] >= 3) top[i] = 1;
      }
    }
    let best = 0;
    for (let s = 0; s < top.length; s++) {
      if (!top[s] || seen[s]) continue;
      const q = [s]; seen[s] = 1;
      let x0 = W, x1 = 0, y0 = H, y1 = 0;
      for (let k = 0; k < q.length; k++) {
        const i = q[k], x = i % W, y = Math.floor(i / W);
        x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
          const xx = x + dx, yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
          const j = yy * W + xx;
          if (top[j] && !seen[j]) { seen[j] = 1; q.push(j); }
        }
      }
      best = Math.max(best, (x1 - x0 + 1) / W, (y1 - y0 + 1) / H);
    }
    return best;
  };
  if (alternate.rivers.length && span(alternateH) > span(h)) { h.set(alternateH); return alternate; }
  return first;
}

export type { Rng };`);
  return source;
};
