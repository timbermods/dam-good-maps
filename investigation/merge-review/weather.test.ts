import { expect,it,vi } from 'vitest';
import { Worker } from 'node:worker_threads';
import { makeSpec } from '../../src/core/spec/mapspec';
import { WaterSim } from '../../src/core/sim/water';
import { installParallelWater,parallelWaterThreads,uninstallParallelWater } from '../../src/core/sim/parallel';
import { runGenerate } from '../../src/worker/api';
import * as ed from '../../src/worker/session';
it('F5: cancelled weather must release its Rust simulation and helper job promptly',async()=>{
 await runGenerate(makeSpec({seed:1,theme:'riverValley',size:{x:64,y:64}}));ed.refine();
 let helper:Worker;
 installParallelWater({threads:2,spawn:()=>{helper=new Worker(new URL('./lifecycle-helper.mjs',import.meta.url));return {postMessage:m=>helper.postMessage(m),terminate:()=>void helper.terminate()};}});
 while(parallelWaterThreads()<2)await new Promise(r=>setTimeout(r,10));
 vi.useFakeTimers();let clock=0;vi.spyOn(performance,'now').mockImplementation(()=>++clock);
 const dispose=vi.spyOn(WaterSim.prototype,'dispose');
 try{for(let k=0;k<8;k++){ed.startWeather(k%2?'drought':'badtide');ed.stopWeather();await vi.runAllTimersAsync();}
 const state=await new Promise<any>(r=>{helper!.once('message',r);helper!.postMessage({kind:'inspect'});});
 const fixed=process.env.MERGE_REVIEW_EXPECT_BUGS !== '1';
 expect(dispose.mock.calls.length).toBe(fixed?8:0);expect(state.jobs).toBe(fixed?0:8);
 console.log(JSON.stringify({weatherCancellations:8,explicitDisposals:dispose.mock.calls.length,retainedHelperJobs:state.jobs}));
 }finally{ed.stopWeather();vi.useRealTimers();vi.restoreAllMocks();uninstallParallelWater();}
});
