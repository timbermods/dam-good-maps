const {spawn}=require('node:child_process'),fs=require('node:fs'),path=require('node:path');
const mode=process.argv[2]||'before', sizes=(process.argv[3]||'96,128,256').split(',');
const output=process.argv[4]||mode;
const dir=path.join(__dirname,'local',output); fs.mkdirSync(dir,{recursive:true});
// One worker per batch: uncontended wall timings; no in-game probe is launched.
(async()=>{for(const size of sizes) {
 const file=path.join(dir,`measures-${size}.jsonl`);fs.writeFileSync(file,'');
 const p=spawn(process.execPath,[path.join(__dirname,'run.cjs'),'../m9b/measures.ts','--one',Array.from({length:20},(_,i)=>`delta:${i+1}`).join(','),'--size',size],{env:{...process.env,DELTA_MODE:mode,DELTA_OUTPUT:output,DELTA_CAPTURE:'1'},stdio:['ignore','pipe','inherit']});
 let buf='';p.stdout.on('data',d=>{buf+=d;let e;while((e=buf.indexOf('\n'))>=0){const line=buf.slice(0,e);buf=buf.slice(e+1);if(line.startsWith('{')){fs.appendFileSync(file,line+'\n');const m=JSON.parse(line);console.log(`${mode} ${size} seed ${m.seed}: ${m.error||`ok=${m.ok} all=${m.outcomes?.met} land=${m.ms.firstLook}ms`}`);}}});
 await new Promise((resolve,reject)=>p.on('close',code=>code?reject(Error(`worker ${code}`)):resolve()));
}})().catch(e=>{console.error(e);process.exitCode=1;});
