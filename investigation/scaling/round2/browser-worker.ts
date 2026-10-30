import {GestureHistory,OpfsResults,MapSession} from './library';
async function* chunks(stream:ReadableStream<Uint8Array>){const reader=stream.getReader();try{for(;;){const r=await reader.read();if(r.done)break;yield r.value;}}finally{reader.releaseLock();}}
const hex=(b:ArrayBuffer)=>[...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('');
onmessage=async(e:MessageEvent)=>{
 const stores:OpfsResults[]=[];let output:FileSystemFileHandle|undefined,dir:FileSystemDirectoryHandle|undefined,name='',reply:unknown;
 try{
  // Test adapter only: this Windows WebKit build has no Storage API. Its tiny oracle tests
  // exercise replay math, not bounded disk storage. Never use this adapter in the product.
  const cache=async()=>{if(e.data.oracleOnly){const m=new Map<number,Uint8Array>();return {put:(k:number,b:Uint8Array)=>m.set(k,b),get:(k:number)=>m.get(k)!};}const s=await OpfsResults.open(crypto.randomUUID());stores.push(s);return s;};
  const start=performance.now(),response=await fetch(e.data.path),h=await GestureHistory.open(chunks(response.body!),await cache(),{},async(done,total)=>{if(done%256===0)postMessage({progress:done,total});});
  if(h instanceof MapSession)throw Error('expected gesture project');h.session.settleCanonical();
  const exported=h.session.exportTimber(),hash=hex(await crypto.subtle.digest('SHA-256',exported.bytes! as BufferSource));
  if(hash!==e.data.hash)throw Error('cross-browser export differs');const openMs=performance.now()-start;
  let bytes=0,maxWrite=0,parts:Uint8Array[]=[];
  const saveAt=performance.now();
  if(e.data.oracleOnly)await h.save(async b=>{parts.push(b);bytes+=b.length;maxWrite=Math.max(maxWrite,b.length);});
  else{dir=await navigator.storage.getDirectory();name=crypto.randomUUID()+'.dgm';output=await dir.getFileHandle(name,{create:true});const handle=await output.createSyncAccessHandle();try{await h.save(async b=>{maxWrite=Math.max(maxWrite,b.length);let n=0;while(n<b.length){const wrote=handle.write(b.subarray(n),{at:bytes+n});if(!wrote)throw Error('short save');n+=wrote;}bytes+=b.length;});handle.flush();}finally{handle.close();}}
  const saveMs=performance.now()-saveAt,reopenAt=performance.now(),again=await GestureHistory.open(output?chunks((await output.getFile()).stream()):parts,await cache());
  if(again instanceof MapSession)throw Error('expected reopened journal');again.session.settleCanonical();const second=again.session.exportTimber();
  if(hex(await crypto.subtle.digest('SHA-256',second.bytes! as BufferSource))!==hash)throw Error('OPFS saved replay differs');
  reply={result:{openMs,saveMs,reopenMs:performance.now()-reopenAt,bytes,maxWrite,hash,count:h.count,cache:h.results.stats,undo:h.session.historyCacheStats,storage:e.data.oracleOnly?'small RAM oracle only':'worker OPFS'}};
 }catch(error){reply={error:String(error),stack:(error as Error).stack};}
 finally{for(const s of stores)await s.dispose();if(output&&dir)await dir.removeEntry(name);}
 postMessage(reply);
};
