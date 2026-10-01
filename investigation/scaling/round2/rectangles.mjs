import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {dir} from './overlay.mjs';
import {FileResults} from './node-store.mjs';
const L=await import(pathToFileURL(resolve(dir,'../local/round2/after.mjs')).href),results=[];
const digest=s=>{s.settleCanonical();const h=createHash('sha256'),b=s.built;h.update(s.exportTimber().bytes);for(const v of [b.heights,b.water,b.contamination,b.moisture,b.soilContamination,L.rockOf(s)])if(v)h.update(new Uint8Array(v.buffer,v.byteOffset,v.byteLength));h.update(JSON.stringify([...L.fallenOf(s)]));return h.digest('hex');};
for(const [W,H]of [[128,512],[512,256]]){
 const stores=[],cold=()=>{const s=new FileResults(resolve(dir,`../local/round2/rectangle-${W}-${H}-${stores.length}.cache`));stores.push(s);return s;};
 try{const base=L.MapSession.importMap(readFileSync(resolve(dir,`../local/probe/sizes-${W}x${H}.timber`)),'probe.timber').document,h=new L.GestureHistory(base,cold(),`rectangle-${W}-${H}`,0,{snapshots:0,results:1,steps:1}),states=[digest(h.session)];
 h.apply([{op:'sculpt',params:{mode:'flatten',cells:Array.from({length:H},(_,y)=>[y,0,W-1]),level:11,exact:true}}]);states.push(digest(h.session));
 await h.select({action:'remove',area:Array.from({length:H},(_,y)=>[y,0,W-1]),kinds:['trees','bushes','ruins','sources','slopes','objects','start']});states.push(digest(h.session));
 h.apply([{op:'brush',params:{tool:'naturalize',size:20,strength:1,seed:123,level:10,dabs:[W*2,H*2,W*2+4,H*2+4]}}]);states.push(digest(h.session));
 for(let i=states.length-2;i>=0;i--){assert(h.undo());assert.equal(digest(h.session),states[i]);}for(let i=1;i<states.length;i++){assert(h.redo());assert.equal(digest(h.session),states[i]);}
 const chunks=[];await h.save(async b=>chunks.push(b));const reopened=await L.GestureHistory.open(chunks,cold(),{snapshots:0,results:1,steps:1});assert.equal(digest(reopened.session),states.at(-1));results.push({W,H,states:states.length,parity:true});console.log(W,H,'cold canonical undo/redo and streamed reopening exact');
 }finally{for(const s of stores)s.close();}
}
writeFileSync(resolve(dir,'../local/round2/rectangles.json'),JSON.stringify(results,null,2));
