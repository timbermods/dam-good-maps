import {spawn} from 'node:child_process';
import {existsSync,readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {isQuiet,loadSpiked} from './coverage.mjs';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
export function samples(path){
  if(!existsSync(path))return [];
  const lines=readFileSync(path,'utf8').split('\n');lines.pop();
  return lines.filter(Boolean).map(JSON.parse);
}
export function quietSuffix(rows,quiet,earliest=0){
  let suffix=[];
  for(const row of rows){
    const at=Date.parse(row.at),previous=suffix.at(-1);
    if(at<earliest)continue;
    if(previous&&(at<=Date.parse(previous.at)||at-Date.parse(previous.at)>quiet.maxSampleGapMs))suffix=[];
    if(!Number.isFinite(row.cpuPercent)||row.cpuPercent<0||row.cpuPercent>quiet.cpuPercentMax||!Number.isFinite(at)){suffix=[];continue}
    suffix.push(row);
  }
  return suffix;
}
export function segment(rows,from,to){
  const before=rows.filter(r=>Date.parse(r.at)<=from).at(-1);
  const middle=rows.filter(r=>Date.parse(r.at)>from&&Date.parse(r.at)<to);
  const after=rows.find(r=>Date.parse(r.at)>=to);
  return [...(before?[before]:[]),...middle,...(after?[after]:[])];
}
export class ContinuousLoad {
  constructor(path,quiet){this.path=path;this.quiet=quiet}
  state(){return JSON.parse(readFileSync(this.path))}
  rows(){return samples(this.state().trace)}
  save(state){writeFileSync(this.path,JSON.stringify(state,null,2))}
  static start(dir,quiet,{start=Date.now(),end=Date.now()+86400000}={}){
    const folder=resolve(dir,'local/sessions',new Date().toISOString().replaceAll(':','-'));
    mkdirSync(folder,{recursive:true});
    const path=resolve(folder,'session.json'),trace=resolve(folder,'load.jsonl'),metadata=resolve(folder,'machine.json');
    const instance=new ContinuousLoad(path,quiet);
    instance.monitor=spawn('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',resolve(dir,'load.ps1'),'-Samples','100000','-IntervalMs','1000','-ParentPid',String(process.pid),'-Streaming','-Output',trace,'-Metadata',metadata,'-DeadlineMs',String(end)],{windowsHide:true,stdio:'ignore'});
    instance.save({id:folder.split(/[\\/]/).at(-1),trace,metadata,start,end,monitorPid:instance.monitor.pid,controllerPid:process.pid,generation:0,valid:false});
    return instance;
  }
  invalidate(reason){const s=this.state();s.valid=false;s.invalidatedAt=Date.now();s.reason=reason;this.save(s)}
  async qualify(until){
    let s=this.state();if(s.valid)return true;
    while(Date.now()<Math.min(until,s.end)){
      const all=this.rows(),rows=quietSuffix(all,this.quiet,Math.max(s.start,s.invalidatedAt??0));
      const load={...(existsSync(s.metadata)?JSON.parse(readFileSync(s.metadata)):{}),quiet:true,samples:rows,
        waitingSamples:all.filter(r=>Date.parse(r.at)>=Math.max(s.start,s.invalidatedAt??0)),quietDurationMs:rows.length?Date.parse(rows.at(-1).at)-Date.parse(rows[0].at):0};
      if(isQuiet(load,this.quiet)&&Date.now()-Date.parse(rows.at(-1).at)<=this.quiet.maxSampleGapMs){
        s=this.state();s.valid=true;s.generation++;s.qualifiedAt=Date.now();s.qualification=load;this.save(s);return true;
      }
      await sleep(1000);
    }
    return false;
  }
  lease(){const s=this.state();if(!s.valid||Date.now()>s.end||!isQuiet(s.qualification,this.quiet))throw new Error('Continuous qualification unavailable');return s}
  async finish(from,to){
    const until=Math.min(this.state().end,Date.now()+this.quiet.maxSampleGapMs);
    while(Date.now()<until&&!this.rows().some(r=>Date.parse(r.at)>=to))await sleep(250);
    const rows=segment(this.rows(),from,to);
    const covered=rows.length>=2&&Date.parse(rows[0].at)<=from&&Date.parse(rows.at(-1).at)>=to;
    return {rows,valid:covered&&!loadSpiked(rows,this.quiet)};
  }
  close(){if(this.monitor){this.monitor.kill();const s=this.state();s.closedAt=Date.now();s.valid=false;this.save(s)}}
}
