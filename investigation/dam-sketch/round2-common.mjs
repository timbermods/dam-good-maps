import {createRequire} from 'node:module';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
export const HERE=dirname(fileURLToPath(import.meta.url)), LOCAL=resolve(HERE,'local');
mkdirSync(LOCAL,{recursive:true});
export const deps=createRequire(resolve(process.env.DGM_DEPS??LOCAL,'package.json'));
export const hash=b=>createHash('sha256').update(b).digest('hex');
export const json=(name,value)=>writeFileSync(resolve(HERE,name),JSON.stringify(value,null,2)+'\n');
export const localJson=(name,value)=>writeFileSync(resolve(LOCAL,name),JSON.stringify(value)+'\n');
export const stats=a=>{const s=[...a].sort((a,b)=>a-b);return {count:s.length,median:s[Math.floor(s.length/2)]??null,p95:s[Math.min(s.length-1,Math.floor(s.length*.95))]??null,max:s.at(-1)??null};};
export function loadSampler(){
 const samples=[];let partial='';
 const child=spawn('pwsh',['-NoProfile','-File',resolve(HERE,'load.ps1')],{windowsHide:true});
 child.stdout.on('data',b=>{partial+=b;const lines=partial.split(/\r?\n/);partial=lines.pop();for(const line of lines)if(line&&Number.isFinite(Number(line)))samples.push({at:Date.now(),value:Number(line)});});
 child.stderr.on('data',b=>console.error(String(b)));
 return {async ready(){const end=Date.now()+30000;while(samples.length<2&&Date.now()<end)await new Promise(r=>setTimeout(r,100));if(samples.length<2)throw Error('CPU sampler unavailable');},summary(start,end=Date.now()){const s=samples.filter(s=>s.at>=start&&s.at<=end).map(s=>s.value);const mean=s.length?s.reduce((a,b)=>a+b,0)/s.length:null;return {mean,max:s.length?Math.max(...s):null,samples:s.length,provisional:mean===null||mean>20,source:'Windows PDH Processor(_Total) % Processor Time; 1-second intervals',start,end};},stop(){child.kill();}};
}
