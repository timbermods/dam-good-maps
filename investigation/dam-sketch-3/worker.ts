import { loadKernel } from './kernel.ts';
import { createJob, fillProgressively, type Options } from './engine.ts';
import type { Snapshot, Stroke } from './wall.ts';
export interface Request {bytes:Uint8Array;map:Snapshot;strokes:readonly Stroke[];options?:Options}
const scope=self as unknown as DedicatedWorkerGlobalScope;
scope.onmessage=async ({data}:{data:Request})=>{
 let job:ReturnType<typeof createJob>|undefined;
 try {
  job=createJob(loadKernel(new Uint8Array(data.bytes)),data.map,data.strokes,data.options);
  scope.postMessage({kind:'result',result:job.result()});
  await fillProgressively(job,result=>scope.postMessage({kind:'result',result}));
 }catch(error){scope.postMessage({kind:'error',message:error instanceof Error?error.message:String(error)});}
 finally{job?.dispose();}
};
