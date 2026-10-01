import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const code=readFileSync(new URL('cache-selection.js',import.meta.url),'utf8');
function setup(fails=false) {
  const stored=new Map(); let fetches=0;
  const cache={match:async r=>stored.get(r.url)?.clone(),put:async(r,v)=>stored.set(r.url,v),keys:async()=>[...stored.keys()].map(url=>({url})),delete:async r=>stored.delete(r.url)};
  const context={URL,self:{registration:{scope:'https://example.test/dam-good-maps/'}},caches:{open:async()=>{if(fails)throw Error('denied');return cache;}},fetch:async()=>{fetches++;return new Response('ok');}};
  vm.createContext(context);vm.runInContext(code,context);
  return {call:r=>context.startupResponse(r),fetches:()=>fetches,stored};
}
test('hashed assets survive a repeat request; stored map/index/navigation never enter cache',async()=>{
  const s=setup();const asset={url:'https://example.test/dam-good-maps/assets/Editor-AbcD1234.js',method:'GET'};
  assert.equal(await (await s.call(asset)).text(),'ok');assert.equal(await (await s.call(asset)).text(),'ok');assert.equal(s.fetches(),1);
  for(const path of ['','first-visit/index.json','first-visit/river-valley-1.json.gz','assets/file.js','assets/Editor-AbcD1234.js?v=2'])await s.call({url:'https://example.test/dam-good-maps/'+path,method:'GET'});
  await s.call({url:'https://elsewhere.test/dam-good-maps/assets/Editor-AbcD1234.js',method:'GET'});
  assert.equal(s.stored.size,1);assert.equal(s.fetches(),7);
});
test('denied Cache Storage returns the network response',async()=>{
  const s=setup(true);assert.equal(await (await s.call({url:'https://example.test/dam-good-maps/assets/Editor-AbcD1234.js',method:'GET'})).text(),'ok');
});
test('combined worker has one fetch listener and isolates both network and cache responses',async()=>{
  const listeners=new Map(),stored=new Map();let fetches=0;
  const context={URL,Headers,Response,self:{registration:{scope:'https://example.test/dam-good-maps/'},location:{origin:'https://example.test'},addEventListener:(name,fn)=>{const list=listeners.get(name)??[];list.push(fn);listeners.set(name,list);}},
    caches:{open:async()=>({match:async r=>stored.get(r.url)?.clone(),put:async(r,v)=>stored.set(r.url,v),keys:async()=>[],delete:async()=>true})},
    fetch:async()=>{fetches++;return new Response('same body');}};
  vm.createContext(context);vm.runInContext(readFileSync(new URL('local/cache-patch/next.js',import.meta.url),'utf8'),context);
  assert.equal(listeners.get('fetch').length,1);
  for(let i=0;i<2;i++){
    let pending;listeners.get('fetch')[0]({request:{url:'https://example.test/dam-good-maps/assets/Editor-AbcD1234.js',method:'GET',cache:'default',mode:'same-origin'},respondWith:p=>pending=p});
    const response=await pending;assert.equal(response.headers.get('Cross-Origin-Opener-Policy'),'same-origin');assert.equal(response.headers.get('Cross-Origin-Embedder-Policy'),'require-corp');assert.equal(await response.text(),'same body');
  }
  assert.equal(fetches,1);
});
