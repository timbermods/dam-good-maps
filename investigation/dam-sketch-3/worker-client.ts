import type { Result } from './engine.ts';
import type { Request } from './worker.ts';
export interface WorkerPort {
 postMessage(value:Request):void;terminate():void;
 onmessage:((event:{data:{kind:'result';result:Result}|{kind:'error';message:string}})=>void)|null;
 onerror:((event:{message:string})=>void)|null;
}
/** Replacing a wall terminates its worker before starting the next fill. */
export function createWorkerSession(factory:()=>WorkerPort,publish:(id:number,result:Result)=>void,fail:(id:number,message:string)=>void){
 let generation=0,worker:WorkerPort|null=null;
 const cancel=()=>{generation++;worker?.terminate();worker=null;};
 return {replace(request:Request){
  cancel();const id=generation,current=factory();worker=current;
  current.onmessage=({data})=>{if(id!==generation||current!==worker)return;if(data.kind==='result')publish(id,data.result);else fail(id,data.message);};
  current.onerror=event=>{if(id===generation&&current===worker)fail(id,event.message);};
  current.postMessage(request);return id;
 },cancel,dispose:cancel};
}
