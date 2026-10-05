import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { writeFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import inspector from 'node:inspector';
import { execFileSync } from 'node:child_process';
const require=createRequire(import.meta.url),api=require('./local/'+(process.argv[2]||'baseline-profile')+'.cjs');
const hash=b=>createHash('sha256').update(b).digest('hex');
const local=resolve('investigation/gen-speed/local');
const cases=api.AVAILABLE_THEMES.map(theme=>({id:theme,spec:api.makeSpec({theme,seed:1,size:{x:256,y:256}})}));
const extreme=api.makeSpec({theme:'any',seed:3399078211,size:{x:256,y:256}});
Object.assign(extreme.settings.terrain,{relief:100,terracing:100,verticality:100,variety:100,highestTerrain:22});
Object.assign(extreme.settings.water,{rivers:2,riverFlow:'lush',lakes:'many',waterfalls:'many'});
cases.push({id:'extreme',spec:extreme});
const mode=process.argv[3]||'profile', rows=[];
const session=new inspector.Session();
const post=(method,params={})=>new Promise((r,j)=>session.post(method,params,(e,v)=>e?j(e):r(v)));
if(mode==='profile'){session.connect();await post('Profiler.enable');}
const only=process.argv.find(a=>a.startsWith("--case="))?.slice(7);
for(const c of cases.filter(c=>!only||c.id===only)){
 const totals={},stack=[],stages={};
 let stage='land',at=performance.now();
 globalThis.__genSpeed={enter(name){const t={name,at:performance.now(),child:0};stack.push(t);return t;},leave(t){if(!t)return;const ms=performance.now()-t.at;stack.pop();const row=totals[t.name]??={calls:0,total:0,self:0};row.calls++;row.total+=ms;row.self+=ms-t.child;if(stack.length)stack.at(-1).child+=ms;}};
 if(mode==='profile')await post('Profiler.start');
 const cpu=process.cpuUsage();
 const start=performance.now();at=start;
 const r=api.generate(c.spec,{onProgress(p){const now=performance.now();stages[stage]=(stages[stage]||0)+now-at;stage=p.stage;at=now;}});
 const used=process.cpuUsage(cpu);
 const end=performance.now();stages[stage]=(stages[stage]||0)+end-at;
 if(mode==='profile'){const {profile}=await post('Profiler.stop');writeFileSync(resolve(local,c.id+'.cpuprofile'),JSON.stringify(profile));}
 globalThis.__genSpeed=null;
 const state=hash(JSON.stringify({spec:r.spec,features:r.features,report:r.report,analysis:r.analysis,field:r.field,info:r.info,failures:r.failures,intentions:r.intentions}));
 const row={id:c.id,spec:c.spec,ms:end-start,cpuMs:(used.user+used.system)/1000,stages,totals,attempts:r.attempts,passed:r.report.passed,bytes:hash(r.bytes),state};
 writeFileSync(resolve(local,mode+'-'+c.id+'.timber'),r.bytes);
 rows.push(row);writeFileSync(resolve(local,mode+'.json'),JSON.stringify({base:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),node:process.version,rows},null,2));
 console.log(c.id,Math.round(row.ms)+' ms, '+Math.round(row.cpuMs)+' CPU ms',row.attempts+' attempts',row.passed,row.bytes);
}
if(mode==='profile')session.disconnect();
