/** Browser-only: immutable Wasm assets compiled while downloading. Node keeps the embedded modules. */
export function browserWasm() {
  return {
    name: 'dgm-browser-wasm', apply: 'build', enforce: 'pre',
    transform(code, id) {
      code = code.replaceAll('\r\n', '\n');
      const file = id.replaceAll('\\', '/');
      // Async Wasm loading yields to the worker event loop. Keep RPCs/ports sent before the
      // worker's handlers exist, including the water helper's initial port.
      if (file.endsWith('.worker.ts') && !file.includes('?')) {
        const leaf = file.split('/').at(-1);
        return { code: `const pending = [];
const hold = event => pending.push(event);
self.addEventListener("message", hold);
await import("./${leaf}?dgm-worker-body");
self.removeEventListener("message", hold);
for (const event of pending) self.dispatchEvent(new MessageEvent("message", { data: event.data, ports: event.ports }));`, map: null };
      }
      if (/\/(waterWasm|forcesWasm|analysisWasm|checksWasm)\.ts$/.test(file)) {
        const name = code.match(/export const (\w+_WASM)\s*=/)?.[1];
        if (!name) return null;
        const encoded = [...code.matchAll(/"([A-Za-z0-9+/=]+)"/g)].map(m => m[1]).join('');
        const source = Buffer.from(encoded, 'base64');
        if (source[0] !== 0 || source[1] !== 97 || source[2] !== 115 || source[3] !== 109) throw new Error('Invalid Wasm: ' + id);
        const asset = this.emitFile({ type: 'asset', name: name.toLowerCase() + '.wasm', source });
        return { code: `const response = await fetch(import.meta.ROLLUP_FILE_URL_${asset});
if (!response.ok) throw new Error("The map's WebAssembly could not be loaded (" + response.status + ")");
export const ${name}_MODULE = await (response.headers.get("Content-Type")?.split(";")[0].trim() === "application/wasm" && WebAssembly.compileStreaming ? WebAssembly.compileStreaming(response) : response.arrayBuffer().then(bytes => WebAssembly.compile(bytes)));\n`, map: null };
      }
      const match = code.match(/import \{ (\w+_WASM) \} from/);
      if (!match || !/new WebAssembly\.Module\(bytes\)/.test(code)) return null;
      const name = match[1];
      const transformed = code.replace(`import { ${name} }`, `import { ${name}_MODULE }`)
        .replace(/    const text = atob\(\w+_WASM\);\n    const bytes = new Uint8Array\(text.length\);\n    for \(let k = 0; k < text.length; k\+\+\) bytes\[k\] = text.charCodeAt\(k\);\n/, '')
        .replace('new WebAssembly.Module(bytes)', `${name}_MODULE`);
      return { code: transformed, map: null };
    },
  };
}
