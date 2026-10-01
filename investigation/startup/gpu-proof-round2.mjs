// Pixel/program proof is separate from timed runs: fixed clock and media settings would bias them.
import {chromium} from '@playwright/test';
import {createServer} from 'node:http';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {join,dirname,resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const here=dirname(fileURLToPath(import.meta.url)),local=join(here,'local');
const index=JSON.parse(readFileSync(join(local,'round2-after/public/first-visit/index.json'))),rows=[];
let dist;
const mime={'.js':'text/javascript','.css':'text/css','.html':'text/html','.json':'application/json'};
const server=createServer((req,res)=>{const path=decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/^\/dam-good-maps\//,'');
 const file=resolve(dist,path||'index.html');if(!file.startsWith(dist+'/')&&!file.startsWith(dist+'\\'))return res.writeHead(403).end();
 try{res.writeHead(200,{'Content-Type':mime[extname(file)]??'application/octet-stream'}).end(readFileSync(file));}catch{res.writeHead(404).end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({channel:'chrome',headless:true});
mkdirSync(join(local,'gpu-proof'),{recursive:true});
try{
 for(const [i,map] of index.maps.entries()){
  let original;
  for(const variant of ['before','after']){
   dist=join(local,`dist-round2-${variant}`);
   const context=await browser.newContext({viewport:{width:1280,height:720},deviceScaleFactor:1,reducedMotion:'reduce'}),page=await context.newPage();
   await page.addInitScript(()=>{
    window.startupPrograms=[];
    const proto=WebGL2RenderingContext.prototype,create=proto.createProgram;
    proto.createProgram=function(){window.startupPrograms.push(performance.now());return create.call(this);};
   });
   await page.goto(`http://127.0.0.1:${server.address().port}/dam-good-maps/?pick=${(i+.01)/6}`);
   await page.waitForFunction(()=>window.dgm3d?.build,null,{timeout:120000});
   const stats=await page.evaluate(async()=>{const r=window.dgm3d.renderer;r.setClock(0);r.renderNow();
    const gl=r.gl.getContext(),width=gl.drawingBufferWidth,height=gl.drawingBufferHeight,pixels=new Uint8Array(width*height*4);
    gl.readPixels(0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
    const digest=await crypto.subtle.digest('SHA-256',pixels);
    return{pixelSha256:[...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join(''),width,height,marks:Object.fromEntries(performance.getEntriesByType('mark').map(m=>[m.name,m.startTime])),programTimes:window.startupPrograms,gpu:r.gpu()};});
   const bytes=await page.locator('.view3d canvas').screenshot({path:join(local,'gpu-proof',`${map.id}-${variant}.png`)});
   if(variant==='before')original=stats;
   else {
    if(original.pixelSha256!==stats.pixelSha256||original.width!==stats.width||original.height!==stats.height)throw Error(`${map.id}: fixed-clock GPU pixels differ`);
    const late=stats.programTimes.filter(t=>t>stats.marks['renderer-prepared']&&t<=stats.marks['map-frame']);
    if(late.length)throw Error(`${map.id}: ${late.length} first-map programs missed warm-up`);
    rows.push({map:map.id,pixelSha256:stats.pixelSha256,width:stats.width,height:stats.height,pixelsIdentical:true,newProgramsInFirstMap:late.length,gpu:stats.gpu});
   }
   await context.close();
  }
  console.log(map.id,'pixels identical; no first-map program misses');
 }
}finally{await browser.close();await new Promise(r=>server.close(r));}
writeFileSync(join(here,'ROUND2-GPU.json'),JSON.stringify(rows,null,2));
