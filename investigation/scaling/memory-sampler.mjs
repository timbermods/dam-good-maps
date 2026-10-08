export async function memorySampler(cdp){
  const sessions=[];
  async function discover(){for(const t of (await cdp.send('Target.getTargets')).targetInfos.filter(t=>['page','worker'].includes(t.type)&&!sessions.some(s=>s.targetId===t.targetId))){const {sessionId}=await cdp.send('Target.attachToTarget',{targetId:t.targetId,flatten:true});sessions.push({...t,sessionId});}}
  await discover();let discoveredAt=Date.now();
  const samples=[];let active=true,paused=false,measuring=false;
  const loop=(async()=>{while(active){if(paused){await new Promise(r=>setTimeout(r,10));continue;}measuring=true;try{const at=Date.now(),targets=[];if(at-discoveredAt>=500){await discover();discoveredAt=at;}for(const s of sessions){try{targets.push({type:s.type,url:s.url,heap:await cdp.send('Runtime.getHeapUsage',{},s.sessionId)});}catch(e){targets.push({type:s.type,error:String(e)});}}samples.push({at,targets});}finally{measuring=false;}await new Promise(r=>setTimeout(r,100));}})();
  return {async pause(){paused=true;while(measuring)await new Promise(r=>setTimeout(r,10));},resume(){paused=false;},async stop(){active=false;await loop;for(const s of sessions)await cdp.send('Target.detachFromTarget',{sessionId:s.sessionId}).catch(()=>{});return samples;}};
}
