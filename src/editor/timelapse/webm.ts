// A WebM file of one video track (Matroska's EBML, the subset players read): the time-lapse's frames, as the
// browser's encoder (WebCodecs `VideoEncoder`, VP9 or VP8) gives them, in clusters that each start on a key frame,
// with cues before them so a player seeks at once. Plain bytes, no dependency: `WebmWriter` writes it, `webmFacts`
// reads one back (its tests and the browser spec count its frames and its length from it).

/** An EBML element's id, as its bytes. */
const ID = {
  EBML: 0x1a45dfa3,
  EBMLVersion: 0x4286,
  EBMLReadVersion: 0x42f7,
  EBMLMaxIDLength: 0x42f2,
  EBMLMaxSizeLength: 0x42f3,
  DocType: 0x4282,
  DocTypeVersion: 0x4287,
  DocTypeReadVersion: 0x4285,
  Segment: 0x18538067,
  Info: 0x1549a966,
  TimecodeScale: 0x2ad7b1,
  Duration: 0x4489,
  MuxingApp: 0x4d80,
  WritingApp: 0x5741,
  Tracks: 0x1654ae6b,
  TrackEntry: 0xae,
  TrackNumber: 0xd7,
  TrackUID: 0x73c5,
  TrackType: 0x83,
  FlagLacing: 0x9c,
  CodecID: 0x86,
  DefaultDuration: 0x23e383,
  Video: 0xe0,
  PixelWidth: 0xb0,
  PixelHeight: 0xba,
  Cues: 0x1c53bb6b,
  CuePoint: 0xbb,
  CueTime: 0xb3,
  CueTrackPositions: 0xb7,
  CueTrack: 0xf7,
  CueClusterPosition: 0xf1,
  Cluster: 0x1f43b675,
  Timecode: 0xe7,
  SimpleBlock: 0xa3,
} as const;

function idBytes(id: number): number[] {
  const out: number[] = [];
  for (let v = id; v > 0; v = Math.floor(v / 256)) out.unshift(v & 0xff);
  return out;
}

/** An element's size as an EBML variable-length integer, in `width` bytes (the fewest that hold it when absent). */
function sizeBytes(n: number, width?: number): number[] {
  let w = width ?? 1;
  if (width === undefined) while (n >= 2 ** (7 * w) - 1) w++;
  const out = new Array<number>(w);
  let v = n;
  for (let k = w - 1; k >= 0; k--) {
    out[k] = v & 0xff;
    v = Math.floor(v / 256);
  }
  out[0] |= 0x80 >> (w - 1);
  return out;
}

function uintBytes(n: number, width?: number): number[] {
  const out: number[] = [];
  for (let v = n; v > 0; v = Math.floor(v / 256)) out.unshift(v & 0xff);
  if (!out.length) out.push(0);
  while (width !== undefined && out.length < width) out.unshift(0);
  return out;
}

type Part = Uint8Array;

function bytes(list: number[]): Part {
  return Uint8Array.from(list);
}

function element(id: number, body: readonly Part[]): Part[] {
  const n = body.reduce((s, p) => s + p.length, 0);
  return [bytes([...idBytes(id), ...sizeBytes(n)]), ...body];
}

const uint = (id: number, n: number, width?: number) => element(id, [bytes(uintBytes(n, width))]);
const text = (id: number, s: string) => element(id, [new TextEncoder().encode(s)]);
function float(id: number, v: number): Part[] {
  const b = new Uint8Array(8);
  new DataView(b.buffer).setFloat64(0, v);
  return element(id, [b]);
}
const size = (parts: readonly Part[]) => parts.reduce((s, p) => s + p.length, 0);

/** The codecs the time-lapse writes. */
export type WebmCodec = "V_VP9" | "V_VP8";

interface Frame {
  data: Uint8Array;
  /** Microseconds. */
  time: number;
  key: boolean;
}

/** One video track's frames, written as a WebM file at the end (`finish`). Times are the encoder's, in microseconds;
 *  the file's are milliseconds (its timecode scale). */
export class WebmWriter {
  private readonly frames: Frame[] = [];

  constructor(private readonly o: { codec: WebmCodec; width: number; height: number; fps: number; app?: string }) {}

  get count(): number {
    return this.frames.length;
  }

  /** A frame as the encoder gave it (a copy is kept). The first must be a key frame. */
  add(data: Uint8Array, timeUs: number, key: boolean): void {
    if (!this.frames.length && !key) throw new Error("A video starts on a key frame");
    this.frames.push({ data: data.slice(), time: timeUs, key });
  }

