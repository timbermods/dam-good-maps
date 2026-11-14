import {spawn} from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
const D='/tmp/claude-0/-home-user/79ff23b8-7c2b-59a4-bb18-6add202916e1/scratchpad/mcp-trial/';
const args=process.argv.slice(2);
const p=spawn('npx',['tsx','mcp/src/index.ts',...args],{cwd:'/home/user/dgm-touch',env:process.env});
let buf='',id=0;const pend=new Map();
const log=o=>fs.appendFileSync(D+'transcript.jsonl',JSON.stringify({t:new Date().toISOString(),...o})+'\n');
p.stderr.on('data',d=>log({stderr:d.toString()}));
p.on('exit',c=>log({exit:c}));
p.stdout.on('data',d=>{buf+=d;let i;while((i=buf.indexOf('\n'))>=0){const l=buf.slice(0,i);buf=buf.slice(i+1);if(!l.trim())continue;let m;try{m=JSON.parse(l)}catch{log({badline:l});continue}
 if(m.id!==undefined&&pend.has(m.id)){const {r,t0}=pend.get(m.id);pend.delete(m.id);log({resp:m,ms:Date.now()-t0});r(m)}else log({notif:m})}});
function send(method,params,notify){return new Promise(r=>{const m={jsonrpc:'2.0',method,params};if(!notify){m.id=++id;pend.set(m.id,{r,t0:Date.now()})}log({req:m});p.stdin.write(JSON.stringify(m)+'\n');if(notify)r({ok:1})})}
http.createServer((q,s)=>{let b='';q.on('data',d=>b+=d);q.on('end',async()=>{const j=JSON.parse(b);const m=await send(j.method,j.params,j.notify);
 // save images
 const c=m.result&&m.result.content;if(Array.isArray(c))c.forEach((x,k)=>{if(x.type==='image'){const f=D+`img-${Date.now()}-${k}.${(x.mimeType||'image/png').split('/')[1]}`;fs.writeFileSync(f,Buffer.from(x.data,'base64'));x.data=`<saved ${f}>`}});
 s.end(JSON.stringify(m,null,1))})}).listen(8799);
