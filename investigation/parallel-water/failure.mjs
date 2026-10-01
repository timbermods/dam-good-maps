import {resolve} from 'node:path';
import {HERE,LOCAL,deps,json} from './common.mjs';
import {staticHost,openIsolated} from './host.mjs';
for(const name of['failure-coordinator','fault-helper'])await deps('esbuild').build({entryPoints:[resolve(HERE,name+'.ts')],outfile:resolve(LOCAL,name+'.js'),bundle:true,format:'esm',platform:'browser',target:'es2022'});
const host=await staticHost('failure-coordinator.js'),evidence={};
try{for(const name of['chromium','firefox','webkit']){const browser=await deps('playwright')[name].launch({headless:true});try{const {page}=await openIsolated(browser,host.url);const result=await page.evaluate(()=>window.job({}));if(result.error)throw Error(result.error);evidence[name]={version:browser.version(),...result};console.log(name,result);}finally{await browser.close();}}}finally{host.close();json('failure.json',evidence);}