  /** The file: its length is the last frame's time plus one frame. */
  finish(): Blob {
    const { codec, width, height, fps } = this.o;
    const frameMs = 1000 / fps;
    const ms = (us: number) => Math.round(us / 1000);
    // clusters: a new one at each key frame (and before a block's time would pass what its 16 bits hold)
    const clusters: { time: number; frames: Frame[] }[] = [];
    for (const f of this.frames) {
      const c = clusters.at(-1);
      if (!c || f.key || ms(f.time) - c.time > 30_000) clusters.push({ time: ms(f.time), frames: [f] });
      else c.frames.push(f);
    }
    const clusterParts = clusters.map((c) =>
      element(
        ID.Cluster,
        [
          ...uint(ID.Timecode, c.time),
          ...c.frames.flatMap((f) => {
            const head = new Uint8Array(4);
            head[0] = 0x81; // track 1
            new DataView(head.buffer).setInt16(1, ms(f.time) - c.time);
            head[3] = f.key ? 0x80 : 0x00;
            return element(ID.SimpleBlock, [head, f.data]);
          }),
        ],
      ),
    );
    const last = this.frames.at(-1);
    const duration = last ? ms(last.time) + frameMs : 0;
    const info = element(ID.Info, [...uint(ID.TimecodeScale, 1_000_000), ...float(ID.Duration, duration), ...text(ID.MuxingApp, "Dam Good Maps"), ...text(ID.WritingApp, this.o.app ?? "Dam Good Maps")]);
    const tracks = element(ID.Tracks, [
      ...element(ID.TrackEntry, [
        ...uint(ID.TrackNumber, 1),
        ...uint(ID.TrackUID, 1),
        ...uint(ID.TrackType, 1),
        ...uint(ID.FlagLacing, 0),
        ...text(ID.CodecID, codec),
        ...uint(ID.DefaultDuration, Math.round(1e9 / fps)),
        ...element(ID.Video, [...uint(ID.PixelWidth, width), ...uint(ID.PixelHeight, height)]),
      ]),
    ]);
    // cues before the clusters, each cluster's place in eight bytes, so their size is known before the places are
    const cuesFor = (places: number[]) =>
      element(
        ID.Cues,
        clusters.flatMap((c, k) => element(ID.CuePoint, [...uint(ID.CueTime, c.time, 8), ...element(ID.CueTrackPositions, [...uint(ID.CueTrack, 1), ...uint(ID.CueClusterPosition, places[k], 8)])])),
      );
    const before = size(info) + size(tracks) + size(cuesFor(clusters.map(() => 0)));
    const places: number[] = [];
    let at = before;
    for (const p of clusterParts) {
      places.push(at);
      at += size(p);
    }
    const header = element(ID.EBML, [
      ...uint(ID.EBMLVersion, 1),
      ...uint(ID.EBMLReadVersion, 1),
      ...uint(ID.EBMLMaxIDLength, 4),
      ...uint(ID.EBMLMaxSizeLength, 8),
      ...text(ID.DocType, "webm"),
      ...uint(ID.DocTypeVersion, 4),
      ...uint(ID.DocTypeReadVersion, 2),
    ]);
    const body = [...info, ...tracks, ...cuesFor(places), ...clusterParts.flat()];
    const segment = [bytes([...idBytes(ID.Segment), ...sizeBytes(size(body), 8)]), ...body];
    return new Blob([...header, ...segment] as BlobPart[], { type: "video/webm" });
  }
}

/** What a WebM file holds, read back: its codec, size, length (ms, the file's Duration), and its frames (blocks) and
 *  key frames. Throws on bytes that are not one. */
export function webmFacts(b: Uint8Array): { codec: string; width: number; height: number; durationMs: number; frames: number; keyFrames: number; clusters: number } {
  const facts = { codec: "", width: 0, height: 0, durationMs: 0, frames: 0, keyFrames: 0, clusters: 0 };
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const vint = (at: number, keepMarker: boolean): { v: number; n: number } => {
    const first = b[at];
    let n = 1;
    while (n <= 8 && !(first & (0x80 >> (n - 1)))) n++;
    if (n > 8) throw new Error(`not EBML at ${at}`);
    let v = keepMarker ? first : first & (0xff >> n);
    for (let k = 1; k < n; k++) v = v * 256 + b[at + k];
    return { v, n };
  };
  const uintAt = (at: number, n: number) => {
    let v = 0;
    for (let k = 0; k < n; k++) v = v * 256 + b[at + k];
    return v;
  };
  // elements read into (their children read in turn); everything else is skipped
  const masters = new Set<number>([ID.Segment, ID.Info, ID.Tracks, ID.TrackEntry, ID.Video, ID.Cluster]);
  const walk = (from: number, to: number) => {
    let at = from;
    while (at < to) {
      const id = vint(at, true);
      const sz = vint(at + id.n, false);
      const body = at + id.n + sz.n;
      const end = Math.min(to, body + sz.v);
      if (id.v === ID.EBML && at === 0) {
        // (the header: its DocType must be webm)
        let p = body;
        while (p < end) {
          const i = vint(p, true);
          const s = vint(p + i.n, false);
          if (i.v === ID.DocType && new TextDecoder().decode(b.subarray(p + i.n + s.n, p + i.n + s.n + s.v)) !== "webm") throw new Error("not a WebM file");
          p += i.n + s.n + s.v;
        }
      } else if (masters.has(id.v)) {
        if (id.v === ID.Cluster) facts.clusters++;
        walk(body, end);
      } else if (id.v === ID.CodecID) facts.codec = new TextDecoder().decode(b.subarray(body, end));
      else if (id.v === ID.PixelWidth) facts.width = uintAt(body, sz.v);
      else if (id.v === ID.PixelHeight) facts.height = uintAt(body, sz.v);
      else if (id.v === ID.Duration) facts.durationMs = sz.v === 8 ? dv.getFloat64(body) : dv.getFloat32(body);
      else if (id.v === ID.SimpleBlock) {
        facts.frames++;
        const track = vint(body, false);
        if (b[body + track.n + 2] & 0x80) facts.keyFrames++;
      }
      at = end;
    }
  };
  walk(0, b.length);
  if (!facts.codec) throw new Error("no video track");
  return facts;
}
