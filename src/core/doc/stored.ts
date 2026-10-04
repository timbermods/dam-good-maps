// The stored map (Startup part 1, PLAN §20 D367, D455): a project file carries the map as it was
// when it was saved, the built result with everything a later incremental rebuild reuses, so that
// opening it shows that map at once, without rebuilding it from its generation and its log. The
// document's base and log stay the truth: the stored map is what they build, kept so the build
// need not run again at open (a 256² map's build with its canonical settle takes seconds).
//
// - Saved only when the water is the canonical settle (never the preview's, PLAN §19.7); a project
//   saved while its water is still pending opens by rebuilding, as every project did before.
// - Bound to the log it was saved with (its length and the next seq) and to this app's version; a
//   mismatch, a damaged state or a file from another version opens by rebuilding.
// - On reopen the log is replayed once and compared with the stored map, byte for byte
//   (`sameMap`): session.ts decides what undo may do below the save point (D455).
// - The format is generic: the built result is walked as a graph (plain objects, arrays, Maps,
//   Sets, typed arrays, JsonFloat), typed arrays' bytes as blobs (deflated, base64), shared objects
//   kept shared. Bump STORED_FORMAT when what the build keeps changes in a way a walk cannot carry
//   (a class in the cache); the app version covers everything else.
// - Saving is on the editor's worker after every pause (autosave): each array's blob is made once
//   and kept while the array lives (`blobOf`), so a save packs only what changed and the project
//   file's own gzip has little left to do (at 256²: tens of milliseconds, not hundreds).

import { deflateSync, inflateSync } from "fflate";
import type { BuildResult } from "../features/build";
import { fromBase64, toBase64 } from "../format/base64";
import { JsonFloat } from "../format/json";
import { GENERATOR_VERSION } from "../spec/mapspec";

/** The stored map as the project file holds it. */
export interface StoredState {
  format: 1;
  /** The app that built it: another version opens by rebuilding (its build may differ). */
  version: string;
  /** The log it was saved with: its length and the next operation's seq. */
  edits: number;
  nextSeq: number;
  /** The built result, encoded (stored.ts, "encoding"); typed arrays point into `blobs`. */
  map: unknown;
  /** Each typed array's bytes, grouped by their place in the element (`transposed`), deflated, base64. */
  blobs: string[];
}

export const STORED_FORMAT = 1;

type TypedArray = Uint8Array | Int8Array | Uint16Array | Int16Array | Uint32Array | Int32Array | Float32Array | Float64Array;
type TypedArrayCtor = { new (buffer: ArrayBuffer): TypedArray; BYTES_PER_ELEMENT: number };

const TYPED: Record<string, TypedArrayCtor> = { u8: Uint8Array, i8: Int8Array, u16: Uint16Array, i16: Int16Array, u32: Uint32Array, i32: Int32Array, f32: Float32Array, f64: Float64Array };

function typedTag(v: object): string | null {
  if (v instanceof Uint8Array) return "u8";
  if (v instanceof Float64Array) return "f64";
  if (v instanceof Int32Array) return "i32";
  if (v instanceof Uint32Array) return "u32";
  if (v instanceof Float32Array) return "f32";
  if (v instanceof Int8Array) return "i8";
  if (v instanceof Uint16Array) return "u16";
  if (v instanceof Int16Array) return "i16";
  return null;
}

/** A typed array's bytes grouped by their place in the element (every element's first byte, then
 *  every second byte, …): the same bytes, in an order gzip squeezes far better for floats. */
function transposed(v: TypedArray): Uint8Array {
  const raw = new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
  const width = v.BYTES_PER_ELEMENT;
  const n = raw.length / width;
  const out = new Uint8Array(raw.length);
  for (let b = 0; b < width; b++) for (let i = 0; i < n; i++) out[b * n + i] = raw[i * width + b];
  return out;
}

function untransposed(bytes: Uint8Array, width: number): ArrayBuffer {
  const n = bytes.length / width;
  const buffer = new ArrayBuffer(bytes.length);
  const raw = new Uint8Array(buffer);
  for (let b = 0; b < width; b++) for (let i = 0; i < n; i++) raw[i * width + b] = bytes[b * n + i];
  return buffer;
}

