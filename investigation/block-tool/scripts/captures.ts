import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import { createServer } from "vite";
import { fileURLToPath } from "node:url";
import { mkdirSync,writeFileSync } from "node:fs";
import { encodeGif } from "../../erode/scripts/gif";
import { tunnel,ledge,cave,overhang,refused } from "../demo/samples";
const here=fileURLToPath(new URL("../",import.meta.url));
const server=await createServer({configFile:here+"vite.config.ts",logLevel:"warn"});await server.listen();
const browser=await chromium.launch({channel:"chrome",headless:true,args:["--use-angle=d3d11","--enable-gpu","--ignore-gpu-blocklist"]});
const page=await browser.newPage({viewport:{width:1200,height:750},deviceScaleFactor:1});
const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));page.on("console",m=>{if(m.type()==="error")errors.push(m.text());});
page.on("requestfailed",r=>console.log("Request failed",r.url(),r.failure()));
page.on("response",r=>{if(r.status()>=400)console.log("HTTP",r.status(),r.url());});
const ev=<T=any>(code:string)=>page.evaluate(code) as Promise<T>;
const shot=async(name:string)=>{await page.waitForTimeout(360);await page.screenshot({path:here+`captures/${name}.jpg`,type:"jpeg",quality:82});};
const open=async(id:string)=>{await ev(`window.block.open('${id}')`);await page.waitForTimeout(400);};
const run=async(stamps:unknown[],kind="click")=>ev(`window.block.gesture(${JSON.stringify(stamps)},'${kind}')`);
const pose={target:[94,4.8,-71],yaw:.26,pitch:.11,distance:17};
mkdirSync(here+"captures",{recursive:true});mkdirSync(here+"checks",{recursive:true});mkdirSync(here+"local",{recursive:true});
try{
 await page.goto(server.resolvedUrls!.local[0]);await page.waitForSelector('body[data-ready="1"]',{timeout:60000});
 await page.waitForTimeout(800);
 // Real pointer input: press-and-hold, release, undo/redo, then Esc cancellation.
 await ev(`window.block.pose(${JSON.stringify(pose)})`);
 await page.locator("#size").evaluate((el:HTMLInputElement)=>{el.value="3";el.dispatchEvent(new Event("input"));});
 const p=await ev<{x:number,y:number}>(`window.block.project(${JSON.stringify(tunnel[0].face)})`);
 await page.mouse.move(p.x,p.y);await page.keyboard.down("Shift");
 const before=await ev("window.block.snapshot()");
 await page.mouse.down();await page.waitForTimeout(1100);await page.mouse.up();await page.keyboard.up("Shift");
 const held=await ev("window.block.snapshot()");assert.notDeepEqual(held.cols,before.cols);assert.equal(held.undo,1);assert.deepEqual(held.pose,before.pose);
 await page.waitForTimeout(450);assert.deepEqual((await ev("window.block.snapshot()")).cols,held.cols,"release stops hold");
 await page.keyboard.press("Control+z");assert.deepEqual((await ev("window.block.snapshot()")).cols,before.cols);
 await page.keyboard.press("Control+y");assert.deepEqual((await ev("window.block.snapshot()")).cols,held.cols);
 await page.keyboard.press("Control+z");await page.keyboard.down("Shift");await page.mouse.down();await page.waitForTimeout(740);await page.keyboard.press("Escape");await page.mouse.up();await page.keyboard.up("Shift");
 assert.deepEqual((await ev("window.block.snapshot()")).cols,before.cols,"Esc restores whole hold");
 // Resize beside the pointer, keyboard inversion, layer picking and camera invariance.
 await page.keyboard.down("f");await page.mouse.move(p.x+54,p.y);assert.equal(await page.locator("#size").inputValue(),"6");assert.match(await page.locator("#pointer").innerText(),/6 × 6/);await page.keyboard.up("f");
 await page.locator("#layer").evaluate((el:HTMLInputElement)=>{el.value="6";el.dispatchEvent(new Event("input"));});
 assert.equal(await ev("window.block.view.terrain.heights().every(h=>h<=6)"),true);
 const slicePose=await ev("window.block.snapshot().pose");assert.deepEqual(slicePose,before.pose);
 await page.locator("#layer").evaluate((el:HTMLInputElement)=>{el.value="22";el.dispatchEvent(new Event("input"));});
 // Real add-drag across the cliff foot stays one layer, one undo; no camera change.
 await open("cliff");await ev(`window.block.pose(${JSON.stringify(pose)})`);
 await page.locator("#size").evaluate((el:HTMLInputElement)=>{el.value="1";el.dispatchEvent(new Event("input"));});
 const points=await ev<{x:number,y:number}[]>(`${JSON.stringify(ledge)}.map(s=>window.block.project(s.face))`);
 const dragBefore=await ev("window.block.snapshot()");
 await page.mouse.move(points[0].x,points[0].y);await page.mouse.down();
 for(const q of points.slice(1))await page.mouse.move(q.x,q.y,{steps:2});
 await page.mouse.up();const dragAfter=await ev("window.block.snapshot()");assert.equal(dragAfter.undo,1);assert.notDeepEqual(dragAfter.cols,dragBefore.cols);assert.deepEqual(dragAfter.pose,dragBefore.pose);
 const startFace=dragAfter.operations[0].stamps[0].face;
 assert.ok(dragAfter.operations[0].changes.every(([i,b,a]:number[])=>{const x=i%128,y=Math.floor(i/128);return startFace.nx?x===startFace.x+startFace.nx:startFace.ny?y===startFace.y+startFace.ny:((b^a)&~(1<<(startFace.z+startFace.nz)))===0;}),"drag only paints the original plane");
 await ev(`window.block.pose(${JSON.stringify({...pose,target:[97,4.3,-70],pitch:.35,distance:21})});window.block.clearGhost();document.getElementById('notice').textContent='One drag · a shelf along the wall'`);
 await shot("ledge");
 // A pinned nine-step hold and its literal recording.
 await open("cliff");await ev(`window.block.pose(${JSON.stringify(pose)})`);const tunnelResult=await run(tunnel,"hold");assert.ok(tunnelResult.every((r:any)=>r.accepted));
 await ev("document.getElementById('notice').textContent='One hold · nine layers into the cliff'");await shot("tunnel");
 writeFileSync(here+"checks/tunnel-operations.json",JSON.stringify((await ev("window.block.snapshot()")).operations,null,2)+"\n");
 await open("cave");await ev(`window.block.pose(${JSON.stringify({...pose,target:[94,4.5,-73],distance:14})})`);const caveResult=await run(cave,"hold");assert.ok(caveResult.every((r:any)=>r.accepted));
 await ev("document.getElementById('notice').textContent='Erode’s pinned cave · seven more layers by hand'");await shot("cave");
 await open("cliff");await ev(`window.block.pose(${JSON.stringify({...pose,target:[94,6,-69],yaw:.62,pitch:.32,distance:16})})`);const shelfResult=await run(overhang);assert.ok(shelfResult.every((r:any)=>r.accepted));
 const reject=await ev(`window.block.preview(${JSON.stringify(refused)})`);assert.ok(reject.unsupported.length);assert.match(reject.reason,/support/);const stable=await ev("window.block.snapshot()");assert.equal((await run([refused]))[0].accepted,false);assert.deepEqual((await ev("window.block.snapshot()")).cols,stable.cols);
 await ev(`window.block.preview(${JSON.stringify(refused)})`);await shot("refused-overhang");
 // Pick and edit a real underside, with the camera placed below the player-built shelf.
 await ev(`window.block.pose(${JSON.stringify({target:[94.5,6,-68.5],yaw:.2,pitch:-.45,distance:6})})`);
 const ceiling={x:94,y:68,z:6,nx:0,ny:0,nz:-1};
 const cp=await ev<{x:number,y:number}>(`window.block.project(${JSON.stringify(ceiling)})`);
 await page.mouse.move(cp.x,cp.y);await page.keyboard.down("Shift");
 const ceilingPlan=await ev("window.block.ghostPlan");assert.equal(ceilingPlan.stamp.face.nz,-1,"actual underside pick");
 const ceilingBefore=await ev("window.block.snapshot()");await page.mouse.click(cp.x,cp.y);await page.keyboard.up("Shift");
 const ceilingAfter=await ev("window.block.snapshot()");assert.notDeepEqual(ceilingAfter.cols,ceilingBefore.cols);await page.keyboard.press("Control+z");assert.deepEqual((await ev("window.block.snapshot()")).cols,ceilingBefore.cols);
 // Small animation, captured from the actual canvas and encoded with Erode's GIF writer.
 await open("cliff");await ev(`window.block.pose(${JSON.stringify(pose)})`);
 const frames:Uint8Array[]=[];
 const gifFrame=async()=>{
   await page.waitForTimeout(100);
   const jpg=await page.screenshot({type:"jpeg",quality:80});
   const rgba=await page.evaluate(async data=>{const im=new Image();im.src=data;await im.decode();const c=document.createElement("canvas");c.width=600;c.height=375;const ctx=c.getContext("2d")!;ctx.drawImage(im,0,0,600,375);return Array.from(ctx.getImageData(0,0,600,375).data);},`data:image/jpeg;base64,${jpg.toString("base64")}`);
   frames.push(Uint8Array.from(rgba));
 };
 await ev("document.getElementById('notice').textContent='Build along the wall'");await gifFrame();
 for(let i=0;i<ledge.length;i+=2){await run(ledge.slice(i,i+2),"drag");await ev("document.getElementById('notice').textContent='Build along the wall'");await gifFrame();}
 for(const s of tunnel.slice(0,7)){await run([s],"hold");await ev("document.getElementById('notice').textContent='Shift-hold to dig into it'");await gifFrame();}
 frames.push(frames.at(-1)!);writeFileSync(here+"captures/build-and-dig.gif",encodeGif(600,375,frames,24));
 // Measured real pointer events at all sizes, on each case; end-to-render includes CPU submit.
 await ev("Object.values(window.block.metrics).forEach(a=>a.splice(0))");
 for(const id of ["cliff","cave","flat"]){
  await open(id);
  for(let size=1;size<=8;size++){
   await page.locator("#size").evaluate((el:HTMLInputElement,n)=>{el.value=String(n);el.dispatchEvent(new Event("input"));},size);
   for(let j=0;j<4;j++){await page.mouse.move(620+j*17,370+j*6);await page.waitForTimeout(20);}
   await page.mouse.click(665,390);await page.keyboard.press("Control+z");
  }
 }
 const timings=await ev("window.block.metrics");
 const summarize=(a:number[])=>{const sorted=[...a].sort((a,b)=>a-b);return {samples:a.length,p50Ms:sorted[Math.floor(a.length*.5)]??0,p95Ms:sorted[Math.floor(a.length*.95)]??0,worstMs:Math.max(0,...a)};};
 const report={browser:await browser.version(),viewport:[1200,750],renderer:await ev("(()=>{const gl=window.block.view.renderer.getContext();const d=gl.getExtension('WEBGL_debug_renderer_info');return d?gl.getParameter(d.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER)})()"),errors,checks:{holdRelease:true,holdUndoRedo:true,holdEsc:true,dragSingleLayer:true,resizeReadout:true,layerSlice:true,undersidePickEditUndo:true,cameraStable:true,refusalAtomic:true},timings:Object.fromEntries(Object.entries(timings).map(([k,v])=>[k,summarize(v as number[])])),tunnelResult,caveResult};
 writeFileSync(here+"checks/browser.json",JSON.stringify(report,null,2)+"\n");console.log(JSON.stringify(report,null,2));assert.deepEqual(errors,[]);
}finally{await browser.close();await server.close();}
