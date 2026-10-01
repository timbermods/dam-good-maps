// Maths that gives the same bits in every engine (PLAN §2.1, §20 D366; from investigation/determinism,
// Codex's #122). The language lets an engine approximate Math.sin, cos, exp, log, pow, hypot, atan2 and
// the rest, and Chromium, Firefox and WebKit do differ in their last bits: enough to move a glacier's
// route or a fallen tree. Everything the core computes uses these instead (tests/unit/portable.test.ts
// rejects a native call in src/core). Each is built from + − × ÷, floor and comparisons, evaluated
// in a fixed order; sqrt is WebAssembly's f64.sqrt, which IEEE-754 rounds correctly.
//
// For finite map arguments, not a general maths library: pow refuses what is outside expDet's range.

import { cosDet, expDet, sinDet } from "./detmath";

export { sinDet as sin, cosDet as cos, expDet as exp };

const PI = 3.141592653589793;
const HALF_PI = 1.5707963267948966;
const LN2 = 0.6931471805599453;
/** tan(π/8): above it atan reduces its argument by π/4. */
const TAN_PI_8 = 0.41421356237309503;

// (module (func (export "sqrt") (param f64) (result f64) local.get 0 f64.sqrt)), embedded: nothing is
// fetched. NaNs never reach map state.
const SQRT_WASM = [0, 97, 115, 109, 1, 0, 0, 0, 1, 6, 1, 96, 1, 124, 1, 124, 3, 2, 1, 0, 7, 8, 1, 4, 115, 113, 114, 116, 0, 0, 10, 7, 1, 5, 0, 32, 0, 159, 11];

function wasmSqrt(): ((x: number) => number) | null {
  try {
    return new WebAssembly.Instance(new WebAssembly.Module(new Uint8Array(SQRT_WASM))).exports.sqrt as (x: number) => number;
  } catch {
    // a page whose policy refuses WebAssembly (the Claude artifact's, tests/e2e/spike.spec.ts)
    return null;
  }
}

/** The correctly rounded square root: WebAssembly's, which the standard guarantees; where a page's
 *  policy refuses WebAssembly, Math.sqrt, which every engine computes with the processor's own
 *  correctly rounded instruction, though the language does not promise it. */
export const sqrt: (x: number) => number = wasmSqrt() ?? Math.sqrt;

/** √(Σ x²), scaled by the largest argument and summed in argument order. */
export function hypot(...args: number[]): number {
  let scale = 0;
  for (const x of args) scale = Math.max(scale, Math.abs(x));
  if (scale === Infinity || scale === 0) return scale;
  let sum = 0;
  for (const x of args) {
    const r = x / scale;
    sum += r * r;
  }
  return scale * sqrt(sum);
}

/** Arctangent: reduced to |x| ≤ tan(π/8), then 24 terms of its series. */
export function atan(x: number): number {
  if (!Number.isFinite(x)) return Number.isNaN(x) ? NaN : x < 0 ? -HALF_PI : HALF_PI;
  if (x === 0) return x;
  const sign = x < 0 ? -1 : 1;
  let a = Math.abs(x);
  let offset = 0;
  let invert = false;
  if (a > 1) {
    a = 1 / a;
    invert = true;
  }
  if (a > TAN_PI_8) {
    a = (a - 1) / (a + 1);
    offset = PI / 4;
  }
  const a2 = a * a;
  let term = a;
  let sum = a;
  for (let k = 1; k <= 24; k++) {
    term *= -a2;
    sum += term / (2 * k + 1);
  }
  const value = offset + sum;
  return sign * (invert ? HALF_PI - value : value);
}

/** The angle of (x, y), with Math.atan2's quadrants and signed zeros. */
export function atan2(y: number, x: number): number {
  if (Number.isNaN(x) || Number.isNaN(y)) return NaN;
  const negativeY = y < 0 || Object.is(y, -0);
  const negativeX = x < 0 || Object.is(x, -0);
  if (y === 0) return negativeX ? (negativeY ? -PI : PI) : y;
  if (x === 0) return y < 0 ? -HALF_PI : HALF_PI;
  if (!Number.isFinite(x) && !Number.isFinite(y)) return (negativeY ? -1 : 1) * (negativeX ? (3 * PI) / 4 : PI / 4);
  const a = atan(Math.abs(y / x));
  const b = x < 0 ? PI - a : a;
  return y < 0 ? -b : b;
}

/** Natural logarithm: scaled by exact powers of two into [1, 2), then 24 terms of atanh's series. */
export function log(x: number): number {
  if (x === 0) return -Infinity;
  if (!(x > 0)) return NaN;
  if (x === Infinity) return Infinity;
  let m = x;
  let exponent = 0;
  while (m >= 2) {
    m *= 0.5;
    exponent++;
  }
  while (m < 1) {
    m *= 2;
    exponent--;
  }
  const z = (m - 1) / (m + 1);
  const z2 = z * z;
  let term = z;
  let sum = z;
  for (let k = 1; k <= 24; k++) {
    term *= z2;
    sum += term / (2 * k + 1);
  }
  return exponent * LN2 + 2 * sum;
}

export function log2(x: number): number {
  return log(x) / LN2;
}

/** x^y: an integer power multiplies (by squaring, in a fixed order); any other is exp(y·log x), for
 *  x > 0 only. */
export function pow(x: number, y: number): number {
  if (y === 0) return 1;
  if (Number.isInteger(y) && Math.abs(y) <= 1024) {
    let n = Math.abs(y);
    let b = x;
    let result = 1;
    while (n > 0) {
      if (n % 2 === 1) result *= b;
      n = Math.floor(n / 2);
      if (n) b *= b;
    }
    return y < 0 ? 1 / result : result;
  }
  if (x === 0 && y > 0) return 0;
  if (!(x > 0) || !Number.isFinite(x) || !Number.isFinite(y)) throw Error("pow outside the finite map domain");
  const v = y * log(x);
  if (Math.abs(v) >= 700) throw Error("pow outside expDet's range");
  return expDet(v);
}

export function tanh(x: number): number {
  const a = expDet(-2 * Math.abs(x));
  return (x < 0 ? -1 : 1) * ((1 - a) / (1 + a));
}
