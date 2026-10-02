// Adoption candidate. Restricted to finite map arguments, rather than a general libm.
// All polynomial evaluation and reductions have a fixed order. No native approximate Math calls.
import { sinDet, cosDet, expDet } from '../../src/core/math/detmath';
export { sinDet as sin, cosDet as cos, expDet as exp };
// ECMAScript remainder is specified arithmetic; the Rust port implements it in integers.
export function rem(x:number,y:number):number { return x % y; }
export function tan(x: number): number { return sinDet(x) / cosDet(x); }
export function asin(x:number):number { return atan2(x,sqrt((1-x)*(1+x))); }
export function acos(x:number):number { return atan2(sqrt((1-x)*(1+x)),x); }
const PI = 3.141592653589793, HALF_PI = 1.5707963267948966, LN2 = 0.6931471805599453;
// (module (func (export "sqrt") (param f64) (result f64) local.get 0 f64.sqrt))
// WebAssembly f64.sqrt is correctly rounded. NaNs are not serialized into map state.
const sqrtBytes = new Uint8Array([
  0,97,115,109,1,0,0,0, 1,6,1,96,1,124,1,124, 3,2,1,0,
  7,8,1,4,115,113,114,116,0,0, 10,7,1,5,0,32,0,159,11,
]);
// Exact fallback for policies that forbid Wasm. sqrt(x) is normal for every positive binary64 x.
// Scale its exact integer significand so the result has 53 bits, take an integer square root,
// then compare the exact squared midpoint. There is no approximate native-math fallback.
export function sqrtJS(x:number):number {
  if(x===0||x===Infinity)return x;
  if(!(x>0))return NaN;
  const d=new DataView(new ArrayBuffer(8));d.setFloat64(0,x,true);
  const bits=d.getBigUint64(0,true),mask=(1n<<52n)-1n,raw=Number((bits>>52n)&2047n);
  const m=(bits&mask)|(raw?1n<<52n:0n),e=raw?raw-1075:-1074;
  let r=Math.floor((e+m.toString(2).length-1)/2);
  const n=m<<BigInt(e+104-2*r);
  let q=1n<<BigInt(Math.ceil(n.toString(2).length/2));
  for(;;){const next=(q+n/q)>>1n;if(next>=q)break;q=next;}
  const midpoint=2n*q+1n;if(4n*n>midpoint*midpoint)q++;
  if(q===(1n<<53n)){q>>=1n;r++;}
  d.setBigUint64(0,(BigInt(r+1023)<<52n)|(q&mask),true);return d.getFloat64(0,true);
}
function wasmSqrt():((x:number)=>number)|null {
  try{return new WebAssembly.Instance(new WebAssembly.Module(sqrtBytes)).exports.sqrt as (x:number)=>number;}
  catch{return null;}
}
export const sqrt=wasmSqrt()??sqrtJS;
export function hypot(...args: number[]): number {
  let scale = 0;
  for (const x of args) scale = Math.max(scale, Math.abs(x));
  if (scale === Infinity || scale === 0) return scale;
  let sum = 0;
  for (const x of args) { const r = x / scale; sum += r * r; }
  return scale * sqrt(sum);
}
export function atan(x: number): number {
  if (!Number.isFinite(x)) return Number.isNaN(x) ? NaN : (x < 0 ? -HALF_PI : HALF_PI);
  if (x === 0) return x;
  const sign = x < 0 ? -1 : 1;
  let a = Math.abs(x), offset = 0, invert = false;
  if (a > 1) { a = 1 / a; invert = true; }
  if (a > 0.41421356237309503) { a = (a - 1) / (a + 1); offset = PI / 4; }
  const a2 = a * a;
  let term = a, sum = a;
  for (let k = 1; k <= 24; k++) { term *= -a2; sum += term / (2 * k + 1); }
  const value = offset + sum;
  return sign * (invert ? HALF_PI - value : value);
}
export function atan2(y: number, x: number): number {
  if (Number.isNaN(x) || Number.isNaN(y)) return NaN;
  const negativeY = y < 0 || Object.is(y, -0), negativeX = x < 0 || Object.is(x, -0);
  if (y === 0) return negativeX ? (negativeY ? -PI : PI) : y;
  if (x === 0) return y < 0 ? -HALF_PI : HALF_PI;
  if (!Number.isFinite(x) && !Number.isFinite(y)) return (negativeY ? -1 : 1) * (negativeX ? 3 * PI / 4 : PI / 4);
  const a = atan(Math.abs(y / x));
  const b = x < 0 ? PI - a : a;
  return y < 0 ? -b : b;
}
export function log(x: number): number {
  if (x === 0) return -Infinity;
  if (!(x > 0)) return NaN;
  if (x === Infinity) return Infinity;
  let m = x, exponent = 0;
  while (m >= 2) { m *= 0.5; exponent++; }
  while (m < 1) { m *= 2; exponent--; }
  const z = (m - 1) / (m + 1), z2 = z * z;
  let term = z, sum = z;
  for (let k = 1; k <= 24; k++) { term *= z2; sum += term / (2 * k + 1); }
  return exponent * LN2 + 2 * sum;
}
export function log2(x: number): number { return log(x) / LN2; }
export function pow(x: number, y: number): number {
  if (y === 0) return 1;
  if (Number.isInteger(y) && Math.abs(y) <= 1024) {
    let n = Math.abs(y), b = x, result = 1;
    while (n > 0) { if (n % 2 === 1) result *= b; n = Math.floor(n / 2); if (n) b *= b; }
    return y < 0 ? 1 / result : result;
  }
  if (x === 0 && y > 0) return 0;
  if (!(x > 0) || !Number.isFinite(x) || !Number.isFinite(y)) throw Error('pow outside finite map domain');
  const v = y * log(x);
  if (Math.abs(v) >= 700) throw Error('pow outside expDet map domain');
  return expDet(v);
}
export function tanh(x: number): number { const a = expDet(-2 * Math.abs(x)); return (x < 0 ? -1 : 1) * ((1 - a) / (1 + a)); }
// The falls renderer uses this finite-domain inverse hyperbolic sine. Preserve signed zero.
export function asinh(x: number): number {
  if (x === 0) return x;
  const a = Math.abs(x);
  return (x < 0 ? -1 : 1) * log(a + hypot(a, 1));
}
