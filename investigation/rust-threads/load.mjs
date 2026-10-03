import {spawn} from 'node:child_process';
import {cpus,platform} from 'node:os';
import {resolve} from 'node:path';
import {HERE} from './common.mjs';
export function loadSampler(){let samples=[],partial='',previous=cpus(),child=null,timer=null,fastSamples=[];
 // Short (<1 s) cells can fit entirely between PDH samples. Measure CPU deltas too;
 // prefer PDH when available and explicitly label the faster fallback.
 let fastPrevious=cpus();const fastTimer=setInterval(()=>{const cur=cpus();let idle=0,total=0;for(let i=0;i<cur.length;i++){for(const k in cur[i].times)total+=cur[i].times[k]-fastPrevious[i].times[k];idle+=cur[i].times.idle-fastPrevious[i].times.idle;}fastPrevious=cur;if(total>0)fastSamples.push(100*(1-idle/total));},100);
 if(platform()==='win32'){child=spawn('pwsh',['-NoProfile','-File',resolve(HERE,'load.ps1')],{windowsHide:true});child.stdout.on('data',b=>{partial+=b;const lines=partial.split(/\r?\n/);partial=lines.pop();for(const l of lines)if(l&&Number.isFinite(Number(l)))samples.push(Number(l));});child.stderr.on('data',b=>console.error('load sampler',String(b)));child.on('error',e=>console.error('load sampler unavailable',e.message));}
 else timer=setInterval(()=>{const cur=cpus();let idle=0,total=0;for(let i=0;i<cur.length;i++){for(const k in cur[i].times)total+=cur[i].times[k]-previous[i].times[k];idle+=cur[i].times.idle-previous[i].times.idle;}previous=cur;if(total>0)samples.push(100*(1-idle/total));},500);
 return {reset(){samples=[];fastSamples=[];fastPrevious=cpus();},summary(){const cur=cpus();let idle=0,total=0;for(let i=0;i<cur.length;i++){for(const k in cur[i].times)total+=cur[i].times[k]-fastPrevious[i].times[k];idle+=cur[i].times.idle-fastPrevious[i].times.idle;}fastPrevious=cur;if(total>0)fastSamples.push(100*(1-idle/total));const values=samples.length?samples:fastSamples;return {mean:values.length?values.reduce((s,v)=>s+v,0)/values.length:null,max:values.length?Math.max(...values):null,samples:values.length,values:[...values],source:samples.length?(platform()==='win32'?'Windows PDH Processor(_Total) % Processor Time':'os.cpus cumulative deltas'):'os.cpus 100ms deltas (no PDH sample in short cell)'};},stop(){child?.kill();if(timer)clearInterval(timer);clearInterval(fastTimer);}};
}
