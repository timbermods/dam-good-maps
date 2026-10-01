import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,openSync,writeSync,closeSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {dir} from './overlay.mjs';
import {FileResults} from './node-store.mjs';
const L=await import(pathToFileURL(resolve(dir,'../local/round2/after.mjs')).href),out=resolve(dir,'../local/round2/browser-source');mkdirSync(out,{recursive:true});
const cold=new FileResults(resolve(out,'long-512.cache')),base=L.MapSession.importMap(readFileSync(resolve(dir,'../local/probe/sizes-512x512.timber')),'probe.timber').document,h=new L.GestureHistory(base,cold,'browser-long-512'),counts={brush:0,sculpt:0,features:0,selection:0};
try{for(let n=1;n<=2048;n++){
 if(n===777){await h.select({action:'remove',area:Array.from({length:512},(_,y)=>[y,0,511]),kinds:['trees','bushes','ruins','slopes','objects']});counts.selection++;}
 else if(n%97===0){const id='6e1c2a3b-4d5e-4f60-8a7b-8c9d0e1f2a3b',kind=Math.floor(n/97)%4;
  h.apply([kind===1?{op:'addFeature',params:{feature:{id,kind:'forest',origin:'user',locked:false,params:{area:[[6,6,9],[7,6,9]],density:.7,speciesMix:{Birch:1},life:'auto',youngShare:.2}}}}:kind===2?{op:'updateFeature',params:{id,patch:{params:{density:.8}}}}:kind===3?{op:'reorderFeature',params:{id,index:0}}:{op:'deleteFeature',params:{id}}]);counts.features++;}
 else if(n%32===0){h.apply([{op:'sculpt',params:{mode:'flatten',level:n%64?10:11,cells:Array.from({length:512},(_,y)=>[y,0,511]),exact:true}}]);counts.sculpt++;}
 else {const x=8+(n*19)%492,y=8+(n*31)%492;h.apply([{op:'brush',params:{tool:['raise','lower','flatten','smooth','naturalize'][n%5],size:5.5,strength:1,seed:7101+n,level:10,dabs:[x*4+1,y*4+2,(x+1)*4+1,(y+1)*4+2]}}]);counts.brush++;}
 if(n%256===0){global.gc?.();console.log('browser long',n,'heap MiB',Math.round(process.memoryUsage().heapUsed/2**20));}
 }
 h.session.settleCanonical();const hash=createHash('sha256').update(h.session.exportTimber().bytes).digest('hex'),file=resolve(out,'long-512.damgoodmaps.json'),f=openSync(file,'w');try{await h.save(async b=>writeSync(f,b));}finally{closeSync(f);}
 assert.equal(h.count,2048);writeFileSync(resolve(out,'long-512.json'),JSON.stringify({final:{exportHash:hash},count:h.count,counts,scope:'Browser storage/capacity fixture: 2048 brushes/sculpts/features/Select; force replay separately covered by three-engine five-force oracle and full core matrix.'},null,2));console.log('Browser long-session fixture saved',hash,counts);
}finally{cold.close();}
