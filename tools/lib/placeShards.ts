// The Real places check in shards (tools/real-places.ts `--check --shard i/n`, the Nightly's `places (i/n)` jobs): which
// places each shard builds and checks. Every place is in exactly one shard, chosen from the library's order and each
// place's size alone, so the shards of one run on any machine agree and their union is the whole library.
//
// The places are dealt out in the order the tool's processes claim them (the biggest maps first, whose settles and springs'
// search are the longest; the library's order among equals): the k-th place in that order goes to shard k mod n, so each
// shard gets its share of every size. A shard's places come back in the library's order.

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

/** The places of shard `s` (indices into `sizes`, the library's places' sizes in its order), in the library's order. */
export function shardPlaces(sizes: readonly number[], s: Shard): number[] {
  return claimOrder(sizes)
    .filter((_, k) => k % s.n === s.i - 1)
    .sort((a, b) => a - b);
}
