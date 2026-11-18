// The Real places check in shards (tools/real-places.ts `--check --shard i/n`, the Nightly's `places (i/n)` jobs): which
// places each shard builds and checks. Every place is in exactly one shard, chosen from the library's order and each
// place's size alone, so the shards of one run on any machine agree and their union is the whole library.
//
// The places are dealt out in the order the tool's processes claim them (the biggest maps first, whose settles and springs'
// search are the longest; the library's order among equals): the k-th place in that order goes to shard k mod n, so each
// shard gets its share of every size, but for the places `SHARD_MOVES` moves by hand. A shard's places come back in the
// library's order.

/** A shard of the places check: the i-th (from 1) of n. */
export interface Shard {
  i: number;
  n: number;
}

/** `--shard i/n` as a shard, or an error that says what it takes. */
export function parseShard(arg: string): Shard {
  const m = /^(\d+)\/(\d+)$/.exec(arg);
  const i = m ? Number(m[1]) : NaN;
  const n = m ? Number(m[2]) : NaN;
  if (!m || n < 1 || i < 1 || i > n) throw new Error(`--shard takes i/n with 1 ≤ i ≤ n (as --shard 2/5), not ${arg}`);
  return { i, n };
}

/** The order the places are claimed in: by size, biggest first, the library's order among equals (indices into `sizes`). */
export function claimOrder(sizes: readonly number[]): number[] {
  return sizes.map((_, k) => k).sort((a, b) => sizes[b] - sizes[a] || a - b);
}

/** Places moved by hand from the shard the deal gives them, for a count of shards: library id → shard (from 1). The
 *  Nightly's five (planning's ruling of 2026-11-17 on #1201): shard 3 took 46 of its 90 minutes on run 44000346980
 *  (Cliffs of Moher 1,627 s, Lake Toba 1,172 s, Bungle Bungle 1,118 s), shard 2 the least (944 s), so Lake Toba moves
 *  from 3 to 2. */
export const SHARD_MOVES: Readonly<Record<number, Readonly<Record<string, number>>>> = {
  5: { "n135-256-30-normalised-16": 2 },
};

/** `SHARD_MOVES` for `n` shards as library index → shard, given the library's places' ids in its order; throws on an
 *  id the library does not hold or a shard past `n`. */
export function shardMoves(ids: readonly string[], n: number, moves: Readonly<Record<number, Readonly<Record<string, number>>>> = SHARD_MOVES): Map<number, number> {
  const out = new Map<number, number>();
  for (const [id, i] of Object.entries(moves[n] ?? {})) {
    const k = ids.indexOf(id);
    if (k < 0) throw new Error(`SHARD_MOVES: ${id} is not a library place`);
    if (!(i >= 1 && i <= n)) throw new Error(`SHARD_MOVES: ${id} to shard ${i} of ${n}`);
    out.set(k, i);
  }
  return out;
}

/** The places of shard `s` (indices into `sizes`, the library's places' sizes in its order), in the library's order;
 *  `moved` (library index → shard, `shardMoves`) overrides the deal for the places it names. */
export function shardPlaces(sizes: readonly number[], s: Shard, moved: ReadonlyMap<number, number> = new Map()): number[] {
  return claimOrder(sizes)
    .filter((p, k) => (moved.get(p) ?? (k % s.n) + 1) === s.i)
    .sort((a, b) => a - b);
}
