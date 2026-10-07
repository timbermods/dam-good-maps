import { readFileSync,writeFileSync,mkdirSync,cpSync,existsSync,rmSync } from 'node:fs';
import { resolve,join,dirname } from 'node:path';
import { execFileSync,spawnSync } from 'node:child_process';
const label=process.argv[2]||'dev'; const root=resolve('.'), here=resolve('investigation/first-load'), local=join(here,'local');
const original=join(local,label+'-original'), adopted=join(local,label+'-adopted');
for(const target of [original,adopted]){
 mkdirSync(target,{recursive:true});
 for(const path of ['src','tests','tools','index.html','real-places/index.html','package.json','tsconfig.json','vite.config.ts','vitest.config.ts','playwright.config.ts','playwright.live.config.ts'])if(existsSync(path))cpSync(path,join(target,path),{recursive:true});
 mkdirSync(join(target,'public'),{recursive:true});cpSync('public/sw.js',join(target,'public/sw.js'));
}
if (!process.argv.includes('--streaming')) for (const file of ['tools/rust/browser-wasm.mjs','tools/rust/browser-wasm.d.mts']) { const path=join(adopted,file); if(existsSync(path)) rmSync(path); }
function edit(path,fn){const file=join(adopted,path);const old=readFileSync(file,'utf8');const next=fn(old);if(old===next)throw Error('No change: '+path);writeFileSync(file,next);}
function add(path,text){const file=join(adopted,path);mkdirSync(dirname(file),{recursive:true});writeFileSync(file,text);}
// Delay only the background replica. Direct Save/export retain the existing full-check path.
edit('src/worker/generator.worker.ts',s=>s.replace('const api = {',`let checksPort: MessagePort | null = null;
let editable = true;
let connected = false;
let client: ed.ChecksWorker | null = null;
function connectChecksWhenEditable() {
  if (!editable || !checksPort || connected) return;
  const port = checksPort;
  if (!client) {
    const c = wrap<ChecksApi>(port);
    client = {
      follow: (p) => c.follow(p),
      check: (v, onProgress) => c.check(v, onProgress ? proxy(onProgress) : undefined),
    };
  }
  connected = true;
  ed.useChecksWorker(client);
}
const api = {`).replace(/  connectChecks\(port: MessagePort\) \{[\s\S]*?\n  \},/,`  connectChecks(port: MessagePort) {
    checksPort?.close();
    checksPort = port;
    client = null;
    connected = false;
    connectChecksWhenEditable();
  },
  /** Opt in before opening a map; older pages keep their existing checks behaviour. */
  deferChecks() {
    editable = false;
    connected = false;
    ed.useChecksWorker(null);
  },
  /** Called after the map is drawn and the page's editing handlers are attached. */
  editorReady() {
    editable = true;
    connectChecksWhenEditable();
  },`));
edit('src/worker/checks.worker.ts',s=>s.replace('import * as ed from "./session";', '// Loading the replica includes the Rust checks and analysis. Wait for its first request.\nconst session = () => import("./checksReplica");').replace('follow: (p: ed.FollowPayload) => ed.follow(p),', 'follow: async (p: import("./session").FollowPayload) => (await session()).follow(p),').replace('check: (version: number, onProgress?: (p: ed.CheckProgress) => void) => ed.replicaCheck(version, onProgress),','check: async (version: number, onProgress?: (p: import("./session").CheckProgress) => void) => (await session()).replicaCheck(version, onProgress),'));
add('src/worker/checksReplica.ts', '// Only the replica API is imported lazily: other session exports stay tree-shaken.\nimport { follow, replicaCheck } from "./session";\nexport { follow, replicaCheck };\n');
// Scope the common page changes to the page owner's adoption patch.
if (label==='page') edit('src/editor/paint/usePaint.ts',s=>s.replace('    let live = true;\n    const t = setTimeout(() => {',`    if (!ed.ready) return;
    let live = true;
    let t: ReturnType<typeof setTimeout> | undefined;
    // Two frames give the fully drawn map and its installed handlers a chance to paint.
    let first = 0, second = 0;
    first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => {
      void api.editorReady();
      t = setTimeout(() => {`).replace('    }, 700);','      }, 700);\n      });\n    });').replace('      clearTimeout(t);','      clearTimeout(t);\n      cancelAnimationFrame(first);\n      cancelAnimationFrame(second);').replace('  }, [info.version]);','  }, [info.version, ed.ready]);').replace('          journey.current?.news(e);',`          journey.current?.news(e);
          if (e.kind === "settled" && e.version === infoRef.current.version) {
            infoRef.current = { ...infoRef.current, waterPending: e.info.waterPending };
            setInfo(infoRef.current);
            props.onChange(infoRef.current);
          }`).replace('    draftWater, showWater, showSoil, applyUpdate', label === 'dev' ? '    draftWater, showWater, showSoil, applyUpdate, setInfo' : '    draftWater, showWater, showSoil, applyUpdate'));
