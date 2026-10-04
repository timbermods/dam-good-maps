import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { chromium } from '@playwright/test';
import { build, preview } from 'vite';
const root=resolve('investigation/river-valley-sheets');
const dist=join(root,'local/editor-dist');
process.env.DGM_BASE='/';
await build({configFile:'vite.config.ts',base:'/',logLevel:'warn',build:{outDir:dist,emptyOutDir:true,sourcemap:false}});
const server=await preview({configFile:'vite.config.ts',base:'/',build:{outDir:dist},preview:{port:4197,strictPort:true},logLevel:'warn'});
const browser=await chromium.launch({channel:'chrome',headless:true});
try {
 for(const mode of ['dev','after']) {
  mkdirSync(join(root,'local',mode,'3d'),{recursive:true});
  for(const seed of [12,19,5,21,22,26]) {
   const page=await browser.newPage({viewport:{width:1280,height:800},deviceScaleFactor:1,colorScheme:'light'});
   const errors=[];page.on('pageerror',e=>errors.push(String(e)));
   await page.goto('http://localhost:4197/#s=1&z=96&d=n&t=riverValley');
   await page.getByText(/checks (passed|failed)/).first().waitFor({timeout:300000});
   await page.getByLabel('Open a map or a project file in the editor').setInputFiles(join(root,'local',mode,`${seed}.timber`));
   await page.waitForFunction(()=>!!window.dgmEditor&&!!window.dgm3d,null,{timeout:120000});
   await page.evaluate(()=>window.dgmEditor.idle());
   await page.evaluate(()=>{window.dgm3d.renderer.resetView();window.dgm3d.renderer.setClock(12.5);});
   await page.waitForTimeout(800);
   const view=await page.evaluate(()=>window.dgm3d.renderer.getView());
   await page.locator('.editor-view canvas[aria-label^="3D view"]').screenshot({path:join(root,'local',mode,'3d',`${seed}.jpg`),type:'jpeg',quality:85});
   writeFileSync(join(root,'local',mode,'3d',`${seed}.json`),JSON.stringify({seed,mode,view,errors},null,2)+'\n');
   console.log(`${mode} ${seed}: captured opening editor camera, ${errors.length} errors`);
   await page.close();
  }
 }
}finally{await browser.close();await server.close();}
