import { readFileSync } from 'node:fs';
import { transpileModule, ScriptTarget } from 'typescript';
import { YourMapsSaver } from '@saving-src/core/library/saver';
import { storeProblem } from '@saving-src/core/library/yourMaps';
import { makeSpec, encodeSpecFragment, defaultSettings, seedFromText, mineSitesForSize, GENERATOR_VERSION } from '@saving-src/core/spec/mapspec';

export const bytes = (n: number) => new Uint8Array([n]);
export const row = (id: string, revision = 1) => ({ id, name: id, kind: 'import', createdAt: '2026-10-04T00:00:00Z', editedAt: '2026-10-04T00:00:00Z', starred: false, thumbnail: null, revision, savedToTimberborn: null, bytes: 1, size: { w: 8, h: 8 } });
export const info = (name = 'a', version = 1) => ({ name, version, kind: 'import', edits: 1, W: 8, H: 8, views: [] });
export const settle = async () => { for (let i = 0; i < 15; i++) await new Promise(r => setImmediate(r)); };
export function deferred<T>() { let resolve!: (v: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }

// Execute the actual App controller, stopping before JSX render. No copied saving functions.
// Hooks and worker RPC replies are deterministic; IndexedDB is the production adapter.
export function page(store: any, api: any, initial: any = {}, storage: any = { load: async () => null, clear: async () => {} }) {
  const path = process.env.SAVING_FIXED ? 'investigation/saving-review/local/product/src/ui/App.tsx' : 'investigation/saving-review/local/base/src/ui/App.tsx';
  const source = readFileSync(path, 'utf8');
  let body = source.slice(source.indexOf('export function App()'), source.indexOf('  // ---------------------------------------------------------------------------------- render'));
  body = body.replace('export function App()', 'function App()').replace(/const \[(\w+), (\w+)\] = useState(?:<.*?>)?\(/g, (_, name, setter) => `const [${name}, ${setter}] = state('${name}', `);
  // Above adds an argument but keeps the original call's closing parenthesis.
  body += '\nreturn { snapshot, replacing, enterEditor, onEditorChange, rename, renameMap, deleteMap, run, saver, entry, infoRef, nameRef, unsaved, keeping }; }\nreturn App();';
  const js = transpileModule(body, { compilerOptions: { target: ScriptTarget.ES2022 } }).outputText;
  const effects: Function[] = [], listeners = new Map<string, Set<Function>>(), timers = new Map<number, Function>();
  const values: any = { maps: [], session: null, ...initial };
  let nextId = 1;
  const globals: any = {
    state: (name: string, v: any) => [name in values ? values[name] : v, (n: any) => { values[name] = typeof n === 'function' ? n(values[name] ?? v) : n; }],
    useRef: (current: any) => ({ current }), useMemo: (fn: Function) => fn(),
    useEffect: (fn: Function) => { if (!fn.toString().includes('import(')) effects.push(fn); },
    initialSpec: () => ({ spec: makeSpec({ seed: 1, size: { x: 96, y: 96 } }), fromLink: false }),
    yourMaps: store, generator: api, gen: { api, stop() {} }, YourMapsSaver, storeProblem,
    makeSpec, encodeSpecFragment, defaultSettings, seedFromText, mineSitesForSize, GENERATOR_VERSION,
    keptNow: () => false, newId: () => `new-${nextId++}`, randomSeed: () => 2,
    history: { replaceState() {} }, location: { hash: '', pathname: '/', search: '' }, noteCurrent() {}, savedCurrent: () => null,
    placeFromHash: () => null, decodeSpecFragment: () => null,
    thumbnailUrl: () => null, prepareRenderer: async () => {}, discardPreparedRenderer() {}, storage,
    cleanMapName: (n: string) => n.trim() ? { ok: true, name: n.trim() } : { ok: false, reason: 'blank' },
    proxy: (x: any) => x, performance: { mark() {} }, shown: null, made: 0,
    window: { setTimeout: (fn: Function) => { const id = nextId++; timers.set(id, fn); return id; }, addEventListener: (n: string, fn: Function) => { if (!listeners.has(n)) listeners.set(n, new Set()); listeners.get(n)!.add(fn); }, removeEventListener: (n: string, fn: Function) => listeners.get(n)?.delete(fn) },
    document: { visibilityState: 'hidden', addEventListener: (n: string, fn: Function) => { if (!listeners.has(n)) listeners.set(n, new Set()); listeners.get(n)!.add(fn); }, removeEventListener: (n: string, fn: Function) => listeners.get(n)?.delete(fn) },
  };
  const controller = new Function(...Object.keys(globals), js)(...Object.values(globals));
  return { ...controller, values, effects, timers, fire: (name: string, e: any) => listeners.get(name)?.forEach(fn => fn(e)), mount: () => effects.forEach(fn => fn()) };
}
