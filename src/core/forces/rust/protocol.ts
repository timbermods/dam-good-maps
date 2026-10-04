// The Rust forces' job format (rust/forces/src/lib.rs `Reader`): a value is a tag byte, then its body,
// little-endian. null 0, false 1, true 2, a number 3 (its eight bytes, never a decimal), a string 4 (u32
// length, UTF-8), a list 5 (u32 count, then each), an object 6 (u32 count, then each key and value).
// Typed arrays and sets are lists. `encode` with `canonical` sorts an object's keys (the fixtures'
// packed results compare in that order); a job keeps its own order.
//
// Used once per plan for a map's metadata (its objects, settings and where; bridge.ts sets the numeric
// arrays straight into the Wasm's memory) and by the identity check's fixtures (tools/rust/check.ts).

export function encode(value: unknown, canonical = true): Uint8Array {
  let data = new Uint8Array(1024);
  let view = new DataView(data.buffer);
  let at = 0;
  const encoder = new TextEncoder();
  const reserve = (n: number) => {
    if (at + n <= data.length) return;
    const next = new Uint8Array(Math.max(at + n, data.length * 2));
    next.set(data);
    data = next;
    view = new DataView(data.buffer);
  };
  const byte = (v: number) => {
    reserve(1);
    data[at++] = v;
  };
  const u32 = (v: number) => {
    reserve(4);
    view.setUint32(at, v, true);
    at += 4;
  };
  const str = (v: string) => {
    const bytes = encoder.encode(v);
    u32(bytes.length);
    reserve(bytes.length);
    data.set(bytes, at);
    at += bytes.length;
  };
  const write = (v: unknown): void => {
    if (v === null) byte(0);
    else if (typeof v === "boolean") byte(v ? 2 : 1);
    else if (typeof v === "number") {
      byte(3);
      reserve(8);
      view.setFloat64(at, v, true);
      at += 8;
    } else if (typeof v === "string") {
      byte(4);
      str(v);
    } else if (Array.isArray(v) || ArrayBuffer.isView(v) || v instanceof Set) {
      const list = v instanceof Set ? [...v] : (v as ArrayLike<unknown>);
      byte(5);
      u32(list.length);
      for (let k = 0; k < list.length; k++) write(list[k]);
    } else if (v && typeof v === "object") {
      const o = v as Record<string, unknown>;
      const keys = Object.keys(o).filter((k) => o[k] !== undefined);
      if (canonical) keys.sort();
      byte(6);
      u32(keys.length);
      for (const k of keys) {
        str(k);
        write(o[k]);
      }
    } else throw new Error(`the forces' job format has no ${typeof v}`);
  };
  write(value);
  return data.slice(0, at);
}

export function decode(bytes: Uint8Array): unknown {
  let at = 0;
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const decoder = new TextDecoder();
  const u32 = () => {
    const n = v.getUint32(at, true);
    at += 4;
    return n;
  };
  const str = () => {
    const n = u32();
    const s = decoder.decode(bytes.subarray(at, at + n));
    at += n;
    return s;
  };
  const read = (): unknown => {
    switch (bytes[at++]) {
      case 0:
        return null;
      case 1:
        return false;
      case 2:
        return true;
      case 3: {
        const n = v.getFloat64(at, true);
        at += 8;
        return n;
      }
      case 4:
        return str();
      case 5:
        return Array.from({ length: u32() }, read);
      case 6: {
        const o: Record<string, unknown> = {};
        for (let n = u32(); n--; ) {
          const k = str();
          o[k] = read();
        }
        return o;
      }
      default:
        throw new Error("the forces' job format: an unknown tag");
    }
  };
  const out = read();
  if (at !== bytes.length) throw new Error("the forces' job format: bytes left over");
  return out;
}
