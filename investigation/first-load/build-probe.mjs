import { build } from 'vite';
import { existsSync, copyFileSync } from 'node:fs';
import { resolve } from 'node:path';
const label=process.argv[2]; const source=resolve(process.argv[3]||'.'); const wasm=process.argv[3] && existsSync(resolve(source,'tools/rust/browser-wasm.mjs')) ? (await import(new URL('./local/'+process.argv[3].split('/').at(-1)+'/tools/rust/browser-wasm.mjs',import.meta.url))).browserWasm : null;
function probe(){return {name:'first-load-probe',enforce:'pre',transform(code,id){
 const original=code; const path=id.split('?')[0].replaceAll('\\','/');
 if(path.endsWith('/src/ui/View3D.tsx')) code=code.replace(/const stats = r.setMap\(props.view(?:, keep)?\);/, m => 'performance.mark("fl:render-start"); '+m+' performance.mark("fl:map-frame");');
 if(path.endsWith('/src/editor/view/useReady.ts')) code=code.replace('setViewTick((n) => n + 1);\n  }','setViewTick((n) => n + 1); performance.mark("fl:handlers"); requestAnimationFrame(() => requestAnimationFrame(() => performance.mark("fl:editable-frame")));\n  }');
 if(path.endsWith('/src/worker/generator.worker.ts')) code=code.replace('expose(api);', `const measured = Object.fromEntries(Object.entries(api).map(([name, fn]) => [name, (...args: any[]) => { const mark = (phase: string) => self.postMessage({__firstLoad:true,name:name+":"+phase,epoch:performance.timeOrigin+performance.now()}); mark("start"); try {const r=(fn as Function)(...args); if(r && typeof r.then === "function")return r.then((v:any)=>{mark("end");return v;},(e:any)=>{mark("error");throw e;});mark("end");return r;}catch(e){mark("error");throw e;}}])); self.postMessage({__firstLoad:true,name:"worker-evaluated",epoch:performance.timeOrigin+performance.now()}); expose(measured);`);
 const bridges={'/src/core/sim/rustWater.ts':'water','/src/core/forces/rust/bridge.ts':'forces','/src/core/analysis/rust/bridge.ts':'analysis','/src/core/validate/rust.ts':'validate'};
 for(const [suffix,name] of Object.entries(bridges)) if(path.endsWith(suffix)) code=code.replace('new WebAssembly.Module(bytes)', `(()=>{const start=performance.now();const result=new WebAssembly.Module(bytes);const duration=performance.now()-start;performance.measure("fl:wasm-${name}",{start,duration});if(typeof document==="undefined")self.postMessage({__firstLoad:true,name:"wasm-${name}:compile",duration,epoch:performance.timeOrigin+performance.now()});return result;})()`);
 if(path.endsWith('/src/render3d/prepared.ts')) code=code.replace('host.append(canvas);','host.append(canvas); performance.mark("fl:prepare-start");').replace('renderer.prepareFirstFrame().catch(', 'renderer.prepareFirstFrame().then(() => { performance.mark("fl:prepare-end"); }).catch(');
 if(path.endsWith('/src/worker/session.ts')) code=code.replace('export function follow(p: FollowPayload): FollowResult {', 'export function follow(p: FollowPayload): FollowResult { performance.mark("fl:replica-follow"); self.postMessage({__firstLoad:true,name:"replica-follow",epoch:performance.timeOrigin+performance.now()});');
 return code===original ? null : {code,map:null};
}};}
await build({root:source,publicDir:resolve('public'),configFile:resolve(source,'vite.config.ts'),plugins:[probe()],worker:{plugins:()=>wasm?[wasm(),probe()]:[probe()]},build:{outDir:resolve('investigation/first-load/local/dist-'+label),emptyOutDir:true}});



if (process.argv[3]) copyFileSync(resolve(source,'public/sw.js'),resolve('investigation/first-load/local/dist-'+label,'sw.js'));
