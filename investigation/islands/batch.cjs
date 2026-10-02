const {spawn} = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const mode = process.argv[2] || 'after';
const seeds = process.env.ISLANDS_SEEDS || Array.from({length:20},(_,i)=>i+1).join(',');
const sizes = (process.env.ISLANDS_SIZES || '96,128,256').split(',');
let failed=false;
async function run(size) {
  const dir=path.join(__dirname,'local',mode); fs.mkdirSync(dir,{recursive:true});
  const output=fs.createWriteStream(path.join(dir,`${size}.jsonl`));
  const args=[path.join(__dirname,'run.cjs'),mode,'--one',seeds.split(',').map(s=>`islands:${s}`).join(','),'--size',size];
  if (process.argv.includes('--cycle')) args.push('--cycle');
  await new Promise(resolve=>{
    const p=spawn(process.execPath,args,{stdio:['ignore','pipe','inherit']}); let buf='';
    p.stdout.on('data',data=>{buf+=data; let idx; while((idx=buf.indexOf('\n'))>=0) {
      const l=buf.slice(0,idx); buf=buf.slice(idx+1);
      if(l.startsWith('{')) {output.write(l+'\n'); const m=JSON.parse(l); console.log(`${mode} ${size} seed ${m.seed}: ${m.error || `ok=${m.ok} outcomes=${m.outcomes?.met} land=${m.ms.firstLook}ms`}`); if(m.error) failed=true;}
    }});
    p.on('close',code=>{if(code)failed=true; output.end(); resolve();});
  });
}
(async()=>{for(const size of sizes) await run(size); process.exitCode=failed?1:0;})();
