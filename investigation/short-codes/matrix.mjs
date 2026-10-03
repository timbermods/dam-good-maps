// Real ICE/DTLS/SCTP from file://. Never starts a server; browsers only use STUN if asked.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
const here=path.dirname(fileURLToPath(import.meta.url));
const pw=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const url=pathToFileURL(path.join(here,'local/demo.html')).href;
const browsers={}, report={date:'2026-10-01',engines:{},runs:[],twoDevices:{status:'unverified',reason:'Only this Windows machine is accessible. Follow README transfer procedure.'}};
await mkdir(path.join(here,'local'),{recursive:true});
async function page(engine){const p=await browsers[engine].newPage();p.on('request',r=>assert.ok(r.url().startsWith('file:'),r.url()));await p.goto(url);await p.waitForFunction(()=>window.spike);return p;}
async function prepare(p,isOffer,remote,encoding,policy,stun) {
  return p.evaluate(async ({isOffer,remote,encoding,policy,stun})=>{
    const pc=new RTCPeerConnection({iceServers:stun?[{urls:'stun:stun.l.google.com:19302'}]:[]});
    const state=window.probe={pc,received:[],opened:false,dc:null};
    function wire(dc){state.dc=dc;dc.onopen=()=>{state.opened=true;};dc.onmessage=e=>state.received.push(e.data);}
    if(isOffer)wire(pc.createDataChannel('short-code-proof',{ordered:true}));else{pc.ondatachannel=e=>wire(e.channel);await pc.setRemoteDescription(window.spike.codec.decode(remote));}
    await pc.setLocalDescription(isOffer?await pc.createOffer():await pc.createAnswer());
    await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(Error('ICE gathering timed out (20s).')),20000);
      const check=()=>{if(pc.iceGatheringState==='complete'){clearTimeout(timer);pc.removeEventListener('icegatheringstatechange',check);resolve();}};
      pc.addEventListener('icegatheringstatechange',check);check();
    });
    const d=pc.localDescription.toJSON(),c=window.spike.codec.encode(d,encoding,policy),long=window.spike.codec.longEncode(d);
    const comparisons=Object.fromEntries(['all','udp-only','first'].map(p=>[p,window.spike.codec.encode(d,encoding,p)]));
    // Actual credentials/fingerprint survive; all alphabets produce the same SDP.
    const decoded=window.spike.codec.decode(c.code);
    for(const e of ['base64url','base58','base32','base85']) {
      const variant=window.spike.codec.encode(d,e,policy).code;
      if(JSON.stringify(window.spike.codec.decode(variant))!==JSON.stringify(decoded))throw Error('Alphabet decoded differently.');
    }
    for(const prefix of ['a=ice-ufrag:','a=ice-pwd:','a=fingerprint:']){
      const field=d.sdp.split('\r\n').find(l=>l.startsWith(prefix));
      if(!decoded.sdp.includes(field+'\r\n'))throw Error('Lost identity field: '+prefix);
    }
    if(c.profile==='compact'&&window.spike.codec.encode(decoded,encoding).code!==c.code)throw Error('Non-canonical roundtrip.');
    return {code:encoding==='long'?long.code:c.code,description:d,short:c,long,comparisons};
  },{isOffer,remote,encoding:encoding==='long'?'base64url':encoding,policy,stun});
}
async function run(hostEngine,guestEngine,encoding='base64url',policy='all',stun=false) {
  const row={host:hostEngine,guest:guestEngine,encoding,policy,stun},start=performance.now();let h,g;
  console.log(`Connect ${hostEngine} → ${guestEngine}, ${encoding}, ${policy}, STUN ${stun}`);
  try {
    h=await page(hostEngine);g=await page(guestEngine);
    row.invite=await prepare(h,true,null,encoding,policy,stun);
    // prepare takes a real code; override alphabet choice only at exchange boundary.
    if(encoding==='long')row.invite.code=row.invite.long.code;
    row.reply=await prepare(g,false,row.invite.code,encoding,policy,stun);
    if(encoding==='long')row.reply.code=row.reply.long.code;
    await h.evaluate(c=>window.probe.pc.setRemoteDescription(window.spike.codec.decode(c)),row.reply.code);
    await Promise.all([h,g].map(p=>p.waitForFunction(()=>window.probe.opened,{},{timeout:15000})));
    await h.evaluate(()=>window.probe.dc.send('host:'+ 'x'.repeat(12000)));
    await g.evaluate(()=>window.probe.dc.send('guest:'+ 'y'.repeat(12000)));
    await Promise.all([h,g].map(p=>p.waitForFunction(()=>window.probe.received.length===1,{},{timeout:10000})));
    assert.equal(await h.evaluate(()=>window.probe.received[0]),'guest:'+'y'.repeat(12000));
    assert.equal(await g.evaluate(()=>window.probe.received[0]),'host:'+'x'.repeat(12000));
    row.result='connected; bidirectional 12,000-character payloads match';
    row.network=await h.evaluate(async()=>{const s=await window.probe.pc.getStats(),out=[];s.forEach(x=>{if(x.type==='candidate-pair'&&x.state==='succeeded')out.push({pair:x,local:s.get(x.localCandidateId),remote:s.get(x.remoteCandidateId)});});return out;});
  }catch(e){row.result='failed';row.error=e.message;process.exitCode=1;}
  finally{row.ms=performance.now()-start;report.runs.push(row);if(h)await h.close();if(g)await g.close();await writeFile(path.join(here,'local/matrix.json'),JSON.stringify(report,null,2));}
}
try {
  for(const name of ['chromium','firefox','webkit']) {
    try {browsers[name]=await pw[name].launch({headless:true});const p=await page(name);
      report.engines[name]={version:browsers[name].version(),rtc:await p.evaluate(()=>typeof RTCPeerConnection==='function')};await p.close();
    }catch(e){report.engines[name]={unavailable:e.message};}
  }
  const engines=Object.keys(browsers).filter(n=>report.engines[n].rtc);
  for(const h of engines)for(const g of engines)for(const encoding of ['long','base64url'])await run(h,g,encoding);
  if(engines.includes('chromium'))for(const e of ['base58','base32','base85'])await run('chromium','chromium',e);
  if(engines.includes('firefox'))for(const p of ['udp-only','first'])await run('firefox','firefox','base64url',p);
  if(process.env.CHECK_STUN==='1'&&engines.includes('chromium'))for(const e of ['long','base64url'])await run('chromium','chromium',e,'all',true);
}finally{
  await writeFile(path.join(here,'local/matrix.json'),JSON.stringify(report,null,2));
  for(const b of Object.values(browsers))await b.close();
  console.log(JSON.stringify({engines:report.engines,runs:report.runs.map(r=>({host:r.host,guest:r.guest,encoding:r.encoding,policy:r.policy,result:r.result,error:r.error,invite:r.invite?.code.length,reply:r.reply?.code.length,profiles:[r.invite?.short.profile,r.reply?.short.profile]}))},null,2));
}
