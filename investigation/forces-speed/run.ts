import {existsSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {Session} from 'node:inspector';
import {createHash} from 'node:crypto';
import http from 'node:http';
import {pathToFileURL} from 'node:url';
import {build} from 'vite';
import {chromium} from '@playwright/test';
const ROOT=resolve(import.meta.dirname,'../..'),LOCAL=join(ROOT,'investigation/forces-speed/local');
mkdirSync(LOCAL,{recursive:true});
function arg(k:string){const i=process.argv.indexOf('--'+k);return i<0?undefined:process.argv[i+1];}
const variant=arg('variant')??'baseline',shadow=process.argv.includes('--adopted'),profile=process.argv.includes('--profile');
const tree=shadow?join(LOCAL,'adopted'):ROOT;
const w=await import(pathToFileURL(join(tree,'investigation/forces-speed/workload.ts')).href);
if(process.argv.includes('--prepare')){
 for(const theme of ['highlands','lakeBasin']){if(existsSync(join(LOCAL,theme+'.json')))continue;const input=await w.prepare(theme);writeFileSync(join(LOCAL,theme+'.json'),JSON.stringify(input));console.log('saved '+theme);}
 process.exit(0);
}
const out=join(LOCAL,variant);mkdirSync(out,{recursive:true});
const inputs=['highlands','lakeBasin'].map(t=>JSON.parse(readFileSync(join(LOCAL,t+'.json'),'utf8')));
const hash=(v:unknown)=>createHash('sha256').update(JSON.stringify(v,(_k,x)=>x instanceof Set?[...x]:x)).digest('hex');
function top(p:any){
 const by=new Map(p.nodes.map((n:any)=>[n.id,n])),counts=new Map<string,number>();
 for(const id of p.samples??[]){const n:any=by.get(id),f=n.callFrame;const name=(f.functionName||'(anonymous)')+' '+f.url.replaceAll(tree,'');counts.set(name,(counts.get(name)??0)+1);}
 return [...counts].sort((a,b)=>b[1]-a[1]).slice(0,35).map(([name,samples])=>({name,samples,percent:100*samples/(p.samples?.length||1)}));
}
const rows:any[]=[];
const session=new Session();session.connect();const post=(method:string,params:any={})=>new Promise<any>((done,fail)=>session.post(method,params,(err,r)=>err?fail(err):done(r)));
for(const input of inputs)for(const req of input.requests){
 w.load(input);
 if(profile){await post('Profiler.enable');await post('Profiler.setSamplingInterval',{interval:1000});await post('Profiler.start');}
 const row=w.run(req);
 let samples;
 if(profile){const p=(await post('Profiler.stop')).profile;writeFileSync(join(out,'node-'+input.theme+'-'+req.verb+'.cpuprofile'),JSON.stringify(p));samples=top(p);}
 const identity=hash(w.result());rows.push({engine:'node',theme:input.theme,...row,hash:identity,...(samples?{samples}:{})});
 writeFileSync(join(out,'measurements.json'),JSON.stringify(rows,null,2));console.log('node '+input.theme+' '+req.verb+' '+Math.round(row.totalMs)+' ms');
}
session.disconnect();
await build({configFile:false,logLevel:'warn',root:tree,build:{outDir:join(out,'page'),emptyOutDir:true,target:'es2022',minify:false,lib:{entry:join(tree,'investigation/forces-speed/page.ts'),formats:['es'],fileName:()=> 'bundle.js'}}});
const bundle=readFileSync(join(out,'page/bundle.js'));
const server=http.createServer((req,res)=>{res.setHeader('Content-Type',req.url==='/bundle.js'?'text/javascript':'text/html');res.end(req.url==='/bundle.js'?bundle:'<script type="module" src="/bundle.js"></script>');});
await new Promise<void>(done=>server.listen(0,'127.0.0.1',done));
const browser=await chromium.launch({headless:true,channel:'chrome',args:['--renderer-process-limit=1','--num-raster-threads=1']});
try{
 const page=await browser.newPage();page.setDefaultTimeout(1800000);await page.goto('http://127.0.0.1:'+ (server.address() as any).port);await page.waitForFunction(()=>!!(globalThis as any).forcesSpeed);
 const cdp=await page.context().newCDPSession(page);
 for(const input of inputs)for(const req of input.requests){
 await page.evaluate(input=>(globalThis as any).forcesSpeed.load(input),input);
 if(profile){await cdp.send('Profiler.enable');await cdp.send('Profiler.setSamplingInterval',{interval:1000});await cdp.send('Profiler.start');}
 const row=await page.evaluate(req=>(globalThis as any).forcesSpeed.run(req),req);
 let samples;
 if(profile){const p=(await cdp.send('Profiler.stop')).profile;writeFileSync(join(out,'chromium-'+input.theme+'-'+req.verb+'.cpuprofile'),JSON.stringify(p));samples=top(p);}
 const identity=hash(await page.evaluate(()=>(globalThis as any).forcesSpeed.result()));
 rows.push({engine:'chromium',version:browser.version(),theme:input.theme,...row,hash:identity,...(samples?{samples}:{})});
 writeFileSync(join(out,'measurements.json'),JSON.stringify(rows,null,2));console.log('chromium '+input.theme+' '+req.verb+' '+Math.round(row.totalMs)+' ms');
 }
}finally{await browser.close();server.close();edClose();}
function edClose(){/* each process owns only this harness's session */}
