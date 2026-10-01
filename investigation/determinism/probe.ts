import * as portable from './portable';
import { Rng } from '../../src/core/math/rng';
import { sinDet, cosDet, expDet } from '../../src/core/math/detmath';
const bits = (n: number) => { const a = new ArrayBuffer(8), d = new DataView(a); d.setFloat64(0, n, true); return d.getBigUint64(0, true).toString(16).padStart(16, '0'); };
function inputs() {
  const rng = new Rng(520031), out: [string, number[]][] = [];
  for (let k = 0; k < 4096; k++) {
    const x = rng.range(-300, 300), y = rng.range(-300, 300), p = rng.range(.001, 5);
    for (const name of ['sin', 'cos', 'atan']) out.push([name, [x]]);
    out.push(['atan2', [y, x]], ['hypot', [x, y]], ['sqrt', [Math.abs(x)]], ['exp', [x / 4]], ['log', [p]], ['log2', [p]], ['pow', [p, rng.range(.2, 6)]], ['tanh', [x / 30]]);
  }
  for (const x of [-0, 0, Number.MIN_VALUE, 0.5, 1, 2, 1e-100, 1e100]) out.push(['sqrt', [x]], ['hypot', [x, x]], ['pow', [x, 2]]);
  for (const y of [-0, 0, -1, 1, -Infinity, Infinity]) for (const x of [-0, 0, -1, 1, -Infinity, Infinity]) out.push(['atan2', [y, x]]);
  out.push(['hypot', [11, -24]]);
  return out;
}
function probe() {
  const rows: any[] = [], errors: any[] = [];
  for (const [name, args] of inputs()) {
    const native = (Math as any)[name](...args), value = (portable as any)[name](...args);
    rows.push({ name, args: args.map(bits), native: bits(native), portable: bits(value) });
    if (Number.isFinite(native) && Number.isFinite(value)) errors.push({ name, absolute: Math.abs(native - value), scaled: Math.abs(native - value) / Math.max(1, Math.abs(native)) });
  }
  // Preserve today's deterministic helpers; no replacement algorithm should change these.
  for (const [name, fn] of [['sin', sinDet], ['cos', cosDet], ['exp', expDet]] as const) for (const x of [-10, -1, -0, 0, 1, 10])
    if (bits((portable as any)[name](x)) !== bits(fn(x))) throw Error('existing helper changed');
  return { rows, error: Object.fromEntries([...new Set(errors.map(e => e.name))].map(name => [name, { absolute: Math.max(...errors.filter(e => e.name === name).map(e => e.absolute)), scaled: Math.max(...errors.filter(e => e.name === name).map(e => e.scaled)) }])) };
}
Object.assign(window, { probe });
