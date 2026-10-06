// Restores measurement of pre-existing workers after a Playwright CDP reconnect.
import {readFileSync,appendFileSync,existsSync} from 'node:fs';
const out='investigation/long-session/local/hour';
const rows=readFileSync(out+'/session.jsonl','utf8').trim().split('\n').map(JSON.parse);
const baseline=rows.find(r=>r.kind==='sample'&&r.label==='baseline');
const prior=rows.filter(r=>r.kind==='sample'&&r.liveWorkers>=6&&r.workers?.length>=6).at(-1);
const start=Date.parse(baseline.at)-baseline.elapsedMs;
let born=prior.born,dead=prior.dead,next=born,ids=new Map(),known=new Map();
const v=await(await fetch('http://localhost:4191/json/version')).json();
const ws=new WebSocket(v.webSocketDebuggerUrl);await new Promise(r=>ws.onopen=r);
let n=0;const pending=new Map();
ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(new Error(JSON.stringify(m.error))):p.resolve(m.result);}};
function send(method,params={},sessionId){return new Promise((resolve,reject)=>{const id=++n;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params,sessionId}));});}
let first=true;
async function sample(){
 const {targetInfos}=await send('Target.getTargets');
 const targets=targetInfos.filter(t=>t.type==='worker'&&t.url.startsWith('http://localhost:4189/'));
 const live=new Set(targets.map(t=>t.targetId));
 for(const [id,t] of known)if(!live.has(id)){dead++;known.delete(id);}
 const workers=[];
 for(const t of targets){
  let sessionId;
  try{
   ({sessionId}=await send('Target.attachToTarget',{targetId:t.targetId,flatten:true}));
   const r=await send('Runtime.evaluate',{expression:'JSON.stringify(globalThis.__longSession?.snapshot()||{missingProbe:true})',returnByValue:true},sessionId);
   const p=JSON.parse(r.result.value);
   if(!ids.has(t.targetId)){
    const old=first?prior.workers.find(w=>w.url===t.url&&w.wasm?.[0]?.bytes===p.wasm?.[0]?.bytes):null;
    const id=old?.id||++next;ids.set(t.targetId,id);if(!old)born++;
   }
   known.set(t.targetId,t);workers.push({id:ids.get(t.targetId),url:t.url,...p});
  }catch(e){workers.push({id:ids.get(t.targetId),url:t.url,error:String(e)});}
  finally{if(sessionId)await send('Target.detachFromTarget',{sessionId}).catch(()=>{});}
 }
 first=false;
 const row={kind:'worker-sample',at:new Date().toISOString(),elapsedMs:Date.now()-start,source:'CDP reconnect supplement',liveWorkers:targets.length,born,dead,workers};
 appendFileSync(out+'/session.jsonl',JSON.stringify(row)+'\n');
 console.log(JSON.stringify({seconds:Math.round(row.elapsedMs/1000),liveWorkers:row.liveWorkers,workers:workers.map(w=>({id:w.id,type:w.url.split('/').at(-1),wasm:w.wasm}))}));
}
await sample();
for(;;){await new Promise(r=>setTimeout(r,30000));await sample();if(existsSync(out+'/completion.json')&&JSON.parse(readFileSync(out+'/completion.json','utf8')).completed)break;}
ws.close();
