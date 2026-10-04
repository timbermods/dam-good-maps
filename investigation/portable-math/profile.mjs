import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import os from 'node:os';
import {deps,HERE,LOCAL,json,hash} from './common.mjs';
import {firefoxRuntime} from './firefox-runtime.mjs';
import {loadSampler} from './load.mjs';
import {host} from './host.mjs';
await deps('esbuild').build({stdin:{contents:`import * as portable from ${JSON.stringify(resolve(HERE,'portable.ts').replaceAll('\\','/'))};globalThis.portable=portable;`,resolveDir:HERE},outfile:resolve(LOCAL,'profile-math.js'),bundle:true,format:'esm',platform:'browser'});
const corrected=firefoxRuntime(),h=await host(),sampler=loadSampler();let browser;
const report={cpu:os.cpus()[0].model,threads:os.cpus().length,platform:os.platform(),runtime:corrected.evidence,method:'128 fixed finite inputs; untimed bit identity, warmup, rotating native/TS/Rust order; each recorded run lasts at least 3 seconds. Every timing has its own PDH CPU cohort. Mean load above 20%, or missing load, is provisional.',fingerprints:{ts:hash(readFileSync(resolve(LOCAL,'profile-math.js'))),rust:hash(readFileSync(resolve(LOCAL,'rust-math-wasm.wasm')))},records:[]};
try{
 browser=await deps('playwright').firefox.launch({headless:true,...corrected.options});report.version=browser.version();const p=await browser.newPage();await p.goto(h.url);await p.addScriptTag({url:h.url+'profile-math.js',type:'module'});await p.waitForFunction(()=>window.portable);
 await p.evaluate(async bytes=>{const {instance}=await WebAssembly.instantiate(Uint8Array.from(bytes));window.rust=instance.exports.portable_eval;for(const [name,op]of [['exp',3],['hypot',7],['pow',6]])for(let i=0;i<128;i++){const x=name==='exp'?(i-64)/8:name==='pow'?1+i/64:(i-64)/8,y=name==='pow'?1.2:(i-20)/4,z=name==='hypot'?i/8:0;const a=name==='hypot'?window.portable[name](x,y,z):name==='pow'?window.portable[name](x,y):window.portable[name](x);if(!Object.is(a,window.rust(op,x,y,z)))throw Error('Before-timing identity '+name);}},Array.from(readFileSync(resolve(LOCAL,'rust-math-wasm.wasm'))));
 // Initialize PDH before any timing cohort and discard all warmup clocks.
 await p.evaluate(()=>{for(let k=0;k<10000;k++){window.portable.exp(k%16-8);window.rust(3,k%16-8,0,0);}});
 for(const [name,op]of [['exp',3],['hypot',7],['pow',6]])for(let rep=0;rep<3;rep++)for(let offset=0;offset<3;offset++){
  const variant=['native','typescript','rust'][(rep+offset)%3];sampler.reset();const started=new Date().toISOString();
  const timing=await p.evaluate(({name,op,variant})=>{const args=Array.from({length:128},(_,i)=>({x:name==='exp'?(i-64)/8:name==='pow'?1+i/64:(i-64)/8,y:name==='pow'?1.2:(i-20)/4,z:name==='hypot'?i/8:0}));const f=variant==='native'?Math[name]:variant==='typescript'?window.portable[name]:(x,y,z)=>window.rust(op,x,y,z);let calls=0,sink=0;const start=performance.now();do{for(let k=0;k<128;k++){const {x,y,z}=args[k];sink+=name==='hypot'?f(x,y,z):name==='pow'?f(x,y):f(x,0,0);}calls+=128;}while(performance.now()-start<3000);return {ms:performance.now()-start,calls,sink};},{name,op,variant});
  const load=sampler.summary(),record={name,variant,rep,started,...timing,nsPerCall:timing.ms*1e6/timing.calls,load,provisional:load.mean===null||load.mean>20};report.records.push(record);json('profile-full.json',report);console.log('Profile',name,variant,rep,load.mean,record.provisional?'provisional':'measured');
 }
}finally{await browser?.close();sampler.stop();h.close();}
writeFileSync(resolve(HERE,'PROFILE_TIMINGS.csv'),['function,variant,repetition,ns_per_call,cpu_mean_percent,cpu_peak_percent,cpu_samples,provisional',...report.records.map(r=>[r.name,r.variant,r.rep,r.nsPerCall,r.load.mean,r.load.max,r.load.samples,r.provisional].join(','))].join('\n')+'\n');
json('profile-summary.json',{...report,records:report.records.map(({sink,...r})=>r)});
