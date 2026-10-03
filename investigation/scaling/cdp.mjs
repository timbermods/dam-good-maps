export async function connect(url){
  const ws=new WebSocket(url);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});let seq=0;const pending=new Map();
  ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);if(m.error)p?.reject(Error(JSON.stringify(m.error)));else p?.resolve(m.result);}};
  return {send(method,params={},sessionId){return new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));});},close(){ws.close();}};
}
if(process.argv[1]?.endsWith('cdp.mjs')){
  const v=await(await fetch('http://localhost:9472/json/version')).json(),c=await connect(v.webSocketDebuggerUrl);
  const {targetInfos}=await c.send('Target.getTargets');
  for(const t of targetInfos){if(!['page','worker'].includes(t.type))continue;const {sessionId}=await c.send('Target.attachToTarget',{targetId:t.targetId,flatten:true});
    console.log(t.type,t.url,JSON.stringify(await c.send('Runtime.getHeapUsage',{},sessionId)));
    if(t.type==='page')console.log(JSON.stringify(await c.send('Runtime.evaluate',{expression:"JSON.stringify({force:window.dgmEditor?.force(),info:window.dgmEditor?.info(),selection:window.dgmEditor?.selection()?.length,buttons:[...document.querySelectorAll('button')].map(x=>[x.textContent,x.getAttribute('aria-label')])})",returnByValue:true},sessionId)));
  }c.close();
}
