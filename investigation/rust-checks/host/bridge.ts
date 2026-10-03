// The checks' WebAssembly, bound: one retained instance, the input buffers written straight into its memory, one
// call per validation, and the outputs read back as the Validation the TypeScript returns.

import { INPUTS, type Encoded, type Outputs } from "./encode";

const OUTPUTS = 8;
export const STATUS = { ok: 0, refused: 1, badInput: 2 } as const;

export class RustChecks {
  private constructor(private readonly ex: any) {}

  static async load(bytes: Uint8Array): Promise<RustChecks> {
    const { instance } = await WebAssembly.instantiate(bytes, {});
    return new RustChecks(instance.exports);
  }

  run(inputs: Uint8Array[]): Outputs {
    const ex = this.ex;
    for (let k = 0; k < INPUTS; k++) {
      const p = ex.checks_input(k, inputs[k].length);
      // (a view taken after the call: the memory may have grown)
      new Uint8Array(ex.memory.buffer, p, inputs[k].length).set(inputs[k]);
    }
    const status = ex.checks_run();
    const out: Uint8Array[] = [];
    for (let k = 0; k < OUTPUTS; k++) {
      const n = ex.checks_output_len(k);
      out.push(n ? new Uint8Array(ex.memory.buffer, ex.checks_output(k), n).slice() : new Uint8Array(0));
    }
    return { status, out };
  }
}

const text = (b: Uint8Array) => new TextDecoder().decode(b);
const f64 = (b: Uint8Array) => new Float64Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));

/** The outputs as validateMap's Validation ({report, analysis, model, water, mechanics}); null when the port
 *  refused the map (the caller runs the TypeScript). */
export function toValidation(o: Outputs, enc: Encoded): any | null {
  if (o.status !== STATUS.ok) return null;
  const report = JSON.parse(text(o.out[0]));
  if (!o.out[1].length) return { report, analysis: null, model: null, water: null, mechanics: null };
  const doc = JSON.parse(text(o.out[1]));
  const analysis = {
    moisture: f64(o.out[2]),
    soilContamination: f64(o.out[3]),
    reach: o.out[4].slice(),
    startDistance: o.out[5].length ? f64(o.out[5]) : null,
    waterDistance: f64(o.out[6])[0],
    ...doc.analysis,
  };
  return { report, analysis, model: enc.model, water: enc.water, mechanics: doc.mechanics };
}
