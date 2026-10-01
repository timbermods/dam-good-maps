import { WaterSim } from './water';
postMessage({booted:true});
onmessage = ({data}) => {
  const {snapshot,control,indices,id,threads} = data as {snapshot:Record<string,unknown>;control:Int32Array;indices:Int32Array;id:number;threads:number};
  const sim = Object.assign(Object.create(WaterSim.prototype),snapshot) as WaterSim;
  Atomics.store(control,8+threads+id,1);Atomics.notify(control,8+threads+id);
  postMessage({ready:true});
  let previous=0;
  for (;;) {
    let epoch=Atomics.load(control,0);
    while (epoch===previous) {
      Atomics.wait(control,0,previous);
      epoch=Atomics.load(control,0);
    }
    if (epoch<0) return;
    const count=Atomics.load(control,2), phase=Atomics.load(control,1);
    if(data.dynamicKernel) {
      const object=sim as unknown as Record<string,any>;
      object.W=Atomics.load(control,3);object.H=Atomics.load(control,4);
      object.game=!!Atomics.load(control,5);object.edgeSpill=!!Atomics.load(control,6);
      object.dam=Atomics.load(control,7)?snapshot.dam:null;
    }
    sim.kernel(phase,indices,Math.floor(count*id/threads),Math.floor(count*(id+1)/threads));
    previous=epoch;
    Atomics.store(control,8+id,epoch); Atomics.notify(control,8+id);
  }
};
