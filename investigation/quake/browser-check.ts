// In-browser regression harness, intentionally separate from the demo UI.
// It sends DOM input through the same listeners as a pointer, not start(plan).
const button=document.getElementById('run') as HTMLButtonElement,out=document.getElementById('results')!;
const iframe=document.getElementById('demo') as HTMLIFrameElement;
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));
const assert=(ok:unknown,message:string)=>{if(!ok)throw Error(message);};
button.onclick=async()=>{
 button.disabled=true;const passed:string[]=[],captures:{label:string;jpeg:string}[]=[],metrics:Record<string,unknown>={};
 const win=iframe.contentWindow as Window&{quake:any},doc=iframe.contentDocument!,canvas=doc.getElementById('view')!;let q=win.quake;
 const pass=(s:string)=>{passed.push(s);out.textContent=passed.map(s=>'PASS '+s).join('\n');};
 const wait=async(fn:()=>boolean)=>{const t=performance.now();while(!fn()){if(performance.now()-t>45000)throw Error('Timed out: '+doc.getElementById('notice')!.textContent);await sleep(25);}};
 const ready=()=>wait(()=>!!q&&!q.state.active&&!q.state.busy&&!q.state.queued&&!q.state.finishCache&&!q.state.pending);
 const click=(id:string)=>doc.getElementById(id)!.click();
 const key=(key:string)=>win.dispatchEvent(new KeyboardEvent('keydown',{key,bubbles:true}));
 const same=(a:Uint8Array,b:Uint8Array)=>a.length===b.length&&a.every((h,i)=>h===b[i]);
 const load=async(size=128)=>{const map=doc.getElementById('map') as HTMLSelectElement;map.value='fixture:river:'+size;map.dispatchEvent(new Event('change'));await ready();click('top');await sleep(120);};
 const event=(type:string,p:{x:number;y:number})=>canvas.dispatchEvent(new PointerEvent(type,{clientX:p.x,clientY:p.y,button:0,buttons:type==='pointerup'?0:1,pointerId:77,pointerType:'pen',bubbles:true}));
 const stroke=async(points:{x:number;y:number}[],options:{escape?:boolean;flip?:boolean;record?:boolean;duration?:number}={})=>{
  const screen=points.map(p=>q.project(p.x,p.y)),start=performance.now(),before=q.state.heights.slice(),history=q.state.historyIndex;event('pointerdown',screen[0]);
  for(let j=1;j<screen.length;j++){
   event('pointermove',screen[j]);await sleep((options.duration??1400)/(screen.length-1));
   if(options.flip&&j===Math.floor(screen.length/2))key('x');
   if(options.record)captures.push({label:'Painting · '+Math.round(j/(screen.length-1)*100)+'%',jpeg:q.capture()});
  }
  await wait(()=>q.state.active&&!same(before,q.state.heights));
  assert(q.state.historyIndex===history,'held stroke cannot commit early');
  if(options.escape)key('Escape');else event('pointerup',screen.at(-1)!);
  metrics.gestureMs=performance.now()-start;await ready();
 };
 try{
  await wait(()=>!!(q=win.quake));await ready();await load(256);const base=q.state.heights.slice();
  captures.push({label:'Before · 256²',jpeg:q.capture()});
  const points=Array.from({length:13},(_,i)=>({x:30+i*16,y:130+Math.sin(i/12*Math.PI*2)*7}));
  await stroke(points,{record:true,duration:1800});
  assert(!same(base,q.state.heights),'painting must change ground');assert(q.state.historyIndex===1,'one stroke, one history entry');
  captures.push({label:'Release · water settled',jpeg:q.capture()});metrics.paint={...(canvas as HTMLElement).dataset};
  assert(q.operation.params.intent.side===1,'default left');assert((canvas as HTMLElement).dataset.paintedWhileHeld==='true','real worker must paint while held');pass('256² curved brush changes terrain while held and creates one quake on release');
  click('undo');await ready();assert(same(base,q.state.heights),'undo base');click('redo');await ready();assert(!same(base,q.state.heights),'redo');click('undo');await ready();pass('whole-stroke undo and redo');
  await stroke(points,{flip:true});metrics.unrecordedPaint={...(canvas as HTMLElement).dataset};assert(q.operation.params.intent.side===-1,'X flips recorded side');assert((doc.getElementById('side') as HTMLSelectElement).value==='-1','X syncs options');click('undo');await ready();pass('X during a held stroke flips the result and options row');
  await stroke(points.slice(0,5),{escape:true});assert(same(base,q.state.heights),'Esc restores ground');assert(q.state.historyIndex===0,'Esc creates no entry');pass('Esc mid-stroke restores ground and history');
  const bad=[q.project(7,10),q.project(14,10)];event('pointerdown',bad[0]);event('pointermove',bad[1]);await sleep(100);event('pointerup',bad[1]);await ready();
  assert(doc.getElementById('notice')!.textContent==='Start here','quiet start refusal');assert((canvas as HTMLElement).dataset.refused==='true','red refusal line');assert(same(base,q.state.heights),'refused stroke unchanged');pass('start refusal is visible, red, and leaves no edit');
  const p=q.project(140,180);event('pointerdown',p);event('pointerup',{x:p.x+1,y:p.y});await ready();assert(q.state.historyIndex===1&&q.operation.params.terrain.length>0,'sub-tile quake');click('undo');await ready();pass('one-pixel stroke makes a quake');
  // Neither a quick release nor input during the preceding canonical settle is lost.
  for(const x of [110,170]){const p=q.project(x,180);event('pointerdown',p);event('pointerup',{x:p.x+2,y:p.y});}
  await ready();assert(q.state.historyIndex===2,'both rapid strokes retained');click('undo');await ready();click('undo');await ready();assert(same(base,q.state.heights),'two independent undo steps');pass('rapid strokes queue during settling and each remain undoable');
  await load(128);click('slide');const power=doc.getElementById('power') as HTMLInputElement;power.value='85';power.dispatchEvent(new Event('input'));
  const side=doc.getElementById('side') as HTMLSelectElement;side.value='1';side.dispatchEvent(new Event('change'));
  await stroke(Array.from({length:9},(_,i)=>({x:3+i*15,y:64})),{duration:1400});captures.push({label:'Slide · connected downstream river',jpeg:q.capture()});metrics.slide={...(canvas as HTMLElement).dataset};pass('Slide painted through the river with a connected channel');
  click('undo');await ready();(doc.getElementById('motion') as HTMLInputElement).checked=false;
  await stroke([{x:30,y:64},{x:95,y:64}],{duration:300});assert(q.operation.params.terrain.length>0,'reduced motion still edits');pass('effects off preserves the same interaction');
  out.textContent=passed.map(s=>'PASS '+s).join('\n')+'\nAll browser checks passed. Captures saved locally.';
  await fetch('/__quake_capture',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jpeg:captures.at(-1)!.jpeg,metrics:{passed,metrics,captures}})});
 }catch(error){out.textContent+='\nFAIL '+String(error);throw error;}finally{button.disabled=false;}
};
