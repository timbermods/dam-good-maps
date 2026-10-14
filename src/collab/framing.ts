// Frames on the reliable channel. A data channel message is safest at 16 KiB between browsers, so a payload (an
// operation, a rejoin snapshot of about 1 MB) is cut into frames of at most that size and put back together on the
// other side. The channel is ordered, so a message's frames arrive one after another; control frames (heartbeats,
// hello, bye) may come between them.
//
//   data frame     [0][flags][id u32][index u32][total u32][bytes ...]   flags bit 0: the payload is UTF-8 text
//   control frame  [1][JSON ...]

export const FRAME_MAX = 16 * 1024;
export const DATA_HEADER = 14;
export const CHUNK_BYTES = FRAME_MAX - DATA_HEADER;
/** A message is at most this big (the design budgets 8 MiB compressed, 64 MiB expanded). */
export const DEFAULT_MAX_MESSAGE_BYTES = 64 * 1024 * 1024;
const MAX_CONTROL_BYTES = 8192;

export type Payload = string | Uint8Array;

export type Control =
  | { t: "hello"; protocol: number; session: string | null; epoch: string; name?: string }
  | { t: "ping"; n: number }
  | { t: "pong"; n: number }
  | { t: "bye"; reason: string }
  /** A new offer or answer while connected (an ICE restart with fresh relay logins) and its candidates: no room needed. */
  | { t: "renego"; kind: "offer" | "answer"; sdp: string }
  | { t: "cand"; c: { candidate: string; sdpMid: string | null; sdpMLineIndex: number | null } };

const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });

export class FramingError extends Error {}

/** A message as its frames, in order. */
export function encodeMessage(id: number, payload: Payload): Uint8Array[] {
  const bytes = typeof payload === "string" ? encoder.encode(payload) : payload;
  const total = Math.max(1, Math.ceil(bytes.length / CHUNK_BYTES));
  const frames: Uint8Array[] = [];
  for (let index = 0; index < total; index++) {
    const part = bytes.subarray(index * CHUNK_BYTES, (index + 1) * CHUNK_BYTES);
    const frame = new Uint8Array(DATA_HEADER + part.length);
    const view = new DataView(frame.buffer);
    frame[0] = 0;
    frame[1] = typeof payload === "string" ? 1 : 0;
    view.setUint32(2, id >>> 0);
    view.setUint32(6, index);
    view.setUint32(10, total);
    frame.set(part, DATA_HEADER);
    frames.push(frame);
  }
  return frames;
}

export function encodeControl(c: Control): Uint8Array {
  const body = encoder.encode(JSON.stringify(c));
  if (body.length + 1 > MAX_CONTROL_BYTES) throw new FramingError("control frame too large");
  const frame = new Uint8Array(1 + body.length);
  frame[0] = 1;
  frame.set(body, 1);
  return frame;
}

export function parseControl(frame: Uint8Array): Control {
  if (frame.length > MAX_CONTROL_BYTES) throw new FramingError("control frame too large");
  let value: unknown;
  try {
    value = JSON.parse(decoder.decode(frame.subarray(1)));
  } catch {
    throw new FramingError("bad control frame");
  }
  const c = value as Partial<Control> | null;
  if (!c || typeof c !== "object" || typeof c.t !== "string") throw new FramingError("bad control frame");
  switch (c.t) {
    case "hello": {
      const h = c as Extract<Control, { t: "hello" }>;
      if (!Number.isSafeInteger(h.protocol) || typeof h.epoch !== "string" || (h.session !== null && typeof h.session !== "string")) throw new FramingError("bad hello");
      if (h.name !== undefined && (typeof h.name !== "string" || h.name.length > 64)) throw new FramingError("bad hello");
      return { t: "hello", protocol: h.protocol, session: h.session, epoch: h.epoch.slice(0, 64), ...(h.name !== undefined ? { name: h.name } : {}) };
    }
    case "ping":
    case "pong": {
      const p = c as { t: "ping" | "pong"; n: unknown };
      if (!Number.isSafeInteger(p.n)) throw new FramingError("bad ping");
      return { t: p.t, n: p.n as number };
    }
    case "renego": {
      const r = c as { kind?: unknown; sdp?: unknown };
      if ((r.kind !== "offer" && r.kind !== "answer") || typeof r.sdp !== "string" || r.sdp.length > 7000) throw new FramingError("bad renegotiation");
      return { t: "renego", kind: r.kind, sdp: r.sdp };
    }
    case "cand": {
      const k = (c as { c?: { candidate?: unknown; sdpMid?: unknown; sdpMLineIndex?: unknown } }).c;
      if (!k || typeof k.candidate !== "string" || k.candidate.length > 1024) throw new FramingError("bad candidate");
      return { t: "cand", c: { candidate: k.candidate, sdpMid: typeof k.sdpMid === "string" ? k.sdpMid : null, sdpMLineIndex: typeof k.sdpMLineIndex === "number" ? k.sdpMLineIndex : null } };
    }
    case "bye":
      return { t: "bye", reason: String((c as { reason?: unknown }).reason ?? "").slice(0, 64) };
    default:
      throw new FramingError("unknown control frame");
  }
}

/** Puts one message at a time back together; refuses anything out of order or too big. */
export class Reassembler {
  private cur: { id: number; text: boolean; total: number; next: number; parts: Uint8Array[]; size: number } | null = null;

  constructor(readonly maxBytes: number = DEFAULT_MAX_MESSAGE_BYTES) {}

  /** A data frame in; the whole message out when this was its last frame. */
  push(frame: Uint8Array): Payload | null {
    if (frame.length < DATA_HEADER || frame[0] !== 0) throw new FramingError("bad data frame");
    const view = new DataView(frame.buffer, frame.byteOffset, frame.byteLength);
    const text = (frame[1] & 1) === 1;
    const id = view.getUint32(2);
    const index = view.getUint32(6);
    const total = view.getUint32(10);
    const body = frame.subarray(DATA_HEADER);
    if (total < 1 || total > Math.ceil(this.maxBytes / CHUNK_BYTES)) throw new FramingError("message too large");
    if (body.length > CHUNK_BYTES || (index < total - 1 && body.length !== CHUNK_BYTES)) throw new FramingError("bad frame size");
    if (!this.cur) {
      if (index !== 0) throw new FramingError("frame out of order");
      this.cur = { id, text, total, next: 0, parts: [], size: 0 };
    }
    const c = this.cur;
    if (c.id !== id || c.total !== total || c.text !== text || c.next !== index) {
      this.cur = null;
      throw new FramingError("frame out of order");
    }
    c.size += body.length;
    if (c.size > this.maxBytes) {
      this.cur = null;
      throw new FramingError("message too large");
    }
    c.parts.push(body.slice());
    c.next++;
    if (c.next < c.total) return null;
    this.cur = null;
    const whole = new Uint8Array(c.size);
    let at = 0;
    for (const p of c.parts) {
      whole.set(p, at);
      at += p.length;
    }
    return c.text ? decoder.decode(whole) : whole;
  }
}
