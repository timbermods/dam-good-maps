import {spawn} from 'node:child_process';
import {cpus,platform} from 'node:os';
import {resolve} from 'node:path';
import {HERE} from './common.mjs';
export function loadSampler(){let samples=[],partial='',previous=cpus(),child=null,timer=null;
 if(platform()==='win32'){child=spawn('pwsh',['-NoProfile','-File',resolve(HERE,'load.ps1')],{windowsHide:true});child.stdout.on('data',b=>{partial+=b;const lines=partial.split(/\r?\n/);partial=lines.pop();for(const l of lines)if(l&&Number.isFinite(Number(l)))samples.push(Number(l));});child.stderr.on('data',b=>console.error('load sampler',String(b)));child.on('error',e=>console.error('load sampler unavailable',e.message));}
 else timer=setInterval(()=>{const cur=cpus();let idle=0,total=0;for(let i=0;i<cur.length;i++){for(const k in cur[i].times)total+=cur[i].times[k]-previous[i].times[k];idle+=cur[i].times.idle-previous[i].times.idle;}previous=cur;if(total>0)samples.push(100*(1-idle/total));},500);
 return {reset(){samples=[];},async observe(){const previousCount=samples.length;for(let attempt=0;attempt<500&&samples.length===previousCount;attempt++)await new Promise(r=>setTimeout(r,100));if(samples.length===previousCount)throw Error('CPU sampler returned no observation');},summary(){return {mean:samples.length?samples.reduce((s,v)=>s+v,0)/samples.length:null,max:samples.length?Math.max(...samples):null,samples:samples.length,source:platform()==='win32'?'Windows PDH Processor(_Total) % Processor Time':'os.cpus cumulative deltas'};},stop(){child?.kill();if(timer)clearInterval(timer);}};
}
