import { encode, decode } from './codes';
import { makeSession, mapHash, VERSION, SETTINGS, brush, placement, force, mixed, random } from './model';
import type { EditOp } from '../../src/core/doc/ops';

const el = (id: string) => document.getElementById(id)!;
const input = el('input') as HTMLTextAreaElement;
const output = el('out') as HTMLTextAreaElement;
type Entry = { seq: number; op: EditOp; hash: string; id: string; author: string; submittedAt: number; hostRenderedAt: number; baseSeq: number };
type Message = Record<string, any>;
let session: ReturnType<typeof makeSession> | null = null;
let role: 'host' | 'guest' | null = null;
let pc: RTCPeerConnection | null = null;
let dc: RTCDataChannel | null = null;
let epoch = 0;
let seq = 0;
let hash = '';
let log: Entry[] = [];
let initialHash = '';
let ready = false;
let mismatch = false;
let checked = 0;
let peerChecked = 0;
let connectedAt = 0;
let startedAt = 0;
let lastSeen = 0;
let heartbeat: ReturnType<typeof setInterval> | null = null;
let connectTimer: ReturnType<typeof setTimeout> | null = null;
let queue: Promise<void> = Promise.resolve();
let receiver: { id: number; count: number; parts: string[]; bytes: number } | null = null;
let messageId = 0;
const clientId = crypto.randomUUID();
const pending = new Map<string, { start: number; resolve: (v: any) => void; timer: ReturnType<typeof setTimeout> }>();
const accepted = new Set<string>();
const metrics = { version: VERSION, settings: SETTINGS, codes: [] as any[], connections: [] as any[],
  checks: [] as any[], rejected: [] as any[], staleRequests: [] as any[], latencies: [] as any[], drops: [] as any[], errors: [] as string[] };
