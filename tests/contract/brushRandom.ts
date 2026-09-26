// A seeded random stream for the brush tests (0 ≤ v < 1).
import { Rng } from "../../src/core/math/rng";

export function mulberry(seed: number): () => number {
  const r = new Rng(seed);
  return () => r.nextU32() / 4294967296;
}
