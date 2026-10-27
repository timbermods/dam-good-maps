import { expect,it,vi } from 'vitest';
import { Worker } from 'node:worker_threads';
import { makeSpec } from '../../src/core/spec/mapspec';
import { installParallelWater,parallelWaterThreads,uninstallParallelWater } from '../../src/core/sim/parallel';
import { runGenerate } from '../../src/worker/api';
import * as ed from '../../src/worker/session';
it('F6: closing or switching a map must release its paused draft strip job',async()=>{
 await runGenerate(makeSpec({seed:1,theme:'riverValley',size:{x:64,y:64}}));ed.refine();const saved=ed.project().bytes;
 let helper:Worker;installParallelWater({threads:2,spawn:()=>{helper=new Worker(new URL('./lifecycle-helper.mjs',import.meta.url));return {postMessage:m=>helper.postMessage(m),terminate:()=>void helper.terminate()};}});
 while(parallelWaterThreads()<2)await new Promise(r=>setTimeout(r,10));
 vi.useFakeTimers();let clock=0;vi.spyOn(performance,'now').mockImplementation(()=>++clock);
 const inspect=()=>new Promise<any>(r=>{helper!.once('message',r);helper!.postMessage({kind:'inspect'});});
 const rows=[];
 try{for(const action of ['switch','close']){
   ed.draftStroke({x0:30,y0:30,x1:30,y1:30},new Uint8Array([4]));await vi.advanceTimersToNextTimerAsync();
   const active=await inspect();expect(active.jobs).toBe(1);
   if(action==='switch')ed.openProject(saved);else ed.closeSession();
   await vi.runAllTimersAsync();const after=await inspect();rows.push({action,activeJobs:active.jobs,afterJobs:after.jobs});
   expect(after.jobs).toBe(process.env.MERGE_REVIEW_EXPECT_BUGS !== '1'?0:1);
  }console.log(JSON.stringify(rows));
 }finally{ed.cancelDraft();ed.closeSession();vi.useRealTimers();vi.restoreAllMocks();uninstallParallelWater();}
});