const now = () => performance.timeOrigin + performance.now();
function status(text: string) { el('status').textContent = text; }
function note(text: string) {
  const lines = (el('events').textContent || '').split('\n').slice(-18);
  lines.push(text);
  el('events').textContent = lines.join('\n');
}
function fail(error: any) {
  const text = error?.message || String(error);
  metrics.errors.push(text); note(text);
  status('Stopped: ' + text); ready = false;
}
function enqueue(task: () => Promise<any>) {
  const job = queue.then(task);
  queue = job.catch(fail);
  return job;
}
function render() {
  if (!session) return;
  const b = session.built;
  const canvas = el('map') as HTMLCanvasElement;
  const ctx = canvas.getContext('2d')!;
  const image = ctx.createImageData(48,48);
  for (let i=0;i<b.heights.length;i++) {
    const at = ((47-Math.floor(i/48))*48+i%48)*4;
    const h = b.heights[i];
    const rgb = b.water[i] > .015 ? [32,109,165] : [50+h*8,76+h*7,45+h*5];
    image.data.set([...rgb,255],at);
  }
  for (const e of b.entities) {
    if (e.x<0 || e.x>=48 || e.y<0 || e.y>=48) continue;
    const at=((47-e.y)*48+e.x)*4;
    image.data.set(e.template==='WaterSource' ? [105,230,255,255] : [202,220,147,255],at);
  }
  ctx.putImageData(image,0,0);
  proof();
}
function proof() {
  const state = mismatch ? 'MISMATCH — editing stopped' : ready && peerChecked===seq ? 'MATCH' : 'Waiting for peer check';
  el('proof').textContent = state + ' · ordered edit ' + seq + '\nSHA-256 ' + hash;
  el('proof').style.color = mismatch ? '#ffa890' : ready && peerChecked===seq ? '#a8e4b8' : '#e6eee8';
  el('details').textContent = role + ' · '+ checked +' local replay checks · '+peerChecked+' peer-confirmed edit · '+pending.size+' pending';
}
async function ensureSession() {
  if (session) return;
  status('Generating the same seed and settings…');
  await new Promise(r => setTimeout(r,0));
  session=makeSession(); hash=initialHash=await mapHash(session); render();
}
function endPending(reason: string) {
  for (const [id,p] of pending) {
    clearTimeout(p.timer); p.resolve({ ok:false, reason });
    metrics.rejected.push({id,reason,uncertain:true});
  }
  pending.clear();
}
function close(reason: string) {
  epoch++; ready=false;
  if (heartbeat) clearInterval(heartbeat); heartbeat=null;
  if (connectTimer) clearTimeout(connectTimer); connectTimer=null;
  if (dc) { dc.onclose=null; dc.onmessage=null; dc.close(); } dc=null;
  if (pc) { pc.onconnectionstatechange=null; pc.close(); } pc=null;
  receiver=null; endPending(reason);
  metrics.drops.push({reason,seq,at:now()});
  status(reason + (role==='host' ? ' Host keeps the map. Make a new Invite to reconnect.' : ' Ask the host for a new Invite. Your unconfirmed edits may not have reached the host.'));
  proof();
}
function active(e: number) { if(e!==epoch) throw Error('Connection was replaced.'); }
async function send(message: Message) {
  const channel=dc;
  if (!channel || channel.readyState!=='open') throw Error('Connection dropped before the message was sent.');
  const text=JSON.stringify(message);
  if (text.length>32*1024*1024) throw Error('Message exceeds spike replay limit.');
  const count=Math.ceil(text.length/12000);
  const id=++messageId;
  for(let part=0;part<count;part++) {
    while(channel.bufferedAmount>256*1024) {
      await new Promise(r=>setTimeout(r,10));
      if(channel.readyState!=='open') throw Error('Connection dropped during replay.');
    }
    channel.send(JSON.stringify({id,part,count,text:text.slice(part*12000,(part+1)*12000)}));
  }
}
function wire(channel: RTCDataChannel, e: number) {
  dc=channel;
  channel.onmessage=event=>{
    if(e!==epoch)return;
    try {
      if(typeof event.data!=='string' || event.data.length>20000) throw Error('Bad data frame.');
      const f=JSON.parse(event.data);
      if(!Number.isInteger(f.id) || !Number.isInteger(f.part) || !Number.isInteger(f.count) || f.count<1 || f.count>3000 || typeof f.text!=='string') throw Error('Bad data frame.');
      if(f.part===0) {
        if(receiver)throw Error('Incomplete message.');
        receiver={id:f.id,count:f.count,parts:[],bytes:0};
      }
      if(!receiver || receiver.id!==f.id || receiver.count!==f.count || f.part!==receiver.parts.length) throw Error('Data frames arrived out of order.');
      receiver.parts.push(f.text);receiver.bytes+=f.text.length;
      if(receiver.bytes>32*1024*1024)throw Error('Message exceeds spike replay limit.');
      lastSeen=performance.now();
      if(receiver.parts.length===f.count) {
        const m=JSON.parse(receiver.parts.join(''));receiver=null;
        void enqueue(async()=>{ if(e===epoch) await receive(m); });
      }
    }catch(error){ fail(error);close('Connection closed after invalid data.'); }
  };
  channel.onclose=()=>{ if(e===epoch)close('Connection dropped.'); };
  channel.onerror=()=>{ if(e===epoch)close('Connection error.'); };
  channel.onopen=()=>{
    if(e!==epoch)return;
    connectedAt=performance.now();lastSeen=connectedAt;
    if(connectTimer)clearTimeout(connectTimer);connectTimer=null;
    metrics.connections.push({role,transportMs:connectedAt-startedAt});
    status('Connected. Checking the map and replaying the host’s edits…');
    heartbeat=setInterval(()=>{
      if(e!==epoch)return;
      if(performance.now()-lastSeen>12000){close('Connection lost (no response for 12 seconds).');return;}
      void send({kind:'ping'}).catch(()=>close('Connection dropped.'));
    },2000);
    if(role==='guest') void send({kind:'hello',version:VERSION,settings:SETTINGS}).catch(fail);
  };
}
function createPeer(useStun: boolean) {
  close('Preparing fresh codes.');
  startedAt=performance.now();
  const e=epoch;
  const peer=pc=new RTCPeerConnection({ iceServers: useStun ? [{urls:'stun:stun.l.google.com:19302'}] : [] });
  peer.ondatachannel=event=>wire(event.channel,e);
  peer.onconnectionstatechange=()=>{
    if(e!==epoch)return;
    if(['disconnected','failed','closed'].includes(peer.connectionState)) close('Connection '+peer.connectionState+'.');
  };
  connectTimer=setTimeout(()=>{ if(e===epoch)close('Codes expired after five minutes. Make a new Invite and Reply.'); },300000);
  return {peer,e};
}
async function gather(peer: RTCPeerConnection, e: number) {
  // No trickle signaling: codes are emitted only after the complete ICE gather.
  await new Promise<void>((resolve,reject)=>{
    const timer=setTimeout(()=>{peer.removeEventListener('icegatheringstatechange',changed);reject(Error('Address lookup timed out. Try fresh codes or turn STUN off for the same network.'));},20000);
    function changed(){
      if(e!==epoch){clearTimeout(timer);peer.removeEventListener('icegatheringstatechange',changed);reject(Error('Connection replaced.'));return;}
      if(peer.iceGatheringState==='complete'){clearTimeout(timer);peer.removeEventListener('icegatheringstatechange',changed);resolve();}
    }
    peer.addEventListener('icegatheringstatechange',changed);changed();
  });
  active(e);
  const result=encode(peer.localDescription!);
  metrics.codes.push({role,...result,code:undefined,gatherMs:performance.now()-startedAt,stun:!!peer.getConfiguration().iceServers?.length});
  output.value=result.code;
  el('length').textContent=' '+result.rawChars+' → '+result.compressedChars+' characters';
  return result.code;
}
async function invite(useStun=(el('stun') as HTMLInputElement).checked) {
  await queue;
  if(role==='guest')throw Error('A guest must reopen the file to host a new map.');
  role='host';await ensureSession();
  const {peer,e}=createPeer(useStun);
  wire(peer.createDataChannel('ordered-map',{ordered:true}),e);
  status('Making Invite code…');
  await peer.setLocalDescription(await peer.createOffer());
  const code=await gather(peer,e);
  status('Invite ready. Send your code to the guest.');
  el('step').textContent='1. Copy your Invite and send it. 2. Paste the guest’s Reply below.';
  return code;
}
async function join() {
  await queue;
  if(role==='host' && log.length)throw Error('Reopen the file to join another host; this tab keeps your host log.');
  close('Joining.');role='guest';session=null;seq=0;hash='';checked=0;peerChecked=0;mismatch=false;
  output.value='';status('Paste the host’s Invite code.');
  el('step').textContent='1. Paste the host’s Invite below. 2. Send your Reply back.';
}
async function accept(code=input.value, useStun=(el('stun') as HTMLInputElement).checked) {
  const description=decode(code);
  if(role==='host') {
    if(!pc || description.type!=='answer' || pc.signalingState!=='have-local-offer')throw Error('The host needs a Reply to the current Invite.');
    await pc.setRemoteDescription(description);
    if(connectTimer)clearTimeout(connectTimer);
    const e=epoch;
    connectTimer=setTimeout(()=>{ if(e===epoch)close('Could not connect. These networks may block a direct connection; there is no relay.'); },45000);
    status('Reply accepted. Connecting…');return;
  }
  if(role!=='guest' || description.type!=='offer')throw Error('Choose Join a map and paste an Invite.');
  const {peer,e}=createPeer(useStun);
  status('Making Reply code…');
  await peer.setRemoteDescription(description);
  await peer.setLocalDescription(await peer.createAnswer());
  const reply=await gather(peer,e);
  status('Reply ready. Send it to the host.');
  el('step').textContent='Copy your Reply and send it to the host. Wait for the host to paste it.';
  return reply;
}
async function receive(m: Message) {
  if(m.kind==='ping'){await send({kind:'pong'});return;}
  if(m.kind==='pong')return;
  if(m.kind==='hello' && role==='host') {
    if(m.version!==VERSION || JSON.stringify(m.settings)!==JSON.stringify(SETTINGS)) throw Error('Both players need the same demo build and settings.');
    mismatch=false;peerChecked=-1;
    await send({kind:'begin',version:VERSION,settings:SETTINGS,initialHash,count:log.length});
    for(const entry of log)await send({kind:'commit',entry,replay:true});
    await send({kind:'end',seq,hash});
    return;
  }
  if(m.kind==='begin' && role==='guest') {
    if(m.version!==VERSION || JSON.stringify(m.settings)!==JSON.stringify(SETTINGS))throw Error('Demo build/settings differ.');
    session=null;seq=0;checked=0;hash='';peerChecked=-1;ready=false;mismatch=false;
    await ensureSession();
    if(hash!==m.initialHash){mismatch=true;await send({kind:'ack',seq:0,hash,ok:false});throw Error('Generated maps differ before any edit.');}
    await send({kind:'ack',seq:0,hash,ok:true});
    return;
  }
  if(m.kind==='commit' && role==='guest') {
    const entry=m.entry as Entry;
    if(!session || entry.seq!==seq+1)throw Error('Ordered log has a gap. Rejoin with fresh codes.');
    const result=session.apply(entry.op);
    if(!result.ok)throw Error('Host operation rejected here: '+result.errors.join('; '));
    seq=entry.seq;render();
    const renderedAt=now();hash=await mapHash(session);
    const ok=hash===entry.hash;checked++;
    metrics.checks.push({seq,hash,expected:entry.hash,ok,replay:!!m.replay});
    mismatch ||= !ok;
    await send({kind:'ack',seq,hash,ok,id:entry.id,renderedAt});
    peerChecked=seq;
    if(!m.replay && entry.author===clientId) {
      complete(entry.id,{ok,seq,peerRenderedAt:entry.hostRenderedAt});
    }
    proof();
    if(!ok)throw Error('Full map hash differs at edit '+seq+'.');
    return;
  }
  if(m.kind==='end' && role==='guest') {
    if(seq!==m.seq || hash!==m.hash)throw Error('Replay ended on a different map.');
    ready=true;peerChecked=seq;proof();
    metrics.connections[metrics.connections.length-1].readyMs=performance.now()-startedAt;
    status('Connected · maps match. Both players can edit.');
    await send({kind:'ready',seq,hash});return;
  }
  if(m.kind==='ready' && role==='host') {
    if(m.hash!==log.find(e=>e.seq===m.seq)?.hash && !(m.seq===0 && m.hash===initialHash))throw Error('Guest finished replay with a different hash.');
    ready=true;peerChecked=Math.max(peerChecked,m.seq);proof();
    metrics.connections[metrics.connections.length-1].readyMs=performance.now()-startedAt;
    status('Connected · maps match. Both players can edit.');return;
  }
  if(m.kind==='ack' && role==='host') {
    const expected=m.seq===0 ? initialHash : log[m.seq-1]?.hash;
    const ok=m.ok===true && m.hash===expected;
    metrics.checks.push({seq:m.seq,hash:m.hash,expected,ok});
    if(!ok){mismatch=true;throw Error('Guest hash differs at edit '+m.seq+'.');}
    peerChecked=Math.max(peerChecked,m.seq);checked++;proof();
    complete(m.id,{ok:true,seq:m.seq,peerRenderedAt:m.renderedAt});return;
  }
  if(m.kind==='request' && role==='host') {
    if(!ready){await send({kind:'reject',id:m.id,reason:'Map replay is still in progress.'});return;}
    await commit(m.op,m.id,m.author,m.submittedAt,m.baseSeq);return;
  }
  if(m.kind==='reject' && role==='guest') {
    metrics.rejected.push(m);note('Edit refused: '+m.reason);
    complete(m.id,{ok:false,reason:m.reason});return;
  }
  throw Error('Unexpected peer message.');
}
function complete(id: string, result: any) {
  const p=pending.get(id);if(!p)return;
  clearTimeout(p.timer);pending.delete(id);
  if(result.ok)metrics.latencies.push({id,seq:result.seq,confirmedMs:performance.now()-p.start,
    // Compare epoch clocks ONLY in the same-machine harness, never between devices.
    submittedAt:p.start+performance.timeOrigin,peerRenderedAt:result.peerRenderedAt});
  p.resolve(result);proof();
}
async function commit(op: EditOp, id: string, author: string, submittedAt: number, baseSeq: number) {
  if(!session || mismatch)throw Error('Map is unavailable or differs.');
  if(accepted.has(id))return;
  if(baseSeq!==seq)metrics.staleRequests.push({id,op:op.op,baseSeq,hostSeq:seq});
  const result=session.apply(op);
  if(!result.ok) {
    const reason=result.errors.join('; ');
    metrics.rejected.push({id,reason});note('Edit refused: '+reason);
    if(author!==clientId && dc?.readyState==='open')await send({kind:'reject',id,reason});
    else complete(id,{ok:false,reason});
    return;
  }
  seq++;render();
  const hostRenderedAt=now();
  hash=await mapHash(session);
  const entry:Entry={seq,op:structuredClone(op),id,author,submittedAt,hostRenderedAt,hash,baseSeq};
  log.push(entry);accepted.add(id);proof();
  if(dc?.readyState==='open')await send({kind:'commit',entry});
  else complete(id,{ok:true,seq,offline:true});
}
async function submit(op: EditOp) {
  if(!session || mismatch || (role==='guest' && !ready))return {ok:false,reason:'Connect and finish replay before editing.'};
  if(dc?.readyState==='open' && !ready)return {ok:false,reason:'Wait for the map replay to finish.'};
  const id=crypto.randomUUID();
  const start=performance.now();
  const done=new Promise<any>(resolve=>{
    const timer=setTimeout(()=>{pending.delete(id);resolve({ok:false,reason:'No confirmation; reconnect to learn whether the host accepted the edit.'});},30000);
    pending.set(id,{start,resolve,timer});
  });
  const submittedAt=now();
  try {
    if(role==='host')await enqueue(()=>commit(op,id,clientId,submittedAt,seq));
    else await send({kind:'request',id,author:clientId,baseSeq:seq,op,submittedAt});
  }catch(error){complete(id,{ok:false,reason:String(error)});throw error;}
  return done;
}
async function runMixed(count=250,seed=role==='host'?158:342) {
  if(!ready)throw Error('Connect both players first.');
  const rng=random(seed);const results=[];
  for(let i=0;i<count;i++) {
    if(!ready)break;
    results.push(await submit(mixed(session!,rng,i)));
    await new Promise(r=>setTimeout(r,0));
  }
  note('Mixed run: '+results.filter(r=>r.ok).length+'/'+results.length+' accepted.');
  return results;
}
function snapshot() {
  return {role,seq,hash,ready,mismatch,checked,peerChecked,pending:pending.size,status:el('status').textContent,
    metrics,log:role==='host'?log:undefined,connection:pc?.connectionState};
}
async function network() {
  const stats=await pc?.getStats();const out:any[]=[];
  stats?.forEach(s=>{
    if(s.type==='candidate-pair' && s.state==='succeeded')out.push({pair:s,local:stats.get(s.localCandidateId),remote:stats.get(s.remoteCandidateId)});
  });return out;
}
function download() {
  const blob=new Blob([JSON.stringify(snapshot(),null,2)],{type:'application/json'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='collab-checks.json';a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}
function button(id:string,fn:()=>any){el(id).addEventListener('click',()=>Promise.resolve().then(fn).catch(fail));}
button('invite',()=>invite());button('join',join);button('accept',()=>accept());
button('drop',()=>close('Connection dropped by this player.'));
button('sweep',()=>runMixed());button('export',download);
button('copy',async()=>{
  if(!output.value)throw Error('Make a code first.');
  try{await navigator.clipboard.writeText(output.value);note('Code copied.');}
  catch{
    output.focus();output.select();
    if(!document.execCommand('copy'))throw Error('Select the code and copy it manually.');
    note('Code copied.');
  }
});
el('map').addEventListener('click',async event=>{
  try{
    if(!session)throw Error('Connect both players first.');
    const canvas=el('map') as HTMLCanvasElement;const r=canvas.getBoundingClientRect();
    const x=Math.min(47,Math.floor(((event as MouseEvent).clientX-r.left)/r.width*48));
    const y=47-Math.min(47,Math.floor(((event as MouseEvent).clientY-r.top)/r.height*48));
    const tool=(el('tool') as HTMLSelectElement).value;
    const op=tool==='force'?force(session,x,y,seq+349):tool==='pine'||tool==='source'?placement(x,y,tool==='pine'?'Pine':'WaterSource'):brush(x,y,tool as any);
    const result=await submit(op);
    if(!result.ok)note(result.reason);
  }catch(error){note((error as Error).message);}
});
window.addEventListener('beforeunload',()=>{dc?.close();pc?.close();});
(window as any).spike={invite,join,accept,drop:()=>close('Connection dropped by this player.'),submit,runMixed,snapshot,network,
  brush,makeMixed:(seed:number,index:number)=>mixed(session!,random(seed),index),codec:{encode,decode}};
