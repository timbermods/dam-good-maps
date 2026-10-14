// The reliable channel's frames (src/collab/framing.ts): big payloads in 16 KiB pieces, put back whole, refused when wrong.
import { describe, expect, it } from "vitest";
import { CHUNK_BYTES, FRAME_MAX, FramingError, Reassembler, encodeControl, encodeMessage, parseControl } from "../../src/collab/framing";

function roundTrip(payload: string | Uint8Array): string | Uint8Array | null {
  const r = new Reassembler();
  let out: string | Uint8Array | null = null;
  for (const f of encodeMessage(7, payload)) out = r.push(f);
  return out;
}

describe("framing", () => {
  it("cuts a megabyte into frames no bigger than 16 KiB and puts it back identical", () => {
    const big = new Uint8Array(1_000_003).map((_, i) => (i * 31) & 255);
    const frames = encodeMessage(1, big);
    expect(frames.length).toBe(Math.ceil(big.length / CHUNK_BYTES));
    for (const f of frames) expect(f.length).toBeLessThanOrEqual(FRAME_MAX);
    expect(roundTrip(big)).toEqual(big);
  });

  it("keeps text as text, including multi-byte characters across a frame boundary", () => {
    const text = "é".repeat(CHUNK_BYTES) + "☃".repeat(10_000);
    expect(roundTrip(text)).toBe(text);
    expect(roundTrip("")).toBe("");
    expect(roundTrip(new Uint8Array(0))).toEqual(new Uint8Array(0));
  });

  it("refuses frames out of order, a message that changes midway, and one over the limit", () => {
    const frames = encodeMessage(2, new Uint8Array(CHUNK_BYTES * 3));
    expect(() => new Reassembler().push(frames[1])).toThrow(FramingError);
    const r = new Reassembler();
    r.push(frames[0]);
    expect(() => r.push(frames[2])).toThrow(FramingError);
    const other = encodeMessage(3, new Uint8Array(CHUNK_BYTES * 3));
    const r2 = new Reassembler();
    r2.push(frames[0]);
    expect(() => r2.push(other[1])).toThrow(FramingError);
    expect(() => new Reassembler(CHUNK_BYTES).push(frames[0])).toThrow(FramingError);
  });

  it("reads control frames strictly", () => {
    const hello = { t: "hello", protocol: 1, session: null, epoch: "abc", name: "Emma" } as const;
    expect(parseControl(encodeControl(hello))).toEqual(hello);
    expect(parseControl(encodeControl({ t: "ping", n: 4 }))).toEqual({ t: "ping", n: 4 });
    const bad = new Uint8Array([1, ...new TextEncoder().encode('{"t":"ping","n":"x"}')]);
    expect(() => parseControl(bad)).toThrow(FramingError);
    expect(() => parseControl(new Uint8Array([1, ...new TextEncoder().encode('{"t":"nope"}')]))).toThrow(FramingError);
    // the renewal's offer, answer and candidates travel as control frames too
    const renego = { t: "renego", kind: "offer", sdp: "v=0 ".repeat(1500) } as const;
    expect(parseControl(encodeControl(renego))).toEqual(renego);
    const cand = { t: "cand", c: { candidate: "candidate:1 1 udp 2 192.0.2.1 5000 typ relay", sdpMid: "0", sdpMLineIndex: 0 } } as const;
    expect(parseControl(encodeControl(cand))).toEqual(cand);
    expect(() => parseControl(new Uint8Array([1, ...new TextEncoder().encode('{"t":"renego","kind":"bye","sdp":"x"}')]))).toThrow(FramingError);
  });
});
