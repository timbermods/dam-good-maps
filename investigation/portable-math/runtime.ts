import {installWaterConstructionHook} from './water';
/** Await once in the existing COORDINATOR WORKER before synchronous generation/edit tasks.
 * Helpers receive a reusable workspace once. Migrate arrays only around run() calls:
 * no nested-worker IPC while blocked; returned arrays retain their private identities.
 */
export async function installParallelWater(threads:number, helperURL:string|URL, timeoutMs=30000, maxTiles=512*512,minTilesPerThread=1024) {
  if(!Number.isInteger(threads)||threads<1)throw Error('Invalid thread count');
  if(threads===1||!globalThis.crossOriginIsolated||typeof SharedArrayBuffer==='undefined')return {threads:1,close:()=>{}};
  const workers:Worker[]=[];
  const control=new Int32Array(new SharedArrayBuffer((8+2*threads)*4));
  const indices=new Int32Array(new SharedArrayBuffer(maxTiles*4));
  const shared:Record<string,any>={};
  const constructors:Record<string,any>={F:Float64Array,dam:Float64Array,D:Float64Array,Dold:Float64Array,C:Float64Array,out:Float64Array,f:Float64Array,Cnew:Float64Array,mod:Float64Array,wall:Uint8Array,n0:Int32Array,n1:Int32Array,n2:Int32Array,n3:Int32Array};
  for(const [key,Ctor] of Object.entries(constructors))shared[key]=new Ctor(new SharedArrayBuffer(maxTiles*(key==='out'||key==='f'?4:1)*Ctor.BYTES_PER_ELEMENT));
  let epoch=0,closed=false,busy=false;
  const stats={parallelPhases:0,scalarPhases:0};
  const close=()=>{if(closed)return;closed=true;installWaterConstructionHook(null);Atomics.store(control,0,-1);Atomics.notify(control,0);for(const w of workers)w.terminate();};
  try{
    await Promise.all(Array.from({length:threads-1},(_,i)=>new Promise<void>((resolve,reject)=>{
      const w=new Worker(helperURL,{type:'module'});workers.push(w);
      const timer=setTimeout(()=>reject(Error('Water helper startup timeout')),timeoutMs);
      w.onerror=()=>{clearTimeout(timer);reject(Error('Water helper startup failed'));};
      w.onmessage=e=>{if(e.data?.ready){clearTimeout(timer);resolve();}};
      w.postMessage({snapshot:{...shared,W:0,H:0,N:maxTiles,game:true,edgeSpill:true},control,indices,id:i+1,threads,dynamicKernel:true});
    })));
  }catch{close();return {threads:1,close:()=>{}};}
  const wait=(slot:number,wanted:number)=>{
    const deadline=performance.now()+timeoutMs;
    for(;;){const observed=Atomics.load(control,slot);if(observed===wanted)return;const left=deadline-performance.now();if(left<=0){close();throw Error('Water phase timeout: discard task and restart scalar');}Atomics.wait(control,slot,observed,left);}
  };
  installWaterConstructionHook(sim=>{
    if(sim.N>maxTiles)return;
    const object=sim as unknown as Record<string,any>;
    sim.runScope=body=>{
      if(closed)throw Error('Water pool closed');
      if(busy)throw Error('Nested water run must use a separate coordinator');
      busy=true;
      const original:Record<string,any>={};
      for(const key of Object.keys(constructors)){
        original[key]=object[key];if(!original[key])continue;
        shared[key].set(original[key]);object[key]=shared[key];
      }
      Atomics.store(control,3,sim.W);Atomics.store(control,4,sim.H);Atomics.store(control,5,+object.game);Atomics.store(control,6,+sim.edgeSpill);Atomics.store(control,7,+!!original.dam);
      try{body();}finally{
        for(const key of ['D','Dold','C','out','f','Cnew','mod'])original[key].set(shared[key].subarray(0,original[key].length));
        for(const key of Object.keys(constructors))object[key]=original[key];
        busy=false;
      }
    };
    sim.executor=(phase,list,count)=>{
      if(closed)throw Error('Water pool closed');
      // Thin rivers cannot amortize a browser barrier. Same exact kernel, coordinator-only.
      if(count<threads*minTilesPerThread){stats.scalarPhases++;sim.kernel(phase,list,0,count);return;}
      stats.parallelPhases++;
      indices.set(list.subarray(0,count));Atomics.store(control,1,phase);Atomics.store(control,2,count);epoch=epoch>=0x7ffffffe?1:epoch+1;Atomics.store(control,0,epoch);Atomics.notify(control,0);
      sim.kernel(phase,indices,0,Math.floor(count/threads));
      for(let id=1;id<threads;id++)wait(8+id,epoch);
    };
  });
  return {threads,close,stats};
}