/** A typed array's blob, made once per array (the arrays of a built map are never changed in
 *  place: an edit makes new ones), so a later save packs only the new ones. */
const blobCache = new WeakMap<TypedArray, string>();
function blobOf(v: TypedArray): string {
  let text = blobCache.get(v);
  if (text === undefined) {
    text = toBase64(deflateSync(transposed(v), { level: 6 }));
    blobCache.set(v, text);
  }
  return text;
}

function bytesOf(blob: string): Uint8Array {
  return inflateSync(fromBase64(blob));
}

// ------------------------------------------------------------------------------------- encoding
//
// A value encodes as JSON of itself, except:
// - a number that JSON cannot carry (NaN, ±Infinity, −0), undefined, a JsonFloat, a typed array, a
//   Map and a Set are wrapped: {"$": kind, …};
// - a plain object with a "$" key of its own is wrapped {"$": "o", "v": …} so it never reads as one;
// - an object reached more than once is defined where it is first met, {"$": "def", "i": id,
//   "v": …}, and {"$": "ref", "i": id} after, so the decoded graph shares what the built one shares.

class Encoder {
  readonly blobs: string[] = [];
  private blobIds = new Map<string, number>();
  private counts = new Map<object, number>();
  private ids = new Map<object, number>();

  /** Count how often each object is reached (once: inlined; more: defined and referred to). */
  count(v: unknown): void {
    if (!v || typeof v !== "object") return;
    const n = this.counts.get(v) ?? 0;
    this.counts.set(v, n + 1);
    if (n || v instanceof JsonFloat || ArrayBuffer.isView(v)) return;
    if (v instanceof Map) {
      for (const [k, x] of v) {
        this.count(k);
        this.count(x);
      }
    } else if (v instanceof Set) for (const x of v) this.count(x);
    else if (Array.isArray(v)) for (const x of v) this.count(x);
    else for (const x of Object.values(v)) this.count(x);
  }

  encode(v: unknown): unknown {
    if (v === undefined) return { $: "undef" };
    if (typeof v === "number") return Number.isFinite(v) && !Object.is(v, -0) ? v : { $: "n", v: String(v) === "0" ? "-0" : String(v) };
    if (v === null || typeof v !== "object") {
      if (typeof v === "function" || typeof v === "symbol" || typeof v === "bigint") throw new Error(`a built map holds a ${typeof v}, which the stored map cannot carry`);
      return v;
    }
    const known = this.ids.get(v);
    if (known !== undefined) return { $: "ref", i: known };
    const shared = (this.counts.get(v) ?? 0) > 1;
    if (!shared) return this.plain(v);
    const id = this.ids.size;
    this.ids.set(v, id);
    return { $: "def", i: id, v: this.plain(v) };
  }

  private plain(v: object): unknown {
    if (v instanceof JsonFloat) return { $: "f", v: this.encode(v.value), ...(v.raw !== undefined ? { r: v.raw } : {}) };
    const tag = typedTag(v);
    if (tag) return { $: tag, b: this.blob(v as TypedArray) };
    if (ArrayBuffer.isView(v)) throw new Error("a built map holds a typed array of a kind the stored map cannot carry");
    if (v instanceof Map) return { $: "m", e: [...v].map(([k, x]) => [this.encode(k), this.encode(x)]) };
    if (v instanceof Set) return { $: "s", e: [...v].map((x) => this.encode(x)) };
    if (Array.isArray(v)) return v.map((x) => this.encode(x));
    const proto = Object.getPrototypeOf(v);
    if (proto !== Object.prototype && proto !== null) throw new Error("a built map holds a class instance, which the stored map cannot carry");
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) out[k] = this.encode(x);
    return "$" in out ? { $: "o", v: out } : out;
  }

  private blob(v: TypedArray): number {
    const text = blobOf(v);
    let id = this.blobIds.get(text);
    if (id === undefined) {
      id = this.blobs.length;
      this.blobs.push(text);
      this.blobIds.set(text, id);
    }
    return id;
  }
}

