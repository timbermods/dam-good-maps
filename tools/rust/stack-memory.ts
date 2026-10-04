// D448 correctness adapter: Rust-owned typed views; one Wasm call per operation.
import { WATER_WASM } from '../../src/core/sim/waterWasm';
interface Exports {
    memory: WebAssembly.Memory;
    stack_create(w: number, h: number, o: number, r: number): number;
    stack_free(h: number): number;
    stack_ptr(h: number, f: number): number;
    stack_len(h: number, f: number): number;
    stack_op(h: number, o: number, a: number, b: number): number;
    stack_info(h: number, q: number): number;
    stack_error_ptr(): number;
    stack_error_len(): number;
}
const types = [Uint32Array, Float64Array, Float64Array, Uint8Array, Int16Array, Int16Array, Float64Array, Float64Array, Float64Array, Float64Array, Float64Array, Uint32Array, Int32Array, Uint8Array, Int32Array, Float64Array, Uint8Array, Uint8Array, Int16Array, Int16Array, Uint8Array] as const;
export class StackMemory {
    readonly wasm: Exports;
    readonly handle: number;
    private freed = false;
    constructor(w: number, h: number, objects = 0, retained = 0) {
        if (![w, h, objects, retained].every(v => Number.isSafeInteger(v) && v >= 0 && v <= 0xffffffff))
            throw Error('Water input counts are invalid.');
        const bytes = Uint8Array.from(atob(WATER_WASM), c => c.charCodeAt(0));
        this.wasm = new WebAssembly.Instance(new WebAssembly.Module(bytes)).exports as unknown as Exports;
        this.handle = this.wasm.stack_create(w, h, objects, retained);
        if (!this.handle)
            throw Error(this.error());
    }
    error() { return new TextDecoder().decode(new Uint8Array(this.wasm.memory.buffer, this.wasm.stack_error_ptr(), this.wasm.stack_error_len())); }
    view(field: number): Uint8Array | Int16Array | Uint32Array | Int32Array | Float64Array {
        if (this.freed || !Number.isInteger(field) || field < 0 || field >= types.length)
            throw Error('Water map handle or field is invalid.');
        const p = this.wasm.stack_ptr(this.handle, field);
        const n = this.wasm.stack_len(this.handle, field);
        if (!p)
            throw Error(this.error());
        return new types[field](this.wasm.memory.buffer, p, n);
    }
    op(op: number, a = 0, b = 0) {
        if (this.freed || !Number.isInteger(op) || op < 0 || op > 0xffffffff)
            throw Error('Water operation is unknown.');
        if (this.wasm.stack_op(this.handle, op, a, b))
            throw Error(this.error());
        return this;
    }
    info(q: number) {
        if (this.freed || !Number.isInteger(q) || q < 0 || q > 4)
            throw Error('Water map handle or query is invalid.');
        const v = this.wasm.stack_info(this.handle, q);
        if (this.error())
            throw Error(this.error());
        return v;
    }
    close() {
        if (!this.freed) {
            this.wasm.stack_free(this.handle);
            this.freed = true;
        }
    }
}
