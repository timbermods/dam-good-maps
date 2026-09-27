// JSON the way the game writes it (FORMAT.md §4.1): compact, no BOM, non-ASCII kept, floats in C#
// style (`1.0`, `6.80089E-05`). Integers and floats are distinct: a float is a `JsonFloat`, and the
// parser keeps the original text of every float so re-serializing an unedited file is exact.

export class JsonFloat {
  constructor(
    readonly value: number,
    readonly raw?: string,
  ) {}
}

export type JsonValue = null | boolean | number | string | JsonFloat | JsonValue[] | JsonObject;
export interface JsonObject {
  [key: string]: JsonValue;
}

/** A float value for the writer. */
export const F = (v: number): JsonFloat => new JsonFloat(v);

/** Python `repr(float)` digits with a C#-style exponent (upper-case E, sign, at least 2 digits).
 *  Python switches to exponent form below 1e-4 and from 1e16; whole values get ".0". This matches
 *  the prototype's `tbmap.format_float`, which the round-trip oracle uses. */
export function formatFloat(v: number): string {
  if (!Number.isFinite(v)) throw new Error(`non-finite float ${v}`);
  if (v === 0) return Object.is(v, -0) ? "-0.0" : "0.0";
  const a = Math.abs(v);
  if (a < 1e-4 || a >= 1e16) {
    const [mant, exp] = v.toExponential().split("e");
    const sign = exp.startsWith("-") ? "-" : "+";
    const digits = exp.replace(/^[+-]/, "").padStart(2, "0");
    return `${mant}E${sign}${digits}`;
  }
  const s = String(v);
  return s.includes(".") ? s : s + ".0";
}

function writeString(s: string, out: string[]): void {
  out.push(JSON.stringify(s));
}

export function stringify(value: JsonValue): string {
  const out: string[] = [];
  const enc = (v: JsonValue): void => {
    if (v === null) out.push("null");
    else if (v === true) out.push("true");
    else if (v === false) out.push("false");
    else if (typeof v === "number") {
      if (!Number.isSafeInteger(v)) throw new Error(`JSON integer expected, got ${v} (wrap floats in F())`);
      out.push(String(v));
    } else if (typeof v === "string") writeString(v, out);
    else if (v instanceof JsonFloat) out.push(v.raw !== undefined ? v.raw : formatFloat(v.value));
    else if (Array.isArray(v)) {
      out.push("[");
      for (let i = 0; i < v.length; i++) {
        if (i) out.push(",");
        enc(v[i]);
      }
      out.push("]");
    } else {
      out.push("{");
      let first = true;
      for (const k in v) {
        if (!first) out.push(",");
        first = false;
        writeString(k, out);
        out.push(":");
        enc(v[k]);
      }
      out.push("}");
    }
  };
  enc(value);
  return out.join("");
}

/** Parse JSON, keeping floats as JsonFloat with their original text. Object keys that look like
 *  integers would be reordered by JS objects; world.json has none, and the parser rejects them. */
export function parse(text: string): JsonValue {
  let i = 0;
  if (text.charCodeAt(0) === 0xfeff) i = 1;
  const n = text.length;

  const ws = () => {
    while (i < n) {
      const c = text.charCodeAt(i);
      if (c === 32 || c === 9 || c === 10 || c === 13) i++;
      else break;
    }
  };

  const fail = (msg: string): never => {
    throw new SyntaxError(`JSON: ${msg} at ${i}`);
  };

  // JSON forbids a literal U+0000-U+001F inside a quoted string (they must be escaped).
  const hasRawControl = (s: string): boolean => {
    for (let k = 0; k < s.length; k++) if (s.charCodeAt(k) < 0x20) return true;
    return false;
  };

  const str = (): string => {
    // fast path: no escapes
    const start = ++i;
    let j = text.indexOf('"', start);
    if (j < 0) fail("unterminated string");
    const seg = text.slice(start, j);
    if (!seg.includes("\\")) {
      if (hasRawControl(seg)) fail("raw control character in string");
      i = j + 1;
      return seg;
    }
    // slow path with escapes: find the real end, then let JSON.parse decode it
    j = start;
    while (j < n) {
      const c = text.charCodeAt(j);
      if (c === 92) j += 2;
      else if (c === 34) break;
      else if (c < 0x20) fail("raw control character in string");
      else j++;
    }
    const s = JSON.parse(text.slice(start - 1, j + 1)) as string;
    i = j + 1;
    return s;
  };

  const num = (): number | JsonFloat => {
    const start = i;
    if (text[i] === "-") i++;
    while (i < n) {
      const c = text.charCodeAt(i);
      if ((c >= 48 && c <= 57) || c === 46 || c === 101 || c === 69 || c === 43 || c === 45) i++;
      else break;
    }
    const raw = text.slice(start, i);
    const v = Number(raw);
    if (Number.isNaN(v)) fail(`bad number ${raw}`);
    return /[.eE]/.test(raw) ? new JsonFloat(v, raw) : v;
  };

  const val = (): JsonValue => {
    ws();
    const c = text[i];
    if (c === "{") {
      i++;
      // a null prototype: a "__proto__" member becomes its own data property, never the inherited
      // setter, so it round-trips as itself instead of being rewritten as a sibling (audit A3)
      const obj: JsonObject = Object.create(null) as JsonObject;
      ws();
      if (text[i] === "}") {
        i++;
        return obj;
      }
      for (;;) {
        ws();
        if (text[i] !== '"') fail("key expected");
        const k = str();
        if (/^(0|[1-9]\d*)$/.test(k)) fail(`integer-like key "${k}" would reorder`);
        ws();
        if (text[i] !== ":") fail("colon expected");
        i++;
        obj[k] = val();
        ws();
        if (text[i] === ",") i++;
        else if (text[i] === "}") {
          i++;
          return obj;
        } else fail("comma or } expected");
      }
    }
    if (c === "[") {
      i++;
      const arr: JsonValue[] = [];
      ws();
      if (text[i] === "]") {
        i++;
        return arr;
      }
      for (;;) {
        arr.push(val());
        ws();
        if (text[i] === ",") i++;
        else if (text[i] === "]") {
          i++;
          return arr;
        } else fail("comma or ] expected");
      }
    }
    if (c === '"') return str();
    if (c === "t" && text.startsWith("true", i)) {
      i += 4;
      return true;
    }
    if (c === "f" && text.startsWith("false", i)) {
      i += 5;
      return false;
    }
    if (c === "n" && text.startsWith("null", i)) {
      i += 4;
      return null;
    }
    return num();
  };

  const v = val();
  ws();
  if (i !== n) fail("trailing data");
  return v;
}

/** Numeric value of a JSON number, int or float. */
export function num(v: JsonValue | undefined): number {
  if (typeof v === "number") return v;
  if (v instanceof JsonFloat) return v.value;
  throw new Error(`number expected, got ${JSON.stringify(v)}`);
}

export function isObject(v: JsonValue | undefined): v is JsonObject {
  return v !== null && typeof v === "object" && !Array.isArray(v) && !(v instanceof JsonFloat);
}
