// Deterministic payloads for the connection test: both sides can make the same bytes from a size and a seed,
// so the receiver's hash is checked against what the sender meant, without sending the bytes twice.

/** `size` bytes from a small seeded generator (xorshift32). */
export function makePayload(size: number, seed: number): Uint8Array {
  const out = new Uint8Array(size);
  let x = (seed * 2654435761) >>> 0 || 1;
  for (let i = 0; i < size; i++) {
    x ^= x << 13;
    x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5;
    x >>>= 0;
    out[i] = x & 255;
  }
  return out;
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as Uint8Array<ArrayBuffer>);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
