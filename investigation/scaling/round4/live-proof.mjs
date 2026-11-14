// Reuse the measured cold-store artifacts to verify the entire live-session undo range.
// Gunzip member boundaries recover the append-only test store's inverse-frame index.
import assert from 'node:assert/strict';
import {openSync,readSync,closeSync,statSync,readFileSync,writeFileSync} from 'node:fs';
import {Gunzip} from 'fflate';
import {createHash} from 'node:crypto';
import {FileResults} from '../round2/node-store.mjs';
import * as L from '../local/round2/after.mjs';
const size=Number(process.argv[2]??256),root='investigation/scaling/local/round4/'+(process.env.SCALING_R4_FIXTURES??'final')+'/',file=root+size+'-0.cache',oracle=JSON.parse(readFileSync(root+size+'-0.json'));
assert(oracle.passed&&oracle.steps===2048);
const fd=openSync(file,'r'),members=[];let start=0,prefix='',step=0;
function finish(end){if(prefix.startsWith('["roots"')||prefix.startsWith('IPB1')){step++;members.push({at:Math.min(step,2048),offset:start,bytes:end-start});}start=end;prefix='';}
const unzip=new Gunzip(b=>{if(prefix.length<16)prefix+=new TextDecoder().decode(b.subarray(0,16-prefix.length));});unzip.onmember=finish;
const len=statSync(file).size;for(let at=0;at<len;at+=32768){const b=new Uint8Array(Math.min(32768,len-at));readSync(fd,b,0,b.length,at);unzip.push(b,at+b.length===len);}finish(len);
assert(step>=2048&&step<=2049,'expected one patch per edit plus optional final canonical adoption');const index=new Map(members.map(x=>[x.at,x]));assert.equal(index.size,2048);
const disk=new FileResults(root+size+'-live-proof.cache'),cold={put:(k,b)=>disk.put(k,b),get:k=>{if(disk.offsets.has(k))return disk.get(k);const item=index.get(k-L.CHECKPOINT_KEY);if(!item)throw Error('missing recovered history patch');const b=new Uint8Array(item.bytes);assert.equal(readSync(fd,b,0,b.length,item.offset),b.length);return b;}};
function* chunks(path){const f=openSync(path,'r');try{for(;;){const b=new Uint8Array(32768),n=readSync(f,b);if(!n)break;yield b.subarray(0,n);}}finally{closeSync(f);}}
const raw=s=>{const d=createHash('sha256'),b=s.built;for(const v of [b.heights,b.water,b.contamination,b.moisture,b.soilContamination,L.rockOf(s)])if(v)d.update(new Uint8Array(v.buffer,v.byteOffset,v.byteLength));d.update(JSON.stringify(b.entities));d.update(JSON.stringify(s.features));d.update(JSON.stringify([...L.fallenOf(s)]));return d.digest('hex');};
// Match oracle order: rock comes after objects/features.
const state=s=>{const d=createHash('sha256'),b=s.built;for(const v of [b.heights,b.water,b.contamination,b.moisture,b.soilContamination])if(v)d.update(new Uint8Array(v.buffer,v.byteOffset,v.byteLength));d.update(JSON.stringify(b.entities));d.update(JSON.stringify(s.features));const lava=L.rockOf(s);if(lava)d.update(new Uint8Array(lava.buffer,lava.byteOffset,lava.byteLength));d.update(JSON.stringify([...L.fallenOf(s)]));return d.digest('hex');};
try{const h=await L.GestureHistory.open(chunks(root+size+'-0.dgm'),cold);h.undoFloor=0;h.patchIndex=[...index.values()].map(x=>({at:x.at,bytes:x.bytes,results:[],blobs:[]}));const started=Date.now();
for(let n=2047;n>=0;n--){assert(h.undo());assert.equal(state(h.session),oracle.trace[n],'live undo '+n);if(n%256===0)console.log(size,'undo',n);}
assert(!h.undo());for(let n=1;n<=2048;n++){assert(h.redo());assert.equal(state(h.session),oracle.trace[n],'live redo '+n);if(n%256===0)console.log(size,'redo',n);}
assert(!h.redo());writeFileSync(root+size+'-live-proof.json',JSON.stringify({passed:true,size,positions:2049,undoTransitions:2048,redoTransitions:2048,ms:Date.now()-started,cache:h.checkpointStats,indexRecoveredFromGzipMembers:true}));
}finally{disk.close();closeSync(fd);}
