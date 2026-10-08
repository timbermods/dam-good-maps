import {chromium} from 'playwright';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {dir} from './proposal.mjs';
const browser=await chromium.launch({channel:'msedge',headless:true});
try {
  const page=await browser.newPage();
  const result=await page.evaluate(()=>({heapLimit:performance.memory?.jsHeapSizeLimit,userAgent:navigator.userAgent,stringBoundary:[536870888,536870889].map(n=>{try{return {n,length:'x'.repeat(n).length};}catch(e){return {n,error:String(e)};}})}));
  mkdirSync(resolve(dir,'local'),{recursive:true});
  writeFileSync(resolve(dir,'local/browser-limits.json'),JSON.stringify({version:browser.version(),...result},null,2)+'\n');
} finally {await browser.close();}
