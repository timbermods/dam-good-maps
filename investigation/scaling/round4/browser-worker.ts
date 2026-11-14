import {GestureHistory,OpfsResults,MapSession,rockOf,fallenOf,StateBank,ResultStore,packState,unpackState,forceInputHash} from '../round2/library';
async function* chunks(stream:ReadableStream<Uint8Array>){const r=stream.getReader();try{for(;;){const v=await r.read();if(v.done)break;yield v.value;}}finally{r.releaseLock();}}
const hex=(b:ArrayBuffer)=>[...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('');
async function state(s:MapSession){const b=s.built,encoder=new TextEncoder(),parts:Uint8Array[]=[];for(const v of [b.heights,b.water,b.contamination,b.moisture,b.soilContamination])if(v)parts.push(new Uint8Array(v.buffer,v.byteOffset,v.byteLength));parts.push(encoder.encode(JSON.stringify(b.entities)),encoder.encode(JSON.stringify(s.features)));const lava=rockOf(s);if(lava)parts.push(new Uint8Array(lava.buffer,lava.byteOffset,lava.byteLength));parts.push(encoder.encode(JSON.stringify([...fallenOf(s)])));const bytes=new Uint8Array(parts.reduce((n,b)=>n+b.length,0));let at=0;for(const p of parts){bytes.set(p,at);at+=p.length;}return hex(await crypto.subtle.digest('SHA-256',bytes));}
onmessage=async e=>{
 const stores:OpfsResults[]=[],rows:any[]=[],request=e.data;let storage='worker OPFS',reply:any;
 const row=(name:string,at:number,ms:number,extra:object={})=>{rows.push({name,at,ms,...extra});};
 const cache=async()=>{
  if(navigator.storage?.getDirectory){const s=await OpfsResults.open(crypto.randomUUID());stores.push(s);return s;}
  // This Windows WebKit runtime has no Storage API. Verified host-disk adapter, NOT a RAM
  // fallback or product proposal. All force/map bytes and retained cache budgets are real.
  storage='test host disk / synchronous worker XHR';
  const id=crypto.randomUUID();
  return {put:(key:number,b:Uint8Array)=>{const x=new XMLHttpRequest();x.open('PUT',`/cold/${request.id}/${id}/${key}`,false);x.send(b as XMLHttpRequestBodyInit);if(x.status!==200)throw Error('host cache write failed');},
    get:(key:number)=>{const x=new XMLHttpRequest();x.open('GET',`/cold/${request.id}/${id}/${key}`,false);x.responseType='arraybuffer';x.send();if(x.status!==200)throw Error('host cache read failed');return new Uint8Array(x.response);}};
 };
 const open=async(policy:object={})=>{const response=await fetch('/project/'+request.name);const h=await GestureHistory.open(chunks(response.body!),await cache(),policy);if(h instanceof MapSession)throw Error('expected history');return h;};
 try{
  const oracle=await (await fetch('/oracle/'+request.name)).json();
  let at=Date.now(),t=performance.now();let h:any=await open();row('open',at,performance.now()-t,{replayed:0});if(await state(h.session)!==oracle.finalState)throw Error('direct state differs');
  const exported=h.session.exportTimber();if(hex(await crypto.subtle.digest('SHA-256',exported.bytes! as BufferSource))!==oracle.exportHash)throw Error('export bytes differ');
  const op:any={op:'brush',params:{tool:'raise',size:5.5,strength:1,seed:9123,level:10,dabs:[200,200]}};
  at=Date.now();t=performance.now();h.apply([op]);row('first-edit',at,performance.now()-t);if(!h.undo()||await state(h.session)!==oracle.finalState)throw Error('first edit undo differs');
  h=null; // The benchmark opens one editable document at a time, as the app does.
  let historical:any=await open();
  const targets=[oracle.steps-1,oracle.steps-32,oracle.steps-100,oracle.steps].filter(n=>n>=0);
  for(const target of targets){at=Date.now();t=performance.now();await historical.seek(target);row('seek',at,performance.now()-t,{target,...historical.lastSeek});if(await state(historical.session)!==oracle.trace[target])throw Error('historical state differs '+target);}
  let bytes=0,maxWrite=0,partCount=0;const savedDisk=request.saveRoundTrip?await cache():null;at=Date.now();t=performance.now();await historical.save(async b=>{bytes+=b.length;maxWrite=Math.max(maxWrite,b.length);savedDisk?.put(++partCount,b);});row('save',at,performance.now()-t,{bytes,maxWrite});
  let savedFileRoundTrip=false;
  if(savedDisk){const source=async function*(){for(let k=1;k<=partCount;k++)yield savedDisk.get(k);};at=Date.now();t=performance.now();const saved=await GestureHistory.open(source(),await cache());row('saved-file-open',at,performance.now()-t,{replayed:0,parts:partCount});if(saved instanceof MapSession||await state(saved.session)!==oracle.finalState)throw Error('saved file current state differs');if(hex(await crypto.subtle.digest('SHA-256',saved.session.exportTimber().bytes as BufferSource))!==oracle.exportHash)throw Error('saved file export differs');savedFileRoundTrip=true;}
  const savedCount=historical.count,savedCache=historical.checkpointStats;historical=null;
  let allDepths:any=null,bookkeeping:any=null;
  if(request.prove){
   const proof=await open(),started=Date.now(),undos:number[]=[],redos:number[]=[];
   for(let depth=1;depth<=Math.min(100,oracle.steps);depth++){const t=performance.now();if(!proof.undo())throw Error('missing undo '+depth);undos.push(performance.now()-t);if(await state(proof.session)!==oracle.trace[oracle.steps-depth])throw Error('undo differs '+depth);}
   if(oracle.steps>100&&proof.undo())throw Error('reopen undo floor ignored');
   for(let depth=Math.min(100,oracle.steps);depth>=1;depth--){const t=performance.now();if(!proof.redo())throw Error('missing redo '+depth);redos.push(performance.now()-t);if(await state(proof.session)!==oracle.trace[oracle.steps-depth+1])throw Error('redo differs '+depth);}
   allDepths={positions:Math.min(100,oracle.steps)+1,checked:'each inverse undo and forward redo within retained 100; floor enforced',ms:Date.now()-started,undoWorst:Math.max(...undos),redoWorst:Math.max(...redos),cache:proof.checkpointStats};
  }
  for(const depth of [1,32,100].filter(n=>n<=oracle.steps)){const latency=await open();await latency.seek(oracle.steps-depth+1);at=Date.now();t=performance.now();if(!latency.undo())throw Error('timed undo absent');row('undo',at,performance.now()-t,{depth});if(await state(latency.session)!==oracle.trace[oracle.steps-depth])throw Error('timed undo differs');at=Date.now();t=performance.now();if(!latency.redo())throw Error('timed redo absent');row('redo',at,performance.now()-t,{depth});if(await state(latency.session)!==oracle.trace[oracle.steps-depth+1])throw Error('timed redo differs');}
  if(request.contracts){
   const book=await open(),journal=book.project.entries;await book.seek(2);const before=await state(book.session),parts:Uint8Array[]=[];await book.save(async b=>{parts.push(b);});
   const again=await GestureHistory.open(parts,await cache());if(again instanceof MapSession||again.count!==2||await state(again.session)!==before)throw Error('saved undone state differs');
   for(const target of [3,5,6]){await again.seek(target);if(await state(again.session)!==oracle.trace[target])throw Error('redo beyond saved checkpoint differs '+target);}
   for(const entry of journal){if(entry.kind!=='force')continue;await book.seek(entry.inputCursor);const rollback=book.session.checkpointExecution();try{if(await forceInputHash(book.session,entry.inputHashVersion??1)!==entry.inputHash)throw Error('undone force input receipt differs '+entry.gesture.verb);}finally{book.session.installExecution(rollback);}}
   const tiny=new Map<number,Uint8Array>(),adapter={put:(k:number,b:Uint8Array)=>tiny.set(k,b),get:(k:number)=>tiny.get(k)!},store=new ResultStore(adapter),bank=new StateBank(adapter);
   const x={v:new Uint8Array(32).fill(7)},y={v:new Uint8Array(32).fill(7)},buffer=new ArrayBuffer(32),a=new Uint16Array(buffer,2,4),b=new Float64Array(buffer,8,2),text='\ud800X\udfff\u0000'.repeat(10000);b[0]=-0;b[1]=NaN;bank.share(x);bank.share(y);
   const restored=unpackState(packState({x,y,alias:x,a,b,text},bank).bytes,store,bank);
   if(restored.x!==restored.alias||restored.x===restored.y||restored.x.v===restored.y.v||restored.a.buffer!==restored.b.buffer||restored.a.byteOffset!==2||!Object.is(restored.b[0],-0)||!Number.isNaN(restored.b[1])||restored.text!==text)throw Error('graph identity/code-unit contract differs');
   const wet=new GestureHistory(book.project.base,await cache(),'canonical-boundaries',0,{checkpointEvery:4,snapshots:0,steps:1}),wetStates=[await state(wet.session)];
   for(let n=1;n<=6;n++){wet.apply([{...op,params:{...op.params,size:20,seed:1200+n,dabs:[180+n*8,200]}}]);if(n===1)wet.settleCanonical();if(n===3){const run=wet.session.canonicalRun();let water=run.advance(Infinity);while(!water)water=run.advance(Infinity);if(!wet.adoptWater(run.model,water))throw Error('canonical water adoption rejected');}wetStates.push(await state(wet.session));}
   const wetParts:Uint8Array[]=[];await wet.save(async b=>{wetParts.push(b);});const wetOpen=await GestureHistory.open(wetParts,await cache(),{snapshots:0,steps:1});if(wetOpen instanceof MapSession)throw Error('expected wet history');for(const at of [0,1,2,3,4,5,6,3,6]){await wetOpen.seek(at);if(await state(wetOpen.session)!==wetStates[at])throw Error('canonical water boundary differs '+at);}
   bookkeeping={savedUndoneCursor:true,immediateRedo:true,allFutureRedo:true,undoForceInputReceipts:true,componentIdentity:true,sharedViewOffsets:true,stringCodeUnits:true,canonicalWaterBoundaries:true};
  }
  reply={result:{rows,storage,bytes,count:savedCount,exportHash:oracle.exportHash,allDepths,bookkeeping,savedFileRoundTrip,cache:savedCache}};
 }catch(error){reply={error:String(error),stack:(error as Error).stack,rows};}
 finally{for(const s of stores)await s.dispose();}
 postMessage(reply);
};
