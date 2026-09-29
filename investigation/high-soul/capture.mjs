import {server,browser,open,shot,DIR,ROOT} from './harness.mjs';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';import {join} from 'node:path';
const views=JSON.parse(readFileSync(join(DIR,'views.json')));
const tool=readFileSync(join(ROOT,'tools/capture-high.ts'),'utf8');
const find=tool.match(/const FIND_JS = `([\s\S]*?)`;/)[1];
const cases=[{id:'highlands-fall',fragment:'#s=2&z=256&d=n&t=highlands',want:'fall',ref:'ref-10.jpg'}, {id:'lake-badwater',fragment:'#s=3&z=256&d=n&t=lakeBasin',want:'badwater',ref:'ref-6.jpg'}, {id:'delta-overview',fragment:'#s=5&z=128&d=n&t=delta',want:'whole',ref:'ref-4.jpg'}];
mkdirSync(join(DIR,'local/captures'),{recursive:true});
const manifest=process.argv.includes('--pairs-only')?{...JSON.parse(readFileSync(join(DIR,'local/capture-manifest.json'))),pairs:views,errors:[],captures:[]}: {pairs:views,cases,errors:[],captures:[]};
for(const mode of process.argv.includes('--round3')?['proposal']:['baseline','proposal']){
 const port=mode==='baseline'?4971:4972; const s=await server(mode,port,process.argv.includes('--skip-build')),b=await browser();
 try{let p=await b.newPage({viewport:{width:1600,height:670}});p.on('pageerror',e=>manifest.errors.push(String(e)));p.on('console',m=>{if(m.type()==='error')manifest.errors.push(m.text())});
 await open(p,port);
 manifest.gpu=await p.evaluate(()=>{const gl=window.dgm3d.renderer.gl.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');return ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER)});
 for(const [id,view]of [['pair-1',views.overview],['pair-2',views.close]]){await shot(p,view,join(DIR,`local/captures/${id}-${mode}.jpg`));manifest.captures.push({id,mode,view});console.log('captured',id,mode);}
 if(mode==='proposal'){await p.evaluate(()=>window.dgm3d.renderer.setLookChoice('standard',false));await shot(p,views.close,join(DIR,'local/captures/pair-2-standard.jpg'));}
 await p.close();
 for(const c of process.argv.includes('--pairs-only')?[]:process.argv.includes('--round3')?cases.filter(c=>c.id==='highlands-fall'):cases){p=await b.newPage({viewport:{width:1600,height:670}});p.on('pageerror',e=>manifest.errors.push(String(e)));p.on('console',m=>{if(m.type()==='error')manifest.errors.push(m.text())});await open(p,port,c.fragment);const found=await p.evaluate(new Function('return '+find)(),[[c.want],-Math.PI/6,70*Math.PI/180]);c.view??={...found[c.want],distance:found[c.want].distance*(c.want==='whole'?1.25:1)};await shot(p,{...c.view,fov:40},join(DIR,`local/captures/${c.id}-${mode}.jpg`));manifest.captures.push({id:c.id,mode,view:c.view});console.log('captured',c.id,mode);await p.close();}
 }finally{await b.close();await s.httpServer.close();}
}
manifest.round=process.argv.includes('--round3')?3:undefined;
manifest.builds={baseline:JSON.parse(readFileSync(join(DIR,'local/build-baseline.json'))),proposal:JSON.parse(readFileSync(join(DIR,'local/build-proposal.json')))};
writeFileSync(join(DIR,'local/capture-manifest.json'),JSON.stringify(manifest,null,2));
if(manifest.errors.length)throw Error(manifest.errors.join('\n'));