if(label==='page') {
  const file=join(adopted,'src/editor/paint/usePaint.ts'); let code=readFileSync(file,'utf8');
  const begin=code.indexOf('      void api.editorReady();'), end=code.indexOf('      }, 700);',begin);
  code=code.slice(0,begin)+code.slice(begin,end).split('\n').map(line=>'  '+line).join('\n')+code.slice(end);
  writeFileSync(file,code);
}
// Existing single worker receives caching. Install waits on updates; first install still claims normally.
const cache=readFileSync('investigation/startup/cache-selection.js','utf8').replace('dgm-startup-immutable-v1','dgm-startup-immutable-v2').replace('!url.search;', '!url.search && !request.headers.has("range");').replace("response.ok && !response.redirected", "response.status === 200 && !response.headers.has('content-range') && !response.redirected");
edit('public/sw.js',s=>s.replace('and nothing is cached.', 'with immutable assets cached below.').replace("When startup's caching joins (D397), it goes in this", "Startup caching uses this").replace("worker's one fetch handler, and updates then wait for a safe moment instead of taking over at once.", "worker's one fetch handler. Updates wait until existing editing clients close.").replace("When startup's caching joins (D397), it goes in this\r\n// worker's one fetch handler, and updates then wait for a safe moment instead of taking over at once.", "Startup caching uses this\r\n// worker's one fetch handler. Updates wait until existing editing clients close.").replace('self.addEventListener("install", () => self.skipWaiting());','// Updates wait until existing editing clients close; the first install activates normally.').replace('event.respondWith(fetch(request).then(isolated));','event.respondWith(startupResponse(request).then(isolated));').replace(/When startup's caching joins (D397), it goes in this\r?\n\/\/ worker's one fetch handler, and updates then wait for a safe moment instead of taking over at once\./, "Startup caching uses this\n// worker's one fetch handler. Updates wait until existing editing clients close.")+'\n'+cache);
// Register for caching even when the host itself supplies isolation. Register after first editable frame
// on already-isolated hosts, avoiding registration work on their startup path.
edit('src/platform/isolation.ts',s=>s.replace('await isolate();',`await isolate();

/** On a host sending isolation headers, register the same worker for its immutable cache after first paint. */
export function cacheAfterEditable(): void {
  if (typeof window === "undefined" || !window.crossOriginIsolated || !window.isSecureContext || !("serviceWorker" in navigator)) return;
  const base = import.meta.env.BASE_URL;
  void navigator.serviceWorker.register(base + "sw.js", { scope: base, updateViaCache: "none" }).catch(() => {});
}`));
if (label==='page') edit('src/editor/paint/usePaint.ts',s=>s.replace('import { proxy } from "comlink";', 'import { proxy } from "comlink";\nimport { cacheAfterEditable } from "../../platform/isolation";').replace('      void api.editorReady();','      void api.editorReady();\n      cacheAfterEditable();'));
// Externalize byte-identical committed Rust modules only in browser builds. Node and Rust rebuilds unchanged.
if (process.argv.includes('--streaming')) {
const plugin=readFileSync('investigation/first-load/browser-wasm.mjs','utf8');
add('tools/rust/browser-wasm.mjs',plugin);
add('tools/rust/browser-wasm.d.mts', 'import type { Plugin } from "vite";\nexport function browserWasm(): Plugin;\n');
edit('vite.config.ts',s=>s.replace('import { rustWatch }', 'import { browserWasm } from "./tools/rust/browser-wasm.mjs";\nimport { rustWatch }').replace('plugins: [preact(), rustWatch()]','plugins: [preact(), rustWatch(), browserWasm()]').replace('worker: { format: "es" }','worker: { format: "es", plugins: () => [browserWasm()] }'));
}
if(label === 'page') edit('src/ui/App.tsx', s => s.replace('let generator = gen.api;', 'let generator = gen.api;\nvoid generator.deferChecks();').replace('      generator = gen.api;', '      generator = gen.api;\n      void generator.deferChecks();').replace('    void prepareRenderer();', '    // Let the worker load and accept its first RPC before GPU preparation holds the page.\n    void generator.sessionInfo().then(() => prepareRenderer()).catch(() => discardPreparedRenderer());'));
// Preserve the existing advisory callback; only its scheduling changes.
if(label==='page') {
  const file=join(adopted,'src/editor/paint/usePaint.ts');
  const old=readFileSync(join(original,'src/editor/paint/usePaint.ts'),'utf8');
  const begin=old.indexOf('      void api',old.indexOf('const t = setTimeout'));
  const end=old.indexOf('    }, 700);',begin);
  const body=old.slice(begin,end).split('\n').map(line=>line?'    '+line:line).join('\n');
  let code=readFileSync(file,'utf8'); const from=code.indexOf('    first = requestAnimationFrame'); const to=code.indexOf('    return () => {',from);
  code=code.slice(0,from)+'    first = requestAnimationFrame(() => {\n      second = requestAnimationFrame(() => {\n        void api.editorReady();\n        cacheAfterEditable();\n        t = setTimeout(() => {\n'+body+'        }, 700);\n      });\n    });\n'+code.slice(to);
  writeFileSync(file,code);
}
writeFileSync(join(local,label+'-adopted-sha.txt'),execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}));
console.log('Prepared '+adopted);
