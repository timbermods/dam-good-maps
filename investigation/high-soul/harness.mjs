import {createHash} from 'node:crypto';
import {resolve,join} from 'node:path';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {build,preview} from './local/node_modules/vite/dist/node/index.js';
import {chromium} from './local/node_modules/@playwright/test/index.mjs';
import {proposalPlugin,changes,transform} from './proposal.mjs';
export const DIR=resolve('investigation/high-soul'), ROOT=join(DIR,'local/site');
export async function server(mode,port,skip=false) {
 const outDir=join(DIR,'local/dist-'+mode);
 const signature=createHash('sha256').update(mode==='proposal'?readFileSync(join(DIR,'proposal.mjs')):'8c975822').digest('hex');
 const stamp=join(DIR,'local/build-'+mode+'.json');
 if(skip&&JSON.parse(readFileSync(stamp)).signature!==signature)throw Error('Stale '+mode+' build: rebuild before capturing');
 if(!skip) await build({root:ROOT,configFile:join(ROOT,'vite.config.ts'),base:'/',cacheDir:join(DIR,'local/cache-'+mode),plugins:mode==='proposal'?[proposalPlugin()]:[],logLevel:'warn',build:{outDir,emptyOutDir:true}});
 if(!skip)writeFileSync(stamp,JSON.stringify({signature,base:'8c975822c2691edef94ff4f96217167697a91177'},null,2));
 return preview({root:ROOT,configFile:false,base:'/',build:{outDir},preview:{port,strictPort:true},logLevel:'warn'});
}
export async function browser(){return chromium.launch({channel:'chrome',headless:true,args:['--enable-gpu','--use-angle=d3d11','--ignore-gpu-blocklist']});}
export async function open(page,port,fragment){
 await page.addInitScript(()=>{localStorage.setItem('dgm.look','high');localStorage.removeItem('dgm.high.off');window.dgmLookTest={gpu:true,cost:6};});
 page.on('pageerror',e=>console.log('PAGE ERROR',String(e)));page.on('console',m=>{if(m.type()==='error')console.log('CONSOLE',m.text().slice(0,6000))});
 console.log('navigating',port);await page.goto('http://localhost:'+port+'/'+(fragment||''));console.log('loaded',await page.title());
 if(fragment){await page.getByText(/All \d+ checks passed/).first().waitFor({timeout:600000});await page.getByRole('button',{name:'Refine this map'}).click();}
 else {console.log('importing pair');await page.locator('input[type=file]').first().setInputFiles(join(DIR,'local/references/pair-map.timber'));console.log('file submitted');}
 await page.waitForFunction('!!window.dgmEditor && !!window.dgm3d',null,{timeout:300000});
 console.log('editor opened');await page.evaluate('window.dgmEditor.idle()');console.log('editor idle');
 await page.waitForFunction('window.dgm3d.renderer.highSettled',null,{timeout:120000});
 await page.evaluate(()=>{const r=window.dgm3d.renderer;r.setClock(12.5);for(const k of Object.keys(r.highEffects))r.setHighEffect(k,true);r.setLookChoice('high',false);});
 await page.addStyleTag({content:'body * { visibility:hidden !important; } .view3d > canvas { visibility:visible !important; position:fixed !important; left:0 !important; top:0 !important; width:100vw !important; height:100vh !important; }'});
 await page.evaluate(()=>window.dispatchEvent(new Event('resize')));
 await page.mouse.move(0,0); await page.keyboard.press('Escape');
}
export async function shot(page,view,file){
 await page.evaluate(v=>{const r=window.dgm3d.renderer;r.gl.setSize(1600,670,false);r.persp.aspect=1600/670;r.persp.updateProjectionMatrix();if(v.fov)r.persp.fov=v.fov;r.setView(v);r.renderNow();},view);
 await page.waitForTimeout(650);
 await page.locator('.view3d > canvas').screenshot({path:file,type:'jpeg',quality:88});
}
if(process.argv.includes('--build')){for(const m of ['baseline','proposal']){const s=await server(m,m==='baseline'?4971:4972);await s.httpServer.close();console.log('built',m);}}
if(process.argv.includes('--probe')){
 const s=await server('proposal',4972,true), b=await browser();
 try{const p=await b.newPage({viewport:{width:1600,height:670}});p.on('console',m=>{if(m.type()==='error')console.log(m.text().slice(0,10000))});p.on('pageerror',e=>console.log(String(e)));
 await open(p,4972);
 console.log(await p.evaluate(()=>{const r=window.dgm3d.renderer,m=r.map,e=m.entities;const starts=[];for(let i=0;i<e.count;i++)if(e.templates[e.template[i]]==='StartingLocation')starts.push([e.x[i],e.y[i]]);return {view:r.getView(),starts,W:m.W,H:m.H,gpu:r.gl.getContext().getParameter(r.gl.getContext().RENDERER)};}));
 await shot(p,{mode:'orbit',yaw:0,pitch:0.78,distance:420,target:[128,6,-128]},join(DIR,'local/probe.jpg'));
 }finally{await b.close();await s.httpServer.close();}
}
