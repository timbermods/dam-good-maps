// CDP diagnostics for this investigation's Chrome only. Never collect during the measured hour.
import {mkdirSync, createWriteStream, writeFileSync} from 'node:fs';
const out='investigation/long-session/local/hour';
const version=await(await fetch('http://localhost:4191/json/version')).json();
const ws=new WebSocket(version.webSocketDebuggerUrl);
await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
let next=0;const pending=new Map();const streams=new Map();
ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(new Error(JSON.stringify(m.error))):p.resolve(m.result);}else if(m.method==='HeapProfiler.addHeapSnapshotChunk'){streams.get(m.sessionId)?.write(m.params.chunk);}};
function send(method,params={},sessionId){return new Promise((resolve,reject)=>{const id=++next;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));});}
const {targetInfos}=await send('Target.getTargets');
const wanted=targetInfos.filter(t=>['page','worker'].includes(t.type)&&t.url.startsWith('http://localhost:4189/'));
const samples=[];
for(let i=0;i<wanted.length;i++){
 const t=wanted[i],{sessionId}=await send('Target.attachToTarget',{targetId:t.targetId,flatten:true});
 try{
  const usage=await send('Runtime.getHeapUsage',{},sessionId);
  const s=await send('Runtime.evaluate',{expression:'JSON.stringify(globalThis.__longSession?.snapshot()||null)',returnByValue:true},sessionId);
  const row={...t,usage,probe:JSON.parse(s.result.value||'null')};samples.push(row);console.log(JSON.stringify(row));
  if(process.argv.includes('--heap')){
   const name=`${i}-${t.type}-${t.url.split('/').at(-1).replace(/[^\w.-]/g,'_')}.heapsnapshot`;
   const stream=createWriteStream(out+'/'+name);streams.set(sessionId,stream);
   await send('HeapProfiler.takeHeapSnapshot',{reportProgress:false},sessionId);
   await new Promise(resolve=>stream.end(resolve));streams.delete(sessionId);row.afterSnapshot=await send('Runtime.getHeapUsage',{},sessionId);console.log('SAVED',name);
  }
 }finally{await send('Target.detachFromTarget',{sessionId});}
}
writeFileSync(out+'/diagnostics.json',JSON.stringify(samples,null,2));ws.close();
