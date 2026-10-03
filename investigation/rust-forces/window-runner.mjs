// No future start is scheduled. A withdrawn authorization blocks full workloads.
import {spawn} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {HERE,LOCAL,json} from './common.mjs';
const until=Date.parse('2026-10-03T08:00:00-07:00');
const steps=['compare.mjs','lifecycle-chain.mjs','edge-check.mjs','footprint-check.mjs','verifier-check.mjs','existing-tests.mjs','suite-replay.mjs','existing-browser.mjs','evidence.mjs','acceptance.mjs'];
const selected=process.argv[2];
if(!['matrix','pilot','after-matrix',...steps].includes(selected))throw Error('Select pilot, matrix, after-matrix, or one authorized check script');
const authorization=JSON.parse(readFileSync(resolve(HERE,'RUN-AUTHORIZATION.json')));
if(selected==='matrix'&&authorization.fullMatrix!==true||selected!=='pilot'&&selected!=='matrix'&&authorization.postMatrixSuites!==true)throw Error(authorization.reason);
if(Date.now()>=until)throw Error('Window ended: no workload started');
const from=()=>new Date(Date.now()-7*3600000).toISOString().replace('Z','-07:00');
const tasks=selected==='matrix'?[['identity-matrix.mjs',['--window','Kyler: Friday night until 08:00 Saturday','--from',from(),'--until','2026-10-03T08:00:00-07:00','--parallel','8','--chunk','25']]]:selected==='pilot'?[['identity-matrix.mjs',['--pilot','--parallel','1','--fresh']]]:selected==='after-matrix'?steps.map(script=>[script,script==='compare.mjs'?['--checks','checks-random-final.json','--browser','browser-random-final.json','--browser-count','500']:[]]):[[selected,selected==='compare.mjs'?['--checks','checks-random-final.json','--browser','browser-random-final.json','--browser-count','500']:[]]];
if(selected==='after-matrix'&&JSON.parse(readFileSync(resolve(LOCAL,'identity-matrix.json'))).pilot)throw Error('The full matrix must pass before post-matrix checks');
let child=null,expired=false;
const rows=[],started=Date.now();
const stop=async()=>{
 expired=true;if(!child?.pid)return;
 const pid=child.pid;
 await new Promise((done,reject)=>{const ps=spawn('pwsh',['-NoProfile','-File',resolve(HERE,'stop-shards.ps1'),'-RootIds',String(pid),'-Scope',HERE],{windowsHide:true,stdio:'inherit'});ps.on('error',reject);ps.on('exit',code=>code===0?done():reject(Error('Owned window stop failed '+code)));});
};
const timer=setInterval(()=>{if(Date.now()>=until&&!expired)void stop().catch(error=>{console.error(error);process.exitCode=1;});},1000);
try {
 for(const [script,args] of tasks){
  if(expired||Date.now()>=until){expired=true;break;}
  const t0=Date.now();console.log('WINDOW STEP',script,new Date().toISOString());
  const code=await new Promise((done,reject)=>{child=spawn(process.execPath,[resolve(HERE,script),...args],{cwd:HERE,env:{...process.env,DGM_SUITE_NATIVE:'1',DGM_SUITE_CAPTURE:'1',DGM_TEST_REPORT:'existing-final.json',DGM_IDENTITY_ONLY:'1',DGM_BENCH_FORCES:''},windowsHide:true,stdio:'inherit'});child.on('error',reject);child.on('exit',code=>{child=null;done(code);});});
  rows.push({script,args,elapsedSeconds:(Date.now()-t0)/1000,code,expired});
  json('window-'+selected.replace('.mjs','')+'.json',{until:'2026-10-03T08:00:00-07:00',elapsedSeconds:(Date.now()-started)/1000,expired,rows});
  if(expired){process.exitCode=2;break;}
  if(code!==0){process.exitCode=code??1;break;}
 }
}finally{clearInterval(timer);}