class Decoder {
  private defined = new Map<number, unknown>();
  constructor(private readonly blobs: readonly string[]) {}

  decode(v: unknown): unknown {
    if (v === null || typeof v !== "object") return v;
    if (Array.isArray(v)) return v.map((x) => this.decode(x));
    const w = v as Record<string, unknown>;
    if (!("$" in w)) {
      const out: Record<string, unknown> = {};
      for (const [k, x] of Object.entries(w)) out[k] = this.decode(x);
      return out;
    }
    switch (w.$) {
      case "undef":
        return undefined;
      case "n":
        return w.v === "-0" ? -0 : Number(w.v);
      case "f":
        return new JsonFloat(this.decode(w.v) as number, typeof w.r === "string" ? w.r : undefined);
      case "m": {
        const m = new Map<unknown, unknown>();
        for (const [k, x] of w.e as [unknown, unknown][]) m.set(this.decode(k), this.decode(x));
        return m;
      }
      case "s": {
        const s = new Set<unknown>();
        for (const x of w.e as unknown[]) s.add(this.decode(x));
        return s;
      }
      case "o":
        return this.decode(w.v);
      case "ref": {
        if (!this.defined.has(w.i as number)) throw new Error("a reference before its definition");
        return this.defined.get(w.i as number);
      }
      case "def": {
        // (defined before its contents are decoded, so a cycle resolves)
        const inner = w.v as Record<string, unknown> | unknown[];
        const id = w.i as number;
        if (Array.isArray(inner)) {
          const out: unknown[] = [];
          this.defined.set(id, out);
          for (const x of inner) out.push(this.decode(x));
          return out;
        }
        if (inner.$ === "m" || inner.$ === "s" || inner.$ === "o" || !("$" in inner)) {
          const out = inner.$ === "m" ? new Map<unknown, unknown>() : inner.$ === "s" ? new Set<unknown>() : {};
          this.defined.set(id, out);
          if (out instanceof Map) for (const [k, x] of inner.e as [unknown, unknown][]) out.set(this.decode(k), this.decode(x));
          else if (out instanceof Set) for (const x of inner.e as unknown[]) out.add(this.decode(x));
          else for (const [k, x] of Object.entries(inner.$ === "o" ? (inner.v as Record<string, unknown>) : inner)) (out as Record<string, unknown>)[k] = this.decode(x);
          return out;
        }
        const out = this.decode(inner);
        this.defined.set(id, out);
        return out;
      }
      default: {
        const C = TYPED[w.$ as string];
        if (!C) throw new Error(`unknown stored value "${String(w.$)}"`);
        const text = this.blobs[w.b as number];
        if (typeof text !== "string") throw new Error("a typed array without its bytes");
        const bytes = bytesOf(text);
        if (bytes.length % C.BYTES_PER_ELEMENT) throw new Error("a typed array of a broken length");
        return new C(untransposed(bytes, C.BYTES_PER_ELEMENT));
      }
    }
  }
}

// ---------------------------------------------------------------------------------- the stored map

/** The built map as the project stores it. `edits` and `nextSeq` are the log it belongs to. What
 *  a session rebinds at open is left out: the generation's layers (`cache.base`, `field`, `locked`
 *  come from the document) and the memoized distance fields (`cache.fields`, computed on demand).
 *  Opening is not an edit: `dirty` is null. */
export function storeBuilt(built: BuildResult, edits: number, nextSeq: number): StoredState {
  const kept: BuildResult = { ...built, dirty: null, cache: { ...built.cache, base: null, field: null, locked: null, fields: new Map() } };
  const enc = new Encoder();
  enc.count(kept);
  const map = enc.encode(kept);
  return { format: 1, version: GENERATOR_VERSION, edits, nextSeq, map, blobs: enc.blobs };
}

/** Whether a stored state belongs to this log and this app (else the project opens by rebuilding). */
export function storedFits(s: StoredState | null | undefined, edits: number, nextSeq: number): s is StoredState {
  return !!s && typeof s === "object" && s.format === STORED_FORMAT && s.version === GENERATOR_VERSION && s.edits === edits && s.nextSeq === nextSeq && Array.isArray(s.blobs);
}

