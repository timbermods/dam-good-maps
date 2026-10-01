import assert from 'node:assert/strict';
import {openSync,writeSync,readSync,closeSync,statSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {dir} from './overlay.mjs';
const L=await import(pathToFileURL(resolve(dir,'../local/round2/after.mjs')).href),text='x'.repeat(2048),count=270000,value={list:Array(count).fill(text)};
// A scalar stays modest; the full JSON exceeds V8's independently observed string boundary.
assert.throws(()=>JSON.stringify(value),RangeError);
let plainBytes=0,maxChunk=0;for(const b of L.projectJsonChunks(value)){plainBytes+=b.length;maxChunk=Math.max(maxChunk,b.length);}assert(plainBytes>536870888);
const file=resolve(dir,'../local/round2/string-limit.json.gz'),fd=openSync(file,'w');try{await L.writeProject(value,async b=>writeSync(fd,b));}finally{closeSync(fd);}
const f=openSync(file,'r');let opened;try{opened=await L.readProject((async function*(){for(;;){const b=new Uint8Array(32768),n=readSync(f,b);if(!n)break;yield b.subarray(0,n);}})());}finally{closeSync(f);}
assert.equal(opened.list.length,count);for(const s of opened.list)assert.equal(s,text);
const result={plainBytes,gzipBytes:statSync(file).size,maxChunk,items:count,giantStringFailed:true,streamedSaveAndRead:true,peakRSS_KiB:process.resourceUsage().maxRSS};
writeFileSync(resolve(dir,'../local/round2/string-limit.json'),JSON.stringify(result,null,2));console.log(result);
