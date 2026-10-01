// Offline supplement: actual capture digests, typed snapshot identity and full-hour foreground.
import {readFileSync,existsSync,readdirSync,openSync,readSync,closeSync,createReadStream,writeFileSync} from 'node:fs';
import {resolve,basename} from 'node:path';
import {createHash} from 'node:crypto';
import {createInterface} from 'node:readline';
const dir=process.cwd(),proof=JSON.parse(readFileSync(resolve(dir,'overnight-proof.json')));
const read=p=>JSON.parse(readFileSync(p));
function feed(d,p){d.update(basename(p));const fd=openSync(p,'r'),b=Buffer.alloc(1048576);try{let n;while((n=readSync(fd,b,0,b.length,null)))d.update(b.subarray(0,n));}finally{closeSync(fd)}}
const records=[];
if(proof.rows.some(r=>r.qualified&&(r.device?.visibility!=='visible'||r.device?.focused!==true||Object.keys(r.diagnostic?.visibility??{}).some(k=>k!=='visible/true'))))throw new Error('Foreground evidence invalid');
for(const r of proof.rows){
 const folder=resolve(dir,'local/runs',r.folder),stem=[...r.config.split('/'),r.case,r.repeat].join('-');
 const result={folder:r.folder,qualified:r.qualified,config:r.config,case:r.case,repeat:r.repeat,mode:r.mode,phase:r.phase,hour:r.hour};
 const finalPath=resolve(folder,stem+'-final.json'),redoPath=resolve(folder,stem+'-redo.json');
 if(existsSync(finalPath)&&existsSync(redoPath)){
  const f=read(finalPath),redo=read(redoPath);
  result.actualRedoExact=['worker','displayed'].every(k=>JSON.stringify(f[k])===JSON.stringify(redo[k]));
 }
 if(r.captureHash){
  const frames=resolve(folder,stem+'-frames'),digest=createHash('sha256');
  for(const p of [...readdirSync(frames).sort().map(n=>resolve(frames,n)),resolve(folder,stem+'-audio.jsonl'),resolve(folder,stem+'-raw.json')].filter(existsSync))feed(digest,p);
  result.actualCaptureHash=digest.digest('hex');result.captureHashMatches=result.actualCaptureHash===r.captureHash;
 }
 if(r.hour){
  const path=resolve(folder,stem+'-hour.jsonl'),counts={frames:0,badForeground:0,rendered:0};
  if(existsSync(path))for await(const line of createInterface({input:createReadStream(path),crlfDelay:Infinity})){
   if(!line.trim())continue;const chunk=JSON.parse(line);counts.frames+=chunk.frames.length;counts.rendered+=chunk.rendered.length;
   counts.badForeground+=chunk.frames.filter(f=>f.visibility!=='visible'||f.focused!==true).length;
  }
  result.fullHourForeground=counts;
 }
 records.push(result);
}
const pairs=[];
function differences(a,b,path=''){
 if(JSON.stringify(a)===JSON.stringify(b))return [];
 if(Array.isArray(a)&&Array.isArray(b))return [{path,beforeLength:a.length,afterLength:b.length,differingCommonEntries:a.reduce((n,v,i)=>n+(i<b.length&&JSON.stringify(v)!==JSON.stringify(b[i])?1:0),0)}];
 if(a&&b&&typeof a==='object'&&typeof b==='object')return [...new Set([...Object.keys(a),...Object.keys(b)])].flatMap(k=>differences(a[k],b[k],path+'/'+k));
 return [{path,before:a,after:b}];
}
for(const b of proof.rows.filter(r=>r.qualified&&!r.hour&&r.phase==='before')){
 const a=proof.rows.find(r=>r.qualified&&!r.hour&&r.phase==='after'&&r.config===b.config&&r.case===b.case&&r.repeat===b.repeat&&r.mode===b.mode);if(!a)continue;
 const stem=[...b.config.split('/'),b.case,b.repeat].join('-');
 const before=read(resolve(dir,'local/runs',b.folder,stem+'-final.json')),after=read(resolve(dir,'local/runs',a.folder,stem+'-final.json'));
 pairs.push({id:b.config+'/'+b.case,mode:b.mode,repeat:b.repeat,before:b.folder,after:a.folder,identical:JSON.stringify(before)===JSON.stringify(after),differences:differences(before,after)});
}
const validation={measuredHarnessHash:proof.currentHarnessHash,records,pairs,exportBytes:{verified:false,reason:'No complete before/after export files were recorded. Snapshots omit export fields; worker-bundle equality is insufficient.'},audio:{listening:'unverified: no playback/aural-analysis tool available',overlaps:'Refuse conversion; never deduplicate or interleave contexts to manufacture clean evidence.'}};
writeFileSync(resolve(dir,'overnight-validation.json'),JSON.stringify(validation,null,2)+'\n');
if(records.some(r=>r.qualified&&(r.actualRedoExact!==true||(r.mode==='capture'&&r.captureHashMatches!==true)||r.fullHourForeground?.badForeground)))throw new Error('Qualified evidence validation mismatch');
console.log(JSON.stringify({captureHashes:records.filter(r=>r.captureHashMatches).length,redoChecks:records.filter(r=>r.actualRedoExact===true).length,pairs:pairs.length,byteMismatches:pairs.filter(p=>!p.identical).length,hourForeground:records.filter(r=>r.hour).map(r=>r.fullHourForeground)}));
