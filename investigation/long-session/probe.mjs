// Read-only probes: weak references never keep a Memory or WebGL resource alive.
export function installProbe() {
  if (globalThis.__longSession) return;
  Object.defineProperty(navigator, 'hardwareConcurrency', {get: () => 4, configurable: true});
  let memories = [], next = 0;
  const seen = new WeakSet();
  const remember = (m, label) => {
    if (m instanceof NativeMemory && !seen.has(m)) {
      seen.add(m); memories.push({id: ++next, label, ref: new WeakRef(m)});
    }
  };
  const NativeMemory = WebAssembly.Memory;
  WebAssembly.Memory = new Proxy(NativeMemory, {construct(T, args) {
    const m = Reflect.construct(T, args); remember(m, 'constructed'); return m;
  }});
  const exportsOf = i => {
    if (!i) return;
    const ex = i.exports;
    const label = ex.forces_create ? 'forces' : ex.water_new ? 'water' : Object.keys(ex).slice(0, 4).join(',');
    for (const v of Object.values(ex)) remember(v, label);
  };
  WebAssembly.Instance = new Proxy(WebAssembly.Instance, {construct(T, args) {
    const i = Reflect.construct(T, args); exportsOf(i); return i;
  }});
  for (const name of ['instantiate', 'instantiateStreaming']) {
    const fn = WebAssembly[name];
    WebAssembly[name] = async function(...args) {
      const r = await fn.apply(this, args); exportsOf(r.instance || r); return r;
    };
  }
  const contexts = new WeakMap();
  const stats = c => {
    let s = contexts.get(c);
    if (!s) { s = {}; contexts.set(c, s); }
    return s;
  };
  for (const proto of [globalThis.WebGLRenderingContext?.prototype, globalThis.WebGL2RenderingContext?.prototype]) {
    if (!proto) continue;
    for (const kind of ['Buffer', 'Texture', 'Framebuffer', 'Renderbuffer', 'Program', 'Shader']) {
      const live = new WeakSet();
      const create = proto['create' + kind], del = proto['delete' + kind];
      if (!create || !del) continue;
      proto['create' + kind] = function(...args) {
        const o = create.apply(this, args);
        if (o) { live.add(o); const s = stats(this); s[kind] = (s[kind] || 0) + 1; }
        return o;
      };
      proto['delete' + kind] = function(o) {
        if (o && live.delete(o)) { const s = stats(this); s[kind] = (s[kind] || 0) - 1; }
        return del.call(this, o);
      };
    }
  }
  globalThis.__longSession = {
    snapshot() {
      memories = memories.filter(x => x.ref.deref());
      return {wasm: memories.map(x => ({id: x.id, label: x.label, bytes: x.ref.deref()?.buffer.byteLength || 0})),
        heap: performance.memory ? {used: performance.memory.usedJSHeapSize, total: performance.memory.totalJSHeapSize} : null};
    },
    gpu(c) { return {...stats(c)}; }
  };
}
if (typeof self !== 'undefined') installProbe();
