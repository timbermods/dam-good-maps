import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const code=readFileSync(process.env.FL_SW_PATH || 'investigation/first-load/local/page-adopted/public/sw.js','utf8');
function setup({unavailable=false,status=200}={}) {
 const listeners=new Map(), entries=new Map();let fetched=0,skip=0;
 const cache={match:async request=>entries.get(request.url)?.clone(),put:async(request,response)=>entries.set(request.url,response.clone()),keys:async()=>Array.from(entries.keys()).map(k=>new Request(k)),delete:async request=>entries.delete(request.url)};
 const scope='https://example.test/preview/';
 const sandbox={URL,Request,Response,Headers,Map,console,caches:{open:async()=>{if(unavailable)throw Error('no storage');return cache;}},fetch:async()=>{fetched++;return new Response(new Uint8Array([0,17,128,255]),{status});},self:{location:{href:scope+'sw.js',origin:'https://example.test'},registration:{scope},skipWaiting:()=>{skip++},clients:{claim:async()=>{}},addEventListener:(kind,handler)=>{const list=listeners.get(kind)||[];list.push(handler);listeners.set(kind,list);}}};
 vm.runInNewContext(code,sandbox);
 async function request(path,options){let promise;const req=new Request(scope+path,options);listeners.get('fetch')[0]({request:req,respondWith:p=>promise=p});return promise?await promise:null;}
 return {request,listeners,entries,get fetched(){return fetched;},get skip(){return skip;}};
}
test('one fetch handler; same bytes and isolation for network and cache hits',async()=>{
 const h=setup();assert.equal(h.listeners.get('fetch').length,1);assert.equal(h.skip,0);
 for(let i=0;i<2;i++){const r=await h.request('assets/core-AbCd1234.wasm');assert.deepEqual(Array.from(new Uint8Array(await r.arrayBuffer())),[0,17,128,255]);assert.equal(r.headers.get('Cross-Origin-Opener-Policy'),'same-origin');assert.equal(r.headers.get('Cross-Origin-Embedder-Policy'),'require-corp');}assert.equal(h.fetched,1);
});
test('navigation, projects, queries and ranges remain network requests',async()=>{
 const h=setup();for(const path of ['index.html','first-visit/index.json','project.json','assets/core-AbCd1234.js?v=2']){await h.request(path);await h.request(path);}await h.request('assets/core-AbCd1234.js',{headers:{range:'bytes=0-5'}});assert.equal(h.entries.size,0);assert.equal(h.fetched,9);
});
test('partial responses and unavailable storage fail open',async()=>{
 const partial=setup({status:206});await partial.request('assets/core-AbCd1234.js');assert.equal(partial.entries.size,0);const h=setup({unavailable:true});for(let i=0;i<2;i++)assert.equal((await h.request('assets/core-AbCd1234.js')).status,200);assert.equal(h.fetched,2);
});
test('immutable cache is bounded and previews keep their own scope',async()=>{
 const h=setup();for(let i=0;i<67;i++)await h.request('assets/core'+i+'-AbCd1234.js');assert.equal(h.entries.size,64);assert.ok(Array.from(h.entries.keys()).every(k=>k.startsWith('https://example.test/preview/assets/')));
});
