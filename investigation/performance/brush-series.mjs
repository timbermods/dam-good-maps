// Serial fresh-browser repeats; one continuous outside-load qualification across configurations.
import {spawn} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {ContinuousLoad} from './continuous-load.mjs';
const dir=import.meta.dirname,quiet=JSON.parse(readFileSync(resolve(dir,'budgets.json'))).quiet;
const load=ContinuousLoad.start(dir,quiet),phase=process.argv[2]??'before';
const jobs=[['standard','native'],['high','native'],['standard','laptop'],['high','laptop']];
const record={phase,loadSession:load.path,jobs:[]},path=resolve(dir,'local/round3/series-'+phase+'.json');mkdirSync(resolve(path,'..'),{recursive:true});
try{for(const [look,profile] of jobs){
 const item={look,profile,started:new Date().toISOString()};record.jobs.push(item);writeFileSync(path,JSON.stringify(record,null,2));
 const child=spawn(process.execPath,[resolve(dir,'brush-run.mjs'),'--phase='+phase,'--look='+look,'--profile='+profile,'--history=true','--repeats=5','--loadSession='+load.path],{windowsHide:true,stdio:'inherit'});
 item.exit=await new Promise((r,j)=>{child.on('error',j);child.on('exit',r);});item.ended=new Date().toISOString();writeFileSync(path,JSON.stringify(record,null,2));if(item.exit!==0)throw Error('Brush series failed; see retained manifest');
}}finally{load.close();}
