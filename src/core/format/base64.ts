// Base64 for the project file (typed arrays and the thumbnail inside JSON). Plain code, no atob or
// Buffer, so it runs the same in the worker, the page and Node.

// The share link's fragment (spec/codec.ts) packs its bits the same way with base64url's alphabet
// and no padding.

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
/** base64url's alphabet (RFC 4648 §5), the share link's. */
export const B64_URL = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const lookupOf = (alphabet: string): Int16Array => {
  const t = new Int16Array(128).fill(-1);
  for (let i = 0; i < alphabet.length; i++) t[alphabet.charCodeAt(i)] = i;
  return t;
};
const LOOKUPS = new Map<string, Int16Array>([
  [B64, lookupOf(B64)],
  [B64_URL, lookupOf(B64_URL)],
]);

/** Bytes as base64: three bytes to four characters of `alphabet`, the last group padded with "="
 *  unless `pad` is false. */
export function toBase64(bytes: Uint8Array, alphabet = B64, pad = true): string {
  const parts: string[] = [];
  let out = "";
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    out += alphabet[n >> 18] + alphabet[(n >> 12) & 63] + alphabet[(n >> 6) & 63] + alphabet[n & 63];
    if (out.length >= 65536) {
      parts.push(out);
      out = "";
    }
  }
  const rest = bytes.length - i;
  if (rest === 1) {
    const n = bytes[i] << 16;
    out += alphabet[n >> 18] + alphabet[(n >> 12) & 63] + (pad ? "==" : "");
  } else if (rest === 2) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8);
    out += alphabet[n >> 18] + alphabet[(n >> 12) & 63] + alphabet[(n >> 6) & 63] + (pad ? "=" : "");
  }
  parts.push(out);
  return parts.join("");
}

/** Base64 text of `alphabet` as bytes, padded or not; throws on a character outside it. */
export function fromBase64(text: string, alphabet = B64): Uint8Array {
  const LOOKUP = LOOKUPS.get(alphabet) ?? lookupOf(alphabet);
  let end = text.length;
  while (end > 0 && text.charCodeAt(end - 1) === 61) end--;
  const out = new Uint8Array(Math.floor((end * 3) / 4));
  let o = 0;
  const at = (k: number) => {
    const v = k < end ? LOOKUP[text.charCodeAt(k) & 127] : 0;
    if (v < 0) throw new Error(`bad base64 character at ${k}`);
    return v;
  };
  for (let i = 0; i < end; i += 4) {
    const n = (at(i) << 18) | (at(i + 1) << 12) | (at(i + 2) << 6) | at(i + 3);
    out[o++] = n >> 16;
    if (i + 2 < end) out[o++] = (n >> 8) & 255;
    if (i + 3 < end) out[o++] = n & 255;
  }
  return out;
}
