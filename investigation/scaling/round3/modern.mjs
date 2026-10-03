import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,openSync,writeSync,closeSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {FileResults} from '../round2/node-store.mjs';
const dir=fileURLToPath(new URL('.',import.meta.url)),L=await import(pathToFileURL(resolve(dir,'../local/round2/after.mjs')).href),out=resolve(dir,'../local/round3/runs');
const hash=b=>createHash('sha256').update(b).digest('hex');
const raw=s=>{const d=createHash('sha256'),b=s.built;for(const v of [b.heights,b.water,b.contamination,b.moisture,b.soilContamination])if(v)d.update(new Uint8Array(v.buffer,v.byteOffset,v.byteLength));d.update(JSON.stringify(b.entities));d.update(JSON.stringify(s.features));const lava=L.rockOf(s);if(lava)d.update(new Uint8Array(lava.buffer,lava.byteOffset,lava.byteLength));d.update(JSON.stringify([...L.fallenOf(s)]));return d.digest('hex');};
for(const size of process.argv.slice(2).length?process.argv.slice(2).map(Number):[256,512]){
 const cold=new FileResults(resolve(out,size+'-modern.cache')),h=new L.GestureHistory(L.MapSession.importMap(readFileSync(resolve(dir,`../local/probe/sizes-${size}x${size}.timber`)),'probe').document,cold,'modern-'+size),trace=[raw(h.session)],origin=[Math.round(size*.48),Math.round(size*.4)],end=[origin[0]+18,origin[1]+30];
 try{
  for(const [n,verb]of ['craterize','erupt','quake','glaciate','carve'].entries()){
   const seed=9001+n,settings=verb==='craterize'?{...L.CRATER_DEFAULTS,power:100,size:48,seed}:verb==='erupt'?{...L.ERUPT_DEFAULTS,power:100,size:40,seed}:verb==='quake'?{...L.QUAKE_DEFAULTS,mode:'slide',power:100,seed}:verb==='glaciate'?{...L.GLACIATE_DEFAULTS,mode:'aim',power:100,size:32,seed,meltwater:true}:{...L.CARVE_DEFAULTS,mode:'aim',power:100,width:4,seed,dry:true,defyGravity:true};
   await h.force({verb,settings,where:verb==='quake'?{path:[{x:origin[0]-10,y:origin[1]-6},{x:origin[0]+14,y:origin[1]+7}],side:1}:{origin,...(['glaciate','carve'].includes(verb)?{end}:{})},cut:null,sourceId:`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`});assert.equal(h.project.entries.at(-1).inputHashVersion,2);trace.push(raw(h.session));
  }
  h.apply([{op:'brush',params:{tool:'raise',size:5.5,strength:1,seed:9912,level:10,dabs:[200,200]}}]);h.session.settleCanonical();trace.push(raw(h.session));const bytes=h.session.exportTimber().bytes,data={size,steps:6,trace,finalState:trace.at(-1),exportHash:hash(bytes),inputHashVersion:2};
  const fd=openSync(resolve(out,size+'-modern.dgm'),'w');try{await h.save(async b=>writeSync(fd,b));}finally{closeSync(fd);}writeFileSync(resolve(out,size+'-modern.json'),JSON.stringify(data));console.log('Modern five-force fixture',size,data.exportHash);
 }finally{cold.close();}
}
