import {resolve} from 'node:path';
import {staticHost,openIsolated} from './host.mjs';
import {HERE,LOCAL,deps,json} from './common.mjs';
await deps('esbuild').build({entryPoints:[resolve(HERE,'fallback-coordinator.ts')],outfile:resolve(LOCAL,'fallback-coordinator.js'),bundle:true,format:'esm',platform:'browser',target:'es2022'});
const host=await staticHost('fallback-coordinator.js'),evidence={};
try{
  for(const name of ['chromium','firefox','webkit']){
    const browser=await deps('playwright')[name].launch({headless:true});
    try{
      const blocked=await browser.newContext({serviceWorkers:'block'}),page=await blocked.newPage();await page.goto(host.url);await page.waitForFunction(()=>window.ready);
      const noIsolation=await page.evaluate(()=>window.job({missing:false,threads:16}));if(noIsolation.error)throw Error(noIsolation.error);await blocked.close();
      const {page:isolated}=await openIsolated(browser,host.url);const failedStartup=await isolated.evaluate(()=>window.job({missing:true,threads:16}));if(failedStartup.error)throw Error(failedStartup.error);
      evidence[name]={version:browser.version(),noIsolation,failedStartup};console.log(name,JSON.stringify(evidence[name]));
    }finally{await browser.close();}
  }
}finally{host.close();json('fallback.json',evidence);}
