import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {dir} from './overlay.mjs';
import {FileResults} from './node-store.mjs';
const folder=process.argv[2]??'accepted',stem=process.argv[3]??'before-256-1-128',budget=Number(process.argv[4]??128)*2**20,phase=stem.startsWith('before')?'before':'after',L=await import(pathToFileURL(resolve(dir,'../local/round2',phase+'.mjs')).href),path=resolve(dir,'../local/round2',folder,stem),source=readFileSync(path+'.damgoodmaps.json'),data=JSON.parse(readFileSync(path+'.json','utf8'));
let h,s,cold;const rows=[];
try{if(phase==='after'){cold=new FileResults(path+'.recent.cache');h=await L.GestureHistory.open([source],cold,{snapshots:budget});s=h.session;}else s=L.MapSession.open(L.decodeProject(source));s.setWaterMode('defer');s.settleCanonical();
 const hash=()=>createHash('sha256').update(s.exportTimber().bytes).digest('hex'),expected=data.final?.exportHash??data.rows.find(r=>r.name==='canonical-and-export').hash;assert.equal(hash(),expected);
 for(let repeat=1;repeat<=3;repeat++){let at=Date.now(),t=performance.now();assert(h?h.undo():s.undo());rows.push({name:'undo-recent',repeat,at,ms:performance.now()-t});at=Date.now();t=performance.now();assert(h?h.redo():s.redo());rows.push({name:'redo-recent',repeat,at,ms:performance.now()-t});assert.equal(hash(),expected);}
 writeFileSync(path+`.recent-${budget/2**20}.json`,JSON.stringify({phase,source:folder+'/'+stem,budget,rows,parity:true,cache:h?s.historyCacheStats:null},null,2));console.log(stem,'recent undo/redo measured and exact');
}finally{cold?.close();}
