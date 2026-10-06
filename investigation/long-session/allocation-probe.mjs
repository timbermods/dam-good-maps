import {installProbe} from './probe.mjs';
if(typeof self!=='undefined'){
 installProbe();
 let unusedCount=0,createdCount=0,freedCount=0,finalizedCount=0,maxOutstanding=0;
 const handles=new Map(),unused=[];
 globalThis.__allocationProbe={
  created(handle,owner,n){createdCount++;handles.set(handle,{n,ref:new WeakRef(owner)});maxOutstanding=Math.max(maxOutstanding,handles.size);},
  freed(handle){freedCount++;handles.delete(handle);},
  finalized(handle){finalizedCount++;handles.delete(handle);},
  unused(run,n){unusedCount++;unused.push({n,ref:new WeakRef(run)});},
  snapshot(){return {unusedCount,unusedAlive:unused.filter(x=>x.ref.deref()).length,unusedCells:unused.filter(x=>x.ref.deref()).reduce((n,x)=>n+x.n,0),createdCount,freedCount,finalizedCount,outstanding:handles.size,maxOutstanding,...__longSession.snapshot()};}
 };
}
