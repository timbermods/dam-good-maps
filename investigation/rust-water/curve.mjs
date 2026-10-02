import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {HERE,LOCAL,deps,json,hash} from './common.mjs';
await deps('esbuild').build({entryPoints:[resolve(HERE,'curve.ts')],outfile:resolve(LOCAL,'curve.js'),bundle:true,format:'esm',platform:'browser'});
const server=createServer((req,res)=>{res.setHeader('Content-Type','text/javascript');res.end(readFileSync(resolve(LOCAL,'curve.js')));});await new Promise(r=>server.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+server.address().port+'/curve.js';
const pw=(process.env.DGM_BROWSER_DEPS?createRequire(resolve(process.env.DGM_BROWSER_DEPS,'package.json')):deps)('playwright'),rows=[];
try{for(const engine of ['chromium','firefox','webkit']){const b=await pw[engine].launch({headless:true}),page=await b.newPage();await page.goto(url);const values=await page.evaluate(url=>new Promise(res=>{const w=new Worker(url,{type:'module'});w.onmessage=e=>{res(e.data);w.terminate();};w.postMessage({});}),url);rows.push({engine,values,hashes:Object.fromEntries(Object.entries(values).map(([k,v])=>[k,hash(Buffer.from(Float64Array.from(v).buffer))]))});await b.close();}const comparisons=[];for(let i=0;i<rows.length;i++)for(let j=i+1;j<rows.length;j++)for(const k of Object.keys(rows[i].values)){const a=rows[i].values[k],b=rows[j].values[k];comparisons.push({a:rows[i].engine,b:rows[j].engine,math:k,mismatches:a.filter((v,n)=>!Object.is(v,b[n])).length});}json('curve.json',{hashes:rows.map(r=>({engine:r.engine,...r.hashes})),comparisons,portableChanges:rows.map(r=>({engine:r.engine,twelveTick:r.values.native12.filter((v,i)=>v!==r.values.portable12[i]).length,everyTick:r.values.native1.filter((v,i)=>v!==r.values.portable1[i]).length}))});console.log(comparisons);}
finally{server.close();}
