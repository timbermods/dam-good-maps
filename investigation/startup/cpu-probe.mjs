import { chromium } from '@playwright/test';
import { writeFileSync } from 'node:fs';
const browser=await chromium.launch({channel:'chrome',headless:true});
const rows=[];
try {
  const page=await browser.newPage(); const cdp=await page.context().newCDPSession(page);
  for(const rate of [1,4,1,4,1,4]) {
    await cdp.send('Emulation.setCPUThrottlingRate',{rate});
    const times=await page.evaluate(async()=>{
      const code=`onmessage=()=>{const t=performance.now();let a=0;for(let i=0;i<20000000;i++)a+=Math.sqrt(i);postMessage({ms:performance.now()-t,a});}`;
      const worker=new Worker(URL.createObjectURL(new Blob([code],{type:'text/javascript'})));
      const ms=await new Promise(r=>{worker.onmessage=e=>r(e.data.ms);worker.postMessage(null);});worker.terminate();
      const t=performance.now();let a=0;for(let i=0;i<20000000;i++)a+=Math.sqrt(i);
      return {worker:ms,main:performance.now()-t,a};
    }); rows.push({rate,...times});
  }
} finally {await browser.close();}
writeFileSync(new URL('local/cpu-probe.json',import.meta.url),JSON.stringify(rows,null,2));console.log(rows);
