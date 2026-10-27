// Run from this folder: node --v8-pool-size=1 run.mjs [--start=N] [--end=N].
// At most one native child and one Wasm worker, UV pool 1, V8 pool 1; cargo -j 4 separately.
import { Worker, isMainThread, parentPort } from 'node:worker_threads';
import { spawnSync } from 'node:child_process';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const root=dirname(fileURLToPath(import.meta.url));
const kind=process.argv.includes('--water')?'water':'forces';
const hash=b=>createHash('sha256').update(b).digest('hex');
if (!isMainThread) {
  const { instance }=await WebAssembly.instantiate(readFileSync(join(root,'target',kind,'wasm32-unknown-unknown/release/rust_props.wasm')));
  const e=instance.exports, p=e.props_alloc(4);
  parentPort.postMessage({count:e.props_count()});
  parentPort.on('message',id=>{
    try {
      const run=()=>{
        const t=performance.now(), out=e.props_run(id,p), n=new DataView(e.memory.buffer).getUint32(p,true);
        const b=Buffer.from(new Uint8Array(e.memory.buffer,out,n));
        const peak=e.props_peak(), memory=e.memory.buffer.byteLength;
        e.props_free(out,n);
        return {hash:hash(b),flags:b.readUInt32LE(),changed:b.readUInt32LE(4),added:b.readUInt32LE(8),error:b.readUInt32LE(12),peak,memory,ms:performance.now()-t};
      };
      const a=run(), b=process.argv.includes('--once')?a:run();parentPort.postMessage({id,...a,repeat:a.hash===b.hash,secondMemory:b.memory});
    }catch(error){parentPort.postMessage({id,trap:String(error)});}
  });
} else {
  process.env.UV_THREADPOOL_SIZE='1';
  const worker=new Worker(new URL(import.meta.url),{execArgv:[],argv:process.argv.slice(2)});
  const message=()=>new Promise(r=>worker.once('message',r));
  const {count}=await message();
  const get=(key,def)=>Number(process.argv.find(a=>a.startsWith(`--${key}=`))?.split('=')[1]??def);
  const start=get('start',0),end=get('end',count);
  const rows=[];mkdirSync(join(root,'local'),{recursive:true});
  const bin=join(root,`target/${kind}/release/rust-props${process.platform==='win32'?'.exe':''}`);
  for(let id=start;id<end;id++){
    const t=performance.now();
    const native=()=>spawnSync(bin,[String(id)],{timeout:45000,maxBuffer:128*1024*1024,windowsHide:true});
    const a=native(), b=a.status===0?native():a;
    let row={id,nativeMs:performance.now()-t};
    if(a.status!==0||b.status!==0){row.nativeFailure=String(a.error??a.stderr);}
    else{row={...row,flags:a.stdout.readUInt32LE(),changed:a.stdout.readUInt32LE(4),added:a.stdout.readUInt32LE(8),error:a.stdout.readUInt32LE(12),hash:hash(a.stdout),nativeRepeat:a.stdout.equals(b.stdout),peak:Number(a.stderr.toString().match(/peak=(\d+)/)?.[1])};}
    const answer=message();worker.postMessage(id);
    let timer;
    const wasm=await Promise.race([answer,new Promise(r=>{timer=setTimeout(()=>r({timeout:true}),45000)})]);clearTimeout(timer);
    row.wasm=wasm;row.identity=typeof row.hash==="string"&&row.hash===wasm.hash;
    rows.push(row);
    writeFileSync(join(root,`local/results-${kind}-${start}-${end}.json`),JSON.stringify(rows,null,2));
    if(row.flags||!row.identity||!row.nativeRepeat||!wasm.repeat||row.peak>768*1024*1024||wasm.memory>768*1024*1024)
      console.log(JSON.stringify(row));
    if((id-start)%25===0)console.log(`progress ${id+1}/${end}`);
    if(wasm.timeout){console.log('Wasm watchdog expired; stopping this slice.');break;}
  }
  const summary={cases:rows.length,identity:rows.filter(r=>r.identity).length,repeat:rows.filter(r=>r.nativeRepeat&&r.wasm.repeat).length,
    flags:Object.fromEntries([1,2,4,8,16,32].map(f=>[f,rows.filter(r=>r.flags&f).length])),
    maxNativePeak:Math.max(...rows.map(r=>r.peak??0)),maxWasmMemory:Math.max(...rows.map(r=>r.wasm.memory??0)),
    maxNativePairMs:Math.max(...rows.map(r=>r.nativeMs)),maxWasmMs:Math.max(...rows.map(r=>r.wasm.ms??0))};
  console.log(JSON.stringify(summary));writeFileSync(join(root,`local/summary-${kind}-${start}-${end}.json`),JSON.stringify(summary,null,2));
  await worker.terminate();
}
