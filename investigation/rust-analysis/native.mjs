import assert from 'node:assert/strict';
import {Worker,isMainThread,parentPort,workerData} from 'node:worker_threads';
import {readFileSync,writeFileSync,readdirSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {gunzipSync} from 'node:zlib';
import {cpus} from 'node:os';
import {LOCAL,deps,arg,json,hash} from './common.mjs';
import {exact,untimed,unpack} from './codec.mjs';
import {frames,higher} from './replay.mjs';
import {loadSampler} from './load.mjs';
const dir=resolve(LOCAL,'cases');
const fingerprint=hash(Buffer.concat(['analysis.node','native-bridge.cjs','api.cjs'].map(n=>readFileSync(resolve(LOCAL,n))).concat(['native.mjs','replay.mjs','codec.mjs'].map(n=>readFileSync(new URL(n,import.meta.url))))));
const read=(id,s)=>existsSync(resolve(dir,id+s+'.gz'))?gunzipSync(readFileSync(resolve(dir,id+s+'.gz'))):readFileSync(resolve(dir,id+s));
const bytes=a=>Buffer.from(a.buffer,a.byteOffset,a.byteLength);
const state=r=>({report:r.report,analysis:r.analysis,outcomes:r.outcomes,features:r.features,intentions:r.intentions,heights:r.built.heights,water:r.built.water,contamination:r.built.contamination,attempts:r.attempts,failures:r.failures.map(f=>f.failed),info:r.info});
if(!isMainThread){
 globalThis.__raNative=deps(resolve(LOCAL,'analysis.node'));const bridge=deps(resolve(LOCAL,'native-bridge.cjs'));bridge.installNativeAnalysis(globalThis.__raNative);
 if(workerData.mode==='replay'){const api=deps(resolve(LOCAL,'api.cjs'));
 parentPort.on('message',id=>{try{const input=frames(read(id,'.in')),expected=frames(read(id,'.expected'));assert.equal(input.length,expected.length);for(let i=0;i<input.length;i++)assert.ok(bytes(bridge.run(input[i])).equals(bytes(expected[i])),id+'/'+i);
 let roomCalls=0;if(existsSync(resolve(dir,id+'.room.in.gz'))){const ri=frames(read(id,'.room.in')),re=frames(read(id,'.room.expected'));assert.equal(ri.length,re.length);for(let i=0;i<ri.length;i++)assert.ok(bytes(bridge.run(ri[i])).equals(bytes(re[i])),id+'/room/'+i);roomCalls=ri.length;}
 const payload=unpack(JSON.parse(gunzipSync(readFileSync(resolve(dir,id+'.json.gz')))));globalThis.__ra=null;const baseline=higher(api,payload);globalThis.__ra={enter(){},leave(){},replace:(name,args)=>bridge.invoke(name,args)};const actual=higher(api,payload);globalThis.__ra=null;assert.equal(actual,baseline,id+' all high-level outputs');writeFileSync(resolve(dir,id+'.high.json'),JSON.stringify({expected:hash(baseline)}));const record={id,calls:input.length,roomCalls,highLevel:hash(actual),fingerprint,input:JSON.parse(readFileSync(resolve(dir,id+'.meta.json'))).input};writeFileSync(resolve(dir,id+'.native-pass.json'),JSON.stringify(record));parentPort.postMessage(record);
 }catch(e){parentPort.postMessage({id,error:e.stack});}});
 }else{const m9b=deps(resolve(LOCAL,'m9b-native.cjs')),roomReference=deps(resolve(LOCAL,'room-reference.cjs'));let result,roomInputs=[],roomOutputs=[];globalThis.__raGenerated=r=>result=r;
 const frame=v=>{const b=Buffer.from(v.buffer,v.byteOffset,v.byteLength),h=Buffer.alloc(4);h.writeUInt32LE(b.length);return Buffer.concat([h,b]);};
 globalThis.__ra={replace:(name,args)=>{const actual=bridge.replace(name,args);if(workerData.verify&&name==='roomMap'){const baseline=roomReference.roomMap(...args);assert.ok(Buffer.from(actual).equals(Buffer.from(baseline)),'roomMap bytes');roomInputs.push(frame(bridge.encode(name,args)));roomOutputs.push(frame(bridge.flatten(name,baseline)));}return actual;}};
 parentPort.on('message',c=>{try{roomInputs=[];roomOutputs=[];const t=performance.now();const measure=m9b.measureOne(c.theme,c.seed,c.size,'',false);const ms=performance.now()-t;const actual=hash(exact({measure:untimed(measure),state:state(result)}));const marker=resolve(dir,c.id+'.meta.json');if(existsSync(marker))assert.equal(actual,JSON.parse(readFileSync(marker)).highLevel,c.id+' full native M9b result');if(workerData.verify){const {gzipSync}=deps('node:zlib');writeFileSync(resolve(dir,c.id+'.room.in.gz'),gzipSync(Buffer.concat(roomInputs),{level:1}));writeFileSync(resolve(dir,c.id+'.room.expected.gz'),gzipSync(Buffer.concat(roomOutputs),{level:1}));}parentPort.postMessage({id:c.id,ms,actual,identityChecked:existsSync(marker),roomCalls:roomInputs.length});
 }catch(e){parentPort.postMessage({id:c.id,error:e.stack});}});}
}else{
 const mode=arg('mode','replay'),threads=Number(arg('threads','16')),sampler=loadSampler();
 try{const selection=arg('ids','');const cases=mode==='replay'?readdirSync(dir).filter(n=>n.endsWith('.meta.json')).map(n=>n.slice(0,-10)).filter(id=>!selection||new RegExp(selection).test(id)):(()=>{const out=[];for(const size of [96,128,256])for(const theme of ['any','riverValley','canyon','highlands','lakeBasin','delta','islands'])for(let seed=1;seed<=Number(arg('seeds','40'));seed++)out.push({id:`m9b-${theme}-${size}-${seed}`,size,theme,seed});return out})();
 const rows=[];for(let rep=0;rep<Number(arg('reps',mode==='replay'?'1':'3'));rep++){let at=0,done=0;const records=[];sampler.reset();const t=performance.now();
 await Promise.all(Array.from({length:Math.min(threads,cases.length)},()=>new Promise((res,rej)=>{const w=new Worker(new URL(import.meta.url),{workerData:{mode,verify:process.argv.includes('--verify')}});function next(){if(at<cases.length)w.postMessage(cases[at++]);else w.terminate().then(res)}w.on('message',r=>{if(r.error){w.terminate();rej(Error(r.id+' '+r.error));return}records.push(r);done++;if(done%25===0)console.log(mode,rep,done+'/'+cases.length);json('native-'+mode+'-progress.json',{rep,done,total:cases.length});next();});w.on('error',rej);next();})));
 const row={rep,ms:performance.now()-t,load:sampler.summary(),records};rows.push(row);json('native-'+mode+'.json',{machine:cpus()[0].model,threads,mode,rows});console.log(mode,rep,row.ms,row.load);
 }}finally{sampler.stop();}
}
