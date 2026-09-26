// Local regression page: drive the real DOM input path and record its canvas.
import { slideTiles } from './engine';
const button=document.getElementById('run') as HTMLButtonElement,out=document.getElementById('results')!,iframe=document.getElementById('demo') as HTMLIFrameElement;
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms)),assert=(v:unknown,s:string)=>{if(!v)throw Error(s);};
button.onclick=async()=>{
 button.disabled=true;const passed:string[]=[],captures:{label:string;jpeg:string;delay:number}[]=[],metrics:Record<string,unknown>={};
 const win=iframe.contentWindow as Window&{quake:any},doc=iframe.contentDocument!,canvas=doc.getElementById('view') as HTMLCanvasElement;let q=win.quake;
 const pass=(s:string)=>{passed.push(s);out.textContent=passed.map(s=>'PASS '+s).join('\n');};
 const wait=async(fn:()=>boolean)=>{const start=performance.now();while(!fn()){if(performance.now()-start>45000)throw Error('Timeout: '+doc.getElementById('notice')!.textContent);await sleep(20);}};
 const ready=()=>wait(()=>q&&!q.state.active&&!q.state.busy&&!q.state.queued&&!q.state.finishCache);
 const click=(id:string)=>doc.getElementById(id)!.click(),key=(key:string)=>win.dispatchEvent(new KeyboardEvent('keydown',{key,bubbles:true}));
 const event=(type:string,p:{x:number;y:number})=>canvas.dispatchEvent(new PointerEvent(type,{clientX:p.x,clientY:p.y,button:0,buttons:type==='pointerup'?0:1,pointerId:88,pointerType:'pen',bubbles:true}));
 const load=async(size:number,power:number)=>{
  const map=doc.getElementById('map') as HTMLSelectElement;map.value='fixture:slide:'+size;map.dispatchEvent(new Event('change'));await ready();click('slide');click('top');
  const p=doc.getElementById('power') as HTMLInputElement;p.value=String(power);p.dispatchEvent(new Event('input'));
  const side=doc.getElementById('side') as HTMLSelectElement;side.value='1';side.dispatchEvent(new Event('change'));await sleep(100);
 };
 const record=(label:string,delay=100)=>captures.push({label,jpeg:q.capture(),delay});
 try{
  await wait(()=>!!(q=win.quake));await ready();await load(128,100);const base=q.state.heights.slice();record('Before · Power 100 · 20 tiles',600);
  const points=Array.from({length:21},(_,i)=>q.project(3+i*6,64)),start=performance.now();let samples=0,first=0,heldSamples=0;
  event('pointerdown',points[0]);
  for(let k=1;k<points.length;k++){
   event('pointermove',points[k]);
   for(let j=0;j<5;j++){await sleep(20);const g=q.glide;if(g&&g.enabled&&g.remaining>0&&g.remaining<g.distance){samples++;heldSamples++;if(!first)first=performance.now()-start;}}
   record('Held · land gliding · '+Math.round(k/20*100)+'%');
  }
  assert(heldSamples>3,'actual terrain attributes must show intermediate motion while held');assert(q.state.historyIndex===0,'no early operation');
  event('pointerup',points.at(-1)!);await ready();await sleep(280);record('After · 20-tile ridge and river jog',1700);
  const op=q.operation,after=q.state.heights.slice(),ruin=op.params.entitiesBefore.find((e:any)=>e.id==='ruin-0.67-0'),moved=op.params.entitiesAfter.find((e:any)=>e.id===ruin.id);
  assert(Math.hypot(moved.x-ruin.x,moved.y-ruin.y)>=20,'ruin must move at least Power');assert(q.state.historyIndex===1,'one stroke one undo');
  metrics.high={...canvas.dataset,firstGlideMs:first,intermediateSamples:samples,ruinOffset:[moved.x-ruin.x,moved.y-ruin.y]};pass('Power 100: held terrain glide and ruin travel of at least 20 tiles');
  click('undo');await ready();assert(base.every((h:number,i:number)=>h===q.state.heights[i]),'exact undo');assert(!q.glide,'undo clears animation');click('redo');await ready();assert(after.every((h:number,i:number)=>h===q.state.heights[i]),'exact redo');pass('Slide is one exact undo and redo, without residual glide');
  await load(128,0);const low=Array.from({length:9},(_,i)=>q.project(3+i*15,64));event('pointerdown',low[0]);
  for(const p of low.slice(1)){event('pointermove',p);await sleep(100);}event('pointerup',low.at(-1)!);await ready();
  const lowOp=q.operation,a=lowOp.params.entitiesBefore.find((e:any)=>e.id==='ruin-0.67-0'),b=lowOp.params.entitiesAfter.find((e:any)=>e.id===a.id);
  assert(Math.hypot(b.x-a.x,b.y-a.y)>=slideTiles(0),'low Power still moves three tiles');metrics.low={...canvas.dataset,ruinOffset:[b.x-a.x,b.y-a.y]};pass('Power 0 still shifts the ridge and ruins by three tiles');
  await load(256,100);const before=q.state.heights.slice(),p=q.project(140,150);event('pointerdown',p);event('pointermove',{x:p.x+2,y:p.y});await wait(()=>!!q.glide);key('x');await sleep(140);key('Escape');await ready();
  assert(before.every((h:number,i:number)=>h===q.state.heights[i]),'Esc restores 256²');assert(!q.glide&&q.state.historyIndex===0,'no residual motion or history');pass('256² short Slide responds while held; X then Esc restores the whole map');
  await load(128,85);(doc.getElementById('motion') as HTMLInputElement).checked=false;const e=[q.project(30,64),q.project(100,64)];event('pointerdown',e[0]);event('pointermove',e[1]);await sleep(250);assert(!q.glide||q.glide.enabled===0,'effects off disables interpolation');event('pointerup',e[1]);await ready();assert(q.operation.params.terrain.length>0,'effects off still slides');pass('effects off keeps the full Slide result');
  const response=await fetch('/__quake_capture',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jpeg:captures.at(-1)!.jpeg,metrics:{kind:'slide',passed,metrics,captures}})});assert(response.ok,'save captures');
  out.textContent+='\nAll Slide checks passed. Captures saved locally.';
 }catch(error){out.textContent+='\nFAIL '+String(error);throw error;}finally{button.disabled=false;}
};