/** The stored map, decoded and checked for shape; null when it is damaged (the project then opens
 *  by rebuilding). The caller rebinds the layers it left out. */
export function restoreBuilt(s: StoredState, W: number, H: number, seed: number): BuildResult | null {
  let b: BuildResult;
  try {
    b = new Decoder(s.blobs).decode(s.map) as BuildResult;
  } catch {
    return null;
  }
  if (!b || typeof b !== "object" || b.W !== W || b.H !== H || b.seed !== seed) return null;
  const N = W * H;
  const tile = (v: unknown) => ArrayBuffer.isView(v) && (v as TypedArray).length === N;
  if (![b.heights, b.water, b.contamination, b.moisture, b.soilContamination, b.occupied, b.channel].every(tile)) return null;
  if (!b.settle || typeof b.settle !== "object" || !tile(b.settle.depth) || !tile(b.settle.contamination) || !tile(b.settle.sat) || b.settle.preview) return null;
  if (!b.waterModel || typeof b.waterModel !== "object" || !Array.isArray(b.entities) || !Array.isArray(b.slopes) || !Array.isArray(b.sources) || !Array.isArray(b.notes) || !Array.isArray(b.orphans)) return null;
  const c = b.cache;
  if (!c || typeof c !== "object" || !(c.keys instanceof Map) || !(c.fields instanceof Map) || !(c.resources instanceof Map) || !Array.isArray(c.terrainFeatures) || !Array.isArray(c.sculpts) || !Array.isArray(c.sculptEdits) || !c.terrain || typeof c.terrain !== "object") return null;
  if (![c.terrain.pre2, c.terrain.pre7, c.terrain.heights, c.terrain.protect, c.terrain.channel, c.reserved].every(tile)) return null;
  return b;
}

// ---------------------------------------------------------------------------------- comparison

function sameBytes(a: ArrayBufferView | undefined, b: ArrayBufferView | undefined): boolean {
  if (!a || !b) return a === b;
  if (a.byteLength !== b.byteLength) return false;
  const x = new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
  const y = new Uint8Array(b.buffer, b.byteOffset, b.byteLength);
  for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return false;
  return true;
}

/** JSON with every float's exact text (a JsonFloat keeps the digits the file was written with). */
function exactJson(v: unknown): string {
  return JSON.stringify(v, (_k, x: unknown) => (x instanceof JsonFloat ? { $float: x.value, raw: x.raw ?? null } : x));
}

/** Whether two built maps are the same map, byte for byte: the ground, every water and soil
 *  layer and the settle, the objects, the slopes, the sources and the start. Caches, notes and
 *  the dirty region are not the map. */
export function sameMap(a: BuildResult, b: BuildResult): boolean {
  if (a.W !== b.W || a.H !== b.H || a.seed !== b.seed || a.waterFromFile !== b.waterFromFile) return false;
  const arrays: [ArrayBufferView | undefined, ArrayBufferView | undefined][] = [
    [a.heights, b.heights],
    [a.water, b.water],
    [a.contamination, b.contamination],
    [a.moisture, b.moisture],
    [a.soilContamination, b.soilContamination],
    [a.occupied, b.occupied],
    [a.channel, b.channel],
    [a.settle.depth, b.settle.depth],
    [a.settle.contamination, b.settle.contamination],
    [a.settle.sat, b.settle.sat],
    [a.settle.out, b.settle.out],
  ];
  for (const [x, y] of arrays) if (!sameBytes(x, y)) return false;
  if (a.settle.ticks !== b.settle.ticks || a.settle.settled !== b.settle.settled || !!a.settle.preview !== !!b.settle.preview) return false;
  if (a.entities.length !== b.entities.length) return false;
  for (let i = 0; i < a.entities.length; i++) if (exactJson(a.entities[i]) !== exactJson(b.entities[i])) return false;
  return exactJson([a.slopes, a.sources, a.start ?? null]) === exactJson([b.slopes, b.sources, b.start ?? null]);
}
