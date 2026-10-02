import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {HERE,LOCAL,hash,json} from './common.mjs';
const oldSource=readFileSync(resolve(LOCAL,'before-lib.rs'),'utf8'),newSource=readFileSync(resolve(HERE,'src/lib.rs'),'utf8');
function body(source,needle,from=0){const start=source.indexOf(needle,from);if(start<0)throw Error('Missing '+needle);const open=source.indexOf('{',start);let end=open+1,level=1;while(level&&end<source.length){if(source[end]==='{')level++;if(source[end]==='}')level--;end++;}if(level)throw Error('Unclosed body');return source.slice(open+1,end-1).replace(/\s+/g,' ').trim();}
const arithmeticBodies={};
for(const [name,oldNeedle,newNeedle] of [['flow','for &i in &self.wet','for &i in wet'],['depth','for &i in &self.active','for &i in active'],['dam','fn dam_flow(','fn dam_flow(']]){
 const before=body(oldSource,oldNeedle,name==='dam'?0:oldSource.indexOf('fn substep(')),current=body(newSource,newNeedle,name==='dam'?0:newSource.indexOf(name==='flow'?'fn flow_phase(':'fn depth_phase('));
 if(before!==current)throw Error('Numerical body changed: '+name);arithmeticBodies[name]=hash(before);
}
const objdump=process.env.DGM_WASM_OBJDUMP??resolve(LOCAL,'profiles/wabt-1.0.39/bin/wasm-objdump'+(process.platform==='win32'?'.exe':''));
const rows=[];
for(const [name,file] of [['before','before-water.wasm'],['current','water.wasm']]){
 const bytes=readFileSync(resolve(LOCAL,file)),text=execFileSync(objdump,['-d',resolve(LOCAL,file)],{encoding:'utf8',maxBuffer:32<<20});
 writeFileSync(resolve(LOCAL,'profiles',name+'.wat-disassembly'),text);
 const headers=[...text.matchAll(/^[0-9a-f]+ func\[\d+\] <([^>]+)>:/gm)];
 const at=headers.findIndex(m=>m[1].includes('Sim7substep'));if(at<0)throw Error('Substep missing');
 const body=text.slice(headers[at].index,headers[at+1]?.index??text.length);
 const ops=body.split('\n').filter(s=>s.includes('|')).map(s=>s.split('|')[1].trim().split(' ')[0]).filter(s=>/^[a-z][a-z0-9_.]*$/.test(s));
 rows.push({name,sha256:hash(bytes),symbol:headers[at][1],staticInstructions:ops.length,loads:ops.filter(s=>s.includes('.load')).length,stores:ops.filter(s=>s.includes('.store')).length,boundsPanicSites:(body.match(/call.*panic_bounds_check/g)||[]).length,branches:ops.filter(s=>s==='br_if'||s==='if').length});
}
const profile=JSON.parse(readFileSync(resolve(LOCAL,'profiles/firefox-gecko-before.json')));
const sampled=[];function visit(p){for(const t of p.threads??[])if(t.name==='DOM Worker'&&t.stringTable.some(s=>s.includes('rust_water'))){const counts={};for(const sample of t.samples.data){const stack=sample[t.samples.schema.stack];if(stack===null)continue;const frame=t.stackTable.data[stack][t.stackTable.schema.frame],name=t.stringTable[t.frameTable.data[frame][t.frameTable.schema.location]];counts[name]=(counts[name]??0)+1;}sampled.push({samples:t.samples.data.length,leaves:Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,20)});}for(const q of p.processes??[])visit(q);}visit(profile);
json('profiles/assembly.json',{wasm:rows,arithmeticBodies,gecko:sampled,profileHash:hash(readFileSync(resolve(LOCAL,'profiles/firefox-gecko-before.json')))});console.log(rows,arithmeticBodies);
