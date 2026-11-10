// What a fall from one stroke looks like once its water has settled as the game plays it (showcase craft gaps 1, 2
// and 20): one whole curtain, no pillar of dry ground splitting it, no ledge partway down, and no basin flooding the
// high ground above it. Shared by the falls' contract tests and their sweep.

export interface Settled {
  W: number;
  H: number;
  /** The ground and its settled water before the stroke, and after it. */
  before: ArrayLike<number>;
  beforeDepth: ArrayLike<number>;
  after: ArrayLike<number>;
  depth: ArrayLike<number>;
  /** The drop the curtain must give (3 on Auto, a set Fall's height). */
  need: number;
  /** A set Fall's: the drop must be under this, never the land's own taller drop. The curtain judged is then the first
   *  from the top (the river below may fall again past where the set fall's water lands). */
  under?: number;
  /** The widest the stream's water on the high ground may run (tiles across); wider is a basin. */
  wide?: number;
}

export interface Curtain {
  ok: boolean;
  /** Why it isn't, or what it is: its tiles, level, drop. */
  note: string;
  /** Each tile's curtain (-1: none). */
  id?: Int32Array;
}

const WET = 0.05;
/** A tile pours where its water stands this far over a neighbour's (a curtain, not a rapid). */
const POUR = 2.5;

/** The stroke's curtain, judged. */
export function curtains(f: Settled): Curtain {
  const { W, H } = f;
  const n = W * H;
  const near = (i: number) => {
    const x = i % W, y = (i - x) / W;
    return [x > 0 ? i - 1 : -1, x + 1 < W ? i + 1 : -1, y > 0 ? i - W : -1, y + 1 < H ? i + W : -1].filter((j) => j >= 0);
  };
  // (each tile's pour: how far its water stands over its lowest neighbour's surface, or the ground there when dry)
  const pours = (g: ArrayLike<number>, d: ArrayLike<number>) => {
    const s = (i: number) => g[i] + (d[i] > WET ? d[i] : 0);
    const out = new Float64Array(n);
    for (let i = 0; i < n; i++) if (d[i] > WET) for (const j of near(i)) out[i] = Math.max(out[i], s(i) - s(j));
    return out;
  };
  const was = pours(f.before, f.beforeDepth);
  const now = pours(f.after, f.depth);
  // the curtains: the tiles pouring now, joined corner to corner, each from one that didn't pour before (a fall the
  // land had, apart from the stroke's, isn't one; one the stroke's water runs on into is part of it)
  const pouring = (i: number) => now[i] >= POUR;
  const id = new Int32Array(n).fill(-1);
  const groups: number[][] = [];
  for (let i = 0; i < n; i++) {
    if (!pouring(i) || was[i] >= POUR || id[i] >= 0) continue;
    const g: number[] = [];
    const stack = [i];
    id[i] = groups.length;
    while (stack.length) {
      const k = stack.pop()!;
      g.push(k);
      const x = k % W, y = (k - x) / W;
      for (let a = -1; a <= 1; a++)
        for (let b = -1; b <= 1; b++) {
          const xx = x + a, yy = y + b;
          if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
          const j = yy * W + xx;
          if (pouring(j) && id[j] < 0) {
            id[j] = groups.length;
            stack.push(j);
          }
        }
    }
    groups.push(g);
  }
  if (!groups.length) return { ok: false, note: "no fall", id };
  const judged = judge();
  return { ...judged, id };
  function judge(): Curtain {
  const weight = (g: number[]) => g.reduce((t, i) => t + now[i], 0);
  const high = (g: number[]) => Math.max(...g.map((i) => f.after[i]));
  const main =
    f.under !== undefined && groups.some((g) => g.length >= 3)
      ? groups.filter((g) => g.length >= 3).reduce((a, b) => (high(b) > high(a) || (high(b) === high(a) && weight(b) > weight(a)) ? b : a))
      : groups.reduce((a, b) => (weight(b) > weight(a) ? b : a));
  const xs = main.map((i) => i % W), ys = main.map((i) => Math.floor(i / W));
  const lip = Math.max(...main.map((i) => f.after[i]));
  const drop = Math.max(...main.map((i) => now[i]));
  const what = `${main.length} tiles at ${lip} x ${Math.min(...xs)}-${Math.max(...xs)} y ${Math.min(...ys)}-${Math.max(...ys)} drop ${drop.toFixed(1)}`;
  if (drop < f.need) return { ok: false, note: `short: ${what}` };
  if (f.under !== undefined && drop >= f.under) return { ok: false, note: `taller than set: ${what}` };
  if (main.length < 3) return { ok: false, note: `a sliver: ${what}` };
  // (another curtain within a few tiles of it: dry ground splits the fall)
  const cheb = (i: number, j: number) => Math.max(Math.abs((i % W) - (j % W)), Math.abs(Math.floor(i / W) - Math.floor(j / W)));
  for (const g of groups) if (g !== main && g.some((i) => main.some((j) => cheb(i, j) <= 4))) return { ok: false, note: `split: ${what}; ${g.length} more at x ${g[0] % W} y ${Math.floor(g[0] / W)}` };
  // (a ledge: where the curtain lands, the water falls again)
  const s = (i: number) => f.after[i] + (f.depth[i] > WET ? f.depth[i] : 0);
  for (const i of main) {
    if (now[i] < f.need) continue;
    for (const j of near(i)) if (s(i) - s(j) >= f.need && now[j] >= 2) return { ok: false, note: `a ledge at ${f.after[j]} x ${j % W} y ${Math.floor(j / W)}: ${what}` };
  }
  // (a basin: the water on the high ground above the lip wider than a stream, standing where the ground was cut)
  const wide = f.wide ?? 7;
  const top = new Uint8Array(n);
  for (let i = 0; i < n; i++) if (f.before[i] > lip && f.after[i] < f.before[i] && f.depth[i] > WET && f.after[i] >= lip - 1) top[i] = 1;
  // (the distance of each such tile from the nearest that isn't, corner to corner, the map's edge one away)
  const dist = new Float64Array(n).fill(Infinity);
  const queue: number[] = [];
  for (let i = 0; i < n; i++) {
    const x = i % W, y = (i - x) / W;
    if (!top[i]) dist[i] = 0;
    else if (x === 0 || y === 0 || x === W - 1 || y === H - 1) dist[i] = 1;
    else continue;
    queue.push(i);
  }
  queue.sort((i, j) => dist[i] - dist[j]);
  for (let q = 0; q < queue.length; q++) {
    const i = queue[q], x = i % W, y = (i - x) / W;
    for (let a = -1; a <= 1; a++)
      for (let b = -1; b <= 1; b++) {
        const xx = x + a, yy = y + b;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const j = yy * W + xx;
        if (dist[j] > dist[i] + 1) {
          dist[j] = dist[i] + 1;
          queue.push(j);
        }
      }
  }
  let deepest = 0, at = -1;
  for (let i = 0; i < n; i++) if (top[i] && dist[i] > deepest) [deepest, at] = [dist[i], i];
  if (deepest * 2 - 1 > wide) return { ok: false, note: `a basin ${deepest * 2 - 1} wide at x ${at % W} y ${Math.floor(at / W)}: ${what}` };
  return { ok: true, note: what };
}
}
